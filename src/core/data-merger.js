/**
 * data-merger.js
 * Functions for merging and normalizing data from various sources
 */

export function mergeRailStops(primary, fallback) {
  const merged = [];
  const seen = new Set();
  const keyOf = (s) => `${String(s.route_id || "")}|${String(s.source_stop_id || s.stop_id || "")}`;
  for (const s of primary || []) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }
  for (const s of fallback || []) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...s, _fallbackFromStations: true });
  }
  return merged;
}

export function normalizePoiList(poiRaw) {
  return (poiRaw || []).map((p) => ({
    ...p,
    lon: Number(p.longitude),
    lat: Number(p.latitude),
  })).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
}

export function assignPoiIds(poiList) {
  for (let i = 0; i < poiList.length; i++) {
    poiList[i].id = String(poiList[i].id || `poi-${i + 1}`);
  }
  return poiList;
}