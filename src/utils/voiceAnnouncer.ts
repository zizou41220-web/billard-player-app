import { Match } from '../types';

const VOICE_STORAGE_KEY = 'mb_voice_announcer_enabled';

// Mémoire des matchs déjà annoncés automatiquement durant la session pour éviter les répétitions
const autoAnnouncedKeys = new Set<string>();
let isInitializedForAuto = false;

/**
 * Vérifie si l'appel vocal automatique est activé (activé par défaut).
 */
export function isVoiceAnnouncerEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(VOICE_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/**
 * Active ou désactive l'appel vocal automatique.
 */
export function setVoiceAnnouncerEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, enabled ? 'true' : 'false');
    if (!enabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}
}

/**
 * Joue un jingle carillon 3 notes ("Ding - Dong - Ding") via Web Audio API
 * avant de lancer la voix du speaker pour attirer l'attention dans la salle.
 */
export function playAnnouncementChime(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99]; // Do5 - Mi5 - Sol5
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.16);

        gain.gain.setValueAtTime(0.001, now + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.16 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.16);
        osc.stop(now + idx * 0.16 + 0.46);
      });

      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 620);
    } catch {
      resolve();
    }
  });
}

/**
 * Sélectionne la meilleure voix française disponible sur le navigateur / OS.
 */
function getBestFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const frVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('fr'));
  if (frVoices.length === 0) return null;

  // Prioriser les voix naturelles / neurales (Google, Microsoft Online/Natural, Apple Thomas/Amélie)
  const preferred = frVoices.find(v =>
    /natural|online|google|thomas|amélie|amelie|denise|henri|hortense/i.test(v.name)
  );
  return preferred || frVoices[0];
}

/**
 * Nettoie un nom de billard pour une prononciation naturelle en français
 * (ex: "T.1" -> "Billard 1", "Table 2" -> "Billard 2").
 */
export function formatSpokenTableName(rawTableName: string): string {
  const cleaned = rawTableName.trim();
  const matchT = cleaned.match(/^T\.?\s*(\d+)$/i);
  if (matchT) return `Billard ${matchT[1]}`;
  const matchTable = cleaned.match(/^Table\s*(\d+)$/i);
  if (matchTable) return `Billard ${matchTable[1]}`;
  if (/^\d+$/.test(cleaned)) return `Billard ${cleaned}`;
  return cleaned;
}

/**
 * Prononce un texte via le synthétiseur vocal avec jingle d'introduction optionnel.
 */
export async function speakAnnouncement(text: string, withChime = true): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    // Si rien n'est en train d'être lu, on joue le carillon d'appel
    if (withChime && !window.speechSynthesis.speaking) {
      await playAnnouncementChime();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.98;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const bestVoice = getBestFrenchVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Erreur synthèse vocale :', err);
  }
}

/**
 * Construit et prononce l'appel officiel d'un match sur un billard.
 */
export function announceMatchOnTable(options: {
  match: Match;
  tableName: string;
  player1Name: string;
  player2Name: string;
  stakeLabel?: string;
  isReminder?: boolean;
}): void {
  const { match, tableName, player1Name, player2Name, stakeLabel, isReminder = false } = options;
  const spokenTable = formatSpokenTableName(tableName);
  const p1 = player1Name || 'Joueur 1';
  const p2 = player2Name || 'Joueur 2';

  let prefix = `Nouveau match sur le ${spokenTable}`;
  if (isReminder) {
    prefix = `Rappel des joueurs sur le ${spokenTable}`;
  } else if (match.stage === 'final' || match.bracketType === 'grand_final') {
    prefix = `Attention s'il vous plaît. Grande Finale sur le ${spokenTable}`;
  } else if (match.stage === 'third_place') {
    prefix = `Petite Finale sur le ${spokenTable}`;
  } else if (match.stage === 'semi') {
    prefix = `Demi-finale sur le ${spokenTable}`;
  } else if (match.stage === 'quarter') {
    prefix = `Quart de finale sur le ${spokenTable}`;
  } else if (stakeLabel && stakeLabel.includes('Décisif')) {
    prefix = `Match décisif sur le ${spokenTable}`;
  }

  let handicapNote = '';
  if ((match.handicapP1 || 0) > 0) {
    handicapNote = `. ${p1} part avec ${match.handicapP1} manche d'avance`;
  } else if ((match.handicapP2 || 0) > 0) {
    handicapNote = `. ${p2} part avec ${match.handicapP2} manche d'avance`;
  }

  const text = isReminder
    ? `${prefix} : ${p1} et ${p2} sont attendus à la table${handicapNote}.`
    : `${prefix} : ${p1} contre ${p2}${handicapNote}.`;

  speakAnnouncement(text, true);
}

/**
 * Pré-appel d'un match en file d'attente pour que les joueurs se préparent.
 */
export function announceWaitingMatchPrep(options: {
  player1Name: string;
  player2Name: string;
  rankIndex?: number;
}): void {
  const { player1Name, player2Name, rankIndex } = options;
  const p1 = player1Name || 'Joueur 1';
  const p2 = player2Name || 'Joueur 2';
  const posText = rankIndex === 1 ? 'Prochain match en file d\'attente' : 'Préparation prochain match';
  speakAnnouncement(`${posText} : ${p1} contre ${p2}, merci de vous tenir prêts.`, true);
}

/**
 * Appelle en une seule annonce tous les matchs actuellement prêts à démarrer sur les billards.
 */
export function announceAllReadyMatches(
  items: Array<{
    tableName: string;
    player1Name: string;
    player2Name: string;
  }>
): void {
  if (!items || items.length === 0) return;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  const segments = items.map(item => {
    const spokenTable = formatSpokenTableName(item.tableName);
    return `Sur le ${spokenTable} : ${item.player1Name} contre ${item.player2Name}`;
  });

  const fullText = `Appel des matchs prêts à démarrer. ${segments.join('. ')}. Bon match à tous !`;
  speakAnnouncement(fullText, true);
}

/**
 * Surveille les matchs prêts sur les tables et annonce automatiquement tout nouveau match assigné.
 * À appeler dans un useEffect de AdminView / KioskView.
 */
export function processAutoVoiceAnnouncements(
  readyMatches: Array<{
    match: Match;
    tableId: string;
    tableName: string;
    player1Name: string;
    player2Name: string;
    stakeLabel?: string;
  }>,
  forceAnnounceFirstBatch = false
): void {
  if (!isInitializedForAuto) {
    isInitializedForAuto = true;
    // Au premier chargement de la page, si on ne force pas, on enregistre les matchs déjà là
    // sauf s'ils viennent tout juste d'être créés (moins de 15 secondes)
    const now = Date.now();
    readyMatches.forEach(item => {
      const key = `${item.match.id}::${item.tableId}`;
      const isVeryRecent = item.match.startTime && (now - item.match.startTime < 15000);
      if (!forceAnnounceFirstBatch && !isVeryRecent) {
        autoAnnouncedKeys.add(key);
      }
    });
  }

  const newlyAssigned = readyMatches.filter(item => {
    if (item.match.status !== 'pending') return false;
    const key = `${item.match.id}::${item.tableId}`;
    if (autoAnnouncedKeys.has(key)) return false;
    autoAnnouncedKeys.add(key);
    return true;
  });

  if (newlyAssigned.length === 0 || !isVoiceAnnouncerEnabled()) return;

  if (newlyAssigned.length === 1) {
    const single = newlyAssigned[0];
    announceMatchOnTable({
      match: single.match,
      tableName: single.tableName,
      player1Name: single.player1Name,
      player2Name: single.player2Name,
      stakeLabel: single.stakeLabel,
      isReminder: false
    });
  } else {
    announceAllReadyMatches(
      newlyAssigned.map(item => ({
        tableName: item.tableName,
        player1Name: item.player1Name,
        player2Name: item.player2Name
      }))
    );
  }
}
