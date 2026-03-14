import { describe, it, expect, beforeEach } from 'vitest';
import { buildGraph, computeKRoutes, createCostModel } from '../src/core/routerLogic.js';

describe('routerLogic', () => {
  let graph, stationMap;

  beforeEach(() => {
    // Minimal test graph: A -- B -- C
    stationMap = new Map([
      ['A', { stop_id: 'A', mode: 'RAIL' }],
      ['B', { stop_id: 'B', mode: 'RAIL' }],
      ['C', { stop_id: 'C', mode: 'RAIL' }]
    ]);
    graph = new Map([
      ['A', [{ target: 'B', weight: 100 }]],
      ['B', [{ target: 'A', weight: 100 }, { target: 'C', weight: 200 }]],
      ['C', [{ target: 'B', weight: 200 }]]
    ]);
  });

  it('buildGraph creates bidirectional graph', () => {
    const result = buildGraph([]);
    expect(result.graph).toBeDefined();
    expect(result.stationMap).toBeDefined();
  });

  it('createCostModel returns weight function', () => {
    const costModel = createCostModel('SMART');
    expect(typeof costModel).toBe('function');
  });

  it('computeKRoutes finds A->C path', () => {
    const costModel = createCostModel('SMART');
    const routes = computeKRoutes('A', 'C', graph, stationMap, 1, costModel);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toEqual(['A', 'B', 'C']);
    expect(routes[0].distance).toBeGreaterThan(0);
  });

  it('deriveMode recognizes rail categories', async () => {
    const { deriveMode } = await import('../src/core/routerLogic.js');
    expect(deriveMode('MRT')).toBe('RAIL');
    expect(deriveMode('KTM')).toBe('RAIL');
    expect(deriveMode('BUS')).toBe('BUS');
  });
});

