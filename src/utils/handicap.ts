import { PlayerLevel } from '../types';

export function isPlayerPrestige(level?: PlayerLevel | string): boolean {
  return level === 'Prestige' || level === 'Confirmé';
}

export function formatPlayerLevel(level?: PlayerLevel | string): string {
  if (isPlayerPrestige(level)) return 'Prestige';
  return 'Amateur';
}

export function getMatchHandicap(
  p1Level: PlayerLevel | string | undefined,
  p2Level: PlayerLevel | string | undefined,
  handicapAmateurSets: number = 0,
  maxAllowedHandicap?: number
): { h1: number; h2: number } {
  let effectiveHandicap = handicapAmateurSets;
  if (maxAllowedHandicap !== undefined) {
    effectiveHandicap = Math.min(effectiveHandicap, Math.max(0, maxAllowedHandicap));
  }

  if (!effectiveHandicap || effectiveHandicap <= 0) {
    return { h1: 0, h2: 0 };
  }

  const p1Prestige = isPlayerPrestige(p1Level);
  const p2Prestige = isPlayerPrestige(p2Level);

  // If Amateur vs Prestige -> Amateur gets handicap
  if (!p1Prestige && p2Prestige) {
    return { h1: effectiveHandicap, h2: 0 };
  }
  // If Prestige vs Amateur -> Amateur gets handicap
  if (p1Prestige && !p2Prestige) {
    return { h1: 0, h2: effectiveHandicap };
  }

  // Same level (Amateur vs Amateur or Prestige vs Prestige) -> no handicap
  return { h1: 0, h2: 0 };
}
