import { Match, Player } from '../types';
import { isByeMatch } from './bracket';

export type HistoryEntry = {
  matchId: string;
  opponentId: string;
  won: boolean;
  setsFor: number;
  setsAgainst: number;
  time: number;
  stage?: string;
  tournamentId?: string;
};

export type H2HEntry = {
  opponentId: string;
  played: number;
  wins: number;
  losses: number;
};

export type Badge = {
  id: string;
  icon: string;
  label: string;
  description: string;
  color: string;
};

/**
 * Historique chronologique (ancien -> récent) des matchs terminés d'un joueur.
 * Les "Blancs" (byes) et matchs sans adversaire réel sont ignorés.
 */
export function getPlayerHistory(
  playerId: string,
  matches: Record<string, Match>,
  players: Record<string, Player>
): HistoryEntry[] {
  const list: HistoryEntry[] = [];
  Object.values(matches).forEach(m => {
    if (!m || m.status !== 'finished') return;
    if (m.player1Id !== playerId && m.player2Id !== playerId) return;
    if (isByeMatch(m)) return;
    const isP1 = m.player1Id === playerId;
    const opponentId = isP1 ? m.player2Id : m.player1Id;
    if (!opponentId || !players[opponentId]) return;
    const setsFor = isP1 ? m.score1 : m.score2;
    const setsAgainst = isP1 ? m.score2 : m.score1;
    const won = m.winnerId ? m.winnerId === playerId : setsFor > setsAgainst;
    list.push({
      matchId: m.id,
      opponentId,
      won,
      setsFor,
      setsAgainst,
      time: m.endTime || m.startTime || 0,
      stage: m.stage,
      tournamentId: m.tournamentId
    });
  });
  return list.sort((a, b) => a.time - b.time);
}

/** Courbe de forme : taux de victoire cumulé après chaque match. */
export function getFormCurve(history: HistoryEntry[], last = 15): Array<{ index: number; rate: number; won: boolean }> {
  let wins = 0;
  const all = history.map((h, i) => {
    if (h.won) wins++;
    return { index: i, rate: Math.round((wins / (i + 1)) * 100), won: h.won };
  });
  return all.slice(-last);
}

/** Bilan face à face contre chaque adversaire (trié par nombre de matchs). */
export function getH2H(history: HistoryEntry[]): H2HEntry[] {
  const map: Record<string, H2HEntry> = {};
  history.forEach(h => {
    if (!map[h.opponentId]) map[h.opponentId] = { opponentId: h.opponentId, played: 0, wins: 0, losses: 0 };
    map[h.opponentId].played++;
    if (h.won) map[h.opponentId].wins++;
    else map[h.opponentId].losses++;
  });
  return Object.values(map).sort((a, b) => b.played - a.played || b.wins - a.wins);
}

export function getCurrentStreak(history: HistoryEntry[]): { type: 'W' | 'L' | null; length: number } {
  if (history.length === 0) return { type: null, length: 0 };
  const lastWon = history[history.length - 1].won;
  let len = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].won === lastWon) len++;
    else break;
  }
  return { type: lastWon ? 'W' : 'L', length: len };
}

export function getBestWinStreak(history: HistoryEntry[]): number {
  let best = 0;
  let cur = 0;
  history.forEach(h => {
    if (h.won) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  });
  return best;
}

export function getBadges(history: HistoryEntry[], player: Player): Badge[] {
  const badges: Badge[] = [];
  const stats = player.stats;
  const bestStreak = getBestWinStreak(history);
  const streak = getCurrentStreak(history);

  if (streak.type === 'W' && streak.length >= 3) {
    badges.push({
      id: 'hot',
      icon: '🔥',
      label: `En feu x${streak.length}`,
      description: `${streak.length} victoires consécutives en cours`,
      color: '#fb923c'
    });
  }
  if (bestStreak >= 5) {
    badges.push({
      id: 'streak5',
      icon: '⚡',
      label: 'Série de 5',
      description: `Meilleure série : ${bestStreak} victoires d'affilée`,
      color: '#facc15'
    });
  }
  if (history.some(h => h.won && h.setsAgainst === 0 && h.setsFor >= 2)) {
    badges.push({
      id: 'perfect',
      icon: '🎯',
      label: 'Sans faute',
      description: 'Au moins une victoire sans perdre une manche',
      color: '#34d399'
    });
  }
  if (history.some(h => h.won && h.stage === 'final')) {
    badges.push({
      id: 'finalwin',
      icon: '🏆',
      label: 'Vainqueur de finale',
      description: 'A remporté une finale de tournoi',
      color: '#fbbf24'
    });
  }
  if ((stats.tournamentsWon || 0) >= 1) {
    badges.push({
      id: 'champion',
      icon: '🥇',
      label: `Champion x${stats.tournamentsWon}`,
      description: 'Titre(s) de tournoi remporté(s)',
      color: '#ffd700'
    });
  }
  if ((stats.prestigeWins || 0) >= 3) {
    badges.push({
      id: 'giantkiller',
      icon: '🗡️',
      label: 'Tueur de Prestige',
      description: `${stats.prestigeWins} victoires contre des joueurs Prestige`,
      color: '#a78bfa'
    });
  }
  if (history.length >= 20) {
    badges.push({
      id: 'veteran',
      icon: '🎱',
      label: 'Vétéran',
      description: `${history.length} matchs disputés`,
      color: '#38bdf8'
    });
  }
  if (history.length >= 5 && (stats.winRate || 0) >= 70) {
    badges.push({
      id: 'dominant',
      icon: '👑',
      label: 'Dominateur',
      description: `${stats.winRate}% de victoires`,
      color: '#f472b6'
    });
  }
  return badges;
}
