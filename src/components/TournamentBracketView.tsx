import React, { useState } from 'react';
import { useStore } from '../store';
import { Match, MatchStage } from '../types';
import {
  Trophy, Swords, CheckCircle2, Clock, Sparkles,
  Users, AlertCircle, ShieldCheck, QrCode, RefreshCw
} from 'lucide-react';
import { getTournamentQualificationStatus, PlayerQualifStat } from '../utils/qualifiers';
import { getBracketSize, getBracketRounds, isFinalStageMatch, generateSeedingPairs } from '../utils/bracket';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';

interface BracketViewProps {
  onSelectTableForQR?: (tableId: string) => void;
}

export const TournamentBracketView: React.FC<BracketViewProps> = ({ onSelectTableForQR }) => {
  const { tournaments, matches, players, tables, launchFinalStage, reseedFinalStage, toggleThirdPlaceMatch, autoDispatchMatches, currentClub } = useStore();

  const allTournaments = Object.values(tournaments);
  const activeTournament = allTournaments.slice().reverse().find(t => t.status === 'ongoing') || null;

  const [confirmLaunchOpen, setConfirmLaunchOpen] = useState(false);
  const [modalIncludeThirdPlace, setModalIncludeThirdPlace] = useState(activeTournament?.settings?.hasThirdPlaceMatch ?? true);
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<string>('all');

  React.useEffect(() => {
    // Auto-dispatch / advance any ready bracket matches to ensure sync with DB
    autoDispatchMatches();
  }, [activeTournament?.id]);

  if (!activeTournament) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', margin: 'auto', maxWidth: '600px' }}>
        <Trophy size={48} style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Aucun tournoi en cours</h3>
        <p style={{ color: 'var(--text-muted)' }}>Démarrez un tournoi pour accéder à l'arbre des phases finales.</p>
      </div>
    );
  }

  const {
    isFinalLaunched,
    isQualifAllDone,
    hasSureQualifiers,
    sureQualifiers,
    ranking,
    numQualifiers
  } = getTournamentQualificationStatus(activeTournament, matches, players);

  const allTourMatches = Object.values(matches).filter(m =>
    Boolean(m && (m.tournamentId === activeTournament.id || activeTournament.matches.includes(m.id)))
  );
  const finalMatches = allTourMatches.filter(isFinalStageMatch);

  // Check if active final matches have an inverted 1st vs 2nd pairing in semi 1
  const hasInvertedSemi = Boolean(isFinalLaunched && ranking.length >= 2 && (() => {
    const s1 = finalMatches.find(m => (m.stage === 'semi' || m.id.includes('_semi_')) && (m.bracketPosition === 0 || m.id.includes('_semi_1_')));
    if (!s1 || s1.status === 'finished') return false;
    const r0 = ranking[0]?.id;
    const r1 = ranking[1]?.id;
    return (s1.player1Id === r0 && s1.player2Id === r1) || (s1.player1Id === r1 && s1.player2Id === r0);
  })());

  // Active / Projected bracket matches
  type DisplayMatch = {
    id: string;
    stage: MatchStage;
    title: string;
    round: number;
    position: number;
    player1Id?: string;
    player2Id?: string;
    player1Label?: string;
    player2Label?: string;
    score1: number;
    score2: number;
    status: 'pending' | 'playing' | 'finished';
    winnerId?: string;
    tableId?: string;
    realMatch?: Match;
    handicapP1?: number;
    handicapP2?: number;
  };

  // Construction universelle des tours de l'arbre (2 à 128 joueurs)
  const bracketSize = getBracketSize(numQualifiers);
  const bracketRoundDefs = getBracketRounds(bracketSize);
  const totalRoundsCount = bracketRoundDefs.length;

  let rounds: { title: string; stage: MatchStage; matches: DisplayMatch[] }[] = [];

  if (isFinalLaunched) {
    // 1. Collecte depuis les vrais matchs en base
    bracketRoundDefs.forEach((roundDef, rIdx) => {
      const isLastRound = rIdx === totalRoundsCount - 1;
      const matchesInThisRound = finalMatches
        .filter(m => m.stage === roundDef.stage || m.id.includes(`_${roundDef.prefix}_`))
        .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));

      const displayList: DisplayMatch[] = matchesInThisRound.map((m, idx) => {
        const isBye = (!m.player2Id || m.player2Id === 'BYE') && m.status === 'finished';
        return {
          id: m.id,
          stage: roundDef.stage,
          title: roundDef.stage === 'final'
            ? '🏆 Grande Finale'
            : `${roundDef.shortTitle} #${idx + 1}`,
          round: roundDef.roundNumber,
          position: m.bracketPosition ?? idx,
          player1Id: m.player1Id,
          player2Id: isBye ? undefined : m.player2Id,
          player2Label: isBye ? '⚡ BLANC (Exempt)' : undefined,
          score1: m.score1,
          score2: m.score2,
          status: m.status,
          winnerId: m.winnerId,
          tableId: m.tableId,
          realMatch: m,
          handicapP1: m.handicapP1,
          handicapP2: m.handicapP2
        };
      });

      // Si dernier tour, inclure la Petite Finale si présente
      if (isLastRound) {
        const thirdPlace = finalMatches.find(m => m.stage === 'third_place' || m.id.includes('_third_place_'));
        if (thirdPlace) {
          displayList.push({
            id: thirdPlace.id,
            stage: 'third_place',
            title: 'Petite Finale (3ème place)',
            round: roundDef.roundNumber,
            position: 1,
            player1Id: thirdPlace.player1Id,
            player2Id: thirdPlace.player2Id,
            score1: thirdPlace.score1,
            score2: thirdPlace.score2,
            status: thirdPlace.status,
            winnerId: thirdPlace.winnerId,
            tableId: thirdPlace.tableId,
            realMatch: thirdPlace,
            handicapP1: thirdPlace.handicapP1,
            handicapP2: thirdPlace.handicapP2
          });
        }
      }

      if (displayList.length > 0) {
        rounds.push({
          title: isLastRound && displayList.length > 1 ? 'Finales' : roundDef.title,
          stage: roundDef.stage,
          matches: displayList
        });
      }
    });
  } else {
    // 2. Tableau projeté en direct selon le classement actuel des qualifications
    const getSlotPlayerId = (playerStat?: PlayerQualifStat) => playerStat?.id;
    const getSlotLabel = (playerStat?: PlayerQualifStat, rankLabel?: string) => {
      if (isFinalLaunched || isQualifAllDone) {
        return playerStat ? (players[playerStat.id]?.name || rankLabel) : (rankLabel || 'En attente...');
      }
      if (playerStat) {
        const playerName = players[playerStat.id]?.name || 'Joueur';
        return playerStat.isSure ? `${playerName} (Qualifié)` : `${playerName} (Provisoire ${rankLabel})`;
      }
      return `En attente (${rankLabel || 'Qualifié'})`;
    };

    const pairs = generateSeedingPairs(bracketSize);

    bracketRoundDefs.forEach((roundDef, rIdx) => {
      const isFirstRound = rIdx === 0;
      const isLastRound = rIdx === totalRoundsCount - 1;
      const displayList: DisplayMatch[] = [];

      if (isFirstRound) {
        for (let p = 0; p < roundDef.matchCount; p++) {
          const [seedA, seedB] = pairs[p];
          const statA = ranking[seedA - 1];
          const statB = ranking[seedB - 1];
          const isBye = seedB > numQualifiers || !statB;

          displayList.push({
            id: `proj_${roundDef.prefix}_${p}`,
            stage: roundDef.stage,
            title: `${roundDef.shortTitle} #${p + 1}`,
            round: roundDef.roundNumber,
            position: p,
            player1Id: getSlotPlayerId(statA),
            player2Id: isBye ? undefined : getSlotPlayerId(statB),
            player1Label: getSlotLabel(statA, `${seedA}e`),
            player2Label: isBye ? 'BLANC (Exempt)' : getSlotLabel(statB, `${seedB}e`),
            score1: 0,
            score2: 0,
            status: isBye ? 'finished' : 'pending',
            winnerId: isBye ? getSlotPlayerId(statA) : undefined
          });
        }
      } else if (isLastRound) {
        displayList.push({
          id: 'proj_final',
          stage: 'final',
          title: '🏆 Grande Finale',
          round: roundDef.roundNumber,
          position: 0,
          player1Label: 'Vainqueur 1/2 #1',
          player2Label: 'Vainqueur 1/2 #2',
          score1: 0,
          score2: 0,
          status: 'pending'
        });

        const hasThirdPlace = Boolean(activeTournament.settings?.hasThirdPlaceMatch ?? true);
        if (hasThirdPlace && bracketSize >= 4) {
          displayList.push({
            id: 'proj_third_place',
            stage: 'third_place',
            title: 'Petite Finale (3ème place)',
            round: roundDef.roundNumber,
            position: 1,
            player1Label: 'Perdant 1/2 #1',
            player2Label: 'Perdant 1/2 #2',
            score1: 0,
            score2: 0,
            status: 'pending'
          });
        }
      } else {
        for (let p = 0; p < roundDef.matchCount; p++) {
          displayList.push({
            id: `proj_${roundDef.prefix}_${p}`,
            stage: roundDef.stage,
            title: `${roundDef.shortTitle} #${p + 1}`,
            round: roundDef.roundNumber,
            position: p,
            player1Label: `Vainqueur match #${p * 2 + 1}`,
            player2Label: `Vainqueur match #${p * 2 + 2}`,
            score1: 0,
            score2: 0,
            status: 'pending'
          });
        }
      }

      rounds.push({
        title: isLastRound && displayList.length > 1 ? 'Finales' : roundDef.title,
        stage: roundDef.stage,
        matches: displayList
      });
    });
  }

  // Find overall tournament champion and podium if matches are finished
  const realFinal = finalMatches.find(m => (m.stage === 'final' || m.id.includes('_final_')) && !m.id.includes('_third_place_'));
  const championId = realFinal?.status === 'finished' ? realFinal.winnerId : undefined;
  const champion = championId ? players[championId] : null;

  const realThirdPlace = finalMatches.find(m => m.stage === 'third_place' || m.id.includes('_third_place_'));
  const runnerUpId = realFinal?.status === 'finished'
    ? (realFinal.winnerId === realFinal.player1Id ? realFinal.player2Id : realFinal.player1Id)
    : undefined;
  const runnerUp = runnerUpId ? players[runnerUpId] : null;

  const thirdWinnerId = realThirdPlace?.status === 'finished' ? realThirdPlace.winnerId : undefined;
  const thirdWinner = thirdWinnerId ? players[thirdWinnerId] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>

      {/* Top Banner / Status & Action */}
      <div className="glass-card" style={{
        padding: '1.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        border: isFinalLaunched ? '1px solid rgba(0, 255, 170, 0.4)' : (hasSureQualifiers ? '1px solid rgba(255, 204, 0, 0.4)' : '1px solid var(--border-color)'),
        background: isFinalLaunched
          ? 'linear-gradient(135deg, rgba(0, 255, 170, 0.08), rgba(0, 0, 0, 0.4))'
          : (hasSureQualifiers
            ? 'linear-gradient(135deg, rgba(255, 204, 0, 0.08), rgba(0, 0, 0, 0.4))'
            : 'rgba(5, 8, 22, 0.6)')
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          {/* Club Logo Badge */}
          <div style={{
            background: '#ffffff',
            padding: '4px 8px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            flexShrink: 0
          }}>
            <img src={getClubLogoUrl(currentClub.logoUrl)} alt={currentClub.name} style={{ height: '48px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.src = defaultClubLogo; }} />
          </div>

          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: isFinalLaunched ? 'rgba(0, 255, 170, 0.15)' : (hasSureQualifiers ? 'rgba(255, 204, 0, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
            border: `2px solid ${isFinalLaunched ? 'var(--accent-primary)' : (hasSureQualifiers ? '#ffcc00' : 'var(--border-color)')}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isFinalLaunched ? 'var(--accent-primary)' : (hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)'),
            flexShrink: 0
          }}>
            <Trophy size={26} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
              <span style={{
                background: isFinalLaunched ? 'rgba(0, 255, 170, 0.2)' : (hasSureQualifiers ? 'rgba(255, 204, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'),
                color: isFinalLaunched ? 'var(--accent-primary)' : (hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)'),
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isFinalLaunched ? 'var(--accent-primary)' : (hasSureQualifiers ? '#ffcc00' : 'var(--text-muted)')
                }} />
                {isFinalLaunched
                  ? 'PHASES FINALES OFFICIELLES'
                  : (hasSureQualifiers
                    ? `QUALIFIÉS ASSURÉS (${sureQualifiers.length}/${numQualifiers})`
                    : 'EN ATTENTE DE QUALIFIÉS SÛRS')}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {activeTournament.settings?.seedByMerit ? 'Tirage au Mérite (1er vs dernier)' : 'Tirage Classique'}
              </span>
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
              {currentClub.name} • Phases Finales • {numQualifiers} Qualifiés
            </h2>
          </div>
        </div>

        {/* Action button if not launched */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {!isFinalLaunched ? (
            <button
              className="btn btn-neon"
              id="btn-launch-final-stage"
              style={{
                background: isQualifAllDone ? 'linear-gradient(135deg, #00ffaa, #00cc88)' : undefined,
                boxShadow: isQualifAllDone ? '0 0 20px rgba(0, 255, 170, 0.5)' : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.8rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmLaunchOpen(true);
              }}
            >
              <Sparkles size={18} />
              {isQualifAllDone ? 'Valider les Qualifiés & Lancer le Tableau Final' : 'Forcer le Lancement du Tableau Final'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--accent-primary)',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: 'rgba(0, 255, 170, 0.1)',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 170, 0.3)'
              }}>
                <ShieldCheck size={18} />
                Tableau Officiel ({finalMatches.length} matchs)
              </div>
              {numQualifiers >= 4 && (
                <button
                  className="btn btn-outline"
                  title={finalMatches.some(m => m.stage === 'third_place' || m.id.includes('_third_place_')) ? "Désactiver la petite finale pour la 3ème place" : "Activer la petite finale pour la 3ème place"}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderColor: finalMatches.some(m => m.stage === 'third_place' || m.id.includes('_third_place_')) ? '#f59e0b' : 'rgba(255,255,255,0.2)',
                    color: finalMatches.some(m => m.stage === 'third_place' || m.id.includes('_third_place_')) ? '#f59e0b' : 'var(--text-muted)',
                    background: finalMatches.some(m => m.stage === 'third_place' || m.id.includes('_third_place_')) ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  onClick={() => toggleThirdPlaceMatch(activeTournament.id)}
                >
                  🥉 {finalMatches.some(m => m.stage === 'third_place' || m.id.includes('_third_place_')) ? 'Petite Finale active' : '+ Petite Finale'}
                </button>
              )}
              <button
                className="btn btn-outline"
                title="Rétablir les têtes de séries officielles : 1er vs 4ème et 2ème vs 3ème"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderColor: 'var(--accent-primary)',
                  color: 'var(--accent-primary)',
                  padding: '0.5rem 0.9rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  if (confirm("Réaligner les duels de la phase finale selon le classement officiel (1er vs 4ème et 2ème vs 3ème) ?")) {
                    reseedFinalStage(activeTournament.id);
                  }
                }}
              >
                <RefreshCw size={14} /> Réaligner 1er vs 4ème
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmLaunchOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--accent-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0, 255, 170, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                <Swords size={22} />
              </div>
              <h3 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 800 }}>Confirmer le lancement des Phases Finales</h3>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
              Les <strong>{numQualifiers} premiers joueurs</strong> du classement actuel seront officiellement qualifiés et inscrits dans l'arbre d'élimination directe :
            </p>

            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {ranking.slice(0, numQualifiers).map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                    #{i + 1} {p.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {p.pts} pts ({p.sf - p.sa > 0 ? `+${p.sf - p.sa}` : p.sf - p.sa})
                  </span>
                </div>
              ))}
            </div>

            {numQualifiers === 7 && (
              <div style={{ background: 'rgba(0, 255, 170, 0.1)', border: '1px solid rgba(0, 255, 170, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚡</span>
                <span><strong>1 Blanc (exempt)</strong> sera automatiquement attribué au 1er (#{ranking[0]?.name}) directement en demi-finale !</span>
              </div>
            )}
            {numQualifiers === 6 && (
              <div style={{ background: 'rgba(0, 255, 170, 0.1)', border: '1px solid rgba(0, 255, 170, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚡</span>
                <span><strong>2 Blancs (exempts)</strong> attribués au 1er (#{ranking[0]?.name}) et 2ème (#{ranking[1]?.name}) directement en demi-finale !</span>
              </div>
            )}
            {numQualifiers === 5 && (
              <div style={{ background: 'rgba(0, 255, 170, 0.1)', border: '1px solid rgba(0, 255, 170, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚡</span>
                <span><strong>3 Blancs (exempts)</strong> attribués au 1er, 2ème et 3ème directement en demi-finale !</span>
              </div>
            )}
            {numQualifiers === 3 && (
              <div style={{ background: 'rgba(0, 255, 170, 0.1)', border: '1px solid rgba(0, 255, 170, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚡</span>
                <span><strong>1 Blanc (exempt)</strong> attribué au 1er (#{ranking[0]?.name}) directement en grande finale !</span>
              </div>
            )}

            {numQualifiers >= 4 && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                cursor: 'pointer',
                background: modalIncludeThirdPlace ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.03)',
                padding: '0.8rem 1rem',
                borderRadius: '10px',
                border: `1px solid ${modalIncludeThirdPlace ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)'}`
              }}>
                <input
                  type="checkbox"
                  checked={modalIncludeThirdPlace}
                  onChange={(e) => setModalIncludeThirdPlace(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: modalIncludeThirdPlace ? '#f59e0b' : '#fff' }}>
                    Petite Finale (Match pour la 3ème place)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Faire s'affronter les perdants des 1/2 finales pour désigner le 3ème du tournoi
                  </span>
                </div>
              </label>
            )}

            <p style={{ color: '#ffcc00', fontSize: '0.85rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={16} /> Les matchs de phase finale seront automatiquement répartis sur les billards disponibles.
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn btn-outline" onClick={() => setConfirmLaunchOpen(false)}>
                Annuler
              </button>
              <button
                className="btn btn-neon"
                id="btn-confirm-launch-final"
                onClick={(e) => {
                  e.stopPropagation();
                  launchFinalStage(activeTournament.id, modalIncludeThirdPlace);
                  setConfirmLaunchOpen(false);
                }}
              >
                Confirmer & Lancer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Banner if 1st vs 2nd anomaly detected */}
      {hasInvertedSemi && (
        <div style={{
          background: 'rgba(255, 60, 60, 0.15)',
          border: '1px solid rgba(255, 60, 60, 0.5)',
          borderRadius: '12px',
          padding: '1.2rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          color: '#ff6b6b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <AlertCircle size={26} style={{ flexShrink: 0, color: '#ff6b6b' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                Anomalie détectée : La 1/2 finale oppose actuellement le 1er au 2ème !
              </div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>
                Dans un tableau officiel, le 1er doit affronter le 4ème et le 2ème le 3ème pour que les deux meilleurs ne se rencontrent qu'en finale.
              </div>
            </div>
          </div>
          <button
            className="btn btn-neon"
            style={{
              background: '#00ffaa',
              color: '#000',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              padding: '0.7rem 1.2rem'
            }}
            onClick={() => reseedFinalStage(activeTournament.id)}
          >
            <RefreshCw size={16} /> Rétablir 1er vs 4ème
          </button>
        </div>
      )}

      {/* Information Banner if no sure qualifiers */}
      {!hasSureQualifiers && !isFinalLaunched && (
        <div style={{
          background: 'rgba(255, 204, 0, 0.08)',
          border: '1px solid rgba(255, 204, 0, 0.35)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          color: '#ffcc00'
        }}>
          <AlertCircle size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffcc00' }}>
              Tableau projeté en direct selon le classement provisoire
            </div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
              Les cases du tableau ci-dessous affichent les qualifiés projetés selon les résultats actuels. Vous pouvez lancer officiellement les phases finales à tout moment via le bouton ci-dessus.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Round Filter Tabs */}
      {rounds.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setSelectedRoundFilter('all')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '20px',
              border: selectedRoundFilter === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
              background: selectedRoundFilter === 'all' ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.03)',
              color: selectedRoundFilter === 'all' ? 'var(--accent-primary)' : '#fff',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🏆 Vue Arbre Complète
          </button>
          {rounds.map(r => (
            <button
              key={r.title}
              onClick={() => setSelectedRoundFilter(r.title)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '20px',
                border: selectedRoundFilter === r.title ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                background: selectedRoundFilter === r.title ? 'rgba(0, 255, 204, 0.2)' : 'rgba(255,255,255,0.03)',
                color: selectedRoundFilter === r.title ? 'var(--accent-primary)' : '#fff',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {r.title} ({r.matches.length})
            </button>
          ))}
        </div>
      )}

      {/* THE BRACKET TREE VISUALIZATION                                             */}
      {/* ========================================================================= */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '2.5rem',
        overflowX: 'auto',
        padding: '1rem 0.5rem 2rem 0.5rem'
      }}>
        {rounds.filter(r => selectedRoundFilter === 'all' || r.title === selectedRoundFilter).map((round, rIdx) => {
          const isFinalRound = rIdx === rounds.length - 1;

          return (
            <div
              key={rIdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: '320px',
                flex: '1 0 320px',
                gap: '1.2rem'
              }}
            >
              {/* Round Header */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '0.8rem 1.2rem',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: isFinalRound ? 'var(--accent-primary)' : '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isFinalRound && <Trophy size={16} color="var(--accent-primary)" />}
                  {round.title}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '10px' }}>
                  {round.matches.length} {round.matches.length > 1 ? 'matchs' : 'match'}
                </span>
              </div>

              {/* Match Cards in this Round Column */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-around',
                flex: 1,
                gap: '2rem'
              }}>
                {round.matches.map((m) => {
                  const p1 = m.player1Id ? players[m.player1Id] : null;
                  const p2 = m.player2Id ? players[m.player2Id] : null;

                  const isBye = Boolean(
                    (!m.player2Id || m.player2Id === 'BYE' || m.player2Label?.includes('BLANC')) &&
                    (m.status === 'finished' || m.player2Label?.includes('BLANC'))
                  );

                  const isP1Winner = (m.status === 'finished' && m.winnerId === m.player1Id) || (isBye && Boolean(m.player1Id));
                  const isP2Winner = m.status === 'finished' && m.winnerId === m.player2Id && !isBye;

                  const tableObj = m.tableId ? tables[m.tableId] : null;
                  const tableName = tableObj?.name || (tableObj ? `Billard ${tableObj.number}` : null);

                  const isPlaying = m.status === 'playing';

                  return (
                    <div
                      key={m.id}
                      className="glass-card"
                      style={{
                        padding: '1.2rem',
                        border: isPlaying
                          ? '2px solid var(--accent-primary)'
                          : isP1Winner || isP2Winner
                            ? '1px solid rgba(0, 255, 170, 0.3)'
                            : '1px solid var(--border-color)',
                        background: isPlaying
                          ? 'radial-gradient(circle at top left, rgba(0, 255, 170, 0.12), rgba(0, 0, 0, 0.7))'
                          : 'rgba(5, 8, 22, 0.65)',
                        boxShadow: isPlaying ? '0 0 25px rgba(0, 255, 170, 0.25)' : 'none',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        cursor: m.tableId && onSelectTableForQR ? 'pointer' : 'default'
                      }}
                      onClick={() => {
                        if (m.tableId && onSelectTableForQR) {
                          onSelectTableForQR(m.tableId);
                        }
                      }}
                    >
                      {/* Match Header Tag */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                          {m.title}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {tableName && (
                            <span style={{
                              background: isPlaying ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                              color: isPlaying ? 'var(--accent-primary)' : '#fff',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '0.7rem'
                            }}>
                              {tableName}
                            </span>
                          )}

                          {isBye ? (
                            <span style={{
                              background: 'rgba(0, 255, 170, 0.15)',
                              color: 'var(--accent-primary)',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              border: '1px solid rgba(0, 255, 170, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              ⚡ EXEMPT (BLANC)
                            </span>
                          ) : isPlaying ? (
                            <span style={{ color: '#00ffaa', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800 }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ffaa', animation: 'pulse 1.5s infinite' }} />
                              LIVE
                            </span>
                          ) : m.status === 'finished' ? (
                            <span style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}>
                              <CheckCircle2 size={12} /> Terminé
                            </span>
                          ) : !tableName ? (
                            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Clock size={12} /> À venir
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Opponents List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

                        {/* Player 1 Row */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.7rem',
                          borderRadius: '8px',
                          background: isP1Winner
                            ? 'rgba(0, 255, 170, 0.15)'
                            : isPlaying
                              ? 'rgba(255, 255, 255, 0.04)'
                              : 'rgba(255, 255, 255, 0.02)',
                          border: isP1Winner ? '1px solid var(--accent-primary)' : '1px solid transparent',
                          opacity: (m.status === 'finished' && !isP1Winner) ? 0.45 : 1
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                            {p1?.avatarUrl ? (
                              <img src={p1.avatarUrl} alt={p1.name} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                <Users size={14} />
                              </div>
                            )}

                            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ fontWeight: isP1Winner ? 800 : 600, fontSize: '0.85rem', color: isP1Winner ? 'var(--accent-primary)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p1 ? p1.name : (m.player1Label || 'En attente...')}
                              </span>
                              {p1 && (p1.level === 'Prestige' || p1.level === 'Confirmé') && (
                                <span title="Joueur Prestige" style={{ fontSize: '0.7rem' }}>👑</span>
                              )}
                              {Boolean(m.handicapP1 && m.handicapP1 > 0) && (
                                <span style={{ fontSize: '0.62rem', background: 'rgba(0,255,170,0.2)', color: 'var(--accent-primary)', padding: '0 4px', borderRadius: '4px', fontWeight: 800 }}>
                                  +{m.handicapP1}
                                </span>
                              )}
                            </div>

                            {isP1Winner && (
                              <Trophy size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            )}
                          </div>

                          <div style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            padding: '0 0.4rem',
                            color: isP1Winner ? 'var(--accent-primary)' : (isPlaying ? '#fff' : 'var(--text-muted)')
                          }}>
                            {m.status !== 'pending' ? m.score1 : '-'}
                          </div>
                        </div>

                        {/* Player 2 Row */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.7rem',
                          borderRadius: '8px',
                          background: isP2Winner
                            ? 'rgba(0, 255, 170, 0.15)'
                            : isPlaying
                              ? 'rgba(255, 255, 255, 0.04)'
                              : 'rgba(255, 255, 255, 0.02)',
                          border: isP2Winner ? '1px solid var(--accent-primary)' : '1px solid transparent',
                          opacity: (m.status === 'finished' && !isP2Winner && !isBye) ? 0.45 : (isBye ? 0.7 : 1)
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                            {isBye ? (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                💤
                              </div>
                            ) : p2?.avatarUrl ? (
                              <img src={p2.avatarUrl} alt={p2.name} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                <Users size={14} />
                              </div>
                            )}

                            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ fontWeight: isP2Winner ? 800 : (isBye ? 500 : 600), fontStyle: isBye ? 'italic' : 'normal', fontSize: '0.85rem', color: isBye ? 'var(--text-muted)' : (isP2Winner ? 'var(--accent-primary)' : '#fff'), overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {isBye ? 'BLANC (Exempt)' : (p2 ? p2.name : (m.player2Label || 'En attente...'))}
                              </span>
                              {!isBye && p2 && (p2.level === 'Prestige' || p2.level === 'Confirmé') && (
                                <span title="Joueur Prestige" style={{ fontSize: '0.7rem' }}>👑</span>
                              )}
                              {!isBye && Boolean(m.handicapP2 && m.handicapP2 > 0) && (
                                <span style={{ fontSize: '0.62rem', background: 'rgba(0,255,170,0.2)', color: 'var(--accent-primary)', padding: '0 4px', borderRadius: '4px', fontWeight: 800 }}>
                                  +{m.handicapP2}
                                </span>
                              )}
                            </div>

                            {isP2Winner && (
                              <Trophy size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            )}
                          </div>

                          <div style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            padding: '0 0.4rem',
                            color: isP2Winner ? 'var(--accent-primary)' : (isPlaying ? '#fff' : 'var(--text-muted)')
                          }}>
                            {isBye ? '-' : (m.status !== 'pending' ? m.score2 : '-')}
                          </div>
                        </div>

                      </div>

                      {/* Match Actions / Table QR Access */}
                      {m.tableId ? (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <button
                            className="btn btn-neon"
                            style={{
                              width: '100%',
                              fontSize: '0.75rem',
                              padding: '0.45rem 0.6rem',
                              justifyContent: 'center',
                              color: '#000',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (m.tableId && onSelectTableForQR) onSelectTableForQR(m.tableId);
                            }}
                          >
                            <QrCode size={13} />
                            {isPlaying ? `Score en direct (${tableName})` : `QR Code & Démarrer (${tableName})`}
                          </button>
                        </div>
                      ) : m.status === 'pending' && m.player1Id && m.player2Id ? (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', color: '#ffcc00', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Prêt • En attente d'un billard libre
                          </span>
                        </div>
                      ) : null}

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Podium / Champion Display at the End of the Tree */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: '260px',
          justifyContent: 'center',
          gap: '1.2rem'
        }}>
          <div className="glass-card" style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            border: champion ? '2px solid var(--accent-primary)' : '1px dashed var(--border-color)',
            background: champion
              ? 'radial-gradient(circle at center, rgba(0, 255, 170, 0.2), rgba(5, 8, 22, 0.8))'
              : 'rgba(5, 8, 22, 0.4)',
            boxShadow: champion ? '0 0 35px rgba(0, 255, 170, 0.35)' : 'none'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: champion ? 'rgba(0, 255, 170, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              border: `3px solid ${champion ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: champion ? 'var(--accent-primary)' : 'var(--text-muted)'
            }}>
              <Trophy size={40} />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-secondary)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                🏆 Vainqueur du Tournoi
              </div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: champion ? '#fff' : 'var(--text-muted)' }}>
                {champion ? champion.name : 'À déterminer'}
              </h3>
            </div>

            {champion && (
              <div style={{
                background: 'rgba(0, 255, 170, 0.2)',
                color: 'var(--accent-primary)',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 800,
                border: '1px solid rgba(0, 255, 170, 0.4)'
              }}>
                CHAMPION {activeTournament.name}
              </div>
            )}

            {(runnerUp || thirdWinner) && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                width: '100%',
                marginTop: '0.5rem',
                background: 'rgba(0,0,0,0.3)',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '0.8rem'
              }}>
                {runnerUp && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#d1d5db', fontWeight: 700 }}>🥈 2ème</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{runnerUp.name}</span>
                  </div>
                )}
                {thirdWinner && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>🥉 3ème</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{thirdWinner.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Summary Table: Qualifiers / Participants Reference */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} color="var(--accent-primary)" />
            {isFinalLaunched ? 'Joueurs Qualifiés pour le Tableau Final' : 'Classement Actuel & Qualifiés Provisoires'}
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Les {numQualifiers} premiers avancent en phases finales
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
          {ranking.slice(0, numQualifiers).map((p, idx) => {
            const playerObj = players[p.id];
            return (
              <div
                key={p.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(0, 255, 170, 0.3)',
                  borderRadius: '10px',
                  padding: '0.8rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8rem'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(0, 255, 170, 0.15)',
                  color: 'var(--accent-primary)',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  #{idx + 1}
                </div>

                <img
                  src={playerObj?.avatarUrl}
                  alt={p.name}
                  style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }}
                />

                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {p.name}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: (isFinalLaunched || isQualifAllDone || p.isSure)
                        ? 'rgba(0, 255, 170, 0.2)'
                        : 'rgba(255, 204, 0, 0.15)',
                      color: (isFinalLaunched || isQualifAllDone || p.isSure)
                        ? 'var(--accent-primary)'
                        : '#ffcc00',
                      border: `1px solid ${(isFinalLaunched || isQualifAllDone || p.isSure) ? 'rgba(0, 255, 170, 0.4)' : 'rgba(255, 204, 0, 0.3)'}`,
                      flexShrink: 0
                    }}>
                      {(isFinalLaunched || isQualifAllDone || p.isSure) ? '✓ Assuré' : 'Provisoire'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {p.pts} pts • diff {p.sf - p.sa > 0 ? `+${p.sf - p.sa}` : p.sf - p.sa}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default TournamentBracketView;
