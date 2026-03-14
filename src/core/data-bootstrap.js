import { mergeRailStops } from './render-utils.js';
// Use absolute paths for data (Vite handles)
import { stations } from '../../data/rail/stations.js';
import { rail } from '../../data/rail/rail.js';
import { railTimetables } from '../../data/rail/timetables.js';
import { busTimetables } from '../../data/bus/timetables.js';
import { poi as poiRaw } from '../../data/poi/poi.js';
import { goKL } from '../../data/gokl/goKL.js';
import { rapidbus } from '../../data/bus/rapidbus.js';
import { hohoKL, hohoSel } from '../../data/hoho/hoho.js';

// Core data merging
const mergedRail = mergeRailStops(rail, stations);
const allStations = [...mergedRail, ...hohoKL, ...hohoSel, ...goKL, ...rapidbus];
const poiList = (poiRaw || []).map(p => ({...p, lon: Number(p.longitude), lat: Number(p.latitude)})).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));

// Global registries (used by render/ui/interaction)
export const stationById = new Map(allStations.map(s => [String(s.stop_id), s]));
export const routes = new Map();
for (const s of allStations) {
  if (!routes.has(s.route_id)) routes.set(s.route_id, []);
  routes.get(s.route_id).push(s);
}
export { allStations, poiList, mergedRail, railTimetables, busTimetables };

