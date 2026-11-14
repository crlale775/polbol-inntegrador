import json, sys, re
from collections import Counter
from pathlib import Path
sys.path.insert(0, "/tmp/gh/graphify"); sys.path.insert(0, "/tmp/gstub")
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

root, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
extraction = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
G = build_from_json(extraction, root=str(root), directed=True)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

AREA = [("resources/views/secretario_unidad", "Vistas Secretario de Unidad (EPI)"),
        ("resources/views/secretario_comando_departamental", "Vistas Comando Departamental"),
        ("resources/views/comando_general", "Vistas Comando General"),
        ("resources/views", "Vistas públicas / login"),
        ("resources/js/components/ui", "Componentes UI"),
        ("resources/js/components", "Layouts y componentes"),
        ("resources/js/lib", "Librerías frontend (api, cache, sync)"),
        ("resources/js", "Frontend (app.jsx / contexto)"),
        ("app/Http/Controllers", "Controladores API"),
        ("app/Models", "Modelos Eloquent"),
        ("app/Services", "Servicios (IA, PDF, reportes)"),
        ("app/Http/Middleware", "Middleware / permisos"),
        ("routes", "Rutas API"),
        ("database", "Base de datos / migraciones"),
        ("tests", "Tests"), ("scripts", "Scripts de mantenimiento"), ("docs", "Documentación")]


def area(sf):
    for pre, name in AREA:
        if sf.startswith(pre):
            return name
    return "Otros"

labels = {}
used = Counter()
for cid, members in communities.items():
    sfs = [G.nodes[n].get("source_file", "") for n in members]
    top = Counter(area(s) for s in sfs).most_common(1)[0][0]
    # nombre del nodo más conectado como pista
    hub = max(members, key=lambda n: G.degree(n))
    hub_label = re.sub(r"\(\)$", "", G.nodes[hub].get("label", hub))
    used[top] += 1
    labels[cid] = f"{top} · {hub_label}" if len(members) > 2 else f"{top}"

questions = suggest_questions(G, communities, labels)
files = sorted({d.get("source_file") for _, d in G.nodes(data=True) if d.get("source_file")})
detection = {"total_files": len(files), "total_words": 0, "warning": None,
             "files": {"code": files}, "unclassified": []}
to_json(G, communities, str(out / "graph.json"), force=True, community_labels=labels)
report = generate(G, communities, cohesion, labels, gods, surprises, detection,
                  {"input": 0, "output": 0}, "ofbol", suggested_questions=questions)
(out / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
(out / ".graphify_labels.json").write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False, indent=1), encoding="utf-8")
(out / ".graphify_analysis.json").write_text(json.dumps({"communities": {str(k): v for k, v in communities.items()},
    "cohesion": {str(k): v for k, v in cohesion.items()}, "gods": gods, "surprises": surprises, "questions": questions},
    ensure_ascii=False, indent=1, default=str), encoding="utf-8")
to_html(G, communities, str(out / "graph.html"), community_labels=labels)
print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")

# ── graph.html sin CDN: renderizador local + posiciones precalculadas ──
import networkx as nx
H = G.to_undirected() if G.is_directed() else G
pos = nx.spring_layout(H, k=1.6 / (H.number_of_nodes() ** 0.5), iterations=120, seed=7, scale=1600)
POS = {n: [round(float(p[0]), 1), round(float(p[1]), 1)] for n, p in pos.items()}
html = (out / "graph.html").read_text(encoding="utf-8")
shim = Path("/tmp/gscripts/vis_shim.js").read_text(encoding="utf-8")
tag = re.search(r'<script src="https://unpkg\.com/vis-network[^"]*"[^>]*>\s*</script>', html)
assert tag, "no se encontró el script de vis-network"
html = html[:tag.start()] + "<script>window.__POS=" + json.dumps(POS) + ";</script>\n<script>" + shim + "</script>" + html[tag.end():]
(out / "graph.html").write_text(html, encoding="utf-8")
print("graph.html autocontenido:", round(len(html) / 1024), "KB")
