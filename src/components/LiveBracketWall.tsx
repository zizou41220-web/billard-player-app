import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { getPlayerAvatar } from '../utils/avatar';
import { isByeMatch, isFinalStageMatch } from '../utils/bracket';
import { Match, Tournament } from '../types';

const STAGE_ORDER: string[] = [
  'round_of_128',
  'round_of_64',
  'round_of_32',
  'round_of_16',
  'quarter',
  'semi',
  'final'
];

const STAGE_TITLES: Record<string, string> = {
  round_of_128: '64èmes',
  round_of_64: '32èmes',
  round_of_32: '16èmes',
  round_of_16: '8èmes',
  quarter: 'Quarts',
  semi: 'Demi-finales',
  final: 'Finale',
  third_place: 'Petite finale'
};

type Column = {
  key: string;
  title: string;
  section: 'main' | 'loser';
  matches: Match[];
};

const sortMatches = (a: Match, b: Match) =>
  (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0) || a.id.localeCompare(b.id);

function buildColumns(finalMatches: Match[]): Column[] {
  const winnerCols = new Map<number, Column>();
  const loserCols = new Map<number, Column>();
  const grand: Match[] = [];

  finalMatches.forEach(m => {
    if (m.stage === 'third_place') {
      return;
    }
    if (m.bracketType === 'grand_final') {
      grand.push(m);
      return;
    }
    if (m.bracketType === 'loser') {
      const r = m.bracketRound ?? 0;
      if (!loserCols.has(r)) {
        loserCols.set(r, { key: `L${r}`, title: `Repêchage ${loserCols.size + 1}`, section: 'loser', matches: [] });
      }
      loserCols.get(r)!.matches.push(m);
      return;
    }
    const stageIdx = m.stage ? STAGE_ORDER.indexOf(m.stage) : -1;
    const order = stageIdx >= 0 ? stageIdx : 100 + (m.bracketRound ?? 0);
    if (!winnerCols.has(order)) {
      winnerCols.set(order, {
        key: `W${order}`,
        title: m.stage ? STAGE_TITLES[m.stage] || m.stage : `Tour ${m.bracketRound ?? '?'}`,
        section: 'main',
        matches: []
      });
    }
    winnerCols.get(order)!.matches.push(m);
  });

  const cols: Column[] = [];
  Array.from(winnerCols.keys())
    .sort((a, b) => a - b)
    .forEach(k => cols.push(winnerCols.get(k)!));
  if (grand.length > 0) cols.push({ key: 'GF', title: 'Grande Finale', section: 'main', matches: grand });
  Array.from(loserCols.keys())
    .sort((a, b) => a - b)
    .forEach((k, i) => {
      const c = loserCols.get(k)!;
      c.title = `Repêchage ${i + 1}`;
      cols.push(c);
    });

  cols.forEach(c => c.matches.sort(sortMatches));
  return cols;
}

/** Choisit le tournoi à afficher : en cours en priorité, sinon le plus récent avec phase finale. */
function pickTournament(tournaments: Record<string, Tournament>, matches: Record<string, Match>, forcedId?: string | null): Tournament | null {
  if (forcedId && tournaments[forcedId]) return tournaments[forcedId];
  const list = Object.values(tournaments).filter(t => t && t.matches && t.matches.some(id => matches[id] && isFinalStageMatch(matches[id])));
  if (list.length === 0) return null;
  const ongoing = list.filter(t => t.status === 'ongoing');
  const pool = ongoing.length > 0 ? ongoing : list;
  return pool[pool.length - 1];
}

interface LiveBracketWallProps {
  tournamentId?: string | null;
}

const MATCH_W = 210;
const MATCH_H = 64;

export const LiveBracketWall: React.FC<LiveBracketWallProps> = ({ tournamentId }) => {
  const { tournaments, matches, players } = useStore();

  const tournament = useMemo(() => pickTournament(tournaments, matches, tournamentId), [tournaments, matches, tournamentId]);

  const finalMatches = useMemo(() => {
    if (!tournament) return [] as Match[];
    return tournament.matches.map(id => matches[id]).filter((m): m is Match => Boolean(m) && isFinalStageMatch(m));
  }, [tournament, matches]);

  const columns = useMemo(() => buildColumns(finalMatches), [finalMatches]);
  const mainCols = columns.filter(c => c.section === 'main');
  const loserCols = columns.filter(c => c.section === 'loser');

  const thirdPlace = finalMatches.filter(m => m.stage === 'third_place');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [scale, setScale] = useState(1);
  const [links, setLinks] = useState<Array<{ id: string; d: string; done: boolean; live: boolean }>>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const matchById = useMemo(() => {
    const map: Record<string, Match> = {};
    finalMatches.forEach(m => { map[m.id] = m; });
    return map;
  }, [finalMatches]);

  useLayoutEffect(() => {
    const compute = () => {
      const content = contentRef.current;
      const container = containerRef.current;
      if (!content || !container) return;

      const cw = content.scrollWidth;
      const ch = content.scrollHeight;
      const s = Math.min(1, container.clientWidth / (cw + 8), container.clientHeight / (ch + 8));
      setScale(s > 0 ? s : 1);
      setSize({ w: cw, h: ch });

      const base = content.getBoundingClientRect();
      const currentScale = base.width / (cw || 1) || 1;
      const next: Array<{ id: string; d: string; done: boolean; live: boolean }> = [];

      finalMatches.forEach(m => {
        const targetId = m.nextMatchId;
        if (!targetId || !matchById[targetId]) return;
        const from = cardRefs.current[m.id];
        const to = cardRefs.current[targetId];
        if (!from || !to) return;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = (a.right - base.left) / currentScale;
        const y1 = (a.top + a.height / 2 - base.top) / currentScale;
        const x2 = (b.left - base.left) / currentScale;
        const y2 = (b.top + b.height / 2 - base.top) / currentScale;
        const mx = (x1 + x2) / 2;
        next.push({
          id: `${m.id}->${targetId}`,
          d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
          done: m.status === 'finished' && !isByeMatch(m),
          live: m.status === 'playing'
        });
      });
      setLinks(next);
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [finalMatches, matchById, columns.length]);

  // Petit rafraîchissement différé pour que la mise en page (polices, images) soit stabilisée
  const [, force] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => force(n => n + 1), 400);
    return () => clearTimeout(t);
  }, [tournament?.id]);

  if (!tournament || finalMatches.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CCFBF1', fontSize: '1.4rem', fontWeight: 700 }}>
        🎱 Le tableau final apparaîtra ici dès le lancement de la phase finale.
      </div>
    );
  }

  const renderPlayerRow = (pid: string, score: number, isWinner: boolean, showScore: boolean) => {
    const p = pid ? players[pid] : undefined;
    const isBye = pid.toUpperCase().includes('BYE');
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '50%',
        padding: '0 8px',
        background: isWinner ? 'linear-gradient(90deg, rgba(251,191,36,0.28), rgba(251,191,36,0.04))' : 'transparent',
        borderLeft: `3px solid ${isWinner ? '#FBBF24' : 'transparent'}`
      }}>
        {p ? (
          <img src={getPlayerAvatar(p)} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
        )}
        <span style={{
          flex: 1,
          minWidth: 0,
          fontSize: '0.78rem',
          fontWeight: isWinner ? 900 : 600,
          color: p ? (isWinner ? '#FDE68A' : '#fff') : 'rgba(204,251,241,0.45)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontStyle: p ? 'normal' : 'italic'
        }}>
          {p ? p.name : isBye ? 'Exempt' : 'À déterminer'}
        </span>
        {showScore && (
          <span style={{ fontWeight: 900, fontSize: '0.9rem', color: isWinner ? '#FBBF24' : '#CCFBF1', minWidth: '14px', textAlign: 'right' }}>
            {score}
          </span>
        )}
      </div>
    );
  };

  const renderMatch = (m: Match) => {
    const bye = isByeMatch(m);
    const live = m.status === 'playing';
    const finished = m.status === 'finished';
    const w1 = finished && (m.winnerId ? m.winnerId === m.player1Id : m.score1 > m.score2);
    const w2 = finished && (m.winnerId ? m.winnerId === m.player2Id : m.score2 > m.score1);
    return (
      <div
        key={m.id}
        ref={el => { cardRefs.current[m.id] = el; }}
        className={live ? 'bracket-card-live' : ''}
        style={{
          width: `${MATCH_W}px`,
          height: `${MATCH_H}px`,
          borderRadius: '10px',
          overflow: 'hidden',
          position: 'relative',
          background: bye ? 'rgba(7,46,42,0.35)' : 'linear-gradient(155deg, rgba(14,90,82,0.85), rgba(4,26,23,0.92))',
          border: live ? '1.5px solid #34d399' : '1px solid rgba(45,212,191,0.35)',
          opacity: bye ? 0.55 : 1,
          boxShadow: live ? '0 0 18px rgba(52,211,153,0.6)' : '0 4px 12px rgba(0,0,0,0.4)',
          boxSizing: 'border-box',
          flexShrink: 0
        }}
      >
        {renderPlayerRow(m.player1Id, m.score1, w1, !bye && (finished || live))}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        {renderPlayerRow(m.player2Id, m.score2, w2, !bye && (finished || live))}
        {live && (
          <span style={{
            position: 'absolute',
            top: '-1px',
            right: '-1px',
            background: '#34d399',
            color: '#04120f',
            fontSize: '0.55rem',
            fontWeight: 900,
            padding: '1px 6px',
            borderBottomLeftRadius: '8px',
            letterSpacing: '0.5px'
          }}>
            ● LIVE
          </span>
        )}
      </div>
    );
  };

  const renderColumn = (col: Column) => (
    <div key={col.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{
        fontSize: '0.72rem',
        fontWeight: 900,
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: col.key === 'GF' || col.matches.some(m => m.stage === 'final') ? '#FBBF24' : '#34D399',
        textShadow: '0 0 10px currentColor'
      }}>
        {col.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: '14px', flex: 1 }}>
        {col.matches.map(renderMatch)}
      </div>
    </div>
  );

  const renderRow = (cols: Column[], label?: string) => (
    <div>
      {label && (
        <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#a78bfa', letterSpacing: '2px', margin: '0 0 8px 4px', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '56px' }}>
        {cols.map(renderColumn)}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: size.w * scale || undefined, height: size.h * scale || undefined, position: 'relative' }}>
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'inline-flex',
            flexDirection: 'column',
            gap: '28px',
            padding: '8px 12px',
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          <svg
            width={size.w}
            height={size.h}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
          >
            <defs>
              <filter id="linkGlow">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {links.map(l => (
              <g key={l.id}>
                <path d={l.d} fill="none" stroke="rgba(45,212,191,0.28)" strokeWidth={2} />
                {(l.done || l.live) && (
                  <path
                    d={l.d}
                    fill="none"
                    stroke={l.live ? '#34d399' : '#FBBF24'}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    filter="url(#linkGlow)"
                    className="bracket-flow"
                  />
                )}
              </g>
            ))}
          </svg>

          {renderRow(mainCols)}
          {thirdPlace.length > 0 && renderRow([{ key: 'T', title: 'Petite finale', section: 'main', matches: thirdPlace }])}
          {loserCols.length > 0 && renderRow(loserCols, 'Tableau de repêchage')}
        </div>
      </div>
    </div>
  );
};

export default LiveBracketWall;
