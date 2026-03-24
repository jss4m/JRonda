/**
 * JRonda Map Renderer - POI SVG Images
 * Uses actual SVG files from src/img/poi/ for visualization
 */

import { getRouteColor, getPoiCategoryStyle, getServiceLabel, getRouteMode } from '../style/routeStyle.js';

function safeCoord(x, y, defaultX = 500, defaultY = 500) {
  const cx = Number.isFinite(x) ? x : defaultX;
  const cy = Number.isFinite(y) ? y : defaultY;
  return [String(cx), String(cy)];
}

export function createSvgLayers(svg) {
  if (!svg) throw new Error('createSvgLayers requires an SVG element');

  const names = [
    { key: 'sharedTrackLayer', id: 'offset-layer' },
    { key: 'routeLayer', id: 'route-layer' },
    { key: 'transferLayer', id: 'transfer-layer' },
    { key: 'stopLayer', id: 'stop-layer' },
    { key: 'poiLayer', id: 'poi-layer' },
    { key: 'labelLayer', id: 'label-layer' },
    { key: 'interactionLayer', id: 'interaction-layer' },
    { key: 'gpsLayer', id: 'gps-layer' },
    { key: 'debugLayer', id: 'debug-layer' }, // Raw layout debug overlay
  ];

  const defs = document.createElementNS(svg.namespaceURI, 'defs');
  const clip = document.createElementNS(svg.namespaceURI, 'clipPath');
  clip.setAttribute('id', 'map-clip');
  const clipRect = document.createElementNS(svg.namespaceURI, 'rect');
  clipRect.setAttribute('x', '0');
  clipRect.setAttribute('y', '0');
  const bbox = svg.getBoundingClientRect();
  clipRect.setAttribute('width', String(Math.max(100, Number(svg.viewBox.baseVal?.width || bbox.width || svg.clientWidth || 1200))));
  clipRect.setAttribute('height', String(Math.max(100, Number(svg.viewBox.baseVal?.height || bbox.height || svg.clientHeight || 800))));
  clip.appendChild(clipRect);
  defs.appendChild(clip);


  const etsSymbol = document.createElementNS(svg.namespaceURI, 'symbol');
  etsSymbol.setAttribute('id', 'ets-access-icon');
  etsSymbol.setAttribute('viewBox', '0 0 24 24');

  const etsPathSecondary = document.createElementNS(svg.namespaceURI, 'path');
  etsPathSecondary.setAttribute('d', 'M16,14h1M8,6h6m-2,4V6');
  etsPathSecondary.setAttribute('fill', 'none');
  etsPathSecondary.setAttribute('stroke', '#000000');
  etsPathSecondary.setAttribute('stroke-linecap', 'round');
  etsPathSecondary.setAttribute('stroke-linejoin', 'round');
  etsPathSecondary.setAttribute('stroke-width', '2');

  const etsPathPrimary = document.createElementNS(svg.namespaceURI, 'path');
  etsPathPrimary.setAttribute('d', 'M10,10H20a1,1,0,0,1,1,1v6a1,1,0,0,1-1,1H4a1,1,0,0,1-1-1A7,7,0,0,1,10,10Zm0,0h2v3a1,1,0,0,1-1,1H3.68A7,7,0,0,1,10,10Z');
  etsPathPrimary.setAttribute('fill', 'none');
  etsPathPrimary.setAttribute('stroke', '#000000');
  etsPathPrimary.setAttribute('stroke-linecap', 'round');
  etsPathPrimary.setAttribute('stroke-linejoin', 'round');
  etsPathPrimary.setAttribute('stroke-width', '2');

  etsSymbol.appendChild(etsPathSecondary);
  etsSymbol.appendChild(etsPathPrimary);
  defs.appendChild(etsSymbol);
  svg.appendChild(defs);

  const layers = {};

  for (const layer of names) {
    const g = document.createElementNS(svg.namespaceURI, 'g');
    g.setAttribute('id', layer.id);
    g.setAttribute('clip-path', 'url(#map-clip)');
    if (layer.key === 'gpsLayer') {
      g.setAttribute('pointer-events', 'none');
    }
    svg.appendChild(g);
    layers[layer.key] = g;
  }

  return layers;
}

export function computeMapRenderProfile(mapVisibleStops = []) {
  const xs = mapVisibleStops.map((s) => s.xschema).filter(Number.isFinite);
  const ys = mapVisibleStops.map((s) => s.yschema).filter(Number.isFinite);

  if (!xs.length || !ys.length) {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

export function drawRoutes({
  routes,
  routeDisplayStops,
  routeLayer,
  routeLineRegistry,
  getRouteColor,
  getRouteMode,
  getOffsetPolyline,
  getRouteStopPoint,
  getSegmentOffset,
  makeSegmentKey,
  isCcRailRouteId,
  isCcRailStop,
  polylinePathFromPoints,
  PRIMARY_RAIL_STROKE,
  SECONDARY_RAIL_STROKE,
  BUS_STROKE,
  routeLayerWeight,
  busLoopRenderCache,
}) {
  const routeEntries = Array.from(routes.entries()).sort(
    ([routeA], [routeB]) => {
      const w = routeLayerWeight(routeA) - routeLayerWeight(routeB);
      if (w !== 0) return w;
      const aCC = isCcRailRouteId(routeA) ? 0 : 1;
      const bCC = isCcRailRouteId(routeB) ? 0 : 1;
      if (aCC !== bCC) return aCC - bCC;
      return String(routeA).localeCompare(String(routeB));
    }
  );

  for (const [route_id, stops] of routeEntries) {
    const displayStops = routeDisplayStops.get(String(route_id)) || stops;
    if (!displayStops || displayStops.length < 2) continue;
    const baseColor = getRouteColor(route_id, false, displayStops[0]?.route_color ?? null).color;
    const mode = getRouteMode(route_id);
    const routePoints = getOffsetPolyline(route_id, displayStops, getRouteStopPoint, getSegmentOffset, makeSegmentKey);
    const validRoutePoints = routePoints.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (validRoutePoints.length < 2) continue;
    const isLoopBus = mode !== 'RAIL' && displayStops.some((s) => Boolean(s.isLoop));
    const isCcRail = mode === 'RAIL' && (isCcRailRouteId(route_id) || displayStops.some((s) => isCcRailStop(s)));
    const loopPath = busLoopRenderCache ? busLoopRenderCache.get(String(route_id)) : null;
    const routePathD = isLoopBus
      ? (loopPath?.pathD || polylinePathFromPoints(validRoutePoints))
      : (isCcRail && validRoutePoints.length > 2
        ? polylinePathFromPoints([...validRoutePoints, validRoutePoints[0]])
        : polylinePathFromPoints(validRoutePoints));
    const strokeWidth = mode === 'RAIL'
      ? (displayStops.length >= 26 ? PRIMARY_RAIL_STROKE : SECONDARY_RAIL_STROKE)
      : BUS_STROKE;
    const caseWidth = strokeWidth + (mode === 'RAIL' ? 3 : 1);

    const casing = document.createElementNS(routeLayer.namespaceURI, 'path');
    const path = document.createElementNS(routeLayer.namespaceURI, 'path');
    casing.setAttribute('d', routePathD);
    casing.setAttribute('fill', 'none');
    casing.setAttribute('stroke', mode === 'RAIL' ? '#FFFFFF' : '#E5E7EB');
    casing.setAttribute('stroke-width', String(caseWidth));
    casing.setAttribute('stroke-linecap', 'round');
    casing.setAttribute('stroke-linejoin', 'round');
    casing.setAttribute('opacity', '1');

    path.setAttribute('d', routePathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', baseColor);
    path.setAttribute('stroke-opacity', '0.95');
    path.setAttribute('stroke-width', String(strokeWidth));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    if (mode !== 'RAIL') {
      const dash = '8 7';
      path.setAttribute('stroke-dasharray', dash);
      casing.setAttribute('stroke-dasharray', dash);
    }
    path.dataset.routeId = route_id;
    path.dataset.baseColor = baseColor;
    path.dataset.baseOpacity = '1';
    path.dataset.mode = mode;
    casing.dataset.routeId = route_id;
    casing.dataset.mode = mode;

    routeLayer.appendChild(casing);
    routeLayer.appendChild(path);
    routeLineRegistry.set(route_id, {
      el: path,
      caseEl: casing,
      mode,
      color: baseColor,
      baseWidth: strokeWidth,
      caseWidth,
      category: String(displayStops[0]?.category ?? ''),
    });
  }
}

export function drawInterchanges({
  interchangeCandidates,
  schemaStopIndex,
  transferLayer,
  SCHEMA_BUCKET_SIZE,
  getNearbyFromIndex,
  getRouteMode,
  TRANSFER_DISTANCE,
  CONNECTION_STROKE,
  transferLineRegistry,
}) {
  const seenTransferPair = new Set();
  const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

  for (const a of interchangeCandidates) {
    const nearby = getNearbyFromIndex(schemaStopIndex, a.xschema, a.yschema, SCHEMA_BUCKET_SIZE);
    for (const b of nearby) {
      if (a === b) continue;
      if (!(b.isInterchange || b.isConnecting)) continue;
      if (a.route_id === b.route_id) continue;
      const aId = String(a.stop_id);
      const bId = String(b.stop_id);
      const pairKey = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
      if (seenTransferPair.has(pairKey)) continue;
      if (dist(a.xschema, a.yschema, b.xschema, b.yschema) >= TRANSFER_DISTANCE) continue;
      seenTransferPair.add(pairKey);

      const line = document.createElementNS(transferLayer.namespaceURI, 'line');
      const [ax, ay] = safeCoord(a.xschema, a.yschema);
      const [bx, by] = safeCoord(b.xschema, b.yschema);
      line.setAttribute('x1', ax);
      line.setAttribute('y1', ay);
      line.setAttribute('x2', bx);
      line.setAttribute('y2', by);
      line.setAttribute('stroke', '#6B7280');
      line.setAttribute('stroke-width', String(CONNECTION_STROKE));
      line.setAttribute('stroke-dasharray', '1 5');
      const hasBus =
        getRouteMode(a.route_id) !== 'RAIL' || getRouteMode(b.route_id) !== 'RAIL';
      line.dataset.hasBus = hasBus ? '1' : '0';
      transferLayer.appendChild(line);
      if (transferLineRegistry) transferLineRegistry.push(line);
    }
  }
}

export function drawStopsAndPois({
  mapVisibleStops,
  stopLayer,
  interactionLayer,
  labelLayer,
  poiLayer,
  poiList,
  stopElementRegistry,
  poiElementRegistry,
  getRouteMode,
  TOUCH_SELECT_RADIUS,
  TRANSFER_RADIUS,
  getPoiCategoryStyle,
  terminalStopIds,
}) {
  for (const stop of mapVisibleStops) {
    const g = document.createElementNS(stopLayer.namespaceURI, 'g');
    g.dataset.stopId = String(stop.stop_id);
    g.dataset.routeId = String(stop.route_id);
    g.dataset.mode = getRouteMode(stop.route_id);
    g.dataset.category = String(stop.category || '');

    const c = document.createElementNS(stopLayer.namespaceURI, 'circle');
    const [cx, cy] = safeCoord(stop.xschema, stop.yschema);
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('fill', '#FFFFFF');
    c.setAttribute('stroke', '#111111');

    if (stop.isConnecting) {
      c.setAttribute('r', String(TRANSFER_RADIUS));
      c.setAttribute('stroke-width', '3');
    } else if (stop.isInterchange) {
      c.setAttribute('r', '8');
      c.setAttribute('stroke-width', '3');
    } else {
      c.setAttribute('r', '6');
      c.setAttribute('stroke-width', '2');
    }
    g.appendChild(c);
    stopLayer.appendChild(g);

    if (stop.accessETS) {
      const icon = document.createElementNS(stopLayer.namespaceURI, 'use');
      icon.setAttribute('href', '#ets-access-icon');
      icon.setAttribute('width', '14');
      icon.setAttribute('height', '14');
      icon.setAttribute('x', String(Number(cx) - 7));
      icon.setAttribute('y', String(Number(cy) - 20));
      icon.setAttribute('opacity', '0.9');
      g.appendChild(icon);
    }

    const hit = document.createElementNS(interactionLayer.namespaceURI, 'circle');
    hit.setAttribute('cx', cx);
    hit.setAttribute('cy', cy);
    hit.setAttribute('r', String(TOUCH_SELECT_RADIUS));
    hit.setAttribute('fill', 'transparent');
    hit.dataset.stopId = String(stop.stop_id);
    interactionLayer.appendChild(hit);

    if (stopElementRegistry) {
      if (!stopElementRegistry.has(String(stop.stop_id))) {
        stopElementRegistry.set(String(stop.stop_id), []);
      }
      stopElementRegistry.get(String(stop.stop_id)).push({
        el: g,
        mode: getRouteMode(stop.route_id),
        routeId: String(stop.route_id),
        category: String(stop.category || ''),
      });
      stopElementRegistry.get(String(stop.stop_id)).push({
        el: hit,
        mode: getRouteMode(stop.route_id),
        routeId: String(stop.route_id),
        category: String(stop.category || ''),
      });
    }

    const shouldLabel = true;
    if (shouldLabel) {
      const mode = getRouteMode(stop.route_id);
      const label = document.createElementNS(labelLayer.namespaceURI, 'text');
      label.textContent = String(stop.stop_name || '');
      const labelDx = mode === 'RAIL' ? 8 : 6;
      const labelDy = mode === 'RAIL' ? -8 : -6;
      const [lx, ly] = safeCoord(stop.xschema + labelDx, stop.yschema + labelDy);
      label.setAttribute('x', lx);
      label.setAttribute('y', ly);
      label.setAttribute('font-size', mode === 'RAIL' ? '12' : '10');
      label.setAttribute('font-family', 'sans-serif');
      label.setAttribute('fill', mode === 'RAIL' ? '#0F172A' : '#334155');
      label.setAttribute('paint-order', 'stroke');
      label.setAttribute('stroke', '#FFFFFF');
      label.setAttribute('stroke-width', mode === 'RAIL' ? '2.4' : '2');
      label.setAttribute('stroke-linejoin', 'round');
      label.dataset.stopId = String(stop.stop_id);
      label.dataset.routeId = String(stop.route_id);
      label.dataset.mode = mode;
      label.dataset.category = String(stop.category || '');
      labelLayer.appendChild(label);
      if (stopElementRegistry) {
        if (!stopElementRegistry.has(String(stop.stop_id))) {
          stopElementRegistry.set(String(stop.stop_id), []);
        }
        stopElementRegistry.get(String(stop.stop_id)).push({
          el: label,
          mode,
          routeId: String(stop.route_id),
          category: String(stop.category || ''),
        });
      }
    }
  }

  for (const p of poiList) {
    const style = getPoiCategoryStyle(p.category);
    const g = document.createElementNS(poiLayer.namespaceURI, 'g');
    const [px, py] = safeCoord(p.xschema, p.yschema);
    const halo = document.createElementNS(poiLayer.namespaceURI, 'circle');
    halo.setAttribute('cx', px);
    halo.setAttribute('cy', py);
    halo.setAttribute('r', '6');
    halo.setAttribute('fill', '#FFFFFF');
    halo.setAttribute('stroke', style.color || '#475569');
    halo.setAttribute('stroke-width', '2');
    g.appendChild(halo);

    if (style.filename) {
      const iconImg = document.createElementNS(poiLayer.namespaceURI, 'image');
      iconImg.setAttribute('href', `/src/img/poi/${style.filename}`);
      const [ix, iy] = safeCoord(p.xschema - 10, p.yschema - 10);
      iconImg.setAttribute('x', ix);
      iconImg.setAttribute('y', iy);
      iconImg.setAttribute('width', '20');
      iconImg.setAttribute('height', '20');
      iconImg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      iconImg.setAttribute('clip-path', 'url(#map-clip)');
      g.appendChild(iconImg);
    } else {
      const icon = document.createElementNS(poiLayer.namespaceURI, 'circle');
      icon.setAttribute('cx', px);
      icon.setAttribute('cy', py);
      icon.setAttribute('r', '4');
      icon.setAttribute('fill', style.color || '#475569');
      g.appendChild(icon);
    }

    const title = document.createElementNS(poiLayer.namespaceURI, 'title');
    const nearName = p.nearestStopName || 'Unknown';
    const nearMeters = Number.isFinite(p.nearestDistanceMeters) ? ` (${p.nearestDistanceMeters}m)` : '';
    title.textContent = `${p.name}\n${p.category}\nNearest: ${nearName}${nearMeters}`;
    g.appendChild(title);

    poiLayer.appendChild(g);
    if (poiElementRegistry) {
      poiElementRegistry.push({ el: g, category: String(p.category || '') });
    }

    const hit = document.createElementNS(interactionLayer.namespaceURI, 'circle');
    hit.setAttribute('cx', px);
    hit.setAttribute('cy', py);
    hit.setAttribute('r', '14');
    hit.setAttribute('fill', 'transparent');
    hit.dataset.poiId = String(p.id);
    interactionLayer.appendChild(hit);
  }
}

/**
 * Draw POI with SVG images instead of path shapes
 * @param {Object} poiLayer 
 * @param {Array} poiList 
 * @param {SVGSVGElement} svg 
 */
export function drawPoiWithImages(poiLayer, poiList, svg) {
  poiLayer.innerHTML = ''; // Clear existing

  for (const p of poiList) {
    const style = getPoiCategoryStyle(p.category);
    const g = document.createElementNS(svg.namespaceURI, "g");

    // Halo
    const halo = document.createElementNS(svg.namespaceURI, "circle");
    halo.setAttribute("cx", p.xschema);
    halo.setAttribute("cy", p.yschema);
    halo.setAttribute("r", "8");
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", style.color);
    halo.setAttribute("stroke-width", "2.5");
    halo.setAttribute("stroke-opacity", "0.8");
    g.appendChild(halo);

    // SVG image icon
    const iconImg = document.createElementNS(svg.namespaceURI, "image");
    iconImg.setAttribute("href", `/src/img/poi/${style.filename}`);
    const [ix2, iy2] = safeCoord(p.xschema - 10, p.yschema - 10);
    iconImg.setAttribute("x", ix2);
    iconImg.setAttribute("y", iy2);
    iconImg.setAttribute("width", "20");
    iconImg.setAttribute("height", "20");
    iconImg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    iconImg.setAttribute("clip-path", "url(#map-clip)");
    g.appendChild(iconImg);


    // Tooltip
    const title = document.createElementNS(svg.namespaceURI, "title");
    const nearName = p.nearestStopName || 'Unknown';
    const nearMeters = Number.isFinite(p.nearestDistanceMeters) ? ` (${p.nearestDistanceMeters}m)` : '';
    title.textContent = `${p.name}\n${p.category}\nNearest: ${nearName}${nearMeters}`;
    g.appendChild(title);

    poiLayer.appendChild(g);
  }
}

export function drawPoiHitAreas(interactionLayer, poiList, svg) {
  for (const p of poiList) {
    const hit = document.createElementNS(svg.namespaceURI, "circle");
    const [hx, hy] = safeCoord(p.xschema, p.yschema);
    hit.setAttribute("cx", hx);
    hit.setAttribute("cy", hy);
    hit.setAttribute("r", "20"); // Larger hit area
    hit.setAttribute("fill", "transparent");
    hit.dataset.poiId = String(p.id);
    interactionLayer.appendChild(hit);
  }
}

// No explicit re-export needed; functions are already exported at declaration.

