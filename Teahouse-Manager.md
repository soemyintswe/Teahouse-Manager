# Teahouse-Manager

Last updated: 2026-04-12

## 1) Project Snapshot
- Project: Teahouse Management System (Web + API + DB + Mobile/PWA usage)
- Repo structure:
  - `artifacts/min-khaung-rms` (Frontend, React + Vite)
  - `artifacts/api-server` (Backend, Express)
  - `lib/db` (Drizzle schema + DB layer)
- Cloud target:
  - Web: `https://teahouse-web.onrender.com`
  - API: `https://teahouse-api.onrender.com`
  - DB: Neon PostgreSQL

## 2) Major Progress Completed
- Floor Plan: table states, quick actions, layout edit/align/auto arrange, room tabs.
- Orders: table-based order flow, menu add-to-cart, order history/filter, delivery order flow.
- KDS: station-based display + item ready flow + cancel/delay handling baseline.
- Menu Management: full CRUD, station/category, image + QR preview/link behaviors.
- Table Settings: table CRUD + room settings + status/capacity/category/booked support.
- Auth/Roles:
  - Staff login, guest table access, customer login + first-login password change.
  - Role-based menu/page access.
- i18n: English/Myanmar support across core pages.
- Cashier: payment flow + wallet selection + QR payment payload.
- Finance page: functional (no longer under construction).
- Inventory page: functional CRUD baseline.

## 3) Recent Critical Fixes (latest)
- Customer account register/approve/reset flow stabilized.
- Added customer `email` field in schema + compatibility migration.
- Added Account Activate/Password Reset notification service:
  - Email provider: `resend` or `log`
  - SMS provider: `twilio` or `log`
- Staff page now shows customer email + notification result summary on approve/reset.
- Cashier receipt enhancement:
  - Soft copy receipt view
  - Hard copy print action
  - New API endpoint: `GET /api/payments/order/:orderId/latest`

Recent commits:
- `1ff839a` Feature: Account activate/reset email SMS notifications
- `041f7a0` Feature: Add cashier receipt API and soft/hard print actions

## 4) Environment Variables (Render API service)
- Core:
  - `DATABASE_URL`
  - `CORS_ORIGINS`
  - `AUTH_SECRET`
- Image upload (Google Drive path currently in use):
  - `GOOGLE_DRIVE_CLIENT_EMAIL`
  - `GOOGLE_DRIVE_PRIVATE_KEY`
  - `GOOGLE_DRIVE_FOLDER_ID` (optional)
- Notification:
  - `NOTIFY_EMAIL_PROVIDER` = `log` or `resend`
  - `NOTIFY_SMS_PROVIDER` = `log` or `twilio`
  - If `resend`: `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_REPLY_TO` (optional)
  - If `twilio`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`

Render Web service:
- `VITE_API_BASE_URL=https://teahouse-api.onrender.com`

## 5) Known Business Requirements Logged (from discussion)
- Account lifecycle:
  - Activate/Reset should notify by Email/SMS. (Implemented baseline)
- Operations:
  - Waiter can trigger table-ready/cleaning notification and actions.
  - Payment completion should support receipt (soft/hard). (Implemented baseline)
- Table advanced operations:
  - Merge nearby free tables into a group bill.
  - Split bill by person/group (American style).
  - Shared seating on a single table with separate order/payment/cleaning lifecycle.
- Delivery:
  - Customer registration/login with address structure + order tracking.
  - Admin approve/deny/terminate/reset customer accounts.

## 6) Phase Plan (for next implementation turns)

### Phase A (in progress, partially done)
- Done:
  - Account Active/Reset + Email/SMS notifications baseline.
  - Cashier receipt soft/hard copy baseline.
- Next in A:
  - Add notification template customization in Settings.
  - Add delivery of notification status logs/history UI.

### Phase B (table/group/billing advanced)
- Group table merge with adjacency constraints.
- Group order + single bill for merged tables.
- Split bill by person/group on same table.
- Persist full finance/audit records for merge/split operations.

### Phase C (shared seating and operational parallel flows)
- Seat-slot/session model for one table, multiple independent customer groups.
- Independent order/payment/checkout/cleaning per slot/group.
- Occupancy visualization + waiter/cleaner workflow automation.

## 7) Recommended Safe Workflow
1. Code change -> local `typecheck` + `build`.
2. Commit -> push `main`.
3. Render auto-deploy (On Commit) wait for API+Web green.
4. Quick smoke tests:
   - `/login`, `/staff`, `/orders`, `/cashier`, `/delivery-orders`, `/finance`.
5. If DB mismatch appears:
   - run `pnpm -C lib/db run push`
   - run `pnpm seed` if required.

## 8) Notes for Future Sessions
- Keep changes incremental to avoid large-context breakage.
- Prefer backward-compatible DB updates (`db-compat` + Drizzle schema sync).
- When user asks “commit + push”, execute directly after validation.
- Prioritize runtime-safe error responses (avoid raw HTML 500 leaks to UI).

