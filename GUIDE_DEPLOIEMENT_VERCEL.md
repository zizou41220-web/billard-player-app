# Guide de Déploiement Vercel & Multi-Clubs

Ce guide vous explique pas-à-pas comment mettre en ligne votre application **Mon Club Billard** sur Vercel (gratuit, ultra rapide) et comment l'utiliser dans plusieurs clubs ou sur d'autres PC.

---

## 🚀 Étape 1 : Déploiement en ligne sur Vercel (Gratuit)

Vercel héberge votre application avec un certificat **HTTPS officiel** (fini les avertissements de sécurité sur les smartphones).

### Option A : Déploiement via GitHub (Recommandé)
1. Créez un dépôt sur GitHub (ex: `mon-club-billard`).
2. Poussez le dossier du projet sur GitHub :
   ```bash
   git init
   git add .
   git commit -m "Déploiement initial Mon Club Billard"
   git branch -M main
   git remote add origin https://github.com/VOTRE_COMPTE/mon-club-billard.git
   git push -u origin main
   ```
3. Rendez-vous sur [vercel.com](https://vercel.com/) et connectez-vous avec votre compte GitHub.
4. Cliquez sur **"Add New Project"** > **"Import"** en sélectionnant votre dépôt.
5. Vercel détecte automatiquement `Vite` et le fichier [vercel.json](file:///c:/Users/tessiers/OneDrive%20-%20ALL%20Circuits/Bureau/Applis%20Antigravity/MonClubBillard/billard-player-app/vercel.json).
6. Cliquez sur **"Deploy"** !
7. En moins d'une minute, vous obtenez votre adresse publique (ex: `https://mon-club-billard.vercel.app`).

### Option B : Déploiement direct avec Vercel CLI (Sans GitHub)
1. Ouvrez un terminal dans le dossier du projet :
   ```bash
   npx vercel
   ```
2. Suivez les 3 questions interactives et le projet sera déployé directement.

---

## 🏢 Étape 2 : Comment utiliser l'application sur un autre PC ou dans un autre club

Grâce au système d'isolation multi-clubs mis en place :

1. **Aucune installation n'est requise** sur le PC de l'autre club !
2. Ouvrez simplement le navigateur (Google Chrome, Edge) sur le PC du club et allez sur votre adresse Vercel :
   - Pour votre club actuel : `https://votre-app.vercel.app/?club=bc41`
   - Pour un autre club : `https://votre-app.vercel.app/?club=bc-romorantin`
3. Dans l'onglet **Administration** > **Club** :
   - Vous pouvez modifier à tout moment le nom du club (ex: *BC Romorantin*), son identifiant et son logo.
4. **Les QR Codes s'adaptent automatiquement :**
   - Le QR code "Rejoindre l'application" affiché sur la TV / l'écran de l'ordinateur inclut directement le code du club.
   - Les joueurs qui scannent avec leur smartphone sont immédiatement connectés au bon club, sans configuration manuelle.

---

## 🗄️ Étape 3 : Isolation de la base de données (Supabase)

Pour que chaque club ait ses propres tables, tournois et joueurs isolés dans Supabase :

1. Ouvrez votre tableau de bord Supabase : [Console Supabase](https://supabase.com/dashboard/project/iwtuwtvgrocmxfkmidlk/sql).
2. Cliquez sur l'onglet **SQL Editor**.
3. Copiez et collez le contenu du fichier [supabase_migration.sql](file:///c:/Users/tessiers/OneDrive%20-%20ALL%20Circuits/Bureau/Applis%20Antigravity/MonClubBillard/billard-player-app/supabase_migration.sql).
4. Cliquez sur **Run** (Exécuter).

> [!NOTE]
> L'application détecte automatiquement la présence de ces colonnes. Tant que vous ne les exécutez pas, l'application continue de fonctionner normalement avec votre club par défaut (Billard Club 41).
