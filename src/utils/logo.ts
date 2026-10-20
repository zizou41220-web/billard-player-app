import defaultClubLogo from '../assets/logo.png';

export { defaultClubLogo };

/**
 * Résout de façon robuste l'URL du logo du club.
 * Évite les erreurs 404 sur GitHub Pages (/billard-player-app/ vs /logo.png).
 */
export function getClubLogoUrl(logoUrl?: string | null): string {
  if (!logoUrl) return defaultClubLogo;
  const cleaned = logoUrl.trim();
  const lower = cleaned.toLowerCase();

  // Si le chemin fait référence au logo par défaut ou au logo local (insensible à la casse)
  if (
    !lower ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === '/logo.png' ||
    lower === 'logo.png' ||
    lower === './logo.png' ||
    lower.includes('logo.png') ||
    lower.includes('logo_club') ||
    lower.includes('billard club') ||
    lower === '/logo' ||
    lower === 'logo'
  ) {
    return defaultClubLogo;
  }

  // Si c'est un chemin absolu commençant par / mais hébergé sous un sous-dossier (GitHub Pages)
  if (cleaned.startsWith('/') && !cleaned.startsWith('//') && !cleaned.startsWith('http')) {
    return cleaned.slice(1);
  }
  return cleaned;
}
