# Supabase

Projet backend de BANK D'EPREUVES.

- Projet : `BANK D'EPREUVES`
- Région : `eu-west-3`
- Référence : `wlmnbigbhxpocwwsrsre`
- URL API : `https://wlmnbigbhxpocwwsrsre.supabase.co`

## Authentification

L'interface publique utilise un identifiant et un mot de passe. Aucun e-mail n'est demandé à l'utilisateur. Supabase Auth conserve un e-mail technique aléatoire interne, non affiché et non utilisé pour contacter l'utilisateur.

Les comptes sont créés et les connexions sont traitées par l'Edge Function `account`. Les mots de passe ne sont jamais enregistrés dans les tables métier. La clé `service_role` reste exclusivement côté Edge Function.

## Mot de passe oublié

L'utilisateur transmet son identifiant. Une demande est créée dans `password_reset_requests`. Un administrateur connecté peut examiner les demandes depuis son espace, approuver ou refuser la demande et générer un mot de passe temporaire. Celui-ci est affiché une seule fois à l'administrateur pour remise manuelle par un canal privé.

Après connexion avec le mot de passe temporaire, l'utilisateur est obligé de définir un nouveau mot de passe avant d'accéder à son espace.

Le numéro de téléphone est facultatif à l'inscription ; il facilite la remise du mot de passe temporaire. Aucun SMS ou message WhatsApp automatique n'est configuré à ce stade.

## Sécurité

- RLS est activé sur les tables exposées.
- Les utilisateurs ne peuvent pas modifier leur rôle.
- Les actions privilégiées passent par l'Edge Function et vérifient le rôle administrateur côté serveur.
- Les mots de passe temporaires ne sont pas stockés dans la base.
- Ne jamais committer une clé `service_role` ou un secret.
- La clé publishable du frontend est publique ; les politiques RLS restent indispensables.
