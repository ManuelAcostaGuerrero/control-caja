import { db } from './db.js';
import { statusOf } from './status.js';

const movementBase=`
SELECT m.*, c.name company_name, l.name location_name,
  COALESCE(u.full_name,m.created_by) created_by_name,
  sp.name supplier_name,
  et.name movement_expense_type_name,
  cat.name movement_category_name,
  COALESCE((SELECT SUM(s.amount) FROM settlements s WHERE s.movement_id=m.id),0) settled_amount,
  COALESCE((SELECT SUM(r.amount) FROM returns r WHERE r.movement_id=m.id),0) +
  COALESCE((SELECT SUM(im.amount) FROM movements im WHERE im.related_movement_id=m.id AND im.kind='INCOME' AND im.income_type='RETURN'),0) returned_amount,
  COALESCE((SELECT COUNT(*) FROM settlements s WHERE s.movement_id=m.id AND s.document_type='FACTURA' AND (s.document_number IS NULL OR TRIM(s.document_number)='')),0) pending_invoice_count
FROM movements m
JOIN companies c ON c.id=m.company_id
LEFT JOIN locations l ON l.id=m.location_id
LEFT JOIN users u ON u.id=m.created_by_user_id
LEFT JOIN suppliers sp ON sp.id=m.supplier_id
LEFT JOIN expense_types et ON et.id=m.expense_type_id
LEFT JOIN categories cat ON cat.id=m.category_id`;

export function hydrateMovement(row){
  if(!row)return null;
  const pending=row.kind==='WITHDRAWAL' && row.purpose!=='DIRECT_EXPENSE'
    ? Number(row.amount)-Number(row.settled_amount)-Number(row.returned_amount) : 0;
  const movement={...row,status:statusOf(row),pending_amount:pending};
  movement.settlements=db.prepare(`
    SELECT s.*,COALESCE(sp.name,s.supplier) supplier_name,et.name expense_type_name,cat.name category_name
    FROM settlements s
    LEFT JOIN suppliers sp ON sp.id=s.supplier_id
    LEFT JOIN expense_types et ON et.id=s.expense_type_id
    LEFT JOIN categories cat ON cat.id=s.category_id
    WHERE s.movement_id=? ORDER BY s.id`).all(row.id);
  movement.returns=db.prepare(`
    SELECT 'LEGACY-'||r.id item_key,r.id,r.amount,r.note,r.created_at,NULL income_movement_id
    FROM returns r WHERE r.movement_id=?
    UNION ALL
    SELECT 'MOVEMENT-'||im.id item_key,im.id,im.amount,
      COALESCE(NULLIF(im.planned_detail,''),'Vuelto recibido') note,im.created_at,im.id income_movement_id
    FROM movements im
    WHERE im.related_movement_id=? AND im.kind='INCOME' AND im.income_type='RETURN'
    ORDER BY created_at`).all(row.id,row.id);
  return movement;
}
export function getMovement(id){return hydrateMovement(db.prepare(`${movementBase} WHERE m.id=?`).get(id))}
export function listMovements(companyId,limit=100,locationIds=null){
  if(Array.isArray(locationIds)&&locationIds.length===0)return [];
  if(Array.isArray(locationIds)){
    const marks=locationIds.map(()=>'?').join(',');
    return db.prepare(`${movementBase} WHERE m.company_id=? AND m.location_id IN (${marks}) ORDER BY m.id DESC LIMIT ?`)
      .all(companyId,...locationIds,limit).map(hydrateMovement);
  }
  return db.prepare(`${movementBase} WHERE m.company_id=? ORDER BY m.id DESC LIMIT ?`).all(companyId,limit).map(hydrateMovement);
}
export function cashBalance(companyId,locationIds=null){
  if(Array.isArray(locationIds)&&locationIds.length===0)return 0;
  let out,returned;
  if(Array.isArray(locationIds)){
    const marks=locationIds.map(()=>'?').join(',');
    out=db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='INCOME' THEN amount ELSE -amount END),0) v FROM movements WHERE company_id=? AND location_id IN (${marks})`).get(companyId,...locationIds).v;
    returned=db.prepare(`SELECT COALESCE(SUM(r.amount),0) v FROM returns r JOIN movements m ON m.id=r.movement_id WHERE m.company_id=? AND m.location_id IN (${marks})`).get(companyId,...locationIds).v;
  }else{
    out=db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='INCOME' THEN amount ELSE -amount END),0) v FROM movements WHERE company_id=?`).get(companyId).v;
    returned=db.prepare(`SELECT COALESCE(SUM(r.amount),0) v FROM returns r JOIN movements m ON m.id=r.movement_id WHERE m.company_id=?`).get(companyId).v;
  }
  return Number(out)+Number(returned);
}
