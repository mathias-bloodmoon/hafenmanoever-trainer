/* Physik-Engine: 3-FHG-Bootsmodell (Surge, Sway, Gier) mit Added-Mass-Termen,
 * Propeller (Schub, Radeffekt, Strahl), Ruder (Auftrieb/Widerstand im Strahl und in der Anströmung),
 * Streifenmodell für Lateralwiderstand, Wind, Strömung, elastische Leinen und Kontakt (Fender).
 * Welt: x = Ost (rechts), y = Süd (unten), Kurs psi im Uhrzeigersinn ab Nord.
 */
(function () {
  'use strict';
  const HM = (globalThis.HM = globalThis.HM || {});
  const RHO = 1025, RHOA = 1.225, KN = 0.514444;

  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

  HM.makePoly = function (pts) {
    const n = pts.length; let a2 = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 >= 0 ? 1 : -1;
    const nx = [], ny = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      nx.push(sg * dy / l); ny.push(-sg * dx / l);
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    return { type: 'poly', pts, nx, ny, x0, y0, x1, y1 };
  };
  HM.makeCircle = (x, y, r) => ({ type: 'circle', x, y, r });

  /* Profil-Beiwerte: alpha in (-pi, pi] zwischen Sehne und Anströmung.
   * Rückwärtsanströmung (|alpha| > 90°) mit halber Auftriebssteigung. */
  function foil(alpha, slopeA, AR) {
    let aa = alpha, rev = false;
    if (aa > Math.PI / 2) { aa -= Math.PI; rev = true; }
    else if (aa < -Math.PI / 2) { aa += Math.PI; rev = true; }
    const slope = rev ? slopeA * 0.5 : slopeA;
    const as = 0.30; // ~17° Strömungsabriss
    const ab = Math.abs(aa), sgn = aa < 0 ? -1 : 1;
    const cls = slope * as;
    const CD0 = 0.025, ki = 1 / (Math.PI * 0.8 * AR);
    let CL, CD;
    if (ab <= as) { CL = slope * aa; CD = CD0 + ki * CL * CL; }
    else {
      const b = Math.min(1, (ab - as) / 0.3);
      CL = sgn * ((1 - b) * cls * 0.9 + b * 1.05 * Math.sin(2 * ab));
      const s2 = Math.sin(ab);
      CD = (1 - b) * (CD0 + ki * cls * cls) + b * (1.6 * s2 * s2 + CD0);
    }
    return [CL, CD];
  }

  function Sim() {
    this.boat = null; this.scene = null;
    this.s = { x: 0, y: 0, psi: 0, u: 0, v: 0, r: 0, n: 0, delta: 0, thr: 0, t: 0 };
    this.ctl = { lever: 0, rudder: 0, thruster: 0 };      // rudder in Grad (+ = Steuerbord)
    this.env = { windKn: 0, windFrom: 0, curKn: 0, curTo: 90, gust: false };
    this.lines = []; this.nextLineId = 1;
    this.stats = { contacts: 0, maxImpact: 0, maxTension: 0 };
    this.events = [];
    this.lastImpactT = -10;
    this.gustPhase = Math.random() * 100;
    this.dbg = { thrust: 0, walk: 0, rudders: [], wind: [0, 0], thr: 0, windSpeed: 0 };
    this._acc = { Fx: 0, Fy: 0, N: 0 };
  }

  Sim.prototype.setBoat = function (boat) {
    this.boat = boat;
    this.dbg.rudders = boat.rudders.map(() => ({ Fx: 0, Fy: 0, cov: 0, alpha: 0 }));
  };

  Sim.prototype.place = function (x, y, psiDeg) {
    const s = this.s;
    s.x = x; s.y = y; s.psi = psiDeg * Math.PI / 180;
    s.u = s.v = s.r = 0; s.n = 0; s.delta = 0; s.thr = 0; s.t = 0;
    this.ctl.lever = 0; this.ctl.rudder = 0; this.ctl.thruster = 0;
    this.stats = { contacts: 0, maxImpact: 0, maxTension: 0 };
    this.lastImpactT = -10; this.events.length = 0;
  };

  Sim.prototype.cleatWorld = function (cl) {
    const s = this.s, sp = Math.sin(s.psi), cp = Math.cos(s.psi);
    return [s.x + sp * cl.x + cp * cl.y, s.y - cp * cl.x + sp * cl.y];
  };

  Sim.prototype.addLine = function (cleat, pt, opts) {
    opts = opts || {};
    const w = this.cleatWorld(cleat);
    const d = Math.hypot(w[0] - pt.x, w[1] - pt.y);
    const sp = Math.sin(this.s.psi), cp = Math.cos(this.s.psi);
    const dxb = (pt.x - w[0]) * sp - (pt.y - w[1]) * cp;
    const dyb = (pt.x - w[0]) * cp + (pt.y - w[1]) * sp;
    const isAnchor = pt.type === 'anchor';
    const line = {
      id: this.nextLineId++, cleat, pt, T: 0,
      L0: opts.L0 != null ? opts.L0 : d + (opts.slack != null ? opts.slack : 0.4),
      EA: isAnchor ? 300000 : (opts.EA || 40000),
      name: HM.nameLine(cleat, dxb, dyb, pt),
      sag: (this.nextLineId % 2 ? 1 : -1),
      anchor: isAnchor,
    };
    line.L0 = Math.max(0.5, line.L0);
    this.lines.push(line);
    return line;
  };

  Sim.prototype.removeLine = function (id) {
    this.lines = this.lines.filter((l) => l.id !== id);
  };

  Sim.prototype.step = function (dt) {
    const B = this.boat, s = this.s, ctl = this.ctl, env = this.env, P = B.phys;
    const sp = Math.sin(s.psi), cp = Math.cos(s.psi);
    const fx = sp, fy = -cp, sx = cp, sy = sp;
    s.t += dt;

    // ---- Aktuatoren ----
    const lev = ctl.lever;
    const target = Math.abs(lev) < 0.04 ? 0 : Math.sign(lev) * (0.28 + 0.72 * Math.abs(lev));
    s.n += (target - s.n) * Math.min(1, dt / 0.7);
    const dTarget = ctl.rudder * Math.PI / 180;
    const dMax = 0.35 * dt;
    s.delta += Math.max(-dMax, Math.min(dMax, dTarget - s.delta));
    s.thr += (ctl.thruster - s.thr) * Math.min(1, dt / 0.4);

    // ---- Umwelt ----
    let gust = 1;
    if (env.gust) { this.gustPhase += dt; gust = 1 + 0.28 * Math.sin(this.gustPhase * 0.7) * Math.sin(this.gustPhase * 0.23 + 1); }
    const wV = env.windKn * KN * gust, wf = env.windFrom * Math.PI / 180;
    const wvx = -Math.sin(wf) * wV, wvy = Math.cos(wf) * wV;
    const cV = env.curKn * KN, ct = env.curTo * Math.PI / 180;
    const cvx = Math.sin(ct) * cV, cvy = -Math.cos(ct) * cV;
    const cb0 = cvx * fx + cvy * fy, cb1 = cvx * sx + cvy * sy;

    let X = 0, Y = 0, N = 0;

    // ---- Rumpfwiderstand ----
    const ur = s.u - cb0, vr = s.v - cb1;
    const fh = Math.abs(ur) / P.Vh;
    const wave = 1 + 6 * Math.pow(Math.max(0, fh - 0.75), 2);
    X += -(P.c1 * ur + (ur < 0 ? P.c2r : P.c2) * wave * Math.abs(ur) * ur);
    for (const st of B.strips) {
      const vi = vr + s.r * st.x;
      const dY = -0.5 * RHO * st.A * (Math.abs(vi) * vi + P.liftK * Math.abs(ur) * vi);
      Y += dY; N += st.x * dY;
    }
    N += -0.02 * P.m33 * s.r;

    // ---- Propeller ----
    const pr = B.prop;
    let T = 0;
    if (Math.abs(s.n) > 0.01) {
      const dir = s.n > 0 ? 1 : -1, n = Math.abs(s.n);
      const T0 = dir > 0 ? P.Tb : P.Tbr;
      const Vp = (dir > 0 ? P.Vp : P.Vpr) * n;
      const ua = ur * 0.88 * dir;
      const f = Math.max(-0.25, Math.min(1.15, 1 - ua / Vp));
      T = dir * T0 * n * n * f;
    }
    X += T;
    N += -pr.y * T;
    const fade = 1 / (1 + Math.pow(ur / 1.4, 2));
    const Fwalk = P.walk * (T > 0 ? 0.09 : 0.42) * T * fade;   // Radeffekt (seitliche Kraft am Propeller)
    Y += Fwalk; N += pr.x * Fwalk;
    const Tpos = Math.max(T, 0), Tneg = Math.max(-T, 0);
    const jet = Math.sqrt(2 * Tpos / (RHO * pr.A));
    const suc = 0.35 * Math.sqrt(2 * Tneg / (RHO * pr.A));
    const Vs = Math.sqrt(Math.pow(Math.max(ur * 0.9, 0), 2) + jet * jet);

    // ---- Ruder ----
    const dl = s.delta, sd = Math.sin(dl), cd = Math.cos(dl);
    const thc = Math.atan2(sd, -cd);
    const foilF = (flx, fly, area, R, out) => {
      const V2 = flx * flx + fly * fly;
      if (V2 < 1e-6 || area <= 0) return null;
      const V = Math.sqrt(V2);
      const alpha = wrapPi(Math.atan2(fly, flx) - thc);
      const cc = foil(alpha, R.slope, R.AR);
      const q = 0.5 * RHO * area * V2;
      out.Fx += q * (cc[0] * (-fly / V) + cc[1] * (flx / V));
      out.Fy += q * (cc[0] * (flx / V) + cc[1] * (fly / V));
      return alpha;
    };
    for (let i = 0; i < B.rudders.length; i++) {
      const R = B.rudders[i], d = this.dbg.rudders[i];
      const rux = s.u - s.r * R.y - cb0;
      const ruy = s.v + s.r * R.x - cb1;
      const cov = R.cov;
      const out = { Fx: 0, Fy: 0 };
      foilF(-rux, -ruy, R.area * (1 - cov), R, out);
      let al = 0;
      if (cov > 0) {
        let wx;
        if (Tpos > 0) wx = -Math.max(0.75 * Vs, rux);
        else if (Tneg > 0) wx = -rux + suc;
        else wx = -rux;
        const a = foilF(wx, -ruy, R.area * cov, R, out);
        if (a != null) al = a;
      }
      Y += out.Fy; X += out.Fx; N += R.x * out.Fy - R.y * out.Fx;
      d.Fx = out.Fx; d.Fy = out.Fy; d.cov = cov; d.alpha = al;
    }

    // ---- Bugstrahlruder ----
    let Fth = 0;
    if (P.thrF > 0) {
      Fth = s.thr * P.thrF * Math.max(0, 1 - Math.abs(ur) / 2.5);
      Y += Fth; N += P.thrX * Fth;
    }

    // ---- Wind ----
    const wbx = wvx * fx + wvy * fy, wby = wvx * sx + wvy * sy;
    const rx = wbx - s.u, ry = wby - s.v, rv = Math.hypot(rx, ry);
    const Fwx = 0.5 * RHOA * 0.7 * P.Af * rv * rx;
    const Fwy = 0.5 * RHOA * 1.1 * P.As * rv * ry;
    X += Fwx; Y += Fwy; N += P.xw * Fwy;

    // ---- Leinen ----
    const vgx = s.u * fx + s.v * sx, vgy = s.u * fy + s.v * sy;
    let LFx = 0, LFy = 0, LN = 0, maxT = 0;
    for (const ln of this.lines) {
      const cl = ln.cleat, pt = ln.pt;
      const ax = fx * cl.x + sx * cl.y, ay = fy * cl.x + sy * cl.y;
      const px = s.x + ax, py = s.y + ay;
      const dx = px - pt.x, dy = py - pt.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ext = d - ln.L0;
      ln.len = d; ln.px = px; ln.py = py;
      if (ext > 0) {
        const nx = dx / d, ny = dy / d;
        const vpx = vgx - s.r * ay, vpy = vgy + s.r * ax;
        const vn = vpx * nx + vpy * ny;
        const k = ln.EA / Math.max(ln.L0, 1);
        const c = 0.10 * 2 * Math.sqrt(k * P.m11) * Math.min(1, ext / 0.05);
        let Tn = k * ext + c * vn;
        if (Tn < 0) Tn = 0;
        ln.T = Tn;
        const Fx_ = -Tn * nx, Fy_ = -Tn * ny;
        LFx += Fx_; LFy += Fy_; LN += ax * Fy_ - ay * Fx_;
        if (Tn > maxT) maxT = Tn;
        if (ln.anchor && Tn > 2500) {   // Anker slippt
          const sl = Math.min(1, (Tn - 2500) / 2500) * 0.4 * dt;
          pt.x += nx * sl; pt.y += ny * sl;
        }
      } else ln.T = 0;
    }
    if (maxT > this.stats.maxTension) this.stats.maxTension = maxT;
    this.dbg.maxLine = maxT;

    // ---- Kontakte ----
    const acc = this._acc; acc.Fx = 0; acc.Fy = 0; acc.N = 0; acc.close = 0;
    if (this.scene) this._contacts(fx, fy, sx, sy, vgx, vgy, acc);
    if (acc.close > 0.2 && s.t - this.lastImpactT > 1.2) {
      this.lastImpactT = s.t;
      this.stats.contacts++;
      if (acc.close > this.stats.maxImpact) this.stats.maxImpact = acc.close;
      this.events.push({ type: 'impact', speed: acc.close });
    }

    // Weltkräfte -> Körper
    const Fbx = (LFx + acc.Fx) * fx + (LFy + acc.Fy) * fy;
    const Fby = (LFx + acc.Fx) * sx + (LFy + acc.Fy) * sy;
    X += Fbx; Y += Fby; N += LN + acc.N;

    // ---- Bewegungsgleichung ----
    const du = (X + P.m22 * s.v * s.r) / P.m11;
    const dv = (Y - P.m11 * s.u * s.r) / P.m22;
    const dr = (N + (P.m11 - P.m22) * s.u * s.v) / P.m33;
    s.u += du * dt; s.v += dv * dt; s.r += dr * dt;
    if (!(Math.abs(s.u) < 12 && Math.abs(s.v) < 12 && Math.abs(s.r) < 3)) { s.u = s.v = s.r = 0; }
    s.x += (s.u * sp + s.v * cp) * dt;
    s.y += (-s.u * cp + s.v * sp) * dt;
    s.psi += s.r * dt;

    const dbg = this.dbg;
    dbg.thrust = T; dbg.walk = Fwalk; dbg.thr = Fth; dbg.wind = [Fwx, Fwy];
    dbg.windSpeed = wV; dbg.jet = Tpos > 0 ? Vs : 0;
    dbg.fx = fx; dbg.fy = fy; dbg.sx = sx; dbg.sy = sy;
  };

  const KC = 30000, CC = 4000, MU = 0.3;

  Sim.prototype._contacts = function (fx, fy, sx, sy, vgx, vgy, acc) {
    const B = this.boat, s = this.s, sc = this.scene;
    const hp = B.contactPts, n = hp.length;
    if (!this._wx || this._wx.length !== n) {
      this._wx = new Float64Array(n); this._wy = new Float64Array(n);
      this._vx = new Float64Array(n); this._vy = new Float64Array(n);
    }
    const wx = this._wx, wy = this._wy, vx = this._vx, vy = this._vy;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < n; i++) {
      const ax = fx * hp[i][0] + sx * hp[i][1], ay = fy * hp[i][0] + sy * hp[i][1];
      wx[i] = s.x + ax; wy[i] = s.y + ay;
      vx[i] = vgx - s.r * ay; vy[i] = vgy + s.r * ax;
      if (wx[i] < bx0) bx0 = wx[i]; if (wx[i] > bx1) bx1 = wx[i];
      if (wy[i] < by0) by0 = wy[i]; if (wy[i] > by1) by1 = wy[i];
    }
    const apply = (px, py, nx, ny, depth, closing, vpx, vpy) => {
      let mag = KC * depth + CC * Math.max(0, closing);
      if (mag > 2e5) mag = 2e5;
      let Fx = nx * mag, Fy = ny * mag;
      const vn = vpx * nx + vpy * ny;
      const tx = vpx - vn * nx, ty = vpy - vn * ny, tl = Math.hypot(tx, ty);
      const k = -MU * mag / (tl + 0.05);
      Fx += tx * k; Fy += ty * k;
      acc.Fx += Fx; acc.Fy += Fy;
      acc.N += (px - s.x) * Fy - (py - s.y) * Fx;
      if (closing > acc.close) acc.close = closing;
    };
    const hull = B.hull, hnx = B.hnx, hny = B.hny, hn = hull.length;

    for (const ob of sc.obstacles) {
      if (ob.type === 'circle') {
        if (ob.x + ob.r < bx0 || ob.x - ob.r > bx1 || ob.y + ob.r < by0 || ob.y - ob.r > by1) continue;
        for (let i = 0; i < n; i++) {
          const dx = wx[i] - ob.x, dy = wy[i] - ob.y, d = Math.hypot(dx, dy);
          if (d < ob.r) {
            const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
            apply(wx[i], wy[i], nx, ny, ob.r - d, -(vx[i] * nx + vy[i] * ny), vx[i], vy[i]);
          }
        }
        // Pfahl gegen Rumpfkante
        const rbx = (ob.x - s.x) * fx + (ob.y - s.y) * fy, rby = (ob.x - s.x) * sx + (ob.y - s.y) * sy;
        let best = -1e9, bi = -1;
        for (let i = 0; i < hn; i++) {
          const sd = hnx[i] * (rbx - hull[i][0]) + hny[i] * (rby - hull[i][1]);
          if (sd > best) { best = sd; bi = i; }
        }
        if (best < ob.r) {
          const nwx = hnx[bi] * fx + hny[bi] * sx, nwy = hnx[bi] * fy + hny[bi] * sy;
          const ax = ob.x - s.x, ay = ob.y - s.y;
          const vpx = vgx - s.r * ay, vpy = vgy + s.r * ax;
          apply(ob.x, ob.y, -nwx, -nwy, ob.r - best, vpx * nwx + vpy * nwy, vpx, vpy);
        }
      } else {
        if (ob.x1 < bx0 || ob.x0 > bx1 || ob.y1 < by0 || ob.y0 > by1) continue;
        const m = ob.pts.length;
        for (let i = 0; i < n; i++) {
          const px = wx[i], py = wy[i];
          if (px < ob.x0 || px > ob.x1 || py < ob.y0 || py > ob.y1) continue;
          let best = -1e9, bi = -1, out = false;
          for (let j = 0; j < m; j++) {
            const sd = ob.nx[j] * (px - ob.pts[j][0]) + ob.ny[j] * (py - ob.pts[j][1]);
            if (sd > 0) { out = true; break; }
            if (sd > best) { best = sd; bi = j; }
          }
          if (out) continue;
          const nx = ob.nx[bi], ny = ob.ny[bi];
          apply(px, py, nx, ny, -best, -(vx[i] * nx + vy[i] * ny), vx[i], vy[i]);
        }
        // Ecken des Hindernisses im Rumpf
        for (let j = 0; j < m; j++) {
          const qx = ob.pts[j][0], qy = ob.pts[j][1];
          if (qx < bx0 || qx > bx1 || qy < by0 || qy > by1) continue;
          const rbx = (qx - s.x) * fx + (qy - s.y) * fy, rby = (qx - s.x) * sx + (qy - s.y) * sy;
          let best = -1e9, bi = -1, out = false;
          for (let i = 0; i < hn; i++) {
            const sd = hnx[i] * (rbx - hull[i][0]) + hny[i] * (rby - hull[i][1]);
            if (sd > 0) { out = true; break; }
            if (sd > best) { best = sd; bi = i; }
          }
          if (out) continue;
          const nwx = hnx[bi] * fx + hny[bi] * sx, nwy = hnx[bi] * fy + hny[bi] * sy;
          const ax = qx - s.x, ay = qy - s.y;
          const vpx = vgx - s.r * ay, vpy = vgy + s.r * ax;
          apply(qx, qy, -nwx, -nwy, -best, vpx * nwx + vpy * nwy, vpx, vpy);
        }
      }
    }
  };

  HM.Sim = Sim;
  HM.KN = KN;
})();
