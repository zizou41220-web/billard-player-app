import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Match, Table, Tournament } from '../types';

interface StreamOverlayViewProps {
  tableParam: string;
}

const StreamOverlayView: React.FC<StreamOverlayViewProps> = ({ tableParam }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const [position, setPosition] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pos') === 'bottom') setPosition('bottom');
  }, []);

  // Find table by ID (e.g. 't1') or by number (e.g. '1') or by name
  const table: Table | undefined = Object.values(tables).find(t => 
    t.id === tableParam || 
    t.number.toString() === tableParam || 
    t.name?.toLowerCase().includes(tableParam.toLowerCase())
  );

  // Find active tournament
  const allTournaments = Object.values(tournaments);
  const activeTournament: Tournament | null = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  // Find the match running on this table
  const match: Match | undefined = table?.currentMatchId ? matches[table.currentMatchId] : undefined;
  const p1 = match ? players[match.player1Id] : undefined;
  const p2 = match ? players[match.player2Id] : undefined;

  const tournamentSettings = activeTournament?.settings;
  const rulesText = tournamentSettings 
    ? (tournamentSettings.qualifIsWinningSets 
        ? `1er à ${tournamentSettings.qualifNbSets}` 
        : `${tournamentSettings.qualifNbSets} manches`)
    : '';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: 'transparent',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: position === 'top' ? 'flex-start' : 'flex-end',
      alignItems: 'center',
      padding: '2.5rem',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      
      {/* Broadcast Scoreboard Graphic */}
      {table && match && p1 && p2 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: 'fadeInDown 0.4s ease',
          filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.8))',
          maxWidth: '900px',
          width: '100%'
        }}>
          
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
              <div style={{
                background: '#ffffff',
                padding: '2px 6px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
              }}>
                <img src={currentClub.logoUrl || '/logo.png'} alt={currentClub.name} style={{ height: '22px', objectFit: 'contain' }} />
              </div>
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
              <span style={{ color: 'var(--accent-primary, #00ffcc)', fontWeight: 800 }}>
                {table.name || `BILLARD ${table.number}`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              {activeTournament && <span>{activeTournament.name}</span>}
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
                src={p1.avatarUrl || `https://i.pravatar.cc/150?u=${p1.id}`} 
                alt={p1.name} 
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${p1.level === 'Confirmé' ? '#00e5ff' : '#00ffcc'}`,
                  boxShadow: '0 0 12px rgba(0,0,0,0.5)',
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
                <div style={{ color: p1.level === 'Confirmé' ? '#00e5ff' : 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {p1.level}
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
                <div style={{ color: p2.level === 'Confirmé' ? '#00e5ff' : 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {p2.level}
                </div>
              </div>
              <img 
                src={p2.avatarUrl || `https://i.pravatar.cc/150?u=${p2.id}`} 
                alt={p2.name} 
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${p2.level === 'Confirmé' ? '#00e5ff' : '#00ffcc'}`,
                  boxShadow: '0 0 12px rgba(0,0,0,0.5)',
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
            <img src={currentClub.logoUrl || '/logo.png'} alt={currentClub.name} style={{ height: '36px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--accent-primary, #00ffcc)' }}>
              {table ? (table.name || `Billard ${table.number}`) : `Table ${tableParam}`}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
              {currentClub.name} • En attente du prochain match...
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StreamOverlayView;
