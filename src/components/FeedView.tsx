import React, { useState } from 'react';
import { useStore } from '../store';
import { Activity, Clock, Trophy, Lock, Award, Radio, ExternalLink, Play, Edit3, Users, ChevronDown, ChevronUp, Loader2, Smartphone } from 'lucide-react';
import TournamentBracketView from './TournamentBracketView';
import LeaderboardView from './LeaderboardView';
import MatchTimerBadge from './MatchTimerBadge';
import PrismMobileControlView from './PrismMobileControlView';
import { getTournamentQualificationStatus } from '../utils/qualifiers';
import { isByeMatch, isFinalStageMatch, isRealFinishedMatch } from '../utils/bracket';
import { computeTournamentScheduleContext, getMatchStakeInfo, sortTournamentMatchesForScheduling } from '../utils/matchScheduler';
import { fetchFreshMatchForLaunch } from '../sync';
import { Match, Table } from '../types';
import { formatShortDateTime, formatRelativeTime } from '../utils/timeFormat';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMatchScoringRules, resolveMatchDurationMinutes } from '../utils/rules';
import { extractExternalVideoFromStreamUrl, extractVdoRoomFromStreamUrl, extractWebRtcCamFromStreamUrl, formatEmbedVideoUrl } from '../utils/video';
import WebRtcCameraPlayer from './WebRtcCameraPlayer';

const resolveOverlayHref = (rawStreamUrl?: string): string | undefined => {
  if (!rawStreamUrl) return undefined;
  const idx = rawStreamUrl.indexOf('?overlay=');
  if (idx !== -1 && typeof window !== 'undefined') {
    const cleanPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    const base = window.location.hostname === 'localhost' ? __LAN_URL__.replace(/\/+$/, '') : `${window.location.origin}${cleanPath}`;
    return `${base}/${rawStreamUrl.slice(idx)}`;
  }
  return rawStreamUrl;
};

const FeedView: React.FC = () => {
  const { matches, players, tables, tournaments, currentClub, startTournamentMatch } = useStore();
  const [subTab, setSubTab] = useState<'live' | 'bracket' | 'leaderboard'>('live');
  const [launchingMatchId, setLaunchingMatchId] = useState<string | null>(null);
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [showPrismModal, setShowPrismModal] = useState(false);

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;
  const isFinalStageActive = Boolean(activeTournament?.finalStageLaunched || activeTournament?.settings?.finalStageLaunched);

  const qualifStatus = getTournamentQualificationStatus(activeTournament, matches, players);
  const { hasSureQualifiers } = qualifStatus;

  const allMatches = Object.values(matches).sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0));
  const liveMatches = allMatches.filter(
    m =>
      m.status === 'playing' &&
      (!m.tournamentId || tournaments[m.tournamentId]?.status === 'ongoing') &&
      Boolean(m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
  );
  const finishedMatches = allMatches.filter(m => isRealFinishedMatch(m, players)).slice(0, 8);

  const activeTourMatches = activeTournament
    ? activeTournament.matches
        .map(id => matches[id])
        .filter((m): m is Match => Boolean(m) && !isByeMatch(m))
        .filter(m => !(m.status === 'finished' && !isRealFinishedMatch(m, players)))
    : [];
  const finishedTourMatches = activeTourMatches.filter(m => isRealFinishedMatch(m, players));
  const latestActivityTs = finishedTourMatches.reduce((maxTs, m) => Math.max(maxTs, m.endTime || m.startTime || 0), 0)
    || liveMatches.reduce((maxTs, m) => Math.max(maxTs, m.startTime || 0), 0);

  const scheduleContext = activeTournament
    ? computeTournamentScheduleContext(activeTournament, matches, players, tables)
    : null;

  // Assigned table matches waiting to start ('pending' on a billard) so players can start/score without Admin PC
  const readyTableMatches: Array<{ table: Table; match: Match }> = [];
  const assignedPendingIds = new Set<string>();
  const busyLivePlayerIds = new Set<string>();
  liveMatches.forEach(m => {
    if (m.player1Id) busyLivePlayerIds.add(m.player1Id);
    if (m.player2Id) busyLivePlayerIds.add(m.player2Id);
  });

  Object.values(tables)
    .sort((a, b) => a.number - b.number)
    .forEach(table => {
      if (activeTournament?.settings?.tableIds?.length && !activeTournament.settings.tableIds.includes(table.id)) {
        return;
      }
      const directMatch = table.currentMatchId ? matches[table.currentMatchId] : undefined;
      const candidate =
        (directMatch && directMatch.status !== 'finished')
          ? directMatch
          : Object.values(matches).find(
              m => m.tableId === table.id && m.status === 'pending' && (!activeTournament || m.tournamentId === activeTournament.id)
            );
      if (!candidate || candidate.status !== 'pending') return;
      if (!candidate.player1Id || !candidate.player2Id || !players[candidate.player1Id] || !players[candidate.player2Id]) return;
      if (isFinalStageActive && candidate.tournamentId === activeTournament?.id && !isFinalStageMatch(candidate)) return;
      if (assignedPendingIds.has(candidate.id)) return;
      if (busyLivePlayerIds.has(candidate.player1Id) || busyLivePlayerIds.has(candidate.player2Id)) return;

      assignedPendingIds.add(candidate.id);
      readyTableMatches.push({ table, match: candidate });
    });

  const waitingQueueMatches: Match[] = activeTournament && scheduleContext
    ? sortTournamentMatchesForScheduling(
        activeTourMatches.filter(m => {
          if (m.status !== 'pending') return false;
          if (!m.player1Id || !m.player2Id || !players[m.player1Id] || !players[m.player2Id]) return false;
          if (isFinalStageActive && !isFinalStageMatch(m)) return false;
          if (assignedPendingIds.has(m.id) || m.tableId) return false;
          return true;
        }),
        scheduleContext
      )
    : [];

  const handleStartOrResumeMatch = async (match: Match, tableId?: string) => {
    if (launchingMatchId) return;
    setLaunchingMatchId(match.id);
    try {
      const freshMatch = await fetchFreshMatchForLaunch(match.id, tableId);
      const target = freshMatch || match;
      if (target.status === 'finished') {
        alert('Ce match vient déjà d’être terminé.');
        return;
      }
      if (target.status === 'pending') {
        const effTableId = target.tableId || tableId || Object.values(useStore.getState().tables).find(t => t.currentMatchId === target.id)?.id;
        if (!effTableId) {
          alert("Aucun billard n'est encore assigné à ce match.");
          return;
        }
        startTournamentMatch(target.id, true);
      } else {
        useStore.setState({ activeMatchId: target.id });
      }
    } catch {
      alert('Impossible de synchroniser ce match pour le moment.');
    } finally {
      setLaunchingMatchId(null);
    }
  };

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
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt={currentClub.name} style={{ height: '38px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowPrismModal(true)}
            style={{
              background: 'rgba(24, 119, 242, 0.18)',
              color: '#93C5FD',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.74rem',
              fontWeight: 800,
              border: '1px solid rgba(59, 130, 246, 0.45)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Préparer l'incrustation score & logo pour diffuser sur Facebook avec PRISM Live Studio"
          >
            <Smartphone size={13} /> Live Facebook
          </button>

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
        <button
          onClick={() => setSubTab('leaderboard')}
          style={{
            flex: 1,
            background: subTab === 'leaderboard' ? 'var(--accent-primary)' : 'transparent',
            color: subTab === 'leaderboard' ? '#000' : 'var(--text-muted)',
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
          <Award size={16} /> Classement
        </button>
      </div>

      {subTab === 'bracket' ? (
        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
          <TournamentBracketView />
        </div>
      ) : subTab === 'leaderboard' ? (
        <div style={{ paddingBottom: '1rem' }}>
          <LeaderboardView compact={true} />
        </div>
      ) : (
        <>
          {/* Résumé en direct du tournoi & dernière activité */}
          {activeTournament && (
            <div
              className="glass-card"
              style={{
                padding: '0.9rem 1.1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                border: '1px solid rgba(0, 255, 170, 0.28)',
                background: 'rgba(0, 255, 170, 0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>
                  Avancement : {finishedTourMatches.length} / {activeTourMatches.length} matchs
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', background: 'rgba(0, 255, 170, 0.14)', padding: '2px 8px', borderRadius: '10px' }}>
                  {isFinalStageActive ? '🏆 Phase finale' : `${qualifStatus.numQualifiers} qualifiés`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>
                  {latestActivityTs > 0
                    ? `${finishedTourMatches.length > 0 ? 'Dernier match validé' : 'Dernier match lancé'} : ${formatShortDateTime(latestActivityTs)} (${formatRelativeTime(latestActivityTs)})`
                    : 'Aucune activité enregistrée pour le moment'}
                </span>
                {liveMatches.length === 0 && readyTableMatches.length > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                    En attente de lancement sur {readyTableMatches.length} billard{readyTableMatches.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Matchs appelés sur les billards (démarrables sans PC gérant) */}
          {readyTableMatches.length > 0 && (
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Play size={22} color="#fbbf24" />
                  À démarrer sur les billards
                </span>
                <span style={{ fontSize: '0.75rem', background: 'rgba(251, 191, 36, 0.16)', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, border: '1px solid rgba(251, 191, 36, 0.35)' }}>
                  {readyTableMatches.length} prêt{readyTableMatches.length > 1 ? 's' : ''}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {readyTableMatches.map(({ table, match }) => {
                  const matchTour = match.tournamentId ? tournaments[match.tournamentId] : activeTournament;
                  const { formatLabel } = getMatchScoringRules(match, matchTour, players);
                  const stakeInfo = scheduleContext && match.tournamentId === activeTournament?.id
                    ? getMatchStakeInfo(match, scheduleContext)
                    : null;
                  const isBusy = launchingMatchId === match.id;

                  return (
                    <div
                      key={match.id}
                      className="glass-card"
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                        border: '1px solid rgba(251, 191, 36, 0.35)'
                      }}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#fbbf24' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#fbbf24' }}>
                            {table.name || `Billard ${table.number}`}
                          </span>
                          {match.poolName && (
                            <span style={{ background: 'rgba(0, 255, 204, 0.14)', color: 'var(--accent-primary)', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                              {match.poolName}
                            </span>
                          )}
                          {stakeInfo && (
                            <span style={{ background: stakeInfo.badgeBg, color: stakeInfo.badgeColor, border: `1px solid ${stakeInfo.badgeBorder}`, padding: '2px 7px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                              {stakeInfo.label}
                            </span>
                          )}
                        </div>
                        {formatLabel && (
                          <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
                            {formatLabel}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                          {players[match.player1Id]?.name}
                          {Boolean(match.handicapP1 && match.handicapP1 > 0) && (
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--accent-primary)' }}>+{match.handicapP1}</span>
                          )}
                        </div>
                        <div style={{ padding: '0 0.75rem', fontSize: '1.15rem', fontWeight: 900, color: '#fbbf24' }}>
                          VS
                        </div>
                        <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: '1rem' }}>
                          {players[match.player2Id]?.name}
                          {Boolean(match.handicapP2 && match.handicapP2 > 0) && (
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--accent-primary)' }}>+{match.handicapP2}</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-neon"
                        disabled={Boolean(launchingMatchId)}
                        onClick={() => handleStartOrResumeMatch(match, table.id)}
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          padding: '0.72rem 1rem',
                          fontWeight: 800,
                          color: '#000',
                          fontSize: '0.92rem'
                        }}
                      >
                        {isBusy ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
                        {isBusy ? 'Synchronisation...' : 'Démarrer & Saisir le score'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Activity size={24} color="var(--accent-primary)" />
              Live au Club
            </h2>
        
        {liveMatches.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            {readyTableMatches.length > 0
              ? "Aucun match encore démarré — utilisez « Démarrer & Saisir le score » ci-dessus sur le billard concerné."
              : 'Aucun match en cours'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {liveMatches.map(m => {
              const tableObj = m.tableId ? tables[m.tableId] : undefined;
              const matchTour = m.tournamentId ? tournaments[m.tournamentId] : activeTournament;
              const { formatLabel } = getMatchScoringRules(m, matchTour, players);
              const rawStreamUrl = m.liveStreamUrl || tableObj?.liveStreamUrl;
              const extVideo = extractExternalVideoFromStreamUrl(rawStreamUrl);
              const webrtcCam = extractWebRtcCamFromStreamUrl(rawStreamUrl);
              const vdoRoom = extractVdoRoomFromStreamUrl(rawStreamUrl);
              const hasLiveVideo = Boolean(extVideo || webrtcCam || vdoRoom);
              const overlayHref = resolveOverlayHref(rawStreamUrl);
              const isBusy = launchingMatchId === m.id;

              return (
                <div key={m.id} className="glass-card" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent-primary)', boxShadow: 'var(--shadow-neon)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>
                        {tableObj ? (tableObj.name || `Table ${tableObj.number}`) : 'Live'}
                      </span>
                      {formatLabel && (
                        <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: '6px', fontSize: '0.72rem' }}>
                          {formatLabel}
                        </span>
                      )}
                      <MatchTimerBadge
                        startTime={m.startTime}
                        durationMinutes={m.durationMinutes ?? resolveMatchDurationMinutes(m, matchTour)}
                        status={m.status}
                        size="sm"
                        showElapsedWhenUnlimited={true}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {overlayHref && (
                        <a
                          href={overlayHref}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(255, 34, 68, 0.2)',
                            border: '1px solid rgba(255, 34, 68, 0.5)',
                            color: '#ff8a96',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            textDecoration: 'none'
                          }}
                        >
                          <Radio size={12} /> Plein écran TV <ExternalLink size={11} />
                        </a>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-primary)', fontWeight: 700 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 2s infinite' }} />
                        En direct
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                      {players[m.player1Id]?.name}
                      {Boolean(m.handicapP1 && m.handicapP1 > 0) && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--accent-primary)' }}>+{m.handicapP1}</span>
                      )}
                    </div>
                    <div style={{ padding: '0 1rem', fontSize: '1.6rem', fontWeight: 900 }} className="text-gradient">
                      {m.score1} - {m.score2}
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: '1rem' }}>
                      {players[m.player2Id]?.name}
                      {Boolean(m.handicapP2 && m.handicapP2 > 0) && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--accent-primary)' }}>+{m.handicapP2}</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={Boolean(launchingMatchId)}
                    onClick={() => handleStartOrResumeMatch(m, m.tableId)}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '0.55rem 0.9rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      borderColor: 'rgba(0, 255, 170, 0.35)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Edit3 size={15} />}
                    {isBusy ? 'Chargement...' : 'Saisir / Terminer le score'}
                  </button>

                  {hasLiveVideo && (
                    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
                      {extVideo ? (
                        <iframe
                          src={formatEmbedVideoUrl(extVideo)}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          title={`Live ${players[m.player1Id]?.name} vs ${players[m.player2Id]?.name}`}
                        />
                      ) : webrtcCam ? (
                        <WebRtcCameraPlayer
                          clubId={currentClub.id}
                          cameraId={webrtcCam}
                          muted={true}
                          fill={true}
                          title={`Caméra ${tableObj ? (tableObj.name || `Table ${tableObj.number}`) : 'Live'}`}
                        />
                      ) : vdoRoom ? (
                        <iframe
                          src={`https://vdo.ninja/?view=${encodeURIComponent(vdoRoom)}&cleanoutput&autoplay&muted`}
                          allow="autoplay; camera; microphone; fullscreen; picture-in-picture"
                          allowFullScreen
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          title={`Caméra ${tableObj ? (tableObj.name || `Table ${tableObj.number}`) : 'Live'}`}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File d'attente des matchs restants */}
      {activeTournament && waitingQueueMatches.length > 0 && scheduleContext && (
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={22} color="var(--accent-secondary)" />
              Prochains matchs
            </span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(0, 229, 255, 0.14)', color: 'var(--accent-secondary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(0, 229, 255, 0.3)' }}>
              {waitingQueueMatches.length} en attente
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(showAllQueue ? waitingQueueMatches : waitingQueueMatches.slice(0, 5)).map((m, idx) => {
              const stakeInfo = getMatchStakeInfo(m, scheduleContext);
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    padding: '0.75rem 0.9rem',
                    background: 'var(--bg-surface)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      #{idx + 1}{m.poolName ? ` • ${m.poolName}` : ''}
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, background: stakeInfo.badgeBg, color: stakeInfo.badgeColor, border: `1px solid ${stakeInfo.badgeBorder}`, padding: '1px 6px', borderRadius: '5px' }}>
                      {stakeInfo.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
                      {players[m.player1Id]?.name}
                      {Boolean(m.handicapP1 && m.handicapP1 > 0) && (
                        <span style={{ marginLeft: '5px', fontSize: '0.72rem', color: 'var(--accent-primary)' }}>+{m.handicapP1}</span>
                      )}
                    </span>
                    <span style={{ padding: '0 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>vs</span>
                    <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
                      {players[m.player2Id]?.name}
                      {Boolean(m.handicapP2 && m.handicapP2 > 0) && (
                        <span style={{ marginLeft: '5px', fontSize: '0.72rem', color: 'var(--accent-primary)' }}>+{m.handicapP2}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {waitingQueueMatches.length > 5 && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowAllQueue(v => !v)}
                style={{ justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem' }}
              >
                {showAllQueue ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {showAllQueue ? 'Réduire la file' : `Afficher toute la file (${waitingQueueMatches.length})`}
              </button>
            )}
          </div>
        </div>
      )}

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
              const timeLabel = formatShortDateTime(m.endTime || m.startTime);
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.85rem 1rem', background: 'var(--bg-surface)', borderRadius: '12px' }}>
                  {timeLabel && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>
                      Terminé : {timeLabel}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ flex: 1, textAlign: 'right', color: p1Win ? '#fff' : 'var(--text-muted)', fontWeight: p1Win ? 700 : 400 }}>
                      {players[m.player1Id]?.name}
                    </span>
                    <span style={{ padding: '0 1rem', fontWeight: 800 }}>
                      {m.score1} - {m.score2}
                    </span>
                    <span style={{ flex: 1, textAlign: 'left', color: p2Win ? '#fff' : 'var(--text-muted)', fontWeight: p2Win ? 700 : 400 }}>
                      {players[m.player2Id]?.name}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}

      {showPrismModal && (
        <PrismMobileControlView onClose={() => setShowPrismModal(false)} />
      )}
    </div>
  );
};

export default FeedView;
