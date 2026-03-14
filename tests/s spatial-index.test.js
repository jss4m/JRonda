import { describe, it, expect } from 'vitest';
import { buildSpatialIndex, getNearbyFromIndex } from '../src/core/spatial-index.js';

describe('spatial-index', () => {
  const items = [
    { id: 'A', x: 10, y: 10 },
    { id: 'B', x: 15, y: 15 },
    { id: 'C', x: 50, y: 50 }
  ];

  it('builds spatial index', () => {
    const index = buildSpatialIndex(items, item => item.x, item => item.y, 20);
    expect(index).toBeInstanceOf(Map);
    expect(index.size).toBeGreaterThan(0);
  });

  it('finds nearby items', () => {
    const index = buildSpatialIndex(items, item => item.x, item => item.y, 20);
    const nearby = getNearbyFromIndex(index, 12, 12, 20);
    expect(nearby).toContain(items[0]);
    expect(nearby).toContain(items[1]);
    expect(nearby).not.toContain(items[2]);
  });
});

