# Supabase

Ce dossier accueillera les migrations SQL versionnées.

Le schéma sera créé après validation des rôles et des règles d'accès. Les politiques RLS devront notamment empêcher :
- un utilisateur de modifier son propre rôle ;
- un élève de consulter des documents non publiés ;
- un intervenant de modifier les documents d'un autre intervenant ;
- tout accès non autorisé aux fichiers privés.

Ne jamais committer de clé `service_role` ou de secret.
