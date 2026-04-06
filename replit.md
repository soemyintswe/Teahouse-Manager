# Min Khaung Tea House & Restaurant Management System

## Overview

A comprehensive Restaurant Management System for "Min Khaung Tea House & Restaurant". Built as a React + Vite web application with an Express backend and PostgreSQL database.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express 5 (REST API)
- **Database**: PostgreSQL + Drizzle ORM
- **API codegen**: Orval (from OpenAPI spec)
- **Routing**: Wouter
- **Charts**: Recharts

## Artifacts

- `artifacts/min-khaung-rms` — Main React web app (preview path: `/`)
- `artifacts/api-server` — Express API server (path: `/api`)

## Key Modules

1. **Dashboard** — Sales summary, active orders, table status, sales chart, top items
2. **Floor Plan** (`/floor-plan`) — Interactive table layout with Hall and Air-con zones
3. **Orders** (`/orders`) — Order management list
4. **KDS** (`/kitchen`) — Kitchen Display System with real-time order status
5. **Cashier** (`/cashier`) — POS for payment processing
6. **Menu** (`/menu`) — Menu item and category management
7. **Inventory** (`/inventory`) — Stock management with low-stock alerts
8. **Staff** (`/staff`) — Staff profiles and roles
9. **Finance** (`/finance`) — Transactions and financial reporting
10. **Settings** (`/settings`) — Tax rate, aircon fee, currency

## Database Tables

- `tables` — Restaurant tables with zone and status
- `menu_categories` — Menu categories (Burmese/English)
- `menu_items` — Menu items with prices and customizations
- `orders` — Customer orders with calculated totals
- `order_items` — Individual items in each order
- `payments` — Payment records with receipt numbers
- `inventory` — Stock items with minimum level tracking
- `staff` — Staff members with roles
- `transactions` — Financial transactions (deposits/withdrawals/expenses)
- `settings` — App configuration (tax rate, aircon fee, etc.)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/min-khaung-rms run dev` — run frontend locally

## Business Rules

- Air-con tables automatically apply an aircon fee (configurable in settings)
- Tax is calculated as a percentage of (subtotal + aircon fee)
- When an order is created, table status changes to "occupied"
- When order is marked "ready_to_pay", table status changes to "payment_pending"
- When payment is completed, table status changes to "dirty"
- Receipt numbers are auto-generated: `RCP-{timestamp}-{orderId}`
