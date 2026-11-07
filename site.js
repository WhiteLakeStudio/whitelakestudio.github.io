/* WhiteLakeViz shared script: mobile menu, scroll reveals, contact form,
   hero "concept lens", language suggestion banner. One file for every page. */
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

  /* ---------- 5. hero: "concept behind the render" lens ----------
     The page first shows the blueprint-style concept, an iris closes and the finished
     render appears (pure CSS animation). After that the cursor (or a finger) opens a
     small lens that shows the concept again. */
  var section = doc.querySelector('.hero_visual');
  var hero = section && section.querySelector('.hero_reveal');
  if (section && hero) {
    var live = false, down = false, raf = 0;
    var tx = 0, ty = 0, cx = 0, cy = 0;

    var goLive = function () {
      if (live) return;
      live = true;
      var box = hero.getBoundingClientRect();
      cx = tx = box.width * 0.5;
      cy = ty = box.height * 0.58;
      hero.style.setProperty('--x', cx + 'px');
      hero.style.setProperty('--y', cy + 'px');
      hero.classList.add('is_live');
    };
    hero.addEventListener('animationend', function (e) {
      if (e.target === hero) goLive();
    });
    setTimeout(goLive, reduce ? 0 : 3400); // safety net if the animation never reports back

    var tick = function () {
      cx += (tx - cx) * 0.2;
      cy += (ty - cy) * 0.2;
      hero.style.setProperty('--x', cx.toFixed(1) + 'px');
      hero.style.setProperty('--y', cy.toFixed(1) + 'px');
      raf = (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) ? requestAnimationFrame(tick) : 0;
    };
    var aim = function (e, jump) {
      var box = hero.getBoundingClientRect();
      tx = e.clientX - box.left;
      ty = e.clientY - box.top;
      if (jump) { cx = tx; cy = ty; }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    var lensOn = function (e, jump) {
      hero.classList.add('is_lens');
      section.classList.add('hint_done');
      aim(e, jump);
    };
    var lensOff = function () { hero.classList.remove('is_lens'); };
    var overLink = function (e) { return e.target.closest && e.target.closest('a'); };

    section.addEventListener('pointermove', function (e) {
      if (!live) return;
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen' && !down) return;
      if (overLink(e)) { lensOff(); return; }
      lensOn(e, false);
    });
    section.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !live || overLink(e)) return;
      down = true;
      lensOn(e, true);
    });
    var release = function (e) {
      if (e.pointerType === 'mouse') return;
      down = false;
      lensOff();
    };
    section.addEventListener('pointerup', release);
    section.addEventListener('pointercancel', release);
    section.addEventListener('pointerleave', lensOff);
  }

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
