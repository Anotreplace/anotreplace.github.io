(function () {
  // Menu mobile
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Fermer' : 'Menu';
    });
  }
  // Lien actif
  var path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.nav ul a').forEach(function (a) {
    if (path.indexOf(a.getAttribute('href')) === 0) a.setAttribute('aria-current', 'page');
  });
  // Bandeau événement : disparaît tout seul après la date
  var bar = document.querySelector('.event-bar[data-until]');
  if (bar && new Date() >= new Date(bar.getAttribute('data-until'))) bar.hidden = true;
  // CTA mobile : apparaît après le premier écran
  var m = document.querySelector('.mobile-cta');
  if (m) {
    var onScroll = function () { m.classList.toggle('is-visible', window.scrollY > 560); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
})();

// La trace de l'accueil : les quatre disciplines avancent le long de la ligne
(function () {
  var hero = document.querySelector('.hero');
  var svg = hero && hero.querySelector('.trace');
  var path = svg && svg.querySelector('path');
  var riders = hero ? Array.prototype.slice.call(hero.querySelectorAll('.rider')) : [];
  if (!path || !riders.length || !path.getTotalLength) return;

  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var longueur = path.getTotalLength();
  var DUREE = 32000;          // un tour complet de la ligne, en ms
  var DEPART = reduit ? 0 : 2600; // on attend que la ligne soit dessinée
  var debut = performance.now();
  var visible = true, raf = null;
  // Une fois dessinée, la ligne s'affiche en entier (évite qu'elle s'arrête avant le bord)
  setTimeout(function () { path.classList.add('is-drawn'); }, reduit ? 0 : 3100);

  function placer(rider, t) {
    var p = path.getPointAtLength(t * longueur);
    var m = svg.getScreenCTM();
    var r = hero.getBoundingClientRect();
    if (!m) return;
    var x = p.x * m.a + p.y * m.c + m.e - r.left;
    var y = p.x * m.b + p.y * m.d + m.f - r.top;
    // Fondu aux deux extrémités de la ligne
    var o = Math.min(1, t / 0.06, (1 - t) / 0.06);
    rider.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    rider.style.opacity = Math.max(0, o).toFixed(2);
  }

  function statique() {
    riders.forEach(function (r, i) { placer(r, 0.14 + i * 0.22); });
  }

  function tick(now) {
    var ecoule = now - debut - DEPART;
    if (ecoule >= 0) {
      var base = ecoule / DUREE;
      riders.forEach(function (r, i) { placer(r, (base + i / riders.length) % 1); });
    }
    raf = visible ? requestAnimationFrame(tick) : null;
  }

  if (reduit) {
    statique();
    window.addEventListener('resize', statique);
    return;
  }
  // N'anime que lorsque le haut de page est visible
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    }).observe(hero);
  }
  raf = requestAnimationFrame(tick);
})();
