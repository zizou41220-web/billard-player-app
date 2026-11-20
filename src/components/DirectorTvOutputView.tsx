import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Radio, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';
import {
  CameraSignalingHandle,
  DirectorCameraSlot,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  createCameraSignalingChannel,
  loadDirectorState,
  saveDirectorState,
  subscribeToDirectorState
} from '../utils/multiCamDirector';
import { resolveCameraAssignment } from '../utils/liveBroadcaster';
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
  stream: MediaStream | null;
  isAudioActive: boolean;
  isSingleFullScreen?: boolean;
  onClickTile?: () => void;
}

const DirectorVideoElement: React.FC<{
  slot: DirectorCameraSlot;
  stream: MediaStream | null;
  unmuteAudio: boolean;
}> = ({ slot, stream, unmuteAudio }) => {
  const { currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = !unmuteAudio;
    }
  }, [unmuteAudio]);

  if (slot.sourceType === 'vdo') {
    return (
      <iframe
        src={`https://vdo.ninja/?view=${encodeURIComponent(slot.vdoRoom || `MCB_${currentClub.id}_${slot.id}`)}&cleanoutput&autoplay${unmuteAudio ? '' : '&muted'}`}
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
        transition: 'transform 0.2s ease'
      }}
    />
  );
};

const DirectorOutputTile: React.FC<DirectorOutputTileProps> = ({
  slot,
  stream,
  isAudioActive,
  onClickTile
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const assignment = resolveCameraAssignment(slot, {
    tables,
    matches,
    players,
    tournaments,
    currentClub
  });

  return (
    <div
      onClick={onClickTile}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#050814',
        borderRadius: '12px',
        overflow: 'hidden',
        border: isAudioActive ? '2.5px solid #10b981' : '1.5px solid rgba(255,255,255,0.16)',
        cursor: onClickTile ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '0.65rem',
        boxSizing: 'border-box'
      }}
      title="Cliquer pour mettre en surbrillance et diffuser cette caméra en plein écran"
    >
      <DirectorVideoElement slot={slot} stream={stream} unmuteAudio={isAudioActive} />

      {/* Top Overlay Badge */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '620px',
        margin: '0 auto',
        background: 'rgba(6, 11, 24, 0.88)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.16)',
        borderTop: '2px solid #F59E0B',
        borderRadius: '10px',
        padding: '0.4rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 800 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ background: '#ff2244', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 900 }}>
              LIVE
            </span>
            <span style={{ color: '#00ffaa', fontWeight: 900 }}>{assignment.title}</span>
            {assignment.match && (
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
            color: isAudioActive ? '#34d399' : 'rgba(255,255,255,0.55)',
            fontSize: '0.68rem'
          }}>
            {isAudioActive ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {slot.name}
          </span>
        </div>

        {assignment.match && assignment.p1 && assignment.p2 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
              <img src={getPlayerAvatar(assignment.p1)} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #F59E0B' }} />
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {assignment.p1.name}
              </span>
            </div>

            <div style={{ background: '#F59E0B', color: '#000', fontWeight: 900, fontSize: '1.05rem', padding: '1px 10px', borderRadius: '7px' }}>
              {assignment.match.score1} - {assignment.match.score2}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem', minWidth: 0 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {assignment.p2.name}
              </span>
              <img src={getPlayerAvatar(assignment.p2)} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #F59E0B' }} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
            {assignment.subtitle}
          </div>
        )}
      </div>

      {/* Hover Hint */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        alignSelf: 'flex-end',
        background: 'rgba(0,0,0,0.65)',
        color: 'rgba(255,255,255,0.8)',
        fontSize: '0.66rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '5px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <Maximize2 size={10} /> Cliquer pour diffuser seul
      </div>
    </div>
  );
};

export const DirectorTvOutputView: React.FC<DirectorTvOutputViewProps> = ({ onExitToAll }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
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

  // Connect WebRTC cameras
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

  // Connect USB cameras
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
  const enabledCams = directorState.cameras.filter(c => c.enabled);
  const focusedCam = directorState.broadcastMode === 'single' && directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId) || enabledCams[0]
    : null;

  // SINGLE FULLSCREEN MODE
  if (focusedCam) {
    const assignment = resolveCameraAssignment(focusedCam, { tables, matches, players, tournaments, currentClub });
    const unmute = soundAllowed && !focusedCam.forceMuted;

    return (
      <div style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#02040a',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1.5rem',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <DirectorVideoElement
          slot={focusedCam}
          stream={getStreamForSlot(focusedCam)}
          unmuteAudio={unmute}
        />

        <LiveCustomOverlayLayer config={overlayConfig} interactive={false} previewScale={1} />

        {/* Scoreboard or View Title */}
        <div style={{
          position: 'relative',
          zIndex: 15,
          width: '100%',
          maxWidth: '880px',
          background: 'rgba(8, 13, 28, 0.9)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderTop: '2.5px solid #00ffaa',
          borderRadius: '14px',
          padding: '0.6rem 1.2rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.75)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: assignment.match ? '0.45rem' : 0, fontSize: '0.82rem', fontWeight: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ background: '#ff2244', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Radio size={11} /> LIVE
              </span>
              <span style={{ color: '#00ffaa', fontWeight: 900 }}>{assignment.title}</span>
              {assignment.match && (
                <MatchTimerBadge
                  startTime={assignment.match.startTime}
                  durationMinutes={assignment.match.durationMinutes ?? resolveMatchDurationMinutes(assignment.match, activeTournament)}
                  status={assignment.match.status}
                  size="sm"
                />
              )}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.76rem' }}>
              {assignment.rulesLabel || currentClub.name}
            </span>
          </div>

          {assignment.match && assignment.p1 && assignment.p2 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <img src={getPlayerAvatar(assignment.p1)} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #00ffaa' }} />
                <span style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {assignment.p1.name}
                </span>
              </div>

              <div style={{ background: '#F59E0B', color: '#000', fontWeight: 900, fontSize: '2rem', padding: '2px 18px', borderRadius: '10px' }}>
                {assignment.match.score1} - {assignment.match.score2}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', minWidth: 0 }}>
                <span style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {assignment.p2.name}
                </span>
                <img src={getPlayerAvatar(assignment.p2)} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #00ffaa' }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.2rem' }}>
              {assignment.subtitle}
            </div>
          )}
        </div>

        {/* Floating Quick Switch Toolbar */}
        <div style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 25,
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
      </div>
    );
  }

  // MOSAIC MODE
  const list = enabledCams.length > 0 ? enabledCams : directorState.cameras.slice(0, 1);
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
      width: '100vw',
      height: '100vh',
      backgroundColor: '#02040a',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '0.6rem',
      gap: '0.6rem',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(10, 15, 30, 0.92)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '10px',
        padding: '0.45rem 1rem',
        color: '#fff',
        flexShrink: 0,
        gap: '0.6rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div style={{ background: '#fff', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex' }}>
            <img
              src={getClubLogoUrl(currentClub.logoUrl)}
              alt={currentClub.name}
              style={{ height: '24px', objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
          <span style={{ fontWeight: 900, fontSize: '0.95rem', color: '#F59E0B' }}>
            📺 ÉCRAN MULTIPLE LIVE • {currentClub.name}
          </span>
          {activeTournament && (
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
              🏆 {activeTournament.name}
            </span>
          )}
        </div>

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
      </div>

      {/* Mosaic Grid */}
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
        {list.map(slot => (
          <DirectorOutputTile
            key={slot.id}
            slot={slot}
            stream={getStreamForSlot(slot)}
            isAudioActive={soundAllowed && !slot.forceMuted && directorState.activeAudioCameraId === slot.id}
            onClickTile={() => {
              updateState({
                ...directorState,
                broadcastMode: 'single',
                focusedCameraId: slot.id,
                activeAudioCameraId: slot.id
              });
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default DirectorTvOutputView;
