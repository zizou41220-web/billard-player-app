import { create } from 'zustand';
import { Club, Player, PlayerLevel, Table, Match, Tournament, TournamentFormat, TournamentSettings } from './types';
import { getMatchHandicap } from './utils/handicap';
import { getTournamentQualificationStatus } from './utils/qualifiers';

interface AppState {
  currentClub: Club;
  currentUser: string; // The ID of the connected player
  players: Record<string, Player>;
  tables: Record<string, Table>;
  matches: Record<string, Match>;
  tournaments: Record<string, Tournament>;
  activeMatchId: string | null; // If the current user is playing

  // Actions
  setClub: (club: Partial<Club>) => void;
  addPlayer: (name: string, level: PlayerLevel, photoUrl?: string) => void;
  updatePlayer: (id: string, name: string, level: PlayerLevel, photoUrl?: string) => void;
  deletePlayer: (id: string) => void;
  createTournament: (name: string, format: TournamentFormat, settings: TournamentSettings, participants: string[]) => void;
  startTournamentMatch: (matchId: string, asCurrentUser?: boolean) => void;
  updateScore: (playerId: string, delta: number) => void;
  updateMatchScore: (matchId: string, score1: number, score2: number) => void;
  updateFinishedMatchScore: (matchId: string, score1: number, score2: number) => void;
  assignMatchToTable: (matchId: string, tableId: string) => { success: boolean; reason?: string };
  finishMatch: (matchId?: string) => void;
  freeTable: (tableId: string) => void;
  updateTablePosition: (tableId: string, x: number, y: number) => void;
  addTable: (name: string) => void;
  removeTable: (tableId: string) => void;
  postponeMatch: (matchId: string, replacementMatchId?: string) => void;
  launchFinalStage: (tournamentId: string, hasThirdPlaceMatch?: boolean) => void;
  reseedFinalStage: (tournamentId: string) => void;
  toggleThirdPlaceMatch: (tournamentId: string) => void;
  endTournament: (tournamentId: string) => void;
  deleteTournament: (tournamentId: string) => void;
  autoDispatchMatches: () => void;
}

const getInitialClub = (): Club => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const clubParam = params.get('club');
    if (clubParam) {
      const savedName = localStorage.getItem(`mb_club_name_${clubParam}`);
      return {
        id: clubParam,
        name: savedName || (clubParam === 'bc41' ? 'Billard Club 41' : `Club ${clubParam.toUpperCase()}`),
        logoUrl: localStorage.getItem(`mb_club_logo_${clubParam}`) || '/logo.png'
      };
    }
    const savedId = localStorage.getItem('mb_current_club_id');
    if (savedId) {
      return {
        id: savedId,
        name: localStorage.getItem(`mb_club_name_${savedId}`) || (savedId === 'bc41' ? 'Billard Club 41' : `Club ${savedId.toUpperCase()}`),
        logoUrl: localStorage.getItem(`mb_club_logo_${savedId}`) || '/logo.png'
      };
    }
  }
  return {
    id: 'bc41',
    name: 'Billard Club 41',
    logoUrl: '/logo.png'
  };
};

const MOCK_PLAYERS: Record<string, Player> = {
  'p1': { id: 'p1', clubId: 'bc41', name: 'Sébastien T.', level: 'Prestige', avatarUrl: 'https://i.pravatar.cc/150?u=p1', stats: { matchesPlayed: 142, wins: 89, winRate: 62.6, nemesisId: 'p3', bestFriendId: 'p2' } },
  'p2': { id: 'p2', clubId: 'bc41', name: 'Alexandre D.', level: 'Amateur', avatarUrl: 'https://i.pravatar.cc/150?u=p2', stats: { matchesPlayed: 98, wins: 45, winRate: 45.9 } },
  'p3': { id: 'p3', clubId: 'bc41', name: 'Maxime R.', level: 'Prestige', avatarUrl: 'https://i.pravatar.cc/150?u=p3', stats: { matchesPlayed: 210, wins: 156, winRate: 74.2 } },
  'p4': { id: 'p4', clubId: 'bc41', name: 'Sophie L.', level: 'Amateur', avatarUrl: 'https://i.pravatar.cc/150?u=p4', stats: { matchesPlayed: 56, wins: 30, winRate: 53.5 } },
};

const MOCK_TABLES: Record<string, Table> = {
  't1': { id: 't1', clubId: 'bc41', number: 1, name: 'Billard 1', status: 'free', x: 20, y: 20 },
  't2': { id: 't2', clubId: 'bc41', number: 2, name: 'Billard 2', status: 'free', x: 50, y: 20 },
  't3': { id: 't3', clubId: 'bc41', number: 3, name: 'Billard 3', status: 'free', x: 80, y: 20 },
};

const MOCK_MATCHES: Record<string, Match> = {};

const MOCK_TOURNAMENTS: Record<string, Tournament> = {};

export const healAndAdvanceBracketMatches = (
  matches: Record<string, Match>,
  tournaments: Record<string, Tournament>,
  players: Record<string, Player> = {}
): { matches: Record<string, Match>; updated: boolean } => {
  let updated = false;
  const newMatches = { ...matches };

  const finalStageTournaments = Object.values(tournaments).filter(
    t => t && (t.finalStageLaunched || t.settings?.finalStageLaunched || t.status === 'ongoing')
  );

  for (const tour of finalStageTournaments) {
    const tourMatches = Object.values(newMatches).filter(m => m.tournamentId === tour.id || tour.matches?.includes(m.id));
    if (tourMatches.length === 0) continue;

    const quarters = tourMatches
      .filter(m => m.stage === 'quarter' || m.id.includes('_quarter_'))
      .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
    const semis = tourMatches
      .filter(m => m.stage === 'semi' || m.id.includes('_semi_'))
      .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
    const final = tourMatches.find(m => (m.stage === 'final' || m.id.includes('_final_')) && !m.id.includes('_third_place_'));
    const thirdPlace = tourMatches.find(m => m.stage === 'third_place' || m.id.includes('_third_place_'));

    const getWinner = (m?: Match) => {
      if (!m || m.status !== 'finished') return undefined;
      return m.winnerId || (m.score1 > m.score2 ? m.player1Id : (m.score2 > m.score1 ? m.player2Id : undefined));
    };

    const getLoser = (m?: Match) => {
      if (!m || m.status !== 'finished') return undefined;
      const w = getWinner(m);
      if (!w) return undefined;
      return w === m.player1Id ? m.player2Id : m.player1Id;
    };

    // 1. Quarters -> Semis
    if (quarters.length === 4 && semis.length >= 2) {
      const qWinners = quarters.map(q => getWinner(q));
      const semi1 = semis.find(s => s.bracketPosition === 0 || s.id.includes('_semi_1_')) || semis[0];
      const semi2 = semis.find(s => s.bracketPosition === 1 || s.id.includes('_semi_2_')) || semis[1];

      if (semi1 && semi1.status === 'pending') {
        const p1 = qWinners[0] || semi1.player1Id;
        const p2 = qWinners[1] || semi1.player2Id;
        if (p1 !== semi1.player1Id || p2 !== semi1.player2Id) {
          const { h1, h2 } = getMatchHandicap(players[p1]?.level, players[p2]?.level, tour.settings?.handicapAmateurSets);
          newMatches[semi1.id] = {
            ...semi1,
            player1Id: p1 || '',
            player2Id: p2 || '',
            score1: (p1 && p2) ? h1 : semi1.score1,
            score2: (p1 && p2) ? h2 : semi1.score2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
          updated = true;
        }
      }

      if (semi2 && semi2.status === 'pending') {
        const p1 = qWinners[2] || semi2.player1Id;
        const p2 = qWinners[3] || semi2.player2Id;
        if (p1 !== semi2.player1Id || p2 !== semi2.player2Id) {
          const { h1, h2 } = getMatchHandicap(players[p1]?.level, players[p2]?.level, tour.settings?.handicapAmateurSets);
          newMatches[semi2.id] = {
            ...semi2,
            player1Id: p1 || '',
            player2Id: p2 || '',
            score1: (p1 && p2) ? h1 : semi2.score1,
            score2: (p1 && p2) ? h2 : semi2.score2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
          updated = true;
        }
      }
    }

    // 2. Semis -> Final & Petite Finale
    if (semis.length >= 2) {
      const semi1 = semis.find(s => s.bracketPosition === 0 || s.id.includes('_semi_1_')) || semis[0];
      const semi2 = semis.find(s => s.bracketPosition === 1 || s.id.includes('_semi_2_')) || semis[1];

      const s1Winner = getWinner(semi1);
      const s2Winner = getWinner(semi2);
      const s1Loser = getLoser(semi1);
      const s2Loser = getLoser(semi2);

      // Finale du Tournoi
      if (final && final.status === 'pending') {
        const p1 = s1Winner || final.player1Id;
        const p2 = s2Winner || final.player2Id;
        if (p1 !== final.player1Id || p2 !== final.player2Id) {
          const { h1, h2 } = getMatchHandicap(players[p1]?.level, players[p2]?.level, tour.settings?.handicapAmateurSets);
          newMatches[final.id] = {
            ...final,
            player1Id: p1 || '',
            player2Id: p2 || '',
            score1: (p1 && p2) ? h1 : final.score1,
            score2: (p1 && p2) ? h2 : final.score2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
          updated = true;
        }
      }

      // Petite Finale (3ème place)
      if (thirdPlace && thirdPlace.status === 'pending') {
        const p1 = s1Loser || thirdPlace.player1Id;
        const p2 = s2Loser || thirdPlace.player2Id;
        if (p1 !== thirdPlace.player1Id || p2 !== thirdPlace.player2Id) {
          const { h1, h2 } = getMatchHandicap(players[p1]?.level, players[p2]?.level, tour.settings?.handicapAmateurSets);
          newMatches[thirdPlace.id] = {
            ...thirdPlace,
            player1Id: p1 || '',
            player2Id: p2 || '',
            score1: (p1 && p2) ? h1 : thirdPlace.score1,
            score2: (p1 && p2) ? h2 : thirdPlace.score2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
          updated = true;
        }
      }
    }
  }

  return { matches: newMatches, updated };
};

export const dispatchTournamentMatches = (
  tables: Record<string, Table>,
  matches: Record<string, Match>,
  tournaments: Record<string, Tournament>,
  tournamentId?: string,
  players: Record<string, Player> = {}
): { tables: Record<string, Table>; matches: Record<string, Match> } => {
  const newTables = { ...tables };
  const newMatches = { ...matches };

  // =========================================================================
  // 0. AUTO-HEAL & ADVANCE FINAL STAGE BRACKET MATCHES
  // =========================================================================
  const bracketHealing = healAndAdvanceBracketMatches(newMatches, tournaments, players);
  if (bracketHealing.updated) {
    Object.assign(newMatches, bracketHealing.matches);
  }

  // =========================================================================
  // 1. AUTO-HEALING & SANITIZATION OF STALE / DUPLICATE TABLE ASSIGNMENTS
  // =========================================================================
  // Rule A0: Clean any finished match that still has a tableId
  Object.keys(newMatches).forEach(mId => {
    if (newMatches[mId].status === 'finished' && newMatches[mId].tableId) {
      newMatches[mId] = { ...newMatches[mId], tableId: undefined };
    }
  });

  // Rule A: Each table can have at most ONE match assigned to it
  Object.keys(newTables).forEach(tId => {
    const table = newTables[tId];
    const assignedMatches = Object.values(newMatches).filter(m => m.tableId === tId && m.status !== 'finished');

    if (assignedMatches.length > 1) {
      // Prioritize: playing > currentMatchId > first
      const keeper = assignedMatches.find(m => m.status === 'playing')
        || assignedMatches.find(m => m.id === table.currentMatchId)
        || assignedMatches[0];

      assignedMatches.forEach(m => {
        if (m.id !== keeper.id) {
          newMatches[m.id] = { ...m, tableId: undefined };
        }
      });
      newTables[tId] = { ...table, status: keeper.status === 'playing' ? 'occupied' : 'occupied', currentMatchId: keeper.id };
    } else if (assignedMatches.length === 1) {
      const single = assignedMatches[0];
      if (table.currentMatchId !== single.id || table.status === 'free') {
        newTables[tId] = { ...table, status: 'occupied', currentMatchId: single.id };
      }
    } else if (table.currentMatchId && (!newMatches[table.currentMatchId] || newMatches[table.currentMatchId].status === 'finished')) {
      newTables[tId] = { ...table, status: 'free', currentMatchId: undefined };
    }
  });

  // Rule B: A player can be in at most ONE active table match across all tables
  const playerSeen = new Set<string>();
  // Process playing matches first
  Object.values(newMatches).filter(m => m.status === 'playing' && Boolean(m.tableId)).forEach(m => {
    if (m.player1Id) playerSeen.add(m.player1Id);
    if (m.player2Id) playerSeen.add(m.player2Id);
  });
  // Process pending table matches
  Object.values(newMatches).filter(m => m.status === 'pending' && Boolean(m.tableId)).forEach(m => {
    const p1Conflict = m.player1Id && playerSeen.has(m.player1Id);
    const p2Conflict = m.player2Id && playerSeen.has(m.player2Id);
    if (p1Conflict || p2Conflict) {
      // Duplicate player on multiple tables: unassign this pending match
      newMatches[m.id] = { ...m, tableId: undefined };
      if (m.tableId && newTables[m.tableId]?.currentMatchId === m.id) {
        newTables[m.tableId] = { ...newTables[m.tableId], status: 'free', currentMatchId: undefined };
      }
    } else {
      if (m.player1Id) playerSeen.add(m.player1Id);
      if (m.player2Id) playerSeen.add(m.player2Id);
    }
  });

  // =========================================================================
  // 2. DISPATCH READY MATCHES TO FREE TABLES
  // =========================================================================
  const targetTournaments = tournamentId
    ? [tournaments[tournamentId]].filter(Boolean)
    : Object.values(tournaments).filter(t => t && t.status === 'ongoing');

  for (const tournament of targetTournaments) {
    if (!tournament.settings?.tableIds || tournament.settings.tableIds.length === 0) continue;

    const tournamentTableIds = tournament.settings.tableIds;

    // Detach any foreign or obsolete matches not belonging to this tournament from tournament tables
    tournamentTableIds.forEach(tId => {
      const t = newTables[tId];
      if (!t) return;
      if (t.currentMatchId) {
        const curM = newMatches[t.currentMatchId];
        if (!curM || curM.tournamentId !== tournament.id) {
          if (curM) {
            newMatches[curM.id] = { ...curM, tableId: undefined, status: curM.status === 'playing' ? 'finished' : curM.status };
          }
          newTables[tId] = { ...t, status: 'free', currentMatchId: undefined };
        }
      }
      Object.values(newMatches).forEach(m => {
        if (m.tableId === tId && m.tournamentId !== tournament.id) {
          newMatches[m.id] = { ...m, tableId: undefined, status: m.status === 'playing' ? 'finished' : m.status };
        }
      });
    });

    // Available tables that are truly free (no match assigned to tableId and no active currentMatchId)
    const availableTables = tournamentTableIds
      .map(tId => newTables[tId])
      .filter(t => {
        if (!t) return false;
        if (t.status === 'occupied' && t.currentMatchId && newMatches[t.currentMatchId]?.status !== 'finished') return false;
        const hasAssignedMatch = Object.values(newMatches).some(m => m.tournamentId === tournament.id && m.tableId === t.id && m.status !== 'finished');
        return !hasAssignedMatch;
      })
      .sort((a, b) => a.number - b.number);

    if (availableTables.length === 0) continue;

    const isPlayerBusy = (playerId: string) => {
      if (!playerId) return false;
      return Object.values(newMatches).some(m => {
        if (m.status === 'finished') return false;
        const hasTable = Boolean(m.tableId) || Object.values(newTables).some(t => t.currentMatchId === m.id && t.status !== 'free');
        return hasTable && (m.player1Id === playerId || m.player2Id === playerId);
      });
    };

    const playCount: Record<string, number> = {};
    tournament.matches.forEach(mId => {
      const m = newMatches[mId];
      if (m && m.status !== 'pending') {
        playCount[m.player1Id] = (playCount[m.player1Id] || 0) + 1;
        playCount[m.player2Id] = (playCount[m.player2Id] || 0) + 1;
      }
    });

    for (const table of availableTables) {
      // Find all ready pending matches whose players are not busy
      const eligibleMatchIds = tournament.matches.filter(id => {
        const m = newMatches[id];
        if (!m) return false;
        // CRITICAL: MUST be pending and NOT already assigned to any table
        if (m.status !== 'pending' || m.tableId) return false;
        // MUST have both players defined
        if (!m.player1Id || !m.player2Id) return false;

        const isFinalStageActive = Boolean(tournament.finalStageLaunched || tournament.settings?.finalStageLaunched);
        const getMatchStage = (matchObj: Match): string => {
          if (matchObj.stage) return matchObj.stage;
          if (matchObj.id?.includes('_final_')) return 'final';
          if (matchObj.id?.includes('_semi_')) return 'semi';
          if (matchObj.id?.includes('_quarter_')) return 'quarter';
          return 'qualif';
        };

        // If final stage launched, do not dispatch unplayed qualif matches
        if (isFinalStageActive && getMatchStage(m) === 'qualif') return false;
        return (
          !isPlayerBusy(m.player1Id) &&
          !isPlayerBusy(m.player2Id)
        );
      }).sort((a, b) => {
        const ma = newMatches[a];
        const mb = newMatches[b];

        const isFinalStageActive = Boolean(tournament.finalStageLaunched || tournament.settings?.finalStageLaunched);
        const getMatchStage = (matchObj: Match): string => {
          if (matchObj.stage) return matchObj.stage;
          if (matchObj.id?.includes('_final_')) return 'final';
          if (matchObj.id?.includes('_semi_')) return 'semi';
          if (matchObj.id?.includes('_quarter_')) return 'quarter';
          return 'qualif';
        };

        // 1. Stage priority: when final stage is launched, quarter/semi/final take precedence!
        const stagePriority: Record<string, number> = isFinalStageActive
          ? { quarter: 1, semi: 2, third_place: 3, final: 4, qualif: 999 }
          : { qualif: 1, quarter: 2, semi: 3, third_place: 4, final: 5 };
        const sA = stagePriority[getMatchStage(ma)] || 1;
        const sB = stagePriority[getMatchStage(mb)] || 1;
        if (sA !== sB) return sA - sB;

        // 2. Bracket round if defined
        if (ma.bracketRound !== undefined && mb.bracketRound !== undefined && ma.bracketRound !== mb.bracketRound) {
          return ma.bracketRound - mb.bracketRound;
        }

        // 3. Player fairness (fewest matches played)
        const pa = (playCount[ma.player1Id] || 0) + (playCount[ma.player2Id] || 0);
        const pb = (playCount[mb.player1Id] || 0) + (playCount[mb.player2Id] || 0);
        if (pa !== pb) return pa - pb;

        // 4. Preserve original match order in tournament
        return tournament.matches.indexOf(a) - tournament.matches.indexOf(b);
      });

      if (eligibleMatchIds.length > 0) {
        const nextMatchId = eligibleMatchIds[0];

        // Ensure no other match points to this table
        Object.values(newMatches).forEach(m => {
          if (m.tableId === table.id && m.id !== nextMatchId) {
            newMatches[m.id] = { ...m, tableId: undefined };
          }
        });

        newMatches[nextMatchId] = {
          ...newMatches[nextMatchId],
          tableId: table.id,
          status: 'pending'
        };
        newTables[table.id] = {
          ...table,
          status: 'occupied',
          currentMatchId: nextMatchId
        };
      }
    }
  }

  return { tables: newTables, matches: newMatches };
};

export const useStore = create<AppState>((set, get) => ({
  currentClub: getInitialClub(),
  currentUser: 'p1',
  players: MOCK_PLAYERS,
  tables: MOCK_TABLES,
  matches: MOCK_MATCHES,
  tournaments: MOCK_TOURNAMENTS,
  activeMatchId: null,

  setClub: (updated) => {
    set((state) => {
      const nextClub = { ...state.currentClub, ...updated };
      if (typeof window !== 'undefined') {
        localStorage.setItem('mb_current_club_id', nextClub.id);
        localStorage.setItem(`mb_club_name_${nextClub.id}`, nextClub.name);
        if (nextClub.logoUrl) {
          localStorage.setItem(`mb_club_logo_${nextClub.id}`, nextClub.logoUrl);
        }
        const url = new URL(window.location.href);
        if (url.searchParams.get('club') !== nextClub.id) {
          url.searchParams.set('club', nextClub.id);
          window.history.replaceState({}, '', url.toString());
        }
      }
      return { currentClub: nextClub };
    });
  },

  addPlayer: (name, level, photoUrl) => {
    const id = `p_${Date.now()}`;
    set((state) => ({
      players: {
        ...state.players,
        [id]: {
          id,
          clubId: state.currentClub.id,
          name,
          level,
          avatarUrl: photoUrl || `https://i.pravatar.cc/150?u=${id}`,
          stats: { matchesPlayed: 0, wins: 0, winRate: 0 }
        }
      }
    }));
  },

  updatePlayer: (id, name, level, photoUrl) => {
    set((state) => {
      const player = state.players[id];
      if (!player) return state;
      return {
        players: {
          ...state.players,
          [id]: {
            ...player,
            name,
            level,
            avatarUrl: photoUrl || player.avatarUrl
          }
        }
      };
    });
  },

  deletePlayer: (id) => {
    set((state) => {
      const newPlayers = { ...state.players };
      delete newPlayers[id];
      return { players: newPlayers };
    });
  },

  createTournament: (name, format, settings, participants) => {
    const tourId = `tour_${Date.now()}`;
    const newMatches: Record<string, Match> = {};
    const matchIds: string[] = [];

    // Generate Round Robin
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    const playersState = get().players;
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        const matchId = `m_${Date.now()}_${i}_${j}`;
        const p1 = playersState[shuffled[i]];
        const p2 = playersState[shuffled[j]];
        const { h1, h2 } = getMatchHandicap(p1?.level, p2?.level, settings?.handicapAmateurSets);

        newMatches[matchId] = {
          id: matchId,
          clubId: get().currentClub.id,
          player1Id: shuffled[i],
          player2Id: shuffled[j],
          score1: h1,
          score2: h2,
          handicapP1: h1 > 0 ? h1 : undefined,
          handicapP2: h2 > 0 ? h2 : undefined,
          status: 'pending',
          startTime: Date.now(),
          tournamentId: tourId,
          stage: 'qualif'
        };
        matchIds.push(matchId);
      }
    }

    // Shuffle the matches so the initial queue isn't completely sequential for one player
    matchIds.sort(() => 0.5 - Math.random());

    set((state) => {
      // 1. Mark any previous ongoing tournaments as finished
      const allTournaments = { ...state.tournaments };
      Object.keys(allTournaments).forEach(tId => {
        if (allTournaments[tId].status === 'ongoing') {
          allTournaments[tId] = { ...allTournaments[tId], status: 'finished' as const };
        }
      });
      allTournaments[tourId] = {
        id: tourId,
        clubId: state.currentClub.id,
        name,
        format,
        status: 'ongoing' as const,
        participants,
        settings,
        matches: matchIds
      };

      // 2. Detach ANY old match from any table and finish any lingering playing match
      const allMatches = { ...state.matches };
      Object.keys(allMatches).forEach(mId => {
        const m = allMatches[mId];
        if (m.tournamentId !== tourId && m.tableId) {
          allMatches[mId] = {
            ...m,
            tableId: undefined,
            status: m.status === 'playing' ? 'finished' : m.status
          };
        }
      });
      // Add the new tournament matches
      Object.assign(allMatches, newMatches);

      // 3. Clear tables selected for tournament (and club tables)
      const clearedTables = { ...state.tables };
      Object.values(clearedTables).forEach(t => {
        clearedTables[t.id] = { ...t, status: 'free' as const, currentMatchId: undefined };
      });

      // 4. Dispatch new matches onto clean tables
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        clearedTables,
        allMatches,
        allTournaments,
        tourId
      );

      return {
        tables: dispatchedTables,
        matches: dispatchedMatches,
        tournaments: allTournaments
      };
    });
  },

  startTournamentMatch: (matchId, asCurrentUser = true) => {
    set((state) => {
      const match = state.matches[matchId];
      if (!match || match.status === 'finished') return state;
      
      const effectiveTableId = match.tableId || Object.values(state.tables).find(t => t.currentMatchId === matchId)?.id;
      if (!effectiveTableId) return state; // Should have a table assigned
      
      const startTime = match.status === 'playing' ? match.startTime : Date.now();
      
      return {
        matches: { 
          ...state.matches, 
          [matchId]: { ...match, tableId: effectiveTableId, status: 'playing', startTime } 
        },
        ...(asCurrentUser ? { activeMatchId: matchId } : {})
      };
    });
  },

  updateScore: (playerId, delta) => {
    const { activeMatchId, matches } = get();
    if (!activeMatchId) return;
    const match = matches[activeMatchId];
    if (!match) return;

    const isPlayer1 = match.player1Id === playerId;
    const minScore1 = match.handicapP1 || 0;
    const minScore2 = match.handicapP2 || 0;
    
    set((state) => ({
      matches: {
        ...state.matches,
        [activeMatchId]: {
          ...match,
          score1: isPlayer1 ? Math.max(minScore1, match.score1 + delta) : match.score1,
          score2: !isPlayer1 ? Math.max(minScore2, match.score2 + delta) : match.score2
        }
      }
    }));
  },

  postponeMatch: (matchId, replacementMatchId) => {
    set((state) => {
      const match = state.matches[matchId];
      if (!match || match.status === 'finished') return state;

      // Find the effective table id this match was assigned to
      const tableId = match.tableId || Object.values(state.tables).find(t => t.currentMatchId === matchId)?.id;
      if (!tableId) return state;

      const newMatches = { ...state.matches };
      const newTables = { ...state.tables };

      // 1. Unassign the postponed match and send it to the end of tournament queue
      newMatches[matchId] = { ...match, tableId: undefined, status: 'pending' };

      let newTournaments = state.tournaments;
      if (match.tournamentId && state.tournaments[match.tournamentId]) {
        const tournament = state.tournaments[match.tournamentId];
        newTournaments = {
          ...state.tournaments,
          [match.tournamentId]: {
            ...tournament,
            matches: [...tournament.matches.filter(id => id !== matchId), matchId]
          }
        };
      }

      // 2. Clear ANY match that was pointing to this tableId
      Object.values(newMatches).forEach(m => {
        if (m.tableId === tableId && m.id !== replacementMatchId && m.status !== 'finished') {
          newMatches[m.id] = { ...m, tableId: undefined, status: 'pending' };
        }
      });

      // 3. CASE A: A specific replacement match was chosen
      if (replacementMatchId && newMatches[replacementMatchId]) {
        const repMatch = newMatches[replacementMatchId];

        // Check if either player of replacement match is busy on ANOTHER table
        const isPlayerBusyOnOtherTable = (pId: string) => {
          if (!pId) return false;
          return Object.values(newMatches).some(m => {
            if (m.id === replacementMatchId || m.id === matchId || m.status === 'finished') return false;
            const assignedTable = m.tableId || Object.values(newTables).find(t => t.currentMatchId === m.id)?.id;
            return Boolean(assignedTable) && assignedTable !== tableId && (m.player1Id === pId || m.player2Id === pId);
          });
        };

        if (isPlayerBusyOnOtherTable(repMatch.player1Id) || isPlayerBusyOnOtherTable(repMatch.player2Id)) {
          // Cannot replace with this match because player is on another table. Fall back to auto-rotation
          newTables[tableId] = { ...newTables[tableId], status: 'free', currentMatchId: undefined };
          const { tables: dTables, matches: dMatches } = dispatchTournamentMatches(newTables, newMatches, newTournaments, match.tournamentId);
          return { tables: dTables, matches: dMatches, tournaments: newTournaments };
        }

        // If replacement match had another table, free it
        if (repMatch.tableId && repMatch.tableId !== tableId) {
          const oldT = newTables[repMatch.tableId];
          if (oldT && oldT.currentMatchId === replacementMatchId) {
            newTables[repMatch.tableId] = { ...oldT, status: 'free', currentMatchId: undefined };
          }
        }

        // Assign replacement match to tableId
        newMatches[replacementMatchId] = {
          ...repMatch,
          tableId: tableId,
          status: 'pending'
        };

        newTables[tableId] = {
          ...newTables[tableId],
          status: 'occupied',
          currentMatchId: replacementMatchId
        };

        return { matches: newMatches, tables: newTables, tournaments: newTournaments };
      }

      // 4. CASE B: Automatic rotation (no replacement selected)
      newTables[tableId] = { ...newTables[tableId], status: 'free', currentMatchId: undefined };
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        newTables,
        newMatches,
        newTournaments,
        match.tournamentId
      );

      return { matches: dispatchedMatches, tables: dispatchedTables, tournaments: newTournaments };
    });
  },

  updateMatchScore: (matchId, score1, score2) => {
    set((state) => {
      const match = state.matches[matchId];
      if (!match) return state;
      return {
        matches: {
          ...state.matches,
          [matchId]: { ...match, score1: Math.max(0, score1), score2: Math.max(0, score2) }
        }
      };
    });
  },

  updateFinishedMatchScore: (matchId, score1, score2) => {
    set((state) => {
      const match = state.matches[matchId];
      if (!match) return state;

      const s1 = Math.max(0, score1);
      const s2 = Math.max(0, score2);
      const newWinnerId = s1 > s2 ? match.player1Id : (s2 > s1 ? match.player2Id : undefined);

      const newMatches = {
        ...state.matches,
        [matchId]: {
          ...match,
          score1: s1,
          score2: s2,
          winnerId: newWinnerId,
          status: 'finished' as const,
          tableId: undefined
        }
      };

      // Advance/update winner in next bracket match if defined
      if (match.nextMatchId && newMatches[match.nextMatchId]) {
        let nextM = newMatches[match.nextMatchId];
        if (match.bracketPosition !== undefined) {
          if (match.bracketPosition % 2 === 0) {
            nextM = { ...nextM, player1Id: newWinnerId || '' };
          } else {
            nextM = { ...nextM, player2Id: newWinnerId || '' };
          }
        } else {
          if (nextM.player1Id === match.winnerId || !nextM.player1Id) {
            nextM = { ...nextM, player1Id: newWinnerId || '' };
          } else if (nextM.player2Id === match.winnerId || !nextM.player2Id) {
            nextM = { ...nextM, player2Id: newWinnerId || '' };
          }
        }

        // If next match now has both players and hasn't started, apply handicap
        if (nextM.player1Id && nextM.player2Id && nextM.status === 'pending') {
          const tour = match.tournamentId ? state.tournaments[match.tournamentId] : null;
          const { h1, h2 } = getMatchHandicap(
            state.players[nextM.player1Id]?.level,
            state.players[nextM.player2Id]?.level,
            tour?.settings?.handicapAmateurSets
          );
          nextM = {
            ...nextM,
            score1: h1,
            score2: h2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
        }

        newMatches[match.nextMatchId] = nextM;
      }

      // Progression du perdant vers la Petite Finale si présente
      if (match.stage === 'semi' && match.tournamentId) {
        const loserId = (newWinnerId === match.player1Id) ? match.player2Id : match.player1Id;
        const tourMatches = Object.values(newMatches).filter(m => m.tournamentId === match.tournamentId);
        const thirdPlaceMatch = tourMatches.find(m => m.stage === 'third_place' || m.id.includes('_third_place_'));
        if (loserId && thirdPlaceMatch && newMatches[thirdPlaceMatch.id]) {
          let tpM = newMatches[thirdPlaceMatch.id];
          if (match.bracketPosition === 0) {
            tpM = { ...tpM, player1Id: loserId };
          } else {
            tpM = { ...tpM, player2Id: loserId };
          }
          if (tpM.player1Id && tpM.player2Id && tpM.status === 'pending') {
            const tour = state.tournaments[match.tournamentId];
            const { h1, h2 } = getMatchHandicap(
              state.players[tpM.player1Id]?.level,
              state.players[tpM.player2Id]?.level,
              tour?.settings?.handicapAmateurSets
            );
            tpM = {
              ...tpM,
              score1: h1,
              score2: h2,
              handicapP1: h1 > 0 ? h1 : undefined,
              handicapP2: h2 > 0 ? h2 : undefined
            };
          }
          newMatches[thirdPlaceMatch.id] = tpM;
        }
      }

      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        state.tables,
        newMatches,
        state.tournaments,
        match.tournamentId,
        state.players
      );

      return { matches: dispatchedMatches, tables: dispatchedTables };
    });
  },

  assignMatchToTable: (matchId, tableId) => {
    let result: { success: boolean; reason?: string } = { success: true };

    set((state) => {
      const match = state.matches[matchId];
      const table = state.tables[tableId];
      if (!match || !table) {
        result = { success: false, reason: 'Match ou table introuvable' };
        return state;
      }

      const newMatches = { ...state.matches };
      const newTables = { ...state.tables };

      // Check if player1 or player2 is already busy on another table
      const isPlayerBusyOnOtherTable = (playerId: string) => {
        if (!playerId) return null;
        for (const m of Object.values(newMatches)) {
          if (m.id === matchId || m.status === 'finished') continue;
          const assignedTableId = m.tableId || Object.values(newTables).find(t => t.currentMatchId === m.id)?.id;
          if (assignedTableId && assignedTableId !== tableId) {
            if (m.player1Id === playerId || m.player2Id === playerId) {
              const busyTable = newTables[assignedTableId];
              const tName = busyTable?.name || `Table ${busyTable?.number || assignedTableId}`;
              const pName = state.players[playerId]?.name || 'Ce joueur';
              return `${pName} est déjà assigné sur ${tName}`;
            }
          }
        }
        return null;
      };

      const p1Conflict = isPlayerBusyOnOtherTable(match.player1Id);
      if (p1Conflict) {
        result = { success: false, reason: p1Conflict };
        return state;
      }

      const p2Conflict = isPlayerBusyOnOtherTable(match.player2Id);
      if (p2Conflict) {
        result = { success: false, reason: p2Conflict };
        return state;
      }

      // Clean up ANY match currently assigned to this target table
      Object.values(newMatches).forEach(m => {
        if (m.tableId === tableId && m.id !== matchId && m.status !== 'finished') {
          newMatches[m.id] = {
            ...m,
            tableId: undefined,
            status: 'pending'
          };
        }
      });

      // If this match was already assigned to another table, clear that table
      Object.keys(newTables).forEach(tId => {
        if ((newTables[tId].currentMatchId === matchId || match.tableId === tId) && tId !== tableId) {
          newTables[tId] = {
            ...newTables[tId],
            status: 'free' as const,
            currentMatchId: undefined
          };
        }
      });

      // Assign match to table
      newMatches[matchId] = {
        ...match,
        tableId: tableId,
        status: 'pending'
      };

      newTables[tableId] = {
        ...table,
        status: 'occupied',
        currentMatchId: matchId
      };

      return {
        matches: newMatches,
        tables: newTables
      };
    });

    return result;
  },

  finishMatch: (targetMatchId?: string) => {
    const activeId = targetMatchId || get().activeMatchId;
    if (!activeId) return;
    const match = get().matches[activeId];
    if (!match) return;
    
    const winnerId = match.score1 > match.score2 ? match.player1Id : (match.score2 > match.score1 ? match.player2Id : undefined);

    set((state) => {
      // 1. Mark match as finished and explicitly remove tableId
      const newMatches = {
        ...state.matches,
        [activeId]: { ...match, status: 'finished', endTime: Date.now(), winnerId, tableId: undefined }
      } as Record<string, Match>;

      // 2. Advance winner to next bracket match if defined or infer next match
      let targetNextId = match.nextMatchId;
      if (!targetNextId && match.tournamentId) {
        const tourMatches = Object.values(newMatches).filter(m => m.tournamentId === match.tournamentId);
        if (match.stage === 'quarter') {
          const semiPos = (match.bracketPosition !== undefined && match.bracketPosition >= 2) ? 1 : 0;
          const semiMatch = tourMatches.find(m => (m.stage === 'semi' || m.id.includes('_semi_')) && m.bracketPosition === semiPos);
          if (semiMatch) targetNextId = semiMatch.id;
        } else if (match.stage === 'semi') {
          const finalMatch = tourMatches.find(m => m.stage === 'final' || m.id.includes('_final_'));
          if (finalMatch) targetNextId = finalMatch.id;
        }
      }

      if (winnerId && targetNextId && newMatches[targetNextId]) {
        let nextM = newMatches[targetNextId];
        if (match.bracketPosition !== undefined) {
          if (match.bracketPosition % 2 === 0) {
            nextM = { ...nextM, player1Id: winnerId };
          } else {
            nextM = { ...nextM, player2Id: winnerId };
          }
        } else {
          if (!nextM.player1Id) {
            nextM = { ...nextM, player1Id: winnerId };
          } else if (!nextM.player2Id) {
            nextM = { ...nextM, player2Id: winnerId };
          }
        }

        // If next match now has both players and hasn't started, apply handicap
        if (nextM.player1Id && nextM.player2Id && nextM.status === 'pending') {
          const tour = match.tournamentId ? state.tournaments[match.tournamentId] : null;
          const { h1, h2 } = getMatchHandicap(
            state.players[nextM.player1Id]?.level,
            state.players[nextM.player2Id]?.level,
            tour?.settings?.handicapAmateurSets
          );
          nextM = {
            ...nextM,
            score1: h1,
            score2: h2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
        }

        newMatches[targetNextId] = nextM;
      }

      // 3. Advance loser of semi-final to Petite Finale (match pour la 3eme place) if it exists
      if (match.stage === 'semi' && match.tournamentId) {
        const loserId = (winnerId === match.player1Id) ? match.player2Id : match.player1Id;
        const tourMatches = Object.values(newMatches).filter(m => m.tournamentId === match.tournamentId);
        const thirdPlaceMatch = tourMatches.find(m => m.stage === 'third_place' || m.id.includes('_third_place_'));
        if (loserId && thirdPlaceMatch && newMatches[thirdPlaceMatch.id]) {
          let tpM = newMatches[thirdPlaceMatch.id];
          if (match.bracketPosition === 0) {
            tpM = { ...tpM, player1Id: loserId };
          } else {
            tpM = { ...tpM, player2Id: loserId };
          }
          if (tpM.player1Id && tpM.player2Id && tpM.status === 'pending') {
            const tour = state.tournaments[match.tournamentId];
            const { h1, h2 } = getMatchHandicap(
              state.players[tpM.player1Id]?.level,
              state.players[tpM.player2Id]?.level,
              tour?.settings?.handicapAmateurSets
            );
            tpM = {
              ...tpM,
              score1: h1,
              score2: h2,
              handicapP1: h1 > 0 ? h1 : undefined,
              handicapP2: h2 > 0 ? h2 : undefined
            };
          }
          newMatches[thirdPlaceMatch.id] = tpM;
        }
      }

      const newTables = { ...state.tables };
      let freedTableId = match.tableId;

      // Free ANY table associated with this match or pointing to this matchId
      Object.keys(newTables).forEach(tId => {
        if (newTables[tId].currentMatchId === activeId || (freedTableId && tId === freedTableId)) {
          freedTableId = tId;
          newTables[tId] = { ...newTables[tId], status: 'free', currentMatchId: undefined };
        }
      });

      // Auto-assign tournament matches across ALL free tables
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        newTables,
        newMatches,
        state.tournaments,
        match.tournamentId,
        state.players
      );

      return {
        matches: dispatchedMatches,
        tables: dispatchedTables,
        activeMatchId: state.activeMatchId === activeId ? null : state.activeMatchId
      };
    });
  },

  freeTable: (tableId: string) => {
    set((state) => {
      const table = state.tables[tableId];
      if (!table) return state;

      const newTables = {
        ...state.tables,
        [tableId]: { ...table, status: 'free' as const, currentMatchId: undefined }
      };

      const newMatches = { ...state.matches };
      // If table was pointing to a match, disconnect match from table
      Object.values(newMatches).forEach(m => {
        if (m.tableId === tableId && m.status !== 'finished') {
          newMatches[m.id] = { ...m, tableId: undefined, status: 'pending' };
        }
      });
      if (table.currentMatchId && newMatches[table.currentMatchId] && newMatches[table.currentMatchId].status !== 'finished') {
        newMatches[table.currentMatchId] = {
          ...newMatches[table.currentMatchId],
          tableId: undefined,
          status: 'pending'
        };
      }

      // Auto-dispatch pending matches to newly freed and existing free tables
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        newTables,
        newMatches,
        state.tournaments
      );

      return {
        tables: dispatchedTables,
        matches: dispatchedMatches,
        activeMatchId: (state.activeMatchId === table.currentMatchId) ? null : state.activeMatchId
      };
    });
  },

  launchFinalStage: (tournamentId: string, hasThirdPlaceMatch?: boolean) => {
    set((state) => {
      const tournament = state.tournaments[tournamentId];
      if (!tournament) return state;

      // 1. Calculate Standings using centralized getTournamentQualificationStatus
      const qualifStatus = getTournamentQualificationStatus(tournament, state.matches, state.players);
      const participantsCount = tournament.participants.length;

      let numQualifiers = qualifStatus.numQualifiers;
      if (numQualifiers >= 8 && participantsCount >= 8) numQualifiers = 8;
      else if (numQualifiers <= 2 || participantsCount < 4) numQualifiers = 2;
      else numQualifiers = Math.min(4, participantsCount);

      const qualifiers = qualifStatus.ranking.slice(0, numQualifiers).map(r => r.id);

      // If somehow not enough qualifiers, fill with available participants
      while (qualifiers.length < numQualifiers && qualifiers.length < participantsCount) {
        const nextP = tournament.participants.find(p => !qualifiers.includes(p));
        if (nextP) qualifiers.push(nextP);
        else break;
      }

      const shouldIncludeThirdPlace = hasThirdPlaceMatch !== undefined
        ? hasThirdPlaceMatch
        : Boolean(tournament.settings?.hasThirdPlaceMatch ?? true);

      const newMatches = { ...state.matches };
      const newMatchIds: string[] = [];
      const timestamp = Date.now();

      if (numQualifiers === 8) {
        // 8 Qualifiers: 4 Quarters -> 2 Semis -> 1 Final (+ option Petite Finale)
        const finalId = `m_final_${timestamp}`;
        const semi1Id = `m_semi_1_${timestamp}`;
        const semi2Id = `m_semi_2_${timestamp}`;
        const q1Id = `m_quarter_1_${timestamp}`;
        const q2Id = `m_quarter_2_${timestamp}`;
        const q3Id = `m_quarter_3_${timestamp}`;
        const q4Id = `m_quarter_4_${timestamp}`;

        // Final
        newMatches[finalId] = {
          id: finalId,
          clubId: state.currentClub.id,
          player1Id: '',
          player2Id: '',
          score1: 0,
          score2: 0,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'final',
          bracketRound: 3,
          bracketPosition: 0
        };

        // Semis
        newMatches[semi1Id] = {
          id: semi1Id,
          clubId: state.currentClub.id,
          player1Id: '',
          player2Id: '',
          score1: 0,
          score2: 0,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'semi',
          bracketRound: 2,
          bracketPosition: 0,
          nextMatchId: finalId
        };
        newMatches[semi2Id] = {
          id: semi2Id,
          clubId: state.currentClub.id,
          player1Id: '',
          player2Id: '',
          score1: 0,
          score2: 0,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'semi',
          bracketRound: 2,
          bracketPosition: 1,
          nextMatchId: finalId
        };

        // Quarters: Seed 1 vs 8 (ou 4), 4 vs 5, 2 vs 7, 3 vs 6
        const qPairs = [
          { p1: qualifiers[0], p2: qualifiers[7] || qualifiers[3], next: semi1Id, pos: 0 },
          { p1: qualifiers[3] || qualifiers[1], p2: qualifiers[4] || qualifiers[2], next: semi1Id, pos: 1 },
          { p1: qualifiers[1] || qualifiers[2], p2: qualifiers[6] || qualifiers[0], next: semi2Id, pos: 2 },
          { p1: qualifiers[2] || qualifiers[0], p2: qualifiers[5] || qualifiers[1], next: semi2Id, pos: 3 },
        ];

        const qIds = [q1Id, q2Id, q3Id, q4Id];
        qIds.forEach((qId, idx) => {
          const pair = qPairs[idx];
          const { h1, h2 } = getMatchHandicap(
            state.players[pair.p1]?.level,
            state.players[pair.p2]?.level,
            tournament.settings?.handicapAmateurSets
          );
          newMatches[qId] = {
            id: qId,
            clubId: state.currentClub.id,
            player1Id: pair.p1,
            player2Id: pair.p2,
            score1: h1,
            score2: h2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined,
            status: 'pending',
            startTime: timestamp,
            tournamentId,
            stage: 'quarter',
            bracketRound: 1,
            bracketPosition: pair.pos,
            nextMatchId: pair.next
          };
        });

        if (shouldIncludeThirdPlace) {
          const thirdPlaceId = `m_third_place_${timestamp}`;
          newMatches[thirdPlaceId] = {
            id: thirdPlaceId,
            clubId: state.currentClub.id,
            player1Id: '',
            player2Id: '',
            score1: 0,
            score2: 0,
            status: 'pending',
            startTime: timestamp,
            tournamentId,
            stage: 'third_place',
            bracketRound: 3,
            bracketPosition: 1
          };
          newMatchIds.push(thirdPlaceId);
        }

        newMatchIds.push(q1Id, q2Id, q3Id, q4Id, semi1Id, semi2Id, finalId);

      } else if (numQualifiers === 4) {
        // 4 Qualifiers: 2 Semis -> 1 Final (+ option Petite Finale)
        const finalId = `m_final_${timestamp}`;
        const semi1Id = `m_semi_1_${timestamp}`;
        const semi2Id = `m_semi_2_${timestamp}`;

        newMatches[finalId] = {
          id: finalId,
          clubId: state.currentClub.id,
          player1Id: '',
          player2Id: '',
          score1: 0,
          score2: 0,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'final',
          bracketRound: 2,
          bracketPosition: 0
        };

        if (shouldIncludeThirdPlace) {
          const thirdPlaceId = `m_third_place_${timestamp}`;
          newMatches[thirdPlaceId] = {
            id: thirdPlaceId,
            clubId: state.currentClub.id,
            player1Id: '',
            player2Id: '',
            score1: 0,
            score2: 0,
            status: 'pending',
            startTime: timestamp,
            tournamentId,
            stage: 'third_place',
            bracketRound: 2,
            bracketPosition: 1
          };
          newMatchIds.push(thirdPlaceId);
        }

        // 4 Qualifiés: Demi 1 = 1er vs 4eme, Demi 2 = 2eme vs 3eme
        const s1Pair = { p1: qualifiers[0], p2: qualifiers[3] || qualifiers[1] };
        const s2Pair = { p1: qualifiers[1], p2: qualifiers[2] || qualifiers[0] };

        const hS1 = getMatchHandicap(
          state.players[s1Pair.p1]?.level,
          state.players[s1Pair.p2]?.level,
          tournament.settings?.handicapAmateurSets
        );
        const hS2 = getMatchHandicap(
          state.players[s2Pair.p1]?.level,
          state.players[s2Pair.p2]?.level,
          tournament.settings?.handicapAmateurSets
        );

        newMatches[semi1Id] = {
          id: semi1Id,
          clubId: state.currentClub.id,
          player1Id: s1Pair.p1,
          player2Id: s1Pair.p2,
          score1: hS1.h1,
          score2: hS1.h2,
          handicapP1: hS1.h1 > 0 ? hS1.h1 : undefined,
          handicapP2: hS1.h2 > 0 ? hS1.h2 : undefined,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'semi',
          bracketRound: 1,
          bracketPosition: 0,
          nextMatchId: finalId
        };

        newMatches[semi2Id] = {
          id: semi2Id,
          clubId: state.currentClub.id,
          player1Id: s2Pair.p1,
          player2Id: s2Pair.p2,
          score1: hS2.h1,
          score2: hS2.h2,
          handicapP1: hS2.h1 > 0 ? hS2.h1 : undefined,
          handicapP2: hS2.h2 > 0 ? hS2.h2 : undefined,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'semi',
          bracketRound: 1,
          bracketPosition: 1,
          nextMatchId: finalId
        };

        newMatchIds.push(semi1Id, semi2Id, finalId);

      } else {
        // 2 Qualifiers: 1 Final
        const finalId = `m_final_${timestamp}`;
        const hFinal = getMatchHandicap(
          state.players[qualifiers[0]]?.level,
          state.players[qualifiers[1] || qualifiers[0]]?.level,
          tournament.settings?.handicapAmateurSets
        );
        newMatches[finalId] = {
          id: finalId,
          clubId: state.currentClub.id,
          player1Id: qualifiers[0],
          player2Id: qualifiers[1] || qualifiers[0],
          score1: hFinal.h1,
          score2: hFinal.h2,
          handicapP1: hFinal.h1 > 0 ? hFinal.h1 : undefined,
          handicapP2: hFinal.h2 > 0 ? hFinal.h2 : undefined,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'final',
          bracketRound: 1,
          bracketPosition: 0
        };
        newMatchIds.push(finalId);
      }

      // 1. Filtrer les anciens matchs de phase finale pour éviter les doublons en cas de relance
      const qualifMatchIdsOnly = tournament.matches.filter(mId => {
        const m = state.matches[mId];
        return m && (!m.stage || m.stage === 'qualif');
      });
      Object.keys(newMatches).forEach(mId => {
        const m = newMatches[mId];
        if (m.tournamentId === tournamentId && m.stage && m.stage !== 'qualif') {
          if (!newMatchIds.includes(mId)) {
            delete newMatches[mId];
          }
        }
      });

      // 2. Cancel / unassign all qualification matches so they release tables
      Object.keys(newMatches).forEach(mId => {
        const m = newMatches[mId];
        if (m.tournamentId === tournamentId && (!m.stage || m.stage === 'qualif')) {
          newMatches[mId] = {
            ...m,
            tableId: undefined,
            status: m.status === 'playing' ? 'finished' : (m.status !== 'finished' ? 'finished' : m.status),
            score1: m.score1 || 0,
            score2: m.score2 || 0
          };
        }
      });

      // 3. Clear all tournament tables so they are immediately available for the bracket matches
      const clearedTables = { ...state.tables };
      const tournamentTableIds = tournament.settings?.tableIds?.length ? tournament.settings.tableIds : Object.keys(clearedTables);
      tournamentTableIds.forEach(tId => {
        if (clearedTables[tId]) {
          clearedTables[tId] = {
            ...clearedTables[tId],
            status: 'free',
            currentMatchId: undefined
          };
        }
      });

      const updatedTournaments: Record<string, Tournament> = {
        ...state.tournaments,
        [tournamentId]: {
          ...tournament,
          matches: [...qualifMatchIdsOnly, ...newMatchIds],
          finalStageLaunched: true,
          settings: tournament.settings ? {
            ...tournament.settings,
            tableIds: tournamentTableIds,
            finalStageLaunched: true,
            seedByMerit: true,
            hasThirdPlaceMatch: shouldIncludeThirdPlace
          } : {
            tableIds: tournamentTableIds,
            qualifNbSets: 1,
            qualifIsWinningSets: true,
            qualifNbQualifiers: numQualifiers,
            finalNbSets: 1,
            finalIsWinningSets: true,
            seedByMerit: true,
            finalStageLaunched: true,
            hasThirdPlaceMatch: shouldIncludeThirdPlace
          }
        }
      };

      // 4. Auto-assign free tables to ready final matches with dispatchTournamentMatches
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        clearedTables,
        newMatches,
        updatedTournaments,
        tournamentId
      );

      // 5. Guarantee table assignment for first ready bracket match
      const readyBracketMatch = newMatchIds
        .map(id => dispatchedMatches[id])
        .find(m => m && m.player1Id && m.player2Id && !m.tableId);
      if (readyBracketMatch) {
        const availableTable = tournamentTableIds.map(tId => dispatchedTables[tId]).find(t => t && t.status === 'free');
        if (availableTable) {
          dispatchedTables[availableTable.id] = {
            ...availableTable,
            status: 'occupied',
            currentMatchId: readyBracketMatch.id
          };
          dispatchedMatches[readyBracketMatch.id] = {
            ...readyBracketMatch,
            tableId: availableTable.id,
            status: 'pending'
          };
        }
      }

      return {
        matches: dispatchedMatches,
        tables: dispatchedTables,
        tournaments: updatedTournaments
      };
    });
  },

  reseedFinalStage: (tournamentId: string) => {
    set((state) => {
      const tournament = state.tournaments[tournamentId];
      if (!tournament) return state;

      const qualifStatus = getTournamentQualificationStatus(tournament, state.matches, state.players);
      const qualifiers = qualifStatus.ranking.map(r => r.id);
      if (qualifiers.length < 2) return state;

      const newMatches = { ...state.matches };
      const newTables = { ...state.tables };

      const finalMatches = tournament.matches
        .map(mId => newMatches[mId])
        .filter((m): m is Match => Boolean(m && (m.stage === 'quarter' || m.stage === 'semi' || m.stage === 'final' || m.id.includes('_quarter_') || m.id.includes('_semi_') || m.id.includes('_final_'))));

      const quarters = finalMatches.filter(m => m.stage === 'quarter' || m.id.includes('_quarter_')).sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
      const semis = finalMatches.filter(m => m.stage === 'semi' || m.id.includes('_semi_')).sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));

      if (quarters.length === 4) {
        // Quarts: 1er vs 8eme, 4eme vs 5eme, 2eme vs 7eme, 3eme vs 6eme
        const qPairs = [
          { p1: qualifiers[0], p2: qualifiers[7] || qualifiers[3] },
          { p1: qualifiers[3] || qualifiers[1], p2: qualifiers[4] || qualifiers[2] },
          { p1: qualifiers[1] || qualifiers[2], p2: qualifiers[6] || qualifiers[0] },
          { p1: qualifiers[2] || qualifiers[0], p2: qualifiers[5] || qualifiers[1] },
        ];
        quarters.forEach((q, idx) => {
          if (q.status !== 'finished') {
            const pair = qPairs[idx];
            const { h1, h2 } = getMatchHandicap(
              state.players[pair.p1]?.level,
              state.players[pair.p2]?.level,
              tournament.settings?.handicapAmateurSets
            );
            newMatches[q.id] = {
              ...q,
              player1Id: pair.p1,
              player2Id: pair.p2,
              score1: q.status === 'playing' ? q.score1 : h1,
              score2: q.status === 'playing' ? q.score2 : h2,
              handicapP1: h1 > 0 ? h1 : undefined,
              handicapP2: h2 > 0 ? h2 : undefined
            };
          }
        });
      } else if (semis.length >= 2) {
        // 4 Qualifiés: Demi 1 = 1er vs 4eme, Demi 2 = 2eme vs 3eme
        const s1 = semis.find(m => m.bracketPosition === 0 || m.id.includes('_semi_1_')) || semis[0];
        const s2 = semis.find(m => m.bracketPosition === 1 || m.id.includes('_semi_2_')) || semis[1];

        if (s1 && s1.status !== 'finished') {
          const p1 = qualifiers[0];
          const p2 = qualifiers[3] || qualifiers[1];
          const { h1, h2 } = getMatchHandicap(
            state.players[p1]?.level,
            state.players[p2]?.level,
            tournament.settings?.handicapAmateurSets
          );
          newMatches[s1.id] = {
            ...s1,
            player1Id: p1,
            player2Id: p2,
            score1: s1.status === 'playing' ? s1.score1 : h1,
            score2: s1.status === 'playing' ? s1.score2 : h2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
        }

        if (s2 && s2.status !== 'finished') {
          const p1 = qualifiers[1];
          const p2 = qualifiers[2] || qualifiers[0];
          const { h1, h2 } = getMatchHandicap(
            state.players[p1]?.level,
            state.players[p2]?.level,
            tournament.settings?.handicapAmateurSets
          );
          newMatches[s2.id] = {
            ...s2,
            player1Id: p1,
            player2Id: p2,
            score1: s2.status === 'playing' ? s2.score1 : h1,
            score2: s2.status === 'playing' ? s2.score2 : h2,
            handicapP1: h1 > 0 ? h1 : undefined,
            handicapP2: h2 > 0 ? h2 : undefined
          };
        }
      }

      const updatedTournaments = {
        ...state.tournaments,
        [tournamentId]: {
          ...tournament,
          settings: tournament.settings ? {
            ...tournament.settings,
            seedByMerit: true
          } : undefined
        }
      };

      const { matches: dispatchedMatches, tables: dispatchedTables } = dispatchTournamentMatches(
        newTables,
        newMatches,
        updatedTournaments,
        tournamentId
      );

      return {
        matches: dispatchedMatches,
        tables: dispatchedTables,
        tournaments: updatedTournaments
      };
    });
  },

  toggleThirdPlaceMatch: (tournamentId: string) => {
    set((state) => {
      const tournament = state.tournaments[tournamentId];
      if (!tournament) return state;

      const newMatches = { ...state.matches };
      const currentThirdPlace = tournament.matches
        .map(id => newMatches[id])
        .find(m => m && (m.stage === 'third_place' || m.id.includes('_third_place_')));

      const shouldEnable = !currentThirdPlace;

      if (shouldEnable) {
        // Activer la Petite Finale
        const timestamp = Date.now();
        const thirdPlaceId = `m_third_place_${timestamp}`;

        const tourMatches = tournament.matches.map(id => newMatches[id]).filter(Boolean);
        const semi1 = tourMatches.find(m => (m.stage === 'semi' || m.id.includes('_semi_')) && (m.bracketPosition === 0 || m.id.includes('_semi_1_')));
        const semi2 = tourMatches.find(m => (m.stage === 'semi' || m.id.includes('_semi_')) && (m.bracketPosition === 1 || m.id.includes('_semi_2_')));

        let p1Id = '';
        let p2Id = '';
        if (semi1 && semi1.status === 'finished' && semi1.winnerId) {
          p1Id = semi1.winnerId === semi1.player1Id ? semi1.player2Id : semi1.player1Id;
        }
        if (semi2 && semi2.status === 'finished' && semi2.winnerId) {
          p2Id = semi2.winnerId === semi2.player1Id ? semi2.player2Id : semi2.player1Id;
        }

        const { h1, h2 } = (p1Id && p2Id)
          ? getMatchHandicap(state.players[p1Id]?.level, state.players[p2Id]?.level, tournament.settings?.handicapAmateurSets)
          : { h1: 0, h2: 0 };

        newMatches[thirdPlaceId] = {
          id: thirdPlaceId,
          clubId: state.currentClub.id,
          player1Id: p1Id,
          player2Id: p2Id,
          score1: h1,
          score2: h2,
          handicapP1: h1 > 0 ? h1 : undefined,
          handicapP2: h2 > 0 ? h2 : undefined,
          status: 'pending',
          startTime: timestamp,
          tournamentId,
          stage: 'third_place',
          bracketRound: 2,
          bracketPosition: 1
        };

        const updatedTournament = {
          ...tournament,
          matches: [...tournament.matches, thirdPlaceId],
          settings: {
            ...(tournament.settings || {}),
            hasThirdPlaceMatch: true
          } as any
        };

        const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
          state.tables,
          newMatches,
          { ...state.tournaments, [tournamentId]: updatedTournament },
          tournamentId
        );

        return {
          matches: dispatchedMatches,
          tables: dispatchedTables,
          tournaments: { ...state.tournaments, [tournamentId]: updatedTournament }
        };
      } else {
        // Désactiver la Petite Finale
        const thirdPlaceId = currentThirdPlace.id;
        delete newMatches[thirdPlaceId];

        const updatedTournament = {
          ...tournament,
          matches: tournament.matches.filter(id => id !== thirdPlaceId),
          settings: {
            ...(tournament.settings || {}),
            hasThirdPlaceMatch: false
          } as any
        };

        const newTables = { ...state.tables };
        Object.keys(newTables).forEach(tId => {
          if (newTables[tId].currentMatchId === thirdPlaceId) {
            newTables[tId] = { ...newTables[tId], status: 'free', currentMatchId: undefined };
          }
        });

        return {
          matches: newMatches,
          tables: newTables,
          tournaments: { ...state.tournaments, [tournamentId]: updatedTournament }
        };
      }
    });
  },

  updateTablePosition: (tableId, x, y) => {
    set((state) => {
      const table = state.tables[tableId];
      if (!table) return state;
      return {
        tables: {
          ...state.tables,
          [tableId]: { ...table, x, y }
        }
      };
    });
  },

  addTable: (name) => {
    set((state) => {
      const id = `t_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const number = Object.keys(state.tables).length + 1;
      const spawnX = 20 + Math.floor(Math.random() * 60);
      const spawnY = 20 + Math.floor(Math.random() * 60);
      return {
        tables: {
          ...state.tables,
          [id]: { id, clubId: state.currentClub.id, number, name: name || `Billard ${number}`, status: 'free', x: spawnX, y: spawnY }
        }
      };
    });
  },

  removeTable: (tableId) => {
    set((state) => {
      const newTables = { ...state.tables };
      delete newTables[tableId];
      return { tables: newTables };
    });
  },

  endTournament: (tournamentId) => {
    set((state) => {
      const tournament = state.tournaments[tournamentId];
      if (!tournament) return state;

      const newTournaments = {
        ...state.tournaments,
        [tournamentId]: { ...tournament, status: 'finished' as const }
      };

      const newTables = { ...state.tables };
      Object.values(newTables).forEach(t => {
        if (t.currentMatchId && state.matches[t.currentMatchId]?.tournamentId === tournamentId) {
          newTables[t.id] = { ...t, status: 'free', currentMatchId: undefined };
        }
      });

      return {
        tournaments: newTournaments,
        tables: newTables
      };
    });
  },

  deleteTournament: (tournamentId) => {
    set((state) => {
      const tournament = state.tournaments[tournamentId];
      const newTournaments = { ...state.tournaments };
      delete newTournaments[tournamentId];

      const newTables = { ...state.tables };
      Object.values(newTables).forEach(t => {
        if (t.currentMatchId && state.matches[t.currentMatchId]?.tournamentId === tournamentId) {
          newTables[t.id] = { ...t, status: 'free', currentMatchId: undefined };
        }
      });

      const newMatches = { ...state.matches };
      if (tournament && tournament.matches) {
        tournament.matches.forEach(mId => {
          delete newMatches[mId];
        });
      }

      return {
        tournaments: newTournaments,
        tables: newTables,
        matches: newMatches
      };
    });
  },

  autoDispatchMatches: () => {
    set((state) => {
      const { tables: dispatchedTables, matches: dispatchedMatches } = dispatchTournamentMatches(
        state.tables,
        state.matches,
        state.tournaments,
        undefined,
        state.players
      );

      // Only update if changes occurred
      if (dispatchedTables !== state.tables || dispatchedMatches !== state.matches) {
        return {
          tables: dispatchedTables,
          matches: dispatchedMatches
        };
      }
      return state;
    });
  }
}));

