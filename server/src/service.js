import { db } from './db.js';
import { statusOf } from './status.js';

const movementBase = `
SELECT m.*, c.name company_name, l.name location_name,
  COALESCE((SELECT SUM(s.amount) FROM settlements s WHERE s.movement_id=m.id),0) settled_amount,
  COALESCE((SELECT SUM(r.amount) FROM returns r WHERE r.movement_id=m.id),0) returned_amount,
  COALESCE((SELECT COUNT(*) FROM settlements s WHERE s.movement_id=m.id AND s.document_type='FACTURA' AND (s.document_number IS NULL OR TRIM(s.document_number)='')),0) pending_invoice_count
FROM movements m
JOIN companies c ON c.id=m.company_id
LEFT JOIN locations l ON l.id=m.location_id`;

export function hydrateMovement(row){
  if (!row) return null;
  const movement={...row,status:statusOf(row),pending_amount: row.kind==='WITHDRAWAL' ? Number(row.amount)-Number(row.settled_amount)-Number(row.returned_amount) : 0};
  movement.settlements=db.prepare(`SELECT s.*, et.name expense_type_name, cat.name category_name FROM settlements s LEFT JOIN expense_types et ON et.id=s.expense_type_id LEFT JOIN categories cat ON cat.id=s.category_id WHERE s.movement_id=? ORDER BY s.id`).all(row.id);
  movement.returns=db.prepare('SELECT * FROM returns WHERE movement_id=? ORDER BY id').all(row.id);
  return movement;
}

export function getMovement(id){ return hydrateMovement(db.prepare(`${movementBase} WHERE m.id=?`).get(id)); }
export function listMovements(companyId, limit=100){ return db.prepare(`${movementBase} WHERE m.company_id=? ORDER BY m.id DESC LIMIT ?`).all(companyId,limit).map(hydrateMovement); }
export function cashBalance(companyId){
  const out=db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='INCOME' THEN amount ELSE -amount END),0) v FROM movements WHERE company_id=?`).get(companyId).v;
  const returns=db.prepare(`SELECT COALESCE(SUM(r.amount),0) v FROM returns r JOIN movements m ON m.id=r.movement_id WHERE m.company_id=?`).get(companyId).v;
  return Number(out)+Number(returns);
}
