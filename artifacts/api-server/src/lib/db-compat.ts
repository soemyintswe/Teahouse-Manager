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
          email TEXT,
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
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
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
          merged_group_id INTEGER,
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
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS merged_group_id INTEGER;
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
          billing_group_id INTEGER,
          split_parent_order_id INTEGER,
          split_label TEXT,
          seat_session_id INTEGER,
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
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_group_id INTEGER;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_parent_order_id INTEGER;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_label TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS seat_session_id INTEGER;
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
      name: "table merge groups table",
      sql: `
        CREATE TABLE IF NOT EXISTS table_merge_groups (
          id SERIAL PRIMARY KEY,
          zone TEXT NOT NULL,
          anchor_table_id INTEGER NOT NULL,
          merged_table_ids TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_by_staff_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS zone TEXT;
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS anchor_table_id INTEGER;
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS merged_table_ids TEXT;
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS created_by_staff_id INTEGER;
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE table_merge_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE table_merge_groups SET status = COALESCE(status, 'active') WHERE status IS NULL;
        UPDATE table_merge_groups SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE table_merge_groups SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "table seat sessions table",
      sql: `
        CREATE TABLE IF NOT EXISTS table_seat_sessions (
          id SERIAL PRIMARY KEY,
          table_id INTEGER NOT NULL,
          slot_code TEXT NOT NULL,
          group_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          current_order_id INTEGER,
          notes TEXT,
          auto_managed BOOLEAN NOT NULL DEFAULT TRUE,
          opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          closed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS table_id INTEGER;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS slot_code TEXT;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS group_name TEXT;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS current_order_id INTEGER;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS auto_managed BOOLEAN DEFAULT TRUE;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE table_seat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE table_seat_sessions SET status = COALESCE(status, 'active') WHERE status IS NULL;
        UPDATE table_seat_sessions SET auto_managed = COALESCE(auto_managed, TRUE) WHERE auto_managed IS NULL;
        UPDATE table_seat_sessions SET opened_at = COALESCE(opened_at, NOW()) WHERE opened_at IS NULL;
        UPDATE table_seat_sessions SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE table_seat_sessions SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "billing audit logs table",
      sql: `
        CREATE TABLE IF NOT EXISTS billing_audit_logs (
          id SERIAL PRIMARY KEY,
          operation TEXT NOT NULL,
          merge_group_id INTEGER,
          order_id INTEGER,
          table_ids TEXT,
          detail TEXT,
          staff_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS operation TEXT;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS merge_group_id INTEGER;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS order_id INTEGER;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS table_ids TEXT;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS detail TEXT;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS staff_id INTEGER;
        ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE billing_audit_logs SET operation = COALESCE(operation, 'unknown') WHERE operation IS NULL;
        UPDATE billing_audit_logs SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
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
          booking_lead_time_minutes INTEGER NOT NULL DEFAULT 60,
          booking_no_show_grace_minutes INTEGER NOT NULL DEFAULT 15,
          booking_default_slot_minutes INTEGER NOT NULL DEFAULT 120,
          business_open_time TEXT NOT NULL DEFAULT '08:00',
          business_close_time TEXT NOT NULL DEFAULT '22:00',
          business_closed_weekdays TEXT NOT NULL DEFAULT '[]',
          business_closed_dates TEXT NOT NULL DEFAULT '[]',
          notify_activate_email_subject TEXT NOT NULL DEFAULT 'Teahouse Manager - Account Activated',
          notify_activate_email_body TEXT NOT NULL DEFAULT 'Hello {{fullName}},\n\nYour Teahouse Manager account has been activated.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.',
          notify_activate_sms_body TEXT NOT NULL DEFAULT 'Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.',
          notify_reset_email_subject TEXT NOT NULL DEFAULT 'Teahouse Manager - Password Reset',
          notify_reset_email_body TEXT NOT NULL DEFAULT 'Hello {{fullName}},\n\nYour Teahouse Manager password has been reset.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.',
          notify_reset_sms_body TEXT NOT NULL DEFAULT 'Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_activate_email_subject TEXT DEFAULT 'Teahouse Manager - Account Activated';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_activate_email_body TEXT DEFAULT 'Hello {{fullName}},\n\nYour Teahouse Manager account has been activated.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_activate_sms_body TEXT DEFAULT 'Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_reset_email_subject TEXT DEFAULT 'Teahouse Manager - Password Reset';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_reset_email_body TEXT DEFAULT 'Hello {{fullName}},\n\nYour Teahouse Manager password has been reset.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_reset_sms_body TEXT DEFAULT 'Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_lead_time_minutes INTEGER DEFAULT 60;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_no_show_grace_minutes INTEGER DEFAULT 15;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_default_slot_minutes INTEGER DEFAULT 120;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_open_time TEXT DEFAULT '08:00';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_close_time TEXT DEFAULT '22:00';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_closed_weekdays TEXT DEFAULT '[]';
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_closed_dates TEXT DEFAULT '[]';
        UPDATE settings SET notify_activate_email_subject = COALESCE(notify_activate_email_subject, 'Teahouse Manager - Account Activated') WHERE notify_activate_email_subject IS NULL;
        UPDATE settings SET notify_activate_email_body = COALESCE(notify_activate_email_body, 'Hello {{fullName}},\n\nYour Teahouse Manager account has been activated.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.') WHERE notify_activate_email_body IS NULL;
        UPDATE settings SET notify_activate_sms_body = COALESCE(notify_activate_sms_body, 'Teahouse Manager account activated. Temp password: {{temporaryPassword}}. Please login and change it now.') WHERE notify_activate_sms_body IS NULL;
        UPDATE settings SET notify_reset_email_subject = COALESCE(notify_reset_email_subject, 'Teahouse Manager - Password Reset') WHERE notify_reset_email_subject IS NULL;
        UPDATE settings SET notify_reset_email_body = COALESCE(notify_reset_email_body, 'Hello {{fullName}},\n\nYour Teahouse Manager password has been reset.\nTemporary Password: {{temporaryPassword}}\n\nPlease login and change this password immediately.\nIf you did not request this change, contact support.') WHERE notify_reset_email_body IS NULL;
        UPDATE settings SET notify_reset_sms_body = COALESCE(notify_reset_sms_body, 'Teahouse Manager password reset. Temp password: {{temporaryPassword}}. Please login and change it now.') WHERE notify_reset_sms_body IS NULL;
        UPDATE settings SET booking_lead_time_minutes = COALESCE(booking_lead_time_minutes, 60) WHERE booking_lead_time_minutes IS NULL;
        UPDATE settings SET booking_no_show_grace_minutes = COALESCE(booking_no_show_grace_minutes, 15) WHERE booking_no_show_grace_minutes IS NULL;
        UPDATE settings SET booking_default_slot_minutes = COALESCE(booking_default_slot_minutes, 120) WHERE booking_default_slot_minutes IS NULL;
        UPDATE settings SET business_open_time = COALESCE(business_open_time, '08:00') WHERE business_open_time IS NULL;
        UPDATE settings SET business_close_time = COALESCE(business_close_time, '22:00') WHERE business_close_time IS NULL;
        UPDATE settings SET business_closed_weekdays = COALESCE(business_closed_weekdays, '[]') WHERE business_closed_weekdays IS NULL;
        UPDATE settings SET business_closed_dates = COALESCE(business_closed_dates, '[]') WHERE business_closed_dates IS NULL;
        INSERT INTO settings (restaurant_name, tax_rate, aircon_fee, currency, receipt_footer, updated_at)
        SELECT 'Min Khaung Tea House & Restaurant', 5.00, 500.00, 'MMK', null, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM settings);
      `,
    },
    {
      name: "table_bookings table",
      sql: `
        CREATE TABLE IF NOT EXISTS table_bookings (
          id SERIAL PRIMARY KEY,
          table_id INTEGER NOT NULL,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          slot_start_at TIMESTAMPTZ NOT NULL,
          slot_end_at TIMESTAMPTZ NOT NULL,
          extension_minutes INTEGER NOT NULL DEFAULT 0,
          booking_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
          preorder_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          booking_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
          preorder_amount_paid BOOLEAN NOT NULL DEFAULT FALSE,
          status TEXT NOT NULL DEFAULT 'pending_payment',
          auto_cancel_at TIMESTAMPTZ NOT NULL,
          confirmed_at TIMESTAMPTZ,
          check_in_at TIMESTAMPTZ,
          order_at TIMESTAMPTZ,
          check_out_at TIMESTAMPTZ,
          order_id INTEGER,
          cancel_reason TEXT,
          notes TEXT,
          created_by_staff_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS table_id INTEGER;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS customer_phone TEXT;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS slot_start_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS slot_end_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS extension_minutes INTEGER DEFAULT 0;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS booking_fee NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS preorder_amount NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS booking_fee_paid BOOLEAN DEFAULT FALSE;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS preorder_amount_paid BOOLEAN DEFAULT FALSE;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_payment';
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS auto_cancel_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS order_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS order_id INTEGER;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS created_by_staff_id INTEGER;
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE table_bookings SET extension_minutes = COALESCE(extension_minutes, 0) WHERE extension_minutes IS NULL;
        UPDATE table_bookings SET booking_fee = COALESCE(booking_fee, 0) WHERE booking_fee IS NULL;
        UPDATE table_bookings SET preorder_amount = COALESCE(preorder_amount, 0) WHERE preorder_amount IS NULL;
        UPDATE table_bookings SET booking_fee_paid = COALESCE(booking_fee_paid, FALSE) WHERE booking_fee_paid IS NULL;
        UPDATE table_bookings SET preorder_amount_paid = COALESCE(preorder_amount_paid, FALSE) WHERE preorder_amount_paid IS NULL;
        UPDATE table_bookings SET status = COALESCE(status, 'pending_payment') WHERE status IS NULL;
        UPDATE table_bookings SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
        UPDATE table_bookings SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
      `,
    },
    {
      name: "notification_logs table",
      sql: `
        CREATE TABLE IF NOT EXISTS notification_logs (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER,
          customer_name TEXT,
          reason TEXT NOT NULL,
          channel TEXT NOT NULL,
          provider TEXT NOT NULL,
          recipient TEXT,
          status TEXT NOT NULL,
          message TEXT,
          payload TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS customer_id INTEGER;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS reason TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS channel TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS provider TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS message TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS payload TEXT;
        ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE notification_logs SET reason = COALESCE(reason, 'unknown') WHERE reason IS NULL;
        UPDATE notification_logs SET channel = COALESCE(channel, 'unknown') WHERE channel IS NULL;
        UPDATE notification_logs SET provider = COALESCE(provider, 'unknown') WHERE provider IS NULL;
        UPDATE notification_logs SET status = COALESCE(status, 'unknown') WHERE status IS NULL;
        UPDATE notification_logs SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;
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
