/** Converts seconds to a human-readable Russian string like "3 дн 2 ч 15 мин". */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} сек`;

  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours} ч ${remMin} мин` : `${hours} ч`;
  }

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours > 0) return `${days} дн ${remHours} ч`;
  return `${days} дн`;
}

/** Returns a signed diff string "+X% быстрее" / "+X% медленнее" or "" if baseline is null. */
export function formatCycleTimeDiff(
  personal: number | null,
  baseline: number | null
): { text: string; better: boolean } | null {
  if (personal == null || baseline == null || baseline === 0) return null;
  const diff = ((personal - baseline) / baseline) * 100;
  const abs = Math.abs(diff).toFixed(0);
  if (diff <= -5) return { text: `на ${abs}% быстрее`, better: true };
  if (diff >= 5) return { text: `на ${abs}% медленнее`, better: false };
  return { text: 'на уровне команды', better: true };
}
