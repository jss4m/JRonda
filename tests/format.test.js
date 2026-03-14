import { describe, it, expect } from 'vitest';
import { formatDistance, formatEtaMinutes, formatTime } from '../src/utils/format.js';

describe('format utils', () => {
  it('formatDistance', () => {
    expect(formatDistance(500)).toBe('500 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(2500)).toBe('2.5 km');
  });

  it('formatEtaMinutes', () => {
    expect(formatEtaMinutes(45)).toBe('45 min');
    expect(formatEtaMinutes(75)).toBe('1 h 15 min');
    expect(formatEtaMinutes(120)).toBe('2 h');
  });

  it('formatTime', () => {
    const now = new Date(2024, 0, 1, 14, 5, 30);
    expect(formatTime(now)).toBe('14:05:30');
  });
});

