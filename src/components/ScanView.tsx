import React, { useState } from 'react';
import { useStore } from '../store';
import { ScanLine } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';

const ScanView: React.FC = () => {
  const { startTournamentMatch, currentClub, setClub } = useStore();
  const [qrData, setQrData] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const processScan = (rawData: string) => {
    try {
      const data = JSON.parse(rawData);
      if (data.clubId && data.clubId !== currentClub.id) {
        setClub({ id: data.clubId });
      }
      if (data.matchId && data.tournamentId) {
        const storeMatches = useStore.getState().matches;
        const match = storeMatches[data.matchId];
        
        if (!match) {
          return alert("Match introuvable !");
        }
        if (!match.tableId) {
          return alert("Ce match n'a pas encore de billard assigné.");
        }
        if (match.status === 'finished') {
          return alert("Ce match est déjà terminé !");
        }
        if (match.status === 'playing') {
          useStore.setState({ activeMatchId: data.matchId });
          return;
        }
        
        startTournamentMatch(data.matchId);
      } else {
        alert("QR Code non reconnu.");
      }
    } catch (e) {
      alert("QR Code invalide.");
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', gap: '2rem' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          background: '#ffffff',
          padding: '6px 14px',
          borderRadius: '16px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          marginBottom: '1rem'
        }}>
          <img src={currentClub.logoUrl || '/logo.png'} alt={currentClub.name} style={{ height: '64px', objectFit: 'contain' }} />
        </div>
        <h1 className="text-gradient" style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900 }}>{currentClub.name.toUpperCase()}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>Scannez le QR code de votre match sur le billard pour démarrer</p>
      </div>

      {!isScanning ? (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', cursor: 'pointer' }} onClick={() => setIsScanning(true)}>
          <div style={{ 
            width: '120px', height: '120px', 
            borderRadius: '24px', 
            border: '2px dashed var(--accent-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-primary)',
            marginBottom: '1rem'
          }}>
            <ScanLine size={48} />
          </div>
          <button className="btn btn-outline" style={{ pointerEvents: 'none' }}>Ouvrir l'appareil photo</button>
        </div>
      ) : (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
          
          <div style={{ width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
            <Scanner
              onScan={(result) => {
                if (result && result.length > 0) {
                  const rawData = result[0].rawValue;
                  setQrData(rawData);
                  processScan(rawData);
                }
              }}
              formats={['qr_code']}
            />
          </div>

          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ou Collez le JSON manuellement</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder='{"tournamentId":"...","matchId":"..."}'
            value={qrData}
            onChange={e => setQrData(e.target.value)}
          />
          <button className="btn btn-neon" onClick={() => processScan(qrData)} style={{ justifyContent: 'center' }}>
            Valider le scan
          </button>
          <button className="btn" style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', alignSelf: 'center' }} onClick={() => setIsScanning(false)}>
            Fermer l'appareil photo
          </button>
        </div>
      )}

    </div>
  );
};

export default ScanView;
