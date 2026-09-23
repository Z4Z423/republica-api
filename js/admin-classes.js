(function(){
  const API_BASE='https://republica-api-1.onrender.com'.replace(/\/$/,'');
  const TOKEN_KEY='republica_admin_token_v1';
  const $=id=>document.getElementById(id);
  let settings=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function token(){return localStorage.getItem(TOKEN_KEY)||'';}
  function setToken(value){value?localStorage.setItem(TOKEN_KEY,value):localStorage.removeItem(TOKEN_KEY);}
  async function api(path,options={}){
    const headers={...(options.headers||{}),'Authorization':`Bearer ${token()}`};
    if(options.body) headers['Content-Type']='application/json';
    const response=await fetch(`${API_BASE}${path}`,{...options,headers});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||'Falha ao comunicar com o servidor.');
    return data;
  }
  function showLoggedIn(){ $('loginCard').classList.add('hidden');$('editor').classList.remove('hidden');$('saveArea').classList.remove('hidden');$('logoutBtn').classList.remove('hidden'); }
  function showLogin(){ $('loginCard').classList.remove('hidden');$('editor').classList.add('hidden');$('saveArea').classList.add('hidden');$('logoutBtn').classList.add('hidden'); }
  function render(){
    $('editor').innerHTML=(settings.classes.length ? settings.classes.map((item,index)=>`
      <section class="card class-card" data-class-index="${index}">
        <div class="class-head"><div class="field"><label>Nome da modalidade</label><input data-key="name" value="${esc(item.name)}" maxlength="80"></div><div class="field"><label>Identificador</label><input data-key="id" value="${esc(item.id)}" maxlength="40" ${['beach','volei','futevolei'].includes(item.id)?'readonly':''} aria-label="Identificador interno"></div></div>
        <div class="section-title"><h3>Professores, dias e horários</h3><button type="button" class="small-btn" data-add="schedule">+ Adicionar horário</button></div>
        <div class="rows">${item.schedules.map((row,i)=>`<div class="row" data-row="schedule" data-index="${i}"><div class="field"><label>Professor / instrutor</label><input data-key="teacher" value="${esc(row.teacher)}" maxlength="100"></div><div class="field"><label>Dias da semana</label><input data-key="days" value="${esc(row.days)}" placeholder="Ex.: Segunda e quarta" maxlength="120"></div><div class="field"><label>Horário de início</label><input data-key="time" type="time" value="${esc(row.time||'')}"></div><button class="icon-btn" type="button" data-remove="schedule" aria-label="Remover horário">×</button></div>`).join('')||'<div class="empty">Nenhum horário cadastrado.</div>'}</div>
        <div class="section-title"><h3>Planos e preços mensais</h3><button type="button" class="small-btn" data-add="plan">+ Adicionar plano</button></div>
        <div class="rows">${item.plans.map((row,i)=>`<div class="row planrow" data-row="plan" data-index="${i}"><div class="field"><label>Frequência do plano</label><input data-key="label" value="${esc(row.label)}" placeholder="Ex.: 2x/semana" maxlength="50"></div><div class="field"><label>Preço mensal (R$)</label><input data-key="price" type="number" min="0" max="100000" step="0.01" value="${esc(row.price)}"></div><button class="icon-btn" type="button" data-remove="plan" aria-label="Remover plano">×</button></div>`).join('')||'<div class="empty">Nenhum plano cadastrado.</div>'}</div>
        <div class="actions" style="margin-top:14px"><button type="button" class="btn ghost remove-class" data-class-index="${index}">Excluir esta modalidade</button></div>
      </section>`).join('') : '<section class="card"><p class="empty">Nenhuma modalidade ativa no site. Use “Adicionar modalidade” para criar uma.</p></section>');
    $('editor').querySelectorAll('.class-card').forEach(card=>{
      const ci=Number(card.dataset.classIndex);
      card.querySelectorAll('input[data-key]').forEach(input=>input.addEventListener('input',()=>{
        const row=input.closest('[data-row]');
        if(row){const type=row.dataset.row,ri=Number(row.dataset.index),key=input.dataset.key;settings.classes[ci][type==='schedule'?'schedules':'plans'][ri][key]=key==='price'?Number(input.value):input.value;}
        else settings.classes[ci][input.dataset.key]=input.value;
      }));
      card.querySelectorAll('.remove-class').forEach(button=>button.addEventListener('click',()=>{const name=settings.classes[ci].name;if(!confirm(`Excluir ${name} do site? O card público dessa modalidade será removido após salvar.`))return;settings.classes.splice(ci,1);render();}));
      card.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>{
        settings.classes[ci][button.dataset.add==='schedule'?'schedules':'plans'].push(button.dataset.add==='schedule'?{teacher:'',days:'',time:''}:{label:'',price:0});render();
      }));
      card.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{
        const row=button.closest('[data-row]');const key=button.dataset.remove==='schedule'?'schedules':'plans';settings.classes[ci][key].splice(Number(row.dataset.index),1);render();
      }));
    });
  }
  async function load(){
    $('saveStatus').textContent='Carregando configurações…';
    try{settings=await api('/api/admin/classes');if(!Array.isArray(settings.classes)) throw new Error('Não foi possível ler as configurações.');showLoggedIn();render();$('saveStatus').textContent='';}
    catch(error){$('saveStatus').textContent=error.message; if(/não autorizado/i.test(error.message)){setToken('');showLogin();}}
  }
  async function login(event){
    event.preventDefault();$('loginStatus').textContent='Entrando…';
    try{const response=await fetch(`${API_BASE}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível entrar.');setToken(data.token);$('loginStatus').textContent='';await load();}
    catch(error){$('loginStatus').textContent=error.message;}
  }
  async function save(){
    $('saveBtn').disabled=true;$('saveStatus').className='status';$('saveStatus').textContent='Salvando…';
    try{const result=await api('/api/admin/classes',{method:'PUT',body:JSON.stringify(settings)});settings=result.settings;render();$('saveStatus').className='status ok';$('saveStatus').textContent='Alterações salvas. O site já pode exibir os novos dados.';}
    catch(error){$('saveStatus').className='status error';$('saveStatus').textContent=error.message;}
    finally{$('saveBtn').disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('loginForm').addEventListener('submit',login);$('saveBtn').addEventListener('click',save);$('reloadBtn').addEventListener('click',load);$('addClassBtn').addEventListener('click',()=>{const n=prompt('Nome da nova modalidade:');if(!n||!n.trim())return;let id=n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||`modalidade-${Date.now()}`;if(settings.classes.some(c=>c.id===id))id=`${id}-${Date.now().toString().slice(-4)}`;settings.classes.push({id,name:n.trim(),schedules:[],plans:[]});render();});
    $('logoutBtn').addEventListener('click',()=>{setToken('');settings=null;showLogin();$('loginStatus').textContent='Você saiu do painel.';$('saveStatus').textContent='';});
    if(token()) load(); else showLogin();
  });
})();
