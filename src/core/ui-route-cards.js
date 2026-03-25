import { UIState } from './ui-state.js';
import { getRouteColor } from '../style/routeStyle.js';
// TODO: verify - module currently not imported in app bootstrap; remove or wire explicitly.

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "N/A";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function renderRouteCard(route, index = 0, onSelect) {
  const name = route.name || `Option ${index + 1}`;
  const color = getRouteColor(route.segments?.[0]?.routeId || '', false).color;
  const distanceStr = route.formattedDistance || formatDistance(route.distance || 0);
  
  return `
    <div class="rcard" onclick="${onSelect ? `window.selectRoute(${index})` : ''}">
      <div class="rc-name">${name}</div>
      <div class="rc-meta">
        ${route.ETA || route.eta || '?'} min · ${distanceStr} · ${route.stops || route.stations?.length || '?'} stops · ${route.transfers || 0} transfers
      </div>
      <div class="rc-segs">
        ${route.segments?.map(seg => renderSegment(seg, color)).join('') || ''}
      </div>
    </div>
  `;
}

function renderSegment(seg, defaultColor) {
  const color = seg.color || defaultColor || '#64748b';
  const colorClass = `bg-c-${String(color).replace('#', '').toLowerCase()}`;
  const styleId = "jronda-route-card-colors";
  let styleNode = document.getElementById(styleId);
  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.id = styleId;
    document.head.appendChild(styleNode);
  }
  if (!styleNode.textContent.includes(`.${colorClass}{`)) {
    styleNode.appendChild(document.createTextNode(`.rseg.${colorClass}{background:${color};}`));
  }
  return `<div class="rseg ${colorClass}" title="${seg.label || seg.routeId}">${seg.label || seg.routeId.slice(-4)}</div>`;
}

// State subscriber for dynamic cards
export function subscribeRouteCards(containerId = 'route-info-content') {
  const container = document.getElementById(containerId);
  if (!container) return () => {};
  
  const renderCards = () => {
    const state = UIState;
    container.innerHTML = '';
    
    if (!state.routes?.length) {
      container.innerHTML = '<div class="rcard-empty">No routes found</div>';
      return;
    }
    
    state.routes.forEach((route, i) => {
      const card = renderRouteCard(route, i, () => {
        window.setState({ selectedRoute: route });
      });
      container.insertAdjacentHTML('beforeend', card);
    });
  };
  
  UIState.listeners.add(renderCards);
  renderCards(); // Initial
  
  return () => UIState.listeners.delete(renderCards);
}

// Global export for ui.js
window.renderRouteCard = renderRouteCard;
window.subscribeRouteCards = subscribeRouteCards;

