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

// La trace de l'accueil : les quatre disciplines parcourent la ligne une seule fois,
// puis s'arrêtent en file au bout de la ligne
(function () {
  var hero = document.querySelector('.hero');
  var svg = hero && hero.querySelector('.trace');
  var path = svg && svg.querySelector('path');
  var riders = hero ? Array.prototype.slice.call(hero.querySelectorAll('.rider')) : [];
  if (!path || !riders.length || !path.getTotalLength) return;

  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var longueur = path.getTotalLength();
  var DUREE = 5200;               // durée du parcours, en ms
  var DECALAGE = 260;             // départ échelonné entre deux disciplines
  var DEPART = reduit ? 0 : 2600; // on attend que la ligne soit dessinée
  var ARRIVEES = riders.map(function (r, i) { return 0.93 - (riders.length - 1 - i) * 0.07; });
  var debut = performance.now();
  var fini = reduit;
  // Une fois dessinée, la ligne s'affiche en entier (évite qu'elle s'arrête avant le bord)
  setTimeout(function () { path.classList.add('is-drawn'); }, reduit ? 0 : 3100);

  function placer(rider, t) {
    var p = path.getPointAtLength(t * longueur);
    var m = svg.getScreenCTM();
    var r = hero.getBoundingClientRect();
    if (!m) return;
    var x = p.x * m.a + p.y * m.c + m.e - r.left;
    var y = p.x * m.b + p.y * m.d + m.f - r.top;
    // Fondu à l'entrée sur la ligne
    rider.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    rider.style.opacity = Math.min(1, t / 0.06).toFixed(2);
  }

  function arrives() {
    riders.forEach(function (r, i) { placer(r, ARRIVEES[i]); r.classList.add('is-arrived'); });
  }

  function tick(now) {
    var termine = true;
    riders.forEach(function (r, i) {
      var k = (now - debut - DEPART - i * DECALAGE) / DUREE;
      if (k < 0) return (termine = false);
      if (k < 1) termine = false;
      k = Math.min(1, k);
      var ease = 1 - Math.pow(1 - k, 3); // ralentit à l'arrivée
      placer(r, ease * ARRIVEES[i]);
    });
    if (termine) { fini = true; arrives(); }
    else requestAnimationFrame(tick);
  }

  // Les pictos restent bien placés si la fenêtre change de taille
  window.addEventListener('resize', function () { if (fini) arrives(); });
  if (reduit) arrives();
  else requestAnimationFrame(tick);
})();

// Tableaux trop larges sur mobile : une petite indication pour faire glisser
(function () {
  var cadres = Array.prototype.slice.call(document.querySelectorAll('.table-wrap'));
  if (!cadres.length) return;
  cadres.forEach(function (c) {
    var aide = document.createElement('p');
    aide.className = 'scroll-hint';
    aide.setAttribute('aria-hidden', 'true');
    aide.textContent = 'Fais glisser le tableau pour tout voir';
    c.parentNode.insertBefore(aide, c);
    c.addEventListener('scroll', function () { if (c.scrollLeft > 20) c.classList.add('a-glisse'); }, { passive: true });
  });
  function maj() {
    cadres.forEach(function (c) { c.classList.toggle('is-scrollable', c.scrollWidth > c.clientWidth + 4); });
  }
  window.addEventListener('resize', maj);
  maj();
})();
