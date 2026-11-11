import { Match, MatchStage, Player } from '../types';
import { getBracketSize, generateSeedingPairs } from './bracket';
import { getMatchHandicap } from './handicap';
import { resolveDuelTargetSets, getPhaseRules } from './rules';

export type DoubleKORoundDef = {
  roundId: string;
  roundNumber: number;
  bracketType: 'winner' | 'loser' | 'grand_final';
  matchCount: number;
  stage: MatchStage;
  title: string;
  shortTitle: string;
};

/**
 * Construit l'ensemble des matchs d'un arbre à Double Élimination (Double KO) complet :
 * - Tableau Principal (Winners Bracket)
 * - Tableau de Repêchage (Losers Bracket)
 * - Grande Finale (Vainqueur WB vs Vainqueur LB)
 *
 * Supporte 4, 8, 16, 32, 64 joueurs avec têtes de série et Blancs (Byes) automatiques.
 */
export function buildDoubleKOBracketMatches(params: {
  tournamentId: string;
  clubId: string;
  participants: string[]; // Liste ordonnée des participants (têtes de série en premier)
  finalNbSets?: number;
  finalIsWinningSets?: boolean;
  handicapAmateurSets?: number;
  players: Record<string, Player>;
  tournamentSettings?: any;
}): {
  newMatches: Record<string, Match>;
  newMatchIds: string[];
  bracketSize: number;
  wbRounds: DoubleKORoundDef[];
  lbRounds: DoubleKORoundDef[];
  gfRound: DoubleKORoundDef;
} {
  const { tournamentId, clubId, participants, finalNbSets = 3, finalIsWinningSets = true, handicapAmateurSets = 0, players, tournamentSettings } = params;

  const numPlayers = participants.length;
  const bracketSize = Math.max(4, getBracketSize(numPlayers));
  const K = Math.round(Math.log2(bracketSize)); // 2 pour 4, 3 pour 8, 4 pour 16...
  const timestamp = Date.now();

  const newMatches: Record<string, Match> = {};
  const newMatchIds: string[] = [];

  // =========================================================================
  // 1. Définition des tours du Winners Bracket (WB)
  // =========================================================================
  const wbRounds: DoubleKORoundDef[] = [];
  for (let r = 1; r <= K; r++) {
    const matchCount = bracketSize / Math.pow(2, r);
    const isWbFinal = r === K;
    const isWbSemi = r === K - 1;
    const isWbQuarter = r === K - 2;

    let stage: MatchStage = 'round_of_16';
    let title = `Tours Préliminaires (Tour ${r})`;
    let shortTitle = `WB T${r}`;

    if (isWbFinal) {
      stage = 'semi'; // Finale des gagnants
      title = 'Finale Tableau Principal (Vainqueurs)';
      shortTitle = 'Finale WB';
    } else if (isWbSemi) {
      stage = 'semi';
      title = '1/2 Finales Tableau Principal';
      shortTitle = '1/2 WB';
    } else if (isWbQuarter) {
      stage = 'quarter';
      title = '1/4 Finales Tableau Principal';
      shortTitle = '1/4 WB';
    } else if (r === 1 && bracketSize === 16) {
      stage = 'round_of_16';
      title = '1/8 Finales Tableau Principal';
      shortTitle = '1/8 WB';
    } else if (r === 1 && bracketSize === 32) {
      stage = 'round_of_32';
      title = '1/16 Finales Tableau Principal';
      shortTitle = '1/16 WB';
    }

    wbRounds.push({
      roundId: `wb_r${r}`,
      roundNumber: r,
      bracketType: 'winner',
      matchCount,
      stage,
      title,
      shortTitle
    });
  }

  // =========================================================================
  // 2. Définition des tours du Losers Bracket (LB)
  // =========================================================================
  const lbRounds: DoubleKORoundDef[] = [];
  const totalLbRounds = 2 * (K - 1);

  for (let i = 1; i <= totalLbRounds; i++) {
    const isMinor = i % 2 === 1;
    const j = isMinor ? (i + 1) / 2 : i / 2;
    const matchCount = bracketSize / Math.pow(2, j + 1);
    const isLbFinal = i === totalLbRounds;

    let stage: MatchStage = 'round_of_16';
    let title = isMinor
      ? `Repêchage Tour ${i}`
      : `Repêchage Tour ${i} (Arrivée des perdants WB)`;
    let shortTitle = `LB T${i}`;

    if (isLbFinal) {
      stage = 'third_place';
      title = 'Finale Repêchage (Petite Finale)';
      shortTitle = 'Finale LB';
    } else if (i === totalLbRounds - 1) {
      stage = 'semi';
      title = '1/2 Finale Repêchage';
      shortTitle = '1/2 LB';
    }

    lbRounds.push({
      roundId: `lb_r${i}`,
      roundNumber: i,
      bracketType: 'loser',
      matchCount,
      stage,
      title,
      shortTitle
    });
  }

  // =========================================================================
  // 3. Définition de la Grande Finale
  // =========================================================================
  const gfRound: DoubleKORoundDef = {
    roundId: 'gf',
    roundNumber: 1,
    bracketType: 'grand_final',
    matchCount: 1,
    stage: 'final',
    title: '👑 Grande Finale (Vainqueur WB vs Vainqueur LB)',
    shortTitle: 'Grande Finale'
  };

  // =========================================================================
  // 4. Génération des grilles d'IDs
  // =========================================================================
  const wbMatchGrid: string[][] = [];
  wbRounds.forEach((rDef, rIdx) => {
    wbMatchGrid[rIdx] = [];
    for (let p = 0; p < rDef.matchCount; p++) {
      const mId = `m_dko_wb_r${rDef.roundNumber}_m${p + 1}_${timestamp}`;
      wbMatchGrid[rIdx][p] = mId;
      newMatchIds.push(mId);
    }
  });

  const lbMatchGrid: string[][] = [];
  lbRounds.forEach((rDef, rIdx) => {
    lbMatchGrid[rIdx] = [];
    for (let p = 0; p < rDef.matchCount; p++) {
      const mId = `m_dko_lb_r${rDef.roundNumber}_m${p + 1}_${timestamp}`;
      lbMatchGrid[rIdx][p] = mId;
      newMatchIds.push(mId);
    }
  });

  const grandFinalMatchId = `m_dko_gf_final_${timestamp}`;
  newMatchIds.push(grandFinalMatchId);

  // =========================================================================
  // 5. Initialisation des matchs du Winners Bracket (WB)
  // =========================================================================
  wbRounds.forEach((rDef, rIdx) => {
    const isWbFinal = rIdx === K - 1;
    for (let p = 0; p < rDef.matchCount; p++) {
      const matchId = wbMatchGrid[rIdx][p];
      const nextMatchId = isWbFinal ? grandFinalMatchId : wbMatchGrid[rIdx + 1][Math.floor(p / 2)];

      // Où va le perdant dans le Losers Bracket ?
      let loserMatchId: string | undefined = undefined;
      if (rIdx === 0) {
        // Tour 1 WB -> LB Tour 1
        loserMatchId = lbMatchGrid[0][Math.floor(p / 2)];
      } else if (isWbFinal) {
        // Finale WB -> Finale LB (dernier tour LB)
        loserMatchId = lbMatchGrid[totalLbRounds - 1][0];
      } else {
        // Tour rIdx WB (rIdx >= 1) -> LB Tour 2*rIdx (Major Round) avec croisement
        const targetLbRoundIdx = 2 * rIdx - 1; // index 0-based
        const targetLbMatchCount = lbRounds[targetLbRoundIdx].matchCount;
        const crossP = (targetLbMatchCount - 1 - p);
        loserMatchId = lbMatchGrid[targetLbRoundIdx][Math.max(0, crossP)];
      }

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
        stage: rDef.stage,
        bracketRound: rDef.roundNumber,
        bracketPosition: p,
        nextMatchId,
        loserMatchId,
        bracketType: 'winner'
      };
    }
  });

  // =========================================================================
  // 6. Initialisation des matchs du Losers Bracket (LB)
  // =========================================================================
  lbRounds.forEach((rDef, rIdx) => {
    const isLbFinal = rIdx === totalLbRounds - 1;
    for (let p = 0; p < rDef.matchCount; p++) {
      const matchId = lbMatchGrid[rIdx][p];
      let nextMatchId: string | undefined;

      if (isLbFinal) {
        // Le vainqueur de la Finale LB va en Grande Finale contre le vainqueur WB
        nextMatchId = grandFinalMatchId;
      } else if (rIdx % 2 === 0) {
        // Tour Minor (rIdx pair en 0-based) : les vainqueurs avancent directement dans le match p du Major suivant
        nextMatchId = lbMatchGrid[rIdx + 1][p];
      } else {
        // Tour Major (rIdx impair en 0-based) : les vainqueurs s'affrontent 2 par 2 au tour suivant
        nextMatchId = lbMatchGrid[rIdx + 1][Math.floor(p / 2)];
      }

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
        stage: rDef.stage,
        bracketRound: rDef.roundNumber,
        bracketPosition: p,
        nextMatchId,
        bracketType: 'loser'
      };
    }
  });

  // =========================================================================
  // 7. Initialisation de la Grande Finale (GF)
  // =========================================================================
  newMatches[grandFinalMatchId] = {
    id: grandFinalMatchId,
    clubId,
    player1Id: '',
    player2Id: '',
    score1: 0,
    score2: 0,
    status: 'pending',
    startTime: timestamp,
    tournamentId,
    stage: 'final',
    bracketRound: K + 1,
    bracketPosition: 0,
    bracketType: 'grand_final'
  };

  // =========================================================================
  // 8. Remplissage du 1er tour WB avec les têtes de série et Blancs (Byes)
  // =========================================================================
  const seedingPairs = generateSeedingPairs(bracketSize);
  const wbRound1Matches = wbMatchGrid[0];

  for (let p = 0; p < wbRounds[0].matchCount; p++) {
    const matchId = wbRound1Matches[p];
    const [seedA, seedB] = seedingPairs[p];
    const p1Id = seedA <= numPlayers ? participants[seedA - 1] : '';
    const p2Id = seedB <= numPlayers ? participants[seedB - 1] : '';

    const currentMatch = newMatches[matchId];
    const nextMatchId = currentMatch.nextMatchId;

    if (p1Id && !p2Id) {
      // P1 a un Blanc (Bye) -> passe directement au tour suivant dans le WB
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
      // Note : Comme il n'y a pas de perdant (adversaire Bye), le slot correspondant dans le LB Tour 1
      // n'a pas de joueur reçu, ce qui permettra à l'autre joueur du LB Tour 1 de bénéficier d'un Blanc également.
    } else if (p1Id && p2Id) {
      // Duel réel entre 2 joueurs
      const { isWinningSets: matchWinning, handicap: matchH } = getPhaseRules(tournamentSettings || { finalNbSets, finalIsWinningSets, finalHandicapAmateurSets: handicapAmateurSets }, currentMatch.stage);
      const targetSets = resolveDuelTargetSets(players[p1Id]?.level, players[p2Id]?.level, tournamentSettings || { finalNbSets }, true, currentMatch.stage);
      const duelMaxH = matchWinning ? Math.max(0, targetSets - 1) : undefined;
      const { h1, h2 } = getMatchHandicap(
        players[p1Id]?.level,
        players[p2Id]?.level,
        matchH,
        duelMaxH
      );
      newMatches[matchId] = {
        ...currentMatch,
        player1Id: p1Id,
        player2Id: p2Id,
        targetSets,
        score1: h1,
        score2: h2,
        handicapP1: h1 > 0 ? h1 : undefined,
        handicapP2: h2 > 0 ? h2 : undefined,
        status: 'pending'
      };
    }
  }

  // Auto-init des matchs WB ultérieurs si déjà remplis par les Blancs
  for (let rIdx = 1; rIdx < K; rIdx++) {
    for (let p = 0; p < wbRounds[rIdx].matchCount; p++) {
      const matchId = wbMatchGrid[rIdx][p];
      const m = newMatches[matchId];
      if (m.player1Id && m.player2Id && m.status === 'pending') {
        const { isWinningSets: matchWinning, handicap: matchH } = getPhaseRules(tournamentSettings || { finalNbSets, finalIsWinningSets, finalHandicapAmateurSets: handicapAmateurSets }, m.stage);
        const targetSets = resolveDuelTargetSets(players[m.player1Id]?.level, players[m.player2Id]?.level, tournamentSettings || { finalNbSets }, true, m.stage);
        const duelMaxH = matchWinning ? Math.max(0, targetSets - 1) : undefined;
        const { h1, h2 } = getMatchHandicap(
          players[m.player1Id]?.level,
          players[m.player2Id]?.level,
          matchH,
          duelMaxH
        );
        newMatches[matchId] = {
          ...m,
          targetSets,
          score1: h1,
          score2: h2,
          handicapP1: h1 > 0 ? h1 : undefined,
          handicapP2: h2 > 0 ? h2 : undefined
        };
      }
    }
  }

  return {
    newMatches,
    newMatchIds,
    bracketSize,
    wbRounds,
    lbRounds,
    gfRound
  };
}
