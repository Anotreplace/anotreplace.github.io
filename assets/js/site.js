// Menu mobile
(function () {
  var bouton = document.querySelector('.entete__burger');
  var menu = document.getElementById('menu-principal');
  if (bouton && menu) {
    bouton.addEventListener('click', function () {
      var ouvert = bouton.getAttribute('aria-expanded') === 'true';
      bouton.setAttribute('aria-expanded', String(!ouvert));
      bouton.querySelector('.sr').textContent = ouvert ? 'Ouvrir le menu' : 'Fermer le menu';
      document.body.classList.toggle('menu-ouvert', !ouvert);
    });
  }
})();

// Consentement et Google Analytics (uniquement si un identifiant GA4 est configuré)
(function () {
  var id = window.ANOTREPLACE_GA4;
  var bandeau = document.getElementById('consentement');
  if (!id || !bandeau) return;
  var cle = 'anotreplace-consentement';
  function chargerGA() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  }
  var choix = null;
  try { choix = localStorage.getItem(cle); } catch (e) {}
  if (choix === 'accepte') { chargerGA(); return; }
  if (choix === 'refuse') return;
  bandeau.hidden = false;
  bandeau.addEventListener('click', function (e) {
    var valeur = e.target.getAttribute('data-consentement');
    if (!valeur) return;
    try { localStorage.setItem(cle, valeur); } catch (err) {}
    bandeau.hidden = true;
    if (valeur === 'accepte') chargerGA();
  });
})();
