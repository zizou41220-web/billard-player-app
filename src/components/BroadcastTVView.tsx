import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { getPlayerAvatar } from '../utils/avatar';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMatchScoringRules } from '../utils/rules';
import { isByeMatch, isFinalStageMatch } from '../utils/bracket';
import { extractExternalVideoFromStreamUrl, extractVdoRoomFromStreamUrl, formatEmbedVideoUrl } from '../utils/video';
import MatchTimerBadge from './MatchTimerBadge';
import LiveBracketWall from './LiveBracketWall';
import { Match, Player } from '../types';

type Scene = 'live' | 'bracket';

interface BroadcastTVViewProps {
  sceneParam?: string | null;
  tableParam?: string | null;
  tournamentParam?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  qualif: 'Qualifications',
  round_of_128: '64èmes de finale',
  round_of_64: '32èmes de finale',
  round_of_32: '16èmes de finale',
  round_of_16: '8èmes de finale',
  quarter: 'Quart de finale',
  semi: 'Demi-finale',
  final: 'GRANDE FINALE',
  third_place: 'Petite finale'
};

const LIVE_SCENE_MS = 20000;
const BRACKET_SCENE_MS = 25000;
const FEATURE_ROTATE_MS = 10000;

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, letterSpacing: '1px' }}>
      {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
};

/** Score avec animation de rebond à chaque changement. */
const BroadcastScore: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const prev = useRef(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setBump(true);
      const t = setTimeout(() => setBump(false), 500);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <div
      className={bump ? 'animate-score-bump' : ''}
      style={{
        minWidth: '88px',
        textAlign: 'center',
        fontSize: 'clamp(2.6rem, 5.5vw, 4.6rem)',
        fontWeight: 900,
        lineHeight: 1,
        color: '#fff',
        textShadow: `0 2px 16px ${color}66`,
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {value}
    </div>
  );
};

const PlayerBlock: React.FC<{
  player?: Player;
  color: string;
  align: 'left' | 'right';
  handicap?: number;
}> = ({ player, color, align, handicap }) => {
  const isPrestige = player?.level === 'Prestige' || player?.level === 'Confirmé';
  const reverse = align === 'right';
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: reverse ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: '0.9rem',
      textAlign: reverse ? 'right' : 'left'
    }}>
      {player && (
        <img
          src={getPlayerAvatar(player)}
          alt={player.name}
          style={{
            width: 'clamp(54px, 6vw, 82px)',
            height: 'clamp(54px, 6vw, 82px)',
            borderRadius: '50%',
            objectFit: 'cover',
            border: `2.5px solid ${isPrestige ? '#ffd700' : color}`,
            boxShadow: `0 0 14px ${color}44`,
            flexShrink: 0
          }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 'clamp(1.05rem, 2vw, 1.75rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {player?.name || 'À déterminer'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '6px', flexWrap: 'wrap', justifyContent: reverse ? 'flex-end' : 'flex-start' }}>
          <span style={{
            fontSize: 'clamp(0.7rem, 1.1vw, 1rem)',
            fontWeight: 800,
            padding: '2px 10px',
            borderRadius: '8px',
            color: isPrestige ? '#ffd700' : color,
            background: isPrestige ? 'rgba(255,215,0,0.15)' : `${color}22`,
            border: `1px solid ${isPrestige ? 'rgba(255,215,0,0.5)' : `${color}77`}`
          }}>
            {isPrestige ? '👑 PRESTIGE' : '🎯 AMATEUR'}
          </span>
          {player && player.stats && player.stats.matchesPlayed > 0 && (
            <span style={{ fontSize: 'clamp(0.7rem, 1.1vw, 1rem)', fontWeight: 700, color: '#CCFBF1', padding: '2px 8px' }}>
              {player.stats.winRate}% victoires
            </span>
          )}
          {Boolean(handicap) && (
            <span style={{
              fontSize: 'clamp(0.7rem, 1.1vw, 1rem)',
              fontWeight: 900,
              padding: '2px 10px',
              borderRadius: '8px',
              color: '#04120f',
              background: '#FBBF24'
            }}>
              +{handicap} AVANCE
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const P1_COLOR = '#10b981';
const P2_COLOR = '#38bdf8';

const BroadcastTVView: React.FC<BroadcastTVViewProps> = ({ sceneParam, tableParam, tournamentParam }) => {
  const { players, matches, tables, tournaments, currentClub } = useStore();

  const forcedScene: Scene | null = sceneParam === 'live' || sceneParam === 'bracket' ? sceneParam : null;

  const activeTournament = useMemo(() => {
    if (tournamentParam && tournaments[tournamentParam]) {
      return tournaments[tournamentParam];
    }
    const ongoing = Object.values(tournaments).find(t => t && t.status === 'ongoing');
    if (ongoing) return ongoing;
    const list = Object.values(tournaments).filter(Boolean);
    return list.length > 0 ? list[list.length - 1] : null;
  }, [tournaments, tournamentParam]);

  const belongsToActiveTournament = (m: Match) => {
    if (!activeTournament) return true;
    if (m.tournamentId) return m.tournamentId === activeTournament.id;
    return Array.isArray(activeTournament.matches) && activeTournament.matches.includes(m.id);
  };

  const playingMatches = useMemo(() => {
    return Object.values(matches)
      .filter(m => m.status === 'playing' && !isByeMatch(m) && belongsToActiveTournament(m) && (!tableParam || m.tableId === tableParam))
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  }, [matches, tableParam, activeTournament]);

  const hasBracket = useMemo(() => {
    if (activeTournament) {
      return Boolean(activeTournament.matches?.some(id => matches[id] && isFinalStageMatch(matches[id])));
    }
    return false;
  }, [activeTournament, matches]);

  const [scene, setScene] = useState<Scene>(forcedScene || 'live');
  const [featuredIdx, setFeaturedIdx] = useState(0);

  // Rotation automatique des scènes
  useEffect(() => {
    if (forcedScene) {
      setScene(forcedScene);
      return;
    }
    if (!hasBracket) {
      setScene('live');
      return;
    }
    const delay = scene === 'live' ? LIVE_SCENE_MS : BRACKET_SCENE_MS;
    const t = setTimeout(() => setScene(s => (s === 'live' ? 'bracket' : 'live')), delay);
    return () => clearTimeout(t);
  }, [scene, hasBracket, forcedScene]);

  // Rotation du match mis en avant
  useEffect(() => {
    if (playingMatches.length <= 1) {
      setFeaturedIdx(0);
      return;
    }
    const i = setInterval(() => setFeaturedIdx(n => (n + 1) % playingMatches.length), FEATURE_ROTATE_MS);
    return () => clearInterval(i);
  }, [playingMatches.length]);

  const featured: Match | undefined = playingMatches[featuredIdx % Math.max(1, playingMatches.length)];
  const others = playingMatches.filter(m => m.id !== featured?.id);

  const featuredVideoSrc = useMemo(() => {
    if (!featured) return '';
    const table = featured.tableId ? tables[featured.tableId] : undefined;
    const raw = featured.liveStreamUrl || table?.liveStreamUrl;
    if (!raw) return '';
    const ext = extractExternalVideoFromStreamUrl(raw);
    if (ext) return formatEmbedVideoUrl(ext);
    const vdo = extractVdoRoomFromStreamUrl(raw);
    if (vdo) return `https://vdo.ninja/?view=${encodeURIComponent(vdo)}&cleanoutput&autoplay&muted`;
    return '';
  }, [featured, tables]);

  const waitingMatches = useMemo(() => {
    return Object.values(matches)
      .filter(m => m.status === 'pending' && !isByeMatch(m) && belongsToActiveTournament(m) && m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
      .slice(0, 6);
  }, [matches, players, activeTournament]);

  const tickerItems = useMemo(() => {
    const finished = Object.values(matches)
      .filter(m => m.status === 'finished' && !isByeMatch(m) && belongsToActiveTournament(m) && players[m.player1Id] && players[m.player2Id])
      .sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0))
      .slice(0, 8)
      .map(m => `✅ ${players[m.player1Id].name} ${m.score1} - ${m.score2} ${players[m.player2Id].name}`);
    const upcoming = waitingMatches.slice(0, 4).map(m => `⏳ À suivre : ${players[m.player1Id].name} vs ${players[m.player2Id].name}`);
    return [...finished, ...upcoming];
  }, [matches, players, waitingMatches, activeTournament]);

  const tableLabel = (m: Match) => {
    const t = m.tableId ? tables[m.tableId] : undefined;
    return t ? (t.name || `Billard ${t.number}`) : 'Billard';
  };

  const stageLabel = (m: Match) => {
    if (m.poolName) return m.poolName;
    return m.stage ? STAGE_LABELS[m.stage] || m.stage : 'Match';
  };

  const renderFeatured = (m: Match) => {
    const tournament = m.tournamentId ? tournaments[m.tournamentId] : null;
    const rules = getMatchScoringRules(m, tournament, players);
    const p1 = players[m.player1Id];
    const p2 = players[m.player2Id];
    const isFinal = m.stage === 'final';
    return (
      <div key={m.id} className="broadcast-enter" style={{ width: '100%', maxWidth: '1160px', margin: '0 auto' }}>
        {/* Bandeau supérieur */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.7rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#dc2626',
            color: '#fff',
            fontWeight: 900,
            padding: '4px 12px',
            borderRadius: '6px',
            letterSpacing: '1.5px',
            fontSize: 'clamp(0.72rem, 1.1vw, 0.92rem)'
          }}>
            <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            EN DIRECT
          </span>
          <span style={{
            fontWeight: 800,
            color: isFinal ? '#04120f' : '#FBBF24',
            background: isFinal ? '#FBBF24' : 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.45)',
            padding: '4px 12px',
            borderRadius: '6px',
            fontSize: 'clamp(0.72rem, 1.1vw, 0.92rem)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            {stageLabel(m)}
          </span>
          <span style={{
            fontWeight: 700,
            color: '#CCFBF1',
            background: 'rgba(255,255,255,0.06)',
            padding: '4px 12px',
            borderRadius: '6px',
            fontSize: 'clamp(0.72rem, 1.1vw, 0.92rem)'
          }}>
            🎱 {tableLabel(m)}
          </span>
        </div>

        {/* Scoreboard principal */}
        <div
          className={isFinal ? 'shimmer-gold-border' : ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: 'clamp(0.85rem, 1.6vw, 1.35rem) clamp(1rem, 2vw, 1.8rem)',
            borderRadius: '18px',
            background: 'linear-gradient(90deg, rgba(16,185,129,0.14) 0%, rgba(4,18,16,0.88) 32%, rgba(4,18,16,0.88) 68%, rgba(56,189,248,0.14) 100%)',
            border: '1px solid rgba(45,212,191,0.35)',
            boxShadow: '0 14px 36px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <PlayerBlock player={p1} color={P1_COLOR} align="left" handicap={m.handicapP1} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <BroadcastScore value={m.score1} color={P1_COLOR} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: 'clamp(0.85rem, 1.4vw, 1.2rem)', fontWeight: 900, color: '#FBBF24' }}>VS</span>
              <MatchTimerBadge
                startTime={m.startTime}
                durationMinutes={rules.durationMinutes ?? 0}
                status={m.status}
                size="md"
                showElapsedWhenUnlimited
              />
            </div>
            <BroadcastScore value={m.score2} color={P2_COLOR} />
          </div>
          <PlayerBlock player={p2} color={P2_COLOR} align="right" handicap={m.handicapP2} />
        </div>

        {/* Pied : format */}
        <div style={{ textAlign: 'center', marginTop: '0.75rem', color: 'rgba(204,251,241,0.85)', fontWeight: 700, fontSize: 'clamp(0.78rem, 1.1vw, 0.98rem)', letterSpacing: '0.8px' }}>
          {rules.formatLabel.toUpperCase()}
          {activeTournament ? ` • ${activeTournament.name}` : ''}
        </div>
      </div>
    );
  };

  const renderIdle = () => (
    <div className="broadcast-enter" style={{ textAlign: 'center', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, color: '#fff' }}>🎱 En attente du prochain match</div>
      {waitingMatches.length > 0 && (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ color: '#34D399', fontWeight: 900, letterSpacing: '2px' }}>À SUIVRE</div>
          {waitingMatches.map(m => (
            <div key={m.id} style={{
              padding: '0.8rem 1.2rem',
              borderRadius: '12px',
              background: 'rgba(14,90,82,0.5)',
              border: '1px solid rgba(45,212,191,0.4)',
              fontSize: 'clamp(1rem, 2vw, 1.6rem)',
              fontWeight: 800,
              color: '#fff'
            }}>
              {players[m.player1Id].name} <span style={{ color: '#FBBF24' }}>vs</span> {players[m.player2Id].name}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
      overflow: 'hidden',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(16,185,129,0.28) 0%, rgba(3,8,7,1) 70%), #030807'
    }}>
      <div className="broadcast-grid" />

      {/* En-tête */}
      <header style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.8rem 2rem',
        borderBottom: '2px solid rgba(45,212,191,0.4)',
        background: 'rgba(4,26,23,0.85)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#fff', padding: '4px 9px', borderRadius: '10px', display: 'flex' }}>
            <img
              src={getClubLogoUrl(currentClub.logoUrl)}
              alt={currentClub.name}
              style={{ height: '38px', objectFit: 'contain' }}
              onError={e => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            background: 'linear-gradient(90deg, #FBBF24, #34D399)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {currentClub.name}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          {activeTournament && (
            <span style={{ color: '#34D399', fontWeight: 800, fontSize: '1.05rem' }}>🏆 {activeTournament.name}</span>
          )}
          {!forcedScene && hasBracket && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['live', 'bracket'] as Scene[]).map(s => (
                <span key={s} style={{
                  width: s === scene ? '26px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: s === scene ? '#FBBF24' : 'rgba(255,255,255,0.25)',
                  transition: 'all 0.4s'
                }} />
              ))}
            </div>
          )}
          <Clock />
        </div>
      </header>

      {/* Scène */}
      <main style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, padding: '0.85rem 2rem', display: 'flex', flexDirection: 'column' }}>
        {scene === 'live' ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: featured ? 'flex-start' : 'center', gap: '0.9rem' }}>
            {featured ? renderFeatured(featured) : renderIdle()}

            {/* Flux Vidéo en Direct si la table ou le match a une caméra configurée */}
            {featured && featuredVideoSrc && (
              <div style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                maxWidth: '1160px',
                margin: '0 auto',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#000',
                border: '1px solid rgba(45,212,191,0.35)',
                boxShadow: '0 14px 40px rgba(0,0,0,0.6)',
                position: 'relative'
              }}>
                <iframe
                  src={featuredVideoSrc}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; camera; microphone"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none'
                  }}
                  title="Direct Vidéo Broadcast TV"
                />
              </div>
            )}

            {others.length > 0 && (
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                {others.map(m => (
                  <div key={m.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.7rem',
                    padding: '0.45rem 0.95rem',
                    borderRadius: '12px',
                    background: 'rgba(14,90,82,0.5)',
                    border: '1px solid rgba(45,212,191,0.35)',
                    fontWeight: 800,
                    fontSize: '0.95rem'
                  }}>
                    <span style={{ color: '#FBBF24' }}>{tableLabel(m)}</span>
                    <span>{players[m.player1Id]?.name}</span>
                    <span style={{ color: '#34d399', fontWeight: 900 }}>{m.score1} - {m.score2}</span>
                    <span>{players[m.player2Id]?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="broadcast-enter" style={{ flex: 1, minHeight: 0 }}>
            <LiveBracketWall tournamentId={tournamentParam} />
          </div>
        )}
      </main>

      {/* Bandeau défilant */}
      {tickerItems.length > 0 && (
        <footer style={{
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          background: 'rgba(7, 46, 41, 0.92)',
          borderTop: '1px solid rgba(45, 212, 191, 0.35)',
          padding: '0.45rem 0'
        }}>
          <div className="broadcast-ticker" style={{ display: 'inline-block', fontWeight: 700, fontSize: '0.94rem', color: '#CCFBF1' }}>
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} style={{ margin: '0 2rem' }}>{item}</span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
};

export default BroadcastTVView;
