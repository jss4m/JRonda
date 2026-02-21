const PIN_HASH_KEY = "jronda_kiosk_pin_hash_v1";
const UNLOAD_GUARD_KEY = "jronda_kiosk_unload_guard";
const LOCK_REASONS = {
  startup: "Kiosk locked",
  hidden: "Session hidden. Re-identification required.",
  fullscreen: "Fullscreen exited. Re-identification required.",
};

let kioskLocked = true;
let overlay = null;
let statusText = null;
let pinInput = null;
let allowFullscreenExit = false;

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
    <div id="jronda-kiosk-card" role="dialog" aria-modal="true" aria-label="Kiosk lock">
      <h2 id="jronda-kiosk-title">Kiosk Locked</h2>
      <p id="jronda-kiosk-status"></p>
      <input id="jronda-kiosk-pin" type="password" inputmode="numeric" placeholder="Enter admin PIN" autocomplete="off" />
      <div id="jronda-kiosk-actions">
        <button id="jronda-kiosk-unlock" class="jronda-kiosk-btn" type="button">Unlock</button>
        <button id="jronda-kiosk-fs" class="jronda-kiosk-btn alt" type="button">Fullscreen</button>
        <button id="jronda-kiosk-exit-fs" class="jronda-kiosk-btn alt" type="button">Exit FS</button>
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
    const pin = window.prompt("Set kiosk admin PIN (4-8 digits):", "") || "";
    if (!/^\d{4,8}$/.test(pin)) {
      alert("PIN must be 4-8 digits.");
      continue;
    }
    const confirmPin = window.prompt("Confirm admin PIN:", "") || "";
    if (pin !== confirmPin) {
      alert("PIN mismatch. Try again.");
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
  statusText.textContent = LOCK_REASONS[reasonKey] || LOCK_REASONS.startup;
  pinInput.value = "";
  setTimeout(() => pinInput.focus(), 0);
}

function hideLock() {
  kioskLocked = false;
  if (!overlay) return;
  overlay.style.display = "none";
}

async function unlockAttempt() {
  const value = String(pinInput.value || "");
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = "Invalid PIN format.";
    return;
  }
  const ok = await verifyPin(value);
  if (!ok) {
    statusText.textContent = "Invalid PIN.";
    pinInput.value = "";
    return;
  }
  hideLock();
  requestFullscreen();
}

function requestFullscreen() {
  if (document.fullscreenElement) return;
  const root = document.documentElement;
  if (root.requestFullscreen) {
    root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }
}

async function exitFullscreenWithPin() {
  const value = String(pinInput?.value || "");
  if (!/^\d{4,8}$/.test(value)) {
    statusText.textContent = "Enter admin PIN to exit fullscreen.";
    return;
  }
  const ok = await verifyPin(value);
  if (!ok) {
    statusText.textContent = "Invalid PIN.";
    pinInput.value = "";
    return;
  }
  allowFullscreenExit = true;
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
  });
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
        return;
      }
      showLock("fullscreen");
      requestFullscreen();
    }
  });
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
  armUnloadGuard();
  await setupPinIfNeeded();
  showLock("startup");
  requestFullscreen();
}

initKioskSecurity().catch(() => {});
