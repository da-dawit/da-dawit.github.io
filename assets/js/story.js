// Who is Dawit Chun? The story, played on the bingo card from my Talent Award presentation.
(() => {
  'use strict';

  const doc = document;
  const $ = (sel, root = doc) => root.querySelector(sel);
  const $$ = (sel, root = doc) => Array.from(root.querySelectorAll(sel));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => reduced.matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, calm() ? 0 : ms));
  const narrow = () => matchMedia('(max-width: 900px)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const KEY = 'dc-bingo';

  // Hidden tabs pause animations and requestAnimationFrame, so nothing here waits on either.
  const settle = (anim, ms) => Promise.race([anim.finished.catch(() => {}), new Promise((r) => setTimeout(r, calm() ? 0 : ms + 60))])
    .then(() => { try { anim.finish(); } catch (e) { /* already done */ } });
  // Steps still come 60 times a second, but in time with the display while the page is on screen (a 120 Hz
  // display takes every other frame), so the car, the arm, the well and the gaze move evenly instead of drifting
  // against the refresh the way a 16 ms timer does. Hidden tabs stop frames, so a backstop timer keeps going there.
  const everyFrame = (fn) => {
    const STEP = 1000 / 60;
    let raf = 0;
    let id = 0;
    let off = false;
    let due = performance.now() + STEP;
    const tick = () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
      if (off) return;
      const now = performance.now();
      if (now >= due - 2) {
        due = Math.max(due + STEP, now - STEP);
        if (fn(now) === false) {
          off = true;
          return;
        }
      }
      if (off) return;
      raf = requestAnimationFrame(tick);
      id = setTimeout(tick, 100);
    };
    raf = requestAnimationFrame(tick);
    id = setTimeout(tick, 100);
    return () => {
      off = true;
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  };
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ } };
  const press = (btn) => new Promise((r) => btn.addEventListener('click', () => { btn.disabled = true; r(); }, { once: true }));
  const anyClick = (...els) => new Promise((r) => {
    const ac = new AbortController();
    els.forEach((el) => el.addEventListener('click', () => { ac.abort(); r(); }, { signal: ac.signal }));
  });
  const img = (src, w, h, alt = '', extra = '') => `<img src="${src}" width="${w}" height="${h}" alt="${alt}"${extra ? ` ${extra}` : ''}>`;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  // One motion system, the same numbers as the --m-* tokens in story.css. Things arrive on `out`, leave on `in`,
  // and travel from one place to another on `move`; ease() above is the pen, and the robot's own trajectories.
  const M = { micro: 150, short: 240, base: 360, long: 480, out: 'cubic-bezier(.22,1,.36,1)', in: 'cubic-bezier(.4,0,1,1)', move: 'cubic-bezier(.45,0,.2,1)' };
  // the inverse of ease(): how far into a stroke the pen reaches a point p (0 to 1) of the way along it
  const penAt = (p) => (p < 0.5 ? Math.sqrt(p / 2) : 1 - Math.sqrt(2 * (1 - p)) / 2);

  const TILES = {
    courage:        { r: 0, c: 0, name: 'Courage',        color: '#d9443c' },
    challenge:      { r: 1, c: 1, name: 'Challenge',      color: '#cf6a1f' },
    innovation:     { r: 2, c: 2, name: 'Innovation',     color: '#3f9a36' },
    responsibility: { r: 3, c: 3, name: 'Responsibility', color: '#1f6fe0' },
    sharing:        { r: 4, c: 4, name: 'Sharing',        color: '#b04f8c' },
    technology:     { r: 3, c: 1, name: 'Technology',     color: '#4f6680' },
    compassion:     { r: 1, c: 3, name: 'Compassion',     color: '#4e8062' },
  };
  const OPEN = [{ r: 0, c: 4 }, { r: 4, c: 0 }];
  // values a robotics PhD asks for
  const SUGGEST = ['Curiosity', 'Rigor', 'Persistence', 'Creativity', 'Collaboration', 'Integrity', 'Leadership', 'Resilience'];

  /* The card */

  const card = $('#card');
  const head = $('#card-head');
  const grid = $('#card-grid');
  const linesSvg = $('#card-lines');
  const stage = $('#stage');
  const cells = [];
  const lines = [];
  const cellAt = (r, c) => cells.find((x) => +x.dataset.r === r && +x.dataset.c === c);
  const cellOf = (t) => cellAt(t.r, t.c);

  function makeCell(r, c) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'bc-cell';
    b.dataset.r = r;
    b.dataset.c = c;
    b.style.setProperty('--r', r);
    b.style.setProperty('--c', c);
    b.disabled = true;
    b.innerHTML = '<svg class="bc-ink" viewBox="-1.6 -1.6 3.2 3.2" aria-hidden="true"></svg><span class="bc-label"></span>';
    b.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}, empty`);
    return b;
  }

  function buildCard() {
    head.innerHTML = 'BINGO'.split('').map((ch) => `<span>${ch}</span>`).join('');
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = makeCell(r, c);
        cells.push(cell);
        grid.appendChild(cell);
      }
    }
  }

  // every stamp prints at one size; a long word is set narrower on Archivo's width axis instead of smaller
  function setLabel(cell, text) {
    $('.bc-label', cell).textContent = text;
    cell.style.setProperty('--wd', `${Math.round(Math.max(62, Math.min(100, 8800 / (text.length * 0.58 * 13))))}%`);
  }

  // every stamp leaves a slightly different ink blot
  function splat(svg, color) {
    const n = 16;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const rad = 1.52 + (Math.random() - 0.5) * 0.22;
      return [Math.cos(a) * rad, Math.sin(a) * rad];
    });
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const f = (v) => v.toFixed(3);
    let m = mid(pts[0], pts[1]);
    let d = `M${f(m[0])} ${f(m[1])}`;
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n];
      m = mid(p, pts[(i + 1) % n]);
      d += ` Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
    }
    svg.innerHTML = `<path d="${d}Z" fill="${color}"/>`;
  }

  function stampNow(key, animate) {
    const t = TILES[key];
    const cell = cellOf(t);
    cell.classList.remove('is-open', 'is-ready');
    cell.disabled = true;
    cell.style.setProperty('--tile', t.color);
    splat($('.bc-ink', cell), t.color);
    setLabel(cell, t.name);
    if (!animate) cell.classList.add('no-anim');
    cell.classList.add('is-stamped');
    cell.setAttribute('aria-label', `${t.name}, stamped`);
  }

  // On a phone the card scrolls away with the story; bring it back into view before anything happens on it.
  async function showCard() {
    if (!narrow()) return;
    const bar = $('.st-top');
    const r = card.getBoundingClientRect();
    if (r.top >= (bar ? bar.offsetHeight : 0) && r.bottom <= window.innerHeight) return;
    card.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
    await wait(450);
  }

  // The stamp is one press on the tile (story.css, stamp-press); the card itself stays still. Then a beat to see the print.
  async function stamp(key) {
    await showCard();
    stampNow(key, true);
    await wait(M.base + M.short);
  }

  function readyToStamp(key, btn) {
    const t = TILES[key];
    const cell = cellOf(t);
    cell.classList.remove('is-open');
    cell.classList.add('is-ready');
    cell.disabled = false;
    cell.setAttribute('aria-label', `Stamp ${t.name}`);
    return anyClick(cell, btn).then(() => {
      cell.disabled = true;
      btn.disabled = true;
    });
  }

  // Lines use layout positions, so a tile that is still moving can't bend them.
  const centerOf = (cell) => [cell.offsetLeft + cell.offsetWidth / 2, cell.offsetTop + cell.offsetHeight / 2, cell.offsetWidth];

  function renderLines(animateLast) {
    linesSvg.setAttribute('viewBox', `0 0 ${grid.clientWidth} ${grid.clientHeight}`);
    const pad = grid.offsetLeft; // the card's padding: the line's number sits in it, past the arrow
    linesSvg.innerHTML = lines.map((L, i) => {
      const [x1, y1, w] = centerOf(cellAt(L.a.r, L.a.c));
      const [x2, y2] = centerOf(cellAt(L.b.r, L.b.c));
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const ext = w * 0.5;
      const [sx, sy, ex, ey] = [x1 - ux * ext, y1 - uy * ext, x2 + ux * ext, y2 + uy * ext];
      const ah = Math.max(9, w * 0.16);
      const tip = (s) => `${(ex - ux * ah - uy * ah * 0.55 * s).toFixed(1)} ${(ey - uy * ah + ux * ah * 0.55 * s).toFixed(1)}`;
      const cls = `bc-line${L.dashed ? ' is-dashed' : ''}${animateLast && i === lines.length - 1 && !calm() ? ' is-drawing' : ''}`;
      const seg = (a, b) => `M${(sx + (ex - sx) * a).toFixed(1)} ${(sy + (ey - sy) * a).toFixed(1)} L${(sx + (ex - sx) * b).toFixed(1)} ${(sy + (ey - sy) * b).toFixed(1)}`;
      // The pencil line is a row of separate dashes, each laid down when the pen reaches it, so both lines are
      // drawn by the same hand at the same pace (dashes 3.3% of the line, gaps 2.2%, as the old pattern read).
      let stroke = `<path class="bc-stroke" pathLength="1" d="${seg(0, 1)}"/>`;
      if (L.dashed) {
        stroke = '';
        for (let a = 0; a < 1; a += 0.055) {
          const b = Math.min(1, a + 0.033);
          const t0 = penAt(a) * M.long;
          stroke += `<path class="bc-dash" pathLength="1" style="--at: ${t0.toFixed(0)}ms; --dur: ${Math.max(1, penAt(b) * M.long - t0).toFixed(0)}ms" d="${seg(a, b)}"/>`;
        }
      }
      return `<g class="${cls}">${stroke}`
        + `<path class="bc-line__head" d="M${tip(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${tip(-1)}"/>`
        + `<text x="${(x2 + Math.sign(ux) * (w / 2 + pad / 2)).toFixed(1)}" y="${(y2 + Math.sign(uy) * (w / 2 + pad / 2)).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${L.num}</text></g>`;
    }).join('');
  }

  function drawLine(a, b, opts = {}) {
    lines.push({ a, b, dashed: !!opts.dashed, num: opts.num || '' });
    renderLines(true);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderLines(false), 60);
  });

  /* Scenes */

  // A scene leaves quickly on the way-out curve, then the next one fades in where it was. Text never slides.
  async function scene(html, tile) {
    const old = stage.firstElementChild;
    if (old) {
      old.classList.add('is-leaving');
      await wait(M.micro);
    }
    stage.innerHTML = `<div class="sc">${html}</div>`;
    const el = stage.firstElementChild;
    if (tile) el.style.setProperty('--tile', tile.color);
    setTimeout(() => el.classList.add('is-in'), 20);
    const h = $('h1, h2', el);
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
    // On a wide screen the card is pinned and the new scene is still invisible, so the page jumps back up with nothing
    // on screen to move; on a phone the card above visibly scrolls away, so there the page glides.
    if (old && (narrow() || window.scrollY > 0)) stage.scrollIntoView({ behavior: calm() || !narrow() ? 'auto' : 'smooth', block: 'start' });
    return el;
  }

  function add(box, html, cls = 'rv') {
    const div = doc.createElement('div');
    div.className = cls;
    div.innerHTML = html;
    box.appendChild(div);
    setTimeout(() => div.classList.add('is-in'), 20);
    return div;
  }

  // A box that shows one of several texts keeps the height of the longest one, so nothing below it moves.
  function reserve(el, htmls) {
    const fit = () => {
      if (!el.isConnected) return;
      const probe = el.cloneNode(false);
      probe.removeAttribute('aria-live');
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, { position: 'absolute', left: '0', top: '0', width: `${el.offsetWidth}px`, minHeight: '0', visibility: 'hidden', pointerEvents: 'none' });
      el.parentElement.appendChild(probe);
      let tallest = 0;
      htmls.forEach((h) => {
        probe.innerHTML = h;
        tallest = Math.max(tallest, probe.offsetHeight);
      });
      probe.remove();
      el.style.minHeight = `${Math.ceil(tallest)}px`;
    };
    fit();
    if (doc.fonts) doc.fonts.ready.then(fit);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => (el.isConnected ? fit() : ro.disconnect())) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
      el.style.minHeight = '';
    };
  }

  const trio = (items, cls = '') => `<div class="trio${cls}">${items.map((x) => `<figure>${img(x.src, x.w, x.h, x.alt, `loading="lazy"${x.pos ? ` style="object-position: ${x.pos}"` : ''}`)}${x.cap ? `<figcaption>${x.cap}</figcaption>` : ''}</figure>`).join('')}</div>`;
  // each photo sits next to the sentence it belongs to, and the pairs alternate sides
  const beats = (items) => `<div class="beats">${items.map((x) => `
    <div class="beat">
      <figure class="beat-media${x.fit ? ' beat-media--fit' : ''}">${x.media || img(x.src, x.w, x.h, x.alt, `loading="lazy"${x.pos ? ` style="object-position: ${x.pos}"` : ''}`)}${x.cap ? `<figcaption>${x.cap}</figcaption>` : ''}</figure>
      <div class="beat-text">${x.when ? `<p class="beat-when">${x.when}</p>` : ''}<p>${x.text}</p></div>
    </div>`).join('')}</div>`;
  // pages fanned out like a small pile
  const fan = (items) => `<span class="fan">${items.map((x) => img(x.src, x.w, x.h, x.alt, 'loading="lazy"')).join('')}</span>`;
  const CH = {};
  const fill = (word, which) => `<p class="rv-text sc-fill">So I fill ${which} with <b>${word}</b>.</p>`;
  // How to use a demo, said in a line or two over the demo itself, blurred behind it. The demo wakes up on the button.
  const gateHtml = (title, text, label = 'Start') => `<div class="eyes-gate demo-gate"><div class="eyes-gate-card"><p class="eyes-gate-title">${title}</p><p class="eyes-gate-text">${text}</p><button class="btn btn--primary" type="button" data-gate-start>${label}</button></div></div>`;
  const opened = (box, behind = []) => new Promise((done) => {
    const gate = $('.demo-gate', box);
    behind.forEach((el) => { el.inert = true; });
    $('[data-gate-start]', gate).addEventListener('click', () => {
      gate.hidden = true;
      behind.forEach((el) => { el.inert = false; });
      done();
    }, { once: true });
  });
  const fig = (src, w, h, alt, cap = '', extra = '') => `<figure class="rv-photo">${img(src, w, h, alt, extra)}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
  const pair = (a, b) => `<div class="rv-pair">${[a, b].map((x) => `<figure style="--r: ${(x.w / x.h).toFixed(3)}">${img(x.src, x.w, x.h, x.alt, 'loading="lazy"')}${x.cap ? `<figcaption>${x.cap}</figcaption>` : ''}</figure>`).join('')}</div>`;

  /* Courage: push the doubts aside and read the record underneath */

  // each doubt, and the photo and the fact that answer it
  const DOUBTS = [
    { say: 'What can a kid even do?', pic: { pos: '50% 40%', src: 'assets/figures/story/kaist-call.jpg', w: 640, h: 361, alt: 'Dawit at 13, on a video call for the KAIST President’s Award' }, answer: 'At 13, I had already won the KAIST President’s Award and programmed a robot to drive itself.' },
    { say: 'Isn’t he just a guinea pig?', pic: { pos: '42% 45%', src: 'assets/figures/honors/matriculation-award.jpg', w: 1079, h: 750, alt: 'Dawit holding flowers and his Matriculation Award certificate next to Taejae’s president' }, answer: 'I entered Taejae as its youngest student, with the highest entrance score.' },
  ];

  // A doubt is a card you can pick up and throw away: it follows the hand, tilts as it moves,
  // and when it is let go fast or far enough it keeps flying the way it was thrown.
  function flick(el) {
    return new Promise((done) => {
      let x = 0;
      let y = 0;
      let sx = 0;
      let sy = 0;
      let vx = 0;
      let vy = 0;
      let lt = 0;
      let lx = 0;
      let ly = 0;
      let dragging = false;
      let moved = false;
      let gone = false;
      const at = (px, py) => `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${(px / 14).toFixed(2)}deg)`;
      const slot = el.parentElement;
      const toss = (dx, dy) => {
        if (gone) return;
        gone = true;
        el.disabled = true;
        slot.classList.add('is-thrown');
        const len = Math.hypot(dx, dy) || 1;
        const far = Math.max(window.innerWidth, window.innerHeight) * 1.2;
        const tx = x + (dx / len) * far;
        const ty = y + (dy / len) * far;
        const a = el.animate(
          [{ transform: at(x, y), opacity: 1 }, { transform: `translate(${tx.toFixed(0)}px, ${ty.toFixed(0)}px) rotate(${(Math.sign(dx || 1) * 50).toFixed(0)}deg)`, opacity: 0 }],
          { duration: calm() ? 1 : 620, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
        );
        settle(a, 620).then(() => {
          el.style.visibility = 'hidden';
          slot.classList.add('is-clear');
          done();
        });
      };
      el.addEventListener('pointerdown', (e) => {
        if (gone) return;
        dragging = true;
        moved = false;
        sx = e.clientX - x;
        sy = e.clientY - y;
        lx = e.clientX;
        ly = e.clientY;
        lt = performance.now();
        vx = 0;
        vy = 0;
        capture(el, e);
        el.classList.add('is-drag');
        slot.classList.add('is-lifted');
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const now = performance.now();
        const dt = Math.max(1, now - lt);
        vx = (e.clientX - lx) / dt;
        vy = (e.clientY - ly) / dt;
        lx = e.clientX;
        ly = e.clientY;
        lt = now;
        x = e.clientX - sx;
        y = e.clientY - sy;
        if (Math.hypot(x, y) > 4) moved = true;
        el.style.transform = at(x, y);
      });
      const release = (cancel) => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-drag');
        const speed = Math.hypot(vx, vy);
        if (!cancel && (speed > 0.5 || Math.hypot(x, y) > 120)) {
          toss(speed > 0.5 ? vx : x, speed > 0.5 ? vy : y);
          return;
        }
        if (!cancel && !moved) {
          toss(1, -0.35);
          return;
        }
        // not thrown hard enough: it drops back into place
        if (!calm()) el.animate([{ transform: at(x, y) }, { transform: 'none' }], { duration: M.short, easing: M.out });
        el.style.transform = '';
        x = 0;
        y = 0;
        slot.classList.remove('is-lifted');
      };
      el.addEventListener('pointerup', () => release(false));
      el.addEventListener('pointercancel', () => release(true));
      el.addEventListener('click', (e) => { if (e.detail === 0) toss(1, -0.35); });
    });
  }

  CH.courage = {
    title: 'Not everyone believed in my choice.',
    async play(body) {
      body.innerHTML = `
        <p class="sc-lede">Before university, I chose not to follow the usual path through school, so I could study what I loved. Many people around me were worried. Some of them said things like this to me.</p>
        <div class="demo-box doubts-box">
        ${gateHtml('Throw the doubts away', 'Grab a card and throw it off the page, or just tap it.')}
        <ol class="doubts">${DOUBTS.map((d) => `
          <li class="doubt-slot">
            <div class="doubt-answer doubt-answer--plain"><s class="doubt-was">“${d.say}”</s></div>
            <button class="doubt" type="button"><span class="doubt-q" aria-hidden="true">“</span><span class="doubt-say">${d.say}<span aria-hidden="true">”</span></span></button>
          </li>`).join('')}
        </ol>
        </div>`;
      opened($('.doubts-box', body), [$('.doubts', body)]);
      // a keyboard user keeps their place: when one doubt goes, focus moves to the next one
      await Promise.all($$('.doubt', body).map((el) => flick(el).then(() => {
        const a = doc.activeElement;
        if (a && a !== doc.body && a !== el) return;
        const next = $('.doubt:not(:disabled)', body);
        if (next) next.focus({ preventScroll: true });
      })));
      add(body, `${beats([
        { src: 'assets/figures/honors/matriculation-award.jpg', w: 1079, h: 750, pos: '42% 45%', alt: 'Dawit holding flowers and his Matriculation Award certificate next to Taejae’s president', text: 'Still, I believed in the path I chose. It was my own choice, so I knew I had to take responsibility for it, and it felt like running a marathon. At 15, I was accepted to Taejae University, Korea’s first innovative university, as the youngest student in its first cohort and with the highest entrance score.' },
        { src: 'assets/figures/journey/tokyo/group.jpg', w: 1400, h: 790, alt: 'The Taejae class and faculty in Japan, with civic project posters on display', text: 'Taejae is a new kind of university. Its students move to cities around the world and take on local problems as civic projects. Starting a school like this took courage, and so did my decision to join it in its first year.' },
      ])}${fill('Courage', 'my first tile')}`);
    },
  };

  /* Challenge: a staircase, one year to a step, built from the card's own tiles */

  const YEARS = [
    { year: '2021', pic: { src: 'assets/figures/service/geumcheon-science-day.jpg', w: 1200, h: 784, pos: '50% 62%', alt: 'Dawit presenting robots on stage at the 2021 Geumcheon science festival' },
      cap: 'Grand prize, robot contest', head: 'Grand prize, creative robot contest', more: ['At the Geumcheon Science Festival, in the Seoul district where I built my first robots'] },
    { year: '2022', pic: { src: 'assets/figures/shower/shower-v2-iso.png', w: 830, h: 582, pos: '50% 45%', alt: 'The hydroelectric shower module in CAD' },
      cap: 'KSME Gold Prize', head: 'KSME Gold Prize, for a shower that makes its own electricity', more: ['1st place at the Geumcheon Hackathon', 'My first paper, on a robot teaching aid for projectile motion'] },
    { year: '2023', pic: { src: 'assets/figures/honors/aramco-gold.jpg', w: 1100, h: 620, pos: '50% 30%', alt: 'Dawit holding the Aramco Coding World Cup gold certificate' },
      cap: 'Gold, Aramco Coding World Cup', head: 'Gold at the Aramco Coding World Cup, with my team of four among 94 teams', more: ['A+ in KAIST’s year-long AI and Data Science Masterclass'] },
    { year: '2024', pic: { src: 'assets/figures/home/honor-iro.jpg', w: 960, h: 540, pos: '50% 40%', alt: 'Dawit with his International Robot Olympiad gold medal' },
      cap: 'Gold, Robot Olympiad, Athens', head: 'Gold at the International Robot Olympiad in Athens', more: ['Co-author of a book on using ChatGPT in the classroom'] },
    { year: '2025', pic: { src: 'assets/figures/home/chi-winner.jpg', w: 960, h: 540, pos: '50% 40%', alt: 'The Watch-Out team with the CHI 2025 winner banner' },
      cap: '1st of 84, ACM CHI', head: '1st of 84 at the ACM CHI Student Design Competition', more: ['For Watch-Out, which helps people with Alzheimer’s find their way home'] },
    { year: '2026', pic: { src: 'assets/figures/story/pdpm-paper.jpg', w: 1560, h: 405, fit: 'contain', alt: 'The title of the PDPM paper, PDPM: Perceptron-Driven Pipeline Morphing for Adaptive RISC-V Processors, by Dawit Chun and Minhee Jun' },
      cap: 'First-author paper, IEEE ICCD', head: 'First-author paper at IEEE ICCD, for PDPM', more: ['A processor that reshapes its own pipeline while a program runs', 'Patent application for a window that frees people trapped behind security bars in floods and fires'] },
  ];

  /* Watch-Out: the smart door, then help that grows only as she wanders farther. A sample case on a real map. */

  // icons from Lucide (lucide.dev, ISC licence)
  const IC = {
    'audio-lines': '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
    'bell': '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'door-open': '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/>',
    'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'message-circle-warning': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    'navigation-2': '<polygon points="12 2 19 21 12 17 5 21 12 2"/>',
    'nfc': '<path d="M6 8.32a7.43 7.43 0 0 1 0 7.36"/><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58"/><path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8"/><path d="M16.37 2a20.16 20.16 0 0 1 0 20"/>',
    'phone-call': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><path d="M14.05 2a9 9 0 0 1 8 7.94"/><path d="M14.05 6A5 5 0 0 1 18 10"/>',
    'share-2': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    'shield-plus': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M9 12h6"/><path d="M12 9v6"/>',
    'siren': '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'vibrate': '<path d="m2 8 2 2-2 2 2 2-2 2"/><path d="m22 8-2 2 2 2-2 2 2 2"/><rect width="8" height="14" x="8" y="5" rx="1"/>',
    'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

  // the map library loads only when this demo is reached
  let leaflet = null;
  const loadLeaflet = () => {
    if (!leaflet) {
      leaflet = new Promise((ok, fail) => {
        const css = doc.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        doc.head.appendChild(css);
        const js = doc.createElement('script');
        js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        js.onload = () => ok(window.L);
        js.onerror = () => {
          leaflet = null;
          fail(new Error('map'));
        };
        doc.head.appendChild(js);
      });
    }
    return leaflet;
  };

  // a sample home in Mangwon-dong, Seoul, and the rings around it (metres): the safe zone her son draws, then how far
  // she has wandered before each next kind of help starts; past the last ring, emergency services are called
  const WO = { home: [37.5559, 126.9032], rings: [150, 400, 600, 800] };
  const WO_ZONES = ['Safe zone', 'Compass', 'Bystanders', 'QuickCall', 'Emergency call'];
  const WO_HTML = `
        <div class="wo">
          <div class="wo-frame">
            <div class="wo-map" role="application" aria-label="A map of a neighbourhood in Seoul, with her home and the zones around it. Drag her marker, or focus it and use the arrow keys."></div>
            <div class="wo-door">
              <div class="wo-door-card">
                <p class="wo-door-head">${icon('volume-2')}<span>Before the door opens, its speaker asks</span></p>
                <div class="wo-q"><p>“Where are you going?”</p><div class="wo-chips"><button type="button" data-a="the park">To the park</button><button type="button" data-a="the market">To the market</button><button type="button" class="wo-none" data-none>She doesn’t answer</button></div></div>
                <div class="wo-q" hidden><p>“What are you wearing?”</p><div class="wo-chips"><button type="button" data-a="a blue jacket">A blue jacket</button><button type="button" data-a="a grey coat">A grey coat</button></div></div>
                <p class="wo-said" hidden></p>
                <div class="wo-shut" hidden><p>The door stays shut. If she can’t answer, she may not be ready to go out alone.</p><button type="button" class="wo-again">Try again</button></div>
                <div class="wo-tap" hidden><p>The lights show where to tap her watch.</p><button type="button" class="wo-reader" aria-label="Tap her watch on the NFC reader">${icon('nfc')}</button></div>
              </div>
            </div>
          </div>
          <ol class="wo-steps">${WO_ZONES.map((x, i) => `<li data-z="${i}">${i ? x : 'Door lock'}</li>`).join('')}</ol>
          <div class="wo-devices">
            <figure class="wo-dev wo-dev--watch"><div class="wo-watch"><div class="wo-wscreen" aria-live="polite"></div></div><figcaption>Her watch</figcaption></figure>
            <figure class="wo-dev"><div class="wo-phone"><div class="wo-pscreen wo-pscreen--near" aria-live="polite"></div></div><figcaption>A stranger’s phone nearby</figcaption></figure>
            <figure class="wo-dev"><div class="wo-phone"><div class="wo-pscreen wo-pscreen--son" aria-live="polite"></div></div><figcaption>Her son’s phone</figcaption></figure>
          </div>
        </div>`;

  function watchOut(box) {
    const root = $('.wo', box);
    const frame = $('.wo-frame', box);
    const mapEl = $('.wo-map', box);
    const door = $('.wo-door', box);
    const watch = $('.wo-wscreen', box);
    const near = $('.wo-pscreen--near', box);
    const son = $('.wo-pscreen--son', box);
    const steps = $$('.wo-steps li', box);
    const qs = $$('.wo-q', box);
    const answers = [];
    let clock = 14 * 60 + 12;
    const now = () => `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`;
    const feed = [];
    // her son's phone: wandering arrives quietly; only QuickCall and the emergency call are real alarms
    const notify = (ic, text, loud) => {
      feed.unshift({ ic, text, loud, at: now() });
      son.innerHTML = `<p class="wo-ptime">${now()}</p>${feed.map((n) => `<div class="wo-note${n.loud ? ' is-loud' : ''}">${icon(n.ic)}<div><p>${n.text}</p><span>${n.at}, ${n.loud ? 'alarm' : 'silent'}</span></div></div>`).join('')}`;
    };
    const W = {
      locked: () => `${icon('lock')}<b>Door locked</b><span>Answer the door first</span>`,
      tap: () => `${icon('nfc')}<b>Tap me on the reader</b><span>The door opens only for me</span>`,
      safe: () => `${icon('house')}<b>Safe zone</b><span>${now()}</span>`,
      compass: (deg, m) => `<i class="wo-arrow" style="transform: rotate(${deg.toFixed(0)}deg)">${icon('navigation-2')}</i><b>Home, ${m} m</b><span>${icon('vibrate')}“Let’s head home.”</span>`,
      people: (n) => (n ? `${icon('share-2')}<b>SOS shared</b><span>with ${n} phone${n > 1 ? 's' : ''} within 10 m</span>` : `${icon('share-2')}<b>Asking for help</b><span>No one within 10 m yet</span>`),
      call: () => `${icon('audio-lines')}<b>Minjun is talking</b><span>No need to answer</span>`,
      sos: () => `${icon('siren')}<b>Calling 112</b><span>Sharing her location</span>`,
    };
    const nearIdle = () => `<p class="wo-ptime">${now()}</p><p class="wo-idle">No alerts</p>`;
    const nearSos = () => `<p class="wo-ptime">${now()}</p>
      <div class="wo-sos">
        <p class="wo-sos-head">${icon('message-circle-warning')}<span>AirDrop from a Watch-Out watch</span></p>
        <p class="wo-sos-title">Someone within 10 m may need help</p>
        <p>Ms. Lee, 79, has dementia and may be lost. She is wearing ${answers[1] || 'a blue jacket'}.</p>
        <p>Please speak slowly and calmly. Crowds and loud voices upset her.</p>
        <span class="wo-sos-call">${icon('phone-call')}Call her son, Minjun</span>
        <p class="wo-sos-foot">${icon('shield-plus')}<span>First responders: tap her watch for medical details.</span></p>
      </div>`;
    watch.innerHTML = W.locked();
    near.innerHTML = nearIdle();
    son.innerHTML = `<p class="wo-ptime">${now()}</p><p class="wo-idle">Mom is at home</p>`;

    let me = null;
    let open = false;
    // the door: two calm questions, then the watch on the reader
    const said = $('.wo-said', box);
    const shut = $('.wo-shut', box);
    // no answer: the door stays shut
    $('[data-none]', box).addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      qs[0].hidden = true;
      shut.hidden = false;
      $('.wo-again', shut).focus({ preventScroll: true });
    });
    $('.wo-again', shut).addEventListener('click', () => {
      shut.hidden = true;
      qs[0].hidden = false;
    });
    qs.forEach((q, i) => $$('button:not([data-none])', q).forEach((b) => b.addEventListener('click', () => {
      answers[i] = b.dataset.a;
      // a keyboard user keeps their place on the next step
      const keys = b.matches(':focus-visible');
      q.hidden = true;
      said.hidden = false;
      said.textContent = i === 0 ? `Going to ${answers[0]}.` : `Going to ${answers[0]}, wearing ${answers[1]}.`;
      const next = i === 0 ? qs[1] : $('.wo-tap', box);
      next.hidden = false;
      if (i === 1) watch.innerHTML = W.tap();
      if (keys) $('button', next).focus();
    })));
    $('.wo-reader', box).addEventListener('click', () => {
      if (open || answers.length < 2) return;
      open = true;
      clock += 2;
      door.classList.add('is-open');
      watch.innerHTML = W.safe();
      steps[0].classList.add('is-on');
      root.dataset.level = '0';
      notify('door-open', `Mom went out at ${now()}, going to ${answers[0]}, wearing ${answers[1]}.`, false);
      if (me) {
        me.dragging.enable();
        me.getElement().classList.add('is-free');
      }
      setTimeout(() => { door.hidden = true; }, calm() ? 0 : 450);
    });

    loadLeaflet().then((L) => {
      const home = L.latLng(WO.home);
      const map = L.map(mapEl, { zoomControl: false, zoomSnap: 0.05, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 16,
        maxZoom: 19,
        attribution: 'Tiles © Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(map);
      // the outer ring fills the height of the map
      map.fitBounds(home.toBounds(WO.rings[3] * 2 + 120), { padding: [4, 4] });
      const north = (r) => L.latLng(home.lat + r / 111320, home.lng);
      const by = (p, east, up) => L.latLng(p.lat + up / 111320, p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180)));
      WO.rings.forEach((r, i) => L.circle(home, { radius: r, className: `wo-ring wo-ring--${i}`, interactive: false }).addTo(map));
      const label = (at, i) => L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: `wo-zone wo-zone--${i}`, html: `<span>${WO_ZONES[i]}</span>`, iconSize: null }) }).addTo(map);
      WO.rings.forEach((r, i) => label(north(r - 34), i));
      // past the last ring: to the side on a wide map, below it on a narrow one
      label(mapEl.clientWidth > mapEl.clientHeight * 1.2 ? by(home, WO.rings[3] + 150, 0) : north(-(WO.rings[3] + 70)), 4);
      L.marker(home, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'wo-home', html: icon('house'), iconSize: [30, 30] }) }).addTo(map);
      // people out in the neighbourhood stay where they are; her SOS reaches only the few near her (within 10 m in
      // reality, drawn as about 200 m at this scale so it can be seen)
      const seed = (k) => {
        const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      const spot = (r, a) => by(home, Math.cos(a) * r, Math.sin(a) * r);
      const PEOPLE = [
        // spread through the bystander ring, so someone is usually near her when she reaches it
        ...Array.from({ length: 16 }, (_, k) => spot(440 + seed(k + 30) * 150, (k / 16) * Math.PI * 2 + (seed(k) - 0.5) * 0.24)),
        // and elsewhere in the neighbourhood
        ...Array.from({ length: 18 }, (_, k) => spot(260 + seed(k + 90) * 1000, seed(k + 70) * Math.PI * 2)),
      ];
      const crowd = PEOPLE.map((ll) => L.marker(ll, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'wo-near', html: '<span></span>', iconSize: [10, 10] }) }).addTo(map));
      let reachedSig = '';
      const line = L.polyline([home, home], { className: 'wo-line', interactive: false });
      me = L.marker(by(home, 0, -14), { draggable: true, autoPan: false, keyboard: true, title: 'Ms. Lee', icon: L.divIcon({ className: 'wo-me', html: '<span></span>', iconSize: [24, 24] }) }).addTo(map);
      if (open) me.getElement().classList.add('is-free');
      else me.dragging.disable();
      const bearing = (a, b) => {
        const r = Math.PI / 180;
        const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
        const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
      };
      let level = 0;
      let reached = 0;
      const update = () => {
        // she stays inside the map
        const size = map.getSize();
        const at = map.latLngToContainerPoint(me.getLatLng());
        const kept = L.point(Math.min(size.x - 16, Math.max(16, at.x)), Math.min(size.y - 16, Math.max(16, at.y)));
        if (!kept.equals(at)) me.setLatLng(map.containerPointToLatLng(kept));
        const p = me.getLatLng();
        const d = home.distanceTo(p);
        const next = WO.rings.findIndex((r) => d <= r);
        const lv = next < 0 ? 4 : next;
        line.setLatLngs([home, p]);
        // from the bystander step on, the people closest to her get the SOS, wherever she is
        const alerted = lv >= 2 ? PEOPLE.map((ll, k) => [p.distanceTo(ll), k]).filter(([m]) => m < 210).sort((x, y) => x[0] - y[0]).slice(0, 3).map(([, k]) => k) : [];
        crowd.forEach((m, k) => { const el = m.getElement(); if (el) el.classList.toggle('is-alerted', alerted.includes(k)); });
        const sig = alerted.join(',');
        if (lv === 1) watch.innerHTML = W.compass(bearing(p, home), Math.round(d / 10) * 10);
        if (lv === level) {
          if (sig !== reachedSig) {
            reachedSig = sig;
            if (lv === 2) watch.innerHTML = W.people(alerted.length);
            near.innerHTML = alerted.length ? nearSos() : nearIdle();
          }
          return;
        }
        reachedSig = sig;
        // each step of help she passes is told to her son in order, even when she is dragged past several at once
        const NOTES = [null,
          ['bell', 'Mom left her safe zone. Her watch is guiding her home with vibration and voice.', false],
          ['share-2', 'She is still out, so her watch is asking people near her for help.', false],
          ['audio-lines', 'QuickCall: no one has helped yet, so you are talking to her through her watch.', true],
          ['siren', '112 was called, and her live location is shared.', true]];
        for (let k = reached + 1; k <= lv; k += 1) {
          clock += [0, 4, 5, 4, 3][k];
          notify(...NOTES[k]);
        }
        reached = Math.max(reached, lv);
        if (lv === 0 && level > 0) {
          clock += 3;
          notify('house', 'Mom is back in her safe zone.', false);
        }
        level = lv;
        root.dataset.level = String(lv);
        steps.forEach((li, k) => li.classList.toggle('is-on', k <= lv));
        if (lv >= 3) line.addTo(map);
        else line.remove();
        me.getElement().classList.toggle('is-sos', lv === 4);
        if (lv === 0) watch.innerHTML = W.safe();
        if (lv === 1) {
          watch.innerHTML = W.compass(bearing(p, home), Math.round(d / 10) * 10);
        }
        if (lv === 2) {
          watch.innerHTML = W.people(alerted.length);
        }
        if (lv === 3) {
          watch.innerHTML = W.call();
        }
        if (lv === 4) {
          watch.innerHTML = W.sos();
        }
        near.innerHTML = alerted.length ? nearSos() : nearIdle();
      };
      me.on('drag', update);
      me.on('dragstart', () => me.getElement().classList.remove('is-free'));
      // the keyboard moves her 30 m at a time
      me.getElement().addEventListener('keydown', (e) => {
        const step = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30] }[e.key];
        if (!step || !open) return;
        e.preventDefault();
        me.setLatLng(by(me.getLatLng(), step[0], step[1]));
        update();
      });
      setTimeout(() => map.invalidateSize(), 60);
    }).catch(() => {
      mapEl.classList.add('is-off');
      mapEl.textContent = 'The map could not load.';
    });
    opened(box, [frame, $('.wo-devices', box)]);
  }

  CH.challenge = {
    title: 'Through countless challenges, I have proved what I can do.',
    async play(body) {
      body.innerHTML = `
        <p class="sc-lede">Taejae was not the only challenge I took on. From 2021 to 2026, I kept trying new things, and many of them did not work the first time.</p>
        <div class="prints" style="--n: ${YEARS.length}">${YEARS.map((y, i) => `
          <button class="print" type="button" style="--i: ${i}" disabled aria-label="${y.year}, ${y.head}">
            <span class="print-photo${y.pic.fit ? ' print-photo--paper' : ''}">${img(y.pic.src, y.pic.w, y.pic.h, y.pic.alt, y.pic.pos ? `style="object-position: ${y.pic.pos}"` : '')}</span>
            <span class="print-cap"><b>${y.year}</b><span>${y.cap}</span></span>
          </button>`).join('')}
        </div>
        <div class="sc-actions prints-actions"><button class="btn btn--primary" type="button" data-step data-primary disabled>Add 2022</button></div>
        <div class="prints-note" aria-live="polite"></div>`;
      const prints = $$('.print', body);
      const note = $('.prints-note', body);
      const btn = $('[data-step]', body);
      const noteHtml = (y) => `<p class="prints-head">${y.head}</p>${y.more.map((w) => `<p class="prints-more">${w}</p>`).join('')}`;
      const release = reserve(note, YEARS.map(noteHtml));
      // a print already on the stack can be brought to the front and read again
      const read = (i) => {
        prints.forEach((p, k) => p.classList.toggle('is-front', k === i));
        note.innerHTML = noteHtml(YEARS[i]);
      };
      prints.forEach((p, i) => p.addEventListener('click', () => read(i)));
      const place = async (i, quiet) => {
        const p = prints[i];
        p.classList.add('is-on');
        p.disabled = false;
        read(i);
        if (quiet || calm()) return;
        // laid on the stack by hand: it comes down a little and settles
        await settle(p.animate([{ opacity: 0, transform: 'translateY(-28px) scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: M.base, easing: M.out }), M.base);
      };
      await place(0);
      btn.disabled = false;
      for (let i = 1; i < YEARS.length; i++) {
        await press(btn);
        await place(i);
        if (i < YEARS.length - 1) {
          btn.textContent = `Add ${YEARS[i + 1].year}`;
          btn.disabled = false;
        }
      }
      btn.parentElement.remove();
      release();
      add(body, `
        <p class="rv-text">Each of these started when I saw people struggling and asked myself, “How can I help these people, and what should I do?” For Watch-Out, which took first place at ACM CHI, it was elderly people with dementia who wander off and get lost. This is a very simplified version of our idea, with concentric geofencing.</p>
        <div class="demo-box wo-box">
        ${gateHtml('Watch-Out', 'A sample case: Ms. Lee, 79, has dementia and wants to go out. Answer the door’s questions and tap her watch on the reader. Then drag her away from home on the map, and see what her watch, a stranger’s phone nearby and her son’s phone show.')}
        ${WO_HTML}
        </div>
        <p class="rv-text">My team built Watch-Out, a smartwatch and a door lock that add help only as the risk rises, so people with dementia can still go out on their own. The reader sits where only a properly worn watch can reach it, so she always leaves wearing it, and her caregiver can help her put it on beforehand. If she can’t answer the door’s questions, she may not be ready to go out alone, so the door stays shut.</p>
        ${fill('Challenge', 'my second tile')}`);
      watchOut($('.wo-box', body));
    },
  };

  /* Innovation: the medals, then a DeepCo car you teach yourself */

  // What the car's camera sees: the printed mat, its road and the black edge tape, through a pinhole
  // camera tilted down at the floor, with the barrel distortion of the kit's wide-angle lens.
  const CAM = { w: 120, h: 90, height: 0.16, f: 46, horizon: -4, barrel: 0.6 };
  const MAT = { half: 0.11, tape: 0.02, bend: 0.5, from: 0.14, end: 1.3 };
  function camPoint(X, Z) {
    const tilt = Math.atan((CAM.h / 2 - CAM.horizon) / CAM.f);
    const s = Math.sin(tilt);
    const c = Math.cos(tilt);
    const depth = CAM.height * s + Z * c;
    if (depth < 0.01) return null;
    const u = (X * CAM.f) / depth;
    const v = ((CAM.height * c - Z * s) * CAM.f) / depth;
    const g = 1 / Math.sqrt(1 + CAM.barrel * ((u * u + v * v) / ((CAM.w * CAM.w + CAM.h * CAM.h) / 4)));
    return `${(CAM.w / 2 + u * g).toFixed(1)} ${(CAM.h / 2 + v * g).toFixed(1)}`;
  }
  // the road's centre line, t metres ahead: straight, or bending away after MAT.from
  function roadAt(kind, t) {
    if (kind === 'straight' || t <= MAT.from) return { x: 0, z: t, nx: 1, nz: 0 };
    const a = (t - MAT.from) / MAT.bend;
    const sg = kind === 'left' ? -1 : 1;
    return { x: sg * MAT.bend * (1 - Math.cos(a)), z: MAT.from + MAT.bend * Math.sin(a), nx: Math.cos(a), nz: -sg * Math.sin(a) };
  }
  function strip(kind, o1, o2) {
    const a = [];
    const b = [];
    for (let i = 0; i <= 90; i++) {
      const p = roadAt(kind, -0.1 + i * 0.018);
      if (p.z > MAT.end || Math.abs(p.x) > 1.2) break;
      const q1 = camPoint(p.x + o1 * p.nx, p.z + o1 * p.nz);
      const q2 = camPoint(p.x + o2 * p.nx, p.z + o2 * p.nz);
      if (q1 && q2) { a.push(q1); b.push(q2); }
    }
    return `M${a.concat(b.reverse()).join(' L')}Z`;
  }
  const MAT_EDGE = Array.from({ length: 41 }, (_, i) => camPoint(-3 + i * 0.15, MAT.end)).join(' L');
  const camView = (kind) => `
    <div class="view-cam"><svg viewBox="0 0 ${CAM.w} ${CAM.h}" aria-hidden="true">
      <rect class="cam-room" width="${CAM.w}" height="${CAM.h}"/>
      <path class="cam-mat" d="M-40 140 L${MAT_EDGE} L160 140Z"/>
      <path class="cam-road" d="${strip(kind, -MAT.half, MAT.half)}"/>
      <path class="cam-tape" d="${strip(kind, -MAT.half, -MAT.half + MAT.tape)} ${strip(kind, MAT.half - MAT.tape, MAT.half)}"/>
    </svg></div>`;
  // what each frame shows, for screen readers (sighted players read it off the frame)
  const SEES = { right: 'the road bends right ahead', straight: 'the road runs straight ahead', left: 'the road bends left ahead' };
  const ARROW = {
    left: 'M13 8H3.5M7.5 4 3.5 8l4 4',
    straight: 'M8 13V3.5M4 7.5l4-4 4 4',
    right: 'M3 8h9.5M8.5 4l4 4-4 4',
  };
  const TRACK = 'M70 200 L150 200 C190 200 190 230 230 230 C270 230 270 200 310 200 L330 200 A50 50 0 0 0 380 150 L380 90 A50 50 0 0 0 330 40 L70 40 A50 50 0 0 0 20 90 L20 150 A50 50 0 0 0 70 200 Z';
  // the DeepCo car from above: the deck, two cells, the camera at the front, servo-steered front wheels
  const CAR = `
    <g class="car" transform="translate(70 200)">
      <path class="car-fov" d="M9.6 0 L32.1 -13 A26 26 0 0 1 32.1 13 Z"/>
      <rect class="car-tyre" x="-10" y="-8.8" width="5.2" height="2.6" rx=".6"/>
      <rect class="car-tyre" x="-10" y="6.2" width="5.2" height="2.6" rx=".6"/>
      <g class="car-steer" data-y="-7.5" transform="translate(5 -7.5)"><rect class="car-tyre" x="-2.6" y="-1.3" width="5.2" height="2.6" rx=".6"/></g>
      <g class="car-steer" data-y="7.5" transform="translate(5 7.5)"><rect class="car-tyre" x="-2.6" y="-1.3" width="5.2" height="2.6" rx=".6"/></g>
      <rect class="car-deck" x="-11" y="-5.8" width="20.5" height="11.6" rx="1.2"/>
      <rect class="car-cell" x="-8.6" y="-4.2" width="11" height="3.4" rx="1.7"/>
      <rect class="car-cell" x="-8.6" y=".8" width="11" height="3.4" rx="1.7"/>
      <rect class="car-cam" x="5.8" y="-2.2" width="3.2" height="4.4" rx=".6"/>
      <circle class="car-lens" cx="9.4" cy="0" r="1.2"/>
    </g>`;

  const svgEl = (parent, cls, tag = 'path') => {
    const el = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    el.setAttribute('class', cls);
    return parent.appendChild(el);
  };

  function drive(path, car, labels, tick = () => {}) {
    const L = path.getTotalLength();
    const at = (s) => path.getPointAtLength(((s % L) + L) % L);
    const heading = (s) => { const a = at(s - 1.5); const b = at(s + 1.5); return Math.atan2(b.y - a.y, b.x - a.x); };
    const kind = (s) => {
      let d = heading(s + 7) - heading(s - 7);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (d < -0.09) return 'left';
      if (d > 0.09) return 'right';
      return 'straight';
    };
    const place = (x, y, h) => car.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(h * 180 / Math.PI).toFixed(1)})`);
    return new Promise((done) => {
      let s = 0;
      let v = 0;
      let off = null;
      everyFrame(() => {
        if (off) {
          // off the tape it rolls on, still turning the way it was steered, and slows to a stop
          off.v *= 0.93;
          off.h += off.turn * off.v;
          off.x += Math.cos(off.h) * off.v;
          off.y += Math.sin(off.h) * off.v;
          place(off.x, off.y, off.h);
          tick(off.x, off.y, off.k, off.out);
          if (off.v > 0.3) return true;
          done(false);
          return false;
        }
        // it pulls away from the start line, runs at full speed, and slows onto the line at the end of the lap
        v = 4 * Math.max(0.12, Math.min(1, (s + 6) / 48, (L - s) / 56));
        s += v;
        if (s >= L) {
          const p = at(0);
          place(p.x, p.y, heading(0));
          tick(p.x, p.y, null, null);
          done(true);
          return false;
        }
        const k = kind(s);
        const p = at(s);
        const h = heading(s);
        if (labels[k] !== k) {
          off = { x: p.x, y: p.y, h, k, out: labels[k], turn: labels[k] === 'left' ? -0.027 : labels[k] === 'right' ? 0.027 : 0, v };
          tick(p.x, p.y, k, labels[k]);
          return true;
        }
        place(p.x, p.y, h);
        tick(p.x, p.y, k, k);
        return true;
      });
    });
  }

  CH.innovation = {
    title: 'What does first place really mean?',
    async play(body) {
      body.innerHTML = `
        <div class="medals">
          <figure class="medal">${img('assets/figures/story/iro-athens-gold.jpg', 949, 1000, 'Gold medals from the International Robot Olympiad in Athens')}<figcaption>Gold, International Robot Olympiad, Athens, January 2024</figcaption></figure>
          <div class="medal-text">
            <p class="sc-lede">Besides CHI, I won first place in AI autonomous driving at the International Robot Olympiad. But for me, winning was not about being called the best. A medal on its own felt empty. The win showed me what I should do next.</p>
            <p class="sc-lede">So I joined Ubion, an education technology company, and used what I learned from competing to build AI learning kits. I wanted more students in Korea to get into AI and go on to world competitions too.</p>
          </div>
        </div>
        <div class="drive">
          ${gateHtml('Drive the DeepCo car', 'Each camera view below is a frame the car sees. Label it left, straight or right, then press Drive to see if the car can finish a lap on its own.')}
          <ol class="views">${['right', 'straight', 'left'].map((k, i) => `
            <li class="view" data-kind="${k}">
              ${camView(k)}
              <div class="view-pick" role="group" aria-label="Camera view ${i + 1}, ${SEES[k]}">${['left', 'straight', 'right'].map((a) => `<button type="button" data-act="${a}" aria-pressed="false" aria-label="${a[0].toUpperCase() + a.slice(1)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${ARROW[a]}"/></svg></button>`).join('')}<i aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 3v9.5M4 8.5l4 4 4-4"/></svg></i></div>
            </li>`).join('')}
          </ol>
          <div class="sc-actions drive-go"><button class="btn btn--primary" type="button" data-go disabled>Drive</button></div>
          <div class="track">
            <svg viewBox="0 0 400 250" role="img" aria-label="The track, seen from above">
              <path class="track-edge" d="${TRACK}"/>
              <path class="track-road" d="${TRACK}"/>
              <path class="track-start" d="M70 188.5V211.5"/>
              <g class="track-traces"></g>
              ${CAR}
            </svg>
            <p class="track-msg" aria-live="polite"></p>
          </div>
        </div>`;
      const labels = { left: null, straight: null, right: null };
      // how to drive comes first, over the blurred demo; the views and Drive wake up on Start
      opened($('.drive', body), [$('.views', body), $('.drive-go', body)]);
      const go = $('[data-go]', body);
      const msg = $('.track-msg', body);
      const path = $('.track-road', body);
      const car = $('.car', body);
      const traces = $('.track-traces', body);
      const views = $$('.view', body);
      const wheels = $$('.car-steer', body);
      const steer = (out) => {
        const a = out === 'left' ? -24 : out === 'right' ? 24 : 0;
        wheels.forEach((w) => w.setAttribute('transform', `translate(5 ${w.dataset.y}) rotate(${a})`));
      };
      const show = (k, out) => {
        views.forEach((v) => {
          v.classList.toggle('is-live', v.dataset.kind === k);
          $$('button', v).forEach((b) => b.classList.toggle('is-fire', v.dataset.kind === k && b.dataset.act === out));
        });
      };
      views.forEach((v) => {
        $$('button', v).forEach((b) => b.addEventListener('click', () => {
          $$('button', v).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          labels[v.dataset.kind] = b.dataset.act;
          v.classList.remove('is-miss');
          go.disabled = Object.values(labels).some((x) => !x);
          msg.textContent = '';
        }));
      });
      for (;;) {
        await press(go);
        $$('.view-pick button', body).forEach((b) => { b.disabled = true; });
        views.forEach((v) => v.classList.remove('is-miss'));
        Array.from(traces.children).forEach((t) => t.classList.add('is-old'));
        msg.textContent = '';
        const trace = svgEl(traces, 'track-trace');
        const pts = [];
        let end = [70, 200];
        let last = '';
        const lap = await drive(path, car, { ...labels }, (x, y, k, out) => {
          end = [x, y];
          pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
          trace.setAttribute('d', `M${pts.join(' L')}`);
          if (`${k}${out}` !== last) {
            last = `${k}${out}`;
            steer(out);
            show(k, out);
          }
        });
        if (lap) {
          trace.classList.add('is-lap');
          msg.textContent = 'With your three labels, the car drove a full lap on its own.';
          break;
        }
        const miss = $('.view.is-live', body);
        if (miss) miss.classList.add('is-miss');
        svgEl(traces, 'track-x').setAttribute('d', `M${(end[0] - 4).toFixed(1)} ${(end[1] - 4).toFixed(1)}l8 8m0-8l-8 8`);
        trace.classList.add('is-off');
        msg.textContent = 'The car left the track at the outlined camera view.';
        await wait(900);
        // the car is lifted back to the start line: it fades where it stopped and fades in on the line
        const lift = calm() ? null : car.animate([{ opacity: 1 }, { opacity: 0 }], { duration: M.micro, easing: M.in, fill: 'forwards' });
        if (lift) await settle(lift, M.micro);
        show(null, null);
        steer(null);
        car.setAttribute('transform', 'translate(70 200)');
        if (lift) {
          lift.cancel();
          car.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.short, easing: M.out });
        }
        $$('.view-pick button', body).forEach((b) => { b.disabled = false; });
        go.disabled = false;
      }
      go.parentElement.classList.add('is-spent');
      add(body, beats([
        { src: 'assets/figures/ubion/ubion-car-build.jpg', w: 1400, h: 1042, alt: 'Wiring the new PCB, servo driver and battery pack', when: 'The DeepCo car', text: 'I ported the car from a Raspberry Pi 4 to a Pi 5, redesigned its PCB, servo driver and battery pack, and added a laser distance sensor.' },
        { src: 'assets/figures/ubion/ubion-car-detection.jpg', w: 1047, h: 1400, pos: '50% 30%', alt: 'The YOLOv8-lite detector finding signs on the track', text: 'It runs three models: a LeNet classifier that maps camera frames to left, straight or right, a 2D CNN regressor that learns continuous steering angles, and a YOLOv8-lite detector, trained on images I labeled myself, that stops the car for signs, lights and pedestrians.' },
        { src: 'assets/figures/ubion/ubion-app-inventor.png', w: 728, h: 374, alt: 'Designing a camera login screen in the DeepCo app builder', when: 'The DeepCo Board', text: 'Next, I wanted students to build their own AI projects, not only drive a car. Other kits let students use AI more than understand it, so I proposed the DeepCo Board, an ESP32-S3 board where students train a model in their browser, send it over Bluetooth, and build a phone app around it.' },
        { src: 'assets/figures/ubion/ubion-smart-home.jpg', w: 1400, h: 1231, alt: 'A two-floor miniature smart home run by two DeepCo Boards', text: 'At the COEX Education Fair in 2025, I showed it running a two-floor smart home, where a small neural network decides when to turn on the lights, the fan and Face ID.' },
      ]));
      add(body, `<p class="rv-text">Now other students learn with the car and the board I built, and that is what makes my medal mean something to me.</p>${fill('Innovation', 'this tile')}`);
    },
  };

  /* Responsibility: Oxford, the debate in Seoul, and the book */

  CH.responsibility = {
    title: 'Was my world too small?',
    async play(body) {
      body.innerHTML = `
        <p class="sc-lede">Winning competitions could easily have made me think only about myself. I wanted to look further, at the world outside Korea and at working with people there.</p>
        ${beats([
          { when: 'Oxford, March 2025', src: 'assets/figures/story/oxford-session.jpg', w: 1400, h: 746, alt: 'Dawit at a working session in Oxford', text: 'Through the Oxford-Stanford-Taejae Fellowship, I went to Oxford as one of Korea’s representatives in a debate on the UN Sustainable Development Goals. For a week at Kellogg College, we studied sustainability through finance, law, ethics and AI, and visited Chatham House and the London Stock Exchange.' },
          { src: 'assets/figures/honors/kellogg-certificate-ceremony.jpg', w: 1200, h: 900, alt: 'Dawit receiving his programme certificate at Kellogg College, with Professor William Barnett on the left', text: 'Until then, I saw ethics as something that slowed my experiments down. In one lecture, Professor William Barnett of Stanford asked us, “Are we as gods?” In a discussion on super corals, bred to survive warming seas, I realized that a technical fix is not enough if it ignores the whole ecosystem and how species depend on each other.' },
          { when: 'Seoul, August 2025', src: 'assets/figures/journey/seoul-2025/ceremony.jpg', w: 1400, h: 1050, alt: 'The finalists and judges on stage at the debate’s award ceremony', text: 'Back in Seoul, eight teams of students from Oxford, Stanford and Taejae debated whether AI can speed up sustainability, and in the final, whether AI agents should be spread across the world. My teammate and I won first place.' },
          { src: 'assets/figures/journey/seoul-2025/meeting.jpg', w: 640, h: 442, alt: 'Dawit at the table with the Deputy Prime Minister, presenting our debate recommendations', text: 'For me, the best part of winning was that our ideas actually reached Korea’s policymakers. We presented our recommendations to Deputy Prime Minister Koo Yun-cheol.' },
          { media: fan([
            { src: 'assets/figures/story/book-chapter-1.jpg', w: 466, h: 666, alt: 'The first page of Dawit’s chapter on science, technology and a sustainable future' },
            { src: 'assets/figures/story/book-cover.jpg', w: 672, h: 686, alt: 'The cover of Youth Conversations on Sustainable Development' },
            { src: 'assets/figures/story/book-chapter-2.jpg', w: 456, h: 664, alt: 'The first page of Dawit’s chapter on the Oxford-Stanford-Taejae AI Sustainability Debate' },
          ]), text: 'I wrote two chapters of <em>Youth Conversations on Sustainable Development</em>, a book from Korea’s Office for Government Policy Coordination. One is about how Oxford changed my view of a scientist’s responsibility, and the other records the OST debate.' },
        ])}
        <p class="rv-text">I want to keep working with people around the world and give back to Korea.</p>
        ${fill('Responsibility', 'this tile')}`;
    },
  };

  /* Sharing: what I gave, and where it went */

  const GAVE = [
    { what: '$2,000', of: 'our debate prize', to: 'WWF Korea, August 2025', note: 'My teammate and I gave all of it, a week after the debate.', pic: { src: 'assets/figures/journey/seoul-2025/wwf.jpg', w: 1100, h: 824, pos: '50% 40%', alt: 'Dawit and his teammate at WWF Korea with the $2,000 winner board' } },
    { what: '2,000,000 won', of: 'the whole prize', to: 'Geumcheon Mirae Scholarship Foundation, January 2026', note: 'I gave my Talent Award of Korea prize.', pic: { src: 'assets/figures/home/honor-talent.jpg', w: 960, h: 540, alt: 'Dawit in front of the 2025 Talent Award of Korea backdrop' } },
    { what: 'Two summers', of: 'teaching robots, with KOICA', to: 'Science teachers in Phnom Penh, Cambodia', note: 'I taught about 30 teachers, and they took robotics back to their own classrooms across Cambodia. Their enthusiasm pushed me to keep studying.', pic: { src: 'assets/figures/service/stem-cambodia-teachers.jpg', w: 898, h: 672, alt: 'Cambodian science teachers with their robot kits and laptops' } },
    { what: 'Five years', of: 'and counting', to: 'U9 Change, since 2021', note: 'I keep Korean sponsors in touch with the children they support in Kenya and South Sudan.', set: [
      { src: 'assets/figures/service/u9-2022.jpg', w: 350, h: 420, alt: 'U9 Change activity certificate, 2021 to 2022' },
      { src: 'assets/figures/service/u9-2023-excellence.jpg', w: 334, h: 420, alt: 'U9 Change Excellence Award, 2023' },
      { src: 'assets/figures/service/u9-2024.jpg', w: 332, h: 420, alt: 'U9 Change activity certificate, 2024' },
    ] },
  ];

  CH.sharing = {
    title: 'I passed on what I received.',
    async play(body) {
      body.innerHTML = `
        <p class="sc-lede">Thinking about it, what good is it to keep everything I had seen outside Korea, and outside my own small world, to myself? Why not share it back?</p>
        <div class="demo-box gave-box">
        ${gateHtml('Where it went', 'Each card is something I received. Click a card to see who I passed it on to.')}
        <ul class="gave">${GAVE.map((g) => `
          <li><button class="gave-card" type="button" aria-expanded="false">
            <span class="gave-photo">${g.set ? `<span class="gave-set">${g.set.map((c) => img(c.src, c.w, c.h, c.alt, 'loading="lazy"')).join('')}</span>` : img(g.pic.src, g.pic.w, g.pic.h, g.pic.alt, `loading="lazy"${g.pic.pos ? ` style="object-position: ${g.pic.pos}"` : ''}`)}
              <span class="gave-what"><b>${g.what}</b><span>${g.of}</span></span>
            </span>
            <span class="gave-to"><strong>${g.to}</strong><span>${g.note}</span></span>
          </button></li>`).join('')}
        </ul>
        </div>`;
      opened($('.gave-box', body), [$('.gave', body)]);
      await Promise.all($$('.gave-card', body).map((card) => new Promise((done) => {
        card.addEventListener('click', () => {
          card.classList.add('is-given');
          card.setAttribute('aria-expanded', 'true');
          card.disabled = true;
          done();
        }, { once: true });
      })));
      add(body, `
        <p class="rv-text">Seeing that is a big part of why I keep studying so hard. And very recently, after giving away my Talent Award prize, I didn’t want it to end there. I wanted to share what I had learned too, so I taught 20 elementary students in Geumcheon how to train a self-driving car’s AI, the very thing I won my gold medal for.</p>
        ${pair(
          { src: 'assets/figures/service/guest-lecture-class.jpg', w: 1200, h: 900, alt: 'Elementary students at laptops in a classroom with a road track on the floor', cap: 'Geumcheon Science Cube, July 2026' },
          { src: 'assets/figures/service/guest-lecture-cars.jpg', w: 1200, h: 900, alt: 'Rows of DeepCo self-driving cars on the classroom floor', cap: 'The DeepCo cars the students trained' },
        )}
        ${fill('Sharing', 'the last tile of my first line')}`);
    },
  };

  /* Technology: take over from a robot that fails, the way I trained robots at ROBOTIS */

  // The arm is drawn as a planar two-link kinematic diagram. Units are drawing units, not millimetres.
  const ARM = { x: 190, y: 250, l1: 170, l2: 160 };
  const START = { x: 300, y: 120 };
  const HOLE = { x: 472, y: 206 };
  const MISS = { x: 444, y: 206 };
  const PEG = 40; // wrist to peg tip
  const CATCH = 12; // how close the peg tip must come to the hole mouth
  // Where the visitor can send the gripper. Left of x 280 the elbow swings out past the viewBox (x 100);
  // below HOLE.y the wrist is held at the block top anyway, so arrow presses there would do nothing.
  const REACH = { x0: 280, x1: 560, y0: 64, y1: HOLE.y };
  const SVGNS = 'http://www.w3.org/2000/svg';

  function solveArm(p) {
    const dx = p.x - ARM.x;
    const dy = p.y - ARM.y;
    const d0 = Math.hypot(dx, dy) || 1;
    const d = Math.min(ARM.l1 + ARM.l2 - 0.5, Math.max(Math.abs(ARM.l1 - ARM.l2) + 0.5, d0));
    const x = (dx / d0) * d;
    const y = (dy / d0) * d;
    const a = Math.atan2(y, x);
    const b = Math.acos((ARM.l1 ** 2 + d ** 2 - ARM.l2 ** 2) / (2 * ARM.l1 * d));
    const e1 = { x: ARM.x + ARM.l1 * Math.cos(a - b), y: ARM.y + ARM.l1 * Math.sin(a - b) };
    const e2 = { x: ARM.x + ARM.l1 * Math.cos(a + b), y: ARM.y + ARM.l1 * Math.sin(a + b) };
    const elbow = e1.y < e2.y ? e1 : e2;
    const wrist = { x: ARM.x + x, y: ARM.y + y };
    // joint angles in the textbook convention: counterclockwise positive, y up
    const th1 = Math.atan2(ARM.y - elbow.y, elbow.x - ARM.x);
    let th2 = Math.atan2(elbow.y - wrist.y, wrist.x - elbow.x) - th1;
    th2 = Math.atan2(Math.sin(th2), Math.cos(th2));
    return { elbow, wrist, th1, th2 };
  }

  // a recorded path of the peg tip: a polyline, plus a dot every 100 ms of motion
  function tracer(g) {
    const line = $('polyline', g);
    const dots = $('.rb-dots', g);
    const pts = [];
    let last = null;
    let lastDot = null;
    return {
      add(p) {
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.8) return;
        last = p;
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        line.setAttribute('points', pts.join(' '));
      },
      dot(p) {
        if (lastDot && Math.hypot(p.x - lastDot.x, p.y - lastDot.y) < 1.2) return;
        lastDot = p;
        const c = doc.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', p.x.toFixed(1));
        c.setAttribute('cy', p.y.toFixed(1));
        c.setAttribute('r', '1.9');
        dots.appendChild(c);
      },
    };
  }

  const fmtDeg = (rad) => {
    const v = (rad * 180) / Math.PI;
    return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°`;
  };
  const polar = (c, r, a) => ({ x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) });

  CH.technology = {
    title: 'At ROBOTIS, I worked on how robots learn.',
    async play(body) {
      const tr = (k) => `<g class="rb-trace rb-trace--${k}"><polyline/><g class="rb-dots"></g></g>`;
      body.innerHTML = `
        <p class="sc-lede">For my second bingo, I joined ROBOTIS’s Humanoid Software Team as a research intern in summer 2026. Over nine weeks on three robots, I tested new robot AI models, built my own policy, trained it with reinforcement learning, and built a way to teach a robot by correcting it. The arm below is that last part.</p>
        <div class="robot">
          ${gateHtml('Correct the robot', 'The robot will try to put the peg in the hole. Just before it fails, it stops and hands control to you. Drag the gripper into the hole, or use the arrow keys, and the robot learns from your correction.', 'Run the robot')}
          <svg class="robot-svg" viewBox="100 40 490 290" tabindex="0" role="img" aria-label="A robot arm, drawn as a kinematic diagram, placing a peg in a hole. Use the arrow keys to guide it when it is your turn.">
            <defs>
              <pattern id="rb-hatch" class="rb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="3" y1="0" x2="3" y2="6"/></pattern>
            </defs>
            <rect class="rb-ground" x="100" y="290" width="490" height="7" fill="url(#rb-hatch)"/>
            <line class="rb-table" x1="100" y1="290" x2="590" y2="290"/>
            <path class="rb-section" d="M440 246H464V${HOLE.y + PEG + 26}H480V246H504V290H440Z" fill="url(#rb-hatch)"/>
            <path class="rb-edge" d="M440 290V246H464V${HOLE.y + PEG + 26}H480V246H504V290"/>
            <line class="rb-cl rb-cl--hole" x1="${HOLE.x}" y1="${HOLE.y + PEG - 14}" x2="${HOLE.x}" y2="314"/>
            <circle class="rb-catch" cx="${HOLE.x}" cy="${HOLE.y + PEG}" r="${CATCH}"/>
            ${tr('run1')}${tr('you')}${tr('run2')}
            <path class="rb-x" d="M${MISS.x - 4} ${MISS.y + PEG - 4}l8 8m0 -8l-8 8"/>
            <g class="rb-dim">
              <line class="rb-cl rb-cl--peg" y2="314"/>
              <line class="rb-dim-line" y1="307" y2="307"/>
              <path class="rb-dim-ticks"/>
              <text class="rb-dim-label" y="324" text-anchor="middle">Δ<tspan font-style="italic">x</tspan></text>
            </g>
            <rect class="rb-peg rb-peg--seated" x="${HOLE.x - 6}" y="${HOLE.y + 32}" width="12" height="34"/>
            <path class="rb-base" d="M${ARM.x} ${ARM.y}L${ARM.x - 17} 290H${ARM.x + 17}Z"/>
            <g class="rb-angle">
              <line class="rb-cl" x1="${ARM.x}" y1="${ARM.y}" x2="${ARM.x + 46}" y2="${ARM.y}"/>
              <path class="rb-arc rb-arc--1"/>
              <text class="rb-sym rb-sym--1">θ<tspan class="rb-sub" dy="3">1</tspan></text>
              <line class="rb-cl rb-ext"/>
              <path class="rb-arc rb-arc--2"/>
              <text class="rb-sym rb-sym--2">θ<tspan class="rb-sub" dy="3">2</tspan></text>
            </g>
            <line class="rb-link rb-link--1"/><line class="rb-core rb-core--1"/><line class="rb-cl rb-axis rb-axis--1"/>
            <line class="rb-link rb-link--2"/><line class="rb-core rb-core--2"/><line class="rb-cl rb-axis rb-axis--2"/>
            <circle class="rb-joint" cx="${ARM.x}" cy="${ARM.y}" r="8"/><circle class="rb-pin" cx="${ARM.x}" cy="${ARM.y}" r="1.8"/>
            <circle class="rb-joint rb-elbow" r="6.5"/><circle class="rb-pin rb-elbow-pin" r="1.6"/>
            <g class="rb-hand">
              <rect class="rb-peg" x="-6" y="6" width="12" height="34"/>
              <path class="rb-palm" d="M0 4.5V5.5M-11 5.5H11"/>
              <path class="rb-jaw rb-jaw--l" d="M-8 5.5V18H-6.2"/>
              <path class="rb-jaw rb-jaw--r" d="M8 5.5V18H6.2"/>
              <circle class="rb-joint" r="4.5"/>
            </g>
            <text class="rb-lbl rb-lbl--run1" x="${MISS.x - 7}" y="${MISS.y + 22}" text-anchor="end">run 1</text>
            <text class="rb-lbl rb-lbl--you" x="${HOLE.x + 14}" y="${HOLE.y + PEG - 5}">you</text>
            <text class="rb-lbl rb-lbl--run2" x="${HOLE.x + 7}" y="${HOLE.y + 12}">run 2</text>
            <text class="rb-read" x="108" y="322"><tspan class="rb-read-sym">θ</tspan><tspan class="rb-sub" dy="2.5">1</tspan><tspan class="rb-v1" dy="-2.5"></tspan></text>
            <text class="rb-read" x="212" y="322"><tspan class="rb-read-sym">θ</tspan><tspan class="rb-sub" dy="2.5">2</tspan><tspan class="rb-v2" dy="-2.5"></tspan></text>
            <g class="rb-key"><circle cx="530" cy="318" r="1.9"/><text x="537" y="322">100 ms</text></g>
            <text class="rb-who" x="582" y="60" text-anchor="end"></text>
          </svg>
          <p class="robot-msg" aria-live="polite"></p>
        </div>
        <div class="sc-actions"><button class="btn btn--primary" type="button" data-run hidden disabled>Retrain and run</button><button class="btn" type="button" data-guide hidden>Guide it for me</button></div>`;
      const svg = $('.robot-svg', body);
      const q = (s) => $(s, svg);
      const link1 = q('.rb-link--1');
      const link2 = q('.rb-link--2');
      const bars = [[link1, q('.rb-core--1'), q('.rb-axis--1')], [link2, q('.rb-core--2'), q('.rb-axis--2')]];
      const elbowDot = q('.rb-elbow');
      const elbowPin = q('.rb-elbow-pin');
      const hand = q('.rb-hand');
      const who = q('.rb-who');
      const v1 = q('.rb-v1');
      const v2 = q('.rb-v2');
      const pegCl = q('.rb-cl--peg');
      const dimLine = q('.rb-dim-line');
      const dimTicks = q('.rb-dim-ticks');
      const dimLabel = q('.rb-dim-label');
      const msg = $('.robot-msg', body);
      const run = $('[data-run]', body);
      const guide = $('[data-guide]', body);
      const run1 = tracer(q('.rb-trace--run1'));
      const you = tracer(q('.rb-trace--you'));
      const run2 = tracer(q('.rb-trace--run2'));
      let wrist = { ...START };
      const tip = (p) => ({ x: p.x, y: p.y + PEG });
      const set = (el, attrs) => Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v));
      const arc = (c, r, a0, a1) => {
        const p0 = polar(c, r, a0);
        const p1 = polar(c, r, a1);
        return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 0 : 1} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      };
      // the dimension from the peg's centreline to the hole's: the error the visitor is closing
      const dim = (x) => {
        set(pegCl, { x1: x, x2: x, y1: wrist.y });
        set(dimLine, { x1: x, x2: HOLE.x });
        dimTicks.setAttribute('d', `M${(x - 3).toFixed(1)} 310l6 -6M${HOLE.x - 3} 310l6 -6`);
        set(dimLabel, { x: (x + HOLE.x) / 2 });
        svg.classList.toggle('is-close', Math.abs(x - HOLE.x) < 10);
      };
      const draw = (p) => {
        const s = solveArm(p);
        wrist = s.wrist;
        const joints = [[ARM, s.elbow], [s.elbow, s.wrist]];
        bars.forEach((els, i) => els.forEach((el) => set(el, { x1: joints[i][0].x, y1: joints[i][0].y, x2: joints[i][1].x, y2: joints[i][1].y })));
        set(elbowDot, { cx: s.elbow.x, cy: s.elbow.y });
        set(elbowPin, { cx: s.elbow.x, cy: s.elbow.y });
        hand.setAttribute('transform', `translate(${s.wrist.x.toFixed(1)} ${s.wrist.y.toFixed(1)})`);
        // θ1 from the horizontal; θ2 from the extension of link 1
        q('.rb-arc--1').setAttribute('d', arc(ARM, 30, 0, s.th1));
        const m1 = polar(ARM, 43, s.th1 / 2);
        set(q('.rb-sym--1'), { x: m1.x - 5, y: m1.y + 5 });
        const ext = polar(s.elbow, 30, s.th1);
        set(q('.rb-ext'), { x1: s.elbow.x, y1: s.elbow.y, x2: ext.x, y2: ext.y });
        q('.rb-arc--2').setAttribute('d', arc(s.elbow, 20, s.th1, s.th1 + s.th2));
        const m2 = polar(s.elbow, 32, s.th1 + s.th2 / 2);
        set(q('.rb-sym--2'), { x: m2.x - 5, y: m2.y + 5 });
        v1.textContent = ` ${fmtDeg(s.th1)}`;
        v2.textContent = ` ${fmtDeg(s.th2)}`;
        if (svg.classList.contains('is-miss')) dim(wrist.x);
      };
      // follows the planned path; the trace is sampled from the plan, so it is exact even when a frame is late
      const move = (points, ms, rec) => new Promise((done) => {
        const t0 = performance.now();
        const pts = [{ ...wrist }, ...points];
        const at = (t) => {
          const u = ease(t) * (pts.length - 1);
          const i = Math.min(pts.length - 2, Math.floor(u));
          const f = u - i;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
        };
        let nextLine = 0;
        let nextDot = 0;
        everyFrame((now) => {
          const el = calm() ? ms : Math.min(ms, now - t0);
          if (rec) {
            for (; nextLine <= el; nextLine += 16) rec.add(tip(at(nextLine / ms)));
            for (; nextDot <= el; nextDot += 100) rec.dot(tip(at(nextDot / ms)));
          }
          draw(at(el / ms));
          if (el < ms) return true;
          if (rec) rec.add(tip(at(1)));
          done();
          return false;
        });
      });
      draw(START);

      who.textContent = 'policy';
      await opened($('.robot', body), [svg]);
      // HG-DAgger: the policy heads for the wrong spot, and it is stopped just before the miss
      await move([{ x: MISS.x, y: MISS.y - 50 }, { x: MISS.x, y: MISS.y - 16 }], 1300, run1);
      svg.classList.add('is-miss');
      dim(wrist.x);
      msg.textContent = 'It stopped just before missing the hole. Drag the gripper into the hole.';
      who.textContent = 'you';
      // hand keyboard focus to the drawing so the arrow keys work at once
      if (doc.activeElement === doc.body || !doc.activeElement || doc.activeElement.closest('.demo-gate')) svg.focus({ preventScroll: true });
      svg.classList.add('is-yours');

      await new Promise((done) => {
        let goal = { ...wrist };
        let dragging = false;
        let finished = false;
        let lastDot = 0;
        const clampGoal = (p) => ({ x: Math.min(REACH.x1, Math.max(REACH.x0, p.x)), y: Math.min(REACH.y1, Math.max(REACH.y0, p.y)) });
        const toSvg = (e) => {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          return pt.matrixTransform(svg.getScreenCTM().inverse());
        };
        svg.addEventListener('pointerdown', (e) => {
          if (finished) return;
          dragging = true;
          capture(svg, e);
          goal = clampGoal(toSvg(e));
        });
        svg.addEventListener('pointermove', (e) => { if (dragging) goal = clampGoal(toSvg(e)); });
        svg.addEventListener('pointerup', () => { dragging = false; });
        svg.addEventListener('keydown', (e) => {
          const step = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
          if (!step || finished) return;
          e.preventDefault();
          goal = clampGoal({ x: goal.x + step[0], y: goal.y + step[1] });
        });
        const helpTimer = setTimeout(() => { guide.hidden = false; }, 10000);
        guide.addEventListener('click', () => { goal = { ...HOLE }; guide.disabled = true; });
        you.add(tip(wrist));
        everyFrame((now) => {
          if (finished || !svg.isConnected) return false;
          draw({ x: wrist.x + (goal.x - wrist.x) * 0.3, y: Math.min(wrist.y + (goal.y - wrist.y) * 0.3, HOLE.y) });
          you.add(tip(wrist));
          if (now - lastDot >= 100) { you.dot(tip(wrist)); lastDot = now; }
          if (Math.hypot(wrist.x - HOLE.x, wrist.y - HOLE.y) < CATCH) {
            finished = true;
            clearTimeout(helpTimer);
            draw(HOLE);
            you.add(tip(HOLE));
            done();
            return false;
          }
          return true;
        });
      });

      svg.classList.remove('is-yours', 'is-miss', 'is-close');
      svg.classList.add('is-saved');
      guide.hidden = true;
      msg.textContent = 'Your correction is saved. Retrain the robot on it and run it again.';
      run.hidden = false;
      run.disabled = false;
      await press(run);
      svg.classList.add('is-retrained');
      who.textContent = 'policy, retrained';
      msg.textContent = '';
      await move([START], 700);
      // it reaches the same wrong spot, and this time it knows the way from there into the hole
      await move([{ x: MISS.x, y: MISS.y - 50 }, { x: MISS.x, y: MISS.y - 16 }], 1100, run2);
      await wait(120);
      await move([{ x: HOLE.x, y: HOLE.y - 10 }, HOLE], 700, run2);
      await move([{ x: HOLE.x, y: HOLE.y + 26 }], 450, run2);
      svg.classList.add('is-in');
      msg.textContent = 'It reached the same wrong spot, and this time it found its way into the hole.';
      // it lets go of the peg and moves clear, so the three runs can be read side by side
      await wait(350);
      await move([{ x: HOLE.x, y: HOLE.y - 30 }, START], 900);
      svg.classList.add('is-done');
      run.parentElement.remove();
      const shown = add(body, `${beats([
        { media: '<video src="assets/figures/story/hg-dagger.mp4" poster="assets/figures/robotis/hg-dagger-operation-poster.jpg" muted loop playsinline autoplay preload="metadata" aria-label="Operating the HG-DAgger system on the AI Worker"></video>', text: 'Your correction was a small version of HG-DAgger, the human-in-the-loop system I built for the real robot. Corrected just before it fails, the robot learns to recover from wrong states its demonstrations never showed it. With 30 demonstrations and 13 corrections, the AI Worker learned a long peg-and-screw task.' },
        { media: '<video src="assets/figures/robotis/prior-act-td3-rollout.mp4" poster="assets/figures/robotis/prior-act-td3-rollout-poster.jpg" muted loop playsinline autoplay preload="metadata" aria-label="Prior-ACT placing a bottle in the basket on the real AI Worker"></video>', text: 'I also built Prior-ACT, which lets an ACT policy choose how to move from what its camera sees, and trained it with off-policy RL in a simulation calibrated to the real robot. Back on the real AI Worker, it improved far more than TurboVLA, a vision-language-action model.' },
      ])}
        <figure class="result">
          <p class="result-head">Success on the real AI Worker, before and after training in simulation</p>
          <div class="result-rows">
            <div class="result-row"><span class="result-name">Prior-ACT, which I built</span><span class="result-bar" style="--a: .60; --b: .82"><i></i><b></b></span><span class="result-val">60% → ≈82%</span></div>
            <div class="result-row"><span class="result-name">TurboVLA</span><span class="result-bar" style="--a: .16; --b: .30"><i></i><b></b></span><span class="result-val">16% → ≈30%</span></div>
          </div>
        </figure>
        <p class="rv-text">ROBOTIS also published my benchmark of four of 2026’s newest vision-language-action and world models as its AI MANIPULATOR #13 video, and merged five of my pull requests.</p>
        <p class="rv-text">Then I asked myself why I was learning robotics and AI. If it was only for fun, what would it really mean? I believe robots and AI should help people, so what more could I do to make that happen?</p>`);
      // each gain grows out of the bar it was added to
      if (!calm()) $$('.result-bar b', shown).forEach((g) => settle(g.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: M.long, easing: M.out, delay: M.base, fill: 'backwards' }), M.long + M.base));
    },
  };

  /* Compassion: type with your eyes, then with a silent sound */

  const ALS = 'Only 22 to 31 people have ever received a speech implant. The low-cost alternative is an eye-tracking keyboard, at 5 to 10 words per minute.';

  CH.compassion = {
    title: 'Between 173,000 and 232,500 people with ALS cannot speak.',
    async play(body) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const GOAL = 'HELLO WORLD';
      const DWELL = 800;
      body.innerHTML = `
        <p class="sc-lede" data-lede>${ALS}</p>
        <div class="eyes" tabindex="0" aria-label="Gaze keyboard. Use the arrow keys to move your gaze.">
          <p class="eyes-out"><span class="eyes-typed" aria-live="polite"></span><span class="eyes-caret" aria-hidden="true"></span><span class="eyes-goal" aria-hidden="true">${GOAL}</span></p>
          <div class="eyes-keys">${letters.map((l) => `<span class="key" data-k="${l}">${l}</span>`).join('')}<span class="key key--sp" data-k=" ">space</span><span class="key key--sp" data-k="del">delete</span></div>
          <svg class="eyes-time" aria-hidden="true"></svg>
          <svg class="eyes-path" aria-hidden="true"></svg>
          <div class="eyes-gate">
            <div class="eyes-gate-card">
              <p class="eyes-gate-step" data-gate-step>1 of 2</p>
              <p class="eyes-gate-title" data-gate-title>Typing with your eyes</p>
              <p class="eyes-gate-text" data-gate-text>On an eye-tracking keyboard, a key types when you look at it for 0.8 seconds. Your pointer stands in for your eyes. Type HELLO WORLD, and I will time you.</p>
              <button class="btn btn--primary" type="button" data-gate>Start</button>
            </div>
          </div>
        </div>
        <div class="sc-actions"><button class="btn btn--primary" type="button" data-speak hidden>Speak</button><button class="btn btn--primary" type="button" data-switch hidden>Now try it with iPhoneme</button><span class="sc-hint" data-hint aria-live="polite">Hold your pointer on a key until it types.</span></div>`;
      const eyes = $('.eyes', body);
      const keys = $$('.key', body);
      const typed = $('.eyes-typed', body);
      const ghost = $('.eyes-goal', body);
      const path = $('.eyes-path', body);
      const time = $('.eyes-time', body);
      const hint = $('[data-hint]', body);
      const lede = $('[data-lede]', body);
      const speakBtn = $('[data-speak]', body);
      const switchBtn = $('[data-switch]', body);
      // The lede is rewritten twice as the chapter goes on. It keeps its first (longest) height so the keyboard
      // under it never moves, and each new text fades in where the old one was.
      lede.style.minHeight = `${lede.offsetHeight}px`;
      const say = (s) => {
        lede.textContent = s;
        if (!calm()) lede.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.short, easing: M.out });
      };
      let mode = 'dwell';
      let target = null;
      let since = 0;
      let text = '';
      let dwellCount = 0;
      let dwellDone = false;
      let gx = 0;
      let gy = 0;
      let tx = 0;
      let ty = 0;
      let looking = false;
      let running = true;
      // each keyboard waits behind its start screen; the clock starts when Start is pressed
      let gated = true;
      let t0 = 0;
      let dwellTime = 0;
      let speakTime = 0;
      let session = performance.now();
      let endAt = 0;
      let finish;
      const finished = new Promise((r) => { finish = r; });

      // What an eye tracker records: fixations (where and how long) and, once the implant joins, each silent sound.
      const fixes = [];
      const pulses = [];
      const centers = new Map();
      let tw = 0;
      const f1 = (v) => v.toFixed(1);
      // looks shorter than this are the eye in transit, not a fixation
      const kept = (f, now) => f.hits.length > 0 || (f.t1 == null ? now : f.t1) - f.t0 >= 100;

      // the longest end of what was typed that starts HELLO counts; anything before it was typed by accident
      const renderText = () => {
        let n = Math.min(text.length, GOAL.length);
        while (n > 0 && !text.endsWith(GOAL.slice(0, n))) n -= 1;
        const cut = text.length - n;
        const nb = (t) => t.replace(/ /g, '\u00a0');
        typed.innerHTML = (cut ? `<span class="is-off">${nb(text.slice(0, cut))}</span>` : '') + nb(text.slice(cut));
        ghost.textContent = nb(GOAL.slice(n));
      };

      /* the scanpath, drawn over the keys */
      const drawPath = (now, final) => {
        const pool = fixes.filter((f) => f.t0 >= session && (f.t1 == null || kept(f, now)));
        const list = final ? pool.filter((f) => kept(f, now)) : pool.slice(-8);
        let s = '';
        let prev = null;
        list.forEach((f, i) => {
          const c = centers.get(f.el);
          if (!c) return;
          const live = f.t1 == null && !final;
          const dur = (f.t1 == null ? now : f.t1) - f.t0;
          const r = live ? c.r : Math.max(3.5, c.r * Math.sqrt(Math.min(1, dur / 2400)));
          const op = final ? 0.9 : Math.max(0.1, 0.9 - (list.length - 1 - i) * 0.12);
          if (prev) {
            const dx = c.x - prev.x;
            const dy = c.y - prev.y;
            const d = Math.hypot(dx, dy);
            if (d > prev.r + r + 3) {
              const ux = dx / d;
              const uy = dy / d;
              s += `<line class="ep-sac" style="opacity:${(op * 0.5).toFixed(2)}" x1="${f1(prev.x + ux * prev.r)}" y1="${f1(prev.y + uy * prev.r)}" x2="${f1(c.x - ux * r)}" y2="${f1(c.y - uy * r)}"/>`;
            }
          }
          const by = f.hits.length ? ` is-${f.hits[f.hits.length - 1].by}` : '';
          if (live && mode === 'dwell') {
            const len = 2 * Math.PI * r;
            const p = Math.min(1, (now - since) / DWELL);
            s += `<circle class="ep-track" cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(r)}"/>`
              + `<circle class="ep-ring" cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(r)}" stroke-dasharray="${f1(len * p)} ${f1(len)}" transform="rotate(-90 ${f1(c.x)} ${f1(c.y)})"/>`;
          } else if (live) {
            s += `<g class="ep-reticle${by}"><circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(r)}"/>`
              + `<path d="M${f1(c.x)} ${f1(c.y - r)}v5M${f1(c.x)} ${f1(c.y + r)}v-5M${f1(c.x - r)} ${f1(c.y)}h5M${f1(c.x + r)} ${f1(c.y)}h-5"/></g>`;
          } else {
            s += `<circle class="ep-fix${by}" style="opacity:${op.toFixed(2)}" cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(r)}"/>`;
          }
          prev = { x: c.x, y: c.y, r };
        });
        // on a key, the ring or reticle is the gaze; between keys, the raw gaze point, with its tremor
        if (looking && !target && !final) {
          const j = calm() ? 0 : (mode === 'dwell' ? 1.6 : 0.8);
          s += `<circle class="ep-gaze" cx="${f1(gx + (Math.random() - 0.5) * j)}" cy="${f1(gy + (Math.random() - 0.5) * j)}" r="2.5"/>`;
        }
        path.innerHTML = s;
      };

      /* the record underneath: gaze on top, the implant below, time running left */
      const X0 = 58;
      const G = 16;
      const I = 70;
      const PAST = 4800;
      const SPAN = 6000;
      const drawTime = (now, final) => {
        if (!tw) return;
        const tEnd = final ? endAt : now;
        const a = final ? session - 250 : (calm() ? now - ((now - session) % PAST) : now - PAST);
        const k = final ? (tw - X0) / (endAt + 350 - a) : (tw - X0) / SPAN;
        const b = a + (tw - X0) / k;
        const X = (t) => X0 + (t - a) * k;
        let s = `<text class="et-lab" x="0" y="${G + 3.5}">gaze</text><line class="et-base" x1="${X0}" x2="${tw}" y1="${G}" y2="${G}"/>`;
        if (mode === 'speak') {
          s += `<text class="et-lab" x="0" y="${I + 3.5}">implant</text><line class="et-base" x1="${X0}" x2="${tw}" y1="${I}" y2="${I}"/>`;
          // one mark for each silent sound the visitor made
          let marks = '';
          for (const p of pulses) if (p >= Math.max(a, session) && p <= tEnd) marks += `M${f1(X(p))} ${I}v-18`;
          s += `<path class="et-bins is-burst" d="${marks}"/>`;
        }
        let labEnd = -Infinity;
        for (const f of fixes) {
          if (f.t0 < session || !kept(f, tEnd)) continue;
          const t1 = f.t1 == null ? tEnd : f.t1;
          if (t1 < a || f.t0 > b) continue;
          const x1 = X(Math.max(f.t0, a));
          const x2 = Math.min(X(t1), tw);
          const live = f.t1 == null && !final;
          s += `<rect class="et-bar${live ? ' is-live' : ''}" x="${f1(x1)}" y="${G - 3}" width="${f1(Math.max(1, x2 - x1))}" height="6"/>`;
          if (f.t0 >= a && x1 >= labEnd + 3) {
            s += `<text class="et-key" x="${f1(x1)}" y="${G - 7}">${f.k === 'del' ? 'del' : f.k === ' ' ? 'sp' : f.k}</text>`;
            labEnd = x1 + (f.k === 'del' ? 21 : 7);
          }
          for (const h of f.hits) {
            if (h.t < a) continue;
            const x = f1(X(h.t));
            s += `<line class="et-hit is-${h.by}" x1="${x}" x2="${x}" y1="${G - 9}" y2="${G + 9}"/>`;
            if (h.by === 'phon') s += `<line class="et-link" x1="${x}" x2="${x}" y1="${G + 11}" y2="${I - 25}"/>`;
          }
        }
        if (!final) {
          const xn = f1(X(now));
          s += `<line class="et-now" x1="${xn}" x2="${xn}" y1="2" y2="${mode === 'speak' ? I + 4 : G + 12}"/>`;
          if (mode === 'dwell' && target) {
            // a dimension line for the dwell: the next click is 800 ms after the last one
            const d1 = Math.max(X0, X(since));
            const d2 = X(since + DWELL);
            const y = G + 14;
            const mid = Math.min(Math.max((d1 + d2) / 2, X0 + 20), tw - 20);
            s += `<path class="et-dim" d="M${f1(d1)} ${y - 4}v8M${f1(d1)} ${y}H${f1(d2)}M${f1(d2)} ${y - 4}v8"/><text class="et-dim-lab" x="${f1(mid)}" y="${y + 13}">${DWELL} ms</text>`;
          }
        } else {
          const unit = [1000, 2000, 5000, 10000, 20000].find((u) => u * k >= 36) || 20000;
          const x1 = tw - unit * k;
          const y = I + 13;
          s += `<path class="et-scale" d="M${f1(x1)} ${y - 3}v6M${f1(x1)} ${y}H${tw}M${f1(tw - 0.5)} ${y - 3}v6"/><text class="et-lab et-lab--end" x="${f1(x1 - 6)}" y="${y + 3.5}">${unit / 1000} s</text>`;
        }
        time.innerHTML = s;
      };

      const draw = (now, final) => {
        drawPath(now, final);
        drawTime(now, final);
      };

      let ro = null;
      const measure = () => {
        // the chapter was replaced or replayed: stop watching the old keyboard
        if (!eyes.isConnected) {
          if (ro) ro.disconnect();
          else removeEventListener('resize', measure);
          return;
        }
        const e = eyes.getBoundingClientRect();
        keys.forEach((k) => {
          const r = k.getBoundingClientRect();
          centers.set(k, { x: r.left - e.left + r.width / 2, y: r.top - e.top + r.height / 2, r: Math.min(r.width, r.height) / 2 - 4 });
        });
        tw = time.getBoundingClientRect().width;
        if (target) {
          const c = centers.get(target);
          tx = c.x;
          ty = c.y;
        }
        if (!running) draw(endAt, true);
      };
      measure();
      ro = 'ResizeObserver' in window ? new ResizeObserver(() => measure()) : null;
      if (ro) ro.observe(eyes);
      else addEventListener('resize', measure);

      const fixate = (k, now) => {
        const cur = fixes[fixes.length - 1];
        if (cur && cur.t1 == null) cur.t1 = now;
        if (k) fixes.push({ el: k, k: k.dataset.k, t0: now, t1: null, hits: [] });
      };
      const setTarget = (k) => {
        if (k === target || !running || gated) return;
        if (target) target.classList.remove('is-gaze');
        target = k;
        since = performance.now();
        fixate(k, since);
        if (!k) return;
        looking = true;
        k.classList.add('is-gaze');
        const c = centers.get(k);
        tx = c.x;
        ty = c.y;
      };
      const type = (k) => {
        const now = performance.now();
        if (gated) return;
        if (mode === 'speak') pulses.push(now);
        if (!k) return;
        text = k.dataset.k === 'del' ? text.slice(0, -1) : text + k.dataset.k;
        renderText();
        const cur = fixes[fixes.length - 1];
        if (cur && cur.el === k && cur.t1 == null) cur.hits.push({ t: now, by: mode === 'dwell' ? 'dwell' : 'phon' });
        k.classList.remove('is-typed');
        void k.offsetWidth;
        k.classList.add('is-typed');
        if (mode === 'dwell') {
          dwellCount += 1;
          if (text.endsWith(GOAL)) {
            dwellDone = true;
            dwellTime = now - t0;
            // the phrase is done: it is ticked off with the time, and the next step appears
            $('.eyes-out', body).insertAdjacentHTML('beforeend', `<span class="eyes-check" aria-label="Done">✓ ${(dwellTime / 1000).toFixed(1)} s</span>`);
            hint.textContent = 'Keys you only meant to look at get typed too, which researchers call the Midas touch problem.';
            switchBtn.hidden = false;
          }
        } else if (text.endsWith(GOAL) || text.length >= GOAL.length + 6) {
          speakTime = now - t0;
          endAt = now;
          running = false;
          finish();
        }
      };
      const stopFrames = everyFrame((now) => {
        if (!running) return false;
        gx += (tx - gx) * 0.2;
        gy += (ty - gy) * 0.2;
        if (mode === 'dwell' && !dwellDone && target && now - since >= DWELL) {
          type(target);
          since = now;
        }
        draw(now, false);
        return true;
      });

      eyes.addEventListener('pointermove', (e) => {
        const hit = doc.elementFromPoint(e.clientX, e.clientY);
        const key = hit ? hit.closest('.key') : null;
        if (key && eyes.contains(key)) setTarget(key);
        else {
          setTarget(null);
          const r = eyes.getBoundingClientRect();
          tx = e.clientX - r.left;
          ty = e.clientY - r.top;
        }
      });
      eyes.addEventListener('pointerdown', (e) => {
        const key = e.target.closest('.key');
        if (!key) return;
        setTarget(key);
        // once gaze only points, a deliberate click stands in for the silent sound
        if (mode === 'speak' && e.pointerType === 'mouse') type(key);
      });
      eyes.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && mode === 'dwell') setTarget(null); });
      eyes.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' && mode === 'dwell') setTarget(null); });
      eyes.addEventListener('keydown', (e) => {
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
        if (moves[e.key] === undefined) return;
        e.preventDefault();
        const i = target ? keys.indexOf(target) : -1;
        setTarget(keys[Math.max(0, Math.min(keys.length - 1, i < 0 ? 0 : i + moves[e.key]))]);
      });
      // Space is the silent sound wherever focus is, except on a button, which handles Space itself
      const onSpace = (e) => {
        if (e.key !== ' ' || mode !== 'speak' || e.repeat) return;
        if (e.target instanceof Element && e.target.closest('button, a, input, textarea')) return;
        e.preventDefault();
        type(target);
      };
      doc.addEventListener('keydown', onSpace);
      speakBtn.addEventListener('pointerdown', (e) => e.preventDefault());
      speakBtn.addEventListener('click', () => type(target));
      const gate = $('.eyes-gate', body);
      const openGate = () => {
        gate.hidden = false;
        if (!calm()) gate.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.short, easing: M.out });
      };
      $('[data-gate]', body).addEventListener('click', () => {
        gated = false;
        gate.hidden = true;
        t0 = performance.now();
        session = t0;
        since = t0;
        eyes.focus({ preventScroll: true });
        if (mode === 'dwell') setTimeout(() => { if (mode === 'dwell') switchBtn.hidden = false; }, 60000);
      });
      switchBtn.addEventListener('click', () => {
        gated = true;
        $('[data-gate-step]', body).textContent = '2 of 2';
        $('[data-gate-title]', body).textContent = 'Typing with iPhoneme';
        $('[data-gate-text]', body).textContent = matchMedia('(pointer: coarse)').matches
          ? 'Now your gaze only points at a key. In iPhoneme, the key types when a silent phoneme, a sound you only think of saying, is decoded from your brain signals. Here, tapping Speak stands in for that decoded phoneme. Type HELLO WORLD again.'
          : 'Now your gaze only points at a key. In iPhoneme, the key types when a silent phoneme, a sound you only think of saying, is decoded from your brain signals. Here, pressing Space stands in for that decoded phoneme. Type HELLO WORLD again.';
        openGate();
        mode = 'speak';
        // a new record starts; a key still under the gaze starts a new fixation in it
        session = performance.now();
        since = session;
        if (target) fixate(target, session);
        text = '';
        renderText();
        const check = $('.eyes-check', body);
        if (check) check.remove();
        eyes.classList.add('is-speak');
        switchBtn.hidden = true;
        speakBtn.hidden = false;
        eyes.focus({ preventScroll: true });
        say('With iPhoneme, your gaze only points at a key, and a silent phoneme decoded from brain signals types it.');
        hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Touch a key to look at it, then tap Speak, the decoded phoneme.' : 'Point at a key, then press Space, the decoded phoneme.';
      });

      await finished;
      stopFrames();
      doc.removeEventListener('keydown', onSpace);
      $('.sc-actions', body).remove();
      fixate(null, endAt);
      if (target) target.classList.remove('is-gaze');
      eyes.classList.add('is-done');
      eyes.blur();
      say(ALS);
      draw(endAt, true);
      const sec = (ms) => (ms ? `${(ms / 1000).toFixed(1)} s` : 'not finished');
      add(body, `
        <div class="eyes-times">
          <p><span>Eye-tracking keyboard</span><b>${sec(dwellTime)}</b></p>
          <p><span>iPhoneme</span><b>${sec(speakTime)}</b></p>
        </div>
        <p class="rv-text">Here, the Space key stood in for one silent phoneme decoded from brain signals, the way a click or a keyboard shortcut works for anyone else. In iPhoneme, one phoneme that is rarely used and easy to tell apart could mean click, and another could mean drag. The goal is to let people with ALS use a computer the way everyone else uses a mouse, a keyboard or a touch screen, with as low a barrier as possible.</p>
        <p class="rv-text">I built the decoder for iPhoneme, which turns a speech implant’s signals into phonemes with 92.14% accuracy on the T15 dataset, about 3 points above the previous best. In the keyboard my teammate and I designed, a silent sound picks a key 3 to 10 times faster than a held gaze.</p>
        <p class="rv-meta">“iPhoneme: Brain-to-Text Communication for ALS Using ConformerXL Decoding,” arXiv:2604.16441, April 2026, equal-contribution first author</p>`);
    },
  };


  /* The flow */

  async function chapter(key) {
    const t = TILES[key];
    const ch = CH[key];
    const el = await scene(`
      ${ch.lead ? `<p class="sc-lead">${ch.lead}</p>` : ''}
      <h2 class="sc-title">${ch.title}</h2>
      <div class="sc-body"></div>`, t);
    const cell = cellOf(t);
    cell.style.setProperty('--tile', t.color);
    cell.classList.add('is-open');
    const body = $('.sc-body', el);
    await ch.play(body);
    const bar = add(body, `<div class="sc-actions"><button class="btn btn--primary btn--stamp" type="button" data-primary>Stamp ${t.name}</button></div>`, 'rv rv--bar');
    await readyToStamp(key, $('[data-primary]', bar));
    await stamp(key);
  }

  async function title() {
    const back = store.get(KEY);
    const el = await scene(`
      <h1 class="sc-hero">Who is<br> Dawit Chun?</h1>
      <p class="sc-lede">I’m a senior at Taejae University in Seoul, applying to robotics PhD programs for fall 2027. Have you ever played bingo? I’d like to introduce myself with one. Each tile is a value that shaped my life and my wish to become a robotics engineer, and five in a line make a bingo.</p>
      <p class="sc-ask">Are you ready to hit your bingo?</p>
      <div class="sc-actions"><button class="btn btn--primary" type="button" data-primary>${back ? 'Play again' : 'Start'}</button></div>`);
    card.classList.add('is-idle');
    const go = $('[data-primary]', el);
    el.classList.add('sc--title');
    // On a wide screen the words fill exactly the height of the card beside them: one scale (--k in story.css) sizes
    // the name, the welcome, the question and the gaps, and it is found again whenever a web font arrives, the window
    // changes, or the card changes size, so a late font can never push Start below the card.
    const last = $('.sc-actions', el);
    const fit = () => {
      if (!el.isConnected) return;
      if (narrow()) {
        el.style.removeProperty('--k');
        return;
      }
      const goal = card.getBoundingClientRect().bottom;
      const fits = (k) => {
        el.style.setProperty('--k', k.toFixed(4));
        return last.getBoundingClientRect().bottom <= goal + 0.5;
      };
      let lo = 0.45;
      let hi = 1.4;
      if (fits(hi)) lo = hi;
      else {
        for (let i = 0; i < 16; i += 1) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
      }
      el.style.setProperty('--k', lo.toFixed(4));
      // remember where things ended up, so the check below only fits again when something has actually moved
      fitted = [last.getBoundingClientRect().bottom, goal];
    };
    let fitted = [0, 0];
    let fitTimer = 0;
    const refit = () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fit, 50);
    };
    fit();
    if (doc.fonts) {
      doc.fonts.ready.then(fit);
      doc.fonts.addEventListener('loadingdone', refit);
    }
    const safety = [250, 900, 2500].map((ms) => setTimeout(fit, ms));
    // and a cheap check, in case a browser never reports a font arriving: if Start or the card has moved, fit again
    const watch = setInterval(() => {
      if (!el.isConnected || narrow()) return;
      const now = [last.getBoundingClientRect().bottom, card.getBoundingClientRect().bottom];
      if (Math.abs(now[0] - fitted[0]) > 1 || Math.abs(now[1] - fitted[1]) > 1) fit();
    }, 400);
    window.addEventListener('resize', refit);
    const cardRO = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    if (cardRO) {
      cardRO.observe(card);
      // the words themselves too: when a font swaps in, their size changes and they are fitted again
      cardRO.observe(el);
    }
    // Scrolling down starts the story too: the mouse wheel or trackpad, a swipe up at the bottom of the page, or the Down key.
    let pull = 0;
    let touchY = null;
    const begin = () => { if (!go.disabled) go.click(); };
    const atBottom = () => window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 2;
    const onWheel = (e) => {
      if (e.deltaY <= 0) {
        pull = 0;
        return;
      }
      if (!atBottom() && narrow()) return;
      e.preventDefault();
      pull += e.deltaY;
      if (pull > 30) begin();
    };
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e) => { if (touchY != null && touchY - e.touches[0].clientY > 60 && atBottom()) begin(); };
    const onKey = (e) => {
      if (!['ArrowDown', 'PageDown'].includes(e.key)) return;
      e.preventDefault();
      begin();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    doc.addEventListener('keydown', onKey);
    await press(go);
    if (cardRO) cardRO.disconnect();
    window.removeEventListener('resize', refit);
    if (doc.fonts) doc.fonts.removeEventListener('loadingdone', refit);
    safety.forEach(clearTimeout);
    clearInterval(watch);
    clearTimeout(fitTimer);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    doc.removeEventListener('keydown', onKey);
    // the rest of a trackpad flick is swallowed, so the first chapter does not scroll away by itself
    const swallow = (e) => e.preventDefault();
    window.addEventListener('wheel', swallow, { passive: false });
    setTimeout(() => window.removeEventListener('wheel', swallow), 700);
    card.classList.remove('is-idle');
    store.set(KEY, 'started');
  }

  const ANTI = [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]];

  async function bingo() {
    drawLine({ r: 0, c: 0 }, { r: 4, c: 4 }, { num: '1' });
    // BINGO! is called once the marker has reached the corner, not while it is still moving
    await wait(M.long + M.micro);
    const el = await scene(`
      <p class="bingo">BINGO!</p>
      <p class="sc-lede bingo-lede">That was my first line, the five values that made me who I am. My second line is the research I do now, on robots that learn from people and on helping people with ALS communicate.</p>
      <div class="sc-actions bingo-lede"><button class="btn btn--primary" type="button" data-primary>Start the second line</button></div>`);
    await press($('[data-primary]', el));
    ANTI.forEach(([r, c]) => cellAt(r, c).classList.add('is-line'));
  }

  async function pickTwo() {
    const el = await scene(`
      <h2 class="sc-title">My second line still has two empty tiles.</h2>
      <p class="sc-lede">I want to fill them during a robotics PhD, so pick the two values you think I should work on first.</p>
      <div class="picks" style="--fs: 13cqw">${SUGGEST.map((w) => `<button class="pick" type="button"><span>${w}</span></button>`).join('')}</div>`);
    const slots = OPEN.map((o) => cellAt(o.r, o.c));
    slots.forEach((c) => c.classList.add('is-waiting'));
    const chosen = [];
    let landed = 0;
    await new Promise((done) => {
      $$('.pick', el).forEach((btn) => btn.addEventListener('click', async () => {
        if (chosen.length >= 2 || btn.disabled) return;
        const cell = slots[chosen.length];
        const word = btn.textContent;
        chosen.push(word);
        btn.disabled = true;
        // the word is penciled into the square once the tile is there
        const pencil = () => {
          cell.classList.remove('is-waiting');
          cell.classList.add('is-penciled');
          setLabel(cell, word);
          cell.setAttribute('aria-label', `${word}, penciled in`);
        };
        if (!calm()) {
          await showCard();
          // the spare tile itself travels in a straight line and lands at the size of the empty square
          const a = btn.getBoundingClientRect();
          const b = cell.getBoundingClientRect();
          const ghost = btn.cloneNode(true);
          ghost.className = 'pick pick--ghost';
          ghost.style.setProperty('--fs', getComputedStyle(btn).getPropertyValue('--fs'));
          Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
          doc.body.appendChild(ghost);
          btn.classList.add('is-picked');
          await settle(ghost.animate(
            [{ transform: 'none' }, { transform: `translate(${(b.left - a.left).toFixed(1)}px, ${(b.top - a.top).toFixed(1)}px) scale(${(b.width / a.width).toFixed(3)})` }],
            { duration: M.long, easing: M.move, fill: 'forwards' },
          ), M.long);
          // it has landed: the tile lifts away and its word stays, penciled in
          pencil();
          await settle(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: M.micro, easing: M.out, fill: 'forwards' }), M.micro);
          ghost.remove();
        }
        btn.classList.add('is-picked');
        pencil();
        landed += 1;
        if (landed === 2) done();
      }));
    });
    $$('.pick', el).forEach((b) => { b.disabled = true; });
    drawLine({ r: 4, c: 0 }, { r: 0, c: 4 }, { dashed: true, num: '2' });
    // the text waits until the pencil has reached the corner
    await wait(M.long + M.micro);
    const more = add(el, `
      <p class="rv-text">I have penciled them in, and I will stamp them once I have work to show for them.</p>
      <div class="sc-actions"><button class="btn btn--primary" type="button" data-primary>Continue</button></div>`);
    await press($('[data-primary]', more));
    return chosen;
  }

  const TOUR = [
    { city: 'Seoul', when: '2023 to 2024', at: [889.9, 106.0], pic: 'assets/figures/journey/seoul-2023/prototype-ecosort.jpg', text: 'Taejae’s home campus. My first civic project was on plastic food delivery containers.' },
    { city: 'Tokyo', when: 'Spring 2025', at: [932.3, 113.8], pic: 'assets/figures/journey/tokyo/yokohama.jpg', text: 'I studied at Kanda University and presented Watch-Out at CHI 2025 in Yokohama.' },
    { city: 'San Francisco', when: 'Fall 2025', at: [58.6, 105.1], pic: 'assets/figures/journey/san-francisco/usf.jpg', text: 'At the University of San Francisco, I took Intro to Digital Electronics and Silicon Valley Immersion, started building PDPM, and was a physics teaching assistant.' },
    { city: 'New York', when: 'Spring 2026', at: [220.0, 92.9], pic: 'assets/figures/journey/new-york/skyline-court.jpg', text: 'At Pace University, I took Artificial Intelligence and US History, and turned PDPM into a paper with Professor Minhee Jun.' },
    { city: 'Shenzhen', when: 'Now', at: [846.9, 168.6], pic: 'assets/figures/story/shenzhen.jpg', text: 'This semester, with a new civic project in progress.' },
  ];
  // a leg longer than half the strip goes the other way round, across the Pacific, leaving one edge and entering the other
  const TOUR_PATHS = TOUR.slice(1).map((b, i) => {
    const a = TOUR[i];
    const arc = (p, q) => {
      const lift = Math.min(Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.2, 40);
      return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}Q${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2 - lift).toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    };
    const k = i + 1;
    if (Math.abs(b.at[0] - a.at[0]) <= 500) return `<path class="tour-leg" data-leg="${k}" pathLength="1" d="${arc(a.at, b.at)}"/>`;
    const w = b.at[0] > a.at[0] ? -1000 : 1000;
    return `<path class="tour-leg" data-leg="${k}" pathLength="1" d="${arc(a.at, [b.at[0] + w, b.at[1]])}"/><path class="tour-leg" data-leg="${k}" pathLength="1" d="${arc([a.at[0] - w, a.at[1]], b.at)}"/>`;
  }).join('');

  async function bigger(chosen) {
    await showCard();
    const before = cells.map((c) => c.getBoundingClientRect());
    const grid0 = grid.getBoundingClientRect();
    const span0 = cellAt(4, 4).offsetLeft - cellAt(0, 0).offsetLeft;
    card.classList.add('is-big');
    head.innerHTML = 'BINGOBINGO'.split('').map((ch) => `<span>${ch}</span>`).join('');
    cells.forEach((c) => {
      c.style.gridRow = String(+c.dataset.r + 1);
      c.style.gridColumn = String(+c.dataset.c + 1);
    });
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r < 5 && c < 5) continue;
        const b = makeCell(r, c);
        b.style.gridRow = String(r + 1);
        b.style.gridColumn = String(c + 1);
        b.classList.add('is-new');
        cells.push(b);
        grid.appendChild(b);
      }
    }
    renderLines(false);
    if (!calm()) {
      // The camera pulls back: the old card shrinks into its corner with both of its lines, then the rest comes up.
      const pull = { duration: M.long, easing: M.move };
      const grid1 = grid.getBoundingClientRect();
      const zoom = span0 / (cellAt(4, 4).offsetLeft - cellAt(0, 0).offsetLeft);
      cells.slice(0, 25).forEach((c, i) => {
        const a = before[i];
        const b = c.getBoundingClientRect();
        c.animate(
          [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }],
          pull,
        );
      });
      linesSvg.animate(
        [{ transform: `translate(${grid0.left - grid1.left}px, ${grid0.top - grid1.top}px) scale(${zoom})`, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }],
        pull,
      );
      head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.base, easing: M.out });
    }
    setTimeout(() => card.classList.add('is-grown'), 40);
    await wait(M.long);
    await scene(`
      <h2 class="sc-title">A bigger bingo.</h2>
      <p class="sc-lede">When I was 15, people asked what a kid could even do. I have stamped seven tiles since then, and now the card has grown to 100. I have penciled in ${chosen[0]} and ${chosen[1]}, and I expect to graduate in June 2027.</p>
      <p class="sc-lede">As a PhD student in your lab, I want to work on robot manipulation with vision-language-action and world models, and to be part of taking the next step toward AGI.</p>
      <div class="tour" aria-label="My cohort’s cities: Seoul, Tokyo, San Francisco, New York and Shenzhen">
        <p class="tour-legend">Taejae’s Global Rotation</p>
        <div class="tour-map">
          <svg viewBox="0 0 1000 212.5" preserveAspectRatio="none" aria-hidden="true">
            <image href="assets/images/world-strip.svg" width="1000" height="212.5" preserveAspectRatio="none" class="tour-land"/>
            ${TOUR_PATHS}
          </svg>
          ${TOUR.map((c, i) => `<button type="button" class="tour-city" data-i="${i}" style="left: ${(c.at[0] / 10).toFixed(2)}%; top: ${(c.at[1] / 2.125).toFixed(2)}%" aria-label="${c.city}, ${c.when}"><i></i><b>${c.city}</b></button>`).join('')}
        </div>
        <div class="tour-info" aria-live="polite"></div>
      </div>
      <p class="sc-goal">My goal is to become <b>a robot engineer who saves people</b>.</p>
      <div class="sc-actions sc-end"><a class="btn btn--primary" href="home.html">Enter the website</a><a class="btn" href="assets/CV_DawitChun.pdf" target="_blank" rel="noopener">Read my CV</a></div>
      <p class="sc-links"><a href="research.html">Research</a><a href="mailto:dchun4748@gmail.com">dchun4748@gmail.com</a><a href="./">Play again</a></p>`);
    store.set(KEY, 'done');
    // the route is drawn one leg at a time, and each city lights up as the line reaches it
    const legs = $$('.tour-leg', stage);
    const cities = $$('.tour-city', stage);
    const info = $('.tour-info', stage);
    // pick a city to see what I did there
    const show = (i) => {
      const c = TOUR[i];
      cities.forEach((el, k) => el.classList.toggle('is-here', k === i));
      info.innerHTML = `${c.pic ? img(c.pic, 4, 3, c.city, 'loading="lazy"') : '<span class="tour-pic-none"></span>'}<p><b>${c.city}, ${c.when}</b>${c.text}</p><button class="btn tour-next" type="button">Next city →</button>`;
      $('.tour-next', info).addEventListener('click', () => show((i + 1) % TOUR.length));
    };
    // it always opens on Seoul, the first stop; a city changes only when it is clicked or with "Next city"
    cities.forEach((el, i) => el.addEventListener('click', () => show(i)));
    show(0);
    if (calm()) {
      cities.forEach((c) => c.classList.add('is-on'));
      return;
    }
    legs.forEach((l) => { l.style.strokeDashoffset = '1'; });
    cities[0].classList.add('is-on');
    await wait(M.base);
    for (let k = 1; k < TOUR.length; k++) {
      const parts = legs.filter((l) => +l.dataset.leg === k);
      for (const p of parts) {
        await settle(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520 / parts.length, easing: parts.length > 1 ? 'linear' : M.move, fill: 'forwards' }), 520 / parts.length);
        p.style.strokeDashoffset = '0';
      }
      cities[k].classList.add('is-on');
      await wait(160);
    }
  }

  /* ?at=<step> opens the story at one step, with everything before it already done */

  const ORDER = ['title', 'courage', 'challenge', 'innovation', 'responsibility', 'sharing', 'bingo', 'technology', 'compassion', 'pick', 'bigger'];
  const FIRST_LINE = ['courage', 'challenge', 'innovation', 'responsibility', 'sharing'];

  async function run() {
    buildCard();
    const at = new URLSearchParams(location.search).get('at');
    const start = Math.max(0, ORDER.indexOf(at));
    const done = (step) => ORDER.indexOf(step) < start;
    const due = (step) => !done(step);
    let chosen = ['Curiosity', 'Rigor'];
    FIRST_LINE.forEach((k) => { if (done(k)) stampNow(k, false); });
    if (done('bingo')) {
      lines.push({ a: { r: 0, c: 0 }, b: { r: 4, c: 4 }, dashed: false, num: '1' });
      ANTI.forEach(([r, c]) => cellAt(r, c).classList.add('is-line'));
    }
    ['technology', 'compassion'].forEach((k) => { if (done(k)) stampNow(k, false); });
    if (done('pick')) {
      OPEN.forEach((o, i) => {
        const cell = cellAt(o.r, o.c);
        cell.classList.add('is-penciled');
        setLabel(cell, chosen[i]);
      });
      lines.push({ a: { r: 4, c: 0 }, b: { r: 0, c: 4 }, dashed: true, num: '2' });
    }
    renderLines(false);
    // tiles stamped before a ?at= start keep no-anim: removing it would restart their stamp animations partway

    if (due('title')) await title();
    for (const k of FIRST_LINE) if (due(k)) await chapter(k);
    if (due('bingo')) await bingo();
    for (const k of ['technology', 'compassion']) if (due(k)) await chapter(k);
    if (due('pick')) chosen = await pickTwo();
    await bigger(chosen);
  }

  // Enter presses the main button when focus isn't on something else
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const a = doc.activeElement;
    if (a && a !== doc.body && !a.matches('h1, h2')) return;
    const btn = $('[data-primary]:not([disabled])', stage);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  });

  // Reading focus. A page is a column of parts: the opening, each photo with its sentence, each thing to try, the closing
  // line with its button. The part being read, the one at the middle of the screen, is sharp, and the others are blurred
  // and dimmed, more the farther away they are. A long page opens with its opening sharp and the rest blurred; each part
  // clears as it is scrolled up to the reading line. At the very bottom the closing line is in focus. Nothing blurs that
  // was sharp until the reader scrolls: when a click brings new lines, what was on screen stays sharp and only the new
  // parts start blurred. A part that is clicked or tabbed into comes into focus until the page is scrolled on.
  const WRAP = '.sc-body, .rv, .beats';
  // a button row, a link row, a source, a note or a result belongs to the part above it
  const JOIN = '.sc-actions, .sc-links, .rv-meta, .prints-actions, .prints-note, .eyes-times';
  let parts = [];
  let atoms = [];
  let current = null;
  let held = null;
  let heldAt = 0;
  let readFrame = 0;
  let rebuild = true;
  let seen = 0;
  let pageEl = null;
  let onScreen = new Set();
  let kept = null;
  let lastY = window.scrollY;
  let scrolled = false;
  let resized = false;
  const atomsOf = (box) => Array.from(box.children).flatMap((c) => (c.matches(WRAP) ? atomsOf(c) : [c]));
  const partsOf = (list) => {
    const out = [];
    list.forEach((a, k) => {
      const last = out[out.length - 1];
      const prev = list[k - 1];
      const join = last && (a.matches(JOIN)
        // the title and the paragraphs that open the page
        || (last.head && a.matches('.sc-lede, .medals'))
        // a sentence and the photos, tabs, closing line or next paragraph it leads into: paragraphs in a row read as one part
        || (prev.matches('p.rv-text:not(.sc-fill)') && a.matches('p.rv-text, .why, .wo-box, .rv-pair, .trio, figure')));
      if (join) last.els.push(a);
      else out.push({ els: [a], head: a.matches('h1, h2, .sc-lead, .bingo') });
    });
    return out;
  };
  const spanOf = (part) => {
    let top = Infinity;
    let bottom = -Infinity;
    part.els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
    return { part, top, bottom };
  };
  // focus: the index of the part in focus, or a list of them; -1 or an empty list leaves everything sharp
  const show = (focus, live) => {
    const on = [].concat(focus).filter((k) => k >= 0);
    live.forEach(({ part }, i) => {
      const d = on.length ? Math.min(...on.map((k) => Math.abs(i - k))) : 0;
      part.els.forEach((el) => {
        el.classList.add('part');
        el.classList.toggle('is-near', d === 1);
        el.classList.toggle('is-far', d > 1);
      });
    });
  };
  const placeFocus = () => {
    readFrame = 0;
    const moved = scrolled;
    const reflowed = resized;
    scrolled = false;
    resized = false;
    const sc = stage.firstElementChild;
    if (!sc || sc.classList.contains('sc--title')) return;
    if (sc !== pageEl) {
      pageEl = sc;
      held = null;
      current = null;
      kept = null;
    }
    if (rebuild) {
      rebuild = false;
      const next = atomsOf(sc);
      if (next.length !== atoms.length || next.some((a, k) => a !== atoms[k])) {
        // parts that come and go keep the focus where it was
        const keep = current && typeof current === 'object' ? current.els[0] : null;
        atoms = next;
        parts = partsOf(next);
        if (keep) current = parts.find((p) => p.els.includes(keep)) || null;
      }
    }
    const live = parts.map(spanOf).filter((p) => Number.isFinite(p.top));
    if (!live.length) return;
    const bar = $('.st-top').offsetHeight;
    const vh = window.innerHeight;
    const room = vh - bar;
    const box = sc.getBoundingClientRect();
    const root = doc.documentElement;
    const down = Math.max(0, (parseFloat(getComputedStyle(stage).scrollMarginTop) || bar) - box.top);
    const left = Math.max(0, root.scrollHeight - vh - window.scrollY);
    // a page that fits on the screen, or can hardly be scrolled, is read whole
    if (live.length < 2 || live[live.length - 1].bottom - live[0].top <= room * 0.92 || down + left < 24) {
      onScreen = new Set(atoms);
      kept = null;
      stage.classList.remove('is-reading');
      if (current !== 'all' || live.length !== seen) show(-1, live);
      current = 'all';
      seen = live.length;
      return;
    }
    // a long page gets room below its last part, so the closing line can come up to the middle of the screen
    stage.classList.add('is-reading');
    // The page has just grown past the screen without being scrolled (new lines after a click): what was on screen stays
    // sharp and only the new parts start blurred, until the reader scrolls.
    if (current === 'all' && !moved) kept = onScreen;
    if (moved) kept = null;
    if (kept) {
      const on = live.map((p, i) => (p.part.els.every((el) => kept.has(el)) ? i : -1)).filter((i) => i >= 0);
      if (on.length) {
        if (current !== 'kept' || live.length !== seen) show(on, live);
        current = 'kept';
        seen = live.length;
        return;
      }
      kept = null;
    }
    let focus = -1;
    if (held && held.isConnected && Math.abs(window.scrollY - heldAt) < 40) focus = live.findIndex((p) => p.part.els.includes(held));
    // nothing was scrolled: the part in focus stays in focus
    if (focus < 0 && !moved && !reflowed && current && typeof current === 'object') focus = live.findIndex((p) => p.part === current);
    if (focus < 0) {
      held = null;
      // The part being read is the one at the reading line, a little above the middle of the screen. Each part keeps the
      // focus from halfway to the part before it to halfway to the next; a short one also takes up to 40px of its
      // neighbours' edges, so it can't be scrolled past in one flick, while a long part stays in focus all the way through.
      const n = live.length;
      const line = bar + room * 0.45;
      const edge = [-Infinity];
      for (let i = 1; i < n; i += 1) edge.push((live[i - 1].bottom + live[i].top) / 2);
      edge.push(Infinity);
      const least = room * 0.3;
      for (let i = 1; i < n - 1; i += 1) {
        const lack = least - (edge[i + 1] - edge[i]);
        if (lack <= 0) continue;
        edge[i] = Math.max(Math.min(edge[i], live[i - 1].bottom - 40), edge[i] - lack / 2);
        edge[i + 1] = Math.min(Math.max(edge[i + 1], live[i + 1].top + 40), edge[i + 1] + lack / 2);
      }
      focus = 0;
      while (focus < n - 1 && line >= edge[focus + 1]) focus += 1;
      // the part in focus keeps it until the line is 24px past its stretch
      const was = live.findIndex((p) => p.part === current);
      if (was >= 0 && was !== focus && line >= edge[was] - 24 && line < edge[was + 1] + 24) focus = was;
      // the opening is in focus at the top of the page, until the page has moved 40px; the closing line at the bottom
      if (down <= 8 || (current === live[0].part && down <= 40)) focus = 0;
      else if (left <= 8 || (current === live[n - 1].part && left <= 40)) focus = n - 1;
    }
    if (live[focus].part === current && live.length === seen) return;
    current = live[focus].part;
    seen = live.length;
    show(focus, live);
  };
  const queueFocus = () => {
    if (!readFrame) readFrame = requestAnimationFrame(placeFocus);
  };
  // the part you are using stays sharp
  const hold = (e) => {
    if (!(e.target instanceof Element) || e.target.matches('h1, h2')) return;
    const part = parts.find((p) => p.els.some((el) => el.contains(e.target)));
    if (!part) return;
    held = part.els[0];
    heldAt = window.scrollY;
    queueFocus();
  };
  stage.addEventListener('pointerdown', hold, true);
  stage.addEventListener('focusin', hold);
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - lastY) >= 2) {
      scrolled = true;
      lastY = window.scrollY;
    }
    queueFocus();
  }, { passive: true });
  window.addEventListener('resize', () => {
    resized = true;
    queueFocus();
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(queueFocus).observe(stage);
  new MutationObserver((list) => {
    if (list.some((m) => m.target === stage || m.target.matches('.sc, ' + WRAP))) rebuild = true;
    queueFocus();
  }).observe(stage, { childList: true, subtree: true });

  run();
})();
