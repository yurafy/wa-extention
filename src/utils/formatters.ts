/**
 * Utility functions for formatting units, timestamps, and computing remaining work estimates.
 */

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Calculates estimated remaining time based on observed processing speed
 * (total items remaining divided by items processed per second).
 */
export function calculateEstimatedRemainingTime(
  totalItems: number,
  processedItems: number,
  elapsedSeconds: number
): { remainingSeconds: number; formatted: string; speedPerSec: number } {
  if (processedItems <= 0 || elapsedSeconds <= 0 || totalItems <= processedItems) {
    return {
      remainingSeconds: 0,
      formatted: totalItems <= processedItems ? 'Done' : 'Calculating...',
      speedPerSec: 0,
    };
  }

  const speed = processedItems / elapsedSeconds; // items per second
  const remainingItems = totalItems - processedItems;
  const remainingSeconds = remainingItems / speed;

  return {
    remainingSeconds,
    formatted: formatDuration(remainingSeconds),
    speedPerSec: Math.round(speed * 10) / 10,
  };
}
