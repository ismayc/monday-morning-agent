/* sheet.js: the second row of the strip across the top, "On this page", built from the
   page's own sections. Each <section id="..."> inside <main> becomes a link, labeled by
   its data-nav attribute or else its first h2. As the page scrolls, the link for the
   section in view is marked. A page with fewer than two sections gets no row. */
(function () {
  var top = document.querySelector('.top');
  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section[id]'));

  // The "Episodes" list in the strip (a details element) closes on a click elsewhere or
  // on Escape; without this it stays open until its own summary is clicked again.
  function closeMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.top details.episodes[open]'), function (d) {
      if (d !== except) d.removeAttribute('open');
    });
  }
  document.addEventListener('click', function (e) {
    closeMenus(e.target.closest ? e.target.closest('.top details.episodes') : null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(null); });
  // An open list that would run past the right edge of the window hangs from its right side.
  Array.prototype.forEach.call(document.querySelectorAll('.top details.episodes'), function (d) {
    d.addEventListener('toggle', function () {
      var panel = d.querySelector('.panel');
      if (!d.open || !panel) return;
      panel.classList.remove('flip');
      if (panel.getBoundingClientRect().right > window.innerWidth - 8) panel.classList.add('flip');
    });
  });

  if (!top || sections.length < 2) return;

  var sub = document.createElement('nav');
  sub.className = 'sub';
  sub.setAttribute('aria-label', 'On this page');
  var label = document.createElement('span');
  label.textContent = 'On this page';
  sub.appendChild(label);
  var links = sections.map(function (s) {
    var h2 = s.querySelector('h2');
    var a = document.createElement('a');
    a.href = '#' + s.id;
    a.textContent = s.getAttribute('data-nav') || (h2 ? h2.textContent.trim() : s.id);
    sub.appendChild(a);
    return a;
  });
  top.appendChild(sub);

  // The section in view: the last one whose top has passed the strip.
  var ticking = false;
  function mark() {
    ticking = false;
    var line = top.getBoundingClientRect().bottom + 24;
    var current = -1;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) current = i;
    }
    // At the very bottom, the last section counts even if its top is still below the line.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = sections.length - 1;
    links.forEach(function (a, i) {
      if (i === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    if (current >= 0) {
      var a = links[current], r = a.getBoundingClientRect(), n = sub.getBoundingClientRect();
      if (r.left < n.left || r.right > n.right) sub.scrollLeft += r.left - n.left - 16;
    }
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(mark); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', mark);
  window.addEventListener('hashchange', onScroll);
  mark();
})();
