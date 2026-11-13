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
    | 'tournamentsSecond'
    | 'tournamentsThird'
    | 'prestigeWins'
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
    | 'tournamentsSecond'
    | 'tournamentsThird'
    | 'prestigeWins'
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
    tournamentsSecond: 0,
    tournamentsThird: 0,
    prestigeWins: 0,
    points: 0,
    recentForm: []
  };
}

/**
 * Formule officielle des points du classement général du club :
 * - Victoire : +3 pts
 * - Bonus victoire contre un joueur Prestige : +1 pt (soit 4 pts la victoire contre un Prestige)
 * - Participation match : +1 pt par match joué
 * - Bonus Podium Tournoi (Top 3) :
 *   - 🥇 1er du tournoi : +5 pts
 *   - 🥈 2ème du tournoi : +3 pts
 *   - 🥉 3ème du tournoi : +2 pts
 * - Bonus différence de manches positive : +1 pt par manche de différence positive
 */
export function calculatePlayerClubPoints(stats: Partial<PlayerStats>): number {
  const wins = stats.wins || 0;
  const prestigeWins = stats.prestigeWins || 0;
  const matchesPlayed = stats.matchesPlayed || 0;
  const firstPlaces = stats.tournamentsWon || 0;
  const secondPlaces = stats.tournamentsSecond || 0;
  const thirdPlaces = stats.tournamentsThird || 0;
  const positiveSetDiff = Math.max(0, stats.setDiff || 0);

  return (
    (wins * 3) +
    (prestigeWins * 1) +
    matchesPlayed +
    (firstPlaces * 5) +
    (secondPlaces * 3) +
    (thirdPlaces * 2) +
    positiveSetDiff
  );
}

/**
 * Calcule dynamiquement et avec précision toutes les statistiques des joueurs
 * (matchs joués, victoires, bonus vs Prestige, défaites, win rate %, manches gagnées/perdues/diff,
 * podiums de tournoi 1er/2e/3e, bête noire et rival récurrent) à partir de tous les matchs terminés.
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
  const secondTourMap: Record<string, Set<string>> = {};
  const thirdTourMap: Record<string, Set<string>> = {};
  const h2hMap: Record<string, Record<string, { played: number; wins: number; losses: number }>> = {};
  const recentMatchesMap: Record<string, { time: number; won: boolean }[]> = {};

  Object.keys(statsMap).forEach(id => {
    tourMap[id] = new Set();
    wonTourMap[id] = new Set();
    secondTourMap[id] = new Set();
    thirdTourMap[id] = new Set();
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

  const getMatchWinner = (m: Match): string | undefined => {
    if (m.winnerId) return m.winnerId;
    if (m.score1 > m.score2) return m.player1Id;
    if (m.score2 > m.score1) return m.player2Id;
    return undefined;
  };

  const getMatchLoser = (m: Match): string | undefined => {
    const w = getMatchWinner(m);
    if (!w) return undefined;
    return w === m.player1Id ? m.player2Id : m.player1Id;
  };

  const isPlayerPrestige = (playerId: string): boolean => {
    const lvl = players[playerId]?.level;
    return lvl === 'Prestige' || lvl === 'Confirmé';
  };

  // 4. Parcourir chaque match terminé
  finishedMatches.forEach(m => {
    const p1Id = m.player1Id;
    const p2Id = m.player2Id;
    if (!p1Id || !p2Id) return;

    const winnerId = getMatchWinner(m);
    const matchTime = m.endTime || m.startTime || 0;

    // Statut joueur 1
    if (statsMap[p1Id]) {
      const s1 = statsMap[p1Id];
      s1.matchesPlayed++;
      s1.setsWon += (m.score1 || 0);
      s1.setsLost += (m.score2 || 0);
      const won = winnerId === p1Id;
      if (won) {
        s1.wins++;
        if (isPlayerPrestige(p2Id)) {
          s1.prestigeWins++;
        }
      } else if (winnerId === p2Id) {
        s1.losses++;
      }

      recentMatchesMap[p1Id]?.push({ time: matchTime, won });

      if (m.tournamentId) {
        tourMap[p1Id]?.add(m.tournamentId);
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
      if (won) {
        s2.wins++;
        if (isPlayerPrestige(p1Id)) {
          s2.prestigeWins++;
        }
      } else if (winnerId === p1Id) {
        s2.losses++;
      }

      recentMatchesMap[p2Id]?.push({ time: matchTime, won });

      if (m.tournamentId) {
        tourMap[p2Id]?.add(m.tournamentId);
      }

      if (statsMap[p1Id]) {
        if (!h2hMap[p2Id][p1Id]) h2hMap[p2Id][p1Id] = { played: 0, wins: 0, losses: 0 };
        h2hMap[p2Id][p1Id].played++;
        if (won) h2hMap[p2Id][p1Id].wins++;
        else if (winnerId === p1Id) h2hMap[p2Id][p1Id].losses++;
      }
    }
  });

  // 4b. Déterminer le Podium (1er, 2ème, 3ème) pour chaque tournoi
  const allTourIds = new Set<string>();
  finishedMatches.forEach(m => {
    if (m.tournamentId) allTourIds.add(m.tournamentId);
  });
  Object.keys(tournaments || {}).forEach(tId => allTourIds.add(tId));

  allTourIds.forEach(tId => {
    const tourFinished = finishedMatches.filter(m => m.tournamentId === tId);
    if (tourFinished.length === 0) return;

    const allTourMatches = Object.values(matches).filter(m => m && m.tournamentId === tId);

    // Recherche de la Grande Finale
    const finalMatch = tourFinished.find(
      m =>
        m.bracketType === 'grand_final' ||
        ((m.stage === 'final' || m.id.includes('_final_')) && !m.id.includes('_third_place_'))
    );

    let firstId: string | undefined;
    let secondId: string | undefined;
    let thirdId: string | undefined;

    if (finalMatch) {
      firstId = getMatchWinner(finalMatch);
      secondId = getMatchLoser(finalMatch);
    }

    // Recherche de la 3ème place :
    // Cas 1 : Double KO -> le perdant de la Finale Repêchage (bracketType === 'loser' && stage === 'third_place') finit 3ème
    const lbFinal = tourFinished.find(
      m => m.bracketType === 'loser' && (m.stage === 'third_place' || m.id.includes('_third_place_'))
    );
    // Cas 2 : Petite Finale classique -> le gagnant de la Petite Finale finit 3ème
    const thirdPlaceMatch = tourFinished.find(
      m => m.bracketType !== 'loser' && (m.stage === 'third_place' || m.id.includes('_third_place_'))
    );

    if (lbFinal) {
      const candidate3rd = getMatchLoser(lbFinal);
      if (candidate3rd && candidate3rd !== firstId && candidate3rd !== secondId) {
        thirdId = candidate3rd;
      }
    } else if (thirdPlaceMatch) {
      const candidate3rd = getMatchWinner(thirdPlaceMatch);
      if (candidate3rd && candidate3rd !== firstId && candidate3rd !== secondId) {
        thirdId = candidate3rd;
      }
    } else {
      // Cas 3 : Pas de petite finale programmée dans l'arbre, mais demi-finales terminées -> meilleur demi-finaliste perdant
      const hasScheduledThirdPlace = allTourMatches.some(
        m => m.stage === 'third_place' || m.id.includes('_third_place_')
      );
      if (!hasScheduledThirdPlace && finalMatch) {
        const semiMatches = tourFinished.filter(
          m => (m.stage === 'semi' || m.id.includes('_semi_')) && m.bracketType !== 'loser'
        );
        const semiLosers: { id: string; semiScore: number }[] = [];
        semiMatches.forEach(sm => {
          const loser = getMatchLoser(sm);
          if (loser && loser !== firstId && loser !== secondId) {
            const loserScore = loser === sm.player1Id ? (sm.score1 || 0) : (sm.score2 || 0);
            semiLosers.push({ id: loser, semiScore: loserScore });
          }
        });
        if (semiLosers.length > 0) {
          semiLosers.sort((a, b) => {
            if (b.semiScore !== a.semiScore) return b.semiScore - a.semiScore;
            const diffA = (statsMap[a.id]?.setsWon || 0) - (statsMap[a.id]?.setsLost || 0);
            const diffB = (statsMap[b.id]?.setsWon || 0) - (statsMap[b.id]?.setsLost || 0);
            return diffB - diffA;
          });
          thirdId = semiLosers[0].id;
        }
      }
    }

    if (firstId && wonTourMap[firstId]) wonTourMap[firstId].add(tId);
    if (secondId && secondTourMap[secondId]) secondTourMap[secondId].add(tId);
    if (thirdId && thirdTourMap[thirdId]) thirdTourMap[thirdId].add(tId);
  });

  // 5. Finaliser les totaux et rivalités pour chaque joueur
  Object.keys(statsMap).forEach(pId => {
    const s = statsMap[pId];
    s.setDiff = s.setsWon - s.setsLost;
    s.winRate = s.matchesPlayed > 0 ? Math.round((s.wins / s.matchesPlayed) * 1000) / 10 : 0;
    s.tournamentsPlayed = tourMap[pId]?.size || 0;
    s.tournamentsWon = wonTourMap[pId]?.size || 0;
    s.tournamentsSecond = secondTourMap[pId]?.size || 0;
    s.tournamentsThird = thirdTourMap[pId]?.size || 0;

    // Calcul des points selon le nouveau barème officiel
    s.points = calculatePlayerClubPoints(s);

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
      if (!players[oppId]) return;

      if (rec.played > bestFriendMatches) {
        bestFriendMatches = rec.played;
        bestFriendId = oppId;
      }

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

    const pObj = players[pId];
    const resolvedClubName = pObj?.clubName || pObj?.stats?.clubName;
    const resolvedClubLogo = pObj?.clubLogoUrl || pObj?.stats?.clubLogoUrl;
    if (resolvedClubName) s.clubName = resolvedClubName;
    if (resolvedClubLogo) s.clubLogoUrl = resolvedClubLogo;

    result[pId] = {
      ...pObj,
      ...(resolvedClubName ? { clubName: resolvedClubName } : {}),
      ...(resolvedClubLogo ? { clubLogoUrl: resolvedClubLogo } : {}),
      stats: s
    };
  });

  return result;
}
