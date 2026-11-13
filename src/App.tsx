import { useState, useEffect } from 'react';
import { useStore } from './store';
import ScanView from './components/ScanView';
import MatchView from './components/MatchView';
import ProfileView from './components/ProfileView';
import FeedView from './components/FeedView';
import AdminView from './components/AdminView';
import StreamOverlayView from './components/StreamOverlayView';
import KioskView from './components/KioskView';
import { QrCode, User, Activity, Settings, Tv } from 'lucide-react';
import { initSync } from './sync';
import { APP_VERSION } from './version';

export type Tab = 'scan' | 'feed' | 'profile';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const overlayTableParam = urlParams.get('overlay') || urlParams.get('stream');
  const kioskParam = urlParams.get('kiosk') || urlParams.get('tv');
  const matchParam = urlParams.get('match');
  const tableParam = urlParams.get('table');
  const clubParam = urlParams.get('club');

  const isDesktop = window.innerWidth > 768;
  const [appMode, setAppMode] = useState<'player' | 'admin' | 'kiosk'>(() => {
    if (kioskParam) return 'kiosk';
    if (matchParam || tableParam) return 'player';
    return isDesktop ? 'admin' : 'player';
  });
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const { activeMatchId } = useStore();

  useEffect(() => {
    initSync();

    if (clubParam) {
      useStore.getState().setClub({ id: clubParam });
    }

    if (matchParam || tableParam) {
      setAppMode('player');

      const openMatchFromUrl = async () => {
        let match = matchParam ? useStore.getState().matches[matchParam] : null;
        if (!match && tableParam) {
          const tObj = useStore.getState().tables[tableParam];
          if (tObj?.currentMatchId) match = useStore.getState().matches[tObj.currentMatchId];
          if (!match) {
            match = Object.values(useStore.getState().matches).find(m => m.tableId === tableParam && m.status !== 'finished') || null;
          }
        }

        if (!match) {
          try {
            await initSync();
            if (matchParam) match = useStore.getState().matches[matchParam];
            if (!match && tableParam) {
              const tObj = useStore.getState().tables[tableParam];
              if (tObj?.currentMatchId) match = useStore.getState().matches[tObj.currentMatchId];
              if (!match) {
                match = Object.values(useStore.getState().matches).find(m => m.tableId === tableParam && m.status !== 'finished') || null;
              }
            }
          } catch (e) {
            console.warn("Erreur chargement match URL:", e);
          }
        }

        if (match) {
          if (match.status === 'pending') {
            useStore.getState().startTournamentMatch(match.id, true);
          }
          useStore.setState({ activeMatchId: match.id });
        }
      };

      openMatchFromUrl();
    }
  }, []);

  // Dedicated Overlay Mode for OBS / Prism Live Studio / Facebook / YouTube streams
  if (overlayTableParam) {
    return <StreamOverlayView tableParam={overlayTableParam} />;
  }

  if (appMode === 'kiosk') {
    return <KioskView onExit={() => setAppMode(isDesktop ? 'admin' : 'player')} />;
  }

  if (appMode === 'admin') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100dvh' }}>
        <AdminView onOpenKiosk={() => setAppMode('kiosk')} />
      </div>
    );
  }

  if (activeMatchId) {
    return (
      <div className="mobile-container" style={{ overflowY: 'auto' }}>
        <MatchView />
      </div>
    );
  }

  const renderView = () => {
    switch (activeTab) {
      case 'scan': return <ScanView />;
      case 'feed': return <FeedView />;
      case 'profile': return <ProfileView />;
      default: return <ScanView />;
    }
  };

  return (
    <div style={{
      position: 'relative',
      height: '100dvh',
      width: '100vw',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at 50% 20%, rgba(15, 118, 110, 0.28) 0%, #030b0a 75%)'
    }}>
      {isDesktop && (
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 50 }}>
          <span style={{
            fontSize: '0.78rem',
            color: '#FBBF24',
            background: 'rgba(245, 158, 11, 0.16)',
            padding: '4px 10px',
            borderRadius: '10px',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            fontWeight: 800
          }}>
            {APP_VERSION}
          </span>
          <button 
            onClick={() => setAppMode('kiosk')}
            className="btn btn-outline"
            style={{ background: 'rgba(4, 24, 21, 0.9)', color: '#34D399', borderColor: 'rgba(52, 211, 153, 0.45)', padding: '0.55rem 1rem', fontSize: '0.84rem' }}
          >
            <Tv size={17} /> Mode Kiosque TV
          </button>
          <button 
            onClick={() => setAppMode('admin')}
            className="btn btn-outline"
            style={{ background: 'rgba(4, 24, 21, 0.9)', padding: '0.55rem 1rem', fontSize: '0.84rem' }}
          >
            <Settings size={18} /> Retour Écran Gérant (TV)
          </button>
        </div>
      )}

      <div className="mobile-container">
        {/* Version indicator for mobile */}
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '14px',
          zIndex: 99,
          fontSize: '0.7rem',
          color: '#FBBF24',
          background: 'rgba(245, 158, 11, 0.18)',
          padding: '2px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          fontWeight: 800,
          backdropFilter: 'blur(8px)',
          pointerEvents: 'none'
        }}>
          {APP_VERSION}
        </div>
      <div className="view-content">
        {renderView()}
      </div>

      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
          <Activity size={24} />
          <span>Live</span>
        </button>
        <button className={`nav-item ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>
          <div style={{
            background: activeTab === 'scan' ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'var(--bg-surface)',
            color: activeTab === 'scan' ? '#000' : 'var(--text-muted)',
            padding: '12px',
            borderRadius: '50%',
            transform: 'translateY(-10px)',
            boxShadow: activeTab === 'scan' ? 'var(--shadow-neon)' : 'none',
            border: activeTab === 'scan' ? 'none' : '1px solid var(--border-color)'
          }}>
            <QrCode size={28} />
          </div>
          <span style={{ transform: 'translateY(-10px)' }}>Jouer</span>
        </button>
        <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User size={24} />
          <span>Profil</span>
        </button>
      </nav>
      </div>
    </div>
  );
}

export default App;
