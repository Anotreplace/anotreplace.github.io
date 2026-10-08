/**
 * ============================================================
 *  Ànotreplace · Dossiers d'adhésion
 * ============================================================
 *  Ce script :
 *   1. reçoit les dossiers envoyés depuis la page Adhésion du site ;
 *   2. range les documents dans Google Drive (un dossier par adhérente) ;
 *   3. remplit le tableau de suivi « Adhésions » ;
 *   4. envoie le dossier complet (pièces jointes) à la boîte du collectif ;
 *   5. envoie les e-mails automatiques à l'adhérente selon sa situation.
 *
 *  Installation : voir LISEZ-MOI.md (15 minutes, une seule fois).
 * ============================================================
 */

// ------------------------------------------------------------
// 1. RÉGLAGES : à compléter (les lignes marquées A_REMPLACER)
// ------------------------------------------------------------
const CONFIG = {
  SAISON: '2026-2027',
  EMAIL_BUREAU: 'collectif.anotreplace@gmail.com',
  NOM_EXPEDITEUR: 'Ànotreplace',
  SITE: 'https://anotreplace.github.io',
  HELLOASSO_URL: 'https://www.helloasso.com/associations/anotreplace/adhesions/adhesion-anotreplace-saison-2026-2027', // campagne de la cotisation
  GROUPE_URL: '',                                                       // lien d'invitation au groupe de discussions (facultatif)
  VIREMENT: {
    TITULAIRE: 'ANOTREPLACE',
    IBAN: 'A_REMPLACER',
    BIC: 'A_REMPLACER',
  },
  REMISE_EN_MAIN_PROPRE: 'à Lauryn ou Léa, lors de ta prochaine sortie',
  ORDRE_CHEQUE: 'ANOTREPLACE',
  RELANCE_APRES_JOURS: 5,   // relance automatique si le paiement est toujours « En attente »
  MAX_FICHIER_MO: 10,
};

const TARIFS = {
  annuel: { libelle: 'Adhésion annuelle', montant: 60 },
  solidaire: { libelle: 'Tarif solidaire', montant: 40 },
};
const PAIEMENTS = {
  cb: 'Carte bancaire (HelloAsso)',
  virement: 'Virement',
  'main-propre': 'Chèque ou espèces',
};
const DOCS_OBLIGATOIRES = ['dossier']; // un seul PDF : formulaire, charte, règlement intérieur, droit à l'image
const TYPES_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Tableau de suivi
const ONGLET = 'Adhésions';
const COL = {
  date: 'Date', ref: 'Référence', prenom: 'Prénom', nom: 'Nom', email: 'E-mail', tel: 'Téléphone',
  naissance: 'Date de naissance', disciplines: 'Disciplines', tarif: 'Tarif', montant: 'Montant',
  paiement: 'Mode de paiement', droitImage: 'Droit à l\'image', justifTarif: 'Justif. tarif', preuve: 'Preuve paiement', drive: 'Documents',
  statut: 'Statut dossier', etatPaiement: 'Paiement', remarques: 'Pièces manquantes / remarques',
  relance: 'Relance paiement', historique: 'E-mails envoyés',
};
const ORDRE_COLONNES = Object.keys(COL).map(function (k) { return COL[k]; });
const STATUTS_DOSSIER = ['À vérifier', 'Incomplet', 'Validé'];
const STATUTS_PAIEMENT = ['En attente', 'À vérifier', 'Reçu'];
const FUSEAU = 'Europe/Paris';


// ------------------------------------------------------------
// 2. INSTALLATION (à lancer une fois depuis l'éditeur)
// ------------------------------------------------------------
function installer() {
  const props = PropertiesService.getScriptProperties();
  let dossier, classeur;

  try { dossier = DriveApp.getFolderById(props.getProperty('DOSSIER_ID')); } catch (e) { dossier = null; }
  if (!dossier) {
    dossier = DriveApp.createFolder('Ànotreplace · Adhésions ' + CONFIG.SAISON);
    props.setProperty('DOSSIER_ID', dossier.getId());
  }

  try { classeur = SpreadsheetApp.openById(props.getProperty('CLASSEUR_ID')); } catch (e) { classeur = null; }
  if (!classeur) {
    classeur = SpreadsheetApp.create('Ànotreplace · Suivi des adhésions ' + CONFIG.SAISON);
    DriveApp.getFileById(classeur.getId()).moveTo(dossier);
    props.setProperty('CLASSEUR_ID', classeur.getId());
    const f = classeur.getSheets()[0];
    f.setName(ONGLET);
    f.getRange(1, 1, 1, ORDRE_COLONNES.length).setValues([ORDRE_COLONNES])
      .setFontWeight('bold').setBackground('#221C47').setFontColor('#FFFFFF').setWrap(true);
    f.setFrozenRows(1);
    f.setFrozenColumns(4);
    f.setColumnWidths(1, ORDRE_COLONNES.length, 130);
    f.setColumnWidth(col_(f, COL.remarques), 260);
    f.setColumnWidth(col_(f, COL.historique), 260);

    const lignes = 1000;
    const regleStatut = SpreadsheetApp.newDataValidation().requireValueInList(STATUTS_DOSSIER, true).setAllowInvalid(false).build();
    const reglePaiement = SpreadsheetApp.newDataValidation().requireValueInList(STATUTS_PAIEMENT, true).setAllowInvalid(false).build();
    const plageStatut = f.getRange(2, col_(f, COL.statut), lignes);
    const plagePaiement = f.getRange(2, col_(f, COL.etatPaiement), lignes);
    plageStatut.setDataValidation(regleStatut);
    plagePaiement.setDataValidation(reglePaiement);

    const couleur = function (plage, texte, fond) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(texte).setBackground(fond).setRanges([plage]).build();
    };
    f.setConditionalFormatRules([
      couleur(plageStatut, 'Validé', '#D7F5E4'), couleur(plageStatut, 'Incomplet', '#FDE2EC'), couleur(plageStatut, 'À vérifier', '#FFF4CC'),
      couleur(plagePaiement, 'Reçu', '#D7F5E4'), couleur(plagePaiement, 'En attente', '#FDE2EC'), couleur(plagePaiement, 'À vérifier', '#FFF4CC'),
    ]);
  }

  // Déclencheurs : modification du tableau + relances quotidiennes
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('surModification').forSpreadsheet(classeur).onEdit().create();
  ScriptApp.newTrigger('relancesQuotidiennes').timeBased().everyDays(1).atHour(9).inTimezone(FUSEAU).create();

  MailApp.sendEmail({
    to: CONFIG.EMAIL_BUREAU,
    name: CONFIG.NOM_EXPEDITEUR,
    subject: 'Dossiers d\'adhésion : installation terminée',
    htmlBody: gabarit_('Installation terminée', '<p>Le script est prêt.</p>' +
      '<p>' + bouton_(classeur.getUrl(), 'Ouvrir le tableau de suivi') + '</p>' +
      '<p><a href="' + dossier.getUrl() + '">Dossier Drive des adhésions</a></p>' +
      '<p>Dernière étape : déployer le script en « Application Web » et coller son adresse dans _config.yml du site.</p>'),
  });
  Logger.log('Tableau : ' + classeur.getUrl());
  Logger.log('Dossier : ' + dossier.getUrl());
}


// ------------------------------------------------------------
// 3. RÉCEPTION D'UN DOSSIER (appelé par le site)
// ------------------------------------------------------------
function doGet() {
  return ContentService.createTextOutput('Service des dossiers d\'adhésion Ànotreplace : actif.');
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.site_web) return json_({ ok: true, reference: '' }); // robot
    const probleme = valider_(d);
    if (probleme) return json_({ ok: false, erreur: probleme });
    const reference = enregistrer_(d);
    return json_({ ok: true, reference: reference });
  } catch (err) {
    console.error(err);
    try {
      MailApp.sendEmail(CONFIG.EMAIL_BUREAU, '[Site] Erreur lors de la réception d\'un dossier', String(err && err.stack || err));
    } catch (e2) { /* quota atteint */ }
    return json_({ ok: false, erreur: 'Une erreur est survenue de notre côté. Réessaie dans un instant, ou envoie tes documents à ' + CONFIG.EMAIL_BUREAU + '.' });
  }
}

function valider_(d) {
  const requis = ['prenom', 'nom', 'email', 'telephone', 'naissance', 'tarif', 'paiement'];
  for (let i = 0; i < requis.length; i++) {
    if (!d[requis[i]] || String(d[requis[i]]).trim() === '') return 'Merci de remplir tous les champs.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'Ton adresse e-mail ne semble pas valide.';
  if (!TARIFS[d.tarif]) return 'Tarif inconnu.';
  if (!PAIEMENTS[d.paiement]) return 'Mode de paiement inconnu.';
  if (age_(d.naissance) < 18) return 'L\'adhésion est réservée aux femmes majeures.';

  const fichiers = Array.isArray(d.fichiers) ? d.fichiers : [];
  const champs = fichiers.map(function (f) { return f.champ; });
  for (let i = 0; i < DOCS_OBLIGATOIRES.length; i++) {
    if (champs.indexOf(DOCS_OBLIGATOIRES[i]) === -1) return 'Il manque ton dossier d\'adhésion signé.';
  }
  if (d.tarif === 'solidaire' && champs.indexOf('justificatif_tarif') === -1) return 'Le tarif solidaire nécessite un justificatif.';
  for (let i = 0; i < fichiers.length; i++) {
    const f = fichiers[i];
    if (TYPES_ACCEPTES.indexOf(String(f.type).toLowerCase()) === -1) return 'Le fichier « ' + f.nom + ' » n\'est pas un PDF ou une image.';
    if (String(f.data || '').length * 0.75 > CONFIG.MAX_FICHIER_MO * 1024 * 1024) return 'Le fichier « ' + f.nom + ' » est trop lourd.';
  }
  return '';
}

function enregistrer_(d) {
  const reference = nouvelleReference_();
  const prenom = propre_(d.prenom);
  const nom = propre_(d.nom).toUpperCase();
  const tarif = TARIFS[d.tarif];

  const champs = d.fichiers.map(function (f) { return f.champ; });

  // Documents dans Drive
  const racine = DriveApp.getFolderById(prop_('DOSSIER_ID'));
  const dossier = racine.createFolder(reference + ' · ' + nom + ' ' + prenom);
  const blobs = [];
  d.fichiers.forEach(function (f) {
    const ext = f.type === 'application/pdf' ? 'pdf' : (String(f.nom).split('.').pop() || 'jpg').toLowerCase();
    const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, reference + ' · ' + f.libelle + ' · ' + nom + ' ' + prenom + '.' + ext);
    dossier.createFile(blob);
    blobs.push(blob);
  });
  const aPreuve = champs.indexOf('justificatif_paiement') !== -1;
  const etatPaiement = (d.paiement === 'virement' && aPreuve) ? 'À vérifier' : 'En attente';

  // Ligne du tableau
  const feuille = feuille_();
  const ligne = {};
  ligne[COL.date] = new Date();
  ligne[COL.ref] = reference;
  ligne[COL.prenom] = prenom;
  ligne[COL.nom] = nom;
  ligne[COL.email] = String(d.email).trim().toLowerCase();
  ligne[COL.tel] = "'" + propre_(d.telephone);
  ligne[COL.naissance] = d.naissance;
  ligne[COL.disciplines] = (d.disciplines || []).join(', ');
  ligne[COL.tarif] = tarif.libelle;
  ligne[COL.montant] = tarif.montant;
  ligne[COL.paiement] = PAIEMENTS[d.paiement];
  ligne[COL.droitImage] = d.droit_image === 'oui' ? 'Oui' : 'Non';
  ligne[COL.justifTarif] = d.tarif === 'solidaire' ? 'Oui' : '';
  ligne[COL.preuve] = aPreuve ? 'Oui' : '';
  ligne[COL.drive] = '=HYPERLINK("' + dossier.getUrl() + '";"Ouvrir")';
  ligne[COL.statut] = 'À vérifier';
  ligne[COL.etatPaiement] = etatPaiement;
  ligne[COL.historique] = horodatage_() + ' Confirmation';
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  feuille.appendRow(entetes.map(function (h) { return ligne[h] !== undefined ? ligne[h] : ''; }));

  const adh = { ref: reference, prenom: prenom, nom: nom, email: ligne[COL.email], tarif: d.tarif, paiement: d.paiement, preuve: aPreuve };

  // E-mail au bureau, avec les pièces jointes
  const poids = blobs.reduce(function (s, b) { return s + b.getBytes().length; }, 0);
  const lignesRecap = [
    ['Adhérente', esc_(prenom + ' ' + nom)], ['E-mail', esc_(adh.email)], ['Téléphone', esc_(propre_(d.telephone))],
    ['Date de naissance', esc_(d.naissance)], ['Disciplines', esc_(ligne[COL.disciplines] || '—')],
    ['Droit à l\'image', d.droit_image === 'oui' ? 'Autorisé' : '<span style="color:#B4234F">Refusé : ne pas publier de photo d\'elle</span>'],
    ['Tarif', tarif.libelle + ' · ' + tarif.montant + '€'], ['Paiement', PAIEMENTS[d.paiement] + (aPreuve ? ' (preuve jointe)' : '')],
    ['Documents', d.fichiers.map(function (f) { return esc_(f.libelle); }).join('<br>')],
  ];
  MailApp.sendEmail({
    to: CONFIG.EMAIL_BUREAU,
    replyTo: adh.email,
    name: 'Site ' + CONFIG.NOM_EXPEDITEUR,
    subject: 'Nouveau dossier ' + reference + ' · ' + prenom + ' ' + nom + ' · ' + tarif.libelle + ' · ' + PAIEMENTS[d.paiement],
    htmlBody: gabarit_('Nouveau dossier d\'adhésion', tableau_(lignesRecap) +
      '<p style="margin-top:20px">' + bouton_(SpreadsheetApp.openById(prop_('CLASSEUR_ID')).getUrl(), 'Ouvrir le tableau de suivi') + '</p>' +
      '<p><a href="' + dossier.getUrl() + '">Voir les documents dans Drive</a></p>' +
      (poids > 18 * 1024 * 1024 ? '<p><em>Pièces jointes trop lourdes pour l\'e-mail : elles sont dans Drive.</em></p>' : '') +
      '<p style="color:#5F5A7D;font-size:13px">Pour valider : passe « Statut dossier » sur Validé et « Paiement » sur Reçu. L\'e-mail de bienvenue part automatiquement.</p>'),
    attachments: poids > 18 * 1024 * 1024 ? [] : blobs,
  });

  // E-mail de confirmation à l'adhérente
  envoyer_(adh, 'confirmation');
  return reference;
}


// ------------------------------------------------------------
// 4. E-MAILS AUTOMATIQUES SELON LA SITUATION
// ------------------------------------------------------------
function envoyer_(adh, cas, remarques) {
  const t = TARIFS[adh.tarif] || TARIFS.annuel;
  const montant = t.montant + '€';
  let sujet, titre, corps;

  if (cas === 'confirmation') {
    sujet = 'Ton dossier d\'adhésion est bien reçu (réf. ' + adh.ref + ')';
    titre = 'Merci ' + esc_(adh.prenom) + ', ton dossier est bien arrivé !';
    corps = '<p>Ton dossier d\'adhésion à Ànotreplace pour la saison ' + CONFIG.SAISON + ' est entre nos mains.</p>' +
      tableau_([['Référence', adh.ref], ['Tarif', t.libelle + ' · ' + montant], ['Paiement', PAIEMENTS[adh.paiement]]]) +
      blocPaiement_(adh, montant, false) +
      (adh.tarif === 'solidaire' ? '<p>Ton justificatif de tarif solidaire sera vérifié par le bureau.</p>' : '') +
      '<p><strong>Et ensuite ?</strong> Le bureau vérifie ton dossier sous quelques jours. Dès que tout est en ordre, tu reçois un e-mail de bienvenue.</p>';

  } else if (cas === 'incomplet') {
    sujet = 'Ton dossier d\'adhésion : il manque un élément (réf. ' + adh.ref + ')';
    titre = 'Presque bon, ' + esc_(adh.prenom) + ' !';
    corps = '<p>On a regardé ton dossier avec attention. Il nous manque encore :</p>' +
      '<p style="background:#FFF4F7;border-radius:12px;padding:14px 16px;white-space:pre-line">' + esc_(remarques) + '</p>' +
      '<p>Réponds simplement à cet e-mail avec le ou les documents (PDF ou photo nette). Les documents sont aussi téléchargeables sur <a href="' + CONFIG.SITE + '/adhesion/#dossier">la page adhésion</a>.</p>';

  } else if (cas === 'paiement-recu') {
    sujet = 'Ta cotisation est bien reçue (réf. ' + adh.ref + ')';
    titre = 'Paiement bien reçu, merci !';
    corps = '<p>Ta cotisation de ' + montant + ' est bien arrivée. On termine la vérification de ton dossier et on revient vers toi très vite.</p>';

  } else if (cas === 'bienvenue') {
    sujet = 'Bienvenue dans le collectif, ' + adh.prenom + ' !';
    titre = 'Bienvenue chez Ànotreplace, ' + esc_(adh.prenom) + ' !';
    corps = '<p>Ton adhésion pour la saison ' + CONFIG.SAISON + ' est validée. Tu fais maintenant partie du collectif. Ici, chacune a sa place.</p>' +
      (CONFIG.GROUPE_URL ? '<p>' + bouton_(CONFIG.GROUPE_URL, 'Rejoindre le groupe de discussions') + '</p>' : '') +
      '<p>Les sorties de la semaine sont annoncées dans le groupe et sur <a href="https://www.instagram.com/collectif.anotreplace/">Instagram</a>. On a hâte de partager la route avec toi.</p>';

  } else if (cas === 'relance') {
    sujet = 'Petit rappel : ta cotisation Ànotreplace (réf. ' + adh.ref + ')';
    titre = 'Un petit rappel, ' + esc_(adh.prenom);
    corps = '<p>Ton dossier est bien reçu, mais on n\'a pas encore enregistré ta cotisation de ' + montant + '. Il ne manque plus que ça pour valider ton adhésion.</p>' +
      blocPaiement_(adh, montant, true) +
      '<p>Tu as déjà réglé ? Réponds à cet e-mail, on vérifie.</p>';
  } else {
    return;
  }

  MailApp.sendEmail({
    to: adh.email,
    replyTo: CONFIG.EMAIL_BUREAU,
    name: CONFIG.NOM_EXPEDITEUR,
    subject: sujet,
    htmlBody: gabarit_(titre, '<p>Bonjour ' + esc_(adh.prenom) + ',</p>' + corps),
  });
}

function blocPaiement_(adh, montant, relance) {
  if (adh.paiement === 'cb') {
    return '<p><strong>' + (relance ? 'Pour régler' : 'Dernière étape') + ' :</strong> règle ta cotisation de ' + montant + ' en ligne, en toute sécurité (choisis le tarif « ' + (TARIFS[adh.tarif] || TARIFS.annuel).libelle + ' »).</p>' +
      '<p>' + bouton_(CONFIG.HELLOASSO_URL, 'Payer ma cotisation sur HelloAsso') + '</p>';
  }
  if (adh.paiement === 'virement') {
    if (adh.preuve && !relance) return '<p>Ta preuve de virement est bien jointe. On vérifie la réception sur notre compte.</p>';
    return '<p><strong>Pour finaliser</strong>, fais un virement de ' + montant + ' :</p>' +
      tableau_([['Titulaire', CONFIG.VIREMENT.TITULAIRE], ['IBAN', CONFIG.VIREMENT.IBAN], ['BIC', CONFIG.VIREMENT.BIC],
        ['Libellé', 'Adhésion ' + adh.ref + ' ' + esc_(adh.nom)]]) +
      '<p>Puis réponds à cet e-mail avec une capture de ton virement.</p>';
  }
  return '<p><strong>Pour finaliser</strong>, remets ton règlement de ' + montant + ' (chèque à l\'ordre de ' + CONFIG.ORDRE_CHEQUE + ', ou espèces) ' + CONFIG.REMISE_EN_MAIN_PROPRE + '.</p>';
}

// Déclencheur : le bureau modifie « Statut dossier » ou « Paiement » dans le tableau
function surModification(e) {
  const f = e.range.getSheet();
  if (f.getName() !== ONGLET) return;
  const cStatut = col_(f, COL.statut), cPaiement = col_(f, COL.etatPaiement);
  const c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
  const touche = (cStatut >= c1 && cStatut <= c2) || (cPaiement >= c1 && cPaiement <= c2);
  if (!touche) return;

  for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    if (r === 1) continue;
    const L = lireLigne_(f, r);
    if (!L[COL.email]) continue;
    const adh = adhDepuisLigne_(L);
    const statut = L[COL.statut], paiement = L[COL.etatPaiement], hist = String(L[COL.historique] || '');

    // Dossier incomplet : il faut une remarque pour savoir quoi demander
    if (cStatut >= c1 && cStatut <= c2 && statut === 'Incomplet') {
      const rq = String(L[COL.remarques] || '').trim();
      if (!rq) {
        e.source.toast('Écris d\'abord les pièces manquantes dans la colonne « ' + COL.remarques + ' », puis choisis à nouveau Incomplet.', 'E-mail non envoyé', 8);
        f.getRange(r, cStatut).setValue(e.oldValue || 'À vérifier');
        continue;
      }
      envoyer_(adh, 'incomplet', rq);
      journal_(f, r, 'Incomplet');
      continue;
    }

    // Dossier validé + paiement reçu : bienvenue (une seule fois)
    if (statut === 'Validé' && paiement === 'Reçu') {
      if (hist.indexOf('Bienvenue') === -1) { envoyer_(adh, 'bienvenue'); journal_(f, r, 'Bienvenue'); }
      continue;
    }

    // Paiement reçu, dossier pas encore validé
    if (cPaiement >= c1 && cPaiement <= c2 && paiement === 'Reçu' && hist.indexOf('Paiement reçu') === -1) {
      envoyer_(adh, 'paiement-recu');
      journal_(f, r, 'Paiement reçu');
    }
  }
}

// Déclencheur quotidien (9h) : relance unique si le paiement est toujours en attente
function relancesQuotidiennes() {
  const f = feuille_();
  const n = f.getLastRow();
  if (n < 2) return;
  const limite = new Date(Date.now() - CONFIG.RELANCE_APRES_JOURS * 24 * 3600 * 1000);
  for (let r = 2; r <= n; r++) {
    const L = lireLigne_(f, r);
    if (L[COL.etatPaiement] !== 'En attente' || L[COL.relance] || !L[COL.email]) continue;
    if (!(L[COL.date] instanceof Date) || L[COL.date] > limite) continue;
    envoyer_(adhDepuisLigne_(L), 'relance');
    f.getRange(r, col_(f, COL.relance)).setValue(new Date());
    journal_(f, r, 'Relance paiement');
  }
}


// ------------------------------------------------------------
// 5. TEST : simule un dossier envoyé par le site
// ------------------------------------------------------------
function testerUnDossier() {
  const faux = Utilities.base64Encode(Utilities.newBlob('%PDF-1.4\n% Document de test\n', 'application/pdf').getBytes());
  const doc = function (champ, libelle) { return { champ: champ, libelle: libelle, nom: champ + '.pdf', type: 'application/pdf', data: faux }; };
  const rep = doPost({ postData: { contents: JSON.stringify({
    prenom: 'Test', nom: 'Adhérente', email: CONFIG.EMAIL_BUREAU, telephone: '06 00 00 00 00',
    naissance: '1995-05-12', disciplines: ['Natation', 'Vélo'], tarif: 'annuel', paiement: 'cb', droit_image: 'oui',
    fichiers: [doc('dossier', 'Dossier d\'adhésion')],
  }) } });
  Logger.log(rep.getContent());
}


// ------------------------------------------------------------
// 6. OUTILS
// ------------------------------------------------------------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Installation incomplète : lance d\'abord la fonction « installer ».');
  return v;
}
function feuille_() { return SpreadsheetApp.openById(prop_('CLASSEUR_ID')).getSheetByName(ONGLET); }
function col_(f, titre) {
  const i = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0].indexOf(titre);
  if (i === -1) throw new Error('Colonne introuvable : ' + titre);
  return i + 1;
}
function lireLigne_(f, r) {
  const h = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0];
  const v = f.getRange(r, 1, 1, h.length).getValues()[0];
  const o = {}; h.forEach(function (t, i) { o[t] = v[i]; }); return o;
}
function adhDepuisLigne_(L) {
  const tarif = Object.keys(TARIFS).filter(function (k) { return TARIFS[k].libelle === L[COL.tarif]; })[0] || 'annuel';
  const paiement = Object.keys(PAIEMENTS).filter(function (k) { return PAIEMENTS[k] === L[COL.paiement]; })[0] || 'cb';
  return { ref: L[COL.ref], prenom: L[COL.prenom], nom: L[COL.nom], email: L[COL.email], tarif: tarif, paiement: paiement, preuve: L[COL.preuve] === 'Oui' };
}
function journal_(f, r, quoi) {
  const c = f.getRange(r, col_(f, COL.historique));
  const avant = String(c.getValue() || '');
  c.setValue((avant ? avant + '\n' : '') + horodatage_() + ' ' + quoi);
}
function nouvelleReference_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty('COMPTEUR') || 0) + 1;
    props.setProperty('COMPTEUR', String(n));
    return 'A' + CONFIG.SAISON.slice(2, 4) + '-' + ('000' + n).slice(-4);
  } finally { lock.releaseLock(); }
}
function age_(iso) {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return 0;
  const a = new Date();
  let age = a.getFullYear() - d.getFullYear();
  if (a.getMonth() < d.getMonth() || (a.getMonth() === d.getMonth() && a.getDate() < d.getDate())) age--;
  return age;
}
function horodatage_() { return Utilities.formatDate(new Date(), FUSEAU, 'dd/MM HH:mm'); }
function propre_(s) { return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function bouton_(url, texte) {
  return '<a href="' + url + '" style="display:inline-block;background:#3F5CF0;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:999px">' + texte + '</a>';
}
function tableau_(lignes) {
  return '<table style="border-collapse:collapse;width:100%;margin:12px 0 18px;font-size:15px">' +
    lignes.map(function (l) {
      return '<tr><td style="padding:8px 12px 8px 0;color:#5F5A7D;vertical-align:top;white-space:nowrap">' + l[0] +
        '</td><td style="padding:8px 0;font-weight:bold;vertical-align:top">' + l[1] + '</td></tr>';
    }).join('') + '</table>';
}
function gabarit_(titre, corps) {
  return '<div style="background:#F2EFFD;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#221C47;line-height:1.55">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden">' +
    '<div style="height:6px;background-color:#A46BE2;background-image:linear-gradient(90deg,#5170FF,#A46BE2,#F266C8)"></div>' +
    '<div style="padding:28px 28px 8px">' +
    '<img src="' + CONFIG.SITE + '/assets/img/logo-anotreplace-800.png" alt="Ànotreplace" width="170" style="display:block;border:0;margin-bottom:22px">' +
    '<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">' + titre + '</h1>' + corps + '</div>' +
    '<div style="padding:16px 28px 24px;font-size:13px;color:#5F5A7D;border-top:1px solid #E4DEF8">' +
    'Ànotreplace · collectif sportif 100% féminin · Angoulême<br>Une question ? Réponds simplement à cet e-mail.</div>' +
    '</div></div>';
}
