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
