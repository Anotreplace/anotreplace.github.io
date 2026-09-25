# Site Ànotreplace — mode d'emploi

Site statique Jekyll, prêt pour GitHub Pages. 13 pages : accueil, le collectif, activités, adhésion, réserver, merci, charte, FAQ, partenaires, contact, blog, mentions légales, confidentialité (+ page 404).

## 1. Mettre le site en ligne (15 minutes)

1. Créez une **organisation** GitHub `anotreplace` (Profil > Your organizations > New organization, offre Free). Le site ne dépendra ainsi d'aucun compte personnel.
2. Dans l'organisation, créez un dépôt **public** nommé `anotreplace.github.io`.
3. Déposez tout le contenu de ce dossier dans le dépôt (bouton *Add file > Upload files*, glisser-déposer).
4. *Settings > Pages* : Source = **Deploy from a branch**, branche **main**, dossier **/ (root)**. Enregistrez.
5. Après 1 à 2 minutes, le site est visible sur `https://anotreplace.github.io`.

> Si le dépôt porte un autre nom (ex. `site`), le site sera à `https://anotreplace.github.io/site` : mettez alors `baseurl: "/site"` dans `_config.yml`.

## 2. Remplacer les éléments marqués A_REMPLACER

Cherchez `A_REMPLACER` dans les fichiers (touche `t` sur GitHub, ou recherche du dépôt).

| Fichier | À renseigner |
| --- | --- |
| `_config.yml` | Lien de réservation, HelloAsso, Instagram, Formspree, e-mail de contact, adresse du siège, domaine |
| `le-collectif.html` | Présentations de Lauryn et Léa |
| `activites.html` | Horaires et quartiers des sorties, agenda |
| `adhesion.html` | Avantage membre fondatrice (validé par le bureau) |
| `confidentialite.html` | Outils réellement utilisés |

## 3. Brancher les services externes

| Service | Usage | Réglage |
| --- | --- | --- |
| Cal.com ou Calendly | Réservation des séances | Copier le lien public dans `liens.reservation` ; activer la redirection après réservation vers `/merci/` |
| Formspree ou Tally | Formulaires contact et partenaires | Créer 2 formulaires, copier les URL dans `formspree_contact` et `formspree_partenaires` |
| Brevo | Programme mensuel et e-mails automatiques | Créer un formulaire d'inscription, copier l'URL d'action dans `brevo_newsletter` (le bloc apparaît automatiquement sur l'accueil) |
| HelloAsso | Adhésions et dons | Copier l'URL de la campagne d'adhésion dans `liens.helloasso` |
| Google Analytics 4 | Statistiques | Coller l'identifiant `G-…` dans `ga4_id` : le bandeau de consentement s'active tout seul |

GitHub Pages ne doit pas servir à encaisser de paiements : tout paiement passe par HelloAsso.

## 4. Ajouter les photos

1. Exportez les photos en **WebP**, moins de 200 Ko chacune, et déposez-les dans `assets/img/`.
2. Dans la page, remplacez `src=""` par le chemin, par exemple :
   `{% include photo.html src="/assets/img/hero.webp" alt="Le groupe après une sortie" %}`
3. Tant que `src` est vide, un emplacement rosé « Photo à venir » s'affiche.

Utilisez uniquement des photos d'adhérentes ayant donné leur accord écrit.

## 5. Modifier les contenus

| Je veux… | Fichier |
| --- | --- |
| Ajouter ou modifier une question de FAQ | `_data/faq.yml` (met à jour la page FAQ, l'accueil et Google) |
| Ajouter un témoignage | `_data/temoignages.yml` (remplace automatiquement le mot des fondatrices sur l'accueil) |
| Publier un article | Nouveau fichier `_posts/AAAA-MM-JJ-titre.md` sur le modèle de l'article existant |
| Changer les couleurs | Variables en haut de `assets/css/site.css` |
| Changer le menu | `_includes/header.html` |

## 6. Nom de domaine (facultatif, recommandé)

1. Achetez `anotreplace.fr` chez un registrar.
2. *Settings > Pages > Custom domain* : saisissez `anotreplace.fr` (GitHub crée le fichier `CNAME`).
3. Chez le registrar, ajoutez les enregistrements DNS indiqués par la documentation GitHub Pages.
4. Cochez **Enforce HTTPS** et vérifiez que `url` dans `_config.yml` correspond au domaine.

## 7. Après la mise en ligne

- Déclarez le site dans **Google Search Console** et soumettez `/sitemap.xml`.
- Créez la fiche **Google Business Profile** du collectif et liez-la au site.
- Contrôlez chaque page avec **Lighthouse** (Chrome, outils de développement) : visez 90+ partout.

## Rappels

- Le dépôt est **public** : n'y mettez jamais de liste d'adhérentes, d'e-mails ou de documents signés.
- Les statuts signés ne doivent pas être publiés tels quels : publiez une version sans signatures si vous souhaitez les mettre en ligne.
