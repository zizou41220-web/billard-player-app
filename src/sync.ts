import { supabase } from './supabase';
import { useStore } from './store';
import { Match, Player, Table, Tournament } from './types';

let isReceiving = false;
let hasClubColumn = false;

// Helpers to map camelCase <-> snake_case
const mapPlayerToDB = (p: Player) => {
  const data: any = { id: p.id, name: p.name, level: p.level, avatar_url: p.avatarUrl, stats: p.stats };
  if (hasClubColumn) data.club_id = p.clubId || useStore.getState().currentClub.id;
  return data;
};

const mapDBToPlayer = (d: any): Player => ({
  id: d.id,
  clubId: d.club_id || undefined,
  name: d.name,
  level: d.level,
  avatarUrl: d.avatar_url,
  stats: d.stats
});

const mapTableToDB = (t: Table) => {
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
  y: d.y || undefined
});

const mapMatchToDB = (m: Match) => {
  const data: any = { id: m.id, table_id: m.tableId || null, player1_id: m.player1Id, player2_id: m.player2Id, score1: m.score1, score2: m.score2, status: m.status, start_time: m.startTime, end_time: m.endTime || null, winner_id: m.winnerId || null, tournament_id: m.tournamentId || null };
  if (hasClubColumn) data.club_id = m.clubId || useStore.getState().currentClub.id;
  return data;
};

const mapDBToMatch = (d: any): Match => ({
  id: d.id,
  clubId: d.club_id || undefined,
  tableId: d.table_id || undefined,
  player1Id: d.player1_id,
  player2Id: d.player2_id,
  score1: d.score1,
  score2: d.score2,
  status: d.status,
  startTime: d.start_time,
  endTime: d.end_time || undefined,
  winnerId: d.winner_id || undefined,
  tournamentId: d.tournament_id || undefined
});

const mapTournamentToDB = (t: Tournament) => {
  const data: any = { id: t.id, name: t.name, format: t.format, status: t.status, participants: t.participants, settings: t.settings, matches: t.matches };
  if (hasClubColumn) data.club_id = t.clubId || useStore.getState().currentClub.id;
  return data;
};

const mapDBToTournament = (d: any): Tournament => ({
  id: d.id,
  clubId: d.club_id || undefined,
  name: d.name,
  format: d.format,
  status: d.status,
  participants: d.participants,
  settings: d.settings,
  matches: d.matches
});

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

  if (playersRes.data && playersRes.data.length > 0) {
    const players: Record<string, Player> = {};
    playersRes.data.forEach(d => players[d.id] = mapDBToPlayer(d));
    useStore.setState({ players });
  }

  if (tablesRes.data && tablesRes.data.length > 0) {
    const tables: Record<string, Table> = {};
    tablesRes.data.forEach(d => tables[d.id] = mapDBToTable(d));
    useStore.setState({ tables });
  }

  if (matchesRes.data && matchesRes.data.length > 0) {
    const matches: Record<string, Match> = {};
    matchesRes.data.forEach(d => matches[d.id] = mapDBToMatch(d));
    useStore.setState({ matches });
  }

  if (tournamentsRes.data && tournamentsRes.data.length > 0) {
    const tournaments: Record<string, Tournament> = {};
    tournamentsRes.data.forEach(d => tournaments[d.id] = mapDBToTournament(d));
    useStore.setState({ tournaments });
  }

  // Auto-heal table <-> match associations if desynced
  const currentTables = useStore.getState().tables;
  const currentMatches = useStore.getState().matches;
  let matchesNeedUpdate = false;
  const updatedMatches = { ...currentMatches };

  Object.values(currentTables).forEach(table => {
    if (table.status === 'occupied' && table.currentMatchId && updatedMatches[table.currentMatchId]) {
      if (updatedMatches[table.currentMatchId].tableId !== table.id) {
        updatedMatches[table.currentMatchId] = {
          ...updatedMatches[table.currentMatchId],
          tableId: table.id
        };
        matchesNeedUpdate = true;
        supabase.from('tournoi2_matches').upsert(mapMatchToDB(updatedMatches[table.currentMatchId])).then();
      }
    }

    // Clean up any duplicate matches claiming the same table
    Object.values(updatedMatches).forEach(m => {
      if (m.tableId === table.id && m.id !== table.currentMatchId && m.status !== 'playing') {
        updatedMatches[m.id] = { ...m, tableId: undefined };
        matchesNeedUpdate = true;
        supabase.from('tournoi2_matches').upsert(mapMatchToDB(updatedMatches[m.id])).then();
      }
    });
  });

  if (matchesNeedUpdate) {
    useStore.setState({ matches: updatedMatches });
  }

  // Auto-dispatch any ready tournament matches to available free tables
  useStore.getState().autoDispatchMatches();

  isReceiving = false;

  // Setup Realtime Subscriptions
  const tablesToSync = ['tournoi2_players', 'tournoi2_tables', 'tournoi2_matches', 'tournoi2_tournaments'];
  
  tablesToSync.forEach(table => {
    supabase.channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        isReceiving = true;
        const storeKey = table.replace('tournoi2_', '') as 'players' | 'tables' | 'matches' | 'tournaments';
        
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
          if (storeKey === 'tables') mappedData = mapDBToTable(data);
          if (storeKey === 'matches') mappedData = mapDBToMatch(data);
          if (storeKey === 'tournaments') mappedData = mapDBToTournament(data);

          if (storeKey === 'tables' && mappedData.status === 'occupied' && mappedData.currentMatchId) {
            const currentM = state.matches[mappedData.currentMatchId];
            if (currentM && currentM.tableId !== mappedData.id) {
              const healedMatch = { ...currentM, tableId: mappedData.id };
              supabase.from('tournoi2_matches').upsert(mapMatchToDB(healedMatch)).then();
              return {
                tables: { ...state.tables, [mappedData.id]: mappedData },
                matches: { ...state.matches, [currentM.id]: healedMatch }
              };
            }
          }

          return { [storeKey]: { ...state[storeKey], [mappedData.id]: mappedData } };
        });
        
        // Small delay to prevent echo loops and dispatch next matches if a match finished or table was freed
        setTimeout(() => {
          isReceiving = false;
          const data: any = payload.new;
          if ((storeKey === 'matches' && data?.status === 'finished') || (storeKey === 'tables' && data?.status === 'free')) {
            useStore.getState().autoDispatchMatches();
          }
        }, 120);
      }).subscribe();
  });
};

// Setup Diffing for outgoing changes
useStore.subscribe(async (state, prevState) => {
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
