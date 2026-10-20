import { Match, Tournament } from '../types';

export interface MatchScoringRules {
  maxSets: number;
  isWinningSets: boolean;
  minScore1: number;
  minScore2: number;
  formatLabel: string;
}

/**
 * Calcule le handicap maximum admissible pour éviter qu'un joueur l'emporte d'office
 * (ex: 1 manche gagnante avec +1 manche d'avance = match déjà gagné à 1-0).
 */
export function getMaxAllowedHandicap(
  qualifNbSets: number,
  qualifIsWinningSets: boolean,
  finalNbSets: number,
  finalIsWinningSets: boolean,
  isDirectKo: boolean = false
): number {
  let maxAllowed = 3;

  if (!isDirectKo && qualifIsWinningSets) {
    maxAllowed = Math.min(maxAllowed, Math.max(0, qualifNbSets - 1));
  }

  if (finalIsWinningSets) {
    maxAllowed = Math.min(maxAllowed, Math.max(0, finalNbSets - 1));
  }

  return maxAllowed;
}

/**
 * Récupère les règles précises de scoring pour un match donné selon les réglages du tournoi.
 */
export function getMatchScoringRules(match: Match, tournament?: Tournament | null): MatchScoringRules {
  const isFinal = match.stage === 'quarter' || match.stage === 'semi' || match.stage === 'final' || match.stage === 'third_place';
  const settings = tournament?.settings;

  const maxSets = settings ? (isFinal ? settings.finalNbSets : settings.qualifNbSets) : 99;
  const isWinningSets = settings ? (isFinal ? settings.finalIsWinningSets : settings.qualifIsWinningSets) : true;
  const minScore1 = match.handicapP1 || 0;
  const minScore2 = match.handicapP2 || 0;

  const formatLabel = isWinningSets
    ? `${maxSets} manche${maxSets > 1 ? 's' : ''} gagnante${maxSets > 1 ? 's' : ''}`
    : `${maxSets} manche${maxSets > 1 ? 's' : ''} fixe${maxSets > 1 ? 's' : ''}`;

  return { maxSets, isWinningSets, minScore1, minScore2, formatLabel };
}

/**
 * Ajuste et borne strictement les scores d'un match conformément aux règles configurées.
 */
export function clampMatchScores(
  targetScore1: number,
  targetScore2: number,
  currentScore1: number,
  currentScore2: number,
  rules: MatchScoringRules,
  player1Id?: string,
  player2Id?: string
): { score1: number; score2: number; isFinished: boolean; winnerId?: string } {
  const { maxSets, isWinningSets, minScore1, minScore2 } = rules;

  // 1. Ne jamais descendre sous le score minimum (handicap de départ)
  let s1 = Math.max(minScore1, targetScore1);
  let s2 = Math.max(minScore2, targetScore2);

  if (isWinningSets) {
    // En manches gagnantes : aucun joueur ne peut dépasser maxSets
    s1 = Math.min(s1, maxSets);
    s2 = Math.min(s2, maxSets);

    // Si l'un des joueurs a atteint maxSets, le match est plié :
    // l'autre joueur ne peut pas continuer à marquer des points
    if (s1 === maxSets && s2 >= maxSets) {
      if (currentScore1 === maxSets) {
        s2 = Math.min(currentScore2, maxSets - 1);
      } else {
        s1 = Math.min(currentScore1, maxSets - 1);
      }
    }
  } else {
    // En manches fixes : la somme des manches jouées ne peut dépasser maxSets
    const total = s1 + s2;
    if (total > maxSets) {
      if (s1 > currentScore1) {
        // Le joueur 1 vient de marquer -> on le plafonne au reste disponible
        s1 = Math.min(s1, Math.max(minScore1, maxSets - s2));
      } else if (s2 > currentScore2) {
        // Le joueur 2 vient de marquer -> on le plafonne au reste disponible
        s2 = Math.min(s2, Math.max(minScore2, maxSets - s1));
      } else {
        // Ajustement forcé
        s1 = Math.min(s1, maxSets - minScore2);
        s2 = Math.min(s2, maxSets - s1);
      }
    }
  }

  const isFinished = isWinningSets
    ? (s1 >= maxSets || s2 >= maxSets)
    : ((s1 + s2) >= maxSets);

  let winnerId: string | undefined = undefined;
  if (isFinished && player1Id && player2Id) {
    if (s1 > s2) winnerId = player1Id;
    else if (s2 > s1) winnerId = player2Id;
  }

  return { score1: s1, score2: s2, isFinished, winnerId };
}
