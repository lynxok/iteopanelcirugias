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

def is_name_matching(target_name, test_string):
    """Verifica si los componentes del nombre y apellido se encuentran en la cadena"""
    norm_target = normalize_text(target_name)
    norm_test = normalize_text(test_string)
    if norm_target in norm_test:
        return True
    # Evaluar tokens individuales (ej: apellido y nombre por separado)
    tokens = [normalize_text(w) for w in re.split(r'\s+|,', target_name) if len(w) > 2]
    if tokens and all(tok in norm_test for tok in tokens):
        return True
    return False

def collect_ecg(patient_name, ecg_date_str, output_dir):
    """
    Descarga los ECGs desde prequirurgico@iteosrl.com.ar via IMAP
    """
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
            return {"success": False, "files": [], "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}
        
        msg_ids = data[0].split()
        log(f"Analizando {len(msg_ids)} correos dentro del rango de fechas...")
        
        # Recorrer del más reciente al más antiguo
        for mid in reversed(msg_ids):
            status, msg_data = M.fetch(mid, "(RFC822)")
            if status != "OK" or not msg_data:
                continue
                
            for part in msg_data:
                if isinstance(part, tuple):
                    msg = email.message_from_bytes(part[1])
                    subject = decode_mime_words(msg.get("Subject", ""))
                    date_val = msg.get("Date", "")
                    
                    # Chequear asunto o adjuntos
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
                        log(f"¡Correo encontrado! Asunto: '{subject}' | Fecha: {date_val}")
                        for fname, content in matching_attachments:
                            # Asegurar nombre limpio y único
                            safe_name = f"ECG_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}_{fname}"
                            dest_path = os.path.join(output_dir, safe_name)
                            with open(dest_path, "wb") as f:
                                f.write(content)
                            downloaded_files.append(dest_path)
                            log(f"Guardado adjunto ECG: {safe_name}")
                            
        M.close()
        M.logout()
        
        if downloaded_files:
            return {"success": True, "files": downloaded_files, "message": f"Se descargaron {len(downloaded_files)} archivo(s) de ECG con éxito."}
        else:
            return {"success": False, "files": [], "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}

    except Exception as e:
        log(f"Error procesando correo ECG: {e}")
        return {"success": False, "files": [], "error": str(e), "message": "El informe del ECG aún no se encuentra disponible, comunicarse con el cardiólogo que lo realizó."}

def collect_lab_nanni(playwright, patient_name, lab_date_str, output_dir):
    """
    Intenta buscar y descargar el laboratorio desde Lab Nanni
    """
    log("Intentando buscar en Lab Nanni...")
    try:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        url = "https://resultados.labnanni.com.ar/shift/lis/nanni/elis/s01.iu.web.Login.cls?config=IBP"
        page.goto(url, timeout=30000)
        
        # Login
        user_inp = page.locator("input#control_42")
        pass_inp = page.locator("input#control_45")
        user_inp.fill("ITEO")
        pass_inp.fill("664HB")
        page.locator("input#control_56").click() # Botón Entrar
        
        page.wait_for_load_state("networkidle", timeout=15000)
        log("Sesión iniciada en Lab Nanni. Buscando fechas y paciente...")
        
        # Formatear fecha para el período
        # Esperado habitual en Nanni: dd/mm/yyyy
        if "-" in lab_date_str:
            d_parts = lab_date_str.strip().split("-")
            formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
        else:
            formatted_date = lab_date_str.strip()
            
        # Buscar inputs de fecha de período
        date_inputs = page.locator("input[type='text']:visible").all()
        for dinp in date_inputs:
            # Los dos primeros suelen ser De / Hasta
            val = dinp.get_attribute("value") or ""
            if len(val) >= 8 or dinp.get_attribute("id") in ["control_68", "control_69"]:
                dinp.fill(formatted_date)
                
        # Clic en Pesquisar / Buscar
        btn_buscar = page.locator("input[value*='Pesquisar'], input[value*='Buscar'], #control_73").first
        if btn_buscar.count():
            btn_buscar.click()
            page.wait_for_timeout(3000)
            
        # Buscar al paciente en la tabla de resultados
        norm_target = normalize_text(patient_name)
        rows = page.locator("tr").all()
        matched_row = None
        
        for r in rows:
            txt = r.inner_text()
            if is_name_matching(patient_name, txt):
                matched_row = r
                log(f"Fila encontrada en Nanni: {txt[:80]}...")
                break
                
        if not matched_row:
            log(f"Paciente '{patient_name}' no encontrado en resultados de Nanni.")
            browser.close()
            return {"success": False, "file": None}
            
        # Clic en la lupa de la fila
        lupa = matched_row.locator("img, a, input[type='image'], [title*='Visualizar'], [title*='Ver'], .lupa").first
        if lupa.count():
            lupa.click()
        else:
            matched_row.click()
            
        page.wait_for_timeout(3000)
        
        # Clic en 'Imprimir resultado'
        btn_imprimir = page.locator("text='Imprimir resultado', text='Imprimir', [title*='Imprimir']").first
        if btn_imprimir.count():
            with page.expect_download(timeout=15000) as download_info:
                btn_imprimir.click()
            download = download_info.value
            clean_name = f"LAB_NANNI_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}.pdf"
            dest_file = os.path.join(output_dir, clean_name)
            download.save_as(dest_file)
            log(f"¡Laboratorio Nanni descargado con éxito!: {dest_file}")
            browser.close()
            return {"success": True, "file": dest_file, "source": "Lab Nanni"}
            
        browser.close()
        return {"success": False, "file": None}
    except Exception as e:
        log(f"Aviso durante búsqueda en Nanni: {e}")
        try:
            browser.close()
        except:
            pass
        return {"success": False, "file": None, "error": str(e)}

def collect_lab_iphh(playwright, patient_name, lab_date_str, output_dir):
    """
    Fallback: Búsqueda y descarga desde iphhconsultorio.dynu.net
    """
    log("Iniciando búsqueda en portal secundario IPHH (dynu.net)...")
    try:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        url = "https://iphhconsultorio.dynu.net/portal/login"
        page.goto(url, timeout=30000)
        
        # Perfil: Institución
        page.locator("select").first.select_option("institucion")
        
        # Usuario y Clave
        page.locator("input[placeholder='Usuario']").fill("ITEO")
        page.locator("input[placeholder='Clave']").fill("ITEO_26")
        
        # Submit
        page.locator("button, input[type='submit']").first.click()
        page.wait_for_load_state("networkidle", timeout=15000)
        log("Sesión iniciada en portal IPHH.")
        
        # Formatear fecha
        if "-" in lab_date_str:
            d_parts = lab_date_str.strip().split("-")
            formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
        else:
            formatted_date = lab_date_str.strip()
            
        # Campo de Fecha
        date_inp = page.locator("input[type='date'], input[placeholder*='Fecha'], input.fecha").first
        if date_inp.count():
            # Si es type="date" suele requerir YYYY-MM-DD
            if date_inp.get_attribute("type") == "date":
                if "/" in lab_date_str:
                    dp = lab_date_str.strip().split("/")
                    date_val = f"{dp[2]}-{dp[1]}-{dp[0]}"
                else:
                    date_val = lab_date_str.strip()
                date_inp.fill(date_val)
            else:
                date_inp.fill(formatted_date)
                
        # Clic Buscar
        btn_buscar = page.locator("button:has-text('Buscar'), input[value*='Buscar']").first
        if btn_buscar.count():
            btn_buscar.click()
            page.wait_for_timeout(3000)
            
        # Buscar al paciente en la lista/tabla
        rows = page.locator("tr, .card, .paciente-row").all()
        matched_elem = None
        for r in rows:
            txt = r.inner_text()
            if is_name_matching(patient_name, txt):
                matched_elem = r
                log(f"Fila encontrada en IPHH: {txt[:80]}...")
                break
                
        if not matched_elem:
            log(f"Paciente '{patient_name}' no encontrado en resultados de IPHH.")
            browser.close()
            return {"success": False, "file": None}
            
        # Clic sobre el paciente
        matched_elem.click()
        page.wait_for_timeout(2000)
        
        # Clic en Descargar PDF
        btn_descargar = page.locator("[title*='Descargar'], button:has-text('Descargar'), a:has-text('Descargar'), .fa-download").first
        if btn_descargar.count():
            with page.expect_download(timeout=15000) as download_info:
                btn_descargar.click()
            download = download_info.value
            clean_name = f"LAB_IPHH_{re.sub(r'[^a-zA-Z0-9_-]', '_', patient_name)}.pdf"
            dest_file = os.path.join(output_dir, clean_name)
            download.save_as(dest_file)
            log(f"¡Laboratorio IPHH descargado con éxito!: {dest_file}")
            browser.close()
            return {"success": True, "file": dest_file, "source": "IPHH"}
            
        browser.close()
        return {"success": False, "file": None}
    except Exception as e:
        log(f"Aviso durante búsqueda en IPHH: {e}")
        try:
            browser.close()
        except:
            pass
        return {"success": False, "file": None, "error": str(e)}

def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False, 
            "error": "Parámetros insuficientes. Uso: python prequirurgicos_collector.py <paciente> <fecha_lab> <fecha_ecg> [output_dir]"
        }))
        sys.exit(1)
        
    patient_name = sys.argv[1].strip()
    lab_date = sys.argv[2].strip()
    ecg_date = sys.argv[3].strip()
    
    # Directorio de salida por defecto o provisto
    if len(sys.argv) >= 5 and sys.argv[4].strip():
        output_dir = sys.argv[4].strip()
    else:
        # Ruta estándar sugerida o en OneDrive de ITEO / Documentos
        home = os.path.expanduser("~")
        preferred_path = os.path.join(home, "OneDrive - Instituto de Traumatologia y Enfermedades Oseas", "Archivos de Juan simon Astudilla - ITEO", "7 - PREQUIRÚRGICOS")
        if os.path.exists(os.path.dirname(preferred_path)):
            output_dir = preferred_path
        else:
            output_dir = os.path.join(home, "Documents", "ITEO_Prequirurgicos")
            
    os.makedirs(output_dir, exist_ok=True)
    log(f"Directorio de destino configurado: {output_dir}")
    
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
    
    # 1. Búsqueda y Descarga de ECG
    ecg_res = collect_ecg(patient_name, ecg_date, output_dir)
    results["ecg"] = ecg_res
    if ecg_res.get("files"):
        results["downloaded_files"].extend(ecg_res["files"])
        
    # 2. Búsqueda y Descarga de Laboratorio (Nanni -> Fallback IPHH)
    try:
        with sync_playwright() as playwright:
            lab_res = collect_lab_nanni(playwright, patient_name, lab_date, output_dir)
            if not lab_res.get("success"):
                log("Laboratorio no encontrado en Nanni. Intentando con IPHH...")
                lab_res = collect_lab_iphh(playwright, patient_name, lab_date, output_dir)
                
            results["laboratory"] = lab_res
            if lab_res.get("file"):
                results["downloaded_files"].append(lab_res["file"])
    except Exception as e:
        log(f"Error en navegador Playwright para laboratorio: {e}")
        results["laboratory"] = {"success": False, "error": str(e), "message": "No se pudo acceder a los portales de laboratorio."}

    # Salida final JSON
    log("Proceso de recolección de prequirúrgicos finalizado.")
    print("===RESULT_JSON_START===")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print("===RESULT_JSON_END===")

if __name__ == "__main__":
    main()
