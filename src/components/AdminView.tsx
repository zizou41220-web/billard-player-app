import React, { useState } from 'react';
import { useStore } from '../store';
import QRCode from 'react-qr-code';
import {
  Trophy, Users, MonitorPlay, Settings, Rocket,
  Lock, Unlock, ArrowRight, Play, AlertTriangle, RotateCcw,
  Swords, CheckCircle2, Building2, Copy, Check,
  XCircle, Minus, Plus, Edit2, ArrowUpDown, Sparkles, RefreshCw
} from 'lucide-react';
import TournamentBracketView from './TournamentBracketView';
import { getTournamentQualificationStatus } from '../utils/qualifiers';
import BilliardTableVisual from './BilliardTableVisual';
import { APP_VERSION } from '../version';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMaxAllowedHandicap, getMatchScoringRules } from '../utils/rules';

const AdminView: React.FC = () => {
  const {
    tournaments, matches, players, tables, currentClub, setClub,
    createTournament, addPlayer, updatePlayer, deletePlayer,
    updateTablePosition, addTable, removeTable, postponeMatch,
    endTournament, finishMatch, freeTable, updateMatchScore,
    assignMatchToTable, updateFinishedMatchScore, startTournamentMatch,
    launchFinalStage, reseedFinalStage
  } = useStore();

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;
  const isTournamentActive = Boolean(activeTournament);

  const [activeTab, setActiveTab] = useState<'launcher' | 'dashboard' | 'admin'>(() => {
    return isTournamentActive ? 'dashboard' : 'launcher';
  });
  const [dashboardSubTab, setDashboardSubTab] = useState<'live' | 'bracket'>('live');
  const [adminSubTab, setAdminSubTab] = useState<'map' | 'players' | 'club'>('map');
  const [showNewTourForm, setShowNewTourForm] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [selectedTableForQR, setSelectedTableForQR] = useState<string | null>(null);
  const [justScannedMatchId, setJustScannedMatchId] = useState<string | null>(null);
  const [copiedOverlay, setCopiedOverlay] = useState(false);
  const [dismissedQualifAlertTourId, setDismissedQualifAlertTourId] = useState<string | null>(null);
  const matchStatusAtOpenRef = React.useRef<string | null>(null);

  // Club Configuration State
  const [clubNameInput, setClubNameInput] = useState(currentClub.name);
  const [clubIdInput, setClubIdInput] = useState(currentClub.id);
  const [clubLogoInput, setClubLogoInput] = useState(currentClub.logoUrl || defaultClubLogo);
  const [clubSavedFeedback, setClubSavedFeedback] = useState(false);
  const [copiedClubUrl, setCopiedClubUrl] = useState(false);

  const getClubShareUrl = () => {
    if (typeof window === 'undefined') return '';
    if (window.location.hostname === 'localhost') {
      return `${__LAN_URL__}?club=${currentClub.id}`;
    }
    const cleanBase = window.location.href.split('?')[0].replace(/\/+$/, '');
    return `${cleanBase}/?club=${currentClub.id}`;
  };

  // Tournament Setup State
  const [newTourName, setNewTourName] = useState('');
  const [newTourFormat, setNewTourFormat] = useState<any>('cartesien');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [qualifNbSets, setQualifNbSets] = useState(1);
  const [qualifIsWinningSets, setQualifIsWinningSets] = useState(true);
  const [qualifNbQualifiers, setQualifNbQualifiers] = useState(2);
  const [finalNbSets, setFinalNbSets] = useState(3);
  const [finalIsWinningSets, setFinalIsWinningSets] = useState(true);
  const [seedByMerit, setSeedByMerit] = useState(true);
  const [handicapAmateurSets, setHandicapAmateurSets] = useState(0);
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(true);

  const maxAllowedHandicap = getMaxAllowedHandicap(
    qualifNbSets,
    qualifIsWinningSets,
    finalNbSets,
    finalIsWinningSets,
    newTourFormat === 'direct_ko'
  );

  React.useEffect(() => {
    if (handicapAmateurSets > maxAllowedHandicap) {
      setHandicapAmateurSets(maxAllowedHandicap);
    }
  }, [maxAllowedHandicap, handicapAmateurSets]);

  // New Player State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerLevel, setNewPlayerLevel] = useState<any>('Amateur');
  const [newPlayerPhoto, setNewPlayerPhoto] = useState<string | null>(null);

  // Edit Player State
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerLevel, setEditPlayerLevel] = useState<any>('Amateur');
  const [editPlayerPhoto, setEditPlayerPhoto] = useState<string | null>(null);

  // Finished Match Score Correction State (Admin Mode)
  const [editingFinishedMatchId, setEditingFinishedMatchId] = useState<string | null>(null);
  const [editFinishedScore1, setEditFinishedScore1] = useState(0);
  const [editFinishedScore2, setEditFinishedScore2] = useState(0);

  // Postpone Match Modal (Choose replacement from waiting queue)
  const [postponingMatchModal, setPostponingMatchModal] = useState<{ matchId: string; tableId: string } | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPlayerPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePlayerSelection = (id: string) => {
    setSelectedPlayers(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleTableSelection = (id: string) => {
    setSelectedTables(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const activeMatches = activeTournament ? Object.values(matches).filter(m => activeTournament.matches.includes(m.id) && m.status === 'playing') : [];
  const allTourMatches = activeTournament ? Object.values(matches).filter(m => activeTournament.matches.includes(m.id)) : [];
  const pendingTourMatches = allTourMatches.filter(m => m.status !== 'finished');
  const finishedTourMatches = allTourMatches.filter(m => m.status === 'finished');

  const qualifStatus = getTournamentQualificationStatus(activeTournament, matches, players);
  const { hasSureQualifiers } = qualifStatus;

  const isFinalStageActive = Boolean(
    activeTournament?.finalStageLaunched ||
    activeTournament?.settings?.finalStageLaunched ||
    qualifStatus.isFinalLaunched
  );

  const hasInvertedSemi = Boolean(isFinalStageActive && qualifStatus.ranking.length >= 2 && (() => {
    const tourMatches = activeTournament ? activeTournament.matches.map(id => matches[id]).filter(Boolean) : [];
    const s1 = tourMatches.find(m => (m.stage === 'semi' || m.id.includes('_semi_')) && (m.bracketPosition === 0 || m.id.includes('_semi_1_')));
    if (!s1 || s1.status === 'finished') return false;
    const r0 = qualifStatus.ranking[0]?.id;
    const r1 = qualifStatus.ranking[1]?.id;
    return (s1.player1Id === r0 && s1.player2Id === r1) || (s1.player1Id === r1 && s1.player2Id === r0);
  })());

  const areAllQualifiersKnown = Boolean(
    activeTournament &&
    !isFinalStageActive &&
    (qualifStatus.isQualifAllDone || qualifStatus.sureQualifiers.length >= qualifStatus.numQualifiers)
  );
  const showQualifAlertModal = areAllQualifiersKnown && dismissedQualifAlertTourId !== activeTournament?.id;

  // Auto-heal missing match tableId if table has currentMatchId
  React.useEffect(() => {
    let changed = false;
    const newMatches = { ...matches };
    Object.values(tables).forEach(t => {
      if (t.status === 'occupied' && t.currentMatchId && newMatches[t.currentMatchId]) {
        if (newMatches[t.currentMatchId].tableId !== t.id) {
          newMatches[t.currentMatchId] = { ...newMatches[t.currentMatchId], tableId: t.id };
          changed = true;
        }
      }
    });
    if (changed) {
      useStore.setState({ matches: newMatches });
    }
  }, [tables, matches]);

  // Auto-close Table QR modal when a match is scanned from a phone (transitions to playing)
  React.useEffect(() => {
    if (!selectedTableForQR) {
      matchStatusAtOpenRef.current = null;
      setJustScannedMatchId(null);
      return;
    }

    const table = tables[selectedTableForQR];
    const match = table?.currentMatchId ? matches[table.currentMatchId] : null;

    if (!match) {
      matchStatusAtOpenRef.current = null;
      return;
    }

    if (matchStatusAtOpenRef.current === null) {
      matchStatusAtOpenRef.current = match.status;
    } else if (matchStatusAtOpenRef.current === 'pending' && match.status === 'playing') {
      // The match was scanned on phone and transitioned to playing!
      setJustScannedMatchId(match.id);
      matchStatusAtOpenRef.current = 'playing';

      const timer = setTimeout(() => {
        setSelectedTableForQR(null);
        setJustScannedMatchId(null);
      }, 1100);

      return () => clearTimeout(timer);
    }
  }, [selectedTableForQR, tables, matches]);

  const renderMap = (isEditable: boolean, scaleOverride?: number, showOnlyTournamentTables = false) => {
    const tournamentTables = Object.values(tables)
      .filter(t => !showOnlyTournamentTables || !activeTournament || activeTournament.settings?.tableIds.includes(t.id))
      .sort((a, b) => a.number - b.number);
    const tablesCount = tournamentTables.length;

    // Compact centered deck for live tournament dashboard
    if (showOnlyTournamentTables) {
      return (
        <div
          style={{
            backgroundColor: '#050814',
            backgroundImage: 'radial-gradient(circle at center, rgba(18, 32, 60, 0.7) 0%, rgba(4, 7, 16, 0.98) 100%), repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.015) 0px, rgba(255, 255, 255, 0.015) 20px, transparent 20px, transparent 40px)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            position: 'relative',
            minHeight: tablesCount <= 2 ? '240px' : '280px',
            padding: '1.4rem 1.2rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: tablesCount <= 2 ? '4.5rem' : '2.5rem',
            flexWrap: 'wrap',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 35px rgba(0,0,0,0.85)'
          }}
        >
          {/* Subtle Room Watermark Floor Crest */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            opacity: 0.04,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            userSelect: 'none'
          }}>
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt="Club Crest" style={{ width: '160px', filter: 'grayscale(1)' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          </div>

          {tournamentTables.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Aucun billard assigné à ce tournoi.
            </div>
          ) : (
            tournamentTables.map(table => {
              // Ensure match strictly belongs to active tournament
              const currentMatch = (table.currentMatchId && matches[table.currentMatchId]?.tournamentId === activeTournament?.id)
                ? matches[table.currentMatchId]
                : Object.values(matches).find(m => m.tournamentId === activeTournament?.id && m.tableId === table.id && m.status !== 'finished');

              const p1 = currentMatch ? players[currentMatch.player1Id] : undefined;
              const p2 = currentMatch ? players[currentMatch.player2Id] : undefined;
              const isPlaying = currentMatch?.status === 'playing';

              return (
                <div
                  key={table.id}
                  style={{
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease',
                    transform: 'scale(1.32)',
                    margin: '0.8rem 1.5rem',
                    zIndex: isPlaying ? 10 : 1
                  }}
                  onClick={() => setSelectedTableForQR(table.id)}
                  title={`Cliquer pour voir le match de ${table.name || `Table ${table.number}`}`}
                >
                  <BilliardTableVisual
                    number={table.number}
                    name={table.name}
                    status={isPlaying ? 'occupied' : 'free'}
                    match={currentMatch}
                    player1={p1}
                    player2={p2}
                  />
                </div>
              );
            })
          )}
        </div>
      );
    }

    const scale = scaleOverride !== undefined ? scaleOverride : Math.max(0.5, Math.min(1.8, 2.0 - (tablesCount * 0.08)));

    return (
      <div
        style={{
          flex: 1,
          backgroundColor: '#050814',
          backgroundImage: isEditable
            ? 'radial-gradient(circle at center, rgba(16, 28, 54, 0.75) 0%, rgba(5, 8, 18, 0.95) 100%), linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)'
            : 'radial-gradient(circle at center, rgba(18, 32, 60, 0.7) 0%, rgba(4, 7, 16, 0.98) 100%), repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.015) 0px, rgba(255, 255, 255, 0.015) 20px, transparent 20px, transparent 40px)',
          backgroundSize: isEditable ? 'auto, 40px 40px, 40px 40px' : 'auto, auto',
          border: isEditable ? '2px dashed rgba(0, 255, 170, 0.4)' : '1px solid var(--border-color)',
          borderRadius: '16px',
          position: 'relative',
          minHeight: isEditable ? '600px' : '100%',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 50px rgba(0,0,0,0.85)'
        }}
        onDragOver={(e) => isEditable && e.preventDefault()}
        onDrop={(e) => {
          if (!isEditable) return;
          const tableId = e.dataTransfer.getData('tableId');
          if (!tableId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          let x = Math.round(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)));
          let y = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)));

          // Magnet snap to other tables (3% threshold)
          const SNAP_THRESHOLD = 3;
          Object.values(tables).forEach(t => {
            if (t.id === tableId) return;
            if (t.x !== undefined && Math.abs(t.x - x) < SNAP_THRESHOLD) x = t.x;
            if (t.y !== undefined && Math.abs(t.y - y) < SNAP_THRESHOLD) y = t.y;
          });

          updateTablePosition(tableId, x, y);
        }}
      >
        {/* Subtle Room Watermark Floor Crest */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          opacity: 0.045,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          userSelect: 'none'
        }}>
          <img src={getClubLogoUrl(currentClub.logoUrl)} alt="Club Crest" style={{ width: '220px', filter: 'grayscale(1)' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          <div style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '6px', color: '#fff', textTransform: 'uppercase' }}>
            {currentClub.name}
          </div>
        </div>

        {Object.values(tables)
          .filter(t => !showOnlyTournamentTables || !activeTournament || activeTournament.settings?.tableIds.includes(t.id))
          .map(table => {
            const currentMatch = table.currentMatchId ? matches[table.currentMatchId] : undefined;
            const p1 = currentMatch ? players[currentMatch.player1Id] : undefined;
            const p2 = currentMatch ? players[currentMatch.player2Id] : undefined;

            return (
              <div
                key={table.id}
                draggable={isEditable}
                onDragStart={(e) => {
                  if (isEditable) e.dataTransfer.setData('tableId', table.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${table.x || 10}%`,
                  top: `${table.y || 10}%`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  cursor: isEditable ? 'grab' : 'pointer',
                  zIndex: table.status === 'occupied' ? 10 : 1
                }}
                onClick={() => {
                  if (!isEditable) setSelectedTableForQR(table.id);
                }}
              >
                <BilliardTableVisual
                  number={table.number}
                  name={table.name}
                  status={table.status}
                  match={currentMatch}
                  player1={p1}
                  player2={p2}
                />

                {isEditable && (
                  <div
                    onClick={(e) => { e.stopPropagation(); removeTable(table.id); }}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: '#ff2244',
                      color: 'white',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 900,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      zIndex: 100
                    }}
                    title="Supprimer ce billard"
                  >
                    ✕
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)', overflow: 'hidden' }}>

      {/* Main Header */}
      <header style={{ padding: '1.2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', background: 'rgba(5, 8, 22, 0.7)', backdropFilter: 'blur(12px)', position: 'relative', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{
            background: '#ffffff',
            padding: '3px 8px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            flexShrink: 0
          }}>
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt={currentClub.name} style={{ height: '44px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 900, color: 'var(--accent-primary)', letterSpacing: '-0.5px' }}>
              {currentClub.name}
            </h1>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>Espace Gérant & Tournois • {currentClub.name}</span>
              <span style={{
                background: 'rgba(0, 255, 170, 0.15)',
                color: 'var(--accent-primary)',
                padding: '3px 9px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 800,
                border: '1px solid rgba(0, 255, 170, 0.4)',
                boxShadow: '0 0 10px rgba(0, 255, 170, 0.2)'
              }}>
                {APP_VERSION}
              </span>
              {activeTournament && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 255, 170, 0.12)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid rgba(0, 255, 170, 0.3)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 6px var(--accent-primary)' }} />
                  {activeTournament.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`btn ${activeTab === 'launcher' ? 'btn-neon' : 'btn-outline'}`}
            onClick={() => setActiveTab('launcher')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
          >
            <Rocket size={18} /> Lanceur de tournoi
          </button>

          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-neon' : 'btn-outline'}`}
            onClick={() => setActiveTab('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              position: 'relative'
            }}
          >
            {isTournamentActive ? (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ffaa', boxShadow: '0 0 8px #00ffaa' }} />
            ) : (
              <MonitorPlay size={18} />
            )}
            Vue d'ensemble
          </button>

          <button
            className={`btn ${activeTab === 'admin' ? 'btn-neon' : 'btn-outline'}`}
            onClick={() => setActiveTab('admin')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
          >
            <Settings size={18} /> Administration
          </button>
        </div>
      </header>

      {/* Dashboard Sub-navigation Header (Live Matches vs Final Phases Bracket) */}
      {activeTab === 'dashboard' && isTournamentActive && activeTournament && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0.75rem 2.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setDashboardSubTab('live')}
              style={{
                background: dashboardSubTab === 'live' ? 'var(--accent-primary)' : 'transparent',
                color: dashboardSubTab === 'live' ? '#000' : 'var(--text-muted)',
                fontWeight: 700,
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
            >
              <MonitorPlay size={16} /> Direct & Billards en Salle
            </button>

            <button
              onClick={() => setDashboardSubTab('bracket')}
              style={{
                background: dashboardSubTab === 'bracket' ? 'var(--accent-primary)' : 'transparent',
                color: dashboardSubTab === 'bracket' ? '#000' : 'var(--text-muted)',
                fontWeight: 700,
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
              title="Voir le tableau des phases finales"
            >
              <Trophy size={16} />
              Tableau des Phases Finales
              {activeTournament.finalStageLaunched ? (
                <span style={{ fontSize: '0.7rem', background: 'var(--accent-primary)', color: '#000', padding: '1px 8px', borderRadius: '4px', fontWeight: 800 }}>
                  EN COURS
                </span>
              ) : hasSureQualifiers || qualifStatus.isQualifAllDone ? (
                <span style={{ fontSize: '0.7rem', background: 'rgba(0,255,170,0.2)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  Prêt
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', color: '#ffcc00' }}>
                  Provisoire
                </span>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>Tournoi : <b style={{ color: '#fff' }}>{activeTournament.name}</b></span>
            <span style={{
              background: 'rgba(0, 255, 170, 0.1)',
              color: 'var(--accent-primary)',
              padding: '3px 10px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.75rem',
              border: '1px solid rgba(0, 255, 170, 0.25)'
            }}>
              {activeTournament.settings?.qualifNbQualifiers || 4} qualifiés
            </span>
          </div>
        </div>
      )}

      {/* Admin Sub-navigation Header */}
      {activeTab === 'admin' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0.75rem 2.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          {/* Sub tabs: Plan de salle & Joueurs */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setAdminSubTab('map')}
              style={{
                background: adminSubTab === 'map' ? 'var(--accent-primary)' : 'transparent',
                color: adminSubTab === 'map' ? '#000' : 'var(--text-muted)',
                fontWeight: 700,
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
            >
              <Trophy size={16} /> Plan de Salle ({Object.keys(tables).length} billards)
            </button>

            <button
              onClick={() => setAdminSubTab('players')}
              style={{
                background: adminSubTab === 'players' ? 'var(--accent-primary)' : 'transparent',
                color: adminSubTab === 'players' ? '#000' : 'var(--text-muted)',
                fontWeight: 700,
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
            >
              <Users size={16} /> Pédigré des Joueurs ({Object.keys(players).length})
            </button>

            <button
              onClick={() => setAdminSubTab('club')}
              style={{
                background: adminSubTab === 'club' ? 'var(--accent-primary)' : 'transparent',
                color: adminSubTab === 'club' ? '#000' : 'var(--text-muted)',
                fontWeight: 700,
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
            >
              <Building2 size={16} /> Club ({currentClub.name})
            </button>
          </div>

          {/* Master PIN Lock Controls for Club Admin */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!isAdminUnlocked ? (
              <button
                className="btn btn-outline"
                style={{ borderColor: 'rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                onClick={() => {
                  const pin = prompt("Code PIN de direction (essayez 1234) :");
                  if (pin === "1234") setIsAdminUnlocked(true);
                  else if (pin) alert("Code PIN incorrect.");
                }}
              >
                <Lock size={15} style={{ color: 'var(--accent-secondary)' }} />
                Mode Consultation
                <span style={{ fontSize: '0.75rem', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Déverrouiller PIN</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Unlock size={15} /> Mode Édition Déverrouillé
                </span>
                {adminSubTab === 'map' && (
                  <button
                    className="btn btn-neon"
                    onClick={() => addTable('')}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                  >
                    + Ajouter un billard
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => {
                    setIsAdminUnlocked(false);
                    setEditingPlayerId(null);
                  }}
                  style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                >
                  Verrouiller
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ========================================================================= */}
        {/* 1. TOURNAMENT LAUNCHER TAB                                                */}
        {/* ========================================================================= */}
        {activeTab === 'launcher' && (
          <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* If a tournament is currently ACTIVE and manager hasn't clicked "new tournament form" */}
            {activeTournament && !showNewTourForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* Active Tournament Status Banner */}
                <div className="glass-card" style={{ padding: '2.5rem', position: 'relative', overflow: 'hidden', border: '1px solid rgba(0, 255, 170, 0.4)' }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '300px', height: '100%', background: 'radial-gradient(circle at top right, rgba(0, 255, 170, 0.12), transparent 70%)', pointerEvents: 'none' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 255, 170, 0.2)', color: 'var(--accent-primary)', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 800, border: '1px solid rgba(0, 255, 170, 0.4)' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 8px var(--accent-primary)' }} />
                          TOURNOI EN COURS
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Format : <b style={{ color: '#fff' }}>{activeTournament.format === 'cartesien' ? 'Cartésien' : activeTournament.format === 'robin' ? 'Poules Robin' : 'Double KO'}</b></span>
                      </div>
                      <h2 style={{ fontSize: '2.4rem', margin: 0, fontWeight: 900, color: '#fff' }}>
                        {activeTournament.name}
                      </h2>
                    </div>

                    {/* End / Reset Tournament Actions */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-neon"
                        disabled={!hasSureQualifiers}
                        style={{
                          padding: '0.7rem 1.2rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontWeight: 700,
                          cursor: hasSureQualifiers ? 'pointer' : 'not-allowed',
                          opacity: hasSureQualifiers ? 1 : 0.5,
                          background: hasSureQualifiers ? undefined : 'rgba(255,255,255,0.08)',
                          color: hasSureQualifiers ? undefined : 'var(--text-muted)'
                        }}
                        title={hasSureQualifiers ? "Voir le tableau des phases finales" : "Accessible dès qu'au moins 1 joueur est mathématiquement qualifié"}
                        onClick={() => {
                          if (!hasSureQualifiers) {
                            alert("L'accès au Tableau des Phases Finales requiert au moins 1 joueur mathématiquement qualifié.");
                            return;
                          }
                          setActiveTab('dashboard');
                          setDashboardSubTab('bracket');
                        }}
                      >
                        {hasSureQualifiers ? <Trophy size={18} /> : <Lock size={18} />}
                        Tableau Phases Finales
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ color: '#ff6666', borderColor: 'rgba(255, 100, 100, 0.3)', padding: '0.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onClick={() => {
                          if (window.confirm(`Êtes-vous sûr de vouloir clôturer le tournoi "${activeTournament.name}" ? Tous les billards seront libérés.`)) {
                            endTournament(activeTournament.id);
                          }
                        }}
                      >
                        <AlertTriangle size={18} /> Clôturer le Tournoi
                      </button>
                      <button
                        className="btn"
                        style={{ background: 'rgba(255,255,255,0.08)', padding: '0.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onClick={() => setShowNewTourForm(true)}
                      >
                        <RotateCcw size={18} /> Configurer un Autre Tournoi
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.2rem', marginTop: '1.5rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Joueurs Inscrits</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-primary)' }}>{activeTournament.participants.length}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Billards Alloués</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>{activeTournament.settings?.tableIds.length || 0}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Matchs en Direct</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#00ffaa' }}>{activeMatches.length}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Progression Matchs</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{finishedTourMatches.length} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {allTourMatches.length}</span></div>
                    </div>
                    {Boolean(activeTournament.settings?.handicapAmateurSets) && (
                      <div style={{ background: 'rgba(255, 215, 0, 0.12)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.35)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#ffd700', marginBottom: '0.3rem', fontWeight: 700 }}>🎯 Handicap Niveaux</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffd700' }}>
                          +{activeTournament.settings?.handicapAmateurSets} <span style={{ fontSize: '1rem', color: 'rgba(255, 215, 0, 0.8)' }}>manche(s)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* The Launch Actions: Quick Jump into the Live Views */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>

                  {/* Launcher Card 1: Live Dashboard */}
                  <div
                    className="glass-card"
                    onClick={() => setActiveTab('dashboard')}
                    style={{
                      padding: '2.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1.5rem',
                      cursor: 'pointer',
                      border: '2px solid rgba(0, 255, 170, 0.4)',
                      background: 'radial-gradient(circle at top left, rgba(0, 255, 170, 0.08), rgba(255,255,255,0.02))',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,255,170,0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(0, 255, 170, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                          <MonitorPlay size={28} />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ACCÉDER <ArrowRight size={14} />
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem 0', fontWeight: 800 }}>Ouvrir la Vue d'ensemble</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                        Afficher l'écran principal en direct : billards avec scores temps réel, QR codes des matchs, file d'attente et classement officiel du tournoi.
                      </p>
                    </div>

                    <button className="btn btn-neon" style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '1rem' }}>
                      <Play size={18} /> Lancer la Vue d'ensemble en direct
                    </button>
                  </div>

                  {/* Launcher Card 2: Floor Plan */}
                  <div
                    className="glass-card"
                    onClick={() => { setActiveTab('admin'); setAdminSubTab('map'); }}
                    style={{
                      padding: '2.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1.5rem',
                      cursor: 'pointer',
                      border: '1px solid var(--border-color)',
                      background: 'radial-gradient(circle at top left, rgba(0, 220, 255, 0.05), rgba(255,255,255,0.02))',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,220,255,0.15)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(0, 220, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-secondary)' }}>
                          <Trophy size={28} />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ADMINISTRATION <ArrowRight size={14} />
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem 0', fontWeight: 800 }}>Consulter le Plan de Salle</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                        Voir l'agencement physique des {Object.keys(tables).length} billards du club, l'occupation en salle et les QR codes individuels de chaque table.
                      </p>
                    </div>

                    <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '1rem' }}>
                      Voir le Plan de Salle complet
                    </button>
                  </div>

                  {/* Launcher Card 3: Bracket View */}
                  <div
                    className="glass-card"
                    onClick={() => {
                      if (!hasSureQualifiers) {
                        alert("L'accès à l'arbre des phases finales requiert au moins un joueur mathématiquement qualifié.");
                        return;
                      }
                      setActiveTab('dashboard');
                      setDashboardSubTab('bracket');
                    }}
                    style={{
                      padding: '2.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1.5rem',
                      cursor: hasSureQualifiers ? 'pointer' : 'not-allowed',
                      border: hasSureQualifiers ? '1px solid rgba(255, 204, 0, 0.4)' : '1px solid var(--border-color)',
                      background: hasSureQualifiers
                        ? 'radial-gradient(circle at top left, rgba(255, 204, 0, 0.08), rgba(255,255,255,0.02))'
                        : 'rgba(5, 8, 22, 0.5)',
                      opacity: hasSureQualifiers ? 1 : 0.65,
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (hasSureQualifiers) {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,204,0,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (hasSureQualifiers) {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '14px',
                          background: hasSureQualifiers ? 'rgba(255, 204, 0, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)'
                        }}>
                          {hasSureQualifiers ? <Swords size={28} /> : <Lock size={28} />}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {hasSureQualifiers ? 'PHASES FINALES' : 'VERROUILLÉ'} {hasSureQualifiers ? <ArrowRight size={14} /> : <Lock size={14} />}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem 0', fontWeight: 800 }}>Tableau des Phases Finales</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                        {hasSureQualifiers
                          ? "Visualiser l'arbre complet du tournoi : qui rencontre qui (Quarts, Demis, Finale), les projections en direct et le couronnement du champion."
                          : "Accessible dès qu'au moins 1 joueur est mathématiquement assuré de sa qualification dans les poules / matchs préliminaires."}
                      </p>
                    </div>

                    <button
                      className="btn btn-outline"
                      disabled={!hasSureQualifiers}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '1rem',
                        fontSize: '1rem',
                        borderColor: hasSureQualifiers ? 'rgba(255,204,0,0.4)' : 'rgba(255,255,255,0.1)',
                        color: hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: hasSureQualifiers ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {hasSureQualifiers ? <Trophy size={18} /> : <Lock size={18} />}
                      {hasSureQualifiers ? "Voir l'Arbre des Phases Finales" : "Arbre verrouillé (0 qualifié sûr)"}
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              /* Setup Form: No active tournament, or user toggled "configure new tournament" */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {showNewTourForm && activeTournament && (
                  <button
                    className="btn btn-outline"
                    style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => setShowNewTourForm(false)}
                  >
                    ← Revenir au tournoi en cours ({activeTournament.name})
                  </button>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '2.4rem', margin: '0 0 0.5rem 0', fontWeight: 900 }}>
                      Lanceur de Tournoi
                    </h2>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1rem' }}>
                      Définissez les règles, allouez les billards et sélectionnez les joueurs. Le tournoi sera prêt et lancera directement la vue d'ensemble.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2.5rem', alignItems: 'start' }}>

                  {/* Left Column: Rules & Tables Configuration */}
                  <div className="glass-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Tour Name */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nom du Tournoi</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ex: Open de Printemps 2026"
                        value={newTourName}
                        onChange={e => setNewTourName(e.target.value)}
                        style={{ fontSize: '1.1rem', padding: '0.9rem' }}
                      />
                    </div>

                    {/* Format Selector */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>Format de compétition</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                        {[
                          { id: 'direct_ko', label: 'Tableau Direct (KO)', badge: 'Arbre immédiat' },
                          { id: 'cartesien', label: 'Cartésien', badge: 'Poules' },
                          { id: 'robin', label: 'Poules Robin', badge: 'Championnat' },
                          { id: 'double_ko', label: 'Double KO', badge: 'Rattrapage' }
                        ].map(fmt => (
                          <div
                            key={fmt.id}
                            onClick={() => setNewTourFormat(fmt.id as any)}
                            style={{
                              padding: '1.1rem 0.8rem',
                              borderRadius: '12px',
                              border: newTourFormat === fmt.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                              background: newTourFormat === fmt.id ? 'rgba(0, 255, 204, 0.12)' : 'rgba(255,255,255,0.02)',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: newTourFormat === fmt.id ? 'var(--accent-primary)' : '#fff' }}>{fmt.label}</div>
                            <div style={{ fontSize: '0.72rem', color: newTourFormat === fmt.id ? 'var(--accent-primary)' : 'var(--text-muted)', marginTop: '0.2rem' }}>{fmt.badge}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notice si Tableau Direct KO */}
                    {newTourFormat === 'direct_ko' && (
                      <div style={{ padding: '1.2rem', background: 'rgba(0, 255, 204, 0.08)', borderRadius: '12px', border: '1px solid rgba(0, 255, 204, 0.25)', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <Trophy size={28} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: '1.4' }}>
                          <strong>Format Élimination Directe Immédiate :</strong> L'arbre de compétition (de 2 à 128 joueurs : 32èmes, 16èmes, 8èmes...) est généré directement avec les participants inscrits. Les Blancs éventuels qualifient automatiquement les meilleures têtes de série pour le tour suivant.
                        </div>
                      </div>
                    )}

                    {/* Qualif Rules (uniquement pour les formats avec poules) */}
                    {newTourFormat !== 'direct_ko' && (
                      <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.2rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          Phase de Qualification
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Type de match</label>
                            <select className="input-field" value={qualifIsWinningSets ? 'winning' : 'fixed'} onChange={e => setQualifIsWinningSets(e.target.value === 'winning')} style={{ appearance: 'none', background: '#050816', color: '#fff' }}>
                              <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                              <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Nombre (1 à 20 manches)
                            </label>
                            <input 
                              type="number" 
                              className="input-field" 
                              value={qualifNbSets} 
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setQualifNbSets(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }} 
                              min={1} 
                              max={20} 
                            />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Nombre de qualifiés pour le tableau final (2 à 128 joueurs)
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
                              {[2, 4, 8, 16, 32, 64, 128].map(n => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setQualifNbQualifiers(n)}
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '8px',
                                    border: qualifNbQualifiers === n ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                    background: qualifNbQualifiers === n ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.04)',
                                    color: qualifNbQualifiers === n ? 'var(--accent-primary)' : '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 700
                                  }}
                                >
                                  {n === 128 ? '128 (64es)' : n === 64 ? '64 (32es)' : n === 32 ? '32 (16es)' : n === 16 ? '16 (8es)' : n === 8 ? '8 (1/4)' : n === 4 ? '4 (1/2)' : '2 (Fin)'}
                                </button>
                              ))}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                              💡 <strong>Blancs automatiques :</strong> si le nombre n'est pas une puissance de 2 (ex: 10 qualifiés), l'arbre s'ajuste à la puissance supérieure (16) avec 6 Blancs attribués d'office aux meilleurs classés.
                            </div>
                            <input 
                              type="number" 
                              className="input-field" 
                              value={qualifNbQualifiers} 
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setQualifNbQualifiers(isNaN(val) ? 2 : Math.min(128, Math.max(2, val)));
                              }} 
                              min={2} 
                              max={128} 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Final Rules */}
                    <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '1.2rem', color: 'var(--accent-secondary)' }}>
                        Tableau Final
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Type de match</label>
                          <select className="input-field" value={finalIsWinningSets ? 'winning' : 'fixed'} onChange={e => setFinalIsWinningSets(e.target.value === 'winning')} style={{ appearance: 'none', background: '#050816', color: '#fff' }}>
                            <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                            <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Nombre (1 à 20 manches max)
                          </label>
                          <input 
                            type="number" 
                            className="input-field" 
                            value={finalNbSets} 
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              setFinalNbSets(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                            }} 
                            min={1} 
                            max={20} 
                          />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                          <input type="checkbox" checked={seedByMerit} onChange={e => setSeedByMerit(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)' }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>Tirage au mérite</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Le 1er des qualifiés affronte le dernier, etc.</div>
                          </div>
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                          <input type="checkbox" checked={hasThirdPlaceMatch} onChange={e => setHasThirdPlaceMatch(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)' }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>🥉 Petite Finale (match pour la 3ème place)</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Faire s'affronter les deux perdants des demi-finales</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Handicap Rules (Amateur vs Prestige) */}
                    <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.2rem', color: '#ffd700', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                          🎯 Handicap Niveaux (Amateur vs Prestige)
                        </h3>
                        <span style={{ fontSize: '0.75rem', background: handicapAmateurSets > 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: handicapAmateurSets > 0 ? '#ffd700' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                          {handicapAmateurSets > 0 ? `+${handicapAmateurSets} manche(s) d'avance` : 'Désactivé (Égalité)'}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1.2rem 0', lineHeight: '1.4' }}>
                        Donne automatiquement un avantage de score au joueur Amateur lorsqu'il affronte un joueur Prestige. Les duels entre deux joueurs du même niveau démarrent normalement à 0-0.
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.8rem' }}>
                        {[
                          { val: 0, label: '0 (Aucun)', sub: 'Départ à 0 - 0' },
                          { val: 1, label: '+1 manche', sub: 'Amateur démarre à 1 - 0' },
                          { val: 2, label: '+2 manches', sub: 'Amateur démarre à 2 - 0' },
                          { val: 3, label: '+3 manches', sub: 'Amateur démarre à 3 - 0' }
                        ].map(opt => {
                          const isSel = handicapAmateurSets === opt.val;
                          const isDis = opt.val > maxAllowedHandicap;
                          return (
                            <button
                              type="button"
                              key={opt.val}
                              disabled={isDis}
                              onClick={() => !isDis && setHandicapAmateurSets(opt.val)}
                              className="btn"
                              style={{
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0.9rem 0.6rem',
                                borderRadius: '10px',
                                border: isSel ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                                background: isSel ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.02)',
                                color: isSel ? '#ffd700' : (isDis ? 'rgba(255,255,255,0.3)' : '#fff'),
                                boxShadow: isSel ? '0 0 15px rgba(255, 215, 0, 0.25)' : 'none',
                                opacity: isDis ? 0.35 : 1,
                                cursor: isDis ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title={isDis ? `Incompatible avec le format : le handicap doit être strictement inférieur au nombre de manches gagnantes (${maxAllowedHandicap === 0 ? 'désactivé pour 1 manche gagnante' : `max +${maxAllowedHandicap}`}).` : opt.label}
                            >
                              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{opt.label}</span>
                              <span style={{ fontSize: '0.7rem', color: isSel ? 'rgba(255,215,0,0.8)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                                {isDis ? 'Incompatible' : opt.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {maxAllowedHandicap === 0 && (
                        <div style={{ marginTop: '0.9rem', padding: '0.8rem 1rem', background: 'rgba(255, 100, 100, 0.12)', border: '1px solid rgba(255, 100, 100, 0.35)', borderRadius: '10px', color: '#ffaaaa', fontSize: '0.82rem', lineHeight: '1.4' }}>
                          ⚠️ <strong>Règle de cohérence :</strong> vous avez sélectionné <strong>1 manche gagnante</strong>. Aucun handicap d'avance ne peut être accordé (+1, +2...), sinon le joueur amateur l'emporterait à 1-0 immédiatement au coup d'envoi sans jouer !
                        </div>
                      )}
                      {maxAllowedHandicap > 0 && maxAllowedHandicap < 3 && (
                        <div style={{ marginTop: '0.9rem', padding: '0.8rem 1rem', background: 'rgba(255, 215, 0, 0.08)', border: '1px solid rgba(255, 215, 0, 0.25)', borderRadius: '10px', color: '#ffd700', fontSize: '0.82rem', lineHeight: '1.4' }}>
                          💡 <strong>Limite de handicap :</strong> le handicap est plafonné à <strong>+{maxAllowedHandicap} manche(s)</strong> pour rester strictement inférieur au nombre de manches gagnantes.
                        </div>
                      )}
                    </div>

                    {/* Tables Allocation */}
                    <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.2rem', color: 'var(--accent-secondary)', margin: 0 }}>Billards alloués au tournoi</h3>
                        <button
                          className="btn"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', background: 'rgba(255,255,255,0.06)' }}
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('map'); }}
                        >
                          🗺️ Gérer le plan de salle
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.8rem' }}>
                        {Object.values(tables).map(t => {
                          const isSel = selectedTables.includes(t.id);
                          return (
                            <div
                              key={t.id}
                              onClick={() => toggleTableSelection(t.id)}
                              style={{
                                padding: '0.8rem 1rem',
                                background: isSel ? 'rgba(0, 255, 170, 0.12)' : 'rgba(255,255,255,0.03)',
                                color: isSel ? 'var(--accent-primary)' : '#fff',
                                border: '1px solid ' + (isSel ? 'var(--accent-primary)' : 'var(--border-color)'),
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.8rem',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                boxShadow: isSel ? '0 0 16px rgba(0, 255, 170, 0.2)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Realistic mini billiard table icon */}
                              <div style={{
                                width: '36px',
                                height: '22px',
                                background: 'radial-gradient(circle at center, #148f4b, #0c592f)',
                                border: '2px solid #5a341b',
                                borderRadius: '4px',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                flexShrink: 0
                              }}>
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff', boxShadow: '0 0 3px #fff' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {t.name || `Billard ${t.number}`}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: isSel ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                                  {isSel ? '✓ Sélectionné' : 'Cliquer pour allouer'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {selectedTables.length === 0 && (
                        <div style={{ color: '#ff6666', fontSize: '0.85rem', marginTop: '0.8rem' }}>
                          Veuillez sélectionner au moins un billard pour le tournoi.
                        </div>
                      )}
                    </div>

                    {/* Launch Tournament Action Button */}
                    <button
                      className="btn btn-neon"
                      style={{ padding: '1.3rem', fontSize: '1.2rem', fontWeight: 800, justifyContent: 'center' }}
                      onClick={() => {
                        if (!newTourName.trim()) return alert('Veuillez entrer un nom pour le tournoi.');
                        if (selectedPlayers.length < 2) return alert('Veuillez sélectionner au moins 2 joueurs inscrits.');
                        if (selectedTables.length === 0) return alert('Veuillez sélectionner au moins 1 billard.');
                        if (handicapAmateurSets > maxAllowedHandicap) {
                          return alert(`Configuration impossible : avec 1 manche gagnante (ou handicap >= nombre de manches gagnantes), l'amateur gagnerait instantanément sans jouer. Veuillez choisir un handicap de +${maxAllowedHandicap} manche(s) maximum.`);
                        }

                        createTournament(newTourName.trim(), newTourFormat, {
                          tableIds: selectedTables, qualifNbSets, qualifIsWinningSets, qualifNbQualifiers,
                          finalNbSets, finalIsWinningSets, seedByMerit, handicapAmateurSets,
                          hasThirdPlaceMatch
                        }, selectedPlayers);

                        setShowNewTourForm(false);
                        setActiveTab('dashboard');
                      }}
                    >
                      <Rocket size={22} /> Démarrer le Tournoi & Ouvrir la Vue d'ensemble
                    </button>

                  </div>

                  {/* Right Column: Player Registration Selection */}
                  <div className="glass-card" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 800 }}>Joueurs inscrits</h3>
                      <span style={{ color: 'var(--accent-primary)', fontSize: '1.3rem', fontWeight: 800 }}>
                        {selectedPlayers.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cochez pour inscrire :</span>
                      <button
                        className="btn"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'rgba(255,255,255,0.06)' }}
                        onClick={() => { setActiveTab('admin'); setAdminSubTab('players'); }}
                      >
                        + Ajouter un joueur
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '580px', paddingRight: '0.3rem' }}>
                      {Object.values(players).map(p => (
                        <div
                          key={p.id}
                          onClick={() => togglePlayerSelection(p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem',
                            background: selectedPlayers.includes(p.id) ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255,255,255,0.02)',
                            border: selectedPlayers.includes(p.id) ? '1px solid var(--accent-primary)' : '1px solid transparent',
                            borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: '2px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedPlayers.includes(p.id) ? 'var(--accent-primary)' : 'transparent', flexShrink: 0 }}>
                            {selectedPlayers.includes(p.id) && <div style={{ width: '10px', height: '10px', background: '#000' }} />}
                          </div>
                          <img src={p.avatarUrl} alt={p.name} style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p.name}</span>
                              {(p.level === 'Prestige' || p.level === 'Confirmé') ? (
                                <span style={{ fontSize: '0.65rem', background: 'rgba(255, 215, 0, 0.2)', color: '#ffd700', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(255, 215, 0, 0.4)', flexShrink: 0 }}>
                                  👑 Prestige
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.65rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                  Amateur
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.stats.matchesPlayed} matchs • {p.stats.winRate}% vict.</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. LIVE DASHBOARD TAB (VUE D'ENSEMBLE)                                    */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (() => {
          // If no tournament is currently running, show a friendly prompt to use the launcher
          if (!activeTournament) {
            return (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="glass-card" style={{ maxWidth: '600px', padding: '3.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0, 255, 170, 0.1)', border: '2px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Rocket size={40} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', color: '#fff' }}>Aucun tournoi en cours</h2>
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
                      La Vue d'ensemble est le poste de pilotage central en direct (billards live, scores en temps réel, QR codes des matchs, file d'attente et classement officiel).
                      <br />
                      Démarrez un tournoi depuis le <strong>Lanceur de tournoi</strong> pour l'activer.
                    </p>
                  </div>
                  <button className="btn btn-neon" style={{ padding: '0.9rem 2rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setActiveTab('launcher')}>
                    <Rocket size={18} /> Accéder au Lanceur de tournoi
                  </button>
                </div>
              </div>
            );
          }

          // --- Calculate Ranking ---
          const pStats: Record<string, { id: string; name: string; played: number; won: number; lost: number; sf: number; sa: number; pts: number }> = {};
          if (activeTournament) {
            activeTournament.participants.forEach(pId => {
              pStats[pId] = { id: pId, name: players[pId]?.name || 'Inconnu', played: 0, won: 0, lost: 0, sf: 0, sa: 0, pts: 0 };
            });
            allTourMatches.filter(m => !m.stage || m.stage === 'qualif').forEach(m => {
              if (m.status === 'finished') {
                const p1 = pStats[m.player1Id];
                const p2 = pStats[m.player2Id];
                if (p1 && p2) {
                  p1.played++; p2.played++;
                  p1.sf += m.score1; p1.sa += m.score2;
                  p2.sf += m.score2; p2.sa += m.score1;
                  if (m.score1 > m.score2) {
                    p1.won++; p1.pts += 3; p2.lost++;
                  } else if (m.score2 > m.score1) {
                    p2.won++; p2.pts += 3; p1.lost++;
                  } else {
                    p1.pts += 1; p2.pts += 1;
                  }
                }
              }
            });
          }
          const ranking = Object.values(pStats).sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            const diffDiff = (b.sf - b.sa) - (a.sf - a.sa);
            if (diffDiff !== 0) return diffDiff;
            if (b.sf !== a.sf) return b.sf - a.sf;
            const directMatch = allTourMatches.find(
              m => (!m.stage || m.stage === 'qualif') && m.status === 'finished' &&
              ((m.player1Id === a.id && m.player2Id === b.id) || (m.player1Id === b.id && m.player2Id === a.id))
            );
            if (directMatch) {
              if (directMatch.player1Id === a.id) {
                if (directMatch.score1 !== directMatch.score2) return directMatch.score2 - directMatch.score1;
              } else {
                if (directMatch.score2 !== directMatch.score1) return directMatch.score1 - directMatch.score2;
              }
            }
            return a.id.localeCompare(b.id);
          });

          const finishedMatches = allTourMatches.filter(m => m.status === 'finished').reverse();

          // Table mapping for all occupied tables
          const tableByCurrentMatchId: Record<string, string> = {};
          Object.values(tables).forEach(t => {
            if (t.status === 'occupied' && t.currentMatchId) {
              tableByCurrentMatchId[t.currentMatchId] = t.id;
            }
          });

          const getEffectiveTableId = (match: any): string | undefined => {
            return match.tableId || tableByCurrentMatchId[match.id];
          };

          // Safe, strictly deduplicated matchesToPlay: 1 match max per table, no player on 2 tables at once
          const { matchesToPlay, matchesWaiting } = (() => {
            const tableAssigned = new Map<string, any>();
            const busyPlayerSet = new Set<string>();

            // 1. Live playing matches get top priority
            pendingTourMatches.filter(m => m.status === 'playing').forEach(m => {
              const tId = getEffectiveTableId(m);
              if (tId && !tableAssigned.has(tId)) {
                tableAssigned.set(tId, m);
                if (m.player1Id) busyPlayerSet.add(m.player1Id);
                if (m.player2Id) busyPlayerSet.add(m.player2Id);
              }
            });

            // 2. Pending matches with a table assigned
            pendingTourMatches.filter(m => m.status === 'pending' && Boolean(getEffectiveTableId(m))).forEach(m => {
              const tId = getEffectiveTableId(m)!;
              if (!tableAssigned.has(tId)) {
                const p1Conflict = m.player1Id && busyPlayerSet.has(m.player1Id);
                const p2Conflict = m.player2Id && busyPlayerSet.has(m.player2Id);
                if (!p1Conflict && !p2Conflict) {
                  tableAssigned.set(tId, m);
                  if (m.player1Id) busyPlayerSet.add(m.player1Id);
                  if (m.player2Id) busyPlayerSet.add(m.player2Id);
                }
              }
            });

            const toPlay = Array.from(tableAssigned.values());
            const toPlayIds = new Set(toPlay.map(m => m.id));
            const waiting = pendingTourMatches.filter(m => !toPlayIds.has(m.id));

            return { matchesToPlay: toPlay, matchesWaiting: waiting };
          })();

          // Helper to check if any player in a match is already busy on an assigned table
          const getBusyPlayerInfo = (m: any) => {
            for (const activeM of matchesToPlay) {
              if (activeM.id === m.id) continue;
              const tId = getEffectiveTableId(activeM);
              const tObj = tId ? tables[tId] : null;
              const tName = tObj?.name || (tId ? `T.${tObj?.number || tId}` : 'un billard');

              if (m.player1Id && (activeM.player1Id === m.player1Id || activeM.player2Id === m.player1Id)) {
                return { busy: true, playerName: players[m.player1Id]?.name || 'Joueur 1', tableName: tName };
              }
              if (m.player2Id && (activeM.player1Id === m.player2Id || activeM.player2Id === m.player2Id)) {
                return { busy: true, playerName: players[m.player2Id]?.name || 'Joueur 2', tableName: tName };
              }
            }
            return { busy: false, playerName: '', tableName: '' };
          };

          if (dashboardSubTab === 'bracket') {
            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflowY: 'auto' }}>
                <TournamentBracketView onSelectTableForQR={setSelectedTableForQR} />
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.2rem' }}>
              {/* Alert banner if 1st vs 2nd anomaly detected in semi-finals */}
              {hasInvertedSemi && (
                <div style={{
                  background: 'rgba(255, 60, 60, 0.15)',
                  border: '2px solid #ff4d4d',
                  borderRadius: '16px',
                  padding: '1rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '50%',
                      background: 'rgba(255, 60, 60, 0.25)', border: '2px solid #ff4d4d',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4d'
                    }}>
                      <AlertTriangle size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                        Anomalie de croisement détectée : Le 1er affronte le 2ème !
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.8)' }}>
                        En tournoi officiel, le 1er doit jouer contre le 4ème et le 2ème contre le 3ème pour qu'ils ne se croisent qu'en finale.
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-neon"
                    style={{ background: '#00ffaa', color: '#000', fontWeight: 800, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.7rem 1.2rem' }}
                    onClick={() => reseedFinalStage(activeTournament.id)}
                  >
                    <RefreshCw size={16} /> Rétablir 1er vs 4ème
                  </button>
                </div>
              )}

              {/* Alert banner if qualifiers are known but final stage not launched yet */}
              {areAllQualifiersKnown && !activeTournament.finalStageLaunched && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 170, 0.15), rgba(0, 200, 255, 0.1))',
                  border: '2px solid var(--accent-primary)',
                  borderRadius: '16px',
                  padding: '1rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  boxShadow: '0 0 25px rgba(0, 255, 170, 0.25)',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '50%',
                      background: 'rgba(0, 255, 170, 0.2)', border: '2px solid var(--accent-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)'
                    }}>
                      <Trophy size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                        {qualifStatus.isQualifAllDone
                          ? "Tous les matchs de qualifications sont terminés !"
                          : `Les ${qualifStatus.numQualifiers} qualifiés sont connus !`}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {ranking.slice(0, qualifStatus.numQualifiers).map((p, idx) => `#${idx + 1} ${p.name}`).join(' • ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <button
                      className="btn btn-neon"
                      style={{ padding: '0.65rem 1.3rem', fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#000' }}
                      onClick={() => {
                        launchFinalStage(activeTournament.id);
                        setDashboardSubTab('bracket');
                      }}
                    >
                      <Sparkles size={16} /> Passer à la Phase Finale ➔
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr 340px', gap: '1.5rem', flex: 1, minHeight: 0 }}>

              {/* LEFT: Meta & QR + FILE D'ATTENTE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', height: '100%', overflowY: 'auto', paddingRight: '0.3rem' }}>
                {/* QR Code pour rejoindre l'appli */}
                <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', marginBottom: '0.2rem', fontWeight: 800 }}>{activeTournament.name}</h2>
                  <div style={{ background: '#fff', padding: '8px', borderRadius: '10px', marginBottom: '0.6rem', marginTop: '0.6rem' }}>
                    <QRCode value={getClubShareUrl()} size={115} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--card-text-muted)', margin: 0 }}>Scannez pour rejoindre l'application</p>

                  <button
                    className="btn btn-outline"
                    style={{ marginTop: '0.8rem', width: '100%', fontSize: '0.75rem', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    onClick={() => setActiveTab('launcher')}
                  >
                    <Rocket size={13} /> Gérer dans le Lanceur
                  </button>
                </div>

                {/* File d'attente (directement sous le QR code) */}
                <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '280px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <h3 style={{ fontSize: '1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                      <Users size={16} style={{ color: 'var(--accent-secondary)' }} /> File d'attente
                    </h3>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-secondary)', padding: '2px 7px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 229, 255, 0.3)' }}>
                      {matchesWaiting.length} {matchesWaiting.length > 1 ? 'matchs' : 'match'}
                    </span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.2rem' }}>
                    {matchesWaiting.length === 0 ? (
                      <div style={{ color: 'var(--card-text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1.5rem' }}>
                        Aucun match en attente.
                      </div>
                    ) : (
                      matchesWaiting.map((match, idx) => {
                        const busyInfo = getBusyPlayerInfo(match);

                        return (
                          <div
                            key={match.id}
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              padding: '0.6rem 0.8rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.3rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>#{idx + 1}</span>
                              {match.stage && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  {match.stage}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                              <span style={{ fontWeight: 600, color: '#fff' }}>{players[match.player1Id]?.name || 'Attente...'}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 4px' }}>VS</span>
                              <span style={{ fontWeight: 600, color: '#fff' }}>{players[match.player2Id]?.name || 'Attente...'}</span>
                            </div>

                            {/* Warning badge if player is busy on another table */}
                            {busyInfo.busy && (
                              <div style={{ fontSize: '0.65rem', color: '#ffb703', background: 'rgba(255, 183, 3, 0.12)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255, 183, 3, 0.3)', marginTop: '0.1rem' }}>
                                ⚠️ {busyInfo.playerName} déjà sur {busyInfo.tableName}
                              </div>
                            )}

                            {/* Quick assign buttons if tournament tables exist */}
                            {activeTournament.settings?.tableIds && activeTournament.settings.tableIds.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Placer :</span>
                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                  {activeTournament.settings.tableIds.map(tId => {
                                    const tObj = tables[tId];
                                    const label = tObj ? `T.${tObj.number}` : tId;
                                    return (
                                      <button
                                        key={tId}
                                        className="btn btn-outline"
                                        disabled={busyInfo.busy}
                                        style={{
                                          fontSize: '0.65rem',
                                          padding: '2px 6px',
                                          height: '20px',
                                          lineHeight: 1,
                                          opacity: busyInfo.busy ? 0.35 : 1,
                                          cursor: busyInfo.busy ? 'not-allowed' : 'pointer'
                                        }}
                                        title={busyInfo.busy ? `Impossible : ${busyInfo.playerName} est déjà sur ${busyInfo.tableName}` : `Assigner directement à ${tObj?.name || label}`}
                                        onClick={() => {
                                          if (busyInfo.busy) {
                                            alert(`Impossible : ${busyInfo.playerName} est déjà sur ${busyInfo.tableName}`);
                                            return;
                                          }
                                          const res = assignMatchToTable(match.id, tId);
                                          if (!res.success && res.reason) {
                                            alert(res.reason);
                                          }
                                        }}
                                      >
                                        ▶ {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* CENTER: Main Operations (Map + Matches) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', position: 'relative', padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <h2 style={{ fontSize: '1.3rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                      <MonitorPlay size={20} style={{ color: 'var(--accent-primary)' }} /> Billards du Tournoi en Live
                      <span style={{ fontSize: '0.8rem', background: 'rgba(0, 255, 170, 0.12)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 255, 170, 0.3)' }}>
                        {activeTournament.settings?.tableIds.length || 0} billards
                      </span>
                    </h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Cliquez sur une table pour afficher son QR code ou gérer le match
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    {renderMap(false, undefined, true)}
                  </div>
                </div>

                {/* Matchs à démarrer */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.4rem', color: 'var(--card-text-muted)', marginBottom: '1rem' }}>Matchs à démarrer</h2>
                  {matchesToPlay.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Aucun match prêt à jouer.</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {matchesToPlay.map(match => {
                      const effTableId = getEffectiveTableId(match);
                      const tableObj = effTableId ? tables[effTableId] : null;
                      const tableName = tableObj?.name || (effTableId ? `Table ${tableObj?.number || effTableId}` : 'Table');

                      return (
                        <div key={match.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '8px', opacity: match.status === 'playing' ? 0.3 : 1 }}>
                            <QRCode value={JSON.stringify({ tournamentId: match.tournamentId || activeTournament.id, matchId: match.id, tableId: effTableId || match.tableId || '', clubId: currentClub.id })} size={80} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                              <span style={{ color: 'var(--accent-secondary)', fontWeight: 800, fontSize: '0.9rem' }}>{tableName}</span>
                              {match.stage && match.stage !== 'qualif' && (
                                <span style={{
                                  background: 'rgba(255, 215, 0, 0.2)',
                                  color: '#ffd700',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(255, 215, 0, 0.4)'
                                }}>
                                  {match.stage === 'final' ? '🏆 Finale' : match.stage === 'semi' ? '⚔️ 1/2 Finale' : '🎯 1/4 Finale'}
                                </span>
                              )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{players[match.player1Id]?.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>VS</div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{players[match.player2Id]?.name}</div>
                            {match.status === 'playing' ? (
                              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <div style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 'bold' }}>Match en cours</div>
                                {effTableId && (
                                  <button
                                    className="btn btn-outline"
                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', width: '100%', justifyContent: 'center' }}
                                    onClick={() => setSelectedTableForQR(effTableId)}
                                  >
                                    Modifier le score
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                                <button
                                  className="btn btn-neon"
                                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', color: '#000', fontWeight: 800 }}
                                  onClick={() => {
                                    startTournamentMatch(match.id, false);
                                    if (effTableId) setSelectedTableForQR(effTableId);
                                  }}
                                >
                                  <Play size={12} /> Démarrer
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                                  onClick={() => {
                                    if (effTableId && matchesWaiting.length > 0) {
                                      setPostponingMatchModal({ matchId: match.id, tableId: effTableId });
                                    } else {
                                      postponeMatch(match.id);
                                    }
                                  }}
                                >
                                  <ArrowUpDown size={12} /> Repousser
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT: Ranking & Results */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%' }}>
                {/* Ranking */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', flex: 1, overflow: 'hidden' }}>
                  <h2 style={{ fontSize: '1.2rem', color: 'var(--accent-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Trophy size={18} /> Classement Actuel
                  </h2>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', backdropFilter: 'blur(10px)', zIndex: 1 }}>
                        <tr style={{ color: 'var(--card-text-muted)', borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '0.5rem' }}>#</th>
                          <th style={{ padding: '0.5rem' }}>Joueur</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>V</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>+/-</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--accent-primary)' }}>PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.map((p, i) => {
                          const isSure = qualifStatus.sureQualifiers.includes(p.id);
                          const isQualifyingZone = i < qualifStatus.numQualifiers;
                          const isCutoff = i === qualifStatus.numQualifiers - 1 && i < ranking.length - 1;
                          return (
                            <tr
                              key={p.id}
                              style={{
                                borderBottom: isCutoff ? '2px dashed rgba(0, 255, 170, 0.4)' : '1px solid var(--border-color)',
                                background: isQualifyingZone ? 'rgba(0, 255, 170, 0.05)' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '0.5rem', fontWeight: 800, color: isQualifyingZone ? 'var(--accent-primary)' : 'inherit' }}>{i + 1}</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{p.name}</span>
                                  {isSure && (
                                    <span style={{ fontSize: '0.65rem', background: 'rgba(0, 255, 170, 0.2)', color: 'var(--accent-primary)', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(0, 255, 170, 0.3)' }} title="Mathématiquement qualifié">
                                      Qualifié
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--accent-primary)' }}>{p.won}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>{p.sf - p.sa > 0 ? `+${p.sf - p.sa}` : p.sf - p.sa}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 800, color: 'var(--accent-primary)' }}>{p.pts}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    className="btn btn-outline"
                    disabled={!hasSureQualifiers}
                    style={{
                      marginTop: '0.8rem',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      color: hasSureQualifiers ? 'var(--accent-primary)' : 'var(--text-muted)',
                      borderColor: hasSureQualifiers ? 'rgba(0, 255, 170, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      opacity: hasSureQualifiers ? 1 : 0.5,
                      cursor: hasSureQualifiers ? 'pointer' : 'not-allowed'
                    }}
                    onClick={() => {
                      if (!hasSureQualifiers) {
                        alert("L'arbre des phases finales n'est pas encore accessible : aucun joueur n'est mathématiquement qualifié pour le moment.");
                        return;
                      }
                      setDashboardSubTab('bracket');
                    }}
                  >
                    {hasSureQualifiers ? <Trophy size={15} /> : <Lock size={15} />}
                    {hasSureQualifiers ? "Voir l'arbre des Phases Finales" : "Arbre verrouillé (0 qualifié sûr)"}
                  </button>
                </div>

                {/* Match Results */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--card-text-muted)', margin: 0 }}>Derniers Résultats</h2>
                    <button
                      className="btn btn-outline"
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.25rem 0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        borderColor: isAdminUnlocked ? 'rgba(0, 255, 170, 0.4)' : 'rgba(255, 255, 255, 0.15)',
                        color: isAdminUnlocked ? 'var(--accent-primary)' : 'var(--text-muted)'
                      }}
                      onClick={() => {
                        if (isAdminUnlocked) {
                          setIsAdminUnlocked(false);
                          setEditingFinishedMatchId(null);
                        } else {
                          const pin = prompt("Entrez le code PIN Admin (1234) pour modifier les scores :");
                          if (pin === '1234') {
                            setIsAdminUnlocked(true);
                          } else if (pin !== null) {
                            alert("Code PIN incorrect.");
                          }
                        }
                      }}
                    >
                      {isAdminUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                      {isAdminUnlocked ? 'Admin actif' : 'Modifier'}
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
                    {finishedMatches.length === 0 ? (
                      <div style={{ color: 'var(--card-text-muted)', textAlign: 'center', marginTop: '1rem' }}>Aucun match terminé.</div>
                    ) : (
                      finishedMatches.map(m => {
                        const isEditing = editingFinishedMatchId === m.id;

                        if (isEditing) {
                          return (
                            <div
                              key={m.id}
                              style={{
                                background: 'rgba(0, 255, 170, 0.06)',
                                border: '1px solid var(--accent-primary)',
                                padding: '0.8rem',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                              }}
                            >
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                ✏️ Modification du score
                              </div>

                              {/* Player 1 & 2 Score Modification */}
                              {(() => {
                                const matchRules = getMatchScoringRules(m, activeTournament);
                                const minS1 = m.handicapP1 || 0;
                                const minS2 = m.handicapP2 || 0;
                                const canInc1 = matchRules.isWinningSets
                                  ? (editFinishedScore1 < matchRules.maxSets && editFinishedScore2 < matchRules.maxSets)
                                  : ((editFinishedScore1 + editFinishedScore2) < matchRules.maxSets);
                                const canDec1 = editFinishedScore1 > minS1;
                                const canInc2 = matchRules.isWinningSets
                                  ? (editFinishedScore2 < matchRules.maxSets && editFinishedScore1 < matchRules.maxSets)
                                  : ((editFinishedScore1 + editFinishedScore2) < matchRules.maxSets);
                                const canDec2 = editFinishedScore2 > minS2;

                                return (
                                  <>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                                      Format : {matchRules.formatLabel}
                                    </div>

                                    {/* Player 1 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{players[m.player1Id]?.name}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <button
                                          className="btn btn-outline"
                                          disabled={!canDec1}
                                          style={{ padding: '2px 8px', fontSize: '0.8rem', opacity: canDec1 ? 1 : 0.3, cursor: canDec1 ? 'pointer' : 'not-allowed' }}
                                          onClick={() => canDec1 && setEditFinishedScore1(editFinishedScore1 - 1)}
                                        >
                                          -
                                        </button>
                                        <span style={{ fontWeight: 800, minWidth: '1.5rem', textAlign: 'center' }}>{editFinishedScore1}</span>
                                        <button
                                          className="btn btn-outline"
                                          disabled={!canInc1}
                                          style={{ padding: '2px 8px', fontSize: '0.8rem', opacity: canInc1 ? 1 : 0.3, cursor: canInc1 ? 'pointer' : 'not-allowed' }}
                                          onClick={() => canInc1 && setEditFinishedScore1(editFinishedScore1 + 1)}
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {/* Player 2 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{players[m.player2Id]?.name}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <button
                                          className="btn btn-outline"
                                          disabled={!canDec2}
                                          style={{ padding: '2px 8px', fontSize: '0.8rem', opacity: canDec2 ? 1 : 0.3, cursor: canDec2 ? 'pointer' : 'not-allowed' }}
                                          onClick={() => canDec2 && setEditFinishedScore2(editFinishedScore2 - 1)}
                                        >
                                          -
                                        </button>
                                        <span style={{ fontWeight: 800, minWidth: '1.5rem', textAlign: 'center' }}>{editFinishedScore2}</span>
                                        <button
                                          className="btn btn-outline"
                                          disabled={!canInc2}
                                          style={{ padding: '2px 8px', fontSize: '0.8rem', opacity: canInc2 ? 1 : 0.3, cursor: canInc2 ? 'pointer' : 'not-allowed' }}
                                          onClick={() => canInc2 && setEditFinishedScore2(editFinishedScore2 + 1)}
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}

                              {/* Actions */}
                              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                                <button
                                  className="btn btn-neon"
                                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }}
                                  onClick={() => {
                                    updateFinishedMatchScore(m.id, editFinishedScore1, editFinishedScore2);
                                    setEditingFinishedMatchId(null);
                                  }}
                                >
                                  Valider
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }}
                                  onClick={() => setEditingFinishedMatchId(null)}
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={m.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', padding: '0.8rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', opacity: m.score1 > m.score2 ? 1 : 0.5 }}>
                              <span style={{ fontWeight: m.score1 > m.score2 ? 700 : 400, color: m.score1 > m.score2 ? 'var(--accent-primary)' : 'var(--card-text)' }}>{players[m.player1Id]?.name}</span>
                              <span style={{ fontWeight: 800 }}>{m.score1}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', opacity: m.score2 > m.score1 ? 1 : 0.5 }}>
                              <span style={{ fontWeight: m.score2 > m.score1 ? 700 : 400, color: m.score2 > m.score1 ? 'var(--accent-primary)' : 'var(--card-text)' }}>{players[m.player2Id]?.name}</span>
                              <span style={{ fontWeight: 800 }}>{m.score2}</span>
                            </div>

                            {isAdminUnlocked && (
                              <button
                                className="btn btn-outline"
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.5rem',
                                  marginTop: '0.2rem',
                                  alignSelf: 'flex-end',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  borderColor: 'rgba(255,255,255,0.15)',
                                  color: 'var(--accent-primary)'
                                }}
                                onClick={() => {
                                  setEditingFinishedMatchId(m.id);
                                  setEditFinishedScore1(m.score1);
                                  setEditFinishedScore2(m.score2);
                                }}
                              >
                                <Edit2 size={11} /> Corriger le score
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

        {/* ========================================================================= */}
        {/* 3. ADMINISTRATION TAB (SUB-MENUS: PLAN DE SALLE & JOUEURS)               */}
        {/* ========================================================================= */}
        {activeTab === 'admin' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

            {/* Sub-menu 1: Plan de Salle */}
            {adminSubTab === 'map' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.3rem 0' }}>Plan de la Salle ({Object.keys(tables).length} billards)</h2>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {isAdminUnlocked ? "Mode Édition: Glissez-déposez les billards pour réorganiser l'espace du club." : "Mode Lecture: Vue d'ensemble de la salle. Déverrouillez ci-dessus pour déplacer ou ajouter des tables."}
                    </span>
                  </div>
                </div>
                {renderMap(isAdminUnlocked, undefined, false)}
              </div>
            )}

            {/* Sub-menu 2: Joueurs */}
            {adminSubTab === 'players' && (
              <div style={{ display: 'grid', gridTemplateColumns: isAdminUnlocked ? '1fr 360px' : '1fr', gap: '2.5rem', height: '100%', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.3rem 0' }}>Pédigré des Joueurs ({Object.keys(players).length})</h2>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {isAdminUnlocked ? "Mode Édition: Modifiez les fiches joueurs ou ajoutez de nouveaux membres." : "Mode Lecture: Consulter les statistiques et niveaux des joueurs."}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', overflowY: 'auto' }}>
                    {Object.values(players).map(p => (
                      <div key={p.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', position: 'relative' }}>

                        {editingPlayerId === p.id ? (
                          // Edit Mode
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <input type="text" className="input-field" value={editPlayerName} onChange={e => setEditPlayerName(e.target.value)} />
                            <select className="input-field" value={editPlayerLevel === 'Confirmé' ? 'Prestige' : editPlayerLevel} onChange={e => setEditPlayerLevel(e.target.value)} style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
                              <option value="Amateur" style={{ color: '#000' }}>Amateur</option>
                              <option value="Prestige" style={{ color: '#000' }}>👑 Prestige</option>
                            </select>
                            <input type="file" accept="image/*" onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => setEditPlayerPhoto(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }} style={{ fontSize: '0.8rem' }} />
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <button className="btn" style={{ background: 'var(--accent-primary)', color: '#000' }} onClick={() => { updatePlayer(p.id, editPlayerName, editPlayerLevel, editPlayerPhoto || undefined); setEditingPlayerId(null); }}>Sauvegarder</button>
                              <button className="btn btn-outline" onClick={() => setEditingPlayerId(null)}>Annuler</button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <>
                            <img src={p.avatarUrl} alt={p.name} style={{ width: '70px', height: '70px', borderRadius: '50%', border: `3px solid ${(p.level === 'Prestige' || p.level === 'Confirmé') ? '#ffd700' : 'var(--border-color)'}`, objectFit: 'cover' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{p.name}</div>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: (p.level === 'Prestige' || p.level === 'Confirmé') ? '#ffd700' : 'var(--text-muted)',
                                fontSize: '0.85rem',
                                marginBottom: '0.4rem',
                                fontWeight: 700
                              }}>
                                {(p.level === 'Prestige' || p.level === 'Confirmé') ? '👑 Prestige' : 'Amateur'}
                              </div>
                              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Matchs:</span> <b>{p.stats.matchesPlayed}</b></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Victoires:</span> <b>{p.stats.winRate}%</b></div>
                              </div>
                            </div>
                            {isAdminUnlocked && (
                              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '0.4rem' }}>
                                <button onClick={() => {
                                  setEditingPlayerId(p.id);
                                  setEditPlayerName(p.name);
                                  setEditPlayerLevel(p.level === 'Confirmé' ? 'Prestige' : p.level);
                                  setEditPlayerPhoto(null);
                                }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', width: '28px', height: '28px', borderRadius: '4px' }}>✎</button>
                                <button onClick={() => {
                                  if (window.confirm(`Supprimer ${p.name} ?`)) deletePlayer(p.id);
                                }} style={{ background: 'rgba(255,0,0,0.2)', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.9rem', width: '28px', height: '28px', borderRadius: '4px' }}>✕</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Player Sidebar if unlocked */}
                {isAdminUnlocked && (
                  <div className="glass-card" style={{ padding: '2rem', height: 'fit-content' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={18} /> Nouveau Joueur
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nom & Prénom</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Ex: John Doe"
                          value={newPlayerName}
                          onChange={e => setNewPlayerName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Niveau</label>
                        <select
                          className="input-field"
                          value={newPlayerLevel === 'Confirmé' ? 'Prestige' : newPlayerLevel}
                          onChange={e => setNewPlayerLevel(e.target.value)}
                          style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                        >
                          <option value="Amateur" style={{ color: '#000' }}>Amateur</option>
                          <option value="Prestige" style={{ color: '#000' }}>👑 Prestige</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Photo (depuis l'ordinateur)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            style={{ fontSize: '0.8rem' }}
                          />
                          {newPlayerPhoto && <img src={newPlayerPhoto} alt="Aperçu" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />}
                        </div>
                      </div>
                      <button
                        className="btn btn-neon"
                        style={{ marginTop: '1rem', justifyContent: 'center' }}
                        onClick={() => {
                          if (!newPlayerName.trim()) return alert('Veuillez entrer un nom.');
                          addPlayer(newPlayerName.trim(), newPlayerLevel, newPlayerPhoto || undefined);
                          setNewPlayerName('');
                          setNewPlayerPhoto(null);
                        }}
                      >
                        Ajouter au club
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-menu 3: Configuration Club & Multi-Club */}
            {adminSubTab === 'club' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', maxWidth: '1200px', width: '100%', margin: '0 auto', overflowY: 'auto', paddingBottom: '2rem' }}>
                
                {/* LEFT: Club Identity Settings */}
                <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <Building2 size={24} color="var(--accent-primary)" />
                    <div>
                      <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Identité du Club</h2>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Personnalisez le nom et l'affichage pour votre établissement
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nom du Club</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ex: Billard Club 41"
                      value={clubNameInput}
                      onChange={e => setClubNameInput(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Code / Identifiant unique (pour l'URL)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ex: bc41, bc-romorantin"
                      value={clubIdInput}
                      onChange={e => setClubIdInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Utilisé dans l'adresse web pour isoler les données du club (lettres minuscules, chiffres et tirets).
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>URL du Logo</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="/logo.png ou lien https://"
                      value={clubLogoInput}
                      onChange={e => setClubLogoInput(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <button
                      className="btn btn-neon"
                      style={{ padding: '0.75rem 1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}
                      onClick={() => {
                        const trimmedName = clubNameInput.trim() || 'Mon Club Billard';
                        const trimmedId = clubIdInput.trim() || 'bc41';
                        setClub({
                          name: trimmedName,
                          id: trimmedId,
                          logoUrl: clubLogoInput.trim() || defaultClubLogo
                        });
                        setClubSavedFeedback(true);
                        setTimeout(() => setClubSavedFeedback(false), 3000);
                      }}
                    >
                      <Check size={18} /> Enregistrer les informations
                    </button>

                    {clubSavedFeedback && (
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={16} /> Enregistré avec succès !
                      </span>
                    )}
                  </div>
                </div>

                {/* RIGHT: Online & Multi-PC Access */}
                <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <Rocket size={24} color="var(--accent-secondary)" />
                    <div>
                      <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Accès en Ligne & Multi-Clubs</h2>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Lien direct pour smartphones et autres ordinateurs
                      </p>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Lien direct pour rejoindre ce club :
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        readOnly
                        className="input-field"
                        value={getClubShareUrl()}
                        style={{ fontSize: '0.85rem', background: 'rgba(0,0,0,0.4)', color: 'var(--accent-primary)', fontWeight: 600 }}
                      />
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
                        onClick={() => {
                          navigator.clipboard.writeText(getClubShareUrl());
                          setCopiedClubUrl(true);
                          setTimeout(() => setCopiedClubUrl(false), 2500);
                        }}
                      >
                        {copiedClubUrl ? <Check size={16} color="var(--accent-primary)" /> : <Copy size={16} />}
                        {copiedClubUrl ? 'Copié !' : 'Copier'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
                      <QRCode value={getClubShareUrl()} size={160} />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      Flashez ce QR Code pour ouvrir directement <b>{currentClub.name}</b> sur un smartphone ou une tablette.
                    </span>
                  </div>

                  <div style={{ background: 'rgba(0, 255, 170, 0.05)', border: '1px solid rgba(0, 255, 170, 0.2)', borderRadius: '10px', padding: '0.9rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    <b style={{ color: '#fff' }}>Utiliser dans un autre club :</b><br/>
                    Ouvrez simplement l'application sur le PC de l'autre club via le navigateur web, et créez ou sélectionnez son identifiant (ex: <code>?club=bc-blois</code>). Chaque club gère ses propres tables, joueurs et tournois !
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      </main>

      {/* QR Code Modal for Tables */}
      {selectedTableForQR && (() => {
        const table = tables[selectedTableForQR];
        if (!table) return null;
        let candidateMatch = table.currentMatchId ? matches[table.currentMatchId] : null;
        if (!candidateMatch || candidateMatch.status === 'finished') {
          candidateMatch = Object.values(matches).find(m => m.tableId === table.id && m.status !== 'finished') || null;
        }
        const match = (candidateMatch && candidateMatch.status !== 'finished') ? candidateMatch : null;

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedTableForQR(null)}>
            <div className="glass-card" style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', minWidth: '350px' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize: '2rem', margin: 0 }}>{table.name || `Table ${table.number}`}</h2>
              {match?.stage && match.stage !== 'qualif' && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 215, 0, 0.2)',
                  color: '#ffd700',
                  padding: '4px 14px',
                  borderRadius: '20px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  border: '1px solid rgba(255, 215, 0, 0.4)',
                  marginTop: '-1rem'
                }}>
                  {match.stage === 'final' ? '🏆 GRANDE FINALE' : match.stage === 'semi' ? '⚔️ DEMI-FINALE' : '🎯 1/4 DE FINALE'}
                </div>
              )}

              {justScannedMatchId && match && match.id === justScannedMatchId ? (
                /* 1. Just scanned success feedback */
                <div style={{ textAlign: 'center', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '76px', height: '76px', borderRadius: '50%',
                    background: 'rgba(0, 255, 170, 0.2)',
                    border: '3px solid var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--accent-primary)',
                    boxShadow: '0 0 25px rgba(0, 255, 170, 0.4)'
                  }}>
                    <CheckCircle2 size={44} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.5rem', color: 'var(--accent-primary)', margin: '0 0 0.4rem 0', fontWeight: 900 }}>
                      Match scanné avec succès !
                    </h3>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      {players[match.player1Id]?.name} <span style={{ color: 'var(--text-muted)' }}>VS</span> {players[match.player2Id]?.name}
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                    Le match démarre sur {table.name || `la Table ${table.number}`}. Fermeture automatique...
                  </p>
                </div>
              ) : match ? (
                match.status === 'playing' ? (
                  /* 2. Match already in progress: Allow score adjustment, validation & freeing table */
                  (() => {
                    const matchTour = match.tournamentId ? tournaments[match.tournamentId] : activeTournament;
                    const scoringRules = getMatchScoringRules(match, matchTour);
                    const { maxSets, isWinningSets, minScore1, minScore2, formatLabel } = scoringRules;

                    const isMatchFinished = isWinningSets
                      ? (match.score1 >= maxSets || match.score2 >= maxSets)
                      : ((match.score1 + match.score2) >= maxSets);

                    const canP1Increment = isWinningSets
                      ? (!isMatchFinished && match.score1 < maxSets)
                      : ((match.score1 + match.score2) < maxSets);

                    const canP1Decrement = match.score1 > minScore1;

                    const canP2Increment = isWinningSets
                      ? (!isMatchFinished && match.score2 < maxSets)
                      : ((match.score1 + match.score2) < maxSets);

                    const canP2Decrement = match.score2 > minScore2;

                    const leadingPlayerId = isWinningSets
                      ? (match.score1 >= maxSets ? match.player1Id : (match.score2 >= maxSets ? match.player2Id : undefined))
                      : (isMatchFinished ? (match.score1 > match.score2 ? match.player1Id : (match.score2 > match.score1 ? match.player2Id : undefined)) : undefined);

                    return (
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem', width: '100%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(0, 255, 170, 0.15)', color: 'var(--accent-primary)',
                            padding: '6px 16px', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem',
                            border: '1px solid rgba(0, 255, 170, 0.3)'
                          }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
                            MATCH EN DIRECT
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.2rem' }}>
                            <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', color: 'var(--accent-secondary)', padding: '2px 10px', borderRadius: '12px', border: '1px solid var(--border-color)', fontWeight: 700 }}>
                              🎯 Format : {formatLabel}
                            </span>
                            {(Boolean(match.handicapP1) || Boolean(match.handicapP2)) && (
                              <span style={{ fontSize: '0.78rem', background: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', padding: '2px 10px', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.3)', fontWeight: 700 }}>
                                🎯 Handicap : +{match.handicapP1 || match.handicapP2} pour {players[match.handicapP1 ? match.player1Id : match.player2Id]?.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Players & Scores with interactive adjustments */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                          width: '100%', background: 'rgba(255, 255, 255, 0.03)',
                          padding: '1.2rem 1rem', borderRadius: '16px', border: '1px solid var(--border-color)'
                        }}>
                          {/* Player 1 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                              {players[match.player1Id]?.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                className="btn-surface"
                                disabled={!canP1Decrement}
                                style={{
                                  width: '34px', height: '34px', borderRadius: '50%', padding: 0,
                                  opacity: canP1Decrement ? 1 : 0.3, cursor: canP1Decrement ? 'pointer' : 'not-allowed'
                                }}
                                title={!canP1Decrement ? (minScore1 > 0 ? "Score minimum (Handicap actif)" : "Score minimum (0)") : "Retirer une manche"}
                                onClick={() => canP1Decrement && updateMatchScore(match.id, match.score1 - 1, match.score2)}
                              >
                                <Minus size={16} />
                              </button>
                              <span style={{ fontSize: '2.5rem', fontWeight: 900, minWidth: '40px', textAlign: 'center' }}>
                                {match.score1}
                              </span>
                              <button
                                className="btn-surface"
                                disabled={!canP1Increment}
                                style={{
                                  width: '34px', height: '34px', borderRadius: '50%', padding: 0,
                                  opacity: canP1Increment ? 1 : 0.3, cursor: canP1Increment ? 'pointer' : 'not-allowed'
                                }}
                                title={!canP1Increment ? (isMatchFinished ? "Match terminé (score max atteint)" : "Score max atteint") : "Ajouter une manche"}
                                onClick={() => canP1Increment && updateMatchScore(match.id, match.score1 + 1, match.score2)}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            {minScore1 > 0 && (
                              <span style={{ fontSize: '0.68rem', color: '#ffd700', fontWeight: 700 }}>
                                (dont +{minScore1} handicap)
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-muted)' }}>VS</div>

                          {/* Player 2 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                              {players[match.player2Id]?.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                className="btn-surface"
                                disabled={!canP2Decrement}
                                style={{
                                  width: '34px', height: '34px', borderRadius: '50%', padding: 0,
                                  opacity: canP2Decrement ? 1 : 0.3, cursor: canP2Decrement ? 'pointer' : 'not-allowed'
                                }}
                                title={!canP2Decrement ? (minScore2 > 0 ? "Score minimum (Handicap actif)" : "Score minimum (0)") : "Retirer une manche"}
                                onClick={() => canP2Decrement && updateMatchScore(match.id, match.score1, match.score2 - 1)}
                              >
                                <Minus size={16} />
                              </button>
                              <span style={{ fontSize: '2.5rem', fontWeight: 900, minWidth: '40px', textAlign: 'center' }}>
                                {match.score2}
                              </span>
                              <button
                                className="btn-surface"
                                disabled={!canP2Increment}
                                style={{
                                  width: '34px', height: '34px', borderRadius: '50%', padding: 0,
                                  opacity: canP2Increment ? 1 : 0.3, cursor: canP2Increment ? 'pointer' : 'not-allowed'
                                }}
                                title={!canP2Increment ? (isMatchFinished ? "Match terminé (score max atteint)" : "Score max atteint") : "Ajouter une manche"}
                                onClick={() => canP2Increment && updateMatchScore(match.id, match.score1, match.score2 + 1)}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            {minScore2 > 0 && (
                              <span style={{ fontSize: '0.68rem', color: '#ffd700', fontWeight: 700 }}>
                                (dont +{minScore2} handicap)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progression or Finish Banner */}
                        {isMatchFinished ? (
                          <div style={{
                            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(0, 255, 170, 0.2))',
                            border: '1px solid #ffd700',
                            borderRadius: '12px',
                            padding: '0.7rem 1.2rem',
                            width: '100%',
                            boxSizing: 'border-box',
                            color: '#ffd700',
                            fontWeight: 900,
                            fontSize: '0.95rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 0 15px rgba(255, 215, 0, 0.2)'
                          }}>
                            <Trophy size={18} />
                            {leadingPlayerId
                              ? `Victoire de ${players[leadingPlayerId]?.name} (${match.score1} - ${match.score2})`
                              : `Match terminé sur une Égalité (${match.score1} - ${match.score2})`}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {isWinningSets
                              ? `Progression : premier joueur à atteindre ${maxSets} point${maxSets > 1 ? 's' : ''}`
                              : `Progression : ${match.score1 + match.score2} / ${maxSets} manche${maxSets > 1 ? 's' : ''} jouée${maxSets > 1 ? 's' : ''}`}
                          </div>
                        )}

                        {/* Admin Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
                          <button
                            className="btn btn-neon"
                            style={{
                              width: '100%', justifyContent: 'center', padding: '0.9rem',
                              fontWeight: 800, fontSize: '1rem', color: '#000',
                              background: isMatchFinished ? 'var(--accent-primary)' : 'rgba(0, 255, 170, 0.75)'
                            }}
                            onClick={() => {
                              if (!isMatchFinished) {
                                const confirmEarly = window.confirm(
                                  `Attention : le match n'est pas encore terminé selon les paramètres (${formatLabel}).\n\nScore actuel : ${match.score1} - ${match.score2}\n\nVoulez-vous vraiment valider ce match maintenant ?`
                                );
                                if (!confirmEarly) return;
                              }
                              if (match.stage && match.stage !== 'qualif' && match.score1 === match.score2) {
                                alert("Impossible de terminer un match de phase finale sur une égalité ! Un joueur doit remporter le match pour avancer.");
                                return;
                              }
                              finishMatch(match.id);
                              setSelectedTableForQR(null);
                            }}
                          >
                            <CheckCircle2 size={20} />
                            {isMatchFinished ? 'Valider le score & Terminer le match' : 'Valider le score actuel & Terminer'}
                          </button>

                          <button
                            className="btn btn-outline"
                            style={{ width: '100%', justifyContent: 'center', color: '#ff4466', borderColor: 'rgba(255, 68, 102, 0.4)', fontSize: '0.85rem' }}
                            onClick={() => {
                              if (window.confirm("Forcer la libération de ce billard ? Le match sera remis en attente.")) {
                                freeTable(table.id);
                                setSelectedTableForQR(null);
                              }
                            }}
                          >
                            <XCircle size={16} /> Forcer la libération de ce billard
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* 3. Match pending: Show QR code to scan */
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{players[match.player1Id]?.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0' }}>VS</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{players[match.player2Id]?.name}</div>
                    </div>

                    <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <QRCode value={JSON.stringify({ tournamentId: match.tournamentId || activeTournament?.id || '', matchId: match.id, tableId: table.id || match.tableId || '', clubId: currentClub.id })} size={200} />
                      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666', wordBreak: 'break-all', textAlign: 'center', userSelect: 'all', cursor: 'copy' }} title="Copier ce texte pour la simulation">
                        {JSON.stringify({ tournamentId: match.tournamentId || activeTournament?.id || '', matchId: match.id, tableId: table.id || match.tableId || '', clubId: currentClub.id })}
                      </div>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, textAlign: 'center' }}>
                      Scannez ce QR Code avec votre smartphone pour démarrer ce match
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', marginTop: '0.5rem' }}>
                      <button
                        className="btn btn-neon"
                        style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, padding: '0.85rem', color: '#000' }}
                        onClick={() => {
                          startTournamentMatch(match.id, false);
                        }}
                      >
                        <Play size={18} /> Démarrer ce match sur le billard
                      </button>

                      <button
                        className="btn btn-outline"
                        style={{ width: '100%', justifyContent: 'center', color: 'var(--text-muted)', borderColor: 'var(--border-color)', fontSize: '0.85rem' }}
                        onClick={() => {
                          freeTable(table.id);
                          setSelectedTableForQR(null);
                        }}
                      >
                        <XCircle size={16} /> Libérer ce billard (remettre le match en attente)
                      </button>
                    </div>
                  </>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', width: '100%' }}>
                  <div style={{ fontSize: '1.2rem', color: '#fff' }}>Aucun match assigné</div>
                  <p style={{ margin: 0, textAlign: 'center' }}>
                    {activeTournament?.settings?.tableIds.includes(table.id)
                      ? 'En attente du prochain match du tournoi.'
                      : "Ce billard n'est pas utilisé par le tournoi en cours."}
                  </p>

                  {table.status === 'occupied' && (
                    <button
                      className="btn btn-outline"
                      style={{ color: '#ff4466', borderColor: 'rgba(255, 68, 102, 0.4)', marginTop: '0.5rem' }}
                      onClick={() => {
                        freeTable(table.id);
                        setSelectedTableForQR(null);
                      }}
                    >
                      <XCircle size={16} /> Forcer la libération (ce billard est marqué occupé)
                    </button>
                  )}
                </div>
              )}

              {/* Live Streaming Overlay Section */}
              <div style={{
                background: 'rgba(0, 255, 170, 0.05)',
                border: '1px solid rgba(0, 255, 170, 0.25)',
                borderRadius: '14px',
                padding: '1.2rem',
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: 'var(--accent-primary)', fontSize: '0.95rem' }}>
                    <MonitorPlay size={18} /> Overlay Streaming (OBS / Prism)
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                    Facebook & YouTube
                  </span>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                  Incrustez le score en temps réel par-dessus votre caméra dans <b>OBS Studio</b> ou <b>Prism Live Studio</b> (Source Navigateur avec fond transparent).
                </p>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    className="btn btn-neon"
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.6rem', justifyContent: 'center' }}
                    onClick={() => {
                      const origin = window.location.hostname === 'localhost' ? 'https://192.168.1.15:5173' : window.location.origin;
                      const overlayUrl = `${origin}?overlay=${table.id}`;
                      navigator.clipboard.writeText(overlayUrl);
                      setCopiedOverlay(true);
                      setTimeout(() => setCopiedOverlay(false), 2500);
                    }}
                  >
                    {copiedOverlay ? '✓ Lien copié !' : '📋 Copier le lien Overlay'}
                  </button>
                  <a
                    href={`?overlay=${table.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                    style={{ fontSize: '0.85rem', padding: '0.6rem 1rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    👁️ Tester
                  </a>
                </div>
              </div>

              <button className="btn btn-outline" onClick={() => setSelectedTableForQR(null)}>Fermer</button>
            </div>
          </div>
        );
      })()}

      {/* Modal: Choisir un match de remplacement lors du report */}
      {postponingMatchModal && (() => {
        const curMatch = matches[postponingMatchModal.matchId];
        const curTable = tables[postponingMatchModal.tableId];
        const tableName = curTable?.name || `Table ${curTable?.number || postponingMatchModal.tableId}`;

        // Find available waiting matches from active tournament
        const activeTourMatches = activeTournament ? Object.values(matches).filter(m => activeTournament.matches.includes(m.id)) : [];
        const waitingList = activeTourMatches.filter(m => m.status === 'pending' && !m.tableId && m.id !== postponingMatchModal.matchId);

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(6px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setPostponingMatchModal(null)}
          >
            <div
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '540px',
                background: '#0d1326',
                border: '1px solid rgba(0, 255, 170, 0.4)',
                padding: '1.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.2rem',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div>
                <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: 0, fontWeight: 800 }}>
                  Repousser le match sur {tableName}
                </h3>
                {curMatch && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0' }}>
                    Match repoussé : <b style={{ color: '#fff' }}>{players[curMatch.player1Id]?.name}</b> VS <b style={{ color: '#fff' }}>{players[curMatch.player2Id]?.name}</b>
                  </p>
                )}
              </div>

              {/* Option 1: Automatic rotation */}
              <button
                className="btn btn-outline"
                style={{
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.03)'
                }}
                onClick={() => {
                  postponeMatch(postponingMatchModal.matchId);
                  setPostponingMatchModal(null);
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RotateCcw size={15} style={{ color: 'var(--accent-primary)' }} /> Mettre en fin de file (Rotation automatique)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Le match retourne en queue et la table prendra automatiquement le prochain match prêt
                  </div>
                </div>
                <ArrowRight size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginLeft: '0.5rem' }} />
              </button>

              {/* Option 2: Pick specific match */}
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--accent-secondary)', fontWeight: 800, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Ou choisir directement le remplaçant sur {tableName} :
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.3rem' }}>
                  {waitingList.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem' }}>
                      Aucun autre match en attente dans la file.
                    </div>
                  ) : (
                    waitingList.map((m, idx) => {
                      // Check if either player is already busy on another table (excluding the one being replaced)
                      let busyConflict: { busy: boolean; playerName: string; tableName: string } = { busy: false, playerName: '', tableName: '' };
                      for (const otherMatch of Object.values(matches)) {
                        if (otherMatch.id === m.id || otherMatch.id === postponingMatchModal.matchId || otherMatch.status === 'finished') continue;
                        const effTId = otherMatch.tableId || Object.values(tables).find(t => t.currentMatchId === otherMatch.id)?.id;
                        if (effTId && effTId !== postponingMatchModal.tableId) {
                          if (m.player1Id && (otherMatch.player1Id === m.player1Id || otherMatch.player2Id === m.player1Id)) {
                            const busyT = tables[effTId];
                            busyConflict = { busy: true, playerName: players[m.player1Id]?.name || 'Joueur 1', tableName: busyT?.name || `Table ${busyT?.number || effTId}` };
                            break;
                          }
                          if (m.player2Id && (otherMatch.player1Id === m.player2Id || otherMatch.player2Id === m.player2Id)) {
                            const busyT = tables[effTId];
                            busyConflict = { busy: true, playerName: players[m.player2Id]?.name || 'Joueur 2', tableName: busyT?.name || `Table ${busyT?.number || effTId}` };
                            break;
                          }
                        }
                      }

                      return (
                        <div
                          key={m.id}
                          style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            padding: '0.7rem 0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.8rem'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>#{idx + 1}</span>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff' }}>
                                {players[m.player1Id]?.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>VS</span> {players[m.player2Id]?.name}
                              </span>
                            </div>
                            {m.stage && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: '0.1rem', textTransform: 'uppercase' }}>
                                {m.stage}
                              </div>
                            )}
                            {busyConflict.busy && (
                              <div style={{ fontSize: '0.7rem', color: '#ffb703', marginTop: '0.15rem' }}>
                                ⚠️ {busyConflict.playerName} déjà sur {busyConflict.tableName}
                              </div>
                            )}
                          </div>

                          {busyConflict.busy ? (
                            <button
                              className="btn btn-outline"
                              disabled
                              style={{ fontSize: '0.75rem', padding: '0.4rem 0.7rem', whiteSpace: 'nowrap', opacity: 0.35, cursor: 'not-allowed' }}
                              title={`Impossible : ${busyConflict.playerName} est déjà sur ${busyConflict.tableName}`}
                            >
                              Occupé
                            </button>
                          ) : (
                            <button
                              className="btn btn-neon"
                              style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                              onClick={() => {
                                postponeMatch(postponingMatchModal.matchId, m.id);
                                setPostponingMatchModal(null);
                              }}
                            >
                              Placer ici ▶
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <button
                className="btn btn-outline"
                style={{ width: '100%', marginTop: '0.4rem' }}
                onClick={() => setPostponingMatchModal(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        );
      })()}

      {/* Alert Modal: Les qualifiés sont connus ! Continuer le cartésien ou passer à la phase finale ? */}
      {showQualifAlertModal && activeTournament && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 10500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div className="glass-card" style={{
            maxWidth: '560px',
            width: '100%',
            padding: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            border: '2px solid var(--accent-primary)',
            boxShadow: '0 0 40px rgba(0, 255, 170, 0.35)',
            animation: 'fadeIn 0.25s ease'
          }}>
            {/* Header Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '54px', height: '54px', borderRadius: '50%',
                background: 'rgba(0, 255, 170, 0.2)', border: '2px solid var(--accent-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)',
                boxShadow: '0 0 20px rgba(0, 255, 170, 0.4)'
              }}>
                <Trophy size={30} />
              </div>
              <div>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)',
                  letterSpacing: '1px', textTransform: 'uppercase'
                }}>
                  Notification Tournoi
                </span>
                <h2 style={{ fontSize: '1.5rem', margin: '0.1rem 0 0 0', fontWeight: 900, color: '#fff' }}>
                  Les qualifiés sont connus !
                </h2>
              </div>
            </div>

            {/* Description */}
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
              {qualifStatus.isQualifAllDone
                ? `Tous les matchs de qualifications (cartésien) sont terminés ! Les ${qualifStatus.numQualifiers} qualifiés pour la Phase Finale sont officiellement validés.`
                : `Les ${qualifStatus.numQualifiers} qualifiés pour la Phase Finale sont désormais mathématiquement assurés (${qualifStatus.sureQualifiers.length}/${qualifStatus.numQualifiers}).`}
              <br /><br />
              <b>Voulez-vous continuer les matchs de cartésien restants ou passer directement à la phase finale ?</b>
            </p>

            {/* Qualified Players Preview */}
            <div style={{
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '12px',
              padding: '1rem',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem'
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Joueurs qualifiés pour l'arbre final :
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
                {qualifStatus.ranking.slice(0, qualifStatus.numQualifiers).map((p, idx) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    background: 'rgba(0, 255, 170, 0.08)', padding: '0.5rem 0.8rem',
                    borderRadius: '8px', border: '1px solid rgba(0, 255, 170, 0.25)'
                  }}>
                    <span style={{ fontWeight: 900, color: 'var(--accent-primary)', fontSize: '0.9rem' }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {p.pts} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Two Action Choices */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button
                className="btn btn-outline"
                style={{ flex: 1, padding: '0.9rem', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 700 }}
                onClick={() => setDismissedQualifAlertTourId(activeTournament.id)}
              >
                Continuer le cartésien
              </button>

              <button
                className="btn btn-neon"
                style={{ flex: 1.3, padding: '0.9rem', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, color: '#000', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => {
                  setDismissedQualifAlertTourId(activeTournament.id);
                  launchFinalStage(activeTournament.id);
                  setDashboardSubTab('bracket');
                }}
              >
                <Sparkles size={18} /> Passer à la Phase Finale ➔
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminView;
