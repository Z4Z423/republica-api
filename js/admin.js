(function(){
  const API_BASE = 'https://republica-api-1.onrender.com'.replace(/\/$/, '');
  const TOKEN_KEY = 'republica_admin_token_v1';
  const $ = (id)=>document.getElementById(id);
  const fmtPhone = (v)=>{ const d=String(v||'').replace(/\D+/g,''); return d.length>=11 ? `(${d.slice(-11,-9)}) ${d.slice(-9,-4)}-${d.slice(-4)}` : (v||''); };
  const fmtDateTime = (iso)=>{ if(!iso) return ''; try{return new Date(iso).toLocaleString('pt-BR')}catch{return iso} };
  function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(v){ v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); }

  async function api(path, opts={}){
    const headers = { ...(opts.headers||{}) };
    const token = getToken(); if(token) headers.Authorization = `Bearer ${token}`;
    if(opts.body && !headers['Content-Type']) headers['Content-Type']='application/json';
    const r = await fetch(`${API_BASE}${path}`, {...opts, headers});
    const data = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || 'Erro na API');
    return data;
  }

  async function loginAdm(ev){
    ev.preventDefault();
    const status = $('adminLoginStatus'); status.textContent='Entrando...';
    try{
      const data = await fetch(`${API_BASE}/api/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: $('admEmail').value.trim(), password: $('admPassword').value }) }).then(async r=>{const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Falha no login'); return j;});
      setToken(data.token);
      status.textContent='Login realizado ✅';
      $('adminLoginCard').hidden = true;
      $('adminPanel').hidden = false;
      loadAll();
    }catch(e){ status.textContent = e.message || String(e); }
  }

  function renderStats(stats){
    const labels = [
      ['Contas cadastradas', stats.totalUsers],
      ['Reservas futuras', stats.totalReservationsUpcoming],
      ['Logins de usuários', stats.totalUserLogins],
      ['Cadastros', stats.totalRegistrations],
      ['Acessos API 7 dias', stats.hits7d],
      ['Acessos API 30 dias', stats.hits30d],
      ['Reservas feitas 7 dias', stats.bookings7d],
      ['Taxa de acesso (estim.) 7d', stats.accessRateEstimate7d]
    ];
    $('statsCards').innerHTML = labels.map(([k,v])=>`<div class="stat"><strong>${v ?? 0}</strong><span>${k}</span></div>`).join('');
  }

  async function loadStats(){
    const data = await api('/api/admin/stats');
    renderStats(data.stats || {});
  }

  async function loadUsers(){
    const status = $('usersStatus'); status.textContent='Carregando contas...';
    const data = await api('/api/admin/users');
    const users = data.users || [];
    $('usersTableBody').innerHTML = users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(fmtPhone(u.phone))}</td><td>${escapeHtml(fmtDateTime(u.createdAt))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma conta cadastrada.</td></tr>';
    status.textContent = `${users.length} conta(s) carregada(s).`;
  }

  async function loadReservations(){
    const status = $('admReservationsStatus'); status.textContent='Carregando reservas...';
    const data = await api('/api/admin/reservations?days=90');
    const rows = data.reservations || [];
    $('admReservationsTableBody').innerHTML = rows.map(r=>`<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.start)} - ${escapeHtml(r.end)}</td><td>${escapeHtml(r.court||'')}</td><td>${escapeHtml(r.customerName||'')}</td><td>${escapeHtml(fmtPhone(r.phone||''))}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma reserva futura.</td></tr>';
    status.textContent = `${rows.length} reserva(s) futura(s).`;
  }

  async function loadAll(){
    try{ await loadStats(); }catch(e){ $('statsCards').innerHTML = `<div class="status">${escapeHtml(e.message||String(e))}</div>`; }
    try{ await loadUsers(); }catch(e){ $('usersStatus').textContent = e.message||String(e); }
    try{ await loadReservations(); }catch(e){ $('admReservationsStatus').textContent = e.message||String(e); }
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('adminLoginForm').addEventListener('submit', loginAdm);
    $('btnAdminLogout').addEventListener('click', ()=>{ setToken(''); $('adminPanel').hidden = true; $('adminLoginCard').hidden = false; $('adminLoginStatus').textContent=''; });
    $('btnRefreshUsers').addEventListener('click', ()=>loadUsers().catch(e=>$('usersStatus').textContent=e.message));
    $('btnRefreshReservationsAdm').addEventListener('click', ()=>loadReservations().catch(e=>$('admReservationsStatus').textContent=e.message));
    const token = getToken();
    if(token){
      $('adminLoginCard').hidden = true;
      $('adminPanel').hidden = false;
      loadAll();
    }
  });
})();
