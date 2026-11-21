import React, { useEffect, useRef, useState } from 'react';
import {
  CameraSignalingHandle,
  RTC_ICE_CONFIG,
  createCameraSignalingChannel
} from '../utils/multiCamDirector';

interface WebRtcCameraPlayerProps {
  clubId: string;
  cameraId: string;
  muted?: boolean;
  fill?: boolean;
  rotation?: number;
  zoom?: number;
  title?: string;
}

export const WebRtcCameraPlayer: React.FC<WebRtcCameraPlayerProps> = ({
  clubId,
  cameraId,
  muted = true,
  fill = true,
  rotation = 0,
  zoom = 1,
  title = 'Caméra Smartphone Live'
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewerIdRef = useRef<string>(`view_${Math.random().toString(36).slice(2, 9)}`);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    if (!clubId || !cameraId) return;
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let currentSessionId = '';
    let pendingIce: RTCIceCandidateInit[] = [];
    let signaling: CameraSignalingHandle | null = null;

    const cleanupPc = () => {
      if (pc) {
        try {
          pc.ontrack = null;
          pc.onicecandidate = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {}
        pc = null;
      }
      pendingIce = [];
    };

    const viewerId = viewerIdRef.current;

    signaling = createCameraSignalingChannel(clubId, cameraId, {
      onSubscribed: () => {
        signaling?.requestOffer(viewerId);
      },
      onSenderOnline: () => {
        if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          signaling?.requestOffer(viewerId);
        }
      },
      onOffer: async (sdp, sessionId, targetViewerId) => {
        if (cancelled) return;
        if (targetViewerId && targetViewerId !== viewerId) return;

        cleanupPc();
        currentSessionId = sessionId;

        const nextPc = new RTCPeerConnection(RTC_ICE_CONFIG);
        pc = nextPc;

        nextPc.ontrack = (ev) => {
          if (cancelled) return;
          const remoteStream = ev.streams?.[0] || new MediaStream([ev.track]);
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStream;
            videoRef.current.play().catch(() => {});
          }
          setHasStream(true);
        };

        nextPc.onicecandidate = (ev) => {
          if (ev.candidate && signaling) {
            signaling.sendIceCandidate(ev.candidate.toJSON(), 'receiver', sessionId, viewerId);
          }
        };

        nextPc.onconnectionstatechange = () => {
          if (cancelled) return;
          if (nextPc.connectionState === 'disconnected' || nextPc.connectionState === 'failed' || nextPc.connectionState === 'closed') {
            setHasStream(false);
          }
        };

        try {
          await nextPc.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const cand of pendingIce) {
            try {
              await nextPc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {}
          }
          pendingIce = [];
          const answer = await nextPc.createAnswer();
          await nextPc.setLocalDescription(answer);
          if (nextPc.localDescription && signaling) {
            signaling.sendAnswer(nextPc.localDescription, sessionId, viewerId);
          }
        } catch {}
      },
      onIceCandidate: async (candidate, role, sessionId, targetViewerId) => {
        if (cancelled || role !== 'sender') return;
        if (targetViewerId && targetViewerId !== viewerId) return;
        if (sessionId !== currentSessionId) return;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
        } else {
          pendingIce.push(candidate);
        }
      }
    });

    const retryInterval = window.setInterval(() => {
      if (!cancelled && (!pc || pc.connectionState !== 'connected')) {
        signaling?.requestOffer(viewerId);
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(retryInterval);
      cleanupPc();
      signaling?.destroy();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setHasStream(false);
    };
  }, [clubId, cameraId]);

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#070A12', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        aria-label={title}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: fill ? 'cover' : 'contain',
          transform: `rotate(${rotation}deg) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 0.2s ease'
        }}
      />
      {!hasStream && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.45)',
          fontSize: '0.82rem',
          fontWeight: 600,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          pointerEvents: 'none'
        }}>
          En attente du signal smartphone...
        </div>
      )}
    </div>
  );
};

export default WebRtcCameraPlayer;
