import { describe, it, expect } from 'vitest';
import { projectGeo, fitVisibleNetworkToViewport, buildSchematicLayout } from '../src/core/layout-engine.js';

describe('layout-engine', () => {
  it('projectGeo returns centered values when allStations is empty or invalid', () => {
    const [x, y] = projectGeo(1.23, 4.56, 1000, 1000, 40, []);
    expect(x).toBe(500);
    expect(y).toBe(500);
  });

  it('projectGeo maps finite geo points within bounds', () => {
    const allStations = [
      { stop_lat: 1, stop_lon: 1 },
      { stop_lat: 2, stop_lon: 2 },
    ];
    const [x, y] = projectGeo(1.5, 1.5, 1000, 1000, 40, allStations);
    expect(x).toBeGreaterThan(40);
    expect(x).toBeLessThan(960);
    expect(y).toBeGreaterThan(40);
    expect(y).toBeLessThan(960);
  });

  it('fitVisibleNetworkToViewport returns no-op for empty input', () => {
    const result = fitVisibleNetworkToViewport([], 1000, 1000);
    expect(result).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('buildSchematicLayout handles no rail stops gracefully', () => {
    const allStations = [{ stop_id: '1', stop_lat: 3, stop_lon: 4, stop_name: 'A', route_id: 'bus1', xgeo: 10, ygeo: 20 }];
    const routes = new Map([['bus1', [allStations[0]]]]);
    const result = buildSchematicLayout(allStations, routes, () => 'BUS', { svgWidth: 400, svgHeight: 400, margin: 20 });
    expect(result.success).toBe(false);
    expect(allStations[0]).toMatchObject({ xschema: 10, yschema: 20 });
  });
});
