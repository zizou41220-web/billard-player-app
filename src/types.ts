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
};

export type MatchStage = 'qualif' | 'quarter' | 'semi' | 'final' | 'third_place';

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
  handicapP1?: number;
  handicapP2?: number;
};

export type TournamentFormat = 'cartesien' | 'robin' | 'double_ko';

export type TournamentSettings = {
  tableIds: string[]; // IDs des billards physiquement alloués au tournoi
  qualifNbSets: number;
  qualifIsWinningSets: boolean; // true = "première à X", false = "jouer X manches fixes"
  qualifNbQualifiers: number; // sortants par poule / qualifiés
  finalNbSets: number;
  finalIsWinningSets: boolean;
  seedByMerit: boolean; // Tirage au mérite
  finalStageLaunched?: boolean;
  handicapAmateurSets?: number; // 0 = aucun, 1 = +1 manche d'avance pour Amateur vs Prestige, etc.
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
