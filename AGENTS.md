# Instructions & Règles du Projet MonClubBillard (billard-player-app)

## Règle Absolue : Versioning Systématique
À **chaque** modification de code, correction de bug ou ajout de fonctionnalité :
1. Incrémenter la version dans `src/version.ts` (`APP_VERSION`) et dans `package.json`.
2. S'assurer que le badge de version reste visible dans l'interface gérant (`AdminView.tsx`) et joueur (`App.tsx`).
3. Mentionner explicitement le numéro de version déployé dans les messages de commit et dans la réponse à l'utilisateur.
