import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { initSync } from '../sync';
import { Match, Table, Tournament } from '../types';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMatchScoringRules } from '../utils/rules';
import { isActiveLiveMatch } from '../utils/liveBroadcaster';
import {
  DEFAULT_PRISM_QUICK_STATE,
  PrismBarPosition,
  PrismLogoPosition,
  PrismQuickMatchState,
  loadPrismQuickState,
  subscribeToPrismQuickState
} from '../utils/prismLive';

interface PrismMobileOverlayViewProps {
  mode: string;
  clubId: string;
}

const PrismMobileOverlayView: React.FC<PrismMobileOverlayViewProps> = ({ mode, clubId }) => {
  const { tables, matches, players, tournaments, currentClub, setClub } = useStore();
  const urlParams = new URLSearchParams(window.location.search);

  const tableParam = urlParams.get('table') || '';
  const roomId = urlParams.get('room') || 'live1';
  const paramBarPos: PrismBarPosition = urlParams.get('pos') === 'top' ? 'top' : 'bottom';
  const rawLogoParam = urlParams.get('logo');
  const paramLogoPos: PrismLogoPosition =
    rawLogoParam === 'right' || rawLogoParam === 'none' ? rawLogoParam : 'left';

  const isQuickMode = mode === 'quick';

  const [quickState, setQuickState] = useState<PrismQuickMatchState>(() => {
    const stored = loadPrismQuickState(clubId, roomId);
    const hasSeed = urlParams.has('p1') || urlParams.has('p2') || urlParams.has('t');
    if (stored.updatedAt > 0) {
      return {
        ...stored,
        barPos: urlParams.has('pos') ? paramBarPos : stored.barPos,
        logoPos: urlParams.has('logo') ? paramLogoPos : stored.logoPos
      };
    }
    if (hasSeed) {
      return {
        ...DEFAULT_PRISM_QUICK_STATE,
        roomId,
        eventTitle: urlParams.get('t') || DEFAULT_PRISM_QUICK_STATE.eventTitle,
        player1Name: urlParams.get('p1') || DEFAULT_PRISM_QUICK_STATE.player1Name,
        player1Club: urlParams.get('c1') || '',
        player2Name: urlParams.get('p2') || DEFAULT_PRISM_QUICK_STATE.player2Name,
        player2Club: urlParams.get('c2') || '',
        targetSets: Math.max(0, parseInt(urlParams.get('race') || '5', 10) || 0),
        barPos: paramBarPos,
        logoPos: paramLogoPos,
        updatedAt: 0
      };
    }
    return {
      ...stored,
      barPos: paramBarPos,
      logoPos: paramLogoPos
    };
  });

  // Guarantee 100% transparent page background for PRISM Live Studio Web widget
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'mcb-prism-transparent';
    styleEl.textContent = `
      html, body, #root {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, []);

  // Keep club & live match data synchronized
  useEffect(() => {
    if (clubId && currentClub.id !== clubId) {
      setClub({ id: clubId });
    }
    initSync();
  }, [clubId]);

  // Real-time sync for quick match scores
  useEffect(() => {
    if (!isQuickMode) return;
    return subscribeToPrismQuickState(clubId, roomId, (nextState) => {
      setQuickState(prev => ({
        ...prev,
        ...nextState,
        barPos: nextState.barPos || paramBarPos,
        logoPos: nextState.logoPos || paramLogoPos
      }));
    });
  }, [isQuickMode, clubId, roomId, paramBarPos, paramLogoPos]);

  const effectiveBarPos: PrismBarPosition = isQuickMode ? (quickState.barPos || paramBarPos) : paramBarPos;
  const effectiveLogoPos: PrismLogoPosition = isQuickMode ? (quickState.logoPos || paramLogoPos) : paramLogoPos;

  // Resolve active tournament / table match when mode === 'table'
  const activeTournament =
    Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const sortedTables = Object.values(tables).sort((a, b) => a.number - b.number);
  const table: Table | undefined = tableParam
    ? sortedTables.find(
        t =>
          t.id === tableParam ||
          t.number.toString() === tableParam ||
          t.name?.toLowerCase().includes(tableParam.toLowerCase())
      )
    : sortedTables[0];

  const rawMatch: Match | undefined = table
    ? table.currentMatchId
      ? matches[table.currentMatchId]
      : Object.values(matches).find(m => m.tableId === table.id && isActiveLiveMatch(m, tournaments))
    : undefined;
  const match: Match | undefined = isActiveLiveMatch(rawMatch, tournaments) ? rawMatch : undefined;
  const p1 = match ? players[match.player1Id] : undefined;
  const p2 = match ? players[match.player2Id] : undefined;
  const matchTournament: Tournament | null = match?.tournamentId
    ? tournaments[match.tournamentId] || activeTournament
    : activeTournament;
  const rulesText = match ? getMatchScoringRules(match, matchTournament, players).formatLabel || '' : '';

  const displayTitle = isQuickMode
    ? quickState.eventTitle || 'Match Live'
    : table
      ? `${table.name || `Billard ${table.number}`}${matchTournament ? ` • ${matchTournament.name}` : ''}`
      : currentClub.name;

  const displayFormat = isQuickMode
    ? (quickState.targetSets > 0 ? `1er à ${quickState.targetSets}` : '')
    : rulesText;

  const p1Name = isQuickMode ? (quickState.player1Name || 'Joueur 1') : (p1?.name || 'En attente...');
  const p1Club = isQuickMode ? quickState.player1Club : (p1?.clubName || p1?.stats?.clubName || '');
  const p2Name = isQuickMode ? (quickState.player2Name || 'Joueur 2') : (p2?.name || 'En attente...');
  const p2Club = isQuickMode ? quickState.player2Club : (p2?.clubName || p2?.stats?.clubName || '');
  const s1 = isQuickMode ? quickState.score1 : (match?.score1 ?? 0);
  const s2 = isQuickMode ? quickState.score2 : (match?.score2 ?? 0);
  const hasMatchData = isQuickMode || Boolean(match && p1 && p2);
  const winnerName =
    !isQuickMode && match?.status === 'finished' && match.winnerId
      ? players[match.winnerId]?.name
      : undefined;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'transparent',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily: 'Outfit, Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Floating Club Logo Medallion */}
      {effectiveLogoPos !== 'none' && (
        <div
          style={{
            position: 'absolute',
            top: '14px',
            ...(effectiveLogoPos === 'right' ? { right: '16px' } : { left: '16px' }),
            width: 'clamp(46px, 8vw, 68px)',
            height: 'clamp(46px, 8vw, 68px)',
            borderRadius: '50%',
            background: '#FFFFFF',
            border: '2px solid #D4AF37',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.65)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20
          }}
        >
          <img
            src={getClubLogoUrl(currentClub.logoUrl)}
            alt={currentClub.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.src = defaultClubLogo;
            }}
          />
        </div>
      )}

      {/* Broadcast Scoreboard Overlay */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          ...(effectiveBarPos === 'top' ? { top: '16px' } : { bottom: '18px' }),
          width: 'min(94vw, 760px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 15
        }}
      >
        <div
          style={{
            width: '100%',
            background: 'rgba(10, 14, 22, 0.90)',
            border: '1.5px solid rgba(212, 175, 55, 0.72)',
            borderRadius: '14px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.72)',
            padding: '8px 14px',
            boxSizing: 'border-box',
            color: '#F8FAFC'
          }}
        >
          {/* Top micro header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              paddingBottom: '5px',
              marginBottom: '6px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 'clamp(0.64rem, 1.8vw, 0.78rem)',
              fontWeight: 800
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  flexShrink: 0
                }}
              >
                ● LIVE
              </span>
              <span
                style={{
                  color: '#E2E8F0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displayTitle}
              </span>
            </div>
            {displayFormat && (
              <span
                style={{
                  color: '#FDE68A',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {displayFormat}
              </span>
            )}
          </div>

          {hasMatchData ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                alignItems: 'center',
                gap: 'clamp(6px, 2vw, 16px)'
              }}
            >
              {/* Player 1 */}
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 'clamp(0.84rem, 2.8vw, 1.18rem)',
                    color: '#FFFFFF',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {p1Name}
                </div>
                {p1Club && (
                  <div
                    style={{
                      fontSize: 'clamp(0.6rem, 1.6vw, 0.72rem)',
                      color: '#6EE7B7',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p1Club}
                  </div>
                )}
              </div>

              {/* Center Score */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'clamp(6px, 1.8vw, 12px)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(212, 175, 55, 0.45)',
                  borderRadius: '10px',
                  padding: '3px clamp(10px, 2.5vw, 16px)'
                }}
              >
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
                    color: '#FDE68A',
                    lineHeight: 1.05,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {s1}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>—</span>
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
                    color: '#FDE68A',
                    lineHeight: 1.05,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {s2}
                </span>
              </div>

              {/* Player 2 */}
              <div style={{ minWidth: 0, textAlign: 'right' }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 'clamp(0.84rem, 2.8vw, 1.18rem)',
                    color: '#FFFFFF',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {p2Name}
                </div>
                {p2Club && (
                  <div
                    style={{
                      fontSize: 'clamp(0.6rem, 1.6vw, 0.72rem)',
                      color: '#7DD3FC',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p2Club}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '4px 0',
                fontSize: 'clamp(0.8rem, 2.4vw, 0.95rem)',
                fontWeight: 700,
                color: '#CCFBF1'
              }}
            >
              En attente du prochain match sur ce billard…
            </div>
          )}
        </div>

        {winnerName && (
          <div
            style={{
              background: 'linear-gradient(90deg, #FBBF24, #F59E0B)',
              color: '#041210',
              fontWeight: 900,
              fontSize: 'clamp(0.76rem, 2.2vw, 0.92rem)',
              padding: '4px 16px',
              borderRadius: '999px',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.45)'
            }}
          >
            🏆 Victoire de {winnerName} ({s1} - {s2})
          </div>
        )}
      </div>
    </div>
  );
};

export default PrismMobileOverlayView;
