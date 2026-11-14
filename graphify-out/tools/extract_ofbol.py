"""Extractor estructural (sin LLM) para OFBOL: Laravel 13 + React SPA.
Emite JSON con el esquema de extracción de graphify (nodes/edges/hyperedges).
Uso: python3 extract_ofbol.py <raiz_proyecto> <salida.json>
"""
import json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2])

nodes, edges, hyper = {}, [], []
seen_edges = set()


def norm(s):
    return re.sub(r"[^0-9a-z]+", "_", s.casefold()).strip("_")


def stem_id(rel):
    p = Path(rel)
    parts = list(p.parent.parts) + [p.stem if p.suffix else p.name]
    return "_".join(norm(x) for x in parts if x not in (".", ""))


def add_node(nid, label, rel, ftype="code", loc=None, **extra):
    if nid not in nodes:
        n = {"id": nid, "label": label, "file_type": ftype, "source_file": rel,
             "source_location": loc, "source_url": None, "captured_at": None,
             "author": None, "contributor": None}
        n.update(extra)
        nodes[nid] = n
    return nid


def add_edge(s, t, rel, src, conf="EXTRACTED", score=1.0, loc=None):
    if s == t or s is None or t is None:
        return
    k = (s, t, rel)
    if k in seen_edges:
        return
    seen_edges.add(k)
    edges.append({"source": s, "target": t, "relation": rel, "confidence": conf,
                  "confidence_score": score, "source_file": src,
                  "source_location": loc, "weight": 1.0})


def line_of(text, idx):
    return "L%d" % (text.count("\n", 0, idx) + 1)


files = [p for p in ROOT.rglob("*") if p.is_file()]
rel = lambda p: p.relative_to(ROOT).as_posix()

# ---------------------------------------------------------------- PHP
php_class_by_fqcn = {}   # App\Models\Documento -> (node_id, rel)
php_class_by_short = {}
php_files = [p for p in files if p.suffix == ".php"]
php_text = {p: p.read_text(encoding="utf-8", errors="replace") for p in php_files}

for p, t in php_text.items():
    r = rel(p)
    fid = add_node(stem_id(r), p.name, r)
    ns = re.search(r"^namespace\s+([\w\\]+);", t, re.M)
    for m in re.finditer(r"^(?:abstract\s+|final\s+)?(class|interface|trait|enum)\s+(\w+)", t, re.M):
        cname = m.group(2)
        cid = add_node(stem_id(r) + "_" + norm(cname), cname, r, loc=line_of(t, m.start()))
        add_edge(fid, cid, "contains", r)
        if ns:
            php_class_by_fqcn[ns.group(1) + "\\" + cname] = (cid, r)
        php_class_by_short.setdefault(cname, (cid, r))

LARAVEL_REL = r"(hasMany|hasOne|belongsTo|belongsToMany|morphMany|morphTo|hasManyThrough|hasOneThrough)"
tables = {}


def table_node(name, r):
    nid = "db_table_" + norm(name)
    add_node(nid, "tabla: " + name, r, ftype="concept", node_kind="db_table")
    tables[name] = nid
    return nid


for p, t in php_text.items():
    r = rel(p)
    fid = stem_id(r)
    cls = re.search(r"^(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+([\w\\]+))?(?:\s+implements\s+([\w\\, ]+))?", t, re.M)
    cid = (fid + "_" + norm(cls.group(1))) if cls else fid
    uses = {}
    for m in re.finditer(r"^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;", t, re.M):
        fq = m.group(1)
        alias = m.group(2) or fq.split("\\")[-1]
        uses[alias] = fq
        if fq in php_class_by_fqcn:
            add_edge(fid, php_class_by_fqcn[fq][0], "imports", r, loc=line_of(t, m.start()))
    ns = re.search(r"^namespace\s+([\w\\]+);", t, re.M)

    def resolve(short):
        short = short.lstrip("\\")
        if short in uses and uses[short] in php_class_by_fqcn:
            return php_class_by_fqcn[uses[short]][0]
        if short in php_class_by_fqcn:
            return php_class_by_fqcn[short][0]
        if ns and (ns.group(1) + "\\" + short) in php_class_by_fqcn:
            return php_class_by_fqcn[ns.group(1) + "\\" + short][0]
        return None

    if cls and cls.group(2):
        tgt = resolve(cls.group(2))
        if tgt:
            add_edge(cid, tgt, "inherits", r)
    # methods
    if cls:
        for m in re.finditer(r"(public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\(", t):
            mname = m.group(2)
            if mname.startswith("__"):
                continue
            mid = add_node(cid + "_" + norm(mname), cls.group(1) + "::" + mname + "()", r, loc=line_of(t, m.start()))
            add_edge(cid, mid, "method", r)
            # relaciones Eloquent dentro del método
            body = t[m.end(): m.end() + 600]
            rm = re.match(r"[^{]*\{\s*return\s+\$this->" + LARAVEL_REL + r"\(\s*([\w\\]+)::class", body, re.S)
            if rm:
                tgt = resolve(rm.group(2))
                if tgt:
                    add_edge(cid, tgt, "eloquent_" + rm.group(1), r, loc=line_of(t, m.start()))
    # referencias Clase::  /  new Clase  / Clase::class
    for m in re.finditer(r"(?:new\s+|\b)(\\?[A-Z][\w\\]*)(?:::|\s*\()", t):
        tgt = resolve(m.group(1))
        if tgt and tgt != cid:
            rel_kind = "uses"
            add_edge(cid, tgt, rel_kind, r, loc=line_of(t, m.start()))
    # tabla del modelo
    tm = re.search(r"protected\s+\$table\s*=\s*'([^']+)'", t)
    if tm:
        add_edge(cid, table_node(tm.group(1), r), "maps_table", r)
    # migraciones / consultas directas
    for m in re.finditer(r"Schema::(create|table)\(\s*'([^']+)'", t):
        add_edge(fid, table_node(m.group(2), r), "migrates_table", r, loc=line_of(t, m.start()))
    for m in re.finditer(r"DB::table\(\s*'([^']+)'", t):
        add_edge(cid, table_node(m.group(1), r), "queries_table", r, loc=line_of(t, m.start()))

# ---------------------------------------------------------------- RUTAS API
api_routes = []  # (method, path, node_id)
RESOURCE = [("GET", "", "index"), ("POST", "", "store"), ("GET", "/{id}", "show"),
            ("PUT", "/{id}", "update"), ("DELETE", "/{id}", "destroy")]
for rf in ["routes/api.php", "routes/web.php"]:
    p = ROOT / rf
    if not p.exists():
        continue
    t = php_text[p]
    prefix = "/api/" if rf.endswith("api.php") else "/"
    fid = stem_id(rf)

    def ctrl_id(short):
        fq = "App\\Http\\Controllers\\" + short
        return php_class_by_fqcn.get(fq, (None,))[0]

    for m in re.finditer(r"Route::(get|post|put|patch|delete)\(\s*'([^']*)'\s*,\s*\[\s*\\?(?:App\\Http\\Controllers\\)?(\w+)::class\s*,\s*'(\w+)'\s*\]", t):
        verb, path, ctrl, meth = m.group(1).upper(), m.group(2).strip("/"), m.group(3), m.group(4)
        full = prefix + path
        rid = add_node("route_" + norm(verb + " " + full), verb + " " + full, rf, loc=line_of(t, m.start()), node_kind="api_route")
        add_edge(fid, rid, "defines_route", rf)
        c = ctrl_id(ctrl)
        if c:
            add_edge(rid, c + "_" + norm(meth), "routes_to", rf, loc=line_of(t, m.start()))
        api_routes.append((verb, full, rid))
    for m in re.finditer(r"Route::apiResource\(\s*'([^']+)'\s*,\s*(\w+)::class", t):
        base, ctrl = m.group(1).strip("/"), m.group(2)
        c = ctrl_id(ctrl)
        for verb, suf, meth in RESOURCE:
            full = prefix + base + suf
            rid = add_node("route_" + norm(verb + " " + full), verb + " " + full, rf, loc=line_of(t, m.start()), node_kind="api_route")
            add_edge(fid, rid, "defines_route", rf)
            if c:
                add_edge(rid, c + "_" + norm(meth), "routes_to", rf, loc=line_of(t, m.start()))
            api_routes.append((verb, full, rid))
    for m in re.finditer(r"->middleware\(\s*\[([^\]]+)\]", t):
        for mm in re.finditer(r"([\w\\]+)::class", m.group(1)):
            fq = mm.group(1).lstrip("\\")
            if fq in php_class_by_fqcn:
                add_edge(fid, php_class_by_fqcn[fq][0], "guarded_by", rf)


def match_route(verb, url):
    url = url.split("?")[0]
    url = re.sub(r"\$\{[^}]*\}", "{x}", url)
    url = "/api/" + url.strip("/") if not url.startswith("/api") else url
    segs = [s for s in url.strip("/").split("/") if s]
    best = None
    for v, full, rid in api_routes:
        if v != verb:
            continue
        rs = [s for s in full.strip("/").split("/") if s]
        if len(rs) != len(segs):
            continue
        ok, exact = True, 0
        for a, b in zip(segs, rs):
            pa, pb = "{" in a, b.startswith("{")
            if pa or pb:
                continue
            if a != b:
                ok = False
                break
            exact += 1
        if ok and (best is None or exact > best[0]):
            best = (exact, rid)
    return best[1] if best else None

# ---------------------------------------------------------------- JS / JSX
js_files = [p for p in files if p.suffix in (".js", ".jsx", ".mjs")]
js_ids = {}
for p in js_files:
    r = rel(p)
    js_ids[p.resolve()] = add_node(stem_id(r), p.name, r)


def resolve_js(src_file, spec):
    if spec.startswith("@/"):
        base = ROOT / "resources/js" / spec[2:]
    elif spec.startswith("."):
        base = (src_file.parent / spec)
    else:
        return None
    for cand in [base, *(base.with_name(base.name + e) for e in (".jsx", ".js", ".mjs")),
                 base / "index.jsx", base / "index.js"]:
        c = cand.resolve()
        if c in js_ids:
            return js_ids[c]
    return None


for p in js_files:
    r = rel(p)
    t = p.read_text(encoding="utf-8", errors="replace")
    fid = js_ids[p.resolve()]
    for m in re.finditer(r"(?:import\s[^'\"]*?from\s*|import\s*\(\s*|require\(\s*|import\s+)['\"]([^'\"]+)['\"]", t):
        tgt = resolve_js(p, m.group(1))
        if tgt:
            lazy = "import(" in t[max(0, m.start() - 2): m.start() + 8] or t[m.start():m.start() + 7] == "import("
            add_edge(fid, tgt, "lazy_imports" if lazy else "imports", r, loc=line_of(t, m.start()))
    # componentes exportados
    for m in re.finditer(r"export\s+(?:default\s+)?function\s+([A-Z]\w*)", t):
        cid = add_node(fid + "_" + norm(m.group(1)), m.group(1), r, loc=line_of(t, m.start()))
        add_edge(fid, cid, "contains", r)
    # llamadas al backend
    for m in re.finditer(r"\bapi\.(get|post|put|patch|delete|upload|download)\w*\(\s*[`'\"]([^`'\"]+)", t):
        verb = {"upload": "POST", "download": "GET"}.get(m.group(1), m.group(1).upper())
        rid = match_route(verb, m.group(2))
        if rid:
            add_edge(fid, rid, "calls_api", r, loc=line_of(t, m.start()))
        else:
            u = re.sub(r"\$\{[^}]*\}", "{x}", m.group(2).split("?")[0])
            uid = add_node("unmatched_" + norm(verb + " " + u), verb + " /api" + u + " (sin ruta)", r, ftype="concept", node_kind="unmatched_api")
            add_edge(fid, uid, "calls_api", r, conf="AMBIGUOUS", score=0.3, loc=line_of(t, m.start()))
    # rutas de la SPA
    if p.name == "app.jsx":
        lazy_map = {m.group(1): m.group(2) for m in re.finditer(r"const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['\"]([^'\"]+)", t)}
        for m in re.finditer(r"<Route\s+path=\"([^\"]+)\"[^>]*element=\{<(\w+)", t):
            path, comp = m.group(1), m.group(2)
            sid = add_node("spa_" + norm(path) if norm(path) else "spa_root", "pantalla " + path, r, ftype="concept", loc=line_of(t, m.start()), node_kind="spa_route")
            add_edge(fid, sid, "defines_route", r)
            tgt = resolve_js(p, lazy_map[comp]) if comp in lazy_map else None
            if tgt:
                add_edge(sid, tgt, "renders", r, loc=line_of(t, m.start()))

# ---------------------------------------------------------------- DOCS
class_names = {k: v[0] for k, v in php_class_by_short.items() if len(k) > 5}
for p in [f for f in files if f.suffix == ".md"]:
    r = rel(p)
    t = p.read_text(encoding="utf-8", errors="replace")
    fid = add_node(stem_id(r), p.name, r, ftype="document")
    for name, cid in class_names.items():
        if re.search(r"\b" + re.escape(name) + r"\b", t):
            add_edge(fid, cid, "references", r, conf="INFERRED", score=0.85)
    for js in js_files:
        if js.stem not in ("api", "cn", "app", "index") and len(js.stem) > 5 and re.search(r"\b" + re.escape(js.name) + r"\b", t):
            add_edge(fid, js_ids[js.resolve()], "references", r, conf="INFERRED", score=0.85)

# ---------------------------------------------------------------- HYPEREDGES (roles)
for role in ["secretario_unidad", "secretario_comando_departamental", "comando_general"]:
    members = [nid for nid, n in nodes.items() if n["source_file"].startswith("resources/views/" + role + "/") and nid == stem_id(n["source_file"])]
    if len(members) >= 3:
        hyper.append({"id": "rol_" + role, "label": "Vistas del rol " + role, "nodes": members,
                      "relation": "form", "confidence": "EXTRACTED", "confidence_score": 1.0,
                      "source_file": "resources/js/app.jsx"})

# limpiar aristas colgantes
edges = [e for e in edges if e["source"] in nodes and e["target"] in nodes]
OUT.write_text(json.dumps({"nodes": list(nodes.values()), "edges": edges, "hyperedges": hyper,
                           "input_tokens": 0, "output_tokens": 0}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"nodes={len(nodes)} edges={len(edges)} hyperedges={len(hyper)} api_routes={len(api_routes)} tables={len(tables)}")
from collections import Counter
print(Counter(e["relation"] for e in edges).most_common())
