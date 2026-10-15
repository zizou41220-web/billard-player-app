-- ====================================================================
-- MIGRATION SUPABASE : MULTI-CLUBS
-- Exécutez ce script dans l'éditeur SQL de votre console Supabase :
-- https://supabase.com/dashboard/project/iwtuwtvgrocmxfkmidlk/sql
-- ====================================================================

-- 1. Ajout de la colonne club_id avec valeur par défaut 'bc41'
ALTER TABLE tournoi2_players ADD COLUMN IF NOT EXISTS club_id text DEFAULT 'bc41';
ALTER TABLE tournoi2_tables ADD COLUMN IF NOT EXISTS club_id text DEFAULT 'bc41';
ALTER TABLE tournoi2_matches ADD COLUMN IF NOT EXISTS club_id text DEFAULT 'bc41';
ALTER TABLE tournoi2_tournaments ADD COLUMN IF NOT EXISTS club_id text DEFAULT 'bc41';

-- 2. Mise à jour des lignes existantes pour être associées au Billard Club 41
UPDATE tournoi2_players SET club_id = 'bc41' WHERE club_id IS NULL;
UPDATE tournoi2_tables SET club_id = 'bc41' WHERE club_id IS NULL;
UPDATE tournoi2_matches SET club_id = 'bc41' WHERE club_id IS NULL;
UPDATE tournoi2_tournaments SET club_id = 'bc41' WHERE club_id IS NULL;

-- 3. Création d'index pour optimiser les performances de requêtage par club
CREATE INDEX IF NOT EXISTS idx_tournoi2_players_club ON tournoi2_players(club_id);
CREATE INDEX IF NOT EXISTS idx_tournoi2_tables_club ON tournoi2_tables(club_id);
CREATE INDEX IF NOT EXISTS idx_tournoi2_matches_club ON tournoi2_matches(club_id);
CREATE INDEX IF NOT EXISTS idx_tournoi2_tournaments_club ON tournoi2_tournaments(club_id);
