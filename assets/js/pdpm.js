/* PDPM window figures: the morphing datapath, the depth trade-off, clock plans over 300 kernels,
   the ratio decision, and phase traces. Data in pdpm-data.js (from the pdpm-riscv results). */
(() => {
  const D = window.PDPM_DATA;
  const NS = 'http://www.w3.org/2000/svg';
  const COL = { P3: '#B5453F', P5: '#5BA55B', P7: '#1F4E79' };
  const TINT = { P3: '#F6E3E1', P5: '#E5F2E4', P7: '#E1E9F2' };
  const NAME = { P3: '3 stages', P5: '5 stages', P7: '7 stages' };
  const DEPTHS = ['P3', 'P5', 'P7'];
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', { x, y, ...attrs }, parent); t.textContent = s; return t; };
  const svgRoot = (host, w, h, label, minw) => {
    const s = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label });
    if (minw) s.style.minWidth = minw + 'px';
    host.appendChild(s);
    return s;
  };
  const marker = (parent, d, x, y, r, extra = {}) => {
    if (d === 'P3') return el('circle', { cx: x, cy: y, r, fill: COL.P3, ...extra }, parent);
    if (d === 'P5') return el('rect', { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, fill: COL.P5, ...extra }, parent);
    if (d === 'P7') return el('path', { d: `M${x} ${y - r * 1.15} L${x + r * 1.1} ${y + r * 0.8} L${x - r * 1.1} ${y + r * 0.8}Z`, fill: COL.P7, ...extra }, parent);
    return el('path', { d: `M${x} ${y - r * 1.2} L${x + r * 1.1} ${y} L${x} ${y + r * 1.2} L${x - r * 1.1} ${y}Z`, fill: '#15171a', ...extra }, parent);
  };
  // run fn once (and keep calling onShow/onHide) when the host scrolls into view inside its window
  const watch = (node, onShow, onHide) => {
    if (!('IntersectionObserver' in window)) { onShow(); return; }
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? onShow() : onHide && onHide())), { threshold: 0.35 }).observe(node);
  };
  const seg = (host, items, onPick) => {
    const bar = document.createElement('div');
    bar.className = 'pdpm-seg';
    bar.setAttribute('role', 'group');
    const btns = items.map(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.key = key;
      b.addEventListener('click', () => onPick(key, true));
      bar.appendChild(b);
      return b;
    });
    host.prepend(bar);
    return (key) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
  };

  /* ---------------------------------------------------------------- 1. the morphing datapath */
  const morph = (host) => {
    const W = 760, H = 236;
    const s = svgRoot(host, W, H, 'Animated seven-stage pipeline. Instructions flow through IF1, IF2, ID, EX1, EX2, MEM and WB; bypass multiplexers make registers transparent to form three or five stages; on a switch, fetch holds and the pipeline drains before the depth changes.', 600);
    const ST = ['IF1', 'IF2', 'ID', 'EX1', 'EX2', 'MEM', 'WB'];
    const BW = 74, GAP = 26, X0 = 34, BY = 74, BH = 58;
    const bx = (i) => X0 + i * (BW + GAP);
    const bc = (i) => bx(i) + BW / 2;
    const rx = (i) => bx(i) + BW + GAP / 2;            // register i sits between stage i and i+1
    // which registers are transparent, the stage groups, branch-resolve slot, flush penalty, clock
    const MODES = {
      P3: { tr: [0, 2, 3, 5], groups: [[0, 1, 'IF'], [2, 4, 'ID + EX'], [5, 6, 'MEM + WB']], resolve: 1, pen: 1, clk: 1.1, regs: 2 },
      P5: { tr: [0, 3], groups: [[0, 1, 'IF'], [2, 2, 'ID'], [3, 4, 'EX'], [5, 5, 'MEM'], [6, 6, 'WB']], resolve: 2, pen: 2, clk: 1.3, regs: 4 },
      P7: { tr: [], groups: ST.map((n, i) => [i, i, n]), resolve: 4, pen: 5, clk: 1.5, regs: 6 },
    };
    const BYP = [0, 2, 3, 5];                            // registers that have a bypass multiplexer

    const gTop = el('g', {}, s);
    const modeT = txt(gTop, 34, 26, '', { class: 'ttl' });
    const infoT = [txt(gTop, 520, 26, '', { class: 'tk', 'text-anchor': 'end' }), txt(gTop, 650, 26, '', { class: 'tk', 'text-anchor': 'end' }), txt(gTop, 726, 26, '', { class: 'tk', 'text-anchor': 'end' })];
    const stateT = txt(gTop, 34, 46, '', { class: 'ref' });

    const gStage = el('g', {}, s);
    ST.forEach((n, i) => {
      el('rect', { x: bx(i), y: BY, width: BW, height: BH, rx: 3, fill: '#fff', stroke: '#cbc7bd' }, gStage);
      txt(gStage, bc(i), BY + BH - 8, n, { class: 'tk', 'text-anchor': 'middle' });
    });
    // bypass wires over the four multiplexed registers
    const byp = BYP.map((r) => {
      const g = el('g', { class: 'pdpm-byp' }, s);
      const x0 = rx(r) - GAP / 2 - 10, x1 = rx(r) + GAP / 2 + 10;
      el('path', { d: `M${x0} ${BY} L${x0} ${BY - 12} L${x1} ${BY - 12} L${x1} ${BY}`, fill: 'none' }, g);
      el('path', { d: `M${x1 - 5} ${BY - 18} L${x1 + 5} ${BY - 18} L${x1 + 3} ${BY - 6} L${x1 - 3} ${BY - 6}Z` }, g);
      return { r, g };
    });
    const regs = ST.slice(0, 6).map((_, i) => el('rect', { x: rx(i) - 4, y: BY - 4, width: 8, height: BH + 8, rx: 1.5, class: 'pdpm-reg' }, s));
    const gBr = el('g', {}, s);
    const gTok = el('g', {}, s);
    txt(s, 34, 222, 'ALU', { class: 'tk' }); el('circle', { cx: 24, cy: 218, r: 5, class: 'tok tok--alu' }, s);
    el('circle', { cx: 84, cy: 218, r: 5, class: 'tok tok--mem' }, s); txt(s, 94, 222, 'load/store', { class: 'tk' });
    el('circle', { cx: 174, cy: 218, r: 5, class: 'tok tok--br' }, s); txt(s, 184, 222, 'taken branch', { class: 'tk' });
    el('circle', { cx: 278, cy: 218, r: 5, class: 'tok tok--sq' }, s); txt(s, 288, 222, 'flushed', { class: 'tk' });

    let mode = 'P5', want = null, draining = false, hold = 0;
    let slots = [];                                      // token or null per group
    let seq = 0, retired = 0, timer = null, running = false, auto = true, autoAt = 0;
    const kinds = 'aamabaaamaabaaamabaamaaab';            // a ALU, m load/store, b taken branch

    const groupX = (m, k) => { const [a, b] = MODES[m].groups[k]; return (bc(a) + bc(b)) / 2; };
    const drawMode = () => {
      const M = MODES[mode];
      regs.forEach((r, i) => r.classList.toggle('is-off', M.tr.includes(i)));
      byp.forEach(({ r, g }) => g.classList.toggle('is-on', M.tr.includes(r)));
      gBr.replaceChildren();
      M.groups.forEach(([a, b, n]) => {
        const x0 = bx(a) + 2, x1 = bx(b) + BW - 2, y = BY + BH + 16;
        el('path', { d: `M${x0} ${y - 6} L${x0} ${y} L${x1} ${y} L${x1} ${y - 6}`, fill: 'none', stroke: COL[mode], 'stroke-width': 1.6 }, gBr);
        txt(gBr, (x0 + x1) / 2, y + 18, n, { class: 'lb', 'text-anchor': 'middle', fill: COL[mode] }).style.fill = COL[mode];
      });
      modeT.textContent = NAME[mode];
      modeT.style.fill = COL[mode];
      infoT[0].textContent = `${M.regs} pipeline registers`;
      infoT[1].textContent = `${M.pen}-cycle branch flush`;
      infoT[2].textContent = `clock ${M.clk}×`;
      slots = new Array(M.groups.length).fill(null);
    };
    const place = (t, x, fade) => {
      t.node.style.transform = `translate(${x}px, ${BY + 24}px)`;
      if (fade) t.node.style.opacity = '0';
    };
    const newTok = () => {
      const k = kinds[seq % kinds.length];
      seq += 1;
      const node = el('circle', { cx: 0, cy: 0, r: 9, class: 'tok ' + (k === 'a' ? 'tok--alu' : k === 'm' ? 'tok--mem' : 'tok--br') }, gTok);
      node.style.transform = `translate(${groupX(mode, 0) - 40}px, ${BY + 24}px)`;
      node.style.opacity = '0';
      return { node, k, sq: false };
    };
    const period = () => 640 / MODES[mode].clk;
    const tick = () => {
      const M = MODES[mode];
      const dur = period();
      gTok.style.setProperty('--dur', Math.round(dur * 0.62) + 'ms');
      // retire the last slot
      const last = slots[slots.length - 1];
      if (last) {
        place(last, groupX(mode, slots.length - 1) + 60, true);
        if (!last.sq) retired += 1;
        setTimeout(() => last.node.remove(), dur);
      }
      for (let k = slots.length - 1; k > 0; k -= 1) slots[k] = slots[k - 1];
      slots[0] = null;
      if (!draining && hold === 0) slots[0] = newTok();
      else if (hold > 0) hold -= 1;
      // a taken branch that reaches the resolve slot flushes everything younger
      const br = slots[M.resolve];
      if (br && br.k === 'b' && !br.sq) {
        let n = 0;
        for (let k = 0; k < M.resolve; k += 1) if (slots[k] && !slots[k].sq) { slots[k].sq = true; slots[k].node.setAttribute('class', 'tok tok--sq'); n += 1; }
        hold = Math.max(0, M.pen - M.resolve);
      }
      slots.forEach((t, k) => { if (t) { t.node.style.opacity = '1'; place(t, groupX(mode, k)); } });
      if (draining) {
        stateT.textContent = `switching to ${NAME[want]}: fetch held, draining`;
        if (slots.every((t) => !t)) {
          mode = want; want = null; draining = false;
          drawMode();
          stateT.textContent = '';
        }
      }
      if (auto && !draining && Date.now() > autoAt) {
        autoAt = Date.now() + 7600;
        request({ P5: 'P7', P7: 'P3', P3: 'P5' }[mode], false);
      }
      timer = setTimeout(tick, dur);
    };
    let mark = () => {};
    const request = (m, byUser) => {
      if (byUser) auto = false;
      mark(m);
      if (still) { mode = m; drawMode(); return; }
      if (m === mode && !draining) return;
      want = m; draining = true; hold = 0;
    };
    mark = seg(host, DEPTHS.map((d) => [d, NAME[d]]), request);
    drawMode();
    mark(mode);
    if (still) return;
    watch(host, () => { if (!running) { running = true; autoAt = Date.now() + 6000; tick(); } },
      () => { running = false; clearTimeout(timer); });
  };

  /* ---------------------------------------------------------------- 2. the depth trade-off */
  const tradeoff = (host) => {
    const W = 760, H = 330, X0 = 64, X1 = 640, Y0 = 22, Y1 = 270, BMAX = 40, EMIN = 0.6, EMAX = 1.5;
    const s = svgRoot(host, W, H, 'Effective time of 3, 5 and 7 stages against the taken-branch fraction. Seven stages are fastest below about 6 percent, three stages above about 22 percent.', 560);
    const x = (b) => X0 + (X1 - X0) * b / BMAX;
    const y = (e) => Y1 - (Y1 - Y0) * (e - EMIN) / (EMAX - EMIN);
    const E = { P3: (b) => (1 + b / 100) / 1.1, P5: (b) => (1 + 2 * b / 100) / 1.3, P7: (b) => (1 + 5 * b / 100) / 1.5 };
    const b57 = 20 / 3.5, b35 = 20 / 0.9;
    [[0, b57, 'P7'], [b57, b35, 'P5'], [b35, BMAX, 'P3']].forEach(([a, b, d]) => el('rect', { x: x(a), y: Y0, width: x(b) - x(a), height: Y1 - Y0, fill: TINT[d] }, s));
    [0.6, 0.8, 1.0, 1.2, 1.4].forEach((v) => { el('line', { x1: X0, x2: X1, y1: y(v), y2: y(v), class: 'grid' }, s); txt(s, X0 - 8, y(v) + 4, v.toFixed(1), { class: 'tk', 'text-anchor': 'end' }); });
    [0, 10, 20, 30, 40].forEach((v) => txt(s, x(v), Y1 + 18, v + '%', { class: 'tk', 'text-anchor': 'middle' }));
    el('line', { x1: X0, x2: X1, y1: Y1, y2: Y1, stroke: '#3d4046' }, s);
    txt(s, (X0 + X1) / 2, Y1 + 40, 'taken-branch fraction B', { class: 'lb', 'text-anchor': 'middle' });
    const yl = txt(s, 0, 0, 'effective time per instruction (relative)', { class: 'lb', 'text-anchor': 'middle' });
    yl.setAttribute('transform', `translate(16 ${(Y0 + Y1) / 2}) rotate(-90)`);
    el('clipPath', { id: 'pdpm-clip-t' }, s).appendChild(el('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0 }));
    const lines = {};
    DEPTHS.forEach((d) => {
      let p = '';
      for (let b = 0; b <= BMAX; b += 0.5) p += (b ? 'L' : 'M') + x(b).toFixed(1) + ' ' + y(E[d](b)).toFixed(1);
      lines[d] = el('path', { d: p, fill: 'none', stroke: COL[d], 'stroke-width': 3, 'clip-path': 'url(#pdpm-clip-t)', class: 'pdpm-draw', pathLength: 1 }, s);
    });
    txt(s, X1 + 8, y(E.P3(40)) + 4, '3 stages', { class: 'lb' }).style.fill = COL.P3;
    txt(s, X1 + 8, y(E.P5(40)) + 4, '5 stages', { class: 'lb' }).style.fill = COL.P5;
    txt(s, x(25.6), y(1.44), '7 stages', { class: 'lb' }).style.fill = COL.P7;
    [[b57, '≈ 6%'], [b35, '≈ 22%']].forEach(([b, l]) => {
      el('line', { x1: x(b), x2: x(b), y1: Y1, y2: y(E.P5(b)), stroke: '#6a6d74', 'stroke-dasharray': '3 3' }, s);
      el('circle', { cx: x(b), cy: y(E.P5(b)), r: 4.5, fill: '#fff', stroke: '#15171a', 'stroke-width': 1.6 }, s);
      txt(s, x(b) + 6, Y1 - 8, l, { class: 'tk' });
    });
    const cur = el('g', { class: 'pdpm-cursor' }, s);
    const cl = el('line', { y1: Y0, y2: Y1, stroke: '#15171a', 'stroke-width': 1 }, cur);
    const dots = {}, vals = {};
    DEPTHS.forEach((d) => { dots[d] = el('circle', { r: 5.5, fill: COL[d], stroke: '#fff', 'stroke-width': 2 }, cur); vals[d] = txt(cur, 0, 0, '', { class: 'val' }); });
    const read = txt(s, X1, Y0 - 6, '', { class: 'ttl', 'text-anchor': 'end' });
    const ctl = document.createElement('label');
    ctl.className = 'pdpm-range';
    ctl.innerHTML = '<span>Taken-branch fraction</span><input type="range" min="0" max="40" step="0.5" value="12"><output></output>';
    host.appendChild(ctl);
    const inp = ctl.querySelector('input'), out = ctl.querySelector('output');
    let touched = false;
    const set = (b) => {
      b = Math.max(0, Math.min(BMAX, b));
      inp.value = b;
      out.textContent = (+b).toFixed(1) + '%';
      cl.setAttribute('x1', x(b)); cl.setAttribute('x2', x(b));
      let best = 'P3';
      DEPTHS.forEach((d) => {
        const e = E[d](b);
        if (e < E[best](b)) best = d;
        const cy = Math.max(Y0, Math.min(Y1, y(e)));
        dots[d].setAttribute('cx', x(b)); dots[d].setAttribute('cy', cy);
        dots[d].style.opacity = e > EMAX ? 0 : 1;
        vals[d].setAttribute('x', x(b) + (b > 33 ? -10 : 10)); vals[d].setAttribute('y', cy + 4);
        vals[d].setAttribute('text-anchor', b > 33 ? 'end' : 'start');
        vals[d].textContent = e > EMAX ? '' : e.toFixed(2);
      });
      const lab = DEPTHS.filter((d) => vals[d].textContent).map((d) => ({ d, y: +vals[d].getAttribute('y') })).sort((p, q) => p.y - q.y);
      for (let i = 1; i < lab.length; i += 1) if (lab[i].y - lab[i - 1].y < 15) lab[i].y = lab[i - 1].y + 15;
      lab.forEach(({ d, y: yy }) => vals[d].setAttribute('y', yy));
      read.textContent = `fastest at ${(+b).toFixed(1)}%: ${NAME[best]}`;
      read.style.fill = COL[best];
    };
    inp.addEventListener('input', () => { touched = true; set(+inp.value); });
    const fromPointer = (e) => {
      const r = s.getBoundingClientRect();
      const px = (e.clientX - r.left) * W / r.width;
      touched = true;
      set(Math.round((px - X0) / (X1 - X0) * BMAX * 2) / 2);
    };
    s.addEventListener('pointerdown', (e) => { fromPointer(e); s.setPointerCapture(e.pointerId); });
    s.addEventListener('pointermove', (e) => { if (e.buttons) fromPointer(e); });
    s.style.touchAction = 'pan-y';
    set(12);
    if (still) return;
    let played = false;
    s.classList.add('is-hidden');
    watch(host, () => {
      if (played) return;
      played = true;
      s.classList.remove('is-hidden');
      const t0 = performance.now();
      const sweep = (t) => {
        if (touched) return;
        const u = Math.min(1, (t - t0) / 4200);
        set(u < 0.7 ? 40 * (u / 0.7) : 40 - 28 * ((u - 0.7) / 0.3));
        if (u < 1) requestAnimationFrame(sweep);
      };
      setTimeout(() => requestAnimationFrame(sweep), 900);
    });
  };

  /* ---------------------------------------------------------------- 3. clock plans over 300 kernels */
  const PLAN = {
    one: { label: 'One clock', sub: '1 : 1 : 1', ovh: { P3: 0.150, P5: 6.124, P7: 20.640, H: 0.064 }, hl: '0.06' },
    meas: { label: 'Measured FPGA clocks', sub: '87 : 97 : 101 MHz', ovh: { P3: 5.695, P5: 0.318, P7: 9.504, H: 0.055 }, hl: '0.06' },
    anal: { label: 'Deeper clocks faster', sub: '1.1 : 1.3 : 1.5', ovh: { P3: 15.111, P5: 3.048, P7: 1.280, H: 0.673 }, hl: '0.67' },
  };
  const fmt = (v) => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
  const plans = (host) => {
    const W = 760, H = 270, RX0 = 40, RX1 = 720, RY = 58, RH = 64;
    const s = svgRoot(host, W, H, 'The 300 deployment kernels colored by fastest depth under three clock plans, and the mean time above the per-kernel best for each fixed depth and for PDPM.', 600);
    const ks = D.kernels.map(([n, c3, c5, c7]) => ({ n, r3: c3 / c5, r7: c7 / c5 }))
      .sort((a, b) => (a.r7 - a.r3) - (b.r7 - b.r3));
    const cw = (RX1 - RX0) / ks.length;
    const cols = ks.map((k, i) => {
      const r = el('rect', { x: RX0 + i * cw, y: RY, width: cw + 0.35, height: RH, class: 'pdpm-col' }, s);
      r.style.transitionDelay = (i * 2.2) + 'ms';
      const t = el('title', {}, r); t.textContent = k.n;
      return r;
    });
    const leg = {};
    let lx = RX0;
    DEPTHS.forEach((d) => {
      el('rect', { x: lx, y: 22, width: 12, height: 12, fill: COL[d] }, s);
      leg[d] = txt(s, lx + 18, 32, '', { class: 'lb' });
      lx += 150;
    });
    txt(s, RX1, 32, '300 kernels, one column each', { class: 'tk', 'text-anchor': 'end' });
    // overhead strip, log scale
    const AX0 = 150, AX1 = 720, AY = 196, LMIN = Math.log10(0.03), LMAX = Math.log10(30);
    const ax = (v) => AX0 + (AX1 - AX0) * (Math.log10(v) - LMIN) / (LMAX - LMIN);
    txt(s, 0, AY - 26, 'Time above the', { class: 'lb' });
    txt(s, 0, AY - 10, 'per-kernel best', { class: 'lb' });
    el('line', { x1: AX0, x2: AX1, y1: AY, y2: AY, stroke: '#cbc7bd', 'stroke-width': 2 }, s);
    [0.1, 1, 10].forEach((v) => { el('line', { x1: ax(v), x2: ax(v), y1: AY - 34, y2: AY + 6, class: 'grid' }, s); txt(s, ax(v), AY + 52, v + '%', { class: 'tk', 'text-anchor': 'middle' }); });
    const mk = {};
    ['P3', 'P5', 'P7', 'H'].forEach((d) => {
      const g = el('g', { class: 'pdpm-slide' }, s);
      marker(g, d === 'H' ? 'H' : d, 0, 0, d === 'H' ? 8 : 7, { stroke: '#fff', 'stroke-width': 1.5 });
      const v = txt(g, 0, d === 'H' ? 30 : -14, '', { class: 'val', 'text-anchor': 'middle' });
      if (d === 'H') { const n = txt(g, 0, -16, 'PDPM', { class: 'val', 'text-anchor': 'middle' }); n.style.fill = '#15171a'; }
      const ring = el('circle', { r: 13, fill: 'none', stroke: '#15171a', 'stroke-width': 1.3, opacity: 0 }, g);
      mk[d] = { g, v, ring };
    });
    txt(s, AX1, AY + 70, 'PDPM: weights frozen, two constants changed per plan', { class: 'ref', 'text-anchor': 'end' });
    let cur = null, auto = true, timer = null;
    const count = (node, d, to) => {
      const from = +(node.dataset.n || 0);
      node.dataset.n = to;
      if (still) { node.textContent = `${NAME[d]}  ${to}`; return; }
      const t0 = performance.now();
      const step = (t) => {
        const u = Math.min(1, (t - t0) / 700);
        node.textContent = `${NAME[d]}  ${Math.round(from + (to - from) * u)}`;
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    let mark = () => {};
    const show = (p, byUser) => {
      if (byUser) { auto = false; clearTimeout(timer); }
      cur = p;
      mark(p);
      const a = D.plans[p];
      const split = { P3: 0, P5: 0, P7: 0 };
      ks.forEach((k, i) => {
        const t = { P3: k.r3 / a[0], P5: 1 / a[1], P7: k.r7 / a[2] };
        const best = DEPTHS.reduce((m, d) => (t[d] < t[m] ? d : m), 'P3');
        split[best] += 1;
        cols[i].style.fill = COL[best];
      });
      DEPTHS.forEach((d) => count(leg[d], d, split[d]));
      const o = PLAN[p].ovh;
      const bestFixed = DEPTHS.reduce((m, d) => (o[d] < o[m] ? d : m), 'P3');
      ['P3', 'P5', 'P7', 'H'].forEach((d) => {
        mk[d].g.style.transform = `translate(${ax(o[d])}px, ${AY}px)`;
        mk[d].v.textContent = d === 'H' ? PLAN[p].hl + '%' : fmt(o[d]) + '%';
        mk[d].ring.setAttribute('opacity', d === bestFixed ? 1 : 0);
      });
    };
    mark = seg(host, Object.keys(PLAN).map((k) => [k, `${PLAN[k].label} (${PLAN[k].sub})`]), show);
    show('one');
    if (still) return;
    let started = false;
    watch(host, () => {
      if (started) return;
      started = true;
      const order = ['meas', 'anal'];
      const next = (i) => { timer = setTimeout(() => { if (!auto) return; show(order[i]); if (i + 1 < order.length) next(i + 1); }, 3200); };
      next(0);
    });
  };

  /* ---------------------------------------------------------------- 4. twelve choices, two ratios */
  const decide = (host) => {
    const k = D.kernels.find((r) => r[0] === 'gemv_q4_group');
    const [, c3, c5, c7] = k;
    const r3 = c3 / c5, r7 = c7 / c5;
    const W = 760, H = 300;
    const s = svgRoot(host, W, H, 'Left: twelve depth and clock choices for the gemv_q4_group kernel, nine of them dominated. Right: the two predicted cycle ratios divided by each clock plan, with the smallest chosen.', 640);
    // left: execution time against clock rung, relative to five stages at 1.3x
    const LX0 = 64, LX1 = 330, LY0 = 40, LY1 = 240, TMIN = 0.9, TMAX = 1.45;
    const rungs = [1.0, 1.1, 1.3, 1.5], cap = { P3: 1.1, P5: 1.3, P7: 1.5 }, cyc = { P3: c3, P5: c5, P7: c7 };
    const lx = (i) => LX0 + 20 + i * ((LX1 - LX0 - 40) / 3);
    const ly = (t) => LY1 - (LY1 - LY0) * (t - TMIN) / (TMAX - TMIN);
    txt(s, LX0, 20, 'Twelve (depth, clock) choices', { class: 'ttl' });
    [1.0, 1.2, 1.4].forEach((v) => { el('line', { x1: LX0, x2: LX1, y1: ly(v), y2: ly(v), class: 'grid' }, s); txt(s, LX0 - 8, ly(v) + 4, v.toFixed(1), { class: 'tk', 'text-anchor': 'end' }); });
    rungs.forEach((r, i) => txt(s, lx(i), LY1 + 18, r.toFixed(1) + '×', { class: 'tk', 'text-anchor': 'middle' }));
    txt(s, (LX0 + LX1) / 2, LY1 + 38, 'clock rung', { class: 'lb', 'text-anchor': 'middle' });
    const yl = txt(s, 0, 0, 'time (relative)', { class: 'lb', 'text-anchor': 'middle' });
    yl.setAttribute('transform', `translate(18 ${(LY0 + LY1) / 2}) rotate(-90)`);
    const pts = [];
    DEPTHS.forEach((d) => {
      let p = '';
      rungs.forEach((r, i) => {
        const t = cyc[d] / Math.min(r, cap[d]) / (c5 / 1.3);
        p += (i ? 'L' : 'M') + lx(i) + ' ' + ly(t);
        pts.push({ d, i, t, keep: r === cap[d] });
      });
      el('path', { d: p, fill: 'none', stroke: COL[d], 'stroke-width': 1.2, opacity: 0.45 }, s);
    });
    const ptNodes = pts.map((p) => {
      const g = el('g', { class: 'pdpm-pt' }, s);
      g.style.transform = `translate(${lx(p.i) + (p.d === 'P3' ? -6 : p.d === 'P7' ? 6 : 0)}px, ${ly(p.t)}px)`;
      marker(g, p.d, 0, 0, 6, { stroke: '#fff', 'stroke-width': 1.3 });
      if (p.keep) el('circle', { r: 11, fill: 'none', stroke: '#15171a', 'stroke-width': 1.2, class: 'pdpm-keep' }, g);
      return { g, keep: p.keep };
    });
    txt(s, LX0, LY1 + 58, 'Nine are dominated: a slower clock never helps fixed cycles.', { class: 'ref' });
    // right: the two ratios divided by the plan, on one axis
    const RX0 = 420, RX1 = 730, EMIN = 0.85, EMAX = 1.2;
    const rx = (e) => RX0 + (RX1 - RX0) * (e - EMIN) / (EMAX - EMIN);
    txt(s, RX0, 20, 'Ratios divided by the clock plan', { class: 'ttl' });
    const rowY = { P3: 92, P5: 142, P7: 192 };
    [0.9, 1.0, 1.1, 1.2].forEach((v) => { el('line', { x1: rx(v), x2: rx(v), y1: 64, y2: 214, class: 'grid' }, s); txt(s, rx(v), 232, v.toFixed(1), { class: 'tk', 'text-anchor': 'middle' }); });
    txt(s, (RX0 + RX1) / 2, 252, 'effective time, relative to 5 stages', { class: 'lb', 'text-anchor': 'middle' });
    const eq = { P3: `C3/C5 = ${r3.toFixed(3)}`, P5: '1', P7: `C7/C5 = ${r7.toFixed(3)}` };
    const rows = {};
    DEPTHS.forEach((d) => {
      txt(s, RX0 - 12, rowY[d] - 3, NAME[d], { class: 'lb', 'text-anchor': 'end' }).style.fill = COL[d];
      txt(s, RX0 - 12, rowY[d] + 13, eq[d], { class: 'tk', 'text-anchor': 'end' });
      el('line', { x1: RX0, x2: RX1, y1: rowY[d], y2: rowY[d], stroke: '#e3e0d8' }, s);
      const g = el('g', { class: 'pdpm-slide' }, s);
      marker(g, d, 0, 0, 7, { stroke: '#fff', 'stroke-width': 1.5 });
      const v = txt(g, 0, -18, '', { class: 'val', 'text-anchor': 'middle' });
      const ring = el('circle', { r: 13, fill: 'none', stroke: '#15171a', 'stroke-width': 1.4, opacity: 0 }, g);
      rows[d] = { g, v, ring };
    });
    const win = txt(s, RX1, 280, '', { class: 'ttl', 'text-anchor': 'end' });
    let mark = () => {};
    let auto = true, timer = null;
    const show = (p, byUser) => {
      if (byUser) { auto = false; clearTimeout(timer); }
      mark(p);
      const a = D.plans[p];
      const e = { P3: r3 / (a[0] / a[1]), P5: 1, P7: r7 / (a[2] / a[1]) };
      const best = DEPTHS.reduce((m, d) => (e[d] < e[m] ? d : m), 'P3');
      DEPTHS.forEach((d) => {
        rows[d].g.style.transform = `translate(${rx(e[d])}px, ${rowY[d]}px)`;
        rows[d].v.textContent = e[d].toFixed(3);
        rows[d].ring.setAttribute('opacity', d === best ? 1 : 0);
      });
      win.textContent = `smallest: ${NAME[best]}`;
      win.style.fill = COL[best];
    };
    mark = seg(host, Object.keys(PLAN).map((kk) => [kk, PLAN[kk].label]), show);
    show('one');
    if (still) { ptNodes.forEach((n) => { if (!n.keep) n.g.classList.add('is-dom'); }); return; }
    ptNodes.forEach((n) => n.g.classList.add('is-in'));
    s.classList.add('is-waiting');
    let started = false;
    watch(host, () => {
      if (started) return;
      started = true;
      s.classList.remove('is-waiting');
      ptNodes.forEach((n, i) => { n.g.style.transitionDelay = (i * 70) + 'ms'; });
      setTimeout(() => ptNodes.forEach((n) => { n.g.style.transitionDelay = '0ms'; if (!n.keep) n.g.classList.add('is-dom'); }), 1700);
      const order = ['meas', 'anal'];
      const next = (i) => { timer = setTimeout(() => { if (!auto) return; show(order[i]); if (i + 1 < order.length) next(i + 1); }, 3000); };
      setTimeout(() => next(0), 1500);
    });
  };

  /* ---------------------------------------------------------------- 5. phase traces */
  const traces = (host) => {
    const rows = D.trace;
    const W = 760, X0 = 170, X1 = 690, LH = 13, LG = 4, RG = 34, TOP = 44;
    const H = TOP + rows.length * (2 * LH + LG + RG) + 30;
    const s = svgRoot(host, W, H, 'Depth over time inside unseen pipelines: fastest depth per phase against the depth the head served, for the SSM block and for speech 2 under three clock plans.', 620);
    const x = (p) => X0 + (X1 - X0) * p / 100;
    const planName = { 'one clock': 'one clock', 'per-mode': 'measured FPGA clocks', 'depth-scaled': 'deeper clocks faster' };
    const names = { 'SSM block': [['in proj', 1.06, 19.48], ['causal conv1d', 19.48, 67.35], ['selective scan', 67.35, 99.38]],
      'speech 2': [['FFT + mel', 0.78, 50.89], ['GRU', 71.49, 99.77]] };
    el('clipPath', { id: 'pdpm-clip-r' }, s).appendChild(el('rect', { x: X0, y: 0, width: X1 - X0, height: H, class: 'pdpm-reveal' }));
    const body = el('g', { 'clip-path': 'url(#pdpm-clip-r)' }, s);
    let y = TOP;
    rows.forEach((r, i) => {
      if (i === 0 || r.prog !== rows[i - 1].prog) {
        names[r.prog].forEach(([n, a, b]) => txt(s, x((a + b) / 2), y - 6, n, { class: 'tk', 'text-anchor': 'middle' }));
      }
      txt(s, 0, y + LH - 1, r.prog, { class: 'lb' });
      txt(s, 0, y + 2 * LH + LG + 1, planName[r.plan], { class: 'tk' });
      txt(s, X0 - 8, y + LH - 3, 'best', { class: 'ref', 'text-anchor': 'end' });
      txt(s, X0 - 8, y + 2 * LH + LG - 3, 'head', { class: 'ref', 'text-anchor': 'end' });
      [['best', y], ['head', y + LH + LG]].forEach(([tr, yy]) => r[tr].forEach(([a, b, d]) => el('rect', { x: x(a), y: yy, width: Math.max(0.6, x(b) - x(a)), height: LH, fill: COL[d] }, body)));
      r.off.forEach(([a, b]) => el('rect', { x: x(a), y: y + LH + 0.5, width: Math.max(1.2, x(b) - x(a)), height: LG - 1, fill: '#15171a' }, body));
      const ag = txt(s, X1 + 10, y + LH + 6, r.agree.toFixed(1) + '%', { class: 'val' });
      ag.classList.add('pdpm-late');
      y += 2 * LH + LG + RG;
    });
    [0, 25, 50, 75, 100].forEach((v) => txt(s, x(v), y - 8, v + '%', { class: 'tk', 'text-anchor': 'middle' }));
    txt(s, (X0 + X1) / 2, y + 12, 'progress through the program (% of cycles)', { class: 'lb', 'text-anchor': 'middle' });
    txt(s, X1 + 10, TOP - 6, 'on best', { class: 'ref' });
    const head = el('line', { x1: X0, x2: X0, y1: TOP - 2, y2: y - 26, stroke: '#15171a', 'stroke-width': 1, class: 'pdpm-playhead' }, s);
    let lx = X0;
    DEPTHS.forEach((d) => { el('rect', { x: lx, y: 6, width: 12, height: 12, fill: COL[d] }, s); txt(s, lx + 18, 16, NAME[d], { class: 'tk' }); lx += 100; });
    el('rect', { x: lx, y: 10, width: 12, height: 4, fill: '#15171a' }, s); txt(s, lx + 18, 16, 'windows off the best depth', { class: 'tk' });
    if (still) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdpm-replay';
    btn.textContent = 'Replay';
    host.appendChild(btn);
    const clip = s.querySelector('.pdpm-reveal');
    const late = s.querySelectorAll('.pdpm-late');
    let raf = 0;
    const frame = (u) => {
      clip.setAttribute('width', (X1 - X0) * u);
      head.setAttribute('x1', X0 + (X1 - X0) * u); head.setAttribute('x2', X0 + (X1 - X0) * u);
      head.style.opacity = u > 0 && u < 1 ? 1 : 0;
      late.forEach((n) => { n.style.opacity = u >= 1 ? 1 : 0; });
    };
    const play = () => {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const step = (t) => { const u = Math.min(1, (t - t0) / 5200); frame(u); if (u < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    };
    frame(0);
    btn.addEventListener('click', play);
    let played = false;
    watch(host, () => { if (!played) { played = true; play(); } });
  };

  const run = { morph, tradeoff, plans, decide, traces };
  document.querySelectorAll('[data-pdpm]').forEach((host) => {
    const f = run[host.dataset.pdpm];
    if (!f || !D) return;
    const fb = host.querySelector('.pdpm-fallback');
    if (fb) fb.remove();
    f(host);
  });
})();
