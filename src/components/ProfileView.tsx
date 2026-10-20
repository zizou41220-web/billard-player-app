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
        <h2>{me.name}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', letterSpacing: '1px', fontWeight: 700 }}>STATUT: PRESTIGE</span>
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
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>WIN RATE</span>
        </div>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1.5rem 1rem' }}>
          <Swords size={28} color="var(--accent-secondary)" />
          <span style={{ fontSize: '2rem', fontWeight: 800 }}>{me.stats.matchesPlayed}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MATCHS JOUÉS</span>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Crosshair size={20} color="#ff4444" />
          Rivalités
        </h3>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,0,0,0.05)', borderRadius: '12px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>BÊTE NOIRE</div>
            <div style={{ fontWeight: 600 }}>{me.stats.nemesisId ? players[me.stats.nemesisId]?.name : 'Aucun'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#ff4444' }}>Taux de défaite</div>
            <div style={{ fontWeight: 600, color: '#ff4444' }}>78%</div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,240,255,0.05)', borderRadius: '12px', marginTop: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PARTENAIRE FAVORIS</div>
            <div style={{ fontWeight: 600 }}>{me.stats.bestFriendId ? players[me.stats.bestFriendId]?.name : 'Aucun'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>Matchs ensemble</div>
            <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>42</div>
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
