import { useEffect,useMemo,useState } from 'react';
import { Home,PlusCircle,Clock3,History,Settings,ArrowDownLeft,ArrowUpRight,ReceiptText,RotateCcw } from 'lucide-react';

const api=async(path,options={})=>{const r=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const j=await r.json();if(!r.ok)throw new Error(j.error||'Error');return j};
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const labels={PENDING_SETTLEMENT:'Pendiente de rendición',PENDING_INVOICE:'Factura pendiente',RETURN_PENDING:'Vuelto pendiente',PENDING_BALANCE:'Saldo pendiente',DIFFERENCE:'Con diferencia',COMPLETE:'Completo'};

export default function App(){
  const [view,setView]=useState('home'),[companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(null),[catalogs,setCatalogs]=useState(null),[dash,setDash]=useState(null),[movements,setMovements]=useState([]),[selected,setSelected]=useState(null),[msg,setMsg]=useState('');
  const load=async(cid=companyId)=>{const cs=await api('/api/companies');setCompanies(cs);const id=cid||cs[0]?.id;if(!id)return;setCompanyId(Number(id));const [c,d,m]=await Promise.all([api(`/api/catalogs?companyId=${id}`),api(`/api/dashboard?companyId=${id}`),api(`/api/movements?companyId=${id}`)]);setCatalogs(c);setDash(d);setMovements(m)};
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[]);
  const open=async id=>{const m=await api(`/api/movements/${id}`);setSelected(m);setView('detail')};
  const pending=useMemo(()=>movements.filter(x=>x.kind==='WITHDRAWAL'&&x.status!=='COMPLETE'),[movements]);
  const refresh=async()=>{await load(companyId);setMsg('Guardado correctamente.');setTimeout(()=>setMsg(''),2200)};
  if(!companyId)return <div className="center">Preparando Control Caja…</div>;
  return <div className="shell">
    <aside><div className="brand">CONTROL CAJA<small>v0.1.0</small></div><Nav view={view} setView={setView}/></aside>
    <main>
      <header><div><b>Caja Fuerte</b><span>Control de efectivo y rendiciones</span></div><select value={companyId} onChange={e=>load(Number(e.target.value))}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></header>
      {msg&&<div className="toast">{msg}</div>}
      {view==='home'&&<HomeView dash={dash} open={open} setView={setView}/>} 
      {view==='new'&&<NewMovement companyId={companyId} catalogs={catalogs} after={refresh}/>} 
      {view==='pending'&&<List title="Pendientes" items={pending} open={open}/>} 
      {view==='history'&&<List title="Historial" items={movements} open={open}/>} 
      {view==='settings'&&<SettingsView companyId={companyId} catalogs={catalogs} after={refresh}/>} 
      {view==='detail'&&selected&&<Detail movement={selected} catalogs={catalogs} after={async()=>{await refresh();setSelected(await api(`/api/movements/${selected.id}`))}} back={()=>setView('pending')}/>} 
    </main>
    <nav className="bottom"><Nav view={view} setView={setView}/></nav>
  </div>
}
function Nav({view,setView}){return <>{[['home',Home,'Inicio'],['new',PlusCircle,'Registrar'],['pending',Clock3,'Pendientes'],['history',History,'Historial'],['settings',Settings,'Config.']].map(([id,Icon,t])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={20}/><span>{t}</span></button>)}</>}
function HomeView({dash,open,setView}){if(!dash)return null;return <section><div className="balance"><span>Saldo actual</span><strong>{money(dash.balance)}</strong><small>Dinero físico estimado en caja fuerte</small></div><div className="cards"><div><b>{dash.pendingCount}</b><span>Pendientes</span></div><div><b>{money(dash.pendingAmount)}</b><span>Por rendir / devolver</span></div></div><div className="quick"><button onClick={()=>setView('new')}><PlusCircle/>Registrar movimiento</button></div><h2>Pendientes prioritarios</h2><MovementCards items={dash.pending} open={open}/><h2>Últimos movimientos</h2><MovementCards items={dash.recent} open={open}/></section>}
function MovementCards({items=[],open}){return <div className="movement-list">{items.length===0?<div className="empty">Sin movimientos.</div>:items.map(m=><button className="movement" key={m.id} onClick={()=>open(m.id)}><span className={'icon '+(m.kind==='INCOME'?'in':'out')}>{m.kind==='INCOME'?<ArrowDownLeft/>:<ArrowUpRight/>}</span><span className="grow"><b>{m.location_name||m.company_name}</b><small>{m.planned_detail||({INVOICE_PAYMENT:'Pago de factura',PLANNED_EXPENSE:'Gasto por rendir',DIRECT_EXPENSE:'Gasto directo',OTHER:'Movimiento'}[m.purpose])}</small><em>{labels[m.status]}</em></span><strong>{m.kind==='INCOME'?'+':'-'}{money(m.amount)}</strong></button>)}</div>}
function List({title,items,open}){return <section><h1>{title}</h1><MovementCards items={items} open={open}/></section>}
function NewMovement({companyId,catalogs,after}){const [kind,setKind]=useState('WITHDRAWAL'),[form,setForm]=useState({purpose:'PLANNED_EXPENSE',amount:'',locationId:'',responsible:'',plannedDetail:'',invoiceAmount:'',invoiceNumber:'',supplier:'',expenseTypeId:'',categoryId:''}),[busy,setBusy]=useState(false);const set=(k,v)=>setForm(f=>({...f,[k]:v}));const submit=async e=>{e.preventDefault();setBusy(true);try{const body={companyId,kind,purpose:kind==='INCOME'?'OTHER':form.purpose,amount:Number(form.amount),locationId:form.locationId?Number(form.locationId):null,responsible:form.responsible,plannedDetail:form.plannedDetail};if(kind==='WITHDRAWAL'&&form.purpose==='INVOICE_PAYMENT'&&form.invoiceAmount){body.expectedExpenseAmount=Number(form.invoiceAmount);body.invoice={documentNumber:form.invoiceNumber,supplier:form.supplier,amount:Number(form.invoiceAmount),expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null,detail:form.plannedDetail}}await api('/api/movements',{method:'POST',body:JSON.stringify(body)});setForm({purpose:'PLANNED_EXPENSE',amount:'',locationId:'',responsible:'',plannedDetail:'',invoiceAmount:'',invoiceNumber:'',supplier:'',expenseTypeId:'',categoryId:''});await after()}catch(e){alert(e.message)}finally{setBusy(false)}};return <section><h1>Registrar movimiento</h1><div className="seg"><button className={kind==='WITHDRAWAL'?'active':''} onClick={()=>setKind('WITHDRAWAL')}>Retiro / pago</button><button className={kind==='INCOME'?'active':''} onClick={()=>setKind('INCOME')}>Ingreso</button></div><form className="form" onSubmit={submit}><label>Monto<input inputMode="numeric" required value={form.amount} onChange={e=>set('amount',e.target.value.replace(/\D/g,''))} placeholder="$ 0"/></label>{kind==='WITHDRAWAL'&&<><label>¿Para qué sale?<select value={form.purpose} onChange={e=>set('purpose',e.target.value)}><option value="PLANNED_EXPENSE">Dinero para realizar gasto</option><option value="INVOICE_PAYMENT">Pago de factura</option><option value="DIRECT_EXPENSE">Gasto directo</option><option value="OTHER">Otro</option></select></label><label>Destino / local<select value={form.locationId} onChange={e=>set('locationId',e.target.value)}><option value="">Sin asignar</option>{catalogs?.locations.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Responsable<input value={form.responsible} onChange={e=>set('responsible',e.target.value)} placeholder="Quién recibe el dinero"/></label><label>Concepto previsto<textarea value={form.plannedDetail} onChange={e=>set('plannedDetail',e.target.value)} placeholder="Ej. compra de carnes y verduras"/></label>{form.purpose==='INVOICE_PAYMENT'&&<div className="invoice-box"><b>Datos de factura</b><label>Monto factura<input inputMode="numeric" value={form.invoiceAmount} onChange={e=>set('invoiceAmount',e.target.value.replace(/\D/g,''))}/></label><label>N.º factura <small>(puede quedar pendiente)</small><input value={form.invoiceNumber} onChange={e=>set('invoiceNumber',e.target.value)}/></label><label>Proveedor<input value={form.supplier} onChange={e=>set('supplier',e.target.value)}/></label><label>Tipo de gasto<select value={form.expenseTypeId} onChange={e=>set('expenseTypeId',e.target.value)}><option value="">Sin definir</option>{catalogs?.expenseTypes.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Categoría<select value={form.categoryId} onChange={e=>set('categoryId',e.target.value)}><option value="">Sin definir</option>{catalogs?.categories.filter(x=>x.active&&(!form.expenseTypeId||String(x.expense_type_id)===String(form.expenseTypeId))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{Number(form.amount)>Number(form.invoiceAmount||0)&&form.invoiceAmount&&<div className="calc">Vuelto esperado <strong>{money(Number(form.amount)-Number(form.invoiceAmount))}</strong></div>}</div>}</>}<button className="primary" disabled={busy}>{busy?'Guardando…':'Registrar'}</button></form></section>}
function Detail({movement:m,catalogs,after,back}){
  const emptyForm={amount:String(Math.max(0,m.pending_amount)),documentType:'FACTURA',documentNumber:'',supplier:'',expenseTypeId:'',categoryId:'',detail:''};
  const [mode,setMode]=useState('');
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(emptyForm);
  const openNew=kind=>{setEditId(null);setForm({...emptyForm,amount:String(Math.max(0,m.pending_amount))});setMode(kind)};
  const openEdit=s=>{setEditId(s.id);setForm({amount:String(s.amount),documentType:s.document_type,documentNumber:s.document_number||'',supplier:s.supplier||'',expenseTypeId:s.expense_type_id||'',categoryId:s.category_id||'',detail:s.detail||''});setMode('edit')};
  const save=async()=>{try{
    if(mode==='return') await api(`/api/movements/${m.id}/returns`,{method:'POST',body:JSON.stringify({amount:Number(form.amount),note:'Vuelto recibido'})});
    else if(mode==='edit') await api(`/api/settlements/${editId}`,{method:'PUT',body:JSON.stringify({documentNumber:form.documentNumber,supplier:form.supplier,expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null,detail:form.detail})});
    else await api(`/api/movements/${m.id}/settlements`,{method:'POST',body:JSON.stringify({documentType:form.documentType,documentNumber:form.documentNumber,supplier:form.supplier,amount:Number(form.amount),expenseTypeId:form.expenseTypeId?Number(form.expenseTypeId):null,categoryId:form.categoryId?Number(form.categoryId):null,detail:form.detail})});
    setMode(''); setEditId(null); await after();
  }catch(e){alert(e.message)}};
  return <section>
    <button className="link" onClick={back}>← Volver</button><h1>Movimiento #{m.id}</h1>
    <div className="detail-head"><b>{money(m.amount)}</b><span>{labels[m.status]}</span><small>{m.location_name||m.company_name} · {m.responsible||'Sin responsable'}</small></div>
    {m.kind==='WITHDRAWAL'&&<div className="summary"><div><span>Entregado</span><b>{money(m.amount)}</b></div><div><span>Documentos</span><b>{money(m.settled_amount)}</b></div><div><span>Vuelto recibido</span><b>{money(m.returned_amount)}</b></div><div><span>Pendiente</span><b>{money(m.pending_amount)}</b></div></div>}
    <h2>Rendición</h2>
    {m.settlements.map(s=><div className="line" key={'s'+s.id}><ReceiptText/><span><b>{s.document_type} {s.document_number||'— factura pendiente'}</b><small>{s.supplier||s.detail||'Sin detalle'}</small></span><strong>{money(s.amount)}</strong>{!s.document_number&&s.document_type==='FACTURA'&&<button className="small-btn" onClick={()=>openEdit(s)}>Completar</button>}</div>)}
    {m.returns.map(r=><div className="line" key={'r'+r.id}><RotateCcw/><span><b>Vuelto</b><small>{r.note}</small></span><strong>{money(r.amount)}</strong></div>)}
    {m.kind==='WITHDRAWAL'&&m.pending_amount>0&&<div className="actions"><button onClick={()=>openNew('document')}>+ Factura / boleta</button><button onClick={()=>openNew('return')}>+ Registrar vuelto</button></div>}
    {mode&&<div className="form mini">
      {(mode==='document'||mode==='edit')&&<>
        {mode==='document'&&<label>Documento<select value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value})}><option>FACTURA</option><option>BOLETA</option><option>OTRO</option></select></label>}
        <label>N.º documento<input value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value})}/></label>
        <label>Proveedor<input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></label>
        <label>Tipo<select value={form.expenseTypeId} onChange={e=>setForm({...form,expenseTypeId:e.target.value})}><option value="">Sin definir</option>{catalogs.expenseTypes.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Categoría<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Sin definir</option>{catalogs.categories.filter(x=>x.active&&(!form.expenseTypeId||String(x.expense_type_id)===String(form.expenseTypeId))).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Detalle<input value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})}/></label>
      </>}
      {mode!=='edit'&&<label>Monto<input inputMode="numeric" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value.replace(/\D/g,'')})}/></label>}
      <button className="primary" onClick={save}>{mode==='edit'?'Actualizar factura':'Guardar'}</button>
    </div>}
  </section>
}

function SettingsView({companyId,catalogs,after}){
  const [type,setType]=useState('location'),[name,setName]=useState(''),[expenseTypeId,setExpenseTypeId]=useState('');
  const create=async e=>{e.preventDefault();try{await api(`/api/catalogs/${type}`,{method:'POST',body:JSON.stringify({name,companyId,expenseTypeId:expenseTypeId?Number(expenseTypeId):null})});setName('');await after()}catch(e){alert(e.message)}};
  const list=type==='location'?catalogs.locations:type==='expense-type'?catalogs.expenseTypes:type==='category'?catalogs.categories:catalogs.companies;
  const edit=async x=>{const next=window.prompt('Nuevo nombre',x.name);if(!next||next.trim()===x.name)return;try{await api(`/api/catalogs/${type}/${x.id}`,{method:'PUT',body:JSON.stringify({name:next.trim()})});await after()}catch(e){alert(e.message)}};
  const toggle=async x=>{try{await api(`/api/catalogs/${type}/${x.id}`,{method:'PUT',body:JSON.stringify({active:!x.active})});await after()}catch(e){alert(e.message)}};
  return <section><h1>Configuración</h1><p className="muted">Catálogos administrables. Se pueden editar o desactivar sin perder el historial.</p>
    <div className="seg"><button className={type==='location'?'active':''} onClick={()=>setType('location')}>Locales</button><button className={type==='expense-type'?'active':''} onClick={()=>setType('expense-type')}>Tipos</button><button className={type==='category'?'active':''} onClick={()=>setType('category')}>Categorías</button><button className={type==='company'?'active':''} onClick={()=>setType('company')}>Empresas</button></div>
    <form className="inline" onSubmit={create}>{type==='category'&&<select value={expenseTypeId} onChange={e=>setExpenseTypeId(e.target.value)}><option value="">Tipo opcional</option>{catalogs.expenseTypes.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nuevo nombre"/><button>Agregar</button></form>
    <div className="settings-list">{list.map(x=><div key={x.id}><span>{x.name}</span><span className="row-actions"><button onClick={()=>edit(x)}>Editar</button><button onClick={()=>toggle(x)}>{x.active?'Desactivar':'Activar'}</button></span></div>)}</div>
  </section>
}
