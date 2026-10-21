import { Match, Tournament } from '../types';

export interface MatchScoringRules {
  maxSets: number;
  isWinningSets: boolean;
  minScore1: number;
  minScore2: number;
  formatLabel: string;
}

/**
 * Calcule le handicap maximum admissible pour les qualifications
 */
export function getMaxAllowedQualifHandicap(qualifNbSets: number, qualifIsWinningSets: boolean): number {
  return qualifIsWinningSets ? Math.max(0, qualifNbSets - 1) : 3;
}

/**
 * Calcule le handicap maximum admissible pour les phases finales
 */
export function getMaxAllowedFinalHandicap(finalNbSets: number, finalIsWinningSets: boolean): number {
  return finalIsWinningSets ? Math.max(0, finalNbSets - 1) : 3;
}

/**
 * Récupère le handicap configuré pour une phase spécifique (Qualifications, Phases Finales, Grande Finale ou Petite Finale).
 */
export function getTournamentPhaseHandicap(
  settings?: any | null,
  isFinalStage: boolean = false,
  stage?: string
): number {
  if (!settings) return 0;

  const isGrandFinal = stage === 'final' || (typeof stage === 'string' && stage.includes('_final_') && !stage.includes('_third_place_'));
  const isThirdPlace = stage === 'third_place' || (typeof stage === 'string' && stage.includes('_third_place_'));

  if (isGrandFinal && settings.grandFinalCustom) {
    if (settings.grandFinalHandicapAmateurSets !== undefined) return settings.grandFinalHandicapAmateurSets;
    return settings.finalHandicapAmateurSets ?? 0;
  }
  if (isThirdPlace && settings.thirdPlaceCustom) {
    if (settings.thirdPlaceHandicapAmateurSets !== undefined) return settings.thirdPlaceHandicapAmateurSets;
    return settings.finalHandicapAmateurSets ?? 0;
  }

  if (isFinalStage || isGrandFinal || isThirdPlace) {
    if (settings.finalHandicapAmateurSets !== undefined) return settings.finalHandicapAmateurSets;
    return settings.handicapAmateurSets || 0;
  } else {
    if (settings.qualifHandicapAmateurSets !== undefined) return settings.qualifHandicapAmateurSets;
    return settings.handicapAmateurSets || 0;
  }
}

/**
 * Retourne le type de manche (gagnantes/fixes) et le handicap pour une phase ou affiche spécifique.
 */
export function getPhaseRules(settings?: any | null, stage?: string): { isWinningSets: boolean; handicap: number } {
  if (!settings) return { isWinningSets: true, handicap: 0 };
  const isGrandFinal = stage === 'final' || (typeof stage === 'string' && stage.includes('_final_') && !stage.includes('_third_place_'));
  const isThirdPlace = stage === 'third_place' || (typeof stage === 'string' && stage.includes('_third_place_'));
  const isFinalStage = isGrandFinal || isThirdPlace || stage === 'semi' || stage === 'quarter' || (typeof stage === 'string' && (stage.startsWith('round_') || stage.includes('_semi_') || stage.includes('_quarter_')));

  if (isGrandFinal && settings.grandFinalCustom) {
    return {
      isWinningSets: settings.grandFinalIsWinningSets ?? settings.finalIsWinningSets ?? true,
      handicap: settings.grandFinalHandicapAmateurSets !== undefined ? settings.grandFinalHandicapAmateurSets : (settings.finalHandicapAmateurSets ?? 0)
    };
  }
  if (isThirdPlace && settings.thirdPlaceCustom) {
    return {
      isWinningSets: settings.thirdPlaceIsWinningSets ?? settings.finalIsWinningSets ?? true,
      handicap: settings.thirdPlaceHandicapAmateurSets !== undefined ? settings.thirdPlaceHandicapAmateurSets : (settings.finalHandicapAmateurSets ?? 0)
    };
  }
  if (isFinalStage) {
    return {
      isWinningSets: settings.finalIsWinningSets ?? true,
      handicap: settings.finalHandicapAmateurSets ?? settings.handicapAmateurSets ?? 0
    };
  }
  return {
    isWinningSets: settings.qualifIsWinningSets ?? true,
    handicap: settings.qualifHandicapAmateurSets ?? settings.handicapAmateurSets ?? 0
  };
}

/**
 * Calcule le handicap maximum admissible pour éviter qu'un joueur l'emporte d'office
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
 * Résout le nombre de manches prévu pour une affiche selon les niveaux des 2 joueurs
 * (Amateur vs Amateur, Prestige vs Prestige, Amateur vs Prestige).
 */
export function resolveDuelTargetSets(
  level1?: string,
  level2?: string,
  settings?: any | null,
  isFinalStage: boolean = false,
  stage?: string
): number {
  if (!settings) return 1;
  const isP1Prestige = level1 === 'Prestige';
  const isP2Prestige = level2 === 'Prestige';

  const isGrandFinal = stage === 'final' || (typeof stage === 'string' && stage.includes('_final_') && !stage.includes('_third_place_'));
  const isThirdPlace = stage === 'third_place' || (typeof stage === 'string' && stage.includes('_third_place_'));

  // Configuration spécifique Grande Finale
  if (isGrandFinal && settings.grandFinalCustom) {
    if (isP1Prestige && isP2Prestige) {
      const val = settings.grandFinalNbSetsPrestige;
      if (val && val > 0) return val;
    } else if (!isP1Prestige && !isP2Prestige) {
      const val = settings.grandFinalNbSetsAmateur;
      if (val && val > 0) return val;
    } else {
      const val = settings.grandFinalNbSetsMixed;
      if (val && val > 0) return val;
    }
    if (settings.grandFinalNbSets && settings.grandFinalNbSets > 0) {
      return settings.grandFinalNbSets;
    }
  }

  // Configuration spécifique Petite Finale (3ème place)
  if (isThirdPlace && settings.thirdPlaceCustom) {
    if (isP1Prestige && isP2Prestige) {
      const val = settings.thirdPlaceNbSetsPrestige;
      if (val && val > 0) return val;
    } else if (!isP1Prestige && !isP2Prestige) {
      const val = settings.thirdPlaceNbSetsAmateur;
      if (val && val > 0) return val;
    } else {
      const val = settings.thirdPlaceNbSetsMixed;
      if (val && val > 0) return val;
    }
    if (settings.thirdPlaceNbSets && settings.thirdPlaceNbSets > 0) {
      return settings.thirdPlaceNbSets;
    }
  }

  // Phase finale standard ou qualifications
  const effectiveFinalStage = isFinalStage || isGrandFinal || isThirdPlace;

  if (isP1Prestige && isP2Prestige) {
    const val = effectiveFinalStage ? settings.finalNbSetsPrestige : settings.qualifNbSetsPrestige;
    return val && val > 0 ? val : (effectiveFinalStage ? settings.finalNbSets : settings.qualifNbSets);
  }
  if (!isP1Prestige && !isP2Prestige) {
    const val = effectiveFinalStage ? settings.finalNbSetsAmateur : settings.qualifNbSetsAmateur;
    return val && val > 0 ? val : (effectiveFinalStage ? settings.finalNbSets : settings.qualifNbSets);
  }
  const val = effectiveFinalStage ? settings.finalNbSetsMixed : settings.qualifNbSetsMixed;
  return val && val > 0 ? val : (effectiveFinalStage ? settings.finalNbSets : settings.qualifNbSets);
}

/**
 * Récupère les règles précises de scoring pour un match donné selon les réglages du tournoi et les niveaux des joueurs.
 */
export function getMatchScoringRules(
  match: Match,
  tournament?: Tournament | null,
  players?: Record<string, { level?: string }>
): MatchScoringRules {
  const stage = match.stage || (match.id.includes('_third_place_') ? 'third_place' : (match.id.includes('_final_') ? 'final' : undefined));
  const isGrandFinal = stage === 'final';
  const isThirdPlace = stage === 'third_place';
  const isFinal = isGrandFinal || isThirdPlace || match.stage === 'quarter' || match.stage === 'semi' || (match.bracketRound !== undefined);
  const settings = tournament?.settings;

  let maxSets = match.targetSets || 0;
  if (!maxSets || maxSets <= 0) {
    if (players && match.player1Id && match.player2Id) {
      const p1 = players[match.player1Id];
      const p2 = players[match.player2Id];
      maxSets = resolveDuelTargetSets(p1?.level, p2?.level, settings, isFinal, stage);
    } else {
      if (isGrandFinal && settings?.grandFinalCustom) {
        maxSets = settings.grandFinalNbSetsMixed || settings.grandFinalNbSets || settings.finalNbSets || 3;
      } else if (isThirdPlace && settings?.thirdPlaceCustom) {
        maxSets = settings.thirdPlaceNbSetsMixed || settings.thirdPlaceNbSets || settings.finalNbSets || 3;
      } else {
        maxSets = settings ? (isFinal ? settings.finalNbSets : settings.qualifNbSets) : 99;
      }
    }
  }

  let isWinningSets = true;
  if (settings) {
    if (isGrandFinal && settings.grandFinalCustom && settings.grandFinalIsWinningSets !== undefined) {
      isWinningSets = settings.grandFinalIsWinningSets;
    } else if (isThirdPlace && settings.thirdPlaceCustom && settings.thirdPlaceIsWinningSets !== undefined) {
      isWinningSets = settings.thirdPlaceIsWinningSets;
    } else if (isFinal) {
      isWinningSets = settings.finalIsWinningSets;
    } else {
      isWinningSets = settings.qualifIsWinningSets;
    }
  }

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
