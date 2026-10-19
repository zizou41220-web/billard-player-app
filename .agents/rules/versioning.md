# Règle : Gestion de la version de l'application (OBLIGATOIRE)

À CHAQUE MODIFICATION, AJOUT DE FONCTIONNALITÉ OU CORRECTION :
1. **Incrémenter le numéro de version** dans :
   - `src/version.ts` : mettre à jour `APP_VERSION` (ex: `v1.1.1`, `v1.2.0`, etc.) et la date `APP_BUILD_DATE`.
   - `package.json` : mettre à jour le champ `"version"`.
2. **Afficher la version visiblement dans l'interface** :
   - Elle doit être affichée dans l'en-tête de l'espace Administrateur (`AdminView.tsx`) pour que le gérant sache immédiatement quelle version est déployée.
   - Elle doit être affichée discrètement sur l'interface joueur / mobile (`App.tsx`).
3. **Mentionner la nouvelle version** dans les messages de commit git et dans les réponses adressées à l'utilisateur.
