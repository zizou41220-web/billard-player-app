import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import {
  Tv, Maximize2, Minimize2, RotateCcw, X, Trophy,
  Clock, Radio, CheckCircle2, Swords
} from 'lucide-react';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { APP_VERSION } from '../version';
import LeaderboardView from './LeaderboardView';
import TournamentBracketView from './TournamentBracketView';
import { getMatchScoringRules } from '../utils/rules';

interface KioskViewProps {
  onExit?: () => void;
}

export const KioskView: React.FC<KioskViewProps> = ({ onExit }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tables' | 'leaderboard' | 'bracket'>('tables');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [rotationProgress, setRotationProgress] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(document.fullscreenElement));

  const ROTATION_INTERVAL_SEC = 25;

  // Real-time digital clock (updates every second)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  };

  // Active tournament
  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  // Available tabs
  const availableTabs: ('tables' | 'leaderboard' | 'bracket')[] = useMemo(() => {
    const list: ('tables' | 'leaderboard' | 'bracket')[] = ['tables', 'leaderboard'];
    if (activeTournament && activeTournament.matches && activeTournament.matches.length > 0) {
      list.push('bracket');
    }
    return list;
  }, [activeTournament]);

  // Auto-rotation timer & progress bar
  useEffect(() => {
    if (!autoRotate) {
      setRotationProgress(0);
      return;
    }

    const tickMs = 250;
    const totalMs = ROTATION_INTERVAL_SEC * 1000;
    const stepPercent = (tickMs / totalMs) * 100;

    const interval = setInterval(() => {
      setRotationProgress(prev => {
        if (prev + stepPercent >= 100) {
          // Switch to next tab
          setActiveTab(current => {
            const currentIndex = availableTabs.indexOf(current);
            const nextIndex = (currentIndex + 1) % availableTabs.length;
            return availableTabs[nextIndex];
          });
          return 0;
        }
        return prev + stepPercent;
      });
    }, tickMs);

    return () => clearInterval(interval);
  }, [autoRotate, availableTabs]);

  // Pending tournament matches (for "Next Up" queue)
  const pendingMatches = useMemo(() => {
    if (!activeTournament) return [];
    return activeTournament.matches
      .map(id => matches[id])
      .filter(m => Boolean(m && m.status === 'pending' && !m.tableId && m.player1Id && m.player2Id && m.player1Id !== 'BYE' && m.player2Id !== 'BYE'))
      .sort((a, b) => (a.bracketRound || 0) - (b.bracketRound || 0));
  }, [activeTournament, matches]);

  // Last finished matches
  const recentFinishedMatches = useMemo(() => {
    return Object.values(matches)
      .filter(m => m.status === 'finished')
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, 5);
  }, [matches]);

  // All club tables
  const tableList = useMemo(() => {
    return Object.values(tables).sort((a, b) => a.number - b.number);
  }, [tables]);

  // Render match stage label & badge
  const renderStageBadge = (stage?: string) => {
    if (!stage || stage === 'qualif') return null;
    let label = 'Phase Finale';
    let color = '#38bdf8';
    let bg = 'rgba(56, 189, 248, 0.15)';
    let border = 'rgba(56, 189, 248, 0.4)';

    if (stage === 'final') {
      label = '🏆 GRANDE FINALE';
      color = '#ffd700';
      bg = 'rgba(255, 215, 0, 0.2)';
      border = 'rgba(255, 215, 0, 0.5)';
    } else if (stage === 'third_place') {
      label = '🥉 PETITE FINALE (3E PLACE)';
      color = '#f59e0b';
      bg = 'rgba(245, 158, 11, 0.2)';
      border = 'rgba(245, 158, 11, 0.5)';
    } else if (stage === 'semi') {
      label = '⚔️ DEMI-FINALE';
      color = '#a855f7';
      bg = 'rgba(168, 85, 247, 0.2)';
      border = 'rgba(168, 85, 247, 0.5)';
    } else if (stage === 'quarter') {
      label = '🎯 1/4 DE FINALE';
      color = '#00ffaa';
      bg = 'rgba(0, 255, 170, 0.15)';
      border = 'rgba(0, 255, 170, 0.4)';
    }

    return (
      <span style={{
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: 900,
        letterSpacing: '0.5px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: `0 0 12px ${bg}`
      }}>
        {label}
      </span>
    );
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#050816',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      position: 'relative'
    }}>

      {/* Top Header */}
      <header style={{
        padding: '0.9rem 2rem',
        background: 'rgba(5, 8, 22, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 20
      }}>
        {/* Left: Club Identity & Live Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{
            background: '#ffffff',
            padding: '3px 8px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
          }}>
            <img
              src={getClubLogoUrl(currentClub.logoUrl)}
              alt={currentClub.name}
              style={{ height: '42px', objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <h1 style={{
                margin: 0,
                fontSize: '1.6rem',
                fontWeight: 900,
                color: 'var(--accent-primary)',
                letterSpacing: '-0.5px'
              }}>
                {currentClub.name}
              </h1>
              <span style={{
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 900,
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.35)'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                  animation: 'pulse 1.5s infinite'
                }} />
                EN DIRECT
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '2px' }}>
              <span>{activeTournament ? `Tournoi : ${activeTournament.name}` : 'Salle de Billard en Direct'}</span>
              <span style={{
                background: 'rgba(0, 255, 170, 0.12)',
                color: 'var(--accent-primary)',
                padding: '2px 8px',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: 800,
                border: '1px solid rgba(0, 255, 170, 0.3)'
              }}>
                {APP_VERSION}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Real-time Clock */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '6px 16px',
          borderRadius: '14px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}>
          <Clock size={20} color="var(--accent-primary)" />
          <span style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            color: '#fff'
          }}>
            {currentTime}
          </span>
        </div>

        {/* Right: View Switchers & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '4px',
            background: 'rgba(0,0,0,0.5)',
            padding: '3px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <button
              onClick={() => { setActiveTab('tables'); setAutoRotate(false); }}
              style={{
                background: activeTab === 'tables' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'tables' ? '#000' : 'var(--text-muted)',
                fontWeight: 800,
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem'
              }}
            >
              <Tv size={16} /> Tables ({tableList.length})
            </button>
            <button
              onClick={() => { setActiveTab('leaderboard'); setAutoRotate(false); }}
              style={{
                background: activeTab === 'leaderboard' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'leaderboard' ? '#000' : 'var(--text-muted)',
                fontWeight: 800,
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem'
              }}
            >
              <Trophy size={16} /> Classement Club
            </button>
            {activeTournament && (
              <button
                onClick={() => { setActiveTab('bracket'); setAutoRotate(false); }}
                style={{
                  background: activeTab === 'bracket' ? 'var(--accent-primary)' : 'transparent',
                  color: activeTab === 'bracket' ? '#000' : 'var(--text-muted)',
                  fontWeight: 800,
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem'
                }}
              >
                <Swords size={16} /> Arbre Tournoi
              </button>
            )}
          </div>

          {/* Auto-rotation Toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            title={autoRotate ? "Désactiver la rotation automatique" : "Activer la rotation automatique"}
            style={{
              background: autoRotate ? 'rgba(0, 255, 170, 0.15)' : 'rgba(255,255,255,0.05)',
              color: autoRotate ? 'var(--accent-primary)' : 'var(--text-muted)',
              border: `1px solid ${autoRotate ? 'rgba(0, 255, 170, 0.4)' : 'rgba(255,255,255,0.1)'}`,
              padding: '6px 12px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RotateCcw size={14} style={{ transform: autoRotate ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }} />
            {autoRotate ? 'Rotation ON' : 'Rotation OFF'}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Quitter plein écran" : "Passer en plein écran"}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '8px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Exit Kiosk Button */}
          {onExit && (
            <button
              onClick={onExit}
              title="Quitter le mode Kiosque"
              style={{
                background: 'rgba(255, 68, 68, 0.15)',
                color: '#ff4444',
                border: '1px solid rgba(255, 68, 68, 0.35)',
                padding: '8px 12px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 800,
                fontSize: '0.8rem'
              }}
            >
              <X size={16} /> Quitter
            </button>
          )}
        </div>
      </header>

      {/* Auto-rotation Progress Bar */}
      {autoRotate && (
        <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            width: `${rotationProgress}%`,
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
            boxShadow: '0 0 8px var(--accent-primary)',
            transition: 'width 0.25s linear'
          }} />
        </div>
      )}

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* VIEW 1: LIVE TABLES GRID */}
        {activeTab === 'tables' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: tableList.length <= 2 ? 'repeat(auto-fit, minmax(460px, 1fr))' : 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1.5rem',
            width: '100%',
            alignContent: 'start'
          }}>
            {tableList.map(table => {
              const currentMatch = table.currentMatchId ? matches[table.currentMatchId] : null;
              const isOccupied = table.status === 'occupied' && currentMatch && currentMatch.status !== 'finished';
              const p1 = currentMatch ? players[currentMatch.player1Id] : null;
              const p2 = currentMatch ? players[currentMatch.player2Id] : null;

              const scoringRules = currentMatch
                ? getMatchScoringRules(currentMatch, activeTournament, players)
                : null;

              return (
                <div
                  key={table.id}
                  style={{
                    background: isOccupied
                      ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(5, 8, 22, 0.95) 100%)'
                      : 'rgba(10, 15, 28, 0.65)',
                    borderRadius: '20px',
                    border: isOccupied
                      ? '2px solid rgba(0, 255, 170, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isOccupied
                      ? '0 10px 40px rgba(0, 255, 170, 0.15), 0 0 20px rgba(0,0,0,0.5)'
                      : '0 4px 20px rgba(0,0,0,0.3)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '260px',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Top Bar of Table Card */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingBottom: '0.8rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{
                        background: isOccupied ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
                        color: isOccupied ? '#000' : '#fff',
                        fontWeight: 900,
                        fontSize: '0.9rem',
                        padding: '4px 10px',
                        borderRadius: '8px'
                      }}>
                        T{table.number}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                        {table.name || `Billard ${table.number}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {isOccupied && currentMatch?.stage && renderStageBadge(currentMatch.stage)}
                      <span style={{
                        background: isOccupied ? 'rgba(0, 255, 170, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                        color: isOccupied ? 'var(--accent-primary)' : 'var(--text-muted)',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: `1px solid ${isOccupied ? 'rgba(0, 255, 170, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`
                      }}>
                        {isOccupied ? 'EN COURS' : 'LIBRE'}
                      </span>
                    </div>
                  </div>

                  {/* Body: Match in progress */}
                  {isOccupied && currentMatch && p1 && p2 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 'auto 0' }}>
                      {/* Player 1 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, textAlign: 'center' }}>
                        {p1.avatarUrl ? (
                          <img
                            src={p1.avatarUrl}
                            alt={p1.name}
                            style={{
                              width: '68px',
                              height: '68px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: `3px solid ${(p1.level === 'Prestige' || p1.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                              boxShadow: '0 0 15px rgba(0, 255, 170, 0.25)',
                              marginBottom: '0.5rem'
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '68px',
                            height: '68px',
                            borderRadius: '50%',
                            background: (p1.level === 'Prestige' || p1.level === 'Confirmé') ? 'linear-gradient(135deg, #ffd700, #b45309)' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                            color: '#000',
                            fontWeight: 900,
                            fontSize: '1.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `3px solid ${(p1.level === 'Prestige' || p1.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                            marginBottom: '0.5rem'
                          }}>
                            {p1.name.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#fff' }}>
                          {p1.name}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: (p1.level === 'Prestige' || p1.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)',
                          fontWeight: 800,
                          marginTop: '2px'
                        }}>
                          {(p1.level === 'Prestige' || p1.level === 'Confirmé') ? '👑 Prestige' : '🎯 Amateur'}
                        </span>
                        {Boolean(currentMatch.handicapP1) && (
                          <span style={{
                            background: 'rgba(0, 255, 170, 0.15)',
                            color: 'var(--accent-primary)',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            marginTop: '3px'
                          }}>
                            +{currentMatch.handicapP1} avance
                          </span>
                        )}
                      </div>

                      {/* Giant Scores */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 1rem' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.8rem',
                          fontWeight: 900,
                          fontSize: '3.6rem',
                          color: '#fff',
                          letterSpacing: '-1px',
                          textShadow: '0 0 25px rgba(0, 255, 170, 0.4)'
                        }}>
                          <span style={{ color: currentMatch.score1 > currentMatch.score2 ? 'var(--accent-primary)' : '#fff' }}>
                            {currentMatch.score1}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '2.4rem' }}>-</span>
                          <span style={{ color: currentMatch.score2 > currentMatch.score1 ? 'var(--accent-primary)' : '#fff' }}>
                            {currentMatch.score2}
                          </span>
                        </div>

                        {scoringRules && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '3px 10px',
                            borderRadius: '8px',
                            marginTop: '4px',
                            fontWeight: 700
                          }}>
                            {scoringRules.formatLabel || `${scoringRules.maxSets} manches`}
                          </div>
                        )}
                      </div>

                      {/* Player 2 */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, textAlign: 'center' }}>
                        {p2.avatarUrl ? (
                          <img
                            src={p2.avatarUrl}
                            alt={p2.name}
                            style={{
                              width: '68px',
                              height: '68px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: `3px solid ${(p2.level === 'Prestige' || p2.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                              boxShadow: '0 0 15px rgba(0, 255, 170, 0.25)',
                              marginBottom: '0.5rem'
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '68px',
                            height: '68px',
                            borderRadius: '50%',
                            background: (p2.level === 'Prestige' || p2.level === 'Confirmé') ? 'linear-gradient(135deg, #ffd700, #b45309)' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                            color: '#000',
                            fontWeight: 900,
                            fontSize: '1.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `3px solid ${(p2.level === 'Prestige' || p2.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                            marginBottom: '0.5rem'
                          }}>
                            {p2.name.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#fff' }}>
                          {p2.name}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: (p2.level === 'Prestige' || p2.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)',
                          fontWeight: 800,
                          marginTop: '2px'
                        }}>
                          {(p2.level === 'Prestige' || p2.level === 'Confirmé') ? '👑 Prestige' : '🎯 Amateur'}
                        </span>
                        {Boolean(currentMatch.handicapP2) && (
                          <span style={{
                            background: 'rgba(0, 255, 170, 0.15)',
                            color: 'var(--accent-primary)',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            marginTop: '3px'
                          }}>
                            +{currentMatch.handicapP2} avance
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Free Table Status */
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: 'auto 0',
                      textAlign: 'center',
                      gap: '0.6rem'
                    }}>
                      <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: 'rgba(0, 255, 170, 0.08)',
                        border: '1px solid rgba(0, 255, 170, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-primary)'
                      }}>
                        <CheckCircle2 size={30} />
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '1.1rem' }}>
                        BILLARD DISPONIBLE
                      </span>

                      {/* Next Match in Queue */}
                      {pendingMatches.length > 0 ? (
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px dashed rgba(255, 255, 255, 0.15)',
                          borderRadius: '10px',
                          padding: '0.6rem 1rem',
                          marginTop: '0.5rem',
                          maxWidth: '300px'
                        }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Prochain Match Appelé :
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', marginTop: '2px' }}>
                            {players[pendingMatches[0].player1Id]?.name || 'Joueur 1'} vs {players[pendingMatches[0].player2Id]?.name || 'Joueur 2'}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Prêt pour le prochain défi ou match libre
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer of Table Card */}
                  <div style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                  }}>
                    <span>{table.liveStreamUrl ? '🎥 Caméra Live active' : 'Table Standard'}</span>
                    <span>Scannez le QR Code pour jouer</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: LEADERBOARD CLUB */}
        {activeTab === 'leaderboard' && (
          <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
            <LeaderboardView compact={false} />
          </div>
        )}

        {/* VIEW 3: TOURNAMENT BRACKET */}
        {activeTab === 'bracket' && activeTournament && (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
            <TournamentBracketView />
          </div>
        )}
      </main>

      {/* Bottom Live Ticker (Scrolling Broadcast Banner) */}
      <footer style={{
        background: 'rgba(5, 8, 22, 0.95)',
        borderTop: '2px solid rgba(0, 255, 170, 0.4)',
        padding: '0.6rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        zIndex: 20
      }}>
        {/* Ticker Tag */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--accent-primary)',
          color: '#000',
          fontWeight: 900,
          fontSize: '0.75rem',
          padding: '4px 10px',
          borderRadius: '6px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          flexShrink: 0,
          marginRight: '1.2rem',
          boxShadow: '0 0 10px rgba(0, 255, 170, 0.4)'
        }}>
          <Radio size={14} /> LIVE CLUB
        </div>

        {/* Scrolling text marquee */}
        <div style={{
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          flex: 1,
          position: 'relative'
        }}>
          <div style={{
            display: 'inline-block',
            animation: 'marquee 35s linear infinite',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#cbd5e1'
          }}>
            <span style={{ color: 'var(--accent-primary)' }}>🏆 {currentClub.name}</span>
            <span style={{ margin: '0 1rem', opacity: 0.4 }}>•</span>
            <span>
              {activeTournament
                ? `Tournoi actif : ${activeTournament.name} (${activeTournament.participants.length} joueurs)`
                : 'Bienvenue au club ! Tous les billards sont connectés.'}
            </span>
            <span style={{ margin: '0 1rem', opacity: 0.4 }}>•</span>
            {pendingMatches.length > 0 && (
              <>
                <span style={{ color: '#ffd700' }}>
                  ⏳ Prochains matchs en attente : {pendingMatches.slice(0, 3).map(m => `${players[m.player1Id]?.name || 'P1'} vs ${players[m.player2Id]?.name || 'P2'}`).join('  |  ')}
                </span>
                <span style={{ margin: '0 1rem', opacity: 0.4 }}>•</span>
              </>
            )}
            {recentFinishedMatches.length > 0 && (
              <>
                <span style={{ color: '#38bdf8' }}>
                  🎯 Derniers résultats : {recentFinishedMatches.slice(0, 3).map(m => `${players[m.player1Id]?.name} ${m.score1} - ${m.score2} ${players[m.player2Id]?.name}`).join('  |  ')}
                </span>
                <span style={{ margin: '0 1rem', opacity: 0.4 }}>•</span>
              </>
            )}
            <span>📱 Suivez vos scores en temps réel et scannez le QR code de votre table avec votre smartphone pour jouer !</span>
          </div>
        </div>
      </footer>

      {/* Global CSS for Kiosk Animations */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
};

export default KioskView;
