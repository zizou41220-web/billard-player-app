import { Tournament, Match, Table } from '../types';
import { isFinalStageMatch } from './bracket';

export type PlayerScheduleContext = {
  id: string;
  name: string;
  poolName?: string;
  played: number; // Nombre de matchs terminés
  won: number;
  lost: number;
  tied: number;
  pts: number;
  sf: number; // Sets / manches pour
  sa: number; // Sets / manches contre
  remaining: number; // Nombre de matchs restants prévus
  totalMatches: number;
  maxPossiblePts: number;
  isSure: boolean; // Mathématiquement qualifié (garanti dans le top qualifiés)
  isEliminated: boolean; // Mathématiquement éliminé (ne peut plus atteindre les places qualificatives)
  inContention: boolean; // En course pour la qualification (!isSure && !isEliminated)
  lastMatchEndTime: number; // Timestamp du dernier match terminé (pour temps de repos)
};

export type MatchStakeLevel = 'final_stage' | 'decisive' | 'qualification' | 'ranking' | 'dead_rubber' | 'standard';

export type MatchStakeInfo = {
  matchId: string;
  level: MatchStakeLevel;
  score: number; // Score de priorité numérique pour l'ordonnancement
  label: string;
  description: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
  p1Played: number;
  p2Played: number;
  maxPlayed: number;
  diffPlayed: number;
};

export type TournamentScheduleContext = {
  playerContextMap: Record<string, PlayerScheduleContext>;
  isFinalStageActive: boolean;
  isLateStage: boolean;
  numQualifiers: number;
  qualPerPool: number;
  isMultiPool: boolean;
  tournamentMatchIndices: Record<string, number>;
  activePlayerIds: Set<string>;
};

/**
 * Calcule le contexte complet du tournoi pour chaque joueur :
 * - Progression (matchs joués, restants)
 * - Statut mathématique : Qualifié d'office (isSure), Éliminé (isEliminated), En course (inContention)
 * - Temps de repos
 */
export function computeTournamentScheduleContext(
  tournament: Tournament | null,
  matches: Record<string, Match>,
  players?: Record<string, { name?: string }>,
  tables?: Record<string, Table>
): TournamentScheduleContext {
  const emptyContext: TournamentScheduleContext = {
    playerContextMap: {},
    isFinalStageActive: false,
    isLateStage: false,
    numQualifiers: 4,
    qualPerPool: 4,
    isMultiPool: false,
    tournamentMatchIndices: {},
    activePlayerIds: new Set<string>()
  };

  if (!tournament) return emptyContext;

  const allTourMatches = (tournament.matches || []).map(id => matches[id]).filter(Boolean);
  const qualifMatches = allTourMatches.filter(m => !isFinalStageMatch(m));
  const finalMatches = allTourMatches.filter(isFinalStageMatch);

  const isFinalStageActive = Boolean(
    tournament.finalStageLaunched ||
    tournament.settings?.finalStageLaunched ||
    finalMatches.length > 0
  );

  const reqQualifiers = tournament.settings?.qualifNbQualifiers || 4;
  const participantsCount = tournament.participants.length;
  const maxAllowedQualifiers = tournament.format !== 'direct_ko' && participantsCount >= 3
    ? participantsCount - 1
    : participantsCount;
  const numQualifiers = participantsCount < 2 ? participantsCount : Math.min(Math.max(2, reqQualifiers), maxAllowedQualifiers);

  const nbPoules = tournament.settings?.qualifNbPoules || 1;
  const isMultiPool = (tournament.format === 'cartesien' || tournament.format === 'robin') && nbPoules > 1;
  const qualPerPool = isMultiPool ? Math.max(1, Math.round(numQualifiers / nbPoules)) : numQualifiers;

  // Repérage des indices originaux de match dans le tournoi
  const tournamentMatchIndices: Record<string, number> = {};
  (tournament.matches || []).forEach((mId, idx) => {
    tournamentMatchIndices[mId] = idx;
  });

  // Repérage des joueurs actuellement occupés sur les billards
  const activePlayerIds = new Set<string>();
  if (tables) {
    Object.values(tables).forEach(t => {
      if (t.currentMatchId) {
        const m = matches[t.currentMatchId];
        if (m && m.status !== 'finished') {
          if (m.player1Id) activePlayerIds.add(m.player1Id);
          if (m.player2Id) activePlayerIds.add(m.player2Id);
        }
      }
    });
  }
  allTourMatches.forEach(m => {
    if (m.status === 'playing' || (m.tableId && m.status !== 'finished')) {
      if (m.player1Id) activePlayerIds.add(m.player1Id);
      if (m.player2Id) activePlayerIds.add(m.player2Id);
    }
  });

  // Initialisation stats joueurs
  const playerStats: Record<string, PlayerScheduleContext> = {};
  tournament.participants.forEach(pId => {
    playerStats[pId] = {
      id: pId,
      name: players?.[pId]?.name || 'Inconnu',
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      pts: 0,
      sf: 0,
      sa: 0,
      remaining: 0,
      totalMatches: 0,
      maxPossiblePts: 0,
      isSure: false,
      isEliminated: false,
      inContention: true,
      lastMatchEndTime: 0
    };
  });

  // Calcul du nombre de matchs prévus en qualifications
  qualifMatches.forEach(m => {
    if (playerStats[m.player1Id]) {
      playerStats[m.player1Id].totalMatches++;
      if (m.poolName && !playerStats[m.player1Id].poolName) playerStats[m.player1Id].poolName = m.poolName;
    }
    if (playerStats[m.player2Id]) {
      playerStats[m.player2Id].totalMatches++;
      if (m.poolName && !playerStats[m.player2Id].poolName) playerStats[m.player2Id].poolName = m.poolName;
    }

    if (m.status === 'finished') {
      const p1 = playerStats[m.player1Id];
      const p2 = playerStats[m.player2Id];
      const endT = m.endTime || m.startTime || 0;

      if (p1 && p2) {
        p1.played++;
        p2.played++;
        p1.sf += m.score1;
        p1.sa += m.score2;
        p2.sf += m.score2;
        p2.sa += m.score1;

        if (endT > p1.lastMatchEndTime) p1.lastMatchEndTime = endT;
        if (endT > p2.lastMatchEndTime) p2.lastMatchEndTime = endT;

        if (m.score1 > m.score2) {
          p1.won++;
          p1.pts += 3;
          p2.lost++;
        } else if (m.score2 > m.score1) {
          p2.won++;
          p2.pts += 3;
          p1.lost++;
        } else {
          p1.tied++;
          p2.tied++;
          p1.pts += 1;
          p2.pts += 1;
        }
      }
    }
  });

  // Calcul maxPossiblePts et remaining
  tournament.participants.forEach(pId => {
    const p = playerStats[pId];
    if (p) {
      p.remaining = Math.max(0, p.totalMatches - p.played);
      p.maxPossiblePts = p.pts + p.remaining * 3;
    }
  });

  // Découpage par poule pour l'analyse des qualifications et éliminations
  const playersByPool: Record<string, PlayerScheduleContext[]> = {};
  if (isMultiPool) {
    tournament.participants.forEach(pId => {
      const p = playerStats[pId];
      const poolKey = p.poolName || 'Défaut';
      if (!playersByPool[poolKey]) playersByPool[poolKey] = [];
      playersByPool[poolKey].push(p);
    });
  } else {
    playersByPool['all'] = Object.values(playerStats);
  }

  // Calcul de isSure et isEliminated par poule
  Object.entries(playersByPool).forEach(([, poolPlayers]) => {
    const poolQualTarget = qualPerPool;

    poolPlayers.forEach(p => {
      // 1. Mathématiquement éliminé :
      // Nombre d'autres joueurs de la poule dont les points ACTUELS dépassent strictement le max que p peut atteindre
      const competitorsStrictlyAhead = poolPlayers.filter(
        other => other.id !== p.id && other.pts > p.maxPossiblePts
      ).length;

      // Joueurs avec égalité de points potentiels mais ayant déjà l'avantage de confrontation directe si p n'a plus de matchs
      const competitorsTiedAndBetter = poolPlayers.filter(other => {
        if (other.id === p.id) return false;
        if (other.pts === p.maxPossiblePts && p.remaining === 0) {
          const directMatch = qualifMatches.find(
            m => m.status === 'finished' &&
            ((m.player1Id === other.id && m.player2Id === p.id) || (m.player1Id === p.id && m.player2Id === other.id))
          );
          if (directMatch) {
            return (directMatch.player1Id === other.id && directMatch.score1 > directMatch.score2) ||
                   (directMatch.player2Id === other.id && directMatch.score2 > directMatch.score1);
          }
          return (other.sf - other.sa) > (p.sf - p.sa);
        }
        return false;
      }).length;

      if ((competitorsStrictlyAhead + competitorsTiedAndBetter) >= poolQualTarget) {
        p.isEliminated = true;
      }

      // 2. Mathématiquement qualifié (isSure) :
      // Nombre de concurrents pouvant encore égaler ou battre ses points actuels
      if (p.played > 0 && p.pts > 0) {
        const competitorsWhoCanTieOrBeat = poolPlayers.filter(
          other => other.id !== p.id && other.maxPossiblePts >= p.pts
        ).length;

        if (competitorsWhoCanTieOrBeat < poolQualTarget) {
          p.isSure = true;
        }
      }

      p.inContention = !p.isSure && !p.isEliminated;
    });
  });

  const totalQualifCount = qualifMatches.length;
  const finishedQualifCount = qualifMatches.filter(m => m.status === 'finished').length;
  const qualifProgress = totalQualifCount > 0 ? finishedQualifCount / totalQualifCount : 0;
  const hasAnyEliminated = Object.values(playerStats).some(p => p.isEliminated);
  const hasAnySure = Object.values(playerStats).some(p => p.isSure);

  // Nous sommes en phase décisive / fin de poule dès qu'un joueur est qualifié/éliminé ou qu'on dépasse 35% des matchs
  const isLateStage = qualifProgress >= 0.35 || hasAnyEliminated || hasAnySure;

  return {
    playerContextMap: playerStats,
    isFinalStageActive,
    isLateStage,
    numQualifiers,
    qualPerPool,
    isMultiPool,
    tournamentMatchIndices,
    activePlayerIds
  };
}

/**
 * Détermine l'enjeu et la priorité d'un match selon le statut des 2 joueurs :
 * - Final Stage (arbre éliminatoire) : priorité maximale (100)
 * - Match Décisif (les 2 joueurs jouent leur qualification) : priorité haute (40)
 * - Enjeu Qualification (1 joueur joue sa qualification contre un qualifié ou un éliminé) : priorité moyenne-haute (30)
 * - Choc des Têtes de Série (les 2 joueurs sont déjà qualifiés) : priorité moyenne (20)
 * - Match pour l'Honneur (les 2 joueurs sont déjà éliminés) : priorité basse (5)
 */
export function getMatchStakeInfo(
  match: Match,
  context: TournamentScheduleContext
): MatchStakeInfo {
  const p1 = context.playerContextMap[match.player1Id];
  const p2 = context.playerContextMap[match.player2Id];

  const p1Played = p1?.played || 0;
  const p2Played = p2?.played || 0;
  const maxPlayed = Math.max(p1Played, p2Played);
  const diffPlayed = Math.abs(p1Played - p2Played);

  // Phase finale / tableau éliminatoire direct
  if (isFinalStageMatch(match)) {
    const roundOffset = match.bracketRound ? Math.max(0, 10 - match.bracketRound) : 5;
    return {
      matchId: match.id,
      level: 'final_stage',
      score: 100 + roundOffset,
      label: '🏆 Phase Finale',
      description: 'Match du tableau éliminatoire',
      badgeBg: 'rgba(255, 215, 0, 0.16)',
      badgeBorder: 'rgba(255, 215, 0, 0.45)',
      badgeColor: '#ffd700',
      p1Played,
      p2Played,
      maxPlayed,
      diffPlayed
    };
  }

  // Si les deux joueurs sont éliminés -> MATCH POUR L'HONNEUR (Dead Rubber)
  // RÈGLE ABSOLUE : Ce match ne doit JAMAIS être proposé avant un match avec enjeu qualificatif !
  if (p1?.isEliminated && p2?.isEliminated) {
    return {
      matchId: match.id,
      level: 'dead_rubber',
      score: 5,
      label: "💤 Pour l'honneur",
      description: 'Match sans enjeu de qualification (joueurs déjà éliminés)',
      badgeBg: 'rgba(148, 163, 184, 0.12)',
      badgeBorder: 'rgba(148, 163, 184, 0.3)',
      badgeColor: '#94a3b8',
      p1Played,
      p2Played,
      maxPlayed,
      diffPlayed
    };
  }

  // Si les deux joueurs sont déjà mathématiquement qualifiés
  if (p1?.isSure && p2?.isSure) {
    return {
      matchId: match.id,
      level: 'ranking',
      score: 20,
      label: '👑 Têtes de Série',
      description: 'Choc pour la 1ère place de poule (déjà qualifiés)',
      badgeBg: 'rgba(245, 158, 11, 0.18)',
      badgeBorder: 'rgba(245, 158, 11, 0.45)',
      badgeColor: '#fbbf24',
      p1Played,
      p2Played,
      maxPlayed,
      diffPlayed
    };
  }

  // Si l'un des joueurs est en course et l'autre est qualifié ou éliminé
  if ((p1?.inContention && !p2?.inContention) || (p2?.inContention && !p1?.inContention)) {
    const contenderName = p1?.inContention ? p1.name : p2?.name;
    return {
      matchId: match.id,
      level: 'qualification',
      score: 30,
      label: '🎯 Enjeu Qualif',
      description: `Match décisif pour la qualification de ${contenderName || 'un joueur'}`,
      badgeBg: 'rgba(14, 165, 233, 0.18)',
      badgeBorder: 'rgba(14, 165, 233, 0.45)',
      badgeColor: '#38bdf8',
      p1Played,
      p2Played,
      maxPlayed,
      diffPlayed
    };
  }

  // Si les deux joueurs sont en course pour la qualification :
  // En fin de poule / phase décisive : Match Décisif (Couperet direct)
  if (context.isLateStage && p1?.inContention && p2?.inContention) {
    return {
      matchId: match.id,
      level: 'decisive',
      score: 40,
      label: '🔥 Match Décisif',
      description: 'Duel direct pour décrocher une place en phase finale',
      badgeBg: 'rgba(239, 68, 68, 0.18)',
      badgeBorder: 'rgba(239, 68, 68, 0.5)',
      badgeColor: '#ef4444',
      p1Played,
      p2Played,
      maxPlayed,
      diffPlayed
    };
  }

  // Début de tournoi / match régulier de poule
  return {
    matchId: match.id,
    level: 'standard',
    score: 25,
    label: match.poolName ? `${match.poolName}` : 'Poule',
    description: 'Match de phase de poule',
    badgeBg: 'rgba(0, 255, 204, 0.12)',
    badgeBorder: 'rgba(0, 255, 204, 0.3)',
    badgeColor: 'var(--accent-primary, #00ffcc)',
    p1Played,
    p2Played,
    maxPlayed,
    diffPlayed
  };
}

/**
 * Compare deux matchs pour déterminer lequel doit être proposé et assigné en premier.
 * Ordre de priorité :
 * 1. Phase finale active (les matchs de phase finale passent avant les poules non jouées)
 * 2. Arbre éliminatoire : Tours précédents avant tours suivants (1/8 avant 1/4)
 * 3. Enjeu de qualification vers la fin du tournoi :
 *    - Un match éliminé vs éliminé (dead_rubber) ne doit JAMAIS passer avant un match avec enjeu !
 *    - En phase décisive, les duels directs (décisifs) et enjeux qualifs passent en premier
 * 4. Équité et rotation des joueurs (Fairness) :
 *    - Privilégier les matchs où le max de matchs joués est le plus faible (Math.max(p1, p2))
 *    - Privilégier le total de matchs joués le plus faible (p1 + p2)
 *    - Privilégier la parité (Math.abs(p1 - p2) minimal)
 * 5. Temps de repos des joueurs :
 *    - Donner priorité aux joueurs qui ont attendu le plus longtemps (repos mérité)
 * 6. Ordre original du tournoi (préservation de la cohérence)
 */
export function compareMatchesForScheduling(
  ma: Match,
  mb: Match,
  context: TournamentScheduleContext
): number {
  const isFinalA = isFinalStageMatch(ma);
  const isFinalB = isFinalStageMatch(mb);

  // 1. Si la phase finale est lancée, les matchs de phase finale sont prioritaires
  if (context.isFinalStageActive) {
    if (isFinalA !== isFinalB) return isFinalA ? -1 : 1;
  }

  // 2. Si les deux sont en phase finale, respecter l'ordre des tours de l'arbre
  if (isFinalA && isFinalB) {
    if (ma.bracketRound !== undefined && mb.bracketRound !== undefined && ma.bracketRound !== mb.bracketRound) {
      return ma.bracketRound - mb.bracketRound;
    }
    if (ma.bracketPosition !== undefined && mb.bracketPosition !== undefined && ma.bracketPosition !== mb.bracketPosition) {
      return ma.bracketPosition - mb.bracketPosition;
    }
  }

  // 3. Calcul des enjeux et des statuts de qualification
  const stakeA = getMatchStakeInfo(ma, context);
  const stakeB = getMatchStakeInfo(mb, context);

  // RÈGLE CARDINALE DEMANDÉE PAR L'UTILISATEUR :
  // Un match entre 2 joueurs éliminés (dead_rubber) ne doit JAMAIS être proposé avant un match avec enjeu !
  const isDeadRubberA = stakeA.level === 'dead_rubber';
  const isDeadRubberB = stakeB.level === 'dead_rubber';
  if (isDeadRubberA !== isDeadRubberB) {
    return isDeadRubberA ? 1 : -1;
  }

  // En phase avancée/décisive du tournoi (isLateStage) :
  // Priorité absolue aux matchs décisifs et aux enjeux de qualification sur les matchs sans enjeu
  if (context.isLateStage && stakeA.score !== stakeB.score) {
    return stakeB.score - stakeA.score;
  }

  // 4. ÉQUITÉ ET ROTATION DES JOUEURS (Fairness) :
  // Critère A : Miniser le maximum de matchs joués par joueur dans le duel
  // Exemple : (1 match, 1 match) passe avant (0 match, 2 matchs) pour ne pas creuser l'écart
  if (stakeA.maxPlayed !== stakeB.maxPlayed) {
    return stakeA.maxPlayed - stakeB.maxPlayed;
  }

  // Critère B : Total de matchs joués le plus faible (faire jouer les joueurs qui ont le moins joué)
  const totalPlayedA = stakeA.p1Played + stakeA.p2Played;
  const totalPlayedB = stakeB.p1Played + stakeB.p2Played;
  if (totalPlayedA !== totalPlayedB) {
    return totalPlayedA - totalPlayedB;
  }

  // Critère C : Parité entre les deux adversaires (différence minimale)
  if (stakeA.diffPlayed !== stakeB.diffPlayed) {
    return stakeA.diffPlayed - stakeB.diffPlayed;
  }

  // 5. TEMPS DE REPOS DES JOUEURS (Cooldown) :
  // Éviter de faire enchaîner immédiatement un joueur qui vient de finir sa partie
  // On compare l'heure de fin du match le plus récent parmi les 2 joueurs
  const p1AContext = context.playerContextMap[ma.player1Id];
  const p2AContext = context.playerContextMap[ma.player2Id];
  const p1BContext = context.playerContextMap[mb.player1Id];
  const p2BContext = context.playerContextMap[mb.player2Id];

  const recentFinishA = Math.max(p1AContext?.lastMatchEndTime || 0, p2AContext?.lastMatchEndTime || 0);
  const recentFinishB = Math.max(p1BContext?.lastMatchEndTime || 0, p2BContext?.lastMatchEndTime || 0);

  if (recentFinishA !== recentFinishB) {
    // Le match dont les joueurs ont fini le plus tôt (ou n'ont pas encore joué = 0) est prioritaire
    return recentFinishA - recentFinishB;
  }

  // 6. Ordre originel dans la liste du tournoi
  const idxA = context.tournamentMatchIndices[ma.id] ?? 999999;
  const idxB = context.tournamentMatchIndices[mb.id] ?? 999999;
  return idxA - idxB;
}

/**
 * Trie une liste de matchs pour la file d'attente ou pour l'auto-assignation
 */
export function sortTournamentMatchesForScheduling(
  matchList: Match[],
  context: TournamentScheduleContext
): Match[] {
  return [...matchList].sort((a, b) => compareMatchesForScheduling(a, b, context));
}
