/* Zeichnen: Wasser, Hafen, Boote, Leinen, Kraftvektoren. */
(function () {
  'use strict';
  const HM = (globalThis.HM = globalThis.HM || {});

  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  function Renderer(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.cam = { cx: 0, cy: 0, scale: 14 };
    this.parts = []; this.trail = []; this.trailT = 0; this.time = 0;
    this.dpr = 1; this.w = 1; this.h = 1;
    this.resize();
  }

  Renderer.prototype.resize = function () {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
  };

  Renderer.prototype.toWorld = function (sx, sy) {
    const c = this.cam;
    return [(sx - this.w / 2) / c.scale + c.cx, (sy - this.h / 2) / c.scale + c.cy];
  };
  Renderer.prototype.toScreen = function (x, y) {
    const c = this.cam;
    return [(x - c.cx) * c.scale + this.w / 2, (y - c.cy) * c.scale + this.h / 2];
  };

  Renderer.prototype.fitView = function (view) {
    this.cam.cx = view.cx; this.cam.cy = view.cy;
    this.cam.scale = Math.min(this.w / view.w, this.h / view.h);
  };

  Renderer.prototype.reset = function () { this.parts.length = 0; this.trail.length = 0; };

  /* ---------- Boot ---------- */
  function hullPath(ctx, spec, k) {
    const cx = (spec.xs + spec.xb) / 2;
    ctx.beginPath();
    for (let i = 0; i < spec.hull.length; i++) {
      const p = spec.hull[i];
      const X = p[1] * k, Y = -((p[0] - cx) * k + cx);
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.closePath();
  }
  const poly = (ctx, pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const X = p[1], Y = -p[0]; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.closePath();
  };

  function drawBoat(ctx, spec, pose, pal, o, S) {
    const L = spec.L, B = spec.B, xs = spec.xs;
    ctx.save();
    // Schatten
    ctx.save();
    ctx.translate(pose.x + 0.22, pose.y + 0.3); ctx.rotate(pose.psi);
    hullPath(ctx, spec, 1.0); ctx.fillStyle = 'rgba(0,20,40,0.28)'; ctx.fill();
    ctx.restore();
    ctx.translate(pose.x, pose.y); ctx.rotate(pose.psi);

    // Unterwasserschiff (Kiel, Ruder, Propeller)
    if (o.under) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#06222f';
      const k = spec.keelShape;
      ctx.beginPath();
      ctx.moveTo(0, -k.x1); ctx.lineTo(k.hw, -(k.x1 - (k.x1 - k.x0) * 0.35)); ctx.lineTo(k.hw, -(k.x0 + (k.x1 - k.x0) * 0.2)); ctx.lineTo(0, -k.x0);
      ctx.lineTo(-k.hw, -(k.x0 + (k.x1 - k.x0) * 0.2)); ctx.lineTo(-k.hw, -(k.x1 - (k.x1 - k.x0) * 0.35)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Rumpf
    hullPath(ctx, spec, 1.0);
    ctx.fillStyle = pal.hull; ctx.fill();
    ctx.lineWidth = 0.07; ctx.strokeStyle = pal.accent; ctx.stroke();
    // Deck
    hullPath(ctx, spec, 0.9);
    ctx.fillStyle = pal.deck; ctx.fill();
    ctx.lineWidth = 0.03; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    if (S && S.noDetail) { ctx.restore(); return; }
    // Aufbau
    const roof = [[-0.10 * L, -0.24 * B], [0.10 * L, -0.27 * B], [0.27 * L, -0.17 * B], [0.31 * L, 0], [0.27 * L, 0.17 * B], [0.10 * L, 0.27 * B], [-0.10 * L, 0.24 * B]];
    poly(ctx, roof); ctx.fillStyle = pal.hull; ctx.fill(); ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    // Fenster
    ctx.fillStyle = 'rgba(30,50,70,0.75)';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 0.22 * B, -0.0 * L); ctx.lineTo(sd * 0.22 * B, -0.22 * L); ctx.lineTo(sd * 0.17 * B, -0.26 * L); ctx.lineTo(sd * 0.15 * B, -0.0 * L);
      ctx.closePath(); ctx.fill();
    }
    // Luke
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-0.09 * B, -0.22 * L, 0.18 * B, 0.1 * L);
    // Cockpit
    const cp = [[-0.39 * L, -0.27 * B], [-0.11 * L, -0.27 * B], [-0.11 * L, 0.27 * B], [-0.39 * L, 0.27 * B]];
    poly(ctx, cp); ctx.fillStyle = '#b9ab8c'; ctx.fill(); ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    // Steuerstand
    ctx.fillStyle = '#44505a';
    ctx.beginPath(); ctx.arc(0, 0.33 * L, 0.2, 0, 7); ctx.fill();
    // Mast
    ctx.fillStyle = '#39434b'; ctx.beginPath(); ctx.arc(0, -0.17 * L, 0.11, 0, 7); ctx.fill();
    // Bugbeschlag
    ctx.fillStyle = '#6c7780'; ctx.beginPath(); ctx.arc(0, -(spec.xb - 0.25), 0.1, 0, 7); ctx.fill();

    // Fender
    if (o.fenders) {
      ctx.fillStyle = '#ff8a3d'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.03;
      for (const c of spec.cleats) {
        if (c.side === 0 || c.group === 'bow') continue;
        const hx = spec.halfBeam((c.x - spec.xs) / spec.L);
        ctx.beginPath(); ctx.ellipse(c.side * (hx + 0.05), -c.x, 0.12, 0.38, 0, 0, 7); ctx.fill(); ctx.stroke();
      }
    }

    // Ruder
    for (let i = 0; i < spec.rudders.length; i++) {
      const R = spec.rudders[i];
      const d = S ? S.delta : 0, c = Math.cos(d), sn = Math.sin(d);
      ctx.strokeStyle = o.under ? '#0b2a3d' : 'rgba(10,40,60,0.55)'; ctx.lineWidth = Math.max(0.1, 0.045 * 2); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(R.y, -R.x); ctx.lineTo(R.y + R.chord * sn, -(R.x - R.chord * c)); ctx.stroke();
    }
    // Propeller
    if (o.under) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.ellipse(0, -spec.prop.x, spec.prop.D / 2, 0.07, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,176,32,0.9)'; ctx.beginPath(); ctx.arc(0, -spec.prop.x, 0.07, 0, 7); ctx.fill();
      if (spec.phys.thrF > 0) {
        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.moveTo(-0.35, -spec.phys.thrX); ctx.lineTo(0.35, -spec.phys.thrX); ctx.stroke();
      }
    }
    // Klampen
    const used = S && S.usedCleats;
    for (const c of spec.cleats) {
      const hot = used && used[c.id];
      const hov = S && S.hoverCleat === c.id, sel = S && S.pendingCleat === c.id;
      const px = c.y, py = -c.x;
      ctx.fillStyle = hot ? '#ff8a3d' : '#59636b';
      ctx.fillRect(px - 0.22, py - 0.05, 0.44, 0.1);
      ctx.beginPath(); ctx.arc(px - 0.22, py, 0.07, 0, 7); ctx.arc(px + 0.22, py, 0.07, 0, 7); ctx.fill();
      if (S && S.linkMode) {
        ctx.lineWidth = 0.05; ctx.strokeStyle = sel ? '#ffe066' : hov ? '#fff' : 'rgba(255,224,102,0.7)';
        ctx.beginPath(); ctx.arc(px, py, (hov || sel ? 0.5 : 0.36) + (S.pulse || 0) * 0.06, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- Hafen ---------- */
  function drawRect(ctx, d, scale) {
    const w = d.x1 - d.x0, h = d.y1 - d.y0;
    if (d.style === 'wood') {
      ctx.fillStyle = '#a4845a'; ctx.fillRect(d.x0, d.y0, w, h);
      ctx.strokeStyle = 'rgba(70,45,20,0.45)'; ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (let y = d.y0; y <= d.y1; y += 0.45) { ctx.moveTo(d.x0, y); ctx.lineTo(d.x1, y); }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#8d979f'; ctx.fillRect(d.x0, d.y0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (let x = Math.ceil(d.x0 / 6) * 6; x <= d.x1; x += 6) { ctx.moveTo(x, d.y0); ctx.lineTo(x, d.y1); }
      ctx.stroke();
    }
    ctx.lineWidth = 0.18; ctx.strokeStyle = '#4b555d'; ctx.strokeRect(d.x0, d.y0, w, h);
  }

  function drawPoint(ctx, p, o, scale) {
    const hov = o.hoverPoint === p.id, pend = o.pendingPoint === p.id;
    const minR = 4 / scale;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.type === 'cleat') {
      ctx.fillStyle = '#3d454c'; ctx.fillRect(-0.22, -0.05, 0.44, 0.1);
      ctx.beginPath(); ctx.arc(-0.22, 0, 0.08, 0, 7); ctx.arc(0.22, 0, 0.08, 0, 7); ctx.fill();
    } else if (p.type === 'bollard') {
      const r = Math.max(0.17, minR * 0.7);
      ctx.fillStyle = '#2f363b'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#6f7b84'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.2, r * 0.45, 0, 7); ctx.fill();
    } else if (p.type === 'pile') {
      ctx.fillStyle = '#5b4328'; ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, 7); ctx.fill();
      ctx.lineWidth = 0.05; ctx.strokeStyle = '#8f7149'; ctx.stroke();
    } else if (p.type === 'muring') {
      ctx.fillStyle = '#ff7a29'; ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, 7); ctx.fill();
      ctx.lineWidth = 0.08; ctx.strokeStyle = '#fff'; ctx.stroke();
    } else if (p.type === 'anchor') {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(0, 0, 0.35, 0, 7); ctx.moveTo(-0.35, 0); ctx.lineTo(0.35, 0); ctx.moveTo(0, -0.35); ctx.lineTo(0, 0.35); ctx.stroke();
    }
    if (o.linkMode && o.pendingCleat) {
      ctx.lineWidth = 2 / scale; ctx.strokeStyle = hov ? '#fff' : 'rgba(255,224,102,0.85)';
      ctx.beginPath(); ctx.arc(0, 0, (hov ? 0.75 : 0.55) + (o.pulse || 0) * 0.08, 0, 7); ctx.stroke();
    } else if (hov || pend) {
      ctx.lineWidth = 2 / scale; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Leinen ---------- */
  function tensionColor(T) {
    const t = Math.min(1, T / 3500);
    const r = Math.round(60 + 195 * Math.min(1, t * 2));
    const g = Math.round(220 - 150 * Math.max(0, t * 2 - 1) - 20 * t);
    return `rgb(${r},${g},70)`;
  }

  function lineCurve(ln, p1x, p1y, p2x, p2y) {
    const d = Math.hypot(p1x - p2x, p1y - p2y);
    const slack = Math.max(0, ln.L0 - d);
    if (slack < 0.03) return null;
    const sag = Math.min(2.8, 0.55 * Math.sqrt(slack * (d + 0.5))) * ln.sag;
    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
    const nx = -(p2y - p1y) / (d || 1), ny = (p2x - p1x) / (d || 1);
    return [mx + nx * sag * 2, my + ny * sag * 2];
  }

  function drawLines(ctx, sim, o, scale) {
    for (const ln of sim.lines) {
      if (ln.px == null) continue;
      const sel = o.selectedLine === ln.id;
      const q = lineCurve(ln, ln.px, ln.py, ln.pt.x, ln.pt.y);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const wd = (ln.anchor ? 2.4 : 2.0 + Math.min(2.5, ln.T / 1500)) / scale;
      if (sel) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = wd + 5 / scale; stroke(); }
      ctx.strokeStyle = ln.T > 5 ? tensionColor(ln.T) : (ln.anchor ? '#9aa4ab' : '#e9e2c8'); ctx.lineWidth = wd;
      stroke();
      function stroke() {
        ctx.beginPath(); ctx.moveTo(ln.px, ln.py);
        if (q) ctx.quadraticCurveTo(q[0], q[1], ln.pt.x, ln.pt.y); else ctx.lineTo(ln.pt.x, ln.pt.y);
        ctx.stroke();
      }
    }
  }

  function arrow(ctx, x, y, wx, wy, color, scale, lw) {
    const F = Math.hypot(wx, wy);
    if (F < 8) return;
    const len = Math.min(9, F * 0.0022);
    const ux = wx / F, uy = wy / F;
    const x2 = x + ux * len, y2 = y + uy * len;
    const hl = 9 / scale, hw = 4.5 / scale;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = (lw || 2.5) / scale; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2 - ux * hl * 0.6, y2 - uy * hl * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * hl - uy * hw, y2 - uy * hl + ux * hw); ctx.lineTo(x2 - ux * hl + uy * hw, y2 - uy * hl - ux * hw); ctx.closePath(); ctx.fill();
  }

  function drawForces(ctx, sim, scale) {
    const B = sim.boat, s = sim.s, d = sim.dbg;
    const fx = d.fx, fy = d.fy, sx = d.sx, sy = d.sy;
    const bw = (bx, by) => [s.x + fx * bx + sx * by, s.y + fy * bx + sy * by];
    const bv = (vx, vy) => [fx * vx + sx * vy, fy * vx + sy * vy];
    // Schub
    let p = bw(B.prop.x, B.prop.y), v = bv(d.thrust, 0);
    arrow(ctx, p[0], p[1], v[0], v[1], '#ff5d5d', scale, 3.5);
    v = bv(0, d.walk); arrow(ctx, p[0], p[1], v[0], v[1], '#ffb020', scale, 3);
    for (let i = 0; i < B.rudders.length; i++) {
      const R = B.rudders[i], dr = d.rudders[i];
      p = bw(R.x, R.y); v = bv(dr.Fx, dr.Fy);
      arrow(ctx, p[0], p[1], v[0], v[1], '#4cc9f0', scale, 3.5);
    }
    if (B.phys.thrF > 0) { p = bw(B.phys.thrX, 0); v = bv(0, d.thr); arrow(ctx, p[0], p[1], v[0], v[1], '#a78bfa', scale, 3.5); }
    p = bw(B.phys.xw, 0); v = bv(d.wind[0], d.wind[1]); arrow(ctx, p[0], p[1], v[0], v[1], '#e5eef3', scale, 3);
    for (const ln of sim.lines) {
      if (ln.T > 5 && ln.px != null) {
        const dx = ln.pt.x - ln.px, dy = ln.pt.y - ln.py, l = Math.hypot(dx, dy) || 1;
        arrow(ctx, ln.px, ln.py, dx / l * ln.T, dy / l * ln.T, '#ffe066', scale, 3);
      }
    }
  }

  /* ---------- Hauptzeichnung ---------- */
  Renderer.prototype.draw = function (sim, scene, o, dt) {
    const ctx = this.ctx, cam = this.cam, W = this.w, H = this.h, sc = cam.scale;
    this.time += dt;
    const t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Wasser
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f6a8b'); g.addColorStop(1, '#0a4e6e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const tl = this.toWorld(0, 0), br = this.toWorld(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-cam.cx, -cam.cy);
    // Wellen
    const cell = 4;
    const cx = sim.env.curKn ? Math.sin(sim.env.curTo * Math.PI / 180) * sim.env.curKn * 0.514 * t : 0;
    const cy = sim.env.curKn ? -Math.cos(sim.env.curTo * Math.PI / 180) * sim.env.curKn * 0.514 * t : 0;
    ctx.lineWidth = 1.2 / sc; ctx.lineCap = 'round';
    for (let gx = Math.floor((tl[0] - cx) / cell) - 1; gx <= Math.ceil((br[0] - cx) / cell); gx++) {
      for (let gy = Math.floor((tl[1] - cy) / cell) - 1; gy <= Math.ceil((br[1] - cy) / cell); gy++) {
        const hx = hash(gx, gy), hy = hash(gy + 77, gx - 5);
        const a = 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.9 + hx * 12));
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        const x = gx * cell + hx * cell + cx, y = gy * cell + hy * cell + cy;
        ctx.beginPath(); ctx.moveTo(x - 0.9, y); ctx.quadraticCurveTo(x, y - 0.3 - 0.15 * Math.sin(t + hx * 9), x + 0.9, y); ctx.stroke();
      }
    }
    if (scene) {
      // Wasserlinie der Kaikanten
      for (const d of scene.decor) if (d.kind === 'rect') drawRect(ctx, d, sc);
      // Leinen der Muringe
      for (const l of scene.lazy) {
        ctx.strokeStyle = l.rope ? 'rgba(235,228,200,0.7)' : 'rgba(10,30,40,0.35)'; ctx.lineWidth = (l.rope ? 1.5 : 1.2) / sc;
        ctx.beginPath(); ctx.moveTo(l.ax, l.ay); ctx.lineTo(l.bx, l.by); ctx.stroke();
        if (l.anchorDot) { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(l.bx, l.by, 0.25, 0, 7); ctx.fill(); }
      }
      for (const d of scene.decor) if (d.kind === 'buoy') {
        ctx.fillStyle = '#ff7a29'; ctx.beginPath(); ctx.arc(d.x, d.y, 0.38, 0, 7); ctx.fill();
        ctx.lineWidth = 0.07; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      for (const p of scene.points) drawPoint(ctx, p, o, sc);
      for (const n of scene.neighbours) drawBoat(ctx, n.spec, n.pose, n.palette, { fenders: true }, { noDetail: false, delta: 0 });
    }
    // Spur
    if (o.show.trail && this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5 / sc; ctx.setLineDash([6 / sc, 6 / sc]);
      ctx.beginPath(); this.trail.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]);
    }
    // Strahl-/Kielwasserpartikel
    this.updateParticles(sim, dt, o.show.wash);
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.fillStyle = `rgba(255,255,255,${(p.kind === 0 ? 0.28 : 0.2) * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - a) * (p.kind === 0 ? 0.7 : 0.4), 0, 7); ctx.fill();
    }

    // Boot
    const s = sim.s;
    const used = {};
    for (const ln of sim.lines) used[ln.cleat.id] = true;
    drawBoat(ctx, sim.boat, { x: s.x, y: s.y, psi: s.psi }, { hull: sim.boat.cfg.color || '#f3f5f7', deck: '#dde3e8', accent: '#1f3d5a' },
      { under: o.show.under, fenders: o.show.fenders },
      { delta: s.delta, usedCleats: used, hoverCleat: o.hoverCleat, pendingCleat: o.pendingCleat, linkMode: o.linkMode, pulse: Math.sin(t * 5) });

    drawLines(ctx, sim, o, sc);

    // Rubberband
    if (o.linkMode && o.rubber) {
      ctx.setLineDash([5 / sc, 5 / sc]); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2 / sc;
      ctx.beginPath(); ctx.moveTo(o.rubber[0], o.rubber[1]); ctx.lineTo(o.rubber[2], o.rubber[3]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.show.forces) drawForces(ctx, sim, sc);
    ctx.restore();

    // Stern/Heck-Hinweise: Kompass
    this.drawCompass(sim);
  };

  Renderer.prototype.drawCompass = function (sim) {
    const ctx = this.ctx, W = this.w;
    const cx = W - 54, cy = 54;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(8,22,34,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#cfe3ee'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -28); ctx.fillText('S', 0, 28); ctx.fillText('O', 28, 0); ctx.fillText('W', -28, 0);
    const e = sim.env;
    if (e.windKn > 0.2) {
      // Pfeil: Windrichtung (wohin der Wind weht)
      const a = (e.windFrom + 180) * Math.PI / 180;
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#ffe066'; ctx.fillStyle = '#ffe066'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(0, -12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(-5, -8); ctx.lineTo(5, -8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = '#ffe066'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Wind ${Math.round(e.windKn)} kn`, cx, cy + 52);
    if (e.curKn > 0.05) { ctx.fillStyle = '#8fe3ff'; ctx.fillText(`Strömung ${e.curKn.toFixed(1)} kn → ${Math.round(e.curTo)}°`, cx - 20, cy + 67); }
  };

  Renderer.prototype.updateParticles = function (sim, dt, wash) {
    const s = sim.s, B = sim.boat, d = sim.dbg;
    const P = this.parts;
    // alte Partikel
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 1.2 * dt;
      if (p.life <= 0) P.splice(i, 1);
    }
    // Spur
    this.trailT += dt;
    if (this.trailT > 0.25) { this.trailT = 0; this.trail.push([s.x, s.y]); if (this.trail.length > 900) this.trail.shift(); }
    if (d.fx === undefined || dt <= 0) return;
    if (!wash) { P.length = 0; return; }
    const T = Math.abs(d.thrust);
    const fx = d.fx, fy = d.fy;
    if (T > 25 && P.length < 600) {
      const cnt = Math.min(4, 1 + Math.floor(T / 450));
      const dir = d.thrust > 0 ? -1 : 1;
      const jet = d.thrust > 0 ? Math.max(1, d.jet * 0.55) : 1.4 + Math.sqrt(T) * 0.04;
      for (let i = 0; i < cnt; i++) {
        const sp = jet * (0.6 + Math.random() * 0.6);
        const sd = (Math.random() - 0.5) * 0.5;
        const px = s.x + fx * B.prop.x + d.sx * (B.prop.y + (Math.random() - 0.5) * 0.3);
        const py = s.y + fy * B.prop.x + d.sy * (B.prop.y + (Math.random() - 0.5) * 0.3);
        const vgx = s.u * fx + s.v * d.sx, vgy = s.u * fy + s.v * d.sy;
        P.push({ x: px, y: py, vx: vgx * 0.3 + dir * (fx * sp) + d.sx * sd * sp, vy: vgy * 0.3 + dir * (fy * sp) + d.sy * sd * sp, life: 1.8, max: 1.8, r: 0.12 + Math.random() * 0.1, kind: 0 });
      }
    }
    const spd = Math.hypot(s.u, s.v);
    if (spd > 0.7 && Math.random() < 0.7 && P.length < 600) {
      for (const sd of [-1, 1]) {
        const bx = B.xs + 0.1 * B.L, by = sd * B.halfBeam(0.1);
        P.push({ x: s.x + fx * bx + d.sx * by, y: s.y + fy * bx + d.sy * by, vx: 0, vy: 0, life: 2.4, max: 2.4, r: 0.15, kind: 1 });
      }
    }
  };

  HM.Renderer = Renderer;
})();
