import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { getPlayerAvatar } from '../utils/avatar';
import { computeAllPlayersStats, calculatePlayerClubPoints } from '../utils/playerStats';
import {
  getPlayerHistory,
  getFormCurve,
  getH2H,
  getBadges,
  getCurrentStreak,
  getBestWinStreak
} from '../utils/matchInsights';

/** Compteur animé (count-up) pour les indicateurs clés. */
const CountUp: React.FC<{ value: number; suffix?: string; duration?: number }> = ({ value, suffix = '', duration = 900 }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display}{suffix}</>;
};

const KpiTile: React.FC<{ label: string; value: number; suffix?: string; color: string }> = ({ label, value, suffix, color }) => (
  <div style={{
    background: 'rgba(0, 0, 0, 0.25)',
    border: `1px solid ${color}55`,
    borderRadius: '12px',
    padding: '0.8rem 0.5rem',
    textAlign: 'center',
    boxShadow: `0 0 14px ${color}22`
  }}>
    <div style={{ fontSize: '1.7rem', fontWeight: 900, color, lineHeight: 1.1 }}>
      <CountUp value={value} suffix={suffix} />
    </div>
    <div style={{ fontSize: '0.68rem', color: '#CCFBF1', fontWeight: 700, marginTop: '4px', letterSpacing: '0.5px' }}>{label}</div>
  </div>
);

const FormChart: React.FC<{ points: Array<{ index: number; rate: number; won: boolean }> }> = ({ points }) => {
  const W = 320;
  const H = 110;
  const padX = 14;
  const padY = 12;
  if (points.length < 2) {
    return (
      <div style={{ color: '#CCFBF1', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem 0', opacity: 0.8 }}>
        Pas encore assez de matchs pour tracer la courbe de forme.
      </div>
    );
  }
  const xs = (i: number) => padX + (i * (W - padX * 2)) / (points.length - 1);
  const ys = (rate: number) => padY + ((100 - rate) * (H - padY * 2)) / 100;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.rate).toFixed(1)}`).join(' ');
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${H - padY} L${xs(0).toFixed(1)},${H - padY} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="formFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <filter id="formGlow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={padX} x2={W - padX} y1={ys(v)} y2={ys(v)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 4" />
          <text x={2} y={ys(v) + 3} fontSize="8" fill="rgba(204,251,241,0.7)">{v}%</text>
        </g>
      ))}
      <path d={area} fill="url(#formFill)" />
      <path
        d={line}
        fill="none"
        stroke="#34d399"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter="url(#formGlow)"
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'drawLine 1.2s ease-out forwards' }}
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xs(i)}
          cy={ys(p.rate)}
          r={3.4}
          fill={p.won ? '#34d399' : '#f87171'}
          stroke="#04120f"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
};

interface PlayerStatsDashboardProps {
  playerId: string;
}

export const PlayerStatsDashboard: React.FC<PlayerStatsDashboardProps> = ({ playerId }) => {
  const { players, matches, tournaments } = useStore();

  const computed = useMemo(() => computeAllPlayersStats(players, matches, tournaments), [players, matches, tournaments]);
  const player = computed[playerId] || players[playerId];
  const history = useMemo(() => getPlayerHistory(playerId, matches, players), [playerId, matches, players]);
  const curve = useMemo(() => getFormCurve(history, 15), [history]);
  const h2h = useMemo(() => getH2H(history).slice(0, 5), [history]);
  const badges = useMemo(() => (player ? getBadges(history, player) : []), [history, player]);
  const streak = getCurrentStreak(history);
  const bestStreak = getBestWinStreak(history);

  if (!player) return null;

  const stats = player.stats;
  const isPrestige = player.level === 'Prestige' || player.level === 'Confirmé';
  const points = stats.points ?? calculatePlayerClubPoints(stats);
  const setsWon = stats.setsWon ?? 0;
  const setsLost = stats.setsLost ?? 0;
  const setsTotal = setsWon + setsLost;
  const setRatio = setsTotal > 0 ? Math.round((setsWon / setsTotal) * 100) : 0;
  const last10 = history.slice(-10);

  const sectionTitle: React.CSSProperties = {
    fontSize: '0.78rem',
    fontWeight: 800,
    letterSpacing: '1px',
    color: '#34D399',
    margin: '0 0 0.6rem 0',
    textTransform: 'uppercase'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', color: '#fff' }}>
      {/* En-tête joueur */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img
          src={getPlayerAvatar(player)}
          alt={player.name}
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: `3px solid ${isPrestige ? '#ffd700' : '#34d399'}`,
            boxShadow: `0 0 20px ${isPrestige ? 'rgba(255,215,0,0.4)' : 'rgba(52,211,153,0.4)'}`
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{player.name}</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '3px' }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: isPrestige ? '#ffd700' : '#34d399',
              background: isPrestige ? 'rgba(255,215,0,0.15)' : 'rgba(52,211,153,0.15)',
              border: `1px solid ${isPrestige ? 'rgba(255,215,0,0.4)' : 'rgba(52,211,153,0.4)'}`,
              padding: '1px 8px',
              borderRadius: '8px'
            }}>
              {isPrestige ? '👑 Prestige' : '🎯 Amateur'}
            </span>
            {(player.clubName || stats.clubName) && (
              <span style={{ fontSize: '0.74rem', color: '#CCFBF1' }}>{player.clubName || stats.clubName}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', marginRight: '1.6rem' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#FBBF24', lineHeight: 1 }}>
            <CountUp value={points} />
          </div>
          <div style={{ fontSize: '0.68rem', color: '#CCFBF1', fontWeight: 700 }}>PTS CLUB</div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' }}>
        <KpiTile label="MATCHS" value={stats.matchesPlayed} color="#38bdf8" />
        <KpiTile label="VICTOIRES" value={stats.wins} color="#34d399" />
        <KpiTile label="WIN RATE" value={stats.winRate} suffix="%" color="#FBBF24" />
        <KpiTile label="MEILLEURE SÉRIE" value={bestStreak} color="#fb923c" />
      </div>

      {/* Courbe de forme */}
      <div>
        <h4 style={sectionTitle}>📈 Courbe de forme (taux de victoire cumulé)</h4>
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '0.8rem', border: '1px solid rgba(52,211,153,0.2)' }}>
          <FormChart points={curve} />
          {last10.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', color: '#CCFBF1', marginRight: '4px' }}>10 derniers :</span>
              {last10.map(h => (
                <span key={h.matchId} title={`${h.setsFor}-${h.setsAgainst}`} style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  color: '#04120f',
                  background: h.won ? '#34d399' : '#f87171'
                }}>
                  {h.won ? 'V' : 'D'}
                </span>
              ))}
              {streak.type && (
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 800, color: streak.type === 'W' ? '#34d399' : '#f87171' }}>
                  Série en cours : {streak.length} {streak.type === 'W' ? 'victoire(s)' : 'défaite(s)'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ratio de manches */}
      <div>
        <h4 style={sectionTitle}>🎱 Ratio de manches</h4>
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '0.8rem', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>
            <span style={{ color: '#34d399' }}>{setsWon} gagnées</span>
            <span style={{ color: '#CCFBF1' }}>{setRatio}%</span>
            <span style={{ color: '#f87171' }}>{setsLost} perdues</span>
          </div>
          <div style={{ display: 'flex', height: '10px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(248,113,113,0.5)' }}>
            <div style={{
              width: `${setRatio}%`,
              background: 'linear-gradient(90deg, #10b981, #34d399)',
              boxShadow: '0 0 10px #34d399',
              transition: 'width 1s ease-out'
            }} />
          </div>
        </div>
      </div>

      {/* Face à face */}
      <div>
        <h4 style={sectionTitle}>⚔️ Face à face (adversaires les plus rencontrés)</h4>
        {h2h.length === 0 ? (
          <div style={{ color: '#CCFBF1', fontSize: '0.8rem', opacity: 0.8 }}>Aucun match terminé pour le moment.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {h2h.map(row => {
              const opp = players[row.opponentId];
              const pct = Math.round((row.wins / row.played) * 100);
              return (
                <div key={row.opponentId} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '0.6rem',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '10px',
                  padding: '0.5rem 0.7rem',
                  border: '1px solid rgba(255,255,255,0.07)'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {opp?.name || 'Joueur'}
                    </div>
                    <div style={{ display: 'flex', height: '6px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(248,113,113,0.55)', marginTop: '4px' }}>
                      <div style={{ width: `${pct}%`, background: '#34d399' }} />
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '0.95rem', textAlign: 'right' }}>
                    <span style={{ color: '#34d399' }}>{row.wins}</span>
                    <span style={{ color: '#CCFBF1' }}> - </span>
                    <span style={{ color: '#f87171' }}>{row.losses}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Badges */}
      <div>
        <h4 style={sectionTitle}>🏅 Badges</h4>
        {badges.length === 0 ? (
          <div style={{ color: '#CCFBF1', fontSize: '0.8rem', opacity: 0.8 }}>
            Pas encore de badge : enchaîne les victoires pour en débloquer !
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {badges.map(b => (
              <span key={b.id} title={b.description} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 11px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 800,
                color: b.color,
                background: `${b.color}1f`,
                border: `1px solid ${b.color}66`,
                boxShadow: `0 0 12px ${b.color}33`
              }}>
                <span>{b.icon}</span>{b.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface PlayerStatsModalProps {
  playerId: string;
  onClose: () => void;
}

export const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ playerId, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(0, 8, 6, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="stats-modal-pop"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '92vh',
          overflowY: 'auto',
          position: 'relative',
          padding: '1.5rem',
          borderRadius: '18px',
          background: 'linear-gradient(155deg, rgba(14, 90, 82, 0.96) 0%, rgba(4, 26, 23, 0.98) 100%)',
          border: '1.5px solid rgba(45, 212, 191, 0.5)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 30px rgba(16,185,129,0.25)'
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={16} />
        </button>
        <PlayerStatsDashboard playerId={playerId} />
      </div>
    </div>
  );
};

export default PlayerStatsDashboard;
