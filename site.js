/* WhiteLakeViz shared script: mobile menu, scroll reveals, contact form,
   hero tile-render intro, language suggestion banner. One file for every page. */
(function () {
  'use strict';
  window.__wl = 1; // tells the failsafe in <head> that this script is alive

  var doc = document;
  var html = doc.documentElement;
  var lang = html.lang === 'uk' ? 'uk' : 'en';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ---------- 1. mobile menu ---------- */
  var toggle = doc.querySelector('.toggle_btn');
  var menu = doc.querySelector('.dropdown_menu');
  if (toggle && menu) {
    var setMenu = function (open) {
      menu.classList.toggle('open', open);
      toggle.classList.toggle('is_open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });
    toggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setMenu(false);
    });
  }

  /* ---------- 2. scroll reveals ---------- */
  var revealTargets = doc.querySelectorAll('.slogan, .img_container figure, h1.page_title, h2');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.classList.contains('slogan')) {
          Array.prototype.forEach.call(el.children, function (child, i) {
            setTimeout(function () { child.classList.add('visible'); }, reduce ? 0 : i * 300);
          });
        } else {
          el.classList.add('visible');
        }
        obs.unobserve(el);
      });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(revealTargets, function (el) { io.observe(el); });
  } else {
    html.classList.remove('js'); // very old browser: just show everything
  }

  /* ---------- 3. remember the language the visitor picked ---------- */
  Array.prototype.forEach.call(doc.querySelectorAll('.lang-btn'), function (btn) {
    btn.addEventListener('click', function () { store('user_lang', btn.getAttribute('data-lang')); });
  });

  /* ---------- 4. contact form (Formspree) ---------- */
  var form = doc.getElementById('my-form');
  if (form) {
    var text = {
      en: {
        ok: 'Thank you! We will get back to you soon.',
        err: 'Something went wrong. Please try again or email us directly.'
      },
      uk: {
        ok: "Дякуємо! Ми незабаром зв'яжемося з вами.",
        err: 'Щось пішло не так. Спробуйте ще раз або напишіть нам на пошту.'
      }
    }[lang];
    var status = doc.getElementById('my-form-status');
    var button = doc.getElementById('my-form-button');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (button) button.disabled = true;
      status.textContent = '';
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (res.ok) {
          status.textContent = text.ok;
          form.reset();
          (window.dataLayer = window.dataLayer || []).push({ event: 'generate_lead', form_id: 'contact_form' });
          return;
        }
        return res.json().then(function (data) {
          status.textContent = data && data.errors
            ? data.errors.map(function (x) { return x.message; }).join(', ')
            : text.err;
        }, function () { status.textContent = text.err; });
      }).catch(function () {
        status.textContent = text.err;
      }).then(function () {
        if (button) button.disabled = false;
      });
    });
  }

  /* ---------- 5. hero: "render bucket" intro ----------
     A dark canvas covers the picture and is cleared in random 32x32 px tiles, like a
     renderer filling its frame buffer. No JS or reduced motion: the picture is just there. */
  (function () {
    var hero = doc.querySelector('.hero_visual .hero_reveal');
    if (!hero || reduce || !hero.getBoundingClientRect) return;
    var img = hero.querySelector('.hero_img');
    var TILE = 32, TOTAL = 2800, ACTIVE = 6;
    var cv = doc.createElement('canvas');
    cv.className = 'hero_tiles';
    cv.setAttribute('aria-hidden', 'true');
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    var w, h, cols, rows, order, n, t0, started = false, done = false;

    var finish = function () {
      if (done) return;
      done = true;
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      window.removeEventListener('resize', finish);
    };
    var size = function () {
      var r = hero.getBoundingClientRect();
      w = Math.ceil(r.width); h = Math.ceil(r.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / TILE); rows = Math.ceil(h / TILE);
    };
    var draw = function (now) {
      if (done) return;
      var p = Math.min(1, (now - t0) / TOTAL);
      var e = p * p * (3 - 2 * p);   // slow start, fast middle, slow finish like a real render
      var shown = Math.floor(e * n);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      for (var i = shown; i < n; i++) {
        var k = order[i];
        ctx.rect((k % cols) * TILE, Math.floor(k / cols) * TILE, TILE, TILE);
      }
      ctx.fill();
      // the next few tiles are "being rendered": still empty, but outlined like a render bucket
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      for (var j = shown; j < Math.min(n, shown + ACTIVE); j++) {
        var m = order[j];
        ctx.strokeRect((m % cols) * TILE + 0.5, Math.floor(m / cols) * TILE + 0.5, TILE - 1, TILE - 1);
      }
      if (p < 1) requestAnimationFrame(draw); else finish();
    };
    var start = function () {
      if (started) return;
      started = true;
      size();
      n = cols * rows;
      order = [];
      for (var i = 0; i < n; i++) order.push(i);
      for (var a = n - 1; a > 0; a--) {            // Fisher-Yates shuffle
        var b = Math.floor(Math.random() * (a + 1)), t = order[a]; order[a] = order[b]; order[b] = t;
      }
      hero.insertBefore(cv, hero.firstChild);
      window.addEventListener('resize', finish);
      t0 = performance.now();
      requestAnimationFrame(draw);
    };
    // wait for the picture (up to 1.5 s) so the tiles reveal something real
    if (img && !(img.complete && img.naturalWidth)) {
      img.addEventListener('load', start);
      img.addEventListener('error', finish);
      setTimeout(start, 1500);
    } else start();
  })();

  /* ---------- 6. language suggestion (instead of an automatic redirect) ---------- */
  (function () {
    if (lang !== 'en') return;
    var wantsUk = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
      .some(function (l) { return /^uk\b/i.test(l || ''); });
    if (!wantsUk) return;
    var alt = doc.querySelector('link[rel="alternate"][hreflang="uk"]');
    if (!alt) return;
    if (read('lang_banner_dismissed') || read('user_lang') === 'en') return;

    var bar = doc.createElement('div');
    bar.className = 'lang_banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Мова сайту');
    var label = doc.createElement('span');
    label.textContent = 'Переглянути сайт українською?';
    var yes = doc.createElement('a');
    yes.className = 'btn';
    yes.href = alt.getAttribute('href');
    yes.textContent = 'Так, українською';
    yes.addEventListener('click', function () { store('user_lang', 'ua'); });
    var no = doc.createElement('button');
    no.type = 'button';
    no.textContent = 'Ні, English';
    no.addEventListener('click', function () {
      store('lang_banner_dismissed', '1');
      store('user_lang', 'en');
      bar.parentNode.removeChild(bar);
    });
    bar.appendChild(label);
    bar.appendChild(yes);
    bar.appendChild(no);
    doc.body.appendChild(bar);
  })();
})();
