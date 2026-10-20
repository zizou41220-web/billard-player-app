export type PlayerLevel = 'Amateur' | 'Prestige' | 'Confirmé';

export type Club = {
  id: string; // ex: 'bc41', 'bc-romorantin'
  name: string; // ex: 'Billard Club 41'
  logoUrl?: string;
};

export type Player = {
  id: string;
  clubId?: string;
  name: string;
  level: PlayerLevel;
  avatarUrl?: string;
  stats: {
    matchesPlayed: number;
    wins: number;
    nemesisId?: string; // Player they lose the most to
    bestFriendId?: string; // Player they play the most with
    winRate: number;
  };
};

export type Table = {
  id: string;
  clubId?: string;
  number: number;
  name?: string;
  status: 'free' | 'occupied';
  currentMatchId?: string;
  x?: number;
  y?: number;
  liveStreamUrl?: string;
};

export type MatchStage =
  | 'qualif'
  | 'round_of_128'
  | 'round_of_64'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final'
  | 'third_place';

export type Match = {
  id: string;
  clubId?: string;
  tableId?: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  status: 'pending' | 'playing' | 'finished';
  startTime: number;
  endTime?: number;
  winnerId?: string;
  tournamentId?: string;
  stage?: MatchStage;
  bracketRound?: number;
  bracketPosition?: number;
  nextMatchId?: string;
  targetSets?: number; // Nombre de manches spécifiques allouées à ce duel
  handicapP1?: number;
  handicapP2?: number;
  liveStreamUrl?: string;
};

export type TournamentFormat = 'cartesien' | 'robin' | 'double_ko' | 'direct_ko';

export type TournamentSettings = {
  tableIds: string[]; // IDs des billards physiquement alloués au tournoi
  qualifNbSets: number;
  qualifNbSetsAmateur?: number; // Manches Amateur vs Amateur en qualif
  qualifNbSetsPrestige?: number; // Manches Prestige vs Prestige en qualif
  qualifNbSetsMixed?: number; // Manches Amateur vs Prestige en qualif
  qualifIsWinningSets: boolean; // true = "première à X", false = "jouer X manches fixes"
  qualifNbQualifiers: number; // sortants par poule / qualifiés
  qualifHandicapAmateurSets?: number; // 0 = aucun, 1 = +1 manche d'avance pour Amateur vs Prestige en qualif
  finalNbSets: number;
  finalNbSetsAmateur?: number; // Manches Amateur vs Amateur en phase finale
  finalNbSetsPrestige?: number; // Manches Prestige vs Prestige en phase finale
  finalNbSetsMixed?: number; // Manches Amateur vs Prestige en phase finale
  finalIsWinningSets: boolean;
  finalHandicapAmateurSets?: number; // 0 = aucun, 1 = +1 manche d'avance pour Amateur vs Prestige en phase finale
  seedByMerit: boolean; // Tirage au mérite
  finalStageLaunched?: boolean;
  handicapAmateurSets?: number; // Rétrocompatibilité globale
  hasThirdPlaceMatch?: boolean; // Petite finale pour la 3ème place
};

export type Tournament = {
  id: string;
  clubId?: string;
  name: string;
  format: TournamentFormat;
  status: 'upcoming' | 'ongoing' | 'finished';
  participants: string[]; // Player IDs
  settings?: TournamentSettings;
  matches: string[]; // Match IDs
  finalStageLaunched?: boolean;
};
