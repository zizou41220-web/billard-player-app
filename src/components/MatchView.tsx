import React from 'react';
import { useStore } from '../store';
import { Flag, Minus, Plus, Radio } from 'lucide-react';
import { getMatchScoringRules } from '../utils/rules';

const MatchView: React.FC = () => {
  const { players, matches, activeMatchId, updateScore, finishMatch, tables, tournaments } = useStore();

  if (!activeMatchId) return null;

  const match = matches[activeMatchId];
  const table = match.tableId ? tables[match.tableId] : null;
  const streamUrl = match.liveStreamUrl || table?.liveStreamUrl;

  const p1 = match.player1Id;
  const p2 = match.player2Id;

  const score1 = match.score1;
  const score2 = match.score2;

  const tournament = match.tournamentId ? tournaments[match.tournamentId] : null;
  const { maxSets: maxScore, isWinningSets, minScore1, minScore2 } = getMatchScoringRules(match, tournament, players);

  const canFinish = isWinningSets
    ? (match.score1 >= maxScore || match.score2 >= maxScore)
    : ((match.score1 + match.score2) >= maxScore);

  const handleScore = (playerId: string, delta: number) => {
    // Prevent exceeding max score for fixed sets, or winning sets
    if (delta > 0) {
      if (isWinningSets && (score1 >= maxScore || score2 >= maxScore)) return;
      if (!isWinningSets && (score1 + score2) >= maxScore) return;
    }
    if (delta < 0) {
      if (playerId === p1 && score1 <= minScore1) return;
      if (playerId === p2 && score2 <= minScore2) return;
    }
    updateScore(playerId, delta);
  };

  const handleFinishMatch = () => {
    finishMatch();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Top Bar */}
      <div style={{ padding: '1.2rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: 'var(--shadow-neon)' }} />
          <span style={{ fontWeight: 800, letterSpacing: '1px', fontSize: '0.85rem' }}>EN DIRECT</span>
          {match.stage && match.stage !== 'qualif' && (
            <span style={{
              background: 'rgba(255, 215, 0, 0.2)',
              color: '#ffd700',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 800,
              border: '1px solid rgba(255, 215, 0, 0.4)',
              marginLeft: '0.3rem'
            }}>
              {match.stage === 'final' ? '🏆 FINALE' : match.stage === 'semi' ? '⚔️ DEMI-FINALE' : '🎯 1/4 DE FINALE'}
            </span>
          )}
          {(Boolean(match.handicapP1) || Boolean(match.handicapP2)) && (
            <span style={{
              background: 'rgba(0, 255, 170, 0.15)',
              color: 'var(--accent-primary)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 800,
              border: '1px solid rgba(0, 255, 170, 0.35)',
              marginLeft: '0.3rem'
            }}>
              Handicap actif
            </span>
          )}
          {streamUrl && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: '#ff2244',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 0 10px rgba(255, 34, 68, 0.4)',
                marginLeft: '0.3rem'
              }}
            >
              <Radio size={12} /> Live Vidéo
            </a>
          )}
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>
          {table?.name || (table?.number ? `Table ${table.number}` : 'Billard')}
        </div>
      </div>

      {/* Player 2 Zone (Top half) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '200px' }}>
        <div style={{ position: 'absolute', top: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '1.05rem' }}>
            {players[p2]?.name}
          </span>
          {(players[p2]?.level === 'Prestige' || players[p2]?.level === 'Confirmé') ? (
            <span style={{ fontSize: '0.68rem', background: 'rgba(255, 215, 0, 0.2)', color: '#ffd700', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(255, 215, 0, 0.4)' }}>
              👑 Prestige
            </span>
          ) : (
            <span style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
              Amateur
            </span>
          )}
          {Boolean(match.handicapP2 && match.handicapP2 > 0) && (
            <span style={{ fontSize: '0.68rem', background: 'rgba(0, 255, 170, 0.2)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid var(--accent-primary)' }}>
              +{match.handicapP2} Handicap
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <button className="btn-surface" onClick={() => handleScore(p2, -1)} style={{ width: '50px', height: '50px', borderRadius: '50%', padding: 0 }}>
            <Minus size={24} />
          </button>

          <span style={{ fontSize: '6rem', fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1, width: '100px', textAlign: 'center' }}>
            {score2}
          </span>

          <button className="btn-surface" onClick={() => handleScore(p2, 1)} style={{ width: '50px', height: '50px', borderRadius: '50%', padding: 0 }}>
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '2px', background: 'var(--border-color)', margin: '0 2rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-color)', padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>VS</div>
      </div>

      {/* Player 1 Zone (Bottom half) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '200px' }}>
        <div style={{ position: 'absolute', bottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 800, fontSize: '1.15rem' }}>
            {players[p1]?.name}
          </span>
          {(players[p1]?.level === 'Prestige' || players[p1]?.level === 'Confirmé') ? (
            <span style={{ fontSize: '0.68rem', background: 'rgba(255, 215, 0, 0.2)', color: '#ffd700', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(255, 215, 0, 0.4)' }}>
              👑 Prestige
            </span>
          ) : (
            <span style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
              Amateur
            </span>
          )}
          {Boolean(match.handicapP1 && match.handicapP1 > 0) && (
            <span style={{ fontSize: '0.68rem', background: 'rgba(0, 255, 170, 0.2)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid var(--accent-primary)' }}>
              +{match.handicapP1} Handicap
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <button className="btn-surface" onClick={() => handleScore(p1, -1)} style={{ width: '60px', height: '60px', borderRadius: '50%', padding: 0 }}>
            <Minus size={32} />
          </button>

          <span className="text-gradient" style={{ fontSize: '7rem', fontWeight: 800, lineHeight: 1, width: '120px', textAlign: 'center' }}>
            {score1}
          </span>

          <button className="btn-surface" onClick={() => handleScore(p1, 1)} style={{ width: '60px', height: '60px', borderRadius: '50%', padding: 0 }}>
            <Plus size={32} />
          </button>
        </div>
      </div>

      {/* Finish Match Button */}
      <div style={{ padding: '1.5rem', paddingBottom: 'env(safe-area-inset-bottom, 1.5rem)', flexShrink: 0, marginTop: 'auto' }}>
        <button
          className={`btn ${canFinish ? 'btn-neon' : 'btn-outline'}`}
          onClick={canFinish ? handleFinishMatch : undefined}
          style={{
            width: '100%',
            justifyContent: 'center',
            color: canFinish ? '#000' : 'var(--text-muted)',
            borderColor: canFinish ? 'transparent' : 'var(--border-color)',
            opacity: canFinish ? 1 : 0.5,
            cursor: canFinish ? 'pointer' : 'not-allowed'
          }}
        >
          <Flag size={20} /> {canFinish ? "Terminer le match" : `Score incomplet (${isWinningSets ? `1er à ${maxScore}` : `${maxScore} manches au total`})`}
        </button>
      </div>
    </div>
  );
};

export default MatchView;
