import os
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
HASH_BASE = f"{BASE_URL}/#"
SCREENSHOT_DIR = "verification_screenshots"

if not os.path.exists(SCREENSHOT_DIR):
    os.makedirs(SCREENSHOT_DIR)

def take_screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    page.screenshot(path=path)
    print(f"Screenshot saved: {path}", flush=True)

def test_filtering():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # --- TEST ADMIN ---
        print("\n--- TESTING ADMIN ---", flush=True)
        admin_context = browser.new_context()
        admin_page = admin_context.new_page()
        admin_page.on("console", lambda msg: print(f"ADMIN BROWSER: {msg.text}", flush=True))
        
        admin_page.goto(BASE_URL)
        admin_page.wait_for_load_state("networkidle")
        
        def handle_admin_dialog(dialog):
            dialog.accept("admin@hospital.med")
        admin_page.on("dialog", handle_admin_dialog)
        admin_page.click('div[title="Iniciar Sesión (Simulado)"]')
        admin_page.wait_for_timeout(3000)
        
        admin_user = admin_page.locator('p.text-sm.font-medium.truncate').inner_text()
        print(f"Logged in as: {admin_user}", flush=True)
        take_screenshot(admin_page, "01_admin_dashboard")

        # Admin List
        admin_page.goto(f"{HASH_BASE}/surgeries")
        admin_page.wait_for_selector("table", timeout=15000)
        admin_rows = admin_page.locator("table tbody tr").count()
        print(f"Surgeries visible for Admin: {admin_rows}", flush=True)
        take_screenshot(admin_page, "02_admin_list")
        
        # Admin Calendar
        admin_page.goto(f"{HASH_BASE}/calendar")
        admin_page.wait_for_load_state("networkidle")
        admin_page.wait_for_timeout(3000)
        admin_events = admin_page.locator(".fc-event").count()
        print(f"Calendar events for Admin: {admin_events}", flush=True)
        take_screenshot(admin_page, "03_admin_calendar")
        
        admin_context.close()

        # --- TEST DR. GOLPE ---
        print("\n--- TESTING DR. GOLPE ---", flush=True)
        golpe_context = browser.new_context()
        golpe_page = golpe_context.new_page()
        golpe_page.on("console", lambda msg: print(f"GOLPE BROWSER: {msg.text}", flush=True))
        
        golpe_page.goto(BASE_URL)
        golpe_page.wait_for_load_state("networkidle")
        
        def handle_golpe_dialog(dialog):
            dialog.accept("golpe.lucio.martin@hospital.med")
        golpe_page.on("dialog", handle_golpe_dialog)
        golpe_page.click('div[title="Iniciar Sesión (Simulado)"]')
        golpe_page.wait_for_timeout(3000)
        
        golpe_user = golpe_page.locator('p.text-sm.font-medium.truncate').inner_text()
        print(f"Logged in as: {golpe_user}", flush=True)
        take_screenshot(golpe_page, "04_golpe_dashboard")

        # GOLPE List (Filtered)
        golpe_page.goto(f"{HASH_BASE}/surgeries")
        golpe_page.wait_for_selector("table", timeout=15000)
        golpe_rows = golpe_page.locator("table tbody tr").count()
        print(f"Surgeries visible for Dr. GOLPE: {golpe_rows}", flush=True)
        take_screenshot(golpe_page, "05_golpe_list")
        
        # GOLPE Calendar (Anonymized)
        golpe_page.goto(f"{HASH_BASE}/calendar")
        golpe_page.wait_for_load_state("networkidle")
        golpe_page.wait_for_timeout(3000)
        take_screenshot(golpe_page, "06_golpe_calendar")
        
        own_visible = golpe_page.locator("text=Cirugía de GOLPE").is_visible()
        others_blocked = golpe_page.locator("text=Quirófano Ocupado").is_visible()
        print(f"Sees own surgery detail: {own_visible}", flush=True)
        print(f"Sees 'Quirófano Ocupado' for others: {others_blocked}", flush=True)

        # Sidebar Restrictions
        has_audit = golpe_page.locator('a[href="#/audit"]').is_visible()
        has_results = golpe_page.locator('a[href="#/results"]').is_visible()
        print(f"Sidebar (Medico): Auditoría visible: {has_audit}, Resultados visible: {has_results}", flush=True)

        golpe_context.close()
        browser.close()
        print("\n--- VERIFICATION COMPLETE ---", flush=True)

if __name__ == "__main__":
    test_filtering()
