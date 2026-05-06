import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyD4LydWLGt2BKU7gXqPZ4hgbg27PV4XdEo",
  authDomain:        "buscador-ids-4c3ad.firebaseapp.com",
  databaseURL:       "https://buscador-ids-4c3ad-default-rtdb.firebaseio.com",
  projectId:         "buscador-ids-4c3ad",
  storageBucket:     "buscador-ids-4c3ad.firebasestorage.app",
  messagingSenderId: "388232468256",
  appId:             "1:388232468256:web:daefed9966c9fd74596945"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

let pendingIds        = [];
let searchIds         = [];
let foundCount        = 0;
let totalCount        = 0;
let pendingConfirmIdx = null;
let selectedLocation  = null;
let toastTimer        = null;
let scanHighlightTimer= null;
let activeTab         = 'search';
let dataFilter        = 'all';
let sessionCounter    = 0;
let dateFromFilter    = '';
let dateToFilter      = '';
let activeQuick       = '';
let dataLog           = [];
let searchActive      = false;

function initFirebase() {
  onValue(ref(db, 'searchIds'), snap => {
    const data = snap.val();
    searchIds = data ? Object.values(data) : [];
    if (searchActive) { renderSearchList(); updateStats(); }
  onValue(ref(db, 'session'), snap => {
    const data = snap.val();
    if (!data) return;
    sessionCounter = data.counter || 0;
    searchActive   = data.active  || false;
    totalCount     = data.total   || 0;
    if (searchActive) {
      document.getElementById('loadCard').style.display   = 'none';
      document.getElementById('searchCard').style.display = 'block';
      document.getElementById('scanBar').style.display    = '';
        renderSearchList();
        updateStats();
      }
  });
  });
  onValue(ref(db, 'dataLog'), snap => {
    const data = snap.val();
    dataLog    = data ? Object.values(data) : [];
    foundCount = dataLog.filter(r => r.status === 'found').length;
    if (activeTab === 'data') { renderDataList(); updateDataKpis(); }
    const n = document.getElementById('tabNotifData');
    if (dataLog.length > 0 && activeTab !== 'data') { n.classList.remove('hide'); n.textContent = dataLog.length; }
  });
  onValue(ref(db, 'session'), snap => {
    const data = snap.val();
    if (!data) return;
    sessionCounter = data.counter || 0;
    searchActive   = data.active  || false;
    totalCount     = data.total   || 0;
    if (searchActive) {
      document.getElementById('loadCard').style.display   = 'none';
      document.getElementById('searchCard').style.display = 'block';
      document.getElementById('scanBar').style.display    = '';
    }
  });
}

function switchTab(tab) {
  activeTab = tab;
  ['search','data'].forEach(t => {
    document.getElementById('tabBtn'+cap(t)).classList.toggle('active', t===tab);
    document.getElementById('page'+cap(t)).classList.toggle('active', t===tab);
  });
  if (tab==='search' && searchActive) setTimeout(()=>document.getElementById('scanInput').focus(),100);
  if (tab==='data') { renderDataList(); updateDataKpis(); }
  const notif = document.getElementById('tabNotif'+cap(tab));
  if (notif) notif.classList.add('hide');
}
function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
function cleanId(raw) { const m=raw.match(/\d{8,}/); return m?m[0]:raw.replace(/[^\w-]/g,'').trim(); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mlUrl(id) { return 'https://www.mercadolibre.cl/envios/tracking?search_id='+id; }

function parseMlData(text) {
  const results=[], lines=text.split(/[\r\n]+/).filter(l=>l.trim());
  for (const line of lines) {
    const cols=line.split('\t');
    if (cols.length<2) continue;
    const rawId=(cols[0]||'').trim();
    if (!/^\d{8,}$/.test(rawId)) continue;
    const route=(cols[1]||'').trim().toUpperCase();
    const lastCol=[...cols].reverse().find(c=>c.trim()!=='')||'';
    const dim=lastCol.trim().toLowerCase().includes('voluminoso')?'vol':'conv';
    results.push({id:rawId,route,dim});
  }
  return results;
}

function removeFromPending(idx) { pendingIds.splice(idx,1); renderPending(); }

function renderPending() {
  const list=document.getElementById('pendingList'), btn=document.getElementById('confirmLoadBtn'), badge=document.getElementById('headerBadge');
  badge.textContent=pendingIds.length+' ID'+(pendingIds.length!==1?'s':'');
  btn.disabled=!pendingIds.length;
  if (!pendingIds.length) { list.innerHTML='<div class="empty-state">Pegá los datos del sistema ML arriba ↑</div>'; return; }
  list.innerHTML=pendingIds.map((p,i)=>`
    <div class="pending-item" id="pitem-${i}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <span class="pending-num">${i+1}</span>
        <span class="pending-id">${esc(p.id)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${p.route?`<span class="route-badge">${esc(p.route)}</span>`:''}
        <span class="dim-badge ${p.dim||'none'}">${p.dim==='vol'?'📦 VOL':p.dim==='conv'?'📫 CONV':'—'}</span>
        <button class="pending-del" onclick="removeFromPending(${i})">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`).join('');
  list.scrollTop=list.scrollHeight;
}

function addBulk() {
  const ta=document.getElementById('bulkInput'), text=ta.value.trim();
  if (!text) { showToast('⚠️ Pegá los datos primero',false); return; }
  const items=parseMlData(text);
  if (!items.length) { showToast('⚠️ No se detectaron IDs válidas',false); return; }
  let added=0,dupes=0;
  items.forEach(item=>{ if(pendingIds.some(p=>p.id===item.id)){dupes++;return;} pendingIds.push(item);added++; });
  ta.value=''; renderPending();
  if (added>0) showToast('✅ '+added+' ID'+(added!==1?'s':'')+' detectada'+(added!==1?'s':''),true);
  if (dupes>0) showToast('⚠️ '+dupes+' duplicada'+(dupes!==1?'s':''),false);
}

async function confirmLoad() {
  if (!pendingIds.length) return;
  sessionCounter++; totalCount=pendingIds.length; foundCount=0; searchActive=true;
  const idsObj={};
  pendingIds.forEach((p,i)=>{ idsObj['id_'+i]=p; });
  await set(ref(db,'searchIds'),idsObj);
  await set(ref(db,'dataLog'),null);
  await set(ref(db,'session'),{counter:sessionCounter,active:true,total:totalCount});
  pendingIds=[];
  renderPending();
  document.getElementById('loadCard').style.display='none';
  document.getElementById('searchCard').style.display='block';
  document.getElementById('scanBar').style.display='';
  renderSearchList(); updateStats();
  setTimeout(()=>document.getElementById('scanInput').focus(),200);
}

function handleScan(raw) {
  if (!raw) return;
  const val=cleanId(raw); if (!val) return;
  const idx=searchIds.findIndex(p=>p.id===val);
  if (idx===-1) { flashScanBar(false); showToast('⚠️ No está en lista: '+val,false); return; }
  flashScanBar(true); highlightItem(idx);
  setTimeout(()=>openModal(idx,true),350);
}

function flashScanBar(ok) {
  const bar=document.getElementById('scanBar');
  bar.classList.remove('not-found','found-flash'); void bar.offsetWidth;
  bar.classList.add(ok?'found-flash':'not-found');
  clearTimeout(scanHighlightTimer);
  scanHighlightTimer=setTimeout(()=>bar.classList.remove('not-found','found-flash'),1100);
}

function highlightItem(idx) {
  document.querySelectorAll('.search-item.scanned').forEach(el=>el.classList.remove('scanned'));
  const el=document.getElementById('sitem-'+idx);
  if (el) { el.classList.add('scanned'); el.scrollIntoView({behavior:'smooth',block:'center'}); }
}

function renderSearchList() {
  const list=document.getElementById('searchList'), done=document.getElementById('doneState');
  if (!searchIds.length) { showDoneState(); return; }
  done.classList.remove('show');
  list.innerHTML=searchIds.map((p,i)=>`
    <div class="search-item" id="sitem-${i}">
      <span class="search-item-num">${i+1}</span>
      <span class="search-item-id">${esc(p.id)}</span>
      <span class="dim-badge ${p.dim||'none'}">${p.dim==='vol'?'📦 VOL':p.dim==='conv'?'📫 CONV':'—'}</span>
      ${p.route?`<span class="route-badge">${esc(p.route)}</span>`:'<span class="route-badge empty">Sin ruta</span>'}
      <div class="search-item-actions">
        <a class="btn-ml" href="${mlUrl(p.id)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> ML
        </a>
        <button class="btn-found" onclick="openModal(${i},false)">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Encontrado
        </button>
        <button class="btn-not-found" onclick="markNotFound(${i})">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> No encontrado
        </button>
      </div>
    </div>`).join('');
}

function showDoneState() {
  document.getElementById('searchList').innerHTML='';
  document.getElementById('doneState').classList.add('show');
  document.getElementById('scanBar').style.display='none';
  const found=dataLog.filter(r=>r.session===sessionCounter&&r.status==='found').length;
  const notf =dataLog.filter(r=>r.session===sessionCounter&&r.status==='notf').length;
  document.getElementById('doneSub').innerHTML=
    `<span style="color:var(--ok)">✓ ${found} encontrado${found!==1?'s':''}</span> &nbsp;·&nbsp; `+
    (notf?`<span style="color:var(--er)">✗ ${notf} no encontrado${notf!==1?'s':''}</span>`:'<span style="color:var(--tx3)">0 no encontrados</span>');
}

function updateStats() {
  const pending=searchIds.length;
  document.getElementById('statTotal').textContent=totalCount+' total';
  document.getElementById('statFound').textContent=foundCount+' encontrado'+(foundCount!==1?'s':'');
  document.getElementById('statPending').textContent=pending+' pendiente'+(pending!==1?'s':'');
  document.getElementById('headerBadge').textContent=pending+' pendiente'+(pending!==1?'s':'');
}

function openModal(idx,fromScan) {
  pendingConfirmIdx=idx; selectedLocation=null;
  document.getElementById('modalId').textContent=searchIds[idx].id;
  document.getElementById('modalSub').textContent=fromScan?'¡Bipeado! Seleccioná dónde fue encontrado.':'Seleccioná dónde fue encontrado el paquete.';
  ['buffer','same','cross','custom'].forEach(l=>document.getElementById('loc-'+l).classList.remove('selected'));
  document.getElementById('customContainerRow').classList.remove('visible');
  document.getElementById('customContainerInput').value='';
  document.getElementById('obsInput').value='';
  document.getElementById('confirmBtn').disabled=true;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  pendingConfirmIdx=null; selectedLocation=null;
  document.querySelectorAll('.search-item.scanned').forEach(el=>el.classList.remove('scanned'));
  setTimeout(()=>document.getElementById('scanInput').focus(),150);
}

function selectLocation(loc) {
  selectedLocation=loc;
  ['buffer','same','cross','custom'].forEach(l=>document.getElementById('loc-'+l).classList.toggle('selected',l===loc));
  const row=document.getElementById('customContainerRow');
  if (loc==='custom'){row.classList.add('visible');setTimeout(()=>document.getElementById('customContainerInput').focus(),50);}
  else row.classList.remove('visible');
  updateConfirmBtn();
}

function updateConfirmBtn() {
  const cv=document.getElementById('customContainerInput').value.trim();
  document.getElementById('confirmBtn').disabled=!selectedLocation||(selectedLocation==='custom'&&!cv);
}

async function confirmFound() {
  if (pendingConfirmIdx===null||!selectedLocation) return;
  const cv=document.getElementById('customContainerInput').value.trim().toUpperCase();
  if (selectedLocation==='custom'&&!cv) return;
  const obsVal=document.getElementById('obsInput').value.trim();
  const item=searchIds[pendingConfirmIdx];
  const locLabels={buffer:'Conveyor/Buffer',same:'Mismo contenedor',cross:'Cont. cruzado',custom:cv};
  await pushLog({id:item.id,status:'found',location:selectedLocation,locationText:cv||locLabels[selectedLocation],obs:obsVal,dim:item.dim,route:item.route,session:sessionCounter});
  const newIds=searchIds.filter((_,i)=>i!==pendingConfirmIdx);
  const idsObj={}; newIds.forEach((p,i)=>{idsObj['id_'+i]=p;});
  await set(ref(db,'searchIds'),newIds.length?idsObj:null);
  foundCount++;
  closeModal();
  showToast('✓ '+item.id+' · '+locLabels[selectedLocation],true);
}

async function markNotFound(idx) {
  const item=searchIds[idx];
  await pushLog({id:item.id,status:'notf',location:null,locationText:'—',obs:'',dim:item.dim,route:item.route,session:sessionCounter});
  const newIds=searchIds.filter((_,i)=>i!==idx);
  const idsObj={}; newIds.forEach((p,i)=>{idsObj['id_'+i]=p;});
  await set(ref(db,'searchIds'),newIds.length?idsObj:null);
  showToast('✗ No encontrado: '+item.id,false);
}

async function pushLog(entry) {
  const now=new Date();
  entry.time=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  entry.date=now.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'});
  entry.isoDate=now.toISOString().slice(0,10);
  entry.ts=now.getTime();
  await push(ref(db,'dataLog'),entry);
}

function setFilter(f) {
  dataFilter=f;
  ['all','found','notf'].forEach(k=>document.getElementById('fb-'+k).classList.toggle('active',k===f));
  renderDataList();
}

function isoToday(){return new Date().toISOString().slice(0,10);}
function isoOffset(d){const dt=new Date();dt.setDate(dt.getDate()+d);return dt.toISOString().slice(0,10);}
function isoMonday(){const dt=new Date();const day=dt.getDay();dt.setDate(dt.getDate()+(day===0?-6:1-day));return dt.toISOString().slice(0,10);}

function quickDate(key){
  if(activeQuick===key){clearDateFilter();return;} activeQuick=key;
  const today=isoToday();
  if(key==='today'){dateFromFilter=today;dateToFilter=today;}
  if(key==='ayer'){const y=isoOffset(-1);dateFromFilter=y;dateToFilter=y;}
  if(key==='semana'){dateFromFilter=isoMonday();dateToFilter=today;}
  document.getElementById('dateFrom').value=dateFromFilter;
  document.getElementById('dateTo').value=dateToFilter;
  syncDateUI();renderDataList();updateDataKpis();
}

function applyDateFilter(){
  dateFromFilter=document.getElementById('dateFrom').value;
  dateToFilter=document.getElementById('dateTo').value;
  activeQuick='';syncDateUI();renderDataList();updateDataKpis();
}

function clearDateFilter(){
  dateFromFilter='';dateToFilter='';activeQuick='';
  document.getElementById('dateFrom').value='';
  document.getElementById('dateTo').value='';
  syncDateUI();renderDataList();updateDataKpis();
}

function syncDateUI(){
  const h=dateFromFilter||dateToFilter;
  ['today','ayer','semana'].forEach(k=>document.getElementById('dq-'+k).classList.toggle('active',k===activeQuick));
  document.getElementById('dqClear').style.display=h?'':'none';
  document.getElementById('dateFilterRow').classList.toggle('has-active',!!h);
}

function renderDataList(){
  const el=document.getElementById('dataList'),q=(document.getElementById('dataSearch').value||'').toLowerCase().trim();
  const rows=dataLog.filter(r=>{
    if(dataFilter==='found'&&r.status!=='found')return false;
    if(dataFilter==='notf'&&r.status!=='notf')return false;
    if(dateFromFilter&&(r.isoDate||'')<dateFromFilter)return false;
    if(dateToFilter&&(r.isoDate||'')>dateToFilter)return false;
    if(q){const hay=[r.id,r.locationText,r.obs,r.route,r.dim,r.date].join(' ').toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  if(!rows.length){el.innerHTML=dataLog.length?'<div class="data-empty"><div class="data-empty-icon">🔍</div>Sin resultados.</div>':'<div class="data-empty"><div class="data-empty-icon">📭</div>Aún no hay registros.</div>';return;}
  const sorted=[...rows].sort((a,b)=>b.ts-a.ts);
  const locIcon={buffer:'🏗️',same:'📦',cross:'🔀',custom:'✏️'};
  el.innerHTML=sorted.map((r,i)=>{
    const dimHtml=r.dim==='vol'?'<span class="dim-badge vol">📦 VOL</span>':r.dim==='conv'?'<span class="dim-badge conv">📫 CONV</span>':'<span class="dim-badge none">—</span>';
    const routeHtml=r.route?`<span class="route-badge">${esc(r.route)}</span>`:'<span class="route-badge empty">Sin ruta</span>';
    const locHtml=r.location?`<span class="loc-badge ${r.location}">${locIcon[r.location]||''} ${esc(r.locationText)}</span>`:'<span class="loc-badge custom" style="opacity:.4">—</span>';
    const obsHtml=r.obs?`<div class="dr-obs"><div class="dr-obs-lbl">observación</div>${esc(r.obs)}</div>`:'';
    return `<div class="data-row ${r.status==='found'?'found-row':'notf-row'}">
      <div class="dr-top">
        <span class="dr-num">${sorted.length-i}</span>
        <span class="dr-id">${esc(r.id)}</span>
        <a class="btn-ml-sm" href="${mlUrl(r.id)}" target="_blank" rel="noopener">🔗</a>
        <span class="dr-status ${r.status==='found'?'found':'notf'}">${r.status==='found'?'✓ Encontrado':'✗ No encontrado'}</span>
        <span class="dr-time">${r.date?r.date+' ':''}${r.time}</span>
        ${r.session?`<span class="dr-session">S${r.session}</span>`:''}
      </div>
      <div class="dr-meta">${dimHtml}${routeHtml}${locHtml}</div>${obsHtml}
    </div>`;
  }).join('');
  const sessions=[...new Set(dataLog.map(r=>r.session))].length;
  document.getElementById('dataSessionInfo').textContent=dataLog.length+' registro'+(dataLog.length!==1?'s':'')+' · '+sessions+' sesión'+(sessions!==1?'es':'');
}

function updateDataKpis(){
  const filtered=dataLog.filter(r=>{
    if(dateFromFilter&&(r.isoDate||'')<dateFromFilter)return false;
    if(dateToFilter&&(r.isoDate||'')>dateToFilter)return false;
    return true;
  });
  const total=filtered.length,found=filtered.filter(r=>r.status==='found').length,notf=filtered.filter(r=>r.status==='notf').length;
  document.getElementById('kpiTotal').textContent=total;
  document.getElementById('kpiFound').textContent=found;
  document.getElementById('kpiNotf').textContent=notf;
  document.getElementById('kpiPct').textContent=total?Math.round(found/total*100)+'%':'—';
}

function exportCSV(){
  if(!dataLog.length){showToast('⚠️ No hay datos',false);return;}
  const locName={buffer:'Conveyor/Buffer',same:'Mismo contenedor',cross:'Cont. cruzado',custom:'Otro'};
  const filtered=dataLog.filter(r=>{
    if(dataFilter==='found'&&r.status!=='found')return false;
    if(dataFilter==='notf'&&r.status!=='notf')return false;
    if(dateFromFilter&&(r.isoDate||'')<dateFromFilter)return false;
    if(dateToFilter&&(r.isoDate||'')>dateToFilter)return false;
    return true;
  });
  if(!filtered.length){showToast('⚠️ Sin registros con ese filtro',false);return;}
  const header=['#','ID','Estado','Fecha','Hora','Sesión','Dimensión','Ruta','Ubicación','Contenedor','Observación','Link ML'];
  const rows=filtered.sort((a,b)=>a.ts-b.ts).map((r,i)=>[
    i+1,r.id,r.status==='found'?'Encontrado':'No encontrado',r.date||'',r.time||'',r.session||'',
    r.dim==='vol'?'Voluminoso':r.dim==='conv'?'Conveyable':'—',r.route||'—',
    r.location?(locName[r.location]||r.location):'—',r.locationText||'—',r.obs||'',mlUrl(r.id)
  ].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
  const csv=[header.join(','),...rows].join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='buscador_ids_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV exportado · '+filtered.length+' registros',true);
}

async function clearData(){
  if(!dataLog.length)return;
  if(!confirm('¿Borrar todos los registros?'))return;
  await set(ref(db,'dataLog'),null);
  document.getElementById('tabNotifData').classList.add('hide');
  showToast('Datos limpiados',false);
}

async function resetApp(){
  await set(ref(db,'searchIds'),null);
  await set(ref(db,'session'),{counter:sessionCounter,active:false,total:0});
  pendingIds=[];foundCount=0;totalCount=0;searchActive=false;
  document.getElementById('loadCard').style.display='block';
  document.getElementById('searchCard').style.display='none';
  document.getElementById('scanBar').style.display='';
  document.getElementById('doneState').classList.remove('show');
  document.getElementById('headerBadge').textContent='0 IDs';
  renderPending();
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>document.getElementById('bulkInput').focus(),300);
}

function showToast(msg,ok){
  const t=document.getElementById('toast');
  document.getElementById('toastMsg').textContent=msg;
  t.style.borderColor=ok?'var(--ok-b)':'var(--er-b)';
  t.style.color=ok?'var(--ok)':'var(--er)';
  t.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}

document.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('modalOverlay'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
document.getElementById('searchCard').addEventListener('click',e=>{if(!document.getElementById('modalOverlay').classList.contains('show'))document.getElementById('scanInput').focus();});

window.switchTab=switchTab;
window.addBulk=addBulk;
window.removeFromPending=removeFromPending;
window.confirmLoad=confirmLoad;
window.handleScan=handleScan;
window.openModal=openModal;
window.closeModal=closeModal;
window.selectLocation=selectLocation;
window.updateConfirmBtn=updateConfirmBtn;
window.confirmFound=confirmFound;
window.markNotFound=markNotFound;
window.setFilter=setFilter;
window.quickDate=quickDate;
window.applyDateFilter=applyDateFilter;
window.clearDateFilter=clearDateFilter;
window.exportCSV=exportCSV;
window.clearData=clearData;
window.resetApp=resetApp;

window.onload=()=>{ initFirebase(); renderPending(); document.getElementById('bulkInput').focus(); };
