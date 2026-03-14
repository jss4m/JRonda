/**
 * JRonda Render Utilities
 * Path generation + geometry helpers
 * Extracted from render.js - COMPLETE
 */

 /**
 * Generate polyline path from points
 * @param {Array<{x:number, y:number}>} points 
 * @returns {string} SVG path 'd' attribute
 */
export function polylinePathFromPoints(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/**
 * Generate capsule path from stops (rounded route visualization)
 * @param {string} routeId 
 * @param {Array} stops 
 * @param {Function} getRouteStopPoint 
 * @returns {Object} {d: string, transform: string}
 */
export function capsulePathFromStops(routeId, stops, getRouteStopPoint) {
  const pts = stops
    .map((s) => getRouteStopPoint(routeId, s))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return { d: polylinePathFromPoints(pts), transform: "" };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  let w = Math.max(42, maxX - minX + 24);
  let h = Math.max(26, maxY - minY + 20);
  const majorHorizontal = w >= h;
  if (majorHorizontal) h = Math.min(h, w * 0.55);
  else w = Math.min(w, h * 0.55);
  const r = majorHorizontal ? h * 0.5 : w * 0.5;

  const dx = pts[pts.length - 1].x - pts[0].x;
  const dy = pts[pts.length - 1].y - pts[0].y;
  const theta = Math.atan2(dy, dx);
  const deg = (theta * 180) / Math.PI;

  let d = "";
  if (majorHorizontal) {
    const x0 = cx - w * 0.5;
    const x1 = cx + w * 0.5;
    const y0 = cy - h * 0.5;
    const y1 = cy + h * 0.5;
    d = [
      `M ${x0 + r} ${y0}`,
      `L ${x1 - r} ${y0}`,
      `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
      `L ${x0 + r} ${y1}`,
      `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
      "Z",
    ].join(" ");
  } else {
    const x0 = cx - w * 0.5;
    const x1 = cx + w * 0.5;
    const y0 = cy - h * 0.5;
    const y1 = cy + h * 0.5;
    d = [
      `M ${x0} ${y0 + r}`,
      `L ${x0} ${y1 - r}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y1 - r}`,
      `L ${x1} ${y0 + r}`,
      `A ${r} ${r} 0 0 1 ${x0} ${y0 + r}`,
      "Z",
    ].join(" ");
  }
  return {
    d,
    transform: `rotate(${deg} ${cx} ${cy})`,
  };
}

/**
 * Get offset polyline for route segment spacing
 * @param {string} routeId 
 * @param {Array} stops 
 * @param {Function} getRouteStopPoint 
 * @param {Function} getSegmentOffset 
 * @param {Function} makeSegmentKey 
 * @returns {Array<{x:number, y:number}>} Offset points
 */
export function getOffsetPolyline(routeId, stops, getRouteStopPoint, getSegmentOffset, makeSegmentKey) {
  const points = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const ap = getRouteStopPoint(routeId, a);
    const bp = getRouteStopPoint(routeId, b);
    const dx = bp.x - ap.x;
    const dy = bp.y - ap.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const key = makeSegmentKey(a, b);
    const offset = getSegmentOffset(routeId, key, a, b);
    const p1 = { x: ap.x + nx * offset, y: ap.y + ny * offset };
    const p2 = { x: bp.x + nx * offset, y: bp.y + ny * offset };
    if (i === 0) points.push(p1);
    points.push(p2);
  }
  return points;
}

