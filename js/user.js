(function(){
  const API_BASE = 'https://republica-api-1.onrender.com'.replace(/\/$/, '');
  const AUTH_KEY = 'republica_auth_user_v1';
  const PHOTO_KEY_PREFIX = 'republica_user_photos_v1_';
  const MAX_PHOTO_SIZE = 1600; // resize

  const $ = (id)=>document.getElementById(id);
  const digits = (v)=>String(v||'').replace(/\D+/g,'');
  const fmtPhone = (v)=>{ const d=digits(v); return d.length>=11 ? `(${d.slice(-11,-9)}) ${d.slice(-9,-4)}-${d.slice(-4)}` : v; };
  const fmtDate = (iso)=>{ try{ const [y,m,d]=String(iso).split('-'); return `${d}/${m}/${y}`; }catch{return iso;} };

  function getUser(){ try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch{return null;} }
  function saveUser(user){ try{ user ? localStorage.setItem(AUTH_KEY, JSON.stringify(user)) : localStorage.removeItem(AUTH_KEY);}catch{} }

  function getPhotoStoreKey(user){ return PHOTO_KEY_PREFIX + digits(user?.phone || user?.id || ''); }
  function loadPhotos(user){ try{ return JSON.parse(localStorage.getItem(getPhotoStoreKey(user))||'[]'); }catch{return [];} }
  function savePhotos(user, photos){ try{ localStorage.setItem(getPhotoStoreKey(user), JSON.stringify(photos)); }catch(e){ throw new Error('Não foi possível salvar fotos. Tente enviar menos imagens por vez.'); } }

  function ensureLogged(){
    const user = getUser();
    if(!user){ window.location.href = 'auth.html'; return null; }
    $('userWelcomeText').textContent = `${user.name} • ${fmtPhone(user.phone)}${user.email ? ' • ' + user.email : ''}`;
    return user;
  }

  function reservationCard(it){
    const title = `${it.court || 'Reserva'} • ${fmtDate(it.date)}`;
    const meta = `${it.start} às ${it.end}`;
    const eventId = String(it.eventId||'').replace(/"/g,'');
    return `
      <div class="res-item">
        <div class="res-row">
          <div>
            <strong>${title}</strong>
            <div class="res-meta">${meta}</div>
          </div>
          <button class="mini-action mini-danger btn-cancel-res" type="button" data-event-id="${eventId}">Cancelar</button>
        </div>
      </div>`;
  }

  async function loadReservations(){
    const user = getUser();
    if(!user) return;
    const status = $('userReservationsStatus');
    const list = $('userReservationsList');
    status.textContent = 'Carregando reservas...';
    list.innerHTML = '';
    try{
      const r = await fetch(`${API_BASE}/api/my_reservations?phone=${encodeURIComponent(digits(user.phone))}`);
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Erro ao buscar reservas.');
      const items = Array.isArray(data.reservations) ? data.reservations : [];
      status.textContent = items.length ? `Você tem ${items.length} reserva(s) futura(s).` : 'Nenhuma reserva futura encontrada.';
      if(!items.length){
        list.innerHTML = '<div class="empty-state">Quando você fizer reservas, elas vão aparecer aqui ✨</div>';
        return;
      }
      list.innerHTML = items.map(reservationCard).join('');
    }catch(e){
      status.textContent = String(e.message||e);
      list.innerHTML = '';
    }
  }

  async function cancelReservation(eventId){
    const user = getUser();
    if(!user || !eventId) return;
    if(!confirm('Tem certeza que deseja cancelar essa reserva?')) return;
    const status = $('userReservationsStatus');
    status.textContent = 'Cancelando reserva...';
    try{
      const r = await fetch(`${API_BASE}/api/cancel_by_phone`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ phone: digits(user.phone), eventId })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Não foi possível cancelar.');
      status.textContent = 'Reserva cancelada ✅';
      await loadReservations();
    }catch(e){ status.textContent = String(e.message||e); }
  }

  async function cancelNextReservation(){
    const user = getUser();
    if(!user) return;
    if(!confirm('Cancelar sua próxima reserva?')) return;
    const status = $('userReservationsStatus');
    status.textContent = 'Cancelando próxima reserva...';
    try{
      const r = await fetch(`${API_BASE}/api/cancel_by_phone`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ phone: digits(user.phone) })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Não foi possível cancelar.');
      status.textContent = 'Próxima reserva cancelada ✅';
      await loadReservations();
    }catch(e){ status.textContent = String(e.message||e); }
  }

  function renderPhotos(){
    const user = getUser(); if(!user) return;
    const gallery = $('photoGallery');
    const photos = loadPhotos(user);
    if(!photos.length){ gallery.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Nenhuma foto postada ainda. Poste seu primeiro registro 📸</div>'; return; }
    gallery.innerHTML = photos.map((p,i)=>`
      <div class="photo-card">
        <img src="${p.dataUrl}" alt="Registro ${i+1}">
        <div class="photo-card-body">
          <p>${escapeHtml(p.caption || 'Registro de aula/jogo')}</p>
          <span>${new Date(p.createdAt).toLocaleString('pt-BR')}</span>
          <div class="photo-actions"><button class="photo-delete" data-idx="${i}" type="button">Excluir</button></div>
        </div>
      </div>`).join('');
    gallery.querySelectorAll('.photo-delete').forEach(btn=>btn.addEventListener('click', ()=>deletePhoto(Number(btn.dataset.idx))));
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function resizeImage(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas'); c.width=w; c.height=h;
          c.getContext('2d').drawImage(img,0,0,w,h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = ()=>reject(new Error('Imagem inválida.'));
        img.src = reader.result;
      };
      reader.onerror = ()=>reject(new Error('Falha ao ler imagem.'));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoPost(ev){
    ev.preventDefault();
    const user = getUser(); if(!user) return;
    const files = Array.from($('photoInput').files || []);
    const caption = ($('photoCaption').value || '').trim();
    const status = $('photoStatus');
    if(!files.length){ status.textContent = 'Selecione pelo menos 1 foto.'; return; }
    if(files.length > 6){ status.textContent = 'Envie no máximo 6 fotos por vez.'; return; }
    status.textContent = 'Processando fotos...';
    try{
      const prepared = [];
      for(const f of files){ prepared.push({ dataUrl: await resizeImage(f), caption, createdAt: new Date().toISOString() }); }
      const photos = loadPhotos(user);
      const merged = [...prepared.reverse(), ...photos].slice(0, 60);
      savePhotos(user, merged);
      $('photoPostForm').reset();
      status.textContent = 'Fotos postadas com sucesso ✅';
      renderPhotos();
    }catch(e){ status.textContent = String(e.message||e); }
  }

  function deletePhoto(index){
    const user = getUser(); if(!user) return;
    const arr = loadPhotos(user);
    if(index < 0 || index >= arr.length) return;
    arr.splice(index,1);
    try{ savePhotos(user, arr); renderPhotos(); $('photoStatus').textContent = 'Foto removida.'; }catch(e){ $('photoStatus').textContent = 'Erro ao remover foto.'; }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const user = ensureLogged();
    if(!user) return;
    $('btnUserLogout')?.addEventListener('click', ()=>{ saveUser(null); window.location.href='index.html'; });
    $('btnRefreshReservations')?.addEventListener('click', loadReservations);
    $('btnCancelNextReservation')?.addEventListener('click', cancelNextReservation);
    $('userReservationsList')?.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.btn-cancel-res');
      if(!btn) return;
      cancelReservation(btn.dataset.eventId);
    });
    $('photoPostForm')?.addEventListener('submit', handlePhotoPost);
    renderPhotos();
    loadReservations();
  });
})();
