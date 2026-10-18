import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { db, transaction } from './db.js';
import { runMigrations } from './migrations.js';
import { cashBalance, getMovement, listMovements } from './service.js';

runMigrations();
export const app=express();
app.use(cors({origin:true}));
app.use(express.json({limit:'1mb'}));
const ok=(res,data)=>res.json(data);
const fail=(res,e)=>res.status(400).json({error:e instanceof Error?e.message:String(e)});

app.get('/api/health',(_req,res)=>ok(res,{service:'control-caja-api',version:'0.1.0'}));
app.get('/api/companies',(_req,res)=>ok(res,db.prepare('SELECT * FROM companies ORDER BY active DESC,name').all()));
app.get('/api/catalogs',(req,res)=>{
  const companyId=Number(req.query.companyId||0);
  ok(res,{
    companies:db.prepare('SELECT * FROM companies ORDER BY active DESC,name').all(),
    locations:companyId?db.prepare('SELECT * FROM locations WHERE company_id=? ORDER BY active DESC,name').all(companyId):[],
    expenseTypes:db.prepare('SELECT * FROM expense_types ORDER BY active DESC,name').all(),
    categories:db.prepare('SELECT c.*,et.name expense_type_name FROM categories c LEFT JOIN expense_types et ON et.id=c.expense_type_id ORDER BY c.active DESC,c.name').all()
  });
});

const names={company:['companies',false],location:['locations',true],'expense-type':['expense_types',false],category:['categories',false]};
app.post('/api/catalogs/:type',(req,res)=>{ try{
  const cfg=names[req.params.type]; if(!cfg) throw new Error('Catálogo inválido.');
  const name=z.string().trim().min(1).max(80).parse(req.body.name);
  let result;
  if(req.params.type==='company') result=db.prepare('INSERT INTO companies(name) VALUES (?)').run(name);
  else if(req.params.type==='location') result=db.prepare('INSERT INTO locations(company_id,name) VALUES (?,?)').run(z.number().int().positive().parse(Number(req.body.companyId)),name);
  else if(req.params.type==='expense-type') result=db.prepare('INSERT INTO expense_types(name) VALUES (?)').run(name);
  else result=db.prepare('INSERT INTO categories(expense_type_id,name) VALUES (?,?)').run(req.body.expenseTypeId?Number(req.body.expenseTypeId):null,name);
  ok(res,{id:Number(result.lastInsertRowid)});
}catch(e){fail(res,e)}});
app.put('/api/catalogs/:type/:id',(req,res)=>{ try{
  const table=names[req.params.type]?.[0]; if(!table) throw new Error('Catálogo inválido.');
  const id=Number(req.params.id); const active=req.body.active===undefined?null:(req.body.active?1:0); const name=req.body.name===undefined?null:z.string().trim().min(1).max(80).parse(req.body.name);
  if(name!==null) db.prepare(`UPDATE ${table} SET name=? WHERE id=?`).run(name,id);
  if(active!==null) db.prepare(`UPDATE ${table} SET active=? WHERE id=?`).run(active,id);
  ok(res,{ok:true});
}catch(e){fail(res,e)}});

const movementSchema=z.object({
  companyId:z.coerce.number().int().positive(), locationId:z.coerce.number().int().positive().nullable().optional(),
  kind:z.enum(['INCOME','WITHDRAWAL']), purpose:z.enum(['INVOICE_PAYMENT','PLANNED_EXPENSE','DIRECT_EXPENSE','OTHER']).default('OTHER'),
  amount:z.coerce.number().int().positive(), expectedExpenseAmount:z.coerce.number().int().nonnegative().nullable().optional(),
  responsible:z.string().trim().max(120).optional().default(''), plannedDetail:z.string().trim().max(500).optional().default(''),
  sourceNote:z.string().trim().max(500).optional().default(''), createdBy:z.string().trim().max(120).optional().default('Administrador'),
  invoice:z.object({documentNumber:z.string().trim().max(80).optional().default(''),supplier:z.string().trim().max(120).optional().default(''),amount:z.coerce.number().int().positive(),expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),detail:z.string().trim().max(500).optional().default('')}).nullable().optional()
});
app.post('/api/movements',(req,res)=>{ try{
  const x=movementSchema.parse(req.body);
  if(x.kind==='INCOME' && x.invoice) throw new Error('Un ingreso no puede incluir factura de gasto.');
  if(x.expectedExpenseAmount!=null && x.expectedExpenseAmount>x.amount) throw new Error('El gasto esperado no puede superar el monto entregado.');
  const tx=()=>transaction(()=>{
    const r=db.prepare(`INSERT INTO movements(company_id,location_id,kind,purpose,amount,expected_expense_amount,responsible,planned_detail,source_note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(x.companyId,x.locationId||null,x.kind,x.purpose,x.amount,x.expectedExpenseAmount??null,x.responsible,x.plannedDetail,x.sourceNote,x.createdBy);
    const id=Number(r.lastInsertRowid);
    if(x.invoice) db.prepare(`INSERT INTO settlements(movement_id,document_type,document_number,supplier,amount,expense_type_id,category_id,detail) VALUES (?,'FACTURA',?,?,?,?,?,?)`).run(id,x.invoice.documentNumber||null,x.invoice.supplier||null,x.invoice.amount,x.invoice.expenseTypeId||null,x.invoice.categoryId||null,x.invoice.detail||null);
    return id;
  });
  ok(res,getMovement(tx()));
}catch(e){fail(res,e)}});

app.get('/api/movements',(req,res)=>{ try{ const companyId=Number(req.query.companyId); ok(res,listMovements(companyId,Number(req.query.limit||100))); }catch(e){fail(res,e)}});
app.get('/api/movements/:id',(req,res)=>{ const m=getMovement(Number(req.params.id)); return m?ok(res,m):res.status(404).json({error:'Movimiento no encontrado.'}); });
app.post('/api/movements/:id/settlements',(req,res)=>{ try{
  const id=Number(req.params.id); const m=getMovement(id); if(!m||m.kind!=='WITHDRAWAL') throw new Error('Retiro no encontrado.');
  const x=z.object({documentType:z.enum(['FACTURA','BOLETA','OTRO']).default('FACTURA'),documentNumber:z.string().trim().max(80).optional().default(''),supplier:z.string().trim().max(120).optional().default(''),amount:z.coerce.number().int().positive(),expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),detail:z.string().trim().max(500).optional().default('')}).parse(req.body);
  db.prepare(`INSERT INTO settlements(movement_id,document_type,document_number,supplier,amount,expense_type_id,category_id,detail) VALUES (?,?,?,?,?,?,?,?)`).run(id,x.documentType,x.documentNumber||null,x.supplier||null,x.amount,x.expenseTypeId||null,x.categoryId||null,x.detail||null);
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});
app.post('/api/movements/:id/returns',(req,res)=>{ try{
  const id=Number(req.params.id); const m=getMovement(id); if(!m||m.kind!=='WITHDRAWAL') throw new Error('Retiro no encontrado.');
  const x=z.object({amount:z.coerce.number().int().positive(),note:z.string().trim().max(300).optional().default('')}).parse(req.body);
  if(x.amount>m.pending_amount) throw new Error('El vuelto supera el monto pendiente del retiro.');
  db.prepare('INSERT INTO returns(movement_id,amount,note) VALUES (?,?,?)').run(id,x.amount,x.note);
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});
app.put('/api/settlements/:id',(req,res)=>{ try{
  const id=Number(req.params.id); const current=db.prepare('SELECT * FROM settlements WHERE id=?').get(id); if(!current) throw new Error('Documento no encontrado.');
  const x=z.object({documentNumber:z.string().trim().max(80).optional(),supplier:z.string().trim().max(120).optional(),expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),detail:z.string().trim().max(500).optional()}).parse(req.body);
  db.prepare(`UPDATE settlements SET document_number=?, supplier=?, expense_type_id=?, category_id=?, detail=? WHERE id=?`).run(x.documentNumber===undefined?current.document_number:(x.documentNumber||null),x.supplier===undefined?current.supplier:(x.supplier||null),x.expenseTypeId===undefined?current.expense_type_id:(x.expenseTypeId||null),x.categoryId===undefined?current.category_id:(x.categoryId||null),x.detail===undefined?current.detail:(x.detail||null),id);
  ok(res,getMovement(current.movement_id));
}catch(e){fail(res,e)}});

app.get('/api/dashboard',(req,res)=>{ try{
  const companyId=Number(req.query.companyId); const all=listMovements(companyId,100);
  const pending=all.filter(x=>x.kind==='WITHDRAWAL'&&x.status!=='COMPLETE');
  ok(res,{balance:cashBalance(companyId),pendingCount:pending.length,pendingAmount:pending.reduce((a,x)=>a+Math.max(0,x.pending_amount),0),pending:pending.slice(0,8),recent:all.slice(0,10)});
}catch(e){fail(res,e)}});
