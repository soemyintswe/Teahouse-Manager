import { pool } from "@workspace/db";
import { logger } from "./logger";

async function run(sqlText: string): Promise<void> {
  await pool.query(sqlText);
}

export async function ensureDbCompatibility(): Promise<void> {
  const steps: Array<{ name: string; sql: string }> = [
    {
      name: "customers table",
      sql: `
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          full_name TEXT NOT NULL DEFAULT '',
          password TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "customers columns",
      sql: `
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_name TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS password TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE customers SET full_name = COALESCE(full_name, '') WHERE full_name IS NULL;
        UPDATE customers SET password = COALESCE(password, '') WHERE password IS NULL;
        UPDATE customers SET status = COALESCE(status, 'pending') WHERE status IS NULL;
        UPDATE customers SET must_change_password = COALESCE(must_change_password, TRUE) WHERE must_change_password IS NULL;
        UPDATE customers SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE customers SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "customer_phones table",
      sql: `
        CREATE TABLE IF NOT EXISTS customer_phones (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          phone TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE customer_phones ADD COLUMN IF NOT EXISTS customer_id INTEGER;
        ALTER TABLE customer_phones ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE customer_phones ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
        ALTER TABLE customer_phones ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE customer_phones SET sort_order = COALESCE(sort_order, 0) WHERE sort_order IS NULL;
        UPDATE customer_phones SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS customer_phones_phone_idx ON customer_phones (phone);
      `,
    },
    {
      name: "customer_addresses table",
      sql: `
        CREATE TABLE IF NOT EXISTS customer_addresses (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          unit_no TEXT,
          street TEXT,
          ward TEXT,
          township TEXT,
          region TEXT,
          map_link TEXT,
          is_default BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS customer_id INTEGER;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS unit_no TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS street TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS ward TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS township TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS region TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS map_link TEXT;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT TRUE;
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE customer_addresses SET is_default = COALESCE(is_default, TRUE) WHERE is_default IS NULL;
        UPDATE customer_addresses SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE customer_addresses SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "tables base columns",
      sql: `
        CREATE TABLE IF NOT EXISTS tables (
          id SERIAL PRIMARY KEY,
          table_number TEXT NOT NULL,
          zone TEXT NOT NULL DEFAULT 'hall',
          capacity INTEGER NOT NULL DEFAULT 4,
          category TEXT NOT NULL DEFAULT 'Standard',
          status TEXT NOT NULL DEFAULT 'Active',
          is_booked BOOLEAN NOT NULL DEFAULT FALSE,
          occupancy_status TEXT NOT NULL DEFAULT 'available',
          qr_code TEXT,
          pos_x INTEGER NOT NULL DEFAULT 0,
          pos_y INTEGER NOT NULL DEFAULT 0,
          current_order_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'hall';
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Standard';
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_booked BOOLEAN DEFAULT FALSE;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS occupancy_status TEXT DEFAULT 'available';
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_code TEXT;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS pos_x INTEGER DEFAULT 0;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS pos_y INTEGER DEFAULT 0;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS current_order_id INTEGER;
      `,
    },
    {
      name: "orders table base",
      sql: `
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          table_id INTEGER NOT NULL DEFAULT 0,
          table_number TEXT NOT NULL DEFAULT 'N/A',
          order_source TEXT NOT NULL DEFAULT 'dine_in',
          status TEXT NOT NULL DEFAULT 'open',
          subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
          aircon_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
          tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          payment_method TEXT,
          customer_id INTEGER,
          customer_name TEXT,
          customer_phones TEXT,
          delivery_unit_no TEXT,
          delivery_street TEXT,
          delivery_ward TEXT,
          delivery_township TEXT,
          delivery_region TEXT,
          delivery_map_link TEXT,
          delivery_status TEXT,
          notes TEXT,
          staff_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "orders delivery columns",
      sql: `
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id INTEGER;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'dine_in';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS aircon_fee NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phones TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_unit_no TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_street TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_ward TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_township TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_region TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_map_link TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id INTEGER;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        UPDATE orders SET table_id = COALESCE(table_id, 0) WHERE table_id IS NULL;
        UPDATE orders SET table_number = COALESCE(table_number, 'N/A') WHERE table_number IS NULL;
        UPDATE orders SET status = COALESCE(status, 'open') WHERE status IS NULL;
        UPDATE orders SET subtotal = COALESCE(subtotal, 0) WHERE subtotal IS NULL;
        UPDATE orders SET order_source = COALESCE(order_source, 'dine_in') WHERE order_source IS NULL;
        UPDATE orders SET aircon_fee = COALESCE(aircon_fee, 0) WHERE aircon_fee IS NULL;
        UPDATE orders SET tax_amount = COALESCE(tax_amount, 0) WHERE tax_amount IS NULL;
        UPDATE orders SET total_amount = COALESCE(total_amount, 0) WHERE total_amount IS NULL;
        UPDATE orders SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE orders SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
        ALTER TABLE orders ALTER COLUMN table_id SET DEFAULT 0;
        ALTER TABLE orders ALTER COLUMN table_number SET DEFAULT 'N/A';
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'open';
        ALTER TABLE orders ALTER COLUMN subtotal SET DEFAULT 0;
        ALTER TABLE orders ALTER COLUMN order_source SET DEFAULT 'dine_in';
        ALTER TABLE orders ALTER COLUMN aircon_fee SET DEFAULT 0;
        ALTER TABLE orders ALTER COLUMN tax_amount SET DEFAULT 0;
        ALTER TABLE orders ALTER COLUMN total_amount SET DEFAULT 0;
        ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE orders ALTER COLUMN updated_at SET DEFAULT NOW();
      `,
    },
    {
      name: "order_items table",
      sql: `
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL,
          menu_item_id INTEGER NOT NULL,
          menu_item_name TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
          customizations TEXT,
          kitchen_status TEXT NOT NULL DEFAULT 'new',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'new';
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
      `,
    },
    {
      name: "inventory table",
      sql: `
        CREATE TABLE IF NOT EXISTS inventory (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          unit TEXT NOT NULL,
          current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
          minimum_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
          cost NUMERIC(10,2) NOT NULL DEFAULT 0,
          supplier_id INTEGER,
          last_restocked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name TEXT;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit TEXT;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS current_stock NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ;
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE inventory SET current_stock = COALESCE(current_stock, 0) WHERE current_stock IS NULL;
        UPDATE inventory SET minimum_stock = COALESCE(minimum_stock, 0) WHERE minimum_stock IS NULL;
        UPDATE inventory SET cost = COALESCE(cost, 0) WHERE cost IS NULL;
        UPDATE inventory SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE inventory SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "payments table",
      sql: `
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL,
          table_number TEXT NOT NULL DEFAULT 'N/A',
          amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          status TEXT NOT NULL DEFAULT 'completed',
          cashier_id INTEGER,
          receipt_number TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id INTEGER;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS table_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2);
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashier_id INTEGER;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        UPDATE payments SET table_number = COALESCE(table_number, 'N/A') WHERE table_number IS NULL;
        UPDATE payments SET amount = COALESCE(amount, 0) WHERE amount IS NULL;
        UPDATE payments SET payment_method = COALESCE(payment_method, 'cash') WHERE payment_method IS NULL;
        UPDATE payments SET status = COALESCE(status, 'completed') WHERE status IS NULL;
        UPDATE payments SET receipt_number = COALESCE(receipt_number, '') WHERE receipt_number IS NULL;
        UPDATE payments SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        ALTER TABLE payments ALTER COLUMN table_number SET DEFAULT 'N/A';
        ALTER TABLE payments ALTER COLUMN amount SET DEFAULT 0;
        ALTER TABLE payments ALTER COLUMN payment_method SET DEFAULT 'cash';
        ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'completed';
        ALTER TABLE payments ALTER COLUMN receipt_number SET DEFAULT '';
        ALTER TABLE payments ALTER COLUMN created_at SET DEFAULT NOW();
      `,
    },
    {
      name: "settings table",
      sql: `
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          restaurant_name TEXT NOT NULL DEFAULT 'Min Khaung Tea House & Restaurant',
          tax_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
          aircon_fee NUMERIC(10,2) NOT NULL DEFAULT 500.00,
          currency TEXT NOT NULL DEFAULT 'MMK',
          receipt_footer TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO settings (restaurant_name, tax_rate, aircon_fee, currency, receipt_footer, updated_at)
        SELECT 'Min Khaung Tea House & Restaurant', 5.00, 500.00, 'MMK', null, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM settings);
      `,
    },
  ];

  for (const step of steps) {
    try {
      await run(step.sql);
    } catch (error) {
      logger.warn({ err: error, step: step.name }, "DB compatibility step failed; continuing");
    }
  }

  logger.info("DB compatibility checks completed");
}
