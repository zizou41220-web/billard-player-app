import { Club, Match, Player, Table, Tournament } from '../types';
import { LiveOverlayConfig, DEFAULT_LIVE_OVERLAY_CONFIG } from './liveOverlay';
import {
  DirectorCameraSlot,
  MultiCamDirectorState,
  StreamDestinationsConfig
} from './multiCamDirector';
import { getMatchScoringRules } from './rules';
import { getClubLogoUrl, defaultClubLogo } from './logo';

export type RelayTargetStatus = 'idle' | 'connecting' | 'live' | 'stopped' | 'error';

export interface BroadcasterStatusSnapshot {
  connectedToRelay: boolean;
  ffmpegAvailable: boolean | null;
  ffmpegPath?: string | null;
  isStreaming: boolean;
  bytesSent: number;
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
  rulesLabel: string;
  isMatchView: boolean;
}

export function resolveCameraAssignment(
  slot: DirectorCameraSlot,
  data: {
    tables: Record<string, Table>;
    matches: Record<string, Match>;
    players: Record<string, Player>;
    tournaments: Record<string, Tournament>;
    currentClub: Club;
  }
): ResolvedCameraAssignment {
  const { tables, matches, players, tournaments, currentClub } = data;
  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;

  if (slot.assignmentType === 'table') {
    const table = slot.tableId ? tables[slot.tableId] : undefined;
    const match = table?.currentMatchId
      ? matches[table.currentMatchId]
      : Object.values(matches).find(m => m.tableId === table?.id && m.status !== 'finished');
    const validMatch = match && match.status !== 'finished' ? match : undefined;
    const p1 = validMatch ? players[validMatch.player1Id] : undefined;
    const p2 = validMatch ? players[validMatch.player2Id] : undefined;
    const rulesLabel = validMatch ? (getMatchScoringRules(validMatch, activeTournament, players).formatLabel || '') : '';
    return {
      title: table ? (table.name || `Billard ${table.number}`) : 'Billard non assigné',
      subtitle: validMatch && p1 && p2 ? `${p1.name} vs ${p2.name}` : 'En attente de match',
      table,
      match: validMatch,
      p1,
      p2,
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
  private audioSources = new Map<string, { stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode }>();

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

  private ensureAudioMixer() {
    if (this.audioCtx && this.audioDest) return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ac = new AudioContextCtor();
    const dest = ac.createMediaStreamDestination();

    // Constant silent carrier so RTMP/FLV always receives a valid audio track even if all mics are muted
    const osc = ac.createOscillator();
    const silentGain = ac.createGain();
    silentGain.gain.value = 0;
    osc.connect(silentGain);
    silentGain.connect(dest);
    osc.start();

    this.audioCtx = ac;
    this.audioDest = dest;
    this.silentOsc = osc;
  }

  private syncAudioRouting() {
    if (!this.audioCtx || !this.audioDest || !this.contextData) return;
    const { directorState, mediaStreams } = this.contextData;
    const targetCamId =
      directorState.broadcastMode === 'single' && directorState.focusedCameraId
        ? directorState.focusedCameraId
        : directorState.activeAudioCameraId;

    // Remove stale streams
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

    // Add new streams
    for (const cam of directorState.cameras) {
      const stream = mediaStreams[cam.id];
      if (stream && stream.getAudioTracks().length > 0 && !this.audioSources.has(cam.id)) {
        try {
          const audioOnlyStream = new MediaStream(stream.getAudioTracks());
          const source = this.audioCtx.createMediaStreamSource(audioOnlyStream);
          const gain = this.audioCtx.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(this.audioDest);
          this.audioSources.set(cam.id, { stream, source, gain });
        } catch {}
      }
    }

    // Apply exclusive audio gain to ONLY the selected camera
    const now = this.audioCtx.currentTime;
    for (const cam of directorState.cameras) {
      const entry = this.audioSources.get(cam.id);
      if (!entry) continue;
      const shouldBeActive = cam.enabled && !cam.forceMuted && cam.id === targetCamId;
      entry.gain.gain.setTargetAtTime(shouldBeActive ? 1.0 : 0.0, now, 0.03);
    }
  }

  public startRenderLoop() {
    if (this.rafTimer !== null) return;
    const tick = () => {
      this.drawFrame();
      this.rafTimer = window.setTimeout(tick, 33); // ~30 FPS reliable even when tab slightly throttled
    };
    tick();
  }

  public stopRenderLoop() {
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
    slot: DirectorCameraSlot
  ) {
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
    } else {
      ctx.fillStyle = '#0b1224';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = 'bold 18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`📷 ${slot.name} — En attente vidéo...`, x + w / 2, y + h / 2);
    }

    ctx.restore();
  }

  private drawSingleScoreboard(assignment: ResolvedCameraAssignment, slot: DirectorCameraSlot, overlayCfg: LiveOverlayConfig, club: Club) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (assignment.match && assignment.p1 && assignment.p2) {
      const boxW = Math.min(820, W - 80);
      const cx = overlayCfg.scoreboardCustomPos ? ((overlayCfg.scoreboardX ?? 50) / 100) * W : W / 2;
      const cy = overlayCfg.scoreboardCustomPos ? ((overlayCfg.scoreboardY ?? 12) / 100) * H : 72;
      const boxH = 82;
      const left = Math.max(20, Math.min(W - boxW - 20, cx - boxW / 2));
      const top = Math.max(16, Math.min(H - boxH - 16, cy - boxH / 2));

      ctx.save();
      drawRoundedRect(ctx, left, top, boxW, boxH, 14);
      ctx.fillStyle = 'rgba(6, 12, 24, 0.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0, 255, 170, 0.7)';
      ctx.stroke();

      // Top mini-header strip
      ctx.fillStyle = 'rgba(255, 34, 68, 0.95)';
      drawRoundedRect(ctx, left + 14, top + 8, 52, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', left + 40, top + 18);

      ctx.fillStyle = '#00ffaa';
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${assignment.title}${assignment.rulesLabel ? ` • ${assignment.rulesLabel}` : ''}`, left + 76, top + 18);

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(club.name, left + boxW - 16, top + 18);

      // Player 1
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(assignment.p1.name.slice(0, 22), left + 18, top + 56);

      // Score Badge
      const scoreBoxW = 110;
      const scoreLeft = left + boxW / 2 - scoreBoxW / 2;
      drawRoundedRect(ctx, scoreLeft, top + 34, scoreBoxW, 40, 10);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = '900 24px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${assignment.match.score1} - ${assignment.match.score2}`, left + boxW / 2, top + 55);

      // Player 2
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(assignment.p2.name.slice(0, 22), left + boxW - 18, top + 56);
      ctx.restore();
    } else {
      // Custom View / Standby Banner
      const bannerW = 460;
      const bannerH = 52;
      const left = 24;
      const top = 22;
      ctx.save();
      drawRoundedRect(ctx, left, top, bannerW, bannerH, 12);
      ctx.fillStyle = 'rgba(6, 12, 24, 0.88)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.stroke();

      ctx.fillStyle = '#ff2244';
      drawRoundedRect(ctx, left + 12, top + 14, 52, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', left + 38, top + 25);

      ctx.fillStyle = '#FBBF24';
      ctx.font = '900 17px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(assignment.title || slot.name, left + 76, top + 20);

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.fillText(assignment.subtitle || club.name, left + 76, top + 38);
      ctx.restore();
    }
  }

  private drawCustomOverlays(overlayCfg: LiveOverlayConfig) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

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
      ctx.save();
      ctx.globalAlpha = imgItem.opacity ?? 1;
      if (imgItem.aspectRatio === 'circle') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    }

    for (const txt of overlayCfg.texts || []) {
      if (!txt.visible || !txt.text.trim()) continue;
      const cx = (txt.x / 100) * W;
      const cy = (txt.y / 100) * H;
      const label = txt.uppercase ? txt.text.toUpperCase() : txt.text;
      const fontSize = Math.round(22 * (txt.scale || 1));
      ctx.save();
      ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
      const metrics = ctx.measureText(label);
      const padX = 18;
      const padY = 10;
      const bw = metrics.width + padX * 2;
      const bh = fontSize + padY * 2;
      if (txt.theme !== 'minimal') {
        drawRoundedRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 10);
        ctx.fillStyle = txt.theme === 'live_red'
          ? 'rgba(185, 28, 28, 0.92)'
          : txt.theme === 'light'
            ? 'rgba(255, 255, 255, 0.95)'
            : 'rgba(8, 14, 26, 0.9)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = txt.theme === 'emerald' ? '#10B981' : '#F59E0B';
        ctx.stroke();
      }
      ctx.fillStyle = txt.theme === 'light' ? '#061512' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
      ctx.restore();
    }
  }

  public drawFrame() {
    const data = this.contextData;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, W, H);

    if (!data) return;

    const { directorState, videoElements, tables, matches, players, tournaments, currentClub } = data;
    const overlayCfg = data.overlayConfig || DEFAULT_LIVE_OVERLAY_CONFIG;
    const enabledCams = directorState.cameras.filter(c => c.enabled);

    if (directorState.broadcastMode === 'single' && directorState.focusedCameraId) {
      const slot = directorState.cameras.find(c => c.id === directorState.focusedCameraId) || enabledCams[0];
      if (slot) {
        this.drawVideoInRect(videoElements[slot.id], 0, 0, W, H, slot);
        const assignment = resolveCameraAssignment(slot, { tables, matches, players, tournaments, currentClub });
        this.drawSingleScoreboard(assignment, slot, overlayCfg, currentClub);
        this.drawCustomOverlays(overlayCfg);
      }
    } else {
      // MOSAIC MODE
      const headerH = 44;
      ctx.fillStyle = '#070c1a';
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillStyle = 'rgba(0, 255, 170, 0.35)';
      ctx.fillRect(0, headerH - 1, W, 1);

      const clubLogo = this.getCachedImage(getClubLogoUrl(currentClub.logoUrl) || defaultClubLogo);
      if (clubLogo) {
        ctx.drawImage(clubLogo, 14, 7, 30, 30);
      }

      ctx.fillStyle = '#ff2244';
      drawRoundedRect(ctx, 54, 11, 52, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', 80, 22);

      ctx.fillStyle = '#FBBF24';
      ctx.font = '900 16px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${currentClub.name} • MULTI-CAMÉRAS`, 118, 22);

      const list = enabledCams.length > 0 ? enabledCams : directorState.cameras.slice(0, 1);
      const count = list.length;
      let cols = 1;
      let rows = 1;
      if (count === 2) {
        if (directorState.mosaicLayout === 'stacked') {
          cols = 1;
          rows = 2;
        } else {
          cols = 2;
          rows = 1;
        }
      } else if (count <= 4) {
        cols = 2;
        rows = 2;
      } else if (count <= 6) {
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

      list.forEach((slot, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = gap + col * (cellW + gap);
        const cy = areaY + row * (cellH + gap);

        this.drawVideoInRect(videoElements[slot.id], cx, cy, cellW, cellH, slot);

        // Tile border
        const isAudioActive = directorState.activeAudioCameraId === slot.id && !slot.forceMuted;
        ctx.strokeStyle = isAudioActive ? '#10B981' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = isAudioActive ? 3 : 1.5;
        ctx.strokeRect(cx, cy, cellW, cellH);

        // Compact scoreboard/label bar inside each tile
        const assignment = resolveCameraAssignment(slot, { tables, matches, players, tournaments, currentClub });
        const barH = 44;
        ctx.fillStyle = 'rgba(6, 10, 22, 0.86)';
        ctx.fillRect(cx + 8, cy + 8, cellW - 16, barH);

        ctx.fillStyle = '#00ffaa';
        ctx.font = '800 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `${isAudioActive ? '🔊 ' : ''}${assignment.title}`,
          cx + 16,
          cy + 21
        );

        if (assignment.match && assignment.p1 && assignment.p2) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 13px Inter, system-ui, sans-serif';
          ctx.fillText(
            `${assignment.p1.name.slice(0, 14)}  ${assignment.match.score1} - ${assignment.match.score2}  ${assignment.p2.name.slice(0, 14)}`,
            cx + 16,
            cy + 39
          );
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '600 12px Inter, system-ui, sans-serif';
          ctx.fillText(assignment.subtitle.slice(0, 34), cx + 16, cy + 39);
        }
      });
    }

    // Mirror onto optional Program Monitor preview canvas
    if (this.previewCanvas) {
      const pCtx = this.previewCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(this.canvas, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
      }
    }
  }

  private getRelayEndpoints(customRelayUrl?: string): string[] {
    const urls: string[] = [];
    if (customRelayUrl && customRelayUrl.trim()) {
      urls.push(customRelayUrl.trim());
    }
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      urls.push(`${proto}//${window.location.host}/api/rtmp-relay`);
    }
    urls.push('ws://127.0.0.1:8765/api/rtmp-relay');
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
          reject(new Error('Relais de diffusion local introuvable. Lancez l\'application sur le PC avec "npm run dev" ou "npm run relay".'));
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
      targets.push({
        id: 'facebook',
        label: 'Facebook Live',
        rtmpUrl: destinations.facebookRtmpUrl.trim() || 'rtmps://live-api-s.facebook.com:443/rtmp/',
        streamKey: destinations.facebookStreamKey.trim()
      });
    }
    if (destinations.youtubeEnabled && destinations.youtubeStreamKey.trim()) {
      targets.push({
        id: 'youtube',
        label: 'YouTube Live',
        rtmpUrl: destinations.youtubeRtmpUrl.trim() || 'rtmp://a.rtmp.youtube.com/live2/',
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

    this.emitStatus({
      lastError: null,
      bytesSent: 0,
      targetStatuses: initialStatuses
    });

    const ws = await this.openFirstWorkingRelaySocket(destinations.relayWsUrl);
    this.ws = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === 'hello') {
          this.emitStatus({
            connectedToRelay: true,
            ffmpegAvailable: Boolean(msg.ffmpegAvailable),
            ffmpegPath: msg.ffmpegPath || null
          });
        } else if (msg.type === 'target_status' && msg.id) {
          this.emitStatus({
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
          this.emitStatus({
            lastError: msg.message || 'Erreur relais RTMP',
            isStreaming: false
          });
        } else if (msg.type === 'relay_stopped') {
          this.emitStatus({ isStreaming: false });
        }
      } catch {}
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        this.emitStatus({ connectedToRelay: false, isStreaming: false });
      }
    };

    ws.send(JSON.stringify({ type: 'start', targets }));

    const canvasStream = this.canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (this.audioDest) {
      tracks.push(...this.audioDest.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    const mimeCandidates = [
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';

    const recorder = new MediaRecorder(combinedStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 2_800_000,
      audioBitsPerSecond: 128_000
    });
    this.recorder = recorder;

    recorder.ondataavailable = async (ev) => {
      if (ev.data && ev.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const buf = await ev.data.arrayBuffer();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(buf);
          this.emitStatus({ bytesSent: this.status.bytesSent + buf.byteLength });
        }
      }
    };

    recorder.start(250);
    this.emitStatus({ isStreaming: true, connectedToRelay: true });
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
