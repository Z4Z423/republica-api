
(function(){
  const API_BASE = 'https://republica-api-1.onrender.com'.replace(/\/$/, '');
  const AUTH_STORAGE_KEY = 'republica_auth_user_v1';
  let mode = 'login';

  const $ = (id)=>document.getElementById(id);
  const digits = (v)=>String(v||'').replace(/\D+/g,'');
  const setStatus = (msg='', kind='')=>{ const el=$('authStatus'); if(!el) return; el.textContent=msg; el.className='auth-status'+(kind?(' '+kind):''); };
  const setResetStatus = (msg='', kind='')=>{ const el=$('resetStatus'); if(!el) return; el.textContent=msg; el.className='auth-status'+(kind?(' '+kind):''); };
  const getUser = ()=>{ try{return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)||'null');}catch(e){return null;} };
  const saveUser = (u)=>{ try{u?localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(u)):localStorage.removeItem(AUTH_STORAGE_KEY);}catch(e){} renderLogged(); };

  function setMode(next){
    mode = next === 'register' ? 'register' : 'login';
    $('tabLogin')?.classList.toggle('active', mode==='login');
    $('tabRegister')?.classList.toggle('active', mode==='register');
    if($('tabLogin')) $('tabLogin').setAttribute('aria-selected', mode==='login' ? 'true':'false');
    if($('tabRegister')) $('tabRegister').setAttribute('aria-selected', mode==='register' ? 'true':'false');
    if($('loginForm')) $('loginForm').style.display = mode==='login' ? 'grid' : 'none';
    if($('registerForm')) $('registerForm').style.display = mode==='register' ? 'grid' : 'none';
    if(mode!=='login' && $('resetForm')) { $('resetForm').style.display='none'; $('resetForm')?.reset?.(); setResetStatus(''); }
    setStatus('');
  }

  function renderLogged(){
    const user = getUser();
    const box = $('loggedBox');
    if(!box) return;
    if(user){
      box.style.display='block';
      $('loggedUserText').textContent = `${user.name} • ${user.phone} • ${user.email||''}`;
      setStatus('Conta pronta. Você já pode ver sua área do cliente e reservar ✅','ok');
    }else{
      box.style.display='none';
    }
  }

  async function doLogin(ev){
    ev?.preventDefault?.();
    const login = $('loginUser')?.value?.trim() || '';
    const password = $('loginPass')?.value || '';
    try{
      setStatus('Entrando...');
      const r = await fetch(`${API_BASE}/api/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({login, email:login, phone:digits(login), password})});
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Não foi possível entrar.');
      saveUser(data.user);
      setStatus('Login realizado com sucesso ✅', 'ok');
      setTimeout(()=>{ window.location.href = 'usuario.html'; }, 600);
    }catch(err){ setStatus(String(err.message||err), 'error'); }
  }

  async function doRegister(ev){
    ev?.preventDefault?.();
    const payload = { name:$('regName')?.value?.trim(), phone:digits($('regPhone')?.value), email:$('regEmail')?.value?.trim(), password:$('regPass')?.value||'' };
    try{
      setStatus('Criando conta...');
      const r = await fetch(`${API_BASE}/api/auth/register`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Não foi possível criar a conta.');
      saveUser(data.user);
      setStatus('Conta criada com sucesso ✅', 'ok');
      setTimeout(()=>{ window.location.href = 'usuario.html'; }, 700);
    }catch(err){ setStatus(String(err.message||err), 'error'); }
  }



  async function doResetPassword(ev){
    ev?.preventDefault?.();
    const email = $('resetEmail')?.value?.trim() || '';
    const phone = digits($('resetPhone')?.value);
    const newPassword = $('resetNewPassword')?.value || '';
    try{
      setResetStatus('Redefinindo senha...');
      const r = await fetch(`${API_BASE}/api/auth/reset_password`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email, phone, newPassword })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error || 'Não foi possível redefinir a senha.');
      setResetStatus('Senha redefinida com sucesso ✅ Agora é só entrar.', 'ok');
      $('loginPass') && ($('loginPass').value = '');
      setTimeout(()=>{
        if($('resetForm')) $('resetForm').style.display='none';
        $('resetForm')?.reset?.();
      }, 1200);
    }catch(err){
      setResetStatus(String(err.message||err), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('tabLogin')?.addEventListener('click', ()=>setMode('login'));
    $('tabRegister')?.addEventListener('click', ()=>setMode('register'));
    $('loginForm')?.addEventListener('submit', doLogin);
    $('registerForm')?.addEventListener('submit', doRegister);
    $('btnLogout')?.addEventListener('click', ()=>{ saveUser(null); setStatus('Você saiu da conta.',''); });
    $('btnShowReset')?.addEventListener('click', ()=>{
      if($('resetForm')) $('resetForm').style.display = 'grid';
      setResetStatus('');
    });
    $('btnCancelReset')?.addEventListener('click', ()=>{
      if($('resetForm')) $('resetForm').style.display = 'none';
      $('resetForm')?.reset?.();
      setResetStatus('');
    });
    $('resetForm')?.addEventListener('submit', doResetPassword);
    setMode('login');
    renderLogged();

    const hash = (location.hash||'').toLowerCase();
    if(hash.includes('cadastro') || hash.includes('register')) setMode('register');
  });
})();
