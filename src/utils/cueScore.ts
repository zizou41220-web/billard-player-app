export type CueScoreMatchStatus = 'playing' | 'waiting' | 'finished';

export interface CueScorePlayer {
  id: string;
  name: string;
  club: string;
  avatarUrl?: string;
}

export interface CueScoreMatch {
  matchId: string;
  matchNo?: string;
  roundName: string;
  tableName: string;
  tableNumber: number | null;
  player1Name: string;
  player1Club: string;
  player2Name: string;
  player2Club: string;
  score1: number;
  score2: number;
  raceTo: number;
  status: CueScoreMatchStatus;
}

export interface CueScoreTournamentData {
  tournamentId: string;
  name: string;
  venueName: string;
  defaultRaceTo: number;
  players: CueScorePlayer[];
  matches: CueScoreMatch[];
  tables: string[];
  fetchedAt: number;
}

/**
 * Extrait l'identifiant numérique d'un tournoi CueScore depuis une URL ou un ID brut.
 * Exemples supportés :
 * - https://cuescore.com/tournament/Nom-du-tournoi/48291034
 * - https://api.cuescore.com/tournament/?id=48291034
 * - 48291034
 */
export function extractCueScoreId(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const queryId =
      parsed.searchParams.get('id') ||
      parsed.searchParams.get('tournamentId') ||
      parsed.searchParams.get('tournament');
    if (queryId && /^\d+$/.test(queryId.trim())) {
      return queryId.trim();
    }

    const segments = parsed.pathname
      .split('/')
      .map(s => s.trim())
      .filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(segments[i])) {
        return segments[i];
      }
      const trailingDigits = segments[i].match(/(\d{4,})$/);
      if (trailingDigits) {
        return trailingDigits[1];
      }
    }
  } catch {
    // Fallback regex parsing
  }

  const queryMatch = trimmed.match(/[?&](?:id|tournamentId|tournament)=(\d+)/i);
  if (queryMatch) return queryMatch[1];

  const pathMatch = trimmed.match(/\/(\d{4,})(?:[/?#]|$)/);
  if (pathMatch) return pathMatch[1];

  const anyDigits = trimmed.match(/\d{4,}/);
  return anyDigits ? anyDigits[0] : null;
}

function cleanText(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' && !Number.isNaN(val)) return String(val);
  return '';
}

function extractClubFromObject(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.club === 'string' && obj.club.trim()) return obj.club.trim();
  if (obj.club && typeof obj.club === 'object') {
    const cName = cleanText(obj.club.name || obj.club.shortName || obj.club.title);
    if (cName) return cName;
  }
  const direct =
    cleanText(obj.clubName) ||
    cleanText(obj.team?.name ?? obj.team) ||
    cleanText(obj.association?.name ?? obj.association) ||
    cleanText(obj.city);
  if (direct) return direct;
  if (obj.country && typeof obj.country === 'object') {
    const countryName = cleanText(obj.country.name || obj.country.code);
    if (countryName) return countryName;
  }
  return '';
}

function splitNameAndClub(rawName: string, existingClub: string): { name: string; club: string } {
  const trimmedName = rawName.trim();
  if (existingClub || !trimmedName) {
    return { name: trimmedName, club: existingClub };
  }
  const parenMatch = trimmedName.match(/^(.+?)\s*\(([^()]{2,40})\)$/);
  if (parenMatch) {
    return { name: parenMatch[1].trim(), club: parenMatch[2].trim() };
  }
  return { name: trimmedName, club: '' };
}

function parseTableInfo(rawMatch: any): { tableName: string; tableNumber: number | null } {
  let tableName = '';
  let tableNumber: number | null = null;

  if (rawMatch.table && typeof rawMatch.table === 'object') {
    tableName = cleanText(rawMatch.table.name || rawMatch.table.title);
    const num = Number(rawMatch.table.number ?? rawMatch.table.no ?? rawMatch.table.id);
    if (Number.isFinite(num) && num > 0) tableNumber = num;
  } else {
    tableName = cleanText(rawMatch.tablename ?? rawMatch.tableName ?? rawMatch.table);
  }

  const explicitNo = Number(rawMatch.tableNo ?? rawMatch.tableNumber ?? rawMatch.table_number);
  if (tableNumber === null && Number.isFinite(explicitNo) && explicitNo > 0) {
    tableNumber = explicitNo;
  }

  if (!tableName && tableNumber !== null) {
    tableName = `Table ${tableNumber}`;
  } else if (tableName && /^\d+$/.test(tableName)) {
    tableNumber = Number(tableName);
    tableName = `Table ${tableName}`;
  } else if (tableName && tableNumber === null) {
    const m = tableName.match(/(\d+)/);
    if (m) tableNumber = Number(m[1]);
  }

  return { tableName, tableNumber };
}

function normalizeMatchStatus(rawMatch: any): CueScoreMatchStatus {
  const rawStatus = cleanText(
    rawMatch.matchstatus ?? rawMatch.status ?? rawMatch.state ?? rawMatch.matchStatus
  ).toLowerCase();

  if (
    rawStatus === 'playing' ||
    rawStatus === 'live' ||
    rawStatus === 'ongoing' ||
    rawStatus === 'in_progress' ||
    rawStatus === 'active' ||
    rawStatus === '1'
  ) {
    return 'playing';
  }

  if (
    rawStatus === 'finished' ||
    rawStatus === 'done' ||
    rawStatus === 'completed' ||
    rawStatus === 'ended' ||
    rawStatus === 'walkover' ||
    rawStatus === 'wo' ||
    rawStatus === '2'
  ) {
    return 'finished';
  }

  if (
    rawStatus === 'waiting' ||
    rawStatus === 'pending' ||
    rawStatus === 'upcoming' ||
    rawStatus === 'scheduled' ||
    rawStatus === '0'
  ) {
    return 'waiting';
  }

  if (rawMatch.finished === true || rawMatch.isFinished === true || rawMatch.stoptime || rawMatch.stopTime || rawMatch.endedAt) {
    return 'finished';
  }
  if (rawMatch.starttime || rawMatch.startTime || rawMatch.started) {
    return 'playing';
  }

  return 'waiting';
}

function collectRawMatches(raw: any): any[] {
  const collected: any[] = [];
  const seen = new Set<object>();

  const pushIfMatchList = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (item && typeof item === 'object' && !seen.has(item)) {
        const looksLikeMatch =
          'playerA' in item ||
          'playerB' in item ||
          'player1' in item ||
          'player2' in item ||
          'playerAName' in item ||
          'player1Name' in item ||
          'scoreA' in item ||
          'score1' in item ||
          'matchId' in item ||
          'matchno' in item;
        if (looksLikeMatch) {
          seen.add(item);
          collected.push(item);
        }
      }
    }
  };

  pushIfMatchList(raw?.matches);

  const nestedContainers = [raw?.rounds, raw?.brackets, raw?.stages, raw?.groups, raw?.schedule];
  for (const container of nestedContainers) {
    if (!Array.isArray(container)) continue;
    for (const entry of container) {
      if (!entry || typeof entry !== 'object') continue;
      pushIfMatchList(entry.matches);
      if (Array.isArray(entry.rounds)) {
        for (const sub of entry.rounds) {
          pushIfMatchList(sub?.matches);
        }
      }
    }
  }

  return collected;
}

export function normalizeCueScoreTournament(raw: any, fallbackId: string): CueScoreTournamentData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Réponse CueScore vide ou invalide.');
  }
  if (raw.error && !raw.matches && !raw.participants && !raw.name) {
    throw new Error(String(raw.error));
  }

  const tournamentId = cleanText(raw.tournamentId ?? raw.id) || fallbackId;
  const name =
    cleanText(raw.name || raw.title || raw.tournamentName || raw.event?.name) ||
    `Tournoi CueScore #${tournamentId}`;
  const venueName =
    cleanText(raw.venue?.name || raw.venueName || raw.location || raw.club?.name) || '';
  const defaultRaceTo =
    Number(raw.raceTo ?? raw.race ?? raw.defaultRace ?? raw.bestOf ?? 0) || 0;

  const playerMap = new Map<string, CueScorePlayer>();
  const playerNameMap = new Map<string, CueScorePlayer>();

  const registerPlayer = (idRaw: unknown, nameRaw: unknown, clubRaw: string, avatarRaw?: unknown) => {
    const baseName = cleanText(nameRaw);
    const id = cleanText(idRaw);
    if (!baseName) return;
    const { name: cleanName, club } = splitNameAndClub(baseName, clubRaw);
    const avatarUrl = cleanText(avatarRaw) || undefined;
    const key = id || `name:${cleanName.toLowerCase()}`;
    const existing = playerMap.get(key) || playerNameMap.get(cleanName.toLowerCase());
    const player: CueScorePlayer = {
      id: existing?.id || key,
      name: cleanName,
      club: club || existing?.club || '',
      avatarUrl: avatarUrl || existing?.avatarUrl
    };
    playerMap.set(player.id, player);
    playerNameMap.set(cleanName.toLowerCase(), player);
  };

  const rawParticipants = [
    ...(Array.isArray(raw.participants) ? raw.participants : []),
    ...(Array.isArray(raw.players) ? raw.players : []),
    ...(Array.isArray(raw.entries) ? raw.entries : [])
  ];

  for (const p of rawParticipants) {
    if (!p || typeof p !== 'object') continue;
    const pId = p.playerId ?? p.id ?? p.participantId;
    const pName =
      p.name ||
      p.playerName ||
      p.fullname ||
      [cleanText(p.firstName), cleanText(p.lastName)].filter(Boolean).join(' ');
    const pClub = extractClubFromObject(p);
    registerPlayer(pId, pName, pClub, p.image || p.avatar || p.photo);
  }

  const rawMatches = collectRawMatches(raw);
  const matches: CueScoreMatch[] = [];
  const seenMatchIds = new Set<string>();

  const resolveSide = (
    playerObj: any,
    fallbackId: unknown,
    fallbackName: unknown,
    fallbackClub: unknown,
    placeholder: string
  ): { name: string; club: string } => {
    const objId = cleanText(playerObj?.playerId ?? playerObj?.id ?? fallbackId);
    const rawName =
      cleanText(
        playerObj?.name ||
          playerObj?.playerName ||
          playerObj?.fullname ||
          ([cleanText(playerObj?.firstName), cleanText(playerObj?.lastName)].filter(Boolean).join(' ')) ||
          fallbackName
      ) || (typeof playerObj === 'string' ? playerObj.trim() : '');

    const rawClub =
      extractClubFromObject(playerObj) || cleanText(fallbackClub);

    const mapped =
      (objId ? playerMap.get(objId) : undefined) ||
      (rawName ? playerNameMap.get(rawName.toLowerCase()) : undefined);

    const resolvedBaseName = rawName || mapped?.name || '';
    const { name, club } = splitNameAndClub(resolvedBaseName, rawClub || mapped?.club || '');

    if (name && name.toLowerCase() !== 'bye' && name.toLowerCase() !== 'tbd') {
      registerPlayer(objId || undefined, name, club, playerObj?.image || playerObj?.avatar);
    }

    return {
      name: name || placeholder,
      club
    };
  };

  rawMatches.forEach((m, index) => {
    const matchId = cleanText(m.matchId ?? m.id ?? m.matchno) || `cs_${index + 1}`;
    if (seenMatchIds.has(matchId)) return;
    seenMatchIds.add(matchId);

    const sideA = resolveSide(
      m.playerA ?? m.player1,
      m.playerAId ?? m.player1Id,
      m.playerAName ?? m.player1Name,
      m.playerAClub ?? m.player1Club,
      'Joueur 1'
    );
    const sideB = resolveSide(
      m.playerB ?? m.player2,
      m.playerBId ?? m.player2Id,
      m.playerBName ?? m.player2Name,
      m.playerBClub ?? m.player2Club,
      'Joueur 2'
    );

    const score1 = Math.max(0, Number(m.scoreA ?? m.score1 ?? m.setsA ?? m.playerAScore ?? 0) || 0);
    const score2 = Math.max(0, Number(m.scoreB ?? m.score2 ?? m.setsB ?? m.playerBScore ?? 0) || 0);
    const raceTo = Math.max(0, Number(m.raceTo ?? m.race ?? m.targetSets ?? m.bestOf ?? m.sets ?? defaultRaceTo ?? 0) || 0);
    const { tableName, tableNumber } = parseTableInfo(m);

    const roundRaw =
      cleanText(m.roundName || m.round?.name || m.stageName || m.groupName) ||
      (m.round !== undefined && m.round !== null && cleanText(m.round) ? `Tour ${cleanText(m.round)}` : '');

    matches.push({
      matchId,
      matchNo: cleanText(m.matchno ?? m.matchNo) || undefined,
      roundName: roundRaw,
      tableName,
      tableNumber,
      player1Name: sideA.name,
      player1Club: sideA.club,
      player2Name: sideB.name,
      player2Club: sideB.club,
      score1,
      score2,
      raceTo,
      status: normalizeMatchStatus(m)
    });
  });

  const statusOrder: Record<CueScoreMatchStatus, number> = {
    playing: 0,
    waiting: 1,
    finished: 2
  };
  matches.sort((a, b) => {
    const sDiff = statusOrder[a.status] - statusOrder[b.status];
    if (sDiff !== 0) return sDiff;
    if (a.tableNumber !== null && b.tableNumber !== null && a.tableNumber !== b.tableNumber) {
      return a.tableNumber - b.tableNumber;
    }
    if (a.tableNumber !== null && b.tableNumber === null) return -1;
    if (a.tableNumber === null && b.tableNumber !== null) return 1;
    return 0;
  });

  const tableSet = new Set<string>();
  matches.forEach(m => {
    if (m.tableName) tableSet.add(m.tableName);
  });
  const tables = Array.from(tableSet).sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
  );

  const players = Array.from(playerNameMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  );

  return {
    tournamentId,
    name,
    venueName,
    defaultRaceTo,
    players,
    matches,
    tables,
    fetchedAt: Date.now()
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number = 7000): Promise<any> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      throw new Error('Réponse non JSON');
    }
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.contents === 'string' && !parsed.matches && !parsed.name) {
      return JSON.parse(parsed.contents);
    }
    return parsed;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Récupère et normalise les données d'un tournoi CueScore depuis son URL ou ID,
 * en utilisant le proxy local (Vite / relais PC), l'API directe ou le fallback CORS.
 */
export async function fetchCueScoreTournament(inputOrId: string): Promise<CueScoreTournamentData> {
  const tournamentId = extractCueScoreId(inputOrId);
  if (!tournamentId) {
    throw new Error(
      "Identifiant de tournoi CueScore introuvable. Collez l'URL complète du tournoi (ex: https://cuescore.com/tournament/.../12345678) ou son ID numérique."
    );
  }

  const encodedId = encodeURIComponent(tournamentId);
  const directApiUrl = `https://api.cuescore.com/tournament/?id=${encodedId}`;
  const candidates = [
    `/api/cuescore?id=${encodedId}`,
    `http://127.0.0.1:8765/api/cuescore?id=${encodedId}`,
    directApiUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(directApiUrl)}`
  ];

  let lastError: unknown = null;
  for (const url of candidates) {
    try {
      const json = await fetchJsonWithTimeout(url, 7000);
      return normalizeCueScoreTournament(json, tournamentId);
    } catch (err) {
      lastError = err;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : 'Erreur réseau';
  throw new Error(
    `Impossible de récupérer le tournoi CueScore #${tournamentId} (${reason}). Vérifiez votre connexion Internet ou lancez "npm run relay" sur le PC.`
  );
}
