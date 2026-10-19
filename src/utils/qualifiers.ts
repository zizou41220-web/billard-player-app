import { Tournament, Match } from '../types';

export type PlayerQualifStat = {
  id: string;
  name?: string;
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

import { isFinalStageMatch } from './bracket';

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
      sureQualifiers: [] as string[],
      ranking: [] as PlayerQualifStat[],
      numQualifiers: 4,
      totalQualifMatches: 0,
      finishedQualifMatches: 0
    };
  }

  const allTourMatches = tournament.matches.map(id => matches[id]).filter(Boolean);
  const qualifMatches = allTourMatches.filter(m => !isFinalStageMatch(m));
  const finalMatches = allTourMatches.filter(isFinalStageMatch);

  const isFinalLaunched = Boolean(
    tournament.finalStageLaunched ||
    tournament.settings?.finalStageLaunched ||
    finalMatches.length > 0
  );
  const totalQualifMatches = qualifMatches.length;
  const finishedQualifMatches = qualifMatches.filter(m => m.status === 'finished').length;
  const isQualifAllDone = totalQualifMatches > 0 && finishedQualifMatches === totalQualifMatches;

  const reqQualifiers = tournament.settings?.qualifNbQualifiers || 4;
  const participantsCount = tournament.participants.length;

  // Supporte 2, 4, 8, 16, 32, 64, 128 qualifiés (ou tout nombre intermédiaire avec gestion des Blancs)
  const numQualifiers = participantsCount < 2 ? participantsCount : Math.min(Math.max(2, reqQualifiers), participantsCount);

  // Stats calculation
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
    if (pStats[m.player1Id]) pStats[m.player1Id].totalMatches++;
    if (pStats[m.player2Id]) pStats[m.player2Id].totalMatches++;

    if (m.status === 'finished') {
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

  const ranking = Object.values(pStats).sort((a, b) => {
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

  // Determine "qualifiés sûrs"
  if (isFinalLaunched || isQualifAllDone) {
    ranking.slice(0, numQualifiers).forEach(p => {
      p.isSure = true;
    });
  } else {
    // A player is sure if they have played at least 1 match, have points > 0,
    // and strictly fewer than `numQualifiers` other players can possibly reach or exceed their current points
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

  const sureQualifiers = ranking.filter(p => p.isSure).map(p => p.id);
  const hasSureQualifiers = isFinalLaunched || isQualifAllDone || sureQualifiers.length > 0;

  return {
    isFinalLaunched,
    isQualifAllDone,
    hasSureQualifiers,
    sureQualifiers,
    ranking,
    numQualifiers,
    totalQualifMatches,
    finishedQualifMatches
  };
}
