/**
 * JRonda Interaction Bindings
 * Touch handlers + trace lines + bindings
 * Extracted from render.js - COMPLETE
 */

let activeTraceLine = null;
let traceLastPoint = null;

/**
 * Core render pointer interaction bindings
 * @returns {Object} Bindings for interaction.js
 */
export function getRenderPointerInteractionBindings(svg, toSvgPointFn, findNearestStopWithinFn, findNearestPoiWithinFn) {
  return {
    svg,
    toSvgPoint: toSvgPointFn,
    findNearestStopWithin: findNearestStopWithinFn,
    findNearestPoiWithin: findNearestPoiWithinFn,
    getUserDotPoint: () => {
      if (!window.gpsManager?.userDot) return null;
      const x = Number(window.gpsManager.userDot.getAttribute("cx"));
      const y = Number(window.gpsManager.userDot.getAttribute("cy"));
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
    startTraceLine,
    appendTracePoint,
    finishTraceLine,
    showStationTooltip: window.tooltipManager?.showStationTooltip,
    showPoiTooltip: window.tooltipManager?.showPoiTooltip,
    showGpsTooltip: window.tooltipManager?.showGpsTooltip,
    showGpsSetupPanel: window.tooltipManager?.showGpsSetupPanel,
    hideStationTooltip: window.tooltipManager?.hideStationTooltip,
    dispatchStationInfo,
  };
}

/**
 * SVG client point to SVG coordinates
 * @param {SVGSVGElement} svg 
 * @param {PointerEvent|MouseEvent} evt 
 * @returns {{x:number, y:number}} SVG space coordinates
 */
export function toSvgPoint(svg, evt) {
  const point = svg.createSVGPoint();
  point.x = evt.clientX;
  point.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return point.matrixTransform(ctm.inverse());
}

/**
 * Start trace line visualization
 * @param {number} startX 
 * @param {number} startY 
 * @param {SVGSVGElement} svg 
 */
export function startTraceLine(startX, startY, svg) {
  if (activeTraceLine) activeTraceLine.remove();
  activeTraceLine = document.createElementNS(svg.namespaceURI, "polyline");
  activeTraceLine.setAttribute("fill", "none");
  activeTraceLine.setAttribute("stroke", "#2AA7FF");
  activeTraceLine.setAttribute("stroke-width", "5");
  activeTraceLine.setAttribute("stroke-linecap", "round");
  activeTraceLine.setAttribute("stroke-dasharray", "6 6");
  activeTraceLine.setAttribute("opacity", "0.9");
  activeTraceLine.setAttribute("points", `${startX},${startY}`);
  svg.appendChild(activeTraceLine);
  traceLastPoint = { x: startX, y: startY };
}

/**
 * Append point to trace line
 * @param {number} x 
 * @param {number} y 
 */
export function appendTracePoint(x, y) {
  if (!activeTraceLine) return;
  if (traceLastPoint && Math.hypot(x - traceLastPoint.x, y - traceLastPoint.y) < 5) return;
  const points = activeTraceLine.getAttribute("points") || "";
  activeTraceLine.setAttribute("points", `${points} ${x},${y}`);
  traceLastPoint = { x, y };
}

/**
 * Finish trace line
 */
export function finishTraceLine() {
  if (activeTraceLine) {
    activeTraceLine.remove();
    activeTraceLine = null;
  }
  traceLastPoint = null;
}

/**
 * Dispatch station info event
 * @param {Object} stop 
 * @param {string} source 
 */
export function dispatchStationInfo(stop, source = "tap") {
  window.dispatchEvent(new CustomEvent("jronda:station-info", {
    detail: { stopId: String(stop.stop_id), source },
  }));
}

