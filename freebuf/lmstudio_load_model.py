"""OFBOL — Reaplica la config de carga del modelo IA en LM Studio.

LM Studio NO persiste la config de carga personalizada tras un reinicio
(vuelve a parallel=4 con slots de 2048 tokens, que desperdicia VRAM y
contexto). Este script espera a que el servidor este disponible y vuelve
a cargar qwen2.5-vl-3b-instruct con la config optimizada para este equipo
(RTX 3050 Laptop 4 GB VRAM + Ryzen 9 6900HS + 27.7 GB RAM).

PARAMETROS QUE USA EL SISTEMA (medidos en este equipo):
  - context_length 4096 : cabe una pagina a 1280 px (~1900 tokens) + la
    respuesta JSON. Con 2048 el JSON se truncaba; con 8192 el KV cache no
    entra en 4 GB de VRAM y el modelo cae a CPU.
  - parallel 1         : una consulta a la vez (no divide el contexto).
  - GPU offload maximo : el 3B Q4_K_M (1.9 GB) + mmproj (1.3 GB) entran
    completos en la GPU. Debe verse ~3.8 GB de VRAM usada en nvidia-smi.
  - flash_attention    : ON.
  - TTL 3600 s         : el modelo queda cargado y la primera consulta no
    paga los ~10 s de carga de pesos.

IMPORTANTE: si la VRAM muestra ~60 MB y las consultas tardan 30-60 s, LM
Studio esta corriendo en CPU. Revise el runtime seleccionado
(`lms runtime ls`): la version 2.61.0 del engine CUDA no detecta la GPU en
este equipo; use 2.60.0 o anterior.

Uso:
    python lmstudio_load_model.py [--espera N]
    (--espera N = segundos maximos de espera al servidor; default 300)
"""
import json
import sys
import time
import urllib.request

URL_BASE = "http://127.0.0.1:1234"
MODELO = "qwen2.5-vl-3b-instruct"

# Config optimizada para RTX 3050 4 GB (ver freebuf/cambios.txt)
CONFIG = {
    "context_length": 4096,
    "parallel": 1,
    "flash_attention": True,
    "offload_kv_cache_to_gpu": True,
}


def _post(ruta, cuerpo, timeout=300):
    peticion = urllib.request.Request(
        URL_BASE + ruta,
        data=json.dumps(cuerpo).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(peticion, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _get(ruta, timeout=10):
    with urllib.request.urlopen(URL_BASE + ruta, timeout=timeout) as r:
        return json.loads(r.read().decode())


def estado_carga():
    """Devuelve (ok: bool, estado: str, instancias: list).

    IMPORTANTE: LM Studio permite cargar VARIAS instancias del mismo modelo
    (p.ej. la buena + otra parallel=4 tras un reinicio): eso divide la VRAM.
    Solo se considera OK si hay EXACTAMENTE una instancia con la config optima.
    """
    try:
        datos = _get("/api/v1/models")
    except Exception:
        return False, "servidor-no-disponible", []
    instancias = []
    for m in datos.get("models", []):
        if m.get("key") != MODELO:
            continue
        # Cada instancia tiene un id unico: "qwen/qwen2.5-vl-7b", ":2", ":3"...
        instancias = list(m.get("loaded_instances", []))
        break
    if len(instancias) == 0:
        return False, "catalogado-sin-cargar", instancias
    if len(instancias) > 1:
        return False, "multi-instancia(%d)" % len(instancias), instancias
    c = instancias[0].get("config", {})
    if c.get("parallel") == 1 and c.get("context_length") == 4096:
        return True, "ya-cargado-config-correcta", instancias
    return False, "cargado-config-vieja(parallel=%s)" % c.get("parallel"), instancias


def esperar_servidor(segundos_max):
    """Espera hasta que el servidor responda /api/v1/models."""
    inicio = time.time()
    while time.time() - inicio < segundos_max:
        ok, estado, _ = estado_carga()
        if estado != "servidor-no-disponible":
            return True
        time.sleep(5)
    return False


def limpiar_todas():
    """Descarga TODAS las instancias del modelo. Cada una tiene un id unico
    (p.ej. "qwen/qwen2.5-vl-7b:2"); el unload exige ese id exacto.
    Devuelve True solo si al final quedan 0 instancias."""
    for _ in range(10):
        ok, estado, instancias = estado_carga()
        if len(instancias) == 0:
            return True
        descargadas = 0
        for inst in instancias:
            iid = inst.get("id") or MODELO
            try:
                _post("/api/v1/models/unload", {"instance_id": iid}, timeout=60)
                print("[..] unload %s OK" % iid)
                descargadas += 1
            except Exception as e:
                print("[..] unload %s fallo: %s" % (iid, e))
        time.sleep(3 if descargadas else 5)
    return len(estado_carga()[2]) == 0


# Imagen sintética del tamaño real de trabajo (A4 vertical a 1280 px de lado
# mayor). El calentamiento debe usar EL MISMO tamaño que los documentos: si se
# calienta con una imagen pequeña, la primera consulta real sigue pagando el
# costo de inicializar el codificador de visión para 1280 px.
ANCHO_CALENTAMIENTO = 904
ALTO_CALENTAMIENTO = 1280

PROMPT_CALENTAMIENTO = (
    "Documento escaneado de la Policia Boliviana. "
    'Responde UNICAMENTE con JSON valido: {"es_memo": true, "tipo": null, '
    '"destinatario": null, "fecha": null, "firma": false, "sello": false}.'
)


def calentar():
    """Hace UNA consulta de visión descartable con una imagen del tamaño real.

    La primera inferencia después de cargar el modelo paga la inicialización del
    codificador de visión y de las gráficas CUDA (~3-4 s extra). Sin este paso,
    esa penalización la sufre el primer secretario que sube un memo y la
    revisión se acerca al tope de 10 s. Con el calentamiento, todas las
    consultas reales arrancan en régimen.
    """
    try:
        import base64
        import io

        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        print("[..] Sin Pillow: se omite el calentamiento.")
        return

    img = Image.new("RGB", (ANCHO_CALENTAMIENTO, ALTO_CALENTAMIENTO), (252, 250, 245))
    dibujo = ImageDraw.Draw(img)
    dibujo.rectangle([0, 0, ANCHO_CALENTAMIENTO - 1, ALTO_CALENTAMIENTO - 1], outline=(60, 60, 60), width=2)
    dibujo.text((40, 40), "MEMORANDUM", fill=(20, 20, 20))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    inicio = time.time()
    try:
        _post(
            "/api/v1/chat",
            {
                "model": MODELO,
                "temperature": 0,
                "max_output_tokens": 32,
                "input": [
                    {"type": "text", "content": PROMPT_CALENTAMIENTO},
                    {"type": "image", "data_url": data_url},
                ],
            },
            timeout=180,
        )
        print("[OK] Calentamiento completado en %.1fs." % (time.time() - inicio))
    except Exception as e:  # noqa: BLE001
        print("[..] Calentamiento fallo (no bloqueante): %s" % e)


def recargar():
    """Deja el modelo con EXACTAMENTE una instancia con la config optima."""
    ok, estado, _ = estado_carga()
    if ok:
        print("[OK] %s: %s" % (MODELO, estado))
        if "--calentar" in sys.argv:
            calentar()
        return 0
    print("[..] Estado: %s" % estado)

    if not limpiar_todas():
        print("[ERROR] No se pudo dejar el modelo descargado; no se carga encima.")
        return 1

    cuerpo = {"model": MODELO}
    cuerpo.update(CONFIG)
    r = _post("/api/v1/models/load", cuerpo)
    print("[OK] Cargado en %.1fs (status: %s)" % (r.get("load_time_seconds", -1), r.get("status")))

    ok, estado, _ = estado_carga()
    if ok:
        print("[OK] Verificado: %s" % estado)
        calentar()
        return 0
    print("[ERROR] La verificacion post-carga fallo: %s" % estado)
    return 1


def main():
    espera_max = 300
    if "--espera" in sys.argv:
        try:
            espera_max = int(sys.argv[sys.argv.index("--espera") + 1])
        except (IndexError, ValueError):
            pass

    print("Esperando a LM Studio en %s (max %ds)..." % (URL_BASE, espera_max))
    if not esperar_servidor(espera_max):
        print("[ERROR] Timeout esperando al servidor de LM Studio.")
        return 1
    print("[..] Servidor disponible.")
    return recargar()


if __name__ == "__main__":
    sys.exit(main())
