/**
 * Utilitaire de gestion des avatars joueurs.
 * Remplace les photos de personnes réelles (Pravatar) par une figurine stylisée de joueur de billard
 * pour tous les joueurs créés sans photo personnalisée.
 */

export interface FigurineTheme {
  name: string;
  bgGradStart: string;
  bgGradEnd: string;
  rimColor: string;
  vestColor: string;
  vestShade: string;
  vestHighlight: string;
  bowtieColor: string;
  accentGlow: string;
}

const FIGURINE_THEMES: FigurineTheme[] = [
  {
    name: 'Émeraude Club',
    bgGradStart: '#064e3b',
    bgGradEnd: '#022c22',
    rimColor: '#10b981',
    vestColor: '#059669',
    vestShade: '#064e3b',
    vestHighlight: '#34d399',
    bowtieColor: '#f59e0b',
    accentGlow: 'rgba(16, 185, 129, 0.4)'
  },
  {
    name: 'Prestige Gold',
    bgGradStart: '#78350f',
    bgGradEnd: '#451a03',
    rimColor: '#f59e0b',
    vestColor: '#b45309',
    vestShade: '#78350f',
    vestHighlight: '#fbbf24',
    bowtieColor: '#10b981',
    accentGlow: 'rgba(245, 158, 11, 0.4)'
  },
  {
    name: 'Bleu Royal',
    bgGradStart: '#1e3a8a',
    bgGradEnd: '#0f172a',
    rimColor: '#3b82f6',
    vestColor: '#2563eb',
    vestShade: '#1e3a8a',
    vestHighlight: '#60a5fa',
    bowtieColor: '#f59e0b',
    accentGlow: 'rgba(59, 130, 246, 0.4)'
  },
  {
    name: 'Onyx Tuxedo',
    bgGradStart: '#1e293b',
    bgGradEnd: '#090d16',
    rimColor: '#94a3b8',
    vestColor: '#334155',
    vestShade: '#0f172a',
    vestHighlight: '#64748b',
    bowtieColor: '#f43f5e',
    accentGlow: 'rgba(148, 163, 184, 0.4)'
  },
  {
    name: 'Rubis Intense',
    bgGradStart: '#881337',
    bgGradEnd: '#4c0519',
    rimColor: '#f43f5e',
    vestColor: '#e11d48',
    vestShade: '#881337',
    vestHighlight: '#fb7185',
    bowtieColor: '#f59e0b',
    accentGlow: 'rgba(244, 63, 94, 0.4)'
  },
  {
    name: 'Sarcelle Lagon',
    bgGradStart: '#134e4a',
    bgGradEnd: '#042f2e',
    rimColor: '#14b8a6',
    vestColor: '#0d9488',
    vestShade: '#134e4a',
    vestHighlight: '#2dd4bf',
    bowtieColor: '#fbbf24',
    accentGlow: 'rgba(20, 184, 166, 0.4)'
  }
];

function getThemeForSeed(seed?: string): FigurineTheme {
  if (!seed) return FIGURINE_THEMES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % FIGURINE_THEMES.length;
  return FIGURINE_THEMES[index];
}

/**
 * Génère une figurine SVG élégante représentant un joueur de billard en miniature/figurine de collection.
 * 100% vectoriel, offline, pas de photo de personne réelle.
 */
export function generateFigurineSvg(seed?: string, name?: string): string {
  const theme = getThemeForSeed(seed || name);
  const initials = (name || '')
    .trim()
    .split(/\s+/)
    .map(p => p[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${theme.bgGradStart}" />
      <stop offset="100%" stop-color="${theme.bgGradEnd}" />
    </radialGradient>

    <!-- Figurine Head 3D Lighting -->
    <radialGradient id="headGrad" cx="38%" cy="32%" r="65%">
      <stop offset="0%" stop-color="#fff1e6" />
      <stop offset="45%" stop-color="#fed7aa" />
      <stop offset="85%" stop-color="#fba86b" />
      <stop offset="100%" stop-color="#d97706" />
    </radialGradient>

    <!-- Glossy Specular Highlight on Head -->
    <linearGradient id="glossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>

    <!-- Vest 3D Gradient -->
    <linearGradient id="vestGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${theme.vestHighlight}" />
      <stop offset="35%" stop-color="${theme.vestColor}" />
      <stop offset="100%" stop-color="${theme.vestShade}" />
    </linearGradient>

    <!-- Wood Cue Gradient -->
    <linearGradient id="cueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="30%" stop-color="#d97706" />
      <stop offset="70%" stop-color="#92400e" />
      <stop offset="100%" stop-color="#451a03" />
    </linearGradient>

    <!-- 8-Ball Radial Gradient -->
    <radialGradient id="ballGrad" cx="35%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#475569" />
      <stop offset="40%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </radialGradient>

    <!-- Drop Shadow Filter -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.5" />
    </filter>

    <clipPath id="circleClip">
      <circle cx="64" cy="64" r="60" />
    </clipPath>
  </defs>

  <!-- Outer Ring with Rim Lighting -->
  <circle cx="64" cy="64" r="62" fill="#0b0f19" stroke="${theme.rimColor}" stroke-width="2.5" />

  <!-- Clipped Figurine Content -->
  <g clip-path="url(#circleClip)">
    <!-- Background Circle -->
    <circle cx="64" cy="64" r="60" fill="url(#bgGrad)" />

    <!-- Subtle Ambient Glow -->
    <circle cx="64" cy="20" r="45" fill="${theme.rimColor}" opacity="0.12" />

    <!-- Billiard Cue (Queue de billard) in background -->
    <g transform="rotate(-38 64 64)" filter="url(#shadow)">
      <!-- Cue Shaft -->
      <rect x="61" y="-20" width="6" height="168" rx="2" fill="url(#cueGrad)" />
      <!-- Leather / Grip segment -->
      <rect x="61" y="85" width="6" height="35" fill="#18181b" />
      <rect x="61.5" y="86" width="5" height="2" fill="#fbbf24" opacity="0.8" />
      <rect x="61.5" y="118" width="5" height="2" fill="#fbbf24" opacity="0.8" />
      <!-- Brass Ferrule -->
      <rect x="61" y="-8" width="6" height="4" fill="#fbbf24" />
      <!-- Blue Chalk Tip (Procédé bleu) -->
      <rect x="61" y="-12" width="6" height="4" rx="1" fill="#38bdf8" />
    </g>

    <!-- Figurine Bust (Buste de la figurine) -->
    <g filter="url(#shadow)">
      <!-- Neck / Cou -->
      <rect x="58" y="70" width="12" height="15" rx="3" fill="#fed7aa" />
      <rect x="58" y="76" width="12" height="6" fill="#fba86b" opacity="0.4" />

      <!-- White Shirt Collar / Col de chemise blanche -->
      <path d="M 44 86 L 64 102 L 84 86 L 78 82 L 64 92 L 50 82 Z" fill="#ffffff" />

      <!-- Bowtie (Nœud papillon élégant) -->
      <g transform="translate(64, 88)">
        <polygon points="-7,-4 0,-1 -7,2" fill="${theme.bowtieColor}" />
        <polygon points="7,-4 0,-1 7,2" fill="${theme.bowtieColor}" />
        <circle cx="0" cy="-1" r="2.2" fill="#ffd700" />
      </g>

      <!-- Figurine Shoulders / Torse gilet -->
      <path d="M 28 128 C 28 100, 42 86, 64 86 C 86 86, 100 100, 100 128 Z" fill="url(#vestGrad)" />

      <!-- Vest Left Lapel -->
      <path d="M 44 88 L 60 114 L 60 128 L 28 128 C 28 108, 36 94, 44 88 Z" fill="${theme.vestShade}" opacity="0.35" />

      <!-- Golden Buttons -->
      <circle cx="64" cy="106" r="1.8" fill="#fbbf24" />
      <circle cx="64" cy="116" r="1.8" fill="#fbbf24" />
      <circle cx="64" cy="126" r="1.8" fill="#fbbf24" />
    </g>

    <!-- Figurine Head (Tête sphérique 3D lisse de la figurine) -->
    <g filter="url(#shadow)">
      <!-- Base Head Sphere -->
      <circle cx="64" cy="46" r="23" fill="url(#headGrad)" />

      <!-- Specular Gloss Highlight (Reflet vinyle figurine) -->
      <ellipse cx="55" cy="35" rx="9" ry="5" transform="rotate(-30 55 35)" fill="url(#glossGrad)" />
      <ellipse cx="73" cy="38" rx="3" ry="1.5" transform="rotate(20 73 38)" fill="#ffffff" opacity="0.6" />

      <!-- Minimalist Figurine Facial Features -->
      <!-- Left Eye -->
      <ellipse cx="56" cy="46" rx="2.2" ry="3" fill="#1e293b" />
      <circle cx="55" cy="44.8" r="0.9" fill="#ffffff" />

      <!-- Right Eye -->
      <ellipse cx="72" cy="46" rx="2.2" ry="3" fill="#1e293b" />
      <circle cx="71" cy="44.8" r="0.9" fill="#ffffff" />

      <!-- Rosy Cheeks (Joues de figurine) -->
      <circle cx="51" cy="52" r="3.5" fill="#f43f5e" opacity="0.25" />
      <circle cx="77" cy="52" r="3.5" fill="#f43f5e" opacity="0.25" />

      <!-- Friendly Smile (Sourire figurine) -->
      <path d="M 60 53 Q 64 57 68 53" stroke="#9a3412" stroke-width="1.8" stroke-linecap="round" fill="none" />
    </g>

    <!-- Miniature Billiard 8-Ball badge at the bottom corner -->
    <g transform="translate(100, 100)" filter="url(#shadow)">
      <circle cx="0" cy="0" r="15" fill="url(#ballGrad)" stroke="#ffd700" stroke-width="1.2" />
      <circle cx="-1" cy="-1" r="6" fill="#ffffff" />
      <text x="-1" y="2.5" font-family="'Outfit', sans-serif, system-ui" font-size="8.5" font-weight="900" text-anchor="middle" fill="#000000">8</text>
      <!-- Specular shine on 8-ball -->
      <ellipse cx="-4" cy="-5" rx="3" ry="1.5" transform="rotate(-30 -4 -5)" fill="#ffffff" opacity="0.7" />
    </g>

    ${initials ? `
    <!-- Subtle Initials Plaque -->
    <g transform="translate(24, 108)" opacity="0.85">
      <rect x="-10" y="-7" width="20" height="14" rx="4" fill="rgba(0,0,0,0.4)" stroke="${theme.rimColor}" stroke-width="1" />
      <text x="0" y="3.5" font-family="'Outfit', sans-serif" font-size="8" font-weight="800" text-anchor="middle" fill="#ffffff">${initials}</text>
    </g>` : ''}
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Détermine si l'URL d'un avatar correspond à une vraie photo importée par l'utilisateur
 * (et non pas au placeholder Pravatar avec visage de personnage aléatoire ou à un avatar vide).
 */
export function isCustomPlayerPhoto(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Détecte les photos personnalisées : upload local (data:image/png;base64,...), fichiers locaux ou hébergés
  if (trimmed.includes('pravatar.cc')) return false;
  if (trimmed.includes('dicebear')) return false;
  if (trimmed.startsWith('data:image/svg+xml')) {
    // Si c'est déjà notre figurine, ce n'est pas une photo perso mais c'est valide
    return true;
  }
  // Data URLs (images uploadées) ou URLs réelles non-pravatar
  return trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.startsWith('/');
}

/**
 * Renvoie l'avatar d'un joueur :
 * - Sa photo s'il en a une personnalisée (uploadée par l'utilisateur).
 * - Sinon, une figurine de joueur de billard 3D vectorielle élégante.
 */
export function getPlayerAvatar(player?: { id?: string; name?: string; avatarUrl?: string } | null): string {
  if (!player) return generateFigurineSvg('default', '');
  if (player.avatarUrl && isCustomPlayerPhoto(player.avatarUrl) && !player.avatarUrl.includes('pravatar.cc')) {
    return player.avatarUrl;
  }
  return generateFigurineSvg(player.id, player.name);
}
