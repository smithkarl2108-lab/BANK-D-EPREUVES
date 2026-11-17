# Architecture fonctionnelle

## Profils
- Élève : recherche et consultation des ressources, favoris.
- Intervenant : dépôt et suivi de ses ressources.
- Administrateur : gestion des comptes, référentiels, validation et publication.

## Cycle de vie d'un document
1. Dépôt par un intervenant.
2. Enregistrement en brouillon ou en attente de validation.
3. Vérification par un administrateur.
4. Publication ou rejet motivé.
5. Consultation par les élèves selon les règles d'accès.

## Modules prévus
- Catalogue : classes, séries, matières, années et types de documents.
- Documents : métadonnées, fichiers, statut de publication.
- Favoris : association entre un utilisateur et un document.
- Imports : lots et tâches de traitement documentaire.
- Journalisation : actions administratives et événements importants.

## Principes
- Frontend en HTML, CSS et JavaScript natifs.
- Backend Supabase : PostgreSQL, Auth et Storage.
- Autorisations appliquées côté serveur avec Row Level Security (RLS).
- Aucun secret privilégié dans le navigateur.
