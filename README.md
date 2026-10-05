# Site Ànotreplace (GitHub Pages / Jekyll)

## Mise en ligne (10 minutes)
1. Dans le dépôt `anotreplace.github.io`, sauvegarder l'existant (branche `ancien-site`).
2. Remplacer le contenu de la branche principale par ce dossier. Garder votre dossier `_posts/` ou `blog/` s'il existe.
3. Ouvrir `_config.yml` et remplacer les 3 liens `A_REMPLACER` :
   - `booking_url` : agenda séance découverte (Cal.com, Calendly…)
   - `partner_booking_url` : agenda « café partenaire » 20 min
   - `adhesion_url` : page de paiement de la cotisation (HelloAsso conseillé, gratuit pour les associations)
   - `adhesion_script_url` : adresse du script Google des dossiers d'adhésion (voir `apps-script/LISEZ-MOI.md`)
4. Commit. GitHub reconstruit le site en 1 à 2 minutes.
5. Formulaires (FormSubmit) : au tout premier envoi, FormSubmit envoie un e-mail d'activation à collectif.anotreplace@gmail.com. Cliquer sur le lien, c'est tout.

## Modifier le site
- Textes : chaque page est un fichier `nom-de-page/index.html`.
- Menu et bandeau événement : `_includes/header.html` (le bandeau disparaît seul après la date `data-until`).
- Pied de page : `_includes/footer.html`.
- Couleurs et typographies : haut de `assets/css/style.css`.
- Ajouter un partenaire : `partenaires/index.html`, remplacer un bloc `.slot` (modèle en commentaire), logo dans `assets/img/partenaires/`.
- Témoignages d'adhérentes : bloc en commentaire dans `index.html`, section « Preuves sociales ».

## Dossiers d'adhésion
- Documents à télécharger : déposer dans `assets/docs/` les fichiers `formulaire-adhesion-anotreplace.pdf`, `charte-anotreplace.pdf`, `autorisation-droit-image-anotreplace.pdf`, `reglement-interieur-anotreplace.pdf` (noms exacts).
- Réception, tableau de suivi et e-mails automatiques : `apps-script/LISEZ-MOI.md`.

## Nom de domaine
Le jour de l'achat : changer `url` dans `_config.yml`, ajouter un fichier `CNAME` contenant le domaine, puis Settings > Pages > Custom domain.
