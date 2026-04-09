# Teahouse Management System

React + Express + PostgreSQL based teahouse management platform.

## Monorepo Structure

- `artifacts/min-khaung-rms`: Frontend (Vite + React)
- `artifacts/api-server`: Backend API server (Express)
- `lib/db`: Drizzle schema + database access
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`: API contract + generated clients

## Local Development

1. Install dependencies

```bash
pnpm install
```

2. Set root `.env` with your PostgreSQL connection:

```env
DATABASE_URL=postgresql://...
PORT=3001
```

3. Push schema and seed data

```bash
pnpm -C lib/db run push
pnpm seed
```

4. Start frontend + backend

```bash
pnpm dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

---

## Render + Neon Deployment (Recommended)

This repo now includes [render.yaml](./render.yaml) for one-click Render Blueprint setup:

- `teahouse-api` (Node web service)
- `teahouse-web` (static site)

### 1) Create Neon Database

1. Create a project in Neon.
2. Copy the connection string (with SSL mode enabled).

### 2) Deploy on Render

1. In Render, select **New +** -> **Blueprint**.
2. Connect this GitHub repo.
3. Render reads `render.yaml` and creates both services.
4. Set required env vars:

`teahouse-api`:
- `DATABASE_URL` = your Neon connection string
- `CORS_ORIGINS` = frontend URL (example: `https://teahouse-web.onrender.com`)
- `AUTH_SECRET` = long random secret for login tokens
- `GOOGLE_DRIVE_CLIENT_EMAIL` = service account client email (for menu image upload)
- `GOOGLE_DRIVE_PRIVATE_KEY` = service account private key (keep `\n` line breaks)
- `GOOGLE_DRIVE_FOLDER_ID` = optional Drive folder id for uploaded menu images

`teahouse-web`:
- `VITE_API_BASE_URL` = API URL (example: `https://teahouse-api.onrender.com`)

### 3) Run DB Push + Seed (one-time)

From your machine (with the same `DATABASE_URL`):

```bash
pnpm -C lib/db run push
pnpm seed
```

After this, your app is cloud-only and no longer depends on local `192.168.x.x` server.

---

## Android APK (Capacitor)

Frontend APK build lives in `artifacts/min-khaung-rms`.

Use cloud API URL when building:

```bash
VITE_API_BASE_URL=https://teahouse-api.onrender.com pnpm -C artifacts/min-khaung-rms run build
pnpm -C artifacts/min-khaung-rms exec cap sync android
cd artifacts/min-khaung-rms/android
./gradlew assembleDebug
```
