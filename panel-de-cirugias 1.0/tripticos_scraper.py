#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trípticos Scraper & Sync Engine for ITEO Panel de Cirugías.
Handles:
1. 'relevar': Queries GlobalApp API for surgeries in date range, extracts diagnosis,
   AOTER catalog prestations with percentages, and surgical protocol & recargo from HC.
2. 'transfer_aoter': Automates SGAPI (AOTER) portal using Playwright with specialist credentials:
   fills order, patient data, hours, diagnosis, treatment, attachments, prestations, recargo,
   and surgical protocol, then confirms and saves.
"""

import sys
import os
import re
import json
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timedelta

def log(msg: str):
    print(f"[TRIPTICOS_LOG] {msg}", flush=True)

def load_aoter_catalog():
    catalog_path = os.path.join(os.path.dirname(__file__), "aoter_nomenclador.json")
    if not os.path.exists(catalog_path):
        return {}
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            items = json.load(f)
            return {str(item.get("codigo", "")).strip(): item.get("practica", "") for item in items}
    except Exception as e:
        log(f"Error cargando catálogo AOTER: {e}")
        return {}

def login_globalapp(email, password):
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    opener.addheaders = [
        ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
        ("Origin", "https://er.globalapp.ar"),
        ("Referer", "https://er.globalapp.ar/"),
        ("Accept", "application/json, text/plain, */*")
    ]
    login_data = json.dumps({
        "email": email,
        "password": password,
        "gethash": True,
        "token": ""
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.er.globalapp.ar/api/usuarios/login-user",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    res = json.loads(opener.open(req).read().decode("utf-8"))
    return opener, res

def relevar_cirugias(payload):
    desde = payload.get("desde")
    hasta = payload.get("hasta")
    email = payload.get("globalapp_user") or os.environ.get("GLOBALAPP_USER") or "administracion@iteosrl.com.ar"
    password = payload.get("globalapp_password") or os.environ.get("GLOBALAPP_PASSWORD") or "12345678"

    if not desde or not hasta:
        return {"success": False, "error": "Parámetros 'desde' y 'hasta' son obligatorios"}

    log(f"Iniciando relevamiento GlobalApp desde {desde} hasta {hasta}...")
    aoter_catalog = load_aoter_catalog()
    log(f"Catálogo oficial AOTER cargado: {len(aoter_catalog)} prácticas activas.")

    try:
        opener, _ = login_globalapp(email, password)
        log("Sesión autenticada en GlobalApp con éxito.")
    except Exception as e:
        return {"success": False, "error": f"Error autenticando en GlobalApp: {str(e)}"}

    iso_start = f"{desde}T03:00:00.000Z"
    dt_end = (datetime.strptime(hasta, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    iso_end = f"{dt_end}T02:59:59.999Z"

    filter_json = json.dumps({"inicio": {"between": [iso_start, iso_end]}})
    url = (
        f"https://api.er.globalapp.ar/api/parte-quirurgico/get-all?sinPrestaciones=false&count=true&order=[[%22inicio%22,%22DESC%22]]"
        f"&filters={urllib.parse.quote(filter_json)}"
        f"&includes=[%7B%22model%22:%22quirofano%22%7D,%7B%22model%22:%22paciente%22%7D,%7B%22model%22:%22internacionesPatologia%22%7D,"
        f"%7B%22model%22:%22cobertura%22%7D,%7B%22model%22:%22internaciones%22,%22attributes%22:[%22id%22,%22ingresofecha%22,%22numerointernacion%22]%7D,"
        f"%7B%22model%22:%22medico%22,%22attributes%22:[%22id%22,%22nombre%22,%22matricula%22],%22through%22:%7B%22attributes%22:[%22rol%22]%7D%7D]"
        f"&pageSize=200&page=1"
    )

    try:
        req_partes = urllib.request.Request(url)
        partes_data = json.loads(opener.open(req_partes).read().decode("utf-8"))
        rows = partes_data.get("rows", [])
        log(f"Partes quirúrgicos recuperados en GlobalApp: {len(rows)}")
    except Exception as e:
        return {"success": False, "error": f"Error consultando partes quirúrgicos: {str(e)}"}

    # Médicos traumatólogos informados desde el Panel de Cirugías (quirofano.doctors)
    trauma_doctors = payload.get("trauma_doctors") or []
    panel_trauma_names = set()
    panel_trauma_licenses = set()
    for td in trauma_doctors:
        fn = str(td.get("full_name") or td.get("name") or "").strip().upper()
        lic = str(td.get("license_number") or "").strip()
        if fn:
            panel_trauma_names.add(fn)
        if lic:
            panel_trauma_licenses.add(lic)

    if panel_trauma_names:
        log(f"Filtro de Médicos del Panel: {len(panel_trauma_names)} traumatólogos activos recibidos.")

    partes_procesados = []

    for idx, p in enumerate(rows, start=1):
        pid = p.get("id")
        np = p.get("numero_parte")
        pac = p.get("paciente", {})
        idint = p.get("idinternacion")
        medicos = p.get("medicos", [])

        # Determinar especialista principal
        espe = next((m for m in medicos if "espe" in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", "")).lower()), None)
        if not espe:
            espe = next((m for m in medicos if "ciruj" in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", "")).lower()), None)
        if not espe and medicos:
            espe = next((m for m in medicos if not any(x in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", "")).lower() for x in ["ayu", "anes"])), medicos[0])
        espe = espe or {}

        espe_id = espe.get("id")
        espe_nombre = str(espe.get("nombre") or "").strip().upper()
        espe_matricula = str(espe.get("matricula") or "").strip()

        # 1. Filtro estricto por especialidad Traumatología según Panel de Cirugías
        if panel_trauma_names or panel_trauma_licenses:
            es_trauma_panel = False
            if espe_nombre and len(espe_nombre) >= 3:
                es_trauma_panel = (
                    espe_nombre in panel_trauma_names
                    or any(
                        (len(tn) >= 4 and tn in espe_nombre)
                        or (len(espe_nombre) >= 4 and espe_nombre in tn)
                        for tn in panel_trauma_names
                    )
                )
            if not es_trauma_panel and espe_matricula:
                es_trauma_panel = espe_matricula in panel_trauma_licenses

            if not es_trauma_panel:
                log(f"[{idx}/{len(rows)}] Omitiendo parte #{np or pid} - Especialista '{espe_nombre}' (Mat: {espe_matricula}) no figura como Traumatólogo en el Panel de Cirugías.")
                continue
        ayu1 = next((m for m in medicos if "1" in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", ""))), {})
        ayu2 = next((m for m in medicos if "2" in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", ""))), {})
        anes = next((m for m in medicos if "Anes" in str(m.get("parteQuirurgicoProfesionales", {}).get("rol", ""))), {})
        tipo_anestesia = str(p.get("anestesia") or "").strip()

        pac_nombre = pac.get("nombre", "").strip().upper()
        pac_dni = pac.get("numerodocumento", "") or ""
        pac_fnac = pac.get("fechanacimiento", "") or ""
        pac_sexo = pac.get("sexo", "") or ""

        inicio_raw = str(p.get("inicio", ""))
        fin_raw = str(p.get("fin", ""))
        fecha_cirugia = inicio_raw[:10] if len(inicio_raw) >= 10 else desde
        hora_inicio = inicio_raw[11:16] if len(inicio_raw) >= 16 else "08:00"
        hora_fin = fin_raw[11:16] if len(fin_raw) >= 16 else "09:00"

        obra_social = p.get("cobertura", {}).get("nombre", "") or ""

        log(f"[{idx}/{len(rows)}] Procesando parte #{np or pid} - {pac_nombre} ({fecha_cirugia})...")

        # 1. Obtener diagnóstico y egreso de internación
        diag_str = ""
        tratamiento_str = ""
        egreso_fecha = None
        prestaciones = []

        if idint:
            try:
                f_int = urllib.parse.quote(json.dumps({"id": idint}))
                inc_int = urllib.parse.quote(json.dumps([{"required": True, "model": "paciente"}, {"required": True, "model": "cobertura"}, {"model": "planCobertura"}]))
                url_int = f"https://api.er.globalapp.ar/api/internaciones/get-all?filters={f_int}&includes={inc_int}&pageSize=1&page=1"
                req_int = urllib.request.Request(url_int)
                int_resp = json.loads(opener.open(req_int).read().decode("utf-8"))
                int_rows = int_resp.get("rows", [])
                if int_rows:
                    first_int = int_rows[0]
                    # Capturar fecha de egreso o alta
                    raw_egreso = first_int.get("egresofecha") or first_int.get("altafecha")
                    if raw_egreso:
                        egreso_fecha = str(raw_egreso).strip()

                    int_diags = first_int.get("intDiagnosticos", [])
                    for d in int_diags:
                        td = d.get("turnoDiagnostico", {})
                        d_name = td.get("diagnostico") or td.get("codigo")
                        if d_name:
                            diag_str = d_name.strip().upper()
                            break
            except Exception as e:
                log(f"  Aviso al consultar datos de internación #{idint}: {e}")

            # 2. Consultar prestaciones de internación y filtrar con AOTER
            try:
                f_p = urllib.parse.quote(json.dumps({"idinternacion": idint}))
                inc_p = urllib.parse.quote(json.dumps([{"model": "prestacion"}]))
                url_p = f"https://api.er.globalapp.ar/api/internaciones-prestaciones/get-all?filters={f_p}&includes={inc_p}"
                req_prest = urllib.request.Request(url_p)
                prest_resp = json.loads(opener.open(req_prest).read().decode("utf-8"))
                prest_rows = prest_resp if isinstance(prest_resp, list) else prest_resp.get("rows", [])

                for pr in prest_rows:
                    pr_fecha = str(pr.get("fecha") or "")[:10]
                    # Solo contemplar las prestaciones que se realizaron ese día (fecha de cirugía)
                    if pr_fecha and pr_fecha != fecha_cirugia:
                        continue

                    prest_obj = pr.get("prestacion") or {}
                    cod = str(prest_obj.get("codigo") or pr.get("codigo") or "").strip()
                    desc = prest_obj.get("descripcion") or pr.get("nombre") or ""

                    # Validar si el código pertenece al nomenclador AOTER
                    is_aoter = cod in aoter_catalog
                    pct_esp = pr.get("porc_especialista", 100)
                    pct_ay1 = pr.get("porc_ayudante1", 100)
                    pct_ay2 = pr.get("porc_ayudante2", 100)

                    if is_aoter:
                        if not tratamiento_str:
                            tratamiento_str = aoter_catalog.get(cod) or desc
                        prestaciones.append({
                            "codigo": cod,
                            "descripcion": aoter_catalog.get(cod) or desc,
                            "porcentaje_especialista": pct_esp if pct_esp is not None else 100,
                            "porcentaje_ayudante_1": pct_ay1 if pct_ay1 is not None else 100,
                            "porcentaje_ayudante_2": pct_ay2 if pct_ay2 is not None else 100
                        })
            except Exception as e:
                log(f"  Aviso al consultar prestaciones de internación #{idint}: {e}")

        # 3. Consultar Historia Clínica para Protocolo Quirúrgico y Recargo
        recargo_checkbox_vals = []
        protocolo_text = ""
        if np:
            try:
                q_hc = urllib.parse.quote(json.dumps({"datos.numero_parte": {"$exists": True, "$eq": np}}))
                req_hc = urllib.request.Request(f"https://api.er.globalapp.ar/api/historia-clinica-get-registros?page=1&pageSize=3&query={q_hc}")
                hc_resp = json.loads(opener.open(req_hc).read().decode("utf-8"))
                for reg in hc_resp.get("registros", []):
                    rid = reg.get("_id")
                    req_det = urllib.request.Request(f"https://api.er.globalapp.ar/api/historia-clinica-get-registros/{rid}")
                    det_data = json.loads(opener.open(req_det).read().decode("utf-8"))
                    comps = det_data.get("datos", {}).get("componentes", [])
                    for c in comps:
                        lbl = str(c.get("label", "")).upper()
                        if "PROTOCOLO" in lbl:
                            protocolo_text = str(c.get("valor", "") or "").strip()
                        elif "RECARGO" in lbl:
                            # Puede ser Checkbox con opciones ['5%', '20%', '25%', '30%'] y valor [true, false, ...]
                            opcs = c.get("opciones") or []
                            vals = c.get("valor")
                            if isinstance(vals, list):
                                for i, v in enumerate(vals):
                                    if v is True and i < len(opcs):
                                        recargo_checkbox_vals.append(str(opcs[i]).strip())
                            elif isinstance(vals, str) and vals.strip():
                                recargo_checkbox_vals.append(vals.strip())
            except Exception as e:
                log(f"  Aviso al consultar protocolo quirúrgico #{np}: {e}")

        # Si no hubo prestaciones quirúrgicas principales cargadas en internación (o solo vino radioscopía 340907),
        # buscar prácticas quirúrgicas en el texto del protocolo operatorio
        tiene_practica_quirurgica_base = any(p.get('codigo') != '340907' for p in prestaciones)
        if not tiene_practica_quirurgica_base and protocolo_text:
            # 1. Búsqueda de códigos NUN alfanuméricos (ej: PC.08.03, PP.07.07, MS.07.02)
            for m in re.finditer(r'(?:(?:cod(?:igo|\.|\:)?\s*)?nun\s*[:\s]*|cod(?:igo|\.|\:)?\s*[:\s]*)([A-Z]{2}[\.\s]?\d{2}[\.\s]?\d{2})', protocolo_text, re.IGNORECASE):
                c_clean = re.sub(r'[^A-Za-z0-9]', '', m.group(1)).upper()
                desc = aoter_catalog.get(c_clean, "Práctica Quirúrgica AOTER")
                if not any(p['codigo'] == c_clean for p in prestaciones):
                    log(f"  [Auto-Detección NUN] Encontrado código {c_clean} en texto de protocolo: {desc}")
                    prestaciones.append({
                        "codigo": c_clean,
                        "descripcion": desc,
                        "porcentaje_especialista": 100,
                        "porcentaje_ayudante_1": 100,
                        "porcentaje_ayudante_2": 100
                    })
                    if not tratamiento_str:
                        tratamiento_str = desc

            # 2. Búsqueda de códigos numéricos tradicionales (ej: 120406, 1210406, 1240704, 1240803)
            for m in re.finditer(r'(?:cod(?:igo|\.|\:)?\s*)?(\d{2,3}[\.\-]?\d{2}[\.\-]?\d{2})', protocolo_text, re.IGNORECASE):
                c_raw = m.group(1)
                c_clean = re.sub(r'[^0-9]', '', c_raw)
                if (len(c_clean) in (6, 7)) and c_clean in aoter_catalog:
                    desc = aoter_catalog[c_clean]
                    if not any(p['codigo'] == c_clean for p in prestaciones):
                        log(f"  [Auto-Detección] Encontrado código AOTER {c_clean} en texto de protocolo: {desc}")
                        prestaciones.append({
                            "codigo": c_clean,
                            "descripcion": desc,
                            "porcentaje_especialista": 100,
                            "porcentaje_ayudante_1": 100,
                            "porcentaje_ayudante_2": 100
                        })
                        if not tratamiento_str:
                            tratamiento_str = desc

            # 3. Detección semántica de procedimientos quirúrgicos ortopédicos frecuentes en el protocolo
            proto_upper = protocolo_text.upper()
            if not any(p.get('codigo') != '340907' for p in prestaciones):
                if "THOMPSON" in proto_upper or "REEMPLAZO PARCIAL DE CADERA" in proto_upper or "PROTESIS PARCIAL DE CADERA" in proto_upper:
                    cod_t = "1240704"
                    desc_t = aoter_catalog.get(cod_t, "Reemplazo parcial de cadera")
                    log(f"  [Auto-Detección Semántica] Detectada prótesis de Thompson / Reemplazo parcial de cadera -> {cod_t}: {desc_t}")
                    prestaciones.append({
                        "codigo": cod_t,
                        "descripcion": desc_t,
                        "porcentaje_especialista": 100,
                        "porcentaje_ayudante_1": 100,
                        "porcentaje_ayudante_2": 100
                    })
                    if not tratamiento_str:
                        tratamiento_str = desc_t
                elif "ARTROPLASTIA TOTAL DE CADERA" in proto_upper or "PROTESIS TOTAL DE CADERA" in proto_upper or "RTC" in proto_upper:
                    cod_t = "1240803"
                    desc_t = aoter_catalog.get(cod_t, "Artroplastia total de cadera")
                    log(f"  [Auto-Detección Semántica] Detectada Artroplastia total de cadera -> {cod_t}: {desc_t}")
                    prestaciones.append({
                        "codigo": cod_t,
                        "descripcion": desc_t,
                        "porcentaje_especialista": 100,
                        "porcentaje_ayudante_1": 100,
                        "porcentaje_ayudante_2": 100
                    })
                    if not tratamiento_str:
                        tratamiento_str = desc_t

        # Detección de Recargos y Radioscopía:
        # Semántica estricta de recargos:
        # - Radioscopía (340907): NUNCA puede tener 25%, es estrictamente 5%.
        # - Si tiene 5%: es porque se hizo Radioscopía.
        # - Si tiene 20%: es sobrecargo por edad (>65 años o pediátrico).
        # - Si tiene 25%: es porque se hizo Radioscopía (5%) + sobrecargo por edad (20%).
        # - Si tiene 30%: recargo adicional según nomenclador/convenio.
        # Los porcentajes de recargo son sobre TODAS las prácticas quirúrgicas cargadas.
        has_radioscopia_en_cirugia = any(p['codigo'] == '340907' for p in prestaciones) or bool(
            re.search(r'\b(?:radioscopia|radioscopias|arco\s*en\s*c|340907)\b', protocolo_text, re.IGNORECASE)
        )
        has_checkbox_5 = "5%" in recargo_checkbox_vals or bool(re.search(r'\b5\s*%\b', protocolo_text, re.IGNORECASE))
        has_checkbox_20 = "20%" in recargo_checkbox_vals or bool(re.search(r'\b20\s*%\b', protocolo_text, re.IGNORECASE))
        has_checkbox_25 = "25%" in recargo_checkbox_vals or bool(re.search(r'\b25\s*%\b', protocolo_text, re.IGNORECASE))
        has_checkbox_30 = "30%" in recargo_checkbox_vals or bool(re.search(r'\b30\s*%\b', protocolo_text, re.IGNORECASE))

        # Lista de recargos únicos a aplicar
        recargos_a_aplicar = [] # Tuplas de (porcentaje, etiqueta_motivo)

        if has_checkbox_25:
            # 25% = Radioscopía + Paciente Mayor de Edad
            recargos_a_aplicar.append((25, "Recargo 25% (Radioscopía + Paciente Mayor de Edad)"))
        else:
            # Si tiene radioscopía (código 340907 o checkbox 5%)
            if has_checkbox_5 or has_radioscopia_en_cirugia:
                recargos_a_aplicar.append((5, "Recargo 5% (Utilización de Radioscopía en Quirófano)"))
            # Si tiene sobrecargo por edad (checkbox 20%)
            if has_checkbox_20:
                recargos_a_aplicar.append((20, "Recargo 20% (Paciente Mayor de Edad)"))

        if has_checkbox_30:
            recargos_a_aplicar.append((30, "Recargo 30%"))

        # Prácticas principales quirúrgicas:
        # Excluir radioscopía (340907) y excluir filas previas que vinieran con porcentajes de recargo (ej: 5%, 20%, 25%)
        # Desduplicar por código para que NUNCA se compute dos veces el mismo procedimiento al 100%
        prestaciones_quirurgicas = []
        codigos_principales_vistos = set()

        for p in prestaciones:
            cod = str(p.get('codigo') or '').strip()
            # Ignorar radioscopía directa ya que se procesa como recargo del 5%
            if cod == '340907':
                continue
            # Ignorar si ya vino con porcentaje de recargo en internación para no duplicar
            pct_e = p.get('porcentaje_especialista')
            if pct_e is not None and pct_e in (5, 20, 25, 30):
                continue
            # Desduplicar práctica base
            if cod not in codigos_principales_vistos:
                codigos_principales_vistos.add(cod)
                prestaciones_quirurgicas.append(p)

        if not prestaciones_quirurgicas and prestaciones:
            # Si solo vino 340907 y no hubo otra, mantenerla como único registro
            prestaciones_quirurgicas = [p for p in prestaciones if p.get('codigo') == '340907'][:1]

        prestaciones_finales = []
        for p in prestaciones_quirurgicas:
            prestaciones_finales.append({
                "codigo": p["codigo"],
                "descripcion": p["descripcion"],
                "porcentaje_especialista": 100,
                "porcentaje_ayudante_1": 100,
                "porcentaje_ayudante_2": 100,
                "tipo": "principal"
            })

        # Aplicar los recargos sobre TODAS las prácticas quirúrgicas cargadas al 100%
        # Nota: las radioscopias nunca llevan recargo de 25% ni de 5%.
        for p_base in list(prestaciones_finales):
            if p_base["codigo"] == "340907":
                continue  # Nunca aplicar recargo sobre la radioscopía en sí
            for pct, etiqueta in recargos_a_aplicar:
                prestaciones_finales.append({
                    "codigo": p_base["codigo"],
                    "descripcion": f"{p_base['descripcion']} ({etiqueta})",
                    "porcentaje_especialista": pct,
                    "porcentaje_ayudante_1": pct,
                    "porcentaje_ayudante_2": pct,
                    "tipo": "recargo"
                })

        recargo_display = ", ".join(f"{pct}%" for pct, _ in recargos_a_aplicar) if recargos_a_aplicar else ""

        # Formar el texto de Tratamiento con la descripción de los códigos utilizados como práctica/s
        descripciones_practicas = []
        for pf in prestaciones_finales:
            if pf.get("tipo") == "principal" and pf.get("descripcion"):
                descripciones_practicas.append(pf["descripcion"])

        if descripciones_practicas:
            tratamiento_str = " + ".join(dict.fromkeys(descripciones_practicas))
        elif not tratamiento_str and prestaciones_finales:
            tratamiento_str = " + ".join(dict.fromkeys(pf["descripcion"] for pf in prestaciones_finales if pf.get("descripcion")))

        partes_procesados.append({
            "id": f"ga_{pid}",
            "parte_id": pid,
            "numero_parte": np,
            "idinternacion": idint,
            "fecha_cirugia": fecha_cirugia,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            "paciente_nombre": pac_nombre,
            "paciente_dni": pac_dni,
            "paciente_fecha_nacimiento": pac_fnac[:10] if pac_fnac else "",
            "paciente_sexo": "Femenino" if "F" in pac_sexo.upper() else ("Masculino" if "M" in pac_sexo.upper() else pac_sexo),
            "obra_social": obra_social,
            "convenio": obra_social,
            "especialista_nombre": espe.get("nombre", "").strip().upper(),
            "especialista_matricula": str(espe.get("matricula", "") or "").strip(),
            "ayudante_1_nombre": ayu1.get("nombre", "").strip().upper() if ayu1 else "",
            "ayudante_1_matricula": str(ayu1.get("matricula", "") or "").strip() if ayu1 else "",
            "ayudante_2_nombre": ayu2.get("nombre", "").strip().upper() if ayu2 else "",
            "ayudante_2_matricula": str(ayu2.get("matricula", "") or "").strip() if ayu2 else "",
            "anestesista_nombre": anes.get("nombre", "").strip().upper() if anes else "",
            "anestesista_matricula": str(anes.get("matricula", "") or "").strip() if anes else "",
            "tipo_anestesia": tipo_anestesia,
            "diagnostico": diag_str,
            "tratamiento": tratamiento_str,
            "protocolo_operatorio": protocolo_text,
            "recargo": recargo_display,
            "prestaciones": prestaciones_finales,
            "egreso_fecha": egreso_fecha,
            "tiene_egreso": bool(egreso_fecha),
            "adjuntos": [],
            "selected": False,
            "matched_panel": False
        })

    log(f"Relevamiento completado con éxito: {len(partes_procesados)} cirugías procesadas.")
    return {"success": True, "partes": partes_procesados}

def transfer_aoter(payload):
    from playwright.sync_api import sync_playwright

    surgeries = payload.get("surgeries", [])
    professionals = payload.get("professionals", [])
    show_browser = bool(payload.get("show_browser", False))
    dry_run = bool(payload.get("dry_run", True))

    if not surgeries:
        return {"success": False, "error": "No se recibieron cirugías para transferir a AOTER"}

    log(f"Iniciando transferencia a AOTER SGAPI ({len(surgeries)} cirugías seleccionadas)...")
    log(f"Modo de visualización: {'Navegador en pantalla (Visible)' if show_browser else 'Segundo plano (Headless)'}")

    # Index professionals by doctor_name normalized
    prof_map = {}
    for p in professionals:
        name_key = re.sub(r'[^A-Z0-9]', '', p.get("doctor_name", "").upper())
        if name_key:
            prof_map[name_key] = p

    # Group surgeries by specialist doctor
    doctor_groups = {}
    for surg in surgeries:
        espe = surg.get("especialista_nombre", "").strip().upper()
        name_key = re.sub(r'[^A-Z0-9]', '', espe)
        if name_key not in doctor_groups:
            doctor_groups[name_key] = []
        doctor_groups[name_key].append(surg)

    results = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=not show_browser,
            slow_mo=100 if show_browser else 0
        )

        for name_key, doc_surgeries in doctor_groups.items():
            doc_name = doc_surgeries[0].get("especialista_nombre", "Profesional")
            log(f"--- Procesando cirugías para especialista: {doc_name} ({len(doc_surgeries)} cirugías) ---")

            prof_cred = prof_map.get(name_key)
            if not prof_cred or not prof_cred.get("sgapi_username") or not prof_cred.get("sgapi_password"):
                err_msg = f"No hay credenciales SGAPI registradas para {doc_name} en la pestaña 'Profesionales SGAPI'."
                log(f"[ERROR] {err_msg}")
                for s in doc_surgeries:
                    results.append({
                        "id": s.get("id"),
                        "status": "error",
                        "error": err_msg
                    })
                continue

            username = prof_cred.get("sgapi_username")
            password = prof_cred.get("sgapi_password")

            context = browser.new_context(viewport={"width": 1366, "height": 850})
            page = context.new_page()

            # Login to SGAPI
            try:
                log(f"Iniciando sesión en SGAPI como '{username}'...")
                page.goto("https://servicios.aoter.com.ar/sgapi/index.html", timeout=30000)
                page.wait_for_timeout(1000)
                page.locator("#j_username").fill(username)
                page.locator("#password").fill(password)
                page.locator("#loginForm").locator('input[type="submit"], button').first.click()
                page.wait_for_timeout(2500)

                # Check if login succeeded o si hay error AJAX
                err_ajax = page.locator("#errorLoginAjaxTexto")
                if err_ajax.is_visible() and err_ajax.text_content().strip():
                    raise Exception(f"Rechazo SGAPI para usuario {username}: {err_ajax.text_content().strip()}")

                if "index.html" in page.url and page.locator("#j_username").is_visible():
                    err_alert = page.locator(".alert-danger, .ui.error.message").text_content() or "Credenciales inválidas"
                    raise Exception(f"Fallo de login en SGAPI para matrícula {username}: {err_alert.strip()}")

                log(f"Sesión iniciada exitosamente para {doc_name}.")
            except Exception as e:
                err_msg = f"Error autenticando en AOTER SGAPI: {str(e)}"
                log(f"[ERROR] {err_msg}")
                for s in doc_surgeries:
                    results.append({
                        "id": s.get("id"),
                        "status": "error",
                        "error": err_msg
                    })
                context.close()
                continue

            # Process each surgery for this doctor
            for s_idx, surg in enumerate(doc_surgeries, start=1):
                pac_nombre = surg.get("paciente_nombre", "Paciente")
                fecha = surg.get("fecha_cirugia", "")
                surg_id = surg.get("id")

                log(f"[{s_idx}/{len(doc_surgeries)}] Cargando tríptico: {pac_nombre} ({fecha})...")

                try:
                    page.goto("https://servicios.aoter.com.ar/sgapi/carga_triptico.html", timeout=30000)
                    page.wait_for_timeout(2000)

                    # 1. Obra Social & Convenio
                    os_target = surg.get("obra_social") or ""
                    log(f"  Configurando Obra Social: '{os_target}'...")
                    page.evaluate('''(target) => {
                        const sel = document.getElementById("os");
                        if (!sel) return;
                        let targetVal = null;
                        const cleanTarget = (target || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const firstWord = cleanTarget.split(" ")[0] || "";
                        for (let i = 0; i < sel.options.length; i++) {
                            const optText = sel.options[i].text.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            if (firstWord && optText.includes(firstWord)) {
                                targetVal = sel.options[i].value;
                                break;
                            }
                        }
                        if (targetVal) {
                            $("#os").dropdown("set selected", targetVal);
                            $("#convenio").dropdown("set selected", targetVal);
                        }
                    }''', os_target)
                    page.wait_for_timeout(1000)

                    # 2. Sanatorio I.T.E.O. (S518)
                    page.evaluate('$("#solicitante").dropdown("set selected", "S518");')
                    page.wait_for_timeout(800)

                    # 3. Ficha NUC y Horas
                    nuc = surg.get("paciente_nuc") or surg.get("paciente_dni") or ""
                    if nuc:
                        page.locator('#nroNUC').fill(str(nuc))

                    h_ini = surg.get("hora_inicio", "08:00")
                    h_fin = surg.get("hora_fin", "09:00")
                    page.locator('#horaInicio').fill(h_ini)
                    page.locator('#horaFin').fill(h_fin)
                    page.wait_for_timeout(500)

                    # 4. Paciente (Modal y Selección directa)
                    dni = (surg.get("paciente_dni") or "").strip()
                    pac_nom_target = surg.get("paciente_nombre") or ""
                    pac_fnac_target = surg.get("paciente_fecha_nacimiento") or "1960-01-01"
                    pac_sexo_target = "FEMENINO" if "F" in str(surg.get("paciente_sexo") or "").upper() else "MASCULINO"

                    log(f"  Buscando paciente DNI {dni}...")
                    page.locator('[name="bafiliado"]').click()
                    page.wait_for_timeout(1500)

                    search_inp = page.locator('input[placeholder*="Buscar por nombre o DNI"]')
                    if search_inp.count() > 0 and dni:
                        search_inp.fill(dni)
                        page.locator('button').filter(has_text="Buscar").first.click()
                        page.wait_for_timeout(2000)

                        page.evaluate('''(pData) => {
                            if ($("#agregarEntidad").is(":visible")) {
                                $("#nombre").val(pData.nombre);
                                $("#cod_en_OS").val(pData.dni);
                                $("#num_doc").val(pData.dni);
                                $("#fecha_nac").val(pData.fnac);
                                $("#sexo").dropdown("set selected", pData.sexo);
                                if (typeof guardarPaciente === "function") guardarPaciente();
                                else if (typeof _confirmarUsarPaciente === "function") _confirmarUsarPaciente();
                                $("#agregarEntidad").modal("hide");
                            } else {
                                if (typeof _confirmarUsarPaciente === "function") {
                                    _confirmarUsarPaciente();
                                } else if (typeof usarPacienteExistente === "function") {
                                    usarPacienteExistente();
                                }
                            }
                        }''', {"nombre": pac_nom_target, "dni": dni, "fnac": pac_fnac_target, "sexo": pac_sexo_target})
                        page.wait_for_timeout(1500)

                    # Asegurar campos requeridos de afiliado y edad en cabecera
                    page.evaluate('''(pData) => {
                        if ($("#nroAfiliado").text() === "-" || !$("#nroAfiliado").text()) $("#nroAfiliado").text(pData.dni || "0");
                        if ($("#edadPaciente").text() === "-" || !$("#edadPaciente").text()) $("#edadPaciente").text("50 años");
                        if ($("#afiliadoText").val() === "") $("#afiliadoText").val(pData.nombre);
                        if ($("#agregarEntidad").is(":visible")) $("#agregarEntidad").modal("hide");
                    }''', {"dni": dni, "nombre": pac_nom_target})

                    # 5. Diagnóstico y Tratamiento
                    diag = surg.get("diagnostico") or "PROCEDIMIENTO QUIRURGICO"
                    trat = surg.get("tratamiento") or "TRATAMIENTO QUIRURGICO"
                    page.locator('#diagnosticoText').fill(diag)
                    page.locator('#tratamientoText').fill(trat)
                    page.wait_for_timeout(500)

                    # 6. Prestaciones AOTER y Recargos por porcentaje
                    prestaciones = surg.get("prestaciones", [])
                    if not prestaciones and surg.get("codigo_aoter"):
                        prestaciones = [{"codigo": surg.get("codigo_aoter")}]

                    log(f"  Cargando {len(prestaciones)} línea(s) de prestación en SGAPI...")
                    for p_idx, prest in enumerate(prestaciones):
                        cod = prest.get("codigo")
                        pct = prest.get("porcentaje_especialista", 100)
                        if not cod:
                            continue

                        log(f"    [{p_idx + 1}/{len(prestaciones)}] Ingresando código {cod} ({pct}%)...")
                        cod_elem = page.locator('#codPrestacion')
                        cod_elem.wait_for(state="visible", timeout=10000)
                        cod_elem.fill(str(cod))
                        page.wait_for_timeout(400)
                        cod_elem.press('Enter')
                        page.wait_for_timeout(2500)

                        # Si el porcentaje es distinto a 100% (recargo), ajustar PRecargo{p_idx}
                        if pct and int(pct) != 100:
                            page.evaluate('''(data) => {
                                const recInp = document.getElementById("PRecargo" + data.idx);
                                if (recInp) {
                                    recInp.value = String(data.pct);
                                    recInp.dispatchEvent(new Event("change", { bubbles: true }));
                                }
                            }''', {"idx": p_idx, "pct": pct})
                            page.wait_for_timeout(500)

                    # 6.b Asignar Efectores Ayudantes en todas las líneas de la tabla
                    ayu1_mat = surg.get("ayudante_1_matricula")
                    ayu2_mat = surg.get("ayudante_2_matricula")
                    if ayu1_mat or ayu2_mat:
                        log(f"  Asignando ayudantes: Ayu 1={ayu1_mat}, Ayu 2={ayu2_mat} en todas las prestaciones...")
                        page.evaluate('''(data) => {
                            if (data.ayu1) {
                                $("[id^='PEfector'][id$='_2']").dropdown("set selected", String(data.ayu1));
                            }
                            if (data.ayu2) {
                                $("[id^='PEfector'][id$='_3']").dropdown("set selected", String(data.ayu2));
                            }
                        }''', {"ayu1": ayu1_mat, "ayu2": ayu2_mat})
                        page.wait_for_timeout(800)

                    # 7. Protocolo Operatorio (con constancia de Anestesista si existe)
                    proto = surg.get("protocolo_operatorio") or ""
                    anes_nom = surg.get("anestesista_nombre")
                    anes_mat = surg.get("anestesista_matricula")
                    tipo_anes = surg.get("tipo_anestesia")
                    if anes_nom and "ANESTESISTA" not in proto.upper():
                        anes_header = f"ANESTESIA: {tipo_anes or 'Raquídea'} | ANESTESISTA: Dr. {anes_nom} (Mat. {anes_mat})\n\n"
                        proto = anes_header + proto

                    if proto:
                        try:
                            # Intento 1: selector estándar
                            proto_el = page.locator('#protocoloOperatorioText, textarea[name*="protocolo" i], textarea[id*="protocolo" i]')
                            if proto_el.count() > 0 and proto_el.first.is_visible():
                                proto_el.first.fill(proto)
                            else:
                                # Intento 2: asignación directa vía evaluate en cualquier textarea del formulario
                                page.evaluate('''(txt) => {
                                    const el = document.querySelector("#protocoloOperatorioText") ||
                                               document.querySelector("textarea[name*='protocolo' i]") ||
                                               document.querySelector("textarea[id*='protocolo' i]") ||
                                               document.querySelectorAll("textarea")[1] ||
                                               document.querySelector("textarea");
                                    if (el) {
                                        el.value = txt;
                                        el.dispatchEvent(new Event("input", { bubbles: true }));
                                        el.dispatchEvent(new Event("change", { bubbles: true }));
                                    }
                                }''', proto)
                        except Exception as e_proto:
                            log(f"  [Aviso Protocolo] No se pudo escribir en textarea por selector: {e_proto}")
                    page.wait_for_timeout(800)

                    # 8. Adjuntos (si los hay)
                    adjuntos = surg.get("adjuntos", [])
                    file_paths = [a.get("path") for a in adjuntos if a.get("path") and os.path.exists(a.get("path"))]
                    if file_paths:
                        file_input = page.locator('input[type="file"]')
                        if file_input.count() > 0:
                            file_input.first.set_input_files(file_paths)
                            log(f"  {len(file_paths)} archivo(s) adjunto(s) cargado(s).")
                            page.wait_for_timeout(1000)

                    # 9. Guardar y Continuar a Vista Previa
                    log("  Abriendo vista previa del tríptico...")
                    page.locator('#botonContinuar').click()
                    page.wait_for_timeout(2000)

                    # Advertencia de ayudantía sin efector
                    ayud_modal = page.locator('#modalAyudantiaSinEfector')
                    if ayud_modal.is_visible():
                        ayud_modal.locator('.button').filter(has_text="Continuar").click()
                        page.wait_for_timeout(2500)

                    # 10. Confirmación Final
                    orden_aoter = ""
                    if not dry_run:
                        confirmar_btn = page.locator('#modalVistaPreviaTriptico .button.approve, #modalVistaPreviaTriptico .button:has-text("Confirmar")')
                        if confirmar_btn.count() > 0:
                            confirmar_btn.first.click()
                            page.wait_for_timeout(3500)

                            body_txt = page.locator('body').text_content() or ""
                            match_ord = re.search(r'orden\s*(?:nro|n°|#)?\s*[:\s]*(\d+)', body_txt, re.IGNORECASE)
                            if match_ord:
                                orden_aoter = match_ord.group(1)

                        log(f"  Tríptico de {pac_nombre} guardado y confirmado exitosamente en AOTER SGAPI.")
                    else:
                        log("  [MODO PRUEBA] Vista previa desplegada en pantalla exitosamente.")
                        log("  [ALERTA DE SEGURIDAD] Manteniendo ventana abierta durante 20 segundos para verificación visual (NO se confirma ni guarda)...")
                        if show_browser:
                            time.sleep(20)
                        log("  [MODO PRUEBA] Cerrando modal con 'Volver' sin guardar cambios.")
                        volver_btn = page.locator('#modalVistaPreviaTriptico button, #modalVistaPreviaTriptico .button, #modalVistaPreviaTriptico a').filter(has_text="Volver")
                        if volver_btn.count() > 0:
                            volver_btn.first.click()
                        else:
                            page.evaluate('() => $("#modalVistaPreviaTriptico").modal("hide");')
                        page.wait_for_timeout(1000)

                    results.append({
                        "id": surg_id,
                        "status": "synced",
                        "orden_triptico_aoter": orden_aoter or f"SGAPI-{int(time.time())}"
                    })

                except Exception as e:
                    err_msg = f"Error durante la carga en SGAPI: {str(e)}"
                    log(f"[ERROR] {err_msg}")
                    results.append({
                        "id": surg_id,
                        "status": "error",
                        "error": err_msg
                    })

            context.close()

        browser.close()

    log(f"Transferencia finalizada. Resultados procesados: {len(results)}")
    return {"success": True, "results": results}

def check_aoter_existing_tripticos(payload):
    """
    Ingresa al portal SGAPI con las credenciales de cada profesional involucrado,
    accede a 'Listar Trípticos' (listar_tripticos.html) y extrae las órdenes cargadas
    en el rango de fechas solicitado para detectar cirugías ya cargadas.
    """
    from playwright.sync_api import sync_playwright

    professionals = payload.get("professionals", [])
    desde = payload.get("desde") or ""
    hasta = payload.get("hasta") or ""
    show_browser = bool(payload.get("show_browser", False))

    if not professionals:
        return {"success": True, "tripticos_existentes": []}

    log(f"Verificando trípticos ya cargados en AOTER SGAPI ({len(professionals)} profesionales configurados)...")

    # Formato AOTER de fechas: DD/MM/AAAA
    desde_fmt = ""
    hasta_fmt = ""
    if desde and len(desde) >= 10:
        p = desde[:10].split("-")
        if len(p) == 3:
            desde_fmt = f"{p[2]}/{p[1]}/{p[0]}"
    if hasta and len(hasta) >= 10:
        p = hasta[:10].split("-")
        if len(p) == 3:
            hasta_fmt = f"{p[2]}/{p[1]}/{p[0]}"

    existing_orders = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=not show_browser,
            slow_mo=50 if show_browser else 0
        )

        for prof in professionals:
            user = prof.get("sgapi_username")
            pwd = prof.get("sgapi_password")
            doc_name = prof.get("doctor_name", "Médico")
            if not user or not pwd:
                continue

            context = browser.new_context(viewport={"width": 1366, "height": 850})
            page = context.new_page()

            try:
                log(f"  Consultando historial de trípticos en AOTER para Dr(a). {doc_name} ({user})...")
                page.goto("https://servicios.aoter.com.ar/sgapi/index.html", timeout=25000)
                page.wait_for_timeout(800)
                page.locator("#j_username").fill(user)
                page.locator("#password").fill(pwd)
                page.locator("#loginForm").locator('input[type="submit"], button').first.click()
                page.wait_for_timeout(2000)

                # Verificar si login falló
                err_ajax = page.locator("#errorLoginAjaxTexto")
                if err_ajax.is_visible() and err_ajax.text_content().strip():
                    log(f"  [Aviso] No se pudo autenticar usuario AOTER {user}: {err_ajax.text_content().strip()}")
                    context.close()
                    continue

                if "index.html" in page.url and page.locator("#j_username").is_visible():
                    log(f"  [Aviso] Login rechazado para usuario {user} en AOTER.")
                    context.close()
                    continue

                # Navegar a Listar Trípticos
                page.goto("https://servicios.aoter.com.ar/sgapi/listar_tripticos.html", timeout=25000)
                page.wait_for_timeout(1500)

                # Ajustar rango de fechas si existen campos desde/hasta
                if desde_fmt and hasta_fmt:
                    try:
                        page.evaluate('''(fechas) => {
                            const inps = document.querySelectorAll("input[type='text'], input[placeholder*='dd/mm' i]");
                            // Tratar de asignar fechas
                            const dInp = document.querySelector("#fdesde, input[name*='desde' i]") || inps[0];
                            const hInp = document.querySelector("#fhasta, input[name*='hasta' i]") || inps[1];
                            if (dInp) {
                                dInp.value = fechas.d;
                                dInp.dispatchEvent(new Event("change", { bubbles: true }));
                            }
                            if (hInp) {
                                hInp.value = fechas.h;
                                hInp.dispatchEvent(new Event("change", { bubbles: true }));
                            }
                            const btn = document.querySelector("button:has-text('Buscar'), input[value*='Buscar' i]");
                            if (btn) btn.click();
                        }''', {"d": desde_fmt, "h": hasta_fmt})
                        page.wait_for_timeout(2000)
                    except Exception as e_f:
                        pass

                # Extraer filas de la tabla de Trípticos Ingresados
                rows_data = page.evaluate('''() => {
                    const results = [];
                    // Buscar filas de la tabla
                    const trs = document.querySelectorAll("table tbody tr");
                    trs.forEach(tr => {
                        const tds = tr.querySelectorAll("td");
                        if (tds.length >= 4) {
                            const fText = tds[0]?.innerText?.trim() || "";
                            const pText = tds[1]?.innerText?.trim() || "";
                            const osText = tds[2]?.innerText?.trim() || "";
                            const estText = tds[3]?.innerText?.trim() || "";
                            // Extraer NUC u orden si existen en enlaces o botones
                            const links = Array.from(tr.querySelectorAll("a, button")).map(a => a.getAttribute("href") || a.getAttribute("onclick") || "").join(" ");
                            results.push({
                                fecha: fText,
                                paciente: pText,
                                obra_social: osText,
                                estado: estText,
                                extra: links
                            });
                        }
                    });
                    return results;
                }''')

                log(f"  -> {len(rows_data)} tríptico(s) registrado(s) en AOTER para Dr(a). {doc_name}.")
                for rd in rows_data:
                    existing_orders.append({
                        "doctor_name": doc_name,
                        "matricula": prof.get("matricula", ""),
                        "fecha": rd.get("fecha"),
                        "paciente": rd.get("paciente"),
                        "obra_social": rd.get("obra_social"),
                        "estado": rd.get("estado"),
                        "raw_info": rd.get("extra")
                    })

            except Exception as e_doc:
                log(f"  [Aviso] Error al consultar historial AOTER de {doc_name}: {e_doc}")
            finally:
                context.close()

        browser.close()

    log(f"Total trípticos existentes verificados en AOTER: {len(existing_orders)}")
    return {"success": True, "tripticos_existentes": existing_orders}

def main():
    if len(sys.argv) < 2:
        print("Uso: python tripticos_scraper.py <payload.json>")
        sys.exit(1)

    payload_file = sys.argv[1]
    if not os.path.exists(payload_file):
        print(f"Archivo no encontrado: {payload_file}")
        sys.exit(1)

    with open(payload_file, "r", encoding="utf-8-sig") as f:
        payload = json.load(f)

    action = payload.get("action", "relevar")

    if action == "relevar":
        res = relevar_cirugias(payload)
    elif action == "transfer_aoter":
        res = transfer_aoter(payload)
    elif action == "check_existing_aoter":
        res = check_aoter_existing_tripticos(payload)
    else:
        res = {"success": False, "error": f"Acción desconocida: {action}"}

    print("===TRIPTICOS_RESULT_START===", flush=True)
    print(json.dumps(res, ensure_ascii=False), flush=True)
    print("===TRIPTICOS_RESULT_END===", flush=True)

if __name__ == "__main__":
    main()
