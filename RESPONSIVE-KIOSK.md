# Responsive Kiosk Core Implementation

## Layout Grid (Core)
```
#kiosk-root (CSS grid, core/ ui.js + kiosk.css)
├─ #map-container (1fr landscape / 70vh portrait)
│  └─ SVG map + bottom legend dock
└─ #sidebar (380px→30vw landscape / 30vh portrait)
   └─ Legend/results/toasts
```

## CSS Media Queries (kiosk.css)
```
@media (orientation: landscape) {
  grid-template-columns: 1fr 380px;
}
@media (orientation: portrait) {
  grid-template-rows: 70vh 30vh;
}
@media (max-width: 768px) { kiosk-fullscreen }
```

## Core Logic (ui.js / interaction.js)
```
export function adaptLayout() {
  const isLandscape = window.innerWidth > window.innerHeight;
  root.style.gridTemplateColumns = isLandscape ? '1fr 380px' : 'none';
  root.style.gridTemplateRows = isLandscape ? 'none' : '70vh 30vh';
  legendDock.style.position = isLandscape ? 'static' : 'fixed';
  legendDock.style.bottom = '0';
  sidebar.classList.toggle('landscape', isLandscape);
}
window.addEventListener('resize', adaptLayout);
adaptLayout();
```

## Legend Dock (Always Visible)
```
bottom: 0, full-width under map/sidebar
- Toggle buttons (bus/rail category)
- Route legend (8 lines max)
```

**Status**: Core responsive plan approved/implemented. Add to kiosk.css/ui.js.

Test: Rotate device → map/sidebar adapt, legend docks bottom.
