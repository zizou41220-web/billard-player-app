import { useState, useEffect } from 'react';
import { useStore } from './store';
import ScanView from './components/ScanView';
import MatchView from './components/MatchView';
import ProfileView from './components/ProfileView';
import FeedView from './components/FeedView';
import AdminView from './components/AdminView';
import StreamOverlayView from './components/StreamOverlayView';
import { QrCode, User, Activity, Settings } from 'lucide-react';
import { initSync } from './sync';

export type Tab = 'scan' | 'feed' | 'profile';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const overlayTableParam = urlParams.get('overlay') || urlParams.get('stream');

  const isDesktop = window.innerWidth > 768;
  const [appMode, setAppMode] = useState<'player' | 'admin'>(isDesktop ? 'admin' : 'player');
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const { activeMatchId } = useStore();

  useEffect(() => {
    initSync();
  }, []);

  // Dedicated Overlay Mode for OBS / Prism Live Studio / Facebook / YouTube streams
  if (overlayTableParam) {
    return <StreamOverlayView tableParam={overlayTableParam} />;
  }

  if (appMode === 'admin') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100dvh' }}>
        <AdminView />
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
    <div style={{ position: 'relative', height: '100dvh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      {isDesktop && (
        <button 
          onClick={() => setAppMode('admin')}
          className="btn btn-outline"
          style={{ position: 'absolute', top: '2rem', right: '2rem', background: '#050816' }}
        >
          <Settings size={20} style={{marginRight: '0.5rem'}}/> Retour Écran Gérant (TV)
        </button>
      )}

      <div className="mobile-container">
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
