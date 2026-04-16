# Guía de Accesibilidad (A11y) para Diseñadores

Un diseño que no es accesible no es un buen diseño.

## 🎨 Contraste (WCAG 2.1)
*   Texto normal: Mínimo 4.5:1.
*   Texto grande/Iconos: Mínimo 3:1.
*   *Tip Senior*: No uses solo el color para transmitir información (ej: rojo para error sin un icono o texto que lo indique).

## ⌨️ Navegación por Teclado
*   **Focus States**: El estado de enfoque debe ser altamente visible y estéticamente integrado.
*   Orden lógico de tabulación (`tabindex`).

## 🗣 Semántica y Lectores de Pantalla
*   Uso correcto de etiquetas `H1` a `H6`.
*   Atributos `aria-label` para botones que solo contienen iconos.
*   `alt` text descriptivo para imágenes funcionales.

## 🖱 Target Areas
*   Zonas de click/tap de al menos 44x44px en móviles para evitar frustración.
