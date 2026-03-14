/**
 * JRonda Map Renderer - POI SVG Images
 * Uses actual SVG files from src/img/poi/ for visualization
 */

import { getRouteColor, getPoiCategoryStyle, getServiceLabel, getRouteMode } from '../style/routeStyle.js';

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
  ];

  const defs = document.createElementNS(svg.namespaceURI, 'defs');
  const clip = document.createElementNS(svg.namespaceURI, 'clipPath');
  clip.setAttribute('id', 'map-clip');
  const clipRect = document.createElementNS(svg.namespaceURI, 'rect');
  clipRect.setAttribute('x', '0');
  clipRect.setAttribute('y', '0');
  clipRect.setAttribute('width', String(svg.viewBox.baseVal.width || svg.clientWidth || 1000));
  clipRect.setAttribute('height', String(svg.viewBox.baseVal.height || svg.clientHeight || 1000));
  clip.appendChild(clipRect);
  defs.appendChild(clip);
  svg.appendChild(defs);

  const layers = {};

  for (const layer of names) {
    const g = document.createElementNS(svg.namespaceURI, 'g');
    g.setAttribute('id', layer.id);
    g.setAttribute('clip-path', 'url(#map-clip)');
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
      line.setAttribute('x1', String(a.xschema));
      line.setAttribute('y1', String(a.yschema));
      line.setAttribute('x2', String(b.xschema));
      line.setAttribute('y2', String(b.yschema));
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
    c.setAttribute('cx', String(stop.xschema));
    c.setAttribute('cy', String(stop.yschema));
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

    const hit = document.createElementNS(interactionLayer.namespaceURI, 'circle');
    hit.setAttribute('cx', String(stop.xschema));
    hit.setAttribute('cy', String(stop.yschema));
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

    const shouldLabel =
      getRouteMode(stop.route_id) === 'RAIL' &&
      (stop.isInterchange ||
        stop.isConnecting ||
        (terminalStopIds && terminalStopIds.has(String(stop.stop_id))));
    if (shouldLabel) {
      const label = document.createElementNS(labelLayer.namespaceURI, 'text');
      label.textContent = String(stop.stop_name || '');
      label.setAttribute('x', String(stop.xschema + 8));
      label.setAttribute('y', String(stop.yschema - 8));
      label.setAttribute('font-size', '14');
      label.setAttribute('font-family', 'sans-serif');
      label.setAttribute('fill', '#0F172A');
      label.setAttribute('paint-order', 'stroke');
      label.setAttribute('stroke', '#FFFFFF');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('stroke-linejoin', 'round');
      labelLayer.appendChild(label);
    }
  }

  for (const p of poiList) {
    const style = getPoiCategoryStyle(p.category);
    const g = document.createElementNS(poiLayer.namespaceURI, 'g');
    const halo = document.createElementNS(poiLayer.namespaceURI, 'circle');
    halo.setAttribute('cx', String(p.xschema));
    halo.setAttribute('cy', String(p.yschema));
    halo.setAttribute('r', '6');
    halo.setAttribute('fill', '#FFFFFF');
    halo.setAttribute('stroke', style.color || '#475569');
    halo.setAttribute('stroke-width', '2');
    g.appendChild(halo);

    if (style.filename) {
      const iconImg = document.createElementNS(poiLayer.namespaceURI, 'image');
      iconImg.setAttribute('href', `/src/img/poi/${style.filename}`);
      iconImg.setAttribute('x', String(p.xschema - 10));
      iconImg.setAttribute('y', String(p.yschema - 10));
      iconImg.setAttribute('width', '20');
      iconImg.setAttribute('height', '20');
      iconImg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      iconImg.setAttribute('clip-path', 'url(#map-clip)');
      g.appendChild(iconImg);
    } else {
      const icon = document.createElementNS(poiLayer.namespaceURI, 'circle');
      icon.setAttribute('cx', String(p.xschema));
      icon.setAttribute('cy', String(p.yschema));
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
    hit.setAttribute('cx', String(p.xschema));
    hit.setAttribute('cy', String(p.yschema));
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
    iconImg.setAttribute("x", p.xschema - 10);
    iconImg.setAttribute("y", p.yschema - 10);
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
    hit.setAttribute("cx", String(p.xschema));
    hit.setAttribute("cy", String(p.yschema));
    hit.setAttribute("r", "20"); // Larger hit area
    hit.setAttribute("fill", "transparent");
    hit.dataset.poiId = String(p.id);
    interactionLayer.appendChild(hit);
  }
}

// No explicit re-export needed; functions are already exported at declaration.

