import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import QRCode from 'react-qr-code';
import {
  Trophy, Users, MonitorPlay, Settings, Rocket,
  Lock, Unlock, ArrowRight, Play, AlertTriangle, RotateCcw,
  Swords, CheckCircle2, Building2, Copy, Check,
  XCircle, Minus, Plus, Edit2, ArrowUpDown, Sparkles, RefreshCw,
  Radio, Tv, Trash2, Shuffle,
  Search, X, Volume2, VolumeX, Clock, UserPlus,
  Sun, Moon, MoreHorizontal
} from 'lucide-react';
import TournamentBracketView from './TournamentBracketView';
import LeaderboardView from './LeaderboardView';
import { LiveOverlayEditorPanel } from './LiveOverlayEditorPanel';
import MultiCamDirectorPanel from './MultiCamDirectorPanel';
import MatchTimerBadge from './MatchTimerBadge';
import { getTournamentQualificationStatus } from '../utils/qualifiers';
import { computeTournamentScheduleContext, sortTournamentMatchesForScheduling, getMatchStakeInfo } from '../utils/matchScheduler';
import {
  isVoiceAnnouncerEnabled,
  setVoiceAnnouncerEnabled,
  announceMatchOnTable,
  announceWaitingMatchPrep,
  announceAllReadyMatches,
  processAutoVoiceAnnouncements,
  speakAnnouncement,
  listAvailableFrenchVoices,
  getSelectedVoiceURI,
  setSelectedVoiceURI,
  getActiveFrenchVoiceLabel,
  FrenchVoiceOption
} from '../utils/voiceAnnouncer';
import BilliardTableVisual from './BilliardTableVisual';
import { APP_VERSION } from '../version';
import { useNeonFx } from '../utils/neonFx';
import { useTheme } from '../utils/theme';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMaxAllowedQualifHandicap, getMaxAllowedFinalHandicap, getMatchScoringRules, resolveMatchDurationMinutes } from '../utils/rules';
import { isFinalStageMatch, isByeMatch, isRealFinishedMatch } from '../utils/bracket';
import { formatShortDateTime } from '../utils/timeFormat';
import { getPlayerAvatar } from '../utils/avatar';

interface QualifiersCountSelectorProps {
  value: number;
  onChange: (nextVal: number) => void;
  participantsCount: number;
  nbPoules?: number;
  disabled?: boolean;
  disabledNote?: string;
}

/** Sélecteur réutilisable du nombre de qualifiés / sortants (gère la saisie clavier libre + bornes). */
const QualifiersCountSelector: React.FC<QualifiersCountSelectorProps> = ({
  value,
  onChange,
  participantsCount,
  nbPoules = 1,
  disabled = false,
  disabledNote
}) => {
  const maxAllowed = participantsCount >= 3
    ? participantsCount - 1
    : (participantsCount === 2 ? 2 : 128);
  const clampedValue = Math.min(maxAllowed, Math.max(2, value || 2));
  const [draft, setDraft] = useState<string>(() => String(clampedValue));

  React.useEffect(() => {
    setDraft(String(clampedValue));
  }, [clampedValue]);

  const commitDraft = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = isNaN(parsed) ? 2 : Math.min(maxAllowed, Math.max(2, parsed));
    setDraft(String(next));
    if (next !== value) {
      onChange(next);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
          Nombre de sortants / qualifiés pour le tableau final (2 à {maxAllowed} joueurs)
        </label>
        {participantsCount >= 3 && (
          <span style={{ fontSize: '0.75rem', background: 'rgba(0, 255, 204, 0.12)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 255, 204, 0.3)' }}>
            Max : {maxAllowed} qualifiés ({participantsCount} inscrits - 1)
          </span>
        )}
      </div>

      {disabled ? (
        <div style={{
          padding: '0.65rem 0.85rem',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          color: '#cbd5e1',
          fontSize: '0.82rem',
          fontWeight: 700
        }}>
          🔒 {clampedValue} qualifiés — {disabledNote || 'Phase finale déjà lancée.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
            {[2, 4, 8, 16, 32, 64, 128].map(n => {
              const isDis = participantsCount >= 3 && n > maxAllowed;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={isDis}
                  onClick={() => {
                    if (!isDis) {
                      setDraft(String(n));
                      onChange(n);
                    }
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    border: clampedValue === n ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: clampedValue === n ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.04)',
                    color: clampedValue === n ? 'var(--accent-primary)' : (isDis ? 'rgba(255,255,255,0.25)' : '#fff'),
                    cursor: isDis ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    opacity: isDis ? 0.35 : 1
                  }}
                  title={isDis ? `Impossible avec ${participantsCount} inscrits : il faut au moins 1 éliminé (max ${maxAllowed} qualifiés)` : undefined}
                >
                  {n === 128 ? '128 (64es)' : n === 64 ? '64 (32es)' : n === 32 ? '32 (16es)' : n === 16 ? '16 (8es)' : n === 8 ? '8 (1/4)' : n === 4 ? '4 (1/2)' : '2 (Fin)'}
                </button>
              );
            })}
            {participantsCount >= 3 && ![2, 4, 8, 16, 32, 64, 128].includes(maxAllowed) && (
              <button
                type="button"
                onClick={() => {
                  setDraft(String(maxAllowed));
                  onChange(maxAllowed);
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: clampedValue === maxAllowed ? '1px solid var(--accent-primary)' : '1px solid rgba(0, 255, 204, 0.3)',
                  background: clampedValue === maxAllowed ? 'rgba(0, 255, 204, 0.25)' : 'rgba(0, 255, 204, 0.08)',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}
              >
                {maxAllowed} (Max : {participantsCount - 1})
              </button>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: participantsCount < 3 ? '#ffcc00' : 'var(--accent-primary)', marginBottom: '0.5rem', lineHeight: '1.4' }}>
            {participantsCount >= 3 ? (
              <span>
                💡 <strong>Règle d'élimination :</strong> Sur {participantsCount} joueurs inscrits, il doit y avoir au moins 1 éliminé (maximum {maxAllowed} qualifiés).
                {nbPoules > 1 && clampedValue >= nbPoules && (
                  <> (~{Math.ceil(clampedValue / nbPoules)} par poule).</>
                )}
                {clampedValue % 2 !== 0 && ' Les Blancs éventuels seront automatiquement attribués aux premiers du classement.'}
              </span>
            ) : (
              <span>
                💡 <strong>Règle d'élimination :</strong> En poules / cartésien, au moins 1 joueur doit être éliminé pour que la phase de qualification ait un sens (max qualifiés = inscrits - 1).
              </span>
            )}
          </div>
          <input
            type="number"
            className="input-field"
            value={draft}
            onChange={e => {
              const raw = e.target.value;
              setDraft(raw);
              const parsed = parseInt(raw, 10);
              if (!isNaN(parsed) && parsed >= 2) {
                onChange(Math.min(maxAllowed, parsed));
              }
            }}
            onBlur={e => commitDraft(e.target.value)}
            min={2}
            max={maxAllowed}
          />
        </>
      )}
    </div>
  );
};

const AdminView: React.FC = () => {
  const {
    tournaments, matches, players, tables, currentClub, setClub,
    createTournament, addPlayer, updatePlayer, deletePlayer,
    updateTablePosition, addTable, removeTable, postponeMatch,
    endTournament, finishMatch, freeTable, updateMatchScore,
    launchMatchOnTable, updateFinishedMatchScore, startTournamentMatch,
    launchFinalStage, reseedFinalStage, setTableLiveStream, setMatchLiveStream,
    updateTournamentSettings, recomputePlayerStats
  } = useStore();
  const [theme, , toggleTheme] = useTheme();

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;
  const isTournamentActive = Boolean(activeTournament);

  const [activeTab, setActiveTab] = useState<'launcher' | 'dashboard' | 'live_studio' | 'admin' | 'leaderboard'>(() => {
    return isTournamentActive ? 'dashboard' : 'launcher';
  });
  const hasAutoSwitchedToDashboard = React.useRef(false);
  React.useEffect(() => {
    if (isTournamentActive && !hasAutoSwitchedToDashboard.current) {
      hasAutoSwitchedToDashboard.current = true;
      setActiveTab('dashboard');
    }
  }, [isTournamentActive]);

  const [dashboardSubTab, setDashboardSubTab] = useState<'live' | 'bracket'>('live');
  const [adminSubTab, setAdminSubTab] = useState<'map' | 'players' | 'club'>('map');
  const [showNewTourForm, setShowNewTourForm] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [selectedTableForQR, setSelectedTableForQR] = useState<string | null>(null);
  const [justScannedMatchId, setJustScannedMatchId] = useState<string | null>(null);
  const [overlayPos, setOverlayPos] = useState<'top' | 'bottom'>('bottom');
  const [dismissedQualifAlertTourId, setDismissedQualifAlertTourId] = useState<string | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => isVoiceAnnouncerEnabled());
  const [showPrefsMenu, setShowPrefsMenu] = useState(false);
  const [neonEnabled, toggleNeonFx] = useNeonFx();
  const [expandedQueueMatchId, setExpandedQueueMatchId] = useState<string | null>(null);
  const [openBillardMenuId, setOpenBillardMenuId] = useState<string | null>(null);
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState<string | null>(() => getSelectedVoiceURI());
  const [availableFrenchVoices, setAvailableFrenchVoices] = useState<FrenchVoiceOption[]>(() => listAvailableFrenchVoices());
  const matchStatusAtOpenRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refreshVoices = () => setAvailableFrenchVoices(listAvailableFrenchVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
    };
  }, []);

  const toggleVoiceAnnouncer = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceAnnouncerEnabled(next);
    if (next) {
      speakAnnouncement("Appel vocal des matchs activé.", true);
    }
  };

  // Club Configuration State
  const [clubNameInput, setClubNameInput] = useState(currentClub.name);
  const [clubIdInput, setClubIdInput] = useState(currentClub.id);
  const [clubLogoInput, setClubLogoInput] = useState(currentClub.logoUrl || defaultClubLogo);
  const [clubSavedFeedback, setClubSavedFeedback] = useState(false);
  const [copiedClubUrl, setCopiedClubUrl] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSmallDesktop = viewportWidth < 1280;
  const isNarrowScreen = viewportWidth < 960;

  const getAppBaseUrl = () => {
    if (typeof window === 'undefined') return '';
    if (window.location.hostname === 'localhost') {
      return __LAN_URL__.replace(/\/+$/, '');
    }
    const cleanPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    return `${window.location.origin}${cleanPath}`;
  };

  const getClubShareUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${getAppBaseUrl()}/?club=${currentClub.id}`;
  };

  const getMatchShareUrl = (matchId: string, tableId?: string, tourId?: string) => {
    if (typeof window === 'undefined') return '';
    let url = `${getAppBaseUrl()}/?club=${currentClub.id}&match=${encodeURIComponent(matchId)}`;
    if (tableId) url += `&table=${encodeURIComponent(tableId)}`;
    if (tourId) url += `&tour=${encodeURIComponent(tourId)}`;
    return url;
  };

  // Tournament Setup State
  const [newTourName, setNewTourName] = useState('');
  const [newTourFormat, setNewTourFormat] = useState<any>('cartesien');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [launcherPlayerSearch, setLauncherPlayerSearch] = useState('');
  const [qualifNbSetsAmateur, setQualifNbSetsAmateur] = useState(1);
  const [qualifNbSetsPrestige, setQualifNbSetsPrestige] = useState(1);
  const [qualifNbSetsMixed, setQualifNbSetsMixed] = useState(1);
  const [qualifIsWinningSets, setQualifIsWinningSets] = useState(true);
  const [qualifNbQualifiers, setQualifNbQualifiers] = useState(2);
  const [qualifNbPoules, setQualifNbPoules] = useState(1);
  const [customPoolsDistribution, setCustomPoolsDistribution] = useState<Record<string, string[]>>({});
  const [activePoolRankingTab, setActivePoolRankingTab] = useState<string>('all');

  const [finalNbSetsAmateur, setFinalNbSetsAmateur] = useState(3);
  const [finalNbSetsPrestige, setFinalNbSetsPrestige] = useState(3);
  const [finalNbSetsMixed, setFinalNbSetsMixed] = useState(3);
  const [finalIsWinningSets, setFinalIsWinningSets] = useState(true);
  const [seedByMerit, setSeedByMerit] = useState(true);
  const [qualifHandicapAmateurSets, setQualifHandicapAmateurSets] = useState(0);
  const [qualifMatchDurationMinutes, setQualifMatchDurationMinutes] = useState(0);
  const [finalHandicapAmateurSets, setFinalHandicapAmateurSets] = useState(0);
  const [finalMatchDurationMinutes, setFinalMatchDurationMinutes] = useState(0);
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(true);

  // Configuration spécifique Grande Finale
  const [grandFinalCustom, setGrandFinalCustom] = useState(false);
  const [grandFinalIsWinningSets, setGrandFinalIsWinningSets] = useState(true);
  const [grandFinalNbSetsAmateur, setGrandFinalNbSetsAmateur] = useState(4);
  const [grandFinalNbSetsPrestige, setGrandFinalNbSetsPrestige] = useState(5);
  const [grandFinalNbSetsMixed, setGrandFinalNbSetsMixed] = useState(5);
  const [grandFinalHandicapAmateurSets, setGrandFinalHandicapAmateurSets] = useState(0);

  // Configuration spécifique Petite Finale (3ème place)
  const [thirdPlaceCustom, setThirdPlaceCustom] = useState(false);
  const [thirdPlaceIsWinningSets, setThirdPlaceIsWinningSets] = useState(true);
  const [thirdPlaceNbSetsAmateur, setThirdPlaceNbSetsAmateur] = useState(3);
  const [thirdPlaceNbSetsPrestige, setThirdPlaceNbSetsPrestige] = useState(3);
  const [thirdPlaceNbSetsMixed, setThirdPlaceNbSetsMixed] = useState(3);
  const [thirdPlaceHandicapAmateurSets, setThirdPlaceHandicapAmateurSets] = useState(0);

  // Modal d'édition des règles pour tournoi actif
  const [showEditRulesModal, setShowEditRulesModal] = useState(false);
  const [editTourSettings, setEditTourSettings] = useState<any>(null);

  const maxAllowedQualifHandicap = getMaxAllowedQualifHandicap(qualifNbSetsMixed, qualifIsWinningSets);
  const maxAllowedFinalHandicap = getMaxAllowedFinalHandicap(finalNbSetsMixed, finalIsWinningSets);
  const maxAllowedGrandFinalHandicap = getMaxAllowedFinalHandicap(grandFinalNbSetsMixed, grandFinalIsWinningSets);
  const maxAllowedThirdPlaceHandicap = getMaxAllowedFinalHandicap(thirdPlaceNbSetsMixed, thirdPlaceIsWinningSets);

  const isPoolFormat = newTourFormat !== 'direct_ko' && newTourFormat !== 'double_ko_bracket';

  // Nettoyer automatiquement selectedPlayers si un joueur a été supprimé ou est invalide
  React.useEffect(() => {
    setSelectedPlayers(prev => {
      const cleaned = prev.filter(id => Boolean(id && players[id]?.name));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [players]);

  React.useEffect(() => {
    if (isPoolFormat && selectedPlayers.length >= 3) {
      const maxSortants = selectedPlayers.length - 1;
      if (qualifNbQualifiers > maxSortants) {
        setQualifNbQualifiers(Math.max(2, maxSortants));
      }
    }
  }, [selectedPlayers.length, newTourFormat, qualifNbQualifiers]);

  React.useEffect(() => {
    if (selectedPlayers.length > 0) {
      const maxPoules = Math.max(1, Math.floor(selectedPlayers.length / 2));
      if (qualifNbPoules > maxPoules) {
        setQualifNbPoules(maxPoules);
      }
    }
  }, [selectedPlayers.length, qualifNbPoules]);

  // Synchronisation de la répartition personnalisée des poules
  React.useEffect(() => {
    if (qualifNbPoules <= 1 || selectedPlayers.length === 0) {
      setCustomPoolsDistribution({});
      return;
    }
    const poolLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const currentPoolNames = Array.from({ length: qualifNbPoules }).map((_, i) => `Poule ${poolLetters[i] || (i + 1)}`);

    setCustomPoolsDistribution(prev => {
      const nextDist: Record<string, string[]> = {};
      currentPoolNames.forEach(pName => { nextDist[pName] = []; });

      const alreadyAssigned = new Set<string>();
      currentPoolNames.forEach(pName => {
        const existing = (prev[pName] || []).filter(pId => selectedPlayers.includes(pId));
        nextDist[pName] = existing;
        existing.forEach(pId => alreadyAssigned.add(pId));
      });

      selectedPlayers.forEach(pId => {
        if (!alreadyAssigned.has(pId)) {
          let minPool = currentPoolNames[0];
          let minCount = nextDist[minPool].length;
          currentPoolNames.forEach(pName => {
            if (nextDist[pName].length < minCount) {
              minCount = nextDist[pName].length;
              minPool = pName;
            }
          });
          nextDist[minPool].push(pId);
          alreadyAssigned.add(pId);
        }
      });

      return nextDist;
    });
  }, [selectedPlayers, qualifNbPoules]);

  const movePlayerToPool = (playerId: string, targetPool: string) => {
    setCustomPoolsDistribution(prev => {
      const next: Record<string, string[]> = {};
      Object.keys(prev).forEach(pName => {
        next[pName] = (prev[pName] || []).filter(id => id !== playerId);
      });
      if (!next[targetPool]) next[targetPool] = [];
      next[targetPool] = [...next[targetPool], playerId];
      return next;
    });
  };

  const shufflePoolsDistribution = () => {
    const poolLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const currentPoolNames = Array.from({ length: qualifNbPoules }).map((_, i) => `Poule ${poolLetters[i] || (i + 1)}`);
    const nextDist: Record<string, string[]> = {};
    currentPoolNames.forEach(pName => { nextDist[pName] = []; });

    const shuffled = [...selectedPlayers].sort(() => 0.5 - Math.random());
    shuffled.forEach((pId, idx) => {
      const pName = currentPoolNames[idx % qualifNbPoules];
      nextDist[pName].push(pId);
    });
    setCustomPoolsDistribution(nextDist);
  };

  React.useEffect(() => {
    if (qualifHandicapAmateurSets > maxAllowedQualifHandicap) {
      setQualifHandicapAmateurSets(maxAllowedQualifHandicap);
    }
  }, [maxAllowedQualifHandicap, qualifHandicapAmateurSets]);

  React.useEffect(() => {
    if (finalHandicapAmateurSets > maxAllowedFinalHandicap) {
      setFinalHandicapAmateurSets(maxAllowedFinalHandicap);
    }
  }, [maxAllowedFinalHandicap, finalHandicapAmateurSets]);

  React.useEffect(() => {
    if (grandFinalHandicapAmateurSets > maxAllowedGrandFinalHandicap) {
      setGrandFinalHandicapAmateurSets(maxAllowedGrandFinalHandicap);
    }
  }, [maxAllowedGrandFinalHandicap, grandFinalHandicapAmateurSets]);

  React.useEffect(() => {
    if (thirdPlaceHandicapAmateurSets > maxAllowedThirdPlaceHandicap) {
      setThirdPlaceHandicapAmateurSets(maxAllowedThirdPlaceHandicap);
    }
  }, [maxAllowedThirdPlaceHandicap, thirdPlaceHandicapAmateurSets]);

  // New Player State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerLevel, setNewPlayerLevel] = useState<any>('Amateur');
  const [newPlayerPhoto, setNewPlayerPhoto] = useState<string | null>(null);
  const [newPlayerClubName, setNewPlayerClubName] = useState('');
  const [newPlayerClubLogo, setNewPlayerClubLogo] = useState<string | null>(null);

  // Edit Player State
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerLevel, setEditPlayerLevel] = useState<any>('Amateur');
  const [editPlayerPhoto, setEditPlayerPhoto] = useState<string | null>(null);
  const [editPlayerClubName, setEditPlayerClubName] = useState('');
  const [editPlayerClubLogo, setEditPlayerClubLogo] = useState<string | null>(null);

  // Standalone Live Studio State ('live_studio' tab)
  const [liveStudioSubTab, setLiveStudioSubTab] = useState<'cameras' | 'overlay'>('cameras');

  const readImageFile = (file: File, setter: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setter(canvas.toDataURL('image/png', 0.85));
        } else {
          setter(src);
        }
      };
      img.onerror = () => setter(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Finished Match Score Correction State (Admin Mode)
  const [editingFinishedMatchId, setEditingFinishedMatchId] = useState<string | null>(null);
  const [editFinishedScore1, setEditFinishedScore1] = useState(0);
  const [editFinishedScore2, setEditFinishedScore2] = useState(0);

  // Postpone Match Modal (Choose replacement from waiting queue)
  const [postponingMatchModal, setPostponingMatchModal] = useState<{ matchId: string; tableId: string } | null>(null);

  // Pop-up des derniers résultats (Vue d'ensemble)
  const [showResultsModal, setShowResultsModal] = useState(false);

  // QR code agrandi (fermeture auto après 5 s)
  const [qrZoom, setQrZoom] = useState<{ url: string; title: string; accent: string } | null>(null);
  useEffect(() => {
    if (!qrZoom) return;
    const timer = setTimeout(() => setQrZoom(null), 5000);
    return () => clearTimeout(timer);
  }, [qrZoom]);

  // Saisie directe du score d'un match (match joué sans avoir été lancé sur un billard)
  const [directScoreModalMatch, setDirectScoreModalMatch] = useState<any | null>(null);
  const [directScore1, setDirectScore1] = useState(0);
  const [directScore2, setDirectScore2] = useState(0);

  const openDirectScoreModal = (m: any) => {
    setDirectScoreModalMatch(m);
    const tour = m.tournamentId ? tournaments[m.tournamentId] : activeTournament;
    const rules = getMatchScoringRules(m, tour, players);
    setDirectScore1(m.score1 || rules.minScore1 || 0);
    setDirectScore2(m.score2 || rules.minScore2 || 0);
  };

  // Measure live tournament tables deck container height dynamically
  const [deckHeight, setDeckHeight] = useState<number>(0);
  const deckRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deckRef.current) return;
    const updateSize = () => {
      if (deckRef.current && deckRef.current.clientHeight > 0) {
        setDeckHeight(deckRef.current.clientHeight);
      }
    };
    updateSize();
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setDeckHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(deckRef.current);
    return () => ro.disconnect();
  }, [activeTab, dashboardSubTab, activeTournament?.id, Object.keys(tables).length]);

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

  const qualifStatus = getTournamentQualificationStatus(activeTournament, matches, players);
  const { hasSureQualifiers } = qualifStatus;

  const isFinalStageActive = Boolean(
    activeTournament?.finalStageLaunched ||
    activeTournament?.settings?.finalStageLaunched ||
    qualifStatus.isFinalLaunched
  );

  const rawTourMatches = activeTournament ? Object.values(matches).filter(m => activeTournament.matches.includes(m.id)) : [];
  // Exclure les Blancs (Byes) et les slots terminés sans adversaire / à 0-0
  const allTourMatches = rawTourMatches.filter(m => {
    if (isByeMatch(m)) return false;
    if (m.status === 'finished' && !isRealFinishedMatch(m, players)) return false;
    return true;
  });
  const activeMatches = allTourMatches.filter(m => {
    if (m.status !== 'playing') return false;
    if (!m.player1Id || !m.player2Id || !players[m.player1Id] || !players[m.player2Id]) return false;
    if (isFinalStageActive && !isFinalStageMatch(m)) return false;
    return true;
  });
  const pendingTourMatches = allTourMatches.filter(m => {
    if (m.status === 'finished') return false;
    if (!m.player1Id || !m.player2Id || !players[m.player1Id] || !players[m.player2Id]) return false;
    if (isFinalStageActive && !isFinalStageMatch(m)) return false;
    return true;
  });
  const finishedTourMatches = allTourMatches.filter(m => isRealFinishedMatch(m, players));
  const unplayedQualifMatches = (isFinalStageActive && activeTournament)
    ? allTourMatches.filter(m => !isFinalStageMatch(m) && m.status !== 'finished' && Boolean(m.player1Id && m.player2Id))
    : [];

  // Table mapping for all occupied tables
  const tableByCurrentMatchId: Record<string, string> = {};
  Object.values(tables).forEach(t => {
    if (t.status === 'occupied' && t.currentMatchId) {
      tableByCurrentMatchId[t.currentMatchId] = t.id;
    }
  });

  const getEffectiveTableId = (match: any): string | undefined => {
    return match?.tableId || tableByCurrentMatchId[match?.id];
  };

  // Contexte complet de programmation (enjeux, qualifications, équité des matchs joués, repos)
  const scheduleContext = React.useMemo(() => {
    return computeTournamentScheduleContext(activeTournament, matches, players, tables);
  }, [activeTournament, matches, players, tables]);

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
    const rawWaiting = pendingTourMatches.filter(m => !toPlayIds.has(m.id));
    const waiting = sortTournamentMatchesForScheduling(rawWaiting, scheduleContext);

    return { matchesToPlay: toPlay, matchesWaiting: waiting };
  })();

  // Billards du tournoi en cours, dans l'ordre (1, 2, 3...)
  const tournamentTablesOrdered = Object.values(tables)
    .filter(t => !activeTournament?.settings?.tableIds || activeTournament.settings.tableIds.includes(t.id))
    .sort((a, b) => a.number - b.number);

  // Appel vocal automatique dès qu'un nouveau match est assigné à un billard libre
  useEffect(() => {
    if (!activeTournament) return;
    const readyList = matchesToPlay
      .filter(m => m && m.status === 'pending')
      .map(m => {
        const effTableId = getEffectiveTableId(m) || '';
        const tObj = effTableId ? tables[effTableId] : null;
        const tableName = tObj?.name || (effTableId ? `Billard ${tObj?.number || effTableId}` : 'Billard');
        const stakeInfo = getMatchStakeInfo(m, scheduleContext);
        return {
          match: m,
          tableId: effTableId,
          tableName,
          player1Name: players[m.player1Id]?.name || 'Joueur 1',
          player2Name: players[m.player2Id]?.name || 'Joueur 2',
          stakeLabel: stakeInfo.label
        };
      });
    processAutoVoiceAnnouncements(readyList);
  }, [matchesToPlay, activeTournament, tables, players, scheduleContext]);

  // Helper to check if any player in a match is already busy on an assigned table (only if ACTUALLY playing)
  const getBusyPlayerInfo = (m: any) => {
    for (const activeM of matchesToPlay) {
      if (activeM.id === m.id) continue;
      if (activeM.status !== 'playing') continue;
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
    qualifStatus.areAllQualifiersKnown
  );
  const showQualifAlertModal = areAllQualifiersKnown && dismissedQualifAlertTourId !== activeTournament?.id;

  // Auto-heal missing match tableId if table has currentMatchId
  React.useEffect(() => {
    let changed = false;
    const newMatches = { ...matches };
    Object.values(tables).forEach(t => {
      if (t.status === 'occupied' && t.currentMatchId && newMatches[t.currentMatchId]) {
        if (newMatches[t.currentMatchId].status !== 'finished') {
          if (newMatches[t.currentMatchId].tableId !== t.id) {
            newMatches[t.currentMatchId] = { ...newMatches[t.currentMatchId], tableId: t.id };
            changed = true;
          }
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
      const baseW = 248;
      const baseH = 208; // BilliardTableVisual large base height

      // Tables per row and estimated rows
      const estimatedRows = tablesCount <= 3 ? 1 : (tablesCount <= 6 ? 2 : Math.ceil(tablesCount / 3));
      const availableH = deckHeight > 0 ? deckHeight : 300;
      const heightPadding = estimatedRows * 16;
      const maxScaleFitHeight = (availableH - heightPadding) / (estimatedRows * baseH);

      // Base target scales according to number of tournament tables
      const getPreferredScale = (count: number) => {
        if (count <= 1) return 1.28;
        if (count === 2) return 1.18;
        if (count === 3) return 0.98;
        if (count === 4) return 0.85;
        if (count <= 6) return 0.74;
        return 0.64;
      };

      // Table scale adapts to both table count AND strictly fits within container height
      const tableScale = Math.max(0.55, Math.min(getPreferredScale(tablesCount), maxScaleFitHeight));

      const scaledW = Math.round(baseW * tableScale);
      const scaledH = Math.round(baseH * tableScale);
      const dynamicGap = tablesCount <= 1 ? '0rem' : tablesCount === 2 ? '2.8rem' : tablesCount <= 4 ? '1.5rem' : '1rem';

      return (
        <div
          ref={deckRef}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            minHeight: 0,
            backgroundColor: '#050814',
            backgroundImage: 'radial-gradient(circle at center, rgba(18, 32, 60, 0.7) 0%, rgba(4, 7, 16, 0.98) 100%), repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.015) 0px, rgba(255, 255, 255, 0.015) 20px, transparent 20px, transparent 40px)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            position: 'relative',
            padding: '0.4rem 0.8rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            alignContent: tablesCount <= 3 ? 'center' : 'start',
            gap: dynamicGap,
            flexWrap: 'wrap',
            overflowY: 'auto',
            overflowX: 'hidden',
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
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt="Club Crest" style={{ width: '180px', filter: 'grayscale(1)' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          </div>

          {tournamentTables.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Aucun billard assigné à ce tournoi.
            </div>
          ) : (
            tournamentTables.map(table => {
              // Ensure match strictly belongs to active tournament and respects final stage
              const candidateMatch = (table.currentMatchId && matches[table.currentMatchId]?.tournamentId === activeTournament?.id && matches[table.currentMatchId]?.status !== 'finished')
                ? matches[table.currentMatchId]
                : Object.values(matches).find(m => m.tournamentId === activeTournament?.id && m.tableId === table.id && m.status !== 'finished');
              const currentMatch = (candidateMatch && isFinalStageActive && !isFinalStageMatch(candidateMatch))
                ? undefined
                : candidateMatch;

              const p1 = currentMatch ? players[currentMatch.player1Id] : undefined;
              const p2 = currentMatch ? players[currentMatch.player2Id] : undefined;
              const isPlaying = currentMatch?.status === 'playing';
              const isAssigned = Boolean(currentMatch);

              return (
                <div
                  key={table.id}
                  style={{
                    width: `${scaledW}px`,
                    height: `${scaledH}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'pointer',
                    zIndex: isPlaying ? 10 : (isAssigned ? 5 : 1),
                    margin: tablesCount <= 2 ? '0.2rem 0.4rem' : '0.15rem 0.3rem'
                  }}
                  onClick={() => setSelectedTableForQR(table.id)}
                  title={`Cliquer pour voir le match de ${table.name || `Table ${table.number}`}`}
                >
                  <div
                    style={{
                      width: `${baseW}px`,
                      height: `${baseH}px`,
                      transform: `scale(${tableScale})`,
                      transformOrigin: 'center center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    <BilliardTableVisual
                      number={table.number}
                      name={table.name}
                      status={isAssigned ? 'occupied' : 'free'}
                      match={currentMatch}
                      player1={p1}
                      player2={p2}
                      size="large"
                      hasLiveStream={Boolean(table.liveStreamUrl || currentMatch?.liveStreamUrl)}
                    />
                  </div>
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
            const currentMatch = (table.currentMatchId && matches[table.currentMatchId]?.status !== 'finished') ? matches[table.currentMatchId] : undefined;
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100vh',
      backgroundColor: 'var(--bg-color)',
      backgroundImage: theme === 'light' ? undefined : 'var(--bg-billiard-gradient)',
      color: 'var(--text-primary)',
      overflow: 'hidden'
    }}>

      {/* Main Header Unifié */}
      <header style={{
        padding: '0.6rem 1.6rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-header)',
        backdropFilter: 'blur(16px)',
        boxShadow: theme === 'light' ? '0 2px 10px rgba(15, 23, 42, 0.05)' : '0 4px 20px rgba(0, 0, 0, 0.45)',
        position: 'relative',
        zIndex: 30,
        gap: '0.85rem',
        flexWrap: 'wrap'
      }}>
        {/* Club + Version + Tournoi actif */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
          <div style={{
            background: '#ffffff',
            padding: '3px 7px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            flexShrink: 0
          }}>
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt={currentClub.name} style={{ height: '36px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{
                fontSize: '1.2rem',
                margin: 0,
                fontWeight: 900,
                background: 'linear-gradient(90deg, #FBBF24 0%, #34D399 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap'
              }}>
                {currentClub.name}
              </h1>
              <span style={{
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#FBBF24',
                padding: '1px 7px',
                borderRadius: '7px',
                fontSize: '0.7rem',
                fontWeight: 800,
                border: '1px solid rgba(245, 158, 11, 0.35)'
              }}>
                {APP_VERSION}
              </span>
            </div>
            {activeTournament && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34D399', flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px', fontWeight: 600 }}>
                  {activeTournament.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs (barre segmentée unique et épurée) */}
        <nav style={{
          display: 'flex',
          gap: '3px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: theme === 'light' ? 'rgba(15, 23, 42, 0.06)' : 'rgba(0, 0, 0, 0.34)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          {[
            { id: 'dashboard' as const, label: "Vue d'ensemble", icon: <MonitorPlay size={15} />, dotColor: isTournamentActive ? '#00ffaa' : undefined },
            { id: 'launcher' as const, label: 'Lanceur', icon: <Rocket size={15} /> },
            { id: 'live_studio' as const, label: 'Match Live', icon: <Radio size={15} />, dotColor: '#ff3b5c', title: "Lancer un match en direct (hors tournoi ou amical) avec régie vidéo" },
            { id: 'leaderboard' as const, label: 'Classement Club', icon: <Trophy size={15} /> },
            { id: 'admin' as const, label: 'Administration', icon: <Settings size={15} /> }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                title={tab.title}
                style={{
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#041210' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.dotColor ? (
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: isActive ? '#041210' : tab.dotColor
                  }} />
                ) : tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Menu Préférences unifié */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setAvailableFrenchVoices(listAvailableFrenchVoices());
              setShowPrefsMenu(v => !v);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 700,
              padding: '0.48rem 0.85rem',
              fontSize: '0.82rem',
              borderColor: showPrefsMenu ? 'var(--accent-primary)' : 'var(--border-color)',
              color: showPrefsMenu ? 'var(--accent-primary)' : 'var(--text-primary)',
              background: showPrefsMenu ? 'rgba(0, 255, 170, 0.08)' : 'transparent'
            }}
            title="Voix du speaker, thème, ambiance néon et réglages tournoi"
          >
            <Settings size={15} />
            <span>Préférences</span>
            {voiceEnabled && (
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00ffaa' }} title="Appel vocal actif" />
            )}
          </button>

          {showPrefsMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 8400 }}
                onClick={() => setShowPrefsMenu(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '320px',
                  background: theme === 'light' ? '#ffffff' : '#0b1222',
                  color: theme === 'light' ? '#0f172a' : '#fff',
                  border: '1px solid rgba(0, 255, 170, 0.35)',
                  borderRadius: '14px',
                  padding: '0.95rem',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
                  zIndex: 8500,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.86rem' }}>Préférences</span>
                  <button
                    type="button"
                    onClick={() => setShowPrefsMenu(false)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Section 1 : Appel vocal */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingBottom: '0.7rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>🎙️ Appel vocal ({getActiveFrenchVoiceLabel()})</span>
                    <button
                      type="button"
                      className={`btn ${voiceEnabled ? 'btn-neon' : 'btn-outline'}`}
                      onClick={toggleVoiceAnnouncer}
                      style={{
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        color: voiceEnabled ? '#041210' : 'var(--text-muted)'
                      }}
                    >
                      {voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                      {voiceEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <select
                    className="input-field"
                    value={selectedVoiceURI || ''}
                    onChange={(e) => {
                      const nextUri = e.target.value || null;
                      setSelectedVoiceURI(nextUri);
                      setSelectedVoiceURIState(nextUri);
                      speakAnnouncement('Nouveau match sur le Billard 1, Julien Raiwet contre Yannick Maurice.', true);
                    }}
                    style={{ fontSize: '0.76rem', padding: '0.4rem 0.55rem' }}
                  >
                    <option value="">✨ Automatique (meilleure voix naturelle)</option>
                    {availableFrenchVoices.map(v => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.isNatural ? '⭐ ' : ''}{v.name} ({v.lang})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => speakAnnouncement('Nouveau match sur le Billard 1, Julien Raiwet contre Yannick Maurice.', true)}
                    style={{ fontSize: '0.76rem', padding: '0.38rem 0.65rem', justifyContent: 'center', fontWeight: 700 }}
                  >
                    <Volume2 size={13} /> Tester la voix
                  </button>

                  {!availableFrenchVoices.some(v => v.isNatural) && (
                    <div style={{ fontSize: '0.68rem', color: '#fbbf24', lineHeight: 1.35 }}>
                      Astuce : ouvrez l'appli dans <strong>Microsoft Edge</strong> (voix gratuites Denise / Vivienne / Henri Naturelles) pour une voix très réaliste.
                    </div>
                  )}
                </div>

                {/* Section 2 : Apparence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Apparence</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={toggleTheme}
                      style={{ fontSize: '0.76rem', padding: '0.42rem 0.5rem', justifyContent: 'center', fontWeight: 700 }}
                    >
                      {theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
                      {theme === 'light' ? 'Mode Clair' : 'Mode Sombre'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={toggleNeonFx}
                      style={{
                        fontSize: '0.76rem',
                        padding: '0.42rem 0.5rem',
                        justifyContent: 'center',
                        fontWeight: 700,
                        color: neonEnabled ? '#34D399' : 'var(--text-muted)',
                        borderColor: neonEnabled ? 'rgba(52, 211, 153, 0.45)' : 'var(--border-color)'
                      }}
                    >
                      ✨ {neonEnabled ? 'Néon ON' : 'Néon OFF'}
                    </button>
                  </div>
                </div>

                {/* Section 3 : Réglages tournoi si en cours */}
                {activeTournament?.settings && (
                  <div style={{ paddingTop: '0.7rem', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        if (!activeTournament?.settings) return;
                        setEditTourSettings({
                          ...activeTournament.settings,
                          qualifNbQualifiers: activeTournament.settings.qualifNbQualifiers || qualifStatus.numQualifiers || 4
                        });
                        setShowEditRulesModal(true);
                        setShowPrefsMenu(false);
                      }}
                      style={{ width: '100%', fontSize: '0.78rem', padding: '0.48rem 0.7rem', justifyContent: 'center', fontWeight: 700, color: '#ffd700', borderColor: 'rgba(255, 215, 0, 0.35)' }}
                    >
                      <Clock size={14} /> Régler Temps, Qualifiés & Règles
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Barre fine de retour uniquement lorsqu'on consulte l'arbre des Phases Finales */}
      {activeTab === 'dashboard' && isTournamentActive && activeTournament && dashboardSubTab === 'bracket' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0.55rem 1.6rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setDashboardSubTab('live')}
              style={{ fontSize: '0.8rem', padding: '0.38rem 0.85rem', fontWeight: 700 }}
            >
              ← Retour Vue d'ensemble
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Trophy size={16} /> Tableau des Phases Finales
            </span>
          </div>
          {activeTournament.settings && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                if (!activeTournament?.settings) return;
                setEditTourSettings({
                  ...activeTournament.settings,
                  qualifNbQualifiers: activeTournament.settings.qualifNbQualifiers || qualifStatus.numQualifiers || 4
                });
                setShowEditRulesModal(true);
              }}
              style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem', fontWeight: 700, color: '#ffd700', borderColor: 'rgba(255, 215, 0, 0.35)' }}
            >
              <Clock size={13} /> Temps & Règles
            </button>
          )}
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
      <main key={activeTab} className="page-transition" style={{ flex: 1, minWidth: 0, padding: (activeTab === 'dashboard' || activeTab === 'live_studio' || isSmallDesktop) ? '0.9rem 1.2rem' : '2.2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ========================================================================= */}
        {/* 1. TOURNAMENT LAUNCHER TAB                                                */}
        {/* ========================================================================= */}
        {activeTab === 'launcher' && (
          <div style={{ maxWidth: '1480px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

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
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          Format : <b style={{ color: '#fff' }}>
                            {activeTournament.format === 'cartesien' ? `Cartésien${activeTournament.settings?.qualifNbPoules && activeTournament.settings.qualifNbPoules > 1 ? ` (${activeTournament.settings.qualifNbPoules} poules)` : ''}` :
                              activeTournament.format === 'robin' ? `Poules Robin${activeTournament.settings?.qualifNbPoules && activeTournament.settings.qualifNbPoules > 1 ? ` (${activeTournament.settings.qualifNbPoules} poules)` : ''}` :
                                activeTournament.format === 'double_ko_bracket' ? 'Double KO (Arbre Gagnants / Repêchage)' :
                                  activeTournament.format === 'direct_ko' ? 'Tableau Direct (KO)' :
                                    'Double KO (Poules & Rattrapage)'}
                          </b>
                        </span>
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
                    <div style={{ background: 'rgba(255, 215, 0, 0.08)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.35)' }}>
                      <div style={{ fontSize: '0.8rem', color: '#ffd700', marginBottom: '0.3rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={14} /> Temps par match
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffd700' }}>
                        {(activeTournament.settings?.finalMatchDurationMinutes || activeTournament.settings?.qualifMatchDurationMinutes || activeTournament.settings?.matchDurationMinutes)
                          ? `${activeTournament.settings.finalMatchDurationMinutes || activeTournament.settings.qualifMatchDurationMinutes || activeTournament.settings.matchDurationMinutes} min`
                          : 'Illimité'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.2rem' }}>
                        {activeTournament.format !== 'direct_ko'
                          ? `Poules : ${activeTournament.settings?.qualifMatchDurationMinutes ? `${activeTournament.settings.qualifMatchDurationMinutes}m` : 'Illimité'} • Final : ${activeTournament.settings?.finalMatchDurationMinutes ? `${activeTournament.settings.finalMatchDurationMinutes}m` : 'Illimité'}`
                          : 'Compte à rebours actif'}
                      </div>
                    </div>
                    {(Boolean(activeTournament.settings?.qualifHandicapAmateurSets) || Boolean(activeTournament.settings?.finalHandicapAmateurSets) || Boolean(activeTournament.settings?.handicapAmateurSets)) && (
                      <div style={{ background: 'rgba(255, 215, 0, 0.12)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.35)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#ffd700', marginBottom: '0.4rem', fontWeight: 700 }}>Handicap Niveaux</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ffd700', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {activeTournament.format !== 'direct_ko' && (
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'rgba(255, 215, 0, 0.8)', fontWeight: 600 }}>Poules : </span>
                              +{activeTournament.settings?.qualifHandicapAmateurSets ?? activeTournament.settings?.handicapAmateurSets ?? 0} m.
                            </div>
                          )}
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'rgba(255, 215, 0, 0.8)', fontWeight: 600 }}>Phases finales : </span>
                            +{activeTournament.settings?.finalHandicapAmateurSets ?? activeTournament.settings?.handicapAmateurSets ?? 0} m.
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>Distances des Duels & Règles</div>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: '#ffd700', borderColor: 'rgba(255, 215, 0, 0.4)', background: 'rgba(255, 215, 0, 0.08)' }}
                          onClick={() => {
                            if (activeTournament.settings) {
                              setEditTourSettings({ ...activeTournament.settings });
                              setShowEditRulesModal(true);
                            }
                          }}
                        >
                          ⚙️ Modifier les règles
                        </button>
                      </div>
                      <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div style={{ color: '#ffd700', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={13} />
                          <span>Temps imparti : </span>
                          {activeTournament.format !== 'direct_ko' && (
                            <span>Poules {activeTournament.settings?.qualifMatchDurationMinutes ? `${activeTournament.settings.qualifMatchDurationMinutes} min` : 'Illimité'} • </span>
                          )}
                          <span>Tableau Final {activeTournament.settings?.finalMatchDurationMinutes ? `${activeTournament.settings.finalMatchDurationMinutes} min` : 'Illimité'}</span>
                        </div>
                        {activeTournament.format !== 'direct_ko' && (
                          <div style={{ color: 'var(--accent-primary)' }}>
                            <span style={{ fontWeight: 700 }}>Poules : </span>
                            Am {activeTournament.settings?.qualifNbSetsAmateur ?? activeTournament.settings?.qualifNbSets ?? 2}m • Pre {activeTournament.settings?.qualifNbSetsPrestige ?? activeTournament.settings?.qualifNbSets ?? 3}m • Mixte {activeTournament.settings?.qualifNbSetsMixed ?? activeTournament.settings?.qualifNbSets ?? 3}m ({activeTournament.settings?.qualifIsWinningSets ? 'gagnantes' : 'fixes'})
                          </div>
                        )}
                        <div style={{ color: 'var(--accent-secondary)' }}>
                          <span style={{ fontWeight: 700 }}>Tableau Final : </span>
                          Am {activeTournament.settings?.finalNbSetsAmateur ?? activeTournament.settings?.finalNbSets ?? 2}m • Pre {activeTournament.settings?.finalNbSetsPrestige ?? activeTournament.settings?.finalNbSets ?? 3}m • Mixte {activeTournament.settings?.finalNbSetsMixed ?? activeTournament.settings?.finalNbSets ?? 3}m ({activeTournament.settings?.finalIsWinningSets ? 'gagnantes' : 'fixes'})
                        </div>
                        {activeTournament.settings?.grandFinalCustom ? (
                          <div style={{ color: '#ffd700' }}>
                            <span style={{ fontWeight: 700 }}>🏆 Grande Finale : </span>
                            Am {activeTournament.settings?.grandFinalNbSetsAmateur ?? 3}m • Pre {activeTournament.settings?.grandFinalNbSetsPrestige ?? 3}m • Mixte {activeTournament.settings?.grandFinalNbSetsMixed ?? 3}m ({activeTournament.settings?.grandFinalIsWinningSets ? 'gagnantes' : 'fixes'}, h+{activeTournament.settings?.grandFinalHandicapAmateurSets ?? 0})
                          </div>
                        ) : null}
                        {activeTournament.settings?.hasThirdPlaceMatch && activeTournament.settings?.thirdPlaceCustom ? (
                          <div style={{ color: '#f59e0b' }}>
                            <span style={{ fontWeight: 700 }}>🥉 Petite Finale : </span>
                            Am {activeTournament.settings?.thirdPlaceNbSetsAmateur ?? 3}m • Pre {activeTournament.settings?.thirdPlaceNbSetsPrestige ?? 3}m • Mixte {activeTournament.settings?.thirdPlaceNbSetsMixed ?? 3}m ({activeTournament.settings?.thirdPlaceIsWinningSets ? 'gagnantes' : 'fixes'}, h+{activeTournament.settings?.thirdPlaceHandicapAmateurSets ?? 0})
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Participants inscrits au tournoi en cours */}
                  <div style={{ marginTop: '1.2rem', background: 'rgba(0,0,0,0.25)', padding: '1rem 1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={16} style={{ color: 'var(--accent-primary)' }} />
                      Joueurs inscrits dans ce tournoi ({activeTournament.participants.length}) :
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                      {activeTournament.participants.map(pId => {
                        const p = players[pId];
                        if (!p) return null;
                        const isPrestige = p.level === 'Prestige' || p.level === 'Confirmé';
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <img src={getPlayerAvatar(p)} alt={p.name} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.name}</span>
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: isPrestige ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255,255,255,0.08)', color: isPrestige ? '#ffd700' : 'var(--text-muted)', fontWeight: isPrestige ? 800 : 600 }}>
                              {isPrestige ? '👑 Prestige' : 'Amateur'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
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

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isNarrowScreen ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)',
                  gap: isSmallDesktop ? '1.25rem' : '2rem',
                  alignItems: 'start'
                }}>

                  {/* Left Column: Rules & Tables Configuration */}
                  <div className="glass-card" style={{
                    padding: '2rem 2.2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.8rem',
                    borderRadius: '16px',
                    border: '1.5px solid var(--border-panel)',
                    background: 'var(--bg-panel)',
                    boxShadow: '0 18px 45px -4px rgba(0, 0, 0, 0.75), 0 0 18px rgba(16, 185, 129, 0.22)'
                  }}>
                    {/* Panel Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(0, 255, 204, 0.2)',
                      paddingBottom: '1rem',
                      flexWrap: 'wrap',
                      gap: '0.6rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: 'rgba(0, 255, 204, 0.15)',
                          border: '1px solid rgba(0, 255, 204, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent-primary)'
                        }}>
                          <Settings size={20} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 900, color: '#fff' }}>
                            1. Paramètres & Format du Tournoi
                          </h3>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Règles de jeu, chronomètre et billards alloués
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tour Name */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.6rem', color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Nom du Tournoi</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ex: Open de Printemps 2026"
                        value={newTourName}
                        onChange={e => setNewTourName(e.target.value)}
                        style={{ fontSize: '1.1rem', padding: '0.9rem', border: '1.5px solid rgba(45, 212, 191, 0.4)', background: 'rgba(5, 30, 27, 0.85)', color: '#fff' }}
                      />
                    </div>

                    {/* Format Selector */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.6rem', color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Format de compétition</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                        {[
                          { id: 'direct_ko', label: 'Tableau Direct (KO)', badge: 'Arbre immédiat' },
                          { id: 'double_ko_bracket', label: 'Double KO (Arbre)', badge: 'Gagnants / Repêchage' },
                          { id: 'double_ko', label: 'Double KO (Poules)', badge: 'Poules & Rattrapage' },
                          { id: 'cartesien', label: 'Cartésien', badge: 'Poules' },
                          { id: 'robin', label: 'Poules Robin', badge: 'Championnat' }
                        ].map(fmt => (
                          <div
                            key={fmt.id}
                            onClick={() => setNewTourFormat(fmt.id as any)}
                            style={{
                              padding: '1.1rem 0.8rem',
                              borderRadius: '12px',
                              border: newTourFormat === fmt.id ? '2px solid var(--accent-primary)' : '1px solid rgba(45, 212, 191, 0.3)',
                              background: newTourFormat === fmt.id ? 'rgba(0, 255, 204, 0.22)' : 'rgba(7, 46, 42, 0.65)',
                              cursor: 'pointer',
                              textAlign: 'center',
                              boxShadow: newTourFormat === fmt.id ? '0 0 16px rgba(0, 255, 204, 0.3)' : 'none',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: newTourFormat === fmt.id ? 'var(--accent-primary)' : '#fff' }}>{fmt.label}</div>
                            <div style={{ fontSize: '0.74rem', color: newTourFormat === fmt.id ? 'var(--accent-primary)' : 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>{fmt.badge}</div>
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

                    {/* Notice si Double KO Arbre (Winners & Losers Bracket) */}
                    {newTourFormat === 'double_ko_bracket' && (
                      <div style={{ padding: '1.2rem', background: 'rgba(0, 255, 204, 0.08)', borderRadius: '12px', border: '1px solid rgba(0, 255, 204, 0.25)', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <Trophy size={28} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: '1.4' }}>
                          <strong>Format Double KO Officiel (Double Élimination) :</strong> Arbre complet avec <em>Tableau des Vainqueurs</em> (Winners) et <em>Tableau de Repêchage</em> (Losers). Les joueurs débutent tous dans le tableau principal. Dès leur 1ère défaite, ils basculent dans le tableau de repêchage ; seule une 2ème défaite les élimine définitivement. La Grande Finale réunit le vainqueur du tableau principal et le vainqueur du repêchage !
                        </div>
                      </div>
                    )}

                    {/* Notice si Double KO Poules & Rattrapage */}
                    {newTourFormat === 'double_ko' && (
                      <div style={{ padding: '1.2rem', background: 'rgba(255, 215, 0, 0.08)', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.25)', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <Trophy size={28} style={{ color: '#ffd700', flexShrink: 0 }} />
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: '1.4' }}>
                          <strong>Format Double KO (Poules & Rattrapage) :</strong> Phase préliminaire où tous les joueurs disputent plusieurs duels sans élimination directe immédiate. Les points et les sets déterminent le classement, puis les meilleurs qualifiés accèdent au tableau final éliminatoire.
                        </div>
                      </div>
                    )}

                    {/* Prominent Match Duration Card right under format */}
                    <div style={{
                      padding: '1.3rem 1.5rem',
                      background: 'rgba(255, 215, 0, 0.06)',
                      borderRadius: '14px',
                      border: '1.5px solid rgba(255, 215, 0, 0.45)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <label style={{ fontSize: '1rem', color: '#ffd700', margin: 0, fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Clock size={19} /> Temps imparti par match (Chronomètre)
                        </label>
                        <span style={{ fontSize: '0.78rem', background: (finalMatchDurationMinutes > 0 || qualifMatchDurationMinutes > 0) ? 'rgba(255, 215, 0, 0.22)' : 'rgba(255, 255, 255, 0.06)', color: (finalMatchDurationMinutes > 0 || qualifMatchDurationMinutes > 0) ? '#ffd700' : 'var(--text-muted)', padding: '3px 10px', borderRadius: '10px', fontWeight: 800, border: '1px solid rgba(255, 215, 0, 0.4)' }}>
                          {(finalMatchDurationMinutes > 0 || qualifMatchDurationMinutes > 0)
                            ? `${isPoolFormat ? `Poules : ${qualifMatchDurationMinutes ? `${qualifMatchDurationMinutes}m` : 'Illimité'} • Final : ${finalMatchDurationMinutes ? `${finalMatchDurationMinutes}m` : 'Illimité'}` : `${finalMatchDurationMinutes} min / match`}`
                            : 'Temps illimité (0 min)'}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0, lineHeight: '1.4' }}>
                        Le compte à rebours s'affichera en temps réel sur les billards, le live streaming, le grand écran TV et les smartphones des joueurs.
                      </p>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {[0, 15, 20, 30, 45, 60].map(mins => {
                          const isSel = (qualifMatchDurationMinutes === mins && finalMatchDurationMinutes === mins);
                          return (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                setQualifMatchDurationMinutes(mins);
                                setFinalMatchDurationMinutes(mins);
                              }}
                              className="btn"
                              style={{
                                padding: '0.5rem 0.85rem',
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                borderRadius: '8px',
                                border: isSel ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
                                background: isSel ? 'rgba(255, 215, 0, 0.25)' : 'rgba(255,255,255,0.03)',
                                color: isSel ? '#ffd700' : '#fff',
                                boxShadow: isSel ? '0 0 12px rgba(255, 215, 0, 0.25)' : 'none'
                              }}
                            >
                              {mins === 0 ? 'Illimité (0)' : `${mins} min`}
                            </button>
                          );
                        })}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                          <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>Perso :</span>
                          <input
                            type="number"
                            className="input-field"
                            min={0}
                            max={240}
                            value={finalMatchDurationMinutes || qualifMatchDurationMinutes || 0}
                            onChange={e => {
                              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setQualifMatchDurationMinutes(v);
                              setFinalMatchDurationMinutes(v);
                            }}
                            style={{ width: '70px', padding: '0.4rem 0.5rem', textAlign: 'center', fontWeight: 800, fontSize: '0.9rem', border: '1px solid rgba(255, 215, 0, 0.4)' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>min</span>
                        </div>
                      </div>

                      {isPoolFormat && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '0.3rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,215,0,0.15)' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--accent-primary)', fontWeight: 700, marginBottom: '0.25rem' }}>
                              ⏱️ Temps Poules (min)
                            </label>
                            <input
                              type="number"
                              className="input-field"
                              min={0}
                              max={240}
                              value={qualifMatchDurationMinutes}
                              onChange={e => setQualifMatchDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                              style={{ width: '100%', padding: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: '0.25rem' }}>
                              ⏱️ Temps Tableau Final (min)
                            </label>
                            <input
                              type="number"
                              className="input-field"
                              min={0}
                              max={240}
                              value={finalMatchDurationMinutes}
                              onChange={e => setFinalMatchDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                              style={{ width: '100%', padding: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Qualif Rules (uniquement pour les formats avec poules) */}
                    {isPoolFormat && (
                      <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.2rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          Phase de Qualification
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                          {/* Option Nombre de poules (Cartésien & Poules Robin) */}
                          {(newTourFormat === 'cartesien' || newTourFormat === 'robin') && (
                            <div style={{
                              gridColumn: '1 / -1',
                              background: 'rgba(0, 255, 204, 0.05)',
                              padding: '1.1rem',
                              borderRadius: '12px',
                              border: '1px solid rgba(0, 255, 204, 0.25)',
                              marginBottom: '0.2rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <label style={{ color: 'var(--accent-primary)', fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  🎱 Répartition en Poules ({qualifNbPoules} poule{qualifNbPoules > 1 ? 's' : ''})
                                </label>
                                <span style={{ fontSize: '0.75rem', background: 'rgba(0, 255, 204, 0.15)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 255, 204, 0.3)' }}>
                                  {selectedPlayers.length} inscrit{selectedPlayers.length > 1 ? 's' : ''}
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(nb => {
                                  const minRequired = nb * 2;
                                  const isDis = selectedPlayers.length > 0 && selectedPlayers.length < minRequired;
                                  return (
                                    <button
                                      key={nb}
                                      type="button"
                                      disabled={isDis}
                                      onClick={() => !isDis && setQualifNbPoules(nb)}
                                      style={{
                                        padding: '0.45rem 0.9rem',
                                        borderRadius: '8px',
                                        border: qualifNbPoules === nb ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                        background: qualifNbPoules === nb ? 'rgba(0, 255, 204, 0.22)' : 'rgba(255,255,255,0.04)',
                                        color: qualifNbPoules === nb ? 'var(--accent-primary)' : (isDis ? 'rgba(255,255,255,0.25)' : '#fff'),
                                        cursor: isDis ? 'not-allowed' : 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                        opacity: isDis ? 0.35 : 1,
                                        transition: 'all 0.15s'
                                      }}
                                      title={isDis ? `Impossible avec ${selectedPlayers.length} inscrits : il faut au moins ${minRequired} joueurs (minimum 2 joueurs par poule)` : undefined}
                                    >
                                      {nb === 1 ? '1 Poule unique' : `${nb} Poules`}
                                    </button>
                                  );
                                })}
                              </div>

                              <div style={{ fontSize: '0.8rem', color: '#fff', lineHeight: '1.4' }}>
                                {qualifNbPoules === 1 ? (
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    Poule unique : tous les {selectedPlayers.length} participants disputent leurs matchs ensemble dans le même classement.
                                  </span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                                      ✓ Les {selectedPlayers.length} participants sont répartis dans {qualifNbPoules} poules distinctes ({Array.from({ length: qualifNbPoules }).map((_, i) => `Poule ${String.fromCharCode(65 + i)}`).join(', ')}).
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                      Chaque joueur affronte uniquement les adversaires de sa propre poule.
                                      {qualifNbQualifiers >= qualifNbPoules && (
                                        <> Les <strong>{Math.ceil(qualifNbQualifiers / qualifNbPoules)} premiers</strong> de chaque poule seront qualifiés et croisés dans le tableau final éliminatoire.</>
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Attribution personnalisée des joueurs dans chaque poule */}
                              {qualifNbPoules > 1 && Object.keys(customPoolsDistribution).length > 0 && (
                                <div style={{ marginTop: '0.8rem', background: 'rgba(0,0,0,0.25)', padding: '0.9rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>👥 Composition & Choix des Poules</span>
                                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                        (cliquez sur les lettres pour changer de poule)
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={shufflePoolsDistribution}
                                      className="btn btn-outline"
                                      style={{ fontSize: '0.74rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '5px' }}
                                      title="Mélanger aléatoirement les joueurs dans les poules"
                                    >
                                      <Shuffle size={13} /> Tirage au sort
                                    </button>
                                  </div>

                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(auto-fit, minmax(${qualifNbPoules <= 2 ? '220px' : '180px'}, 1fr))`,
                                    gap: '0.7rem'
                                  }}>
                                    {Object.entries(customPoolsDistribution).map(([pName, pPlayerIds]) => {
                                      const isWarn = pPlayerIds.length < 2;
                                      return (
                                        <div
                                          key={pName}
                                          style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            border: isWarn ? '1px solid rgba(255, 70, 70, 0.4)' : '1px solid rgba(0, 255, 204, 0.2)',
                                            borderRadius: '10px',
                                            padding: '0.7rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem'
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem' }}>
                                            <span style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '0.88rem' }}>
                                              🎱 {pName}
                                            </span>
                                            <span style={{
                                              fontSize: '0.72rem',
                                              fontWeight: 700,
                                              padding: '1px 6px',
                                              borderRadius: '6px',
                                              background: isWarn ? 'rgba(255, 70, 70, 0.2)' : 'rgba(0, 255, 204, 0.15)',
                                              color: isWarn ? '#ff6b6b' : 'var(--accent-primary)'
                                            }}>
                                              {pPlayerIds.length} joueur{pPlayerIds.length > 1 ? 's' : ''}
                                            </span>
                                          </div>

                                          {pPlayerIds.length === 0 ? (
                                            <div style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                              Vide (déplacez-y un joueur)
                                            </div>
                                          ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                              {pPlayerIds.map(pId => {
                                                const player = players[pId];
                                                const pNameTargetList = Object.keys(customPoolsDistribution);
                                                return (
                                                  <div
                                                    key={pId}
                                                    style={{
                                                      background: 'rgba(255,255,255,0.03)',
                                                      border: '1px solid rgba(255,255,255,0.06)',
                                                      borderRadius: '7px',
                                                      padding: '0.35rem 0.5rem',
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'space-between',
                                                      gap: '0.4rem'
                                                    }}
                                                  >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
                                                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {player?.name || 'Joueur'}
                                                      </span>
                                                      {player?.level && (
                                                        <span style={{ fontSize: '0.62rem', color: (player.level === 'Prestige' || player.level === 'Confirmé') ? '#ffd700' : 'var(--accent-secondary)', textTransform: 'capitalize' }}>
                                                          ({player.level})
                                                        </span>
                                                      )}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                                                      {pNameTargetList.map(targetPName => {
                                                        const isCurrent = targetPName === pName;
                                                        const shortLetter = targetPName.replace('Poule ', '');
                                                        return (
                                                          <button
                                                            key={targetPName}
                                                            type="button"
                                                            disabled={isCurrent}
                                                            onClick={() => movePlayerToPool(pId, targetPName)}
                                                            style={{
                                                              width: '22px',
                                                              height: '22px',
                                                              borderRadius: '5px',
                                                              fontSize: '0.68rem',
                                                              fontWeight: 800,
                                                              border: isCurrent ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                                              background: isCurrent ? 'var(--accent-primary)' : 'rgba(255,255,255,0.04)',
                                                              color: isCurrent ? '#000' : 'var(--text-muted)',
                                                              cursor: isCurrent ? 'default' : 'pointer',
                                                              display: 'flex',
                                                              alignItems: 'center',
                                                              justifyContent: 'center',
                                                              padding: 0,
                                                              transition: 'all 0.15s'
                                                            }}
                                                            title={isCurrent ? `Actuellement dans ${pName}` : `Déplacer vers ${targetPName}`}
                                                          >
                                                            {shortLetter}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Type de match</label>
                            <select className="input-field" value={qualifIsWinningSets ? 'winning' : 'fixed'} onChange={e => setQualifIsWinningSets(e.target.value === 'winning')} style={{ appearance: 'none', background: '#050816', color: '#fff' }}>
                              <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                              <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                            </select>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                              Amateur vs Amateur
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={qualifNbSetsAmateur}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setQualifNbSetsAmateur(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--accent-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                              Prestige vs Prestige
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={qualifNbSetsPrestige}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setQualifNbSetsPrestige(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: '#ffd700', fontSize: '0.85rem', fontWeight: 700 }}>
                              Amateur vs Prestige
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={qualifNbSetsMixed}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setQualifNbSetsMixed(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <QualifiersCountSelector
                              value={qualifNbQualifiers}
                              onChange={setQualifNbQualifiers}
                              participantsCount={selectedPlayers.length}
                              nbPoules={(newTourFormat === 'cartesien' || newTourFormat === 'robin') ? qualifNbPoules : 1}
                            />
                          </div>

                          {/* Handicap Qualification (Amateur vs Prestige) */}
                          <div style={{ gridColumn: 'span 2', marginTop: '0.5rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <label style={{ fontSize: '0.95rem', color: '#ffd700', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Handicap Poules / Cartésien (Amateur vs Prestige)
                              </label>
                              <span style={{ fontSize: '0.72rem', background: qualifHandicapAmateurSets > 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: qualifHandicapAmateurSets > 0 ? '#ffd700' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                                {qualifHandicapAmateurSets > 0 ? `+${qualifHandicapAmateurSets} manche(s) d'avance` : 'Désactivé (0-0)'}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.8rem 0', lineHeight: '1.4' }}>
                              Avance accordée à l'Amateur contre un Prestige pendant les matchs de qualification.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem' }}>
                              {[
                                { val: 0, label: '0 (Aucun)', sub: 'Départ 0-0' },
                                { val: 1, label: '+1 manche', sub: 'Départ 1-0' },
                                { val: 2, label: '+2 manches', sub: 'Départ 2-0' },
                                { val: 3, label: '+3 manches', sub: 'Départ 3-0' }
                              ].map(opt => {
                                const isSel = qualifHandicapAmateurSets === opt.val;
                                const isDis = opt.val > maxAllowedQualifHandicap;
                                return (
                                  <button
                                    type="button"
                                    key={opt.val}
                                    disabled={isDis}
                                    onClick={() => !isDis && setQualifHandicapAmateurSets(opt.val)}
                                    className="btn"
                                    style={{
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '0.7rem 0.5rem',
                                      borderRadius: '10px',
                                      border: isSel ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                                      background: isSel ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.02)',
                                      color: isSel ? '#ffd700' : (isDis ? 'rgba(255,255,255,0.3)' : '#fff'),
                                      boxShadow: isSel ? '0 0 12px rgba(255, 215, 0, 0.25)' : 'none',
                                      opacity: isDis ? 0.35 : 1,
                                      cursor: isDis ? 'not-allowed' : 'pointer'
                                    }}
                                    title={isDis ? `Incompatible avec l'affiche mixte (${qualifNbSetsMixed} manche(s)) : max +${maxAllowedQualifHandicap}.` : opt.label}
                                  >
                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{opt.label}</span>
                                    <span style={{ fontSize: '0.68rem', color: isSel ? 'rgba(255,215,0,0.8)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                                      {isDis ? 'Incompatible' : opt.sub}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {maxAllowedQualifHandicap === 0 && (
                              <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', background: 'rgba(255, 100, 100, 0.12)', border: '1px solid rgba(255, 100, 100, 0.35)', borderRadius: '8px', color: '#ffaaaa', fontSize: '0.78rem', lineHeight: '1.4' }}>
                                ⚠️ <strong>1 manche gagnante pour l'affiche Amateur vs Prestige :</strong> aucun handicap ne peut être accordé, sinon l'amateur l'emporterait à 1-0 dès le coup d'envoi sans jouer.
                              </div>
                            )}
                          </div>

                          {/* Temps imparti par match en Qualifications */}
                          <div style={{ gridColumn: 'span 2', marginTop: '0.5rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <label style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Clock size={16} /> Temps imparti par match (Poules / Qualifications)
                              </label>
                              <span style={{ fontSize: '0.72rem', background: qualifMatchDurationMinutes > 0 ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: qualifMatchDurationMinutes > 0 ? 'var(--accent-primary)' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 255, 204, 0.3)' }}>
                                {qualifMatchDurationMinutes > 0 ? `${qualifMatchDurationMinutes} min / match` : 'Temps illimité'}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.8rem 0', lineHeight: '1.4' }}>
                              Décompte affiché sur les billards, le live et le téléphone des joueurs (0 = Pas de limite de temps).
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              {[0, 15, 20, 30, 45, 60].map(mins => {
                                const isSel = qualifMatchDurationMinutes === mins;
                                return (
                                  <button
                                    key={mins}
                                    type="button"
                                    onClick={() => setQualifMatchDurationMinutes(mins)}
                                    className="btn"
                                    style={{
                                      padding: '0.45rem 0.85rem',
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      borderRadius: '8px',
                                      border: isSel ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.15)',
                                      background: isSel ? 'rgba(0, 255, 204, 0.22)' : 'rgba(255,255,255,0.03)',
                                      color: isSel ? 'var(--accent-primary)' : '#fff'
                                    }}
                                  >
                                    {mins === 0 ? 'Illimité (0)' : `${mins} min`}
                                  </button>
                                );
                              })}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Personnalisé :</span>
                                <input
                                  type="number"
                                  className="input-field"
                                  min={0}
                                  max={240}
                                  value={qualifMatchDurationMinutes}
                                  onChange={e => setQualifMatchDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                  style={{ width: '70px', padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 700 }}
                                />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>min</span>
                              </div>
                            </div>
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
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Type de match</label>
                          <select className="input-field" value={finalIsWinningSets ? 'winning' : 'fixed'} onChange={e => setFinalIsWinningSets(e.target.value === 'winning')} style={{ appearance: 'none', background: '#050816', color: '#fff' }}>
                            <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                            <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                          </select>
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 700 }}>
                              Amateur vs Amateur
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={finalNbSetsAmateur}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setFinalNbSetsAmateur(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--accent-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                              Prestige vs Prestige
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={finalNbSetsPrestige}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setFinalNbSetsPrestige(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', marginBottom: '0.3rem', color: '#ffd700', fontSize: '0.85rem', fontWeight: 700 }}>
                              Amateur vs Prestige
                            </label>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Manches (1 à 20)</div>
                            <input
                              type="number"
                              className="input-field"
                              value={finalNbSetsMixed}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setFinalNbSetsMixed(isNaN(val) ? 1 : Math.min(20, Math.max(1, val)));
                              }}
                              min={1}
                              max={20}
                            />
                          </div>
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
                            <div style={{ fontWeight: 600 }}>Petite Finale (match pour la 3ème place)</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Faire s'affronter les deux perdants des demi-finales</div>
                          </div>
                        </div>

                        {/* Handicap Tableau Final (Amateur vs Prestige) */}
                        <div style={{ gridColumn: 'span 2', marginTop: '0.5rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.95rem', color: '#ffd700', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              Handicap Tableau Final (Amateur vs Prestige)
                            </label>
                            <span style={{ fontSize: '0.72rem', background: finalHandicapAmateurSets > 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: finalHandicapAmateurSets > 0 ? '#ffd700' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                              {finalHandicapAmateurSets > 0 ? `+${finalHandicapAmateurSets} manche(s) d'avance` : 'Désactivé (0-0)'}
                            </span>
                          </div>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.8rem 0', lineHeight: '1.4' }}>
                            Avance accordée à l'Amateur contre un Prestige pendant les matchs des phases finales.
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem' }}>
                            {[
                              { val: 0, label: '0 (Aucun)', sub: 'Départ 0-0' },
                              { val: 1, label: '+1 manche', sub: 'Départ 1-0' },
                              { val: 2, label: '+2 manches', sub: 'Départ 2-0' },
                              { val: 3, label: '+3 manches', sub: 'Départ 3-0' }
                            ].map(opt => {
                              const isSel = finalHandicapAmateurSets === opt.val;
                              const isDis = opt.val > maxAllowedFinalHandicap;
                              return (
                                <button
                                  type="button"
                                  key={opt.val}
                                  disabled={isDis}
                                  onClick={() => !isDis && setFinalHandicapAmateurSets(opt.val)}
                                  className="btn"
                                  style={{
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0.7rem 0.5rem',
                                    borderRadius: '10px',
                                    border: isSel ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                                    background: isSel ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.02)',
                                    color: isSel ? '#ffd700' : (isDis ? 'rgba(255,255,255,0.3)' : '#fff'),
                                    boxShadow: isSel ? '0 0 12px rgba(255, 215, 0, 0.25)' : 'none',
                                    opacity: isDis ? 0.35 : 1,
                                    cursor: isDis ? 'not-allowed' : 'pointer'
                                  }}
                                  title={isDis ? `Incompatible avec l'affiche mixte (${finalNbSetsMixed} manche(s)) : max +${maxAllowedFinalHandicap}.` : opt.label}
                                >
                                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{opt.label}</span>
                                  <span style={{ fontSize: '0.68rem', color: isSel ? 'rgba(255,215,0,0.8)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    {isDis ? 'Incompatible' : opt.sub}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {maxAllowedFinalHandicap === 0 && (
                            <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', background: 'rgba(255, 100, 100, 0.12)', border: '1px solid rgba(255, 100, 100, 0.35)', borderRadius: '8px', color: '#ffaaaa', fontSize: '0.78rem', lineHeight: '1.4' }}>
                              ⚠️ <strong>1 manche gagnante pour l'affiche Amateur vs Prestige en phase finale :</strong> aucun handicap ne peut être accordé, sinon l'amateur l'emporterait à 1-0 dès le coup d'envoi sans jouer.
                            </div>
                          )}
                        </div>

                        {/* Temps imparti par match en Phase Finale */}
                        <div style={{ gridColumn: 'span 2', marginTop: '0.5rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.95rem', color: 'var(--accent-secondary)', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Clock size={16} /> Temps imparti par match (Phase Finale)
                            </label>
                            <span style={{ fontSize: '0.72rem', background: finalMatchDurationMinutes > 0 ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: finalMatchDurationMinutes > 0 ? 'var(--accent-secondary)' : 'var(--text-muted)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 229, 255, 0.3)' }}>
                              {finalMatchDurationMinutes > 0 ? `${finalMatchDurationMinutes} min / match` : 'Temps illimité'}
                            </span>
                          </div>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.8rem 0', lineHeight: '1.4' }}>
                            Décompte affiché sur les billards, le live et le téléphone des joueurs pour tous les matchs de phase finale (0 = Pas de limite de temps).
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {[0, 15, 20, 30, 45, 60].map(mins => {
                              const isSel = finalMatchDurationMinutes === mins;
                              return (
                                <button
                                  key={mins}
                                  type="button"
                                  onClick={() => setFinalMatchDurationMinutes(mins)}
                                  className="btn"
                                  style={{
                                    padding: '0.45rem 0.85rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    borderRadius: '8px',
                                    border: isSel ? '2px solid var(--accent-secondary)' : '1px solid rgba(255,255,255,0.15)',
                                    background: isSel ? 'rgba(0, 229, 255, 0.22)' : 'rgba(255,255,255,0.03)',
                                    color: isSel ? 'var(--accent-secondary)' : '#fff'
                                  }}
                                >
                                  {mins === 0 ? 'Illimité (0)' : `${mins} min`}
                                </button>
                              );
                            })}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Personnalisé :</span>
                              <input
                                type="number"
                                className="input-field"
                                min={0}
                                max={240}
                                value={finalMatchDurationMinutes}
                                onChange={e => setFinalMatchDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                style={{ width: '70px', padding: '0.35rem 0.5rem', textAlign: 'center', fontWeight: 700 }}
                              />
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>min</span>
                            </div>
                          </div>
                        </div>

                        {/* ======================================================== */}
                        {/* Paramètres Spécifiques Grande Finale                    */}
                        {/* ======================================================== */}
                        <div
                          className={grandFinalCustom ? 'shimmer-gold-border' : ''}
                          style={{
                          gridColumn: 'span 2',
                          marginTop: '0.8rem',
                          padding: '1.2rem',
                          background: grandFinalCustom ? 'rgba(255, 215, 0, 0.05)' : 'rgba(255,255,255,0.02)',
                          borderRadius: '12px',
                          border: grandFinalCustom ? '1px solid rgba(255, 215, 0, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                          transition: 'all 0.2s ease'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={grandFinalCustom}
                                onChange={e => setGrandFinalCustom(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: '#ffd700', cursor: 'pointer' }}
                              />
                              <div>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffd700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  🏆 Grande Finale (Match pour le titre)
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                                  {grandFinalCustom ? 'Règles et distance spécifiques activées' : 'Hérite par défaut des règles générales du tableau final'}
                                </span>
                              </div>
                            </label>
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontWeight: 700,
                              background: grandFinalCustom ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255,255,255,0.05)',
                              color: grandFinalCustom ? '#ffd700' : 'var(--text-muted)',
                              border: `1px solid ${grandFinalCustom ? 'rgba(255, 215, 0, 0.4)' : 'rgba(255,255,255,0.1)'}`
                            }}>
                              {grandFinalCustom ? '⚙️ Personnalisée' : 'Standard'}
                            </span>
                          </div>

                          {grandFinalCustom && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,215,0,0.15)' }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Type de match pour la Finale</label>
                                <select
                                  className="input-field"
                                  value={grandFinalIsWinningSets ? 'winning' : 'fixed'}
                                  onChange={e => setGrandFinalIsWinningSets(e.target.value === 'winning')}
                                  style={{ appearance: 'none', background: '#050816', color: '#fff' }}
                                >
                                  <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                                  <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                                </select>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 700 }}>
                                    Finale : Am vs Am
                                  </label>
                                  <input
                                    type="number"
                                    className="input-field"
                                    value={grandFinalNbSetsAmateur}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setGrandFinalNbSetsAmateur(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                    }}
                                    min={1}
                                    max={25}
                                  />
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--accent-secondary)', fontSize: '0.8rem', fontWeight: 700 }}>
                                    Finale : Pre vs Pre
                                  </label>
                                  <input
                                    type="number"
                                    className="input-field"
                                    value={grandFinalNbSetsPrestige}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setGrandFinalNbSetsPrestige(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                    }}
                                    min={1}
                                    max={25}
                                  />
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <label style={{ display: 'block', marginBottom: '0.2rem', color: '#ffd700', fontSize: '0.8rem', fontWeight: 700 }}>
                                    Finale : Am vs Pre
                                  </label>
                                  <input
                                    type="number"
                                    className="input-field"
                                    value={grandFinalNbSetsMixed}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setGrandFinalNbSetsMixed(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                    }}
                                    min={1}
                                    max={25}
                                  />
                                </div>
                              </div>

                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                  <label style={{ fontSize: '0.82rem', color: '#ffd700', fontWeight: 700 }}>
                                    Handicap Amateur vs Prestige en Finale
                                  </label>
                                  <span style={{ fontSize: '0.72rem', color: grandFinalHandicapAmateurSets > 0 ? '#ffd700' : 'var(--text-muted)', fontWeight: 700 }}>
                                    +{grandFinalHandicapAmateurSets} manche(s)
                                  </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                  {[0, 1, 2, 3].map(v => {
                                    const isDis = v > maxAllowedGrandFinalHandicap;
                                    const isSel = grandFinalHandicapAmateurSets === v;
                                    return (
                                      <button
                                        type="button"
                                        key={v}
                                        disabled={isDis}
                                        onClick={() => setGrandFinalHandicapAmateurSets(v)}
                                        className="btn"
                                        style={{
                                          padding: '0.45rem',
                                          fontSize: '0.78rem',
                                          fontWeight: 700,
                                          borderRadius: '8px',
                                          border: isSel ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                                          background: isSel ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255,255,255,0.02)',
                                          color: isSel ? '#ffd700' : (isDis ? 'rgba(255,255,255,0.3)' : '#fff'),
                                          opacity: isDis ? 0.35 : 1
                                        }}
                                      >
                                        {v === 0 ? 'Aucun (0)' : `+${v}`}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ======================================================== */}
                        {/* Paramètres Spécifiques Petite Finale                    */}
                        {/* ======================================================== */}
                        {hasThirdPlaceMatch && (
                          <div style={{
                            gridColumn: 'span 2',
                            marginTop: '0.5rem',
                            padding: '1.2rem',
                            background: thirdPlaceCustom ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255,255,255,0.02)',
                            borderRadius: '12px',
                            border: thirdPlaceCustom ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                            transition: 'all 0.2s ease'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', margin: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={thirdPlaceCustom}
                                  onChange={e => setThirdPlaceCustom(e.target.checked)}
                                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                                />
                                <div>
                                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    🥉 Petite Finale (Match pour la 3ème place)
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                                    {thirdPlaceCustom ? 'Règles et distance spécifiques activées' : 'Hérite par défaut des règles générales du tableau final'}
                                  </span>
                                </div>
                              </label>
                              <span style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontWeight: 700,
                                background: thirdPlaceCustom ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: thirdPlaceCustom ? '#f59e0b' : 'var(--text-muted)',
                                border: `1px solid ${thirdPlaceCustom ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)'}`
                              }}>
                                {thirdPlaceCustom ? '⚙️ Personnalisée' : 'Standard'}
                              </span>
                            </div>

                            {thirdPlaceCustom && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(245, 158, 11, 0.15)' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Type de match pour la Petite Finale</label>
                                  <select
                                    className="input-field"
                                    value={thirdPlaceIsWinningSets ? 'winning' : 'fixed'}
                                    onChange={e => setThirdPlaceIsWinningSets(e.target.value === 'winning')}
                                    style={{ appearance: 'none', background: '#050816', color: '#fff' }}
                                  >
                                    <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                                    <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                                  </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem' }}>
                                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 700 }}>
                                      Petite Finale : Am vs Am
                                    </label>
                                    <input
                                      type="number"
                                      className="input-field"
                                      value={thirdPlaceNbSetsAmateur}
                                      onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setThirdPlaceNbSetsAmateur(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                      }}
                                      min={1}
                                      max={25}
                                    />
                                  </div>
                                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--accent-secondary)', fontSize: '0.8rem', fontWeight: 700 }}>
                                      Petite Finale : Pre vs Pre
                                    </label>
                                    <input
                                      type="number"
                                      className="input-field"
                                      value={thirdPlaceNbSetsPrestige}
                                      onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setThirdPlaceNbSetsPrestige(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                      }}
                                      min={1}
                                      max={25}
                                    />
                                  </div>
                                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', marginBottom: '0.2rem', color: '#ffd700', fontSize: '0.8rem', fontWeight: 700 }}>
                                      Petite Finale : Am vs Pre
                                    </label>
                                    <input
                                      type="number"
                                      className="input-field"
                                      value={thirdPlaceNbSetsMixed}
                                      onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setThirdPlaceNbSetsMixed(isNaN(val) ? 1 : Math.min(25, Math.max(1, val)));
                                      }}
                                      min={1}
                                      max={25}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <label style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 700 }}>
                                      Handicap Amateur vs Prestige en Petite Finale
                                    </label>
                                    <span style={{ fontSize: '0.72rem', color: thirdPlaceHandicapAmateurSets > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: 700 }}>
                                      +{thirdPlaceHandicapAmateurSets} manche(s)
                                    </span>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                    {[0, 1, 2, 3].map(v => {
                                      const isDis = v > maxAllowedThirdPlaceHandicap;
                                      const isSel = thirdPlaceHandicapAmateurSets === v;
                                      return (
                                        <button
                                          type="button"
                                          key={v}
                                          disabled={isDis}
                                          onClick={() => setThirdPlaceHandicapAmateurSets(v)}
                                          className="btn"
                                          style={{
                                            padding: '0.45rem',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            borderRadius: '8px',
                                            border: isSel ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                                            background: isSel ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.02)',
                                            color: isSel ? '#f59e0b' : (isDis ? 'rgba(255,255,255,0.3)' : '#fff'),
                                            opacity: isDis ? 0.35 : 1
                                          }}
                                        >
                                          {v === 0 ? 'Aucun (0)' : `+${v}`}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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

                        if (newTourFormat !== 'direct_ko' && newTourFormat !== 'double_ko_bracket') {
                          if (selectedPlayers.length < 3) {
                            return alert(`Pour un format avec phase de qualification (poules / cartésien), il faut au moins 3 joueurs inscrits (au moins 1 joueur éliminé et 2 finalistes). Avec ${selectedPlayers.length} participant(s), veuillez sélectionner le format "Tableau Direct (KO)" ou "Double KO (Arbre)".`);
                          }
                          if (qualifNbQualifiers >= selectedPlayers.length) {
                            return alert(`Configuration impossible : avec ${selectedPlayers.length} joueurs inscrits, le nombre de qualifiés (${qualifNbQualifiers}) doit être d'au maximum ${selectedPlayers.length - 1} personnes afin qu'il y ait au moins un éliminé en qualification.`);
                          }
                        }

                        if (isPoolFormat && qualifNbPoules > 1 && (newTourFormat === 'cartesien' || newTourFormat === 'robin')) {
                          const hasEmptyPool = Object.values(customPoolsDistribution).some(list => list.length < 2);
                          if (hasEmptyPool) {
                            return alert(`Chaque poule doit comporter au moins 2 joueurs. Veuillez rééquilibrer les participants entre les poules.`);
                          }
                        }

                        if (newTourFormat !== 'direct_ko' && newTourFormat !== 'double_ko_bracket' && qualifHandicapAmateurSets > maxAllowedQualifHandicap) {
                          return alert(`Configuration qualification impossible : avec l'affiche mixte (${qualifNbSetsMixed} manche(s)), le handicap poules doit être de +${maxAllowedQualifHandicap} manche(s) maximum.`);
                        }
                        if (finalHandicapAmateurSets > maxAllowedFinalHandicap) {
                          return alert(`Configuration tableau final impossible : avec l'affiche mixte (${finalNbSetsMixed} manche(s)), le handicap phase finale doit être de +${maxAllowedFinalHandicap} manche(s) maximum.`);
                        }
                        if (grandFinalCustom && grandFinalHandicapAmateurSets > maxAllowedGrandFinalHandicap) {
                          return alert(`Configuration Grande Finale impossible : avec l'affiche mixte (${grandFinalNbSetsMixed} manche(s)), le handicap finale doit être de +${maxAllowedGrandFinalHandicap} manche(s) maximum.`);
                        }
                        if (hasThirdPlaceMatch && thirdPlaceCustom && thirdPlaceHandicapAmateurSets > maxAllowedThirdPlaceHandicap) {
                          return alert(`Configuration Petite Finale impossible : avec l'affiche mixte (${thirdPlaceNbSetsMixed} manche(s)), le handicap petite finale doit être de +${maxAllowedThirdPlaceHandicap} manche(s) maximum.`);
                        }

                        createTournament(newTourName.trim(), newTourFormat, {
                          tableIds: selectedTables,
                          qualifNbSets: qualifNbSetsMixed, qualifIsWinningSets, qualifNbQualifiers,
                          qualifNbPoules: (newTourFormat === 'cartesien' || newTourFormat === 'robin') ? qualifNbPoules : 1,
                          poolsDistribution: (newTourFormat === 'cartesien' || newTourFormat === 'robin') && qualifNbPoules > 1 ? customPoolsDistribution : undefined,
                          qualifNbSetsAmateur, qualifNbSetsPrestige, qualifNbSetsMixed,
                          finalNbSets: finalNbSetsMixed, finalIsWinningSets, seedByMerit,
                          finalNbSetsAmateur, finalNbSetsPrestige, finalNbSetsMixed,
                          qualifHandicapAmateurSets,
                          finalHandicapAmateurSets,
                          handicapAmateurSets: finalHandicapAmateurSets,
                          matchDurationMinutes: finalMatchDurationMinutes || qualifMatchDurationMinutes || 0,
                          qualifMatchDurationMinutes,
                          finalMatchDurationMinutes,
                          hasThirdPlaceMatch,

                          grandFinalCustom,
                          grandFinalIsWinningSets,
                          grandFinalNbSets: grandFinalNbSetsMixed,
                          grandFinalNbSetsAmateur,
                          grandFinalNbSetsPrestige,
                          grandFinalNbSetsMixed,
                          grandFinalHandicapAmateurSets,

                          thirdPlaceCustom,
                          thirdPlaceIsWinningSets,
                          thirdPlaceNbSets: thirdPlaceNbSetsMixed,
                          thirdPlaceNbSetsAmateur,
                          thirdPlaceNbSetsPrestige,
                          thirdPlaceNbSetsMixed,
                          thirdPlaceHandicapAmateurSets
                        }, selectedPlayers);

                        setShowNewTourForm(false);
                        setActiveTab('dashboard');
                      }}
                    >
                      Démarrer le Tournoi & Ouvrir la Vue d'ensemble
                    </button>

                  </div>

                  {/* Right Column: Player Registration Selection */}
                  <div
                    className="glass-card"
                    style={{
                      padding: '2rem 2.2rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.2rem',
                      borderRadius: '16px',
                      background: 'var(--bg-panel)',
                      border: '1.5px solid var(--border-panel)',
                      boxShadow: '0 18px 45px -4px rgba(0, 0, 0, 0.75), 0 0 18px rgba(16, 185, 129, 0.22)'
                    }}
                  >
                    {/* Header harmonized with left column */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 255, 204, 0.15)', paddingBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                      <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 900, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Users size={20} />
                        2. Joueurs Inscrits
                      </h2>
                      <span style={{
                        background: selectedPlayers.length > 0 ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.06)',
                        color: selectedPlayers.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
                        border: selectedPlayers.length > 0 ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                        padding: '0.35rem 0.9rem',
                        borderRadius: '20px',
                        fontWeight: 800,
                        fontSize: '0.92rem'
                      }}>
                        {selectedPlayers.length} / {Object.keys(players).length} sélectionnés
                      </span>
                    </div>

                    {/* Filter search & Quick actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Rechercher un joueur ou un club..."
                          value={launcherPlayerSearch}
                          onChange={e => setLauncherPlayerSearch(e.target.value)}
                          style={{
                            width: '100%',
                            paddingLeft: '38px',
                            paddingRight: launcherPlayerSearch ? '34px' : '12px',
                            height: '42px',
                            fontSize: '0.9rem',
                            borderRadius: '10px'
                          }}
                        />
                        {launcherPlayerSearch && (
                          <button
                            type="button"
                            onClick={() => setLauncherPlayerSearch('')}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem', borderRadius: '8px' }}
                            onClick={() => setSelectedPlayers(Object.keys(players))}
                          >
                            Tout cocher ({Object.keys(players).length})
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem', borderRadius: '8px' }}
                            onClick={() => setSelectedPlayers([])}
                          >
                            Tout décocher
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '0.78rem', padding: '0.35rem 0.85rem', background: 'rgba(0, 255, 204, 0.12)', border: '1px solid rgba(0, 255, 204, 0.3)', color: 'var(--accent-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('players'); }}
                        >
                          <UserPlus size={14} />
                          + Nouveau joueur
                        </button>
                      </div>
                    </div>

                    {/* Players List with clean scroll and no text truncation */}
                    <div style={{
                      flex: 1,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      maxHeight: '680px',
                      paddingRight: '0.4rem'
                    }}>
                      {Object.values(players)
                        .filter(p => {
                          if (!launcherPlayerSearch.trim()) return true;
                          const q = launcherPlayerSearch.toLowerCase().trim();
                          const nameMatch = p.name.toLowerCase().includes(q);
                          const clubMatch = (p.clubName || p.stats?.clubName || '').toLowerCase().includes(q);
                          return nameMatch || clubMatch;
                        })
                        .map(p => {
                          const isSelected = selectedPlayers.includes(p.id);
                          const isPrestige = p.level === 'Prestige' || p.level === 'Confirmé';
                          return (
                            <div
                              key={p.id}
                              onClick={() => togglePlayerSelection(p.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.85rem',
                                padding: '0.8rem 1rem',
                                background: isSelected ? (theme === 'light' ? 'rgba(13, 148, 136, 0.12)' : 'rgba(0, 255, 204, 0.22)') : 'rgba(7, 46, 42, 0.6)',
                                border: isSelected ? '1.5px solid var(--accent-primary)' : '1px solid rgba(45, 212, 191, 0.25)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Custom checkbox */}
                              <div
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '6px',
                                  border: isSelected ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isSelected ? 'var(--accent-primary)' : 'transparent',
                                  flexShrink: 0,
                                  transition: 'all 0.15s'
                                }}
                              >
                                {isSelected && <Check size={14} color="#000" strokeWidth={3} />}
                              </div>

                              <img
                                src={getPlayerAvatar(p)}
                                alt={p.name}
                                style={{
                                  width: '42px',
                                  height: '42px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  flexShrink: 0,
                                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)'
                                }}
                              />

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                                    {p.name}
                                  </span>
                                  {(p.clubName || p.stats?.clubName) && (
                                    <span style={{
                                      fontSize: '0.72rem',
                                      background: 'rgba(0, 255, 170, 0.12)',
                                      color: 'var(--accent-primary)',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      fontWeight: 700,
                                      border: '1px solid rgba(0, 255, 170, 0.28)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      {(p.clubLogoUrl || p.stats?.clubLogoUrl) && (
                                        <img src={p.clubLogoUrl || p.stats?.clubLogoUrl} alt="" style={{ width: '13px', height: '13px', objectFit: 'contain', background: '#fff', borderRadius: '2px' }} />
                                      )}
                                      {p.clubName || p.stats?.clubName}
                                    </span>
                                  )}
                                  {isPrestige ? (
                                    <span style={{
                                      fontSize: '0.68rem',
                                      background: 'rgba(255, 215, 0, 0.18)',
                                      color: '#ffd700',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      fontWeight: 800,
                                      border: '1px solid rgba(255, 215, 0, 0.4)'
                                    }}>
                                      👑 Prestige
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: '0.68rem',
                                      background: 'rgba(255, 255, 255, 0.06)',
                                      color: 'rgba(255,255,255,0.65)',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                      Amateur
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                  {p.stats.matchesPlayed} matchs • {p.stats.winRate}% vict. ({p.stats.wins}V - {p.stats.losses ?? (p.stats.matchesPlayed - p.stats.wins)}D)
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                                <button
                                  type="button"
                                  title={`Modifier la fiche et le club de ${p.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab('admin');
                                    setAdminSubTab('players');
                                    setEditingPlayerId(p.id);
                                    setEditPlayerName(p.name);
                                    setEditPlayerLevel(p.level === 'Confirmé' ? 'Prestige' : p.level);
                                    setEditPlayerPhoto(null);
                                    setEditPlayerClubName(p.clubName || p.stats?.clubName || '');
                                    setEditPlayerClubLogo(p.clubLogoUrl || p.stats?.clubLogoUrl || null);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255, 255, 255, 0.45)',
                                    cursor: 'pointer',
                                    padding: '7px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.color = 'var(--accent-primary)';
                                    e.currentTarget.style.background = 'rgba(0, 255, 170, 0.12)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  type="button"
                                  title={`Supprimer définitivement ${p.name} du club`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le joueur "${p.name}" du club ?`)) {
                                      deletePlayer(p.id);
                                      setSelectedPlayers(prev => prev.filter(id => id !== p.id));
                                    }
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255, 68, 68, 0.45)',
                                    cursor: 'pointer',
                                    padding: '7px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.color = '#ff4444';
                                    e.currentTarget.style.background = 'rgba(255, 68, 68, 0.12)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.color = 'rgba(255, 68, 68, 0.45)';
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
              if (isRealFinishedMatch(m, players)) {
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
              m => (!m.stage || m.stage === 'qualif') && isRealFinishedMatch(m, players) &&
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

          const finishedMatches = allTourMatches
            .filter(m => isRealFinishedMatch(m, players))
            .sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0));

          if (dashboardSubTab === 'bracket') {
            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflowY: 'auto' }}>
                <TournamentBracketView
                  onSelectTableForQR={setSelectedTableForQR}
                  onOpenEditRules={() => {
                    setEditTourSettings({ ...activeTournament.settings });
                    setShowEditRulesModal(true);
                  }}
                />
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.2rem', flex: 1, minHeight: 0 }}>
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

              <div style={{
                display: 'grid',
                gridTemplateColumns: isNarrowScreen
                  ? '1fr'
                  : isSmallDesktop
                    ? 'minmax(220px, 260px) minmax(0, 1fr) minmax(360px, 440px)'
                    : 'minmax(270px, 295px) minmax(0, 1fr) minmax(500px, 600px)',
                gap: isSmallDesktop ? '0.85rem' : '1.2rem',
                flex: isNarrowScreen ? undefined : 1,
                minHeight: isNarrowScreen ? undefined : 0,
                minWidth: 0
              }}>

                {/* LEFT: FILE D'ATTENTE PLEINE HAUTEUR (100% DE LA COLONNE) */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  {/* File d'attente (Prend 100% de la hauteur) */}
                  <div className="glass-card" style={{ padding: '1rem 1.05rem', display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>
                    {(() => {
                      const filteredWaitingMatches = matchesWaiting.filter(m => {
                        if (!playerSearchQuery.trim()) return true;
                        const q = playerSearchQuery.toLowerCase();
                        const p1 = (players[m.player1Id]?.name || '').toLowerCase();
                        const p2 = (players[m.player2Id]?.name || '').toLowerCase();
                        return p1.includes(q) || p2.includes(q);
                      });

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexShrink: 0 }}>
                            <h3 style={{ fontSize: '1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                              <Users size={16} style={{ color: 'var(--accent-secondary)' }} /> File d'attente
                            </h3>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-secondary)', padding: '2px 7px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 229, 255, 0.3)' }}>
                              {filteredWaitingMatches.length}{playerSearchQuery.trim() ? ` / ${matchesWaiting.length}` : ''} {matchesWaiting.length > 1 ? 'matchs' : 'match'}
                            </span>
                          </div>

                          {/* Barre de recherche des joueurs */}
                          <div style={{ position: 'relative', marginBottom: '0.7rem', flexShrink: 0 }}>
                            <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                              type="text"
                              placeholder="Rechercher un joueur..."
                              value={playerSearchQuery}
                              onChange={(e) => setPlayerSearchQuery(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.42rem 1.8rem 0.42rem 1.9rem',
                                borderRadius: '7px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(0,0,0,0.3)',
                                color: '#fff',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box'
                              }}
                            />
                            {playerSearchQuery && (
                              <button
                                onClick={() => setPlayerSearchQuery('')}
                                style={{
                                  position: 'absolute',
                                  right: '7px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="Effacer la recherche"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingRight: '0.25rem' }}>
                            {matchesWaiting.length === 0 ? (
                              <div style={{ color: 'var(--card-text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1.5rem' }}>
                                Aucun match en attente.
                              </div>
                            ) : filteredWaitingMatches.length === 0 ? (
                              <div style={{ color: 'var(--card-text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1.5rem' }}>
                                Aucun match trouvé pour "{playerSearchQuery}".
                              </div>
                            ) : (
                              filteredWaitingMatches.map((match, idx) => {
                                const busyInfo = getBusyPlayerInfo(match);
                                const stakeInfo = getMatchStakeInfo(match, scheduleContext);
                                const isExpanded = expandedQueueMatchId === match.id;

                                return (
                                  <div
                                    key={match.id}
                                    onClick={() => setExpandedQueueMatchId(prev => (prev === match.id ? null : match.id))}
                                    style={{
                                      background: isExpanded
                                        ? 'rgba(0, 255, 170, 0.06)'
                                        : (theme === 'light' ? 'rgba(15, 23, 42, 0.03)' : 'rgba(255,255,255,0.03)'),
                                      border: isExpanded
                                        ? '1px solid rgba(0, 255, 170, 0.35)'
                                        : '1px solid var(--border-color)',
                                      borderRadius: '11px',
                                      padding: '0.6rem 0.75rem',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.35rem',
                                      boxSizing: 'border-box',
                                      width: '100%',
                                      cursor: 'pointer',
                                      transition: 'border-color 0.15s ease, background 0.15s ease'
                                    }}
                                  >
                                    {/* En-tête compact : numéro + poule + enjeu + bouton menu */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 800 }}>#{idx + 1}</span>
                                        {match.poolName && (
                                          <span style={{ fontSize: '0.64rem', color: 'var(--accent-primary)', fontWeight: 700, background: 'rgba(0, 255, 204, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                                            {match.poolName}
                                          </span>
                                        )}
                                        <span
                                          title={stakeInfo.description}
                                          style={{
                                            fontSize: '0.64rem',
                                            fontWeight: 700,
                                            background: stakeInfo.badgeBg,
                                            border: `1px solid ${stakeInfo.badgeBorder}`,
                                            color: stakeInfo.badgeColor,
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                          }}
                                        >
                                          {stakeInfo.label}
                                        </span>
                                      </div>
                                      <span
                                        style={{ color: isExpanded ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                                        title={isExpanded ? 'Masquer les actions' : 'Cliquer pour afficher les actions'}
                                      >
                                        <MoreHorizontal size={15} />
                                      </span>
                                    </div>

                                    {/* Joueurs (lisible et épuré sans encadré imbriqué) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--card-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {players[match.player1Id]?.name || 'Attente...'}
                                        </span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, flexShrink: 0 }}>
                                          {stakeInfo.p1Played}M
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--card-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>vs</span>
                                          {players[match.player2Id]?.name || 'Attente...'}
                                        </span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, flexShrink: 0 }}>
                                          {stakeInfo.p2Played}M
                                        </span>
                                      </div>
                                    </div>

                                    {/* Alerte si un joueur joue déjà */}
                                    {busyInfo.busy && (
                                      <div style={{ fontSize: '0.66rem', color: '#ffb703', background: 'rgba(255, 183, 3, 0.12)', padding: '2px 7px', borderRadius: '6px', border: '1px solid rgba(255, 183, 3, 0.25)' }}>
                                        {busyInfo.playerName} joue sur {busyInfo.tableName}
                                      </div>
                                    )}

                                    {/* Actions dépliées au clic sur la carte */}
                                    {isExpanded && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.4rem', marginTop: '0.2rem', borderTop: '1px solid var(--border-color)' }}
                                      >
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                                          <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{
                                              fontSize: '0.68rem',
                                              padding: '4px 6px',
                                              height: '26px',
                                              borderRadius: '7px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: '4px',
                                              color: '#ffd700',
                                              borderColor: 'rgba(255, 215, 0, 0.35)',
                                              background: 'rgba(255, 215, 0, 0.08)',
                                              width: '100%'
                                            }}
                                            onClick={() => announceWaitingMatchPrep({
                                              player1Name: players[match.player1Id]?.name || 'Joueur 1',
                                              player2Name: players[match.player2Id]?.name || 'Joueur 2',
                                              rankIndex: idx + 1
                                            })}
                                            title="Pré-appeler ces deux joueurs au micro pour qu'ils se tiennent prêts"
                                          >
                                            <Volume2 size={11} /> Pré-appel
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{
                                              fontSize: '0.68rem',
                                              padding: '4px 6px',
                                              height: '26px',
                                              borderRadius: '7px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: '4px',
                                              color: '#34D399',
                                              borderColor: 'rgba(52, 211, 153, 0.4)',
                                              background: 'rgba(16, 185, 129, 0.1)',
                                              width: '100%'
                                            }}
                                            onClick={() => openDirectScoreModal(match)}
                                            title="Marquer le score si ce match a été joué sans être lancé officiellement sur un billard"
                                          >
                                            <Edit2 size={11} /> Saisir score
                                          </button>
                                        </div>

                                        {activeTournament.settings?.tableIds && activeTournament.settings.tableIds.length > 0 && (
                                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            {activeTournament.settings.tableIds.map(tId => {
                                              const tObj = tables[tId];
                                              const label = tObj ? `T.${tObj.number}` : tId;
                                              const curM = (tObj?.currentMatchId && matches[tObj.currentMatchId])
                                                ? matches[tObj.currentMatchId]
                                                : Object.values(matches).find(m => m.tableId === tId && m.status !== 'finished') || null;
                                              const isPlaying = curM && curM.status === 'playing';
                                              const isPending = curM && curM.status === 'pending';
                                              const isFree = !curM || tObj?.status === 'free';
                                              const canLaunch = !isPlaying && !busyInfo.busy;

                                              return (
                                                <button
                                                  key={tId}
                                                  type="button"
                                                  className={canLaunch ? 'btn btn-neon' : 'btn btn-outline'}
                                                  disabled={!canLaunch}
                                                  style={{
                                                    flex: '1 1 auto',
                                                    fontSize: '0.68rem',
                                                    padding: '3px 8px',
                                                    height: '25px',
                                                    borderRadius: '7px',
                                                    fontWeight: canLaunch ? 800 : 600,
                                                    color: isPlaying ? 'rgba(255,255,255,0.35)' : (busyInfo.busy ? 'rgba(255,183,3,0.55)' : '#041210'),
                                                    background: isPlaying ? 'rgba(255,255,255,0.03)' : (busyInfo.busy ? 'rgba(255,183,3,0.08)' : undefined),
                                                    borderColor: isPlaying ? 'rgba(255,255,255,0.08)' : (busyInfo.busy ? 'rgba(255,183,3,0.2)' : undefined),
                                                    opacity: canLaunch ? 1 : 0.45,
                                                    cursor: canLaunch ? 'pointer' : 'not-allowed'
                                                  }}
                                                  title={
                                                    busyInfo.busy ? `Impossible : ${busyInfo.playerName} joue actuellement sur ${busyInfo.tableName}` :
                                                      isPlaying ? `Occupé : un match est déjà en cours de jeu sur ${tObj?.name || label}` :
                                                        isPending ? `Table ${label} : un match est en attente. Cliquez pour remplacer et lancer immédiatement ce match.` :
                                                          `Lancer immédiatement ce match sur ${tObj?.name || label}`
                                                  }
                                                  onClick={() => {
                                                    if (busyInfo.busy) {
                                                      return alert(`Impossible : ${busyInfo.playerName} joue actuellement sur ${busyInfo.tableName}`);
                                                    }
                                                    if (isPlaying) {
                                                      return alert(`Un match est déjà en cours de jeu sur ${tObj?.name || label}.`);
                                                    }
                                                    if (isPending) {
                                                      const confirmReplace = window.confirm(
                                                        `Le billard ${tObj?.name || label} a un match programmé en attente de démarrage.\n\nVoulez-vous remplacer ce match et lancer immédiatement celui-ci ?`
                                                      );
                                                      if (!confirmReplace) return;
                                                    }
                                                    const res = launchMatchOnTable(match.id, tId);
                                                    if (!res.success && res.reason) {
                                                      alert(res.reason);
                                                    } else {
                                                      setExpandedQueueMatchId(null);
                                                    }
                                                  }}
                                                >
                                                  {label} {isFree ? '(Libre)' : (isPending ? '(Prêt)' : '')}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* CENTER: Classement (mis en avant) + métadonnées + 2 boutons bas */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  {/* Ranking */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1.15rem 1.35rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.9rem', flexShrink: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.22rem', color: 'var(--accent-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                          <Trophy size={19} /> Classement
                        </h2>
                        {qualifStatus.isMultiPool && qualifStatus.rankingsByPool && qualifStatus.poolNames && qualifStatus.poolNames.length > 1 && (
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setActivePoolRankingTab('all')}
                              style={{
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                border: activePoolRankingTab === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                background: activePoolRankingTab === 'all' ? 'rgba(0, 255, 204, 0.22)' : 'rgba(255,255,255,0.03)',
                                color: activePoolRankingTab === 'all' ? 'var(--accent-primary)' : 'var(--card-text)',
                                cursor: 'pointer'
                              }}
                            >
                              Toutes
                            </button>
                            {qualifStatus.poolNames.map(pName => (
                              <button
                                key={pName}
                                type="button"
                                onClick={() => setActivePoolRankingTab(pName)}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  border: activePoolRankingTab === pName ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                  background: activePoolRankingTab === pName ? 'rgba(0, 255, 204, 0.22)' : 'rgba(255,255,255,0.03)',
                                  color: activePoolRankingTab === pName ? 'var(--accent-primary)' : 'var(--card-text)',
                                  cursor: 'pointer'
                                }}
                              >
                                {pName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Métadonnées compactes du tournoi */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                          {finishedTourMatches.length} / {allTourMatches.length} matchs
                        </span>
                        {activeTournament.format !== 'direct_ko' && activeTournament.format !== 'double_ko_bracket' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (activeTournament.settings) {
                                setEditTourSettings({
                                  ...activeTournament.settings,
                                  qualifNbQualifiers: qualifStatus.numQualifiers
                                });
                                setShowEditRulesModal(true);
                              }
                            }}
                            style={{
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: 'var(--accent-primary)',
                              padding: '2px 8px',
                              borderRadius: '8px',
                              fontWeight: 700,
                              fontSize: '0.74rem',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={qualifStatus.isFinalLaunched
                              ? 'Phase finale déjà lancée : nombre de sortants verrouillé'
                              : 'Cliquer pour modifier le nombre de sortants / qualifiés'}
                          >
                            {qualifStatus.numQualifiers} qualifiés
                            {!qualifStatus.isFinalLaunched && <span style={{ opacity: 0.9 }}>✎</span>}
                          </button>
                        ) : (
                          <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                            {activeTournament.participants.length} joueurs
                          </span>
                        )}
                        {(activeTournament.settings?.finalMatchDurationMinutes || activeTournament.settings?.qualifMatchDurationMinutes || activeTournament.settings?.matchDurationMinutes) ? (
                          <span style={{ background: 'rgba(255, 215, 0, 0.12)', color: '#ffd700', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                            ⏱️ {activeTournament.settings.finalMatchDurationMinutes || activeTournament.settings.qualifMatchDurationMinutes || activeTournament.settings.matchDurationMinutes} min
                          </span>
                        ) : null}
                        {(() => {
                          const latestFinished = finishedTourMatches.reduce((maxTs, m) => Math.max(maxTs, m.endTime || m.startTime || 0), 0);
                          if (!latestFinished) return null;
                          return (
                            <span style={{ background: 'rgba(0, 229, 255, 0.09)', color: 'var(--accent-secondary)', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                              Dernier validé : {formatShortDateTime(latestFinished)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {qualifStatus.isMultiPool && qualifStatus.rankingsByPool && qualifStatus.poolNames && qualifStatus.poolNames.length > 1 ? (
                        (activePoolRankingTab === 'all' ? qualifStatus.poolNames : [activePoolRankingTab]).map(pName => {
                          const poolRank = qualifStatus.rankingsByPool[pName] || [];
                          const qualPerPool = Math.max(1, Math.round(qualifStatus.numQualifiers / qualifStatus.poolNames.length));

                          return (
                            <div key={pName} style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.8rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  🎱 {pName}
                                </span>
                                <span style={{ fontSize: '0.72rem', background: 'rgba(0, 255, 204, 0.12)', color: 'var(--accent-primary)', padding: '2px 7px', borderRadius: '8px', fontWeight: 700 }}>
                                  Top {qualPerPool} qualifié{qualPerPool > 1 ? 's' : ''}
                                </span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                                <thead>
                                  <tr style={{ color: 'var(--card-text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem' }}>#</th>
                                    <th style={{ padding: '0.45rem' }}>Joueur</th>
                                    <th style={{ padding: '0.45rem', textAlign: 'center' }} title="Matchs Joués">J</th>
                                    <th style={{ padding: '0.45rem', textAlign: 'center', color: 'var(--accent-primary)' }} title="Matchs Gagnés">G</th>
                                    <th style={{ padding: '0.45rem', textAlign: 'center', color: '#ff6b6b' }} title="Matchs Perdus">P</th>
                                    <th style={{ padding: '0.45rem', textAlign: 'center' }} title="Différence de manches">+/-</th>
                                    <th style={{ padding: '0.45rem', textAlign: 'center', color: 'var(--accent-primary)' }}>PTS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {poolRank.map((p, i) => {
                                    const isQualifyingZone = i < qualPerPool;
                                    const isCutoff = i === qualPerPool - 1 && i < poolRank.length - 1;
                                    const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#cbd5e1' : i === 2 ? '#f59e0b' : (isQualifyingZone ? 'var(--accent-primary)' : 'inherit');
                                    return (
                                      <tr
                                        key={p.id}
                                        style={{
                                          borderBottom: isCutoff ? '2px dashed rgba(16, 185, 129, 0.5)' : '1px solid var(--border-color)',
                                          background: isQualifyingZone ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
                                        }}
                                      >
                                        <td style={{ padding: '0.52rem 0.45rem', fontWeight: 900, color: rankColor }}>{i + 1}</td>
                                        <td style={{ padding: '0.52rem 0.45rem', fontWeight: 600 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>{p.name}</span>
                                            {p.isSure && (
                                              <span style={{ fontSize: '0.62rem', background: 'rgba(16, 185, 129, 0.18)', color: 'var(--accent-primary)', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }} title="Mathématiquement qualifié">
                                                Qualifié
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td style={{ padding: '0.52rem 0.45rem', textAlign: 'center', color: 'var(--text-muted)' }}>{p.played}</td>
                                        <td style={{ padding: '0.52rem 0.45rem', textAlign: 'center', fontWeight: 700, color: 'var(--accent-primary)' }}>{p.won}</td>
                                        <td style={{ padding: '0.52rem 0.45rem', textAlign: 'center', color: p.lost > 0 ? '#ff6b6b' : 'var(--text-muted)' }}>{p.lost}</td>
                                        <td style={{ padding: '0.52rem 0.45rem', textAlign: 'center' }}>{p.sf - p.sa > 0 ? `+${p.sf - p.sa}` : p.sf - p.sa}</td>
                                        <td style={{ padding: '0.52rem 0.45rem', textAlign: 'center', fontWeight: 800, color: 'var(--accent-primary)' }}>{p.pts}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', backdropFilter: 'blur(10px)', zIndex: 1 }}>
                            <tr style={{ color: 'var(--card-text-muted)', borderBottom: '2px solid var(--border-color)', fontSize: '0.82rem' }}>
                              <th style={{ padding: '0.55rem' }}>#</th>
                              <th style={{ padding: '0.55rem' }}>Joueur</th>
                              <th style={{ padding: '0.55rem', textAlign: 'center' }} title="Matchs Joués">J</th>
                              <th style={{ padding: '0.55rem', textAlign: 'center', color: 'var(--accent-primary)' }} title="Matchs Gagnés">G</th>
                              <th style={{ padding: '0.55rem', textAlign: 'center', color: '#ff6b6b' }} title="Matchs Perdus">P</th>
                              <th style={{ padding: '0.55rem', textAlign: 'center' }} title="Différence de manches">+/-</th>
                              <th style={{ padding: '0.55rem', textAlign: 'center', color: 'var(--accent-primary)' }}>PTS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ranking.map((p, i) => {
                              const isSure = qualifStatus.sureQualifiers.includes(p.id);
                              const isQualifyingZone = i < qualifStatus.numQualifiers;
                              const isCutoff = i === qualifStatus.numQualifiers - 1 && i < ranking.length - 1;
                              const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#cbd5e1' : i === 2 ? '#f59e0b' : (isQualifyingZone ? 'var(--accent-primary)' : 'inherit');
                              return (
                                <tr
                                  key={p.id}
                                  style={{
                                    borderBottom: isCutoff ? '2px dashed rgba(16, 185, 129, 0.5)' : '1px solid var(--border-color)',
                                    background: isQualifyingZone ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
                                  }}
                                >
                                  <td style={{ padding: '0.65rem 0.55rem', fontWeight: 900, color: rankColor }}>{i + 1}</td>
                                  <td style={{ padding: '0.65rem 0.55rem', fontWeight: 600 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>{p.name}</span>
                                      {isSure && (
                                        <span style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.18)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }} title="Mathématiquement qualifié">
                                          Qualifié
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.65rem 0.55rem', textAlign: 'center', color: 'var(--text-muted)' }}>{p.played}</td>
                                  <td style={{ padding: '0.65rem 0.55rem', textAlign: 'center', fontWeight: 700, color: 'var(--accent-primary)' }}>{p.won}</td>
                                  <td style={{ padding: '0.65rem 0.55rem', textAlign: 'center', color: p.lost > 0 ? '#ff6b6b' : 'var(--text-muted)' }}>{p.lost}</td>
                                  <td style={{ padding: '0.65rem 0.55rem', textAlign: 'center' }}>{p.sf - p.sa > 0 ? `+${p.sf - p.sa}` : p.sf - p.sa}</td>
                                  <td style={{ padding: '0.65rem 0.55rem', textAlign: 'center', fontWeight: 800, color: 'var(--accent-primary)' }}>{p.pts}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Pied du classement : 2 boutons sobres côte à côte */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.85rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setShowResultsModal(true)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          color: '#ffd700',
                          borderColor: 'rgba(255, 215, 0, 0.35)',
                          background: 'rgba(255, 215, 0, 0.06)',
                          fontSize: '0.84rem',
                          fontWeight: 700
                        }}
                      >
                        <Clock size={15} /> Derniers résultats ({finishedMatches.length})
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setDashboardSubTab('bracket')}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          color: (activeTournament.finalStageLaunched || hasSureQualifiers || qualifStatus.isQualifAllDone) ? 'var(--accent-primary)' : 'var(--text-muted)',
                          borderColor: (activeTournament.finalStageLaunched || hasSureQualifiers) ? 'rgba(0, 255, 170, 0.35)' : 'var(--border-color)',
                          fontSize: '0.84rem',
                          fontWeight: 700
                        }}
                        title="Voir le tableau des phases finales"
                      >
                        <Trophy size={15} />
                        <span>Phases finales</span>
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 800,
                          background: activeTournament.finalStageLaunched
                            ? 'var(--accent-primary)'
                            : (hasSureQualifiers || qualifStatus.isQualifAllDone)
                              ? 'rgba(0,255,170,0.18)'
                              : 'rgba(255,255,255,0.08)',
                          color: activeTournament.finalStageLaunched
                            ? '#041210'
                            : (hasSureQualifiers || qualifStatus.isQualifAllDone)
                              ? 'var(--accent-primary)'
                              : '#fbbf24'
                        }}>
                          {activeTournament.finalStageLaunched ? 'EN COURS' : (hasSureQualifiers || qualifStatus.isQualifAllDone) ? 'Prêt' : 'Provisoire'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Pop-up : vérification et modification des derniers résultats */}
                  {showResultsModal && (
                    <div
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                      onClick={() => { setShowResultsModal(false); setEditingFinishedMatchId(null); }}
                    >
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1.2rem 1.4rem', width: 'min(680px, 94vw)', height: 'min(82vh, 780px)', overflow: 'hidden', border: '1px solid rgba(255, 215, 0, 0.35)' }} onClick={(e) => e.stopPropagation()}>
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
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => { setShowResultsModal(false); setEditingFinishedMatchId(null); }}
                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        title="Fermer"
                      >
                        <X size={13} /> Fermer
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
                                  const matchRules = getMatchScoringRules(m, activeTournament, players);
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
                              {(m.endTime || m.startTime) && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{m.poolName || (m.stage && m.stage !== 'qualif' ? m.stage.toUpperCase() : 'Poules')}</span>
                                  <span>Terminé : {formatShortDateTime(m.endTime || m.startTime)}</span>
                                </div>
                              )}
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
                  )}
                </div>

                {/* RIGHT: Billards du tournoi en live (hiérarchisé : 1 action principale + appel + menu ⋯) */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
                  {openBillardMenuId && (
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 45 }}
                      onClick={() => setOpenBillardMenuId(null)}
                    />
                  )}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: '1rem 1.1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', flexShrink: 0, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800 }}>
                          <MonitorPlay size={18} style={{ color: 'var(--accent-primary)' }} /> Billards Live
                        </h2>
                        <span style={{ fontSize: '0.74rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                          {tournamentTablesOrdered.length}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {matchesToPlay.some(m => m.status === 'pending') && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{
                              fontSize: '0.73rem',
                              padding: '4px 9px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 700,
                              color: '#ffd700',
                              borderColor: 'rgba(255, 215, 0, 0.35)',
                              background: 'rgba(255, 215, 0, 0.08)'
                            }}
                            onClick={() => {
                              const pendingItems = matchesToPlay
                                .filter(m => m.status === 'pending')
                                .map(m => {
                                  const effId = getEffectiveTableId(m);
                                  const tObj = effId ? tables[effId] : null;
                                  const tName = tObj?.name || (effId ? `Billard ${tObj?.number || effId}` : 'Billard');
                                  return {
                                    tableName: tName,
                                    player1Name: players[m.player1Id]?.name || 'Joueur 1',
                                    player2Name: players[m.player2Id]?.name || 'Joueur 2'
                                  };
                                });
                              announceAllReadyMatches(pendingItems);
                            }}
                            title="Appeler vocalement tous les matchs prêts à démarrer"
                          >
                            <Volume2 size={14} /> Appeler tous
                          </button>
                        )}
                        <a
                          href={`${getAppBaseUrl()}/?overlay=all&club=${currentClub.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline"
                          style={{
                            fontSize: '0.73rem',
                            padding: '4px 9px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap',
                            fontWeight: 700,
                            color: 'var(--accent-primary)',
                            borderColor: 'rgba(0, 255, 170, 0.35)'
                          }}
                          title="Ouvrir la mosaïque Multi-Live Vidéo"
                        >
                          <Tv size={14} /> Multi-Live
                        </a>
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
                      {tournamentTablesOrdered.map(table => {
                        const match = matchesToPlay.find(m => getEffectiveTableId(m) === table.id);
                        const tableName = table.name || `Billard ${table.number}`;

                        // ===== Billard libre =====
                        if (!match) {
                          return (
                            <div
                              key={table.id}
                              style={{
                                flex: '1 1 0',
                                minHeight: '120px',
                                background: 'rgba(255,255,255,0.025)',
                                border: '1.5px dashed rgba(255,255,255,0.18)',
                                borderRadius: '16px',
                                padding: '1rem 1.2rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                boxSizing: 'border-box'
                              }}
                            >
                              <div style={{ color: 'var(--card-text)', fontWeight: 900, fontSize: '1.2rem' }}>{tableName}</div>
                              <div style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8', fontWeight: 800, fontSize: '0.8rem', padding: '2px 11px', borderRadius: '999px', letterSpacing: '0.5px' }}>
                                ○ LIBRE
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>En attente du prochain match</div>
                              <button
                                className="btn btn-outline"
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.85rem', borderRadius: '8px' }}
                                onClick={() => setSelectedTableForQR(table.id)}
                              >
                                Gérer ce billard
                              </button>
                            </div>
                          );
                        }

                        const effTableId = table.id;
                        const stakeInfo = getMatchStakeInfo(match, scheduleContext);
                        const isPlayingMatch = match.status === 'playing';
                        const cardTheme = isPlayingMatch
                          ? {
                              accent: '#00e5a0',
                              label: '● MATCH EN COURS',
                              bg: 'linear-gradient(155deg, rgba(0, 229, 160, 0.14) 0%, rgba(10, 28, 24, 0.65) 100%)',
                              border: '2px solid rgba(0, 229, 160, 0.72)',
                              band: 'rgba(0, 229, 160, 0.16)'
                            }
                          : {
                              accent: '#ffb020',
                              label: '⏳ MATCH À LANCER',
                              bg: 'linear-gradient(155deg, rgba(255, 176, 32, 0.14) 0%, rgba(36, 24, 8, 0.65) 100%)',
                              border: '2px solid rgba(255, 176, 32, 0.75)',
                              band: 'rgba(255, 176, 32, 0.18)'
                            };
                        const matchUrl = getMatchShareUrl(match.id, effTableId || match.tableId, match.tournamentId || activeTournament.id);
                        const nameStyle: React.CSSProperties = { fontWeight: 800, fontSize: '1.12rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' };
                        const isCardMenuOpen = openBillardMenuId === match.id;

                        return (
                          <div
                            key={match.id}
                            style={{
                              flex: '1 1 0',
                              minHeight: '200px',
                              position: 'relative',
                              overflow: 'visible',
                              background: cardTheme.bg,
                              border: cardTheme.border,
                              borderRadius: '16px',
                              padding: '0.8rem 1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.55rem',
                              boxSizing: 'border-box'
                            }}
                          >
                            {/* Bandeau statut */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', background: cardTheme.band, borderRadius: '10px', padding: '0.32rem 0.7rem' }}>
                              <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.15rem' }}>{tableName}</span>
                              <span style={{ color: cardTheme.accent, fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.4px' }}>{cardTheme.label}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              {match.poolName && (
                                <span style={{ background: 'rgba(0, 255, 204, 0.14)', color: 'var(--accent-primary)', fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: '4px' }}>
                                  {match.poolName}
                                </span>
                              )}
                              <span
                                title={stakeInfo.description}
                                style={{ fontSize: '0.7rem', fontWeight: 800, background: stakeInfo.badgeBg, border: `1px solid ${stakeInfo.badgeBorder}`, color: stakeInfo.badgeColor, padding: '1px 7px', borderRadius: '4px' }}
                              >
                                {stakeInfo.label}
                              </span>
                              {match.stage && match.stage !== 'qualif' && (
                                <span style={{ background: 'rgba(255, 215, 0, 0.2)', color: '#ffd700', fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: '4px' }}>
                                  {match.stage === 'final' ? '🏆 Finale' : match.stage === 'semi' ? '⚔️ 1/2 Finale' : '🎯 1/4 Finale'}
                                </span>
                              )}
                            </div>

                            {/* Joueurs + QR code (clic = agrandissement 5 s) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minHeight: 0 }}>
                              <div
                                role="button"
                                title="Cliquer pour agrandir le QR code (5 s)"
                                onClick={() => setQrZoom({
                                  url: matchUrl,
                                  title: `${tableName} — ${players[match.player1Id]?.name || ''} vs ${players[match.player2Id]?.name || ''}`,
                                  accent: cardTheme.accent
                                })}
                                style={{
                                  background: '#fff',
                                  padding: '0.45rem',
                                  borderRadius: '12px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                                  opacity: isPlayingMatch ? 0.65 : 1,
                                  cursor: 'zoom-in',
                                  flexShrink: 0,
                                  lineHeight: 0
                                }}
                              >
                                <QRCode value={matchUrl} size={104} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={nameStyle}>
                                  {players[match.player1Id]?.name}
                                  <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500, marginLeft: '5px' }}>({stakeInfo.p1Played}M)</small>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: cardTheme.accent, fontWeight: 900 }}>VS</div>
                                <div style={nameStyle}>
                                  {players[match.player2Id]?.name}
                                  <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500, marginLeft: '5px' }}>({stakeInfo.p2Played}M)</small>
                                </div>
                                {isPlayingMatch && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.3rem' }}>
                                    <span style={{ color: cardTheme.accent, fontWeight: 900, fontSize: '1.9rem', lineHeight: 1 }}>{match.score1} - {match.score2}</span>
                                    <MatchTimerBadge
                                      startTime={match.startTime}
                                      durationMinutes={match.durationMinutes ?? resolveMatchDurationMinutes(match, activeTournament)}
                                      status={match.status}
                                      size="sm"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions hiérarchisées */}
                            {isPlayingMatch ? (
                              effTableId && (
                                <button
                                  type="button"
                                  className="btn btn-neon"
                                  style={{ fontSize: '0.88rem', padding: '0.5rem 0.7rem', width: '100%', justifyContent: 'center', fontWeight: 800, color: '#041210', borderRadius: '10px', background: cardTheme.accent }}
                                  onClick={() => setSelectedTableForQR(effTableId)}
                                >
                                  Score / Terminer
                                </button>
                              )
                            ) : (
                              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', position: 'relative' }}>
                                <button
                                  type="button"
                                  className="btn btn-neon"
                                  style={{ flex: 1, fontSize: '0.88rem', padding: '0.52rem 0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', color: '#041210', fontWeight: 900, borderRadius: '10px', background: cardTheme.accent }}
                                  onClick={() => {
                                    startTournamentMatch(match.id, false);
                                    if (effTableId) setSelectedTableForQR(effTableId);
                                  }}
                                >
                                  <Play size={15} /> Démarrer
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: '0.52rem 0.75rem', borderRadius: '10px', color: '#ffd700', borderColor: 'rgba(255, 215, 0, 0.35)', background: 'rgba(255, 215, 0, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  title={`Appeler vocalement ${players[match.player1Id]?.name || 'Joueur 1'} et ${players[match.player2Id]?.name || 'Joueur 2'} sur ${tableName}`}
                                  onClick={() => announceMatchOnTable({
                                    match,
                                    tableName,
                                    player1Name: players[match.player1Id]?.name || 'Joueur 1',
                                    player2Name: players[match.player2Id]?.name || 'Joueur 2',
                                    stakeLabel: stakeInfo.label,
                                    isReminder: true
                                  })}
                                >
                                  <Volume2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: '0.52rem 0.7rem', borderRadius: '10px', color: isCardMenuOpen ? 'var(--accent-primary)' : '#fff', borderColor: isCardMenuOpen ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="Plus d'actions (saisir score, repousser)"
                                  onClick={() => setOpenBillardMenuId(prev => (prev === match.id ? null : match.id))}
                                >
                                  <MoreHorizontal size={16} />
                                </button>

                                {isCardMenuOpen && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      bottom: 'calc(100% + 6px)',
                                      right: 0,
                                      minWidth: '215px',
                                      background: '#0b1222',
                                      border: '1px solid rgba(255,255,255,0.18)',
                                      borderRadius: '12px',
                                      padding: '0.45rem',
                                      boxShadow: '0 12px 30px rgba(0,0,0,0.65)',
                                      zIndex: 60,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.35rem'
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '0.45rem 0.65rem', color: '#34D399', borderColor: 'rgba(52, 211, 153, 0.3)' }}
                                      onClick={() => {
                                        setOpenBillardMenuId(null);
                                        openDirectScoreModal(match);
                                      }}
                                    >
                                      <Edit2 size={14} /> Saisir le score
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem', padding: '0.45rem 0.65rem', color: '#fff', borderColor: 'rgba(255,255,255,0.15)' }}
                                      onClick={() => {
                                        setOpenBillardMenuId(null);
                                        if (effTableId && matchesWaiting.length > 0) {
                                          setPostponingMatchModal({ matchId: match.id, tableId: effTableId });
                                        } else {
                                          postponeMatch(match.id);
                                        }
                                      }}
                                    >
                                      <ArrowUpDown size={14} /> Repousser / Remplacer
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                        {unplayedQualifMatches.length > 0 && (
                          <div style={{ width: '100%', maxWidth: '700px', marginTop: '0.8rem', padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                Matchs de poule restants (non disputés pour passage en phase finale)
                              </span>
                              <span style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '8px' }}>
                                {unplayedQualifMatches.length} match{unplayedQualifMatches.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {unplayedQualifMatches.map(m => (
                                <div key={m.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span style={{ color: '#fff', fontWeight: 600 }}>{players[m.player1Id]?.name || 'J1'}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>VS</span>
                                  <span style={{ color: '#fff', fontWeight: 600 }}>{players[m.player2Id]?.name || 'J2'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* QR code agrandi : fermeture automatique après 5 secondes */}
                  {qrZoom && (
                    <div
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'pointer' }}
                      onClick={() => setQrZoom(null)}
                    >
                      <style>{'@keyframes qrzoomshrink { from { width: 100%; } to { width: 0%; } }'}</style>
                      <div
                        style={{ background: '#fff', borderRadius: '24px', padding: '1.6rem 1.8rem 1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', boxShadow: '0 0 60px rgba(0,0,0,0.7)', maxWidth: '92vw' }}
                      >
                        <div style={{ color: '#111', fontWeight: 900, fontSize: '1.4rem', textAlign: 'center' }}>{qrZoom.title}</div>
                        <QRCode value={qrZoom.url} size={Math.min(window.innerHeight * 0.62, window.innerWidth * 0.8, 560)} />
                        <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: qrZoom.accent, animation: 'qrzoomshrink 5s linear forwards' }} />
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>Fermeture automatique dans 5 secondes — cliquer pour fermer</div>
                      </div>
                    </div>
                  )}
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
              <div style={{ display: 'grid', gridTemplateColumns: isNarrowScreen ? '1fr' : 'minmax(0, 1fr) minmax(260px, 340px)', gap: isSmallDesktop ? '1.25rem' : '2rem', height: isNarrowScreen ? 'auto' : '100%', maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.3rem 0' }}>Pédigré des Joueurs ({Object.keys(players).length})</h2>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Gérez les membres du club : modifiez les fiches, ajoutez de nouveaux joueurs ou supprimez les profils inutilisés.
                      </span>
                    </div>
                    <button
                      className="btn btn-outline"
                      id="btn-recompute-stats"
                      onClick={() => {
                        recomputePlayerStats();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                        borderColor: 'var(--accent-primary)',
                        color: 'var(--accent-primary)',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer'
                      }}
                      title="Recalculer et synchroniser les statistiques depuis l'ensemble des matchs terminés"
                    >
                      <RefreshCw size={15} /> Actualiser les stats
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', overflowY: 'auto' }}>
                    {Object.values(players).map(p => (
                      <div key={p.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', position: 'relative' }}>

                        {editingPlayerId === p.id ? (
                          // Edit Mode
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <input type="text" className="input-field" placeholder="Nom du joueur" value={editPlayerName} onChange={e => setEditPlayerName(e.target.value)} />
                            <select className="input-field" value={editPlayerLevel === 'Confirmé' ? 'Prestige' : editPlayerLevel} onChange={e => setEditPlayerLevel(e.target.value)} style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
                              <option value="Amateur" style={{ color: '#000' }}>Amateur</option>
                              <option value="Prestige" style={{ color: '#000' }}>👑 Prestige</option>
                            </select>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Photo du joueur :</div>
                            <input type="file" accept="image/*" onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) readImageFile(file, (url) => setEditPlayerPhoto(url));
                            }} style={{ fontSize: '0.78rem' }} />
                            <input
                              type="text"
                              className="input-field"
                              placeholder="Club (optionnel)"
                              value={editPlayerClubName}
                              onChange={e => setEditPlayerClubName(e.target.value)}
                              style={{ fontSize: '0.82rem', padding: '0.45rem 0.7rem' }}
                            />
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logo du club (optionnel) :</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input type="file" accept="image/*" onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) readImageFile(file, (url) => setEditPlayerClubLogo(url));
                              }} style={{ fontSize: '0.76rem', flex: 1 }} />
                              {editPlayerClubLogo && <img src={editPlayerClubLogo} alt="Logo" style={{ width: '26px', height: '26px', borderRadius: '4px', objectFit: 'contain', background: '#fff', padding: '1px' }} />}
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                              <button className="btn" style={{ background: 'var(--accent-primary)', color: '#000', flex: 1, padding: '0.5rem', fontSize: '0.8rem' }} onClick={() => {
                                updatePlayer(p.id, editPlayerName, editPlayerLevel, editPlayerPhoto || undefined, editPlayerClubName.trim(), editPlayerClubLogo || '');
                                setEditingPlayerId(null);
                              }}>Sauvegarder</button>
                              <button className="btn btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }} onClick={() => setEditingPlayerId(null)}>Annuler</button>
                              <button
                                className="btn btn-outline"
                                style={{ width: '100%', borderColor: 'rgba(255, 68, 68, 0.4)', color: '#ff6b81', padding: '0.45rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                onClick={() => {
                                  if (window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le joueur "${p.name}" du club ?`)) {
                                    deletePlayer(p.id);
                                    setEditingPlayerId(null);
                                  }
                                }}
                              >
                                <Trash2 size={13} /> Supprimer ce joueur
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <>
                            <img src={getPlayerAvatar(p)} alt={p.name} style={{ width: '70px', height: '70px', borderRadius: '50%', border: `3px solid ${(p.level === 'Prestige' || p.level === 'Confirmé') ? '#ffd700' : 'var(--border-color)'}`, objectFit: 'cover' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span>{p.name}</span>
                                {(p.clubLogoUrl || p.stats?.clubLogoUrl || p.clubName || p.stats?.clubName) && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--accent-primary)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '6px' }}>
                                    {(p.clubLogoUrl || p.stats?.clubLogoUrl) && <img src={p.clubLogoUrl || p.stats?.clubLogoUrl} alt="" style={{ width: '14px', height: '14px', borderRadius: '3px', objectFit: 'contain', background: '#fff' }} />}
                                    {p.clubName || p.stats?.clubName}
                                  </span>
                                )}
                              </div>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: (p.level === 'Prestige' || p.level === 'Confirmé') ? '#ffd700' : '#CCFBF1',
                                background: (p.level === 'Prestige' || p.level === 'Confirmé') ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.12)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                marginBottom: '0.4rem',
                                fontWeight: 700
                              }}>
                                {(p.level === 'Prestige' || p.level === 'Confirmé') ? '👑 Prestige' : 'Amateur'}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                                {/* Row 1: Matchs & Victoires */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.6rem', borderRadius: '6px' }}>
                                  <div>
                                    <span style={{ color: '#CCFBF1', fontWeight: 600 }}>Matchs:</span> <b style={{ color: '#fff' }}>{p.stats.matchesPlayed}</b>
                                    <span style={{ color: '#CCFBF1', fontSize: '0.75rem', marginLeft: '5px' }}>
                                      ({p.stats.wins}V - {p.stats.losses ?? (p.stats.matchesPlayed - p.stats.wins)}D)
                                    </span>
                                  </div>
                                  <div style={{
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    color: p.stats.winRate >= 60 ? 'var(--accent-primary)' : (p.stats.winRate >= 45 ? '#ffcc00' : '#ff9999'),
                                    background: p.stats.winRate >= 60 ? 'rgba(0,255,170,0.18)' : 'rgba(255,255,255,0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '6px'
                                  }}>
                                    {p.stats.winRate}% vict.
                                  </div>
                                </div>

                                {/* Row 2: Manches & Titres */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#CCFBF1' }}>
                                  <div>
                                    <span style={{ color: '#CCFBF1' }}>Manches:</span> <b style={{ color: '#fff' }}>{p.stats.setsWon ?? 0}</b>/<b style={{ color: '#fff' }}>{p.stats.setsLost ?? 0}</b>
                                    <span style={{ color: (p.stats.setDiff ?? 0) >= 0 ? '#00ffaa' : '#ff7777', fontWeight: 700, marginLeft: '4px' }}>
                                      ({(p.stats.setDiff ?? 0) >= 0 ? `+${p.stats.setDiff ?? 0}` : p.stats.setDiff})
                                    </span>
                                  </div>
                                  {Boolean(p.stats.tournamentsWon && p.stats.tournamentsWon > 0) && (
                                    <span style={{ color: '#ffd700', fontWeight: 800 }}>
                                      🏆 {p.stats.tournamentsWon} {(p.stats.tournamentsWon ?? 0) > 1 ? 'titres' : 'titre'}
                                    </span>
                                  )}
                                </div>

                                {/* Row 3: Bête Noire & Rival habituel si existant */}
                                {(p.stats.nemesisId || p.stats.bestFriendId) && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.72rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.35rem' }}>
                                    {p.stats.nemesisId && players[p.stats.nemesisId] && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#CCFBF1' }}>
                                        <span>Bête noire: <span style={{ color: '#ffa4a4', fontWeight: 700 }}>{players[p.stats.nemesisId].name}</span></span>
                                        <span style={{ color: '#ffa4a4', fontWeight: 700 }}>
                                          {p.stats.nemesisLosses ? `${p.stats.nemesisLosses} déf.` : `${p.stats.nemesisLossRate}%`}
                                        </span>
                                      </div>
                                    )}
                                    {p.stats.bestFriendId && players[p.stats.bestFriendId] && p.stats.bestFriendId !== p.stats.nemesisId && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#CCFBF1' }}>
                                        <span>Rival habituel: <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{players[p.stats.bestFriendId].name}</span></span>
                                        <span style={{ fontWeight: 700, color: '#fff' }}>{p.stats.bestFriendMatches} m.</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Row 4: Mini badges Forme récente */}
                                {p.stats.recentForm && p.stats.recentForm.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#CCFBF1', fontWeight: 600 }}>Forme:</span>
                                    {p.stats.recentForm.map((f, i) => (
                                      <span key={i} style={{
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.62rem',
                                        fontWeight: 900,
                                        background: f === 'W' ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 68, 68, 0.2)',
                                        color: f === 'W' ? 'var(--accent-primary)' : '#ff4444',
                                        border: `1px solid ${f === 'W' ? 'rgba(0, 255, 170, 0.5)' : 'rgba(255, 68, 68, 0.5)'}`
                                      }}>
                                        {f === 'W' ? 'V' : 'D'}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '0.4rem' }}>
                              <button
                                title={`Modifier ${p.name}`}
                                onClick={() => {
                                  setEditingPlayerId(p.id);
                                  setEditPlayerName(p.name);
                                  setEditPlayerLevel(p.level === 'Confirmé' ? 'Prestige' : p.level);
                                  setEditPlayerPhoto(null);
                                  setEditPlayerClubName(p.clubName || p.stats?.clubName || '');
                                  setEditPlayerClubLogo(p.clubLogoUrl || p.stats?.clubLogoUrl || null);
                                }}
                                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                title={`Supprimer définitivement ${p.name}`}
                                onClick={() => {
                                  if (window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le joueur "${p.name}" du club ?`)) {
                                    deletePlayer(p.id);
                                  }
                                }}
                                style={{ background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.35)', color: '#ff6b81', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Player Sidebar */}
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
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Club (optionnel)</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder={`Ex: ${currentClub.name}`}
                        value={newPlayerClubName}
                        onChange={e => setNewPlayerClubName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Logo du Club (optionnel)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) readImageFile(f, (url) => setNewPlayerClubLogo(url));
                          }}
                          style={{ fontSize: '0.8rem', flex: 1 }}
                        />
                        {newPlayerClubLogo && <img src={newPlayerClubLogo} alt="Aperçu logo" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'contain', background: '#fff', padding: '2px' }} />}
                      </div>
                    </div>
                    <button
                      className="btn btn-neon"
                      style={{ marginTop: '1rem', justifyContent: 'center' }}
                      onClick={() => {
                        if (!newPlayerName.trim()) return alert('Veuillez entrer un nom.');
                        addPlayer(
                          newPlayerName.trim(),
                          newPlayerLevel,
                          newPlayerPhoto || undefined,
                          newPlayerClubName.trim() || undefined,
                          newPlayerClubLogo || undefined
                        );
                        setNewPlayerName('');
                        setNewPlayerPhoto(null);
                        setNewPlayerClubName('');
                        setNewPlayerClubLogo(null);
                      }}
                    >
                      Ajouter au club
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-menu 3: Configuration Club & Multi-Club */}
            {adminSubTab === 'club' && (
              <div style={{ display: 'grid', gridTemplateColumns: isNarrowScreen ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: isSmallDesktop ? '1.25rem' : '2.5rem', maxWidth: '1200px', width: '100%', margin: '0 auto', overflowY: 'auto', paddingBottom: '2rem' }}>

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
                    <b style={{ color: '#fff' }}>Utiliser dans un autre club :</b><br />
                    Ouvrez simplement l'application sur le PC de l'autre club via le navigateur web, et créez ou sélectionnez son identifiant (ex: <code>?club=bc-blois</code>). Chaque club gère ses propres tables, joueurs et tournois !
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. CLUB LEADERBOARD TAB                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'leaderboard' && (
          <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <LeaderboardView compact={false} />
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. STANDALONE LIVE MATCH STUDIO TAB ('live_studio')                       */}
        {/* ========================================================================= */}
        {activeTab === 'live_studio' && (
          <div style={{
            maxWidth: '1480px',
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            paddingBottom: '1.5rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.6rem',
              background: '#0B0F17',
              padding: '0.42rem 0.65rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.26)'
            }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setLiveStudioSubTab('cameras')}
                  style={{
                    background: liveStudioSubTab === 'cameras' ? '#1E293B' : 'transparent',
                    color: liveStudioSubTab === 'cameras' ? '#F8FAFC' : 'rgba(255,255,255,0.62)',
                    fontWeight: 700,
                    border: liveStudioSubTab === 'cameras' ? '1px solid rgba(212, 175, 55, 0.65)' : '1px solid transparent',
                    padding: '0.4rem 0.9rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <MonitorPlay size={14} color={liveStudioSubTab === 'cameras' ? '#D4AF37' : 'currentColor'} />
                  Régie Live Multi-Caméras
                </button>
                <button
                  type="button"
                  onClick={() => setLiveStudioSubTab('overlay')}
                  style={{
                    background: liveStudioSubTab === 'overlay' ? '#1E293B' : 'transparent',
                    color: liveStudioSubTab === 'overlay' ? '#F8FAFC' : 'rgba(255,255,255,0.62)',
                    fontWeight: 700,
                    border: liveStudioSubTab === 'overlay' ? '1px solid rgba(212, 175, 55, 0.65)' : '1px solid transparent',
                    padding: '0.4rem 0.9rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <Edit2 size={14} color={liveStudioSubTab === 'overlay' ? '#D4AF37' : 'currentColor'} />
                  Habillage TV (Logos, Sponsors & Textes)
                </button>
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.3px', paddingRight: '0.2rem' }}>
                STUDIO DIFFUSION LIVE
              </span>
            </div>

            {liveStudioSubTab === 'cameras' && (
              <MultiCamDirectorPanel getAppBaseUrl={getAppBaseUrl} />
            )}

            {liveStudioSubTab === 'overlay' && (
              <div style={{ maxWidth: '920px', width: '100%', margin: '0 auto' }}>
                <LiveOverlayEditorPanel
                  clubId={currentClub.id}
                  channelId="live"
                  player1Name="Joueur 1"
                  player2Name="Joueur 2"
                  score1={0}
                  score2={0}
                  overlayPos={overlayPos}
                  onChangeOverlayPos={setOverlayPos}
                />
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
        if (candidateMatch && isFinalStageActive && !isFinalStageMatch(candidateMatch)) {
          candidateMatch = null;
        }
        const match = (candidateMatch && candidateMatch.status !== 'finished') ? candidateMatch : null;

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSelectedTableForQR(null)}>
            <div
              className="glass-card"
              style={{
                padding: '1.5rem 1.8rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.1rem',
                minWidth: '320px',
                maxWidth: '660px',
                width: '95vw',
                maxHeight: '92vh',
                overflowY: 'auto',
                border: '1.5px solid rgba(0, 255, 170, 0.4)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75)',
                borderRadius: '20px'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>
                    🎱 {table.name || `Table ${table.number}`}
                  </h2>
                  {match?.stage && match.stage !== 'qualif' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(255, 215, 0, 0.18)',
                      color: '#ffd700',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      border: '1px solid rgba(255, 215, 0, 0.35)',
                      whiteSpace: 'nowrap'
                    }}>
                      {match.stage === 'final' ? '🏆 GRANDE FINALE' : match.stage === 'semi' ? '⚔️ DEMI-FINALE' : '🎯 1/4 DE FINALE'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '5px 12px', fontSize: '0.82rem', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}
                  onClick={() => setSelectedTableForQR(null)}
                >
                  ✕ Fermer
                </button>
              </div>

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
                    const scoringRules = getMatchScoringRules(match, matchTour, players);
                    const { maxSets, isWinningSets, minScore1, minScore2, formatLabel } = scoringRules;
                    const p1 = players[match.player1Id];
                    const p2 = players[match.player2Id];

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
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem', width: '100%' }}>
                        {/* Status Pills */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(0, 255, 170, 0.12)', color: 'var(--accent-primary)',
                            padding: '4px 12px', borderRadius: '16px', fontWeight: 800, fontSize: '0.78rem',
                            border: '1px solid rgba(0, 255, 170, 0.25)'
                          }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 1.5s infinite' }} />
                            MATCH EN DIRECT
                          </span>
                          <MatchTimerBadge
                            startTime={match.startTime}
                            durationMinutes={scoringRules.durationMinutes ?? resolveMatchDurationMinutes(match, matchTour)}
                            status={match.status}
                            size="sm"
                            showElapsedWhenUnlimited={true}
                          />
                          <span style={{ fontSize: '0.76rem', background: 'rgba(255,255,255,0.05)', color: 'var(--card-text-muted)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 600 }}>
                            Format : {formatLabel}
                          </span>
                          {(Boolean(match.handicapP1) || Boolean(match.handicapP2)) && (
                            <span style={{ fontSize: '0.76rem', background: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255, 215, 0, 0.3)', fontWeight: 700 }}>
                              Handicap : +{match.handicapP1 || match.handicapP2} pour {players[match.handicapP1 ? match.player1Id : match.player2Id]?.name}
                            </span>
                          )}
                        </div>

                        {/* Players & Scores with interactive adjustments */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto 1fr',
                          alignItems: 'center',
                          gap: '0.8rem',
                          width: '100%'
                        }}>
                          {/* Player 1 Card */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: `1.5px solid ${match.score1 > match.score2 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)'}`,
                            borderRadius: '16px',
                            padding: '1rem 0.6rem',
                            gap: '0.5rem',
                            boxShadow: match.score1 > match.score2 ? '0 0 20px rgba(0, 255, 170, 0.15)' : 'none',
                            transition: 'all 0.2s',
                            minWidth: 0
                          }}>
                            <img
                              src={getPlayerAvatar(p1)}
                              alt={p1?.name}
                              style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: `2px solid ${(p1?.level === 'Prestige' || p1?.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                                boxShadow: '0 0 12px rgba(0, 0, 0, 0.4)'
                              }}
                            />
                            <div style={{ textAlign: 'center', minWidth: 0, width: '100%' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p1?.name || 'Joueur 1'}
                              </div>
                              {(p1?.clubName || p1?.stats?.clubName) && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {(p1.clubLogoUrl || p1.stats?.clubLogoUrl) && (
                                    <img src={p1.clubLogoUrl || p1.stats?.clubLogoUrl} alt="" style={{ width: '12px', height: '12px', borderRadius: '2px', objectFit: 'contain', background: '#fff', padding: '1px' }} />
                                  )}
                                  <span>{p1.clubName || p1.stats?.clubName}</span>
                                </div>
                              )}
                            </div>

                            {/* Score Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                              <button
                                type="button"
                                className="btn-surface"
                                disabled={!canP1Decrement}
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: canP1Decrement ? 1 : 0.25,
                                  cursor: canP1Decrement ? 'pointer' : 'not-allowed',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  background: 'rgba(255, 255, 255, 0.05)'
                                }}
                                title={!canP1Decrement ? (minScore1 > 0 ? "Score minimum (Handicap actif)" : "Score minimum (0)") : "Retirer une manche"}
                                onClick={() => canP1Decrement && updateMatchScore(match.id, match.score1 - 1, match.score2)}
                              >
                                <Minus size={18} />
                              </button>

                              <span style={{ fontSize: '2.5rem', fontWeight: 900, minWidth: '40px', textAlign: 'center', color: 'var(--accent-primary)', textShadow: '0 0 15px rgba(0, 255, 170, 0.3)' }}>
                                {match.score1}
                              </span>

                              <button
                                type="button"
                                className="btn-surface"
                                disabled={!canP1Increment}
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: canP1Increment ? 1 : 0.25,
                                  cursor: canP1Increment ? 'pointer' : 'not-allowed',
                                  border: '1px solid rgba(0, 255, 170, 0.4)',
                                  background: canP1Increment ? 'rgba(0, 255, 170, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                                  color: canP1Increment ? 'var(--accent-primary)' : '#fff'
                                }}
                                title={!canP1Increment ? (isMatchFinished ? "Match terminé" : "Score max atteint") : "Ajouter une manche"}
                                onClick={() => canP1Increment && updateMatchScore(match.id, match.score1 + 1, match.score2)}
                              >
                                <Plus size={18} />
                              </button>
                            </div>

                            {minScore1 > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#ffd700', fontWeight: 800, background: 'rgba(255, 215, 0, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                                dont +{minScore1} handicap
                              </span>
                            )}
                          </div>

                          {/* VS Divider */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>VS</span>
                            <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />
                          </div>

                          {/* Player 2 Card */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: `1.5px solid ${match.score2 > match.score1 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)'}`,
                            borderRadius: '16px',
                            padding: '1rem 0.6rem',
                            gap: '0.5rem',
                            boxShadow: match.score2 > match.score1 ? '0 0 20px rgba(0, 255, 170, 0.15)' : 'none',
                            transition: 'all 0.2s',
                            minWidth: 0
                          }}>
                            <img
                              src={getPlayerAvatar(p2)}
                              alt={p2?.name}
                              style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: `2px solid ${(p2?.level === 'Prestige' || p2?.level === 'Confirmé') ? '#ffd700' : 'var(--accent-primary)'}`,
                                boxShadow: '0 0 12px rgba(0, 0, 0, 0.4)'
                              }}
                            />
                            <div style={{ textAlign: 'center', minWidth: 0, width: '100%' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p2?.name || 'Joueur 2'}
                              </div>
                              {(p2?.clubName || p2?.stats?.clubName) && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {(p2.clubLogoUrl || p2.stats?.clubLogoUrl) && (
                                    <img src={p2.clubLogoUrl || p2.stats?.clubLogoUrl} alt="" style={{ width: '12px', height: '12px', borderRadius: '2px', objectFit: 'contain', background: '#fff', padding: '1px' }} />
                                  )}
                                  <span>{p2.clubName || p2.stats?.clubName}</span>
                                </div>
                              )}
                            </div>

                            {/* Score Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                              <button
                                type="button"
                                className="btn-surface"
                                disabled={!canP2Decrement}
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: canP2Decrement ? 1 : 0.25,
                                  cursor: canP2Decrement ? 'pointer' : 'not-allowed',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  background: 'rgba(255, 255, 255, 0.05)'
                                }}
                                title={!canP2Decrement ? (minScore2 > 0 ? "Score minimum (Handicap actif)" : "Score minimum (0)") : "Retirer une manche"}
                                onClick={() => canP2Decrement && updateMatchScore(match.id, match.score1, match.score2 - 1)}
                              >
                                <Minus size={18} />
                              </button>

                              <span style={{ fontSize: '2.5rem', fontWeight: 900, minWidth: '40px', textAlign: 'center', color: '#fff', textShadow: '0 0 15px rgba(255, 255, 255, 0.2)' }}>
                                {match.score2}
                              </span>

                              <button
                                type="button"
                                className="btn-surface"
                                disabled={!canP2Increment}
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: canP2Increment ? 1 : 0.25,
                                  cursor: canP2Increment ? 'pointer' : 'not-allowed',
                                  border: '1px solid rgba(0, 255, 170, 0.4)',
                                  background: canP2Increment ? 'rgba(0, 255, 170, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                                  color: canP2Increment ? 'var(--accent-primary)' : '#fff'
                                }}
                                title={!canP2Increment ? (isMatchFinished ? "Match terminé" : "Score max atteint") : "Ajouter une manche"}
                                onClick={() => canP2Increment && updateMatchScore(match.id, match.score1, match.score2 + 1)}
                              >
                                <Plus size={18} />
                              </button>
                            </div>

                            {minScore2 > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#ffd700', fontWeight: 800, background: 'rgba(255, 215, 0, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                                dont +{minScore2} handicap
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
                      <QRCode value={getMatchShareUrl(match.id, table.id || match.tableId, match.tournamentId || activeTournament?.id)} size={200} />
                      <div style={{ marginTop: '0.8rem', fontSize: '0.72rem', color: '#666', wordBreak: 'break-all', textAlign: 'center', userSelect: 'all', cursor: 'copy' }} title="Lien direct vers le match">
                        {getMatchShareUrl(match.id, table.id || match.tableId, match.tournamentId || activeTournament?.id)}
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
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          color: 'var(--accent-primary)',
                          borderColor: 'rgba(0, 255, 170, 0.4)',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          padding: '0.65rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        onClick={() => openDirectScoreModal(match)}
                      >
                        <Edit2 size={16} /> 📝 Saisir le score (match déjà joué sans QR code)
                      </button>

                      {matchesWaiting.length > 0 && (
                        <button
                          className="btn btn-outline"
                          style={{ width: '100%', justifyContent: 'center', color: '#fff', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => setPostponingMatchModal({ matchId: match.id, tableId: table.id })}
                        >
                          <ArrowUpDown size={15} /> Remplacer par un match de la file d'attente
                        </button>
                      )}

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
                  <div style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 800 }}>Aucun match assigné</div>
                  <p style={{ margin: 0, textAlign: 'center', fontSize: '0.9rem' }}>
                    {activeTournament?.settings?.tableIds.includes(table.id)
                      ? 'Ce billard est disponible pour accueillir un match du tournoi.'
                      : "Ce billard n'est pas utilisé par le tournoi en cours."}
                  </p>

                  {/* Liste des matchs en attente pouvant être lancés sur ce billard */}
                  {activeTournament?.settings?.tableIds.includes(table.id) && matchesWaiting.length > 0 && (
                    <div style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(0, 255, 170, 0.25)',
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.7rem',
                      boxSizing: 'border-box'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Users size={16} style={{ color: 'var(--accent-secondary)' }} />
                          Lancer un match de la file sur ce billard :
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', background: 'rgba(0, 229, 255, 0.12)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                          {matchesWaiting.length} en attente
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                        {matchesWaiting.map((wm: any, idx: number) => {
                          const busy = getBusyPlayerInfo(wm);
                          const p1 = players[wm.player1Id];
                          const p2 = players[wm.player2Id];

                          return (
                            <div
                              key={wm.id}
                              style={{
                                background: 'rgba(0, 0, 0, 0.35)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '8px',
                                padding: '0.6rem 0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.6rem'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>#{idx + 1}</span>
                                  {wm.poolName && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', fontWeight: 700, background: 'rgba(0, 255, 204, 0.1)', padding: '1px 5px', borderRadius: '4px' }}>
                                      {wm.poolName}
                                    </span>
                                  )}
                                  {wm.stage && (
                                    <span style={{ fontSize: '0.65rem', color: '#ffd700', fontWeight: 700 }}>
                                      {wm.stage}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {p1?.name || 'Joueur 1'} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>VS</span> {p2?.name || 'Joueur 2'}
                                </div>
                                {busy.busy && (
                                  <div style={{ fontSize: '0.65rem', color: '#ffb703' }}>
                                    ⚠️ {busy.playerName} déjà sur {busy.tableName}
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.6rem', color: 'var(--accent-primary)', borderColor: 'rgba(0, 255, 170, 0.3)' }}
                                  onClick={() => openDirectScoreModal(wm)}
                                  title="Marquer le score si ce match a déjà été joué sans l'application"
                                >
                                  <Edit2 size={12} /> Score
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-neon"
                                  disabled={Boolean(busy.busy)}
                                  style={{
                                    fontSize: '0.75rem',
                                    padding: '0.35rem 0.8rem',
                                    fontWeight: 800,
                                    color: '#000',
                                    opacity: busy.busy ? 0.35 : 1,
                                    cursor: busy.busy ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  onClick={() => {
                                    if (busy.busy) return alert(`Impossible : ${busy.playerName} est déjà sur ${busy.tableName}`);
                                    const res = launchMatchOnTable(wm.id, table.id);
                                    if (!res.success && res.reason) {
                                      alert(res.reason);
                                    }
                                  }}
                                >
                                  <Play size={12} /> Lancer
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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

              {/* Raccourci discret vers la Régie Live unifiée */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                width: '100%',
                paddingTop: '0.5rem',
                borderTop: '1px solid rgba(255,255,255,0.08)'
              }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1, fontSize: '0.8rem', padding: '0.55rem 0.85rem', borderColor: 'rgba(255, 59, 92, 0.45)', color: '#ff9aa4', fontWeight: 800, justifyContent: 'center' }}
                  onClick={() => {
                    setSelectedTableForQR(null);
                    setActiveTab('live_studio');
                  }}
                >
                  <Radio size={15} /> Ouvrir la Régie Live (YouTube / Facebook)
                </button>
                {Boolean(table.liveStreamUrl || match?.liveStreamUrl) && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: 'auto', fontSize: '0.74rem', padding: '0.55rem 0.8rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }}
                    onClick={() => {
                      setTableLiveStream(table.id, undefined);
                      if (match) setMatchLiveStream(match.id, undefined);
                    }}
                    title="Retirer l'ancien lien vidéo attaché à cette table"
                  >
                    ⏹ Couper ancien lien
                  </button>
                )}
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

      {/* ========================================================================= */}
      {/* MODAL : MODIFIER LES RÈGLES / DISTANCES DU TOURNOI EN COURS                */}
      {/* ========================================================================= */}
      {showEditRulesModal && activeTournament && editTourSettings && (() => {
        const modalMaxFinalH = getMaxAllowedFinalHandicap(
          editTourSettings.finalNbSetsMixed ?? 3,
          editTourSettings.finalIsWinningSets ?? true
        );
        const modalMaxGrandFinalH = getMaxAllowedFinalHandicap(
          editTourSettings.grandFinalNbSetsMixed ?? editTourSettings.finalNbSetsMixed ?? 3,
          editTourSettings.grandFinalIsWinningSets ?? editTourSettings.finalIsWinningSets ?? true
        );
        const modalMaxThirdPlaceH = getMaxAllowedFinalHandicap(
          editTourSettings.thirdPlaceNbSetsMixed ?? editTourSettings.finalNbSetsMixed ?? 3,
          editTourSettings.thirdPlaceIsWinningSets ?? editTourSettings.finalIsWinningSets ?? true
        );

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setShowEditRulesModal(false)}
          >
            <div
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '650px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '2rem',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                background: '#070b1e',
                boxShadow: '0 0 40px rgba(255, 215, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.2rem'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 800, color: '#ffd700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚙️ Règles du Tournoi
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {activeTournament.name}
                  </div>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => setShowEditRulesModal(false)}
                >
                  ✕
                </button>
              </div>

              {/* SECTION 0: QUALIFICATIONS (si format poules/cartésien) */}
              {activeTournament.format !== 'direct_ko' && activeTournament.format !== 'double_ko_bracket' && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <QualifiersCountSelector
                    value={editTourSettings.qualifNbQualifiers ?? qualifStatus.numQualifiers ?? 4}
                    onChange={(nextVal) => setEditTourSettings({ ...editTourSettings, qualifNbQualifiers: nextVal })}
                    participantsCount={activeTournament.participants.length}
                    nbPoules={editTourSettings.qualifNbPoules || 1}
                    disabled={qualifStatus.isFinalLaunched}
                    disabledNote="La phase finale a déjà démarré : ce nombre ne peut plus être modifié."
                  />

                  <div style={{ paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-primary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={16} /> Temps imparti par match (Qualifications)
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[0, 15, 20, 30, 45, 60].map(mins => {
                        const curMins = editTourSettings.qualifMatchDurationMinutes ?? 0;
                        const isSel = curMins === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setEditTourSettings({ ...editTourSettings, qualifMatchDurationMinutes: mins })}
                            className="btn"
                            style={{
                              padding: '0.4rem 0.8rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              borderRadius: '8px',
                              border: isSel ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.15)',
                              background: isSel ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.02)',
                              color: isSel ? 'var(--accent-primary)' : '#fff'
                            }}
                          >
                            {mins === 0 ? 'Illimité (0)' : `${mins} min`}
                          </button>
                        );
                      })}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Personnalisé :</span>
                        <input
                          type="number"
                          className="input-field"
                          min={0}
                          max={240}
                          value={editTourSettings.qualifMatchDurationMinutes ?? 0}
                          onChange={e => setEditTourSettings({ ...editTourSettings, qualifMatchDurationMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          style={{ width: '65px', padding: '0.3rem 0.4rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>min</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 1: TABLEAU FINAL (GÉNÉRAL / 1/4 & 1/2) */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-secondary)', marginBottom: '0.6rem' }}>
                  Tableau Final (Quarts, Demis...)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Type de match</label>
                    <select
                      className="input-field"
                      value={editTourSettings.finalIsWinningSets ? 'winning' : 'fixed'}
                      onChange={e => setEditTourSettings({ ...editTourSettings, finalIsWinningSets: e.target.value === 'winning' })}
                      style={{ appearance: 'none', background: '#050816', color: '#fff' }}
                    >
                      <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                      <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 700, display: 'block' }}>Am vs Am</label>
                      <input
                        type="number"
                        className="input-field"
                        value={editTourSettings.finalNbSetsAmateur ?? 3}
                        onChange={e => setEditTourSettings({ ...editTourSettings, finalNbSetsAmateur: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        min={1}
                        max={25}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', fontWeight: 700, display: 'block' }}>Pre vs Pre</label>
                      <input
                        type="number"
                        className="input-field"
                        value={editTourSettings.finalNbSetsPrestige ?? 3}
                        onChange={e => setEditTourSettings({ ...editTourSettings, finalNbSetsPrestige: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        min={1}
                        max={25}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 700, display: 'block' }}>Am vs Pre</label>
                      <input
                        type="number"
                        className="input-field"
                        value={editTourSettings.finalNbSetsMixed ?? 3}
                        onChange={e => setEditTourSettings({ ...editTourSettings, finalNbSetsMixed: Math.max(1, parseInt(e.target.value, 10) || 1), finalNbSets: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        min={1}
                        max={25}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', color: '#ffd700', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                      Handicap Amateur vs Prestige : +{editTourSettings.finalHandicapAmateurSets ?? 0}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                      {[0, 1, 2, 3].map(v => (
                        <button
                          key={v}
                          type="button"
                          disabled={v > modalMaxFinalH}
                          onClick={() => setEditTourSettings({ ...editTourSettings, finalHandicapAmateurSets: v, handicapAmateurSets: v })}
                          className="btn"
                          style={{
                            padding: '0.4rem', fontSize: '0.78rem', fontWeight: 700,
                            border: (editTourSettings.finalHandicapAmateurSets ?? 0) === v ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                            background: (editTourSettings.finalHandicapAmateurSets ?? 0) === v ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.02)',
                            color: (editTourSettings.finalHandicapAmateurSets ?? 0) === v ? '#ffd700' : (v > modalMaxFinalH ? 'rgba(255,255,255,0.25)' : '#fff')
                          }}
                        >
                          {v === 0 ? '0 (Aucun)' : `+${v}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Temps imparti par match en Phase Finale */}
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.3rem' }}>
                      <Clock size={15} /> Temps imparti par match (Phase Finale) : {editTourSettings.finalMatchDurationMinutes ? `${editTourSettings.finalMatchDurationMinutes} min` : 'Illimité'}
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {[0, 15, 20, 30, 45, 60].map(mins => {
                        const curMins = editTourSettings.finalMatchDurationMinutes ?? 0;
                        const isSel = curMins === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setEditTourSettings({ ...editTourSettings, finalMatchDurationMinutes: mins, matchDurationMinutes: mins || editTourSettings.qualifMatchDurationMinutes || 0 })}
                            className="btn"
                            style={{
                              padding: '0.4rem 0.8rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              borderRadius: '8px',
                              border: isSel ? '2px solid var(--accent-secondary)' : '1px solid rgba(255,255,255,0.15)',
                              background: isSel ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255,255,255,0.02)',
                              color: isSel ? 'var(--accent-secondary)' : '#fff'
                            }}
                          >
                            {mins === 0 ? 'Illimité (0)' : `${mins} min`}
                          </button>
                        );
                      })}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Perso :</span>
                        <input
                          type="number"
                          className="input-field"
                          min={0}
                          max={240}
                          value={editTourSettings.finalMatchDurationMinutes ?? 0}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setEditTourSettings({ ...editTourSettings, finalMatchDurationMinutes: val, matchDurationMinutes: val || editTourSettings.qualifMatchDurationMinutes || 0 });
                          }}
                          style={{ width: '65px', padding: '0.3rem 0.4rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: 🏆 GRANDE FINALE */}
              <div style={{
                background: editTourSettings.grandFinalCustom ? 'rgba(255, 215, 0, 0.06)' : 'rgba(255,255,255,0.03)',
                padding: '1rem',
                borderRadius: '10px',
                border: editTourSettings.grandFinalCustom ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid var(--border-color)'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', marginBottom: editTourSettings.grandFinalCustom ? '0.8rem' : 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editTourSettings.grandFinalCustom)}
                    onChange={e => setEditTourSettings({
                      ...editTourSettings,
                      grandFinalCustom: e.target.checked,
                      grandFinalNbSetsAmateur: editTourSettings.grandFinalNbSetsAmateur ?? editTourSettings.finalNbSetsAmateur ?? 4,
                      grandFinalNbSetsPrestige: editTourSettings.grandFinalNbSetsPrestige ?? editTourSettings.finalNbSetsPrestige ?? 5,
                      grandFinalNbSetsMixed: editTourSettings.grandFinalNbSetsMixed ?? editTourSettings.finalNbSetsMixed ?? 5,
                      grandFinalIsWinningSets: editTourSettings.grandFinalIsWinningSets ?? editTourSettings.finalIsWinningSets ?? true
                    })}
                    style={{ width: '18px', height: '18px', accentColor: '#ffd700', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 800, color: '#ffd700', fontSize: '0.95rem' }}>🏆 Grande Finale (Match pour le titre)</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {editTourSettings.grandFinalCustom ? 'Règles spécifiques activées pour la finale' : 'Hérite des règles générales ci-dessus'}
                    </div>
                  </div>
                </label>

                {editTourSettings.grandFinalCustom && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,215,0,0.15)' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Type de match</label>
                      <select
                        className="input-field"
                        value={editTourSettings.grandFinalIsWinningSets ? 'winning' : 'fixed'}
                        onChange={e => setEditTourSettings({ ...editTourSettings, grandFinalIsWinningSets: e.target.value === 'winning' })}
                        style={{ appearance: 'none', background: '#050816', color: '#fff' }}
                      >
                        <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                        <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 700, display: 'block' }}>Finale Am vs Am</label>
                        <input
                          type="number"
                          className="input-field"
                          value={editTourSettings.grandFinalNbSetsAmateur ?? 4}
                          onChange={e => setEditTourSettings({ ...editTourSettings, grandFinalNbSetsAmateur: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          min={1}
                          max={25}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', fontWeight: 700, display: 'block' }}>Finale Pre vs Pre</label>
                        <input
                          type="number"
                          className="input-field"
                          value={editTourSettings.grandFinalNbSetsPrestige ?? 5}
                          onChange={e => setEditTourSettings({ ...editTourSettings, grandFinalNbSetsPrestige: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          min={1}
                          max={25}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 700, display: 'block' }}>Finale Am vs Pre</label>
                        <input
                          type="number"
                          className="input-field"
                          value={editTourSettings.grandFinalNbSetsMixed ?? 5}
                          onChange={e => setEditTourSettings({ ...editTourSettings, grandFinalNbSetsMixed: Math.max(1, parseInt(e.target.value, 10) || 1), grandFinalNbSets: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          min={1}
                          max={25}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#ffd700', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                        Handicap Finale (Am vs Pre) : +{editTourSettings.grandFinalHandicapAmateurSets ?? 0}
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                        {[0, 1, 2, 3].map(v => (
                          <button
                            key={v}
                            type="button"
                            disabled={v > modalMaxGrandFinalH}
                            onClick={() => setEditTourSettings({ ...editTourSettings, grandFinalHandicapAmateurSets: v })}
                            className="btn"
                            style={{
                              padding: '0.4rem', fontSize: '0.78rem', fontWeight: 700,
                              border: (editTourSettings.grandFinalHandicapAmateurSets ?? 0) === v ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                              background: (editTourSettings.grandFinalHandicapAmateurSets ?? 0) === v ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.02)',
                              color: (editTourSettings.grandFinalHandicapAmateurSets ?? 0) === v ? '#ffd700' : (v > modalMaxGrandFinalH ? 'rgba(255,255,255,0.25)' : '#fff')
                            }}
                          >
                            {v === 0 ? '0 (Aucun)' : `+${v}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: 🥉 PETITE FINALE */}
              <div style={{
                background: editTourSettings.thirdPlaceCustom ? 'rgba(245, 158, 11, 0.06)' : 'rgba(255,255,255,0.03)',
                padding: '1rem',
                borderRadius: '10px',
                border: editTourSettings.thirdPlaceCustom ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: editTourSettings.hasThirdPlaceMatch ? '0.6rem' : 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editTourSettings.hasThirdPlaceMatch ?? true)}
                      onChange={e => setEditTourSettings({ ...editTourSettings, hasThirdPlaceMatch: e.target.checked })}
                      style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>🥉 Petite Finale (3ème place)</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {editTourSettings.hasThirdPlaceMatch ? 'Match pour la 3ème place activé' : 'Match désactivé'}
                      </div>
                    </div>
                  </label>
                </div>

                {editTourSettings.hasThirdPlaceMatch && (
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(245, 158, 11, 0.15)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', marginBottom: editTourSettings.thirdPlaceCustom ? '0.8rem' : 0 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editTourSettings.thirdPlaceCustom)}
                        onChange={e => setEditTourSettings({
                          ...editTourSettings,
                          thirdPlaceCustom: e.target.checked,
                          thirdPlaceNbSetsAmateur: editTourSettings.thirdPlaceNbSetsAmateur ?? editTourSettings.finalNbSetsAmateur ?? 3,
                          thirdPlaceNbSetsPrestige: editTourSettings.thirdPlaceNbSetsPrestige ?? editTourSettings.finalNbSetsPrestige ?? 3,
                          thirdPlaceNbSetsMixed: editTourSettings.thirdPlaceNbSetsMixed ?? editTourSettings.finalNbSetsMixed ?? 3,
                          thirdPlaceIsWinningSets: editTourSettings.thirdPlaceIsWinningSets ?? editTourSettings.finalIsWinningSets ?? true
                        })}
                        style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                        Personnaliser spécifiquement les distances de la Petite Finale
                      </span>
                    </label>

                    {editTourSettings.thirdPlaceCustom && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.6rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Type de match</label>
                          <select
                            className="input-field"
                            value={editTourSettings.thirdPlaceIsWinningSets ? 'winning' : 'fixed'}
                            onChange={e => setEditTourSettings({ ...editTourSettings, thirdPlaceIsWinningSets: e.target.value === 'winning' })}
                            style={{ appearance: 'none', background: '#050816', color: '#fff' }}
                          >
                            <option value="winning" style={{ color: '#000' }}>Nb de Manches gagnantes</option>
                            <option value="fixed" style={{ color: '#000' }}>Nb de Manches fixes</option>
                          </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 700, display: 'block' }}>Petite Finale Am vs Am</label>
                            <input
                              type="number"
                              className="input-field"
                              value={editTourSettings.thirdPlaceNbSetsAmateur ?? 3}
                              onChange={e => setEditTourSettings({ ...editTourSettings, thirdPlaceNbSetsAmateur: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              min={1}
                              max={25}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', fontWeight: 700, display: 'block' }}>Petite Finale Pre vs Pre</label>
                            <input
                              type="number"
                              className="input-field"
                              value={editTourSettings.thirdPlaceNbSetsPrestige ?? 3}
                              onChange={e => setEditTourSettings({ ...editTourSettings, thirdPlaceNbSetsPrestige: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              min={1}
                              max={25}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 700, display: 'block' }}>Petite Finale Am vs Pre</label>
                            <input
                              type="number"
                              className="input-field"
                              value={editTourSettings.thirdPlaceNbSetsMixed ?? 3}
                              onChange={e => setEditTourSettings({ ...editTourSettings, thirdPlaceNbSetsMixed: Math.max(1, parseInt(e.target.value, 10) || 1), thirdPlaceNbSets: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              min={1}
                              max={25}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                            Handicap Petite Finale (Am vs Pre) : +{editTourSettings.thirdPlaceHandicapAmateurSets ?? 0}
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                            {[0, 1, 2, 3].map(v => (
                              <button
                                key={v}
                                type="button"
                                disabled={v > modalMaxThirdPlaceH}
                                onClick={() => setEditTourSettings({ ...editTourSettings, thirdPlaceHandicapAmateurSets: v })}
                                className="btn"
                                style={{
                                  padding: '0.4rem', fontSize: '0.78rem', fontWeight: 700,
                                  border: (editTourSettings.thirdPlaceHandicapAmateurSets ?? 0) === v ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                                  background: (editTourSettings.thirdPlaceHandicapAmateurSets ?? 0) === v ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.02)',
                                  color: (editTourSettings.thirdPlaceHandicapAmateurSets ?? 0) === v ? '#f59e0b' : (v > modalMaxThirdPlaceH ? 'rgba(255,255,255,0.25)' : '#fff')
                                }}
                              >
                                {v === 0 ? '0 (Aucun)' : `+${v}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowEditRulesModal(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-neon"
                  style={{ color: '#000', fontWeight: 800 }}
                  onClick={() => {
                    const isPool = activeTournament.format !== 'direct_ko' && activeTournament.format !== 'double_ko_bracket';
                    const maxQ = activeTournament.participants.length >= 3
                      ? activeTournament.participants.length - 1
                      : (activeTournament.participants.length === 2 ? 2 : 128);
                    const nextSettings = isPool && !qualifStatus.isFinalLaunched
                      ? {
                          ...editTourSettings,
                          qualifNbQualifiers: Math.min(maxQ, Math.max(2, Number(editTourSettings.qualifNbQualifiers) || 2))
                        }
                      : editTourSettings;
                    updateTournamentSettings(activeTournament.id, nextSettings);
                    setShowEditRulesModal(false);
                  }}
                >
                  ✓ Appliquer les règles
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL : SAISIE DIRECTE DU SCORE (MATCH NON LANCÉ SUR UN BILLARD)          */}
      {/* ========================================================================= */}
      {directScoreModalMatch && (() => {
        const m = directScoreModalMatch;
        const tour = m.tournamentId ? tournaments[m.tournamentId] : activeTournament;
        const rules = getMatchScoringRules(m, tour, players);
        const p1 = players[m.player1Id];
        const p2 = players[m.player2Id];
        const p1Name = p1?.name || 'Joueur 1';
        const p2Name = p2?.name || 'Joueur 2';
        const isP1Prestige = p1?.level === 'Prestige' || p1?.level === 'Confirmé';
        const isP2Prestige = p2?.level === 'Prestige' || p2?.level === 'Confirmé';

        const isTieForbidden = Boolean(m.stage && m.stage !== 'qualif');
        const minS1 = rules.minScore1 || 0;
        const minS2 = rules.minScore2 || 0;

        const canInc1 = rules.isWinningSets
          ? (directScore1 < rules.maxSets && directScore2 < rules.maxSets)
          : ((directScore1 + directScore2) < rules.maxSets);
        const canDec1 = directScore1 > minS1;

        const canInc2 = rules.isWinningSets
          ? (directScore1 < rules.maxSets && directScore2 < rules.maxSets)
          : ((directScore1 + directScore2) < rules.maxSets);
        const canDec2 = directScore2 > minS2;

        const winnerName = directScore1 > directScore2 ? p1Name : (directScore2 > directScore1 ? p2Name : null);

        // Generate quick presets
        const presets: [number, number][] = [];
        if (rules.isWinningSets) {
          const max = rules.maxSets;
          for (let s = minS2; s < max; s++) {
            presets.push([max, s]);
          }
          for (let s = minS1; s < max; s++) {
            presets.push([s, max]);
          }
        } else {
          const max = rules.maxSets;
          for (let s1 = max; s1 >= 0; s1--) {
            const s2 = max - s1;
            if (s1 >= minS1 && s2 >= minS2) {
              presets.push([s1, s2]);
            }
          }
        }

        return (
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 10600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setDirectScoreModalMatch(null)}
          >
            <div
              className="glass-card"
              style={{
                maxWidth: '560px',
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                padding: '1.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.2rem',
                border: '1px solid var(--accent-primary)',
                boxShadow: '0 0 35px rgba(0, 255, 170, 0.25)',
                background: '#070b1e',
                animation: 'fadeIn 0.2s ease'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%',
                    background: 'rgba(0, 255, 170, 0.15)', border: '1px solid var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)'
                  }}>
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 900, color: '#fff' }}>
                      Saisie directe du score
                    </h3>
                    <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Match joué en autonomie (non lancé officiellement sur un billard)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '4px 8px', borderColor: 'transparent', color: 'var(--text-muted)' }}
                  onClick={() => setDirectScoreModalMatch(null)}
                >
                  ✕
                </button>
              </div>

              {/* Match info banner */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.6rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {m.poolName && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 800, background: 'rgba(0, 255, 204, 0.15)', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(0, 255, 204, 0.3)' }}>
                      {m.poolName}
                    </span>
                  )}
                  {m.stage && (
                    <span style={{ fontSize: '0.72rem', color: '#ffd700', fontWeight: 800, background: 'rgba(255, 215, 0, 0.15)', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(255, 215, 0, 0.3)' }}>
                      {m.stage === 'final' ? '🏆 Finale' : m.stage === 'semi' ? '⚔️ 1/2 Finale' : m.stage === 'third_place' ? '🥉 Petite Finale' : m.stage}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                  Format : {rules.formatLabel}
                </span>
              </div>

              {/* Handicap notice if any */}
              {(minS1 > 0 || minS2 > 0) && (
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 8px', borderRadius: '6px' }}>
                  ⚡ Handicap appliqué : +{minS1 > 0 ? `${minS1} manche(s) pour ${p1Name}` : `${minS2} manche(s) pour ${p2Name}`}
                </div>
              )}

              {/* Player 1 vs Player 2 Duel Scoring Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '0.8rem',
                alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '1.2rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                {/* Player 1 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  {p1 && (
                    <img
                      src={getPlayerAvatar(p1)}
                      alt={p1Name}
                      style={{
                        width: '56px', height: '56px', borderRadius: '50%',
                        objectFit: 'cover', border: `3px solid ${isP1Prestige ? '#ffd700' : 'var(--accent-primary)'}`
                      }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', wordBreak: 'break-word' }}>{p1Name}</div>
                    <span style={{ fontSize: '0.65rem', color: isP1Prestige ? '#ffd700' : 'var(--accent-secondary)', fontWeight: 700 }}>
                      {isP1Prestige ? '👑 Prestige' : 'Amateur'}
                    </span>
                  </div>

                  {/* Stepper Player 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!canDec1}
                      style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: canDec1 ? 1 : 0.3 }}
                      onClick={() => canDec1 && setDirectScore1(directScore1 - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <span style={{ fontSize: '2.4rem', fontWeight: 900, minWidth: '45px', textAlign: 'center', color: directScore1 > directScore2 ? 'var(--accent-primary)' : '#fff' }}>
                      {directScore1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!canInc1}
                      style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: canInc1 ? 1 : 0.3 }}
                      onClick={() => canInc1 && setDirectScore1(directScore1 + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* VS Center */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)'
                  }}>
                    VS
                  </div>
                </div>

                {/* Player 2 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  {p2 && (
                    <img
                      src={getPlayerAvatar(p2)}
                      alt={p2Name}
                      style={{
                        width: '56px', height: '56px', borderRadius: '50%',
                        objectFit: 'cover', border: `3px solid ${isP2Prestige ? '#ffd700' : 'var(--accent-primary)'}`
                      }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', wordBreak: 'break-word' }}>{p2Name}</div>
                    <span style={{ fontSize: '0.65rem', color: isP2Prestige ? '#ffd700' : 'var(--accent-secondary)', fontWeight: 700 }}>
                      {isP2Prestige ? '👑 Prestige' : 'Amateur'}
                    </span>
                  </div>

                  {/* Stepper Player 2 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!canDec2}
                      style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: canDec2 ? 1 : 0.3 }}
                      onClick={() => canDec2 && setDirectScore2(directScore2 - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <span style={{ fontSize: '2.4rem', fontWeight: 900, minWidth: '45px', textAlign: 'center', color: directScore2 > directScore1 ? 'var(--accent-primary)' : '#fff' }}>
                      {directScore2}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!canInc2}
                      style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: canInc2 ? 1 : 0.3 }}
                      onClick={() => canInc2 && setDirectScore2(directScore2 + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              {presets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Scores rapides :</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {presets.map(([s1, s2], idx) => {
                      const isSelected = directScore1 === s1 && directScore2 === s2;
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="btn"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            border: isSelected ? '2px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.15)',
                            background: isSelected ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                            color: isSelected ? 'var(--accent-primary)' : '#fff'
                          }}
                          onClick={() => {
                            setDirectScore1(s1);
                            setDirectScore2(s2);
                          }}
                        >
                          {s1} - {s2}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Winner Status Banner */}
              <div style={{
                background: winnerName ? 'rgba(0, 255, 170, 0.08)' : (isTieForbidden ? 'rgba(255, 68, 102, 0.12)' : 'rgba(255, 255, 255, 0.04)'),
                border: `1px solid ${winnerName ? 'rgba(0, 255, 170, 0.3)' : (isTieForbidden ? 'rgba(255, 68, 102, 0.35)' : 'rgba(255, 255, 255, 0.1)')}`,
                borderRadius: '8px',
                padding: '0.7rem 1rem',
                textAlign: 'center',
                fontWeight: 800,
                fontSize: '0.9rem',
                color: winnerName ? 'var(--accent-primary)' : (isTieForbidden ? '#ff4466' : 'var(--text-muted)')
              }}>
                {winnerName ? (
                  <span>🏆 Victoire de <strong>{winnerName}</strong> ({directScore1} - {directScore2})</span>
                ) : isTieForbidden ? (
                  <span>⚠️ Égalité interdite en phase finale ! Un joueur doit remporter le match.</span>
                ) : (
                  <span>Égalité ({directScore1} - {directScore2})</span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '0.75rem', justifyContent: 'center' }}
                  onClick={() => setDirectScoreModalMatch(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-neon"
                  disabled={isTieForbidden && directScore1 === directScore2}
                  style={{
                    flex: 2,
                    padding: '0.75rem',
                    justifyContent: 'center',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    opacity: (isTieForbidden && directScore1 === directScore2) ? 0.35 : 1,
                    cursor: (isTieForbidden && directScore1 === directScore2) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => {
                    if (isTieForbidden && directScore1 === directScore2) {
                      return alert("Impossible d'enregistrer un match de phase finale sur une égalité !");
                    }
                    if (directScore1 === 0 && directScore2 === 0) {
                      const confirmZero = window.confirm("Le score saisi est de 0 - 0. Voulez-vous vraiment enregistrer ce score ?");
                      if (!confirmZero) return;
                    }
                    updateFinishedMatchScore(m.id, directScore1, directScore2);
                    if (selectedTableForQR && tables[selectedTableForQR]?.currentMatchId === m.id) {
                      setSelectedTableForQR(null);
                    }
                    setDirectScoreModalMatch(null);
                  }}
                >
                  <CheckCircle2 size={18} /> ✓ Valider et enregistrer le match
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default AdminView;
