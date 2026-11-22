import { Club, Match, Player, Table, Tournament } from '../types';
import { LiveOverlayConfig, DEFAULT_LIVE_OVERLAY_CONFIG, resolveOverlayTextStyle } from './liveOverlay';
import {
  DirectorCameraSlot,
  DirectorMosaicLayout,
  MultiCamDirectorState,
  StreamDestinationsConfig,
  StreamQualityPreset,
  isVirtualScreenSource
} from './multiCamDirector';
import { getMatchScoringRules } from './rules';
import { getClubLogoUrl, defaultClubLogo } from './logo';
import { getTournamentQualificationStatus, PlayerQualifStat } from './qualifiers';
import { isFinalStageMatch } from './bracket';

export type RelayTargetStatus = 'idle' | 'connecting' | 'live' | 'stopped' | 'error';

export const STREAM_QUALITY_PROFILES: Record<
  StreamQualityPreset,
  { width: number; height: number; bitrateKbps: number; videoBitsPerSecond: number; fps: number; label: string }
> = {
  '480p': { width: 854, height: 480, bitrateKbps: 1200, videoBitsPerSecond: 1_200_000, fps: 30, label: '480p Éco (1.2 Mbps)' },
  '720p': { width: 1280, height: 720, bitrateKbps: 2500, videoBitsPerSecond: 2_800_000, fps: 30, label: '720p HD (2.5 Mbps)' },
  '1080p': { width: 1920, height: 1080, bitrateKbps: 4500, videoBitsPerSecond: 4_800_000, fps: 30, label: '1080p Full HD (4.5 Mbps)' }
};

export interface BroadcasterStatusSnapshot {
  connectedToRelay: boolean;
  ffmpegAvailable: boolean | null;
  ffmpegPath?: string | null;
  isStreaming: boolean;
  bytesSent: number;
  currentFps?: number;
  bitrateKbps?: number;
  audioLevel?: number;
  isRecordingLocal?: boolean;
  localRecordingSec?: number;
  commentatorMicActive?: boolean;
  qualityPreset?: StreamQualityPreset;
  targetStatuses: Record<string, { status: RelayTargetStatus; message?: string; label?: string }>;
  lastError: string | null;
}

export interface LiveCompositeContext {
  directorState: MultiCamDirectorState;
  videoElements: Record<string, HTMLVideoElement | null>;
  mediaStreams: Record<string, MediaStream | null>;
  tables: Record<string, Table>;
  matches: Record<string, Match>;
  players: Record<string, Player>;
  tournaments: Record<string, Tournament>;
  currentClub: Club;
  overlayConfig?: LiveOverlayConfig;
}

export interface ResolvedCameraAssignment {
  title: string;
  subtitle: string;
  table?: Table;
  match?: Match;
  p1?: Player;
  p2?: Player;
  p1Name?: string;
  p1Club?: string;
  p2Name?: string;
  p2Club?: string;
  score1?: number;
  score2?: number;
  rulesLabel: string;
  isMatchView: boolean;
}

export interface MosaicCellRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getMosaicGridRects(
  count: number,
  mosaicLayout: DirectorMosaicLayout,
  W: number = 1280,
  H: number = 720
): MosaicCellRect[] {
  const safeCount = Math.max(1, count);
  const headerH = 44;
  let cols = 1;
  let rows = 1;
  if (safeCount === 1) {
    cols = 1;
    rows = 1;
  } else if (safeCount === 2) {
    if (mosaicLayout === 'stacked') {
      cols = 1;
      rows = 2;
    } else {
      cols = 2;
      rows = 1;
    }
  } else if (safeCount <= 4) {
    cols = 2;
    rows = 2;
  } else if (safeCount <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = 4;
    rows = 2;
  }

  const gap = 8;
  const areaY = headerH + gap;
  const areaH = H - areaY - gap;
  const areaW = W - gap * 2;
  const cellW = (areaW - gap * (cols - 1)) / cols;
  const cellH = (areaH - gap * (rows - 1)) / rows;

  const rects: MosaicCellRect[] = [];
  for (let idx = 0; idx < safeCount; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    rects.push({
      index: idx,
      x: gap + col * (cellW + gap),
      y: areaY + row * (cellH + gap),
      w: cellW,
      h: cellH
    });
  }
  return rects;
}

export function formatTournamentStageLabel(match?: Match, tournament?: Tournament | null): string {
  if (!match) return '';
  if (match.poolName) return match.poolName;
  if (match.stage === 'final') return 'Grande Finale';
  if (match.stage === 'third_place') return 'Petite Finale';
  if (match.stage === 'semi') return '1/2 Finale';
  if (match.stage === 'quarter') return '1/4 Finale';
  if (match.stage === 'round_of_16') return '1/8 Finale';
  if (match.stage === 'round_of_32') return '1/16 Finale';
  if (match.stage === 'round_of_64') return '1/32 Finale';
  if (match.stage === 'qualif') return 'Qualifications';
  if (tournament) return tournament.finalStageLaunched ? 'Phase Finale' : 'Match Tournoi';
  return '';
}

export function isActiveLiveMatch(
  m: Match | undefined,
  tournaments: Record<string, Tournament>
): boolean {
  if (!m || m.status === 'finished') return false;
  if (m.tournamentId) {
    const t = tournaments[m.tournamentId];
    return Boolean(t && t.status === 'ongoing');
  }
  return true;
}

export function resolveCameraAssignment(
  slot: DirectorCameraSlot,
  data: {
    tables: Record<string, Table>;
    matches: Record<string, Match>;
    players: Record<string, Player>;
    tournaments: Record<string, Tournament>;
    currentClub: Club;
  },
  directorState?: MultiCamDirectorState
): ResolvedCameraAssignment {
  const { tables, matches, players, tournaments, currentClub } = data;
  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;

  if (slot.sourceType === 'tournament_standings') {
    return {
      title: '🏆 Classement du Tournoi',
      subtitle: activeTournament ? activeTournament.name : currentClub.name,
      rulesLabel: '',
      isMatchView: false
    };
  }
  if (slot.sourceType === 'tournament_bracket') {
    return {
      title: '🌳 Tableau Phases Finales',
      subtitle: activeTournament ? activeTournament.name : currentClub.name,
      rulesLabel: '',
      isMatchView: false
    };
  }
  if (slot.sourceType === 'matches_live_board') {
    return {
      title: '🎱 Scores en Direct',
      subtitle: currentClub.name,
      rulesLabel: '',
      isMatchView: false
    };
  }
  if (slot.sourceType === 'club_leaderboard') {
    return {
      title: '👑 Classement Club',
      subtitle: currentClub.name,
      rulesLabel: '',
      isMatchView: false
    };
  }

  if (directorState?.situation === 'cuescore_live') {
    const rm = directorState.regionalMatch;
    const hasLoadedCueScore = Boolean(rm.cueScoreInput?.trim() && rm.cueScoreTournamentId?.trim());
    if (!hasLoadedCueScore) {
      return {
        title: 'Live CueScore',
        subtitle: 'En attente d’un lien CueScore...',
        rulesLabel: '',
        isMatchView: false
      };
    }
    const baseTitle = rm.cueScoreTournamentName?.trim() || 'Live CueScore';
    const customSub = rm.cueScoreCustomSubtitle?.trim() || '';
    if (
      rm.cueScoreHasActiveMatch &&
      (rm.cueScoreCustomP1Name?.trim() || rm.cueScoreCustomP2Name?.trim())
    ) {
      const p1Name = rm.cueScoreCustomP1Name?.trim() || 'Joueur 1';
      const p2Name = rm.cueScoreCustomP2Name?.trim() || 'Joueur 2';
      const target = rm.cueScoreCustomTargetSets ?? 0;
      return {
        title: customSub ? `${baseTitle} • ${customSub}` : baseTitle,
        subtitle: `${p1Name} vs ${p2Name}`,
        p1Name,
        p1Club: rm.cueScoreCustomP1Club?.trim() || undefined,
        p2Name,
        p2Club: rm.cueScoreCustomP2Club?.trim() || undefined,
        score1: rm.cueScoreCustomScore1 ?? 0,
        score2: rm.cueScoreCustomScore2 ?? 0,
        rulesLabel: target > 0 ? `1er à ${target}` : '',
        isMatchView: true
      };
    }

    const infoParts: string[] = [];
    if (customSub) {
      infoParts.push(customSub);
    } else {
      if (rm.cueScoreVenueName?.trim()) {
        infoParts.push(rm.cueScoreVenueName.trim());
      }
      if ((rm.cueScorePlayersCount ?? 0) > 0) {
        infoParts.push(`${rm.cueScorePlayersCount} joueur(s) inscrit(s)`);
      }
      if ((rm.cueScoreMatchesCount ?? 0) > 0 && (rm.cueScorePlayingCount ?? 0) === 0) {
        infoParts.push(`${rm.cueScoreMatchesCount} matchs programmés`);
      }
    }

    return {
      title: baseTitle,
      subtitle: infoParts.length > 0 ? infoParts.join(' • ') : 'Direct CueScore',
      rulesLabel: '',
      isMatchView: false
    };
  }

  if (directorState?.situation === 'regional_match') {
    const rm = directorState.regionalMatch;
    const p1Name = rm.player1Name.trim() || 'Joueur 1';
    const p2Name = rm.player2Name.trim() || 'Joueur 2';
    return {
      title: rm.eventTitle.trim() || 'Tournoi Régional',
      subtitle: `${p1Name} vs ${p2Name}`,
      p1Name,
      p1Club: rm.player1Club.trim() || undefined,
      p2Name,
      p2Club: rm.player2Club.trim() || undefined,
      score1: rm.score1 ?? 0,
      score2: rm.score2 ?? 0,
      rulesLabel: rm.targetSets > 0 ? `1er à ${rm.targetSets}` : '',
      isMatchView: true
    };
  }

  if (slot.assignmentType === 'tournament_match') {
    let tMatch = slot.tournamentMatchId ? matches[slot.tournamentMatchId] : undefined;
    if (tMatch && tMatch.status === 'finished' && tMatch.tableId) {
      const nextOnSameTable = Object.values(matches).find(
        m => m.tableId === tMatch!.tableId && isActiveLiveMatch(m, tournaments)
      );
      if (nextOnSameTable) {
        tMatch = nextOnSameTable;
      }
    }
    if (!isActiveLiveMatch(tMatch, tournaments)) {
      tMatch = undefined;
    }
    const matchTour = (tMatch?.tournamentId ? tournaments[tMatch.tournamentId] : null) || activeTournament;
    const table = tMatch?.tableId ? tables[tMatch.tableId] : undefined;
    const p1 = tMatch ? players[tMatch.player1Id] : undefined;
    const p2 = tMatch ? players[tMatch.player2Id] : undefined;
    const rulesLabel = tMatch ? (getMatchScoringRules(tMatch, matchTour, players).formatLabel || '') : '';
    const stageLabel = formatTournamentStageLabel(tMatch, matchTour);
    const tableLabel = table ? (table.name || `Billard ${table.number}`) : '';
    const title = [tableLabel, matchTour?.name || 'Tournoi Appli', stageLabel].filter(Boolean).join(' • ');
    return {
      title,
      subtitle: tMatch && p1 && p2 ? `${p1.name} vs ${p2.name}` : 'Match en attente',
      table,
      match: tMatch,
      p1,
      p2,
      p1Name: p1?.name,
      p1Club: p1?.clubName || p1?.stats?.clubName,
      p2Name: p2?.name,
      p2Club: p2?.clubName || p2?.stats?.clubName,
      score1: tMatch?.score1,
      score2: tMatch?.score2,
      rulesLabel,
      isMatchView: true
    };
  }

  if (slot.assignmentType === 'table') {
    const table = slot.tableId ? tables[slot.tableId] : undefined;
    const match = table?.currentMatchId
      ? matches[table.currentMatchId]
      : Object.values(matches).find(m => m.tableId === table?.id && isActiveLiveMatch(m, tournaments));
    const validMatch = isActiveLiveMatch(match, tournaments) ? match : undefined;
    const matchTour = (validMatch?.tournamentId ? tournaments[validMatch.tournamentId] : null) || activeTournament;
    const stageLabel = validMatch ? formatTournamentStageLabel(validMatch, matchTour) : '';
    const tableTitle = table ? (table.name || `Billard ${table.number}`) : 'Billard non assigné';
    const title = validMatch && matchTour
      ? [tableTitle, matchTour.name, stageLabel].filter(Boolean).join(' • ')
      : tableTitle;
    const p1 = validMatch ? players[validMatch.player1Id] : undefined;
    const p2 = validMatch ? players[validMatch.player2Id] : undefined;
    const rulesLabel = validMatch ? (getMatchScoringRules(validMatch, matchTour, players).formatLabel || '') : '';
    return {
      title,
      subtitle: validMatch && p1 && p2 ? `${p1.name} vs ${p2.name}` : 'En attente de match',
      table,
      match: validMatch,
      p1,
      p2,
      p1Name: p1?.name,
      p1Club: p1?.clubName || p1?.stats?.clubName,
      p2Name: p2?.name,
      p2Club: p2?.clubName || p2?.stats?.clubName,
      score1: validMatch?.score1,
      score2: validMatch?.score2,
      rulesLabel,
      isMatchView: true
    };
  }

  if (slot.assignmentType === 'live_match') {
    const liveMatch = Object.values(matches).find(m => m.tableId === 'live' && m.status !== 'finished');
    const p1 = liveMatch ? players[liveMatch.player1Id] : undefined;
    const p2 = liveMatch ? players[liveMatch.player2Id] : undefined;
    const rulesLabel = liveMatch ? (getMatchScoringRules(liveMatch, null, players).formatLabel || '') : '';
    return {
      title: 'Match Studio Live',
      subtitle: liveMatch && p1 && p2 ? `${p1.name} vs ${p2.name}` : currentClub.name,
      match: liveMatch,
      p1,
      p2,
      p1Name: p1?.name,
      p1Club: p1?.clubName || p1?.stats?.clubName,
      p2Name: p2?.name,
      p2Club: p2?.clubName || p2?.stats?.clubName,
      score1: liveMatch?.score1,
      score2: liveMatch?.score2,
      rulesLabel,
      isMatchView: true
    };
  }

  return {
    title: slot.customViewTitle?.trim() || "Vue d'ensemble Salle",
    subtitle: activeTournament ? activeTournament.name : currentClub.name,
    rulesLabel: '',
    isMatchView: false
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStandingsList(
  ctx: CanvasRenderingContext2D,
  list: PlayerQualifStat[],
  players: Record<string, Player>,
  qualCount: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  poolTitle?: string
) {
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16);
  ctx.fillStyle = 'rgba(10, 17, 34, 0.92)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 255, 170, 0.35)';
  ctx.stroke();

  let headerOffset = 14;
  if (poolTitle) {
    ctx.fillStyle = '#FBBF24';
    ctx.font = '900 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(poolTitle, boxX + 20, boxY + 26);
    headerOffset = 48;
  }

  // Table header
  const colY = boxY + headerOffset + 12;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '800 15px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('#', boxX + 20, colY);
  ctx.fillText('JOUEUR', boxX + 62, colY);
  ctx.textAlign = 'center';
  ctx.fillText('J', boxX + boxW - 230, colY);
  ctx.fillText('V', boxX + boxW - 175, colY);
  ctx.fillText('+/-', boxX + boxW - 115, colY);
  ctx.fillStyle = '#00ffaa';
  ctx.fillText('PTS', boxX + boxW - 48, colY);

  const startY = colY + 22;
  const availH = boxH - (startY - boxY) - 14;
  const maxRows = Math.min(list.length, Math.max(4, Math.floor(availH / 46)));
  const rowH = Math.min(52, availH / Math.max(1, maxRows));

  for (let i = 0; i < maxRows; i++) {
    const stat = list[i];
    const ry = startY + i * rowH;
    const isQual = stat.isSure || i < qualCount;

    drawRoundedRect(ctx, boxX + 12, ry + 2, boxW - 24, rowH - 6, 10);
    ctx.fillStyle = isQual ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255,255,255,0.04)';
    ctx.fill();
    if (isQual) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.stroke();
    }

    const midY = ry + rowH / 2 - 1;
    // Rank badge
    ctx.fillStyle = i === 0 ? '#FBBF24' : i === 1 ? '#CBD5E1' : i === 2 ? '#D97706' : 'rgba(255,255,255,0.65)';
    ctx.font = '900 19px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}`, boxX + 22, midY);

    // Player Name
    const pName = players[stat.id]?.name || stat.name || 'Joueur';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 19px Inter, system-ui, sans-serif';
    const maxNameChars = boxW > 700 ? 28 : 16;
    ctx.fillText(pName.slice(0, maxNameChars), boxX + 62, midY);

    if (stat.isSure && boxW > 650) {
      const nameW = ctx.measureText(pName.slice(0, maxNameChars)).width;
      const badgeX = boxX + 74 + nameW;
      if (badgeX + 86 < boxX + boxW - 260) {
        drawRoundedRect(ctx, badgeX, midY - 11, 78, 22, 6);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '900 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('QUALIFIÉ', badgeX + 39, midY);
      }
    }

    // Numbers
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 18px Inter, system-ui, sans-serif';
    ctx.fillText(`${stat.played}`, boxX + boxW - 230, midY);
    ctx.fillText(`${stat.won}`, boxX + boxW - 175, midY);

    const diff = stat.sf - stat.sa;
    ctx.fillStyle = diff > 0 ? '#34D399' : diff < 0 ? '#F87171' : 'rgba(255,255,255,0.65)';
    ctx.fillText(`${diff > 0 ? '+' : ''}${diff}`, boxX + boxW - 115, midY);

    ctx.fillStyle = '#FBBF24';
    ctx.font = '900 22px Inter, system-ui, sans-serif';
    ctx.fillText(`${stat.pts}`, boxX + boxW - 48, midY);
  }
}

/**
 * Dessine un écran graphique Live (Classement du Tournoi, Tableau Final, Scores en Direct ou Classement Club)
 * dans un rectangle arbitraire (plein écran 1280x720 ou tuile mosaïque).
 */
export function drawVirtualScreenToCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: DirectorCameraSlot,
  data: {
    tables: Record<string, Table>;
    matches: Record<string, Match>;
    players: Record<string, Player>;
    tournaments: Record<string, Tournament>;
    currentClub: Club;
  }
) {
  const { tables, matches, players, tournaments, currentClub } = data;
  const allTours = Object.values(tournaments);
  const targetTour =
    allTours.slice().reverse().find(t => t.status === 'ongoing') ||
    null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(w / 1280, h / 720);

  // Rich broadcast dark emerald background
  const grad = ctx.createRadialGradient(640, 180, 60, 640, 360, 820);
  grad.addColorStop(0, '#0a2923');
  grad.addColorStop(0.6, '#05111e');
  grad.addColorStop(1, '#02050c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);

  // Header bar (Broadcast Pro matte dark)
  ctx.fillStyle = '#0A0E16';
  ctx.fillRect(0, 0, 1280, 74);
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(0, 72, 1280, 2);

  ctx.beginPath();
  ctx.arc(42, 37, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#EF4444';
  ctx.fill();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', 56, 37);

  const headerTitle =
    slot.sourceType === 'tournament_standings'
      ? `CLASSEMENT DU TOURNOI${targetTour ? ` — ${targetTour.name}` : ''}`
      : slot.sourceType === 'tournament_bracket'
        ? `TABLEAU DES PHASES FINALES${targetTour ? ` — ${targetTour.name}` : ''}`
        : slot.sourceType === 'matches_live_board'
          ? `SCORES EN DIRECT — ${currentClub.name}`
          : `CLASSEMENT GÉNÉRAL — ${currentClub.name}`;

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(headerTitle.toUpperCase().slice(0, 56), 110, 37);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(currentClub.name.toUpperCase(), 1250, 37);

  if (slot.sourceType === 'tournament_standings') {
    if (!targetTour) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 26px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aucun tournoi actif pour le moment', 640, 360);
    } else {
      const status = getTournamentQualificationStatus(targetTour, matches, players);
      // Progress pill
      ctx.fillStyle = 'rgba(0,255,170,0.85)';
      ctx.font = '800 17px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `Matchs de qualification : ${status.finishedQualifMatches} / ${status.totalQualifMatches} • ${status.numQualifiers} qualifiés`,
        32,
        106
      );

      if (status.isMultiPool && status.poolNames.length > 1) {
        const pools = status.poolNames.slice(0, 4);
        const cols = pools.length <= 2 ? pools.length : 2;
        const rows = pools.length <= 2 ? 1 : 2;
        const gap = 20;
        const boxW = (1216 - gap * (cols - 1)) / cols;
        const boxH = (566 - gap * (rows - 1)) / rows;
        const qualPerPool = Math.max(1, Math.round(status.numQualifiers / status.poolNames.length));
        pools.forEach((pName, idx) => {
          const c = idx % cols;
          const r = Math.floor(idx / cols);
          drawStandingsList(
            ctx,
            status.rankingsByPool[pName] || [],
            players,
            qualPerPool,
            32 + c * (boxW + gap),
            126 + r * (boxH + gap),
            boxW,
            boxH,
            pName
          );
        });
      } else {
        drawStandingsList(ctx, status.ranking, players, status.numQualifiers, 32, 126, 1216, 566);
      }
    }
  } else if (slot.sourceType === 'tournament_bracket') {
    const tourMatches = targetTour
      ? targetTour.matches.map(id => matches[id]).filter(Boolean).filter(isFinalStageMatch)
      : [];
    if (tourMatches.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 26px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Les phases finales ne sont pas encore lancées', 640, 360);
    } else {
      const stages: Array<{ key: string; label: string }> = [
        { key: 'quarter', label: 'QUARTS' },
        { key: 'semi', label: 'DEMI-FINALES' },
        { key: 'final', label: 'FINALE & 3ÈME PLACE' }
      ];
      const colW = 385;
      const gap = 30;
      stages.forEach((st, cIdx) => {
        const cx = 32 + cIdx * (colW + gap);
        ctx.fillStyle = '#00ffaa';
        ctx.font = '900 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(st.label, cx, 112);

        const list = tourMatches
          .filter(m =>
            st.key === 'final'
              ? m.stage === 'final' || m.stage === 'third_place'
              : m.stage === st.key
          )
          .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));

        list.slice(0, 4).forEach((m, mIdx) => {
          const my = 138 + mIdx * 136;
          drawRoundedRect(ctx, cx, my, colW, 114, 12);
          ctx.fillStyle = m.status === 'playing' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(12, 20, 38, 0.9)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = m.status === 'playing' ? '#F59E0B' : 'rgba(255,255,255,0.16)';
          ctx.stroke();

          const p1Name = players[m.player1Id]?.name || 'À déterminer';
          const p2Name = players[m.player2Id]?.name || 'À déterminer';
          ctx.fillStyle = m.winnerId && m.winnerId === m.player1Id ? '#34D399' : '#fff';
          ctx.font = '800 18px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(p1Name.slice(0, 22), cx + 16, my + 34);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#FBBF24';
          ctx.font = '900 22px Inter, system-ui, sans-serif';
          ctx.fillText(`${m.score1}`, cx + colW - 18, my + 34);

          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(cx + 14, my + 56, colW - 28, 1);

          ctx.fillStyle = m.winnerId && m.winnerId === m.player2Id ? '#34D399' : '#fff';
          ctx.font = '800 18px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(p2Name.slice(0, 22), cx + 16, my + 84);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#FBBF24';
          ctx.font = '900 22px Inter, system-ui, sans-serif';
          ctx.fillText(`${m.score2}`, cx + colW - 18, my + 84);
        });
      });
    }
  } else if (slot.sourceType === 'matches_live_board') {
    const sortedTables = Object.values(tables).sort((a, b) => a.number - b.number).slice(0, 6);
    const hasAnyActiveTableMatch = sortedTables.some(t => {
      const m = t.currentMatchId ? matches[t.currentMatchId] : undefined;
      return isActiveLiveMatch(m, tournaments);
    });
    if (!targetTour && !hasAnyActiveTableMatch) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 26px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aucun tournoi ni match en cours', 640, 360);
    } else {
    const cols = sortedTables.length <= 2 ? sortedTables.length || 1 : 2;
    const rows = Math.ceil(sortedTables.length / cols) || 1;
    const gap = 22;
    const boxW = (1216 - gap * (cols - 1)) / cols;
    const boxH = Math.min(250, (570 - gap * (rows - 1)) / rows);

    sortedTables.forEach((tbl, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const bx = 32 + col * (boxW + gap);
      const by = 112 + row * (boxH + gap);
      const m = tbl.currentMatchId ? matches[tbl.currentMatchId] : undefined;
      const activeM = isActiveLiveMatch(m, tournaments) ? m : undefined;
      const p1 = activeM ? players[activeM.player1Id] : undefined;
      const p2 = activeM ? players[activeM.player2Id] : undefined;

      drawRoundedRect(ctx, bx, by, boxW, boxH, 16);
      ctx.fillStyle = activeM ? 'rgba(10, 22, 40, 0.92)' : 'rgba(10, 16, 28, 0.72)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = activeM ? 'rgba(0, 255, 170, 0.5)' : 'rgba(255,255,255,0.12)';
      ctx.stroke();

      ctx.fillStyle = '#00ffaa';
      ctx.font = '900 21px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(tbl.name || `Billard ${tbl.number}`, bx + 22, by + 36);

      if (activeM && p1 && p2) {
        ctx.fillStyle = '#fff';
        ctx.font = '800 24px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(p1.name.slice(0, 18), bx + 22, by + boxH / 2 + 12);

        drawRoundedRect(ctx, bx + boxW / 2 - 58, by + boxH / 2 - 10, 116, 46, 10);
        ctx.fillStyle = '#F59E0B';
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '900 28px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${activeM.score1} - ${activeM.score2}`, bx + boxW / 2, by + boxH / 2 + 13);

        ctx.fillStyle = '#fff';
        ctx.font = '800 24px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(p2.name.slice(0, 18), bx + boxW - 22, by + boxH / 2 + 12);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '700 20px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Billard libre', bx + boxW / 2, by + boxH / 2 + 14);
      }
    });
    }
  } else {
    // club_leaderboard
    const topPlayers = Object.values(players)
      .slice()
      .sort((a, b) => (b.stats?.points ?? 0) - (a.stats?.points ?? 0) || (b.stats?.wins ?? 0) - (a.stats?.wins ?? 0))
      .slice(0, 10);

    drawRoundedRect(ctx, 32, 108, 1216, 584, 16);
    ctx.fillStyle = 'rgba(10, 17, 34, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '800 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RANG', 56, 140);
    ctx.fillText('JOUEUR', 136, 140);
    ctx.textAlign = 'center';
    ctx.fillText('MATCHS', 760, 140);
    ctx.fillText('VICTOIRES', 900, 140);
    ctx.fillText('% WIN', 1040, 140);
    ctx.fillStyle = '#FBBF24';
    ctx.fillText('POINTS', 1175, 140);

    topPlayers.forEach((p, idx) => {
      const ry = 162 + idx * 51;
      drawRoundedRect(ctx, 48, ry, 1184, 44, 9);
      ctx.fillStyle = idx < 3 ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255,255,255,0.04)';
      ctx.fill();

      const midY = ry + 22;
      ctx.textAlign = 'left';
      ctx.fillStyle = idx === 0 ? '#FBBF24' : idx === 1 ? '#CBD5E1' : idx === 2 ? '#D97706' : 'rgba(255,255,255,0.65)';
      ctx.font = '900 20px Inter, system-ui, sans-serif';
      ctx.fillText(`#${idx + 1}`, 62, midY);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px Inter, system-ui, sans-serif';
      ctx.fillText(p.name.slice(0, 30), 136, midY);

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 18px Inter, system-ui, sans-serif';
      ctx.fillText(`${p.stats?.matchesPlayed ?? 0}`, 760, midY);
      ctx.fillText(`${p.stats?.wins ?? 0}`, 900, midY);
      ctx.fillText(`${Math.round(p.stats?.winRate ?? 0)}%`, 1040, midY);

      ctx.fillStyle = '#FBBF24';
      ctx.font = '900 22px Inter, system-ui, sans-serif';
      ctx.fillText(`${p.stats?.points ?? 0}`, 1175, midY);
    });
  }

  ctx.restore();
}

export class LiveCompositeBroadcaster {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private previewCanvas: HTMLCanvasElement | null = null;
  private contextData: LiveCompositeContext | null = null;
  private rafTimer: number | null = null;
  private imageCache = new Map<string, HTMLImageElement>();

  // Web Audio Mixer
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private silentOsc: OscillatorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private audioSources = new Map<string, { stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode }>();
  private commentatorStream: MediaStream | null = null;
  private commentatorSource: MediaStreamAudioSourceNode | null = null;
  private commentatorGainNode: GainNode | null = null;
  private cameraMasterVolume = 1.0;
  private commentatorMasterVolume = 1.1;

  // Web Worker 30 FPS anti-throttle ticker
  private tickWorker: Worker | null = null;

  // Crossfade transition buffer
  private prevFrameCanvas: HTMLCanvasElement;
  private prevFrameCtx: CanvasRenderingContext2D | null;
  private lastSceneKey = '';
  private transitionStartAt = 0;
  private readonly transitionDurationMs = 320;

  // Telemetry & Local Backup Recording
  private frameTimestamps: number[] = [];
  private lastTelemetryAt = 0;
  private recentBytesWindow: { at: number; bytes: number }[] = [];
  private localRecorder: MediaRecorder | null = null;
  private localChunks: Blob[] = [];
  private localRecStartedAt = 0;
  private localRecTimer: number | null = null;

  // WebSocket + MediaRecorder
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private onStatusChange?: (status: BroadcasterStatusSnapshot) => void;
  private status: BroadcasterStatusSnapshot = {
    connectedToRelay: false,
    ffmpegAvailable: null,
    ffmpegPath: null,
    isStreaming: false,
    bytesSent: 0,
    currentFps: 30,
    bitrateKbps: 0,
    audioLevel: 0,
    isRecordingLocal: false,
    localRecordingSec: 0,
    commentatorMicActive: false,
    qualityPreset: '720p',
    targetStatuses: {},
    lastError: null
  };

  constructor(onStatusChange?: (status: BroadcasterStatusSnapshot) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D non supporté');
    this.ctx = c;

    this.prevFrameCanvas = document.createElement('canvas');
    this.prevFrameCanvas.width = 1280;
    this.prevFrameCanvas.height = 720;
    this.prevFrameCtx = this.prevFrameCanvas.getContext('2d');

    this.onStatusChange = onStatusChange;
  }

  public setPreviewCanvas(canvas: HTMLCanvasElement | null) {
    this.previewCanvas = canvas;
  }

  public getStatus(): BroadcasterStatusSnapshot {
    return this.status;
  }

  private emitStatus(patch: Partial<BroadcasterStatusSnapshot>) {
    this.status = { ...this.status, ...patch };
    this.onStatusChange?.(this.status);
  }

  private getCachedImage(url?: string): HTMLImageElement | null {
    if (!url) return null;
    const cached = this.imageCache.get(url);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    this.imageCache.set(url, img);
    return null;
  }

  public updateContext(data: LiveCompositeContext) {
    this.contextData = data;
    this.syncAudioRouting();
  }

  public setAudioGains(opts: { cameraVolume?: number; commentatorVolume?: number }) {
    if (opts.cameraVolume !== undefined) {
      this.cameraMasterVolume = Math.max(0, Math.min(1.5, opts.cameraVolume));
    }
    if (opts.commentatorVolume !== undefined) {
      this.commentatorMasterVolume = Math.max(0, Math.min(1.5, opts.commentatorVolume));
      if (this.commentatorGainNode && this.audioCtx) {
        this.commentatorGainNode.gain.setTargetAtTime(this.commentatorMasterVolume, this.audioCtx.currentTime, 0.03);
      }
    }
    this.syncAudioRouting();
  }

  public async setCommentatorMicEnabled(enabled: boolean): Promise<boolean> {
    if (!enabled) {
      try {
        this.commentatorSource?.disconnect();
        this.commentatorGainNode?.disconnect();
      } catch {}
      if (this.commentatorStream) {
        this.commentatorStream.getTracks().forEach(t => t.stop());
      }
      this.commentatorStream = null;
      this.commentatorSource = null;
      this.commentatorGainNode = null;
      this.emitStatus({ commentatorMicActive: false });
      return false;
    }

    try {
      this.ensureAudioMixer();
      if (this.audioCtx?.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      if (!this.audioCtx || !this.masterGain) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }
      const src = this.audioCtx.createMediaStreamSource(stream);
      const gain = this.audioCtx.createGain();
      gain.gain.value = this.commentatorMasterVolume;
      src.connect(gain);
      gain.connect(this.masterGain);

      this.commentatorStream = stream;
      this.commentatorSource = src;
      this.commentatorGainNode = gain;
      this.emitStatus({ commentatorMicActive: true });
      return true;
    } catch (err: any) {
      this.emitStatus({
        commentatorMicActive: false,
        lastError: err?.message || "Impossible d'accéder au microphone du PC."
      });
      return false;
    }
  }

  private ensureAudioMixer() {
    if (this.audioCtx && this.audioDest && this.masterGain) return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ac = new AudioContextCtor();
    const dest = ac.createMediaStreamDestination();
    const master = ac.createGain();
    master.gain.value = 1.0;

    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    master.connect(analyser);
    analyser.connect(dest);

    const osc = ac.createOscillator();
    const silentGain = ac.createGain();
    silentGain.gain.value = 0;
    osc.connect(silentGain);
    silentGain.connect(master);
    osc.start();

    this.audioCtx = ac;
    this.audioDest = dest;
    this.masterGain = master;
    this.analyser = analyser;
    this.silentOsc = osc;
  }

  private syncAudioRouting() {
    if (!this.audioCtx || !this.masterGain || !this.contextData) return;
    const { directorState, mediaStreams } = this.contextData;
    const focusedCam =
      directorState.broadcastMode === 'single' && directorState.focusedCameraId
        ? directorState.cameras.find(c => c.id === directorState.focusedCameraId)
        : null;
    const targetCamId =
      focusedCam && !isVirtualScreenSource(focusedCam.sourceType)
        ? focusedCam.id
        : directorState.activeAudioCameraId;

    for (const [camId, entry] of this.audioSources.entries()) {
      const currentStream = mediaStreams[camId];
      if (!currentStream || currentStream !== entry.stream || currentStream.getAudioTracks().length === 0) {
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {}
        this.audioSources.delete(camId);
      }
    }

    for (const cam of directorState.cameras) {
      const stream = mediaStreams[cam.id];
      if (stream && stream.getAudioTracks().length > 0 && !this.audioSources.has(cam.id)) {
        try {
          const audioOnlyStream = new MediaStream(stream.getAudioTracks());
          const source = this.audioCtx.createMediaStreamSource(audioOnlyStream);
          const gain = this.audioCtx.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(this.masterGain);
          this.audioSources.set(cam.id, { stream, source, gain });
        } catch {}
      }
    }

    const now = this.audioCtx.currentTime;
    const muteCamsForPause = Boolean(directorState.isIntermission);
    for (const cam of directorState.cameras) {
      const entry = this.audioSources.get(cam.id);
      if (!entry) continue;
      const shouldBeActive = !muteCamsForPause && cam.enabled && !cam.forceMuted && cam.id === targetCamId;
      entry.gain.gain.setTargetAtTime(shouldBeActive ? this.cameraMasterVolume : 0.0, now, 0.03);
    }
  }

  public startRenderLoop() {
    if (this.rafTimer !== null || this.tickWorker !== null) return;

    // Web Worker timer avoids browser background-tab 1 FPS throttling during live streaming
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob(
          ['let t = setInterval(() => postMessage(1), 33); onmessage = () => { clearInterval(t); close(); };'],
          { type: 'application/javascript' }
        );
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = () => this.drawFrame();
        this.tickWorker = worker;
        return;
      } catch {}
    }

    const tick = () => {
      this.drawFrame();
      this.rafTimer = window.setTimeout(tick, 33);
    };
    tick();
  }

  public stopRenderLoop() {
    if (this.tickWorker) {
      try {
        this.tickWorker.postMessage('stop');
        this.tickWorker.terminate();
      } catch {}
      this.tickWorker = null;
    }
    if (this.rafTimer !== null) {
      window.clearTimeout(this.rafTimer);
      this.rafTimer = null;
    }
  }

  private drawVideoInRect(
    video: HTMLVideoElement | null | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    slot: DirectorCameraSlot,
    data: LiveCompositeContext
  ) {
    if (isVirtualScreenSource(slot.sourceType)) {
      drawVirtualScreenToCanvas(this.ctx, x, y, w, h, slot, {
        tables: data.tables,
        matches: data.matches,
        players: data.players,
        tournaments: data.tournaments,
        currentClub: data.currentClub
      });
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = '#050814';
    ctx.fillRect(x, y, w, h);

    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const rotated = slot.rotation === 90 || slot.rotation === 270;
      const effW = rotated ? vh : vw;
      const effH = rotated ? vw : vh;

      const scaleBase =
        slot.fillMode === 'contain'
          ? Math.min(w / effW, h / effH)
          : Math.max(w / effW, h / effH);
      const finalScale = scaleBase * (slot.zoom || 1);

      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((slot.rotation * Math.PI) / 180);
      ctx.scale(finalScale, finalScale);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else if ((slot.sourceType === 'external' && slot.externalUrl) || slot.sourceType === 'vdo') {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#091529');
      grad.addColorStop(1, '#040a16');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = '#38BDF8';
      ctx.font = '700 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        slot.sourceType === 'vdo'
          ? `VDO.NINJA — ${slot.name.toUpperCase()}`
          : `FLUX EXTERNE — ${slot.name.toUpperCase()}`,
        x + w / 2,
        y + h / 2 - 10
      );
      if (slot.externalUrl && slot.sourceType === 'external') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.fillText(slot.externalUrl.slice(0, 48), x + w / 2, y + h / 2 + 14);
      }
    } else {
      ctx.fillStyle = '#090D16';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slot.name.toUpperCase()} — EN ATTENTE DE SIGNAL`, x + w / 2, y + h / 2);
    }

    ctx.restore();
  }

  private drawSingleScoreboard(assignment: ResolvedCameraAssignment, slot: DirectorCameraSlot, overlayCfg: LiveOverlayConfig, club: Club) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    const hasScoreBoard = assignment.isMatchView && assignment.p1Name && assignment.p2Name && assignment.score1 !== undefined && assignment.score2 !== undefined;
    if (hasScoreBoard) {
      // Matchroom / WNT sleek lower-third TV broadcast bar
      const boxW = Math.min(980, W - 80);
      const hasClubs = Boolean(assignment.p1Club || assignment.p2Club);
      const boxH = hasClubs ? 64 : 56;
      const cx = overlayCfg.scoreboardCustomPos ? ((overlayCfg.scoreboardX ?? 50) / 100) * W : W / 2;
      const cy = overlayCfg.scoreboardCustomPos ? ((overlayCfg.scoreboardY ?? 91) / 100) * H : (H - boxH / 2 - 22);
      const left = Math.max(20, Math.min(W - boxW - 20, cx - boxW / 2));
      const top = Math.max(16, Math.min(H - boxH - 16, cy - boxH / 2));

      ctx.save();
      drawRoundedRect(ctx, left, top, boxW, boxH, 5);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.94)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.stroke();

      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(left + 1, top, boxW - 2, 2.5);

      const metaY = top + 12;
      ctx.beginPath();
      ctx.arc(left + 16, metaY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444';
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let timerPart = '';
      if (assignment.match?.startTime && assignment.match.status === 'playing') {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - assignment.match.startTime) / 1000));
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');
        timerPart = `${mm}:${ss}`;
      }
      const metaText = [assignment.title, assignment.rulesLabel, timerPart].filter(Boolean).join('  •  ').toUpperCase();
      ctx.fillText(metaText.slice(0, 76), left + 26, metaY);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(club.name.toUpperCase(), left + boxW - 14, metaY);

      const centerX = left + boxW / 2;
      const rowY = top + (hasClubs ? 38 : 37);
      const scoreBoxW = 46;
      const scoreBoxH = 34;
      const gapCenter = 36;
      const s1X = centerX - gapCenter / 2 - scoreBoxW;
      const s2X = centerX + gapCenter / 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '800 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VS', centerX, rowY);

      drawRoundedRect(ctx, s1X, rowY - scoreBoxH / 2, scoreBoxW, scoreBoxH, 4);
      ctx.fillStyle = assignment.score1! > assignment.score2! ? '#D4AF37' : '#1E293B';
      ctx.fill();
      ctx.fillStyle = assignment.score1! > assignment.score2! ? '#090D16' : '#F8FAFC';
      ctx.font = '900 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${assignment.score1}`, s1X + scoreBoxW / 2, rowY + 1);

      drawRoundedRect(ctx, s2X, rowY - scoreBoxH / 2, scoreBoxW, scoreBoxH, 4);
      ctx.fillStyle = assignment.score2! > assignment.score1! ? '#D4AF37' : '#1E293B';
      ctx.fill();
      ctx.fillStyle = assignment.score2! > assignment.score1! ? '#090D16' : '#F8FAFC';
      ctx.font = '900 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${assignment.score2}`, s2X + scoreBoxW / 2, rowY + 1);

      const p1Right = s1X - 16;
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 19px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((assignment.p1Name || 'Joueur 1').slice(0, 24), p1Right, hasClubs ? rowY - 4 : rowY);
      if (assignment.p1Club) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillText(assignment.p1Club.slice(0, 28), p1Right, rowY + 14);
      }

      const p2Left = s2X + scoreBoxW + 16;
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 19px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText((assignment.p2Name || 'Joueur 2').slice(0, 24), p2Left, hasClubs ? rowY - 4 : rowY);
      if (assignment.p2Club) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillText(assignment.p2Club.slice(0, 28), p2Left, rowY + 14);
      }
      ctx.restore();
    } else {
      const bannerW = 420;
      const bannerH = 48;
      const left = 24;
      const top = H - bannerH - 22;
      ctx.save();
      drawRoundedRect(ctx, left, top, bannerW, bannerH, 5);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.stroke();
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(left, top + 1, 3, bannerH - 2);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText((assignment.title || slot.name).toUpperCase(), left + 16, top + 17);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText(assignment.subtitle || club.name, left + 16, top + 34);
      ctx.restore();
    }
  }

  private drawCustomOverlays(overlayCfg: LiveOverlayConfig) {
    const ctx = this.ctx;
    // drawFrame() already scales ctx to virtual 1280x720 broadcast coordinates
    const W = 1280;
    const H = 720;

    for (const imgItem of overlayCfg.images || []) {
      if (!imgItem.visible || !imgItem.url) continue;
      const img = this.getCachedImage(imgItem.url);
      if (!img) continue;
      const w = (imgItem.width / 100) * W;
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const h = imgItem.aspectRatio === '1:1' || imgItem.aspectRatio === 'circle'
        ? w
        : imgItem.aspectRatio === '16:9'
          ? (w * 9) / 16
          : imgItem.aspectRatio === '4:3'
            ? (w * 3) / 4
            : imgItem.aspectRatio === '3:4'
              ? (w * 4) / 3
              : imgItem.aspectRatio === 'custom_box'
                ? ((imgItem.height || 20) / 100) * H
                : w / Math.max(0.1, aspect);

      const x = (imgItem.x / 100) * W - w / 2;
      const y = (imgItem.y / 100) * H - h / 2;
      const radius = imgItem.aspectRatio === 'circle' ? Math.min(w, h) / 2 : (imgItem.borderRadius ?? 10);
      const pad = imgItem.bgStyle && imgItem.bgStyle !== 'transparent' ? 6 : 0;

      ctx.save();
      ctx.globalAlpha = imgItem.opacity ?? 1;

      if (imgItem.bgStyle && imgItem.bgStyle !== 'transparent') {
        if (imgItem.aspectRatio === 'circle') {
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        } else {
          drawRoundedRect(ctx, x, y, w, h, radius);
        }
        ctx.fillStyle =
          imgItem.bgStyle === 'white'
            ? 'rgba(255, 255, 255, 0.95)'
            : imgItem.bgStyle === 'emerald'
              ? 'rgba(4, 24, 20, 0.9)'
              : 'rgba(10, 14, 22, 0.88)';
        ctx.fill();
        if (imgItem.bgStyle === 'gold' || imgItem.bgStyle === 'emerald') {
          ctx.lineWidth = 2;
          ctx.strokeStyle = imgItem.bgStyle === 'gold' ? '#F59E0B' : '#10B981';
          ctx.stroke();
        }
      }

      const ix = x + pad;
      const iy = y + pad;
      const iw = Math.max(1, w - pad * 2);
      const ih = Math.max(1, h - pad * 2);

      if (imgItem.aspectRatio === 'circle') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(iw, ih) / 2, 0, Math.PI * 2);
        ctx.clip();
      } else if (radius > 0) {
        drawRoundedRect(ctx, ix, iy, iw, ih, Math.max(0, radius - pad / 2));
        ctx.clip();
      }

      if (imgItem.aspectRatio === 'free' || imgItem.fitMode === 'fill') {
        ctx.drawImage(img, ix, iy, iw, ih);
      } else if (imgItem.fitMode === 'cover') {
        const scale = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
      } else {
        const scale = Math.min(iw / img.naturalWidth, ih / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
      }
      ctx.restore();
    }

    for (const txt of overlayCfg.texts || []) {
      if (!txt.visible || !txt.text.trim()) continue;
      const resolved = resolveOverlayTextStyle(txt);
      const cx = (txt.x / 100) * W;
      const cy = (txt.y / 100) * H;
      const rawText = txt.uppercase ? txt.text.toUpperCase() : txt.text;
      const lines = rawText.split('\n');
      const fontSize = Math.round(24 * (txt.scale || 1));
      const lineHeight = Math.round(fontSize * 1.22);

      ctx.save();
      ctx.font = `${resolved.italic ? 'italic ' : ''}${resolved.fontWeight} ${fontSize}px ${resolved.fontCss}`;
      if ('letterSpacing' in ctx) {
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${resolved.letterSpacingPx}px`;
      }

      let maxLineW = 0;
      for (const line of lines) {
        maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      }

      const padX = resolved.hasBackground ? Math.round(fontSize * 0.95) : 10;
      const padY = resolved.hasBackground ? Math.round(fontSize * 0.42) : 6;
      const bw = maxLineW + padX * 2;
      const bh = lines.length * lineHeight + padY * 2;

      if (resolved.hasBackground) {
        drawRoundedRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, Math.min(resolved.borderRadius, bh / 2));
        if (resolved.bgFill !== 'transparent') {
          ctx.fillStyle = resolved.bgFill;
          ctx.fill();
        }
        if (resolved.borderWidth > 0) {
          ctx.lineWidth = resolved.borderWidth;
          ctx.strokeStyle = resolved.borderColor;
          ctx.stroke();
        }
      }

      ctx.fillStyle = resolved.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (resolved.textShadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
      }

      const startY = cy - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, idx) => {
        const ly = startY + idx * lineHeight;
        ctx.fillText(line, cx, ly);
        if (resolved.underline && line.trim()) {
          const lw = ctx.measureText(line).width;
          ctx.fillRect(cx - lw / 2, ly + fontSize * 0.45, lw, Math.max(2, Math.round(fontSize * 0.07)));
        }
      });

      ctx.restore();
    }
  }

  private drawIntermissionScreen(data: LiveCompositeContext) {
    const ctx = this.ctx;
    const W = 1280;
    const H = 720;
    const { directorState, currentClub, tournaments, matches, players } = data;
    const ongoingTour = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;

    // Deep broadcast slate gradient
    const grad = ctx.createRadialGradient(W / 2, H * 0.35, 60, W / 2, H / 2, 820);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.55, '#0a0e16');
    grad.addColorStop(1, '#04060a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Top & bottom subtle gold accents
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, H - 4, W, 4);

    // Club Logo card
    const clubLogo = this.getCachedImage(getClubLogoUrl(currentClub.logoUrl) || defaultClubLogo);
    if (clubLogo) {
      drawRoundedRect(ctx, W / 2 - 64, 118, 128, 128, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.drawImage(clubLogo, W / 2 - 50, 132, 100, 100);
    }

    // LIVE + Club Name pill
    ctx.fillStyle = '#D4AF37';
    ctx.font = '800 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const topLabel = ongoingTour ? `${currentClub.name}  •  ${ongoingTour.name}` : currentClub.name;
    ctx.fillText(topLabel.toUpperCase(), W / 2, 290);

    // Main Intermission Title
    const mainTitle = (directorState.intermissionTitle?.trim() || 'PAUSE — REPRISE DANS QUELQUES INSTANTS').toUpperCase();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '900 38px Inter, system-ui, sans-serif';
    ctx.fillText(mainTitle.slice(0, 46), W / 2, 360);

    // Gold divider
    ctx.fillStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.fillRect(W / 2 - 120, 404, 240, 2);

    // Subtitle or next pending match
    let subText = directorState.intermissionSubtitle?.trim() || '';
    if (!subText && ongoingTour) {
      const nextPending = Object.values(matches).find(
        m => m.tournamentId === ongoingTour.id && m.status === 'pending' && m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id]
      );
      if (nextPending) {
        subText = `PROCHAIN MATCH : ${players[nextPending.player1Id].name}  VS  ${players[nextPending.player2Id].name}`;
      }
    }
    if (subText) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '700 20px Inter, system-ui, sans-serif';
      ctx.fillText(subText.slice(0, 64), W / 2, 452);
    }

    // Live clock at bottom
    const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillText(`DIRECT EN COURS  •  ${timeStr}`, W / 2, H - 56);
  }

  public drawFrame() {
    const data = this.contextData;
    const ctx = this.ctx;
    const realW = this.canvas.width;
    const realH = this.canvas.height;
    const W = 1280;
    const H = 720;

    if (!data) {
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, realW, realH);
      return;
    }

    const { directorState, videoElements, tables, matches, players, tournaments, currentClub } = data;
    const overlayCfg = data.overlayConfig || DEFAULT_LIVE_OVERLAY_CONFIG;
    const isClubSituation = directorState.situation === 'club_tables';
    const enabledCams = directorState.cameras.filter(
      c => c.enabled && (isClubSituation || !isVirtualScreenSource(c.sourceType))
    );

    // Detect scene switches for smooth 320ms crossfade
    const sceneKey = `${directorState.isIntermission ? 'pause' : 'live'}:${directorState.broadcastMode}:${directorState.focusedCameraId || ''}:${enabledCams.map(c => c.id).join(',')}`;
    const nowPerf = performance.now();
    if (this.lastSceneKey && this.lastSceneKey !== sceneKey && this.prevFrameCtx) {
      this.prevFrameCanvas.width = realW;
      this.prevFrameCanvas.height = realH;
      this.prevFrameCtx.drawImage(this.canvas, 0, 0, realW, realH);
      this.transitionStartAt = nowPerf;
    }
    this.lastSceneKey = sceneKey;

    ctx.save();
    ctx.scale(realW / W, realH / H);
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, W, H);

    if (directorState.isIntermission) {
      this.drawIntermissionScreen(data);
      this.drawCustomOverlays(overlayCfg);
    } else if ((directorState.broadcastMode === 'single' && directorState.focusedCameraId) || enabledCams.length <= 1) {
      const focusedCandidate = directorState.focusedCameraId
        ? directorState.cameras.find(c => c.id === directorState.focusedCameraId)
        : null;
      const fallbackCam = directorState.cameras.filter(c => isClubSituation || !isVirtualScreenSource(c.sourceType))[0];
      const slot = (focusedCandidate && (isClubSituation || !isVirtualScreenSource(focusedCandidate.sourceType)) ? focusedCandidate : null) || enabledCams[0] || fallbackCam;
      if (slot) {
        this.drawVideoInRect(videoElements[slot.id], 0, 0, W, H, slot, data);
        if (!isVirtualScreenSource(slot.sourceType)) {
          const assignment = resolveCameraAssignment(slot, { tables, matches, players, tournaments, currentClub }, directorState);
          this.drawSingleScoreboard(assignment, slot, overlayCfg, currentClub);
        }
        this.drawCustomOverlays(overlayCfg);
      }
    } else {
      const headerH = 44;
      ctx.fillStyle = '#0A0E16';
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(0, headerH - 1, W, 1);

      const clubLogo = this.getCachedImage(getClubLogoUrl(currentClub.logoUrl) || defaultClubLogo);
      if (clubLogo) {
        ctx.drawImage(clubLogo, 14, 7, 30, 30);
      }

      ctx.beginPath();
      ctx.arc(60, 22, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444';
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', 70, 22);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      const mosaicHeaderTitle =
        directorState.situation === 'cuescore_live'
          ? ((directorState.regionalMatch.cueScoreInput?.trim() && directorState.regionalMatch.cueScoreTournamentId?.trim() && directorState.regionalMatch.cueScoreTournamentName?.trim())
              ? directorState.regionalMatch.cueScoreTournamentName.trim()
              : 'LIVE CUESCORE')
          : directorState.situation === 'regional_match'
            ? (directorState.regionalMatch.eventTitle?.trim() || 'TOURNOI RÉGIONAL')
            : currentClub.name;
      ctx.fillText(`${mosaicHeaderTitle.toUpperCase()}  •  MULTI-CAMÉRAS`, 112, 22);

      // Subtle live clock in top-right (also guarantees continuous canvas motion for MediaRecorder)
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      const mosaicTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ctx.fillText(mosaicTime, W - 16, 22);

      const list = enabledCams.length > 0
        ? enabledCams
        : directorState.cameras.filter(c => isClubSituation || !isVirtualScreenSource(c.sourceType)).slice(0, 1);
      const rects = getMosaicGridRects(list.length, directorState.mosaicLayout, W, H);

      list.forEach((slot, idx) => {
        const rect = rects[idx];
        if (!rect) return;
        const { x: cx, y: cy, w: cellW, h: cellH } = rect;

        this.drawVideoInRect(videoElements[slot.id], cx, cy, cellW, cellH, slot, data);

        const isAudioActive = directorState.activeAudioCameraId === slot.id && !slot.forceMuted && !isVirtualScreenSource(slot.sourceType);
        ctx.strokeStyle = isAudioActive ? '#D4AF37' : 'rgba(255,255,255,0.16)';
        ctx.lineWidth = isAudioActive ? 2 : 1;
        ctx.strokeRect(cx, cy, cellW, cellH);

        if (!isVirtualScreenSource(slot.sourceType)) {
          const assignment = resolveCameraAssignment(slot, { tables, matches, players, tournaments, currentClub }, directorState);
          const barH = 44;
          const barX = cx + 8;
          const barY = cy + cellH - barH - 8;
          const barW = cellW - 16;

          ctx.save();
          drawRoundedRect(ctx, barX, barY, barW, barH, 4);
          ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.stroke();
          ctx.fillStyle = '#D4AF37';
          ctx.fillRect(barX + 1, barY, barW - 2, 2);

          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(assignment.title.toUpperCase().slice(0, 38), barX + 10, barY + 13);

          if (isAudioActive) {
            ctx.fillStyle = '#D4AF37';
            ctx.textAlign = 'right';
            ctx.fillText('AUDIO', barX + barW - 10, barY + 13);
          }

          if (assignment.isMatchView && assignment.p1Name && assignment.p2Name && assignment.score1 !== undefined && assignment.score2 !== undefined) {
            const midX = barX + barW / 2;
            const rowY = barY + 31;
            const sbW = 24;
            const sbH = 19;
            const gapC = 14;
            const s1X = midX - gapC / 2 - sbW;
            const s2X = midX + gapC / 2;

            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '700 9px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('-', midX, rowY);

            drawRoundedRect(ctx, s1X, rowY - sbH / 2, sbW, sbH, 3);
            ctx.fillStyle = assignment.score1 > assignment.score2 ? '#D4AF37' : '#1E293B';
            ctx.fill();
            ctx.fillStyle = assignment.score1 > assignment.score2 ? '#090D16' : '#F8FAFC';
            ctx.font = '800 13px Inter, system-ui, sans-serif';
            ctx.fillText(`${assignment.score1}`, s1X + sbW / 2, rowY + 0.5);

            drawRoundedRect(ctx, s2X, rowY - sbH / 2, sbW, sbH, 3);
            ctx.fillStyle = assignment.score2 > assignment.score1 ? '#D4AF37' : '#1E293B';
            ctx.fill();
            ctx.fillStyle = assignment.score2 > assignment.score1 ? '#090D16' : '#F8FAFC';
            ctx.font = '800 13px Inter, system-ui, sans-serif';
            ctx.fillText(`${assignment.score2}`, s2X + sbW / 2, rowY + 0.5);

            ctx.fillStyle = '#F8FAFC';
            ctx.font = '700 12px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(assignment.p1Name.slice(0, 14), s1X - 8, rowY);
            ctx.textAlign = 'left';
            ctx.fillText(assignment.p2Name.slice(0, 14), s2X + sbW + 8, rowY);
          } else {
            ctx.fillStyle = '#CBD5E1';
            ctx.font = '600 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(assignment.subtitle.slice(0, 38), barX + 10, barY + 31);
          }
          ctx.restore();
        }
      });

      // Render custom TV logos, sponsors & texts over the mosaic broadcast as well
      this.drawCustomOverlays(overlayCfg);
    }
    ctx.restore();

    // Smooth crossfade blend during scene transition
    if (this.transitionStartAt > 0) {
      const elapsed = nowPerf - this.transitionStartAt;
      if (elapsed < this.transitionDurationMs) {
        const alpha = 1 - elapsed / this.transitionDurationMs;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.drawImage(this.prevFrameCanvas, 0, 0, realW, realH);
        ctx.restore();
      } else {
        this.transitionStartAt = 0;
      }
    }

    if (this.previewCanvas) {
      const pCtx = this.previewCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(this.canvas, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
      }
    }

    // Telemetry sampling (FPS + VU-Meter Audio Level + Bitrate) ~5x/sec
    this.frameTimestamps.push(nowPerf);
    while (this.frameTimestamps.length > 0 && nowPerf - this.frameTimestamps[0] > 1000) {
      this.frameTimestamps.shift();
    }
    if (nowPerf - this.lastTelemetryAt >= 200) {
      this.lastTelemetryAt = nowPerf;
      let audioLevel = 0;
      if (this.analyser) {
        const samples = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = Math.abs(samples[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        audioLevel = Math.min(100, Math.round(peak * 160));
      }
      const cutoff = Date.now() - 2000;
      this.recentBytesWindow = this.recentBytesWindow.filter(e => e.at >= cutoff);
      const windowBytes = this.recentBytesWindow.reduce((sum, e) => sum + e.bytes, 0);
      const bitrateKbps = this.status.isStreaming ? Math.round((windowBytes * 8) / 2000) : 0;
      this.emitStatus({
        currentFps: this.frameTimestamps.length,
        audioLevel,
        bitrateKbps
      });
    }
  }

  private getRelayEndpoints(customRelayUrl?: string): string[] {
    const urls: string[] = [];
    if (customRelayUrl && customRelayUrl.trim()) {
      urls.push(customRelayUrl.trim());
    }
    const localDefault = 'ws://127.0.0.1:8765/api/rtmp-relay';
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const isLocalOrLan =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (isLocalOrLan) {
        urls.push(`${proto}//${window.location.host}/api/rtmp-relay`);
        urls.push(localDefault);
      } else {
        // Hosted on GitHub Pages / static CDN: check local PC relay FIRST (instant)
        urls.push(localDefault);
        urls.push(`${proto}//${window.location.host}/api/rtmp-relay`);
      }
    } else {
      urls.push(localDefault);
    }
    return Array.from(new Set(urls));
  }

  public async checkRelayAvailability(customRelayUrl?: string): Promise<{ connected: boolean; ffmpegAvailable: boolean; ffmpegPath?: string }> {
    for (const url of this.getRelayEndpoints(customRelayUrl)) {
      const res = await new Promise<{ connected: boolean; ffmpegAvailable: boolean; ffmpegPath?: string }>((resolve) => {
        let settled = false;
        const done = (v: { connected: boolean; ffmpegAvailable: boolean; ffmpegPath?: string }) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        try {
          const testWs = new WebSocket(url);
          const timeout = window.setTimeout(() => {
            try { testWs.close(); } catch {}
            done({ connected: false, ffmpegAvailable: false });
          }, 2200);

          testWs.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              if (msg.type === 'hello' || msg.type === 'pong') {
                window.clearTimeout(timeout);
                try { testWs.close(); } catch {}
                done({
                  connected: true,
                  ffmpegAvailable: Boolean(msg.ffmpegAvailable),
                  ffmpegPath: msg.ffmpegPath || undefined
                });
              }
            } catch {}
          };
          testWs.onerror = () => {
            window.clearTimeout(timeout);
            done({ connected: false, ffmpegAvailable: false });
          };
        } catch {
          done({ connected: false, ffmpegAvailable: false });
        }
      });

      if (res.connected) {
        this.emitStatus({
          connectedToRelay: true,
          ffmpegAvailable: res.ffmpegAvailable,
          ffmpegPath: res.ffmpegPath || null
        });
        return res;
      }
    }
    this.emitStatus({ connectedToRelay: false, ffmpegAvailable: false });
    return { connected: false, ffmpegAvailable: false };
  }

  private openFirstWorkingRelaySocket(customRelayUrl?: string): Promise<WebSocket> {
    const endpoints = this.getRelayEndpoints(customRelayUrl);
    return new Promise((resolve, reject) => {
      let idx = 0;
      const tryNext = () => {
        if (idx >= endpoints.length) {
          reject(new Error('Relais de diffusion local non démarré sur ce PC. Double-cliquez sur "Lancer le Relais Live.bat" (ou "Lancer le tournoi.bat") dans le dossier de l\'application sur le PC.'));
          return;
        }
        const url = endpoints[idx++];
        let opened = false;
        try {
          const ws = new WebSocket(url);
          ws.binaryType = 'arraybuffer';
          const timer = window.setTimeout(() => {
            if (!opened) {
              try { ws.close(); } catch {}
              tryNext();
            }
          }, 2500);

          ws.onopen = () => {
            opened = true;
            window.clearTimeout(timer);
            resolve(ws);
          };
          ws.onerror = () => {
            window.clearTimeout(timer);
            if (!opened) tryNext();
          };
        } catch {
          tryNext();
        }
      };
      tryNext();
    });
  }

  public async startLiveStream(destinations: StreamDestinationsConfig): Promise<void> {
    this.stopLiveStream();

    const targets: { id: string; label: string; rtmpUrl: string; streamKey: string }[] = [];
    if (destinations.facebookEnabled && destinations.facebookStreamKey.trim()) {
      const rawFbUrl = destinations.facebookRtmpUrl.trim();
      const safeFbUrl =
        !rawFbUrl || /^rtmps?:\/\/[^/]+\/?$/i.test(rawFbUrl)
          ? 'rtmps://live-api-s.facebook.com:443/rtmp/'
          : rawFbUrl;
      targets.push({
        id: 'facebook',
        label: 'Facebook Live',
        rtmpUrl: safeFbUrl,
        streamKey: destinations.facebookStreamKey.trim()
      });
    }
    if (destinations.youtubeEnabled && destinations.youtubeStreamKey.trim()) {
      const rawYtUrl = destinations.youtubeRtmpUrl.trim();
      const safeYtUrl =
        !rawYtUrl || /^rtmps?:\/\/a\.rtmp\.youtube\.com\/?$/i.test(rawYtUrl)
          ? 'rtmp://a.rtmp.youtube.com/live2/'
          : rawYtUrl;
      targets.push({
        id: 'youtube',
        label: 'YouTube Live',
        rtmpUrl: safeYtUrl,
        streamKey: destinations.youtubeStreamKey.trim()
      });
    }
    if (destinations.customEnabled && destinations.customRtmpUrl.trim() && destinations.customStreamKey.trim()) {
      targets.push({
        id: 'custom',
        label: 'RTMP Personnalisé',
        rtmpUrl: destinations.customRtmpUrl.trim(),
        streamKey: destinations.customStreamKey.trim()
      });
    }

    if (targets.length === 0) {
      throw new Error('Activez au moins une plateforme (Facebook ou YouTube) et saisissez sa clé de stream.');
    }

    const preset: StreamQualityPreset = destinations.qualityPreset || '720p';
    const profile = STREAM_QUALITY_PROFILES[preset] || STREAM_QUALITY_PROFILES['720p'];
    if (this.canvas.width !== profile.width || this.canvas.height !== profile.height) {
      this.canvas.width = profile.width;
      this.canvas.height = profile.height;
    }

    this.ensureAudioMixer();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
    this.syncAudioRouting();
    this.startRenderLoop();
    this.drawFrame();

    const initialStatuses: Record<string, { status: RelayTargetStatus; label?: string; message?: string }> = {};
    targets.forEach(t => {
      initialStatuses[t.id] = { status: 'connecting', label: t.label };
    });

    this.recentBytesWindow = [];
    this.emitStatus({
      lastError: null,
      bytesSent: 0,
      bitrateKbps: 0,
      qualityPreset: preset,
      targetStatuses: initialStatuses
    });

    const ws = await this.openFirstWorkingRelaySocket(destinations.relayWsUrl);
    this.ws = ws;

    let resolveRelayReady: (() => void) | null = null;
    let rejectRelayReady: ((err: Error) => void) | null = null;
    const relayReadyPromise = new Promise<void>((resolve, reject) => {
      resolveRelayReady = resolve;
      rejectRelayReady = reject;
    });

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === 'hello') {
          this.emitStatus({
            connectedToRelay: true,
            ffmpegAvailable: Boolean(msg.ffmpegAvailable),
            ffmpegPath: msg.ffmpegPath || null
          });
        } else if (msg.type === 'relay_started') {
          resolveRelayReady?.();
          resolveRelayReady = null;
          rejectRelayReady = null;
        } else if (msg.type === 'target_status' && msg.id) {
          this.emitStatus({
            ...(msg.status === 'error' && msg.message ? { lastError: `${msg.label || msg.id} : ${msg.message}` } : {}),
            ...(msg.status === 'live' ? { lastError: null } : {}),
            targetStatuses: {
              ...this.status.targetStatuses,
              [msg.id]: {
                status: msg.status,
                label: msg.label || this.status.targetStatuses[msg.id]?.label,
                message: msg.message
              }
            }
          });
        } else if (msg.type === 'error') {
          const errMsg = msg.message || 'Erreur relais RTMP';
          this.emitStatus({
            lastError: errMsg,
            isStreaming: false
          });
          rejectRelayReady?.(new Error(errMsg));
          resolveRelayReady = null;
          rejectRelayReady = null;
        } else if (msg.type === 'relay_stopped') {
          this.emitStatus({ isStreaming: false });
        }
      } catch {}
    };

    ws.onclose = () => {
      rejectRelayReady?.(new Error('Connexion au relais Live interrompue.'));
      resolveRelayReady = null;
      rejectRelayReady = null;
      if (this.ws === ws) {
        this.ws = null;
        this.emitStatus({ connectedToRelay: false, isStreaming: false, bitrateKbps: 0 });
      }
    };

    ws.send(JSON.stringify({
      type: 'start',
      targets,
      quality: {
        width: profile.width,
        height: profile.height,
        bitrateKbps: profile.bitrateKbps,
        fps: profile.fps
      }
    }));

    // Wait for FFmpeg process to be spawned before starting MediaRecorder so the EBML WebM header is never dropped
    await Promise.race([
      relayReadyPromise,
      new Promise<void>((resolve) => window.setTimeout(resolve, 4000))
    ]);

    if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(this.status.lastError || 'Le relais Live s’est déconnecté avant le démarrage du flux.');
    }

    const canvasStream = this.canvas.captureStream(profile.fps);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (this.audioDest) {
      tracks.push(...this.audioDest.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    const mimeCandidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';

    const recorder = new MediaRecorder(combinedStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: profile.videoBitsPerSecond,
      audioBitsPerSecond: 128_000
    });
    this.recorder = recorder;

    recorder.onerror = (ev: any) => {
      const errMsg = ev?.error?.message || 'Erreur MediaRecorder lors de la capture du flux Mosaïque.';
      this.emitStatus({ lastError: errMsg });
    };

    // Send Blobs synchronously in strict FIFO order (avoids async arrayBuffer reordering that corrupts WebM!)
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.ws.bufferedAmount < 4_000_000) {
          this.ws.send(ev.data);
          this.recentBytesWindow.push({ at: Date.now(), bytes: ev.data.size });
          this.emitStatus({ bytesSent: this.status.bytesSent + ev.data.size });
        }
      }
    };

    recorder.start(250);
    this.emitStatus({ isStreaming: true, connectedToRelay: true });
  }

  public async startLocalRecording(qualityPreset: StreamQualityPreset = '720p'): Promise<void> {
    if (this.localRecorder && this.localRecorder.state !== 'inactive') return;
    const profile = STREAM_QUALITY_PROFILES[qualityPreset] || STREAM_QUALITY_PROFILES['720p'];
    if (!this.status.isStreaming && (this.canvas.width !== profile.width || this.canvas.height !== profile.height)) {
      this.canvas.width = profile.width;
      this.canvas.height = profile.height;
    }

    this.ensureAudioMixer();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
    this.syncAudioRouting();
    this.startRenderLoop();
    this.drawFrame();

    const canvasStream = this.canvas.captureStream(profile.fps);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (this.audioDest) {
      tracks.push(...this.audioDest.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';

    this.localChunks = [];
    const rec = new MediaRecorder(combinedStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: profile.videoBitsPerSecond,
      audioBitsPerSecond: 128_000
    });
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.localChunks.push(ev.data);
      }
    };
    rec.onstop = () => {
      const chunks = this.localChunks;
      this.localChunks = [];
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `MonClubBillard_Live_${stamp}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    };

    this.localRecorder = rec;
    this.localRecStartedAt = Date.now();
    rec.start(1000);
    this.emitStatus({ isRecordingLocal: true, localRecordingSec: 0 });
    this.localRecTimer = window.setInterval(() => {
      this.emitStatus({
        localRecordingSec: Math.max(0, Math.floor((Date.now() - this.localRecStartedAt) / 1000))
      });
    }, 1000);
  }

  public stopLocalRecording() {
    if (this.localRecTimer !== null) {
      window.clearInterval(this.localRecTimer);
      this.localRecTimer = null;
    }
    if (this.localRecorder) {
      try {
        if (this.localRecorder.state !== 'inactive') {
          this.localRecorder.stop();
        }
      } catch {}
      this.localRecorder = null;
    }
    this.emitStatus({ isRecordingLocal: false, localRecordingSec: 0 });
  }

  public stopLiveStream() {
    if (this.recorder) {
      try {
        if (this.recorder.state !== 'inactive') {
          this.recorder.stop();
        }
      } catch {}
      this.recorder = null;
    }

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        }
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.emitStatus({ isStreaming: false });
  }

  public destroy() {
    this.stopLiveStream();
    this.stopLocalRecording();
    this.setCommentatorMicEnabled(false);
    this.stopRenderLoop();
    for (const entry of this.audioSources.values()) {
      try {
        entry.source.disconnect();
        entry.gain.disconnect();
      } catch {}
    }
    this.audioSources.clear();
    try {
      this.silentOsc?.stop();
    } catch {}
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
      this.audioDest = null;
    }
  }
}
