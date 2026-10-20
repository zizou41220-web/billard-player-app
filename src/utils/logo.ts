import defaultClubLogo from '../assets/logo.png';

export { defaultClubLogo };

/**
 * Résout de façon robuste l'URL du logo du club.
 * Évite les erreurs 404 sur GitHub Pages (/billard-player-app/ vs /logo.png).
 */
export function getClubLogoUrl(logoUrl?: string | null): string {
  if (!logoUrl || logoUrl === '/logo.png' || logoUrl === 'logo.png' || logoUrl === './logo.png') {
    return defaultClubLogo;
  }
  // Si le chemin fait référence au logo local
  if (logoUrl.includes('logo.png') || logoUrl.includes('logo_club_41')) {
    return defaultClubLogo;
  }
  // Si c'est un chemin absolu commençant par / mais hébergé sous un sous-dossier (GitHub Pages)
  if (logoUrl.startsWith('/') && !logoUrl.startsWith('//') && !logoUrl.startsWith('http')) {
    return logoUrl.slice(1);
  }
  return logoUrl;
}
