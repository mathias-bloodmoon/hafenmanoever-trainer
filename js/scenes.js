/* Hafen-Layouts und Übungsaufgaben.
 * Welt: x = Ost, y = Süd (unten). Kurs 0° = Nord (oben), 90° = Ost, 270° = West.
 */
(function () {
  'use strict';
  const HM = (globalThis.HM = globalThis.HM || {});

  const rect = (x0, y0, x1, y1) => HM.makePoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

  const NEIGHBOUR_PALETTES = [
    { hull: '#c9d3dc', deck: '#aab7c2', accent: '#52606d' },
    { hull: '#d7cbb4', deck: '#bfb294', accent: '#6b5b3e' },
    { hull: '#b9c6d6', deck: '#9eb0c4', accent: '#3d5a80' },
    { hull: '#d8d8d8', deck: '#bdbdbd', accent: '#555' },
  ];

  function neighbour(baseCfg, L, x, y, psiDeg, k) {
    const f = L / baseCfg.L;
    const cfg = Object.assign({}, baseCfg, { L, B: baseCfg.B * f * 0.97, nRud: 1, rudY: 0, thruster: 0 });
    const spec = HM.makeBoat(cfg);
    const psi = psiDeg * Math.PI / 180, sp = Math.sin(psi), cp = Math.cos(psi);
    const world = spec.hull.map((p) => [x + sp * p[0] + cp * p[1], y - cp * p[0] + sp * p[1]]);
    const cleatW = (id) => {
      const c = spec.cleats.find((q) => q.id === id);
      return [x + sp * c.x + cp * c.y, y - cp * c.x + sp * c.y];
    };
    return { spec, pose: { x, y, psi }, palette: NEIGHBOUR_PALETTES[k % NEIGHBOUR_PALETTES.length], poly: HM.makePoly(world), cleatW };
  }

  function nearest(points, x, y, types) {
    let best = null, bd = 1e9;
    for (const p of points) {
      if (types && types.indexOf(p.type) < 0) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* ---------- Längsseits am Steg ---------- */
  function layoutQuay(spec, baseCfg) {
    const L = spec.L, B = spec.B;
    const yq = 10;
    const sc = { id: 'quay', title: 'Längsseits am Steg', obstacles: [], points: [], decor: [], neighbours: [], lazy: [] };
    const pier = rect(-60, yq, 60, yq + 9);
    sc.obstacles.push(pier);
    sc.decor.push({ kind: 'rect', x0: -60, y0: yq, x1: 60, y1: yq + 9, style: 'wood' });
    // Gegenüberliegende Mole
    sc.decor.push({ kind: 'rect', x0: -60, y0: -42, x1: 60, y1: -34, style: 'concrete' });
    sc.obstacles.push(rect(-60, -42, 60, -34));
    // Nachbarboote
    const nL = 9.5, gap = L + 5.5;
    const nb = [neighbour(baseCfg, nL, -(gap / 2 + nL / 2), yq - 1.65 - 0.25, 270, 0),
                neighbour(baseCfg, nL, gap / 2 + nL / 2, yq - 1.65 - 0.25, 270, 1)];
    for (const n of nb) { sc.neighbours.push(n); sc.obstacles.push(n.poly); }
    // Klampen am Steg
    let id = 0;
    for (let x = -42; x <= 42; x += 3) {
      if (nb.some((n) => Math.abs(x - n.pose.x) < nL / 2 - 0.3)) continue;
      sc.points.push({ id: 'p' + id++, x, y: yq + 0.35, type: 'cleat', label: 'Klampe' });
    }
    sc.points.push({ id: 'p' + id++, x: -gap / 2 - nL - 3.5, y: yq + 0.5, type: 'bollard', label: 'Poller' });
    sc.points.push({ id: 'p' + id++, x: gap / 2 + nL + 3.5, y: yq + 0.5, type: 'bollard', label: 'Poller' });
    // Wasserfläche für Kamera
    sc.view = { cx: 0, cy: 1, w: 50, h: 32 };
    const yc = yq - B / 2 - 0.3;
    const mk = (cleatId, x) => [cleatId, nearest(sc.points, x, yq).id];
    const px = (x) => nearest(sc.points, x, yq);
    sc.starts = {
      ablegen: {
        x: 0, y: yc, psi: 270,
        lineSets: {
          all: [['bowP', px(-0.5 * L - 2).id], ['sternP', px(0.5 * L + 2.5).id], ['bowP', px(0.12 * L).id], ['sternP', px(-0.15 * L).id]],
          vorspring: [['bowP', px(0.12 * L).id]],
          achterspring: [['sternP', px(-0.15 * L).id]],
          mittelspring: [['midP', px(0.25 * L).id], ['midP', px(-0.25 * L).id]],
        },
      },
      anlegen: { x: 26, y: yq - 13, psi: 270 },
    };
    return sc;
  }

  /* Boxen-Geometrie für Pfahlbox und Mediterran */
  function rowBoats(sc, spec, baseCfg, W, yc, ks, bowToBuoy) {
    const nL = spec.L * 0.96;
    let i = 0;
    for (const k of ks) {
      const n = neighbour(baseCfg, nL, k * W, yc + (spec.L - nL) * 0.47, 0, i++);
      sc.neighbours.push(n); sc.obstacles.push(n.poly);
    }
  }

  /* ---------- Box mit Pfählen (Heck zum Steg) ---------- */
  function layoutBox(spec, baseCfg) {
    const L = spec.L, B = spec.B;
    const W = B + 1.9;
    const sc = { id: 'box', title: 'Box mit Pfählen', obstacles: [], points: [], decor: [], neighbours: [], lazy: [] };
    const yPile = -L - 0.3;
    // Steg
    sc.obstacles.push(rect(-60, 0, 60, 9));
    sc.decor.push({ kind: 'rect', x0: -60, y0: 0, x1: 60, y1: 9, style: 'wood' });
    // Gegenüberliegende Mole
    const yTop = yPile - 1.9 * L;
    sc.obstacles.push(rect(-60, yTop - 8, 60, yTop));
    sc.decor.push({ kind: 'rect', x0: -60, y0: yTop - 8, x1: 60, y1: yTop, style: 'concrete' });
    const yc = -0.8 - 0.47 * L;
    rowBoats(sc, spec, baseCfg, W, yc, [-3, -2, -1, 1, 2, 3], false);
    let id = 0;
    // Pfähle
    for (let k = -4; k <= 3; k++) {
      const x = (k + 0.5) * W;
      sc.obstacles.push(HM.makeCircle(x, yPile, 0.17));
      sc.points.push({ id: 'p' + id++, x, y: yPile, type: 'pile', label: 'Pfahl' });
    }
    // Steg-Klampen
    for (let i = -16; i <= 16; i++) {
      const x = i * W / 4;
      if (Math.abs(i) > 4 && i % 2) continue;
      sc.points.push({ id: 'p' + id++, x, y: 0.4, type: 'cleat', label: 'Klampe' });
    }
    const pile = (x) => nearest(sc.points, x, yPile, ['pile']);
    const cl = (x) => nearest(sc.points, x, 0.4, ['cleat']);
    sc.view = { cx: 0, cy: yPile * 1.05, w: 52, h: 42 };
    sc.starts = {
      ablegen: {
        x: 0, y: yc, psi: 0,
        lineSets: {
          all: [['bowP', pile(-W / 2).id], ['bowS', pile(W / 2).id], ['sternP', cl(-W / 2).id], ['sternS', cl(W / 2).id]],
          bug: [['bowP', pile(-W / 2).id], ['bowS', pile(W / 2).id]],
        },
      },
      anlegen: { x: -1.9 * L, y: yPile - 0.95 * L, psi: 90 },
    };
    return sc;
  }

  /* ---------- Mediterran: Heck zum Kai, Muring / Anker ---------- */
  function layoutMed(spec, baseCfg, opts) {
    const L = spec.L, B = spec.B;
    const W = B + 1.5;
    const sc = { id: 'med', title: 'Mediterran: Heck zum Kai', obstacles: [], points: [], decor: [], neighbours: [], lazy: [] };
    const yB = -1.35 * L - 2.0;
    sc.obstacles.push(rect(-60, 0, 60, 12));
    sc.decor.push({ kind: 'rect', x0: -60, y0: 0, x1: 60, y1: 12, style: 'concrete' });
    const yTop = yB - 2.1 * L;
    sc.obstacles.push(rect(-60, yTop - 8, 60, yTop));
    sc.decor.push({ kind: 'rect', x0: -60, y0: yTop - 8, x1: 60, y1: yTop, style: 'concrete' });
    const yc = -0.8 - 0.47 * L;
    const ks = [-3, -2, -1, 1, 2, 3];
    rowBoats(sc, spec, baseCfg, W, yc, ks, true);
    let id = 0;
    // Poller am Kai
    for (let i = -14; i <= 14; i++) {
      const x = i * W / 2;
      sc.points.push({ id: 'p' + id++, x, y: 0.6, type: 'bollard', label: 'Poller' });
    }
    // Muring-Bojen (Leine vom Kai zum Grundgewicht) + Leinen der Nachbarn
    for (let k = -4; k <= 4; k++) {
      const x = k * W;
      const own = k === 0;
      if (own && opts.noBuoy) continue;
      sc.decor.push({ kind: 'buoy', x, y: yB });
      sc.lazy.push({ ax: x, ay: 0, bx: x, by: yB });
      if (own) sc.points.push({ id: 'p' + id++, x, y: yB, type: 'muring', label: 'Muringleine (Boje)' });
      else if (ks.indexOf(k) >= 0) {
        const n = sc.neighbours[ks.indexOf(k)];
        const c = n.cleatW('bowC');
        sc.lazy.push({ ax: c[0], ay: c[1], bx: x, by: yB, rope: true });
      }
    }
    // Nachbarn: Ankerketten
    if (opts.noBuoy) {
      for (const k of ks) {
        const n = sc.neighbours[ks.indexOf(k)];
        const c = n.cleatW('bowC');
        sc.lazy.push({ ax: c[0], ay: c[1], bx: k * W * 1.12, by: yB - 8, rope: true, anchorDot: true });
      }
    }
    sc.view = { cx: 0, cy: yB * 0.8, w: 56, h: 44 };
    const bw = (x) => nearest(sc.points, x, 0.6, ['bollard']);
    const buoy = nearest(sc.points, 0, yB, ['muring']);
    sc.starts = {
      ablegen: {
        x: 0, y: yc, psi: 0,
        lineSets: {
          all: [['sternP', bw(-W / 2).id], ['sternS', bw(W / 2).id]].concat(buoy ? [['bowC', buoy.id]] : []),
          kai: [['sternP', bw(-W / 2).id], ['sternS', bw(W / 2).id]],
        },
      },
      anlegen: { x: -2.2 * L, y: yB - 0.7 * L, psi: 90 },
    };
    return sc;
  }

  /* ---------- Freies Üben ---------- */
  function layoutOpen(spec, baseCfg) {
    const sc = { id: 'open', title: 'Freies Üben', obstacles: [], points: [], decor: [], neighbours: [], lazy: [] };
    sc.obstacles.push(rect(-60, 22, 60, 30));
    sc.decor.push({ kind: 'rect', x0: -60, y0: 22, x1: 60, y1: 30, style: 'concrete' });
    let id = 0;
    for (let x = -30; x <= 30; x += 3) sc.points.push({ id: 'p' + id++, x, y: 22.5, type: 'bollard', label: 'Poller' });
    sc.obstacles.push(HM.makeCircle(-14, 4, 0.2));
    sc.points.push({ id: 'p' + id++, x: -14, y: 4, type: 'pile', label: 'Pfahl' });
    sc.obstacles.push(HM.makeCircle(14, 4, 0.2));
    sc.points.push({ id: 'p' + id++, x: 14, y: 4, type: 'pile', label: 'Pfahl' });
    sc.view = { cx: 0, cy: 6, w: 60, h: 40 };
    sc.starts = { ablegen: { x: 0, y: 8, psi: 0, lineSets: { all: [] } }, anlegen: { x: 0, y: 8, psi: 0 } };
    return sc;
  }

  HM.buildScene = function (layout, spec, baseCfg, opts) {
    opts = opts || {};
    switch (layout) {
      case 'quay': return layoutQuay(spec, baseCfg);
      case 'box': return layoutBox(spec, baseCfg);
      case 'med': return layoutMed(spec, baseCfg, opts);
      default: return layoutOpen(spec, baseCfg);
    }
  };

  HM.LAYOUTS = [
    { id: 'quay', name: 'Längsseits am Steg' },
    { id: 'box', name: 'Box mit Pfählen (Heck zum Steg)' },
    { id: 'med', name: 'Mediterran: Heck zum Kai mit Muring' },
    { id: 'med-anchor', name: 'Mediterran: Heck zum Kai mit eigenem Anker' },
    { id: 'open', name: 'Freies Üben (offenes Hafenbecken)' },
  ];

  /* Aufgaben. wind: [kn, aus Richtung°], cur: [kn, setzt nach°] */
  HM.TASKS = [
    {
      id: 'open', title: 'Freies Üben: Radeffekt & Ruderwirkung', layout: 'open', start: 'anlegen', wind: [0, 0], cur: [0, 90],
      text: 'Offenes Wasser. Teste im Stand: Gas voraus mit Ruderlage, dann rückwärts. Beobachte Radeffekt (Heck wandert beim Rückwärtsgang zur Seite) und den Unterschied zwischen Ein- und Doppelruder. Aktiviere „Kräfte anzeigen“.',
    },
    {
      id: 'q-an', title: 'Längsseits anlegen (ruhig)', layout: 'quay', start: 'anlegen', wind: [0, 0], cur: [0, 90],
      text: 'Fahre im flachen Winkel (20–30°) an die Lücke am Steg, dann Gas raus. Lege zuerst die Vorspring (Bugklampe → Steg achteraus) und stoppe das Boot mit Rückwärtsgang. Danach Vor-/Achterleine setzen.',
    },
    {
      id: 'q-an-wind', title: 'Längsseits anlegen – auflandiger Wind 12 kn', layout: 'quay', start: 'anlegen', wind: [12, 0], cur: [0, 90],
      text: 'Wind drückt zum Steg. Du kannst langsamer und flacher anlaufen. Der Wind hilft beim Anlegen, macht aber das Ablegen schwer.',
    },
    {
      id: 'q-ab', title: 'Längsseits ablegen – ablandiger Wind', layout: 'quay', start: 'ablegen', lineSet: 'all', wind: [8, 180], cur: [0, 90],
      text: 'Alle vier Leinen sind gesetzt (Vor-/Achterleine, Vor-/Achterspring). Löse die Leinen (Leine anklicken → Entf) und fahre sauber ab. Der Wind drückt das Boot vom Steg.',
    },
    {
      id: 'q-vorspring', title: 'Eindampfen in die Vorspring (auflandiger Wind)', layout: 'quay', start: 'ablegen', lineSet: 'vorspring', wind: [12, 0], cur: [0, 90],
      text: 'Nur die Vorspring (vom Bug nach achtern zum Steg) ist belegt, Wind drückt aufs Boot. Probiere: langsam vorwärts mit Ruder in Richtung Steg: das Boot dreht um den Bugfender, das Heck schwingt vom Steg weg. Dann Leine los, Rückwärtsgang.',
    },
    {
      id: 'q-achterspring', title: 'Eindampfen in die Achterspring', layout: 'quay', start: 'ablegen', lineSet: 'achterspring', wind: [10, 270], cur: [0, 90],
      text: 'Die Achterspring (vom Heck nach vorn zum Steg) ist belegt, Wind kommt von vorn. Probiere Rückwärtsgang mit verschiedenen Ruderlagen: Beobachte, wie sich Heck und Bug bewegen und wie die Leine belastet wird (Kräfte anzeigen).',
    },
    {
      id: 'q-spring-mitte', title: 'Ablegen mit Mittelspring', layout: 'quay', start: 'ablegen', lineSet: 'mittelspring', wind: [10, 0], cur: [0, 90],
      text: 'Zwei Mittelsprings (vorwärts und achteraus) sind gesetzt. Löse die eine Spring und dampfe in die andere ein. Beobachte den Drehpunkt um die Mittelklampe.',
    },
    {
      id: 'box-an', title: 'Box mit Pfählen: rückwärts einparken', layout: 'box', start: 'anlegen', wind: [6, 90], cur: [0, 90],
      text: 'Fahre rückwärts in die Box. Beachte den Radeffekt (Heck dreht beim Rückwärtsgang zur Backbordseite). Nimm zuerst die Luv-Bugleine auf den Pfahl, dann die Heckleinen zum Steg.',
    },
    {
      id: 'box-ab', title: 'Box mit Pfählen: Ablegen', layout: 'box', start: 'ablegen', lineSet: 'all', wind: [8, 90], cur: [0, 90],
      text: 'Heck- und Bugleinen sind belegt. Löse die Heckleinen, hole am Pfahl Zug ab und fahre rückwärts raus (Leinen nacheinander los). Der Seitenwind versetzt dich in die Nachbarbox.',
    },
    {
      id: 'med-muring', title: 'Mediterran: Heck zum Kai mit Muringleine', layout: 'med', start: 'anlegen', wind: [6, 0], cur: [0, 90],
      text: 'Fahre rückwärts auf die Lücke zu. Nimm die Muringleine (Boje) an Bug-Klampe auf, fiere Lose, dann Heckleinen auf die Poller. Muring wieder dicht holen.',
    },
    {
      id: 'med-anker', title: 'Mediterran: Heck zum Kai mit eigenem Anker', layout: 'med-anchor', start: 'anlegen', wind: [6, 0], cur: [0, 90],
      text: 'Anker fallen lassen („Anker werfen“) etwa 3-4 Bootslängen vor dem Kai, dabei Kette fieren (Leine verlängern), rückwärts zum Kai fahren, Kette steif halten. Dann Heckleinen auf die Poller.',
    },
  ];
})();
