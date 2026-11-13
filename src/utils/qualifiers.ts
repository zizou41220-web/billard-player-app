import { Tournament, Match } from '../types';

export type PlayerQualifStat = {
  id: string;
  name?: string;
  poolName?: string;
  played: number;
  totalMatches: number;
  remainingMatches: number;
  won: number;
  lost: number;
  sf: number;
  sa: number;
  pts: number;
  maxPossiblePts: number;
  isSure: boolean;
};

import { isFinalStageMatch, isByeMatch, isRealFinishedMatch } from './bracket';

export function getTournamentQualificationStatus(
  tournament: Tournament | null,
  matches: Record<string, Match>,
  players?: Record<string, { name?: string }>
) {
  if (!tournament) {
    return {
      isFinalLaunched: false,
      isQualifAllDone: false,
      hasSureQualifiers: false,
      areAllQualifiersKnown: false,
      sureQualifiers: [] as string[],
      ranking: [] as PlayerQualifStat[],
      rankingsByPool: {} as Record<string, PlayerQualifStat[]>,
      poolNames: [] as string[],
      isMultiPool: false,
      numQualifiers: 4,
      totalQualifMatches: 0,
      finishedQualifMatches: 0
    };
  }

  const allTourMatches = tournament.matches.map(id => matches[id]).filter(Boolean);
  const qualifMatches = allTourMatches.filter(m => !isFinalStageMatch(m) && Boolean(m.player1Id && m.player2Id) && !isByeMatch(m));
  const finalMatches = allTourMatches.filter(isFinalStageMatch);

  const isFinalLaunched = Boolean(
    tournament.finalStageLaunched ||
    tournament.settings?.finalStageLaunched ||
    finalMatches.length > 0
  );
  const totalQualifMatches = qualifMatches.length;
  const finishedQualifMatches = qualifMatches.filter(m => isRealFinishedMatch(m, players)).length;
  const isQualifAllDone = totalQualifMatches > 0 && finishedQualifMatches === totalQualifMatches;

  const reqQualifiers = tournament.settings?.qualifNbQualifiers || 4;
  const participantsCount = tournament.participants.length;

  // Règle d'élimination : en qualification (poules / cartésien), il doit y avoir au moins 1 éliminé (max = participants - 1)
  const maxAllowedQualifiers = tournament.format !== 'direct_ko' && participantsCount >= 3
    ? participantsCount - 1
    : participantsCount;

  // Supporte 2, 4, 8, 16, 32, 64, 128 qualifiés (ou tout nombre intermédiaire avec gestion des Blancs)
  const numQualifiers = participantsCount < 2 
    ? participantsCount 
    : Math.min(Math.max(2, reqQualifiers), maxAllowedQualifiers);

  const nbPoules = tournament.settings?.qualifNbPoules || 1;
  const isMultiPool = (tournament.format === 'cartesien' || tournament.format === 'robin') && nbPoules > 1;

  let poolNames: string[] = [];
  if (isMultiPool) {
    if (tournament.settings?.poolsDistribution) {
      poolNames = Object.keys(tournament.settings.poolsDistribution);
    } else {
      const pSet = new Set<string>();
      qualifMatches.forEach(m => {
        if (m.poolName) pSet.add(m.poolName);
      });
      poolNames = Array.from(pSet).sort();
    }
    if (poolNames.length === 0) {
      for (let i = 0; i < nbPoules; i++) poolNames.push(`Poule ${String.fromCharCode(65 + i)}`);
    }
  }

  const rankingsByPool: Record<string, PlayerQualifStat[]> = {};

  if (isMultiPool) {
    const qualPerPool = Math.max(1, Math.round(numQualifiers / nbPoules));

    poolNames.forEach(pName => {
      const poolPlayerIds = tournament.settings?.poolsDistribution?.[pName] ||
        tournament.participants.filter(pId => qualifMatches.some(m => m.poolName === pName && (m.player1Id === pId || m.player2Id === pId)));
      const targetPlayers = poolPlayerIds.length > 0 ? poolPlayerIds : tournament.participants;
      const poolQualifMatches = qualifMatches.filter(m => m.poolName === pName);

      const poolStats: Record<string, PlayerQualifStat> = {};
      targetPlayers.forEach(pId => {
        poolStats[pId] = {
          id: pId,
          name: players?.[pId]?.name || 'Inconnu',
          poolName: pName,
          played: 0,
          totalMatches: 0,
          remainingMatches: 0,
          won: 0,
          lost: 0,
          sf: 0,
          sa: 0,
          pts: 0,
          maxPossiblePts: 0,
          isSure: false
        };
      });

      poolQualifMatches.forEach(m => {
        if (poolStats[m.player1Id] && poolStats[m.player2Id]) {
          poolStats[m.player1Id].totalMatches++;
          poolStats[m.player2Id].totalMatches++;
        }

        if (isRealFinishedMatch(m, players)) {
          const p1 = poolStats[m.player1Id];
          const p2 = poolStats[m.player2Id];
          if (p1 && p2) {
            p1.played++; p2.played++;
            p1.sf += m.score1; p1.sa += m.score2;
            p2.sf += m.score2; p2.sa += m.score1;
            if (m.score1 > m.score2) {
              p1.won++; p1.pts += 3; p2.lost++;
            } else if (m.score2 > m.score1) {
              p2.won++; p2.pts += 3; p1.lost++;
            } else {
              p1.pts += 1; p2.pts += 1;
            }
          }
        }
      });

      targetPlayers.forEach(pId => {
        const p = poolStats[pId];
        if (p) {
          p.remainingMatches = Math.max(0, p.totalMatches - p.played);
          p.maxPossiblePts = p.pts + p.remainingMatches * 3;
        }
      });

      const sortedPool = Object.values(poolStats).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const diffDiff = (b.sf - b.sa) - (a.sf - a.sa);
        if (diffDiff !== 0) return diffDiff;
        if (b.sf !== a.sf) return b.sf - a.sf;
        const directMatch = poolQualifMatches.find(
          m => m.status === 'finished' &&
          ((m.player1Id === a.id && m.player2Id === b.id) || (m.player1Id === b.id && m.player2Id === a.id))
        );
        if (directMatch) {
          if (directMatch.player1Id === a.id) {
            if (directMatch.score1 !== directMatch.score2) return directMatch.score2 - directMatch.score1;
          } else {
            if (directMatch.score2 !== directMatch.score1) return directMatch.score1 - directMatch.score2;
          }
        }
        return a.id.localeCompare(b.id);
      });

      const isPoolAllDone = poolQualifMatches.length > 0 && poolQualifMatches.every(m => m.status === 'finished');
      if (isFinalLaunched || isPoolAllDone) {
        sortedPool.slice(0, qualPerPool).forEach(p => { p.isSure = true; });
      } else {
        sortedPool.forEach(p => {
          if (p.played > 0 && p.pts > 0) {
            const competitorsWhoCanTieOrBeat = sortedPool.filter(other => other.id !== p.id && other.maxPossiblePts >= p.pts).length;
            if (competitorsWhoCanTieOrBeat < qualPerPool) {
              p.isSure = true;
            }
          }
        });
      }

      rankingsByPool[pName] = sortedPool;
    });
  }

  // Stats calculation globale (pour poule unique ou combiné)
  const pStats: Record<string, PlayerQualifStat> = {};
  tournament.participants.forEach(pId => {
    pStats[pId] = {
      id: pId,
      name: players?.[pId]?.name || 'Inconnu',
      played: 0,
      totalMatches: 0,
      remainingMatches: 0,
      won: 0,
      lost: 0,
      sf: 0,
      sa: 0,
      pts: 0,
      maxPossiblePts: 0,
      isSure: false
    };
  });

  // Calculate total scheduled matches per player in qualifs
  qualifMatches.forEach(m => {
    if (pStats[m.player1Id] && pStats[m.player2Id]) {
      pStats[m.player1Id].totalMatches++;
      pStats[m.player2Id].totalMatches++;
    }

    if (isRealFinishedMatch(m, players)) {
      const p1 = pStats[m.player1Id];
      const p2 = pStats[m.player2Id];
      if (p1 && p2) {
        p1.played++; p2.played++;
        p1.sf += m.score1; p1.sa += m.score2;
        p2.sf += m.score2; p2.sa += m.score1;
        if (m.score1 > m.score2) {
          p1.won++; p1.pts += 3; p2.lost++;
        } else if (m.score2 > m.score1) {
          p2.won++; p2.pts += 3; p1.lost++;
        } else {
          p1.pts += 1; p2.pts += 1;
        }
      }
    }
  });

  tournament.participants.forEach(pId => {
    const p = pStats[pId];
    p.remainingMatches = Math.max(0, p.totalMatches - p.played);
    p.maxPossiblePts = p.pts + p.remainingMatches * 3;
  });

  let ranking: PlayerQualifStat[] = [];

  if (isMultiPool) {
    // Interleave the pool rankings (1st of A, 1st of B, 2nd of A, 2nd of B...) pour croiser les têtes de série
    const maxPoolSize = Math.max(...poolNames.map(p => rankingsByPool[p]?.length || 0));
    for (let r = 0; r < maxPoolSize; r++) {
      poolNames.forEach(pName => {
        const p = rankingsByPool[pName]?.[r];
        if (p) ranking.push(p);
      });
    }
  } else {
    ranking = Object.values(pStats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffDiff = (b.sf - b.sa) - (a.sf - a.sa);
      if (diffDiff !== 0) return diffDiff;
      if (b.sf !== a.sf) return b.sf - a.sf;
      const directMatch = qualifMatches.find(
        m => m.status === 'finished' &&
        ((m.player1Id === a.id && m.player2Id === b.id) || (m.player1Id === b.id && m.player2Id === a.id))
      );
      if (directMatch) {
        if (directMatch.player1Id === a.id) {
          if (directMatch.score1 !== directMatch.score2) return directMatch.score2 - directMatch.score1;
        } else {
          if (directMatch.score2 !== directMatch.score1) return directMatch.score1 - directMatch.score2;
        }
      }
      return a.id.localeCompare(b.id);
    });

    // Determine "qualifiés sûrs" en poule unique
    if (isFinalLaunched || isQualifAllDone) {
      ranking.slice(0, numQualifiers).forEach(p => {
        p.isSure = true;
      });
    } else {
      ranking.forEach(p => {
        if (p.played > 0 && p.pts > 0) {
          const competitorsWhoCanTieOrBeat = ranking.filter(other => {
            if (other.id === p.id) return false;
            return other.maxPossiblePts >= p.pts;
          }).length;

          if (competitorsWhoCanTieOrBeat < numQualifiers) {
            p.isSure = true;
          }
        }
      });
    }
  }

  const sureQualifiers = ranking.filter(p => p.isSure).map(p => p.id);
  const hasSureQualifiers = isFinalLaunched || isQualifAllDone || sureQualifiers.length > 0;
  const areAllQualifiersKnown = tournament.format === 'direct_ko'
    ? true
    : Boolean(isFinalLaunched || isQualifAllDone || sureQualifiers.length >= numQualifiers);

  return {
    isFinalLaunched,
    isQualifAllDone,
    hasSureQualifiers,
    areAllQualifiersKnown,
    sureQualifiers,
    ranking,
    rankingsByPool,
    poolNames,
    isMultiPool,
    numQualifiers,
    totalQualifMatches,
    finishedQualifMatches
  };
}
