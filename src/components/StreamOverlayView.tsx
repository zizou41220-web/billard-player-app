import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Club, Match, Player, Table, Tournament } from '../types';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMatchScoringRules } from '../utils/rules';
import { getPlayerAvatar } from '../utils/avatar';

interface StreamOverlayViewProps {
  tableParam: string;
}

import { formatEmbedVideoUrl, extractExternalVideoFromStreamUrl } from '../utils/video';
import {
  LiveOverlayConfig,
  loadLiveOverlayConfig,
  saveLiveOverlayConfig,
  subscribeToLiveOverlayConfig
} from '../utils/liveOverlay';
import { LiveCustomOverlayLayer } from './LiveCustomOverlayLayer';

interface MultiTableTileProps {
  table: Table;
  match?: Match;
  p1?: Player;
  p2?: Player;
  activeTournament: Tournament | null;
  players: Record<string, Player>;
  currentClub: Club;
  videoDevices: MediaDeviceInfo[];
  onFocusTable: (tableId: string) => void;
}



const MultiTableVideoTile: React.FC<MultiTableTileProps> = ({
  table,
  match,
  p1,
  p2,
  activeTournament,
  players,
  currentClub,
  videoDevices,
  onFocusTable
}) => {
  const defaultVdoRoom = `MCB_${currentClub.id}_${table.id}`;
  const tableExtVideo = extractExternalVideoFromStreamUrl(table.liveStreamUrl || match?.liveStreamUrl);
  const [customYtUrl, setCustomYtUrl] = useState<string>(tableExtVideo);
  const activeExtVideo = customYtUrl || tableExtVideo;
  const [sourceMode, setSourceMode] = useState<string>(() => (activeExtVideo ? 'ext' : 'vdo'));
  const [tileZoom, setTileZoom] = useState<number>(1);
  const [tileRotation, setTileRotation] = useState<number>(0);
  const [fillTile, setFillTile] = useState<boolean>(true);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (tableExtVideo) {
      setCustomYtUrl(tableExtVideo);
      if (sourceMode === 'vdo') setSourceMode('ext');
    }
  }, [tableExtVideo]);

  useEffect(() => {
    if (!sourceMode.startsWith('usb:')) return;
    const deviceId = sourceMode.replace('usb:', '');
    let activeStream: MediaStream | null = null;

    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(stream => {
      activeStream = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => {});

    return () => {
      if (activeStream) activeStream.getTracks().forEach(t => t.stop());
    };
  }, [sourceMode]);

  const rulesText = match
    ? (getMatchScoringRules(match, activeTournament, players).formatLabel || '')
    : '';

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: '#050814',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center',
      padding: '0.8rem',
      boxSizing: 'border-box'
    }}>
      {/* Video Layer */}
      {sourceMode === 'ext' && activeExtVideo ? (
        <iframe
          src={formatEmbedVideoUrl(activeExtVideo)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            transform: `rotate(${tileRotation}deg) scale(${tileZoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
            zIndex: 0
          }}
          title={`YouTube ${table.name || table.number}`}
        />
      ) : sourceMode === 'vdo' ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          zIndex: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <iframe
            src={`https://vdo.ninja/?view=${encodeURIComponent(defaultVdoRoom)}&cleanoutput&autoplay&muted${fillTile ? '&cover' : ''}`}
            allow="autoplay; camera; microphone; fullscreen; picture-in-picture"
            style={{
              width: (tileRotation === 90 || tileRotation === 270) ? '100%' : '100%',
              height: (tileRotation === 90 || tileRotation === 270) ? '100%' : '100%',
              border: 'none',
              transform: `rotate(${tileRotation}deg) scale(${tileZoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease'
            }}
            title={`Caméra ${table.name || table.number}`}
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: fillTile ? 'cover' : 'contain',
            transform: `rotate(${tileRotation}deg) scale(${tileZoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
            zIndex: 0
          }}
        />
      )}

      {/* Compact Scoreboard Overlay */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '96%',
        maxWidth: '640px',
        background: 'rgba(8, 12, 26, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderTop: '2px solid var(--accent-primary, #F59E0B)',
        borderRadius: '12px',
        padding: '0.45rem 0.9rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.75)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem'
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', fontWeight: 800 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#ff2244', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />
              LIVE
            </span>
            <span style={{ color: 'var(--accent-primary, #F59E0B)', fontWeight: 900, fontSize: '0.82rem' }}>
              {table.name || `BILLARD ${table.number}`}
            </span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
            {rulesText || activeTournament?.name || currentClub.name}
          </span>
        </div>

        {/* Players & Score row */}
        {match && p1 && p2 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
              <img
                src={getPlayerAvatar(p1)}
                alt={p1.name}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #F59E0B', flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p1.name}
                </span>
                {(p1.clubName || p1.stats?.clubName || p1.clubLogoUrl || p1.stats?.clubLogoUrl) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.66rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                    {(p1.clubLogoUrl || p1.stats?.clubLogoUrl) && (
                      <img src={p1.clubLogoUrl || p1.stats?.clubLogoUrl} alt="" style={{ width: '13px', height: '13px', objectFit: 'contain', borderRadius: '2px', background: '#fff', padding: '1px' }} />
                    )}
                    {p1.clubName || p1.stats?.clubName}
                  </span>
                )}
              </div>
            </div>

            <div style={{
              background: 'var(--accent-primary, #F59E0B)',
              color: '#000',
              fontWeight: 900,
              fontSize: '1.25rem',
              padding: '2px 12px',
              borderRadius: '8px',
              letterSpacing: '1px',
              boxShadow: '0 0 14px rgba(245, 158, 11, 0.45)'
            }}>
              {match.score1} - {match.score2}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', overflow: 'hidden' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {p2.name}
                </span>
                {(p2.clubName || p2.stats?.clubName || p2.clubLogoUrl || p2.stats?.clubLogoUrl) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.66rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                    {p2.clubName || p2.stats?.clubName}
                    {(p2.clubLogoUrl || p2.stats?.clubLogoUrl) && (
                      <img src={p2.clubLogoUrl || p2.stats?.clubLogoUrl} alt="" style={{ width: '13px', height: '13px', objectFit: 'contain', borderRadius: '2px', background: '#fff', padding: '1px' }} />
                    )}
                  </span>
                )}
              </div>
              <img
                src={getPlayerAvatar(p2)}
                alt={p2.name}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #F59E0B', flexShrink: 0 }}
              />
            </div>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', textAlign: 'center', padding: '2px 0' }}>
            En attente du prochain match sur ce billard...
          </div>
        )}
      </div>

      {/* Tile bottom-right mini toolbar */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(5, 8, 22, 0.82)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '0.68rem',
        color: '#fff'
      }}>
        <select
          value={sourceMode}
          onChange={(e) => setSourceMode(e.target.value)}
          style={{
            background: '#0d1527',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '5px',
            padding: '2px 5px',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            maxWidth: '140px'
          }}
          title="Choisir la caméra de ce billard"
        >
          {activeExtVideo && <option value="ext">🌐 YouTube / Lien Externe</option>}
          <option value="vdo">📱 Sans-fil ({table.name || `T${table.number}`})</option>
          {videoDevices.map((d, idx) => (
            <option key={d.deviceId} value={`usb:${d.deviceId}`}>
              🎥 {d.label || `Caméra USB #${idx + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt('Collez ici le lien YouTube (ex: https://www.youtube.com/watch?v=...) :', activeExtVideo || '');
            if (url !== null) {
              const trimmed = url.trim();
              setCustomYtUrl(trimmed);
              if (trimmed) setSourceMode('ext');
              else setSourceMode('vdo');
            }
          }}
          style={{ background: 'rgba(255, 34, 68, 0.25)', color: '#ff8a96', border: '1px solid rgba(255, 34, 68, 0.5)', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.68rem' }}
          title="Coller un lien vidéo YouTube pour ce billard"
        >
          ▶️ YouTube
        </button>
        <button
          type="button"
          onClick={() => setFillTile(!fillTile)}
          style={{ background: fillTile ? 'rgba(0,255,170,0.2)' : 'rgba(255,255,255,0.1)', color: fillTile ? '#00ffaa' : '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.68rem' }}
          title="Plein cadre"
        >
          ↔
        </button>
        <button
          type="button"
          onClick={() => setTileZoom(z => Math.max(1, Math.round((z - 0.2) * 10) / 10))}
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontWeight: 800, fontSize: '0.68rem' }}
        >
          🔍-
        </button>
        <span style={{ fontWeight: 800, minWidth: '28px', textAlign: 'center' }}>{Math.round(tileZoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setTileZoom(z => Math.min(3, Math.round((z + 0.2) * 10) / 10))}
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontWeight: 800, fontSize: '0.68rem' }}
        >
          🔍+
        </button>
        <button
          type="button"
          onClick={() => setTileRotation(r => (r + 90) % 360)}
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.68rem' }}
          title="Pivoter de 90°"
        >
          🔄 {tileRotation}°
        </button>
        <button
          type="button"
          onClick={() => onFocusTable(table.id)}
          style={{ background: 'var(--accent-primary, #F59E0B)', color: '#000', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontWeight: 900, fontSize: '0.68rem' }}
          title="Afficher uniquement ce billard en grand"
        >
          ⤢ Seul
        </button>
      </div>
    </div>
  );
};

const StreamOverlayView: React.FC<StreamOverlayViewProps> = ({ tableParam }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const [activeTableParam, setActiveTableParam] = useState<string>(tableParam);
  const [onlyLiveTables, setOnlyLiveTables] = useState<boolean>(false);
  const [twoTablesStacked, setTwoTablesStacked] = useState<boolean>(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [vdoRoom, setVdoRoom] = useState<string | null>(null);
  const [isLocalBroadcast, setIsLocalBroadcast] = useState(false);
  const [externalVideoUrl, setExternalVideoUrl] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [camError, setCamError] = useState<string | null>(null);
  const [fillScreen, setFillScreen] = useState<boolean>(true);
  const [videoZoom, setVideoZoom] = useState<number>(1);
  const [videoRotation, setVideoRotation] = useState<number>(0);
  const [overlayConfig, setOverlayConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(currentClub.id, 'live')
  );
  const [interactiveOverlayEdit, setInteractiveOverlayEdit] = useState<boolean>(false);
  const [selectedOverlayItemId, setSelectedOverlayItemId] = useState<string | null>(null);
  const [draggingScoreboard, setDraggingScoreboard] = useState<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const screenContainerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOverlayConfig(loadLiveOverlayConfig(currentClub.id, 'live'));
    return subscribeToLiveOverlayConfig(currentClub.id, 'live', (updated) => {
      setOverlayConfig(updated);
    });
  }, [currentClub.id]);

  const handleUpdateOverlayConfig = (next: LiveOverlayConfig) => {
    setOverlayConfig(next);
    saveLiveOverlayConfig(currentClub.id, next, 'live', true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pos') === 'bottom') setPosition('bottom');
    if (params.get('vdo')) setVdoRoom(params.get('vdo'));
    if (params.get('broadcast') === '1') setIsLocalBroadcast(true);
    if (params.get('video')) setExternalVideoUrl(params.get('video'));

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      }).catch(() => {});
    }
  }, []);

  // Local USB / Fixed Camera handling when ?broadcast=1
  useEffect(() => {
    if (!isLocalBroadcast) return;
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      setCamError(null);
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(cams);
        if (!selectedDeviceId && cams.length > 0) {
          const currentTrack = stream.getVideoTracks()[0];
          const currentId = currentTrack?.getSettings()?.deviceId;
          if (currentId) setSelectedDeviceId(currentId);
        }
      } catch (err: any) {
        setCamError("Impossible d'accéder à la caméra USB. Vérifiez qu'elle est bien branchée et autorisée dans le navigateur.");
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isLocalBroadcast, selectedDeviceId]);

  // Find active tournament
  const allTournaments = Object.values(tournaments);
  const activeTournament: Tournament | null = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  // MULTI-TABLE MOSAIC VIEW (?overlay=all or toggled via button)
  if (activeTableParam === 'all') {
    const allSortedTables = Object.values(tables).sort((a, b) => a.number - b.number);
    const tourTables = activeTournament?.settings?.tableIds?.length
      ? allSortedTables.filter(t => activeTournament.settings?.tableIds.includes(t.id))
      : allSortedTables;

    const displayedTables = onlyLiveTables
      ? tourTables.filter(t => {
          const m = t.currentMatchId ? matches[t.currentMatchId] : undefined;
          return Boolean(t.liveStreamUrl || m?.liveStreamUrl || t.status === 'occupied');
        })
      : tourTables;

    const finalTables = displayedTables.length > 0 ? displayedTables : tourTables;
    const count = finalTables.length;

    const gridCols = count <= 1
      ? '1fr'
      : count === 2
        ? (twoTablesStacked ? '1fr' : '1fr 1fr')
        : count <= 4
          ? '1fr 1fr'
          : 'repeat(3, 1fr)';

    const gridRows = count <= 1
      ? '1fr'
      : count === 2
        ? (twoTablesStacked ? '1fr 1fr' : '1fr')
        : '1fr 1fr';

    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#02040a',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.6rem',
        gap: '0.6rem',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        {/* Top Bar for Multi-Billards TV Wall */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(10, 15, 30, 0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '10px',
          padding: '0.45rem 1rem',
          color: '#fff',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ background: '#fff', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
              <img
                src={getClubLogoUrl(currentClub.logoUrl)}
                alt={currentClub.name}
                style={{ height: '24px', objectFit: 'contain' }}
                onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
              />
            </div>
            <span style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--accent-primary, #F59E0B)' }}>
              📺 MUR VIDÉO MULTI-BILLARDS • {currentClub.name}
            </span>
            {activeTournament && (
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                🏆 {activeTournament.name}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setOnlyLiveTables(!onlyLiveTables)}
              style={{
                background: onlyLiveTables ? 'rgba(255, 34, 68, 0.25)' : 'rgba(255,255,255,0.1)',
                color: onlyLiveTables ? '#ff8a96' : '#fff',
                border: onlyLiveTables ? '1px solid #ff2244' : 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.74rem',
                cursor: 'pointer',
                fontWeight: 800
              }}
            >
              {onlyLiveTables ? '🔴 Tables actives uniquement' : `🎱 Tous les billards (${tourTables.length})`}
            </button>
            {count === 2 && (
              <button
                type="button"
                onClick={() => setTwoTablesStacked(!twoTablesStacked)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                {twoTablesStacked ? '◫ Disposition : Côte à côte' : '⊟ Disposition : Haut / Bas'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.();
                } else {
                  document.exitFullscreen?.();
                }
              }}
              style={{
                background: '#00ffaa',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '0.76rem',
                cursor: 'pointer',
                fontWeight: 900
              }}
            >
              ⛶ PLEIN ÉCRAN
            </button>
          </div>
        </div>

        {/* Multi-Table Video Grid */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: gridCols,
          gridTemplateRows: gridRows,
          gap: '0.6rem',
          width: '100%',
          height: '100%'
        }}>
          {finalTables.map(t => {
            const m = t.currentMatchId ? matches[t.currentMatchId] : undefined;
            const player1 = m ? players[m.player1Id] : undefined;
            const player2 = m ? players[m.player2Id] : undefined;
            return (
              <MultiTableVideoTile
                key={t.id}
                table={t}
                match={m}
                p1={player1}
                p2={player2}
                activeTournament={activeTournament}
                players={players}
                currentClub={currentClub}
                videoDevices={videoDevices}
                onFocusTable={(tId) => {
                  const extVid = extractExternalVideoFromStreamUrl(t.liveStreamUrl || m?.liveStreamUrl);
                  setActiveTableParam(tId);
                  if (extVid) {
                    setExternalVideoUrl(extVid);
                    setVdoRoom(null);
                  } else {
                    setVdoRoom(`MCB_${currentClub.id}_${tId}`);
                  }
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Find table by ID (e.g. 't1') or by number (e.g. '1') or by name
  const table: Table | undefined = activeTableParam === 'live'
    ? undefined
    : Object.values(tables).find(t => 
        t.id === activeTableParam || 
        t.number.toString() === activeTableParam || 
        t.name?.toLowerCase().includes(activeTableParam.toLowerCase())
      );

  // Find the match running on this table or standalone live channel
  const match: Match | undefined = activeTableParam === 'live'
    ? Object.values(matches).find(m => m.tableId === 'live' && m.status !== 'finished')
    : (table?.currentMatchId
        ? matches[table.currentMatchId]
        : Object.values(matches).find(m => m.tableId === table?.id && m.status !== 'finished'));
  const isStandaloneLive = activeTableParam === 'live' || Boolean(match && !match.tournamentId);
  const p1 = match ? players[match.player1Id] : undefined;
  const p2 = match ? players[match.player2Id] : undefined;

  const tournamentSettings = activeTournament?.settings;
  const rulesText = match
    ? (getMatchScoringRules(match, activeTournament, players).formatLabel || '')
    : (tournamentSettings
        ? (tournamentSettings.qualifIsWinningSets
            ? `1er à ${tournamentSettings.qualifNbSets}`
            : `${tournamentSettings.qualifNbSets} manches`)
        : '');

  const effectiveExternalVideo = externalVideoUrl || extractExternalVideoFromStreamUrl(table?.liveStreamUrl || match?.liveStreamUrl);
  const hasVideoLayer = Boolean(vdoRoom || isLocalBroadcast || effectiveExternalVideo);

  return (
    <div
      ref={screenContainerRef}
      onPointerMove={(e) => {
        if (!draggingScoreboard || !screenContainerRef.current) return;
        const rect = screenContainerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const dx = ((e.clientX - draggingScoreboard.startX) / rect.width) * 100;
        const dy = ((e.clientY - draggingScoreboard.startY) / rect.height) * 100;
        const nextX = Math.max(8, Math.min(92, Math.round((draggingScoreboard.initX + dx) * 10) / 10));
        const nextY = Math.max(6, Math.min(94, Math.round((draggingScoreboard.initY + dy) * 10) / 10));
        handleUpdateOverlayConfig({
          ...overlayConfig,
          scoreboardCustomPos: true,
          scoreboardX: nextX,
          scoreboardY: nextY
        });
      }}
      onPointerUp={() => setDraggingScoreboard(null)}
      onPointerCancel={() => setDraggingScoreboard(null)}
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: hasVideoLayer ? '#000' : 'transparent',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: position === 'top' ? 'flex-start' : 'flex-end',
        alignItems: 'center',
        padding: '2.5rem',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      {/* 1. VDO.Ninja Wireless Camera Background (Smartphone or PC WebRTC) */}
      {vdoRoom && (
        <div style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          zIndex: 0,
          background: '#050814',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <iframe
            src={`https://vdo.ninja/?view=${encodeURIComponent(vdoRoom)}&cleanoutput&autoplay&muted${fillScreen ? '&cover' : ''}`}
            allow="autoplay; camera; microphone; fullscreen; picture-in-picture"
            style={{
              width: (videoRotation === 90 || videoRotation === 270) ? '100vh' : '100vw',
              height: (videoRotation === 90 || videoRotation === 270) ? '100vw' : '100vh',
              border: 'none',
              transform: `rotate(${videoRotation}deg) scale(${videoZoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.25s ease',
              background: '#050814',
              flexShrink: 0
            }}
            title="Flux Caméra Live"
          />
        </div>
      )}

      {/* 2. Local Fixed USB Camera Background */}
      {isLocalBroadcast && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: fillScreen ? 'cover' : 'contain',
              transform: `rotate(${videoRotation}deg) scale(${videoZoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.25s ease',
              zIndex: 0,
              background: '#050814'
            }}
          />
          {camError && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(20, 8, 16, 0.9)',
              border: '1px solid #ff4466',
              color: '#fff',
              padding: '1.2rem 1.8rem',
              borderRadius: '12px',
              zIndex: 5,
              textAlign: 'center',
              maxWidth: '480px'
            }}>
              <div style={{ fontWeight: 800, color: '#ff4466', marginBottom: '0.4rem', fontSize: '1rem' }}>⚠️ Caméra non détectée</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>{camError}</div>
            </div>
          )}
        </>
      )}

      {/* 3. External IP Camera / YouTube Embed Background */}
      {effectiveExternalVideo && !vdoRoom && !isLocalBroadcast && (
        <iframe
          src={formatEmbedVideoUrl(effectiveExternalVideo)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            transform: `rotate(${videoRotation}deg) scale(${videoZoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.25s ease',
            zIndex: 0,
            background: '#050814'
          }}
          title="Flux Vidéo Externe"
        />
      )}

      {/* Floating Toolbar for Fixed Camera Selection, Zoom, Rotation & Fullscreen */}
      {hasVideoLayer && (
        <div style={{
          position: 'absolute',
          bottom: position === 'top' ? '16px' : 'auto',
          top: position === 'bottom' ? '16px' : 'auto',
          right: '16px',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.45rem',
          background: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.18)',
          padding: '6px 10px',
          borderRadius: '10px',
          fontSize: '0.75rem',
          color: '#fff',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)'
        }}>
          {isLocalBroadcast && videoDevices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              style={{
                background: '#0d1527',
                color: '#fff',
                border: '1px solid rgba(0,255,170,0.4)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId} value={d.deviceId}>
                  🎥 {d.label || `Caméra fixe #${idx + 1}`}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setFillScreen(!fillScreen)}
            style={{
              background: fillScreen ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255,255,255,0.1)',
              color: fillScreen ? '#00ffaa' : '#fff',
              border: fillScreen ? '1px solid rgba(0, 255, 170, 0.4)' : 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
            title="Étirer la vidéo pour remplir tout l'écran"
          >
            {fillScreen ? '↔ Plein cadre : OUI' : '↔ Plein cadre : NON'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', padding: '2px 5px' }}>
            <button
              type="button"
              onClick={() => setVideoZoom(z => Math.max(1, Math.round((z - 0.2) * 10) / 10))}
              style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 900, padding: '2px 6px', fontSize: '0.8rem' }}
              title="Dézoomer"
            >
              🔍-
            </button>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, minWidth: '36px', textAlign: 'center', color: videoZoom > 1 ? '#00ffaa' : '#fff' }}>
              {Math.round(videoZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setVideoZoom(z => Math.min(3, Math.round((z + 0.2) * 10) / 10))}
              style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 900, padding: '2px 6px', fontSize: '0.8rem' }}
              title="Zoomer"
            >
              🔍+
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVideoRotation(r => (r + 90) % 360)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
            title="Pivoter l'image de 90° (utile si le téléphone est vertical)"
          >
            🔄 Pivoter ({videoRotation}°)
          </button>
          <button
            type="button"
            onClick={() => {
              const nextPos = position === 'top' ? 'bottom' : 'top';
              setPosition(nextPos);
              handleUpdateOverlayConfig({
                ...overlayConfig,
                scoreboardCustomPos: false,
                scoreboardX: 50,
                scoreboardY: nextPos === 'bottom' ? 86 : 13
              });
            }}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Score : {position === 'top' ? '⬆ Haut' : '⬇ Bas'}
          </button>
          <button
            type="button"
            onClick={() => setInteractiveOverlayEdit(!interactiveOverlayEdit)}
            style={{
              background: interactiveOverlayEdit ? '#F59E0B' : 'rgba(245, 158, 11, 0.2)',
              color: interactiveOverlayEdit ? '#000' : '#FBBF24',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '0.73rem',
              cursor: 'pointer',
              fontWeight: 800
            }}
            title="Activer pour déplacer librement le score, les images et les textes à la souris sur cet écran"
          >
            {interactiveOverlayEdit ? '✓ Déplacement Actif' : '✋ Déplacer Éléments'}
          </button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('Collez ici le lien YouTube (ex: https://www.youtube.com/watch?v=...) :', effectiveExternalVideo || '');
              if (url !== null) {
                const trimmed = url.trim();
                if (trimmed) {
                  setExternalVideoUrl(trimmed);
                  setVdoRoom(null);
                  setIsLocalBroadcast(false);
                } else {
                  setExternalVideoUrl(null);
                }
              }
            }}
            style={{
              background: 'rgba(255, 34, 68, 0.25)',
              color: '#ff8a96',
              border: '1px solid rgba(255, 34, 68, 0.5)',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '0.73rem',
              cursor: 'pointer',
              fontWeight: 800
            }}
            title="Coller un lien vidéo YouTube"
          >
            ▶️ Lien YouTube
          </button>
          <button
            type="button"
            onClick={() => setActiveTableParam('all')}
            style={{
              background: 'rgba(245, 158, 11, 0.22)',
              color: '#F59E0B',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '0.73rem',
              cursor: 'pointer',
              fontWeight: 800
            }}
            title="Afficher les vidéos de tous les billards sur le même écran"
          >
            ⊞ Multi-Billards
          </button>
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.();
              } else {
                document.exitFullscreen?.();
              }
            }}
            style={{
              background: '#00ffaa',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 900,
              boxShadow: '0 0 12px rgba(0, 255, 170, 0.4)'
            }}
          >
            ⛶ PLEIN ÉCRAN
          </button>
        </div>
      )}
      
      {/* Custom Images & Text Banners Layer (configured in Studio Match Live) */}
      <LiveCustomOverlayLayer
        config={overlayConfig}
        interactive={interactiveOverlayEdit}
        selectedItemId={selectedOverlayItemId}
        onSelectItem={setSelectedOverlayItemId}
        onChangeConfig={handleUpdateOverlayConfig}
        previewScale={1}
      />

      {/* Broadcast Scoreboard Graphic */}
      {(table || isStandaloneLive) && match && p1 && p2 ? (
        <div
          onPointerDown={(e) => {
            if (!interactiveOverlayEdit) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDraggingScoreboard({
              startX: e.clientX,
              startY: e.clientY,
              initX: overlayConfig.scoreboardCustomPos ? (overlayConfig.scoreboardX ?? 50) : 50,
              initY: overlayConfig.scoreboardCustomPos ? (overlayConfig.scoreboardY ?? 13) : (position === 'bottom' ? 86 : 13)
            });
          }}
          style={{
            position: overlayConfig.scoreboardCustomPos ? 'absolute' : 'relative',
            left: overlayConfig.scoreboardCustomPos ? `${overlayConfig.scoreboardX ?? 50}%` : undefined,
            top: overlayConfig.scoreboardCustomPos ? `${overlayConfig.scoreboardY ?? 13}%` : undefined,
            transform: overlayConfig.scoreboardCustomPos
              ? `translate(-50%, -50%) scale(${overlayConfig.scoreboardScale || 1})`
              : undefined,
            cursor: interactiveOverlayEdit ? 'grab' : 'default',
            outline: interactiveOverlayEdit ? '2px dashed #F59E0B' : 'none',
            outlineOffset: '6px',
            zIndex: 15,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: 'fadeInDown 0.4s ease',
            filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.8))',
            maxWidth: '900px',
            width: '100%'
          }}
        >
          
          {/* Top Bar: Tournament & Table Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #050816, #0d1527, #050816)',
            borderTop: '2px solid rgba(0, 255, 170, 0.8)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            padding: '0.4rem 1.4rem',
            borderRadius: '12px 12px 0 0',
            width: '94%',
            boxSizing: 'border-box',
            fontSize: '0.85rem',
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '0.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              {!isStandaloneLive && (
                <div style={{
                  background: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}>
                  <img 
                    src={getClubLogoUrl(currentClub.logoUrl)} 
                    alt={currentClub.name} 
                    style={{ height: '22px', objectFit: 'contain' }} 
                    onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
                  />
                </div>
              )}
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '5px', 
                background: '#ff2244', 
                color: '#fff', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontSize: '0.7rem', 
                fontWeight: 900,
                letterSpacing: '1px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
                LIVE
              </span>
              {!isStandaloneLive && table && (
                <span style={{ color: 'var(--accent-primary, #00ffcc)', fontWeight: 800 }}>
                  {table.name || `BILLARD ${table.number}`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              {!isStandaloneLive && activeTournament && <span>{activeTournament.name}</span>}
              {rulesText && (
                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', color: '#fff' }}>
                  {rulesText}
                </span>
              )}
            </div>
          </div>

          {/* Main Scoreboard: Player 1 vs Player 2 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'stretch',
            background: 'rgba(10, 15, 30, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '0 0 16px 16px',
            overflow: 'hidden',
            width: '100%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
          }}>

            {/* PLAYER 1 BLOCK */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '0.8rem 1.5rem',
              background: match.score1 > match.score2 ? 'linear-gradient(90deg, rgba(0, 255, 170, 0.12), transparent)' : 'transparent',
              gap: '1.2rem',
              borderRight: '1px solid rgba(255,255,255,0.08)'
            }}>
              <img 
                src={getPlayerAvatar(p1)} 
                alt={p1.name} 
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${(!isStandaloneLive && (p1.level === 'Prestige' || p1.level === 'Confirmé')) ? '#ffd700' : '#00ffcc'}`,
                  boxShadow: (!isStandaloneLive && (p1.level === 'Prestige' || p1.level === 'Confirmé')) ? '0 0 16px rgba(255, 215, 0, 0.4)' : '0 0 12px rgba(0,0,0,0.5)',
                  flexShrink: 0
                }}
              />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ 
                  color: '#fff', 
                  fontSize: '1.35rem', 
                  fontWeight: 800, 
                  whiteSpace: 'nowrap', 
                  textOverflow: 'ellipsis', 
                  overflow: 'hidden',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>
                  {p1.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', marginTop: '2px' }}>
                  {!isStandaloneLive && (
                    <span style={{
                      color: (p1.level === 'Prestige' || p1.level === 'Confirmé') ? '#ffd700' : 'rgba(255,255,255,0.6)',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      {(p1.level === 'Prestige' || p1.level === 'Confirmé') ? '👑 Prestige' : 'Amateur'}
                    </span>
                  )}
                  {(p1.clubName || p1.stats?.clubName || p1.clubLogoUrl || p1.stats?.clubLogoUrl) && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      padding: '1px 7px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#fff',
                      fontWeight: 700
                    }}>
                      {(p1.clubLogoUrl || p1.stats?.clubLogoUrl) && (
                        <img
                          src={p1.clubLogoUrl || p1.stats?.clubLogoUrl}
                          alt=""
                          style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px', background: '#fff', padding: '1px' }}
                        />
                      )}
                      {p1.clubName || p1.stats?.clubName}
                    </span>
                  )}
                  {Boolean(match.handicapP1 && match.handicapP1 > 0) && (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(0, 255, 170, 0.25)', color: '#00ffaa', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      +{match.handicapP1} Handicap
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                fontSize: '2.8rem',
                fontWeight: 900,
                color: '#fff',
                minWidth: '55px',
                textAlign: 'center',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                padding: '0.2rem 0.6rem',
                border: '1px solid rgba(255,255,255,0.1)',
                textShadow: match.score1 > match.score2 ? '0 0 15px #00ffcc' : 'none'
              }}>
                {match.score1}
              </div>
            </div>

            {/* CENTER SEPARATOR */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 1rem',
              background: 'rgba(0, 0, 0, 0.5)',
              color: 'rgba(255, 255, 255, 0.4)',
              fontWeight: 900,
              fontSize: '1rem',
              letterSpacing: '2px'
            }}>
              VS
            </div>

            {/* PLAYER 2 BLOCK */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0.8rem 1.5rem',
              background: match.score2 > match.score1 ? 'linear-gradient(270deg, rgba(0, 255, 170, 0.12), transparent)' : 'transparent',
              gap: '1.2rem',
              borderLeft: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{
                fontSize: '2.8rem',
                fontWeight: 900,
                color: '#fff',
                minWidth: '55px',
                textAlign: 'center',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                padding: '0.2rem 0.6rem',
                border: '1px solid rgba(255,255,255,0.1)',
                textShadow: match.score2 > match.score1 ? '0 0 15px #00ffcc' : 'none'
              }}>
                {match.score2}
              </div>
              <div style={{ flex: 1, textAlign: 'right', overflow: 'hidden' }}>
                <div style={{ 
                  color: '#fff', 
                  fontSize: '1.35rem', 
                  fontWeight: 800, 
                  whiteSpace: 'nowrap', 
                  textOverflow: 'ellipsis', 
                  overflow: 'hidden',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>
                  {p2.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.45rem', marginTop: '2px' }}>
                  {Boolean(match.handicapP2 && match.handicapP2 > 0) && (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(0, 255, 170, 0.25)', color: '#00ffaa', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      +{match.handicapP2} Handicap
                    </span>
                  )}
                  {(p2.clubName || p2.stats?.clubName || p2.clubLogoUrl || p2.stats?.clubLogoUrl) && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      padding: '1px 7px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#fff',
                      fontWeight: 700
                    }}>
                      {p2.clubName || p2.stats?.clubName}
                      {(p2.clubLogoUrl || p2.stats?.clubLogoUrl) && (
                        <img
                          src={p2.clubLogoUrl || p2.stats?.clubLogoUrl}
                          alt=""
                          style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px', background: '#fff', padding: '1px' }}
                        />
                      )}
                    </span>
                  )}
                  {!isStandaloneLive && (
                    <span style={{
                      color: (p2.level === 'Prestige' || p2.level === 'Confirmé') ? '#ffd700' : 'rgba(255,255,255,0.6)',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      {(p2.level === 'Prestige' || p2.level === 'Confirmé') ? '👑 Prestige' : 'Amateur'}
                    </span>
                  )}
                </div>
              </div>
              <img 
                src={getPlayerAvatar(p2)} 
                alt={p2.name} 
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${(!isStandaloneLive && (p2.level === 'Prestige' || p2.level === 'Confirmé')) ? '#ffd700' : '#00ffcc'}`,
                  boxShadow: (!isStandaloneLive && (p2.level === 'Prestige' || p2.level === 'Confirmé')) ? '0 0 16px rgba(255, 215, 0, 0.4)' : '0 0 12px rgba(0,0,0,0.5)',
                  flexShrink: 0
                }}
              />
            </div>

          </div>

          {/* Winner Banner if match is finished */}
          {match.status === 'finished' && match.winnerId && (
            <div style={{
              marginTop: '0.6rem',
              background: 'linear-gradient(90deg, #ffd700, #ffaa00)',
              color: '#000',
              fontWeight: 900,
              padding: '0.4rem 1.5rem',
              borderRadius: '20px',
              fontSize: '0.95rem',
              boxShadow: '0 4px 20px rgba(255, 215, 0, 0.4)',
              animation: 'bounce 1s infinite'
            }}>
              🏆 Victoire de {players[match.winnerId]?.name} !
            </div>
          )}

        </div>
      ) : (
        /* Standby / Waiting for Match State */
        <div style={{
          position: 'relative',
          zIndex: 10,
          background: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '0.8rem 1.8rem',
          borderRadius: '16px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '1.2rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
        }}>
          {!isStandaloneLive && (
            <div style={{
              background: '#ffffff',
              padding: '3px 8px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              flexShrink: 0
            }}>
              <img 
                src={getClubLogoUrl(currentClub.logoUrl)} 
                alt={currentClub.name} 
                style={{ height: '36px', objectFit: 'contain' }} 
                onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
              />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--accent-primary, #00ffcc)' }}>
              {isStandaloneLive ? 'Match Live' : (table ? (table.name || `Billard ${table.number}`) : `Table ${tableParam}`)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
              {isStandaloneLive ? 'En attente du prochain match...' : `${currentClub.name} • En attente du prochain match...`}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StreamOverlayView;
