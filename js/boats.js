/* Bootstypen, Rumpfgeometrie und abgeleitete physikalische Kennwerte.
 * Körperkoordinaten: x = voraus, y = Steuerbord (rechts), Ursprung = Massenschwerpunkt. [m]
 */
(function () {
  'use strict';
  const HM = (globalThis.HM = globalThis.HM || {});

  HM.PRESETS = [
    {
      id: 'fahrten10',
      name: 'Fahrtenyacht 10 m – 1 Ruder hinter der Schraube',
      desc: 'Klassische 10-m-Fahrtenyacht, Saildrive, ein Spatenruder direkt hinter dem Propeller. Der Propellerstrahl trifft das Ruder voll – gute Ruderwirkung auch im Stand beim Gasgeben.',
      cfg: { L: 10, B: 3.35, massT: 5.8, kw: 21, propD: 0.42, hand: 1, walk: 1.0, nRud: 1, rudY: 0, rudArea: 0.42,
        rudPos: 0.075, propPos: 0.15, keel: 'fin', draft: 1.75, sternW: 0.70, windScale: 1.0, thruster: 0, color: '#f3f5f7' },
    },
    {
      id: 'twin12',
      name: 'Fahrtenyacht 12 m – 2 Ruder, Saildrive, Bugstrahler',
      desc: 'Moderne breite Yacht mit zwei Rudern links und rechts vom Propeller. Die Ruderblätter liegen außerhalb des Propellerstrahls: im Stand und bei langsamer Fahrt kaum Ruderwirkung – das Boot lenkt erst mit Fahrt durchs Wasser.',
      cfg: { L: 12, B: 4.05, massT: 9.5, kw: 29, propD: 0.46, hand: 1, walk: 0.9, nRud: 2, rudY: 1.05, rudArea: 0.36,
        rudPos: 0.045, propPos: 0.17, keel: 'fin', draft: 2.0, sternW: 0.88, windScale: 1.15, thruster: 700, color: '#e9eef3' },
    },
    {
      id: 'langkiel9',
      name: 'Langkieler 9 m – Ruder am Kiel, starker Radeffekt',
      desc: 'Klassischer Langkieler mit Wellenanlage. Das Ruder hängt am Kielende direkt hinter dem Propeller. Sehr starker Radeffekt, träge beim Drehen, rückwärts schlecht zu kontrollieren.',
      cfg: { L: 9.2, B: 2.95, massT: 5.4, kw: 14, propD: 0.40, hand: 1, walk: 1.6, nRud: 1, rudY: 0, rudArea: 0.50,
        rudPos: 0.02, propPos: 0.085, keel: 'long', draft: 1.35, sternW: 0.45, windScale: 0.95, thruster: 0, color: '#f0e9da' },
    },
    {
      id: 'charter14',
      name: 'Charteryacht 14 m – 1 Ruder, Bugstrahlruder',
      desc: 'Große, schwere Yacht mit hohem Freibord (viel Windangriff), Einzelruder und Bugstrahlruder. Hohe Massenträgheit – rechtzeitig reagieren.',
      cfg: { L: 14, B: 4.5, massT: 14, kw: 55, propD: 0.55, hand: 1, walk: 0.8, nRud: 1, rudY: 0, rudArea: 0.75,
        rudPos: 0.06, propPos: 0.13, keel: 'fin', draft: 2.1, sternW: 0.80, windScale: 1.3, thruster: 1300, color: '#f6f6f2' },
    },
  ];

  HM.presetById = function (id) {
    return HM.PRESETS.find((p) => p.id === id) || HM.PRESETS[0];
  };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  HM.makeBoat = function (cfgIn) {
    const cfg = Object.assign({}, cfgIn);
    const L = cfg.L, B = cfg.B, m = cfg.massT * 1000;
    const xs = -0.47 * L, xb = 0.53 * L;
    const sm = 0.40, sw = cfg.sternW;

    function halfBeam(s) {
      s = clamp(s, 0, 1);
      if (s >= sm) {
        const t = (s - sm) / (1 - sm);
        return (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(t, 1.9)), 0.75);
      }
      const t = (sm - s) / sm;
      return (B / 2) * (sw + (1 - sw) * (1 - Math.pow(t, 2.4)));
    }

    // Rumpfumriss (konvex): Steuerbordseite Heck->Bug, dann Backbordseite Bug->Heck
    const N = 26;
    const hull = [];
    for (let i = 0; i <= N; i++) { const s = i / N; hull.push([xs + s * L, halfBeam(s)]); }
    for (let i = N - 1; i >= 1; i--) { const s = i / N; hull.push([xs + s * L, -halfBeam(s)]); }
    // Rumpfnormalen (nach außen)
    let a2 = 0;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    const sg = a2 >= 0 ? 1 : -1;
    const hnx = [], hny = [];
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      hnx.push((sg * dy) / l); hny.push((-sg * dx) / l);
    }
    // Kontaktpunkte: Eckpunkte + Kantenmitten
    const contactPts = [];
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      contactPts.push([p[0], p[1]]);
      contactPts.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    }

    // Klampen
    const cleatAt = (id, name, s, side, group) => ({
      id, name, group, side,
      x: xs + s * L, y: side * halfBeam(s) * 0.9,
    });
    const cleats = [
      cleatAt('bowP', 'Bug Backbord', 0.88, -1, 'bow'),
      cleatAt('bowS', 'Bug Steuerbord', 0.88, 1, 'bow'),
      cleatAt('midP', 'Mitte Backbord', 0.47, -1, 'mid'),
      cleatAt('midS', 'Mitte Steuerbord', 0.47, 1, 'mid'),
      cleatAt('sternP', 'Heck Backbord', 0.10, -1, 'stern'),
      cleatAt('sternS', 'Heck Steuerbord', 0.10, 1, 'stern'),
      { id: 'bowC', name: 'Bugbeschlag (Anker/Muring)', group: 'bow', side: 0, x: xb - 0.08, y: 0 },
    ];

    // Propeller
    const prop = { x: xs + cfg.propPos * L, y: 0, D: cfg.propD };
    prop.A = Math.PI * prop.D * prop.D / 4;

    // Ruder
    const rudders = [];
    const AR = cfg.keel === 'long' ? 1.6 : 2.6;
    const span = Math.sqrt(cfg.rudArea * AR);
    const chord = cfg.rudArea / span;
    const AReff = 1.5 * span * span / cfg.rudArea;
    const slope = Math.min(4.2, 1.8 * Math.PI * AReff / (AReff + 2.0));
    const rx = xs + cfg.rudPos * L;
    if (cfg.nRud === 2) {
      rudders.push({ x: rx, y: -cfg.rudY, span, chord, area: cfg.rudArea, AR: AReff, slope });
      rudders.push({ x: rx, y: cfg.rudY, span, chord, area: cfg.rudArea, AR: AReff, slope });
    } else {
      rudders.push({ x: rx, y: 0, span, chord, area: cfg.rudArea, AR: AReff, slope });
    }
    // Propellerstrahl-Überdeckung je Ruder (geometrisch)
    for (const R of rudders) {
      const d = Math.max(0, prop.x - R.x);
      const Rw = prop.D / 2 * 0.9 + d * Math.tan(9 * Math.PI / 180);
      const dy = Math.abs(R.y - prop.y);
      let cov = 0;
      if (d > 0 && dy < Rw) cov = Math.min(1, (2 * Math.sqrt(Rw * Rw - dy * dy)) / R.span);
      R.cov = cov; R.dist = d;
    }

    // Unterwasser-Lateralfläche (Streifenmodell)
    const NS = 13;
    const T = cfg.draft;
    function depth(s) {
      let d;
      if (cfg.keel === 'long') {
        const t = clamp((s - 0.03) / 0.9, 0, 1);
        d = 0.35 + (T - 0.35) * Math.pow(Math.sin(Math.PI * t), 0.7);
      } else {
        d = 0.55 * Math.pow(Math.sin(Math.PI * clamp(s, 0, 1)), 0.5) + (T - 0.55) * Math.exp(-Math.pow((s - 0.5) / 0.075, 2));
      }
      return Math.max(0.1, d);
    }
    const strips = [];
    for (let i = 0; i < NS; i++) {
      const s = (i + 0.5) / NS;
      strips.push({ x: xs + s * L, A: depth(s) * (L / NS) });
    }

    // Massen
    const k = Math.pow(m / 5800, 2 / 3);
    const phys = {
      m, m11: 1.07 * m, m22: 1.55 * m,
      Izz: m * Math.pow(0.27 * L, 2),
      c1: 80 * k, c2: 55 * k, c2r: 55 * k * 1.4,
      Vh: 1.15 * Math.sqrt(L),
      Tb: 62 * cfg.kw, Tbr: 62 * cfg.kw * 0.62,
      Vp: 6.2, Vpr: 4.0,
      walk: cfg.hand * cfg.walk,
      liftK: 1.8,
      As: 1.3 * L * cfg.windScale, Af: 0.52 * L * cfg.windScale,
      xw: 0.08 * L,
      thrF: cfg.thruster, thrX: xb - 0.10 * L,
    };
    phys.m33 = 1.6 * phys.Izz;

    // Silhouette des Kiels (nur Darstellung)
    const keelShape = cfg.keel === 'long'
      ? { x0: xs + 0.12 * L, x1: xs + 0.85 * L, hw: 0.14 }
      : { x0: xs + 0.36 * L, x1: xs + 0.64 * L, hw: 0.11 };

    return { cfg, L, B, xs, xb, hull, hnx, hny, contactPts, cleats, prop, rudders, strips, phys, keelShape, halfBeam };
  };

  /* Benennung einer Leine nach Klampe und Richtung zum Festmachpunkt (Körperkoordinaten) */
  HM.nameLine = function (cleat, dxb, dyb, pt) {
    const side = cleat.side < 0 ? ' Bb' : cleat.side > 0 ? ' Stb' : '';
    if (pt.type === 'anchor') return 'Ankerkette';
    if (pt.type === 'muring') return 'Muringleine';
    const d = Math.hypot(dxb, dyb) || 1;
    const f = dxb / d; // >0: Zielpunkt liegt voraus der Klampe
    let n;
    if (cleat.group === 'bow') n = f > 0.3 ? 'Vorleine' : f < -0.3 ? 'Vorspring' : 'Bugleine (quer)';
    else if (cleat.group === 'stern') n = f < -0.3 ? 'Achterleine' : f > 0.3 ? 'Achterspring' : 'Heckleine (quer)';
    else n = f > 0.3 ? 'Mittelspring (voraus)' : f < -0.3 ? 'Mittelspring (achteraus)' : 'Mittelleine (quer)';
    return n + side;
  };
})();
