---
name: Pruebas de Aplicaciones Web (Webapp Testing)
description: Herramientas para interactuar y probar aplicaciones web locales usando Playwright. Permite verificar funcionalidad, depurar la UI y capturar errores.
---

# Habilidad: Pruebas de Aplicaciones Web

Esta habilidad te permite automatizar la interacción con aplicaciones web que se estén ejecutando localmente. Es ideal para pruebas E2E (End-to-End) y depuración visual.

## Instrucciones de Uso

Para probar aplicaciones locales, se deben escribir scripts de Python utilizando la biblioteca **Playwright**.

### 1. Gestión del Servidor
Si la aplicación no está encendida, utiliza el script de ayuda incluido para gestionar el ciclo de vida del servidor:
- Ubicación: `scripts/with_server.py`
- Uso: `python scripts/with_server.py --server "comando_para_iniciar" --port puerto -- python tu_script.py`

### 2. Estrategia de Prueba (Reconocimiento y Acción)
No intentes adivinar los selectores. Sigue este flujo:
1. **Navegar**: Ve a la URL de localhost y espera a que el estado sea `networkidle`.
2. **Inspeccionar**: Toma una captura de pantalla o extrae el HTML si no estás seguro de los IDs o clases.
3. **Actuar**: Usa los selectores identificados para hacer clic, escribir o validar textos.

### 3. Código Base Recomendado (Python)
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:3000') # Cambiar al puerto correcto
    page.wait_for_load_state('networkidle')
    
    # Ejemplo de interacción
    # page.click('button#login')
    # expect(page.locator('.welcome-message')).to_be_visible()
    
    # Depuración: tomar captura en caso de duda
    page.screenshot(path='debug_screen.png')
    
    browser.close()
```

## Buenas Prácticas
- **Espera Activa**: Usa `page.wait_for_selector()` antes de interactuar con elementos que tardan en cargar.
- **Headless**: Siempre lanza el navegador en modo `headless=True` a menos que necesites ver la interacción (no disponible en todos los entornos).
- **Limpieza**: Asegúrate de que el script siempre cierre el navegador al terminar.

## Ejemplo de comando
"Verifica que el formulario de contacto en localhost:5173 envíe los datos correctamente."
