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
const ENGAGEMENTS = [
  'Je certifie être une femme majeure.',
  'J\'ai lu et j\'accepte les statuts, la charte et le règlement intérieur de l\'association (statuts téléchargeables sur le site de l\'association).',
  'J\'atteste que mon état de santé me permet de pratiquer les activités sportives du collectif.',
  'J\'ai été informée de l\'intérêt de souscrire une assurance individuelle accident couvrant les dommages corporels liés à ma pratique sportive.',
  'J\'ai pris connaissance de l\'utilisation de mes données : elles servent à gérer mon adhésion, à organiser les activités et à communiquer avec moi. Seuls les membres du bureau y ont accès. Elles sont conservées pendant la durée de mon adhésion, puis 3 ans au maximum.',
];
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
    return json_(Object.assign({ ok: true }, mettreEnAttente_(d)));
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

function enregistrer_(d, reference, recuLe) {
  const prenom = propre_(d.prenom);
  const nom = propre_(d.nom).toUpperCase();
  const tarif = TARIFS[d.tarif];
  const signeLe = recuLe ? new Date(recuLe) : new Date();
  const disciplines = (d.disciplines || []).filter(function (x) { return DISCIPLINES.indexOf(x) !== -1; });
  const tshirt = TAILLES.indexOf(d.tshirt) !== -1 ? d.tshirt : '';
  const image = d.droit_image === 'oui';

  // Le PDF du dossier signé, et les pièces dans Drive
  const racine = DriveApp.getFolderById(prop_('DOSSIER_ID'));
  const dossier = racine.createFolder(reference + ' · ' + nom + ' ' + prenom);
  const pdf = pdfDossierSigne_(d, { ref: reference, prenom: prenom, nom: nom, tarif: tarif, signeLe: signeLe, disciplines: disciplines, tshirt: tshirt })
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
  const props = PropertiesService.getScriptProperties();
  const choix = props.getProperty('PAIEMENT_' + reference) || '';
  if (choix) props.deleteProperty('PAIEMENT_' + reference);
  ligne[COL.paiement] = PAIEMENTS[choix] || 'À choisir';
  ligne[COL.droitImage] = image ? 'Oui' : 'Non';
  ligne[COL.justifTarif] = d.tarif === 'solidaire' ? 'Oui' : '';
  ligne[COL.drive] = '=HYPERLINK("' + dossier.getUrl() + '";"Ouvrir")';
  ligne[COL.statut] = 'À vérifier';
  ligne[COL.etatPaiement] = 'En attente';
  ligne[COL.historique] = horodatage_() + ' Confirmation' + (choix ? '\n' + horodatage_() + ' Choix : ' + PAIEMENTS[choix] : '');
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  feuille.appendRow(entetes.map(function (h) { return ligne[h] !== undefined ? ligne[h] : ''; }));

  const adh = { ref: reference, prenom: prenom, nom: nom, email: ligne[COL.email], tarif: d.tarif, paiement: PAIEMENTS[choix] ? choix : '' };

  // E-mail au bureau, avec le dossier signé
  const poids = blobs.reduce(function (s, b) { return s + b.getBytes().length; }, 0);
  const lignesRecap = [
    ['Adhérente', esc_(prenom + ' ' + nom)], ['E-mail', esc_(adh.email)], ['Téléphone', esc_(propre_(d.telephone))],
    ['Date de naissance', esc_(d.naissance)], ['Disciplines', esc_(ligne[COL.disciplines] || '—')],
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
  return reference;
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
  // Dossier encore en cours de traitement : le choix sera reporté dans le tableau
  PropertiesService.getScriptProperties().setProperty('PAIEMENT_' + ref, d.mode);
  return { ok: true };
}

// ------------------------------------------------------------
// FILE D'ATTENTE : le site reçoit sa réponse tout de suite,
// le PDF, le tableau et les e-mails sont préparés juste après, en arrière-plan.
// ------------------------------------------------------------
function dossierAttente_() {
  const props = PropertiesService.getScriptProperties();
  try { return DriveApp.getFolderById(props.getProperty('ATTENTE_ID')); } catch (e) { /* à créer */ }
  const dossier = DriveApp.getFolderById(prop_('DOSSIER_ID')).createFolder('File d\'attente (ne pas modifier)');
  props.setProperty('ATTENTE_ID', dossier.getId());
  return dossier;
}

function mettreEnAttente_(d) {
  const reference = nouvelleReference_();
  const jeton = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('JETON_' + reference, jeton);
  const contenu = JSON.stringify({ ref: reference, recuLe: new Date().toISOString(), d: d });
  try {
    dossierAttente_().createFile(reference + '.json', contenu, 'application/json');
    planifierTraitement_();
  } catch (err) {
    // Si la file d'attente n'est pas disponible, on traite tout de suite comme avant
    console.error(err);
    enregistrer_(d, reference, new Date());
  }
  return { reference: reference, jeton: jeton };
}

function planifierTraitement_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DECLENCHEUR_ATTENTE');
  const existe = id && ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === id; });
  if (existe) return;
  const t = ScriptApp.newTrigger('traiterDossiersEnAttente').timeBased().after(1000).create();
  props.setProperty('DECLENCHEUR_ATTENTE', t.getUniqueId());
}

// Lancé automatiquement quelques secondes après chaque envoi
function traiterDossiersEnAttente() {
  const props = PropertiesService.getScriptProperties();
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(5000)) return;
  try {
    const id = props.getProperty('DECLENCHEUR_ATTENTE');
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t); });
    props.deleteProperty('DECLENCHEUR_ATTENTE');
    const fichiers = dossierAttente_().getFiles();
    while (fichiers.hasNext()) {
      const f = fichiers.next();
      if (!/\.json$/.test(f.getName())) continue;
      const e = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      try {
        enregistrer_(e.d, e.ref, e.recuLe);
        f.setTrashed(true);
      } catch (err) {
        console.error(err);
        f.setName('ERREUR · ' + f.getName());
        MailApp.sendEmail(CONFIG.EMAIL_BUREAU, '[Site] Dossier ' + e.ref + ' à traiter à la main',
          'Le dossier ' + e.ref + ' (' + e.d.prenom + ' ' + e.d.nom + ', ' + e.d.email + ') n\'a pas pu être traité automatiquement.\n' +
          'Ses données sont conservées dans le dossier Drive « File d\'attente ».\n\n' + String(err && err.stack || err));
      }
    }
  } finally {
    verrou.releaseLock();
  }
}

// Le PDF du dossier signé : textes acceptés (repris du site), formulaire, engagements, signature
function pdfDossier_(d, x) {
  const textes = textesDocuments_();
  const logo = logoBase64_();
  const quand = Utilities.formatDate(x.signeLe, FUSEAU, 'dd/MM/yyyy à HH:mm');
  const image = d.droit_image === 'oui';
  const qui = esc_(x.prenom + ' ' + x.nom);

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
    ligne('Disciplines', esc_(x.disciplines.join(', ') || 'Non précisées')) + (x.tshirt ? ligne('T-shirt', esc_(x.tshirt)) : '') +
    ligne('Cotisation', x.tarif.libelle + ' · ' + x.tarif.montant + '€' + (d.tarif === 'solidaire' ? ' (justificatif joint)' : '')) +
    '</table>' +
    section('Engagements') + '<table class="eng">' + ENGAGEMENTS.map(function (t) { return '<tr><td class="c">&#10004;</td><td>' + t + '</td></tr>'; }).join('') + '</table>' +
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

// ------------------------------------------------------------
// PDF du dossier signé, mis en page avec Google Docs : en-tête et pied de page
// sur chaque page, polices et couleurs de la charte graphique.
// En cas de souci, on revient à la version simple (pdfDossier_), pour ne jamais bloquer une adhésion.
// ------------------------------------------------------------
const CHARTE = {
  ENCRE: '#221C47', GRIS: '#5F5A7D', BLEU: '#5170FF', VIOLET: '#A16BE3', ROSE: '#EE66C9', CREME: '#F6F4F0', FILET: '#E4DEF8',
  TITRE: 'League Spartan', TEXTE: 'Josefin Sans',
  LARGEUR: 483, // largeur utile d'une page A4 avec des marges de 56 pt
};

function pdfDossierSigne_(d, x) {
  try { return pdfDossierDocs_(d, x); } catch (err) {
    console.error(err);
    return pdfDossier_(d, x);
  }
}

function imagesPdf_() {
  const base = CONFIG.SITE + '/assets/img/pdf/';
  const noms = ['bandeau-dossier', 'filet', 'trait-titre', 'logo-pied', 'monogramme', 'pastille-1', 'pastille-2', 'pastille-3', 'pastille-4', 'pastille-5', 'pastille-6'];
  const reps = UrlFetchApp.fetchAll(noms.map(function (n) { return { url: base + n + '.png', muteHttpExceptions: true }; }));
  const img = {};
  noms.forEach(function (n, i) { if (reps[i].getResponseCode() === 200) img[n] = reps[i].getBlob(); });
  return img;
}

function pdfDossierDocs_(d, x) {
  const C = CHARTE, A = DocumentApp.Attribute;
  const img = imagesPdf_();
  const textes = textesDocuments_();
  const quand = Utilities.formatDate(x.signeLe, FUSEAU, 'dd/MM/yyyy à HH:mm');
  const image = d.droit_image === 'oui';
  const qui = x.prenom + ' ' + x.nom;

  // Le document part du modèle (en-tête et pied de page avec numéros de page) s'il existe
  const nomDoc = x.ref + ' · dossier en cours de mise en page';
  let doc = null, id = null;
  const modele = PropertiesService.getScriptProperties().getProperty('MODELE_PDF_ID');
  if (modele) {
    try {
      id = DriveApp.getFileById(modele).makeCopy(nomDoc).getId();
      doc = DocumentApp.openById(id);
      doc.getHeader().replaceText('\\{\\{REF\\}\\}', x.ref);
    } catch (e) {
      console.error(e);
      if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) { /* rien */ } }
      doc = null; id = null;
    }
  }
  if (!doc) {
    doc = DocumentApp.create(nomDoc);
    id = doc.getId();
  }
  try {
    const body = doc.getBody();
    body.setMarginTop(50).setMarginBottom(46).setMarginLeft(56).setMarginRight(56);
    const outils = outilsDocs_();
    const style = outils.style, para = outils.para, image_ = outils.image, cellule = outils.cellule;
    if (!modele || !doc.getHeader()) enteteEtPied_(doc, img, x.ref, false);

    // Blocs réutilisables
    const titreDoc = function (surtitre, titre, avant) {
      para(body, titre, { police: C.TITRE, taille: 28, gras: true, avant: avant || 0, apres: 4, interligne: 1 });
      para(body, surtitre.toUpperCase(), { taille: 8.5, gras: true, couleur: C.VIOLET, apres: 8, interligne: 1 });
      const t = para(body, '', { apres: 18, interligne: 1 });
      image_(t, img['trait-titre'], 48);
    };
    const titreSection = function (texte) {
      para(body, texte, { police: C.TITRE, taille: 15, gras: true, avant: 22, apres: 9 });
    };
    const tableau = function (lignes, entete_) {
      const t = body.appendTable(lignes);
      t.setBorderColor(C.FILET).setBorderWidth(0.75);
      for (let r = 0; r < t.getNumRows(); r++) {
        const row = t.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          const premiereCol = c === 0 && !entete_ && row.getNumCells() === 2;
          const enTete = entete_ && r === 0;
          cellule(row.getCell(c), {
            taille: premiereCol ? 7.5 : 10, gras: enTete || !premiereCol && !entete_,
            couleur: premiereCol ? C.GRIS : C.ENCRE, fond: enTete ? C.CREME : null,
          });
        }
      }
      if (!entete_ && t.getRow(0).getNumCells() === 2) t.setColumnWidth(0, 165);
      body.appendParagraph('').setSpacingAfter(6);
      return t;
    };
    const encadre = function (texte, couleurCoche) {
      const t = body.appendTable([[texte]]);
      t.setBorderWidth(0);
      cellule(t.getCell(0, 0), { fond: C.CREME, gras: true, taille: 10, ph: 12, pl: 14 });
      const tx = t.getCell(0, 0).getChild(0).asParagraph().editAsText();
      tx.setForegroundColor(0, 0, couleurCoche || C.VIOLET);
      body.appendParagraph('').setSpacingAfter(6);
    };

    // ---------- Couverture et formulaire ----------
    const pb = body.getParagraphs()[0] || body.appendParagraph('');
    image_(pb, img['bandeau-dossier'], C.LARGEUR);
    pb.setSpacingAfter(28).setLineSpacing(1);
    titreDoc('Ànotreplace  •  Saison ' + CONFIG.SAISON + '  •  Référence ' + x.ref, 'Dossier d\'adhésion signé');
    para(body, 'Signé en ligne par ' + qui + ' le ' + quand + ' (heure de Paris).', { couleur: C.GRIS, apres: 4 });

    titreSection('Formulaire d\'adhésion');
    const lignes = [['NOM', x.nom], ['PRÉNOM', x.prenom], ['DATE DE NAISSANCE', String(d.naissance)],
      ['TÉLÉPHONE', propre_(d.telephone)], ['E-MAIL', String(d.email).trim()]];
    if (image) lignes.push(['ADRESSE', propre_(d.adresse)]);
    lignes.push(['PERSONNE À PRÉVENIR', propre_(d.urgence_nom) + ' (' + propre_(d.urgence_lien) + ') · ' + propre_(d.urgence_tel)],
      ['DISCIPLINES', x.disciplines.join(', ') || 'Non précisées'],
      ['COTISATION', x.tarif.libelle + ' · ' + x.tarif.montant + '€' + (d.tarif === 'solidaire' ? ' (justificatif joint)' : '')]);
    if (x.tshirt) lignes.splice(lignes.length - 1, 0, ['T-SHIRT', x.tshirt]);
    tableau(lignes);

    titreSection('Engagements');
    ENGAGEMENTS.forEach(function (t) {
      const p = para(body, '✔\t' + t, { taille: 10, apres: 7 });
      p.editAsText().setForegroundColor(0, 0, C.VIOLET).setBold(0, 0, true);
      p.setIndentStart(20).setIndentFirstLine(0);
    });

    titreSection('Documents');
    tableau([['CHARTE DU COLLECTIF', 'Lue et acceptée'], ['RÈGLEMENT INTÉRIEUR', 'Lu et accepté'],
      ['DROIT À L\'IMAGE', image ? 'Autorisation acceptée' : 'Autorisation refusée']]);

    titreSection('Signature');
    const ts = body.appendTable([['Fait à ' + propre_(d.fait_a) + ', le ' + quand + ' (heure de Paris).']]);
    ts.setBorderWidth(0);
    const cs = ts.getCell(0, 0);
    cs.appendParagraph('Mention : « Lu et approuvé ». Signé électroniquement par ' + qui + '.');
    const psig = cs.appendParagraph('');
    image_(psig, Utilities.newBlob(Utilities.base64Decode(d.signature), 'image/png', 'signature.png'), 170);
    cellule(cs, { fond: C.CREME, taille: 10, ph: 14, pl: 16, entre: 4 });
    body.appendParagraph('').setSpacingAfter(10);

    const tr = body.appendTable([['Réservé à l\'association  ·  Dossier reçu le ' + Utilities.formatDate(x.signeLe, FUSEAU, 'dd/MM/yyyy') +
      '  ·  Cotisation reçue le ………  ·  Adhésion validée le ………']]);
    tr.setBorderColor(C.VIOLET).setBorderWidth(0.75);
    cellule(tr.getCell(0, 0), { taille: 8, couleur: C.GRIS, ph: 9, pl: 12 });

    // ---------- Les documents acceptés, à la suite ----------
    const docs = [
      ['charte', 'Document 1 sur 3  •  Charte du collectif', 'Charte du collectif', 'Charte lue et acceptée'],
      ['reglement', 'Document 2 sur 3  •  Règlement intérieur', 'Règlement intérieur', 'Règlement intérieur lu et accepté'],
      ['image', 'Document 3 sur 3  •  Facultatif', 'Autorisation de droit à l\'image', 'Autorisation de droit à l\'image acceptée, « bon pour autorisation »,'],
    ];
    docs.forEach(function (x2) {
      body.appendPageBreak();
      titreDoc(x2[1], x2[2], 0);
      if (x2[0] === 'image' && !image) {
        encadre('✘  Autorisation refusée par ' + qui + ' le ' + quand + ' : aucune image d\'elle ne doit être publiée.', C.ROSE);
        return;
      }
      if (textes[x2[0]]) ajouterHtml_(body, textes[x2[0]], { para: para, tableau: tableau, image: image_, img: img, style: style });
      else para(body, 'Texte en vigueur publié sur ' + CONFIG.TEXTES_URL + ' le ' + quand + '.', { italique: true, couleur: C.GRIS });
      encadre('✔  ' + x2[3] + ' par ' + qui + ' le ' + quand + '.');
    });

    doc.saveAndClose();
    return DriveApp.getFileById(id).getAs('application/pdf');
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* déjà supprimé */ }
  }
}

// Styles et petits outils de mise en page Google Docs
function outilsDocs_() {
  const C = CHARTE, A = DocumentApp.Attribute;
  const style = function (o) {
    const s = {};
    s[A.FONT_FAMILY] = o.police || C.TEXTE; s[A.FONT_SIZE] = o.taille || 10.5;
    s[A.FOREGROUND_COLOR] = o.couleur || C.ENCRE; s[A.BOLD] = !!o.gras; s[A.ITALIC] = !!o.italique;
    return s;
  };
  const para = function (zone, texte, o) {
    o = o || {};
    const p = zone.appendParagraph(texte);
    p.setAttributes(style(o));
    p.setSpacingBefore(o.avant || 0).setSpacingAfter(o.apres === undefined ? 7 : o.apres).setLineSpacing(o.interligne || 1.35);
    if (o.align) p.setAlignment(o.align);
    return p;
  };
  const image = function (p, blob, largeur) {
    if (!blob) return null;
    const im = p.appendInlineImage(blob);
    const px = Math.round(largeur * 4 / 3); // Google Docs mesure les images en pixels
    const k = px / im.getWidth();
    im.setWidth(px).setHeight(Math.round(im.getHeight() * k));
    return im;
  };
  const cellule = function (c, o) {
    c.setPaddingTop(o.ph || 7).setPaddingBottom(o.ph || 7).setPaddingLeft(o.pl || 10).setPaddingRight(o.pl || 10);
    if (o.fond) c.setBackgroundColor(o.fond);
    for (let i = 0; i < c.getNumChildren(); i++) {
      const el = c.getChild(i);
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH) el.asParagraph().setAttributes(style(o)).setSpacingAfter(o.entre || 0).setLineSpacing(1.25);
    }
  };
  return { style: style, para: para, image: image, cellule: cellule };
}

// En-tête (filet en dégradé, rappel du dossier) et pied de page (logo, devise, n° de page, monogramme)
function enteteEtPied_(doc, img, ref, pourModele) {
  const C = CHARTE, o = outilsDocs_();
  const entete = doc.addHeader();
  const pf = entete.getParagraphs()[0] || entete.appendParagraph('');
  o.image(pf, img['filet'], C.LARGEUR);
  pf.setSpacingAfter(6).setLineSpacing(1);
  o.para(entete, 'DOSSIER D\'ADHÉSION SIGNÉ  •  SAISON ' + CONFIG.SAISON + '  •  RÉF. ' + ref, { taille: 7, couleur: C.GRIS, gras: true, align: DocumentApp.HorizontalAlignment.RIGHT, apres: 14, interligne: 1 });

  const pied = doc.addFooter();
  const tp = pied.appendTable([['', '', '']]);
  tp.setBorderWidth(0);
  tp.setColumnWidth(0, 80).setColumnWidth(2, 90);
  o.image(tp.getCell(0, 0).getChild(0).asParagraph(), img['logo-pied'], 62);
  tp.getCell(0, 1).getChild(0).asParagraph().setText('Trouver sa place. La construire ensemble.');
  tp.getCell(0, 1).appendParagraph(CONFIG.EMAIL_BUREAU);
  o.cellule(tp.getCell(0, 0), { ph: 2 });
  o.cellule(tp.getCell(0, 1), { ph: 4, taille: 7.5, couleur: C.GRIS, italique: true });
  tp.getCell(0, 1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  tp.getCell(0, 1).getChild(1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER).setAttributes(o.style({ taille: 7.5, couleur: C.GRIS }));
  const l2 = tp.getCell(0, 2).getChild(0).asParagraph();
  // Dans le modèle, « N » et « T » sont à remplacer une fois par les champs Numéro de page et Nombre de pages
  if (pourModele) l2.setText('N / T    ');
  o.image(l2, img['monogramme'], 22);
  l2.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  o.cellule(tp.getCell(0, 2), { ph: 2, taille: 8, couleur: C.ENCRE, gras: true });
}

// À lancer une fois : crée le modèle Google Docs du dossier signé (voir LISEZ-MOI)
function creerModelePdf() {
  const img = imagesPdf_();
  const doc = DocumentApp.create('Ànotreplace · Modèle du dossier signé (ne pas supprimer)');
  doc.getBody().setMarginTop(50).setMarginBottom(46).setMarginLeft(56).setMarginRight(56);
  enteteEtPied_(doc, img, '{{REF}}', true);
  doc.saveAndClose();
  const fichier = DriveApp.getFileById(doc.getId());
  try { fichier.moveTo(DriveApp.getFolderById(prop_('DOSSIER_ID'))); } catch (e) { /* reste à la racine du Drive */ }
  PropertiesService.getScriptProperties().setProperty('MODELE_PDF_ID', doc.getId());
  Logger.log('Modèle créé : ' + doc.getUrl());
  Logger.log('Ouvre-le, puis dans le pied de page : remplace « N » par Insertion > Numéros de page > Numéro de page, et « T » par Insertion > Numéros de page > Nombre de pages.');
}

// Convertit le texte HTML d'un document du site (h3, h4, p, ul, table) en éléments Google Docs
function ajouterHtml_(body, html, outils) {
  const C = CHARTE;
  const racine = XmlService.parse('<racine>' + html.replace(/&nbsp;/g, ' ') + '</racine>').getRootElement();
  const texteDe = function (el) { return el.getValue().replace(/\s+/g, ' ').trim(); };
  racine.getChildren().forEach(function (el) {
    const nom = el.getName();
    if (nom === 'h3') return; // le titre est déjà affiché
    if (nom === 'p') {
      const sous = el.getAttribute('class') && el.getAttribute('class').getValue() === 'doc-sub';
      // Repère les passages en gras (<strong>) pour les reproduire
      const morceaux = [];
      el.getAllContent().forEach(function (c) {
        if (c.getType() === XmlService.ContentTypes.TEXT) morceaux.push({ t: c.getValue(), g: false });
        else if (c.getType() === XmlService.ContentTypes.ELEMENT) morceaux.push({ t: c.asElement().getValue(), g: c.asElement().getName() === 'strong' });
      });
      const texte = morceaux.map(function (m) { return m.t; }).join('').replace(/\s+/g, ' ').trim();
      if (!texte) return;
      const p = outils.para(body, texte, sous ? { taille: 8.5, couleur: C.GRIS, apres: 12 } : { taille: 10, apres: 8 });
      let pos = 0;
      morceaux.forEach(function (m) {
        const t = m.t.replace(/\s+/g, ' ');
        const i = texte.indexOf(t.trim(), pos);
        if (i === -1 || !t.trim()) return;
        if (m.g) p.editAsText().setBold(i, i + t.trim().length - 1, true);
        pos = i + t.trim().length;
      });
      return;
    }
    if (nom === 'h4') {
      const t = texteDe(el);
      const num = t.match(/^(\d)\.\s+(.*)$/);
      if (num && outils.img['pastille-' + num[1]]) {
        const p = outils.para(body, '   ' + num[2], { police: C.TITRE, taille: 13.5, gras: true, avant: 18, apres: 7 });
        const im = p.insertInlineImage(0, outils.img['pastille-' + num[1]]);
        im.setWidth(24).setHeight(24);
      } else {
        outils.para(body, t, { police: C.TITRE, taille: 13, gras: true, avant: 18, apres: 7 });
      }
      return;
    }
    if (nom === 'ul') {
      el.getChildren('li').forEach(function (li) {
        const item = body.appendListItem(texteDe(li));
        item.setGlyphType(DocumentApp.GlyphType.BULLET);
        item.setAttributes(outils.style({ taille: 10 }));
        item.setSpacingAfter(4).setLineSpacing(1.3);
      });
      return;
    }
    if (nom === 'table') {
      const lignes = [];
      el.getDescendants().forEach(function (c) {
        if (c.getType() !== XmlService.ContentTypes.ELEMENT || c.asElement().getName() !== 'tr') return;
        lignes.push(c.asElement().getChildren().map(texteDe));
      });
      if (lignes.length) outils.tableau(lignes, true);
      return;
    }
    const t = texteDe(el);
    if (t) outils.para(body, t, { taille: 10 });
  });
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
    disciplines: ['Natation', 'Vélo'], tarif: 'annuel', droit_image: 'oui',
    charte: true, reglement: true, engagements: { majeure: true, statuts: true, sante: true, assurance: true, donnees: true },
    fait_a: 'Angoulême', lu_approuve: true, signature: signature, fichiers: [],
  }) } });
  Logger.log(rep.getContent());
  traiterDossiersEnAttente(); // le test traite le dossier tout de suite, sans attendre
}


// ------------------------------------------------------------
// 6. OUTILS
// ------------------------------------------------------------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function prop_(k) {
  let v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v && (k === 'DOSSIER_ID' || k === 'CLASSEUR_ID')) { retrouverReglages(); v = PropertiesService.getScriptProperties().getProperty(k); }
  if (!v) throw new Error('Installation incomplète : le dossier « Ànotreplace · Adhésions ' + CONFIG.SAISON + ' » ou le tableau de suivi est introuvable sur ce compte Google (' + Session.getEffectiveUser().getEmail() + ').');
  return v;
}

// Retrouve le dossier Drive, le tableau de suivi et le modèle du PDF par leur nom,
// et reprend la numérotation des références là où elle s'est arrêtée.
// Utile si le code a été collé dans un autre projet ou une copie : on peut aussi la lancer à la main.
function retrouverReglages() {
  const props = PropertiesService.getScriptProperties();
  const trouve = function (it) { return it.hasNext() ? it.next() : null; };
  if (!props.getProperty('DOSSIER_ID')) {
    const d = trouve(DriveApp.getFoldersByName('Ànotreplace · Adhésions ' + CONFIG.SAISON));
    if (d) props.setProperty('DOSSIER_ID', d.getId());
  }
  if (!props.getProperty('CLASSEUR_ID')) {
    const c = trouve(DriveApp.getFilesByName('Ànotreplace · Suivi des adhésions ' + CONFIG.SAISON));
    if (c) props.setProperty('CLASSEUR_ID', c.getId());
  }
  if (!props.getProperty('MODELE_PDF_ID')) {
    const m = trouve(DriveApp.getFilesByName('Ànotreplace · Modèle du dossier signé (ne pas supprimer)'));
    if (m) props.setProperty('MODELE_PDF_ID', m.getId());
  }
  if (!props.getProperty('COMPTEUR') && props.getProperty('CLASSEUR_ID')) {
    const f = SpreadsheetApp.openById(props.getProperty('CLASSEUR_ID')).getSheetByName(ONGLET);
    let max = 0;
    if (f && f.getLastRow() > 1) {
      f.getRange(2, col_(f, COL.ref), f.getLastRow() - 1, 1).getValues().forEach(function (l) {
        const m = String(l[0]).match(/-(\d+)$/);
        if (m) max = Math.max(max, Number(m[1]));
      });
    }
    props.setProperty('COMPTEUR', String(max));
  }
  Logger.log('Compte : ' + Session.getEffectiveUser().getEmail());
  ['DOSSIER_ID', 'CLASSEUR_ID', 'MODELE_PDF_ID', 'COMPTEUR'].forEach(function (k) { Logger.log(k + ' = ' + (props.getProperty(k) || 'introuvable')); });
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
    if (!props.getProperty('COMPTEUR')) retrouverReglages();
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
