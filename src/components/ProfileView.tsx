import React from 'react';
import { useStore } from '../store';
import { Trophy, Crosshair, Swords } from 'lucide-react';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';

const ProfileView: React.FC = () => {
  const { currentUser, players, currentClub } = useStore();
  const me = players[currentUser];

  if (!me) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        {me.avatarUrl ? (
          <img
            src={me.avatarUrl}
            alt={me.name}
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              margin: '0 auto 1rem',
              objectFit: 'cover',
              border: `3px solid ${(me.level === 'Prestige' || me.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
              boxShadow: '0 0 20px rgba(0, 255, 170, 0.2)'
            }}
          />
        ) : (
          <div style={{ 
            width: '100px', height: '100px', 
            borderRadius: '50%', 
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            margin: '0 auto 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', fontWeight: 'bold', color: '#000'
          }}>
            {me.name.charAt(0)}
          </div>
        )}
        <h2>{me.name}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{
            color: (me.level === 'Prestige' || me.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)',
            fontSize: '0.9rem',
            letterSpacing: '1px',
            fontWeight: 800
          }}>
            STATUT : {(me.level === 'Prestige' || me.level === 'Confirmé') ? '👑 PRESTIGE' : 'AMATEUR'}
          </span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ffffff', padding: '2px 8px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', marginTop: '4px' }}>
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt={currentClub.name} style={{ height: '18px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#000' }}>{currentClub.name}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1.5rem 1rem' }}>
          <Trophy size={28} color="var(--accent-primary)" />
          <span style={{ fontSize: '2rem', fontWeight: 800 }}>{me.stats.winRate}%</span>
          <span style={{ fontSize: '0.75rem', color: '#CCFBF1', fontWeight: 600 }}>
            WIN RATE ({me.stats.wins}V - {me.stats.losses ?? (me.stats.matchesPlayed - me.stats.wins)}D)
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1.5rem 1rem' }}>
          <Swords size={28} color="var(--accent-secondary)" />
          <span style={{ fontSize: '2rem', fontWeight: 800 }}>{me.stats.matchesPlayed}</span>
          <span style={{ fontSize: '0.75rem', color: '#CCFBF1', fontWeight: 600 }}>MATCHS JOUÉS</span>
        </div>
      </div>

      {/* Row 2 Stats: Manches & Titres */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', padding: '1rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: (me.stats.setDiff ?? 0) >= 0 ? 'var(--accent-primary)' : '#ff4444' }}>
            {(me.stats.setDiff ?? 0) >= 0 ? `+${me.stats.setDiff ?? 0}` : me.stats.setDiff}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#CCFBF1', fontWeight: 600 }}>
            DIFFÉRENCE MANCHES ({me.stats.setsWon ?? 0} / {me.stats.setsLost ?? 0})
          </span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', padding: '1rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffd700' }}>
            🏆 {me.stats.tournamentsWon ?? 0}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#CCFBF1', fontWeight: 600 }}>
            TITRES DE TOURNOI ({me.stats.tournamentsPlayed ?? 0} disputés)
          </span>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#FFFFFF' }}>
          <Crosshair size={20} color="#ff4444" />
          Rivalités & Historique
        </h3>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,0,0,0.1)', borderRadius: '12px', border: '1px solid rgba(255, 68, 68, 0.25)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#CCFBF1', fontWeight: 600 }}>BÊTE NOIRE</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{me.stats.nemesisId && players[me.stats.nemesisId] ? players[me.stats.nemesisId].name : 'Aucun'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#ff7777', fontWeight: 600 }}>Taux de défaite</div>
            <div style={{ fontWeight: 800, color: '#ff7777', fontSize: '1rem' }}>
              {me.stats.nemesisLossRate !== undefined ? `${me.stats.nemesisLossRate}%` : (me.stats.nemesisLosses ? `${me.stats.nemesisLosses} déf.` : '-')}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,240,255,0.08)', borderRadius: '12px', marginTop: '1rem', border: '1px solid rgba(0, 240, 255, 0.25)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#CCFBF1', fontWeight: 600 }}>RIVAL LE PLUS FRÉQUENT</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{me.stats.bestFriendId && players[me.stats.bestFriendId] ? players[me.stats.bestFriendId].name : 'Aucun'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>Matchs disputés</div>
            <div style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '1rem' }}>
              {me.stats.bestFriendMatches ?? '-'}
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-surface" style={{ marginTop: 'auto' }}>
        Voir l'historique complet
      </button>
    </div>
  );
};

export default ProfileView;
