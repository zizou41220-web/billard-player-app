import { Match, MatchStage, Player } from '../types';
import { getMatchHandicap } from './handicap';

export type BracketRoundDef = {
  roundNumber: number; // 1 à totalRounds
  matchCount: number;
  stage: MatchStage;
  prefix: string;
  title: string;
  shortTitle: string;
};

/**
 * Détermine la taille puissance de 2 de l'arbre selon le nombre de qualifiés/participants.
 * Ex: 90 joueurs -> arbre de 128 (38 blancs)
 *     50 joueurs -> arbre de 64 (14 blancs)
 *     24 joueurs -> arbre de 32 (8 blancs)
 *     12 joueurs -> arbre de 16 (4 blancs)
 *     6 joueurs -> arbre de 8 (2 blancs)
 *     3 joueurs -> arbre de 4 (1 blanc)
 */
export function getBracketSize(count: number): number {
  if (count > 64) return 128;
  if (count > 32) return 64;
  if (count > 16) return 32;
  if (count > 8) return 16;
  if (count > 4) return 8;
  if (count > 2) return 4;
  return 2;
}

/**
 * Génère les paires de têtes de série standard pour un arbre de taille N (puissance de 2).
 * Formule standard internationale (ATP, FFB, EPBF) :
 * - N=2: [1, 2]
 * - N=4: [1, 4], [2, 3]
 * - N=8: [1, 8], [4, 5], [2, 7], [3, 6]
 * - N=16: [1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]
 * Garantit que la tête de série 1 et 2 ne peuvent se croiser qu'en finale, 3 et 4 en demi-finales,
 * et que les Blancs (Byes) sont attribués en priorité au 1er, 2e, etc.
 */
export function generateSeedingPairs(bracketSize: number): Array<[number, number]> {
  if (bracketSize < 2) return [[1, 2]];
  let rounds = [1, 2];
  while (rounds.length < bracketSize) {
    const nextRounds: number[] = [];
    const sum = rounds.length * 2 + 1;
    for (let i = 0; i < rounds.length; i++) {
      nextRounds.push(rounds[i]);
      nextRounds.push(sum - rounds[i]);
    }
    rounds = nextRounds;
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < rounds.length; i += 2) {
    pairs.push([rounds[i], rounds[i + 1]]);
  }
  return pairs;
}

/**
 * Retourne la liste des tours d'un arbre pour une taille donnée (de 2 à 128).
 */
export function getBracketRounds(bracketSize: number): BracketRoundDef[] {
  const allRoundsConfig: Array<{ matchCount: number; stage: MatchStage; prefix: string; title: string; shortTitle: string }> = [
    { matchCount: 64, stage: 'round_of_128', prefix: 'round128', title: '64èmes de Finale (1er Tour)', shortTitle: '64èmes' },
    { matchCount: 32, stage: 'round_of_64', prefix: 'round64', title: '32èmes de Finale', shortTitle: '32èmes' },
    { matchCount: 16, stage: 'round_of_32', prefix: 'round32', title: '16èmes de Finale', shortTitle: '16èmes' },
    { matchCount: 8, stage: 'round_of_16', prefix: 'round16', title: '8èmes de Finale', shortTitle: '8èmes' },
    { matchCount: 4, stage: 'quarter', prefix: 'quarter', title: 'Quarts de Finale', shortTitle: '1/4 Quarts' },
    { matchCount: 2, stage: 'semi', prefix: 'semi', title: 'Demi-Finales', shortTitle: '1/2 Demis' },
    { matchCount: 1, stage: 'final', prefix: 'final', title: 'Grande Finale', shortTitle: 'Finale' },
  ];

  const maxMatchesInRound1 = Math.max(1, Math.floor(bracketSize / 2));
  const filtered = allRoundsConfig.filter(r => r.matchCount <= maxMatchesInRound1);
  return filtered.map((r, idx) => ({
    ...r,
    roundNumber: idx + 1
  }));
}

/**
 * Vérifie si un match fait partie de la phase finale / tableau éliminatoire.
 */
export function isFinalStageMatch(m: Match): boolean {
  if (m.stage && m.stage !== 'qualif') return true;
  if (!m.id) return false;
  return (
    m.id.includes('_final_') ||
    m.id.includes('_third_place_') ||
    m.id.includes('_semi_') ||
    m.id.includes('_quarter_') ||
    m.id.includes('_round16_') ||
    m.id.includes('_round32_') ||
    m.id.includes('_round64_') ||
    m.id.includes('_round128_') ||
    m.id.includes('_r16_') ||
    m.id.includes('_r32_') ||
    m.id.includes('_r64_') ||
    m.id.includes('_r128_')
  );
}

/**
 * Libellé lisible pour chaque stade de compétition.
 */
export function getRoundLabel(stage?: MatchStage): string {
  switch (stage) {
    case 'round_of_128': return '64èmes de Finale';
    case 'round_of_64': return '32èmes de Finale';
    case 'round_of_32': return '16èmes de Finale';
    case 'round_of_16': return '8èmes de Finale';
    case 'quarter': return '1/4 de Finale';
    case 'semi': return 'Demi-Finale';
    case 'final': return 'Finale';
    case 'third_place': return 'Petite Finale (3e place)';
    default: return 'Match';
  }
}

/**
 * Construit l'ensemble des matchs d'un tableau à élimination directe (arbre de tournoi)
 * de 2 à 128 joueurs avec arborescence connectée, handicaps et Blancs (Byes) automatiques.
 */
export function buildBracketMatches(params: {
  tournamentId: string;
  clubId: string;
  qualifiers: string[]; // Liste ordonnée par mérite [Seed 1, Seed 2, ...]
  handicapAmateurSets?: number;
  hasThirdPlaceMatch?: boolean;
  players: Record<string, Player>;
}): { newMatches: Record<string, Match>; newMatchIds: string[]; bracketSize: number; rounds: BracketRoundDef[] } {
  const { tournamentId, clubId, qualifiers, handicapAmateurSets, hasThirdPlaceMatch = true, players } = params;
  const numQualifiers = qualifiers.length;
  const bracketSize = getBracketSize(numQualifiers);
  const rounds = getBracketRounds(bracketSize);
  const totalRounds = rounds.length;
  const timestamp = Date.now();

  const newMatches: Record<string, Match> = {};
  const newMatchIds: string[] = [];

  // 1. Matrice des IDs de match [roundIndex][position]
  const matchIdGrid: string[][] = [];
  rounds.forEach((roundDef, rIdx) => {
    matchIdGrid[rIdx] = [];
    for (let p = 0; p < roundDef.matchCount; p++) {
      let mId = '';
      if (roundDef.stage === 'final') {
        mId = `m_final_${timestamp}`;
      } else {
        mId = `m_${roundDef.prefix}_${p + 1}_${timestamp}`;
      }
      matchIdGrid[rIdx][p] = mId;
      newMatchIds.push(mId);
    }
  });

  // 2. Initialiser chaque match avec lien vers nextMatchId
  rounds.forEach((roundDef, rIdx) => {
    const isLastRound = rIdx === totalRounds - 1;
    for (let p = 0; p < roundDef.matchCount; p++) {
      const matchId = matchIdGrid[rIdx][p];
      const nextMatchId = isLastRound ? undefined : matchIdGrid[rIdx + 1][Math.floor(p / 2)];

      newMatches[matchId] = {
        id: matchId,
        clubId,
        player1Id: '',
        player2Id: '',
        score1: 0,
        score2: 0,
        status: 'pending',
        startTime: timestamp,
        tournamentId,
        stage: roundDef.stage,
        bracketRound: roundDef.roundNumber,
        bracketPosition: p,
        nextMatchId
      };
    }
  });

  // 3. Remplir le Tour 1 avec les têtes de série et Blancs (Byes)
  const pairs = generateSeedingPairs(bracketSize);
  const round1Def = rounds[0];
  const round1Matches = matchIdGrid[0];

  for (let p = 0; p < round1Def.matchCount; p++) {
    const matchId = round1Matches[p];
    const [seedA, seedB] = pairs[p];
    const p1Id = seedA <= numQualifiers ? qualifiers[seedA - 1] : '';
    const p2Id = seedB <= numQualifiers ? qualifiers[seedB - 1] : '';

    const currentMatch = newMatches[matchId];
    const nextMatchId = currentMatch.nextMatchId;

    if (p1Id && !p2Id) {
      // P1 a un Blanc (Bye) -> passe directement au tour suivant
      newMatches[matchId] = {
        ...currentMatch,
        player1Id: p1Id,
        player2Id: '',
        status: 'finished',
        winnerId: p1Id
      };
      if (nextMatchId && newMatches[nextMatchId]) {
        if (p % 2 === 0) {
          newMatches[nextMatchId].player1Id = p1Id;
        } else {
          newMatches[nextMatchId].player2Id = p1Id;
        }
      }
    } else if (p1Id && p2Id) {
      // Vrai match entre 2 joueurs
      const { h1, h2 } = getMatchHandicap(
        players[p1Id]?.level,
        players[p2Id]?.level,
        handicapAmateurSets
      );
      newMatches[matchId] = {
        ...currentMatch,
        player1Id: p1Id,
        player2Id: p2Id,
        score1: h1,
        score2: h2,
        handicapP1: h1 > 0 ? h1 : undefined,
        handicapP2: h2 > 0 ? h2 : undefined,
        status: 'pending'
      };
    } else {
      // Cas de repli
      newMatches[matchId] = {
        ...currentMatch,
        player1Id: p1Id,
        player2Id: p2Id
      };
    }
  }

  // 4. Mettre à jour les tours suivants si les 2 joueurs sont déjà prêts (grâce aux Blancs)
  for (let rIdx = 1; rIdx < totalRounds; rIdx++) {
    for (let p = 0; p < rounds[rIdx].matchCount; p++) {
      const matchId = matchIdGrid[rIdx][p];
      const m = newMatches[matchId];
      if (m.player1Id && m.player2Id && m.status === 'pending') {
        const { h1, h2 } = getMatchHandicap(
          players[m.player1Id]?.level,
          players[m.player2Id]?.level,
          handicapAmateurSets
        );
        newMatches[matchId] = {
          ...m,
          score1: h1,
          score2: h2,
          handicapP1: h1 > 0 ? h1 : undefined,
          handicapP2: h2 > 0 ? h2 : undefined
        };
      }
    }
  }

  // 5. Petite finale (match pour la 3ème place) si demandée et taille >= 4
  if (hasThirdPlaceMatch && bracketSize >= 4) {
    const thirdPlaceId = `m_third_place_${timestamp}`;
    newMatches[thirdPlaceId] = {
      id: thirdPlaceId,
      clubId,
      player1Id: '',
      player2Id: '',
      score1: 0,
      score2: 0,
      status: 'pending',
      startTime: timestamp,
      tournamentId,
      stage: 'third_place',
      bracketRound: totalRounds,
      bracketPosition: 1
    };
    newMatchIds.push(thirdPlaceId);
  }

  return { newMatches, newMatchIds, bracketSize, rounds };
}
