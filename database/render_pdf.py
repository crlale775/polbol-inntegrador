"""
OFBOL — Rasterizador de páginas PDF a PNG (usado por PdfPaginas.php)
Requiere: pip install pymupdf   (importa como 'fitz' o 'pymupdf')
         y  pip install pillow   (solo si el PDF trae fotos/escaneos embebidos)

Uso: python render_pdf.py <archivo.pdf> <carpeta_salida> [max_paginas] [dpi] [max_lado] [recortes]
Salida: JSON {"ok": true, "paginas": n, "archivos": ["pagina_1.png", ...]}

Por cada página genera (orden de lectura natural):
  * pagina_N.png            → vista completa de la página rasterizada a `dpi` y
                              reducida con LANCZOS a `max_lado` px de lado
                              mayor. Los tokens de visión crecen con los
                              píxeles: 1100 px ≈ 280 tokens frente a ~690 a
                              150 DPI, así que el recorte es el mayor ahorro
                              de tiempo del pipeline.
  * pagina_N_c1_1.png ...   → recortes 2x2 con solape (SOLO si recortes=1).
                              El pipeline de una sola pasada ya no los usa:
                              rasterizarlos cuesta ~1 s por documento.

Cuando la página es un ESCANEO/FOTO embebida a alta resolución (caso real de
los memos fotografiados), los recortes se generan a partir de la imagen
ORIGINAL (resolución nativa), no de un re-rasterizado que la degradaría.
"""
import json
import os
import sys

try:
    import pymupdf as fitz  # PyMuPDF >= 1.24
except ImportError:
    try:
        import fitz  # PyMuPDF legacy
    except ImportError:
        fitz = None  # el error real se reporta en main()


def _cargar_pil():
    try:
        from PIL import Image  # noqa: F401
        return Image
    except ImportError:
        return None


def main() -> int:
    # Windows usa cp1252 por defecto en stdout: los acentos del texto del PDF
    # salían como bytes inválidos y json_decode() de PHP fallaba (el encabezado
    # quedaba "ilegible" y se perdía el descarte temprano).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Argumentos insuficientes"}))
        return 1

    pdf_path = sys.argv[1]
    out_dir = sys.argv[2]
    max_paginas = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 150
    max_lado = int(sys.argv[5]) if len(sys.argv) > 5 else 1100
    recortes = bool(int(sys.argv[6])) if len(sys.argv) > 6 else True

    if fitz is None:
        print(json.dumps({"ok": False, "error": "NO_PYMUPDF"}))
        return 3

    if not os.path.isfile(pdf_path):
        print(json.dumps({"ok": False, "error": "Archivo PDF no existe"}))
        return 2

    os.makedirs(out_dir, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
        paginas = min(doc.page_count, max_paginas)
        archivos = []

        for i in range(paginas):
            pagina = doc[i]
            ancho, alto = pagina.rect.width, pagina.rect.height

            # 1) Vista completa: se rasteriza a `dpi` y se reduce con LANCZOS a
            #    `max_lado` px. Rasterizar nítido y reducir da mejor OCR que
            #    rasterizar directo a baja resolución (mismos tokens, más
            #    legibilidad). Sin Pillow se calcula la escala directamente.
            nombre_ctx = f"pagina_{i + 1}.png"
            imagen_ctx = _vista_completa(pagina, dpi, max_lado)
            if imagen_ctx is not None:
                imagen_ctx.save(os.path.join(out_dir, nombre_ctx))
            else:
                escala_ctx = max_lado / max(ancho, alto)
                ctx = pagina.get_pixmap(matrix=fitz.Matrix(escala_ctx, escala_ctx))
                ctx.save(os.path.join(out_dir, nombre_ctx))
            archivos.append(nombre_ctx)

            if not recortes:
                continue

            # 2) ¿El documento es una foto/escaneo embebido a alta resolución?
            foto_nativa = _foto_nativa(pagina, doc, ancho, alto)

            if foto_nativa is not None and _cargar_pil() is not None:
                # Recortes desde la imagen original. Los recortes NO se usan en
                # la revisión en vivo (la lectura es de una sola pasada), así
                # que aquí se privilegia el OCR de escaneos: 1300 px de ancho.
                _crops_desde_pil(foto_nativa, i, out_dir, archivos, ancho_max=1300)
            else:
                # Recortes vectoriales (con factor de zoom extra para legibilidad)
                _crops_vectoriales(pagina, i, out_dir, archivos, dpi, ancho, alto)

        doc.close()
        print(json.dumps({"ok": True, "paginas": paginas, "archivos": archivos}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


def _vista_completa(pagina, dpi, max_lado):
    """Página completa rasterizada a `dpi` y reducida a `max_lado` px.

    Devuelve una imagen PIL RGB, o None si Pillow no está instalado (en ese
    caso main() rasteriza con la escala calculada, sin reducción).
    """
    Image = _cargar_pil()
    if Image is None:
        return None
    try:
        # Conservar los DPI habituales y el supermuestreo; una página con
        # dimensiones extremas no debe crear un bitmap gigante para terminar
        # reduciéndolo a 1280 px. El original PDF permanece intacto.
        escala = min(max(dpi / 72.0, 0.5), 2 * max_lado / max(pagina.rect.width, pagina.rect.height))
        pix = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

        lado_mayor = max(img.size)
        if lado_mayor > max_lado:
            ratio = max_lado / lado_mayor
            img = img.resize(
                (max(1, int(img.width * ratio)), max(1, int(img.height * ratio))),
                Image.LANCZOS,
            )

        return img
    except Exception:  # noqa: BLE001
        return None


def _foto_nativa(pagina, doc, ancho_pag, alto_pag):
    """Devuelve una imagen RGB PIL (nativa) si la página es un escaneo/foto
    que ocupa casi toda la hoja; si no, None."""
    try:
        imagenes = pagina.get_images(full=True)
        if not imagenes:
            return None
        mejor = None
        for info in imagenes:
            xref = info[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:  # noqa: BLE001
                continue
            if pix.colorspace is not None and pix.n - pix.alpha >= 3:
                try:
                    if pix.colorspace.name != "DeviceRGB":
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                except Exception:  # noqa: BLE001
                    continue
            # Un escaneo/foto real de página completa suele superar 1MP;
            # un logo pequeño o membrete no debe confundirse con el documento.
            if pix.width >= 900 and pix.height >= 700 and pix.width * pix.height >= 900_000:
                if mejor is None or pix.width * pix.height > mejor.width * mejor.height:
                    mejor = pix
        if mejor is None:
            return None

        Image = _cargar_pil()
        if mejor.alpha:
            modo = "RGBA"
        else:
            modo = "RGB"
        img = Image.frombytes(modo, (mejor.width, mejor.height), mejor.samples)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Ajustar rotación según la página (fotos con EXIF girado)
        rot = (pagina.rotation or 0) % 360
        if rot == 90:
            img = img.transpose(Image.ROTATE_270)
        elif rot == 180:
            img = img.transpose(Image.ROTATE_180)
        elif rot == 270:
            img = img.transpose(Image.ROTATE_90)

        return img
    except Exception:  # noqa: BLE001
        return None


def _crops_desde_pil(img, n_pag, out_dir, archivos, ancho_max=1300):
    """Recortes 2x2 (con solape) desde la imagen nativa.

    Con el modelo único qwen2.5-vl-7b los recortes van a ancho_max px: más
    píxeles = mejor OCR de memos fotografiados, a un costo de vision tokens
    razonable. La vista completa sigue a media resolución (pesa poco).
    """
    Image = _cargar_pil()
    w, h = img.size
    if w > ancho_max:
        ratio = ancho_max / w
        img = img.resize((ancho_max, int(h * ratio)), Image.LANCZOS)
        w, h = img.size
    ovl_x = int(w * 0.08)
    ovl_y = int(h * 0.08)
    filas = [(0, h // 2 + ovl_y), (h // 2 - ovl_y, h)]
    cols = [(0, w // 2 + ovl_x), (w // 2 - ovl_x, w)]
    for f, (y0, y1) in enumerate(filas, start=1):
        for c, (x0, x1) in enumerate(cols, start=1):
            crop = img.crop((x0, y0, x1, y1))
            nombre = f"pagina_{n_pag + 1}_c{f}_{c}.png"
            crop.save(os.path.join(out_dir, nombre))
            archivos.append(nombre)


def _crops_vectoriales(pagina, n_pag, out_dir, archivos, dpi, ancho, alto):
    """Recortes 2x2 con solape desde el render vectorial a DPI completo."""
    escala = dpi / 72.0
    ovl_x = ancho * 0.08
    ovl_y = alto * 0.08
    filas = [(0, alto / 2.0 + ovl_y), (alto / 2.0 - ovl_y, alto)]
    cols = [(0, ancho / 2.0 + ovl_x), (ancho / 2.0 - ovl_x, ancho)]
    for f, (y0, y1) in enumerate(filas, start=1):
        for c, (x0, x1) in enumerate(cols, start=1):
            clip = fitz.Rect(x0, y0, x1, y1)
            pix = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala), clip=clip)
            nombre = f"pagina_{n_pag + 1}_c{f}_{c}.png"
            pix.save(os.path.join(out_dir, nombre))
            archivos.append(nombre)


if __name__ == "__main__":
    sys.exit(main())
