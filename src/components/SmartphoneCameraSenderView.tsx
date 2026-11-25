import React, { useEffect, useRef, useState } from 'react';
import { Camera, Mic, MicOff, RefreshCw, BatteryCharging, Radio, Wifi, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import {
  createCameraSignalingChannel,
  CameraSignalingHandle,
  loadDirectorState,
  subscribeToDirectorState,
  MultiCamDirectorState,
  RTC_ICE_CONFIG
} from '../utils/multiCamDirector';
import { useStore } from '../store';

interface SmartphoneCameraSenderViewProps {
  cameraId: string;
  clubId: string;
  studioId?: string;
}

const SmartphoneCameraSenderView: React.FC<SmartphoneCameraSenderViewProps> = ({ cameraId, clubId, studioId }) => {
  const { tables, currentClub } = useStore();
  const [directorState, setDirectorState] = useState<MultiCamDirectorState>(() => loadDirectorState(clubId, studioId));
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [batterySaver, setBatterySaver] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [status, setStatus] = useState<'starting' | 'waiting_pc' | 'connecting' | 'connected' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const [dismissPortraitTip, setDismissPortraitTip] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; sessionId: string; pendingIce: RTCIceCandidateInit[] }>>(new Map());
  const signalingRef = useRef<CameraSignalingHandle | null>(null);

  // Keep smartphone screen awake while streaming on a tripod (Screen Wake Lock API)
  useEffect(() => {
    let sentinel: any = null;
    let released = false;

    const requestLock = async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (!wl?.request) return;
        sentinel = await wl.request('screen');
        if (!released) setWakeLockActive(true);
        sentinel.addEventListener?.('release', () => {
          if (!released) setWakeLockActive(false);
        });
      } catch {
        if (!released) setWakeLockActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      }
    };

    requestLock();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        sentinel?.release?.();
      } catch {}
    };
  }, []);

  // Battery level & orientation monitor
  useEffect(() => {
    const onResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);

    let batteryObj: any = null;
    const onBatteryChange = () => {
      if (batteryObj && typeof batteryObj.level === 'number') {
        setBatteryPct(Math.round(batteryObj.level * 100));
      }
    };
    const navAny = navigator as any;
    if (navAny.getBattery) {
      navAny.getBattery().then((b: any) => {
        batteryObj = b;
        onBatteryChange();
        b.addEventListener?.('levelchange', onBatteryChange);
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', onResize);
      batteryObj?.removeEventListener?.('levelchange', onBatteryChange);
    };
  }, []);

  // Subscribe to director state for real-time Tally lamp (ON AIR status & assignment)
  useEffect(() => {
    setDirectorState(loadDirectorState(clubId, studioId));
    return subscribeToDirectorState(clubId, (next) => {
      setDirectorState(next);
    }, studioId);
  }, [clubId, studioId]);

  const cameraSlot = directorState.cameras.find(c => c.id === cameraId);
  const isSingleFocused = directorState.broadcastMode === 'single' && directorState.focusedCameraId === cameraId;
  const isInMosaic = directorState.broadcastMode === 'mosaic' && Boolean(cameraSlot?.enabled);
  const isAudioOnAir = directorState.activeAudioCameraId === cameraId || isSingleFocused;

  const assignmentLabel = (() => {
    if (!cameraSlot) return cameraId.toUpperCase();
    if (cameraSlot.assignmentType === 'table') {
      const tbl = cameraSlot.tableId ? tables[cameraSlot.tableId] : undefined;
      return tbl ? (tbl.name || `Billard ${tbl.number}`) : `Billard ${cameraSlot.tableId || '?'}`;
    }
    if (cameraSlot.assignmentType === 'live_match') return 'Match Studio Live';
    return cameraSlot.customViewTitle || "Vue d'ensemble";
  })();

  // Start camera capture & WebRTC signaling
  useEffect(() => {
    let cancelled = false;

    const cleanupPeer = (viewerId?: string) => {
      if (viewerId) {
        const entry = peersRef.current.get(viewerId);
        if (entry) {
          try {
            entry.pc.onicecandidate = null;
            entry.pc.onconnectionstatechange = null;
            entry.pc.close();
          } catch {}
          peersRef.current.delete(viewerId);
        }
        return;
      }
      for (const entry of peersRef.current.values()) {
        try {
          entry.pc.onicecandidate = null;
          entry.pc.onconnectionstatechange = null;
          entry.pc.close();
        } catch {}
      }
      peersRef.current.clear();
    };

    const refreshAggregateConnectionState = () => {
      if (cancelled) return;
      const states = Array.from(peersRef.current.values()).map(p => p.pc.connectionState);
      if (states.includes('connected')) {
        setStatus('connected');
      } else if (states.includes('connecting') || states.includes('new')) {
        setStatus('connecting');
      } else {
        setStatus('waiting_pc');
      }
    };

    const createAndSendOffer = async (viewerId: string) => {
      const stream = localStreamRef.current;
      const sig = signalingRef.current;
      if (!stream || !sig) return;

      cleanupPeer(viewerId);
      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setStatus('connecting');

      const pc = new RTCPeerConnection(RTC_ICE_CONFIG);
      const peerEntry = { pc, sessionId, pendingIce: [] as RTCIceCandidateInit[] };
      peersRef.current.set(viewerId, peerEntry);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (ev) => {
        if (ev.candidate && signalingRef.current) {
          signalingRef.current.sendIceCandidate(ev.candidate.toJSON(), 'sender', sessionId, viewerId);
        }
      };

      pc.onconnectionstatechange = refreshAggregateConnectionState;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sig.sendOffer(pc.localDescription, sessionId, viewerId);
        }
      } catch (err: any) {
        console.warn('Erreur création offre WebRTC:', err);
        refreshAggregateConnectionState();
      }
    };

    const start = async () => {
      setStatus('starting');
      setErrorMsg(null);

      // Stop previous tracks if switching camera
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg("Votre navigateur bloque la caméra (HTTPS requis). Ouvrez la page via l'URL sécurisée HTTPS de l'application.");
        setStatus('error');
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        setHasAudioTrack(stream.getAudioTracks().length > 0);
      } catch {
        try {
          // Fallback without audio if microphone permission denied
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
          setHasAudioTrack(false);
        } catch (err: any) {
          setErrorMsg(err?.message || "Impossible d'accéder à la caméra du smartphone. Autorisez l'accès caméra dans le navigateur.");
          setStatus('error');
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => {
        t.enabled = micEnabled;
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Setup Supabase Realtime WebRTC Signaling
      if (signalingRef.current) {
        signalingRef.current.destroy();
      }
      setStatus('waiting_pc');

      const sig = createCameraSignalingChannel(clubId, cameraId, {
        onSubscribed: () => {
          sig.sendSenderOnline();
        },
        onRequestOffer: (viewerId) => {
          createAndSendOffer(viewerId);
        },
        onAnswer: async (sdp, sessId, viewerId) => {
          const entry = peersRef.current.get(viewerId);
          if (!entry || sessId !== entry.sessionId) return;
          try {
            await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
            for (const cand of entry.pendingIce) {
              try {
                await entry.pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
            entry.pendingIce = [];
          } catch (err) {
            console.warn('Erreur setRemoteDescription:', err);
          }
        },
        onIceCandidate: async (candidate, role, sessId, viewerId) => {
          const entry = peersRef.current.get(viewerId);
          if (role !== 'receiver' || !entry || sessId !== entry.sessionId) return;
          if (entry.pc.remoteDescription) {
            try {
              await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {}
          } else {
            entry.pendingIce.push(candidate);
          }
        }
      }, studioId);

      signalingRef.current = sig;
    };

    start();

    const onlineHeartbeat = window.setInterval(() => {
      if (signalingRef.current) {
        // Always announce availability periodically so additional TV/screen viewers can connect cleanly
        signalingRef.current.sendSenderOnline();
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(onlineHeartbeat);
      cleanupPeer();
      if (signalingRef.current) {
        signalingRef.current.destroy();
        signalingRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [clubId, cameraId, facingMode, studioId]);

  // Toggle mic track live without reconnecting WebRTC
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = micEnabled;
      });
    }
  }, [micEnabled]);

  // Apply hardware camera zoom when supported
  useEffect(() => {
    const track = localStreamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const caps: any = track.getCapabilities?.();
      if (caps?.zoom) {
        const clamped = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 4, zoom));
        track.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
      }
    } catch {}
  }, [zoom]);

  const tallyBorder = isSingleFocused
    ? '6px solid #ef4444'
    : isInMosaic
      ? '5px solid #f59e0b'
      : '4px solid rgba(255,255,255,0.18)';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#02060d',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      overflow: 'hidden',
      border: tallyBorder,
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Local Camera Preview */}
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
          objectFit: 'cover',
          transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
          opacity: batterySaver ? 0.04 : 1,
          zIndex: 0
        }}
      />

      {/* Top Tally & Status Bar */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '0.75rem 1rem',
        background: 'linear-gradient(180deg, rgba(2,6,15,0.92) 0%, rgba(2,6,15,0.5) 85%, transparent 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              background: isSingleFocused ? '#ef4444' : isInMosaic ? '#f59e0b' : 'rgba(255,255,255,0.16)',
              color: isInMosaic && !isSingleFocused ? '#000' : '#fff',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: isSingleFocused ? '0 0 18px rgba(239,68,68,0.85)' : 'none'
            }}>
              <Radio size={13} />
              {isSingleFocused
                ? 'À L\'ANTENNE • PLEIN ÉCRAN'
                : isInMosaic
                  ? 'EN DIRECT • ÉCRAN MULTIPLE'
                  : 'EN VEILLE (HORS ANTENNE)'}
            </span>

            {isAudioOnAir && micEnabled && hasAudioTrack && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid #10b981',
                color: '#34d399',
                padding: '3px 8px',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                🔊 SON DIFFUSÉ
              </span>
            )}
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: status === 'connected' ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.2)',
            border: `1px solid ${status === 'connected' ? '#10b981' : '#f59e0b'}`,
            color: status === 'connected' ? '#34d399' : '#fbbf24',
            padding: '3px 9px',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 800
          }}>
            {status === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
            {status === 'connected'
              ? 'Connecté au PC'
              : status === 'connecting'
                ? 'Connexion au PC...'
                : status === 'waiting_pc'
                  ? 'En attente de la Régie PC...'
                  : status === 'error'
                    ? 'Erreur caméra'
                    : 'Démarrage...'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontWeight: 800, color: '#fff' }}>
            {cameraSlot?.name || cameraId.toUpperCase()} • <span style={{ color: '#D4AF37' }}>{assignmentLabel}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)' }}>
            {wakeLockActive && (
              <span style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.45)', color: '#6EE7B7', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>
                Veille bloquée
              </span>
            )}
            {batteryPct !== null && (
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 7px', borderRadius: '4px', fontWeight: 700, color: batteryPct <= 20 ? '#FCA5A5' : '#E2E8F0' }}>
                Batterie {batteryPct}%
              </span>
            )}
            <span>{currentClub.name}</span>
          </div>
        </div>
        {isPortrait && !dismissPortraitTip && !batterySaver && (
          <div
            onClick={() => setDismissPortraitTip(true)}
            style={{
              background: 'rgba(212, 175, 55, 0.16)',
              border: '1px solid rgba(212, 175, 55, 0.5)',
              color: '#FDE68A',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            Conseil : tournez le smartphone en mode Paysage (16:9) pour un meilleur cadrage — toucher pour masquer
          </div>
        )}
      </div>

      {/* Battery Saver Center Indicator */}
      {batterySaver && (
        <div
          onClick={() => setBatterySaver(false)}
          style={{
            position: 'relative',
            zIndex: 12,
            margin: 'auto',
            textAlign: 'center',
            padding: '1.5rem',
            cursor: 'pointer'
          }}
        >
          <BatteryCharging size={46} color={isSingleFocused ? '#ef4444' : '#34d399'} />
          <div style={{ fontWeight: 900, fontSize: '1.1rem', marginTop: '0.6rem' }}>
            Mode Économie d'Écran Actif
          </div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.3rem' }}>
            La caméra continue de filmer et d'envoyer vers la régie PC.<br />
            Touchez l'écran pour réafficher le retour vidéo.
          </div>
        </div>
      )}

      {/* Error Box */}
      {errorMsg && (
        <div style={{
          position: 'relative',
          zIndex: 15,
          margin: 'auto 1.5rem',
          background: 'rgba(127, 29, 29, 0.92)',
          border: '1px solid #f87171',
          borderRadius: '14px',
          padding: '1.2rem',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '0.4rem' }}>⚠️ Caméra bloquée</div>
          <div style={{ fontSize: '0.84rem', color: '#fecaca' }}>{errorMsg}</div>
        </div>
      )}

      {/* Bottom Controls */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '0.9rem 1rem calc(env(safe-area-inset-bottom, 0.8rem) + 0.8rem)',
        background: 'linear-gradient(0deg, rgba(2,6,15,0.95) 0%, rgba(2,6,15,0.65) 80%, transparent 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFacingMode(m => (m === 'environment' ? 'user' : 'environment'))}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.55rem 0.9rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}
          >
            <Camera size={16} /> {facingMode === 'environment' ? 'Caméra Arrière' : 'Caméra Avant'}
          </button>

          <button
            type="button"
            onClick={() => setMicEnabled(v => !v)}
            className="btn btn-outline"
            style={{
              width: 'auto',
              padding: '0.55rem 0.9rem',
              fontSize: '0.8rem',
              background: micEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)',
              color: micEnabled ? '#34d399' : '#fca5a5',
              borderColor: micEnabled ? '#10b981' : '#ef4444'
            }}
          >
            {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            {micEnabled ? 'Micro ON' : 'Micro Coupé'}
          </button>

          <button
            type="button"
            onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.5) * 10) / 10))}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.55rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            title="Dézoomer"
          >
            <ZoomOut size={16} />
          </button>

          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.5) * 10) / 10))}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.55rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            title="Zoomer"
          >
            <ZoomIn size={16} /> {zoom > 1 ? `${zoom}x` : ''}
          </button>

          <button
            type="button"
            onClick={() => setBatterySaver(v => !v)}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.55rem 0.9rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: '#fff' }}
          >
            <BatteryCharging size={16} /> {batterySaver ? 'Écran Normal' : 'Éco Batterie'}
          </button>

          <button
            type="button"
            onClick={() => {
              signalingRef.current?.sendSenderOnline();
            }}
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.55rem 0.9rem', fontSize: '0.8rem', background: 'rgba(0,255,170,0.12)', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.35)' }}
          >
            <RefreshCw size={15} /> Resynchroniser PC
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartphoneCameraSenderView;
