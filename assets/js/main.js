(() => {
  // Mobile menu
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');

  if (header && toggle) {
    const setOpen = (open) => {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    header.querySelectorAll('.nav__link').forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  // Reveal on scroll
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add('is-visible'));
  }

  // Teaser clips on the home page: play only while on screen, and never under reduced motion
  const teasers = document.querySelectorAll('video[data-teaser]');
  if (teasers.length && 'IntersectionObserver' in window) {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const watch = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (isIntersecting && !calm.matches) v.play().catch(() => {});
        else v.pause();
      });
    }, { threshold: 0.35 });
    teasers.forEach((v) => watch.observe(v));
  }

  // Click-to-load YouTube (no third-party iframe until someone asks for it)
  document.addEventListener('click', (e) => {
    const play = e.target.closest('.video__play');
    if (!play) return;
    const box = play.closest('.video[data-yt]');
    if (!box) return;
    // YouTube refuses embeds without a page origin (error 153), which is the case
    // when the site is opened as a local file; let the link open YouTube instead.
    if (location.protocol === 'file:') return;
    e.preventDefault();
    if (!box.dataset.thumb) box.dataset.thumb = box.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${box.dataset.yt}?autoplay=1`;
    iframe.title = play.getAttribute('aria-label') || 'YouTube video';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    box.replaceChildren(iframe);
  });

  // Journey: one city at a time along the rotation route
  const route = document.querySelector('[data-route]');
  if (route) {
    const tabs = [...route.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const scroller = route.querySelector('.jr-route__scroll');
    const legs = [...route.querySelectorAll('.jr-leg')];
    const pins = [...route.querySelectorAll('.jr-pin')];
    const traveler = route.querySelector('.jr-traveler');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let travel = 0;

    // a little robot hops along the leg that arrives at the chosen stop, facing the way it goes
    const runTraveler = (leg) => {
      cancelAnimationFrame(travel);
      if (!traveler) return;
      if (!leg || still.matches) { traveler.style.opacity = 0; return; }
      const len = leg.getTotalLength();
      let facing = 1;
      const place = (t) => {
        const at = len * t;
        const p = leg.getPointAtLength(at);
        const a = leg.getPointAtLength(Math.max(0, at - 1.5));
        const b = leg.getPointAtLength(Math.min(len, at + 1.5));
        // ignore the jump where a Pacific crossing leaves one edge of the map and enters the other
        if (Math.hypot(b.x - a.x, b.y - a.y) < 20 && Math.abs(b.x - a.x) > 0.2) facing = b.x < a.x ? -1 : 1;
        const hop = t < 1 ? Math.abs(Math.sin(at * 0.09)) * 3.2 : 0;
        const lean = t < 1 ? 7 : 0;
        traveler.setAttribute('transform', `translate(${p.x} ${p.y - hop}) scale(${facing * 1.35} 1.35) rotate(${lean})`);
      };
      place(0);
      traveler.style.opacity = 1;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 1300);
        place(1 - Math.pow(1 - t, 3));
        if (t < 1) travel = requestAnimationFrame(step);
        else setTimeout(() => { traveler.style.opacity = 0; }, 350); // arrived: the city's own pin takes over
      };
      travel = requestAnimationFrame(step);
    };

    // draw the route travelled up to stop i; the leg that arrives there is drawn fresh
    const drawMap = (i) => {
      legs.forEach((leg, k) => {
        leg.classList.toggle('is-past', k < i - 1);
        leg.classList.toggle('is-future', k >= i);
        leg.classList.remove('is-current');
        if (k === i - 1) {
          void leg.getBoundingClientRect(); // restart the drawing animation
          leg.classList.add('is-current');
        }
      });
      const seen = new Set(tabs.slice(0, i + 1).map((t) => t.dataset.city));
      pins.forEach((pin) => {
        pin.classList.toggle('is-visited', seen.has(pin.dataset.city));
        pin.classList.toggle('is-here', pin.dataset.city === tabs[i].dataset.city);
      });
      runTraveler(legs[i - 1]);
    };

    const select = (i, { focus = false, updateHash = true, smooth = true } = {}) => {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      drawMap(i);
      panels.forEach((p, k) => { if (k !== i) p.querySelectorAll('video').forEach((v) => v.pause()); });
      if (focus) tabs[i].focus();
      // keep the chosen stop in view on narrow screens, without moving the page
      scroller.scrollTo({ left: tabs[i].offsetLeft - (scroller.clientWidth - tabs[i].offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
      if (updateHash) history.replaceState(null, '', '#' + panels[i].id);
    };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          select(e.key === 'Home' ? 0 : tabs.length - 1, { focus: true });
        } else if (step) {
          e.preventDefault();
          select((i + step + tabs.length) % tabs.length, { focus: true });
        }
      });
    });

    // the previous / next links inside each panel
    route.addEventListener('click', (e) => {
      const link = e.target.closest('.jr-nav a');
      if (!link) return;
      const i = panels.findIndex((p) => '#' + p.id === link.getAttribute('href'));
      if (i < 0) return;
      e.preventDefault();
      select(i);
    });

    const fromHash = (smooth) => {
      const i = panels.findIndex((p) => '#' + p.id === location.hash);
      select(i < 0 ? 0 : i, { updateHash: i >= 0, smooth });
    };
    window.addEventListener('hashchange', () => fromHash(true));
    fromHash(false);
  }

  // Journey: thumbnails swap a photo or a video into a stop's main frame
  document.querySelectorAll('[data-gallery]').forEach((g) => {
    const link = g.querySelector('.jr-gallery__main');
    const img = link.querySelector('img');
    const video = g.querySelector('.jr-gallery__video');
    const thumbs = g.querySelectorAll('.jr-gallery__thumb');
    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        thumbs.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        if (btn.dataset.video && video) {
          link.hidden = true;
          video.hidden = false;
          video.poster = btn.dataset.src;
          video.setAttribute('aria-label', btn.dataset.alt);
          video.src = btn.dataset.video;
          video.play().catch(() => {});
          return;
        }
        if (video) { video.pause(); video.hidden = true; link.hidden = false; }
        img.classList.add('is-swapping');
        const next = new Image();
        next.src = btn.dataset.src;
        next.decode().catch(() => {}).then(() => {
          img.src = btn.dataset.src;
          img.width = btn.dataset.w;
          img.height = btn.dataset.h;
          img.alt = btn.dataset.alt;
          img.style.objectPosition = btn.dataset.pos || '';
          // a portrait photo is shown whole, not cropped to the landscape frame
          img.classList.toggle('is-tall', +btn.dataset.h > +btn.dataset.w * 1.05);
          link.href = btn.dataset.src;
          img.classList.remove('is-swapping');
        });
      });
    });
  });

  // Research pop-up windows
  const modals = document.querySelectorAll('dialog.modal');
  if (modals.length) {
    const clearHash = () => history.replaceState(null, '', location.pathname + location.search);

    const openModal = (id) => {
      const d = document.getElementById(id);
      if (!d || d.tagName !== 'DIALOG') return false;
      modals.forEach((m) => { if (m.open && m !== d) m.close(); });
      if (!d.open) d.showModal();
      d.querySelector('.modal__inner').scrollTop = 0;
      document.documentElement.classList.add('modal-open');
      if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
      return true;
    };

    modals.forEach((d) => {
      d.querySelector('.modal__close').addEventListener('click', () => d.close());
      d.querySelectorAll('[data-close]').forEach((link) => link.addEventListener('click', (e) => {
        const to = link.getAttribute('href');
        if (!to || to === '#') e.preventDefault();
        d.close();
      }));
      // a click on the dimmed backdrop lands on the dialog element itself
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => {
        d.querySelectorAll('video').forEach((v) => v.pause());
        d.querySelectorAll('.video[data-thumb]').forEach((box) => { box.innerHTML = box.dataset.thumb; });
        if (![...modals].some((m) => m.open)) {
          document.documentElement.classList.remove('modal-open');
          clearHash();
        }
      });
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (id && openModal(id)) e.preventDefault();
    });

    const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (id) openModal(id); };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  // Footer year
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
