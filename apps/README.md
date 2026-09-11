# Omnisect apps

## Layout

```
Omnisect/
  apps/
    desktop/     # Tauri (Rust) desktop shell — spawns Express locally
    mobile/      # Capacitor mobile client — talks to desktop/server backend
  backend/       # Express API + scanner orchestration
  frontend/      # Shared React UI (web + desktop + mobile)
  shared/        # Shared types
  scripts/       # Dev helpers
```

Path overrides (optional):

| Env | Purpose |
|-----|---------|
| `OMNISECT_ROOT` | Repo root |
| `OMNISECT_TOOLS_DIR` | Scanner binaries / scripts / wordlists |
| `OMNISECT_DATA_DIR` | Jobs, auth, scope, planner data |
| `SURFACE_MAPPER_BIN` | surface-mapper executable |
| `HOST` | Backend bind address (`0.0.0.0` for mobile LAN) |
| `PORT` | Backend port (default `3001`) |
| `ALLOWED_ORIGINS` | CORS list, or `*` |

## Web (existing)

```powershell
npm run dev
```

## Desktop (Tauri)

```powershell
npm --prefix apps/desktop install
npm run dev:desktop
```

The desktop shell starts `backend/server.js` with Node and loads the React UI.
Use **Auth / Connection** in the UI if the API URL or key needs adjusting.

Build installers:

```powershell
npm run build:desktop
```

## Mobile (Capacitor companion)

Mobile does **not** run scanners locally. Point it at a desktop/server backend:

1. On the scanning machine:

```powershell
$env:HOST = "0.0.0.0"
npm run dev:backend
```

2. Build + sync the mobile shell:

```powershell
npm --prefix apps/mobile install
npm run mobile:add:android   # once
npm run mobile:sync
npm run mobile:open:android
```

3. In the app, open **Connection** and set:
   - Server URL: `http://<desktop-lan-ip>:3001`
   - API key from the backend startup log

iOS requires macOS + Xcode (`npm run mobile:add:ios` / `open:ios`).
