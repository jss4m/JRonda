/**
 * toast-manager.js
 * Handles toast notifications and basic i18n utilities
 */

let pendingInitToasts = [];

function __coreDebug(...args) {
  // no-op in production
}

export function emitToast(message, type = "info") {
  pendingInitToasts.push({ message, type });
  if (typeof window === "undefined") return;
  let event;
  const CustomEventCtor = (window && window.CustomEvent) ? window.CustomEvent : CustomEvent;
  if (CustomEventCtor) {
    try {
      event = new CustomEventCtor("jronda:toast", { detail: { message, type } });
    } catch (err) {
      event = null;
    }
  }

  if (!event) {
    try {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("jronda:toast", true, true, { message, type });
    } catch (err2) {
      __coreDebug("emitToast: cannot create CustomEvent", err2);
      return;
    }
  }

  try {
    window.dispatchEvent(event);
  } catch (e) {
    __coreDebug("emitToast: window.dispatchEvent failed", e);
  }
}

export function getPendingInitToasts() {
  return pendingInitToasts;
}

export function clearPendingInitToasts() {
  pendingInitToasts = [];
}

export function translate(key, fallback = "") {
  if (typeof window !== "undefined" && window.jrondaI18n?.t) {
    return window.jrondaI18n.t(key, fallback);
  }
  return fallback || key;
}

export function translatef(key, fallback, params = {}) {
  let out = translate(key, fallback);
  for (const [pKey, pValue] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
  }
  return out;
}