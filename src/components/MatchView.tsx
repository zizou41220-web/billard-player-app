import React from 'react';
import { useStore } from '../store';
import { Flag, Minus, Plus } from 'lucide-react';

const MatchView: React.FC = () => {
  const { players, matches, activeMatchId, updateScore, finishMatch, tables } = useStore();
  
  if (!activeMatchId) return null;
  
  const match = matches[activeMatchId];
  const table = match.tableId ? tables[match.tableId] : null;
  
  const p1 = match.player1Id;
  const p2 = match.player2Id;
  
  const score1 = match.score1;
  const score2 = match.score2;

  const tournament = match.tournamentId ? useStore.getState().tournaments[match.tournamentId] : null;
  const settings = tournament?.settings;
  const isFinal = match.stage === 'quarter' || match.stage === 'semi' || match.stage === 'final' || match.stage === 'third_place';
  const maxScore = settings ? (isFinal ? settings.finalNbSets : settings.qualifNbSets) : 99;
  const isWinningSets = settings ? (isFinal ? settings.finalIsWinningSets : settings.qualifIsWinningSets) : true;

  let canFinish = true;
  if (settings) {
    if (isWinningSets) {
      canFinish = (match.score1 >= maxScore || match.score2 >= maxScore);
    } else {
      canFinish = ((match.score1 + match.score2) >= maxScore);
    }
  }

  const handleScore = (playerId: string, delta: number) => {
    // Prevent exceeding max score for fixed sets, or winning sets
    if (delta > 0) {
      if (isWinningSets && (score1 >= maxScore || score2 >= maxScore)) return;
      if (!isWinningSets && (score1 + score2) >= maxScore) return;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>
          {table?.name || (table?.number ? `Table ${table.number}` : 'Billard')}
        </div>
      </div>

      {/* Player 2 Zone (Top half) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '200px' }}>
        <div style={{ position: 'absolute', top: '1rem', color: 'var(--text-muted)' }}>
          {players[p2]?.name}
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
        <div style={{ position: 'absolute', bottom: '1rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
          {players[p1]?.name}
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
