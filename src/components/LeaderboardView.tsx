import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Trophy, Medal, Award, Crown, Target, Search, Flame, User } from 'lucide-react';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { Player } from '../types';
import { getPlayerAvatar } from '../utils/avatar';
import { computeAllPlayersStats, calculatePlayerClubPoints } from '../utils/playerStats';

interface LeaderboardViewProps {
  compact?: boolean;
  onClose?: () => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ compact = false }) => {
  const { players, matches, tournaments, currentClub } = useStore();
  const [filterLevel, setFilterLevel] = useState<'all' | 'Prestige' | 'Amateur'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'points' | 'winRate' | 'wins' | 'tournamentsWon'>('points');

  const allPlayers = useMemo(() => {
    const computed = computeAllPlayersStats(players, matches, tournaments);
    return Object.values(computed).filter(p => Boolean(p && p.id));
  }, [players, matches, tournaments]);

  const matchesLevel = (p: Player) => {
    if (filterLevel === 'all') return true;
    if (filterLevel === 'Prestige') return p.level === 'Prestige' || p.level === 'Confirmé';
    return p.level === filterLevel;
  };

  const getPoints = (p: Player) => {
    return p.stats.points ?? calculatePlayerClubPoints(p.stats);
  };

  const filteredAndSortedPlayers = useMemo(() => {
    return allPlayers
      .filter(p => {
        if (!matchesLevel(p)) return false;
        if (search.trim()) {
          return p.name.toLowerCase().includes(search.trim().toLowerCase());
        }
        return true;
      })
      .sort((a, b) => {
        const statsA = a.stats;
        const statsB = b.stats;
        if (sortBy === 'points') {
          const ptsA = getPoints(a);
          const ptsB = getPoints(b);
          if (ptsB !== ptsA) return ptsB - ptsA;
          return (statsB.winRate || 0) - (statsA.winRate || 0);
        }
        if (sortBy === 'winRate') {
          if ((statsB.winRate || 0) !== (statsA.winRate || 0)) {
            return (statsB.winRate || 0) - (statsA.winRate || 0);
          }
          return (statsB.wins || 0) - (statsA.wins || 0);
        }
        if (sortBy === 'wins') {
          if ((statsB.wins || 0) !== (statsA.wins || 0)) {
            return (statsB.wins || 0) - (statsA.wins || 0);
          }
          return (statsB.winRate || 0) - (statsA.winRate || 0);
        }
        if (sortBy === 'tournamentsWon') {
          if ((statsB.tournamentsWon || 0) !== (statsA.tournamentsWon || 0)) {
            return (statsB.tournamentsWon || 0) - (statsA.tournamentsWon || 0);
          }
          return (statsB.wins || 0) - (statsA.wins || 0);
        }
        return 0;
      });
  }, [allPlayers, filterLevel, search, sortBy]);

  // Overall Top 3 for the 3D podium (unfiltered by search, but follows level filter)
  const podiumPlayers = useMemo(() => {
    return allPlayers
      .filter(matchesLevel)
      .sort((a, b) => {
        const ptsA = getPoints(a);
        const ptsB = getPoints(b);
        if (ptsB !== ptsA) return ptsB - ptsA;
        return (b.stats.winRate || 0) - (a.stats.winRate || 0);
      })
      .slice(0, 3);
  }, [allPlayers, filterLevel]);

  const p1 = podiumPlayers[0] as Player | undefined;
  const p2 = podiumPlayers[1] as Player | undefined;
  const p3 = podiumPlayers[2] as Player | undefined;

  const countPrestige = allPlayers.filter(p => p.level === 'Prestige' || p.level === 'Confirmé').length;
  const countAmateur = allPlayers.filter(p => p.level === 'Amateur').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', color: '#fff' }}>
      {/* Header Banner */}
      {!compact && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(5, 8, 22, 0.75)',
          border: '1px solid var(--border-color)',
          padding: '1.2rem 1.6rem',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            <div style={{
              background: '#fff',
              padding: '4px 10px',
              borderRadius: '12px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center'
            }}>
              <img
                src={getClubLogoUrl(currentClub.logoUrl)}
                alt={currentClub.name}
                style={{ height: '42px', objectFit: 'contain' }}
                onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-primary)', letterSpacing: '-0.3px' }}>
                  Classement Officiel du Club
                </h2>
                <span style={{
                  background: 'rgba(255, 215, 0, 0.15)',
                  color: '#ffd700',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  border: '1px solid rgba(255, 215, 0, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Flame size={14} /> Saison 2026
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {currentClub.name} • Barème club : 3 pts / victoire (+1 pt vs Prestige), 1 pt / match joué, Podium : 🥇 +5 pts, 🥈 +3 pts, 🥉 +2 pts
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              background: 'rgba(0, 255, 170, 0.1)',
              color: 'var(--accent-primary)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 800,
              border: '1px solid rgba(0, 255, 170, 0.3)'
            }}>
              {allPlayers.length} Membres classés
            </span>
          </div>
        </div>
      )}

      {/* 3D-Styled Podium for Top 3 */}
      {podiumPlayers.length >= 2 && (
        <div style={{
          background: 'linear-gradient(180deg, rgba(10, 20, 35, 0.7) 0%, rgba(5, 8, 22, 0.85) 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(0, 255, 170, 0.2)',
          padding: compact ? '1rem 0.5rem 0.5rem' : '2rem 1.5rem 1rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle glow behind champion */}
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 255, 170, 0.12) 0%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none'
          }} />

          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: compact ? '0.6rem' : '1.5rem',
            position: 'relative',
            zIndex: 2,
            minHeight: compact ? '180px' : '240px'
          }}>
            {/* 2nd Place (Silver - Left) */}
            {p2 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                maxWidth: '160px'
              }}>
                <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                  <img
                    src={getPlayerAvatar(p2)}
                    alt={p2.name}
                    style={{
                      width: compact ? '52px' : '72px',
                      height: compact ? '52px' : '72px',
                      borderRadius: '50%',
                      border: '3px solid #cbd5e1',
                      objectFit: 'cover',
                      boxShadow: '0 0 20px rgba(203, 213, 225, 0.4)'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#94a3b8',
                    color: '#000',
                    fontWeight: 900,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    border: '2px solid #fff'
                  }}>
                    2
                  </div>
                </div>

                <span style={{ fontWeight: 800, fontSize: compact ? '0.8rem' : '0.95rem', textAlign: 'center', color: '#fff' }}>
                  {p2.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 800 }}>
                  {getPoints(p2)} pts
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {p2.stats.winRate}% Victoires
                </span>

                {/* Silver Pedestal */}
                <div style={{
                  width: '100%',
                  height: compact ? '65px' : '95px',
                  background: 'linear-gradient(180deg, rgba(148, 163, 184, 0.35) 0%, rgba(100, 116, 139, 0.15) 100%)',
                  border: '1px solid rgba(203, 213, 225, 0.4)',
                  borderBottom: 'none',
                  borderRadius: '12px 12px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.1)'
                }}>
                  <Medal size={compact ? 24 : 32} color="#cbd5e1" />
                </div>
              </div>
            )}

            {/* 1st Place (Gold - Center & Elevated) */}
            {p1 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1.2,
                maxWidth: '190px',
                zIndex: 5
              }}>
                <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                  <div style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10
                  }}>
                    <Crown size={compact ? 24 : 30} color="#ffd700" fill="#ffd700" style={{ filter: 'drop-shadow(0 2px 6px rgba(255, 215, 0, 0.7))' }} />
                  </div>
                  <img
                    src={getPlayerAvatar(p1)}
                    alt={p1.name}
                    style={{
                      width: compact ? '68px' : '92px',
                      height: compact ? '68px' : '92px',
                      borderRadius: '50%',
                      border: '4px solid #ffd700',
                      objectFit: 'cover',
                      boxShadow: '0 0 30px rgba(255, 215, 0, 0.5)'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#ffd700',
                    color: '#000',
                    fontWeight: 900,
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 10px rgba(255, 215, 0, 0.6)',
                    border: '2px solid #fff'
                  }}>
                    1
                  </div>
                </div>

                <span style={{ fontWeight: 900, fontSize: compact ? '0.95rem' : '1.15rem', textAlign: 'center', color: '#ffd700', letterSpacing: '-0.2px' }}>
                  {p1.name}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 900 }}>
                  {getPoints(p1)} pts
                </span>
                <span style={{ fontSize: '0.72rem', color: '#cbd5e1', marginBottom: '0.5rem', fontWeight: 600 }}>
                  {p1.stats.winRate}% Victoires ({p1.stats.tournamentsWon || 0} 🏆)
                </span>

                {/* Gold Pedestal */}
                <div style={{
                  width: '100%',
                  height: compact ? '95px' : '135px',
                  background: 'linear-gradient(180deg, rgba(234, 179, 8, 0.45) 0%, rgba(161, 98, 7, 0.2) 100%)',
                  border: '2px solid rgba(255, 215, 0, 0.6)',
                  borderBottom: 'none',
                  borderRadius: '16px 16px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 -4px 20px rgba(255, 215, 0, 0.2), inset 0 4px 12px rgba(255,255,255,0.2)'
                }}>
                  <Trophy size={compact ? 32 : 44} color="#ffd700" />
                </div>
              </div>
            )}

            {/* 3rd Place (Bronze - Right) */}
            {p3 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                maxWidth: '160px'
              }}>
                <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                  <img
                    src={getPlayerAvatar(p3)}
                    alt={p3.name}
                    style={{
                      width: compact ? '52px' : '72px',
                      height: compact ? '52px' : '72px',
                      borderRadius: '50%',
                      border: '3px solid #b45309',
                      objectFit: 'cover',
                      boxShadow: '0 0 20px rgba(180, 83, 9, 0.4)'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#b45309',
                    color: '#fff',
                    fontWeight: 900,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    border: '2px solid #fff'
                  }}>
                    3
                  </div>
                </div>

                <span style={{ fontWeight: 800, fontSize: compact ? '0.8rem' : '0.95rem', textAlign: 'center', color: '#fff' }}>
                  {p3.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 800 }}>
                  {getPoints(p3)} pts
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {p3.stats.winRate}% Victoires
                </span>

                {/* Bronze Pedestal */}
                <div style={{
                  width: '100%',
                  height: compact ? '50px' : '75px',
                  background: 'linear-gradient(180deg, rgba(180, 83, 9, 0.35) 0%, rgba(120, 53, 15, 0.15) 100%)',
                  border: '1px solid rgba(180, 83, 9, 0.5)',
                  borderBottom: 'none',
                  borderRadius: '12px 12px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.05)'
                }}>
                  <Award size={compact ? 22 : 28} color="#d97706" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.8rem',
        background: 'rgba(5, 8, 22, 0.6)',
        padding: '0.8rem 1.2rem',
        borderRadius: '14px',
        border: '1px solid var(--border-color)'
      }}>
        {/* Level Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterLevel('all')}
            style={{
              background: filterLevel === 'all' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: filterLevel === 'all' ? '#000' : 'var(--text-muted)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: filterLevel === 'all' ? '0 0 12px rgba(0, 255, 170, 0.35)' : 'none'
            }}
          >
            Tous ({allPlayers.length})
          </button>
          <button
            onClick={() => setFilterLevel('Prestige')}
            style={{
              background: filterLevel === 'Prestige' ? '#ffd700' : 'rgba(255,255,255,0.05)',
              color: filterLevel === 'Prestige' ? '#000' : 'var(--text-muted)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s',
              boxShadow: filterLevel === 'Prestige' ? '0 0 12px rgba(255, 215, 0, 0.4)' : 'none'
            }}
          >
            <Crown size={14} /> Prestige ({countPrestige})
          </button>
          <button
            onClick={() => setFilterLevel('Amateur')}
            style={{
              background: filterLevel === 'Amateur' ? '#38bdf8' : 'rgba(255,255,255,0.05)',
              color: filterLevel === 'Amateur' ? '#000' : 'var(--text-muted)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s',
              boxShadow: filterLevel === 'Amateur' ? '0 0 12px rgba(56, 189, 248, 0.4)' : 'none'
            }}
          >
            <Target size={14} /> Amateurs ({countAmateur})
          </button>
        </div>

        {/* Search Bar & Sort Toggle */}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} />
            <input
              type="text"
              placeholder="Chercher un joueur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 12px 6px 32px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none',
                width: '160px'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Trier par :</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '5px 8px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="points">Points Club</option>
              <option value="winRate">Win Rate %</option>
              <option value="wins">Victoires</option>
              <option value="tournamentsWon">Tournois 🏆</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leaderboard Table / Cards */}
      <div style={{
        background: 'rgba(5, 8, 22, 0.7)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: compact ? '360px' : '650px' }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                <th style={{ padding: '0.8rem 1rem', width: '50px', textAlign: 'center' }}>Rang</th>
                <th style={{ padding: '0.8rem 1rem' }}>Joueur</th>
                <th style={{ padding: '0.8rem 1rem' }}>Statut</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Matchs (V/D)</th>
                <th style={{ padding: '0.8rem 1rem', width: '160px' }}>Win Rate %</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Diff.</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Titres</th>
                <th style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedPlayers.map((player, index) => {
                const rank = index + 1;
                const points = getPoints(player);
                const winRate = player.stats.winRate || 0;
                const isPrestige = player.level === 'Prestige' || player.level === 'Confirmé';
                const isTop1 = rank === 1;
                const isTop2 = rank === 2;
                const isTop3 = rank === 3;

                return (
                  <tr
                    key={player.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isTop1
                        ? 'rgba(255, 215, 0, 0.05)'
                        : isTop2
                        ? 'rgba(203, 213, 225, 0.03)'
                        : isTop3
                        ? 'rgba(180, 83, 9, 0.03)'
                        : 'transparent',
                      transition: 'background 0.2s'
                    }}
                  >
                    {/* Rank */}
                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        fontWeight: 900,
                        fontSize: '0.85rem',
                        background: isTop1
                          ? 'linear-gradient(135deg, #ffd700, #b45309)'
                          : isTop2
                          ? 'linear-gradient(135deg, #e2e8f0, #64748b)'
                          : isTop3
                          ? 'linear-gradient(135deg, #d97706, #78350f)'
                          : 'rgba(255, 255, 255, 0.08)',
                        color: (isTop1 || isTop2) ? '#000' : '#fff',
                        boxShadow: isTop1 ? '0 0 10px rgba(255, 215, 0, 0.4)' : 'none'
                      }}>
                        {rank}
                      </span>
                    </td>

                    {/* Player Info */}
                    <td style={{ padding: '0.8rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <img
                          src={getPlayerAvatar(player)}
                          alt={player.name}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${isPrestige ? '#ffd700' : 'var(--accent-primary)'}`
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>
                            {player.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {player.clubId || currentClub.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Level / Status */}
                    <td style={{ padding: '0.8rem 1rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: isPrestige ? 'rgba(255, 215, 0, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: isPrestige ? '#ffd700' : '#38bdf8',
                        padding: '3px 9px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: `1px solid ${isPrestige ? 'rgba(255, 215, 0, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`
                      }}>
                        {isPrestige ? <Crown size={12} /> : <Target size={12} />}
                        {isPrestige ? 'PRESTIGE' : 'AMATEUR'}
                      </span>
                    </td>

                    {/* Matches */}
                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                        {player.stats.matchesPlayed}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--accent-primary)' }}>{player.stats.wins}V</span> - <span style={{ color: '#ff4444' }}>{player.stats.losses ?? (player.stats.matchesPlayed - player.stats.wins)}D</span>
                      </div>
                      {(player.stats.prestigeWins ?? 0) > 0 && (
                        <div
                          title={`${player.stats.prestigeWins} victoire(s) contre un joueur Prestige (+${player.stats.prestigeWins} pt bonus)`}
                          style={{
                            fontSize: '0.64rem',
                            color: '#ffd700',
                            fontWeight: 700,
                            marginTop: '2px'
                          }}
                        >
                          👑 +{player.stats.prestigeWins} vs Prestige
                        </div>
                      )}
                    </td>

                    {/* Win Rate Progress Bar */}
                    <td style={{ padding: '0.8rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{winRate}%</span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0, winRate))}%`,
                          height: '100%',
                          background: winRate >= 60 ? 'linear-gradient(90deg, #00ffaa, #00bfff)' : winRate >= 45 ? 'var(--accent-primary)' : '#ff8800',
                          boxShadow: '0 0 8px rgba(0, 255, 170, 0.4)'
                        }} />
                      </div>
                    </td>

                    {/* Frame Difference */}
                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: (player.stats.setDiff ?? 0) > 0 ? 'var(--accent-primary)' : (player.stats.setDiff ?? 0) < 0 ? '#ff4444' : 'var(--text-muted)'
                      }}>
                        {(player.stats.setDiff ?? 0) > 0 ? `+${player.stats.setDiff}` : player.stats.setDiff ?? 0}
                      </span>
                    </td>

                    {/* Tournaments Podiums (1st, 2nd, 3rd) */}
                    <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                      {((player.stats.tournamentsWon ?? 0) > 0 || (player.stats.tournamentsSecond ?? 0) > 0 || (player.stats.tournamentsThird ?? 0) > 0) ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                          {(player.stats.tournamentsWon ?? 0) > 0 && (
                            <span
                              title={`${player.stats.tournamentsWon}x 1er (+${(player.stats.tournamentsWon ?? 0) * 5} pts)`}
                              style={{ color: '#ffd700', fontWeight: 800, fontSize: '0.82rem' }}
                            >
                              🥇 {player.stats.tournamentsWon}
                            </span>
                          )}
                          {(player.stats.tournamentsSecond ?? 0) > 0 && (
                            <span
                              title={`${player.stats.tournamentsSecond}x 2ème (+${(player.stats.tournamentsSecond ?? 0) * 3} pts)`}
                              style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '0.82rem' }}
                            >
                              🥈 {player.stats.tournamentsSecond}
                            </span>
                          )}
                          {(player.stats.tournamentsThird ?? 0) > 0 && (
                            <span
                              title={`${player.stats.tournamentsThird}x 3ème (+${(player.stats.tournamentsThird ?? 0) * 2} pts)`}
                              style={{ color: '#f59e0b', fontWeight: 800, fontSize: '0.82rem' }}
                            >
                              🥉 {player.stats.tournamentsThird}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                      )}
                    </td>

                    {/* Club Points */}
                    <td
                      style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}
                      title={`Détail : ${player.stats.wins * 3} pts victoires + ${player.stats.prestigeWins || 0} pt(s) bonus vs Prestige + ${player.stats.matchesPlayed} pts matchs joués + ${((player.stats.tournamentsWon || 0) * 5) + ((player.stats.tournamentsSecond || 0) * 3) + ((player.stats.tournamentsThird || 0) * 2)} pts podium + ${Math.max(0, player.stats.setDiff || 0)} pts diff. manches`}
                    >
                      <span style={{
                        fontWeight: 900,
                        fontSize: '1.2rem',
                        color: 'var(--accent-primary)',
                        letterSpacing: '-0.5px'
                      }}>
                        {points}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>pts</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredAndSortedPlayers.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <User size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Aucun joueur trouvé avec ces filtres.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardView;
