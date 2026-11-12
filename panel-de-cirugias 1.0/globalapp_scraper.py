#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Globalapp Scraper & Sync Engine for ITEO Panel de Cirugías.
Handles:
- Stage 1 (START): Creates surgery in https://er.globalapp.ar/ when surgery starts in Live Monitor.
- Stage 2 (FINISH / UPDATE): Finds existing surgery in Globalapp (or creates it if missing) and syncs:
  - Start Time (HCC) & End Time (HFC)
  - Modalidad (Int / Amb)
  - Tipo de Anestesia
  - Anatomía Patológica checkbox (checked if text present, unchecked if empty)
  - Professionals in strict role order:
    1. Espe. (Surgeon)
    2. Anes. (Anesthesiologist - or skipped via explicit role selector #vs6__combobox if absent)
    3. Ayu. 1 (First Assistant)
    4. Ayu 2 (Second Assistant)
"""

import sys
import os
import re
import json
import time
import unicodedata
from datetime import datetime
from playwright.sync_api import sync_playwright

def log(msg: str):
    print(f"[Globalapp] {msg}", flush=True)

def normalize_str(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.upper().strip()

def map_anesthesia(anesthesia_raw: str) -> str:
    norm = normalize_str(anesthesia_raw)
    if not norm:
        return "General"
    if "RAQUI" in norm or "ESPINAL" in norm:
        return "Raquídea"
    if "PERI" in norm or "EPIDURAL" in norm:
        return "Peridural"
    if "SEDA" in norm or "NLA" in norm:
        return "Sedación"
    if "REGIONAL" in norm or "PLEX" in norm or "BLOQUEO" in norm:
        return "Regional"
    if "LOCAL" in norm:
        return "Local"
    if "SIN" in norm or "NINGUNA" in norm:
        return "Sin Anestesia"
    return "General"

def map_operating_room(or_name: str) -> str:
    norm = normalize_str(or_name)
    # Currently Quirófano 1 maps to QUIROFANO in Globalapp
    if "1" in norm or "QUIROFANO" in norm or not norm:
        return "QUIROFANO"
    return "QUIROFANO"

def map_specialty_service(specialty: str) -> str:
    norm = normalize_str(specialty)
    if "NEURO" in norm:
        return "NEUROLOGIA"
    if "MAXILO" in norm:
        return "MAXILOFACIAL"
    return "TRAUMATOLOGIA"

def has_anatomia_patologica(val: str) -> bool:
    norm = normalize_str(val)
    if not norm:
        return False
    if norm in ["NO", "NINGUNA", "NINGUNO", "N/A", "-", "SIN MUESTRA", "FALSE"]:
        return False
    return True

STOPWORDS = {"DE", "DEL", "LA", "LAS", "LOS", "SAN", "SANTA", "Y", "EL", "EN", "DA", "DO", "DI"}

def extract_name_tokens(s: str) -> set:
    """Extracts uppercase alphanumeric tokens (len >= 3) excluding common stop words."""
    norm = normalize_str(s)
    clean = re.sub(r'[^A-Z\s]', ' ', norm)
    return {w for w in clean.split() if len(w) >= 3 and w not in STOPWORDS}

def validate_patient_identity(dni_target: str, name_target: str, candidate_text: str) -> tuple:
    """
    Strict dual-check validation:
    1. Exact DNI match with numeric boundaries (ignoring formatted dots/commas).
    2. Surname/Name token intersection (subset matching) to prevent identity mismatch or typos.
    Returns: (is_match: bool, reason: str, error_msg: str)
      - is_match=True, reason='OK', error_msg=''
      - is_match=False, reason='DISCREPANCY', error_msg='...' (DNI matched but name belongs to another person)
      - is_match=False, reason='NO_DNI', error_msg='...'
    """
    clean_dni = re.sub(r'\D', '', str(dni_target or ''))
    if not clean_dni:
        return False, "NO_DNI", "No se proporcionó DNI objetivo para validar."

    norm_cand = normalize_str(candidate_text)
    # Strip dots/commas between digits so '34.123.456' -> '34123456'
    norm_cand_clean_nums = re.sub(r'(?<=\d)[.,](?=\d)', '', norm_cand)

    # 1. Exact DNI check with word/numeric boundary
    if not re.search(rf'(?<!\d){re.escape(clean_dni)}(?!\d)', norm_cand_clean_nums):
        return False, "NO_DNI", f"DNI {clean_dni} no coincide con el registro."

    # 2. Token intersection check if name_target is provided
    target_tokens = extract_name_tokens(name_target)
    if not target_tokens:
        return True, "OK", ""

    cand_tokens = extract_name_tokens(norm_cand)
    common = target_tokens.intersection(cand_tokens)
    if common:
        return True, "OK", ""

    return False, "DISCREPANCY", (
        f"Discrepancia de identidad: El DNI {clean_dni} fue hallado en GlobalApp pero figura para "
        f"'{candidate_text.strip()}', mientras que en el Panel de Cirugías el paciente es '{name_target}'."
    )

def extract_search_tokens(person_name: str, license_number: str = "") -> list:
    """Returns ordered search candidates for Globalapp professional lookup (strictly license or surname)."""
    candidates = []
    if license_number and str(license_number).strip():
        candidates.append(str(license_number).strip())
    if person_name:
        clean = person_name.replace("Dr.", "").replace("Dra.", "").replace("Dr", "").replace("Dra", "").replace(",", " ").strip()
        parts = [p.strip() for p in clean.split() if len(p.strip()) >= 2]
        if parts:
            # Only search by primary surname (parts[0]); never by given name alone
            candidates.append(parts[0])
    return candidates

def get_modal_combobox(page, modal_index: int, fallback_selector: str = None):
    """
    Returns the nth [role='combobox'] inside .parte-quirurgico-create:
      0 = Quirófano
      1 = Tipo (Amb / Int)
      2 = Internación / Turno (a la derecha de Tipo)
      3 = Rol Profesional (Espe., Anes., Ayu. 1, Ayu 2)
      4 = Tipo de Anestesia
    """
    modal_combos = page.locator(".parte-quirurgico-create [role='combobox']")
    if modal_combos.count() > modal_index:
        return modal_combos.nth(modal_index)
    if fallback_selector:
        return page.locator(fallback_selector).first
    return modal_combos.first

def select_vs_combobox_option(page, combobox_selector: str, option_text: str, modal_index: int = None):
    """Opens a Vue-Select combobox and clicks the matching option."""
    try:
        combo = get_modal_combobox(page, modal_index, combobox_selector) if modal_index is not None else page.locator(combobox_selector).first
        combo.click()
        page.wait_for_timeout(400)
        opt = page.get_by_role("option", name=option_text, exact=True)
        if opt.count() == 0:
            opt = page.get_by_role("option", name=option_text)
        if opt.count() > 0:
            opt.first.click()
            page.wait_for_timeout(300)
            return True
    except Exception as e:
        log(f"Advertencia seleccionando {option_text} en {combobox_selector}: {e}")
    return False

def check_and_select_internacion_modalidad(page) -> dict:
    """
    Cuando la modalidad es 'Int', interactúa con el selector contiguo a Tipo
    (.parte-quirurgico-create [role='combobox'] índice 2) para verificar y asociar
    la internación activa del paciente.
    """
    log("Verificando si el paciente tiene una internación cargada al lado de 'Int'...")
    try:
        # Dar margen a que GlobalApp complete GET /api/internaciones/get-all-int tras elegir 'Int'
        page.wait_for_timeout(900)

        # 1. Localizar estrictamente el 3er combobox dentro de .parte-quirurgico-create (índice 2 = a la derecha de Tipo)
        combo = get_modal_combobox(page, 2)
        if combo.count() == 0 or not combo.is_visible():
            log("Aviso: No se localizó visualmente el selector de internación contiguo a 'Int'.")
            return {"success": False, "reason": "COMBO_NOT_FOUND"}

        # 2. Verificar si ya tiene una internación autocompletada o seleccionada previamente
        try:
            v_select = combo.locator("xpath=ancestor::*[contains(@class, 'v-select')][1]")
            selected_badge = v_select.locator(".vs__selected")
            if selected_badge.count() > 0 and selected_badge.first.is_visible():
                curr_val = selected_badge.first.inner_text().strip()
                if curr_val:
                    log(f"Internación asignada en Globalapp: '{curr_val}'. Se conserva.")
                    return {"success": True, "selected": True, "internacion": curr_val, "already_set": True}
        except Exception:
            pass

        # 3. Desplegar el combobox para consultar las internaciones disponibles
        combo.click()
        page.wait_for_timeout(600)

        # 4. Inspeccionar opciones en el menú desplegable (.vs__dropdown-menu)
        menu_items = page.locator(".vs__dropdown-menu li").all()
        if not menu_items:
            menu_items = page.get_by_role("option").all()

        valid_options = []
        for item in menu_items:
            try:
                cls = item.get_attribute("class") or ""
                if "vs__no-options" in cls or "vs__dropdown-option--disabled" in cls:
                    continue
                txt = item.inner_text().strip()
                if txt and not any(ign in txt.lower() for ign in ["no matching", "sin opciones", "no hay"]):
                    valid_options.append((item, txt))
            except Exception:
                continue

        if valid_options:
            chosen_item, chosen_txt = valid_options[0]
            log(f"Internación activa encontrada para el paciente: '{chosen_txt}'. Seleccionando...")
            chosen_item.click()
            page.wait_for_timeout(400)
            return {"success": True, "selected": True, "internacion": chosen_txt}
        else:
            log("Aviso: El paciente NO tiene ninguna internación activa cargada en GlobalApp.")
            # Cerrar el dropdown para que no obstruya los campos inferiores
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            page.wait_for_timeout(200)
            return {"success": True, "selected": False, "reason": "NO_ACTIVE_INTERNACION"}

    except Exception as e:
        log(f"Advertencia al verificar internación contigua a 'Int': {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return {"success": False, "error": str(e)}

def set_date_input_ddmmyyyy(page, input_locator, date_yyyy_mm_dd: str):
    """Formats YYYY-MM-DD to DD/MM/YYYY and fills a Globalapp date input."""
    try:
        dt = datetime.strptime(date_yyyy_mm_dd[:10], "%Y-%m-%d")
        ddmmyyyy = dt.strftime("%d/%m/%Y")
    except Exception:
        ddmmyyyy = date_yyyy_mm_dd
    input_locator.click()
    input_locator.fill(ddmmyyyy)
    input_locator.press("Tab")
    page.wait_for_timeout(300)

def search_and_add_professional(page, role_label: str, person_name: str, license_number: str = "", anesthesia_type: str = None, is_first_on_create: bool = False):
    """
    Selects the explicit role in #vs6__combobox ('Espe.', 'Anes.', 'Ayu. 1', 'Ayu 2'),
    searches the professional in .gmed-search-suggest, and adds them to the table.
    """
    if not person_name and not license_number:
        return False

    log(f"Cargando profesional [{role_label}]: {person_name} (Mat: {license_number or 'N/A'})...")

    # 1. Select explicit role in modal combobox index 3 so we can skip Anes. if absent
    select_vs_combobox_option(page, "#vs6__combobox", role_label, modal_index=3)

    # 2. Search professional in gmed-search-suggest
    candidates = extract_search_tokens(person_name, license_number)
    selected = False
    norm_full_words = [normalize_str(w) for w in (person_name or "").replace(",", " ").split() if len(w) >= 3]

    for token in candidates:
        try:
            suggest_box = page.locator(".parte-quirurgico-create .gmed-search-suggest input.vs-inputx").last
            suggest_box.click()
            suggest_box.fill("")
            page.wait_for_timeout(200)
            suggest_box.fill(token)
            page.wait_for_timeout(1200)

            # Look for suggestion item containing "- "
            items = page.locator(".parte-quirurgico-create li, .parte-quirurgico-create div, .parte-quirurgico-create span").filter(has_text="- ")
            matched_txt = None

            # Try matching all words or surname
            count = items.count()
            for idx in range(min(count, 25)):
                txt = items.nth(idx).inner_text().strip()
                if "\n" in txt or len(txt) > 80:
                    continue
                norm_txt = normalize_str(txt)
                primary_surname = norm_full_words[0] if norm_full_words else ""
                if "-" in norm_txt and primary_surname and primary_surname in norm_txt.split():
                    matched_txt = txt
                    break

            if matched_txt:
                page.locator(".parte-quirurgico-create").get_by_text(matched_txt, exact=True).last.click()
                selected = True
                page.wait_for_timeout(500)
                break
        except Exception as e:
            log(f"Intento de búsqueda con '{token}' falló: {e}")

    if not selected:
        log(f"No se encontró coincidencia en Globalapp para [{role_label}] {person_name}.")
        return False

    # 3. If Anesthesia type is provided (usually on first specialist load), select it in modal combobox index 4
    if anesthesia_type:
        mapped_anes = map_anesthesia(anesthesia_type)
        select_vs_combobox_option(page, "#vs7__combobox", mapped_anes, modal_index=4)

    # 4. Click the '+' button to add professional to the table
    # In codegen: page.get_by_role("button").nth(4).click()
    try:
        add_btn = page.get_by_role("button").nth(4)
        add_btn.click()
        page.wait_for_timeout(600)
        log(f"Profesional [{role_label}] {person_name} agregado correctamente.")
        return True
    except Exception as e:
        log(f"Error al presionar botón agregar profesional: {e}")
        return False

def get_existing_professionals_in_modal(page) -> dict:
    """
    Reads the current professionals table in the Globalapp modal.
    Returns dict mapping role ('Espe.', 'Anes.', 'Ayu. 1', 'Ayu 2') -> {'name': str, 'row_index': int}
    """
    existing = {}
    try:
        rows = page.locator("tr.vs-tr, table tr")
        for i in range(rows.count()):
            txt = rows.nth(i).inner_text().strip()
            for r in ["Espe.", "Anes.", "Ayu. 1", "Ayu 2"]:
                if r in txt:
                    existing[r] = {"text": normalize_str(txt), "row": rows.nth(i)}
    except Exception as e:
        log(f"Error leyendo tabla de profesionales existentes: {e}")
    return existing

def sync_professionals_in_modal(page, payload: dict):
    """
    Reviews and updates Espe., Anes., Ayu. 1, Ayu 2 in the open Globalapp modal.
    If a role changed professional, deletes the old row and adds the new one.
    If Anes. is empty, explicitly selects 'Ayu. 1' / 'Ayu 2' in #vs6__combobox to skip Anes.
    """
    existing = get_existing_professionals_in_modal(page)
    log(f"Profesionales actuales en Globalapp: { {k: v['text'] for k, v in existing.items()} }")

    desired_roles = [
        ("Espe.", payload.get("doctorName", ""), payload.get("doctorLicense", "")),
        ("Anes.", payload.get("anesthetistName", ""), payload.get("anesthetistLicense", "")),
        ("Ayu. 1", payload.get("ayudante1Name", ""), payload.get("ayudante1License", "")),
        ("Ayu 2", payload.get("ayudante2Name", ""), payload.get("ayudante2License", "")),
    ]

    for role_label, desired_name, desired_lic in desired_roles:
        desired_words = [normalize_str(w) for w in (desired_name or "").replace("Dr.", "").replace("Dra.", "").replace(",", " ").split() if len(w) >= 3]
        current_entry = existing.get(role_label)

        if not desired_name:
            # If user cleared a previously loaded assistant/anesthetist in the form, remove it from Globalapp
            if current_entry and role_label != "Espe.":
                try:
                    log(f"Eliminando rol {role_label} que fue quitado de la planilla...")
                    del_btn = current_entry["row"].locator("svg.feather-trash-2, svg, button, i").last
                    if del_btn.count() > 0:
                        del_btn.click()
                        page.wait_for_timeout(500)
                except Exception as e:
                    log(f"No se pudo eliminar fila de {role_label}: {e}")
            continue

        # Check if already present and matches
        if current_entry:
            curr_txt = current_entry["text"]
            if any(w in curr_txt for w in desired_words):
                log(f"Rol [{role_label}] ya tiene cargado a {desired_name}. Sin cambios.")
                continue
            else:
                # Different professional in that role -> delete old row first
                try:
                    log(f"Actualizando rol [{role_label}]: reemplazando anterior por {desired_name}...")
                    del_btn = current_entry["row"].locator("svg.feather-trash-2, svg, button, i").last
                    if del_btn.count() > 0:
                        del_btn.click()
                        page.wait_for_timeout(500)
                except Exception as e:
                    log(f"Advertencia eliminando profesional previo en {role_label}: {e}")

        # Add desired professional with explicit role selection
        search_and_add_professional(page, role_label, desired_name, desired_lic)

def find_existing_surgery_in_globalapp(page, dni: str, patient_name: str, surgery_date: str, specialty: str) -> bool:
    """
    Searches in Quirofanos list by patient DNI and surgery date.
    If found, selects the row and clicks 'Modificar', returning True.
    """
    log(f"Buscando cirugía existente en Globalapp para DNI {dni} en fecha {surgery_date}...")
    try:
        # 1. Fill patient DNI in first search box
        search_box = page.get_by_role("textbox").first
        search_box.click()
        search_box.fill("")
        page.wait_for_timeout(200)
        search_box.fill(str(dni).strip())
        page.wait_for_timeout(1500)

        # Click patient suggestion with strict double check (DNI + Name tokens)
        matched_opt = None
        discrepancy_err = None
        suggestions = page.locator("li, div, span").filter(has_text="- ")
        for i in range(min(suggestions.count(), 30)):
            txt = suggestions.nth(i).inner_text().strip()
            if "\n" in txt or len(txt) > 100:
                continue
            is_match, reason, msg = validate_patient_identity(dni, patient_name, txt)
            if is_match:
                matched_opt = suggestions.nth(i)
                break
            elif reason == "DISCREPANCY":
                discrepancy_err = msg

        if matched_opt:
            matched_opt.click()
            page.wait_for_timeout(400)
        elif discrepancy_err:
            log(f"[Globalapp] {discrepancy_err}")
            return False

        # 2. Set Desde / Hasta dates via Flatpickr JS API (reliable across any month/year)
        target_iso = surgery_date[:10]
        dt = datetime.strptime(target_iso, "%Y-%m-%d")
        ddmmyyyy = dt.strftime("%d/%m/%Y")

        page.evaluate("""(args) => {
            const fps = document.querySelectorAll('.flatpickr-input');
            fps.forEach(fp => {
                if (fp._flatpickr) {
                    fp._flatpickr.setDate(args.iso, true);
                }
            });
            const visibleInputs = document.querySelectorAll('input.vs-inputx.w-full');
            visibleInputs.forEach(inp => {
                inp.value = args.dmy;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }""", {"iso": target_iso, "dmy": ddmmyyyy})
        page.wait_for_timeout(500)

        # 3. Click Buscar
        page.get_by_role("button", name=" Buscar").click()
        page.wait_for_timeout(2000)

        # 4. Check if row appears in grid
        service_name = map_specialty_service(specialty)
        cell = page.get_by_role("gridcell", name=service_name)
        if cell.count() == 0:
            # Fallback: any gridcell with patient name or TRAUMATOLOGIA
            cell = page.get_by_role("gridcell", name="TRAUMATOLOGIA")

        if cell.count() > 0:
            cell.first.click()
            page.wait_for_timeout(400)
            page.get_by_role("button", name=" Modificar").click()
            page.wait_for_timeout(2000)
            log("Cirugía localizada en Globalapp y abierta en modo Modificar.")
            return True

        log("No se encontró cirugía previa para esa fecha/paciente en Globalapp.")
        return False
    except Exception as e:
        log(f"Error buscando cirugía existente: {e}")
        return False

def create_new_surgery_in_globalapp(page, payload: dict) -> bool:
    """Executes Stage 1 (Agregar nueva cirugía) and also syncs any extra fields if present."""
    dni = str(payload.get("patientDni", "")).strip()
    patient_name = payload.get("patientName", "")
    or_name = payload.get("orName", "Quirófano 1")
    specialty = payload.get("specialty", "TRAUMATOLOGIA")
    surgery_date = payload.get("surgeryDate", datetime.now().strftime("%Y-%m-%d"))
    start_time = (payload.get("startTime") or "08:00")[:5]
    end_time = (payload.get("endTime") or "09:00")[:5]
    is_ambulatory = bool(payload.get("isAmbulatory", False))
    anesthesia_type = payload.get("anesthesiaType", "General")

    log(f"Iniciando alta de cirugía en Globalapp para DNI {dni} ({patient_name})...")

    page.get_by_role("button", name=" Agregar").click()
    page.wait_for_timeout(2000)

    # 1. Search patient by DNI exclusively with strict double check (DNI + Name tokens)
    search_term = dni if dni else patient_name
    if not search_term:
        raise RuntimeError("No se proporcionó DNI del paciente para dar de alta la cirugía en Globalapp.")

    pat_input = page.get_by_role("textbox").nth(1)
    pat_input.click()
    pat_input.fill(search_term)
    page.wait_for_timeout(1500)

    matched_pat_txt = None
    discrepancy_msg = None
    suggestions = page.locator(".parte-quirurgico-create li, .parte-quirurgico-create div, .parte-quirurgico-create span").filter(has_text="- ")
    for i in range(min(suggestions.count(), 30)):
        txt = suggestions.nth(i).inner_text().strip()
        if "\n" in txt or len(txt) > 100:
            continue
        is_match, reason, msg = validate_patient_identity(dni, patient_name, txt)
        if is_match:
            matched_pat_txt = txt
            break
        elif reason == "DISCREPANCY":
            discrepancy_msg = msg

    if matched_pat_txt:
        page.locator(".parte-quirurgico-create").get_by_text(matched_pat_txt, exact=True).last.click()
        page.wait_for_timeout(600)
    elif discrepancy_msg:
        raise RuntimeError(discrepancy_msg)
    else:
        raise RuntimeError(f"No se encontró al paciente con DNI {dni} ({patient_name}) en el padrón de GlobalApp. Verifique si está registrado.")

    # 2. Select Quirófano (Quirófano 1 -> QUIROFANO) in modal combobox index 0
    target_or = map_operating_room(or_name)
    select_vs_combobox_option(page, ".vs__actions", target_or, modal_index=0)
    page.wait_for_timeout(400)

    # 3. Select Servicio / Patología (TRAUMATOLOGIA by default)
    target_service = map_specialty_service(specialty)
    page.get_by_role("button").nth(2).click()
    page.wait_for_timeout(1200)
    page.get_by_role("gridcell", name=target_service).first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name=" Seleccionar").click()
    page.wait_for_timeout(800)

    # 4. Fill Start Date & Time + End Date & Time
    set_date_input_ddmmyyyy(page, page.get_by_role("textbox").nth(3), surgery_date)
    page.get_by_role("textbox").nth(4).fill(start_time)
    page.get_by_role("textbox").nth(4).press("Tab")
    set_date_input_ddmmyyyy(page, page.get_by_role("textbox").nth(5), surgery_date)
    page.locator("div:nth-child(4) > .w-full.flex.items-center > .w-24").fill(end_time)
    page.wait_for_timeout(300)

    # 5. Select Tipo: Int or Amb in modal combobox index 1
    modalidad_label = "Amb" if is_ambulatory else "Int"
    select_vs_combobox_option(page, "#vs4__combobox", modalidad_label, modal_index=1)
    if modalidad_label == "Int":
        payload["internacionResult"] = check_and_select_internacion_modalidad(page)

    # 6. Select Anesthesia Type in modal combobox index 4
    mapped_anes = map_anesthesia(anesthesia_type)
    select_vs_combobox_option(page, "#vs7__combobox", mapped_anes, modal_index=4)

    # 7. Check Anatomía Patológica if already present
    anat_check = page.get_by_role("checkbox").first
    if has_anatomia_patologica(payload.get("anatomiaPatologica", "")):
        if not anat_check.is_checked():
            anat_check.check()
    else:
        if anat_check.is_checked():
            anat_check.uncheck()

    # 8. Add Specialist (Espe.) + any other professionals already present in payload
    sync_professionals_in_modal(page, payload)

    # 9. Save surgery
    page.get_by_role("button", name="Guardar").click()
    page.wait_for_timeout(1200)

    # Handle optional confirmation popup ("Aceptar") if Globalapp shows a warning
    aceptar_btn = page.get_by_role("button", name="Aceptar")
    if aceptar_btn.count() > 0 and aceptar_btn.first.is_visible():
        aceptar_btn.first.click()
        page.wait_for_timeout(800)
        # If modal is still open after warning, click Guardar again
        guardar_btn = page.get_by_role("button", name="Guardar")
        if guardar_btn.count() > 0 and guardar_btn.first.is_visible():
            guardar_btn.first.click()
            page.wait_for_timeout(1200)

    log("Cirugía dada de alta exitosamente en Globalapp.")
    return True

def update_existing_surgery_in_globalapp(page, payload: dict) -> bool:
    """Updates an already open surgery in Modificar mode, reviewing all fields and professionals."""
    surgery_date = payload.get("surgeryDate", datetime.now().strftime("%Y-%m-%d"))
    start_time = payload.get("startTime")
    end_time = payload.get("endTime")
    is_ambulatory = payload.get("isAmbulatory")
    anesthesia_type = payload.get("anesthesiaType")

    log("Repasando y actualizando todos los datos en el modal de Globalapp...")

    # 1. Update Start Time if provided
    if start_time:
        st_clean = start_time[:5]
        try:
            page.get_by_role("textbox").nth(4).click()
            page.get_by_role("textbox").nth(4).fill(st_clean)
        except Exception as e:
            log(f"Aviso actualizando hora inicio: {e}")

    # 2. Update End Time if provided
    if end_time:
        et_clean = end_time[:5]
        try:
            end_input = page.locator("div:nth-child(4) > .w-full.flex.items-center > .w-24")
            end_input.click()
            end_input.fill(et_clean)
        except Exception as e:
            log(f"Aviso actualizando hora fin: {e}")

    # 3. Review Tipo (Int / Amb) in modal combobox index 1
    if is_ambulatory is not None:
        modalidad_label = "Amb" if bool(is_ambulatory) else "Int"
        select_vs_combobox_option(page, "#vs4__combobox", modalidad_label, modal_index=1)
        if modalidad_label == "Int":
            payload["internacionResult"] = check_and_select_internacion_modalidad(page)

    # 4. Review Anesthesia Type in modal combobox index 4
    if anesthesia_type:
        mapped_anes = map_anesthesia(anesthesia_type)
        select_vs_combobox_option(page, "#vs7__combobox", mapped_anes, modal_index=4)

    # 5. Review Anatomía Patológica checkbox
    try:
        anat_check = page.get_by_role("checkbox").first
        should_check = has_anatomia_patologica(payload.get("anatomiaPatologica", ""))
        if should_check and not anat_check.is_checked():
            log("Marcando tilde de Anatomía Patológica...")
            anat_check.check()
        elif not should_check and anat_check.is_checked():
            log("Desmarcando tilde de Anatomía Patológica...")
            anat_check.uncheck()
    except Exception as e:
        log(f"Aviso verificando Anatomía Patológica: {e}")

    # 6. Review & Sync Professionals (Espe., Anes., Ayu. 1, Ayu 2)
    sync_professionals_in_modal(page, payload)

    # 7. Save changes
    page.get_by_role("button", name="Guardar").click()
    page.wait_for_timeout(1500)

    aceptar_btn = page.get_by_role("button", name="Aceptar")
    if aceptar_btn.count() > 0 and aceptar_btn.first.is_visible():
        aceptar_btn.first.click()
        page.wait_for_timeout(800)

    log("Cirugía actualizada y sincronizada con éxito en Globalapp.")
    return True

def sync_arco_en_c_in_internaciones(page, payload: dict) -> dict:
    """
    Automates registration of practice 340907 (Arco en C) inside Internaciones -> Prestaciones:
    - Filters by patient DNI (Nro. Documento).
    - Checks in situ if 340907 is already loaded to strictly prevent duplicate entries.
    - If not present: adds 340907 with Professional 121212 (Esp Especialista) and Gasto 121212 (Gas Gastos).
    - Saves and executes PAC action on the practice.
    """
    dni = str(payload.get("patientDni", "")).strip()
    patient_name = payload.get("patientName", "")
    if not dni:
        log("[Arco en C] No se proporcionó DNI del paciente para buscar internación.")
        return {"success": False, "error": "No se proporcionó DNI del paciente."}

    trigger_pac = bool(payload.get("triggerPac", False)) if "triggerPac" in payload else (payload.get("action") == "arco_en_c_only")
    log(f"[Arco en C] Buscando internación para DNI {dni} ({patient_name}) en Globalapp (triggerPac: {trigger_pac})...")
    try:
        # 1. Navegar al módulo Internaciones
        page.get_by_role("link", name="Internaciones").click()
        page.wait_for_timeout(1800)
        page.get_by_role("button", name="Abrir").first.click()
        page.wait_for_timeout(2500)

        # 2. Configurar filtro de búsqueda por "Nro. Documento"
        try:
            combos = page.locator("[id^='vs'][id$='__combobox']")
            if combos.count() > 0:
                combos.first.click()
                page.wait_for_timeout(400)
                doc_opt = page.get_by_role("option", name="Nro. Documento")
                if doc_opt.count() > 0:
                    doc_opt.first.click()
                    page.wait_for_timeout(400)
        except Exception as e:
            log(f"[Arco en C] Aviso seleccionando selector Nro. Documento: {e}")

        # 3. Llenar campo de búsqueda con el DNI
        search_box = page.get_by_role("textbox", name="Buscar internación...")
        if search_box.count() == 0:
            search_box = page.locator("input[placeholder*='Buscar'], input[placeholder*='internaci']").first
        
        if search_box.count() == 0:
            return {"success": False, "error": "No se encontró el buscador de internaciones."}

        search_box.click()
        search_box.fill(dni)
        page.wait_for_timeout(300)

        page.get_by_role("button", name=re.compile(r"Buscar")).click()
        page.wait_for_timeout(3000)

        # 4. DOBLE CHEQUEO ESTRICTO DE LA FILA EN LA GRILLA (DNI EXACTO + NOMBRE)
        rows = page.locator("tbody tr, .vs-table--tbody-table tbody tr, tr")
        matching_row = None
        discrepancy_error = None

        for i in range(rows.count()):
            row = rows.nth(i)
            try:
                row_text = row.inner_text().strip()
            except Exception:
                continue

            if not row_text or "No hay datos" in row_text or "Buscar" in row_text:
                continue

            is_match, reason, msg = validate_patient_identity(dni, patient_name, row_text)
            if is_match:
                btn = row.get_by_role("button", name=re.compile(r"Prestac", re.I))
                if btn.count() > 0:
                    matching_row = row
                    break
            elif reason == "DISCREPANCY":
                discrepancy_error = msg

        if discrepancy_error and not matching_row:
            log(f"[Arco en C] {discrepancy_error}")
            return {"success": False, "error": discrepancy_error}

        if not matching_row:
            log(f"[Arco en C] No se encontró internación para el DNI {dni} ({patient_name}) en GlobalApp.")
            return {"success": False, "error": f"No se encontró ninguna internación activa en GlobalApp para el DNI {dni} ({patient_name})."}

        prestac_btn = matching_row.get_by_role("button", name=re.compile(r"Prestac", re.I))
        prestac_btn.first.click()
        page.wait_for_timeout(3000)

        # 5. CONTROL ANTI-DUPLICADOS ESTRICTO EN SITIO
        grid_340907 = page.get_by_role("gridcell", name="340907")
        if grid_340907.count() > 0:
            log("[Arco en C] La práctica 340907 ya se encuentra cargada en la internación. Se omite para evitar duplicados.")
            if trigger_pac:
                try:
                    grid_340907.first.click()
                    page.wait_for_timeout(500)
                    pac_btn = page.get_by_role("button", name=re.compile(r"PAC"))
                    if pac_btn.count() > 0 and pac_btn.first.is_visible():
                        log("[Arco en C] Pulsando botón PAC a solicitud del checkbox en vivo...")
                        pac_btn.first.click()
                        page.wait_for_timeout(1000)
                        confirm_btn = page.get_by_role("button", name=re.compile(r"Aceptar|Confirmar|S[íi]", re.I))
                        if confirm_btn.count() > 0 and confirm_btn.first.is_visible():
                            confirm_btn.first.click()
                            page.wait_for_timeout(800)
                except Exception as e:
                    log(f"[Arco en C] Aviso asegurando PAC en registro previo: {e}")
            else:
                log("[Arco en C] Verificación al guardar ficha: práctica presente. NO se pulsa PAC (worklist solo al tildar checkbox).")

            try:
                salir_btn = page.get_by_role("main").get_by_role("button", name=re.compile(r"Salir", re.I))
                if salir_btn.count() > 0:
                    salir_btn.first.click()
            except Exception:
                pass
            return {"success": True, "alreadyExisted": True}

        # 6. Si no existe, agregar práctica 340907
        log("[Arco en C] Agregando nueva práctica 340907...")
        add_btn = page.get_by_role("main").get_by_role("button", name=re.compile(r"Agregar", re.I))
        if add_btn.count() == 0:
            return {"success": False, "error": "No se encontró el botón Agregar en Prestaciones."}
        add_btn.first.click()
        page.wait_for_timeout(1800)

        # Fecha y Hora de la práctica
        surgery_date = payload.get("surgeryDate")
        if surgery_date:
            try:
                set_date_input_ddmmyyyy(page, page.get_by_role("textbox").nth(0), surgery_date)
            except Exception as e:
                log(f"[Arco en C] Aviso fecha de prestación: {e}")

        start_time = payload.get("startTime", "")
        if start_time:
            st_clean = start_time[:5]
            try:
                time_input = page.get_by_role("textbox").nth(1)
                time_input.click()
                time_input.fill("")
                time_input.fill(st_clean)
                time_input.press("Tab")
                page.wait_for_timeout(300)
                log(f"[Arco en C] Hora de prestación fijada en: {st_clean}")
            except Exception as e:
                log(f"[Arco en C] Aviso seteando hora de prestación: {e}")

        # Campo Código Práctica: 340907
        practice_input = page.get_by_role("textbox").nth(2)
        practice_input.click()
        practice_input.fill("340907")
        practice_input.press("Enter")
        page.wait_for_timeout(1000)

        # Profesional: 121212 -> seleccionar Esp Especialista
        prof_input = page.get_by_role("textbox").nth(4)
        prof_input.click()
        prof_input.fill("121212")
        prof_input.press("Enter")
        page.wait_for_timeout(800)
        esp_opt = page.get_by_text(re.compile(r"Esp\s+Especialista", re.I))
        if esp_opt.count() > 0:
            esp_opt.first.click()
            page.wait_for_timeout(500)

        # Concepto de Gasto: 121212 -> seleccionar Gas Gastos
        gasto_box = page.locator("div:nth-child(8) > div > .flex.space-x-2.items-center > .gmed-input-suggest > .flex.space-x-2 > .vs-component.vs-con-input-label.vs-input.w-30 > .vs-con-input > .vs-inputx")
        if gasto_box.count() == 0:
            gasto_box = page.locator(".vs-component.vs-con-input-label.vs-input.w-30 > .vs-con-input > .vs-inputx").last
        gasto_box.click()
        gasto_box.fill("121212")
        gasto_box.press("Enter")
        page.wait_for_timeout(800)
        gas_opt = page.get_by_text(re.compile(r"Gas\s+Gastos", re.I))
        if gas_opt.count() > 0:
            gas_opt.first.click()
            page.wait_for_timeout(500)

        # Pulsar botón Agregar (renglón)
        page.get_by_role("button", name="Agregar", exact=True).click()
        page.wait_for_timeout(1200)

        # Pulsar Guardar
        page.get_by_role("button", name="Guardar").click()
        page.wait_for_timeout(2500)

        # 7. Seleccionar fila 340907 y presionar PAC ÚNICAMENTE si trigger_pac es True (disparado desde checkbox)
        if trigger_pac:
            cell_340907 = page.get_by_role("gridcell", name="340907")
            if cell_340907.count() > 0:
                cell_340907.first.click()
                page.wait_for_timeout(800)

            pac_btn = page.get_by_role("button", name=re.compile(r"PAC"))
            if pac_btn.count() > 0:
                log("[Arco en C] Pulsando botón PAC a solicitud del checkbox en vivo...")
                pac_btn.first.click()
                page.wait_for_timeout(1200)
                confirm_btn = page.get_by_role("button", name=re.compile(r"Aceptar|Confirmar|S[íi]", re.I))
                if confirm_btn.count() > 0 and confirm_btn.first.is_visible():
                    confirm_btn.first.click()
                    page.wait_for_timeout(800)
        else:
            log("[Arco en C] Práctica 340907 cargada con éxito. NO se pulsa PAC (guardado de ficha técnica).")

        # 8. Salir de Prestaciones
        try:
            salir_btn = page.get_by_role("main").get_by_role("button", name=re.compile(r"Salir", re.I))
            if salir_btn.count() > 0:
                salir_btn.first.click()
                page.wait_for_timeout(800)
        except Exception:
            pass

        log("[Arco en C] Carga completada con éxito.")
        return {"success": True, "created": True}

    except Exception as e:
        log(f"[Arco en C] Excepción durante la carga: {e}")
        return {"success": False, "error": str(e)}

def revert_arco_en_c_in_internaciones(page, payload: dict) -> dict:
    """
    Automates reverting/deleting practice 340907 (Arco en C) inside Internaciones -> Prestaciones:
    - Filters by patient DNI.
    - STRICT SECURITY RULE: Locates and selects ONLY the gridcell whose practice code is strictly 340907.
    - If 340907 is not found, does NOT click or delete anything.
    - If 340907 is found, clicks Eliminar and confirms deletion.
    """
    dni = str(payload.get("patientDni", "")).strip()
    patient_name = payload.get("patientName", "")
    if not dni:
        log("[Arco en C Revert] No se proporcionó DNI del paciente.")
        return {"success": False, "error": "No se proporcionó DNI del paciente."}

    log(f"[Arco en C Revert] Buscando internación para DNI {dni} ({patient_name}) para eliminar práctica 340907...")
    try:
        # 1. Navegar a Internaciones
        page.get_by_role("link", name="Internaciones").click()
        page.wait_for_timeout(1800)
        page.get_by_role("button", name="Abrir").first.click()
        page.wait_for_timeout(2500)

        # 2. Selector Nro. Documento
        try:
            combos = page.locator("[id^='vs'][id$='__combobox']")
            if combos.count() > 0:
                combos.first.click()
                page.wait_for_timeout(400)
                doc_opt = page.get_by_role("option", name="Nro. Documento")
                if doc_opt.count() > 0:
                    doc_opt.first.click()
                    page.wait_for_timeout(400)
        except Exception as e:
            log(f"[Arco en C Revert] Aviso selector Nro. Documento: {e}")

        # 3. Llenar campo de búsqueda con el DNI
        search_box = page.get_by_role("textbox", name="Buscar internación...")
        if search_box.count() == 0:
            search_box = page.locator("input[placeholder*='Buscar'], input[placeholder*='internaci']").first
        
        if search_box.count() == 0:
            return {"success": False, "error": "No se encontró el buscador de internaciones."}

        search_box.click()
        search_box.fill(dni)
        page.wait_for_timeout(300)
        search_box.press("Enter")
        page.wait_for_timeout(2500)

        # 4. DOBLE CHEQUEO ESTRICTO EN REVERSIÓN (DNI EXACTO + NOMBRE)
        rows = page.locator("tbody tr, .vs-table--tbody-table tbody tr, tr")
        matching_row = None
        discrepancy_error = None

        for i in range(rows.count()):
            row = rows.nth(i)
            try:
                row_text = row.inner_text().strip()
            except Exception:
                continue

            if not row_text or "No hay datos" in row_text or "Buscar" in row_text:
                continue

            is_match, reason, msg = validate_patient_identity(dni, patient_name, row_text)
            if is_match:
                btn = row.get_by_role("button", name=re.compile(r"Prestac", re.I))
                if btn.count() > 0:
                    matching_row = row
                    break
            elif reason == "DISCREPANCY":
                discrepancy_error = msg

        if discrepancy_error and not matching_row:
            log(f"[Arco en C Revert] {discrepancy_error}")
            return {"success": False, "error": discrepancy_error}

        if not matching_row:
            log(f"[Arco en C Revert] No se encontró internación para el DNI {dni} ({patient_name}) en GlobalApp.")
            return {"success": False, "error": f"No se encontró ninguna internación activa en GlobalApp para DNI {dni} ({patient_name})."}

        prestac_btn = matching_row.get_by_role("button", name=re.compile(r"Prestac", re.I))
        prestac_btn.first.click()
        page.wait_for_timeout(3000)

        # 5. REGLA ESTRICTA DE SEGURIDAD:
        # Seleccionar ÚNICAMENTE la celda con el código exacto '340907'. Si no existe, no tocar nada.
        target_cell = page.get_by_role("gridcell", name="340907", exact=True)
        if target_cell.count() == 0:
            target_cell = page.locator("div[role='gridcell'], td").filter(has_text=re.compile(r"^340907$"))

        if target_cell.count() == 0:
            log("[Arco en C Revert] La práctica 340907 no existe en las prestaciones. No se realiza ninguna acción por seguridad.")
            try:
                salir_btn = page.get_by_role("main").get_by_role("button", name=re.compile(r"Salir", re.I))
                if salir_btn.count() > 0:
                    salir_btn.first.click()
            except Exception:
                pass
            return {"success": True, "notFound": True}

        log("[Arco en C Revert] Práctica 340907 localizada exclusivamente. Procediendo a eliminar...")
        target_cell.first.click()
        page.wait_for_timeout(800)

        del_btn = page.get_by_role("button", name=re.compile(r"Eliminar", re.I))
        if del_btn.count() == 0:
            return {"success": False, "error": "No se encontró botón Eliminar en prestaciones."}

        del_btn.first.click()
        page.wait_for_timeout(1000)

        # Confirmar en popup
        confirm_btn = page.get_by_role("button", name="Eliminar", exact=True)
        if confirm_btn.count() > 0 and confirm_btn.first.is_visible():
            confirm_btn.first.click()
            page.wait_for_timeout(1500)
            log("[Arco en C Revert] Práctica 340907 eliminada con éxito.")

        # Salir
        try:
            salir_btn = page.get_by_role("main").get_by_role("button", name=re.compile(r"Salir", re.I))
            if salir_btn.count() > 0:
                salir_btn.first.click()
                page.wait_for_timeout(800)
        except Exception:
            pass

        return {"success": True, "deleted": True}

    except Exception as e:
        log(f"[Arco en C Revert] Excepción al eliminar: {e}")
        return {"success": False, "error": str(e)}

def run_sync(payload: dict):
    user_email = os.environ.get("GLOBALAPP_USER", "quirofano@correo.com")
    user_password = os.environ.get("GLOBALAPP_PASSWORD", "12345678")
    show_browser = bool(payload.get("showBrowser", False))
    action = payload.get("action", "sync")  # 'start', 'finish', 'sync', 'arco_en_c_only', or 'arco_en_c_revert'

    dni = str(payload.get("patientDni", "")).strip()
    patient_name = payload.get("patientName", "")
    surgery_date = payload.get("surgeryDate", datetime.now().strftime("%Y-%m-%d"))
    specialty = payload.get("specialty", "TRAUMATOLOGIA")
    arco_en_c = bool(payload.get("arcoEnC", False))
    arco_en_c_synced = bool(payload.get("arcoEnCSynced", False))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show_browser)
        context = browser.new_context()
        page = context.new_page()

        try:
            log("Iniciando sesión en https://er.globalapp.ar/login ...")
            page.goto("https://er.globalapp.ar/login", timeout=30000)
            page.get_by_role("textbox", name="Ingrese su usuario").fill(user_email)
            page.locator("input[type=\"password\"]").fill(user_password)
            page.get_by_role("button", name="Ingresar").click()
            page.wait_for_timeout(3000)

            result = {"success": True, "action": action}

            # 1. Si es únicamente sincronización de Arco en C (disparado tras 5s del checkbox)
            if action == "arco_en_c_only":
                arco_res = sync_arco_en_c_in_internaciones(page, payload)
                result.update(arco_res)
                result["mode"] = "arco_en_c_only"

            # 2. Si es reversión/eliminación de Arco en C (disparado tras destildar el checkbox)
            elif action == "arco_en_c_revert":
                arco_res = revert_arco_en_c_in_internaciones(page, payload)
                result.update(arco_res)
                result["mode"] = "arco_en_c_revert"

            else:
                # Flujo normal de Quirófanos
                log("Ingresando al módulo Quirofanos...")
                page.get_by_role("link", name="Quirofanos").click()
                page.wait_for_timeout(2000)
                page.get_by_role("button", name="Abrir").nth(1).click()
                page.wait_for_timeout(2500)

                # Always check if the surgery already exists for this patient + date to avoid duplicates
                exists = find_existing_surgery_in_globalapp(page, dni, patient_name, surgery_date, specialty)

                if exists:
                    update_existing_surgery_in_globalapp(page, payload)
                    result["mode"] = "updated"
                else:
                    create_new_surgery_in_globalapp(page, payload)
                    result["mode"] = "created"

                if "internacionResult" in payload:
                    result["internacionResult"] = payload["internacionResult"]

                # Si está tildado Arco en C y aún no se sincronizó, procesarlo a continuación
                if arco_en_c and not arco_en_c_synced:
                    arco_res = sync_arco_en_c_in_internaciones(page, payload)
                    result["arcoEnCResult"] = arco_res
                # Si está destildado pero estaba sincronizado previamente, eliminarlo
                elif not arco_en_c and arco_en_c_synced:
                    arco_res = revert_arco_en_c_in_internaciones(page, payload)
                    result["arcoEnCRevertResult"] = arco_res

            print("===GLOBALAPP_RESULT_START===", flush=True)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            print("===GLOBALAPP_RESULT_END===", flush=True)

        except Exception as e:
            err_res = {"success": False, "error": str(e)}
            log(f"ERROR: {e}")
            print("===GLOBALAPP_RESULT_START===", flush=True)
            print(json.dumps(err_res, ensure_ascii=False), flush=True)
            print("===GLOBALAPP_RESULT_END===", flush=True)
            sys.exit(1)
        finally:
            context.close()
            browser.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python globalapp_scraper.py '<json_payload>'", file=sys.stderr)
        sys.exit(1)

    raw_arg = sys.argv[1]
    if os.path.exists(raw_arg):
        with open(raw_arg, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(raw_arg)

    run_sync(data)

