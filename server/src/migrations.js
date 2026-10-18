import { db, transaction } from './db.js';

export function runMigrations(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS companies(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS locations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,name)
    );
    CREATE TABLE IF NOT EXISTS expense_types(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_type_id INTEGER REFERENCES expense_types(id),
      name TEXT NOT NULL COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(expense_type_id,name)
    );
    CREATE TABLE IF NOT EXISTS movements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      location_id INTEGER REFERENCES locations(id),
      kind TEXT NOT NULL CHECK(kind IN ('INCOME','WITHDRAWAL')),
      purpose TEXT NOT NULL DEFAULT 'OTHER' CHECK(purpose IN ('INVOICE_PAYMENT','PLANNED_EXPENSE','DIRECT_EXPENSE','OTHER')),
      amount INTEGER NOT NULL CHECK(amount > 0),
      expected_expense_amount INTEGER CHECK(expected_expense_amount IS NULL OR expected_expense_amount >= 0),
      responsible TEXT,
      planned_detail TEXT,
      source_note TEXT,
      created_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settlements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_id INTEGER NOT NULL REFERENCES movements(id),
      document_type TEXT NOT NULL DEFAULT 'FACTURA' CHECK(document_type IN ('FACTURA','BOLETA','OTRO')),
      document_number TEXT,
      supplier TEXT,
      amount INTEGER NOT NULL CHECK(amount > 0),
      expense_type_id INTEGER REFERENCES expense_types(id),
      category_id INTEGER REFERENCES categories(id),
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS returns(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_id INTEGER NOT NULL REFERENCES movements(id),
      amount INTEGER NOT NULL CHECK(amount > 0),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_movements_company_created ON movements(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_settlements_movement ON settlements(movement_id);
    CREATE INDEX IF NOT EXISTS idx_returns_movement ON returns(movement_id);
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  if (!count) {
    const tx = () => transaction(() => {
      const company = db.prepare('INSERT INTO companies(name) VALUES (?)').run('Redtaurus').lastInsertRowid;
      for (const name of ['GASTROBAR','BOTILLERÍA','BODEGA','ADMINISTRACIÓN']) db.prepare('INSERT INTO locations(company_id,name) VALUES (?,?)').run(company,name);
      const types = ['PAGO DE FACTURA','COMPRA DE MERCADERÍA','GASTO EMPRESARIAL','CONSUMO','MANTENCIÓN','SERVICIOS','TRANSPORTE','OTRO'];
      const ids = new Map();
      for (const name of types) ids.set(name, db.prepare('INSERT INTO expense_types(name) VALUES (?)').run(name).lastInsertRowid);
      const cats = [
        ['CONSUMO','BENCINA'],['COMPRA DE MERCADERÍA','ALIMENTOS'],['COMPRA DE MERCADERÍA','BEBIDAS'],
        ['COMPRA DE MERCADERÍA','INSUMOS DE COCINA'],['GASTO EMPRESARIAL','ASEO'],['MANTENCIÓN','REPARACIONES'],
        ['SERVICIOS','SERVICIOS BÁSICOS'],['TRANSPORTE','TRASLADOS']
      ];
      for (const [type,name] of cats) db.prepare('INSERT INTO categories(expense_type_id,name) VALUES (?,?)').run(ids.get(type),name);
    });
    tx();
  }
}
