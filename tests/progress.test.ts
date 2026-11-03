import { describe, it, expect } from 'vitest';
import { 
  formatBytes, 
  formatDuration, 
  calculateEstimatedRemainingTime 
} from '../src/utils/formatters';

describe('Progress and ETA Calculations', () => {
  it('should format bytes correctly into human-readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.1)).toBe('2.1 GB');
  });

  it('should format durations correctly', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(3665)).toBe('1h 1m 5s');
  });

  it('should calculate estimated remaining work based on observed processing speed', () => {
    // 100 items total, 20 processed in 10 seconds -> speed = 2 items/sec.
    // Remaining items = 80 -> Remaining seconds = 40s.
    const result = calculateEstimatedRemainingTime(100, 20, 10);
    expect(result.speedPerSec).toBe(2);
    expect(result.remainingSeconds).toBe(40);
    expect(result.formatted).toBe('40s');
  });

  it('should handle zero or completed state gracefully', () => {
    const zeroResult = calculateEstimatedRemainingTime(100, 0, 0);
    expect(zeroResult.formatted).toBe('Calculating...');

    const doneResult = calculateEstimatedRemainingTime(100, 100, 50);
    expect(doneResult.formatted).toBe('Done');
  });
});
