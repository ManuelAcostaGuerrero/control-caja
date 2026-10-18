import crypto from 'node:crypto';
import { db, transaction } from './db.js';

function hasColumn(table,column){
  return db.prepare(`PRAGMA table_info(${table})`).all().some(x=>x.name===column);
}
function addColumn(table,definition){
  const name=definition.trim().split(/\s+/)[0];
  if(!hasColumn(table,name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}
function password(password){
  const salt=crypto.randomBytes(16).toString('hex');
  return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
}

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
    CREATE TABLE IF NOT EXISTS suppliers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,name)
    );
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      full_name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('SYSTEM_ADMIN','LOCAL_ADMIN','USER')),
      active INTEGER NOT NULL DEFAULT 1,
      default_location_id INTEGER REFERENCES locations(id),
      require_location_choice INTEGER NOT NULL DEFAULT 0,
      can_withdraw INTEGER NOT NULL DEFAULT 1,
      can_deposit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_locations(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES locations(id),
      PRIMARY KEY(user_id,location_id)
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
    CREATE TABLE IF NOT EXISTS audit_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id),
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      entity_name TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_movements_company_created ON movements(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_settlements_movement ON settlements(movement_id);
    CREATE INDEX IF NOT EXISTS idx_returns_movement ON returns(movement_id);
  `);

  addColumn('movements','created_by_user_id INTEGER REFERENCES users(id)');
  addColumn('movements','supplier_id INTEGER REFERENCES suppliers(id)');
  addColumn('movements','invoice_mode TEXT');
  addColumn('movements','document_number_hint TEXT');
  addColumn('movements','expense_type_id INTEGER REFERENCES expense_types(id)');
  addColumn('movements','category_id INTEGER REFERENCES categories(id)');
  addColumn('movements',"income_type TEXT CHECK(income_type IS NULL OR income_type IN ('BOX','RETURN','OTHER'))");
  addColumn('movements','related_movement_id INTEGER REFERENCES movements(id)');
  addColumn('movements','box_from_date TEXT');
  addColumn('movements','box_to_date TEXT');
  addColumn('settlements','supplier_id INTEGER REFERENCES suppliers(id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_movements_related ON movements(related_movement_id);');

  const companyCount=db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  if(!companyCount){
    transaction(()=>{
      const company=db.prepare('INSERT INTO companies(name) VALUES (?)').run('Redtaurus').lastInsertRowid;
      for(const name of ['DISTRIBUIDORA','GASTROBAR','BOTILLERÍA','BODEGA','ADMINISTRACIÓN']) db.prepare('INSERT INTO locations(company_id,name) VALUES (?,?)').run(company,name);
      const types=['PAGO DE FACTURA','COMPRA DE MERCADERÍA','GASTO EMPRESARIAL','CONSUMO','MANTENCIÓN','SERVICIOS','TRANSPORTE','OTRO'];
      const ids=new Map();
      for(const name of types) ids.set(name,db.prepare('INSERT INTO expense_types(name) VALUES (?)').run(name).lastInsertRowid);
      const cats=[
        ['CONSUMO','BENCINA'],['COMPRA DE MERCADERÍA','ALIMENTOS'],['COMPRA DE MERCADERÍA','BEBIDAS'],
        ['COMPRA DE MERCADERÍA','INSUMOS DE COCINA'],['GASTO EMPRESARIAL','ASEO'],['MANTENCIÓN','REPARACIONES'],
        ['SERVICIOS','SERVICIOS BÁSICOS'],['TRANSPORTE','TRASLADOS']
      ];
      for(const [type,name] of cats) db.prepare('INSERT INTO categories(expense_type_id,name) VALUES (?,?)').run(ids.get(type),name);
    });
  } else {
    const company=db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get();
    if(company && !db.prepare("SELECT 1 FROM locations WHERE company_id=? AND name='DISTRIBUIDORA' COLLATE NOCASE").get(company.id)){
      db.prepare('INSERT INTO locations(company_id,name) VALUES (?,?)').run(company.id,'DISTRIBUIDORA');
    }
  }

  const userCount=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if(!userCount){
    const p=password('admin');
    db.prepare(`INSERT INTO users(username,full_name,password_salt,password_hash,role,can_withdraw,can_deposit,require_location_choice)
      VALUES ('admin','Administrador del sistema',?,?,'SYSTEM_ADMIN',1,1,1)`).run(p.salt,p.hash);
  }
}
