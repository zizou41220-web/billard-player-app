import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Check,
  Copy,
  ExternalLink,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Smartphone,
  X
} from 'lucide-react';
import { useStore } from '../store';
import { initSync } from '../sync';
import { APP_VERSION } from '../version';
import {
  PrismBarPosition,
  PrismLogoPosition,
  PrismQuickMatchState,
  PrismSourceMode,
  buildPrismOverlayUrl,
  buildPrismRemoteUrl,
  getPublicAppBaseUrl,
  loadPrismQuickState,
  savePrismQuickState,
  subscribeToPrismQuickState
} from '../utils/prismLive';

interface PrismMobileControlViewProps {
  clubId?: string;
  roomId?: string;
  standalone?: boolean;
  onClose?: () => void;
}

const PrismMobileControlView: React.FC<PrismMobileControlViewProps> = ({
  clubId: propClubId,
  roomId = 'live1',
  standalone = false,
  onClose
}) => {
  const { tables, matches, players, currentClub, setClub } = useStore();
  const effectiveClubId = propClubId || currentClub.id;
  const sortedTables = Object.values(tables).sort((a, b) => a.number - b.number);

  const [sourceMode, setSourceMode] = useState<PrismSourceMode>(
    standalone ? 'quick' : sortedTables.length > 0 ? 'table' : 'quick'
  );
  const [selectedTableId, setSelectedTableId] = useState<string>(() => sortedTables[0]?.id || '');
  const [quickState, setQuickState] = useState<PrismQuickMatchState>(() =>
    loadPrismQuickState(effectiveClubId, roomId)
  );
  const [copiedId, setCopiedId] = useState<'prism' | 'remote' | null>(null);
  const [showRemoteShare, setShowRemoteShare] = useState<boolean>(false);

  useEffect(() => {
    if (propClubId && currentClub.id !== propClubId) {
      setClub({ id: propClubId });
    }
    if (standalone) {
      initSync();
    }
  }, [propClubId, standalone]);

  useEffect(() => {
    if (!selectedTableId && sortedTables.length > 0) {
      setSelectedTableId(sortedTables[0].id);
    }
  }, [sortedTables.length]);

  useEffect(() => {
    return subscribeToPrismQuickState(effectiveClubId, roomId, (nextState) => {
      setQuickState(nextState);
    });
  }, [effectiveClubId, roomId]);

  const updateQuick = (patch: Partial<PrismQuickMatchState>) => {
    const merged: PrismQuickMatchState = {
      ...quickState,
      ...patch,
      roomId
    };
    setQuickState(merged);
    savePrismQuickState(effectiveClubId, merged, true);
  };

  const baseUrl = getPublicAppBaseUrl();
  const prismUrl = buildPrismOverlayUrl(baseUrl, effectiveClubId, {
    sourceMode,
    tableId: selectedTableId || sortedTables[0]?.id || '',
    barPos: quickState.barPos,
    logoPos: quickState.logoPos,
    quickState
  });
  const remoteUrl = buildPrismRemoteUrl(baseUrl, effectiveClubId, roomId);

  const copyLink = (text: string, id: 'prism' | 'remote') => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
  };

  const content = (
    <div
      className="live-studio-surface"
      onClick={(e) => e.stopPropagation()}
      style={{
        maxWidth: standalone ? '640px' : '720px',
        width: '100%',
        margin: standalone ? '0 auto' : undefined,
        maxHeight: standalone ? undefined : '92vh',
        overflowY: standalone ? undefined : 'auto',
        background: '#0B0F17',
        border: '1.5px solid rgba(52, 211, 153, 0.45)',
        borderRadius: '16px',
        padding: '1.1rem 1.2rem',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.95rem',
        color: '#F8FAFC'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
          <Smartphone size={20} color="#34D399" />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#FFFFFF' }}>
                Live Smartphone — PRISM Live Studio
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(251, 191, 36, 0.16)', color: '#FDE68A', border: '1px solid rgba(251, 191, 36, 0.45)', padding: '1px 6px', borderRadius: '6px' }}>
                {APP_VERSION}
              </span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#94A3B8' }}>
              Incrustation score & logo transparente pour diffuser sur Facebook depuis votre téléphone
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{ width: 'auto', padding: '5px 9px', fontSize: '0.78rem' }}
            title="Fermer"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Mode Switcher */}
      {!standalone && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: '#050811', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            type="button"
            onClick={() => setSourceMode('table')}
            style={{
              background: sourceMode === 'table' ? '#1E293B' : 'transparent',
              color: sourceMode === 'table' ? '#6EE7B7' : '#94A3B8',
              border: sourceMode === 'table' ? '1px solid rgba(16, 185, 129, 0.55)' : '1px solid transparent',
              borderRadius: '7px',
              padding: '0.48rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            🎱 Billard du club (auto)
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('quick')}
            style={{
              background: sourceMode === 'quick' ? '#1E293B' : 'transparent',
              color: sourceMode === 'quick' ? '#FDE68A' : '#94A3B8',
              border: sourceMode === 'quick' ? '1px solid rgba(212, 175, 55, 0.6)' : '1px solid transparent',
              borderRadius: '7px',
              padding: '0.48rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            ⚡ Match libre (hors tournoi)
          </button>
        </div>
      )}

      {/* Source Configuration */}
      {sourceMode === 'table' && !standalone ? (
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6EE7B7' }}>
            Choisir le billard filmé :
          </label>
          <select
            className="input-field"
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
          >
            {sortedTables.length === 0 ? (
              <option value="">Aucun billard configuré</option>
            ) : (
              sortedTables.map(t => {
                const m = t.currentMatchId
                  ? matches[t.currentMatchId]
                  : Object.values(matches).find(mx => mx.tableId === t.id && mx.status !== 'finished');
                const duel = m && m.status !== 'finished'
                  ? ` • ${players[m.player1Id]?.name || 'J1'} ${m.score1}-${m.score2} ${players[m.player2Id]?.name || 'J2'}`
                  : ' • Libre';
                return (
                  <option key={t.id} value={t.id}>
                    {t.name || `Billard ${t.number}`}{duel}
                  </option>
                );
              })
            )}
          </select>
          <div style={{ fontSize: '0.7rem', color: '#CCFBF1' }}>
            Le bandeau score de PRISM suit automatiquement les points marqués par les joueurs ou le gérant.
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(212, 175, 55, 0.07)', border: '1px solid rgba(212, 175, 55, 0.35)', borderRadius: '12px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Titre (ex: Amical, Défi, Entraînement...)"
              value={quickState.eventTitle}
              onChange={(e) => updateQuick({ eventTitle: e.target.value })}
              style={{ flex: '1 1 200px', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.65rem' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.73rem', color: '#CBD5E1', fontWeight: 700 }}>1er à :</span>
              <input
                type="number"
                className="input-field"
                min={0}
                max={35}
                value={quickState.targetSets}
                onChange={(e) => updateQuick({ targetSets: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                style={{ width: '56px', padding: '0.38rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center' }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => updateQuick({ score1: 0, score2: 0 })}
                style={{ width: 'auto', padding: '0.38rem 0.65rem', fontSize: '0.73rem' }}
                title="Remettre le score à 0 - 0"
              >
                <RotateCcw size={13} /> 0-0
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.6rem' }}>
            {/* Player 1 */}
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Nom Joueur 1"
                value={quickState.player1Name}
                onChange={(e) => updateQuick({ player1Name: e.target.value })}
                style={{ fontSize: '0.86rem', fontWeight: 800, padding: '0.38rem 0.6rem' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Club (optionnel)"
                value={quickState.player1Club}
                onChange={(e) => updateQuick({ player1Club: e.target.value })}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem', color: '#6EE7B7' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', marginTop: '0.15rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => updateQuick({ score1: Math.max(0, quickState.score1 - 1) })}
                  style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', borderRadius: '10px' }}
                >
                  <Minus size={18} />
                </button>
                <span style={{ fontSize: '2rem', fontWeight: 900, minWidth: '38px', textAlign: 'center', color: '#FDE68A' }}>
                  {quickState.score1}
                </span>
                <button
                  type="button"
                  className="btn btn-neon"
                  onClick={() => updateQuick({ score1: quickState.score1 + 1 })}
                  style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', borderRadius: '10px' }}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Player 2 */}
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '10px', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Nom Joueur 2"
                value={quickState.player2Name}
                onChange={(e) => updateQuick({ player2Name: e.target.value })}
                style={{ fontSize: '0.86rem', fontWeight: 800, padding: '0.38rem 0.6rem' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Club (optionnel)"
                value={quickState.player2Club}
                onChange={(e) => updateQuick({ player2Club: e.target.value })}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem', color: '#7DD3FC' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', marginTop: '0.15rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => updateQuick({ score2: Math.max(0, quickState.score2 - 1) })}
                  style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', borderRadius: '10px' }}
                >
                  <Minus size={18} />
                </button>
                <span style={{ fontSize: '2rem', fontWeight: 900, minWidth: '38px', textAlign: 'center', color: '#FDE68A' }}>
                  {quickState.score2}
                </span>
                <button
                  type="button"
                  className="btn btn-neon"
                  onClick={() => updateQuick({ score2: quickState.score2 + 1 })}
                  style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', borderRadius: '10px' }}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay Layout Options */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.55rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700 }}>Score :</span>
          {([
            { id: 'bottom' as PrismBarPosition, label: 'Bas' },
            { id: 'top' as PrismBarPosition, label: 'Haut' }
          ]).map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => updateQuick({ barPos: p.id })}
              style={{
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${quickState.barPos === p.id ? '#D4AF37' : 'rgba(255,255,255,0.16)'}`,
                background: quickState.barPos === p.id ? 'rgba(212,175,55,0.2)' : '#0E1525',
                color: quickState.barPos === p.id ? '#FDE68A' : '#CBD5E1'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700 }}>Logo :</span>
          {([
            { id: 'left' as PrismLogoPosition, label: '↖ Haut Gauche' },
            { id: 'right' as PrismLogoPosition, label: '↗ Haut Droite' },
            { id: 'none' as PrismLogoPosition, label: 'Masquer' }
          ]).map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => updateQuick({ logoPos: l.id })}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${quickState.logoPos === l.id ? '#D4AF37' : 'rgba(255,255,255,0.16)'}`,
                background: quickState.logoPos === l.id ? 'rgba(212,175,55,0.2)' : '#0E1525',
                color: quickState.logoPos === l.id ? '#FDE68A' : '#CBD5E1'
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* PRISM Web Widget Link & QR */}
      <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '12px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#6EE7B7' }}>
          🔗 Lien du Widget Web à coller dans PRISM Live Studio :
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            className="input-field"
            value={prismUrl}
            style={{ flex: '1 1 220px', fontSize: '0.72rem', padding: '0.45rem 0.65rem' }}
          />
          <button
            type="button"
            className="btn btn-neon"
            onClick={() => copyLink(prismUrl, 'prism')}
            style={{ width: 'auto', padding: '0.45rem 0.9rem', fontSize: '0.76rem', fontWeight: 900 }}
          >
            {copiedId === 'prism' ? <Check size={14} /> : <Copy size={14} />}
            {copiedId === 'prism' ? 'Copié !' : 'Copier le lien PRISM'}
          </button>
          <a
            href={prismUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.74rem', textDecoration: 'none' }}
          >
            <ExternalLink size={13} /> Tester
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', lineHeight: 0, flexShrink: 0 }}>
            <QRCode value={prismUrl} size={82} />
          </div>
          <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.72rem', color: '#CBD5E1', lineHeight: 1.5, flex: '1 1 220px' }}>
            <li>Ouvrez <b>PRISM Live Studio</b> (iOS / Android) et connectez votre compte <b>Facebook</b>.</li>
            <li>Glissez l'écran vers la gauche → <b>Web</b> → collez le lien ci-dessus en plein écran.</li>
            <li>Lancez votre live Facebook : le score et le logo restent visibles en direct !</li>
          </ol>
        </div>
      </div>

      {/* Optional 2nd phone remote score share */}
      {sourceMode === 'quick' && !standalone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowRemoteShare(v => !v)}
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.76rem', padding: '0.45rem 0.8rem', borderColor: 'rgba(212, 175, 55, 0.45)', color: '#FDE68A' }}
          >
            <QrCode size={14} />
            {showRemoteShare
              ? 'Masquer la télécommande 2e téléphone'
              : '📱 Ouvrir / Partager la Télécommande Score (2e téléphone)'}
          </button>

          {showRemoteShare && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', lineHeight: 0 }}>
                <QRCode value={remoteUrl} size={78} />
              </div>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', color: '#E2E8F0', fontWeight: 700 }}>
                  Scannez ce QR Code avec un 2e smartphone pour piloter le score à distance sans toucher au téléphone qui filme :
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input type="text" readOnly className="input-field" value={remoteUrl} style={{ flex: 1, fontSize: '0.68rem', padding: '0.35rem 0.5rem' }} />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => copyLink(remoteUrl, 'remote')}
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.7rem' }}
                  >
                    {copiedId === 'remote' ? '✓ Copié' : 'Copier'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div style={{ minHeight: '100dvh', background: '#030807', padding: '0.85rem', boxSizing: 'border-box' }}>
        {content}
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        zIndex: 10060,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.9rem'
      }}
    >
      {content}
    </div>
  );
};

export default PrismMobileControlView;
