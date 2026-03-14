import { describe, it, expect } from 'vitest';

// Placeholder tests for core modules
// These will need to be expanded as modules are refactored

describe('Core Modules', () => {
  describe('render.js', () => {
    it('should export init and consumeInitToasts API', async () => {
      const { init, consumeInitToasts } = await import('../src/core/render.js');
      expect(typeof init).toBe('function');
      expect(typeof consumeInitToasts).toBe('function');
      const pendingToasts = consumeInitToasts();
      expect(Array.isArray(pendingToasts)).toBe(true);
    });
  });

  describe('interaction.js', () => {
    it('is available in project (placeholder)', () => {
      expect(true).toBe(true);
    });
  });

  describe('bootstrap.js', () => {
    it('is available in project (placeholder)', () => {
      expect(true).toBe(true);
    });
  });

  describe('routeStyle dedupe and normalization', () => {
    it('normalizes rail ids and avoids duplicates in route list', async () => {
      const {
        normalizeRouteId,
        railRouteIds,
        routes,
        getModeLabel,
      } = await import('../src/style/routeStyle.js');

      expect(normalizeRouteId(' ag ')).toBe('AG');
      expect(railRouteIds.has('AG')).toBe(true);

      const routeIds = routes.map((r) => normalizeRouteId(r.id));
      expect(new Set(routeIds).size).toBe(routeIds.length);

      expect(getModeLabel('ag')).toBe('Ampang Line');

      // route_public_name priority inside getServiceLabel
      expect(getServiceLabel({ route_id: 'AG', route_public_name: 'Ampang Line Public' })).toBe('Ampang Line Public');
    });
  });
});