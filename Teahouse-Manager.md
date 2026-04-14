# Teahouse-Manager

Last updated: 2026-04-15

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
- Phase A complete:
  - Notification template customization in settings.
  - Notification logs/history UI and API flow.
- Phase B complete:
  - Group table merge with adjacency/business constraints.
  - Split billing flow + merge/split finance audit records.
- Phase C complete:
  - Shared seating session/slot model on one table.
  - Independent order/payment/checkout/cleaning flow per group.
  - Occupancy and workflow automation support.
- Booking + Business Hours update complete:
  - Dedicated `table_bookings` schema and booking APIs.
  - Time-slot booking with required `slotStartAt`/`slotEndAt`.
  - Booking lead-time (default 60 mins) configurable from settings.
  - Business open/close time + closed weekdays/dates settings page.
  - Payment-gated confirmation (`bookingFeePaid` + `preorderAmountPaid` required for `confirmed`).
  - Auto-cancel for no-show and expired slots, with table availability sync.
  - Booking extension flow with proportional fee increase.
  - Floor Plan now shows reserved customer name + phone.
  - Booking lifecycle timestamps persisted: booking/create, check-in, order start, check-out.

## 3) Recent Critical Fixes (latest)
- Booking engine and business-hours controls integrated end-to-end.
- Added `table_bookings` data model and DB compatibility handling.
- Added booking routes:
  - `GET /bookings/active`
  - `GET /bookings`
  - `POST /bookings`
  - `PATCH /bookings/:id/payment-status`
  - `POST /bookings/:id/extend`
  - `POST /bookings/:id/check-in`
  - `POST /bookings/:id/check-out`
  - `POST /bookings/:id/cancel`
- Added business-hours routes:
  - `GET /settings/business-hours`
  - `PATCH /settings/business-hours`
- Booking safety integration added into auth/order/table flows:
  - auto-cancel runner invoked before booking-sensitive actions.
  - table `isBooked` synced to booking state.
  - booking `orderAt` and `checkOutAt` synced from order/table lifecycle.
- Frontend updates:
  - New Bookings page.
  - Customer booking flow now uses zone tabs (`Hall Zone`, `Air-con Room`, `Outside`) and allows selection from available tables only.
  - Customer booking layout zone selection now feeds directly into order handoff (`/orders?tableId=...&scan=1`).
  - New Business Hours settings page.
  - Floor Plan reserved table cards now show customer name and phone.
  - i18n updates (EN/MM) for booking/business-hours/floor-plan labels and toasts.
- Existing account lifecycle and receipt features remain stable:
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
- Verification snapshot:
  - `pnpm run typecheck` passed.
  - `pnpm run build` passed.

Recent commits:
- `43a6e1f` Feature(customer): add table-booking flow with layout and order handoff
- `430df39` Booking Update
- `5ca9eba` Feature: Phase C shared seating sessions and workflow automation
- `a975bae` Feature: Phase B table merge, split billing, and audit trails
- `e0afc21` Feature: Phase A settings templates and notification history
- `3e6e346` Docs: Add consolidated Teahouse Manager project notes
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

## 5) Known Business Requirements Status (from discussion)
- Account lifecycle:
  - Activate/Reset should notify by Email/SMS. (Implemented)
- Operations:
  - Waiter can trigger table-ready/cleaning notification and actions. (Implemented baseline)
  - Payment completion should support receipt (soft/hard). (Implemented)
- Table advanced operations:
  - Merge nearby free tables into a group bill. (Implemented)
  - Split bill by person/group (American style). (Implemented)
  - Shared seating on a single table with separate order/payment/cleaning lifecycle. (Implemented)
- Booking/time controls:
  - Booking must include a time slot. (Implemented)
  - Minimum lead time must be configurable by admin. (Implemented via business-hours settings)
  - Business open/close + closed days must be configurable. (Implemented)
  - No-show auto-cancel after grace window (default 15 mins). (Implemented, admin configurable)
  - Extend booking time with proportional booking-fee adjustment. (Implemented)
  - On expiry without check-in, booking auto-cancels and table becomes available. (Implemented)
  - Floor Plan must show booked customer name + phone. (Implemented)
  - Booking allowed only when table is available. (Implemented)
  - Persist booking/check-in/order/check-out timestamps. (Implemented)
  - Confirm booking only after booking fee + preorder are paid. (Implemented)
  - Myanmar i18n compatibility for new flow. (Implemented)
- Delivery:
  - Customer registration/login with address structure + order tracking.
  - Admin approve/deny/terminate/reset customer accounts. (Approve/reset implemented baseline)

## 6) Phase Plan Status

### Phase A (completed)
- Account Active/Reset + Email/SMS notifications.
- Notification template settings and notification logs/history.
- Cashier receipt soft/hard copy flow.

### Phase B (completed)
- Group table merge with adjacency constraints.
- Group order + single bill for merged tables.
- Split bill by person/group on same table.
- Finance/audit records for merge/split operations.

### Phase C (completed)
- Seat-slot/session model for one table, multiple independent customer groups.
- Independent order/payment/checkout/cleaning per slot/group.
- Occupancy visualization + waiter/cleaner workflow automation.

### Current Follow-up Track (post A/B/C)
- Harden booking analytics and reporting (no-show rate, extension revenue, peak-slot trends).
- Add optional checked-in extension workflow if required by operations policy.
- Continue delivery/customer account depth (tracking UX + address/profile enhancements).

## 7) Recommended Safe Workflow
1. Code change -> local `typecheck` + `build`.
2. Commit -> push `main`.
3. Render auto-deploy (On Commit) wait for API+Web green.
4. Quick smoke tests:
   - `/login`, `/staff`, `/orders`, `/cashier`, `/bookings`, `/settings/business-hours`, `/delivery-orders`, `/finance`.
5. If DB mismatch appears:
   - run `pnpm -C lib/db run push`
   - run `pnpm seed` if required.

## 8) Notes for Future Sessions
- Keep changes incremental to avoid large-context breakage.
- Prefer backward-compatible DB updates (`db-compat` + Drizzle schema sync).
- When user asks “commit + push”, execute directly after validation.
- Prioritize runtime-safe error responses (avoid raw HTML 500 leaks to UI).
