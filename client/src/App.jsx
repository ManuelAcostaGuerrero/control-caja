import { useEffect,useMemo,useState } from 'react';
import { Home,PlusCircle,Clock3,History,Settings,ArrowDownLeft,ArrowUpRight,ReceiptText,RotateCcw,LogOut,Users,Store,Search,X,WalletCards,Trash2,Pencil,Eye,ShieldCheck } from 'lucide-react';

const token=()=>localStorage.getItem('controlCajaToken')||'';
const api=async(path,options={})=>{
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token())headers.Authorization='Bearer '+token();
  const r=await fetch(path,{...options,headers});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const error=new Error(j.error||'Error');error.data=j;throw error}
  return j;
};
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const digitsOnly=v=>String(v??'').replace(/\D/g,'');
const amountInput=v=>{const d=digitsOnly(v);return d.replace(/\B(?=(\d{3})+(?!\d))/g,'.')};
const labels={PENDING_SETTLEMENT:'Pendiente de rendición',PENDING_INVOICE:'Factura pendiente',RETURN_PENDING:'Vuelto pendiente',PENDING_BALANCE:'Saldo pendiente',DIFFERENCE:'Con diferencia',COMPLETE:'Completo'};
const shortDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString('es-CL'):'';
// SQLite guarda created_at en UTC; mostrar fecha y hora en la zona del dispositivo.
const movementDateTime=v=>{
  if(!v)return '';
  const iso=String(v).trim().replace(' ','T');
  const date=new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso)?iso:iso+'Z');
  return Number.isNaN(date.getTime())?'':date.toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
};
const movementLabel=m=>{
  if(m.kind==='INCOME'){
    if(m.income_type==='BOX'){
      const period=m.box_from_date||m.box_to_date?` · ${m.box_from_date?shortDate(m.box_from_date):'…'} a ${m.box_to_date?shortDate(m.box_to_date):'…'}`:'';
      return 'Caja'+period+(m.planned_detail&&m.planned_detail!=='Caja'?' · '+m.planned_detail:'');
    }
    if(m.income_type==='RETURN')return 'Vuelto · Movimiento #'+m.related_movement_id;
    return m.planned_detail||'Ingreso';
  }
  return m.purpose==='INVOICE_PAYMENT'?'Factura'+(m.supplier_name?' · '+m.supplier_name:''):m.planned_detail||'Gasto';
};

export default function App(){
  const [session,setSession]=useState(undefined),[view,setView]=useState('home'),[companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(null),[catalogs,setCatalogs]=useState(null),[dash,setDash]=useState(null),[movements,setMovements]=useState([]),[selected,setSelected]=useState(null),[msg,setMsg]=useState('');
  const canManage=session?.user?.role!=='USER';
  const isSystem=session?.user?.role==='SYSTEM_ADMIN';

  const loadCompany=async(cid)=>{
    const [c,d,m]=await Promise.all([api('/api/catalogs?companyId='+cid),api('/api/dashboard?companyId='+cid),api('/api/movements?companyId='+cid)]);
    setCompanyId(Number(cid));setCatalogs(c);setDash(d);setMovements(m);
  };
  const bootstrap=async(me)=>{
    const cs=await api('/api/companies');setCompanies(cs);
    const preferred=me?.locations?.find(x=>Number(x.id)===Number(me.user.defaultLocationId));
    const id=preferred?.company_id||cs[0]?.id;
    if(id)await loadCompany(id);
  };
  useEffect(()=>{(async()=>{
    if(!token()){setSession(null);return}
    try{const me=await api('/api/me');setSession(me);await bootstrap(me)}catch{localStorage.removeItem('controlCajaToken');setSession(null)}
  })()},[]);
  const logged=async result=>{localStorage.setItem('controlCajaToken',result.token);const me={user:result.user,locations:result.locations};setSession(me);await bootstrap(me)};
  const logout=async()=>{try{await api('/api/logout',{method:'POST'})}catch{}localStorage.removeItem('controlCajaToken');setSession(null);setCompanies([]);setCatalogs(null)};
  const refresh=async()=>{if(companyId)await loadCompany(companyId);setMsg('Guardado correctamente.');setTimeout(()=>setMsg(''),1800)};
  const open=async id=>{setSelected(await api('/api/movements/'+id));setView('detail')};
  const pending=useMemo(()=>movements.filter(x=>x.kind==='WITHDRAWAL'&&x.status!=='COMPLETE'),[movements]);

  if(session===undefined)return <div className="center">Preparando Control Caja…</div>;
  if(!session)return <Login onLogin={logged}/>;
  if(!companyId||!catalogs)return <div className="center">Cargando…</div>;

  return <div className="shell">
    <aside><div className="brand">CONTROL CAJA<small>v0.4.0</small></div><Nav view={view} setView={setView} canManage={canManage}/></aside>
    <main>
      <header>
        <div><b>{session.user.fullName}</b><span>{session.user.role==='SYSTEM_ADMIN'?'Administrador del sistema':session.user.role==='LOCAL_ADMIN'?'Administrador local':'Usuario'}</span></div>
        <div className="header-actions">
          {companies.length>1&&<select value={companyId} onChange={e=>loadCompany(Number(e.target.value))}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <button className="icon-btn" onClick={logout} title="Cerrar sesión"><LogOut size={19}/></button>
        </div>
      </header>
      {msg&&<div className="toast">{msg}</div>}
      {view==='home'&&<HomeView dash={dash} open={open} setView={setView}/>}
      {view==='new'&&<NewMovement companyId={companyId} catalogs={catalogs} session={session} canManage={canManage} after={refresh}/>}
      {view==='pending'&&<List title="Pendientes" items={pending} open={open}/>}
      {view==='history'&&<List title="Historial" items={movements} open={open}/>}
      {view==='settings'&&canManage&&<SettingsView companyId={companyId} catalogs={catalogs} isSystem={isSystem} after={refresh} openMovement={open}/>}
      {view==='detail'&&selected&&<Detail movement={selected} catalogs={catalogs} canManage={canManage} isSystem={isSystem} after={async()=>{await refresh();setSelected(await api('/api/movements/'+selected.id))}} back={()=>setView('pending')}/>}
    </main>
    <nav className="bottom"><Nav view={view} setView={setView} canManage={canManage}/></nav>
  </div>;
}

function Login({onLogin}){
  const [username,setUsername]=useState('admin'),[password,setPassword]=useState('admin'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await onLogin(await api('/api/login',{method:'POST',body:JSON.stringify({username,password})}))}catch(e){setError(e.message)}finally{setBusy(false)}};
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="brand dark">CONTROL CAJA<small>Acceso al sistema</small></div><label>Usuario<input autoCapitalize="none" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Clave<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button><small className="muted">Acceso inicial de pruebas: admin / admin</small></form></div>;
}
function Nav({view,setView,canManage}){
  const items=[['home',Home,'Inicio'],['new',PlusCircle,'Registrar'],['pending',Clock3,'Pendientes'],['history',History,'Historial']];
  if(canManage)items.push(['settings',Settings,'Config.']);
  return <>{items.map(([id,Icon,t])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={20}/><span>{t}</span></button>)}</>;
}
function HomeView({dash,open,setView}){return <section><div className="balance"><span>Saldo actual</span><strong>{money(dash.balance)}</strong><small>Dinero físico estimado en caja fuerte</small></div><div className="cards"><div><b>{dash.pendingCount}</b><span>Pendientes</span></div><div><b>{money(dash.pendingAmount)}</b><span>Por rendir / devolver</span></div></div><div className="quick"><button onClick={()=>setView('new')}><PlusCircle/>Registrar movimiento</button></div><h2>Pendientes prioritarios</h2><MovementCards items={dash.pending} open={open}/><h2>Últimos movimientos</h2><MovementCards items={dash.recent} open={open}/></section>}
function MovementCards({items=[],open}){return <div className="movement-list">{items.length===0?<div className="empty">Sin movimientos.</div>:items.map(m=><button className="movement" key={m.id} onClick={()=>open(m.id)}><span className={'icon '+(m.kind==='INCOME'?'in':'out')}>{m.kind==='INCOME'?<ArrowDownLeft/>:<ArrowUpRight/>}</span><span className="grow">{m.created_at&&<time className="movement-date">{movementDateTime(m.created_at)}</time>}<b>{m.location_name||m.company_name}</b><small>{movementLabel(m)}</small><em>{labels[m.status]} · {m.created_by_name}</em></span><strong>{m.kind==='INCOME'?'+':'-'}{money(m.amount)}</strong></button>)}</div>}
function List({title,items,open}){return <section><h1>{title}</h1><MovementCards items={items} open={open}/></section>}

function NewMovement({companyId,catalogs,session,canManage,after}){
  const user=session.user,registerLocations=(catalogs.registrationLocations||catalogs.locations).filter(x=>x.active);
  const initialLocation=(!user.requireLocationChoice&&user.defaultLocationId&&registerLocations.some(x=>Number(x.id)===Number(user.defaultLocationId)))?String(user.defaultLocationId):'';
  const [kind,setKind]=useState('WITHDRAWAL'),[purpose,setPurpose]=useState('DIRECT_EXPENSE'),[incomeType,setIncomeType]=useState('OTHER'),[providerOpen,setProviderOpen]=useState(false),[busy,setBusy]=useState(false),[returnOptions,setReturnOptions]=useState([]);
  const [form,setForm]=useState({amount:'',locationId:initialLocation,comment:'',invoiceMode:'EXACT',invoiceNumber:'',invoiceAmount:'',supplierId:'',expenseTypeId:'',categoryId:'',relatedMovementId:'',boxFromDate:'',boxToDate:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const supplier=catalogs.suppliers.find(x=>String(x.id)===String(form.supplierId));
  const selectedReturn=returnOptions.find(x=>String(x.id)===String(form.relatedMovementId));
  useEffect(()=>{if(kind==='INCOME'&&incomeType==='RETURN')api('/api/pending-returns?companyId='+companyId).then(setReturnOptions).catch(e=>alert(e.message))},[kind,incomeType,companyId]);
  const reset=()=>{setForm({amount:'',locationId:initialLocation,comment:'',invoiceMode:'EXACT',invoiceNumber:'',invoiceAmount:'',supplierId:'',expenseTypeId:'',categoryId:'',relatedMovementId:'',boxFromDate:'',boxToDate:''});setPurpose('DIRECT_EXPENSE');setIncomeType('OTHER')};
  const submit=async e=>{e.preventDefault();setBusy(true);try{
    if(kind==='INCOME'){
      const body={companyId,locationId:form.locationId?Number(form.locationId):null,amount:Number(form.amount),incomeType,comment:form.comment,relatedMovementId:form.relatedMovementId?Number(form.relatedMovementId):null,boxFromDate:form.boxFromDate,boxToDate:form.boxToDate};
      await api('/api/incomes',{method:'POST',body:JSON.stringify(body)});
    }else{
      const body={companyId,locationId:Number(form.locationId),kind,purpose,amount:Number(form.amount),plannedDetail:form.comment,expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null};
      if(purpose==='INVOICE_PAYMENT')Object.assign(body,{invoiceMode:form.invoiceMode,supplierId:form.supplierId?Number(form.supplierId):null,invoiceNumber:form.invoiceNumber,invoiceAmount:form.invoiceMode==='CHANGE'&&form.invoiceAmount?Number(form.invoiceAmount):null});
      await api('/api/movements',{method:'POST',body:JSON.stringify(body)});
    }
    reset();await after();
  }catch(e){alert(e.message)}finally{setBusy(false)}};
  return <section><h1>Registrar</h1>
    <div className="seg"><button type="button" className={kind==='WITHDRAWAL'?'active':''} onClick={()=>setKind('WITHDRAWAL')}>Retiro</button>{user.canDeposit&&<button type="button" className={kind==='INCOME'?'active':''} onClick={()=>setKind('INCOME')}>Ingreso</button>}</div>
    <form className="form simple-form" onSubmit={submit}>
      {kind==='INCOME'&&<div className="quick-type full"><span>Motivo</span><button type="button" className={incomeType==='BOX'?'active':''} onClick={()=>setIncomeType('BOX')}><Store size={18}/> Caja</button><button type="button" className={incomeType==='RETURN'?'active':''} onClick={()=>setIncomeType('RETURN')}><RotateCcw size={18}/> Vuelto</button><button type="button" className={incomeType==='OTHER'?'active':''} onClick={()=>setIncomeType('OTHER')}><PlusCircle size={18}/> Otro</button></div>}
      {!(kind==='INCOME'&&incomeType==='RETURN')&&<label>Local<select required value={form.locationId} onChange={e=>set('locationId',e.target.value)}><option value="">Seleccionar local</option>{registerLocations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      <label>Monto<input inputMode="numeric" required value={amountInput(form.amount)} onChange={e=>set('amount',digitsOnly(e.target.value))} placeholder="$ 0"/></label>
      {kind==='WITHDRAWAL'&&<>
        <div className="quick-type full"><span>Tipo</span><button type="button" className={purpose==='DIRECT_EXPENSE'?'active':''} onClick={()=>setPurpose('DIRECT_EXPENSE')}><WalletCards size={18}/> Gasto</button><button type="button" className={purpose==='INVOICE_PAYMENT'?'active':''} onClick={()=>setPurpose('INVOICE_PAYMENT')}><ReceiptText size={18}/> Factura</button></div>
        <details className="full optional"><summary>Clasificación opcional</summary><div className="optional-grid"><label>Tipo de gasto<select value={form.expenseTypeId} onChange={e=>set('expenseTypeId',e.target.value)}><option value="">Sin definir</option>{catalogs.expenseTypes.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Categoría<select value={form.categoryId} onChange={e=>set('categoryId',e.target.value)}><option value="">Sin definir</option>{catalogs.categories.filter(x=>x.active&&(!form.expenseTypeId||String(x.expense_type_id)===String(form.expenseTypeId))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div></details>
        <label className="full">Comentario {purpose==='INVOICE_PAYMENT'&&<small>(opcional)</small>}<textarea required={purpose==='DIRECT_EXPENSE'} value={form.comment} onChange={e=>set('comment',e.target.value)} placeholder={purpose==='INVOICE_PAYMENT'?'Ej. mercadería para el local':'¿Para qué sale este dinero?'}/></label>
        {purpose==='INVOICE_PAYMENT'&&<div className="invoice-simple">
          <label>N.º factura <small>(opcional)</small><input value={form.invoiceNumber} onChange={e=>set('invoiceNumber',e.target.value)} placeholder="Puede quedar pendiente"/></label>
          <label>Proveedor<button type="button" className="provider-trigger" onClick={()=>setProviderOpen(true)}>{supplier?.name||'Seleccionar proveedor'}</button></label>
          <div className="quick-type full"><span>Monto factura</span><button type="button" className={form.invoiceMode==='EXACT'?'active':''} onClick={()=>set('invoiceMode','EXACT')}>Monto exacto</button><button type="button" className={form.invoiceMode==='CHANGE'?'active':''} onClick={()=>set('invoiceMode','CHANGE')}>Con vuelto</button></div>
          {form.invoiceMode==='CHANGE'&&<label className="full">Monto de la factura <small>(si ya lo sabes)</small><input inputMode="numeric" value={amountInput(form.invoiceAmount)} onChange={e=>set('invoiceAmount',digitsOnly(e.target.value))} placeholder="Se puede completar después"/></label>}
          {form.invoiceMode==='CHANGE'&&form.invoiceAmount&&Number(form.amount)>=Number(form.invoiceAmount)&&<div className="calc full">Vuelto esperado <strong>{money(Number(form.amount)-Number(form.invoiceAmount))}</strong></div>}
        </div>}
      </>}
      {kind==='INCOME'&&incomeType==='BOX'&&<>
        <div className="date-range full"><label>Desde <small>(opcional)</small><input type="date" value={form.boxFromDate} onChange={e=>set('boxFromDate',e.target.value)}/></label><label>Hasta <small>(opcional)</small><input type="date" value={form.boxToDate} onChange={e=>set('boxToDate',e.target.value)}/></label></div>
        <label className="full">Comentario <small>(opcional)</small><textarea value={form.comment} onChange={e=>set('comment',e.target.value)} placeholder="Ej. cajas fin de semana"/></label>
      </>}
      {kind==='INCOME'&&incomeType==='RETURN'&&<div className="return-panel full"><b>¿Vuelto de cuál movimiento?</b>{returnOptions.length?<div className="return-options">{returnOptions.map(x=><button type="button" key={x.id} className={String(form.relatedMovementId)===String(x.id)?'selected':''} onClick={()=>{set('relatedMovementId',String(x.id));set('locationId',String(x.locationId))}}><span>Movimiento #{x.id} · {x.locationName}</span><strong>Pendiente {money(x.pendingAmount)}</strong>{(x.invoiceNumber||x.supplierName)&&<small>{x.invoiceNumber?'Factura '+x.invoiceNumber:''}{x.invoiceNumber&&x.supplierName?' · ':''}{x.supplierName}</small>}</button>)}</div>:<div className="empty">No hay vueltos pendientes disponibles.</div>}{selectedReturn&&<div className="selected-return">Se ingresará en <b>{selectedReturn.locationName}</b>. Puedes registrar solo una parte y dejar el resto pendiente.</div>}<label>Comentario <small>(opcional)</small><input value={form.comment} onChange={e=>set('comment',e.target.value)} placeholder="Ej. primer vuelto"/></label></div>}
      {kind==='INCOME'&&incomeType==='OTHER'&&<label className="full">Comentario<textarea required value={form.comment} onChange={e=>set('comment',e.target.value)} placeholder="Motivo del ingreso"/></label>}
      <button className="primary full" disabled={busy||Boolean(kind==='INCOME'&&incomeType==='RETURN'&&!form.relatedMovementId)}>{busy?'Guardando…':'Registrar '+(kind==='WITHDRAWAL'?'retiro':'ingreso')}</button>
    </form>
    {providerOpen&&<ProviderModal suppliers={catalogs.suppliers} canAdd={canManage} companyId={companyId} selected={form.supplierId} onSelect={id=>{set('supplierId',id);setProviderOpen(false)}} onClose={()=>setProviderOpen(false)} after={after}/>}
  </section>;
}
function ProviderModal({suppliers,canAdd,companyId,selected,onSelect,onClose,after}){
  const [q,setQ]=useState(''),[name,setName]=useState('');
  const list=suppliers.filter(x=>x.active&&x.name.toLowerCase().includes(q.toLowerCase()));
  const add=async e=>{e.preventDefault();if(!name.trim())return;try{const r=await api('/api/suppliers',{method:'POST',body:JSON.stringify({companyId,name})});await after();onSelect(String(r.id))}catch(e){alert(e.message)}};
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><b>Seleccionar proveedor</b><button onClick={onClose}><X/></button></div><div className="search"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar proveedor" aria-label="Buscar proveedor"/></div><div className="provider-list">{list.map(s=><button key={s.id} className={String(s.id)===String(selected)?'selected':''} onClick={()=>onSelect(String(s.id))}>{s.name}</button>)}{!list.length&&<div className="empty">No hay proveedores.</div>}</div>{canAdd&&<form className="add-provider" onSubmit={add}><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nuevo proveedor"/><button>Agregar</button></form>}</div></div>;
}

function Detail({movement:m,catalogs,canManage,isSystem,after,back}){
  const [mode,setMode]=useState(''),[editId,setEditId]=useState(null),[providerOpen,setProviderOpen]=useState(false),[classEdit,setClassEdit]=useState(false);
  const [form,setForm]=useState({amount:String(Math.max(0,m.pending_amount)),documentType:'FACTURA',documentNumber:m.document_number_hint||'',supplierId:m.supplier_id||'',expenseTypeId:m.expense_type_id||'',categoryId:m.category_id||'',detail:m.planned_detail||''});
  const [classForm,setClassForm]=useState({locationId:String(m.location_id||''),expenseTypeId:m.expense_type_id?String(m.expense_type_id):'',categoryId:m.category_id?String(m.category_id):''});
  useEffect(()=>setClassForm({locationId:String(m.location_id||''),expenseTypeId:m.expense_type_id?String(m.expense_type_id):'',categoryId:m.category_id?String(m.category_id):''}),[m.id,m.location_id,m.expense_type_id,m.category_id]);
  const openNew=kind=>{setEditId(null);setForm(f=>({...f,amount:String(Math.max(0,m.pending_amount)),documentNumber:m.document_number_hint||'',supplierId:m.supplier_id||''}));setMode(kind)};
  const openEdit=s=>{setEditId(s.id);setForm({amount:String(s.amount),documentType:s.document_type,documentNumber:s.document_number||'',supplierId:s.supplier_id||'',expenseTypeId:s.expense_type_id||'',categoryId:s.category_id||'',detail:s.detail||''});setMode('edit')};
  const save=async()=>{try{
    if(mode==='return')await api('/api/movements/'+m.id+'/returns',{method:'POST',body:JSON.stringify({amount:Number(form.amount),note:'Vuelto recibido'})});
    else if(mode==='edit')await api('/api/settlements/'+editId,{method:'PUT',body:JSON.stringify({documentNumber:form.documentNumber,supplierId:form.supplierId?Number(form.supplierId):null,expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null,detail:form.detail})});
    else await api('/api/movements/'+m.id+'/settlements',{method:'POST',body:JSON.stringify({documentType:form.documentType,documentNumber:form.documentNumber,supplierId:form.supplierId?Number(form.supplierId):null,amount:Number(form.amount),expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null,detail:form.detail})});
    setMode('');setEditId(null);await after();
  }catch(e){alert(e.message)}};
  const supplier=catalogs.suppliers.find(x=>String(x.id)===String(form.supplierId));
  const saveClassification=async()=>{try{await api('/api/movements/'+m.id+'/classification',{method:'PUT',body:JSON.stringify({locationId:Number(classForm.locationId),expenseTypeId:classForm.expenseTypeId?Number(classForm.expenseTypeId):null,categoryId:classForm.categoryId?Number(classForm.categoryId):null})});setClassEdit(false);await after()}catch(e){alert(e.message)}};
  return <section><button className="link" onClick={back}>← Volver</button><h1>Movimiento #{m.id}</h1>
    <div className="detail-head"><b>{money(m.amount)}</b><span>{labels[m.status]}</span>{m.created_at&&<small>Fecha y hora: {movementDateTime(m.created_at)}</small>}<small>{m.location_name} · Registrado por {m.created_by_name}</small>{m.purpose==='INVOICE_PAYMENT'&&<small>{m.supplier_name||'Proveedor pendiente'}{m.document_number_hint?' · Factura '+m.document_number_hint:''}</small>}</div>
    {isSystem&&<div className="classification-card"><div><b>Clasificación</b><small>{m.location_name}{m.movement_expense_type_name?' · '+m.movement_expense_type_name:''}{m.movement_category_name?' · '+m.movement_category_name:''}</small></div>{!classEdit?<button onClick={()=>setClassEdit(true)}><Pencil size={16}/> Modificar</button>:<div className="classification-editor"><label>Local<select value={classForm.locationId} onChange={e=>setClassForm({...classForm,locationId:e.target.value})}>{catalogs.locations.filter(x=>x.active||String(x.id)===String(m.location_id)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Tipo<select value={classForm.expenseTypeId} onChange={e=>setClassForm({...classForm,expenseTypeId:e.target.value,categoryId:''})}><option value="">Sin definir</option>{catalogs.expenseTypes.filter(x=>x.active||String(x.id)===String(m.expense_type_id)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Categoría<select value={classForm.categoryId} onChange={e=>setClassForm({...classForm,categoryId:e.target.value})}><option value="">Sin definir</option>{catalogs.categories.filter(x=>(x.active||String(x.id)===String(m.category_id))&&(!classForm.expenseTypeId||String(x.expense_type_id)===String(classForm.expenseTypeId))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="row-actions"><button className="primary" onClick={saveClassification}>Guardar</button><button onClick={()=>setClassEdit(false)}>Cancelar</button></div></div>}</div>}
    {m.kind==='WITHDRAWAL'&&m.purpose!=='DIRECT_EXPENSE'&&<div className="summary"><div><span>Entregado</span><b>{money(m.amount)}</b></div><div><span>Documentos</span><b>{money(m.settled_amount)}</b></div><div><span>Vuelto</span><b>{money(m.returned_amount)}</b></div><div><span>Pendiente</span><b>{money(m.pending_amount)}</b></div></div>}
    {m.purpose==='DIRECT_EXPENSE'&&<div className="note-card"><b>Gasto</b><span>{m.planned_detail}</span>{m.movement_category_name&&<small>{m.movement_category_name}</small>}</div>}
    {m.kind==='INCOME'&&<div className="note-card"><b>{m.income_type==='BOX'?'Caja':m.income_type==='RETURN'?'Vuelto':'Ingreso'}</b><span>{movementLabel(m)}</span>{m.income_type==='RETURN'&&<small>Relacionado con Movimiento #{m.related_movement_id}</small>}</div>}
    {m.purpose==='INVOICE_PAYMENT'&&<><h2>Factura / rendición</h2>{m.settlements.map(s=><div className="line" key={s.id}><ReceiptText/><span><b>{s.document_type} {s.document_number||'— número pendiente'}</b><small>{s.supplier_name||s.detail||'Sin proveedor'}</small></span><strong>{money(s.amount)}</strong>{!s.document_number&&<button className="small-btn" onClick={()=>openEdit(s)}>Completar</button>}</div>)}{m.returns.map(r=><div className="line" key={r.item_key||('r'+r.id)}><RotateCcw/><span><b>Vuelto</b><small>{r.note}</small></span><strong>{money(r.amount)}</strong></div>)}
      {m.pending_amount>0&&<div className="actions"><button onClick={()=>openNew('document')}>+ Registrar factura</button><button onClick={()=>openNew('return')}>+ Registrar vuelto</button></div>}
    </>}
    {mode&&<div className="form mini">
      {(mode==='document'||mode==='edit')&&<><label>N.º documento<input value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value})}/></label><label>Proveedor<button type="button" className="provider-trigger" onClick={()=>setProviderOpen(true)}>{supplier?.name||'Seleccionar proveedor'}</button></label><label>Tipo de gasto<select value={form.expenseTypeId} onChange={e=>setForm({...form,expenseTypeId:e.target.value,categoryId:''})}><option value="">Sin definir</option>{catalogs.expenseTypes.filter(x=>x.active||String(x.id)===String(form.expenseTypeId)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Categoría<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Sin definir</option>{catalogs.categories.filter(x=>(x.active||String(x.id)===String(form.categoryId))&&(!form.expenseTypeId||String(x.expense_type_id)===String(form.expenseTypeId))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="full">Detalle<input value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})}/></label></>}
      {mode!=='edit'&&<label>Monto<input inputMode="numeric" value={amountInput(form.amount)} onChange={e=>setForm({...form,amount:digitsOnly(e.target.value)})}/></label>}<button className="primary" onClick={save}>{mode==='edit'?'Actualizar':'Guardar'}</button>
    </div>}
    {providerOpen&&<ProviderModal suppliers={catalogs.suppliers} canAdd={canManage} companyId={m.company_id} selected={form.supplierId} onSelect={id=>{setForm({...form,supplierId:id});setProviderOpen(false)}} onClose={()=>setProviderOpen(false)} after={after}/>}
  </section>;
}

function SettingsView({companyId,catalogs,isSystem,after,openMovement}){
  const [tab,setTab]=useState(isSystem?'users':'suppliers');
  return <section><h1>Configuración</h1><div className="seg">{isSystem&&<button className={tab==='users'?'active':''} onClick={()=>setTab('users')}><Users size={17}/> Usuarios</button>}<button className={tab==='suppliers'?'active':''} onClick={()=>setTab('suppliers')}><Store size={17}/> Proveedores</button>{isSystem&&<button className={tab==='catalogs'?'active':''} onClick={()=>setTab('catalogs')}>Catálogos</button>}{isSystem&&<button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}><ShieldCheck size={17}/> Auditoría</button>}{isSystem&&<button className={tab==='tests'?'active':''} onClick={()=>setTab('tests')}>Pruebas</button>}</div>
    {tab==='users'&&isSystem&&<UsersAdmin catalogs={catalogs}/>}
    {tab==='suppliers'&&<SuppliersAdmin companyId={companyId} suppliers={catalogs.suppliers} after={after}/>}
    {tab==='catalogs'&&isSystem&&<Catalogs companyId={companyId} catalogs={catalogs} after={after} openMovement={openMovement}/>}
    {tab==='audit'&&isSystem&&<AuditLog/>}
    {tab==='tests'&&isSystem&&<TestData after={after}/>}
  </section>;
}
function UsersAdmin({catalogs}){
  const [users,setUsers]=useState([]),[editing,setEditing]=useState(null);
  const blank={id:null,fullName:'',username:'',password:'',role:'USER',active:true,locationIds:[],defaultLocationId:'',requireLocationChoice:false,canWithdraw:true,canDeposit:false};
  const [form,setForm]=useState(blank);
  const load=()=>api('/api/admin/users').then(setUsers).catch(e=>alert(e.message));
  useEffect(()=>{load()},[]);
  const edit=u=>{setEditing(u.id);setForm({id:u.id,fullName:u.full_name,username:u.username,password:'',role:u.role,active:!!u.active,locationIds:u.locations.map(x=>Number(x.id)),defaultLocationId:u.default_location_id?String(u.default_location_id):'',requireLocationChoice:!!u.require_location_choice,canWithdraw:!!u.can_withdraw,canDeposit:!!u.can_deposit})};
  const toggleLoc=id=>setForm(f=>({...f,locationIds:f.locationIds.includes(id)?f.locationIds.filter(x=>x!==id):[...f.locationIds,id],defaultLocationId:f.defaultLocationId&&Number(f.defaultLocationId)===id?'':f.defaultLocationId}));
  const save=async e=>{e.preventDefault();try{const body={username:form.username,fullName:form.fullName,role:form.role,active:form.active,locationIds:form.locationIds,defaultLocationId:form.defaultLocationId?Number(form.defaultLocationId):null,requireLocationChoice:form.requireLocationChoice,canWithdraw:form.canWithdraw,canDeposit:form.canDeposit};if(form.password)body.password=form.password;if(!editing&&!form.password)throw new Error('La clave es obligatoria para un usuario nuevo.');await api(editing?'/api/admin/users/'+editing:'/api/admin/users',{method:editing?'PUT':'POST',body:JSON.stringify(body)});setEditing(null);setForm(blank);await load()}catch(e){alert(e.message)}};
  return <div className="admin-grid"><form className="form user-form" onSubmit={save}><h2 className="full">{editing?'Editar usuario':'Nuevo usuario'}</h2><label>Nombre<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label><label>Usuario<input required autoCapitalize="none" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label>Clave {editing&&<small>(solo si cambia)</small>}<input type="password" required={!editing} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label>Rol<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="USER">Usuario</option><option value="LOCAL_ADMIN">Administrador local</option><option value="SYSTEM_ADMIN">Administrador del sistema</option></select></label>
    <div className="full"><b>Locales permitidos para ver historial</b><small className="muted field-note">Un administrador local puede registrar una operación puntual en otro local de la empresa sin ver su historial.</small><div className="check-grid">{catalogs.locations.filter(x=>x.active).map(l=><label className="check" key={l.id}><input type="checkbox" checked={form.locationIds.includes(Number(l.id))} onChange={()=>toggleLoc(Number(l.id))}/>{l.name}</label>)}</div></div>
    <label>Local por defecto<select value={form.defaultLocationId} onChange={e=>setForm({...form,defaultLocationId:e.target.value})}><option value="">Elegir cada vez</option>{catalogs.locations.filter(x=>form.locationIds.includes(Number(x.id))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="permission-box"><label className="check"><input type="checkbox" checked={form.requireLocationChoice} onChange={e=>setForm({...form,requireLocationChoice:e.target.checked,defaultLocationId:e.target.checked?'':form.defaultLocationId})}/>Obligar a elegir local</label><label className="check"><input type="checkbox" checked={form.canWithdraw} onChange={e=>setForm({...form,canWithdraw:e.target.checked})}/>Puede retirar</label><label className="check"><input type="checkbox" checked={form.canDeposit} onChange={e=>setForm({...form,canDeposit:e.target.checked})}/>Puede ingresar</label>{editing&&<label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Usuario activo</label>}</div>
    <div className="row-actions full"><button className="primary">{editing?'Guardar cambios':'Crear usuario'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(blank)}}>Cancelar</button>}</div></form>
    <div className="user-list">{users.map(u=><button key={u.id} onClick={()=>edit(u)}><span><b>{u.full_name}</b><small>@{u.username} · {u.role==='SYSTEM_ADMIN'?'Admin sistema':u.role==='LOCAL_ADMIN'?'Admin local':'Usuario'}</small><small>{u.locations.length?u.locations.map(x=>x.name).join(', '):'Todos los locales / sin asignar'}</small></span><em>{u.active?'Activo':'Inactivo'}</em></button>)}</div>
  </div>;
}
function SuppliersAdmin({companyId,suppliers,after}){
  const [name,setName]=useState('');
  const add=async e=>{e.preventDefault();try{await api('/api/suppliers',{method:'POST',body:JSON.stringify({companyId,name})});setName('');await after()}catch(e){alert(e.message)}};
  const toggle=async s=>{try{await api('/api/suppliers/'+s.id,{method:'PUT',body:JSON.stringify({active:!s.active})});await after()}catch(e){alert(e.message)}};
  return <><form className="inline" onSubmit={add}><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nuevo proveedor"/><button>Agregar</button></form><div className="settings-list">{suppliers.map(s=><div key={s.id}><span>{s.name}</span><button onClick={()=>toggle(s)}>{s.active?'Desactivar':'Activar'}</button></div>)}</div></>;
}
function Catalogs({companyId,catalogs,after,openMovement}){
  const [type,setType]=useState('location'),[name,setName]=useState(''),[expenseTypeId,setExpenseTypeId]=useState(''),[blocked,setBlocked]=useState(null),[showMovements,setShowMovements]=useState(false);
  const create=async e=>{e.preventDefault();try{await api('/api/catalogs/'+type,{method:'POST',body:JSON.stringify({name,companyId,expenseTypeId:expenseTypeId?Number(expenseTypeId):null})});setName('');setExpenseTypeId('');await after()}catch(e){alert(e.message)}};
  const list=type==='location'?catalogs.locations:type==='expense-type'?catalogs.expenseTypes:catalogs.categories;
  const toggle=async x=>{try{await api('/api/catalogs/'+type+'/'+x.id,{method:'PUT',body:JSON.stringify({active:!x.active})});await after()}catch(e){alert(e.message)}};
  const edit=async x=>{const next=window.prompt('Nuevo nombre',x.name);if(!next||next.trim()===x.name)return;try{await api('/api/catalogs/'+type+'/'+x.id,{method:'PUT',body:JSON.stringify({name:next.trim()})});await after()}catch(e){alert(e.message)}};
  const remove=async x=>{if(!window.confirm('¿Eliminar "'+x.name+'"? Si está siendo utilizado, el sistema no permitirá borrarlo.'))return;try{await api('/api/catalogs/'+type+'/'+x.id,{method:'DELETE'});await after()}catch(e){if(e.data?.code==='CATALOG_IN_USE'){setBlocked({...e.data,item:x});setShowMovements(false)}else alert(e.message)}};
  const closeBlocked=()=>{setBlocked(null);setShowMovements(false)};
  return <><div className="seg"><button className={type==='location'?'active':''} onClick={()=>setType('location')}>Locales</button><button className={type==='expense-type'?'active':''} onClick={()=>setType('expense-type')}>Tipos</button><button className={type==='category'?'active':''} onClick={()=>setType('category')}>Categorías</button></div>
    <form className={'catalog-create '+(type==='category'?'with-type':'')} onSubmit={create}>{type==='category'&&<select value={expenseTypeId} onChange={e=>setExpenseTypeId(e.target.value)}><option value="">Tipo opcional</option>{catalogs.expenseTypes.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nuevo nombre"/><button>Agregar</button></form>
    <div className="settings-list catalog-list">{list.map(x=><div key={x.id}><span><b>{x.name}</b>{x.expense_type_name&&<small>{x.expense_type_name}</small>}</span><span className="catalog-actions"><button title="Editar" onClick={()=>edit(x)}><Pencil size={16}/><span>Editar</span></button><button onClick={()=>toggle(x)}>{x.active?'Desactivar':'Activar'}</button><button className="danger-action" title="Eliminar" onClick={()=>remove(x)}><Trash2 size={16}/><span>Eliminar</span></button></span></div>)}</div>
    {blocked&&<div className="modal-backdrop" onMouseDown={closeBlocked}><div className="modal usage-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><b>No se puede eliminar</b><button onClick={closeBlocked}><X/></button></div><p>Este elemento se está usando en otros registros.</p>{!showMovements&&<>{blocked.otherUsage?.length>0&&<p className="muted">También está relacionado con configuración interna que debe corregirse antes de eliminarlo.</p>}<div className="modal-actions">{blocked.movementIds?.length>0&&<button className="primary" onClick={()=>setShowMovements(true)}><Eye size={17}/> Ver movimientos</button>}<button onClick={closeBlocked}>Cerrar</button></div></>}{showMovements&&<><p className="muted">Movimientos donde está asignado:</p><div className="usage-list">{blocked.movementIds.map(id=><button key={id} onClick={()=>{closeBlocked();openMovement(id)}}>Movimiento #{id}</button>)}</div>{blocked.otherUsage?.length>0&&<p className="muted">También está relacionado con otra configuración del sistema y debe corregirse antes de eliminarlo.</p>}<div className="modal-actions"><button onClick={closeBlocked}>Cerrar</button></div></>}</div></div>}
  </>;
}
function AuditLog(){
  const [rows,setRows]=useState([]),[error,setError]=useState('');
  useEffect(()=>{api('/api/admin/audit?limit=150').then(setRows).catch(e=>setError(e.message))},[]);
  const actionLabel=a=>({CREATE:'Creó',UPDATE:'Modificó',DELETE:'Eliminó',UPDATE_MOVEMENT:'Corrigió',UPDATE_DOCUMENT:'Modificó'}[a]||a);
  const typeLabel=t=>({location:'local','expense-type':'tipo de gasto',category:'categoría',company:'empresa',movement:'movimiento',settlement:'documento'}[t]||t);
  return <div><p className="muted">Registro de cambios administrativos y correcciones realizadas por usuario.</p>{error&&<div className="error">{error}</div>}<div className="audit-list">{rows.map(r=><div key={r.id}><span><b>{r.actor_name}</b><small>{actionLabel(r.action)} {typeLabel(r.entity_type)} · {r.entity_name||('#'+r.entity_id)}</small></span><time>{new Date(r.created_at+'Z').toLocaleString('es-CL')}</time></div>)}{!rows.length&&!error&&<div className="empty">Sin cambios registrados todavía.</div>}</div></div>;
}
function TestData({after}){
  const clear=async()=>{const confirmation=window.prompt('Escribe LIMPIAR PRUEBAS para borrar movimientos, facturas y vueltos de prueba. No se borrarán usuarios ni configuraciones.');if(confirmation!=='LIMPIAR PRUEBAS')return;try{await api('/api/admin/clear-test-data',{method:'POST',body:JSON.stringify({confirmation})});await after();alert('Datos de prueba eliminados.')}catch(e){alert(e.message)}};
  return <div className="danger-card"><b>Limpiar datos de prueba</b><p>Elimina movimientos, facturas, rendiciones y vueltos. Conserva usuarios, locales, proveedores y categorías.</p><button onClick={clear}>Limpiar movimientos de prueba</button></div>;
}
