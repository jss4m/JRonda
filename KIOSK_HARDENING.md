# Local Offline Launcher Notes

This project is designed to run as a local offline transit viewer from a USB drive or desktop machine.

## Setup

1. Run the app via the bundled launcher (`start.bat` on Windows or `./start.sh` on Unix-like systems).
2. Keep the local server window open while the app is running.
3. Warm the service worker cache once before using the app offline.

## Recommended Usage

- Use the app in a browser launched from the local project folder.
- Keep the machine on a trusted local network or offline media.
- Treat the browser environment as a local app shell, not a hardened OS kiosk.

## Notes

The project is focused on transit data browsing and offline caching. It does not require additional security hardening in normal local use.
