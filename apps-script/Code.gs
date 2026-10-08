/**
 * ============================================================
 *  Ànotreplace · Dossiers d'adhésion
 * ============================================================
 *  Ce script :
 *   1. reçoit les dossiers signés en ligne sur la page Adhésion du site ;
 *   2. fabrique le PDF du dossier signé (charte, règlement, droit à l'image,
 *      formulaire, signature) et le range dans Google Drive ;
 *   3. remplit le tableau de suivi « Adhésions » ;
 *   4. envoie le dossier à la boîte du collectif et une copie à l'adhérente ;
 *   5. note le mode de paiement choisi, puis envoie les e-mails automatiques.
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
    RIB_URL: 'https://anotreplace.github.io/assets/docs/rib-anotreplace.pdf', // le RIB est téléchargeable sur le site, jamais écrit dans les e-mails
  },
  TEXTES_URL: 'https://anotreplace.github.io/adhesion/textes/', // textes de la charte, du règlement et du droit à l'image, repris dans le PDF
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
};
const DISCIPLINES = ['Natation', 'Vélo', 'Running'];
const TAILLES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TYPES_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Tableau de suivi
const ONGLET = 'Adhésions';
const COL = {
  date: 'Date', ref: 'Référence', prenom: 'Prénom', nom: 'Nom', email: 'E-mail', tel: 'Téléphone',
  naissance: 'Date de naissance', adresse: 'Adresse', urgence: 'Contact d\'urgence', disciplines: 'Disciplines', tshirt: 'T-shirt',
  tarif: 'Tarif', montant: 'Montant',
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
    if (d.action === 'paiement') return json_(choixPaiement_(d));
    const probleme = valider_(d);
    if (probleme) return json_({ ok: false, erreur: probleme });
    return json_(Object.assign({ ok: true }, enregistrer_(d)));
  } catch (err) {
    console.error(err);
    try {
      MailApp.sendEmail(CONFIG.EMAIL_BUREAU, '[Site] Erreur lors de la réception d\'un dossier', String(err && err.stack || err));
    } catch (e2) { /* quota atteint */ }
    return json_({ ok: false, erreur: 'Une erreur est survenue de notre côté. Réessaie dans un instant, ou écris-nous à ' + CONFIG.EMAIL_BUREAU + '.' });
  }
}

function valider_(d) {
  const requis = ['prenom', 'nom', 'email', 'telephone', 'naissance', 'tarif', 'urgence_nom', 'urgence_lien', 'urgence_tel', 'fait_a'];
  for (let i = 0; i < requis.length; i++) {
    if (!d[requis[i]] || String(d[requis[i]]).trim() === '') return 'Merci de remplir tous les champs.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'Ton adresse e-mail ne semble pas valide.';
  if (!TARIFS[d.tarif]) return 'Tarif inconnu.';
  if (age_(d.naissance) < 18) return 'L\'adhésion est réservée aux femmes majeures.';
  if (d.charte !== true || d.reglement !== true) return 'La charte et le règlement intérieur doivent être acceptés.';
  if (d.droit_image !== 'oui' && d.droit_image !== 'non') return 'Indique ton choix pour le droit à l\'image.';
  if (d.droit_image === 'oui' && !String(d.adresse || '').trim()) return 'Ton adresse est demandée pour l\'autorisation de droit à l\'image.';
  const eng = d.engagements || {};
  if (!(eng.majeure && eng.statuts && eng.sante && eng.assurance && eng.donnees)) return 'Merci de cocher tous tes engagements.';
  if (d.lu_approuve !== true) return 'Coche « Lu et approuvé » pour signer ton dossier.';
  const sig = String(d.signature || '');
  if (sig.length < 200 || sig.length > 700000 || !/^[A-Za-z0-9+/=]+$/.test(sig)) return 'Ta signature est manquante. Signe dans le cadre, puis réessaie.';

  const fichiers = Array.isArray(d.fichiers) ? d.fichiers : [];
  if (d.tarif === 'solidaire' && !fichiers.some(function (f) { return f.champ === 'justificatif_tarif'; })) return 'Le tarif solidaire nécessite un justificatif.';
  for (let i = 0; i < fichiers.length; i++) {
    const f = fichiers[i];
    if (TYPES_ACCEPTES.indexOf(String(f.type).toLowerCase()) === -1) return 'Le fichier « ' + f.nom + ' » n\'est pas un PDF ou une image.';
    if (String(f.data || '').length * 0.75 > CONFIG.MAX_FICHIER_MO * 1024 * 1024) return 'Le fichier « ' + f.nom + ' » est trop lourd.';
  }
  return '';
}

function enregistrer_(d) {
  const reference = nouvelleReference_();
  const jeton = Utilities.getUuid();
  const prenom = propre_(d.prenom);
  const nom = propre_(d.nom).toUpperCase();
  const tarif = TARIFS[d.tarif];
  const signeLe = new Date();
  const disciplines = (d.disciplines || []).filter(function (x) { return DISCIPLINES.indexOf(x) !== -1; });
  const tshirt = TAILLES.indexOf(d.tshirt) !== -1 ? d.tshirt : '';
  const image = d.droit_image === 'oui';

  // Le PDF du dossier signé, et les pièces dans Drive
  const racine = DriveApp.getFolderById(prop_('DOSSIER_ID'));
  const dossier = racine.createFolder(reference + ' · ' + nom + ' ' + prenom);
  const pdf = pdfDossier_(d, { ref: reference, prenom: prenom, nom: nom, tarif: tarif, signeLe: signeLe, disciplines: disciplines, tshirt: tshirt })
    .setName(reference + ' · Dossier d\'adhésion signé · ' + nom + ' ' + prenom + '.pdf');
  dossier.createFile(pdf);
  dossier.createFile(Utilities.newBlob(Utilities.base64Decode(d.signature), 'image/png', reference + ' · Signature.png'));
  const blobs = [pdf];
  (d.fichiers || []).forEach(function (f) {
    const ext = f.type === 'application/pdf' ? 'pdf' : (String(f.nom).split('.').pop() || 'jpg').toLowerCase();
    const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, reference + ' · ' + propre_(f.libelle) + ' · ' + nom + ' ' + prenom + '.' + ext);
    dossier.createFile(blob);
    blobs.push(blob);
  });
  PropertiesService.getScriptProperties().setProperty('JETON_' + reference, jeton);

  // Ligne du tableau
  const feuille = feuille_();
  assurerColonnes_(feuille);
  const ligne = {};
  ligne[COL.date] = signeLe;
  ligne[COL.ref] = reference;
  ligne[COL.prenom] = prenom;
  ligne[COL.nom] = nom;
  ligne[COL.email] = String(d.email).trim().toLowerCase();
  ligne[COL.tel] = "'" + propre_(d.telephone);
  ligne[COL.naissance] = d.naissance;
  ligne[COL.adresse] = image ? propre_(d.adresse) : '';
  ligne[COL.urgence] = propre_(d.urgence_nom) + ' (' + propre_(d.urgence_lien) + ') ' + propre_(d.urgence_tel);
  ligne[COL.disciplines] = disciplines.join(', ');
  ligne[COL.tshirt] = tshirt;
  ligne[COL.tarif] = tarif.libelle;
  ligne[COL.montant] = tarif.montant;
  ligne[COL.paiement] = 'À choisir';
  ligne[COL.droitImage] = image ? 'Oui' : 'Non';
  ligne[COL.justifTarif] = d.tarif === 'solidaire' ? 'Oui' : '';
  ligne[COL.drive] = '=HYPERLINK("' + dossier.getUrl() + '";"Ouvrir")';
  ligne[COL.statut] = 'À vérifier';
  ligne[COL.etatPaiement] = 'En attente';
  ligne[COL.historique] = horodatage_() + ' Confirmation';
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  feuille.appendRow(entetes.map(function (h) { return ligne[h] !== undefined ? ligne[h] : ''; }));

  const adh = { ref: reference, prenom: prenom, nom: nom, email: ligne[COL.email], tarif: d.tarif, paiement: '' };

  // E-mail au bureau, avec le dossier signé
  const poids = blobs.reduce(function (s, b) { return s + b.getBytes().length; }, 0);
  const lignesRecap = [
    ['Adhérente', esc_(prenom + ' ' + nom)], ['E-mail', esc_(adh.email)], ['Téléphone', esc_(propre_(d.telephone))],
    ['Date de naissance', esc_(d.naissance)], ['Disciplines', esc_(ligne[COL.disciplines] || '—')], ['T-shirt', esc_(tshirt || '—')],
    ['Droit à l\'image', image ? 'Autorisé' : '<span style="color:#B4234F">Refusé : ne pas publier de photo d\'elle</span>'],
    ['Tarif', tarif.libelle + ' · ' + tarif.montant + '€' + (d.tarif === 'solidaire' ? ' (justificatif joint)' : '')],
    ['Signé le', Utilities.formatDate(signeLe, FUSEAU, 'dd/MM/yyyy à HH:mm') + ', à ' + esc_(propre_(d.fait_a))],
  ];
  MailApp.sendEmail({
    to: CONFIG.EMAIL_BUREAU,
    replyTo: adh.email,
    name: 'Site ' + CONFIG.NOM_EXPEDITEUR,
    subject: 'Nouveau dossier ' + reference + ' · ' + prenom + ' ' + nom + ' · ' + tarif.libelle,
    htmlBody: gabarit_('Nouveau dossier d\'adhésion', tableau_(lignesRecap) +
      '<p>Le dossier signé est en pièce jointe. Le mode de paiement choisi par l\'adhérente s\'affiche dans le tableau.</p>' +
      '<p style="margin-top:20px">' + bouton_(SpreadsheetApp.openById(prop_('CLASSEUR_ID')).getUrl(), 'Ouvrir le tableau de suivi') + '</p>' +
      '<p><a href="' + dossier.getUrl() + '">Voir les documents dans Drive</a></p>' +
      (poids > 18 * 1024 * 1024 ? '<p><em>Pièces jointes trop lourdes pour l\'e-mail : elles sont dans Drive.</em></p>' : '') +
      '<p style="color:#5F5A7D;font-size:13px">Pour valider : passe « Statut dossier » sur Validé et « Paiement » sur Reçu. L\'e-mail de bienvenue part automatiquement.</p>'),
    attachments: poids > 18 * 1024 * 1024 ? [] : blobs,
  });

  // E-mail de confirmation à l'adhérente, avec la copie de son dossier signé
  envoyer_(adh, 'confirmation', '', [pdf]);
  return { reference: reference, jeton: jeton };
}

// L'adhérente choisit son mode de paiement après l'envoi : on le note dans le tableau
function choixPaiement_(d) {
  const ref = String(d.reference || '');
  if (!/^A\d{2}-\d{4}$/.test(ref) || !PAIEMENTS[d.mode]) return { ok: false };
  const attendu = PropertiesService.getScriptProperties().getProperty('JETON_' + ref);
  if (!attendu || attendu !== d.jeton) return { ok: false };
  const f = feuille_();
  const refs = f.getRange(2, col_(f, COL.ref), Math.max(f.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < refs.length; i++) {
    if (refs[i][0] !== ref) continue;
    f.getRange(i + 2, col_(f, COL.paiement)).setValue(PAIEMENTS[d.mode]);
    journal_(f, i + 2, 'Choix : ' + PAIEMENTS[d.mode]);
    return { ok: true };
  }
  return { ok: false };
}

// Le PDF du dossier signé : textes acceptés (repris du site), formulaire, engagements, signature
function pdfDossier_(d, x) {
  const textes = textesDocuments_();
  const logo = logoBase64_();
  const quand = Utilities.formatDate(x.signeLe, FUSEAU, 'dd/MM/yyyy à HH:mm');
  const image = d.droit_image === 'oui';
  const qui = esc_(x.prenom + ' ' + x.nom);
  const eng = [
    'Je certifie être une femme majeure.',
    'J\'accepte les statuts de l\'association (disponibles sur simple demande), la charte et le règlement intérieur.',
    'J\'atteste que mon état de santé me permet de pratiquer les activités sportives du collectif.',
    'J\'ai été informée de l\'intérêt de souscrire une assurance individuelle accident couvrant les dommages corporels liés à ma pratique sportive.',
    'J\'accepte que mes informations soient conservées par l\'association pour gérer mon adhésion, pendant la durée de mon adhésion puis 3 ans au maximum.',
  ];

  // Couleurs de la charte graphique
  const BLEU = '#5170FF', VIOLET = '#A16BE3', ROSE = '#EE66C9', CREME = '#F6F4F0';
  const ENCRE = '#221C47', GRIS = '#5F5A7D', FILET = '#E4DEF8'; // texte courant et filets fins

  const filet = '<table class="filet"><tr><td style="background:' + BLEU + '"></td><td style="background:' + VIOLET + '"></td><td style="background:' + ROSE + '"></td></tr></table>';
  // En-tête du dossier : logo en dégradé, puis le filet bleu-violet-rose de la charte
  const entete = '<table class="entete"><tr>' +
    (logo ? '<td class="logo"><img src="data:image/png;base64,' + logo + '" alt="Ànotreplace"></td>' : '') +
    '<td class="titre"><p class="surtitre">Saison ' + CONFIG.SAISON + ' · Adhésion</p><p class="grand">Dossier d\'adhésion signé</p></td></tr></table>' + filet;
  // Titre d'un document, à la suite du précédent (sans changer de page)
  const titreDoc = function (surtitre, titre) {
    return '<div class="titre-doc"><p class="surtitre">' + surtitre + '</p><p class="grand">' + titre + '</p></div>' + filet;
  };
  const section = function (titre) { return '<h2><span class="coeur">&#9829;</span> ' + titre + '</h2>'; };
  const ligne = function (a, b) { return '<tr><td class="l">' + a + '</td><td class="v">' + b + '</td></tr>'; };
  const accepte = function (quoi) { return '<table class="ok"><tr><td><span class="coche">&#10004;</span> ' + quoi + ' par ' + qui + ' le ' + quand + '.</td></tr></table>'; };
  const pied = '<p class="pied">Ànotreplace · Trouver sa place. La construire ensemble. · ' + CONFIG.EMAIL_BUREAU + ' · Réf. ' + x.ref + '</p>';
  const doc = function (cle) {
    // Le titre du document est déjà dans le bandeau
    return '<div class="doc">' + (textes[cle] ? textes[cle].replace(/<h3>[\s\S]*?<\/h3>/, '') : '<p><em>Texte en vigueur publié sur ' + CONFIG.TEXTES_URL + ' le ' + quand + '.</em></p>') + '</div>';
  };

  const css = '<style>' +
    '@page{margin:14mm 14mm 16mm}' +
    'body{font-family:Helvetica,Arial,sans-serif;color:' + ENCRE + ';font-size:10.5pt;line-height:1.45;margin:0}' +
    'table{width:100%;border-collapse:collapse}' +
    '.entete{margin:0 0 8pt}.entete td{vertical-align:middle;padding:0 0 8pt}' +
    '.entete td.logo{width:118pt;padding-right:14pt}.entete img{width:112pt;height:auto}' +
    '.surtitre{margin:0;font-size:8.5pt;font-weight:bold;letter-spacing:1.5pt;text-transform:uppercase;color:' + ROSE + '}' +
    '.grand{margin:2pt 0 0;font-size:19pt;font-weight:bold;line-height:1.15;color:' + BLEU + '}' +
    '.titre-doc{margin:22pt 0 6pt}.titre-doc .grand{font-size:16pt}' +
    '.filet{margin:0 0 12pt}.filet td{height:4pt;padding:0;font-size:1pt}' +
    '.carte{background:' + CREME + ';margin:0 0 10pt}.carte td{padding:9pt 12pt;font-size:10pt}' +
    'h2{font-size:13pt;color:' + BLEU + ';margin:14pt 0 5pt}.coeur{color:' + ROSE + '}' +
    'h3{font-size:12pt;color:' + BLEU + ';margin:0 0 3pt}h4{font-size:11pt;color:' + VIOLET + ';margin:10pt 0 3pt}' +
    '.champs td{border-bottom:1px solid ' + FILET + ';padding:5pt 6pt;vertical-align:top;font-size:10pt}' +
    '.champs td.l{width:34%;color:' + GRIS + ';font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.6pt}' +
    '.champs td.v{font-weight:bold}' +
    '.eng td{padding:3pt 6pt;vertical-align:top;font-size:10pt}.eng td.c{width:14pt;color:' + VIOLET + ';font-weight:bold}' +
    '.ok{margin:10pt 0 4pt}.ok td{background:' + CREME + ';border-left:4pt solid ' + VIOLET + ';padding:8pt 10pt;font-weight:bold;font-size:10pt}' +
    '.non td{background:' + CREME + ';border-left:4pt solid ' + ROSE + ';padding:8pt 10pt;font-weight:bold;font-size:10pt}' +
    '.coche{color:' + VIOLET + '}' +
    '.sig td{background:' + CREME + ';padding:10pt 12pt;vertical-align:top;font-size:10pt}.sig img{width:200pt;height:auto}' +
    '.reserve td{border:1px dashed ' + VIOLET + ';padding:7pt 10pt;font-size:9pt;color:' + GRIS + '}' +
    '.doc .doc-sub{color:' + GRIS + ';font-size:9pt}.doc p{margin:0 0 6pt}.doc ul{margin:0 0 8pt}' +
    '.doc table{margin:4pt 0 10pt}.doc th{background:' + CREME + ';color:' + BLEU + ';text-align:left;padding:4pt 6pt;font-size:9.5pt;border:1px solid ' + FILET + '}' +
    '.doc td{padding:4pt 6pt;font-size:9.5pt;border:1px solid ' + FILET + ';vertical-align:top}' +
    '.pied{margin:22pt 0 0;padding-top:6pt;border-top:1px solid ' + FILET + ';font-size:8pt;color:' + GRIS + ';text-align:center}' +
    '</style>';

  const html = '<html><head><meta charset="utf-8">' + css + '</head><body>' +
    entete +
    '<table class="carte"><tr><td><strong>Référence ' + x.ref + '</strong> · ' + qui + ' · signé en ligne le ' + quand + ' (heure de Paris)</td></tr></table>' +
    section('Formulaire d\'adhésion') + '<table class="champs">' +
    ligne('Nom', esc_(x.nom)) + ligne('Prénom', esc_(x.prenom)) + ligne('Date de naissance', esc_(d.naissance)) +
    ligne('Téléphone', esc_(propre_(d.telephone))) + ligne('E-mail', esc_(String(d.email).trim())) +
    (image ? ligne('Adresse', esc_(propre_(d.adresse))) : '') +
    ligne('Personne à prévenir', esc_(propre_(d.urgence_nom) + ' (' + propre_(d.urgence_lien) + ') · ' + propre_(d.urgence_tel))) +
    ligne('Disciplines', esc_(x.disciplines.join(', ') || 'Non précisées')) + ligne('T-shirt', esc_(x.tshirt || 'Non précisé')) +
    ligne('Cotisation', x.tarif.libelle + ' · ' + x.tarif.montant + '€' + (d.tarif === 'solidaire' ? ' (justificatif joint)' : '')) +
    '</table>' +
    section('Engagements') + '<table class="eng">' + eng.map(function (t) { return '<tr><td class="c">&#10004;</td><td>' + t + '</td></tr>'; }).join('') + '</table>' +
    section('Documents') + '<table class="champs">' +
    ligne('Charte du collectif', 'Lue et acceptée') + ligne('Règlement intérieur', 'Lu et accepté') +
    ligne('Droit à l\'image', image ? 'Autorisation acceptée' : 'Autorisation refusée') + '</table>' +
    section('Signature') +
    '<table class="sig"><tr><td>Fait à <strong>' + esc_(propre_(d.fait_a)) + '</strong>, le ' + quand + '.<br>Mention : « Lu et approuvé ». Signé électroniquement par <strong>' + qui + '</strong>.<br>' +
    '<img src="data:image/png;base64,' + d.signature + '" alt="Signature"></td></tr></table>' +
    '<table class="reserve" style="margin-top:12pt"><tr><td><strong>Réservé à l\'association</strong> · Dossier reçu le ' + Utilities.formatDate(x.signeLe, FUSEAU, 'dd/MM/yyyy') +
    ' · Cotisation reçue le ……… · Adhésion validée le ………</td></tr></table>' +

    titreDoc('Document 1 sur 3', 'Charte du collectif') + doc('charte') + accepte('Charte lue et acceptée') +
    titreDoc('Document 2 sur 3', 'Règlement intérieur') + doc('reglement') + accepte('Règlement intérieur lu et accepté') +
    titreDoc('Document 3 sur 3 · Facultatif', 'Autorisation de droit à l\'image') +
    (image ? doc('image') + accepte('Autorisation de droit à l\'image acceptée, « bon pour autorisation »,') :
      '<table class="non"><tr><td>&#10008; Autorisation refusée par ' + qui + ' le ' + quand + ' : aucune image d\'elle ne doit être publiée.</td></tr></table>') + pied +
    '</body></html>';
  return Utilities.newBlob(html, 'text/html', 'dossier.html').getAs('application/pdf');
}

// Logo en dégradé de la charte, repris du site pour l'en-tête du PDF
function logoBase64_() {
  try {
    const rep = UrlFetchApp.fetch(CONFIG.SITE + '/assets/img/logo-anotreplace-2026.png', { muteHttpExceptions: true });
    return rep.getResponseCode() === 200 ? Utilities.base64Encode(rep.getBlob().getBytes()) : '';
  } catch (e) { console.error(e); return ''; }
}

// Textes officiels publiés sur le site (une seule source pour la page et le PDF)
function textesDocuments_() {
  const textes = {};
  try {
    const rep = UrlFetchApp.fetch(CONFIG.TEXTES_URL, { muteHttpExceptions: true });
    if (rep.getResponseCode() !== 200) return textes;
    const re = /<section data-doc="(\w+)">([\s\S]*?)<\/section>/g;
    let m;
    while ((m = re.exec(rep.getContentText('UTF-8'))) !== null) textes[m[1]] = m[2];
  } catch (e) { console.error(e); }
  return textes;
}

// Ajoute au tableau les colonnes apparues dans une nouvelle version du script
function assurerColonnes_(f) {
  const h = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0];
  const manque = ORDRE_COLONNES.filter(function (c) { return h.indexOf(c) === -1; });
  if (!manque.length) return;
  f.getRange(1, h.length + 1, 1, manque.length).setValues([manque])
    .setFontWeight('bold').setBackground('#221C47').setFontColor('#FFFFFF').setWrap(true);
}


// ------------------------------------------------------------
// 4. E-MAILS AUTOMATIQUES SELON LA SITUATION
// ------------------------------------------------------------
function envoyer_(adh, cas, remarques, pieces) {
  const t = TARIFS[adh.tarif] || TARIFS.annuel;
  const montant = t.montant + '€';
  let sujet, titre, corps;

  if (cas === 'confirmation') {
    sujet = 'Ton dossier d\'adhésion est bien reçu (réf. ' + adh.ref + ')';
    titre = 'Merci ' + esc_(adh.prenom) + ', ton dossier est bien arrivé !';
    corps = '<p>Ton dossier d\'adhésion à Ànotreplace pour la saison ' + CONFIG.SAISON + ' est entre nos mains. Tu trouveras en pièce jointe une copie de ton dossier signé.</p>' +
      tableau_([['Référence', adh.ref], ['Tarif', t.libelle + ' · ' + montant]]) +
      blocPaiement_(adh, montant, false) +
      (adh.tarif === 'solidaire' ? '<p>Ton justificatif de tarif solidaire sera vérifié par le bureau.</p>' : '') +
      '<p><strong>Et ensuite ?</strong> Le bureau vérifie ton dossier sous quelques jours. Dès que tout est en ordre, tu reçois un e-mail de bienvenue.</p>';

  } else if (cas === 'incomplet') {
    sujet = 'Ton dossier d\'adhésion : il manque un élément (réf. ' + adh.ref + ')';
    titre = 'Presque bon, ' + esc_(adh.prenom) + ' !';
    corps = '<p>On a regardé ton dossier avec attention. Il nous manque encore :</p>' +
      '<p style="background:#FFF4F7;border-radius:12px;padding:14px 16px;white-space:pre-line">' + esc_(remarques) + '</p>' +
      '<p>Réponds simplement à cet e-mail avec l\'élément demandé (un PDF ou une photo nette suffit).</p>';

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
    attachments: pieces || [],
  });
}

function blocPaiement_(adh, montant, relance) {
  const cb = '<p><strong>Par carte bancaire</strong> : règle ta cotisation de ' + montant + ' en ligne, en toute sécurité (choisis le tarif « ' + (TARIFS[adh.tarif] || TARIFS.annuel).libelle + ' »).</p>' +
    '<p>' + bouton_(CONFIG.HELLOASSO_URL, 'Payer ma cotisation sur HelloAsso') + '</p>';
  const virement = '<p><strong>Par virement</strong> : fais un virement de ' + montant + ' avec le RIB du collectif, à télécharger sur le site : ' +
    '<a href="' + CONFIG.VIREMENT.RIB_URL + '">' + CONFIG.VIREMENT.RIB_URL + '</a>.<br>Libellé du virement : <strong>Adhésion ' + adh.ref + ' ' + esc_(adh.nom) + '</strong>. ' +
    'Si tu peux, réponds à cet e-mail avec une capture de ton virement.</p>';
  const intro = '<p><strong>' + (relance ? 'Pour régler' : 'Dernière étape') + ' :</strong> ' + (adh.paiement ? 'ta cotisation, comme tu l\'as choisi.' : 'ta cotisation, au choix.') + '</p>';
  if (adh.paiement === 'cb') return intro + cb;
  if (adh.paiement === 'virement') return intro + virement;
  return intro + cb + virement + (relance ? '' : '<p>Tu as déjà réglé sur la page du site ? Alors tout est bon, rien d\'autre à faire.</p>');
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
  const signature = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAAAjW/WRAAABU0lEQVR42u3dsZHCMBCGUbYPIpqhZpq56PrgIjK4kWcQSPu/FxJa/ljJzJjTCQAAAAAAAAAAAADgIy7n6/1yvt5dCUZUUhjPPv/5vZXbgNhARqaFSIgL5FkYjxBME2ID+S+M0ckiFNoFMhqGswmPdR9Z40oNQyiZURxd20oPw7Yr9yFNy0BmhGGa5Dy1PLqGJQyhiGLjQL4Rhm1X/63T9oF8OwzTJDeKpQNZLQyh5EWxZCCrh2Hbtf95YstAdgrDNMmIYolAdg5DKDlTuIRh2+UaLRBI1zBMk95fHCUMoaScJ5YKJDWMxG1XtyimBiKMjGmSEn8JQyiimBiIMHrfZOlP50oYpknKeeIjgQijXyiieEMgwui1jfHD5sRAXMA9p4koJgfiIu4Xiii89se2y3lCIEJ5faOLQiBCOfBGekEIRCSiAP9xAgAAAAAAAAAAANDaH/VkSj9ZQZFeAAAAAElFTkSuQmCC'; // un trait, au format PNG
  const rep = doPost({ postData: { contents: JSON.stringify({
    action: 'dossier', prenom: 'Test', nom: 'Adhérente', email: CONFIG.EMAIL_BUREAU, telephone: '06 00 00 00 00',
    naissance: '1995-05-12', adresse: '1 rue du Test, 16000 Angoulême',
    urgence_nom: 'Camille Test', urgence_lien: 'Sœur', urgence_tel: '06 11 11 11 11',
    disciplines: ['Natation', 'Vélo'], tshirt: 'M', tarif: 'annuel', droit_image: 'oui',
    charte: true, reglement: true, engagements: { majeure: true, statuts: true, sante: true, assurance: true, donnees: true },
    fait_a: 'Angoulême', lu_approuve: true, signature: signature, fichiers: [],
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
  const paiement = Object.keys(PAIEMENTS).filter(function (k) { return PAIEMENTS[k] === L[COL.paiement]; })[0] || '';
  return { ref: L[COL.ref], prenom: L[COL.prenom], nom: L[COL.nom], email: L[COL.email], tarif: tarif, paiement: paiement };
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
  return '<div style="background:#F6F4F0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#221C47;line-height:1.55">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden">' +
    '<div style="height:6px;background-color:#A16BE3;background-image:linear-gradient(90deg,#5170FF,#A16BE3,#EE66C9)"></div>' +
    '<div style="padding:28px 28px 8px">' +
    '<img src="' + CONFIG.SITE + '/assets/img/logo-anotreplace-2026.png" alt="Ànotreplace" width="130" style="display:block;border:0;margin-bottom:22px">' +
    '<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">' + titre + '</h1>' + corps + '</div>' +
    '<div style="padding:16px 28px 24px;font-size:13px;color:#5F5A7D;border-top:1px solid #E4DEF8">' +
    'Ànotreplace · collectif sportif 100% féminin · Angoulême<br>Une question ? Réponds simplement à cet e-mail.</div>' +
    '</div></div>';
}
