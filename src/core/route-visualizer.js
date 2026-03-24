import { UIState } from './ui-state.js';

export function buildVisualRoute(routerResult) {
  if (!routerResult || !routerResult.path) return null;
  
  const stationIds = routerResult.path.map(id => String(id));
  const uniqueSegments = new Set();
  const stations = [];
  
  // Extract line segments from path
  for (let i = 0; i < stationIds.length - 1; i++) {
    const stationA = window.RoutingService.stationMap.get(stationIds[i]);
    const stationB = window.RoutingService.stationMap.get(stationIds[i + 1]);
    if (!stationA || !stationB) continue;
    
    const lineId = String(stationA.route_id || stationB.route_id || '');
    uniqueSegments.add(lineId);
  }
  
  return {
    highlightedSegments: Array.from(uniqueSegments),
    stations: stationIds
  };
}

// Auto-update state on route selection (called from subscribers)
export function onRouteSelected(rawRoute) {
  const visual = buildVisualRoute(rawRoute);
  if (visual) {
    window.setState({
      selectedRoute: rawRoute,
      highlightedSegments: visual.highlightedSegments,
      mode: "route-view",
      ui: {
        selectedRoute: rawRoute,
        highlighted: visual.highlightedSegments,
        mode: "route-view",
      },
    });
  }
}

// Export for routerLogic integration
window.buildVisualRoute = buildVisualRoute;
window.onRouteSelected = onRouteSelected;
