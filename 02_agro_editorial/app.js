(() => {
  const data = window.DEMO_DATA;
  const cases = data.cases.slice();
  const state = { search:'', status:'', responsible:'', region:'', category:'' };
  const $ = (id) => document.getElementById(id);
  const fmtMoney = new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 });
  const fmtDate = new Intl.DateTimeFormat('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const today = new Date('2026-09-23T12:00:00');
  const analyticsVariant = location.pathname.split('/').filter(Boolean).pop() || 'landing';
  const trackedAnalyticsEvents = new Set();

  function trackEventOnce(name, title) {
    const path = `interaction/${name}/${analyticsVariant}`;
    if (trackedAnalyticsEvents.has(path)) return;
    trackedAnalyticsEvents.add(path);

    let attempts = 0;
    const send = () => {
      if (window.goatcounter && typeof window.goatcounter.count === 'function') {
        window.goatcounter.count({ path, title, event: true });
        return;
      }
      attempts += 1;
      if (attempts < 25) setTimeout(send, 100);
    };
    send();
  }
  const statusOrder = ['En ejecución','Observado','En análisis','Aprobado','Espera cliente','Completado','Cancelado'];

  function parseDate(s) { const d = new Date(s + 'T12:00:00'); return Number.isNaN(d.getTime()) ? null : d; }
  function daysUntil(s) { const d = parseDate(s); return d ? Math.ceil((d - today) / 86400000) : 999; }
  function isActive(c) { return ['En ejecución','Observado','En análisis','Aprobado'].includes(c.status); }
  function isRisk(c) { return c.risk === 'Alto' || (isActive(c) && daysUntil(c.due) <= 2); }
  function priorityScore(c) {
    let score = 0;
    if (c.type === 'Acción propia') score += 35;
    if (c.risk === 'Alto') score += 40;
    if (c.risk === 'Medio') score += 16;
    const d = daysUntil(c.due);
    if (d <= 1) score += 35; else if (d <= 3) score += 24; else if (d <= 7) score += 10;
    if (c.status === 'Observado') score += 18;
    if (c.status === 'En ejecución') score += 12;
    return score;
  }
  function attentionLabel(c, i) {
    const d = daysUntil(c.due);
    if (c.risk === 'Alto' && d <= 1) return ['Atención inmediata','⚡','urgent'];
    if (d <= 3) return ['Revisar hoy','◷','today'];
    if (c.risk === 'Alto' || c.status === 'Observado') return ['Seguimiento prioritario','▥','priority'];
    if (c.type === 'Acción propia') return ['Próxima revisión','◫','review'];
    return [`Seguimiento ${i+1}`,'•','follow'];
  }
  function priorityTags(c) {
    const tags = [];
    if (c.risk === 'Alto') tags.push(['Riesgo alto','risk']);
    const d = daysUntil(c.due);
    if (d <= 3) tags.push(['Vence pronto','due']);
    if (c.type === 'Acción propia') tags.push(['Acción propia','own']);
    if (c.status === 'Observado') tags.push(['Observado','observed']);
    return tags.slice(0,2);
  }
  function counts() {
    const completed = cases.filter(c => c.status === 'Completado');
    return {
      total: cases.length,
      active: cases.filter(isActive).length,
      waiting: cases.filter(c => c.status === 'Espera cliente').length,
      risk: cases.filter(isRisk).length,
      completed: completed.length,
      completedAmount: completed.reduce((s,c) => s + c.amount, 0)
    };
  }
  const kpiIcons = ['▣','●','◷','!','✓','$'];
  function renderKPIs() {
    const c = counts();
    const items = [
      ['Cartera', c.total, 'gestiones', 'base'],
      ['Activas', c.active, 'en seguimiento', 'success'],
      ['Espera externa', c.waiting, 'dependen de terceros', 'waiting'],
      ['En riesgo', c.risk, 'riesgo o vencimiento', 'danger'],
      ['Completadas', c.completed, 'cerradas', 'success'],
      ['Monto completado', moneyCompact(c.completedAmount), 'resultado acumulado', 'money']
    ];
    $('kpiGrid').innerHTML = items.map(([label,value,sub,cls],i) => `<article class="kpi ${cls}"><span class="kpi-icon">${kpiIcons[i]}</span><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div><span class="spark" aria-hidden="true"></span></article>`).join('');
  }
  function moneyCompact(n) { return '$ ' + (n/1000000).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' M'; }

  function renderPriorities() {
    const p = cases.filter(c => isActive(c) && c.type === 'Acción propia')
      .map(c => ({...c, score:priorityScore(c)})).sort((a,b) => b.score-a.score).slice(0,4);
    $('priorityList').innerHTML = p.map((c,i) => {
      const [label,icon,cls] = attentionLabel(c,i);
      const tags = priorityTags(c).map(([t,k]) => `<span class="reason-tag ${k}">${t}</span>`).join('');
      return `<button class="priority-card ${cls}" type="button" data-case-id="${c.id}">
        <span class="attention-label"><span class="attention-icon">${icon}</span><strong>${label}</strong></span>
        <span class="priority-main"><span class="priority-title">${c.client}</span><span class="priority-meta">${c.status} · ${c.category}</span><span class="priority-tags">${tags}</span></span>
        <span class="priority-thumb thumb-${(i%4)+1}" aria-hidden="true"></span><span class="chevron">›</span>
      </button>`;
    }).join('');
  }

  function renderPipeline() {
    const groups = Object.fromEntries(statusOrder.map(s => [s, cases.filter(c => c.status===s).length]));
    const max = Math.max(...Object.values(groups),1);
    $('pipeline').innerHTML = statusOrder.map(status => {
      const pct = Math.round(groups[status]/cases.length*100);
      return `<div class="pipeline-row"><button type="button" data-status-filter="${status}"><span class="pipeline-label">${status}</span><span class="pipeline-track"><span class="pipeline-fill" style="width:${Math.max(6, groups[status]/max*100)}%"></span></span><span class="pipeline-count">${groups[status]}</span><span class="pipeline-pct">${pct}%</span></button></div>`;
    }).join('');
    $('portfolioTotal').textContent = cases.length;
  }

  function renderAlerts() {
    const alerts = cases.filter(c => c.risk !== 'Bajo' && c.status !== 'Completado' && c.status !== 'Cancelado')
      .sort((a,b) => (b.risk==='Alto')-(a.risk==='Alto') || daysUntil(a.due)-daysUntil(b.due)).slice(0,4);
    $('alertCount').textContent = `${alerts.length} alertas visibles`;
    $('alertsGrid').innerHTML = alerts.map(c => `<button type="button" class="alert-card" data-risk="${c.risk}" data-case-id="${c.id}"><span class="alert-icon">!</span><span class="alert-body"><span class="alert-title">${c.client}</span><span class="alert-text">${c.alert}</span><span class="risk-pill">Riesgo ${c.risk}</span></span><span class="chevron">›</span></button>`).join('');
  }

  function unique(field) { return [...new Set(cases.map(c => c[field]))].sort((a,b) => a.localeCompare(b,'es')); }
  function fillSelect(id, values) { const el=$(id); const first=el.options[0].outerHTML; el.innerHTML=first+values.map(v=>`<option value="${v}">${v}</option>`).join(''); }
  function filteredCases() {
    const q = state.search.trim().toLowerCase();
    return cases.filter(c => {
      if (state.status && c.status !== state.status) return false;
      if (state.responsible && c.responsible !== state.responsible) return false;
      if (state.region && c.region !== state.region) return false;
      if (state.category && c.category !== state.category) return false;
      if (q && ![c.id,c.client,c.status,c.region,c.category,c.responsible,c.nextAction,c.alert].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderTable() {
    const rows = filteredCases();
    $('resultsCount').textContent = `${rows.length} de ${cases.length} gestiones`;
    const active = [state.status,state.responsible,state.region,state.category,state.search].filter(Boolean).length;
    $('activeFilterText').textContent = active ? `${active} filtro${active===1?'':'s'} aplicado${active===1?'':'s'}` : 'Sin filtros aplicados';
    $('casesTable').innerHTML = rows.length ? rows.map(c => `<tr data-case-id="${c.id}"><td><div class="case-name">${c.client}</div><div class="case-id">${c.id}</div></td><td><span class="status-pill" data-status="${c.status}">${c.status}</span></td><td>${c.category}</td><td>${c.region}</td><td class="amount">${fmtMoney.format(c.amount)}</td><td>${c.responsible}</td><td class="next-action">${c.nextAction}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">No hay gestiones que coincidan con los filtros actuales.</div></td></tr>`;
  }
  function openCase(id) {
    const c = cases.find(x => x.id === id); if (!c) return;
    trackEventOnce('case-opened', `Interaction: case opened (${analyticsVariant})`);
    const d = daysUntil(c.due);
    $('drawerContent').innerHTML = `<div class="detail-id">${c.id}</div><h2>${c.client}</h2><p class="summary">${c.summary}</p><div class="detail-grid"><div class="detail-box"><span>Estado</span><strong>${c.status}</strong></div><div class="detail-box"><span>Monto</span><strong>${fmtMoney.format(c.amount)}</strong></div><div class="detail-box"><span>Categoría</span><strong>${c.category}</strong></div><div class="detail-box"><span>Región</span><strong>${c.region}</strong></div><div class="detail-box"><span>Responsable</span><strong>${c.responsible}</strong></div><div class="detail-box"><span>Vencimiento</span><strong>${fmtDate.format(parseDate(c.due))}${d>=0?` · ${d} días`:''}</strong></div></div><div class="detail-section"><h3>Próxima acción</h3><p>${c.nextAction}</p></div><div class="detail-section"><h3>Alerta / contexto</h3><p>${c.alert}</p></div><div class="detail-section"><h3>Última actualización</h3><p>${fmtDate.format(parseDate(c.lastUpdate))} · Riesgo ${c.risk} · ${c.type}</p></div>`;
    $('drawerBackdrop').hidden = false; $('detailDrawer').classList.add('open'); $('detailDrawer').setAttribute('aria-hidden','false');
  }
  function closeDrawer() { $('detailDrawer').classList.remove('open'); $('detailDrawer').setAttribute('aria-hidden','true'); setTimeout(() => $('drawerBackdrop').hidden = true, 180); }
  function resetFilters() { Object.assign(state,{search:'',status:'',responsible:'',region:'',category:''}); ['searchInput','headerSearch'].forEach(id=>$(id).value=''); ['statusFilter','responsibleFilter','regionFilter','categoryFilter'].forEach(id=>$(id).value=''); renderTable(); }
  function exportCSV() {
    trackEventOnce('csv-exported', `Interaction: CSV exported (${analyticsVariant})`);
    const rows = filteredCases();
    const headers = ['ID','Cliente','Estado','Región','Categoría','Monto','Responsable','Tipo','Riesgo','Vencimiento','Última actualización','Próxima acción'];
    const esc = v => `"${String(v ?? '').replaceAll('"','""')}"`;
    const csv = [headers, ...rows.map(c => [c.id,c.client,c.status,c.region,c.category,c.amount,c.responsible,c.type,c.risk,c.due,c.lastUpdate,c.nextAction])].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nexo-operativo-demo.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  function applySearch(v) { state.search=v; $('searchInput').value=v; $('headerSearch').value=v; if(v.trim().length >= 2) trackEventOnce('search-used', `Interaction: search used (${analyticsVariant})`); renderTable(); }
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const caseEl=e.target.closest('[data-case-id]'); if(caseEl) openCase(caseEl.dataset.caseId);
      const statusEl=e.target.closest('[data-status-filter]'); if(statusEl){ trackEventOnce('filter-used', `Interaction: filter used (${analyticsVariant})`); state.status=statusEl.dataset.statusFilter; $('statusFilter').value=state.status; renderTable(); $('cartera').scrollIntoView({behavior:'smooth'}); }
      const scrollEl=e.target.closest('[data-scroll-target]'); if(scrollEl){ const target=document.getElementById(scrollEl.dataset.scrollTarget); if(target) target.scrollIntoView({behavior:'smooth'}); }
    });
    $('clearStatusFilter').addEventListener('click',()=>{state.status='';$('statusFilter').value='';renderTable();});
    $('drawerClose').addEventListener('click',closeDrawer); $('drawerBackdrop').addEventListener('click',closeDrawer);
    $('resetBtn').addEventListener('click',resetFilters); $('exportBtn').addEventListener('click',exportCSV);
    $('aboutBtn').addEventListener('click',()=>{trackEventOnce('about-opened', `Interaction: about opened (${analyticsVariant})`);$('aboutDialog').showModal();}); $('aboutClose').addEventListener('click',()=>$('aboutDialog').close());
    $('searchInput').addEventListener('input',e=>applySearch(e.target.value)); $('headerSearch').addEventListener('input',e=>applySearch(e.target.value));
    [['statusFilter','status'],['responsibleFilter','responsible'],['regionFilter','region'],['categoryFilter','category']].forEach(([id,key])=>$(id).addEventListener('change',e=>{if(e.target.value) trackEventOnce('filter-used', `Interaction: filter used (${analyticsVariant})`);state[key]=e.target.value;renderTable();}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
  }
  function init() {
    $('consultedAt').textContent='Consultado: '+new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date());
    fillSelect('statusFilter',statusOrder); fillSelect('responsibleFilter',unique('responsible')); fillSelect('regionFilter',unique('region')); fillSelect('categoryFilter',unique('category'));
    renderKPIs(); renderPriorities(); renderPipeline(); renderAlerts(); renderTable(); bindEvents();
  }
  init();
})();
