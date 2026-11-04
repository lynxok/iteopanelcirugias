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

def select_vs_combobox_option(page, combobox_selector: str, option_text: str):
    """Opens a Vue-Select combobox and clicks the matching option."""
    try:
        combo = page.locator(combobox_selector).first
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

    # 1. Select explicit role in #vs6__combobox so we can skip Anes. if absent
    select_vs_combobox_option(page, "#vs6__combobox", role_label)

    # 2. Search professional in gmed-search-suggest
    candidates = extract_search_tokens(person_name, license_number)
    selected = False
    norm_full_words = [normalize_str(w) for w in (person_name or "").replace(",", " ").split() if len(w) >= 3]

    for token in candidates:
        try:
            suggest_box = page.locator(".w-full.relative.gmed-search-suggest.flex-1 input.vs-inputx").first
            suggest_box.click()
            suggest_box.fill("")
            page.wait_for_timeout(200)
            suggest_box.fill(token)
            page.wait_for_timeout(1200)

            # Look for suggestion item containing "- "
            items = page.locator("li, div, span").filter(has_text=f"- ")
            matched_item = None

            # Try matching all words or surname
            count = items.count()
            for idx in range(min(count, 25)):
                txt = items.nth(idx).inner_text().strip()
                if "\n" in txt or len(txt) > 80:
                    continue
                norm_txt = normalize_str(txt)
                primary_surname = norm_full_words[0] if norm_full_words else ""
                if "-" in norm_txt and primary_surname and primary_surname in norm_txt.split():
                    matched_item = items.nth(idx)
                    break

            if matched_item:
                matched_item.click()
                selected = True
                page.wait_for_timeout(500)
                break
        except Exception as e:
            log(f"Intento de búsqueda con '{token}' falló: {e}")

    if not selected:
        log(f"No se encontró coincidencia en Globalapp para [{role_label}] {person_name}.")
        return False

    # 3. If Anesthesia type is provided (usually on first specialist load), select it in #vs7__combobox
    if anesthesia_type:
        mapped_anes = map_anesthesia(anesthesia_type)
        select_vs_combobox_option(page, "#vs7__combobox", mapped_anes)

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

        # Click patient suggestion
        patient_opt = page.locator("li, div, span").filter(has_text=f"{dni} -")
        if patient_opt.count() == 0 and patient_name:
            words = [normalize_str(w) for w in patient_name.split() if len(w) >= 3]
            if words:
                patient_opt = page.locator("li, div, span").filter(has_text=f"- {words[0]}")

        if patient_opt.count() > 0:
            # Click the most specific suggestion
            for i in range(patient_opt.count()):
                txt = patient_opt.nth(i).inner_text().strip()
                if "\n" not in txt and "-" in txt and len(txt) < 80:
                    patient_opt.nth(i).click()
                    page.wait_for_timeout(400)
                    break

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

    # 1. Search patient by DNI exclusively (with name fallback only if DNI empty)
    search_term = dni if dni else patient_name
    pat_input = page.get_by_role("textbox").nth(1)
    pat_input.click()
    pat_input.fill(search_term)
    page.wait_for_timeout(1500)

    clicked_pat = False
    suggestions = page.locator("li, div, span").filter(has_text="- ")
    for i in range(min(suggestions.count(), 30)):
        txt = suggestions.nth(i).inner_text().strip()
        if "\n" not in txt and len(txt) < 85 and (dni in txt or normalize_str(patient_name.split()[0]) in normalize_str(txt)):
            suggestions.nth(i).click()
            clicked_pat = True
            page.wait_for_timeout(500)
            break

    if not clicked_pat:
        raise RuntimeError(f"No se encontró al paciente con DNI '{search_term}' en el padrón de Globalapp.")

    # 2. Select Quirófano (Quirófano 1 -> QUIROFANO)
    target_or = map_operating_room(or_name)
    page.locator(".vs__actions").first.click()
    page.wait_for_timeout(400)
    page.get_by_role("option", name=target_or).first.click()
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

    # 5. Select Tipo: Int or Amb
    modalidad_label = "Amb" if is_ambulatory else "Int"
    select_vs_combobox_option(page, "#vs4__combobox", modalidad_label)

    # 6. Select Anesthesia Type in #vs7__combobox
    mapped_anes = map_anesthesia(anesthesia_type)
    select_vs_combobox_option(page, "#vs7__combobox", mapped_anes)

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

    # 3. Review Tipo (Int / Amb)
    if is_ambulatory is not None:
        modalidad_label = "Amb" if bool(is_ambulatory) else "Int"
        select_vs_combobox_option(page, "#vs4__combobox", modalidad_label)

    # 4. Review Anesthesia Type
    if anesthesia_type:
        mapped_anes = map_anesthesia(anesthesia_type)
        select_vs_combobox_option(page, "#vs7__combobox", mapped_anes)

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
    if not dni:
        log("[Arco en C] No se proporcionó DNI del paciente para buscar internación.")
        return {"success": False, "error": "No se proporcionó DNI del paciente."}

    trigger_pac = bool(payload.get("triggerPac", False)) if "triggerPac" in payload else (payload.get("action") == "arco_en_c_only")
    log(f"[Arco en C] Buscando internación para DNI {dni} en Globalapp (triggerPac: {trigger_pac})...")
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

        # 4. Localizar botón Prestaciones de la internación encontrada
        prestac_btn = page.get_by_role("button", name=re.compile(r"Prestac", re.I))
        if prestac_btn.count() == 0:
            log(f"[Arco en C] No se encontró internación para el DNI {dni} en GlobalApp.")
            return {"success": False, "warning": f"No se encontró internación activa en GlobalApp para el DNI {dni}."}

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
    if not dni:
        log("[Arco en C Revert] No se proporcionó DNI del paciente.")
        return {"success": False, "error": "No se proporcionó DNI del paciente."}

    log(f"[Arco en C Revert] Buscando internación para DNI {dni} para eliminar práctica 340907...")
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

        # 4. Localizar botón Prestaciones
        prestac_btn = page.get_by_role("button", name=re.compile(r"Prestac", re.I))
        if prestac_btn.count() == 0:
            log(f"[Arco en C Revert] No se encontró internación para el DNI {dni} en GlobalApp.")
            return {"success": True, "warning": f"No se encontró internación en GlobalApp para DNI {dni}."}

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

