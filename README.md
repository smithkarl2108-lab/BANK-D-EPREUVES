# BANK D'EPREUVES

Plateforme camerounaise de consultation, de dépôt et de gestion d'épreuves scolaires.

## Technologies
- HTML5
- CSS3
- JavaScript natif (ES6+)
- Supabase (backend, authentification et stockage — intégration à venir)

Aucun framework frontend n'est utilisé.

## Démarrage
Ouvrir `index.html` dans un navigateur ou lancer un serveur local statique.

## Structure
- `index.html` : page d'accueil
- `assets/` : ressources statiques
- `css/` : styles
- `js/` : logique frontend
- `docs/` : documentation du projet
- `supabase/` : scripts SQL et configuration backend

## État
Socle initial en cours de construction. L'authentification, la base de données et les espaces par rôle seront ajoutés progressivement.

## Authentification (en cours d'intégration)

Les pages suivantes sont disponibles :
- `connexion.html` : connexion, création de compte élève et récupération du mot de passe ;
- `espace.html` : espace privé de base ;
- `js/auth.js` et `js/espace.js` : logique d'authentification Supabase ;
- `js/supabase-config.js` : URL Supabase et clé publishable publique.

La clé publishable peut être présente dans le navigateur : les accès aux données sont protégés par les politiques RLS. Ne jamais ajouter de clé `service_role` au dépôt ou au frontend.

### Configuration Supabase Auth avant les tests

Dans Supabase > Authentication > URL Configuration :
1. définir le Site URL sur l'URL Vercel de production ;
2. ajouter l'URL de prévisualisation Vercel et `http://localhost:...` aux Redirect URLs autorisées ;
3. conserver la confirmation d'adresse e-mail activée pour les tests réels.

Les comptes créés par le formulaire public reçoivent le rôle `student`. Les rôles `teacher` et `admin` sont attribués par un administrateur, jamais par le formulaire d'inscription.
