import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';
import {
  CameraSignalingHandle,
  DEFAULT_MOSAIC_HEADER,
  DirectorCameraSlot,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  buildCameraVideoFilter,
  createCameraSignalingChannel,
  isVirtualScreenSource,
  loadDirectorState,
  saveDirectorState,
  subscribeToDirectorState
} from '../utils/multiCamDirector';
import { drawVirtualScreenToCanvas, resolveCameraAssignment } from '../utils/liveBroadcaster';
import { LiveOverlayConfig, loadLiveOverlayConfig, subscribeToLiveOverlayConfig } from '../utils/liveOverlay';
import { LiveCustomOverlayLayer } from './LiveCustomOverlayLayer';
import { formatEmbedVideoUrl } from '../utils/video';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getPlayerAvatar } from '../utils/avatar';
import MatchTimerBadge from './MatchTimerBadge';
import { resolveMatchDurationMinutes } from '../utils/rules';

interface DirectorTvOutputViewProps {
  onExitToAll?: () => void;
}

interface DirectorOutputTileProps {
  slot: DirectorCameraSlot;
  directorState: MultiCamDirectorState;
  stream: MediaStream | null;
  isAudioActive: boolean;
  isFocusedFullscreen?: boolean;
  isHiddenByOtherFullscreen?: boolean;
  isObsClean?: boolean;
  overlayConfig?: LiveOverlayConfig;
  onClickTile?: () => void;
}

const VirtualScreenCanvas: React.FC<{
  slot: DirectorCameraSlot;
  hideTopHeader?: boolean;
  bottomReservePx?: number;
}> = ({ slot, hideTopHeader = false, bottomReservePx = 0 }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawVirtualScreenToCanvas(
      ctx,
      0,
      0,
      canvas.width,
      canvas.height,
      slot,
      {
        tables,
        matches,
        players,
        tournaments,
        currentClub
      },
      { hideTopHeader, bottomReservePx }
    );
  }, [slot, tables, matches, players, tournaments, currentClub, hideTopHeader, bottomReservePx]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }}
    />
  );
};

const DirectorVideoElement: React.FC<{
  slot: DirectorCameraSlot;
  stream: MediaStream | null;
  unmuteAudio: boolean;
  hideVirtualTopHeader?: boolean;
}> = ({ slot, stream, unmuteAudio, hideVirtualTopHeader = false }) => {
  const { currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isVirtual = isVirtualScreenSource(slot.sourceType);

  useEffect(() => {
    if (isVirtual) return;
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream, isVirtual]);

  useEffect(() => {
    if (isVirtual) return;
    const el = videoRef.current;
    if (el) {
      el.muted = !unmuteAudio;
    }
  }, [unmuteAudio, isVirtual]);

  useEffect(() => {
    if (slot.sourceType !== 'external' && slot.sourceType !== 'vdo') return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: 'command', func: unmuteAudio ? 'unMute' : 'mute', args: [] }),
        '*'
      );
    } catch {}
    try {
      win.postMessage({ mute: !unmuteAudio }, '*');
    } catch {}
  }, [unmuteAudio, slot.sourceType]);

  if (isVirtual) {
    return (
      <VirtualScreenCanvas
        slot={slot}
        hideTopHeader={hideVirtualTopHeader}
        bottomReservePx={hideVirtualTopHeader ? 90 : 0}
      />
    );
  }

  if (slot.sourceType === 'vdo') {
    return (
      <iframe
        ref={iframeRef}
        src={`https://vdo.ninja/?view=${encodeURIComponent(slot.vdoRoom || `MCB_${currentClub.id}_${slot.id}`)}&cleanoutput&autoplay&muted`}
        allow="autoplay; camera; microphone; fullscreen"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
        }}
        title={slot.name}
      />
    );
  }

  if (slot.sourceType === 'external' && slot.externalUrl) {
    return (
      <iframe
        ref={iframeRef}
        src={formatEmbedVideoUrl(slot.externalUrl)}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
        }}
        title={slot.name}
      />
    );
  }

  const videoFilter = buildCameraVideoFilter(slot);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={!unmuteAudio}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: slot.fillMode === 'contain' ? 'contain' : 'cover',
        transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`,
        transformOrigin: 'center center',
        filter: videoFilter !== 'none' ? videoFilter : undefined,
        transition: 'transform 0.2s ease'
      }}
    />
  );
};

const DirectorOutputTile: React.FC<DirectorOutputTileProps> = ({
  slot,
  directorState,
  stream,
  isAudioActive,
  isFocusedFullscreen = false,
  isHiddenByOtherFullscreen = false,
  isObsClean = false,
  overlayConfig,
  onClickTile
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const isVirtual = isVirtualScreenSource(slot.sourceType);
  const assignment = resolveCameraAssignment(
    slot,
    { tables, matches, players, tournaments, currentClub },
    directorState
  );
  const hasMatchBanner =
    assignment.isMatchView &&
    assignment.p1Name &&
    assignment.p2Name &&
    assignment.score1 !== undefined &&
    assignment.score2 !== undefined;

  return (
    <div
      onClick={isFocusedFullscreen || isHiddenByOtherFullscreen ? undefined : onClickTile}
      style={{
        position: isFocusedFullscreen ? 'fixed' : 'relative',
        inset: isFocusedFullscreen ? 0 : undefined,
        zIndex: isFocusedFullscreen ? 20 : isHiddenByOtherFullscreen ? 0 : 1,
        width: isFocusedFullscreen ? '100vw' : '100%',
        height: isFocusedFullscreen ? '100vh' : '100%',
        background: '#050814',
        borderRadius: isFocusedFullscreen ? 0 : '12px',
        overflow: 'hidden',
        border: isFocusedFullscreen
          ? 'none'
          : isAudioActive
            ? '2px solid #D4AF37'
            : '1px solid rgba(255,255,255,0.14)',
        opacity: isHiddenByOtherFullscreen ? 0 : 1,
        pointerEvents: isHiddenByOtherFullscreen ? 'none' : 'auto',
        cursor: !isFocusedFullscreen && onClickTile ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: isFocusedFullscreen ? '1.4rem' : '0.55rem',
        paddingBottom: isFocusedFullscreen
          ? (overlayConfig?.ticker?.enabled ? '3.1rem' : '1.4rem')
          : '0.55rem',
        boxSizing: 'border-box'
      }}
      title={isFocusedFullscreen ? undefined : 'Cliquer pour diffuser cette fenêtre en plein écran'}
    >
      <DirectorVideoElement
        slot={slot}
        stream={stream}
        unmuteAudio={isAudioActive}
        hideVirtualTopHeader={!isFocusedFullscreen}
      />

      {(!isVirtual || !isFocusedFullscreen) ? (
        <div style={{
          position: 'relative',
          zIndex: 15,
          width: '100%',
          maxWidth: isFocusedFullscreen ? '980px' : '640px',
          margin: '0 auto',
          background: 'rgba(10, 14, 22, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderTop: '2.5px solid #D4AF37',
          borderRadius: '6px',
          padding: isFocusedFullscreen ? '0.45rem 1.1rem' : '0.32rem 0.65rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.22rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.65)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: isFocusedFullscreen ? '0.72rem' : '0.64rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isFocusedFullscreen ? '0.55rem' : '0.4rem' }}>
              <span style={{ color: '#F8FAFC', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444' }} />
                LIVE
              </span>
              <span style={{ color: '#D4AF37', fontWeight: 800 }}>
                {isVirtual ? (activeTournament ? `Écran Live • ${activeTournament.name}` : 'Écran Live') : assignment.title}
              </span>
              {!isVirtual && assignment.match && (
                <MatchTimerBadge
                  startTime={assignment.match.startTime}
                  durationMinutes={assignment.match.durationMinutes ?? resolveMatchDurationMinutes(assignment.match, activeTournament)}
                  status={assignment.match.status}
                  size="sm"
                />
              )}
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: isFocusedFullscreen ? 'rgba(255,255,255,0.65)' : (isVirtual ? '#D4AF37' : (isAudioActive ? '#D4AF37' : 'rgba(255,255,255,0.5)')),
              fontSize: isFocusedFullscreen ? '0.7rem' : '0.62rem'
            }}>
              {isFocusedFullscreen || isVirtual ? (
                assignment.rulesLabel || currentClub.name
              ) : (
                <>
                  {isAudioActive ? <Volume2 size={11} /> : <VolumeX size={11} />}
                  {slot.name}
                </>
              )}
            </span>
          </div>

          {isVirtual ? (
            <div style={{ fontSize: '0.82rem', color: '#F8FAFC', fontWeight: 800, textAlign: 'center', letterSpacing: '0.4px' }}>
              {assignment.title.replace(/^[^\p{L}\p{N}]+/u, '').toUpperCase()}
            </div>
          ) : hasMatchBanner ? (() => {
            const hasRegionalPhoto =
              directorState.situation === 'regional_match' &&
              Boolean(directorState.regionalMatch?.player1PhotoUrl || directorState.regionalMatch?.player2PhotoUrl);
            const showGamerAvatars =
              (directorState.situation === 'club_tables' || hasRegionalPhoto) &&
              (directorState.mosaicHeader?.showPlayerAvatars !== false) &&
              Boolean(assignment.p1 || assignment.p2);
            const p1Lead = (assignment.score1 ?? 0) > (assignment.score2 ?? 0);
            const p2Lead = (assignment.score2 ?? 0) > (assignment.score1 ?? 0);
            const avatarSize = isFocusedFullscreen ? 68 : 42;
            const octClip = 'polygon(16% 0%, 84% 0%, 100% 16%, 100% 84%, 84% 100%, 16% 100%, 0% 84%, 0% 16%)';

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: isFocusedFullscreen ? '0.9rem' : '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: isFocusedFullscreen ? '0.7rem' : '0.4rem', minWidth: 0 }}>
                  {showGamerAvatars && assignment.p1 && (
                    <div style={{
                      width: `${avatarSize}px`,
                      height: `${avatarSize}px`,
                      marginTop: isFocusedFullscreen ? '-26px' : '-14px',
                      marginBottom: '-2px',
                      padding: '2.5px',
                      background: p1Lead ? '#FBBF24' : '#10B981',
                      clipPath: octClip,
                      boxShadow: p1Lead ? '0 0 18px rgba(251, 191, 36, 0.55)' : '0 4px 12px rgba(0,0,0,0.65)',
                      flexShrink: 0
                    }}>
                      <img
                        src={getPlayerAvatar(assignment.p1)}
                        alt={assignment.p1Name || ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center 22%',
                          clipPath: octClip,
                          background: '#060A13',
                          display: 'block'
                        }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0, flex: 1 }}>
                    <span style={{ color: '#F8FAFC', fontWeight: 900, fontSize: isFocusedFullscreen ? '1.15rem' : '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {assignment.p1Name}
                    </span>
                    {assignment.p1Club && (
                      <span style={{ color: '#94A3B8', fontWeight: 600, fontSize: isFocusedFullscreen ? '0.7rem' : '0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {assignment.p1Club}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: isFocusedFullscreen ? '0.5rem' : '0.3rem' }}>
                  <span style={{
                    minWidth: isFocusedFullscreen ? '44px' : '26px',
                    textAlign: 'center',
                    background: p1Lead ? '#FBBF24' : '#1E293B',
                    color: p1Lead ? '#090D16' : '#F8FAFC',
                    fontWeight: 900,
                    fontSize: isFocusedFullscreen ? '1.45rem' : '0.95rem',
                    padding: isFocusedFullscreen ? '2px 10px' : '1px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${p1Lead ? '#FEF3C7' : 'rgba(16, 185, 129, 0.45)'}`
                  }}>
                    {assignment.score1}
                  </span>
                  <span style={{ color: '#D4AF37', fontSize: isFocusedFullscreen ? '0.74rem' : '0.62rem', fontWeight: 900 }}>VS</span>
                  <span style={{
                    minWidth: isFocusedFullscreen ? '44px' : '26px',
                    textAlign: 'center',
                    background: p2Lead ? '#FBBF24' : '#1E293B',
                    color: p2Lead ? '#090D16' : '#F8FAFC',
                    fontWeight: 900,
                    fontSize: isFocusedFullscreen ? '1.45rem' : '0.95rem',
                    padding: isFocusedFullscreen ? '2px 10px' : '1px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${p2Lead ? '#FEF3C7' : 'rgba(56, 189, 248, 0.45)'}`
                  }}>
                    {assignment.score2}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: isFocusedFullscreen ? '0.7rem' : '0.4rem', minWidth: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                    <span style={{ color: '#F8FAFC', fontWeight: 900, fontSize: isFocusedFullscreen ? '1.15rem' : '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {assignment.p2Name}
                    </span>
                    {assignment.p2Club && (
                      <span style={{ color: '#94A3B8', fontWeight: 600, fontSize: isFocusedFullscreen ? '0.7rem' : '0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {assignment.p2Club}
                      </span>
                    )}
                  </div>
                  {showGamerAvatars && assignment.p2 && (
                    <div style={{
                      width: `${avatarSize}px`,
                      height: `${avatarSize}px`,
                      marginTop: isFocusedFullscreen ? '-26px' : '-14px',
                      marginBottom: '-2px',
                      padding: '2.5px',
                      background: p2Lead ? '#FBBF24' : '#38BDF8',
                      clipPath: octClip,
                      boxShadow: p2Lead ? '0 0 18px rgba(251, 191, 36, 0.55)' : '0 4px 12px rgba(0,0,0,0.65)',
                      flexShrink: 0
                    }}>
                      <img
                        src={getPlayerAvatar(assignment.p2)}
                        alt={assignment.p2Name || ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center 22%',
                          clipPath: octClip,
                          background: '#060A13',
                          display: 'block'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div style={{ fontSize: isFocusedFullscreen ? '0.84rem' : '0.72rem', color: '#CBD5E1', textAlign: 'center' }}>
              {assignment.subtitle}
            </div>
          )}
        </div>
      ) : null}

      {!isFocusedFullscreen && !isObsClean && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          zIndex: 10,
          background: 'rgba(10, 14, 22, 0.78)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.75)',
          fontSize: '0.62rem',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Maximize2 size={10} /> Plein écran
        </div>
      )}
    </div>
  );
};

export const DirectorTvOutputView: React.FC<DirectorTvOutputViewProps> = ({ onExitToAll }) => {
  const { tournaments, currentClub } = useStore();
  const isObsClean =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('obs') === '1';
  const [directorState, setDirectorState] = useState<MultiCamDirectorState>(() =>
    loadDirectorState(currentClub.id)
  );
  const [overlayConfig, setOverlayConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(currentClub.id, 'live')
  );
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [usbStreams, setUsbStreams] = useState<Record<string, MediaStream | null>>({});
  const [soundAllowed, setSoundAllowed] = useState<boolean>(true);

  const viewerIdRef = useRef<string>(`tv_${Math.random().toString(36).slice(2, 8)}`);
  const signalingRef = useRef<Record<string, CameraSignalingHandle>>({});
  const peersRef = useRef<Record<string, { pc: RTCPeerConnection; sessionId: string }>>({});
  const usbRef = useRef<Record<string, { deviceId: string; stream: MediaStream }>>({});

  useEffect(() => {
    setDirectorState(loadDirectorState(currentClub.id));
    setOverlayConfig(loadLiveOverlayConfig(currentClub.id, 'live'));
    const u1 = subscribeToDirectorState(currentClub.id, setDirectorState);
    const u2 = subscribeToLiveOverlayConfig(currentClub.id, 'live', setOverlayConfig);
    return () => {
      u1();
      u2();
    };
  }, [currentClub.id]);

  const webrtcIds = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'smartphone_webrtc')
    .map(c => c.id)
    .join(',');

  useEffect(() => {
    const active = new Set(webrtcIds ? webrtcIds.split(',') : []);
    Object.keys(signalingRef.current).forEach(camId => {
      if (!active.has(camId)) {
        signalingRef.current[camId].destroy();
        delete signalingRef.current[camId];
        if (peersRef.current[camId]) {
          try { peersRef.current[camId].pc.close(); } catch {}
          delete peersRef.current[camId];
        }
      }
    });

    active.forEach(camId => {
      if (signalingRef.current[camId]) return;
      const viewerId = viewerIdRef.current;
      const pendingIce: RTCIceCandidateInit[] = [];
      const sig = createCameraSignalingChannel(currentClub.id, camId, {
        onSubscribed: () => sig.requestOffer(viewerId),
        onSenderOnline: () => {
          const cur = peersRef.current[camId]?.pc;
          if (!cur || cur.connectionState !== 'connected') sig.requestOffer(viewerId);
        },
        onOffer: async (sdp, sessionId, targetViewerId) => {
          if (targetViewerId !== viewerId) return;
          if (peersRef.current[camId]) {
            try { peersRef.current[camId].pc.close(); } catch {}
          }
          pendingIce.length = 0;
          const pc = new RTCPeerConnection(RTC_ICE_CONFIG);
          peersRef.current[camId] = { pc, sessionId };
          pc.ontrack = (ev) => {
            const s = ev.streams?.[0] || new MediaStream([ev.track]);
            setRemoteStreams(prev => ({ ...prev, [camId]: s }));
          };
          pc.onicecandidate = (ev) => {
            if (ev.candidate) sig.sendIceCandidate(ev.candidate.toJSON(), 'receiver', sessionId, viewerId);
          };
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            for (const c of pendingIce) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
            }
            pendingIce.length = 0;
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            if (pc.localDescription) sig.sendAnswer(pc.localDescription, sessionId, viewerId);
          } catch {}
        },
        onIceCandidate: async (candidate, role, sessionId, targetViewerId) => {
          const entry = peersRef.current[camId];
          if (targetViewerId !== viewerId || role !== 'sender' || !entry || entry.sessionId !== sessionId) return;
          if (entry.pc.remoteDescription) {
            try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          } else {
            pendingIce.push(candidate);
          }
        }
      });
      signalingRef.current[camId] = sig;
    });
  }, [webrtcIds, currentClub.id]);

  const usbKey = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'usb')
    .map(c => `${c.id}:${c.usbDeviceId || 'default'}`)
    .join('|');

  useEffect(() => {
    const wanted = new Map<string, string>();
    directorState.cameras.forEach(c => {
      if (c.enabled && c.sourceType === 'usb') wanted.set(c.id, c.usbDeviceId || 'default');
    });

    Object.keys(usbRef.current).forEach(camId => {
      const cur = usbRef.current[camId];
      if (!wanted.has(camId) || wanted.get(camId) !== cur.deviceId) {
        cur.stream.getTracks().forEach(t => t.stop());
        delete usbRef.current[camId];
        setUsbStreams(prev => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    wanted.forEach(async (devId, camId) => {
      if (usbRef.current[camId]) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: devId !== 'default' ? { deviceId: { exact: devId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        usbRef.current[camId] = { deviceId: devId, stream };
        setUsbStreams(prev => ({ ...prev, [camId]: stream }));
      } catch {}
    });
  }, [usbKey]);

  useEffect(() => {
    return () => {
      Object.values(signalingRef.current).forEach(s => s.destroy());
      Object.values(peersRef.current).forEach(p => {
        try { p.pc.close(); } catch {}
      });
      Object.values(usbRef.current).forEach(u => u.stream.getTracks().forEach(t => t.stop()));
    };
  }, []);

  const getStreamForSlot = (slot: DirectorCameraSlot): MediaStream | null => {
    if (slot.sourceType === 'smartphone_webrtc') return remoteStreams[slot.id] || null;
    if (slot.sourceType === 'usb') return usbStreams[slot.id] || null;
    return null;
  };

  const updateState = (next: MultiCamDirectorState) => {
    setDirectorState(next);
    saveDirectorState(currentClub.id, next, true);
  };

  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const isClubSituation = directorState.situation === 'club_tables';
  const enabledCams = directorState.cameras.filter(
    c => c.enabled && (isClubSituation || !isVirtualScreenSource(c.sourceType))
  );
  const focusedCandidate = directorState.broadcastMode === 'single' && directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId)
    : null;
  const focusedCam = (focusedCandidate && (isClubSituation || !isVirtualScreenSource(focusedCandidate.sourceType)) ? focusedCandidate : null)
    || (directorState.broadcastMode === 'single' ? enabledCams[0] : null);

  const baseList = enabledCams.length > 0
    ? enabledCams
    : directorState.cameras.filter(c => isClubSituation || !isVirtualScreenSource(c.sourceType)).slice(0, 1);
  const list =
    focusedCam && !baseList.some(c => c.id === focusedCam.id)
      ? [...baseList, focusedCam]
      : baseList;
  const count = list.length;
  const gridCols = count <= 1
    ? '1fr'
    : count === 2
      ? (directorState.mosaicLayout === 'stacked' ? '1fr' : '1fr 1fr')
      : count <= 4
        ? '1fr 1fr'
        : 'repeat(3, 1fr)';
  const gridRows = count <= 1
    ? '1fr'
    : count === 2
      ? (directorState.mosaicLayout === 'stacked' ? '1fr 1fr' : '1fr')
      : '1fr 1fr';

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#02040a',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '0.6rem',
      paddingBottom: overlayConfig.ticker?.enabled && !directorState.isIntermission ? '2.6rem' : '0.6rem',
      gap: '0.6rem',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {directorState.isIntermission && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'radial-gradient(circle at 50% 35%, #0f2027 0%, #0a0e16 55%, #04060a 100%)',
          borderTop: '4px solid #D4AF37',
          borderBottom: '4px solid #D4AF37',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.2rem',
          textAlign: 'center',
          padding: '2rem',
          color: '#F8FAFC'
        }}>
          <div style={{ background: '#fff', padding: '14px', borderRadius: '16px', boxShadow: '0 10px 35px rgba(0,0,0,0.55)' }}>
            <img
              src={getClubLogoUrl(currentClub.logoUrl)}
              alt={currentClub.name}
              style={{ height: '92px', objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#D4AF37', letterSpacing: '2px', textTransform: 'uppercase' }}>
            {activeTournament ? `${currentClub.name} • ${activeTournament.name}` : currentClub.name}
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase', maxWidth: '880px' }}>
            {directorState.intermissionTitle || 'PAUSE — REPRISE DANS QUELQUES INSTANTS'}
          </div>
          <div style={{ width: '180px', height: '2px', background: 'rgba(212, 175, 55, 0.7)' }} />
          {directorState.intermissionSubtitle && (
            <div style={{ fontSize: '1.15rem', color: '#CBD5E1', fontWeight: 700 }}>
              {directorState.intermissionSubtitle}
            </div>
          )}
        </div>
      )}
      {(() => {
        const mh = { ...DEFAULT_MOSAIC_HEADER, ...(directorState.mosaicHeader || {}) };
        if (mh.showBar === false) return null;
        const logoSrc =
          mh.logoMode === 'none'
            ? ''
            : mh.logoMode === 'custom'
              ? (mh.customLogoUrl || '')
              : getClubLogoUrl(currentClub.logoUrl);
        const logoH = Math.max(28, Math.min(72, Math.round((mh.logoHeightPx || 56) * 0.65)));
        const bgMode = mh.logoBg || 'circle';
        const isCircle = bgMode === 'circle';
        const isLogoRight = mh.logoPosition === 'right';
        const logoNode = logoSrc ? (
          <div style={{
            background: isCircle || bgMode === 'white' ? '#fff' : bgMode === 'dark_gold' ? 'rgba(10,14,22,0.95)' : 'transparent',
            border: isCircle || bgMode === 'dark_gold' ? '1.5px solid #D4AF37' : 'none',
            padding: isCircle || bgMode === 'transparent' ? 0 : '3px 7px',
            borderRadius: isCircle ? '50%' : '8px',
            overflow: 'hidden',
            width: isCircle ? `${logoH}px` : undefined,
            height: isCircle ? `${logoH}px` : undefined,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img
              src={logoSrc}
              alt={currentClub.name}
              style={{
                height: `${logoH}px`,
                width: isCircle ? `${logoH}px` : undefined,
                maxWidth: isCircle ? undefined : '140px',
                objectFit: isCircle ? 'cover' : 'contain'
              }}
              onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
        ) : null;
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 30, 0.92)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '10px',
            padding: '0.4rem 1rem',
            color: '#fff',
            flexShrink: 0,
            gap: '0.6rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              {!isLogoRight && logoNode}
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#F8FAFC', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#EF4444' }} />
                MULTI-CAMÉRAS • {directorState.situation === 'cuescore_live' ? ((directorState.regionalMatch.cueScoreInput?.trim() && directorState.regionalMatch.cueScoreTournamentId?.trim() && directorState.regionalMatch.cueScoreTournamentName?.trim()) ? directorState.regionalMatch.cueScoreTournamentName : 'Live CueScore') : directorState.situation === 'regional_match' ? (directorState.regionalMatch.eventTitle || 'Tournoi Régional') : currentClub.name}
              </span>
              {directorState.situation === 'club_tables' && activeTournament && (
                <span style={{ fontSize: '0.74rem', color: '#D4AF37', background: 'rgba(212, 175, 55, 0.12)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '2px 8px', borderRadius: '5px', fontWeight: 700 }}>
                  {activeTournament.name}
                </span>
              )}
            </div>

            {(!isObsClean || isLogoRight) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                {!isObsClean && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <button
                      type="button"
                      onClick={() => setSoundAllowed(v => !v)}
                      style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer' }}
                    >
                      {soundAllowed ? '🔊 Son ON' : '🔇 Muet'}
                    </button>
                    {onExitToAll && (
                      <button
                        type="button"
                        onClick={onExitToAll}
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🎱 Vue Billards
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
                        else document.exitFullscreen?.();
                      }}
                      style={{ background: '#00ffaa', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '0.76rem', fontWeight: 900, cursor: 'pointer' }}
                    >
                      ⛶ PLEIN ÉCRAN
                    </button>
                  </div>
                )}
                {isLogoRight && logoNode}
              </div>
            )}
          </div>
        );
      })()}

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
        {list.map(slot => {
          const isFocusedTile = Boolean(focusedCam && focusedCam.id === slot.id);
          const isHiddenByOther = Boolean(focusedCam && focusedCam.id !== slot.id);
          const isTileAudioActive = isFocusedTile
            ? (soundAllowed && !slot.forceMuted && !isVirtualScreenSource(slot.sourceType))
            : focusedCam
              ? false
              : (soundAllowed && !slot.forceMuted && !isVirtualScreenSource(slot.sourceType) && directorState.activeAudioCameraId === slot.id);

          return (
            <DirectorOutputTile
              key={slot.id}
              slot={slot}
              directorState={directorState}
              stream={getStreamForSlot(slot)}
              isAudioActive={isTileAudioActive}
              isFocusedFullscreen={isFocusedTile}
              isHiddenByOtherFullscreen={isHiddenByOther}
              isObsClean={isObsClean}
              overlayConfig={overlayConfig}
              onClickTile={() => {
                const keepMic = isVirtualScreenSource(slot.sourceType);
                updateState({
                  ...directorState,
                  broadcastMode: 'single',
                  focusedCameraId: slot.id,
                  activeAudioCameraId: keepMic ? directorState.activeAudioCameraId : slot.id
                });
              }}
            />
          );
        })}
      </div>

      {!directorState.isIntermission && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
          <LiveCustomOverlayLayer config={overlayConfig} interactive={false} previewScale={1} />
        </div>
      )}

      {focusedCam && !isObsClean && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 35,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.18)',
          padding: '6px 10px',
          borderRadius: '10px'
        }}>
          <button
            type="button"
            onClick={() => updateState({ ...directorState, broadcastMode: 'mosaic', focusedCameraId: null })}
            style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
          >
            ⊞ Revenir à l'Écran Multiple
          </button>
          <button
            type="button"
            onClick={() => setSoundAllowed(v => !v)}
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 9px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer' }}
          >
            {soundAllowed ? '🔊 Son ON' : '🔇 Muet'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
              else document.exitFullscreen?.();
            }}
            style={{ background: '#00ffaa', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
          >
            ⛶ Plein écran
          </button>
        </div>
      )}
    </div>
  );
};

export default DirectorTvOutputView;
