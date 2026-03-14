import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock non-core modules only
vi.mock('adm-zip');
vi.mock('csv-parse/sync');

describe('Data Build Scripts', () => {
  describe('normalize-bus.js', () => {
    it('should create output directory if it does not exist', async () => {
      const { normalizeBusStops } = await import('../data-build/scripts/normalize-bus.js');
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      normalizeBusStops();

      expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('normalized'), { recursive: true });
      existsSpy.mockRestore();
      mkdirSpy.mockRestore();
    });

    it('should validate bus stop schema with zod', async () => {
      const { BusStopSchema } = await import('../data-build/scripts/normalize-bus.js');
      const validStop = {
        stop_id: '1001',
        stop_name: 'Test Stop',
        stop_lat: 3.123,
        stop_lon: 101.123,
        mode: 'bus',
        operator: 'rapid_bus',
      };

      expect(() => BusStopSchema.parse(validStop)).not.toThrow();

      const invalidStop = {
        stop_id: '',
        stop_name: 'Bad Stop',
        stop_lat: 'invalid',
        stop_lon: 101.123,
        mode: 'bus',
        operator: 'rapid_bus',
      };
      expect(() => BusStopSchema.parse(invalidStop)).toThrow();
    });

    it('should warn if ZIP file not found', async () => {
      const { normalizeBusStops } = await import('../data-build/scripts/normalize-bus.js');
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      normalizeBusStops();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ZIP file not found'));
      existsSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  // Add tests for other scripts similarly
  describe('normalize-rail.js', () => {
    it('should expose schema and function', async () => {
      const { normalizeRail, RailRouteSchema, RailStopSchema } = await import('../data-build/scripts/normalize-rail.js');
      expect(typeof normalizeRail).toBe('function');
      expect(RailRouteSchema).toBeDefined();
      expect(RailStopSchema).toBeDefined();

      const route = {
        route_id: 'R1',
        mode: 'rail',
        category: 'MRT',
        route_color: null,
        route_short_name: null,
        route_long_name: null,
        route_public_name: 'R1',
        operator: 'rail',
        isLoop: false,
        stops: [{ stop_id: 'R1_s1', seq: 1 }],
      };
      expect(() => RailRouteSchema.parse(route)).not.toThrow();

      const stop = {
        stop_id: 'R1_s1',
        source_stop_id: 's1',
        stop_name: 'Station 1',
        stop_lat: 3.1,
        stop_lon: 101.1,
        category: 'MRT',
        route_id: 'R1',
        route_color: null,
        route_short_name: null,
        route_long_name: null,
        route_public_name: 'R1',
        seq: 1,
        isLoop: false,
        isOKU: true,
        status: 'valid',
      };
      expect(() => RailStopSchema.parse(stop)).not.toThrow();
    });
  });

  describe('poi_txt-to-js.js', () => {
    it('should validate POI schema', async () => {
      const { PoiSchema } = await import('../data-build/scripts/poi_txt-to-js.js');
      const poi = {
        id: 'p1',
        section: 'POI',
        name: 'Test POI',
        category: 'Food',
        longitude: 101.0,
        latitude: 3.0,
      };
      expect(() => PoiSchema.parse(poi)).not.toThrow();
      expect(() => PoiSchema.parse({ ...poi, longitude: 'bad' })).toThrow();
    });
  });
});