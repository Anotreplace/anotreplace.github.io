// Dossier d'adhésion : dépôt des documents, choix du paiement, envoi au script Google.
(function () {
  var form = document.getElementById('form-adhesion');
  if (!form) return;

  var endpoint = (form.getAttribute('data-endpoint') || '').trim();
  var helloasso = (form.getAttribute('data-helloasso') || '').trim();
  var email = form.getAttribute('data-email') || '';
  var erreur = document.getElementById('form-erreur');
  var bouton = document.getElementById('btn-envoyer');
  var done = document.getElementById('dossier-ok');

  var MAX_FICHIER = 8 * 1024 * 1024;   // 8 Mo par fichier (avant compression)
  var MAX_TOTAL = 20 * 1024 * 1024;    // 20 Mo envoyés au total
  var TYPES = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;
  var EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
  var MONTANTS = { annuel: 60, solidaire: 40 };

  // Formulaire pas encore branché : on affiche l'alternative par e-mail
  var configure = /^https:\/\/script\.google\.com\//.test(endpoint);
  if (!configure) {
    document.getElementById('form-indispo').hidden = false;
    form.hidden = true;
    return;
  }

  // ---------- Champs conditionnels ----------
  function majConditions() {
    form.querySelectorAll('[data-show-if]').forEach(function (bloc) {
      var c = bloc.getAttribute('data-show-if').split('=');
      var coche = form.querySelector('input[name="' + c[0] + '"]:checked');
      var visible = !!coche && coche.value === c[1];
      bloc.hidden = !visible;
      var input = bloc.querySelector('input[type="file"]');
      if (input) {
        // Le justificatif du tarif solidaire devient obligatoire quand ce tarif est choisi
        if (input.name === 'justificatif_tarif') input.required = visible;
        if (!visible) { input.value = ''; etatFichier(input); }
      }
    });
  }
  form.addEventListener('change', function (e) {
    if (e.target.type === 'radio') majConditions();
    if (e.target.type === 'file') etatFichier(e.target);
  });
  majConditions();

  // ---------- Fichiers ----------
  function taille(o) { return o < 1024 * 1024 ? Math.round(o / 1024) + ' Ko' : (o / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'; }

  function verifierFichier(f) {
    if (!TYPES.test(f.type) && !EXT.test(f.name)) return 'Format non accepté. Envoie un PDF, un JPG ou un PNG.';
    if (f.size > MAX_FICHIER) return 'Fichier trop lourd (' + taille(f.size) + '). 8 Mo maximum.';
    return '';
  }

  function etatFichier(input) {
    var bloc = input.closest('[data-upload]');
    var zone = bloc.querySelector('.upload-file');
    var f = input.files && input.files[0];
    bloc.classList.remove('is-ok', 'is-error');
    if (!f) { zone.textContent = zone.getAttribute('data-empty'); return true; }
    var pb = verifierFichier(f);
    if (pb) { bloc.classList.add('is-error'); zone.textContent = pb; return false; }
    bloc.classList.add('is-ok');
    zone.textContent = f.name + ' · ' + taille(f.size);
    return true;
  }

  function lireBase64(blob) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { ko(new Error('lecture')); };
      r.readAsDataURL(blob);
    });
  }

  // Les photos prises au téléphone sont allégées avant l'envoi
  function compresser(f) {
    if (!/^image\/(jpeg|png|webp)$/i.test(f.type) || f.size < 1.5 * 1024 * 1024) return Promise.resolve(f);
    return new Promise(function (ok) {
      var img = new Image();
      var url = URL.createObjectURL(f);
      img.onload = function () {
        var max = 2200, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (!b || b.size >= f.size) return ok(f);
          ok(new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(f); };
      img.src = url;
    });
  }

  // ---------- Validation ----------
  function majeure(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d)) return false;
    var a = new Date();
    var age = a.getFullYear() - d.getFullYear();
    if (a.getMonth() < d.getMonth() || (a.getMonth() === d.getMonth() && a.getDate() < d.getDate())) age--;
    return age >= 18 && age < 110;
  }

  function afficherErreur(msg, champ) {
    erreur.textContent = msg;
    erreur.hidden = false;
    if (champ) {
      var cible = champ.type === 'file' ? champ.closest('[data-upload]').querySelector('.upload-zone') : champ;
      cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (champ.type !== 'file') champ.focus({ preventScroll: true });
    }
  }

  function valider() {
    var champs = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < champs.length; i++) {
      var c = champs[i];
      if (c.closest('[hidden]') || c.name === 'site_web') continue;
      if (c.type === 'file') {
        if (c.required && !(c.files && c.files[0])) return afficherErreur('Il manque un document : ' + c.closest('[data-upload]').querySelector('strong').textContent + '.', c), false;
        if (!etatFichier(c)) return afficherErreur('Un fichier ne convient pas. Vérifie les documents en rouge.', c), false;
      } else if (!c.checkValidity()) {
        var label = c.type === 'checkbox' ? 'Merci de cocher les engagements en bas du formulaire.' :
          c.type === 'email' ? 'Ton adresse e-mail ne semble pas valide.' : 'Merci de remplir tous les champs.';
        return afficherErreur(label, c), false;
      }
    }
    if (!majeure(form.naissance.value)) return afficherErreur("L'adhésion est réservée aux femmes majeures. Vérifie ta date de naissance.", form.naissance), false;
    return true;
  }

  // ---------- Envoi ----------
  function occupe(oui) {
    bouton.disabled = oui;
    bouton.setAttribute('aria-busy', oui ? 'true' : 'false');
    bouton.textContent = oui ? 'Envoi en cours…' : 'Envoyer mon dossier';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    erreur.hidden = true;
    if (form.site_web.value) return; // robot
    if (!valider()) return;

    var val = function (n) { var el = form.querySelector('[name="' + n + '"]:checked'); return el ? el.value : ''; };
    var donnees = {
      prenom: form.prenom.value.trim(),
      nom: form.nom.value.trim(),
      email: form.email.value.trim(),
      telephone: form.telephone.value.trim(),
      naissance: form.naissance.value,
      disciplines: Array.prototype.map.call(form.querySelectorAll('[name="disciplines"]:checked'), function (c) { return c.value; }),
      tarif: val('tarif'),
      paiement: val('paiement'),
      fichiers: []
    };

    var inputs = Array.prototype.filter.call(form.querySelectorAll('input[type="file"]'), function (i) {
      return !i.closest('[hidden]') && i.files && i.files[0];
    });

    occupe(true);
    var total = 0;
    Promise.all(inputs.map(function (input) {
      return compresser(input.files[0]).then(function (f) {
        total += f.size;
        return lireBase64(f).then(function (b64) {
          return {
            champ: input.name,
            libelle: input.closest('[data-upload]').querySelector('strong').textContent,
            nom: f.name,
            type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg'),
            data: b64
          };
        });
      });
    })).then(function (fichiers) {
      if (total > MAX_TOTAL) throw new Error('trop-lourd');
      donnees.fichiers = fichiers;
      return fetch(endpoint, { method: 'POST', body: JSON.stringify(donnees) }); // text/plain : pas de pré-requête CORS
    }).then(function (r) {
      return r.json();
    }).then(function (rep) {
      if (!rep || !rep.ok) { var ex = new Error('serveur'); ex.msgServeur = rep && rep.erreur; throw ex; }
      succes(rep.reference, donnees);
    }).catch(function (err) {
      occupe(false);
      var msg = err.message === 'trop-lourd'
        ? 'Tes fichiers sont trop lourds au total (20 Mo maximum). Essaie des PDF ou des photos plus légères.'
        : err.msgServeur
          ? err.msgServeur
          : "L'envoi n'a pas abouti. Réessaie dans un instant, ou envoie tes documents à " + email + '.';
      afficherErreur(msg);
      erreur.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  function succes(ref, d) {
    var montant = MONTANTS[d.tarif] + '€';
    done.querySelector('[data-ref]').textContent = ref || '';
    done.querySelectorAll('[data-montant]').forEach(function (s) { s.textContent = montant; });
    var cas = d.paiement;
    if (cas === 'virement' && d.fichiers.some(function (f) { return f.champ === 'justificatif_paiement'; })) cas = 'virement-preuve';
    var bloc = done.querySelector('[data-done="' + cas + '"]');
    if (bloc) bloc.hidden = false;
    var lien = done.querySelector('[data-helloasso-btn]');
    if (lien) lien.href = helloasso;
    form.hidden = true;
    done.hidden = false;
    done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    done.focus({ preventScroll: true });
  }
})();
