-- =============================================================
-- PostgreSQL source schema + seed data
-- Debezium will capture every INSERT/UPDATE/DELETE from these tables.
-- =============================================================

CREATE SCHEMA shop;

-- ---------- Users ----------
CREATE TABLE shop.users (
    id           BIGSERIAL PRIMARY KEY,
    username     VARCHAR(64) NOT NULL,
    email        VARCHAR(128) NOT NULL,
    country      VARCHAR(32),
    created_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ---------- Products ----------
CREATE TABLE shop.products (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    category     VARCHAR(64)  NOT NULL,
    price        NUMERIC(10,2) NOT NULL,
    created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ---------- Orders (CDC 主表) ----------
CREATE TABLE shop.orders (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT     NOT NULL REFERENCES shop.users(id),
    status         VARCHAR(16) NOT NULL,  -- pending/paid/shipped/cancelled
    total_amount   NUMERIC(12,2) NOT NULL,
    created_at     TIMESTAMP  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- ---------- Order items ----------
CREATE TABLE shop.order_items (
    id             BIGSERIAL PRIMARY KEY,
    order_id       BIGINT     NOT NULL REFERENCES shop.orders(id),
    product_id     BIGINT     NOT NULL REFERENCES shop.products(id),
    quantity       INT        NOT NULL,
    unit_price     NUMERIC(10,2) NOT NULL,
    created_at     TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- ---------- Seeds ----------
INSERT INTO shop.users (id, username, email, country) VALUES
    (1, 'alice',   'alice@example.com',   'US'),
    (2, 'bob',     'bob@example.com',     'UK'),
    (3, 'carol',   'carol@example.com',   'CN'),
    (4, 'dave',    'dave@example.com',    'US'),
    (5, 'eve',     'eve@example.com',     'DE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shop.products (id, name, category, price) VALUES
    (101, 'Laptop X1',        'Electronics', 1299.00),
    (102, 'Wireless Mouse',   'Electronics',   29.99),
    (103, 'Mechanical KB',    'Electronics',  149.50),
    (201, 'Coffee Mug',       'Home',           9.99),
    (202, 'Notebook A5',      'Office',         4.50),
    (301, 'Yoga Mat',         'Sports',        19.90)
ON CONFLICT (id) DO NOTHING;

INSERT INTO shop.orders (id, user_id, status, total_amount) VALUES
    (1001, 1, 'paid',      1328.99),
    (1002, 2, 'shipped',    179.00),
    (1003, 3, 'pending',   1299.00),
    (1004, 1, 'cancelled',   29.99),
    (1005, 4, 'paid',        24.49),
    (1006, 5, 'shipped',     19.90)
ON CONFLICT (id) DO NOTHING;

INSERT INTO shop.order_items (id, order_id, product_id, quantity, unit_price) VALUES
    (1, 1001, 101, 1, 1299.00),
    (2, 1001, 102, 1,   29.99),
    (3, 1002, 103, 1,  149.50),
    (4, 1002, 102, 1,   29.50),
    (5, 1003, 101, 1, 1299.00),
    (6, 1004, 102, 1,   29.99),
    (7, 1005, 201, 2,    9.99),
    (8, 1005, 202, 1,    4.50),
    (9, 1006, 301, 1,   19.90)
ON CONFLICT (id) DO NOTHING;

SELECT setval('shop.users_id_seq',       5);
SELECT setval('shop.products_id_seq',   301);
SELECT setval('shop.orders_id_seq',    1006);
SELECT setval('shop.order_items_id_seq', 9);

-- ---------- Replication slot / publication for Debezium ----------
SELECT pg_create_logical_replication_slot('dbz_shop_slot', 'pgoutput')
WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'dbz_shop_slot');

DROP PUBLICATION IF EXISTS dbz_shop_pub;
CREATE PUBLICATION dbz_shop_pub
    FOR TABLE shop.users, shop.products, shop.orders, shop.order_items;

GRANT USAGE ON SCHEMA shop TO debezium;
GRANT SELECT  ON shop.users, shop.products, shop.orders, shop.order_items TO debezium;
