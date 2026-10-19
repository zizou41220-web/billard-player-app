import React, { useState } from 'react';
import { useStore } from '../store';
import { ScanLine, Loader2 } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { initSync, mapDBToMatch } from '../sync';
import { supabase } from '../supabase';

const ScanView: React.FC = () => {
  const { startTournamentMatch, currentClub, setClub } = useStore();
  const [qrData, setQrData] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processScan = async (rawData: string) => {
    if (!rawData || !rawData.trim() || isProcessing) return;
    setIsProcessing(true);

    try {
      let data: any;
      try {
        data = JSON.parse(rawData);
      } catch {
        if (rawData.startsWith('http://') || rawData.startsWith('https://')) {
          alert("Ce QR Code est un lien web, pas un QR Code de match à lancer.");
          setIsProcessing(false);
          return;
        }
        alert("QR Code invalide (format non reconnu).");
        setIsProcessing(false);
        return;
      }

      if (data.clubId && data.clubId !== currentClub.id) {
        setClub({ id: data.clubId });
      }

      const matchId = data.matchId;
      const tableId = data.tableId;

      if (!matchId && !tableId) {
        alert("QR Code non reconnu : aucun match ou billard trouvé.");
        setIsProcessing(false);
        return;
      }

      // Step 1: Check in local Zustand store by matchId
      let match = matchId ? useStore.getState().matches[matchId] : null;

      // If not found by matchId, check by tableId in local store
      if (!match && tableId) {
        const tableObj = useStore.getState().tables[tableId];
        if (tableObj?.currentMatchId) {
          match = useStore.getState().matches[tableObj.currentMatchId];
        }
        if (!match) {
          match = Object.values(useStore.getState().matches).find(
            m => m.tableId === tableId && m.status !== 'finished'
          ) || null;
        }
      }

      // Step 2: If still not found, trigger initSync() to ensure fresh state from Supabase
      if (!match) {
        try {
          await initSync();
          if (matchId) {
            match = useStore.getState().matches[matchId];
          }
          if (!match && tableId) {
            const tableObj = useStore.getState().tables[tableId];
            if (tableObj?.currentMatchId) {
              match = useStore.getState().matches[tableObj.currentMatchId];
            }
            if (!match) {
              match = Object.values(useStore.getState().matches).find(
                m => m.tableId === tableId && m.status !== 'finished'
              ) || null;
            }
          }
        } catch (syncErr) {
          console.warn("Erreur resync scan:", syncErr);
        }
      }

      // Step 3: Direct fallback query to Supabase if still not in store
      if (!match && matchId) {
        try {
          const { data: dbMatch } = await supabase
            .from('tournoi2_matches')
            .select('*')
            .eq('id', matchId)
            .maybeSingle();
          if (dbMatch) {
            const fetched = mapDBToMatch(dbMatch);
            match = fetched;
            useStore.setState(s => ({ matches: { ...s.matches, [fetched.id]: fetched } }));
          }
        } catch (dbErr) {
          console.warn("Erreur fetch match Supabase:", dbErr);
        }
      }

      // Step 4: If still not found, check Supabase for active match on tableId
      if (!match && tableId) {
        try {
          const { data: dbTableMatches } = await supabase
            .from('tournoi2_matches')
            .select('*')
            .eq('table_id', tableId)
            .neq('status', 'finished')
            .limit(1);
          if (dbTableMatches && dbTableMatches.length > 0) {
            const fetched = mapDBToMatch(dbTableMatches[0]);
            match = fetched;
            useStore.setState(s => ({ matches: { ...s.matches, [fetched.id]: fetched } }));
          }
        } catch (dbErr) {
          console.warn("Erreur fetch table match Supabase:", dbErr);
        }
      }

      if (!match) {
        alert("Match introuvable ! Assurez-vous que le match est bien créé et assigné par le gérant.");
        setIsProcessing(false);
        return;
      }

      // Effective table resolution
      const effectiveTableId = match.tableId || tableId || Object.values(useStore.getState().tables).find(t => t.currentMatchId === match.id)?.id;

      if (!effectiveTableId) {
        alert("Ce match n'a pas encore de billard assigné. Veuillez patienter qu'une table se libère.");
        setIsProcessing(false);
        return;
      }

      if (match.status === 'finished') {
        alert("Ce match est déjà terminé !");
        setIsProcessing(false);
        return;
      }

      if (match.status === 'playing') {
        useStore.setState({ activeMatchId: match.id });
        setIsProcessing(false);
        return;
      }

      // Start match and enter live scoring
      startTournamentMatch(match.id);
      setIsProcessing(false);
    } catch (e) {
      console.error("Erreur scan:", e);
      alert("Erreur lors de la lecture du QR code.");
      setIsProcessing(false);
    }
  };

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
          
          <div style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
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
            {isProcessing && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '0.8rem', color: 'var(--accent-primary)', fontWeight: 800
              }}>
                <Loader2 size={36} className="animate-spin" />
                <span>Chargement du match...</span>
              </div>
            )}
          </div>

          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ou Collez le JSON manuellement</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder='{"tournamentId":"...","matchId":"..."}'
            value={qrData}
            onChange={e => setQrData(e.target.value)}
            disabled={isProcessing}
          />
          <button 
            className="btn btn-neon" 
            onClick={() => processScan(qrData)} 
            style={{ justifyContent: 'center' }}
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Valider le scan'}
          </button>
          <button 
            className="btn" 
            style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', alignSelf: 'center' }} 
            onClick={() => setIsScanning(false)}
            disabled={isProcessing}
          >
            Fermer l'appareil photo
          </button>
        </div>
      )}

    </div>
  );
};

export default ScanView;
