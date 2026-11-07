/* Gallery reel: highlights the centred panel, parallax, wheel -> horizontal scroll, buttons, keys. */
(function () {
  var reel = document.getElementById('reel');
  if (!reel) return;
  var panels = [].slice.call(reel.querySelectorAll('.reel_panel'));
  if (!panels.length) return;
  var count = document.querySelector('.reel_count');
  var bar = document.querySelector('.reel_prog i');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ticking = false;

  function update() {
    ticking = false;
    var c = reel.scrollLeft + reel.clientWidth / 2, best = 0, bd = Infinity;
    panels.forEach(function (p, i) {
      var mid = p.offsetLeft + p.offsetWidth / 2, d = Math.abs(mid - c);
      if (d < bd) { bd = d; best = i; }
      if (!reduce) {
        var img = p.querySelector('.reel_img');
        if (img) img.style.setProperty('--px', ((mid - c) / reel.clientWidth * -40).toFixed(1) + 'px');
      }
    });
    panels.forEach(function (p, i) { p.classList.toggle('on', i === best); });
    if (count) count.textContent = pad(best + 1) + ' / ' + pad(panels.length);
    var max = reel.scrollWidth - reel.clientWidth;
    if (bar) bar.style.width = (max > 0 ? reel.scrollLeft / max * 100 : 0) + '%';
  }
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  reel.classList.add('is_live');
  reel.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  function step(dir) {
    var w = panels[0].offsetWidth;
    reel.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
  }
  [].forEach.call(document.querySelectorAll('.reel_btn'), function (b) {
    b.addEventListener('click', function () { step(Number(b.getAttribute('data-dir'))); });
  });
  reel.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  // vertical wheel scrolls the reel sideways, but lets the page move on at both ends
  reel.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var max = reel.scrollWidth - reel.clientWidth;
    var atStart = reel.scrollLeft <= 1 && e.deltaY < 0;
    var atEnd = reel.scrollLeft >= max - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    reel.scrollLeft += e.deltaY;
  }, { passive: false });

  // "view" bubble that follows the pointer over a picture
  if (window.matchMedia('(hover: hover)').matches) {
    var cur = document.createElement('div');
    cur.className = 'reel_cursor';
    cur.setAttribute('aria-hidden', 'true');
    cur.textContent = document.documentElement.lang === 'uk' ? 'ДИВИТИСЬ' : 'VIEW';
    document.body.appendChild(cur);
    window.addEventListener('pointermove', function (e) {
      cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
      document.body.classList.toggle('reel_hover', !!(e.target.closest && e.target.closest('.reel_frame')));
    }, { passive: true });
  }
  window.__wl = window.__wl || true;
})();
