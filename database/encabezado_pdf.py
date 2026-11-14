"""
OFBOL — Lector del ENCABEZADO de la primera página de un PDF.

Se usa para el pre-filtro local del memorándum: si el documento no empieza con
"MEMORÁNDUM" se descarta de inmediato, sin gastar consultas de visión.

Uso: python encabezado_pdf.py <archivo.pdf> <salida.png>

Salida: JSON por stdout
  {"ok": true, "fuente": "franja|pagina|imagen", "texto": "...", "imagen": "<ruta.png>|null"}
  {"ok": false, "error": "..."}

* Si la franja superior tiene capa de texto se devuelve ese texto (coste 0 de IA).
* Si el PDF es un escaneo/foto (sin texto) se rasteriza SOLO la franja superior
  a baja resolución y se devuelve la ruta del PNG (barato: ~1/4 de la página).
"""

import json
import sys

try:
    import pymupdf as fitz  # PyMuPDF >= 1.24
except ImportError:
    try:
        import fitz  # PyMuPDF legacy
    except ImportError:
        fitz = None

# Proporción de la altura de la página que se considera "encabezado".
FRACCION = 0.34
# DPI de la franja: suficiente para leer el título y muy barato en tokens.
DPI = 130
# Si la franja trae menos texto que esto, se prueba con toda la página.
MIN_TEXTO = 25


def main() -> int:
    # Windows usa cp1252 por defecto en stdout: los acentos del texto del PDF
    # salían como bytes inválidos y json_decode() de PHP fallaba (el encabezado
    # quedaba "ilegible" y se perdía el descarte temprano).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "uso: encabezado_pdf.py <pdf> <salida.png>"}))
        return 2

    pdf, salida = sys.argv[1], sys.argv[2]
    # En escaneos, preparar la página que YA necesita la revisión completa.
    # Evita abrir otro proceso Python y rasterizar una franja que no se usará.
    pagina_completa = len(sys.argv) > 3 and sys.argv[3] == "pagina"
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 150
    max_lado = int(sys.argv[5]) if len(sys.argv) > 5 else 1280

    if fitz is None:
        print(json.dumps({"ok": False, "error": "PyMuPDF no está instalado (python -m pip install pymupdf)"}))
        return 3

    try:
        doc = fitz.open(pdf)
        if doc.page_count == 0:
            print(json.dumps({"ok": False, "error": "El PDF no tiene páginas"}))
            return 4

        page = doc.load_page(0)
        rect = page.rect
        franja = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + rect.height * FRACCION)

        texto_franja = (page.get_text("text", clip=franja) or "").strip()

        if len(texto_franja) >= MIN_TEXTO:
            print(json.dumps(
                {"ok": True, "fuente": "franja", "texto": texto_franja[:4000], "imagen": None},
                ensure_ascii=False,
            ))
            return 0

        # Sin capa de texto utilizable: la página entera podría tener texto
        # (membrete escaneado + cuerpo digital, por ejemplo).
        texto_pagina = (page.get_text("text") or "").strip()
        if len(texto_pagina) >= MIN_TEXTO:
            print(json.dumps(
                {"ok": True, "fuente": "pagina", "texto": texto_pagina[:4000], "imagen": None},
                ensure_ascii=False,
            ))
            return 0

        if pagina_completa:
            # Mismo rasterizador, DPI y reducción LANCZOS de la lectura normal:
            # la optimización no reduce los detalles enviados al modelo.
            from render_pdf import _vista_completa
            imagen = _vista_completa(page, dpi, max_lado)
            if imagen is None:
                escala = max_lado / max(rect.width, rect.height)
                page.get_pixmap(matrix=fitz.Matrix(escala, escala)).save(salida)
            else:
                imagen.save(salida)
        else:
            pix = page.get_pixmap(clip=franja, dpi=DPI)
            pix.save(salida)
        print(json.dumps(
            {"ok": True, "fuente": "imagen", "texto": "", "imagen": salida,
             "pagina_completa": pagina_completa},
            ensure_ascii=False,
        ))
        return 0

    except Exception as e:  # noqa: BLE001 — el error se reporta en JSON
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 5


if __name__ == "__main__":
    sys.exit(main())
