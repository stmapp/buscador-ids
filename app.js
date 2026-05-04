/* ════════════════════════════════════
   BUSCADOR DE IDs — app.js
════════════════════════════════════ */
/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let pendingIds        = [];   // carga
let searchIds         = [];   // búsqueda activa
let foundCount        = 0;
let totalCount        = 0;
let pendingConfirmIdx = null;
let selectedLocation  = null;
let toastTimer        = null;
let scanHighlightTimer= null;
let activeTab         = 'search';
let dataFilter        = 'all';
let sessionCounter    = 0;
let dateFromFilter    = '';   // 'YYYY-MM-DD' or ''
let dateToFilter      = '';
let activeQuick       = '';   // 'today'|'ayer'|'semana'|''

// DATA LOG: array de objetos
// { id, status:'found'|'notf', location, locationText, obs, dim, route, time, session }
let dataLog = [];

/* ════════════════════════════════════════
   TABS
════════════════════════════════════════ */
function switchTab(tab){
  activeTab = tab;
  ['search','data'].forEach(t=>{
    document.getElementById('tabBtn'+cap(t)).classList.toggle('active', t===tab);
    document.getElementById('page'+cap(t)).classList.toggle('active', t===tab);
  });
  if(tab==='search' && document.getElementById('searchCard').style.display!=='none'){
    setTimeout(()=>document.getElementById('scanInput').focus(), 100);
  }
  if(tab==='data'){
    renderDataList();
    updateDataKpis();
  }
  // Clear notification badge for visited tab
  const notif = document.getElementById('tabNotif'+cap(tab));
  if(notif) notif.classList.add('hide');
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1) }

/* ════════════════════════════════════════
   CLEAN ID
════════════════════════════════════════ */
function cleanId(raw){
  const match = raw.match(/\d{8,}/);
  return match ? match[0] : raw.replace(/[^\w-]/g,'').trim();
}

/* ════════════════════════════════════════
   LOAD PHASE
════════════════════════════════════════ */
function addId(){
  const input = document.getElementById('idInput');
  const raw   = input.value.trim();
  if(!raw) return;
  const val = cleanId(raw);
  if(!val){ input.value=''; return; }
  if(pendingIds.some(p=>p.id===val)){
    input.value='';
    showToast('⚠️ Duplicada: '+val, false);
    return;
  }
  pendingIds.push({id:val, dim:null, route:''});
  input.value='';
  renderPending();
  input.focus();
}

function removeFromPending(idx){
  pendingIds.splice(idx,1);
  renderPending();
}

function renderPending(){
  const list  = document.getElementById('pendingList');
  const btn   = document.getElementById('confirmLoadBtn');
  const badge = document.getElementById('headerBadge');
  badge.textContent = pendingIds.length + ' ID' + (pendingIds.length!==1?'s':'');
  btn.disabled = !pendingIds.length;
  if(!pendingIds.length){
    list.innerHTML='<div class="empty-state">Sin IDs — empieza a escanear arriba</div>';
    return;
  }
  list.innerHTML = pendingIds.map((p,i)=>`
    <div class="pending-item" id="pitem-${i}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <span class="pending-num">${i+1}</span>
        <span class="pending-id">${esc(p.id)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <input class="route-input" placeholder="Ruta ej: B2_AM2"
          value="${esc(p.route||'')}"
          oninput="setRoute(${i},this.value)"
          onkeydown="if(event.key==='Enter'){document.getElementById('idInput').focus()}">
        <div class="dim-btns">
          <button class="btn-dim vol ${p.dim==='vol'?'selected':''}" onclick="setDim(${i},'vol')">📦 Vol</button>
          <button class="btn-dim conv ${p.dim==='conv'?'selected':''}" onclick="setDim(${i},'conv')">📫 Conv</button>
        </div>
        <button class="pending-del" onclick="removeFromPending(${i})">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`).join('');
  list.scrollTop = list.scrollHeight;
}

/* ════════════════════════════════════════
   CONFIRM LOAD
════════════════════════════════════════ */
function confirmLoad(){
  if(!pendingIds.length) return;
  sessionCounter++;
  searchIds  = pendingIds.map(p=>({...p}));
  pendingIds = [];
  foundCount = 0;
  totalCount = searchIds.length;
  document.getElementById('loadCard').style.display   = 'none';
  document.getElementById('searchCard').style.display = 'block';
  document.getElementById('scanBar').style.display    = '';
  renderSearchList();
  updateStats();
  setTimeout(()=>document.getElementById('scanInput').focus(), 200);
}

/* ════════════════════════════════════════
   SCAN
════════════════════════════════════════ */
function handleScan(raw){
  if(!raw) return;
  const val = cleanId(raw);
  if(!val) return;
  const idx = searchIds.findIndex(p=>p.id===val);
  if(idx===-1){
    flashScanBar(false);
    showToast('⚠️ No está en lista: '+val, false);
    return;
  }
  flashScanBar(true);
  highlightItem(idx);
  setTimeout(()=>openModal(idx,true), 350);
}

function flashScanBar(ok){
  const bar = document.getElementById('scanBar');
  bar.classList.remove('not-found','found-flash');
  void bar.offsetWidth;
  bar.classList.add(ok?'found-flash':'not-found');
  clearTimeout(scanHighlightTimer);
  scanHighlightTimer = setTimeout(()=>bar.classList.remove('not-found','found-flash'), 1100);
}

function highlightItem(idx){
  document.querySelectorAll('.search-item.scanned').forEach(el=>el.classList.remove('scanned'));
  const el = document.getElementById('sitem-'+idx);
  if(el){ el.classList.add('scanned'); el.scrollIntoView({behavior:'smooth',block:'center'}) }
}

/* ════════════════════════════════════════
   SEARCH LIST RENDER
════════════════════════════════════════ */
function renderSearchList(){
  const list = document.getElementById('searchList');
  const done = document.getElementById('doneState');
  if(!searchIds.length){
    list.innerHTML='';
    done.classList.add('show');
    document.getElementById('scanBar').style.display='none';
    const found = dataLog.filter(r=>r.session===sessionCounter&&r.status==='found').length;
    const notf  = dataLog.filter(r=>r.session===sessionCounter&&r.status==='notf').length;
    document.getElementById('doneSub').innerHTML =
      `<span style="color:var(--ok)">✓ ${found} encontrado${found!==1?'s':''}</span> &nbsp;·&nbsp; `+
      (notf?`<span style="color:var(--er)">✗ ${notf} no encontrado${notf!==1?'s':''}</span>`:'<span style="color:var(--tx3)">0 no encontrados</span>');
    return;
  }
  done.classList.remove('show');
  list.innerHTML = searchIds.map((p,i)=>`
    <div class="search-item" id="sitem-${i}">
      <span class="search-item-num">${i+1}</span>
      <span class="search-item-id">${esc(p.id)}</span>
      <span class="dim-badge ${p.dim||'none'}">${p.dim==='vol'?'📦 VOL':p.dim==='conv'?'📫 CONV':'—'}</span>
      ${p.route?`<span class="route-badge">${esc(p.route)}</span>`:'<span class="route-badge empty">Sin ruta</span>'}
      <div class="search-item-actions">
        <button class="btn-found" onclick="openModal(${i},false)">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Encontrado
        </button>
        <button class="btn-not-found" onclick="markNotFound(${i})">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> No encontrado
        </button>
      </div>
    </div>`).join('');
}

function updateStats(){
  const pending = searchIds.length;
  document.getElementById('statTotal').textContent   = totalCount + ' total';
  document.getElementById('statFound').textContent   = foundCount + ' encontrado'+(foundCount!==1?'s':'');
  document.getElementById('statPending').textContent = pending+' pendiente'+(pending!==1?'s':'');
  document.getElementById('headerBadge').textContent = pending+' pendiente'+(pending!==1?'s':'');
}

/* ════════════════════════════════════════
   MODAL
════════════════════════════════════════ */
function openModal(idx, fromScan){
  pendingConfirmIdx = idx;
  selectedLocation  = null;
  document.getElementById('modalId').textContent  = searchIds[idx].id;
  document.getElementById('modalSub').textContent = fromScan
    ? '¡Bipeado! Seleccioná dónde fue encontrado.'
    : 'Seleccioná dónde fue encontrado el paquete.';
  ['buffer','same','cross','custom'].forEach(l=>document.getElementById('loc-'+l).classList.remove('selected'));
  document.getElementById('customContainerRow').classList.remove('visible');
  document.getElementById('customContainerInput').value='';
  document.getElementById('obsInput').value='';
  document.getElementById('confirmBtn').disabled=true;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
  pendingConfirmIdx=null; selectedLocation=null;
  document.querySelectorAll('.search-item.scanned').forEach(el=>el.classList.remove('scanned'));
  setTimeout(()=>document.getElementById('scanInput').focus(), 150);
}

function selectLocation(loc){
  selectedLocation=loc;
  ['buffer','same','cross','custom'].forEach(l=>document.getElementById('loc-'+l).classList.toggle('selected',l===loc));
  const row = document.getElementById('customContainerRow');
  if(loc==='custom'){ row.classList.add('visible'); setTimeout(()=>document.getElementById('customContainerInput').focus(),50) }
  else row.classList.remove('visible');
  updateConfirmBtn();
}

function updateConfirmBtn(){
  const customVal = document.getElementById('customContainerInput').value.trim();
  document.getElementById('confirmBtn').disabled =
    !selectedLocation || (selectedLocation==='custom' && !customVal);
}

function confirmFound(){
  if(pendingConfirmIdx===null || !selectedLocation) return;
  const customVal = document.getElementById('customContainerInput').value.trim().toUpperCase();
  if(selectedLocation==='custom' && !customVal) return;
  const obsVal = document.getElementById('obsInput').value.trim();

  const item = searchIds[pendingConfirmIdx];
  const locLabels = { buffer:'Conveyor/Buffer', same:'Mismo contenedor', cross:'Cont. cruzado', custom:customVal };

  // Log to data
  pushLog({
    id:           item.id,
    status:       'found',
    location:     selectedLocation,
    locationText: customVal || locLabels[selectedLocation],
    obs:          obsVal,
    dim:          item.dim,
    route:        item.route,
    session:      sessionCounter
  });

  searchIds.splice(pendingConfirmIdx,1);
  foundCount++;
  closeModal();
  renderSearchList();
  updateStats();
  showToast('✓ '+item.id+' · '+locLabels[selectedLocation], true);
}

function markNotFound(idx){
  const item = searchIds[idx];
  const el   = document.getElementById('sitem-'+idx);
  if(el){
    el.style.opacity='.35';
    el.style.borderColor='var(--er-b)';
    el.style.background='var(--er-d)';
    el.querySelector('.search-item-id').style.textDecoration='line-through';
    el.querySelector('.search-item-id').style.color='var(--er)';
    el.querySelectorAll('button').forEach(b=>b.disabled=true);
  }

  // Log to data
  pushLog({
    id:           item.id,
    status:       'notf',
    location:     null,
    locationText: '—',
    obs:          '',
    dim:          item.dim,
    route:        item.route,
    session:      sessionCounter
  });

  showToast('✗ No encontrado: '+item.id, false);
}

/* ════════════════════════════════════════
   DATA LOG
════════════════════════════════════════ */
function pushLog(entry){
  const now = new Date();
  entry.time    = now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  entry.date    = now.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'});
  entry.isoDate = now.toISOString().slice(0,10); // YYYY-MM-DD for filtering
  entry.ts      = now.getTime();
  dataLog.push(entry);

  // Update data tab badge if not on data tab
  if(activeTab!=='data'){
    const n = document.getElementById('tabNotifData');
    n.classList.remove('hide');
    n.textContent = dataLog.length;
  }
  if(activeTab==='data'){ renderDataList(); updateDataKpis(); }
}

function setFilter(f){
  dataFilter = f;
  ['all','found','notf'].forEach(k=>{
    const btn = document.getElementById('fb-'+k);
    btn.classList.toggle('active', k===f);
  });
  renderDataList();
}

/* ── DATE FILTER ── */
function isoToday(){
  return new Date().toISOString().slice(0,10);
}
function isoOffset(days){
  const d = new Date(); d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function isoMonday(){
  const d = new Date();
  const day = d.getDay(); // 0=sun
  const diff = (day===0) ? -6 : 1-day;
  d.setDate(d.getDate()+diff);
  return d.toISOString().slice(0,10);
}

function quickDate(key){
  // Toggle off if same
  if(activeQuick===key){ clearDateFilter(); return; }
  activeQuick = key;
  const today = isoToday();
  if(key==='today')  { dateFromFilter=today;       dateToFilter=today; }
  if(key==='ayer')   { const y=isoOffset(-1); dateFromFilter=y; dateToFilter=y; }
  if(key==='semana') { dateFromFilter=isoMonday();  dateToFilter=today; }

  document.getElementById('dateFrom').value = dateFromFilter;
  document.getElementById('dateTo').value   = dateToFilter;
  syncDateUI();
  renderDataList();
  updateDataKpis();
}

function applyDateFilter(){
  dateFromFilter = document.getElementById('dateFrom').value;
  dateToFilter   = document.getElementById('dateTo').value;
  activeQuick    = ''; // manual input clears quick
  syncDateUI();
  renderDataList();
  updateDataKpis();
}

function clearDateFilter(){
  dateFromFilter=''; dateToFilter=''; activeQuick='';
  document.getElementById('dateFrom').value='';
  document.getElementById('dateTo').value='';
  syncDateUI();
  renderDataList();
  updateDataKpis();
}

function syncDateUI(){
  const hasFilter = dateFromFilter || dateToFilter;
  ['today','ayer','semana'].forEach(k=>{
    document.getElementById('dq-'+k).classList.toggle('active', k===activeQuick);
  });
  document.getElementById('dqClear').style.display = hasFilter ? '' : 'none';
  document.getElementById('dateFilterRow').classList.toggle('has-active', !!hasFilter);
}

function renderDataList(){
  const el     = document.getElementById('dataList');
  const q      = (document.getElementById('dataSearch').value||'').toLowerCase().trim();
  const rows   = dataLog.filter(r=>{
    if(dataFilter==='found' && r.status!=='found') return false;
    if(dataFilter==='notf'  && r.status!=='notf')  return false;
    if(dateFromFilter && (r.isoDate||'') < dateFromFilter) return false;
    if(dateToFilter   && (r.isoDate||'') > dateToFilter)   return false;
    if(q){
      const haystack = [r.id, r.locationText, r.obs, r.route, r.dim, r.date].join(' ').toLowerCase();
      if(!haystack.includes(q)) return false;
    }
    return true;
  });

  if(!rows.length){
    el.innerHTML = dataLog.length
      ? '<div class="data-empty"><div class="data-empty-icon">🔍</div>Sin resultados para ese filtro.</div>'
      : '<div class="data-empty"><div class="data-empty-icon">📭</div>Aún no hay registros.<br>Los IDs procesadas aparecerán aquí.</div>';
    return;
  }

  // Show newest first
  const sorted = [...rows].reverse();
  el.innerHTML = sorted.map((r,i)=>{
    const locIcon = {buffer:'🏗️',same:'📦',cross:'🔀',custom:'✏️'}[r.location]||'';
    const locLbl  = r.locationText || '—';
    const dimHtml = r.dim==='vol'
      ? '<span class="dim-badge vol">📦 VOL</span>'
      : r.dim==='conv'
        ? '<span class="dim-badge conv">📫 CONV</span>'
        : '<span class="dim-badge none">—</span>';
    const routeHtml = r.route
      ? `<span class="route-badge">${esc(r.route)}</span>`
      : '<span class="route-badge empty">Sin ruta</span>';
    const locHtml = r.location
      ? `<span class="loc-badge ${r.location}">${locIcon} ${esc(locLbl)}</span>`
      : '<span class="loc-badge custom" style="opacity:.4">—</span>';
    const obsHtml = r.obs
      ? `<div class="dr-obs"><div class="dr-obs-lbl">observación</div>${esc(r.obs)}</div>`
      : '';
    const sesLbl = r.session ? `S${r.session}` : '';

    return `
    <div class="data-row ${r.status==='found'?'found-row':'notf-row'}">
      <div class="dr-top">
        <span class="dr-num">${sorted.length-i}</span>
        <span class="dr-id">${esc(r.id)}</span>
        <span class="dr-status ${r.status==='found'?'found':'notf'}">${r.status==='found'?'✓ Encontrado':'✗ No encontrado'}</span>
        <span class="dr-time">${r.date ? r.date+' ' : ''}${r.time}</span>
        ${sesLbl?`<span class="dr-session">${sesLbl}</span>`:''}
      </div>
      <div class="dr-meta">
        ${dimHtml}${routeHtml}${locHtml}
      </div>
      ${obsHtml}
    </div>`;
  }).join('');

  // Update session info
  const sessions = [...new Set(dataLog.map(r=>r.session))].length;
  document.getElementById('dataSessionInfo').textContent =
    dataLog.length + ' registro'+(dataLog.length!==1?'s':'')+' · '+sessions+' sesión'+(sessions!==1?'es':'');
}

function updateDataKpis(){
  const filtered = dataLog.filter(r=>{
    if(dateFromFilter && (r.isoDate||'') < dateFromFilter) return false;
    if(dateToFilter   && (r.isoDate||'') > dateToFilter)   return false;
    return true;
  });
  const total = filtered.length;
  const found = filtered.filter(r=>r.status==='found').length;
  const notf  = filtered.filter(r=>r.status==='notf').length;
  const pct   = total ? Math.round(found/total*100)+'%' : '—';
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiFound').textContent = found;
  document.getElementById('kpiNotf').textContent  = notf;
  document.getElementById('kpiPct').textContent   = pct;
}

/* ════════════════════════════════════════
   EXPORT CSV
════════════════════════════════════════ */
function exportCSV(){
  if(!dataLog.length){ showToast('⚠️ No hay datos para exportar', false); return; }
  const locName = { buffer:'Conveyor/Buffer', same:'Mismo contenedor', cross:'Cont. cruzado', custom:'Otro' };
  const filtered = dataLog.filter(r=>{
    if(dataFilter==='found' && r.status!=='found') return false;
    if(dataFilter==='notf'  && r.status!=='notf')  return false;
    if(dateFromFilter && (r.isoDate||'') < dateFromFilter) return false;
    if(dateToFilter   && (r.isoDate||'') > dateToFilter)   return false;
    return true;
  });
  if(!filtered.length){ showToast('⚠️ Sin registros con ese filtro', false); return; }
  const header = ['#','ID','Estado','Fecha','Hora','Sesión','Dimensión','Ruta','Ubicación','Contenedor','Observación'];
  const rows = filtered.map((r,i)=>[
    i+1, r.id,
    r.status==='found'?'Encontrado':'No encontrado',
    r.date||'', r.time||'', r.session||'',
    r.dim==='vol'?'Voluminoso':r.dim==='conv'?'Conveyable':'—',
    r.route||'—',
    r.location?(locName[r.location]||r.location):'—',
    r.locationText||'—', r.obs||''
  ].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
  const csv  = [header.join(','),...rows].join('\r\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download='buscador_ids_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV exportado · '+filtered.length+' registros', true);
}

function clearData(){
  if(!dataLog.length) return;
  if(!confirm('¿Borrar todos los registros de datos? Esta acción no se puede deshacer.')) return;
  dataLog=[];
  renderDataList();
  updateDataKpis();
  document.getElementById('dataSessionInfo').textContent='—';
  const n = document.getElementById('tabNotifData');
  n.classList.add('hide');
  showToast('Datos limpiados', false);
}

/* ════════════════════════════════════════
   RESET APP
════════════════════════════════════════ */
function resetApp(){
  pendingIds=[]; searchIds=[]; foundCount=0; totalCount=0;
  document.getElementById('loadCard').style.display='block';
  document.getElementById('searchCard').style.display='none';
  document.getElementById('scanBar').style.display='';
  document.getElementById('doneState').classList.remove('show');
  document.getElementById('headerBadge').textContent='0 IDs';
  renderPending();
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>document.getElementById('idInput').focus(), 300);
}

/* ════════════════════════════════════════
   DIM / ROUTE / PASTE
════════════════════════════════════════ */
function setDim(idx,dim){
  pendingIds[idx].dim = pendingIds[idx].dim===dim ? null : dim;
  renderPending();
  setTimeout(()=>document.getElementById('idInput').focus(), 50);
}
function setRoute(idx,val){ pendingIds[idx].route = val.toUpperCase().trim() }

function handlePaste(e){
  const text = (e.clipboardData||window.clipboardData).getData('text');
  const ids  = parseMultipleIds(text);
  if(ids.length>1){ e.preventDefault(); addMultipleIds(ids) }
}
function addBulk(){
  const ta = document.getElementById('bulkInput');
  const text = ta.value.trim();
  if(!text) return;
  addMultipleIds(parseMultipleIds(text));
  ta.value='';
}
function parseMultipleIds(text){
  return text.split(/[\n\r,;|\t ]+/).map(s=>cleanId(s.trim())).filter(s=>s&&s.length>=4);
}
function addMultipleIds(ids){
  let added=0,dupes=0;
  ids.forEach(val=>{
    if(pendingIds.some(p=>p.id===val)){dupes++;return;}
    pendingIds.push({id:val,dim:null,route:''}); added++;
  });
  renderPending();
  document.getElementById('idInput').focus();
  if(added>0) showToast('✓ '+added+' ID'+(added!==1?'s':'')+' agregada'+(added!==1?'s':''), true);
  if(dupes>0) showToast('⚠️ '+dupes+' duplicada'+(dupes!==1?'s':''), false);
}

/* ════════════════════════════════════════
   TOAST / ESC
════════════════════════════════════════ */
function showToast(msg,ok){
  const t=document.getElementById('toast'), m=document.getElementById('toastMsg');
  m.textContent=msg;
  t.style.borderColor=ok?'var(--ok-b)':'var(--er-b)';
  t.style.color=ok?'var(--ok)':'var(--er)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

document.getElementById('modalOverlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('modalOverlay')) closeModal();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') closeModal();
});
document.getElementById('searchCard').addEventListener('click',e=>{
  if(!document.getElementById('modalOverlay').classList.contains('show'))
    document.getElementById('scanInput').focus();
});

window.onload=()=>{ renderPending(); document.getElementById('idInput').focus(); }
