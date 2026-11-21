import React, { useState } from 'react';
import { useStore } from '../store';
import { Activity, Clock, Trophy, Lock, Award, Radio, ExternalLink } from 'lucide-react';
import TournamentBracketView from './TournamentBracketView';
import LeaderboardView from './LeaderboardView';
import MatchTimerBadge from './MatchTimerBadge';
import { getTournamentQualificationStatus } from '../utils/qualifiers';
import { isRealFinishedMatch } from '../utils/bracket';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getMatchScoringRules, resolveMatchDurationMinutes } from '../utils/rules';
import { extractExternalVideoFromStreamUrl, extractVdoRoomFromStreamUrl, formatEmbedVideoUrl } from '../utils/video';

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
  const { matches, players, tables, tournaments, currentClub } = useStore();
  const [subTab, setSubTab] = useState<'live' | 'bracket' | 'leaderboard'>('live');

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  const { hasSureQualifiers } = getTournamentQualificationStatus(activeTournament, matches, players);

  const allMatches = Object.values(matches).sort((a, b) => b.startTime - a.startTime);
  const liveMatches = allMatches.filter(
    m =>
      m.status === 'playing' &&
      (!m.tournamentId || tournaments[m.tournamentId]?.status === 'ongoing') &&
      Boolean(m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
  );
  const finishedMatches = allMatches.filter(m => isRealFinishedMatch(m, players)).slice(0, 5);

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
            {liveMatches.map(m => {
              const tableObj = m.tableId ? tables[m.tableId] : undefined;
              const matchTour = m.tournamentId ? tournaments[m.tournamentId] : activeTournament;
              const { formatLabel } = getMatchScoringRules(m, matchTour, players);
              const rawStreamUrl = m.liveStreamUrl || tableObj?.liveStreamUrl;
              const extVideo = extractExternalVideoFromStreamUrl(rawStreamUrl);
              const vdoRoom = extractVdoRoomFromStreamUrl(rawStreamUrl);
              const hasLiveVideo = Boolean(extVideo || vdoRoom);
              const overlayHref = resolveOverlayHref(rawStreamUrl);

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
