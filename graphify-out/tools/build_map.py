"""Genera el mapa compacto de contexto (MD + HTML) desde la extracción."""
import json, sys, html, re
from collections import defaultdict
from pathlib import Path

ext = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
out = Path(sys.argv[2])
report = (out / "GRAPH_REPORT.md").read_text(encoding="utf-8")
N = {n["id"]: n for n in ext["nodes"]}
out_e, in_e = defaultdict(list), defaultdict(list)
for e in ext["edges"]:
    out_e[e["source"]].append(e)
    in_e[e["target"]].append(e)
L = lambda i: N[i]["label"]
F = lambda i: N[i]["source_file"]


def owner_class(mid):
    for e in in_e[mid]:
        if e["relation"] == "method":
            return e["source"]
    return None

md = []
w = md.append
w("# OFBOL — Mapa del proyecto (generado con Graphify)\n")
w("Pega este archivo (o el HTML) al inicio de cada chat para que Claude tenga el contexto del proyecto.")
w("Fuente completa e interactiva: `graphify-out/graph.html`, `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`.\n")
w("## Stack")
w("- Backend: Laravel 13 (PHP 8.3) · `app/Http/Controllers` (36) · `app/Models` (28) · `app/Services` (9) · middleware `SesionActiva`, `PermisosInstitucionales`, `SecurityHeaders`")
w("- Frontend: React SPA (Vite) montada desde `resources/js/app.jsx`; vistas en `resources/views/<rol>/*.jsx`; cliente HTTP `resources/js/lib/api.js` (base `/api`, CSRF por cookie XSRF)")
w("- `routes/web.php` sirve la SPA para cualquier ruta; toda la API vive en `routes/api.php` (rutas protegidas por sesión + permisos institucionales)")
w("- Roles: secretario_unidad (EPI) · secretario_comando_departamental · comando_general\n")

# ---- SPA
w("## Pantallas SPA → vista → endpoints que llama")
spa = sorted([n for n in N.values() if n.get("node_kind") == "spa_route"], key=lambda n: n["label"])
for s in spa:
    views = [e["target"] for e in out_e[s["id"]] if e["relation"] == "renders"]
    for v in views:
        apis = sorted({L(e["target"]) for e in out_e[v] if e["relation"] == "calls_api"})
        via = {}
        frontier, seen = [v], {v}
        for _ in range(2):
            nxt = []
            for f in frontier:
                for e in out_e[f]:
                    t = e["target"]
                    if "imports" in e["relation"] and t not in seen and not F(t).endswith("lib/api.js") and not re.search(r"(Layout|Shell|AuthContext|ToastEnVivo|AyudaSistema|CommandPalette)", F(t)):
                        seen.add(t); nxt.append(t)
                        for c in out_e[t]:
                            if c["relation"] == "calls_api" and L(c["target"]) not in apis:
                                via.setdefault(N[t]["label"], set()).add(L(c["target"]))
            frontier = nxt
        extra = "; ".join(f"vía {k}: {', '.join(sorted(x))}" for k, x in sorted(via.items()))
        w(f"- `{s['label'][9:]}` → `{F(v)}`" + (f" → {', '.join(apis)}" if apis else "") + (f" [{extra}]" if extra else ""))
w("")

# ---- API
w("## API: ruta → Controlador@método")
routes = sorted([n for n in N.values() if n.get("node_kind") == "api_route"], key=lambda n: n["label"].split(" ", 1)[1] + n["label"])
by_ctrl = defaultdict(list)
for r in routes:
    tgt = [e["target"] for e in out_e[r["id"]] if e["relation"] == "routes_to"]
    callers = sorted({Path(F(e["source"])).stem for e in in_e[r["id"]] if e["relation"] == "calls_api"})
    if tgt and tgt[0] in N:
        c = owner_class(tgt[0])
        by_ctrl[L(c) if c else "?"].append((r["label"], L(tgt[0]).split("::")[-1], callers))
for ctrl in sorted(by_ctrl):
    cid = [i for i, n in N.items() if n["label"] == ctrl and n["source_file"].startswith("app/Http/Controllers")]
    deps = sorted({L(e["target"]) for e in out_e[cid[0]] if e["relation"] == "uses"}) if cid else []
    w(f"### {ctrl}" + (f"  (usa: {', '.join(deps)})" if deps else ""))
    for lab, meth, callers in by_ctrl[ctrl]:
        w(f"- {lab} → `{meth}`" + (f"  ← {', '.join(callers)}" if callers else ""))
w("")

# ---- Modelos
w("## Modelos Eloquent → tabla y relaciones")
models = sorted([n for n in N.values() if n["source_file"].startswith("app/Models/") and n["id"].count("_") >= 2 and "::" not in n["label"] and not n["label"].endswith(".php")], key=lambda n: n["label"])
for m in models:
    tbl = [L(e["target"]).replace("tabla: ", "") for e in out_e[m["id"]] if e["relation"] == "maps_table"]
    rels = [f"{e['relation'].replace('eloquent_', '')} {L(e['target'])}" for e in out_e[m["id"]] if e["relation"].startswith("eloquent_")]
    w(f"- **{m['label']}**" + (f" (`{tbl[0]}`)" if tbl else "") + (": " + "; ".join(rels) if rels else ""))
w("")

# ---- Servicios
w("## Servicios (app/Services) → quién los usa")
for n in sorted(N.values(), key=lambda n: n["label"]):
    if n["source_file"].startswith("app/Services/") and "::" not in n["label"] and not n["label"].endswith(".php"):
        users = sorted({L(e["source"]) for e in in_e[n["id"]] if e["relation"] == "uses"})
        meths = [L(e["target"]).split("::")[-1] for e in out_e[n["id"]] if e["relation"] == "method"]
        w(f"- **{n['label']}** ({len(meths)} métodos) ← {', '.join(users) or '—'}")
w("")

# ---- Frontend libs
w("## Librerías frontend más usadas (importadas por)")
libs = [n for n in N.values() if n["source_file"].startswith("resources/js/") and n["label"].endswith((".js", ".jsx")) and n["id"] == re.sub(r"[^0-9a-z]+", "_", n["source_file"].rsplit(".", 1)[0].casefold())]
libs = sorted(libs, key=lambda n: -sum(1 for e in in_e[n["id"]] if "imports" in e["relation"]))[:20]
for n in libs:
    c = sum(1 for e in in_e[n["id"]] if "imports" in e["relation"])
    w(f"- `{n['source_file']}` ← {c} archivos")
w("")

# ---- Resumen graphify
gods = report.split("## God Nodes", 1)[1].split("\n## ", 1)[0] if "## God Nodes" in report else ""
w("## Nodos centrales (god nodes de Graphify)" + gods.rstrip())
w("")
cambios = Path("/tmp/gscripts/cambios.md")
if cambios.exists():
    w("## Cambios recientes")
    w(cambios.read_text(encoding="utf-8").strip())
    w("")
w("## Cómo usar este mapa")
w("- Antes de editar algo, ubica la pantalla → endpoint → controlador → modelo/tabla en este mapa.")
w("- Para detalle, consulta `graphify-out/graph.json` (con Graphify instalado: `graphify query \"...\"`, `graphify path A B`, `graphify explain X`).")
w("- Si el código cambia mucho, regenera el mapa y vuelve a enviarlo.")

text = "\n".join(md)
(out / "MAPA_CONTEXTO.md").write_text(text, encoding="utf-8")

# ---- HTML (autocontenido, legible y fácil de pegar/enviar)
body = []
for line in md:
    esc = html.escape(line)
    esc = re.sub(r"`([^`]+)`", r"<code>\1</code>", esc)
    esc = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", esc)
    if line.startswith("### "):
        body.append(f"<h3>{esc[4:]}</h3>")
    elif line.startswith("## "):
        body.append(f"<h2>{esc[3:]}</h2>")
    elif line.startswith("# "):
        body.append(f"<h1>{esc[2:]}</h1>")
    elif line.startswith("- "):
        body.append(f"<li>{esc[2:]}</li>")
    elif line.strip():
        body.append(f"<p>{esc}</p>")
doc = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OFBOL — Mapa del proyecto</title>
<style>
:root{{color-scheme:light dark;--fg:#1d1d1f;--bg:#fbfbf9;--mut:#6b6b6b;--line:#e4e2dc;--acc:#2f5d50}}
@media (prefers-color-scheme:dark){{:root{{--fg:#ecebe6;--bg:#151514;--mut:#9a9a94;--line:#2c2c2a;--acc:#8cc7b2}}}}
body{{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--fg);background:var(--bg);max-width:1100px;margin:0 auto;padding:32px 20px 80px}}
h1{{font-size:26px;margin:0 0 8px}} h2{{font-size:19px;margin:36px 0 10px;padding-top:14px;border-top:1px solid var(--line);color:var(--acc)}}
h3{{font-size:15px;margin:18px 0 4px}} p{{color:var(--mut);margin:4px 0}}
li{{list-style:none;padding:3px 0 3px 12px;border-left:2px solid var(--line);margin:2px 0;font-size:14px}}
code{{font:12.5px ui-monospace,Consolas,monospace;background:color-mix(in srgb,var(--line) 60%,transparent);padding:1px 5px;border-radius:4px}}
#q{{position:sticky;top:0;width:100%;box-sizing:border-box;padding:10px 12px;font-size:15px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);margin:12px 0}}
</style></head><body>
<input id="q" placeholder="Filtrar (ej. Documento, /api/revisiones, Dashboard)…" autocomplete="off">
{''.join(body)}
<script type="text/markdown" id="mapa-md">{html.escape(text)}</script>
<script>
const q=document.getElementById('q');q.addEventListener('input',()=>{{const v=q.value.toLowerCase();document.querySelectorAll('li').forEach(li=>li.style.display=!v||li.textContent.toLowerCase().includes(v)?'':'none')}});
</script></body></html>"""
(out / "OFBOL_MAPA.html").write_text(doc, encoding="utf-8")
print(len(text), "chars", text.count("\n"), "lines")
