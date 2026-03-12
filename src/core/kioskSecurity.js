const PIN_HASH_KEY = "jronda_kiosk_pin_hash_v1";
const UNLOAD_GUARD_KEY = "jronda_kiosk_unload_guard";
const LOCK_REASONS = {
  startup: "kiosk_locked",
  hidden: "session_hidden",
  fullscreen: "fullscreen_exited",
};

let kioskLocked = true;
let overlay = null;
let statusText = null;
let pinInput = null;
let allowFullscreenExit = false;
let keyboardLockEnabled = false;
let fullscreenEnforcerId = null;

const t = (key, fallback = "") => {
  if (typeof window !== "undefined" && window.jrondaI18n?.t) {
    return window.jrondaI18n.t(key, fallback);
  }
  return fallback || key;
};

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #jronda-kiosk-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(2, 6, 23, 0.94);
      font-family: "Segoe UI", Arial, sans-serif;
      color: #e2e8f0;
    }
    #jronda-kiosk-card {
      width: min(92vw, 420px);
      border: 1px solid #334155;
      border-radius: 14px;
      background: #0f172a;
      padding: 20px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.4);
    }
    #jronda-kiosk-title {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
    }
    #jronda-kiosk-status {
      margin: 0 0 12px;
      font-size: 14px;
      color: #cbd5e1;
    }
    #jronda-kiosk-pin {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #475569;
      border-radius: 10px;
      background: #020617;
      color: #f8fafc;
      font-size: 18px;
      padding: 12px;
      margin-bottom: 10px;
    }
    #jronda-kiosk-actions {
      display: flex;
      gap: 8px;
    }
    .jronda-kiosk-btn {
      flex: 1;
      border: 1px solid #3b82f6;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 700;
      cursor: pointer;
      background: #2563eb;
      color: #ffffff;
    }
    .jronda-kiosk-btn.alt {
      border-color: #475569;
      background: #1e293b;
    }
  `;
  document.head.appendChild(style);
}

function createOverlay() {
  overlay = document.createElement("div");
  overlay.id = "jronda-kiosk-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div id="jronda-kiosk-card" role="dialog" aria-modal="true" aria-label="${t("kiosk_lock_aria", "Kiosk lock")}">
      <h2 id="jronda-kiosk-title">${t("kiosk_lock_title", "Kiosk Locked")}</h2>
      <p id="jronda-kiosk-status"></p>
      <input id="jronda-kiosk-pin" type="password" inputmode="numeric" placeholder="${t("enter_admin_pin", "Enter admin PIN")}" autocomplete="off" />
      <div id="jronda-kiosk-actions">
        <button id="jronda-kiosk-unlock" class="jronda-kiosk-btn" type="button">${t("unlock", "Unlock")}</button>
        <button id="jronda-kiosk-fs" class="jronda-kiosk-btn alt" type="button">${t("fullscreen", "Fullscreen")}</button>
        <button id="jronda-kiosk-exit-fs" class="jronda-kiosk-btn alt" type="button">${t("exit_fullscreen", "Exit FS")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  statusText = document.getElementById("jronda-kiosk-status");
  pinInput = document.getElementById("jronda-kiosk-pin");

  document.getElementById("jronda-kiosk-unlock").addEventListener("click", unlockAttempt);
  document.getElementById("jronda-kiosk-fs").addEventListener("click", requestFullscreen);
  document.getElementById("jronda-kiosk-exit-fs").addEventListener("click", exitFullscreenWithPin);
  pinInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") unlockAttempt();
  });

  window.addEventListener("jronda:lang-changed", applyI18n);
  applyI18n();
}

function applyI18n() {
  if (!overlay) return;
  const card = document.getElementById("jronda-kiosk-card");
  const title = document.getElementById("jronda-kiosk-title");
  const unlockBtn = document.getElementById("jronda-kiosk-unlock");
  const fsBtn = document.getElementById("jronda-kiosk-fs");
  const exitBtn = document.getElementById("jronda-kiosk-exit-fs");
  if (card) card.setAttribute("aria-label", t("kiosk_lock_aria", "Kiosk lock"));
  if (title) title.textContent = t("kiosk_lock_title", "Kiosk Locked");
  if (pinInput) pinInput.setAttribute("placeholder", t("enter_admin_pin", "Enter admin PIN"));
  if (unlockBtn) unlockBtn.textContent = t("unlock", "Unlock");
  if (fsBtn) fsBtn.textContent = t("fullscreen", "Fullscreen");
  if (exitBtn) exitBtn.textContent = t("exit_fullscreen", "Exit FS");
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPin(pin) {
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const hash = await sha256(pin);
  return hash === stored;
}

window.jrondaVerifyKioskPin = verifyPin;

async function setupPinIfNeeded() {
  const existing = localStorage.getItem(PIN_HASH_KEY);
  if (existing) return;

  while (true) {
    const pin = window.prompt(t("set_admin_pin_prompt", "Set kiosk admin PIN (4-8 digits):"), "") || "";
    if (!/^\d{4,8}$/.test(pin)) {
      alert(t("pin_format_error", "PIN must be 4-8 digits."));
      continue;
    }
    const confirmPin = window.prompt(t("confirm_admin_pin_prompt", "Confirm admin PIN:"), "") || "";
    if (pin !== confirmPin) {
      alert(t("pin_mismatch", "PIN mismatch. Try again."));
      continue;
    }
    const hash = await sha256(pin);
    localStorage.setItem(PIN_HASH_KEY, hash);
    break;
  }
}

function showLock(reasonKey) {
  kioskLocked = true;
  if (!overlay) return;
  overlay.style.display = "flex";
  statusText.textContent = t(LOCK_REASONS[reasonKey] || LOCK_REASONS.startup, "Kiosk locked");
  pinInput.value = "";
  setTimeout(() => pinInput.focus(), 0);
  startFullscreenEnforcer();
}

function hideLock() {
  kioskLocked = false;
  if (!overlay) return;
  overlay.style.display = "none";
  startFullscreenEnforcer();
}

async function lockEscapeKey() {
  if (!("keyboard" in navigator) || !navigator.keyboard?.lock) return;
  try {
    await navigator.keyboard.lock(["Escape"]);
    keyboardLockEnabled = true;
  } catch {
    keyboardLockEnabled = false;
  }
}

async function unlockEscapeKey() {
  if (!("keyboard" in navigator) || !navigator.keyboard?.unlock) return;
  try {
    navigator.keyboard.unlock();
  } catch {}
  keyboardLockEnabled = false;
}

function stopFullscreenEnforcer() {
  if (fullscreenEnforcerId !== null) {
    clearInterval(fullscreenEnforcerId);
    fullscreenEnforcerId = null;
  }
}

function startFullscreenEnforcer() {
  if (allowFullscreenExit) return;
  if (fullscreenEnforcerId !== null) return;
  fullscreenEnforcerId = setInterval(() => {
    if (allowFullscreenExit) {
      stopFullscreenEnforcer();
      return;
    }
    if (!document.fullscreenElement) {
      requestFullscreen();
    }
  }, 250);
}

async function unlockAttempt() {
  const value = String(pinInput.value || "");
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = t("invalid_pin_format", "Invalid PIN format.");
    return;
  }
  const ok = await verifyPin(value);
  if (!ok) {
    statusText.textContent = t("invalid_pin", "Invalid PIN.");
    pinInput.value = "";
    return;
  }
  hideLock();
  requestFullscreen();
}

function requestFullscreen() {
  if (document.fullscreenElement) {
    lockEscapeKey();
    return;
  }
  const root = document.documentElement;
  if (root.requestFullscreen) {
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => lockEscapeKey())
      .catch(() => {});
  }
}

async function exitFullscreenWithPin() {
  const value = String(pinInput?.value || "");
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = t("enter_pin_exit_fullscreen", "Enter admin PIN to exit fullscreen.");
    return;
  }
  const ok = await verifyPin(value);
  if (!ok) {
    statusText.textContent = t("invalid_pin", "Invalid PIN.");
    pinInput.value = "";
    return;
  }
  allowFullscreenExit = true;
  stopFullscreenEnforcer();
  await unlockEscapeKey();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  hideLock();
}

function hardenShortcuts() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());
  document.addEventListener("selectstart", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    const k = String(e.key || "").toLowerCase();
    if (kioskLocked && !document.fullscreenElement) {
      e.preventDefault();
      requestFullscreen();
      return;
    }
    if (k === "escape") {
      e.preventDefault();
      showLock("fullscreen");
      requestFullscreen();
      return;
    }
    if (k === "f11" || k === "f12") {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && ["w", "t", "n", "l", "r", "p", "s", "u"].includes(k)) {
      e.preventDefault();
      return;
    }
    if (e.altKey && ["f4", "tab", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault();
    }
  }, true);
}

function armTabGuards() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") showLock("hidden");
  });
  window.addEventListener("blur", () => showLock("hidden"));
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      if (allowFullscreenExit) {
        allowFullscreenExit = false;
        stopFullscreenEnforcer();
        return;
      }
      showLock("fullscreen");
      requestFullscreen();
      setTimeout(() => {
        if (!document.fullscreenElement) requestFullscreen();
      }, 80);
      return;
    }
    lockEscapeKey();
    startFullscreenEnforcer();
  });
}

function armFullscreenReentryGesture() {
  const reenter = () => {
    if (!allowFullscreenExit && !document.fullscreenElement) {
      requestFullscreen();
    }
  };
  window.addEventListener("pointerdown", reenter, true);
  window.addEventListener("touchstart", reenter, { passive: true, capture: true });
  window.addEventListener("keydown", reenter, true);
}

function armUnloadGuard() {
  window.addEventListener("beforeunload", (event) => {
    if (sessionStorage.getItem(UNLOAD_GUARD_KEY) !== "off") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

async function initKioskSecurity() {
  if (window.location.search.includes("dev=1")) return;
  injectStyles();
  createOverlay();
  hardenShortcuts();
  armTabGuards();
  armFullscreenReentryGesture();
  armUnloadGuard();
  await setupPinIfNeeded();
  showLock("startup");
  requestFullscreen();
  startFullscreenEnforcer();
}

initKioskSecurity().catch(() => {});
