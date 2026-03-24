/**
 * JRonda Kiosk Security Module
 * Provides PIN-based access control with rate limiting and audit logging
 */

// ======= Configuration =======
const SECURITY_CONFIG = {
  pinLength: { min: 4, max: 8 },
  lockoutAttempts: 5,
  lockoutDuration: 30000,      // 30 seconds lockout after max attempts
  autoLockTimeout: 120000,       // 2 minutes of inactivity before auto-lock
  auditLogMaxEntries: 50,       // Keep last 50 security events
};

const PIN_HASH_KEY = "jronda_kiosk_pin_hash_v1";
const UNLOAD_GUARD_KEY = "jronda_kiosk_unload_guard";
const AUDIT_LOG_KEY = "jronda_security_audit_log";
const LOCKOUT_KEY = "jronda_kiosk_lockout";
const LOCK_REASONS = {
  startup: "kiosk_locked",
  hidden: "session_hidden",
  fullscreen: "fullscreen_exited",
};

// ======= State =======
let kioskLocked = true;
let overlay = null;
let statusText = null;
let pinInput = null;
let allowFullscreenExit = false;

function __coreDebug(...args) {
  // no-op in production
}
let keyboardLockEnabled = false;
let fullscreenEnforcerId = null;

// ======= Rate Limiting =======
function getLockoutState() {
  try {
    const data = localStorage.getItem(LOCKOUT_KEY);
    return data ? JSON.parse(data) : { attempts: 0, lockedUntil: null };
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function setLockoutState(state) {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
}

function isLockedOut() {
  const state = getLockoutState();
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return true;
  }
  // Reset if lockout expired
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    setLockoutState({ attempts: 0, lockedUntil: null });
  }
  return false;
}

function recordFailedAttempt() {
  const state = getLockoutState();
  state.attempts += 1;
  
  if (state.attempts >= SECURITY_CONFIG.lockoutAttempts) {
    state.lockedUntil = Date.now() + SECURITY_CONFIG.lockoutDuration;
    logSecurityEvent('lockout', `Locked out after ${state.attempts} failed attempts`);
  }
  
  setLockoutState(state);
  return state.attempts;
}

function resetFailedAttempts() {
  setLockoutState({ attempts: 0, lockedUntil: null });
}

// ======= Audit Logging =======
function logSecurityEvent(event, details) {
  try {
    const logs = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
    
    logs.unshift({
      timestamp: new Date().toISOString(),
      event,
      details,
    });
    
    // Keep only the last N entries
    const trimmed = logs.slice(0, SECURITY_CONFIG.auditLogMaxEntries);
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(trimmed));
  } catch (e) {
    __coreDebug('Failed to log security event:', e);
  }
}

export function getSecurityAuditLog(limit = 10) {
  try {
    const logs = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
    return logs.slice(0, limit);
  } catch {
    return [];
  }
}

// ======= i18n Helper =======
const t = (key, fallback = "") => {
  if (typeof window !== "undefined" && window.jrondaI18n?.t) {
    return window.jrondaI18n.t(key, fallback);
  }
  return fallback || key;
};

// ======= Styles =======
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
      font-family: "Outfit", "Segoe UI", Arial, sans-serif;
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
    #jronda-kiosk-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    #jronda-kiosk-brand .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
      flex-shrink: 0;
    }
    #jronda-kiosk-brand .brand-icon svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #jronda-kiosk-brand .brand-text {
      font-size: 18px;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    #jronda-kiosk-brand .brand-text .r {
      background: linear-gradient(135deg, #7c3aed, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
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
    #jronda-kiosk-status.error {
      color: #f87171;
    }
    #jronda-kiosk-status.warning {
      color: #fbbf24;
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
    .jronda-kiosk-btn:disabled {
      background: #475569;
      border-color: #475569;
      cursor: not-allowed;
    }
    .jronda-kiosk-btn.alt {
      border-color: #475569;
      background: #1e293b;
    }
    .jronda-kiosk-attempts {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 8px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

// ======= UI Creation =======
function createOverlay() {
  overlay = document.createElement("div");
  overlay.id = "jronda-kiosk-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div id="jronda-kiosk-card" role="dialog" aria-modal="true" aria-label="${t("kiosk_lock_aria", "Kiosk lock")}">
      <div id="jronda-kiosk-brand">
        <div class="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5"/><line x1="8" y1="1" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="15"/><line x1="1" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="5.2" y2="5.2"/><line x1="10.8" y1="10.8" x2="12.9" y2="12.9"/></svg>
        </div>
        <div class="brand-text">J<span class="r">R</span>onda</div>
      </div>
      <h2 id="jronda-kiosk-title">${t("kiosk_lock_title", "Kiosk Locked")}</h2>
      <p id="jronda-kiosk-status"></p>
      <input id="jronda-kiosk-pin" type="password" inputmode="text" pattern="[0-9]*" placeholder="${t("enter_admin_pin", "Enter admin PIN")}" autocomplete="off" />
      <div id="jronda-kiosk-actions">
        <button id="jronda-kiosk-unlock" class="jronda-kiosk-btn" type="button">${t("unlock", "Unlock")}</button>
        <button id="jronda-kiosk-fs" class="jronda-kiosk-btn alt" type="button">${t("fullscreen", "Fullscreen")}</button>
        <button id="jronda-kiosk-exit-fs" class="jronda-kiosk-btn alt" type="button">${t("exit_fullscreen", "Exit FS")}</button>
      </div>
      <div id="jronda-kiosk-attempts" class="jronda-kiosk-attempts"></div>
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

// ======= Crypto =======
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPin(pin) {
  const normalizedPin = pin.toString().replace(/\D/g, '');
  if (!/^\d{4,8}$/.test(normalizedPin)) return false;
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const hash = await sha256(normalizedPin);
  return hash === stored;
}

window.jrondaVerifyKioskPin = verifyPin;

async function changePinWithPrompt() {
  const current = window.prompt(t("enter_admin_pin", "Enter admin PIN:"), "") || "";
  if (!current) return false;
  const ok = await verifyPin(current);
  if (!ok) {
    alert(t("invalid_passkey_update", "Invalid passkey for kiosk station update."));
    return false;
  }
  const pin = window.prompt(t("set_admin_pin_prompt", "Set kiosk admin PIN (4-8 digits):"), "") || "";
  if (!/^\d{4,8}$/.test(pin)) {
    alert(t("pin_format_error", "PIN must be 4-8 digits."));
    return false;
  }
  const confirmPin = window.prompt(t("confirm_admin_pin_prompt", "Confirm admin PIN:"), "") || "";
  if (pin !== confirmPin) {
    alert(t("pin_mismatch", "PIN mismatch. Try again."));
    return false;
  }
  const hash = await sha256(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
  return true;
}

window.jrondaChangeKioskPin = changePinWithPrompt;

// ======= PIN Setup =======
async function setupPinIfNeeded() {
  const existing = localStorage.getItem(PIN_HASH_KEY);
  if (existing) return;

  logSecurityEvent('pin_setup', 'Initial PIN setup started');

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
    logSecurityEvent('pin_setup', 'PIN successfully configured');
    break;
  }
}

// ======= Lock/Unlock =======
function showLock(reasonKey) {
  kioskLocked = true;
  if (!overlay) return;
  overlay.style.display = "flex";
  statusText.textContent = t(LOCK_REASONS[reasonKey] || LOCK_REASONS.startup, "Kiosk locked");
  statusText.className = "";
  pinInput.value = "";
  
  updateAttemptsDisplay();
  
  // Check if locked out
  if (isLockedOut()) {
    const state = getLockoutState();
    const remainingSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    statusText.textContent = `Too many attempts. Try again in ${remainingSeconds}s`;
    statusText.className = "warning";
    pinInput.disabled = true;
    document.getElementById("jronda-kiosk-unlock").disabled = true;
    
    // Auto-refresh when lockout expires
    setTimeout(() => {
      if (!kioskLocked) return;
      const state = getLockoutState();
      if (!state.lockedUntil || Date.now() >= state.lockedUntil) {
        pinInput.disabled = false;
        document.getElementById("jronda-kiosk-unlock").disabled = false;
        statusText.textContent = t(LOCK_REASONS[reasonKey] || LOCK_REASONS.startup, "Kiosk locked");
        statusText.className = "";
        updateAttemptsDisplay();
      }
    }, Math.max(1000, remainingSeconds * 1000));
  } else {
    pinInput.disabled = false;
    document.getElementById("jronda-kiosk-unlock").disabled = false;
  }
  
  setTimeout(() => pinInput.focus(), 0);
  startFullscreenEnforcer();
}

function hideLock() {
  kioskLocked = false;
  if (!overlay) return;
  overlay.style.display = "none";
  resetFailedAttempts();
  updateAttemptsDisplay();
  startFullscreenEnforcer();
}

function updateAttemptsDisplay() {
  const attemptsEl = document.getElementById("jronda-kiosk-attempts");
  if (!attemptsEl) return;
  
  const state = getLockoutState();
  const remaining = SECURITY_CONFIG.lockoutAttempts - state.attempts;
  
  if (remaining < SECURITY_CONFIG.lockoutAttempts) {
    attemptsEl.textContent = `${remaining} ${t("attempts_remaining", "attempts remaining")}`;
  } else {
    attemptsEl.textContent = "";
  }
}

// ======= Keyboard Lock =======
async function lockEscapeKey() {
  if (!("keyboard" in navigator) || !navigator.keyboard?.lock) {
    __coreDebug("Keyboard Lock API not available - using fallback");
    keyboardLockEnabled = false;
    return;
  }
  try {
    await navigator.keyboard.lock(["Escape"]);
    keyboardLockEnabled = true;
    logSecurityEvent('keyboard_lock', 'Enabled');
  } catch (e) {
    __coreDebug("Keyboard lock failed:", e);
    keyboardLockEnabled = false;
  }
}

async function unlockEscapeKey() {
  if (!("keyboard" in navigator) || !navigator.keyboard?.unlock) return;
  try {
    navigator.keyboard.unlock();
    keyboardLockEnabled = false;
    logSecurityEvent('keyboard_lock', 'Disabled');
  } catch (e) {
    __coreDebug("Keyboard unlock failed:", e);
  }
}

// ======= Fullscreen =======
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
  // Check if locked out first
  if (isLockedOut()) {
    const state = getLockoutState();
    const remainingSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    statusText.textContent = `Too many attempts. Try again in ${remainingSeconds}s`;
    statusText.className = "warning";
    return;
  }
  
  const value = pinInput.value.toString().replace(/\D/g, '');
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = t("invalid_pin_format", "Invalid PIN format.");
    statusText.className = "error";
    return;
  }
  
  const ok = await verifyPin(value);
  
  if (!ok) {
    const attempts = recordFailedAttempt();
    const remaining = SECURITY_CONFIG.lockoutAttempts - attempts;
    
    if (remaining > 0) {
      statusText.textContent = t("invalid_pin", `Invalid PIN. ${remaining} attempts remaining.`);
    } else {
      const state = getLockoutState();
      const waitSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
      statusText.textContent = `Too many attempts. Try again in ${waitSeconds}s`;
      statusText.className = "warning";
    }
    statusText.className = "error";
    pinInput.value = "";
    logSecurityEvent('unlock_failed', `Failed attempt ${attempts}/${SECURITY_CONFIG.lockoutAttempts}`);
    return;
  }
  
  // Successful unlock
  resetFailedAttempts();
  logSecurityEvent('unlock_success', 'Kiosk unlocked successfully');
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
      .then(() => {
        lockEscapeKey();
        logSecurityEvent('fullscreen', 'Entered fullscreen');
      })
      .catch((e) => {
        __coreDebug("Fullscreen request failed:", e);
        logSecurityEvent('fullscreen_error', `Failed: ${e.message}`);
      });
  }
}

async function exitFullscreenWithPin() {
  const value = (pinInput?.value || '').toString().replace(/\D/g, '');
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = t("enter_pin_exit_fullscreen", "Enter admin PIN to exit fullscreen.");
    statusText.className = "error";
    return;
  }
  const ok = await verifyPin(value);
  if (!ok) {
    const attempts = recordFailedAttempt();
    statusText.textContent = t("invalid_pin", `Invalid PIN. ${SECURITY_CONFIG.lockoutAttempts - attempts} attempts remaining.`);
    statusText.className = "error";
    pinInput.value = "";
    logSecurityEvent('exit_fs_failed', 'Invalid PIN for exit');
    return;
  }
  
  allowFullscreenExit = true;
  stopFullscreenEnforcer();
  await unlockEscapeKey();
  
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  
  logSecurityEvent('fullscreen', 'Exited fullscreen');
  hideLock();
}

// ======= Security Hardening =======
function hardenShortcuts() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());
  document.addEventListener("selectstart", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    const k = String(e.key || "").toLowerCase();
    
    // F11 and F12 always blocked
    if (k === "f11" || k === "f12") {
      e.preventDefault();
      return;
    }
    
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
    
    // Ctrl key combinations
    if (e.ctrlKey && ["w", "t", "n", "l", "r", "p", "s", "u"].includes(k)) {
      e.preventDefault();
      return;
    }
    
    // Alt key combinations (including Alt+Tab simulation)
    if (e.altKey && ["f4", "tab", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault();
    }
  }, true);
}

// ======= Tab/Visibility Guards =======
function armTabGuards() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      logSecurityEvent('visibility', 'Tab hidden - locking');
      showLock("hidden");
    }
  });
  
  window.addEventListener("blur", () => {
    logSecurityEvent('focus', 'Window lost focus - locking');
    showLock("hidden");
  });
  
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      if (allowFullscreenExit) {
        allowFullscreenExit = false;
        stopFullscreenEnforcer();
        return;
      }
      logSecurityEvent('fullscreen', 'Fullscreen exited - re-locking');
      showLock("fullscreen");
      setTimeout(() => {
        if (!document.fullscreenElement) requestFullscreen();
      }, 80);
      return;
    }
    lockEscapeKey();
    startFullscreenEnforcer();
  });
}

// ======= Fullscreen Re-entry =======
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

// ======= Unload Guard =======
function armUnloadGuard() {
  window.addEventListener("beforeunload", (event) => {
    if (sessionStorage.getItem(UNLOAD_GUARD_KEY) !== "off") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

// ======= Export for external use =======
export { SECURITY_CONFIG };

// ======= Initialization =======
async function initKioskSecurity() {
  if (window.location.search.includes("dev=1")) return;
  
  logSecurityEvent('init', 'Kiosk security initializing');
  
  injectStyles();
  createOverlay();
  hardenShortcuts();
  armTabGuards();
  armFullscreenReentryGesture();
  armUnloadGuard();
  await setupPinIfNeeded();
  
  logSecurityEvent('init_complete', 'Ready for lock');
  // showLock("startup"); // Temporarily disabled for debugging
  // requestFullscreen(); // Temporarily disabled
  // startFullscreenEnforcer(); // Temporarily disabled
}

initKioskSecurity().catch((e) => {
  console.error("Kiosk security init failed:", e);
  logSecurityEvent('init_error', `Failed: ${e.message}`);
});
