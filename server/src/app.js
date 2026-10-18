import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { db, transaction } from './db.js';
import { runMigrations } from './migrations.js';
import { cashBalance,getMovement,listMovements } from './service.js';
import { allowedLocations,auth,canRegisterLocation,canUseLocation,createSession,deleteSession,hashPassword,publicUser,registrationLocations,systemAdmin,verifyPassword } from './auth.js';

runMigrations();
export const app=express();
app.use(cors({origin:true}));
app.use(express.json({limit:'1mb'}));
const ok=(res,data)=>res.json(data);
const fail=(res,e,status=400)=>res.status(status).json({error:e instanceof Error?e.message:String(e)});
const locationsFor=user=>user.role==='SYSTEM_ADMIN'
  ? db.prepare('SELECT * FROM locations WHERE active=1 ORDER BY name').all()
  : allowedLocations(user.id);
const supplierName=id=>id?db.prepare('SELECT name FROM suppliers WHERE id=? AND active=1').get(id)?.name||null:null;
const manager=(req,res,next)=>req.user.role==='USER'?res.status(403).json({error:'Permiso de administrador requerido.'}):next();
const audit=(req,action,entityType,entityId,entityName,details={})=>{
  db.prepare('INSERT INTO audit_events(actor_user_id,actor_name,action,entity_type,entity_id,entity_name,details) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id,req.user.full_name,action,entityType,entityId||null,entityName||null,JSON.stringify(details||{}));
};
const catalogName=(type,id)=>{
  const table=catalogTables[type]; if(!table)return null;
  return db.prepare(`SELECT name FROM ${table} WHERE id=?`).get(id)?.name||null;
};
const catalogUsage=(type,id)=>{
  let movementIds=[],otherUsage=[];
  if(type==='location'){
    movementIds=db.prepare('SELECT id FROM movements WHERE location_id=? ORDER BY id').all(id).map(x=>Number(x.id));
    const userCount=db.prepare('SELECT COUNT(DISTINCT user_id) n FROM user_locations WHERE location_id=?').get(id).n+
      db.prepare('SELECT COUNT(*) n FROM users WHERE default_location_id=?').get(id).n;
    if(userCount)otherUsage.push({kind:'USERS',count:Number(userCount)});
  } else if(type==='expense-type'){
    movementIds=db.prepare(`SELECT DISTINCT movement_id id FROM (
      SELECT id movement_id FROM movements WHERE expense_type_id=?
      UNION ALL
      SELECT movement_id FROM settlements WHERE expense_type_id=?
    ) ORDER BY movement_id`).all(id,id).map(x=>Number(x.id));
    const categories=db.prepare('SELECT COUNT(*) n FROM categories WHERE expense_type_id=?').get(id).n;
    if(categories)otherUsage.push({kind:'CATEGORIES',count:Number(categories)});
  } else if(type==='category'){
    movementIds=db.prepare(`SELECT DISTINCT movement_id id FROM (
      SELECT id movement_id FROM movements WHERE category_id=?
      UNION ALL
      SELECT movement_id FROM settlements WHERE category_id=?
    ) ORDER BY movement_id`).all(id,id).map(x=>Number(x.id));
  }
  return {movementIds,otherUsage,inUse:movementIds.length>0||otherUsage.length>0};
};
const ensureCompany=(user,companyId)=>{
  if(user.role==='SYSTEM_ADMIN')return;
  const found=db.prepare('SELECT 1 FROM user_locations ul JOIN locations l ON l.id=ul.location_id WHERE ul.user_id=? AND l.company_id=?').get(user.id,companyId);
  if(!found)throw new Error('No tienes acceso a esta empresa.');
};

app.get('/api/health',(_req,res)=>ok(res,{service:'control-caja-api',version:'0.4.0'}));
app.post('/api/login',(req,res)=>{try{
  const x=z.object({username:z.string().trim().min(1),password:z.string().min(1)}).parse(req.body);
  const user=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1').get(x.username);
  if(!user||!verifyPassword(x.password,user.password_salt,user.password_hash))return fail(res,new Error('Usuario o clave incorrectos.'),401);
  ok(res,{token:createSession(user.id),user:publicUser(user),locations:locationsFor(user)});
}catch(e){fail(res,e)}});
app.use('/api',auth);
app.post('/api/logout',(req,res)=>{deleteSession(req.token);ok(res,{ok:true})});
app.get('/api/me',(req,res)=>ok(res,{user:publicUser(req.user),locations:locationsFor(req.user)}));
app.get('/api/companies',(req,res)=>{
  const rows=req.user.role==='SYSTEM_ADMIN'
    ? db.prepare('SELECT * FROM companies WHERE active=1 ORDER BY name').all()
    : db.prepare('SELECT DISTINCT c.* FROM companies c JOIN locations l ON l.company_id=c.id JOIN user_locations ul ON ul.location_id=l.id WHERE ul.user_id=? AND c.active=1 ORDER BY c.name').all(req.user.id);
  ok(res,rows);
});
app.get('/api/catalogs',(req,res)=>{try{
  const companyId=Number(req.query.companyId||0);ensureCompany(req.user,companyId);
  const locations=req.user.role==='SYSTEM_ADMIN'
    ? db.prepare('SELECT * FROM locations WHERE company_id=? ORDER BY active DESC,name').all(companyId)
    : db.prepare('SELECT l.* FROM locations l JOIN user_locations ul ON ul.location_id=l.id WHERE ul.user_id=? AND l.company_id=? ORDER BY l.active DESC,l.name').all(req.user.id,companyId);
  ok(res,{
    locations,
    registrationLocations:registrationLocations(req.user,companyId),
    expenseTypes:db.prepare('SELECT * FROM expense_types ORDER BY active DESC,name').all(),
    categories:db.prepare('SELECT c.*,et.name expense_type_name FROM categories c LEFT JOIN expense_types et ON et.id=c.expense_type_id ORDER BY c.active DESC,c.name').all(),
    suppliers:db.prepare('SELECT * FROM suppliers WHERE company_id=? ORDER BY active DESC,name').all(companyId)
  });
}catch(e){fail(res,e)}});

const catalogTables={company:'companies',location:'locations','expense-type':'expense_types',category:'categories'};
app.post('/api/catalogs/:type',systemAdmin,(req,res)=>{try{
  const type=req.params.type;if(!catalogTables[type])throw new Error('Catálogo inválido.');
  const name=z.string().trim().min(1).max(80).parse(req.body.name);
  let result;
  if(type==='company')result=db.prepare('INSERT INTO companies(name) VALUES (?)').run(name);
  else if(type==='location')result=db.prepare('INSERT INTO locations(company_id,name) VALUES (?,?)').run(Number(req.body.companyId),name);
  else if(type==='expense-type')result=db.prepare('INSERT INTO expense_types(name) VALUES (?)').run(name);
  else result=db.prepare('INSERT INTO categories(expense_type_id,name) VALUES (?,?)').run(req.body.expenseTypeId?Number(req.body.expenseTypeId):null,name);
  const id=Number(result.lastInsertRowid);audit(req,'CREATE',type,id,name,{});
  ok(res,{id});
}catch(e){fail(res,e)}});
app.put('/api/catalogs/:type/:id',systemAdmin,(req,res)=>{try{
  const type=req.params.type,table=catalogTables[type];if(!table)throw new Error('Catálogo inválido.');
  const id=Number(req.params.id),before=catalogName(type,id);if(!before)throw new Error('Elemento no encontrado.');
  const changes={};
  if(req.body.name!==undefined){const next=z.string().trim().min(1).max(80).parse(req.body.name);db.prepare(`UPDATE ${table} SET name=? WHERE id=?`).run(next,id);changes.name={from:before,to:next}}
  if(req.body.active!==undefined){db.prepare(`UPDATE ${table} SET active=? WHERE id=?`).run(req.body.active?1:0,id);changes.active=!!req.body.active}
  audit(req,'UPDATE',type,id,catalogName(type,id),changes);
  ok(res,{ok:true});
}catch(e){fail(res,e)}});
app.get('/api/catalogs/:type/:id/usage',systemAdmin,(req,res)=>{try{
  const type=req.params.type;if(!['location','expense-type','category'].includes(type))throw new Error('Catálogo inválido.');
  const id=Number(req.params.id),name=catalogName(type,id);if(!name)throw new Error('Elemento no encontrado.');
  ok(res,{id,name,...catalogUsage(type,id)});
}catch(e){fail(res,e)}});
app.delete('/api/catalogs/:type/:id',systemAdmin,(req,res)=>{try{
  const type=req.params.type,table=catalogTables[type];
  if(!['location','expense-type','category'].includes(type)||!table)throw new Error('Catálogo inválido.');
  const id=Number(req.params.id),name=catalogName(type,id);if(!name)throw new Error('Elemento no encontrado.');
  const usage=catalogUsage(type,id);
  if(usage.inUse)return res.status(409).json({error:'No puedes eliminar este elemento porque se está usando en otros registros.',code:'CATALOG_IN_USE',...usage});
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  audit(req,'DELETE',type,id,name,{});
  ok(res,{ok:true});
}catch(e){fail(res,e)}});

app.get('/api/admin/audit',systemAdmin,(req,res)=>{try{
  const limit=Math.min(200,Math.max(1,Number(req.query.limit||100)));
  ok(res,db.prepare('SELECT id,actor_name,action,entity_type,entity_id,entity_name,details,created_at FROM audit_events ORDER BY id DESC LIMIT ?').all(limit));
}catch(e){fail(res,e)}});

app.post('/api/suppliers',manager,(req,res)=>{try{
  const x=z.object({companyId:z.coerce.number().int().positive(),name:z.string().trim().min(1).max(120)}).parse(req.body);
  ensureCompany(req.user,x.companyId);
  const result=db.prepare('INSERT INTO suppliers(company_id,name) VALUES (?,?)').run(x.companyId,x.name);
  ok(res,{id:Number(result.lastInsertRowid),name:x.name});
}catch(e){fail(res,e)}});
app.put('/api/suppliers/:id',manager,(req,res)=>{try{
  const current=db.prepare('SELECT * FROM suppliers WHERE id=?').get(Number(req.params.id));if(!current)throw new Error('Proveedor no encontrado.');
  ensureCompany(req.user,current.company_id);
  if(req.body.name!==undefined)db.prepare('UPDATE suppliers SET name=? WHERE id=?').run(z.string().trim().min(1).max(120).parse(req.body.name),current.id);
  if(req.body.active!==undefined)db.prepare('UPDATE suppliers SET active=? WHERE id=?').run(req.body.active?1:0,current.id);
  ok(res,{ok:true});
}catch(e){fail(res,e)}});

function userRow(id){
  const u=db.prepare('SELECT id,username,full_name,role,active,default_location_id,require_location_choice,can_withdraw,can_deposit,created_at FROM users WHERE id=?').get(id);
  if(!u)return null;
  return {...u,locations:db.prepare('SELECT l.id,l.name,l.company_id FROM user_locations ul JOIN locations l ON l.id=ul.location_id WHERE ul.user_id=? ORDER BY l.name').all(id)};
}
app.get('/api/admin/users',systemAdmin,(_req,res)=>ok(res,db.prepare('SELECT id FROM users ORDER BY full_name').all().map(x=>userRow(x.id))));
app.post('/api/admin/users',systemAdmin,(req,res)=>{try{
  const x=z.object({
    username:z.string().trim().min(2).max(60),fullName:z.string().trim().min(2).max(120),password:z.string().min(4).max(120),
    role:z.enum(['SYSTEM_ADMIN','LOCAL_ADMIN','USER']),locationIds:z.array(z.coerce.number().int().positive()).default([]),
    defaultLocationId:z.coerce.number().int().positive().nullable().optional(),requireLocationChoice:z.boolean().default(false),
    canWithdraw:z.boolean().default(true),canDeposit:z.boolean().default(false)
  }).parse(req.body);
  if(x.role!=='SYSTEM_ADMIN'&&!x.locationIds.length)throw new Error('Asigna al menos un local al usuario.');
  if(x.defaultLocationId&&!x.locationIds.includes(x.defaultLocationId))throw new Error('El local por defecto debe estar dentro de los locales permitidos.');
  const p=hashPassword(x.password);
  const id=transaction(()=>{
    const r=db.prepare(`INSERT INTO users(username,full_name,password_salt,password_hash,role,default_location_id,require_location_choice,can_withdraw,can_deposit)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(x.username,x.fullName,p.salt,p.hash,x.role,x.defaultLocationId||null,x.requireLocationChoice?1:0,x.canWithdraw?1:0,x.canDeposit?1:0);
    const id=Number(r.lastInsertRowid);
    for(const locationId of x.locationIds)db.prepare('INSERT INTO user_locations(user_id,location_id) VALUES (?,?)').run(id,locationId);
    return id;
  });
  ok(res,userRow(id));
}catch(e){fail(res,e)}});
app.put('/api/admin/users/:id',systemAdmin,(req,res)=>{try{
  const id=Number(req.params.id),current=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!current)throw new Error('Usuario no encontrado.');
  const x=z.object({
    username:z.string().trim().min(2).max(60),fullName:z.string().trim().min(2).max(120),password:z.string().min(4).max(120).optional(),
    role:z.enum(['SYSTEM_ADMIN','LOCAL_ADMIN','USER']),active:z.boolean(),locationIds:z.array(z.coerce.number().int().positive()).default([]),
    defaultLocationId:z.coerce.number().int().positive().nullable().optional(),requireLocationChoice:z.boolean().default(false),
    canWithdraw:z.boolean().default(true),canDeposit:z.boolean().default(false)
  }).parse(req.body);
  if(id===req.user.id&&!x.active)throw new Error('No puedes desactivar tu propia sesión.');
  if(x.role!=='SYSTEM_ADMIN'&&!x.locationIds.length)throw new Error('Asigna al menos un local al usuario.');
  if(x.defaultLocationId&&!x.locationIds.includes(x.defaultLocationId))throw new Error('El local por defecto debe estar dentro de los locales permitidos.');
  transaction(()=>{
    db.prepare(`UPDATE users SET username=?,full_name=?,role=?,active=?,default_location_id=?,require_location_choice=?,can_withdraw=?,can_deposit=? WHERE id=?`)
      .run(x.username,x.fullName,x.role,x.active?1:0,x.defaultLocationId||null,x.requireLocationChoice?1:0,x.canWithdraw?1:0,x.canDeposit?1:0,id);
    if(x.password){const p=hashPassword(x.password);db.prepare('UPDATE users SET password_salt=?,password_hash=? WHERE id=?').run(p.salt,p.hash,id)}
    db.prepare('DELETE FROM user_locations WHERE user_id=?').run(id);
    for(const locationId of x.locationIds)db.prepare('INSERT INTO user_locations(user_id,location_id) VALUES (?,?)').run(id,locationId);
  });
  ok(res,userRow(id));
}catch(e){fail(res,e)}});

const movementSchema=z.object({
  companyId:z.coerce.number().int().positive(),locationId:z.coerce.number().int().positive(),
  kind:z.enum(['INCOME','WITHDRAWAL']),purpose:z.enum(['INVOICE_PAYMENT','DIRECT_EXPENSE','OTHER']).default('OTHER'),
  amount:z.coerce.number().int().positive(),plannedDetail:z.string().trim().max(500).optional().default(''),
  invoiceMode:z.enum(['EXACT','CHANGE']).nullable().optional(),supplierId:z.coerce.number().int().positive().nullable().optional(),
  invoiceNumber:z.string().trim().max(80).optional().default(''),invoiceAmount:z.coerce.number().int().positive().nullable().optional(),
  expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),
  incomeType:z.enum(['BOX','RETURN','OTHER']).nullable().optional(),relatedMovementId:z.coerce.number().int().positive().nullable().optional(),
  boxFromDate:z.string().trim().max(10).optional().default(''),boxToDate:z.string().trim().max(10).optional().default('')
});
app.post('/api/movements',(req,res)=>{try{
  const x=movementSchema.parse(req.body);
  const location=db.prepare('SELECT * FROM locations WHERE id=? AND active=1').get(x.locationId);
  if(!location||Number(location.company_id)!==x.companyId)throw new Error('Selecciona un local válido.');
  if(!canUseLocation(req.user,x.locationId))throw new Error('Este usuario no puede registrar movimientos en ese local.');
  if(x.kind==='WITHDRAWAL'&&!req.user.can_withdraw)throw new Error('Este usuario no tiene permiso para retirar dinero.');
  if(x.kind==='INCOME'&&!req.user.can_deposit)throw new Error('Este usuario no tiene permiso para ingresar dinero.');
  if(x.kind==='WITHDRAWAL'&&x.purpose==='DIRECT_EXPENSE'&&!x.plannedDetail)throw new Error('Escribe el motivo o comentario del gasto.');
  if(x.kind==='WITHDRAWAL'&&x.purpose==='INVOICE_PAYMENT'&&!x.invoiceMode)throw new Error('Indica si la factura es monto exacto o con vuelto.');
  if(x.invoiceAmount&&x.invoiceAmount>x.amount)throw new Error('El monto de la factura no puede superar el dinero retirado.');
  const supplier=supplierName(x.supplierId);
  const id=transaction(()=>{
    const expected=x.purpose==='INVOICE_PAYMENT'
      ? (x.invoiceMode==='EXACT'?x.amount:(x.invoiceAmount||null)) : null;
    const r=db.prepare(`INSERT INTO movements(company_id,location_id,kind,purpose,amount,expected_expense_amount,planned_detail,created_by,created_by_user_id,supplier_id,invoice_mode,document_number_hint,expense_type_id,category_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(x.companyId,x.locationId,x.kind,x.purpose,x.amount,expected,x.plannedDetail,req.user.full_name,req.user.id,x.supplierId||null,x.invoiceMode||null,x.invoiceNumber||null,x.expenseTypeId||null,x.categoryId||null);
    const movementId=Number(r.lastInsertRowid);
    if(x.kind==='WITHDRAWAL'&&x.purpose==='INVOICE_PAYMENT'){
      const invoiceAmount=x.invoiceMode==='EXACT'?x.amount:(x.invoiceAmount||null);
      if(invoiceAmount)db.prepare(`INSERT INTO settlements(movement_id,document_type,document_number,supplier,supplier_id,amount,expense_type_id,category_id,detail)
        VALUES (?,'FACTURA',?,?,?,?,?,?,?)`).run(movementId,x.invoiceNumber||null,supplier,x.supplierId||null,invoiceAmount,x.expenseTypeId||null,x.categoryId||null,x.plannedDetail||null);
    }
    return movementId;
  });
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});

app.get('/api/movements',(req,res)=>{try{
  const companyId=Number(req.query.companyId);ensureCompany(req.user,companyId);ok(res,listMovements(companyId,Number(req.query.limit||100)));
}catch(e){fail(res,e)}});
app.get('/api/movements/:id',(req,res)=>{try{
  const m=getMovement(Number(req.params.id));if(!m)return fail(res,new Error('Movimiento no encontrado.'),404);
  ensureCompany(req.user,m.company_id);ok(res,m);
}catch(e){fail(res,e)}});
app.put('/api/movements/:id/classification',systemAdmin,(req,res)=>{try{
  const id=Number(req.params.id),m=getMovement(id);if(!m)throw new Error('Movimiento no encontrado.');
  const x=z.object({
    locationId:z.coerce.number().int().positive(),
    expenseTypeId:z.coerce.number().int().positive().nullable().optional(),
    categoryId:z.coerce.number().int().positive().nullable().optional()
  }).parse(req.body);
  const location=db.prepare('SELECT * FROM locations WHERE id=?').get(x.locationId);
  if(!location||Number(location.company_id)!==Number(m.company_id))throw new Error('El local no pertenece a la empresa del movimiento.');
  const before={locationId:m.location_id,expenseTypeId:m.expense_type_id,categoryId:m.category_id};
  db.prepare('UPDATE movements SET location_id=?,expense_type_id=?,category_id=? WHERE id=?')
    .run(x.locationId,x.expenseTypeId||null,x.categoryId||null,id);
  audit(req,'UPDATE_MOVEMENT','movement',id,'Movimiento #'+id,{before,after:{locationId:x.locationId,expenseTypeId:x.expenseTypeId||null,categoryId:x.categoryId||null}});
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});
app.post('/api/movements/:id/settlements',(req,res)=>{try{
  const id=Number(req.params.id),m=getMovement(id);if(!m||m.kind!=='WITHDRAWAL')throw new Error('Retiro no encontrado.');
  ensureCompany(req.user,m.company_id);
  const x=z.object({documentType:z.enum(['FACTURA','BOLETA','OTRO']).default('FACTURA'),documentNumber:z.string().trim().max(80).optional().default(''),supplierId:z.coerce.number().int().positive().nullable().optional(),amount:z.coerce.number().int().positive(),expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),detail:z.string().trim().max(500).optional().default('')}).parse(req.body);
  if(x.amount>m.pending_amount)throw new Error('El documento supera el monto pendiente.');
  const supplier=supplierName(x.supplierId)||m.supplier_name||null;
  db.prepare(`INSERT INTO settlements(movement_id,document_type,document_number,supplier,supplier_id,amount,expense_type_id,category_id,detail) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id,x.documentType,x.documentNumber||null,supplier,x.supplierId||m.supplier_id||null,x.amount,x.expenseTypeId||null,x.categoryId||null,x.detail||null);
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});
app.post('/api/movements/:id/returns',(req,res)=>{try{
  const id=Number(req.params.id),m=getMovement(id);if(!m||m.kind!=='WITHDRAWAL')throw new Error('Retiro no encontrado.');
  ensureCompany(req.user,m.company_id);
  const x=z.object({amount:z.coerce.number().int().positive(),note:z.string().trim().max(300).optional().default('')}).parse(req.body);
  if(x.amount>m.pending_amount)throw new Error('El vuelto supera el monto pendiente.');
  db.prepare('INSERT INTO returns(movement_id,amount,note) VALUES (?,?,?)').run(id,x.amount,x.note||'Vuelto recibido');
  ok(res,getMovement(id));
}catch(e){fail(res,e)}});
app.put('/api/settlements/:id',(req,res)=>{try{
  const id=Number(req.params.id),current=db.prepare('SELECT * FROM settlements WHERE id=?').get(id);if(!current)throw new Error('Documento no encontrado.');
  const m=getMovement(current.movement_id);ensureCompany(req.user,m.company_id);
  const x=z.object({documentNumber:z.string().trim().max(80).optional(),supplierId:z.coerce.number().int().positive().nullable().optional(),expenseTypeId:z.coerce.number().int().positive().nullable().optional(),categoryId:z.coerce.number().int().positive().nullable().optional(),detail:z.string().trim().max(500).optional()}).parse(req.body);
  const supplier=x.supplierId?supplierName(x.supplierId):current.supplier;
  db.prepare(`UPDATE settlements SET document_number=?,supplier=?,supplier_id=?,expense_type_id=?,category_id=?,detail=? WHERE id=?`)
    .run(x.documentNumber===undefined?current.document_number:(x.documentNumber||null),supplier,x.supplierId===undefined?current.supplier_id:(x.supplierId||null),x.expenseTypeId===undefined?current.expense_type_id:(x.expenseTypeId||null),x.categoryId===undefined?current.category_id:(x.categoryId||null),x.detail===undefined?current.detail:(x.detail||null),id);
  audit(req,'UPDATE_DOCUMENT','settlement',id,(current.document_type||'Documento')+' #'+id,{movementId:current.movement_id});
  ok(res,getMovement(current.movement_id));
}catch(e){fail(res,e)}});

app.get('/api/dashboard',(req,res)=>{try{
  const companyId=Number(req.query.companyId);ensureCompany(req.user,companyId);
  const all=listMovements(companyId,100),pending=all.filter(x=>x.kind==='WITHDRAWAL'&&x.status!=='COMPLETE');
  ok(res,{balance:cashBalance(companyId),pendingCount:pending.length,pendingAmount:pending.reduce((a,x)=>a+Math.max(0,x.pending_amount),0),pending:pending.slice(0,8),recent:all.slice(0,10)});
}catch(e){fail(res,e)}});

app.post('/api/admin/clear-test-data',systemAdmin,(req,res)=>{try{
  if(req.body?.confirmation!=='LIMPIAR PRUEBAS')throw new Error('Confirmación inválida.');
  transaction(()=>{
    db.prepare('DELETE FROM returns').run();
    db.prepare('DELETE FROM settlements').run();
    db.prepare('DELETE FROM movements').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('returns','settlements','movements')").run();
  });
  ok(res,{ok:true});
}catch(e){fail(res,e)}});
