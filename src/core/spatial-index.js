/**
 * JRonda Spatial Index Module
 * Bucket-based spatial indexing for stops/POI
 * Extracted from render.js Step 3.1
 */

const SCHEMA_BUCKET_SIZE = 42;
const GEO_BUCKET_SIZE = 42;

/**
 * Build spatial index from items
 * @param {Array} items - Items to index
 * @param {Function} getX - (item) => x coord
 * @param {Function} getY - (item) => y coord  
 * @param {number} size - Bucket size
 * @returns {Map<string,Array>} Index map
 */
export function buildSpatialIndex(items, getX, getY, size) {
  const index = new Map();
  for (const item of items) {
    const x = getX(item);
    const y = getY(item);
    const key = makeBucketKey(x, y, size);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}

/**
 * Get nearby items from spatial index
 * @param {Map} index - Spatial index map
 * @param {number} x - Query X
 * @param {number} y - Query Y  
 * @param {number} size - Bucket size
 * @returns {Array} Nearby items (3x3 bucket neighborhood)
 */
export function getNearbyFromIndex(index, x, y, size) {
  const bx = Math.floor(x / size);
  const by = Math.floor(y / size);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${bx + dx}:${by + dy}`;
      const items = index.get(key);
      if (items) out.push(...items);
    }
  }
  return out;
}

function makeBucketKey(x, y, size) {
  return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
}

// Global indexes (re-exported for render.js compatibility)
export let schemaStopIndex = new Map();
export let geoStopIndex = new Map();
export let poiSchemaIndex = new Map();

/**
 * Rebuild all spatial indexes
 * @param {Array} mapVisibleStops - Current visible stops
 * @param {Array} poiList - POI list
 */
export function rebuildSpatialIndexes(mapVisibleStops, poiList) {
  schemaStopIndex = buildSpatialIndex(
    mapVisibleStops,
    (s) => s.xschema,
    (s) => s.yschema,
    SCHEMA_BUCKET_SIZE
  );
  geoStopIndex = buildSpatialIndex(
    mapVisibleStops,
    (s) => s.xgeo,
    (s) => s.ygeo,
    GEO_BUCKET_SIZE
  );
  poiSchemaIndex = buildSpatialIndex(
    poiList,
    (p) => p.xschema,
    (p) => p.yschema,
    SCHEMA_BUCKET_SIZE
  );
}

export {
  SCHEMA_BUCKET_SIZE,
  GEO_BUCKET_SIZE,
};

