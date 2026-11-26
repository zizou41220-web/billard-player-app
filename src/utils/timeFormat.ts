/**
 * Formats an epoch timestamp in French short form (e.g. "23:06" today, or "25/11 à 23:06" on previous days).
 */
export function formatShortDateTime(ts?: number): string {
  if (!ts || ts <= 0) return '';
  const date = new Date(ts);
  const now = new Date();
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) {
    return timeStr;
  }
  const dayStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${dayStr} ${timeStr}`;
}

/**
 * Formats an elapsed duration label in French from an epoch timestamp to now.
 */
export function formatRelativeTime(ts?: number): string {
  if (!ts || ts <= 0) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours < 24) return `il y a ${hours} h${mins > 0 ? ` ${String(mins).padStart(2, '0')}` : ''}`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}
