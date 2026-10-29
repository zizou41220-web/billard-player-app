import { supabase } from './supabase';
import { useStore } from './store';
import { Match, Player, Table, Tournament } from './types';
import { computeAllPlayersStats, createDefaultPlayerStats } from './utils/playerStats';

let isReceiving = false;
let hasClubColumn = false;
let channelsSubscribed = false;

// Helpers to map camelCase <-> snake_case
export const mapPlayerToDB = (p: Player) => {
  const data: any = { id: p.id, name: p.name, level: p.level, avatar_url: p.avatarUrl, stats: p.stats };
  if (hasClubColumn) data.club_id = p.clubId || useStore.getState().currentClub.id;
  return data;
};

export const mapDBToPlayer = (d: any): Player => ({
  id: d.id,
  clubId: d.club_id || undefined,
  name: d.name,
  level: d.level,
  avatarUrl: d.avatar_url,
  stats: d.stats || createDefaultPlayerStats()
});

const normalizeStreamUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  return url.replace(/\.github\.io\/\?overlay=/, '.github.io/billard-player-app/?overlay=');
};

const getSavedTableStream = (clubId: string | undefined, tableId: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const cid = clubId || useStore.getState().currentClub.id;
    const saved = JSON.parse(localStorage.getItem(`mb_live_streams_${cid}`) || '{}');
    return normalizeStreamUrl(saved[tableId] || undefined);
  } catch {
    return undefined;
  }
};

export const mapTableToDB = (t: Table) => {
  const data: any = { id: t.id, number: t.number, name: t.name, status: t.status, current_match_id: t.currentMatchId || null, x: t.x || null, y: t.y || null };
  if (hasClubColumn) data.club_id = t.clubId || useStore.getState().currentClub.id;
  return data;
};

const mapDBToTable = (d: any): Table => ({
  id: d.id,
  clubId: d.club_id || undefined,
  number: d.number,
  name: d.name,
  status: d.status,
  currentMatchId: d.current_match_id || undefined,
  x: d.x || undefined,
  y: d.y || undefined,
  liveStreamUrl: d.live_stream_url || getSavedTableStream(d.club_id, d.id) || undefined
});

export const mapMatchToDB = (m: Match) => {
  const data: any = {
    id: m.id,
    table_id: m.status === 'finished' ? null : (m.tableId || null),
    player1_id: m.player1Id || '',
    player2_id: m.player2Id || '',
    score1: m.score1,
    score2: m.score2,
    status: m.status,
    start_time: m.startTime || Date.now(),
    end_time: m.status === 'finished' ? (m.endTime || Date.now()) : null,
    winner_id: m.status === 'finished' ? (m.winnerId || null) : null,
    tournament_id: m.tournamentId || null
  };
  if (hasClubColumn) data.club_id = m.clubId || useStore.getState().currentClub.id;
  return data;
};

export const mapDBToMatch = (d: any): Match => {
  let stage: Match['stage'] = d.stage;
  if (!stage && d.id) {
    if (d.id.includes('_third_place_')) stage = 'third_place';
    else if (d.id.includes('_final_')) stage = 'final';
    else if (d.id.includes('_semi_')) stage = 'semi';
    else if (d.id.includes('_quarter_')) stage = 'quarter';
    else if (d.id.includes('_round16_') || d.id.includes('_r16_')) stage = 'round_of_16';
    else if (d.id.includes('_round32_') || d.id.includes('_r32_')) stage = 'round_of_32';
    else if (d.id.includes('_round64_') || d.id.includes('_r64_')) stage = 'round_of_64';
    else if (d.id.includes('_round128_') || d.id.includes('_r128_')) stage = 'round_of_128';
    else stage = 'qualif';
  }

  let bracketRound = (d.bracket_round !== undefined && d.bracket_round !== null) ? d.bracket_round : undefined;
  let bracketPosition = (d.bracket_position !== undefined && d.bracket_position !== null) ? d.bracket_position : undefined;
  if (bracketRound === undefined && d.id) {
    if (d.id.includes('_round128_')) bracketRound = 1;
    else if (d.id.includes('_round64_')) bracketRound = 2;
    else if (d.id.includes('_round32_')) bracketRound = 3;
    else if (d.id.includes('_round16_')) bracketRound = 4;
    else if (d.id.includes('_quarter_')) bracketRound = 5;
    else if (d.id.includes('_semi_')) bracketRound = 6;
    else if (d.id.includes('_third_place_') || d.id.includes('_final_')) bracketRound = 7;
  }
  if (bracketPosition === undefined && d.id) {
    const m = d.id.match(/_(?:quarter|semi|round16|round32|round64|round128|r16|r32|r64|r128)_(\d+)/);
    if (m) {
      bracketPosition = parseInt(m[1], 10) - 1;
    } else if (d.id.includes('_third_place_')) {
      bracketPosition = 1;
    } else if (d.id.includes('_final_')) {
      bracketPosition = 0;
    }
  }

  let nextMatchId = d.next_match_id;
  if (!nextMatchId && d.id) {
    const ts = d.id.split('_').pop();
    if (d.id.includes('_quarter_1_') || d.id.includes('_quarter_2_')) {
      nextMatchId = `m_semi_1_${ts}`;
    } else if (d.id.includes('_quarter_3_') || d.id.includes('_quarter_4_')) {
      nextMatchId = `m_semi_2_${ts}`;
    } else if (d.id.includes('_semi_')) {
      nextMatchId = `m_final_${ts}`;
    }
  }

  return {
    id: d.id,
    clubId: d.club_id || undefined,
    tableId: d.status === 'finished' ? undefined : (d.table_id || undefined),
    player1Id: d.player1_id || '',
    player2Id: d.player2_id || '',
    targetSets: d.target_sets || undefined,
    score1: d.score1 || 0,
    score2: d.score2 || 0,
    handicapP1: d.handicap_p1 || undefined,
    handicapP2: d.handicap_p2 || undefined,
    status: d.status,
    startTime: d.start_time,
    endTime: d.end_time || undefined,
    winnerId: d.winner_id || undefined,
    tournamentId: d.tournament_id || undefined,
    stage,
    bracketRound,
    bracketPosition,
    nextMatchId,
    liveStreamUrl: d.live_stream_url || undefined
  };
};

const mapTournamentToDB = (t: Tournament) => {
  const settings = {
    ...(t.settings || {}),
    finalStageLaunched: Boolean(t.finalStageLaunched ?? t.settings?.finalStageLaunched)
  };
  const data: any = {
    id: t.id,
    name: t.name,
    format: t.format,
    status: t.status,
    participants: t.participants,
    settings,
    matches: t.matches
  };
  if (hasClubColumn) data.club_id = t.clubId || useStore.getState().currentClub.id;
  return data;
};

const mapDBToTournament = (d: any): Tournament => {
  const isFinalLaunched = Boolean(d.final_stage_launched ?? d.settings?.finalStageLaunched ?? false);
  return {
    id: d.id,
    clubId: d.club_id || undefined,
    name: d.name,
    format: d.format,
    status: d.status,
    participants: d.participants,
    settings: {
      ...(d.settings || {}),
      finalStageLaunched: isFinalLaunched
    },
    matches: d.matches || [],
    finalStageLaunched: isFinalLaunched
  };
};

// Initial fetch
export const initSync = async () => {
  isReceiving = true;
  
  try {
    const testCol = await supabase.from('tournoi2_tables').select('club_id').limit(1);
    hasClubColumn = !testCol.error;
  } catch {
    hasClubColumn = false;
  }

  const currentClubId = useStore.getState().currentClub.id;

  let pQuery = supabase.from('tournoi2_players').select('*');
  let tQuery = supabase.from('tournoi2_tables').select('*');
  let mQuery = supabase.from('tournoi2_matches').select('*');
  let tourQuery = supabase.from('tournoi2_tournaments').select('*');

  if (hasClubColumn) {
    pQuery = pQuery.or(`club_id.eq.${currentClubId},club_id.is.null`);
    tQuery = tQuery.or(`club_id.eq.${currentClubId},club_id.is.null`);
    mQuery = mQuery.or(`club_id.eq.${currentClubId},club_id.is.null`);
    tourQuery = tourQuery.or(`club_id.eq.${currentClubId},club_id.is.null`);
  }

  const [playersRes, tablesRes, matchesRes, tournamentsRes] = await Promise.all([
    pQuery,
    tQuery,
    mQuery,
    tourQuery
  ]);

  const rawPlayers: Record<string, Player> = {};
  if (playersRes.data && playersRes.data.length > 0) {
    playersRes.data.forEach(d => rawPlayers[d.id] = mapDBToPlayer(d));
  } else {
    Object.assign(rawPlayers, useStore.getState().players);
  }

  const rawTables: Record<string, Table> = {};
  if (tablesRes.data && tablesRes.data.length > 0) {
    tablesRes.data.forEach(d => rawTables[d.id] = mapDBToTable(d));
  } else {
    Object.assign(rawTables, useStore.getState().tables);
  }

  const rawMatches: Record<string, Match> = {};
  if (matchesRes.data && matchesRes.data.length > 0) {
    matchesRes.data.forEach(d => rawMatches[d.id] = mapDBToMatch(d));
  } else {
    Object.assign(rawMatches, useStore.getState().matches);
  }

  const rawTournaments: Record<string, Tournament> = {};
  if (tournamentsRes.data && tournamentsRes.data.length > 0) {
    tournamentsRes.data.forEach(d => rawTournaments[d.id] = mapDBToTournament(d));
  } else {
    Object.assign(rawTournaments, useStore.getState().tournaments);
  }

  // Restore any liveStreamUrls stored in the active tournament settings
  const ongoingTour = Object.values(rawTournaments).slice().reverse().find(t => t.status === 'ongoing');
  const tourStreams = (ongoingTour?.settings as any)?.tableLiveStreams as Record<string, string> | undefined;
  if (tourStreams) {
    Object.entries(tourStreams).forEach(([tId, url]) => {
      if (rawTables[tId] && url) {
        rawTables[tId] = { ...rawTables[tId], liveStreamUrl: normalizeStreamUrl(url) };
      }
    });
  }

  // Calcul dynamique et complet des statistiques de tous les joueurs depuis les matchs
  const computedPlayers = computeAllPlayersStats(rawPlayers, rawMatches, rawTournaments);

  useStore.setState({
    players: computedPlayers,
    tables: rawTables,
    matches: rawMatches,
    tournaments: rawTournaments
  });

  // Auto-heal table <-> match associations if desynced
  const currentTables = useStore.getState().tables;
  const currentMatches = useStore.getState().matches;
  const currentTournaments = useStore.getState().tournaments;
  const activeTournament = Object.values(currentTournaments).slice().reverse().find(t => t.status === 'ongoing');
  let tablesNeedUpdate = false;
  let matchesNeedUpdate = false;
  const updatedTables: Record<string, Table> = { ...currentTables };
  const updatedMatches: Record<string, Match> = { ...currentMatches };

  // Rule 1: Fix table.currentMatchId -> match.tableId consistency
  Object.values(updatedTables).forEach(table => {
    if (table.status === 'occupied' && table.currentMatchId && updatedMatches[table.currentMatchId]) {
      const curM = updatedMatches[table.currentMatchId];
      if (curM.status === 'finished') {
        updatedTables[table.id] = { ...table, status: 'free', currentMatchId: undefined };
        tablesNeedUpdate = true;
        supabase.from('tournoi2_tables').upsert(mapTableToDB(updatedTables[table.id])).then();
      } else if (curM.tableId !== table.id) {
        updatedMatches[table.currentMatchId] = {
          ...curM,
          tableId: table.id
        };
        matchesNeedUpdate = true;
        supabase.from('tournoi2_matches').upsert(mapMatchToDB(updatedMatches[table.currentMatchId])).then();
      }
    }
  });

  // Rule 2: If an ongoing tournament exists, clean any foreign matches off tournament tables
  if (activeTournament && activeTournament.settings?.tableIds) {
    const tourTableIds = activeTournament.settings.tableIds;
    tourTableIds.forEach(tId => {
      const table = updatedTables[tId];
      if (!table) return;
      if (table.currentMatchId) {
        const curM = updatedMatches[table.currentMatchId];
        if (!curM || curM.tournamentId !== activeTournament.id) {
          if (curM) {
            updatedMatches[curM.id] = { ...curM, tableId: undefined, status: curM.status === 'playing' ? 'finished' : curM.status };
            matchesNeedUpdate = true;
            supabase.from('tournoi2_matches').upsert(mapMatchToDB(updatedMatches[curM.id])).then();
          }
          updatedTables[tId] = { ...table, status: 'free', currentMatchId: undefined };
          tablesNeedUpdate = true;
          supabase.from('tournoi2_tables').upsert(mapTableToDB(updatedTables[tId])).then();
        }
      }
    });

    Object.values(updatedMatches).forEach(m => {
      if (m.tournamentId !== activeTournament.id && m.tableId && tourTableIds.includes(m.tableId)) {
        updatedMatches[m.id] = { ...m, tableId: undefined, status: m.status === 'playing' ? 'finished' : m.status };
        matchesNeedUpdate = true;
        supabase.from('tournoi2_matches').upsert(mapMatchToDB(updatedMatches[m.id])).then();
      }
    });
  }

  if (tablesNeedUpdate) {
    useStore.setState({ tables: updatedTables });
  }

  if (matchesNeedUpdate) {
    useStore.setState({ matches: updatedMatches });
  }

  // Auto-dispatch any ready tournament matches to available free tables
  useStore.getState().autoDispatchMatches();

  isReceiving = false;

  if (channelsSubscribed) return;
  channelsSubscribed = true;

  // Setup Realtime Subscriptions
  const tablesToSync = ['tournoi2_players', 'tournoi2_tables', 'tournoi2_matches', 'tournoi2_tournaments'];
  
  tablesToSync.forEach(table => {
    supabase.channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        isReceiving = true;
        const storeKey = table.replace('tournoi2_', '') as 'players' | 'tables' | 'matches' | 'tournaments';
        
        try {
          useStore.setState(state => {
            if (payload.eventType === 'DELETE') {
              const newState = { ...state[storeKey] } as any;
              delete newState[payload.old.id];
              return { [storeKey]: newState };
            }
            
            const data = payload.new;
            if (hasClubColumn && data.club_id && data.club_id !== state.currentClub.id) {
              return state;
            }
            let mappedData: any;
            if (storeKey === 'players') mappedData = mapDBToPlayer(data);
            if (storeKey === 'tables') {
              const existingT = state.tables[data.id];
              const parsedT = mapDBToTable(data);
              mappedData = {
                ...existingT,
                ...parsedT,
                liveStreamUrl: parsedT.liveStreamUrl ?? existingT?.liveStreamUrl
              };
            }
            if (storeKey === 'matches') {
              const existingM = state.matches[data.id];
              const parsedM = mapDBToMatch(data);
              mappedData = {
                ...existingM,
                ...parsedM,
                targetSets: parsedM.targetSets ?? existingM?.targetSets,
                handicapP1: parsedM.handicapP1 ?? existingM?.handicapP1,
                handicapP2: parsedM.handicapP2 ?? existingM?.handicapP2,
                stage: parsedM.stage || existingM?.stage,
                bracketRound: parsedM.bracketRound ?? existingM?.bracketRound,
                bracketPosition: parsedM.bracketPosition ?? existingM?.bracketPosition,
                nextMatchId: parsedM.nextMatchId || existingM?.nextMatchId,
                liveStreamUrl: parsedM.liveStreamUrl ?? existingM?.liveStreamUrl
              };

              // If match is finished, immediately clear tableId, free table, and recompute player stats!
              if (mappedData.status === 'finished') {
                mappedData.tableId = undefined;
                const newTables = { ...state.tables };
                let tableFreed = false;
                Object.keys(newTables).forEach(tId => {
                  if (newTables[tId].currentMatchId === data.id) {
                    newTables[tId] = { ...newTables[tId], status: 'free', currentMatchId: undefined };
                    tableFreed = true;
                  }
                });

                const updatedMatches = {
                  ...state.matches,
                  [mappedData.id]: mappedData
                };
                const updatedPlayers = computeAllPlayersStats(state.players, updatedMatches, state.tournaments);

                return {
                  matches: updatedMatches,
                  players: updatedPlayers,
                  ...(tableFreed ? { tables: newTables } : {})
                };
              }
            }
            if (storeKey === 'tournaments') {
              const existingT = state.tournaments[data.id];
              const parsedT = mapDBToTournament(data);
              mappedData = {
                ...existingT,
                ...parsedT,
                finalStageLaunched: parsedT.finalStageLaunched || existingT?.finalStageLaunched
              };
              const tourStreams = (parsedT.settings as any)?.tableLiveStreams as Record<string, string> | undefined;
              if (tourStreams && parsedT.status === 'ongoing') {
                const updatedTables = { ...state.tables };
                Object.keys(updatedTables).forEach(tId => {
                  updatedTables[tId] = {
                    ...updatedTables[tId],
                    liveStreamUrl: normalizeStreamUrl(tourStreams[tId]) || getSavedTableStream(state.currentClub.id, tId) || undefined
                  };
                });
                return {
                  tournaments: {
                    ...state.tournaments,
                    [mappedData.id]: mappedData
                  },
                  tables: updatedTables
                };
              }
            }

            if (storeKey === 'tables' && mappedData.status === 'occupied' && mappedData.currentMatchId) {
              const currentM = state.matches[mappedData.currentMatchId];
              if (currentM && currentM.status === 'finished') {
                // Table was marked occupied by a finished match -> force free it
                mappedData = { ...mappedData, status: 'free', currentMatchId: undefined };
              } else if (currentM && currentM.tableId !== mappedData.id) {
                const healedMatch = { ...currentM, tableId: mappedData.id };
                supabase.from('tournoi2_matches').upsert(mapMatchToDB(healedMatch)).then();
                return {
                  tables: { ...state.tables, [mappedData.id]: mappedData },
                  matches: { ...state.matches, [currentM.id]: healedMatch }
                };
              }
            }

            return {
              [storeKey]: {
                ...state[storeKey],
                [mappedData.id]: {
                  ...(state[storeKey]?.[mappedData.id] || {}),
                  ...mappedData
                }
              }
            };
          });
        } finally {
          isReceiving = false;
        }
        
        // Dispatch next matches if a match finished or table was freed
        const data: any = payload.new;
        if ((storeKey === 'matches' && data?.status === 'finished') || (storeKey === 'tables' && data?.status === 'free')) {
          setTimeout(() => {
            useStore.getState().autoDispatchMatches();
          }, 60);
        }
      }).subscribe();
  });
};

// Setup Diffing for outgoing changes
useStore.subscribe(async (state, prevState) => {
  if (state.currentClub.id !== prevState.currentClub.id) {
    initSync();
    return;
  }

  if (isReceiving) return;

  // Diff Players
  if (state.players !== prevState.players) {
    for (const id in state.players) {
      if (state.players[id] !== prevState.players[id]) {
        supabase.from('tournoi2_players').upsert(mapPlayerToDB(state.players[id])).then();
      }
    }
    for (const id in prevState.players) {
      if (!state.players[id]) supabase.from('tournoi2_players').delete().eq('id', id).then();
    }
  }

  // Diff Tables
  if (state.tables !== prevState.tables) {
    for (const id in state.tables) {
      if (state.tables[id] !== prevState.tables[id]) {
        supabase.from('tournoi2_tables').upsert(mapTableToDB(state.tables[id]))
          .then(({ error }) => {
            if (error) console.error("Supabase UPSERT Error (tables):", error);
          });
      }
    }
    for (const id in prevState.tables) {
      if (!state.tables[id]) supabase.from('tournoi2_tables').delete().eq('id', id).then();
    }
  }

  // Diff Matches
  if (state.matches !== prevState.matches) {
    for (const id in state.matches) {
      if (state.matches[id] !== prevState.matches[id]) {
        supabase.from('tournoi2_matches').upsert(mapMatchToDB(state.matches[id])).then();
      }
    }
    for (const id in prevState.matches) {
      if (!state.matches[id]) supabase.from('tournoi2_matches').delete().eq('id', id).then();
    }
  }

  // Diff Tournaments
  if (state.tournaments !== prevState.tournaments) {
    for (const id in state.tournaments) {
      if (state.tournaments[id] !== prevState.tournaments[id]) {
        supabase.from('tournoi2_tournaments').upsert(mapTournamentToDB(state.tournaments[id])).then();
      }
    }
    for (const id in prevState.tournaments) {
      if (!state.tournaments[id]) supabase.from('tournoi2_tournaments').delete().eq('id', id).then();
    }
  }
});
