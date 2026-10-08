# Dossiers d'adhésion : installation du script Google (15 min, une seule fois)

Sur la page Adhésion, l'adhérente lit et accepte la charte, le règlement intérieur et le droit à l'image, remplit son formulaire et signe une seule fois en ligne.
Le site envoie alors son dossier à un petit script Google, hébergé gratuitement sur le compte **collectif.anotreplace@gmail.com**.
Le script fabrique le PDF du dossier signé, le range dans Drive, remplit un tableau de suivi, l'envoie à la boîte du collectif avec une copie à l'adhérente, note le mode de paiement qu'elle choisit (HelloAsso ou virement) et envoie les e-mails automatiques.

Les textes de la charte, du règlement et du droit à l'image sont dans le site (`_includes/adhesion/`). Le script les relit sur https://anotreplace.github.io/adhesion/textes/ pour composer chaque PDF : pour modifier un texte, il suffit de le modifier dans le site.

## 1. Créer le script
1. Se connecter à Google avec **collectif.anotreplace@gmail.com** (important : les e-mails partiront de cette adresse).
2. Aller sur https://script.google.com > **Nouveau projet**. Le renommer « Ànotreplace · Adhésions ».
3. Effacer le contenu de `Code.gs`, puis coller tout le contenu du fichier `Code.gs` de ce dossier.
4. En haut du fichier, compléter si possible le lien du groupe de discussions (`GROUPE_URL`). Le RIB n'est pas écrit dans le script : les e-mails renvoient vers le RIB téléchargeable sur le site. Le lien HelloAsso est déjà renseigné.
5. Enregistrer (icône disquette).

## 2. Lancer l'installation
1. Dans la liste des fonctions (en haut), choisir **installer**, puis **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations** > choisir le compte > **Paramètres avancés** > **Accéder à Ànotreplace · Adhésions (non sécurisé)** > **Autoriser**.
   C'est normal : le script est le vôtre, Google ne l'a simplement pas « vérifié ».
3. Un e-mail « Installation terminée » arrive, avec le lien du tableau de suivi et du dossier Drive.

## 3. Publier le script
1. **Déployer** > **Nouveau déploiement** > roue dentée > **Application Web**.
2. Exécuter en tant que : **Moi**. Qui a accès : **Tout le monde**.
3. **Déployer**, puis copier l'**URL de l'application Web** (elle se termine par `/exec`).
4. Dans le site, ouvrir `_config.yml` et coller cette URL à la place de `A_REMPLACER` sur la ligne `adhesion_script_url`.

Tant que cette URL n'est pas renseignée, le formulaire de dépôt n'apparaît pas sur la page Adhésion.

## 4. Tester
- Dans l'éditeur, exécuter **testerUnDossier** : un faux dossier apparaît dans le tableau et deux e-mails arrivent sur la boîte du collectif.
- Puis faire un vrai essai depuis la page Adhésion du site. Supprimer ensuite les lignes de test du tableau.

## Au quotidien : le tableau de suivi
| Le bureau fait… | E-mail envoyé automatiquement à l'adhérente |
|---|---|
| (rien : dossier reçu) | Confirmation avec la copie de son dossier signé (PDF) + instructions de paiement (HelloAsso ou virement avec le RIB du site) |
| Écrit les pièces manquantes, puis met « Statut dossier » sur **Incomplet** | Demande des éléments manquants |
| Met « Paiement » sur **Reçu** | Confirmation du paiement |
| Dossier **Validé** + Paiement **Reçu** | Bienvenue dans le collectif (+ lien du groupe) |
| (rien : paiement « En attente » depuis 5 jours) | Relance unique, chaque matin à 9h |

La colonne « E-mails envoyés » garde l'historique. Aucun e-mail n'est envoyé deux fois.

## Si vous modifiez le script plus tard
1. Remplacer tout le contenu de `Code.gs` dans l'éditeur, puis enregistrer.
2. Exécuter **testerUnDossier** : Google peut demander une nouvelle autorisation (par exemple « se connecter à un service externe », pour relire les textes du site). Vérifier le PDF reçu sur la boîte du collectif, puis supprimer la ligne de test du tableau.
3. **Déployer** > **Gérer les déploiements** > crayon > Version : **Nouvelle version** > **Déployer**. L'URL ne change pas.

Les nouvelles colonnes du tableau (Adresse, Contact d'urgence, T-shirt) s'ajoutent toutes seules à la fin du tableau au premier dossier reçu.
