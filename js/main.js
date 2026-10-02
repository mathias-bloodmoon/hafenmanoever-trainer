/* Oberfläche, Eingaben, Hauptschleife. */
(function () {
  'use strict';
  const HM = globalThis.HM;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const KN = HM.KN;

  const cv = $('#cv');
  const R = new HM.Renderer(cv);
  const sim = new HM.Sim();

  const S = {
    presetId: 'fahrten10', cfg: null, beamRatio: 0.335, propDist: 1.0,
    taskId: null, layoutId: 'quay', startKind: 'ablegen', lineSet: 'all',
    running: true, timeScale: 1, ropeEA: 40000,
    scene: null, spec: null,
    keys: {}, hold: null, selectedLine: null, linkToggle: false,
    pendingCleat: null, pendingPoint: null, hoverCleat: null, hoverPoint: null,
    mouse: [0, 0], mouseW: [0, 0], down: null,
    show: { forces: true, wash: true, under: false, trail: false, fenders: true },
    follow: false, anchorLine: null, thrBtn: 0, toastT: 0,
  };

  /* ---------------- Boot-Konfiguration ---------------- */
  const CFG_FIELDS = [
    { k: 'L', label: 'Länge', min: 7, max: 16, step: 0.1, unit: 'm' },
    { k: 'massT', label: 'Verdrängung', min: 3, max: 22, step: 0.1, unit: 't' },
    { k: 'kw', label: 'Motorleistung', min: 8, max: 100, step: 1, unit: 'kW' },
    { k: 'propD', label: 'Propeller-Durchmesser', min: 0.3, max: 0.75, step: 0.01, unit: 'm' },
    { k: 'hand', label: 'Propeller-Drehsinn (vorwärts)', type: 'select', options: [[1, 'Rechtsdreher'], [-1, 'Linksdreher']] },
    { k: 'walk', label: 'Radeffekt-Stärke', min: 0, max: 2.5, step: 0.05, unit: '×' },
    { k: 'nRud', label: 'Ruderanordnung', type: 'select', options: [[1, '1 Ruder hinter der Schraube'], [2, '2 Ruder links und rechts']] },
    { k: 'rudY', label: 'Ruderabstand von der Mittellinie', min: 0.3, max: 1.7, step: 0.05, unit: 'm', showIf: (c) => c.nRud === 2 },
    { k: 'rudArea', label: 'Ruderfläche (je Ruder)', min: 0.15, max: 1.1, step: 0.01, unit: 'm²' },
    { k: 'propDist', label: 'Abstand Propeller → Ruder', min: 0.3, max: 2.5, step: 0.05, unit: 'm' },
    { k: 'keel', label: 'Kielart', type: 'select', options: [['fin', 'Flossenkiel'], ['long', 'Langkiel']] },
    { k: 'thruster', label: 'Bugstrahlruder', type: 'select', options: [[0, 'keines'], [500, 'klein (500 N)'], [900, 'mittel (900 N)'], [1500, 'groß (1500 N)']] },
    { k: 'windScale', label: 'Windangriffsfläche', min: 0.5, max: 2, step: 0.05, unit: '×' },
  ];

  function setPreset(id, silent) {
    const p = HM.presetById(id);
    S.presetId = p.id;
    S.cfg = Object.assign({}, p.cfg);
    S.beamRatio = p.cfg.B / p.cfg.L;
    S.propDist = (p.cfg.propPos - p.cfg.rudPos) * p.cfg.L;
    $('#selBoat').value = p.id;
    $('#boatDesc').textContent = p.desc;
    buildCfgForm();
    if (!silent) loadWorld();
  }

  function cfgBuild() {
    const c = Object.assign({}, S.cfg);
    c.B = c.L * S.beamRatio;
    c.propPos = c.rudPos + S.propDist / c.L;
    c.thruster = +c.thruster;
    return c;
  }

  function cfgValue(k) { return k === 'propDist' ? S.propDist : S.cfg[k]; }

  function buildCfgForm() {
    const box = $('#cfgForm'); box.innerHTML = '';
    for (const f of CFG_FIELDS) {
      const row = document.createElement('div'); row.className = 'cfg-row'; row.dataset.k = f.k;
      if (f.type === 'select') {
        const lb = document.createElement('label'); lb.textContent = f.label;
        const sel = document.createElement('select');
        for (const o of f.options) { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); }
        sel.value = cfgValue(f.k);
        sel.addEventListener('change', () => { S.cfg[f.k] = +sel.value; buildCfgForm(); loadWorld(); });
        lb.appendChild(sel); row.appendChild(lb);
      } else {
        const lb = document.createElement('label'); lb.className = 'rng';
        const out = document.createElement('output');
        const inp = document.createElement('input'); inp.type = 'range';
        inp.min = f.min; inp.max = f.max; inp.step = f.step; inp.value = cfgValue(f.k);
        const fmt = () => { out.textContent = (+inp.value).toFixed(f.step < 0.1 ? 2 : 1) + ' ' + f.unit; };
        fmt();
        inp.addEventListener('input', fmt);
        inp.addEventListener('change', () => {
          const v = +inp.value;
          if (f.k === 'propDist') S.propDist = v;
          else if (f.k === 'L') S.cfg.L = v;
          else S.cfg[f.k] = v;
          loadWorld(); updateRudInfo();
        });
        lb.append(f.label + ' ', out, inp); row.appendChild(lb);
      }
      if (f.showIf && !f.showIf(S.cfg)) row.classList.add('hidden');
      box.appendChild(row);
    }
  }

  function updateRudInfo() {
    if (!S.spec) return;
    const b = S.spec;
    const parts = b.rudders.map((r, i) => `${b.rudders.length > 1 ? (i ? 'Stb-Ruder' : 'Bb-Ruder') : 'Ruder'}: ${Math.round(r.cov * 100)} %`);
    const txt = parts.join(' · ');
    const hint = b.rudders.every((r) => r.cov < 0.05)
      ? 'Kein Ruder liegt im Propellerstrahl: im Stand und bei langsamer Fahrt kaum Ruderwirkung.'
      : 'Teile der Ruderfläche werden direkt vom Propellerstrahl angeströmt: Ruderwirkung auch im Stand beim Gasgeben (vorwärts).';
    $('#rudInfo').innerHTML = `<b>Ruderfläche im Propellerstrahl</b><br>${txt}<br><span style="color:var(--muted)">${hint}</span>`;
  }

  /* ---------------- Welt laden ---------------- */
  function addLineSet(list, slack) {
    if (!list) return;
    for (const [cid, pid] of list) {
      const cleat = S.spec.cleats.find((c) => c.id === cid);
      const pt = S.scene.points.find((p) => p.id === pid);
      if (cleat && pt) sim.addLine(cleat, pt, { slack: slack != null ? slack : 0.35, EA: S.ropeEA });
    }
  }

  function loadWorld() {
    const cfg = cfgBuild();
    const spec = HM.makeBoat(cfg);
    const lay = S.layoutId === 'med-anchor' ? 'med' : S.layoutId;
    const scene = HM.buildScene(lay, spec, cfg, { noBuoy: S.layoutId === 'med-anchor' });
    S.spec = spec; S.scene = scene;
    sim.setBoat(spec); sim.scene = scene; sim.lines = []; S.anchorLine = null;
    const st = scene.starts[S.startKind] || scene.starts.anlegen;
    sim.place(st.x, st.y, st.psi);
    if (S.startKind === 'ablegen' && S.lineSet !== 'none' && st.lineSets) addLineSet(st.lineSets[S.lineSet] || []);
    R.reset(); R.resize(); R.fitView(scene.view);
    S.selectedLine = null; S.pendingCleat = S.pendingPoint = null; S.linkToggle = false;
    $('#btnLink').classList.remove('on');
    $('#thrRow').classList.toggle('hidden', !(spec.phys.thrF > 0));
    syncControlsUI();
    renderLines(); updateRudInfo(); updateAnchorBtn();
  }

  function loadTask(id) {
    const t = HM.TASKS.find((x) => x.id === id); if (!t) return;
    S.taskId = id; S.layoutId = t.layout; S.startKind = t.start; S.lineSet = t.lineSet || 'all';
    setEnv(t.wind[0], t.wind[1], t.cur[0], t.cur[1]);
    $('#taskText').textContent = t.text;
    $$('#taskList .card').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
    $('#selLayout').value = S.layoutId; $('#selStart').value = S.startKind;
    loadWorld();
  }

  function setEnv(wk, wf, ck, ct) {
    $('#rWind').value = wk; $('#rWindDir').value = wf; $('#rCur').value = ck; $('#rCurDir').value = ct;
    readEnv();
  }
  const compass = (d) => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
  function readEnv() {
    const e = sim.env;
    e.windKn = +$('#rWind').value; e.windFrom = +$('#rWindDir').value;
    e.curKn = +$('#rCur').value; e.curTo = +$('#rCurDir').value; e.gust = $('#cGust').checked;
    $('#oWind').textContent = e.windKn + ' kn';
    $('#oWindDir').textContent = e.windFrom + '° (' + compass(e.windFrom) + ')';
    $('#oCur').textContent = e.curKn.toFixed(1) + ' kn';
    $('#oCurDir').textContent = e.curTo + '° (' + compass(e.curTo) + ')';
  }

  /* ---------------- Aufgaben-UI ---------------- */
  function buildTaskUI() {
    const list = $('#taskList');
    for (const t of HM.TASKS) {
      const b = document.createElement('button'); b.className = 'card'; b.dataset.id = t.id;
      const lay = HM.LAYOUTS.find((l) => l.id === t.layout);
      b.innerHTML = `${t.title}<small>${lay ? lay.name : ''} · ${t.start === 'ablegen' ? 'Ablegen' : 'Anlegen'}</small>`;
      b.addEventListener('click', () => loadTask(t.id));
      list.appendChild(b);
    }
    const sl = $('#selLayout');
    for (const l of HM.LAYOUTS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; sl.appendChild(o); }
    $('#btnLoadCustom').addEventListener('click', () => {
      S.layoutId = sl.value; S.startKind = $('#selStart').value; S.lineSet = $('#selLineSet').value;
      S.taskId = null; $$('#taskList .card').forEach((c) => c.classList.remove('active'));
      $('#taskText').textContent = 'Eigene Kombination: ' + HM.LAYOUTS.find((l) => l.id === S.layoutId).name;
      loadWorld();
    });
    const sb = $('#selBoat');
    for (const p of HM.PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sb.appendChild(o); }
    sb.addEventListener('change', () => setPreset(sb.value));
  }

  /* ---------------- Leinen ---------------- */
  function pointWorld(p) { return [p.x, p.y]; }

  function createLine(cleat, pt) {
    const ln = sim.addLine(cleat, pt, { slack: 0.4, EA: S.ropeEA });
    S.selectedLine = ln.id;
    renderLines();
    return ln;
  }

  function removeLine(id) {
    const ln = sim.lines.find((l) => l.id === id);
    if (!ln) return;
    if (ln.anchor) {
      S.scene.points = S.scene.points.filter((p) => p !== ln.pt);
      S.anchorLine = null;
    }
    sim.removeLine(id);
    if (S.selectedLine === id) S.selectedLine = null;
    renderLines(); updateAnchorBtn();
  }

  function renderLines() {
    const box = $('#lineList'); box.innerHTML = '';
    if (!sim.lines.length) { box.innerHTML = '<div class="empty">Keine Leinen gesetzt.</div>'; return; }
    for (const ln of sim.lines) {
      const d = document.createElement('div'); d.className = 'line' + (S.selectedLine === ln.id ? ' sel' : ''); d.dataset.id = ln.id;
      d.innerHTML = `<div class="hd"><b>${ln.name}</b><small>${ln.cleat.name} → ${ln.pt.label}</small></div>
        <div class="meter"><div class="bar"></div></div>
        <div class="ft"><span class="len"></span>
        <span class="mini" data-act="in" title="Dichtholen (gedrückt halten)">− dicht</span>
        <span class="mini" data-act="out" title="Fieren (gedrückt halten)">+ fieren</span>
        ${ln.anchor ? '<span class="mini" data-act="auto"></span>' : ''}
        <span class="mini del" data-act="del">✕</span>
        <span class="tn">0 N</span></div>`;
      d.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.act;
        if (a === 'del') { removeLine(ln.id); return; }
        if (a === 'auto') { ln.auto = !ln.auto; return; }
        S.selectedLine = ln.id; $$('#lineList .line').forEach((x) => x.classList.toggle('sel', +x.dataset.id === ln.id));
      });
      d.addEventListener('pointerdown', (e) => {
        const a = e.target.dataset && e.target.dataset.act;
        if (a === 'in' || a === 'out') { S.hold = { id: ln.id, dir: a === 'in' ? -1 : 1 }; S.selectedLine = ln.id; ln.auto = false; e.preventDefault(); }
      });
      box.appendChild(d);
    }
  }
  window.addEventListener('pointerup', () => { S.hold = null; });
  window.addEventListener('pointercancel', () => { S.hold = null; });

  function updateLinesUI() {
    for (const row of $$('#lineList .line')) {
      const ln = sim.lines.find((l) => l.id === +row.dataset.id); if (!ln) continue;
      const bar = row.querySelector('.bar'), pct = clamp(ln.T / 3500 * 100, 0, 100);
      bar.style.width = pct + '%';
      bar.style.background = ln.T > 2500 ? '#ff5d5d' : ln.T > 1200 ? '#ffb020' : '#22d3a5';
      row.querySelector('.tn').textContent = Math.round(ln.T) + ' N';
      row.querySelector('.len').textContent = 'Länge ' + ln.L0.toFixed(1) + ' m';
      const au = row.querySelector('[data-act=auto]'); if (au) au.textContent = ln.auto ? 'Kette: läuft' : 'Kette: gehalten';
    }
  }

  function applyHold(dt) {
    const h = S.hold; if (!h) return;
    const ln = sim.lines.find((l) => l.id === h.id); if (!ln) return;
    const rate = ln.anchor ? 2.0 : 0.6;
    if (h.dir < 0) ln.L0 = Math.max(0.5, Math.max(ln.L0 - rate * dt, (ln.len || 0) - 0.45));
    else ln.L0 = Math.min(80, ln.L0 + rate * dt);
  }

  function dropAnchor() {
    if (S.anchorLine) { removeLine(S.anchorLine.id); return; }
    const cleat = S.spec.cleats.find((c) => c.id === 'bowC');
    const w = sim.cleatWorld(cleat);
    const pt = { id: 'anchor', x: w[0], y: w[1], type: 'anchor', label: 'Anker' };
    S.scene.points.push(pt);
    const ln = sim.addLine(cleat, pt, { L0: 1.0 });
    ln.auto = true; S.anchorLine = ln; S.selectedLine = ln.id;
    renderLines(); updateAnchorBtn();
    toast('Anker gefallen – Kette läuft aus. In „Leinen“ auf „Kette: gehalten“ stellen, um einzuholen/zu stoppen.', false);
  }
  function updateAnchorBtn() { $('#btnAnchor').textContent = S.anchorLine ? '⚓ Anker lichten' : '⚓ Anker werfen'; }

  /* ---------------- Picking ---------------- */
  function pickCleat(wx, wy) {
    const r = Math.max(0.6, 16 / R.cam.scale); let best = null, bd = r;
    for (const c of S.spec.cleats) { const p = sim.cleatWorld(c); const d = Math.hypot(p[0] - wx, p[1] - wy); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function pickPoint(wx, wy) {
    const r = Math.max(0.8, 18 / R.cam.scale); let best = null, bd = r;
    for (const p of S.scene.points) { if (p.type === 'anchor') continue; const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function pickLine(wx, wy) {
    const r = Math.max(0.5, 10 / R.cam.scale); let best = null, bd = r;
    for (const ln of sim.lines) {
      if (ln.px == null) continue;
      const ax = ln.px, ay = ln.py, bx = ln.pt.x, by = ln.pt.y;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - wx, ay + dy * t - wy);
      if (d < bd) { bd = d; best = ln; }
    }
    return best;
  }

  function handleClick(wx, wy) {
    const cl = pickCleat(wx, wy);
    if (cl) {
      if (S.pendingPoint) { createLine(cl, S.pendingPoint); S.pendingPoint = null; S.linkToggle = false; $('#btnLink').classList.remove('on'); return; }
      S.pendingCleat = S.pendingCleat === cl.id ? null : cl.id; return;
    }
    const pt = pickPoint(wx, wy);
    if (pt) {
      if (S.pendingCleat) { createLine(S.spec.cleats.find((c) => c.id === S.pendingCleat), pt); S.pendingCleat = null; S.linkToggle = false; $('#btnLink').classList.remove('on'); return; }
      S.pendingPoint = S.pendingPoint === pt.id ? null : pt.id; return;
    }
    const ln = pickLine(wx, wy);
    S.pendingCleat = S.pendingPoint = null;
    S.selectedLine = ln ? ln.id : null;
    $$('#lineList .line').forEach((x) => x.classList.toggle('sel', ln && +x.dataset.id === ln.id));
  }

  /* ---------------- Maus / Touch ---------------- */
  function localXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = localXY(e);
    S.down = { x: p[0], y: p[1], cx: R.cam.cx, cy: R.cam.cy, moved: false };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = localXY(e); S.mouse = p; S.mouseW = R.toWorld(p[0], p[1]);
    if (S.down) {
      const dx = p[0] - S.down.x, dy = p[1] - S.down.y;
      if (!S.down.moved && Math.hypot(dx, dy) > 5) { S.down.moved = true; cv.classList.add('grabbing'); }
      if (S.down.moved && !S.follow) { R.cam.cx = S.down.cx - dx / R.cam.scale; R.cam.cy = S.down.cy - dy / R.cam.scale; }
    }
  });
  cv.addEventListener('pointerup', (e) => {
    const p = localXY(e);
    if (S.down && !S.down.moved) { const w = R.toWorld(p[0], p[1]); handleClick(w[0], w[1]); }
    S.down = null; cv.classList.remove('grabbing');
  });
  cv.addEventListener('pointerleave', () => { S.hoverCleat = S.hoverPoint = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = localXY(e), before = R.toWorld(p[0], p[1]);
    R.cam.scale = clamp(R.cam.scale * Math.exp(-e.deltaY * 0.0015), 5, 70);
    const after = R.toWorld(p[0], p[1]);
    R.cam.cx += before[0] - after[0]; R.cam.cy += before[1] - after[1];
  }, { passive: false });

  /* ---------------- Bedienelemente ---------------- */
  function makeSlider(el, o) {
    const knob = el.querySelector('.knob'); let val = o.value, drag = false;
    function place() {
      const f = (val - o.min) / (o.max - o.min);
      if (o.vertical) knob.style.top = ((1 - f) * 100) + '%'; else knob.style.left = (f * 100) + '%';
    }
    function setVal(v, fire) {
      v = clamp(v, o.min, o.max); v = Math.round(v / o.step) * o.step;
      if (o.snap && Math.abs(v) < o.snap) v = 0;
      val = v; place(); if (fire && o.onChange) o.onChange(v);
    }
    function fromEvent(e) {
      const r = el.getBoundingClientRect();
      if (o.vertical) return o.min + (1 - (e.clientY - r.top) / r.height) * (o.max - o.min);
      return o.min + ((e.clientX - r.left) / r.width) * (o.max - o.min);
    }
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); drag = true; setVal(fromEvent(e), true); });
    el.addEventListener('pointermove', (e) => { if (drag) setVal(fromEvent(e), true); });
    el.addEventListener('pointerup', () => { drag = false; });
    el.addEventListener('dblclick', () => setVal(0, true));
    place();
    return { set: (v) => { val = v; place(); }, get: () => val };
  }

  const leverUI = makeSlider($('#lever'), { vertical: true, min: -1, max: 1, step: 0.05, value: 0, snap: 0.04, onChange: (v) => { sim.ctl.lever = v; } });
  const rudUI = makeSlider($('#rudder'), { vertical: false, min: -35, max: 35, step: 0.5, value: 0, snap: 1.5, onChange: (v) => { sim.ctl.rudder = v; } });

  function syncControlsUI() { leverUI.set(sim.ctl.lever); rudUI.set(sim.ctl.rudder); }

  function setLever(v) { sim.ctl.lever = clamp(Math.round(v * 20) / 20, -1, 1); leverUI.set(sim.ctl.lever); }

  const thrHold = (btn, dir) => {
    btn.addEventListener('pointerdown', (e) => { S.thrBtn = dir; btn.classList.add('active'); e.preventDefault(); });
    const up = () => { if (S.thrBtn === dir) S.thrBtn = 0; btn.classList.remove('active'); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
  };
  thrHold($('#btnThrL'), -1); thrHold($('#btnThrR'), 1);

  /* ---------------- Tastatur ---------------- */
  const isTyping = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    S.keys[k] = true;
    if (k === 'arrowup' || k === 'w') { if (!e.repeat) setLever(sim.ctl.lever + 0.1); e.preventDefault(); }
    else if (k === 'arrowdown' || k === 's') { if (!e.repeat) setLever(sim.ctl.lever - 0.1); e.preventDefault(); }
    else if (k === ' ' || k === 'x') { setLever(0); e.preventDefault(); }
    else if (k === 'arrowleft' || k === 'arrowright') e.preventDefault();
    else if (k === 'c') { sim.ctl.rudder = 0; rudUI.set(0); }
    else if (k === 'p') togglePause();
    else if (k === 'r') loadWorld();
    else if (k === 'g') { $('#cForces').checked = !$('#cForces').checked; S.show.forces = $('#cForces').checked; }
    else if (k === 'l') toggleLink();
    else if (k === 'escape') { S.pendingCleat = S.pendingPoint = null; S.linkToggle = false; $('#btnLink').classList.remove('on'); $('#helpModal').classList.add('hidden'); }
    else if (k === 'delete' || k === 'backspace') { if (S.selectedLine) removeLine(S.selectedLine); }
    else if (k === '[' || k === ']') { if (S.selectedLine) { S.hold = { id: S.selectedLine, dir: k === '[' ? -1 : 1, key: true }; } }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase(); S.keys[k] = false;
    if ((k === '[' || k === ']') && S.hold && S.hold.key) S.hold = null;
  });
  window.addEventListener('blur', () => { S.keys = {}; });

  function applyKeys(dt) {
    const K = S.keys;
    const dir = ((K['d'] || K['arrowright']) ? 1 : 0) - ((K['a'] || K['arrowleft']) ? 1 : 0);
    if (dir) { sim.ctl.rudder = clamp(sim.ctl.rudder + dir * 30 * dt, -35, 35); rudUI.set(sim.ctl.rudder); }
    const thr = S.thrBtn || (((K['e'] ? 1 : 0) - (K['q'] ? 1 : 0)));
    sim.ctl.thruster = thr;
  }

  /* ---------------- Sonstiges UI ---------------- */
  function toast(msg, danger) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden', 'fade');
    t.style.background = danger === false ? 'rgba(56,189,248,.92)' : 'rgba(255,93,93,.92)';
    t.style.color = danger === false ? '#04202e' : '#fff';
    S.toastT = 3.2;
  }
  function toggleLink() {
    S.linkToggle = !S.linkToggle; $('#btnLink').classList.toggle('on', S.linkToggle);
    if (!S.linkToggle) S.pendingCleat = S.pendingPoint = null;
  }
  function togglePause() {
    S.running = !S.running; $('#btnPause').textContent = S.running ? '⏸ Pause' : '▶ Weiter';
  }

  $('#btnPause').addEventListener('click', togglePause);
  $('#btnReset').addEventListener('click', loadWorld);
  $('#btnHelp').addEventListener('click', () => $('#helpModal').classList.remove('hidden'));
  $('#btnCloseHelp').addEventListener('click', () => $('#helpModal').classList.add('hidden'));
  $('#helpModal').addEventListener('click', (e) => { if (e.target.id === 'helpModal') e.target.classList.add('hidden'); });
  $('#btnMenu').addEventListener('click', () => document.body.classList.toggle('menu'));
  $('#selTempo').addEventListener('change', (e) => { S.timeScale = +e.target.value; });
  $('#btnLink').addEventListener('click', toggleLink);
  $('#btnClear').addEventListener('click', () => { for (const l of sim.lines.slice()) removeLine(l.id); });
  $('#btnStd').addEventListener('click', () => {
    const st = S.scene.starts.ablegen;
    const set = st && st.lineSets && st.lineSets.all;
    if (!set || !set.length) { toast('Für diesen Hafen gibt es keine Standardleinen.', true); return; }
    const far = set.some(([cid, pid]) => {
      const c = S.spec.cleats.find((q) => q.id === cid), p = S.scene.points.find((q) => q.id === pid);
      const w = sim.cleatWorld(c); return Math.hypot(w[0] - p.x, w[1] - p.y) > 25;
    });
    if (far) { toast('Boot zu weit vom Liegeplatz entfernt.', true); return; }
    addLineSet(set); renderLines();
  });
  $('#btnAnchor').addEventListener('click', dropAnchor);
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  }));
  for (const id of ['rWind', 'rWindDir', 'rCur', 'rCurDir', 'cGust']) $('#' + id).addEventListener('input', readEnv);
  $('#selRope').addEventListener('change', (e) => { S.ropeEA = +e.target.value; for (const l of sim.lines) if (!l.anchor) l.EA = S.ropeEA; });
  const bindShow = (id, key) => $('#' + id).addEventListener('change', (e) => { S.show[key] = e.target.checked; });
  bindShow('cForces', 'forces'); bindShow('cWash', 'wash'); bindShow('cUnder', 'under'); bindShow('cTrail', 'trail'); bindShow('cFenders', 'fenders');
  $('#cFollow').addEventListener('change', (e) => { S.follow = e.target.checked; });
  window.addEventListener('resize', () => R.resize());
  new ResizeObserver(() => R.resize()).observe($('#stage'));

  /* ---------------- HUD ---------------- */
  const H = { speed: $('#hSpeed'), hdg: $('#hHdg'), rot: $('#hRot'), sway: $('#hSway'), ten: $('#hTen'), cont: $('#hCont'), imp: $('#hImp'),
    lever: $('#oLever'), rud: $('#oRudder'), hint: $('#hint') };
  let lastHint = '';
  function updateHUD() {
    const s = sim.s;
    H.speed.textContent = (s.u / KN).toFixed(1);
    H.hdg.textContent = String(Math.round(((s.psi * 180 / Math.PI) % 360 + 360) % 360) % 360).padStart(3, '0');
    H.rot.textContent = Math.round(s.r * 180 / Math.PI * 60);
    H.sway.textContent = (s.v / KN).toFixed(1);
    H.ten.textContent = Math.round(sim.dbg.maxLine || 0);
    H.cont.textContent = sim.stats.contacts;
    H.imp.textContent = sim.stats.maxImpact > 0 ? 'max ' + (sim.stats.maxImpact / KN).toFixed(1) + ' kn' : '';
    const l = sim.ctl.lever;
    H.lever.textContent = Math.abs(l) < 0.04 ? 'Neutral' : (l > 0 ? 'VOR ' : 'RÜCK ') + Math.round(Math.abs(l) * 100) + ' %';
    H.rud.textContent = (sim.ctl.rudder > 0.5 ? 'Stb ' : sim.ctl.rudder < -0.5 ? 'Bb ' : '') + Math.abs(Math.round(sim.ctl.rudder)) + '°';
    let hint = '';
    if (S.pendingCleat) hint = 'Jetzt den Festmachpunkt anklicken (Klampe, Poller, Pfahl …) · Esc = abbrechen';
    else if (S.pendingPoint) hint = 'Jetzt die Klampe am Boot anklicken · Esc = abbrechen';
    else if (S.linkToggle) hint = 'Klicke eine Klampe am Boot oder einen Festmachpunkt';
    else if (!S.running) hint = 'Pausiert';
    if (hint !== lastHint) { lastHint = hint; H.hint.textContent = hint; H.hint.classList.toggle('hidden', !hint); }
  }

  /* ---------------- Hauptschleife ---------------- */
  let last = performance.now();
  const STEP = 1 / 240;
  let accT = 0;
  function frame(now) {
    const dtR = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.toastT > 0) { S.toastT -= dtR; if (S.toastT < 0.4) $('#toast').classList.add('fade'); if (S.toastT <= 0) $('#toast').classList.add('hidden'); }
    applyKeys(dtR);
    if (S.running) {
      accT += dtR * S.timeScale;
      let n = 0;
      applyHold(dtR * S.timeScale);
      for (const ln of sim.lines) if (ln.auto && ln.len > ln.L0) ln.L0 = Math.min(80, ln.len);
      while (accT >= STEP && n < 60) { sim.step(STEP); accT -= STEP; n++; }
      if (n >= 60) accT = 0;
      while (sim.events.length) {
        const ev = sim.events.shift();
        if (ev.type === 'impact') toast(`Kontakt! Aufprall mit ${(ev.speed / KN).toFixed(1)} kn`, true);
      }
    }
    if (S.follow) { R.cam.cx += (sim.s.x - R.cam.cx) * Math.min(1, dtR * 4); R.cam.cy += (sim.s.y - R.cam.cy) * Math.min(1, dtR * 4); }

    // Hover
    if (!S.down || !S.down.moved) {
      const hc = pickCleat(S.mouseW[0], S.mouseW[1]);
      S.hoverCleat = hc ? hc.id : null;
      const hp = pickPoint(S.mouseW[0], S.mouseW[1]);
      S.hoverPoint = hp ? hp.id : null;
      cv.classList.toggle('pick', !!(hc || hp));
    }
    S.mouseW = R.toWorld(S.mouse[0], S.mouse[1]);
    let rubber = null;
    if (S.pendingCleat) {
      const c = S.spec.cleats.find((q) => q.id === S.pendingCleat), w = sim.cleatWorld(c);
      rubber = [w[0], w[1], S.mouseW[0], S.mouseW[1]];
    } else if (S.pendingPoint) {
      const p = S.scene.points.find((q) => q.id === S.pendingPoint);
      if (p) rubber = [p.x, p.y, S.mouseW[0], S.mouseW[1]];
    }
    R.draw(sim, S.scene, {
      show: S.show, hoverCleat: S.hoverCleat, hoverPoint: S.hoverPoint, pendingCleat: S.pendingCleat, pendingPoint: S.pendingPoint,
      linkMode: S.linkToggle || !!S.pendingCleat || !!S.pendingPoint, selectedLine: S.selectedLine, rubber, pulse: Math.sin(now / 200),
    }, S.running ? dtR * S.timeScale : 0);
    updateHUD(); updateLinesUI();
    requestAnimationFrame(frame);
  }

  /* ---------------- Start ---------------- */
  buildTaskUI();
  readEnv();
  setPreset('fahrten10', true);
  R.resize();
  loadTask('q-ab');
  requestAnimationFrame(frame);

  // Debug-Zugriff
  HM.app = { S, sim, R, loadWorld, loadTask, setPreset };
})();
