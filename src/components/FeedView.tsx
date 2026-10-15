import React, { useState } from 'react';
import { useStore } from '../store';
import { Activity, Clock, Trophy, Lock } from 'lucide-react';
import TournamentBracketView from './TournamentBracketView';
import { getTournamentQualificationStatus } from '../utils/qualifiers';

const FeedView: React.FC = () => {
  const { matches, players, tables, tournaments, currentClub } = useStore();
  const [subTab, setSubTab] = useState<'live' | 'bracket'>('live');

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  const { hasSureQualifiers } = getTournamentQualificationStatus(activeTournament, matches);

  const allMatches = Object.values(matches).sort((a, b) => b.startTime - a.startTime);
  const liveMatches = allMatches.filter(m => m.status === 'playing');
  const finishedMatches = allMatches.filter(m => m.status === 'finished').slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Club Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(5, 8, 22, 0.65)',
        border: '1px solid var(--border-color)',
        padding: '0.8rem 1.4rem',
        borderRadius: '14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: '#fff',
            padding: '3px 8px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <img src={currentClub.logoUrl || '/logo.png'} alt={currentClub.name} style={{ height: '38px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--accent-primary)', letterSpacing: '-0.3px' }}>
              {currentClub.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Direct live & Résultats en temps réel
            </div>
          </div>
        </div>

        {activeTournament && (
          <span style={{
            background: 'rgba(0, 255, 170, 0.1)',
            color: 'var(--accent-primary)',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 800,
            border: '1px solid rgba(0, 255, 170, 0.3)'
          }}>
            {activeTournament.name}
          </span>
        )}
      </div>

      {/* View Switcher: Live vs Bracket */}
      <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setSubTab('live')}
          style={{
            flex: 1,
            background: subTab === 'live' ? 'var(--accent-primary)' : 'transparent',
            color: subTab === 'live' ? '#000' : 'var(--text-muted)',
            fontWeight: 800,
            border: 'none',
            padding: '0.6rem',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            transition: 'all 0.2s'
          }}
        >
          <Activity size={16} /> Live Club
        </button>
        <button
          onClick={() => {
            if (!hasSureQualifiers) {
              alert("L'arbre des phases finales est verrouillé : aucun joueur n'est encore mathématiquement qualifié.");
              return;
            }
            setSubTab('bracket');
          }}
          disabled={!hasSureQualifiers}
          style={{
            flex: 1,
            background: subTab === 'bracket' ? 'var(--accent-primary)' : 'transparent',
            color: subTab === 'bracket' ? '#000' : (hasSureQualifiers ? 'var(--text-muted)' : 'rgba(255,255,255,0.3)'),
            fontWeight: 800,
            border: 'none',
            padding: '0.6rem',
            borderRadius: '8px',
            cursor: hasSureQualifiers ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            opacity: hasSureQualifiers ? 1 : 0.6,
            transition: 'all 0.2s'
          }}
          title={hasSureQualifiers ? "Voir les phases finales" : "Verrouillé : Aucun qualifié mathématiquement certain"}
        >
          {hasSureQualifiers ? <Trophy size={16} /> : <Lock size={16} />}
          Phases Finales
        </button>
      </div>

      {subTab === 'bracket' ? (
        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
          <TournamentBracketView />
        </div>
      ) : (
        <>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Activity size={24} color="var(--accent-primary)" />
              Live au Club
            </h2>
        
        {liveMatches.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Aucun match en cours
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {liveMatches.map(m => (
              <div key={m.id} className="glass-card" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent-primary)', boxShadow: 'var(--shadow-neon)' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Table {m.tableId && tables[m.tableId]?.number}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-primary)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 2s infinite' }} />
                    En direct
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>{players[m.player1Id]?.name}</div>
                  <div style={{ padding: '0 1rem', fontSize: '1.5rem', fontWeight: 800 }} className="text-gradient">
                    {m.score1} - {m.score2}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{players[m.player2Id]?.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={24} color="var(--text-muted)" />
          Derniers Résultats
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {finishedMatches.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Aucun résultat récent</p>
          ) : (
            finishedMatches.map(m => {
              const p1Win = m.winnerId === m.player1Id;
              const p2Win = m.winnerId === m.player2Id;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px' }}>
                  <span style={{ flex: 1, textAlign: 'right', color: p1Win ? '#fff' : 'var(--text-muted)' }}>
                    {players[m.player1Id]?.name}
                  </span>
                  <span style={{ padding: '0 1rem', fontWeight: 800 }}>
                    {m.score1} - {m.score2}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', color: p2Win ? '#fff' : 'var(--text-muted)' }}>
                    {players[m.player2Id]?.name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default FeedView;
