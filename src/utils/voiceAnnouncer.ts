import { Match } from '../types';

const VOICE_STORAGE_KEY = 'mb_voice_announcer_enabled';
const VOICE_URI_STORAGE_KEY = 'mb_voice_announcer_voice_uri';

// Mémoire des matchs déjà annoncés automatiquement durant la session pour éviter les répétitions
const autoAnnouncedKeys = new Set<string>();
let isInitializedForAuto = false;

export interface FrenchVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  isNatural: boolean;
  score: number;
}

// Pré-chauffe la liste des voix du navigateur dès le chargement
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      window.speechSynthesis.getVoices();
    });
  } catch {}
}

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
 * Récupère l'URI de la voix manuellement choisie (ou null pour sélection automatique).
 */
export function getSelectedVoiceURI(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(VOICE_URI_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Enregistre la voix préférée (ou null pour revenir au choix automatique).
 */
export function setSelectedVoiceURI(voiceURI: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (voiceURI) {
      localStorage.setItem(VOICE_URI_STORAGE_KEY, voiceURI);
    } else {
      localStorage.removeItem(VOICE_URI_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Joue un jingle carillon doux et harmonique ("Ding - Dong - Ding - Sol") via Web Audio API
 * avant de lancer la voix du speaker.
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
      // Accord doux Do majeur 7 (Do5 - Mi5 - Sol5 - Si5)
      const notes = [523.25, 659.25, 783.99, 987.77];
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const startAt = now + idx * 0.13;
        const oscMain = ctx.createOscillator();
        const oscHarmonic = ctx.createOscillator();
        const gainMain = ctx.createGain();
        const gainHarm = ctx.createGain();

        oscMain.type = 'sine';
        oscMain.frequency.setValueAtTime(freq, startAt);

        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.setValueAtTime(freq * 2, startAt);

        gainMain.gain.setValueAtTime(0.001, startAt);
        gainMain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025);
        gainMain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.55);

        gainHarm.gain.setValueAtTime(0.0005, startAt);
        gainHarm.gain.exponentialRampToValueAtTime(0.03, startAt + 0.02);
        gainHarm.gain.exponentialRampToValueAtTime(0.0005, startAt + 0.3);

        oscMain.connect(gainMain);
        oscHarmonic.connect(gainHarm);
        gainMain.connect(ctx.destination);
        gainHarm.connect(ctx.destination);

        oscMain.start(startAt);
        oscHarmonic.start(startAt);
        oscMain.stop(startAt + 0.56);
        oscHarmonic.stop(startAt + 0.32);
      });

      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 680);
    } catch {
      resolve();
    }
  });
}

function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  return /natural|neural|online|google|wavenet|siri|premium|enhanced/i.test(v.name);
}

/**
 * Évalue la qualité probable d'une voix française (les voix neurales/naturelles passent largement en tête,
 * tandis que les anciennes voix robotiques Windows Desktop sont pénalisées).
 */
function scoreFrenchVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const name = v.name || '';
  const lang = (v.lang || '').toLowerCase();

  if (isNaturalVoice(v)) score += 120;
  if (/denise|vivienne|henri|remy|rémy|eloise|éloïse|charline|thomas|amélie|amelie|audrey|aurelie|aurélie|sylvie/i.test(name)) {
    score += 45;
  }
  if (lang === 'fr-fr' || lang === 'fr_fr') score += 25;
  if (!v.localService) score += 15;

  // Pénaliser les vieilles voix SAPI5 robotiques locales si des alternatives existent
  if (!isNaturalVoice(v) && /hortense|julie|paul|claude|desktop/i.test(name)) {
    score -= 80;
  }

  return score;
}

/**
 * Liste toutes les voix françaises disponibles, triées de la plus naturelle à la moins naturelle.
 */
export function listAvailableFrenchVoices(): FrenchVoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  return voices
    .filter(v => v.lang && v.lang.toLowerCase().startsWith('fr'))
    .map(v => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      isNatural: isNaturalVoice(v),
      score: scoreFrenchVoice(v)
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Sélectionne la voix française choisie par l'utilisateur ou la meilleure voix disponible.
 */
function getBestFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const frVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('fr'));
  if (frVoices.length === 0) return null;

  const preferredURI = getSelectedVoiceURI();
  if (preferredURI) {
    const manual = frVoices.find(v => v.voiceURI === preferredURI);
    if (manual) return manual;
  }

  return [...frVoices].sort((a, b) => scoreFrenchVoice(b) - scoreFrenchVoice(a))[0];
}

/**
 * Retourne le libellé court de la voix française actuellement utilisée.
 */
export function getActiveFrenchVoiceLabel(): string {
  const voice = getBestFrenchVoice();
  if (!voice) return 'Voix système';
  return voice.name
    .replace(/Microsoft\s+/i, '')
    .replace(/\s*-\s*French\s*\(France\)/i, '')
    .replace(/\s*Online\s*\(Natural\)/i, ' (Naturelle)')
    .trim();
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
 * Évite que les noms tout en MAJUSCULES ("RAIWET") ne soient épelés lettre par lettre par le synthétiseur.
 */
export function formatSpokenPlayerName(rawName: string): string {
  return rawName
    .trim()
    .split(/\s+/)
    .map(word => {
      if (word.length >= 2 && word === word.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(word)) {
        return word
          .split('-')
          .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
          .join('-');
      }
      return word;
    })
    .join(' ');
}

/**
 * Prononce un texte via le synthétiseur vocal avec jingle d'introduction optionnel.
 */
export async function speakAnnouncement(text: string, withChime = true): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    // Attendre brièvement si la liste des voix n'est pas encore hydratée
    if (window.speechSynthesis.getVoices().length === 0) {
      await new Promise(r => setTimeout(r, 120));
    }

    // Si rien n'est en train d'être lu, on joue le carillon d'appel
    if (withChime && !window.speechSynthesis.speaking) {
      await playAnnouncementChime();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.94;
    utterance.pitch = 1.03;
    utterance.volume = 1.0;

    const bestVoice = getBestFrenchVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.lang = bestVoice.lang || 'fr-FR';
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
  const p1 = formatSpokenPlayerName(player1Name || 'Joueur 1');
  const p2 = formatSpokenPlayerName(player2Name || 'Joueur 2');

  let prefix = `Nouveau match sur le ${spokenTable}`;
  if (isReminder) {
    prefix = `Rappel des joueurs sur le ${spokenTable}`;
  } else if (match.stage === 'final' || match.bracketType === 'grand_final') {
    prefix = `Attention s'il vous plaît... Grande Finale sur le ${spokenTable}`;
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
    ? `${prefix}, ${p1} et ${p2} sont attendus à la table${handicapNote}.`
    : `${prefix}, ${p1} contre ${p2}${handicapNote}.`;

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
  const p1 = formatSpokenPlayerName(player1Name || 'Joueur 1');
  const p2 = formatSpokenPlayerName(player2Name || 'Joueur 2');
  const posText = rankIndex === 1 ? 'Prochain match en file d\'attente' : 'Préparation prochain match';
  speakAnnouncement(`${posText}, ${p1} contre ${p2}, merci de vous tenir prêts.`, true);
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
    const p1 = formatSpokenPlayerName(item.player1Name);
    const p2 = formatSpokenPlayerName(item.player2Name);
    return `Sur le ${spokenTable}, ${p1} contre ${p2}`;
  });

  const fullText = `Appel des matchs prêts à démarrer... ${segments.join('. ')}. Bon match à tous !`;
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
