import os
import sys
import json
import time
import ssl
import re
import imaplib
import email
from email.header import decode_header
from datetime import datetime
from playwright.sync_api import sync_playwright

def log(msg):
    print(f"[PREQUIRURGICOS] {msg}", flush=True)

def decode_mime_words(s):
    if not s:
        return ""
    try:
        parts = decode_header(s)
        res = []
        for text, enc in parts:
            if isinstance(text, bytes):
                res.append(text.decode(enc or "utf-8", errors="ignore"))
            else:
                res.append(str(text))
        return "".join(res)
    except Exception:
        return str(s)

def normalize_text(text):
    if not text:
        return ""
    t = text.lower()
    t = t.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")
    return re.sub(r'[^a-z0-9]', '', t)

def levenshtein_distance(s1, s2):
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        distances_ = [i2+1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                distances_.append(distances[i1])
            else:
                distances_.append(1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
        distances = distances_
    return distances[-1]

def is_name_matching(target_name, test_string):
    """
    Verificación estricta del apellido y nombres:
    - Obliga a que el apellido (primer token) coincida plenamente.
    - Si target_name tiene 2 o más palabras (ej: Mignola Luis), requiere que AMBAS
      coincidan (o al menos apellido obligatorio + 1 nombre).
    - Evita falsos positivos como descargar a 'MILESI LUIS', 'OLIVO LUIS', 'MAZZEO LUISA'
      cuando se busca 'MIGNOLA LUIS'.
    """
    norm_target = normalize_text(target_name)
    norm_test = normalize_text(test_string)
    if not norm_target or not norm_test:
        return False
    if norm_target in norm_test:
        return True
        
    tokens_target = [normalize_text(w) for w in re.split(r'\s+|,', target_name) if len(w) >= 3]
    tokens_test = [normalize_text(w) for w in re.split(r'\s+|,', test_string) if len(w) >= 3]
    
    if not tokens_target or not tokens_test:
        return False

    # El primer token siempre representa el Apellido del paciente
    surname = tokens_target[0]
    surname_found = False
    for t in tokens_test:
        if surname in t or t in surname:
            surname_found = True
            break
        if len(surname) >= 5 and len(t) >= 5 and levenshtein_distance(surname, t) <= 1:
            surname_found = True
            break

    if not surname_found:
        return False

    # Si solo tiene apellido, con hallarlo alcanza
    if len(tokens_target) == 1:
        return True

    # Si tiene nombre(s) adicional(es), requerir que al menos 1 nombre también coincida
    name_tokens = tokens_target[1:]
    name_matched = False
    for n_tok in name_tokens:
        for t in tokens_test:
            if n_tok in t or t in n_tok:
                name_matched = True
                break
            if len(n_tok) >= 4 and len(t) >= 4 and levenshtein_distance(n_tok, t) <= 1:
                name_matched = True
                break
        if name_matched:
            break

    return name_matched

def report_progress(percent, stage_text):
    """Emite un evento de progreso parseable por la interfaz"""
    print(f"[PROGRESS:{percent}] {stage_text}", flush=True)

def collect_ecg(patient_name, ecg_date_str, output_dir):
    """
    Descarga los ECGs desde prequirurgico@iteosrl.com.ar via IMAP
    """
    report_progress(10, "Conectando al correo para buscar ECG...")
    log(f"Iniciando búsqueda de ECG para: '{patient_name}' desde {ecg_date_str}...")
    downloaded_files = []
    
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        # Conexión directa a Ferozo
        M = imaplib.IMAP4_SSL("200.58.110.166", 993, ssl_context=ctx)
        M.login("prequirurgico@iteosrl.com.ar", "@C8y6H@6fZ")
        M.select("INBOX", readonly=True)
        report_progress(18, "Buscando correos en el período seleccionado...")
        
        # Formatear fecha para filtro IMAP SINCE
        search_criteria = "ALL"
        try:
            # Soportar dd/mm/yyyy o yyyy-mm-dd
            if "/" in ecg_date_str:
                dt = datetime.strptime(ecg_date_str.strip(), "%d/%m/%Y")
            else:
                dt = datetime.strptime(ecg_date_str.strip(), "%Y-%m-%d")
            imap_date = dt.strftime("%d-%b-%Y")
            search_criteria = f'(SINCE "{imap_date}")'
        except Exception as e:
            log(f"Aviso al parsear fecha ECG ({ecg_date_str}): {e}. Se buscará en los correos recientes.")

        status, data = M.search(None, search_criteria)
        if status != "OK" or not data or not data[0]:
            log("No se encontraron correos en el período especificado.")
            M.close()
            M.logout()
            report_progress(35, "Búsqueda de ECG finalizada (no disponible).")
            return {"success": False, "files": [], "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}
        
        msg_ids = data[0].split()
        log(f"Analizando {len(msg_ids)} correos dentro del rango de fechas...")
        report_progress(25, f"Analizando {len(msg_ids)} correos...")
        
        found_target_email = False

        # Recorrer del más reciente al más antiguo
        for mid in reversed(msg_ids):
            if found_target_email:
                break

            status, msg_data = M.fetch(mid, "(RFC822)")
            if status != "OK" or not msg_data:
                continue
                
            for part in msg_data:
                if isinstance(part, tuple):
                    msg = email.message_from_bytes(part[1])
                    subject = decode_mime_words(msg.get("Subject", ""))
                    date_val = msg.get("Date", "")
                    
                    # Chequear si el asunto coincide estrictamente con el paciente
                    has_subject_match = is_name_matching(patient_name, subject)
                    
                    matching_attachments = []
                    for subpart in msg.walk():
                        filename = subpart.get_filename()
                        if filename:
                            decoded_filename = decode_mime_words(filename)
                            if decoded_filename.lower().endswith(".pdf"):
                                # Si coincide el asunto O el propio nombre del archivo PDF
                                if has_subject_match or is_name_matching(patient_name, decoded_filename):
                                    matching_attachments.append((decoded_filename, subpart.get_payload(decode=True)))
                    
                    if matching_attachments:
                        log(f"¡Correo exacto encontrado! Asunto: '{subject}' | Fecha: {date_val}")
                        report_progress(30, f"Informe ECG encontrado ({len(matching_attachments)} archivo/s), descargando...")
                        for fname, content in matching_attachments:
                            safe_name = f"ECG_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}_{fname}"
                            dest_path = os.path.join(output_dir, safe_name)
                            with open(dest_path, "wb") as f:
                                f.write(content)
                            downloaded_files.append(dest_path)
                            log(f"Guardado adjunto ECG: {safe_name}")
                        
                        found_target_email = True
                        break
                            
        M.close()
        M.logout()
        report_progress(35, "Búsqueda de ECG finalizada.")
        
        if downloaded_files:
            return {"success": True, "files": downloaded_files, "message": f"Se descargaron {len(downloaded_files)} archivo(s) de ECG con éxito."}
        else:
            return {"success": False, "files": [], "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}

    except Exception as e:
        log(f"Error procesando correo ECG: {e}")
        report_progress(35, "Aviso en búsqueda de ECG.")
        return {"success": False, "files": [], "error": str(e), "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}

def collect_lab_nanni(playwright, patient_name, lab_date_str, output_dir, show_browser=False):
    """
    Intenta buscar y descargar el laboratorio desde Lab Nanni
    """
    report_progress(10 if show_browser else 40, "Abriendo navegador para consultar Lab Nanni...")
    log(f"Intentando buscar en Lab Nanni (Visual: {show_browser})...")
    browser = None
    try:
        browser = playwright.chromium.launch(headless=not show_browser)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        url = "https://resultados.labnanni.com.ar/shift/lis/nanni/elis/s01.iu.web.Login.cls?config=IBP"
        page.goto(url, timeout=30000)
        report_progress(15 if show_browser else 45, "Iniciando sesión en portal Nanni...")
        
        # Login
        user_inp = page.locator("input#control_42")
        pass_inp = page.locator("input#control_45")
        user_inp.fill("ITEO")
        pass_inp.fill("664HB")
        page.locator("input#control_56").click() # Botón Entrar
        
        page.wait_for_load_state("networkidle", timeout=15000)
        log("Sesión iniciada en Lab Nanni. Buscando fechas y paciente...")
        report_progress(20 if show_browser else 55, "Buscando protocolos por fecha y paciente en Nanni...")
        
        # Formatear fecha para el período
        # Esperado habitual en Nanni: dd/mm/yyyy
        if "-" in lab_date_str:
            d_parts = lab_date_str.strip().split("-")
            formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
        else:
            formatted_date = lab_date_str.strip()
            
        # Setear fecha 'De' y 'Hasta' en los inputs y disparar evento Zen
        try:
            page.evaluate(f"""() => {{
                const inp68 = document.getElementById('control_68');
                const inp69 = document.getElementById('control_69');
                if (inp68) {{ inp68.value = '{formatted_date}'; inp68.dispatchEvent(new Event('change')); }}
                if (inp69) {{ inp69.value = '{formatted_date}'; inp69.dispatchEvent(new Event('change')); }}
                if (typeof zenPage !== 'undefined' && zenPage.pesquisar) {{ zenPage.pesquisar(); }}
            }}""")
        except Exception as e_fill:
            log(f"Aviso al setear fechas en Nanni: {e_fill}")
            
        page.wait_for_timeout(4000)
            
        # Extraer filas con O.S. y nombres de pacientes
        orders = page.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('table.tpTable tr'));
            const res = [];
            rows.forEach(r => {
                const link = r.querySelector("a[onclick*='apresentarOS']");
                if (link) {
                    const match = link.getAttribute('onclick').match(/apresentarOS\\('(\\d+)'\\)/);
                    res.push({
                        text: r.innerText.trim(),
                        osId: match ? match[1] : null
                    });
                }
            });
            return res;
        }""")
        
        matched_os_id = None
        for order in orders:
            txt = order.get("text", "")
            if is_name_matching(patient_name, txt):
                matched_os_id = order.get("osId")
                log(f"Protocolo O.S. encontrado en Nanni: {txt[:80]} (OS ID: {matched_os_id})")
                break
                
        if not matched_os_id:
            log(f"Paciente '{patient_name}' no encontrado en resultados de Nanni.")
            report_progress(25 if show_browser else 65, "Paciente no encontrado en Nanni.")
            browser.close()
            return {"success": False, "file": None}
            
        report_progress(30 if show_browser else 60, "Protocolo hallado en Nanni. Abriendo detalle...")
        # Navegar a la OS seleccionada
        page.evaluate(f"zenPage.apresentarOS('{matched_os_id}');")
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(2500)
        
        # Abrir reporte / laudo y generar PDF
        report_progress(35 if show_browser else 65, "Generando PDF de resultados desde Nanni...")
        clean_name = f"LAB_NANNI_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}.pdf"
        dest_file = os.path.join(output_dir, clean_name)
        
        try:
            with page.expect_popup(timeout=15000) as laudo_popup_info:
                page.evaluate("zenPage.imprimirLaudo(false);")
            laudo_page = laudo_popup_info.value
            laudo_page.wait_for_load_state("networkidle", timeout=15000)
            laudo_page.wait_for_timeout(2000)
            laudo_page.pdf(path=dest_file)
            log(f"¡Laboratorio Nanni descargado con éxito!: {dest_file}")
            report_progress(40 if show_browser else 70, "Laboratorio descargado exitosamente desde Nanni.")
            browser.close()
            return {"success": True, "file": dest_file, "source": "Lab Nanni"}
        except Exception as e_laudo:
            log(f"Aviso al generar PDF en ventana emergente: {e_laudo}. Intentando descarga estándar...")
            btn_imprimir = page.locator("text='Imprimir resultado', text='Imprimir', [title*='Imprimir']").first
            if btn_imprimir.count():
                with page.expect_download(timeout=10000) as download_info:
                    btn_imprimir.click()
                download = download_info.value
                download.save_as(dest_file)
                log(f"¡Laboratorio Nanni descargado con éxito!: {dest_file}")
                report_progress(40 if show_browser else 70, "Laboratorio descargado exitosamente desde Nanni.")
                browser.close()
                return {"success": True, "file": dest_file, "source": "Lab Nanni"}
                
        browser.close()
        report_progress(40 if show_browser else 70, "Búsqueda en Nanni finalizada.")
        return {"success": False, "file": None}
    except Exception as e:
        log(f"Aviso durante búsqueda en Nanni: {e}")
        report_progress(40 if show_browser else 70, "Aviso en portal Nanni, continuando...")
        if browser:
            try:
                browser.close()
            except:
                pass
        return {"success": False, "file": None, "error": str(e)}

def collect_lab_iphh(playwright, patient_name, lab_date_str, output_dir, patient_dni="", show_browser=False):
    """
    Fallback / Búsqueda y descarga desde portal IPHH (iphhconsultorio.dynu.net)
    """
    report_progress(75, "Abriendo navegador para consultar portal secundario IPHH...")
    log(f"Iniciando búsqueda en portal secundario IPHH (Visual: {show_browser} | DNI: '{patient_dni}')...")
    try:
        browser = playwright.chromium.launch(headless=not show_browser)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        url = "https://iphhconsultorio.dynu.net/portal/login"
        page.goto(url, timeout=30000)
        report_progress(80, "Iniciando sesión en portal IPHH...")
        
        # Perfil: Institución
        page.locator("select").first.select_option("institucion")
        
        # Usuario y Clave
        page.locator("input[placeholder='Usuario']").fill("ITEO")
        page.locator("input[placeholder='Clave']").fill("ITEO_26")
        
        # Submit
        page.locator("button, input[type='submit']").first.click()
        page.wait_for_load_state("networkidle", timeout=15000)
        log("Sesión iniciada en portal IPHH.")
        
        searched_by_dni = False
        clean_dni = re.sub(r'[^0-9]', '', str(patient_dni or "")).strip()

        # 1. Si tenemos DNI, intentar buscar directamente en el campo de documento
        if clean_dni:
            report_progress(83, f"Buscando por documento DNI {clean_dni} en IPHH...")
            log(f"Intentando búsqueda por DNI '{clean_dni}'...")
            doc_input = page.locator("input.input-shell, input[placeholder*='Número'], input[placeholder*='documento'], input[aria-label*='documento']").first
            if doc_input.count():
                try:
                    doc_input.fill(clean_dni)
                    btn_ir_ultimo = page.locator("button:has-text('Ir al último informe'), button:has-text('Buscar')").first
                    if btn_ir_ultimo.count():
                        btn_ir_ultimo.click()
                    else:
                        doc_input.press("Enter")
                    page.wait_for_timeout(3500)
                    searched_by_dni = True
                except Exception as e_dni:
                    log(f"Aviso al intentar buscar por DNI: {e_dni}")

        # 2. Si no se buscó por DNI o no se cargaron resultados, buscar por fecha
        cards = page.locator("button.selection-card, button[class*='selection-card']").all()
        if not cards:
            report_progress(85, "Filtrando por fecha en IPHH...")
            log(f"Filtrando por fecha '{lab_date_str}' en IPHH...")
            
            # Formatear fecha
            if "-" in lab_date_str:
                d_parts = lab_date_str.strip().split("-")
                formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
            else:
                formatted_date = lab_date_str.strip()
                
            # Campo de Fecha
            date_inp = page.locator("input[type='date'], input[placeholder*='Fecha'], input.fecha").first
            if date_inp.count():
                if date_inp.get_attribute("type") == "date":
                    if "/" in lab_date_str:
                        dp = lab_date_str.strip().split("/")
                        date_val = f"{dp[2]}-{dp[1]}-{dp[0]}"
                    else:
                        date_val = lab_date_str.strip()
                    date_inp.fill(date_val)
                else:
                    date_inp.fill(formatted_date)
                    
            btn_buscar = page.locator("button:has-text('Buscar'), input[value*='Buscar']").first
            if btn_buscar.count():
                btn_buscar.click()
                page.wait_for_timeout(3000)
                
            cards = page.locator("button.selection-card, button[class*='selection-card']").all()

        # Si aún no hay tarjetas con .selection-card, buscar cualquier botón o fila de paciente
        if not cards:
            cards = page.locator("button:has-text('DNI'), button:has-text('ITEO'), .selection-card, tr, .card").all()

        report_progress(88, f"Analizando {len(cards)} elemento(s) de pacientes encontrados...")
        log(f"Se encontraron {len(cards)} tarjeta(s)/botón(es) de paciente en IPHH.")
        
        matched_elem = None
        
        # Si hay múltiples botones, buscar cuál coincide estrictamente con el paciente (y/o DNI)
        for card in cards:
            try:
                card_text = card.inner_text().strip()
                if not card_text:
                    continue
                
                # Si coincide por DNI directamente
                if clean_dni and clean_dni in re.sub(r'[^0-9]', '', card_text):
                    log(f"Coincidencia exacta por DNI en botón: {card_text.replace(chr(10), ' ')}")
                    matched_elem = card
                    break
                    
                # Si coincide por nombre
                if is_name_matching(patient_name, card_text):
                    log(f"Coincidencia por nombre en botón: {card_text.replace(chr(10), ' ')}")
                    matched_elem = card
                    break
            except Exception as e_card:
                log(f"Aviso al evaluar tarjeta: {e_card}")

        if not matched_elem:
            # Si solo hay 1 tarjeta disponible y coincide mínimamente o se buscó por DNI
            if len(cards) == 1 and searched_by_dni:
                matched_elem = cards[0]
                log("Utilizando la única tarjeta arrojada por la búsqueda de DNI.")
            else:
                log(f"Paciente '{patient_name}' (DNI: {clean_dni or 'N/A'}) no coincide con las tarjetas listadas.")
                report_progress(95, "Paciente no encontrado en IPHH.")
                browser.close()
                return {"success": False, "file": None}
                
        # Hacer click en la tarjeta/botón del paciente seleccionado
        report_progress(90, "Paciente seleccionado en IPHH. Abriendo previsualización...")
        matched_elem.scroll_into_view_if_needed()
        matched_elem.click()
        page.wait_for_timeout(2500)
        
        # Clic en Descargar PDF desde la barra superior de la previsualización
        report_progress(92, "Localizando botón de descarga en previsualización...")
        
        # Selectores del botón de descarga (icono SVG flecha abajo / circular / title)
        btn_descargar = page.locator(
            "button:has(svg path[d*='M3 16.5v2.25']), "
            "button:has([data-icon*='download']), "
            "button.rounded-full:has(svg), "
            "button[title*='Descargar'], "
            "button:has-text('Descargar'), "
            "button:has(.fa-download)"
        ).first
        
        if not btn_descargar.count():
            # Fallback buscando botón redondo en el header de la previsualización
            btn_descargar = page.locator("div.flex button.rounded-full").first

        if btn_descargar.count():
            clean_name = f"LAB_IPHH_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}.pdf"
            dest_file = os.path.join(output_dir, clean_name)
            
            with page.expect_download(timeout=20000) as download_info:
                btn_descargar.click()
            download = download_info.value
            download.save_as(dest_file)
            log(f"¡Laboratorio IPHH descargado con éxito!: {dest_file}")
            report_progress(95, "Laboratorio descargado exitosamente desde IPHH.")
            browser.close()
            return {"success": True, "file": dest_file, "source": "IPHH"}
        else:
            log("No se encontró el botón de descarga en la previsualización.")
            
        browser.close()
        report_progress(95, "Búsqueda en IPHH finalizada sin descarga.")
        return {"success": False, "file": None}
    except Exception as e:
        log(f"Aviso durante búsqueda en IPHH: {e}")
        report_progress(95, "Aviso durante búsqueda en IPHH.")
        try:
            browser.close()
        except:
            pass
        return {"success": False, "file": None, "error": str(e)}

def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False, 
            "error": "Parámetros insuficientes. Uso: python prequirurgicos_collector.py <paciente> <fecha_lab> <fecha_ecg> [output_dir] [--show] [--dni <dni>]"
        }))
        sys.exit(1)
        
    patient_name = sys.argv[1].strip()
    lab_date = sys.argv[2].strip()
    ecg_date = sys.argv[3].strip()
    
    # Procesar argumentos opcionales: output_dir, --show y --dni
    output_dir = ""
    patient_dni = ""
    show_browser = False
    
    i = 4
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--show":
            show_browser = True
            i += 1
        elif arg == "--dni" and i + 1 < len(sys.argv):
            patient_dni = sys.argv[i + 1].strip()
            i += 2
        elif not arg.startswith("--") and not output_dir:
            output_dir = arg.strip()
            i += 1
        else:
            i += 1
            
    if not output_dir:
        home = os.path.expanduser("~")
        preferred_path = os.path.join(home, "OneDrive - Instituto de Traumatologia y Enfermedades Oseas", "Archivos de Juan simon Astudilla - ITEO", "7 - PREQUIRÚRGICOS")
        if os.path.exists(os.path.dirname(preferred_path)):
            output_dir = preferred_path
        else:
            output_dir = os.path.join(home, "Documents", "ITEO_Prequirurgicos")
            
    os.makedirs(output_dir, exist_ok=True)
    report_progress(5, f"Directorio de destino configurado: {output_dir}")
    log(f"Directorio de destino configurado: {output_dir} | Visual: {show_browser}")
    
    results = {
        "timestamp": datetime.now().isoformat(),
        "patient": patient_name,
        "lab_date": lab_date,
        "ecg_date": ecg_date,
        "output_dir": output_dir,
        "ecg": None,
        "laboratory": None,
        "downloaded_files": []
    }
    
    # Si show_browser está activado, ejecutar laboratorios web PRIMERO para que el usuario observe el navegador de inmediato
    if show_browser:
        try:
            with sync_playwright() as playwright:
                lab_res = collect_lab_nanni(playwright, patient_name, lab_date, output_dir, show_browser=show_browser)
                if not lab_res.get("success"):
                    log("Laboratorio no encontrado en Nanni. Intentando con IPHH...")
                    lab_res = collect_lab_iphh(playwright, patient_name, lab_date, output_dir, patient_dni=patient_dni, show_browser=show_browser)
                    
                results["laboratory"] = lab_res
                if lab_res.get("file"):
                    results["downloaded_files"].append(lab_res["file"])
        except Exception as e:
            log(f"Error en navegador Playwright para laboratorio: {e}")
            report_progress(70, "Error en Playwright al buscar laboratorios.")
            results["laboratory"] = {"success": False, "error": str(e), "message": "No se pudo acceder a los portales de laboratorio."}

        # 2. Búsqueda y Descarga de ECG
        report_progress(75, "Conectando al correo para buscar ECG...")
        ecg_res = collect_ecg(patient_name, ecg_date, output_dir)
        results["ecg"] = ecg_res
        if ecg_res.get("files"):
            results["downloaded_files"].extend(ecg_res["files"])
    else:
        # Modo estándar en background: ECG primero y luego laboratorios
        ecg_res = collect_ecg(patient_name, ecg_date, output_dir)
        results["ecg"] = ecg_res
        if ecg_res.get("files"):
            results["downloaded_files"].extend(ecg_res["files"])
            
        try:
            with sync_playwright() as playwright:
                lab_res = collect_lab_nanni(playwright, patient_name, lab_date, output_dir, show_browser=show_browser)
                if not lab_res.get("success"):
                    log("Laboratorio no encontrado en Nanni. Intentando con IPHH...")
                    lab_res = collect_lab_iphh(playwright, patient_name, lab_date, output_dir, patient_dni=patient_dni, show_browser=show_browser)
                    
                results["laboratory"] = lab_res
                if lab_res.get("file"):
                    results["downloaded_files"].append(lab_res["file"])
        except Exception as e:
            log(f"Error en navegador Playwright para laboratorio: {e}")
            report_progress(95, "Error en Playwright al buscar laboratorios.")
            results["laboratory"] = {"success": False, "error": str(e), "message": "No se pudo acceder a los portales de laboratorio."}

    # Salida final JSON
    report_progress(100, "Proceso de recolección de prequirúrgicos completado.")
    log("Proceso de recolección de prequirúrgicos finalizado.")
    print("===RESULT_JSON_START===")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print("===RESULT_JSON_END===")

if __name__ == "__main__":
    main()
