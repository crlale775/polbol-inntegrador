/* Renderizador autocontenido (sin CDN) que implementa la parte de la API de
   vis-network que usa el graph.html de graphify. Posiciones precalculadas en
   window.__POS; dibujo en <canvas> con zoom, arrastre, hover y selección. */
(function () {
  function DataSet(arr) {
    this._m = new Map();
    (arr || []).forEach((it) => this._m.set(it.id, Object.assign({}, it)));
    this._l = [];
  }
  DataSet.prototype.get = function (id) {
    if (id === undefined) return Array.from(this._m.values());
    return this._m.get(id) || null;
  };
  DataSet.prototype.update = function (x) {
    (Array.isArray(x) ? x : [x]).forEach((it) => {
      const cur = this._m.get(it.id);
      this._m.set(it.id, Object.assign(cur || {}, it));
    });
    this._l.forEach((f) => f());
  };
  DataSet.prototype.forEach = function (f) { this._m.forEach(f); };

  function Network(container, data, options) {
    const self = this;
    this.nodes = data.nodes; this.edges = data.edges; this.h = {};
    this.sel = null; this.hover = null;
    const POS = window.__POS || {};
    this.pos = {};
    this.nodes.get().forEach((n, i) => {
      const p = POS[n.id];
      this.pos[n.id] = p ? { x: p[0], y: p[1] } : { x: n.x || 0, y: n.y || 0 };
    });
    this.adj = new Map();
    this.edges.get().forEach((e) => {
      if (!this.adj.has(e.from)) this.adj.set(e.from, new Set());
      if (!this.adj.has(e.to)) this.adj.set(e.to, new Set());
      this.adj.get(e.from).add(e.to); this.adj.get(e.to).add(e.from);
    });
    const c = document.createElement('canvas');
    c.style.width = '100%'; c.style.height = '100%'; c.style.display = 'block';
    container.style.position = container.style.position || 'relative';
    container.appendChild(c);
    this.c = c; this.ctx = c.getContext('2d');
    this.view = { x: 0, y: 0, s: 1 };
    const resize = () => {
      const r = container.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      c.width = Math.max(1, r.width * d); c.height = Math.max(1, r.height * d); this.dpr = d; this.draw();
    };
    new ResizeObserver(resize).observe(container);
    this.nodes._l.push(() => this.draw());
    this.edges._l.push(() => this.draw());
    resize(); this.fit();
    let drag = null, moved = false;
    c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; moved = false; });
    window.addEventListener('mouseup', () => { drag = null; });
    c.addEventListener('mousemove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; this.draw(); return;
      }
      const id = this.pick(e);
      if (id !== this.hover) {
        if (this.hover != null) this.emit('blurNode', { node: this.hover });
        this.hover = id;
        if (id != null) this.emit('hoverNode', { node: id });
        this.draw();
      }
      this.tip(e, id);
    });
    c.addEventListener('mouseleave', () => { this.tip(null, null); });
    c.addEventListener('click', (e) => {
      if (moved) return;
      const id = this.pick(e);
      this.sel = id; this.draw();
      this.emit('click', { nodes: id != null ? [id] : [], edges: [] });
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0015), s = Math.min(8, Math.max(0.05, this.view.s * k));
      const f = s / this.view.s;
      this.view.x = mx - (mx - this.view.x) * f; this.view.y = my - (my - this.view.y) * f; this.view.s = s; this.draw();
    }, { passive: false });
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;pointer-events:none;background:rgba(20,24,26,.92);color:#fff;font:12px system-ui,sans-serif;padding:4px 8px;border-radius:6px;display:none;max-width:320px;z-index:5;white-space:pre-wrap';
    container.appendChild(t); this.t = t;
    setTimeout(() => self.emit('stabilizationIterationsDone', {}), 0);
  }
  Network.prototype.tip = function (e, id) {
    if (id == null || !e) { this.t.style.display = 'none'; return; }
    const n = this.nodes.get(id), r = this.c.getBoundingClientRect();
    this.t.textContent = (n.title || n.label || id).replace(/<[^>]+>/g, '');
    this.t.style.left = (e.clientX - r.left + 12) + 'px'; this.t.style.top = (e.clientY - r.top + 12) + 'px';
    this.t.style.display = 'block';
  };
  Network.prototype.fit = function () {
    const ps = this.nodes.get().filter((n) => !n.hidden).map((n) => this.pos[n.id]);
    if (!ps.length) return;
    let a = Infinity, b = Infinity, cc = -Infinity, d = -Infinity;
    ps.forEach((p) => { a = Math.min(a, p.x); b = Math.min(b, p.y); cc = Math.max(cc, p.x); d = Math.max(d, p.y); });
    const W = this.c.width / this.dpr, H = this.c.height / this.dpr;
    const s = Math.min(W / (cc - a + 80), H / (d - b + 80));
    this.view.s = s; this.view.x = W / 2 - s * (a + cc) / 2; this.view.y = H / 2 - s * (b + d) / 2; this.draw();
  };
  Network.prototype.pick = function (e) {
    const r = this.c.getBoundingClientRect();
    const x = (e.clientX - r.left - this.view.x) / this.view.s, y = (e.clientY - r.top - this.view.y) / this.view.s;
    let best = null, bd = Infinity;
    this.nodes.forEach((n) => {
      if (n.hidden) return;
      const p = this.pos[n.id], rad = (n.size || 10) + 4 / this.view.s;
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dd < rad * rad && dd < bd) { bd = dd; best = n.id; }
    });
    return best;
  };
  Network.prototype.draw = function () {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
  };
  Network.prototype._draw = function () {
    const ctx = this.ctx, d = this.dpr || 1, v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(d * v.s, 0, 0, d * v.s, d * v.x, d * v.y);
    const foco = this.sel != null ? this.sel : this.hover;
    const vec = foco != null ? (this.adj.get(foco) || new Set()) : null;
    const css = getComputedStyle(document.documentElement);
    const lbl = (css.getPropertyValue('--node-label') || '#e5e7eb').trim() || '#e5e7eb';
    const linea = document.documentElement.getAttribute('data-theme') === 'light' ? '100,116,139' : '148,163,184';
    ctx.lineWidth = 0.8 / v.s;
    this.edges.forEach((e) => {
      const A = this.nodes.get(e.from), B = this.nodes.get(e.to);
      if (!A || !B || A.hidden || B.hidden) return;
      const on = foco != null && (e.from === foco || e.to === foco);
      ctx.strokeStyle = `rgba(${linea},${foco == null ? 0.22 : on ? 0.85 : 0.05})`;
      ctx.lineWidth = (on ? 1.6 : 0.8) / v.s;
      if (e.dashes) ctx.setLineDash([4 / v.s, 3 / v.s]); else ctx.setLineDash([]);
      const p = this.pos[e.from], q = this.pos[e.to];
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    this.nodes.forEach((n) => {
      if (n.hidden) return;
      const p = this.pos[n.id], r = n.size || 10;
      const dim = foco != null && n.id !== foco && !(vec && vec.has(n.id));
      ctx.globalAlpha = dim ? 0.15 : 1;
      ctx.fillStyle = (n.color && n.color.background) || '#888';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (n.id === foco) { ctx.lineWidth = 3 / v.s; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      const fs = (n.font && n.font.size) || 0;
      const show = fs > 0 || n.id === foco || (vec && vec.has(n.id)) || r * v.s > 9;
      if (show && !dim) {
        ctx.fillStyle = (n.font && n.font.color) || lbl;
        ctx.font = `${Math.max(11, fs || 12) / v.s}px system-ui,sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText(n.label || '', p.x, p.y + r + 13 / v.s);
      }
    });
    ctx.globalAlpha = 1;
    this.emit('afterDrawing', ctx);
  };
  Network.prototype.on = function (ev, f) { (this.h[ev] = this.h[ev] || []).push(f); };
  Network.prototype.once = function (ev, f) { const w = (x) => { this.h[ev] = this.h[ev].filter((g) => g !== w); f(x); }; this.on(ev, w); };
  Network.prototype.emit = function (ev, x) { (this.h[ev] || []).slice().forEach((f) => f(x)); };
  Network.prototype.setOptions = function () {};
  Network.prototype.redraw = function () { this.draw(); };
  Network.prototype.getConnectedNodes = function (id) { return Array.from(this.adj.get(id) || []); };
  Network.prototype.selectNodes = function (ids) { this.sel = ids && ids.length ? ids[0] : null; this.draw(); };
  Network.prototype.unselectAll = function () { this.sel = null; this.draw(); };
  Network.prototype.getPositions = function (ids) {
    const o = {}; (ids || Object.keys(this.pos)).forEach((id) => { if (this.pos[id]) o[id] = { x: this.pos[id].x, y: this.pos[id].y }; }); return o;
  };
  Network.prototype.focus = function (id, opt) {
    const p = this.pos[id]; if (!p) return;
    const s = (opt && opt.scale) || 1.4, W = this.c.width / this.dpr, H = this.c.height / this.dpr;
    this.view.s = s; this.view.x = W / 2 - p.x * s; this.view.y = H / 2 - p.y * s; this.draw();
  };
  Network.prototype.fitAll = Network.prototype.fit;
  window.vis = { DataSet: DataSet, Network: Network };
})();
