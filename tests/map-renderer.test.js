import { describe, it, expect } from 'vitest';
import { createSvgLayers, computeMapRenderProfile } from '../src/core/map-renderer.js';

describe('map-renderer', () => {
  it('createSvgLayers creates required layer groups and clip-path', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '1000');

    const layers = createSvgLayers(svg);

    expect(layers).toBeDefined();
    expect(layers.sharedTrackLayer).toBeInstanceOf(SVGElement);
    expect(layers.routeLayer.id).toBe('route-layer');
    expect(svg.querySelector('defs')).toBeTruthy();
    expect(svg.querySelector('#map-clip')).toBeTruthy();
    expect(svg.querySelector('#offset-layer')).toBeTruthy();
    expect(svg.querySelector('#interaction-layer')).toBeTruthy();
  });

  it('computeMapRenderProfile returns valid boundaries', () => {
    const mapVisibleStops = [
      { xschema: 10, yschema: 20 },
      { xschema: 100, yschema: 200 },
    ];
    const profile = computeMapRenderProfile(mapVisibleStops);

    expect(profile).toEqual({ xMin: 10, xMax: 100, yMin: 20, yMax: 200 });
  });

  it('computeMapRenderProfile handles empty input gracefully', () => {
    const profile = computeMapRenderProfile([]);
    expect(profile).toEqual({ xMin: 0, xMax: 0, yMin: 0, yMax: 0 });
  });
});
