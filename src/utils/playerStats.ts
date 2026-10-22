import { Match, Player, PlayerStats, Tournament } from '../types';

export type FullPlayerStats = Required<
  Pick<
    PlayerStats,
    | 'matchesPlayed'
    | 'wins'
    | 'losses'
    | 'winRate'
    | 'setsWon'
    | 'setsLost'
    | 'setDiff'
    | 'tournamentsPlayed'
    | 'tournamentsWon'
    | 'points'
  >
> &
  Omit<
    PlayerStats,
    | 'matchesPlayed'
    | 'wins'
    | 'losses'
    | 'winRate'
    | 'setsWon'
    | 'setsLost'
    | 'setDiff'
    | 'tournamentsPlayed'
    | 'tournamentsWon'
    | 'points'
  >;

export function createDefaultPlayerStats(): FullPlayerStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    setsWon: 0,
    setsLost: 0,
    setDiff: 0,
    tournamentsPlayed: 0,
    tournamentsWon: 0,
    points: 0,
    recentForm: []
  };
}

/**
 * Calcule dynamiquement et avec précision toutes les statistiques des joueurs
 * (matchs joués, victoires, défaites, win rate %, manches gagnées/perdues/diff,
 * titres de tournoi, bête noire et rival récurrent) à partir de tous les matchs terminés.
 */
export function computeAllPlayersStats(
  players: Record<string, Player>,
  matches: Record<string, Match>,
  tournaments: Record<string, Tournament> = {}
): Record<string, Player> {
  const result: Record<string, Player> = {};
  const statsMap: Record<string, FullPlayerStats> = {};

  // 1. Initialiser chaque joueur avec des stats à zéro
  Object.values(players).forEach(p => {
    if (!p || !p.id) return;
    statsMap[p.id] = createDefaultPlayerStats();
  });

  // 2. Structures de données annexes
  const tourMap: Record<string, Set<string>> = {};
  const wonTourMap: Record<string, Set<string>> = {};
  const h2hMap: Record<string, Record<string, { played: number; wins: number; losses: number }>> = {};
  const recentMatchesMap: Record<string, { time: number; won: boolean }[]> = {};

  Object.keys(statsMap).forEach(id => {
    tourMap[id] = new Set();
    wonTourMap[id] = new Set();
    h2hMap[id] = {};
    recentMatchesMap[id] = [];
  });

  // 2b. Comptabiliser les inscriptions aux tournois passés
  if (tournaments) {
    Object.values(tournaments).forEach(t => {
      if (t && t.participants && Array.isArray(t.participants)) {
        t.participants.forEach(pId => {
          if (tourMap[pId]) {
            tourMap[pId].add(t.id);
          }
        });
      }
    });
  }

  // 3. Filtrer et ordonner tous les matchs terminés
  const finishedMatches = Object.values(matches).filter(m => {
    if (!m) return false;
    if (m.status !== 'finished') return false;
    if (!m.player1Id || !m.player2Id) return false;
    if (m.player2Id === 'BYE' || m.player1Id === 'BYE') return false;
    if (m.player1Id.toUpperCase().includes('BYE') || m.player2Id.toUpperCase().includes('BYE')) return false;
    if (m.player1Id.toUpperCase().includes('BLANC') || m.player2Id.toUpperCase().includes('BLANC')) return false;
    return true;
  });

  finishedMatches.sort((a, b) => (a.endTime || a.startTime || 0) - (b.endTime || b.startTime || 0));

  // 4. Parcourir chaque match terminé
  finishedMatches.forEach(m => {
    const p1Id = m.player1Id;
    const p2Id = m.player2Id;
    if (!p1Id || !p2Id) return;

    let winnerId = m.winnerId;
    if (!winnerId) {
      if (m.score1 > m.score2) winnerId = p1Id;
      else if (m.score2 > m.score1) winnerId = p2Id;
    }

    const matchTime = m.endTime || m.startTime || 0;

    // Statut joueur 1
    if (statsMap[p1Id]) {
      const s1 = statsMap[p1Id];
      s1.matchesPlayed++;
      s1.setsWon += (m.score1 || 0);
      s1.setsLost += (m.score2 || 0);
      const won = winnerId === p1Id;
      if (won) s1.wins++;
      else if (winnerId === p2Id) s1.losses++;

      recentMatchesMap[p1Id]?.push({ time: matchTime, won });

      if (m.tournamentId) {
        tourMap[p1Id]?.add(m.tournamentId);
        const isFinal = (m.stage === 'final' || m.id.includes('_final_')) && !m.id.includes('_third_place_');
        if (isFinal && won) {
          wonTourMap[p1Id]?.add(m.tournamentId);
        }
      }

      if (statsMap[p2Id]) {
        if (!h2hMap[p1Id][p2Id]) h2hMap[p1Id][p2Id] = { played: 0, wins: 0, losses: 0 };
        h2hMap[p1Id][p2Id].played++;
        if (won) h2hMap[p1Id][p2Id].wins++;
        else if (winnerId === p2Id) h2hMap[p1Id][p2Id].losses++;
      }
    }

    // Statut joueur 2
    if (statsMap[p2Id]) {
      const s2 = statsMap[p2Id];
      s2.matchesPlayed++;
      s2.setsWon += (m.score2 || 0);
      s2.setsLost += (m.score1 || 0);
      const won = winnerId === p2Id;
      if (won) s2.wins++;
      else if (winnerId === p1Id) s2.losses++;

      recentMatchesMap[p2Id]?.push({ time: matchTime, won });

      if (m.tournamentId) {
        tourMap[p2Id]?.add(m.tournamentId);
        const isFinal = (m.stage === 'final' || m.id.includes('_final_')) && !m.id.includes('_third_place_');
        if (isFinal && won) {
          wonTourMap[p2Id]?.add(m.tournamentId);
        }
      }

      if (statsMap[p1Id]) {
        if (!h2hMap[p2Id][p1Id]) h2hMap[p2Id][p1Id] = { played: 0, wins: 0, losses: 0 };
        h2hMap[p2Id][p1Id].played++;
        if (won) h2hMap[p2Id][p1Id].wins++;
        else if (winnerId === p1Id) h2hMap[p2Id][p1Id].losses++;
      }
    }
  });

  // 5. Finaliser les totaux et rivalités pour chaque joueur
  Object.keys(statsMap).forEach(pId => {
    const s = statsMap[pId];
    s.setDiff = s.setsWon - s.setsLost;
    s.winRate = s.matchesPlayed > 0 ? Math.round((s.wins / s.matchesPlayed) * 1000) / 10 : 0;
    s.tournamentsPlayed = tourMap[pId]?.size || 0;
    s.tournamentsWon = wonTourMap[pId]?.size || 0;
    // Points club : 3 pts / victoire + 1 pt / match disputé + 10 pts / tournoi gagné + bonus diff manches positives
    s.points = (s.wins * 3) + s.matchesPlayed + (s.tournamentsWon * 10) + Math.max(0, s.setDiff);

    // Forme récente (derniers 5 matchs)
    const recents = recentMatchesMap[pId] || [];
    s.recentForm = recents.slice(-5).map(r => r.won ? 'W' : 'L');

    // Rivalités H2H (Bête Noire & Partenaire / Rival le plus fréquent)
    const opponents = h2hMap[pId] || {};
    let nemesisId: string | undefined = undefined;
    let nemesisLosses = 0;
    let nemesisLossRate = 0;

    let bestFriendId: string | undefined = undefined;
    let bestFriendMatches = 0;

    Object.entries(opponents).forEach(([oppId, rec]) => {
      // Ignorer si le joueur adversaire n'existe plus
      if (!players[oppId]) return;

      // Adversaire le plus affronté
      if (rec.played > bestFriendMatches) {
        bestFriendMatches = rec.played;
        bestFriendId = oppId;
      }

      // Bête noire (le plus de défaites subies)
      if (rec.losses > 0) {
        const lossRate = Math.round((rec.losses / rec.played) * 1000) / 10;
        if (rec.losses > nemesisLosses || (rec.losses === nemesisLosses && lossRate > nemesisLossRate)) {
          nemesisLosses = rec.losses;
          nemesisLossRate = lossRate;
          nemesisId = oppId;
        }
      }
    });

    s.nemesisId = nemesisId;
    s.nemesisLosses = nemesisLosses > 0 ? nemesisLosses : undefined;
    s.nemesisLossRate = nemesisId ? nemesisLossRate : undefined;
    s.bestFriendId = bestFriendId;
    s.bestFriendMatches = bestFriendMatches > 0 ? bestFriendMatches : undefined;

    result[pId] = {
      ...players[pId],
      stats: s
    };
  });

  return result;
}
