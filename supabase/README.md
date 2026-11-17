# Supabase

Le projet Supabase actif est le backend de BANK D'EPREUVES.

- Projet : `BANK D'EPREUVES`
- Région : `eu-west-3`
- Référence : `wlmnbigbhxpocwwsrsre`
- URL API : `https://wlmnbigbhxpocwwsrsre.supabase.co`

Le schéma initial a été appliqué directement au projet Supabase et les dix tables métier disposent de RLS. Le bucket Storage `documents` est privé. Les utilisateurs publics s'inscrivent avec le rôle `student` par défaut. Les rôles intervenant et administrateur ne doivent jamais être fournis par le navigateur.

## Sécurité

- Ne jamais committer une clé `service_role` ou un secret.
- La clé `publishable` utilisée dans le frontend est publique ; RLS doit rester activé.
- Ne pas autoriser un utilisateur à modifier son propre rôle.
- Les élèves ne doivent consulter que les documents publiés.
- Un intervenant ne doit gérer que ses propres documents.
- Les fichiers sont conservés dans un bucket privé.

## Authentification

La page `connexion.html` gère la connexion, l'inscription élève et la réinitialisation du mot de passe. `espace.html` vérifie la session et lit le profil courant.

Avant les tests en ligne, configurer Supabase > Authentication > URL Configuration :
- Site URL : URL principale du site Vercel ;
- Redirect URLs : URL de production, domaines Preview Vercel et URL locale de développement.

La confirmation e-mail est prise en charge. Les paramètres d'authentification doivent être vérifiés dans le dashboard Supabase avant les tests réels.
