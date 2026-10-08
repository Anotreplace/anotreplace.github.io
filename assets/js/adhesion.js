// Adhésion en ligne : parcours pas à pas (documents à accepter, formulaire, signature),
// envoi du dossier au script Google, puis choix du paiement (HelloAsso ou virement).
(function () {
  var wiz = document.querySelector('[data-wiz]');
  var form = document.getElementById('form-adhesion');
  if (!wiz || !form) return;

  var depart = document.querySelector('[data-wiz-start]');
  var endpoint = (form.getAttribute('data-endpoint') || '').trim();
  var emailBureau = form.getAttribute('data-email') || '';
  var erreur = document.getElementById('form-erreur');
  var nav = form.querySelector('[data-wiz-nav]');
  var btnRetour = nav.querySelector('[data-wiz-retour]');
  var btnSuivant = nav.querySelector('[data-wiz-suivant]');
  var confirmBox = form.querySelector('[data-wiz-confirm]');
  var btnEnvoyer = document.getElementById('btn-envoyer');
  var etapes = Array.prototype.slice.call(wiz.querySelectorAll('[data-step]'));
  var paiement = wiz.querySelector('[data-step="paiement"]');
  var NB_FORM = etapes.length - 1; // la dernière étape (cotisation) vient après l'envoi
  var courante = 0;
  var envoye = false;
  var dossier = null; // { reference, jeton, nom, tarif }

  var MAX_FICHIER = 8 * 1024 * 1024;
  var TYPES = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;
  var EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
  var TARIFS = { annuel: { libelle: 'Adhésion annuelle', montant: 60 }, solidaire: { libelle: 'Tarif solidaire', montant: 40 } };

  // Sans adresse de script Google valide, l'adhésion en ligne n'est pas proposée
  if (!/^https:\/\/script\.google\.com\//.test(endpoint)) {
    var ouvrir = depart && depart.querySelector('[data-wiz-open]');
    if (ouvrir) ouvrir.closest('.actions').hidden = true;
    return;
  }

  // ---------- Navigation ----------
  function afficher(i, focus) {
    courante = i;
    etapes.forEach(function (e, k) { e.hidden = k !== i; });
    var e = etapes[i];
    wiz.querySelector('[data-wiz-n]').textContent = i + 1;
    wiz.querySelector('[data-wiz-titre]').textContent = e.getAttribute('data-titre');
    wiz.querySelector('[data-wiz-fill]').style.width = Math.round((i + 1) / etapes.length * 100) + '%';
    nav.hidden = e === paiement;
    btnRetour.style.visibility = i === 0 ? 'hidden' : 'visible';
    btnSuivant.textContent = e.getAttribute('data-step') === 'signature' ? 'Envoyer mon dossier' : 'Continuer';
    masquerErreur();
    var lecteur = e.querySelector('[data-reader]');
    if (lecteur) verifierLecture(lecteur);
    if (e.getAttribute('data-step') === 'signature') preparerSignature();
    wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focus !== false) e.focus({ preventScroll: true });
  }

  depart.querySelector('[data-wiz-open]').addEventListener('click', function () {
    depart.hidden = true;
    wiz.hidden = false;
    afficher(0);
  });

  btnRetour.addEventListener('click', function () { if (courante > 0) afficher(courante - 1); });
  btnSuivant.addEventListener('click', function () {
    if (!validerEtape(etapes[courante])) return;
    if (courante < NB_FORM - 1) afficher(courante + 1);
    else ouvrirConfirmation();
  });

  wiz.querySelectorAll('[data-wiz-annuler]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!window.confirm('Annuler ton adhésion ? Les informations saisies seront effacées.')) return;
      fermerConfirmation();
      form.reset();
      sigEffacer();
      etapes.forEach(function (e) { var l = e.querySelector('[data-reader]'); if (l) { l.scrollTop = 0; verrouiller(e, true); } });
      majConditions();
      wiz.hidden = true;
      depart.hidden = false;
      depart.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Prévenir avant de quitter la page en plein milieu
  window.addEventListener('beforeunload', function (e) {
    if (!wiz.hidden && !envoye) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Lecture obligatoire avant d'accepter ----------
  function verrouiller(etape, oui) {
    etape.querySelectorAll('[data-gated]').forEach(function (c) { c.disabled = oui; if (oui) c.checked = false; });
    var h = etape.querySelector('[data-reader-hint]');
    if (h) h.hidden = !oui;
  }
  function verifierLecture(lecteur) {
    if (lecteur.scrollTop + lecteur.clientHeight >= lecteur.scrollHeight - 24) verrouiller(lecteur.closest('[data-step]'), false);
  }
  wiz.querySelectorAll('[data-reader]').forEach(function (l) {
    l.addEventListener('scroll', function () { verifierLecture(l); }, { passive: true });
  });

  // ---------- Champs conditionnels ----------
  function majConditions() {
    form.querySelectorAll('[data-show-if]').forEach(function (bloc) {
      var c = bloc.getAttribute('data-show-if').split('=');
      var coche = form.querySelector('input[name="' + c[0] + '"]:checked');
      var visible = !!coche && coche.value === c[1];
      bloc.hidden = !visible;
      bloc.querySelectorAll('input').forEach(function (input) {
        input.required = visible;
        if (!visible && input.type === 'file') { input.value = ''; etatFichier(input); }
      });
    });
  }
  form.addEventListener('change', function (e) {
    if (e.target.type === 'radio') majConditions();
    if (e.target.type === 'file') etatFichier(e.target);
  });
  majConditions();

  // ---------- Fichier (justificatif du tarif solidaire) ----------
  function taille(o) { return o < 1024 * 1024 ? Math.round(o / 1024) + ' Ko' : (o / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'; }
  function etatFichier(input) {
    var bloc = input.closest('[data-upload]');
    var zone = bloc.querySelector('.upload-file');
    var f = input.files && input.files[0];
    bloc.classList.remove('is-ok', 'is-error');
    if (!f) { zone.textContent = zone.getAttribute('data-empty'); return true; }
    var pb = (!TYPES.test(f.type) && !EXT.test(f.name)) ? 'Format non accepté. Envoie un PDF, un JPG ou un PNG.'
      : f.size > MAX_FICHIER ? 'Fichier trop lourd (' + taille(f.size) + '). 8 Mo maximum.' : '';
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
        var k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(f); };
      img.src = url;
    });
  }

  // ---------- Signature ----------
  var canvas = wiz.querySelector('[data-sig]');
  var ctx = canvas.getContext('2d');
  var signe = false, trace = false, dernier = null;
  function preparerSignature() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(r.width * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      signe = false;
    }
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#221C47';
    var j = new Date();
    wiz.querySelector('[data-date-jour]').textContent = j.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    remplirRecap();
  }
  function point(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    trace = true; dernier = point(e);
    ctx.beginPath(); ctx.arc(dernier.x, dernier.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#221C47'; ctx.fill();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!trace) return;
    var p = point(e);
    ctx.beginPath(); ctx.moveTo(dernier.x, dernier.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    dernier = p; signe = true;
    canvas.classList.add('is-signed');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { canvas.addEventListener(t, function () { trace = false; }); });
  function sigEffacer() { ctx.clearRect(0, 0, canvas.width, canvas.height); signe = false; canvas.classList.remove('is-signed'); }
  wiz.querySelector('[data-sig-effacer]').addEventListener('click', sigEffacer);

  // ---------- Récapitulatif ----------
  function val(n) { var el = form.querySelector('[name="' + n + '"]:checked'); return el ? el.value : ''; }
  function remplirRecap() {
    var t = TARIFS[val('tarif')] || TARIFS.annuel;
    var disc = Array.prototype.map.call(form.querySelectorAll('[name="disciplines"]:checked'), function (c) { return c.value; }).join(', ');
    var image = val('droit_image') === 'oui';
    var lignes = [
      ['Adhérente', form.prenom.value.trim() + ' ' + form.nom.value.trim()],
      ['E-mail', form.email.value.trim()],
      ['Charte du collectif', 'Lue et acceptée'],
      ['Règlement intérieur', 'Lu et accepté'],
      ["Droit à l'image", image ? 'Accepté' : 'Refusé'],
      ['Disciplines', disc || 'Non précisées'],
      ['Cotisation', t.libelle + ' · ' + t.montant + '€']
    ];
    var dl = wiz.querySelector('[data-recap]');
    dl.textContent = '';
    lignes.forEach(function (l) {
      var dt = document.createElement('dt'); dt.textContent = l[0];
      var dd = document.createElement('dd'); dd.textContent = l[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    wiz.querySelector('[data-recap-image]').textContent = image ? " et l'autorisation de droit à l'image" : '';
  }

  // ---------- Validation d'une étape ----------
  function majeure(s) {
    var d = new Date(s);
    if (isNaN(d)) return false;
    var a = new Date();
    var age = a.getFullYear() - d.getFullYear();
    if (a.getMonth() < d.getMonth() || (a.getMonth() === d.getMonth() && a.getDate() < d.getDate())) age--;
    return age >= 18 && age < 110;
  }
  function masquerErreur() { erreur.hidden = true; }
  function afficherErreur(msg, champ) {
    erreur.textContent = msg;
    erreur.hidden = false;
    var cible = champ ? (champ.type === 'file' ? champ.closest('[data-upload]').querySelector('.upload-zone') : champ) : erreur;
    cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (champ && champ.type !== 'file' && !champ.disabled) champ.focus({ preventScroll: true });
    return false;
  }
  function validerEtape(e) {
    masquerErreur();
    var etape = e.getAttribute('data-step');
    var champs = e.querySelectorAll('input');
    for (var i = 0; i < champs.length; i++) {
      var c = champs[i];
      if (c.closest('[hidden]')) continue;
      if (c.type === 'file') {
        if (c.required && !(c.files && c.files[0])) return afficherErreur('Ajoute ton justificatif pour le tarif solidaire.', c);
        if (!etatFichier(c)) return afficherErreur('Ton justificatif ne convient pas : vérifie le fichier en rouge.', c);
        continue;
      }
      // Une case encore verrouillée (document pas lu jusqu'au bout) n'est pas vérifiée par le navigateur
      var manque = c.type === 'checkbox' && c.required ? !c.checked : !c.checkValidity();
      if (!manque) continue;
      if (c.name === 'ok_charte' || c.name === 'ok_reglement') {
        return afficherErreur(c.disabled ? "Fais défiler le document jusqu'en bas, puis coche la case pour l'accepter." : "Coche la case pour accepter le document et continuer.", c);
      }
      if (c.name === 'droit_image') return afficherErreur("Choisis si tu acceptes ou refuses le droit à l'image.", c);
      if (c.name === 'lu_approuve') return afficherErreur('Coche « Lu et approuvé » pour signer ton dossier.', c);
      if (c.type === 'checkbox') return afficherErreur('Merci de cocher tous tes engagements.', c);
      if (c.type === 'email') return afficherErreur('Ton adresse e-mail ne semble pas valide.', c);
      return afficherErreur('Merci de remplir tous les champs.', c);
    }
    if (etape === 'formulaire' && !majeure(form.naissance.value)) return afficherErreur("L'adhésion est réservée aux femmes majeures. Vérifie ta date de naissance.", form.naissance);
    if (etape === 'signature' && !signe) return afficherErreur('Signe dans le cadre avant de continuer.', null);
    return true;
  }

  // ---------- Confirmation puis envoi ----------
  function ouvrirConfirmation() {
    confirmBox.hidden = false;
    btnEnvoyer.focus();
  }
  function fermerConfirmation() { confirmBox.hidden = true; }
  confirmBox.querySelector('[data-confirm-retour]').addEventListener('click', function () { fermerConfirmation(); btnSuivant.focus(); });
  confirmBox.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermerConfirmation(); });

  function occupe(oui) {
    btnEnvoyer.disabled = oui;
    btnEnvoyer.setAttribute('aria-busy', oui ? 'true' : 'false');
    btnEnvoyer.textContent = oui ? 'Envoi en cours…' : 'Oui, envoyer mon dossier';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // La touche Entrée dans un champ ne doit jamais envoyer le dossier sans confirmation
    if (confirmBox.hidden) { btnSuivant.click(); return; }
    if (form.site_web.value) return; // robot
    var donnees = {
      action: 'dossier',
      prenom: form.prenom.value.trim(),
      nom: form.nom.value.trim(),
      email: form.email.value.trim(),
      telephone: form.telephone.value.trim(),
      naissance: form.naissance.value,
      adresse: form.adresse.value.trim(),
      urgence_nom: form.urgence_nom.value.trim(),
      urgence_lien: form.urgence_lien.value.trim(),
      urgence_tel: form.urgence_tel.value.trim(),
      disciplines: Array.prototype.map.call(form.querySelectorAll('[name="disciplines"]:checked'), function (c) { return c.value; }),
      tshirt: val('tshirt'),
      tarif: val('tarif'),
      droit_image: val('droit_image'),
      charte: form.ok_charte.checked,
      reglement: form.ok_reglement.checked,
      engagements: {
        majeure: form.eng_majeure.checked, statuts: form.eng_statuts.checked, sante: form.eng_sante.checked,
        assurance: form.eng_assurance.checked, donnees: form.eng_rgpd.checked
      },
      fait_a: form.fait_a.value.trim(),
      lu_approuve: form.lu_approuve.checked,
      signature: canvas.toDataURL('image/png').split(',')[1],
      fichiers: []
    };
    var justif = form.justificatif_tarif;
    var fichier = donnees.tarif === 'solidaire' && justif.files && justif.files[0];

    occupe(true);
    (fichier ? compresser(fichier).then(function (f) {
      return lireBase64(f).then(function (b64) {
        donnees.fichiers.push({ champ: 'justificatif_tarif', libelle: 'Justificatif tarif solidaire', nom: f.name, type: f.type || 'image/jpeg', data: b64 });
      });
    }) : Promise.resolve()).then(function () {
      return fetch(endpoint, { method: 'POST', body: JSON.stringify(donnees) }); // text/plain : pas de pré-requête CORS
    }).then(function (r) { return r.json(); }).then(function (rep) {
      if (!rep || !rep.ok) { var ex = new Error('serveur'); ex.msgServeur = rep && rep.erreur; throw ex; }
      envoye = true;
      dossier = { reference: rep.reference, jeton: rep.jeton, nom: donnees.nom.toUpperCase(), tarif: donnees.tarif };
      fermerConfirmation();
      versPaiement(donnees.prenom);
    }).catch(function (err) {
      occupe(false);
      fermerConfirmation();
      afficherErreur(err.msgServeur || "L'envoi n'a pas abouti. Vérifie ta connexion et réessaie, ou écris-nous à " + emailBureau + '.', null);
    });
  });

  // ---------- Cotisation ----------
  function versPaiement(prenom) {
    var t = TARIFS[dossier.tarif] || TARIFS.annuel;
    paiement.querySelector('[data-prenom]').textContent = prenom;
    paiement.querySelector('[data-ref]').textContent = dossier.reference;
    paiement.querySelectorAll('[data-montant]').forEach(function (s) { s.textContent = t.montant + '€'; });
    paiement.querySelector('[data-tarif-libelle]').textContent = t.libelle;
    paiement.querySelector('[data-libelle]').textContent = 'Adhésion ' + dossier.reference + ' ' + dossier.nom;
    afficher(etapes.indexOf(paiement));
  }

  var iframe = paiement.querySelector('iframe');
  paiement.querySelectorAll('[data-pay]').forEach(function (b) {
    b.addEventListener('click', function () {
      var mode = b.getAttribute('data-pay');
      paiement.querySelectorAll('[data-pay]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      paiement.querySelectorAll('[data-pay-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-pay-panel') !== mode; });
      if (mode === 'cb' && !iframe.src) iframe.src = iframe.getAttribute('data-src');
      // On note le mode choisi dans le tableau de suivi (sans bloquer la page)
      if (dossier && dossier.jeton) {
        fetch(endpoint, { method: 'POST', body: JSON.stringify({ action: 'paiement', reference: dossier.reference, jeton: dossier.jeton, mode: mode }) }).catch(function () {});
      }
    });
  });

  // Ajuste la hauteur du widget quand HelloAsso l'indique (messages HelloAsso uniquement)
  window.addEventListener('message', function (e) {
    var hote = '';
    try { hote = new URL(e.origin).hostname; } catch (err) { return; }
    if (!/(^|\.)helloasso(pay)?\.com$/.test(hote)) return;
    var h = e.data && parseFloat(e.data.height);
    if (h && h > parseFloat(iframe.style.height || 0)) iframe.style.height = Math.ceil(h) + 'px';
  });
})();
