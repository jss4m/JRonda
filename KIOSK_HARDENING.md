# Kiosk Hardening Guide

This app now includes in-browser kiosk controls:
- fullscreen enforcement,
- PIN lock on focus/tab loss,
- blocked context menu and common escape shortcuts,
- unload guard.

Important: browser-only code cannot fully prevent OS-level app switching.  
For true kiosk security, combine app lock with OS kiosk mode.

## Minimum Security Baseline

1. Run app via local server (`start-kiosk.bat` or `start-usb.bat`).
2. Set admin PIN on first launch.
3. Keep service-worker cache warmed once before going offline.
4. Disable host OS notifications and system gestures where possible.

## Windows (recommended)

Use Assigned Access (single-app kiosk):
1. Create dedicated kiosk user.
2. Set Edge/Chrome kiosk mode with `start-kiosk.bat`.
3. Enable Windows Assigned Access for that browser.
4. Restrict Task Manager, Win key, and shell access via local policy.

## Android

Browser tab alone is not enough. Use one of:
- Device Owner mode + Lock Task Mode (MDM),
- dedicated kiosk browser (e.g. Fully Kiosk Browser / SureLock).

Recommended:
1. Pin app in kiosk launcher.
2. Disable status bar pull-down, recents, and external app intents.
3. Enable auto-relaunch on crash/reboot.
4. Keep `http://localhost:8080` as startup URL if using local server app, or use a packaged WebView app.

## iPadOS / iOS

Use Guided Access or MDM Single App Mode.

## Linux

Use kiosk session (Chromium --kiosk) + window manager restrictions.

## Notes on Identification

This implementation requires PIN re-authentication when:
- fullscreen exits,
- app loses focus,
- tab visibility changes.

That protects session continuity, but OS-level controls are still mandatory for anti-escape guarantees.
