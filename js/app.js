// MENU MOBILE
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('open');
      });
      navLinks.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          navLinks.classList.remove('open');
          navToggle.classList.remove('active');
        });
      });
    }

    // WHATS
        // CONFIG (edite aqui e o site todo atualiza)
    const CONFIG = {
      API_BASE: "https://republica-api-1.onrender.com", // troque pela URL do seu backend (Render)
      WHATS_NUMBER: "5541998928333", // WhatsApp oficial (somente dígitos)
      WHATS_DISPLAY: "(41) 99892-8333",
      ADDRESS: "R. Mal. Deodoro da Fonseca, 1023 - Centro, São José dos Pinhais - PR, 83005-350",
      INSTAGRAM_URL: "https://www.instagram.com/napraiasjp/",
      GOOGLE_REVIEWS_URL: "https://www.google.com/maps/place/Na+Praia/@-25.543434,-49.2049932,981m/data=!3m2!1e3!4b1!4m6!3m5!1s0x94dcf183c6b816a1:0x10d5e33489427b8a!8m2!3d-25.5434389!4d-49.2024183!16s%2Fg%2F11smypv7rw?entry=ttu",
      };
    const API_BASE = (CONFIG && CONFIG.API_BASE) ? CONFIG.API_BASE.replace(/\/$/,'') : '';

    // Aquece o backend do Render assim que o site abre.
    // Isso diminui a demora quando o servidor gratuito está "dormindo".
    let API_WARMUP_STARTED = false;
    function aquecerBackend(){
      if(API_WARMUP_STARTED || !API_BASE) return;
      API_WARMUP_STARTED = true;
      try{
        fetch(`${API_BASE}/health`, {
          method: 'GET' ,
          cache: 'no-store' ,
          keepalive: true
        }).catch(()=>{});
      }catch(e){}
    }

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', aquecerBackend, { once:true });
    }else{
      aquecerBackend();
    }

    const WHATS_NUMBER = CONFIG.WHATS_NUMBER;

    const INSTAGRAM_URL = CONFIG.INSTAGRAM_URL;
    const GOOGLE_REVIEWS_URL = CONFIG.GOOGLE_REVIEWS_URL;
const AUTH_STORAGE_KEY = 'republica_auth_user_v1';
let AUTH_USER = null;

    function abrirInstagram(){
      window.open(INSTAGRAM_URL, '_blank', 'noopener');
    }
    function abrirAvaliacoes(){
      window.open(GOOGLE_REVIEWS_URL, '_blank', 'noopener');
    }

    // Reveal on scroll (IntersectionObserver)
    (function(){
      const els = Array.from(document.querySelectorAll('.reveal'));
      if(!('IntersectionObserver' in window) || els.length===0){
        els.forEach(el=>el.classList.add('in'));
        return;
      }
      const io = new IntersectionObserver((entries)=>{
        entries.forEach(e=>{
          if(e.isIntersecting){
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 });
      els.forEach(el=>io.observe(el));
    })();

    // FAQ accordion
    document.querySelectorAll('.faq-item .faq-q').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const item = btn.closest('.faq-item');
        if(!item) return;
        const open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(x=>x.classList.remove('open'));
        if(!open) item.classList.add('open');
      });
    });


    // Atualiza textos dinâmicos
    const wl = document.getElementById('whatsLabel');
    if (wl) wl.textContent = CONFIG.WHATS_DISPLAY;

    

    // Endereço / mapa
    const addr = (CONFIG.ADDRESS || '').trim();
    const addrEnc = encodeURIComponent(addr);

    const at = document.getElementById('addressText');
    if (at && addr) at.textContent = addr;

    const mf = document.getElementById('mapFrame');
    if (mf && addr) mf.src = 'https://www.google.com/maps?q=' + addrEnc + '&output=embed';

    const openLink = document.getElementById('mapsOpenLink');
    if (openLink && addr) openLink.href = 'https://www.google.com/maps/search/?api=1&query=' + addrEnc;
function copiarEndereco(){
      const text = CONFIG.ADDRESS || '';
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(() => {
          alert('Endereço copiado! ✅');
        }).catch(() => {
          window.prompt('Copie o endereço:', text);
        });
      } else {
        window.prompt('Copie o endereço:', text);
      }
    }

    function abrirRota(){
      const dest = encodeURIComponent(CONFIG.ADDRESS || '');
      const url = 'https://www.google.com/maps/dir/?api=1&destination=' + dest;
      window.open(url, '_blank');
    }

    function abrirWhats(msg){
      // Atalho genérico (msg opcional)
      abrirWhatsComMensagem(msg || "Oi! 😊");
    }

    // Mensagens prontas por direcionamento
    function msgWhats(tipo, ctx = {}){
      const nl = "\n";

      const phone = (ctx.phone || "").trim();
      const name = (ctx.name || "").trim();
      const start = (ctx.start || "").trim();
      const end = (ctx.end || "").trim();
      const court = (ctx.court || "").trim();
      const date = (ctx.date || "").trim();
      const hours = (ctx.hours || "").trim();

      switch(String(tipo || "")){
        case "reserva_mensal":
          return [
            "Oi! Vim pelo site da República da Praia 😊",
            "Quero **reserva mensal/recorrente**.",
            "",
            "Modalidade: ( ) Beach Tennis ( ) Vôlei ( ) Futevôlei",
            "Dia(s): ____",
            "Horário: ____",
            "Duração: ____",
            "Quantidade de pessoas: ____",
            "",
            "Pode me passar os planos e como funciona?"
          ].join(nl);

        case "duvidas":
          return [
            "Oi! Vim pelo site 😊",
            "Tenho uma dúvida: __________",
            "",
            "(Se puder: é sobre valores/horários/regras/eventos/aulas.)"
          ].join(nl);

        case "aula_beach":
          return [
            "Oi! Vim pelo site da República da Praia 🎾",
            "Quero informações sobre **aulas de Beach Tennis**.",
            "",
            "Meu nível: ( ) iniciante ( ) intermediário ( ) avançado",
            "Melhores dias/horários: ____",
            "",
            "Pode me passar valores e como entrar numa turma?"
          ].join(nl);

        case "aula_volei":
          return [
            "Oi! Vim pelo site da República da Praia 🏐",
            "Quero informações sobre **aulas/treinos de Vôlei**.",
            "",
            "Nível: ____",
            "Melhores dias/horários: ____",
            "",
            "Pode me passar valores e disponibilidade?"
          ].join(nl);

        case "aula_futevolei":
          return [
            "Oi! Vim pelo site da República da Praia ⚽",
            "Quero informações sobre **aulas/treinos de Futevôlei**.",
            "",
            "Nível: ____",
            "Melhores dias/horários: ____",
            "",
            "Como funciona (turma/consulta) e valores?"
          ].join(nl);

        case "confirmacao_reserva":
          // confirmação enviada pelo cliente após reservar no site
          return [
            "✅ Reserva solicitada — República da Praia",
            (date ? ("Data: " + date) : ""),
            ((start && end) ? ("Horário: " + start + "–" + end) : ""),
            (hours ? ("Duração: " + hours) : ""),
            (court ? ("Quadra: " + court) : ""),
            (name ? ("Nome: " + name) : ""),
            (phone ? ("Whats: " + phone) : ""),
            "",
            "Pode confirmar por aqui, por favor? 😊"
          ].filter(Boolean).join(nl);

        default:
          return "Oi! Quero reservar um horário na República da Praia 😊 Pode me passar disponibilidade e valores?";
      }
    }

    function abrirWhatsTipo(tipo, ctx = {}){
      abrirWhatsComMensagem(msgWhats(tipo, ctx));
    }

    function abrirWhatsComMensagem(msg){
      const base = `https://wa.me/${WHATS_NUMBER}`;
      const url = base + '?text=' + encodeURIComponent(msg || 'Oi! 😊');
      window.open(url, '_blank');
    }


    function agendarAgora(){
      // Abre o mesmo modal de "Locação avulsa" e já carrega os horários
      abrirReservaModal();
      setTimeout(() => {
        try{
          carregarSlots();
          const alvo = document.getElementById('slotsHint') || document.getElementById('slotsContainer');
          if(alvo) alvo.scrollIntoView({behavior:'smooth', block:'start'});
        }catch(e){}
      }, 200);
    }


    function abrirReservaModal(){
      const url = (CONFIG && CONFIG.BOOKING_URL) ? CONFIG.BOOKING_URL : "https://www.appointmentbooking.co/book/103371786031416321246";
      window.open(url, '_blank', 'noopener');
    }

    // CARDÁPIO MODAL
    function abrirCardapio(){
      const modal = document.getElementById('cardapioModal');
      if(!modal) return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      const busca = document.getElementById('cardapioBusca');
      if(busca) busca.value='';
      const btnAll = document.querySelector('.chip[data-cat="all"]');
      if(btnAll) filtrarCategoria(btnAll);
    }
    function fecharCardapio(){
      const modal = document.getElementById('cardapioModal');
      if(!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      document.body.style.overflow='';
    }

    function filtrarCategoria(btn){
      const cat = btn.getAttribute('data-cat');
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.menu-group').forEach(g => {
        const gcat = g.getAttribute('data-group');
        g.style.display = (cat === 'all' || gcat === cat) ? '' : 'none';
      });

      const busca = document.getElementById('cardapioBusca');
      if(busca && busca.value) buscarCardapio(busca.value);
    }

    function buscarCardapio(value){
      const q = (value || '').toLowerCase().trim();
      document.querySelectorAll('.menu-item').forEach(it => {
        const txt = (it.innerText || '').toLowerCase();
        it.style.display = txt.includes(q) ? '' : 'none';
      });
      // esconder grupos vazios
      document.querySelectorAll('.menu-group').forEach(g => {
        if (g.style.display === 'none') return;
        const visible = Array.from(g.querySelectorAll('.menu-item')).some(it => it.style.display !== 'none');
        g.style.display = visible ? '' : 'none';
      });
    }

    // fechar clicando fora
    document.addEventListener('click', (e) => {
      const modal = document.getElementById('cardapioModal');
      if(!modal || !modal.classList.contains('open')) return;
      if (e.target && e.target.classList && e.target.classList.contains('cardapio-backdrop')) {
        fecharCardapio();
      }
    });

    // ESC fecha
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('cardapioModal');
      if(e.key === 'Escape' && modal && modal.classList.contains('open')) fecharCardapio();
    });


    // ================= FX: progress + reveal =================
    const scrollBar = document.getElementById('scrollBar');
    function updateScrollBar(){
      if(!scrollBar) return;
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      const p = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      scrollBar.style.width = p.toFixed(2) + '%';
    }
    window.addEventListener('scroll', updateScrollBar, {passive:true});
    window.addEventListener('resize', updateScrollBar);
    updateScrollBar();

    // Reveal on scroll (cards, titles, boxes)
    const revealEls = Array.from(document.querySelectorAll('.card, .price-box, .map, .title, .hero-left, .hero-card, footer'));
    revealEls.forEach(el => el.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, {threshold: 0.12});
    revealEls.forEach(el => io.observe(el));

    // ================= SOM DE ONDAS (WebAudio) =================
    let waveCtx = null;
    let waveSrc = null;
    let waveGain = null;
    let waveLfo = null;
    let waveLfoGain = null;
    let waveFilter = null;
    let waveOn = false;

    const soundBtn = document.getElementById('soundBtn');
    const soundState = document.getElementById('soundState');
    const soundPanel = document.getElementById('soundPanel');
    const soundVol = document.getElementById('soundVol');
    const audioGate = document.getElementById('audioGate');

    // Persistência (lembrar se o som estava ligado)
    try{
      const saved = localStorage.getItem('rdp_waves_on');
      if(saved === '1') setSoundUI(true);
    
    function showAudioGate(){
      if(!audioGate) return;
      audioGate.classList.add('show');
      audioGate.setAttribute('aria-hidden','false');
    }
    function hideAudioGate(){
      if(!audioGate) return;
      audioGate.classList.remove('show');
      audioGate.setAttribute('aria-hidden','true');
    }

    // Tenta iniciar automaticamente (se estiver marcado como ligado). Se o navegador bloquear, mostra "Ativar som".
    document.addEventListener('DOMContentLoaded', async () => {
      let desiredOn = true;
      try{
        const saved = localStorage.getItem('rdp_waves_on');
        if(saved === null){ localStorage.setItem('rdp_waves_on','1'); }
        desiredOn = localStorage.getItem('rdp_waves_on') === '1';
      }catch(_){ desiredOn = true; }

      if(desiredOn){
        try{
          await startWaves();
          hideAudioGate();
          try{ localStorage.setItem('rdp_waves_on','1'); }catch(_){}
        }catch(err){
          // Não dá pra tocar sem gesto do usuário em alguns navegadores
          showAudioGate();
        }
      }
    });

}catch(_){}

    async function ensureCtxReady(force=false){
      if(!waveCtx){
        waveCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      try{ await waveCtx.resume(); }catch(_){}
      if(force && waveCtx.state !== 'running'){
        throw new Error('AudioContext blocked until user gesture');
      }
    }

    // Destrava o áudio na primeira interação do usuário (clique/toque/tecla)
    let unlockedOnce = false;
    async function unlockOnce(){
      if(unlockedOnce) return;
      unlockedOnce = true;
      try{ await ensureCtxReady(true); }catch(_){}
      // Se o usuário já tinha deixado ligado antes, iniciamos agora
      try{
        const saved = localStorage.getItem('rdp_waves_on');
        if(saved === '1') await startWaves();
      }catch(_){}
    }
    window.addEventListener('pointerdown', unlockOnce, {once:true, passive:true});
    window.addEventListener('keydown', unlockOnce, {once:true});


    function setSoundUI(on){
      waveOn = on;
      if(soundBtn) soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if(soundState) soundState.textContent = on ? 'On' : 'Off';
      if(soundState){
        soundState.style.background = on ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.10)';
        soundState.style.borderColor = on ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.25)';
      }
    }

    function createBrownNoiseBuffer(ctx){
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 2));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 3.5;
      }
      return buffer;
    }

    async function startWaves(){
      if(waveSrc && waveCtx) return;
      await ensureCtxReady(true);

      waveSrc = waveCtx.createBufferSource();
      waveSrc.buffer = createBrownNoiseBuffer(waveCtx);
      waveSrc.loop = true;

      waveFilter = waveCtx.createBiquadFilter();
      waveFilter.type = 'lowpass';
      waveFilter.frequency.value = 700;

      waveGain = waveCtx.createGain();
      waveGain.gain.value = 0.0001;

      waveLfo = waveCtx.createOscillator();
      waveLfo.type = 'sine';
      waveLfo.frequency.value = 0.12;

      waveLfoGain = waveCtx.createGain();
      waveLfoGain.gain.value = 0.20;

      waveLfo.connect(waveLfoGain).connect(waveGain.gain);

      waveSrc.connect(waveFilter).connect(waveGain).connect(waveCtx.destination);

      waveSrc.start();
      waveLfo.start();

      const baseVol = (soundVol ? Number(soundVol.value) : 35) / 100;
      waveGain.gain.setTargetAtTime(Math.max(0.04, baseVol * 0.28), waveCtx.currentTime, 0.25);
      setSoundUI(true);
    }

    async function stopWaves(){
      if(!waveCtx) return;
      try{
        waveGain.gain.setTargetAtTime(0.0001, waveCtx.currentTime, 0.15);
        setSoundUI(false);
        setTimeout(async () => {
          try{ waveSrc && waveSrc.stop(); waveLfo && waveLfo.stop(); }catch(_){ }
          try{ await waveCtx.close(); }catch(_){ }
          waveCtx = null; waveSrc = null; waveGain = null; waveLfo = null; waveLfoGain = null; waveFilter = null;
        }, 450);
      }catch(_){
        try{ await waveCtx.close(); }catch(__){ }
        waveCtx = null;
      }
    }

    function toggleSoundPanel(){
      if(!soundPanel) return;
      soundPanel.classList.toggle('open');
      soundPanel.setAttribute('aria-hidden', soundPanel.classList.contains('open') ? 'false' : 'true');
    }

    if(soundBtn){
      soundBtn.addEventListener('click', async () => {
        // Primeiro garante que o contexto esteja liberado
        try{ await unlockOnce(); }catch(_){}
        toggleSoundPanel();
        if(!waveOn){
          try{
            await startWaves();
            hideAudioGate();
            try{ localStorage.setItem('rdp_waves_on','1'); }catch(_){}
          }catch(err){
            console.warn('Audio bloqueado/erro:', err);
            // Feedback leve no UI
            if(soundState) soundState.textContent = 'Tap';
          }
        }else{
          await stopWaves();
          try{ localStorage.setItem('rdp_waves_on','0'); }catch(_){}
        }
      });
    }

    
    if(audioGate){
      audioGate.addEventListener('click', async () => {
        try{ await unlockOnce(); }catch(_){}
        try{
          await startWaves();
          hideAudioGate();
          try{ localStorage.setItem('rdp_waves_on','1'); }catch(_){}
        }catch(err){
          console.warn('Ainda bloqueado:', err);
        }
      });
    }

if(soundVol){
      soundVol.addEventListener('input', () => {
        const v = Number(soundVol.value) / 100;
        if(waveCtx && waveGain){
          const target = Math.max(0.02, v * 0.28);
          waveGain.gain.setTargetAtTime(target, waveCtx.currentTime, 0.08);
        }
      });
    }

    document.addEventListener('click', (e) => {
      if(!soundPanel || !soundPanel.classList.contains('open')) return;
      if(e.target === soundBtn || (soundBtn && soundBtn.contains(e.target))) return;
      if(soundPanel.contains(e.target)) return;
      soundPanel.classList.remove('open');
      soundPanel.setAttribute('aria-hidden','true');
    });

  
    // ================== GOOGLE REVIEWS (sem dado fake) ==================
    const googleUrl = (CONFIG.GOOGLE_REVIEWS_URL || "").trim();
    const googleOpen = document.getElementById('googleReviewsOpen');
    const googlePill = document.getElementById('googlePill');
    const embed = document.getElementById('googlePlaceEmbed');

    if (googleOpen && googleUrl) googleOpen.href = googleUrl;
    if (googlePill && googleUrl) googlePill.href = googleUrl;

    // Embed do Google Maps (sem API key)
    if (embed) {
      // Usa o endereço configurado para garantir o ponto certo
      const q = encodeURIComponent(CONFIG.ADDRESS || CONFIG.PLACE_QUERY || "Na Praia São José dos Pinhais");
      embed.src = 'https://www.google.com/maps?q=' + q + '&output=embed';
    }

    // Se você colocar sua chave do Maps + Places, puxamos nota e comentários automaticamente.
    

    // (Avaliações do Google removidas a pedido)



  // ======= RESERVA (BACKEND + GOOGLE CALENDAR) =======
let RESERVA_SELECIONADA = null;
let SLOTS_REQ_TOKEN = 0;
let SLOTS_ABORT = null;


function abrirReservaModal(){
  try{ aquecerBackend(); }catch(e){}
  const modal = document.getElementById('reservaModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';

  // prepara data mínima/máxima e padrão (hoje)
  const inp = document.getElementById('reservaData');
  const hoje = new Date();
  const pad = (n)=>String(n).padStart(2,'0');
  const isoHoje = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;
  inp.min = isoHoje;
  const max = new Date(hoje.getTime() + 1000*60*60*24*60); // +60 dias
  inp.max = `${max.getFullYear()}-${pad(max.getMonth()+1)}-${pad(max.getDate())}`;
  if(!inp.value) inp.value = isoHoje;

  // limpa estado
  limparSelecao(true);
}

function fecharReservaModal(){
  const modal = document.getElementById('reservaModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

function abrirWhatsReserva(){
  // mensagem pronta para reservas
  const data = document.getElementById('reservaData')?.value || '';
  const dur = document.getElementById('reservaDuracao')?.value || '60';
  const durTxt = (dur==='120') ? '2 horas' : '1 hora';
  const msg = `Oi! Quero reservar locação avulsa na República da Praia. Data: ${data || '—'} | Duração: ${durTxt}. Pode me passar os horários disponíveis?`;
  abrirWhats(msg);
}

function setSlotsStatus(txt, ok=true){
  const el = document.getElementById('slotsStatus');
  if(!el) return;
  el.textContent = txt || '';
  el.style.borderColor = ok ? 'rgba(0,83,166,0.18)' : 'rgba(239,68,68,0.35)';
  el.style.background = ok ? 'rgba(0,83,166,0.06)' : 'rgba(239,68,68,0.08)';
  }

async function carregarSlots(){
  const btnVer = document.getElementById('btnVerHorarios');
  const date = document.getElementById('reservaData').value;
  const dur = document.getElementById('reservaDuracao').value;
  const hint = document.getElementById('slotsHint');
  const cont = document.getElementById('slotsContainer');

  // Evita duplicar resultados quando o usuário clica várias vezes (corrige “race condition”)
  const token = ++SLOTS_REQ_TOKEN;
  try{
    if(SLOTS_ABORT){ try{ SLOTS_ABORT.abort(); }catch(e){} }
    SLOTS_ABORT = ('AbortController' in window) ? new AbortController() : null;
  }catch(e){ SLOTS_ABORT = null; }
  const signal = SLOTS_ABORT ? SLOTS_ABORT.signal : undefined;

  // trava o botão enquanto carrega
  if(btnVer){
    btnVer.disabled = true;
    if(!btnVer.dataset.origText) btnVer.dataset.origText = (btnVer.textContent || 'Ver horários').trim();
    btnVer.textContent = 'Carregando…';
  }

  cont.innerHTML = '';
  setSlotsStatus('Carregando…');
  if(hint) hint.textContent = `Buscando horários para ${date} (${dur==='120'?'2h':'1h'})`;

  try{
    const base = (CONFIG && CONFIG.API_BASE) ? CONFIG.API_BASE.replace(/\/$/,'') : '';
    const url = `${base}/api/slots?date=${encodeURIComponent(date)}&duration=${encodeURIComponent(dur)}`;
    const r = await fetch(url, { method:'GET', signal });
    const data = await r.json();

    // se outra requisição mais nova já começou, ignora esta
    if(token !== SLOTS_REQ_TOKEN) return;

    if(!r.ok) throw new Error(data?.error || 'Falha ao buscar horários.');

    const slots = data.slots || [];
    if(!slots.length){
      setSlotsStatus('Sem horários');
      if(hint) hint.textContent = 'Nenhum horário disponível para essa data.';
      return;
    }

    slots.forEach(s=>{
      // se outra requisição mais nova já começou, para de renderizar
      if(token !== SLOTS_REQ_TOKEN) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.disabled = !(s.availableCourts > 0);
      btn.innerHTML = `
        <div class="slot-time">${s.start}–${s.end}</div>
        <div class="slot-meta">${s.availableCourts} quadra(s) disponível(is)</div>
      `;
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.slot-btn').forEach(x=>x.classList.remove('selected'));
        btn.classList.add('selected');
        RESERVA_SELECIONADA = { date, duration: Number(dur), start: s.start, end: s.end };
        document.getElementById('reservaForm').style.display = 'block';
        const res = document.getElementById('reservaResultado');
        res.textContent = `Selecionado: ${s.start}–${s.end} (${dur==='120'?'2h':'1h'}). Preencha seus dados e confirme.`;
      });
      cont.appendChild(btn);
    });

    const disponiveis = slots.filter(s=>s.availableCourts>0).length;
    setSlotsStatus(`${disponiveis} horário(s) com vaga`);
  }catch(e){
    // abort é normal quando o usuário clica de novo
    if(e && (e.name === 'AbortError')) return;
    if(token !== SLOTS_REQ_TOKEN) return;

    setSlotsStatus('Erro');
    if(hint) hint.textContent = 'Não foi possível carregar horários agora. Tente novamente.';
  }finally{
    // só libera o botão se esta ainda for a requisição mais recente
    if(token === SLOTS_REQ_TOKEN && btnVer){
      btnVer.disabled = false;
      btnVer.textContent = btnVer.dataset.origText || 'Ver horários';
    }
  }
}


// Atualiza horários automaticamente ao trocar Data ou Duração (sem precisar clicar em “Ver horários”)
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('reservaModal');
  const inpData = document.getElementById('reservaData');
  const selDur = document.getElementById('reservaDuracao');
  if(!modal || !inpData || !selDur) return;

  const autoRefresh = () => {
    // só faz sentido quando o modal está aberto e há data selecionada
    if(!modal.classList.contains('open')) return;
    if(!inpData.value) return;

    // limpa seleção/form e recarrega os slots para a nova duração/data
    try{ limparSelecao(true); }catch(e){}
    try{ carregarSlots(); }catch(e){}
  };

  selDur.addEventListener('change', autoRefresh);
  inpData.addEventListener('change', autoRefresh);
});

function limparSelecao(silencioso=false){
  RESERVA_SELECIONADA = null;
  const cont = document.getElementById('slotsContainer');
  if(cont) cont.innerHTML = '';
  const form = document.getElementById('reservaForm');
  if(form) form.style.display = 'none';
  const res = document.getElementById('reservaResultado');
  if(res) res.textContent = '';
  if(!silencioso){
    setSlotsStatus('');
    const hint = document.getElementById('slotsHint');
    if(hint) hint.textContent = 'Selecione a data e clique em “Ver horários”.';
  }else{
    setSlotsStatus('');
  }
}

async function confirmarReserva(){
  if(!RESERVA_SELECIONADA){ alert('Selecione um horário primeiro.'); return; }
  if(!AUTH_USER || !AUTH_USER.name || !AUTH_USER.phone){
    const resBox = document.getElementById('reservaResultado');
    if(resBox) resBox.innerHTML = '<strong>Login obrigatório.</strong><br>Entre ou crie sua conta para confirmar a reserva.';
    window.location.href = 'auth.html';
    return;
  }
  const nome = String(AUTH_USER.name||'').trim();
  const fone = String(AUTH_USER.phone||'').trim();
  const res = document.getElementById('reservaResultado');
  res.textContent = 'Confirmando reserva…';
  try{
    const base = (CONFIG && CONFIG.API_BASE) ? CONFIG.API_BASE.replace(/\/$/,'') : '';
    const r = await fetch(`${base}/api/book`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...RESERVA_SELECIONADA, name:nome, phone:fone }) });
    const data = await r.json();
    if(!r.ok) throw new Error(data?.error || 'Não foi possível reservar.');
    res.innerHTML = `<strong>Reserva confirmada!</strong><br>${data.start}–${data.end} • <strong>${data.court}</strong><br>Conta: ${escapeHtml(nome)} • Whats: ${escapeHtml(fone)}<br><span style="opacity:.9">Sua reserva ficou vinculada à sua conta ✅</span>`;
  }catch(e){
    res.innerHTML = `<strong style="color:#b91c1c">Não deu certo.</strong><br>${escapeHtml(String(e.message || e))}`;
    console.error(e);
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}



/* ===========================
   GALERIA (Cards + Overlay)
=========================== */
let GALLERY_IMAGES = ["assets/galeria/galeria-01.jpeg", "assets/galeria/galeria-02.jpeg", "assets/galeria/galeria-03.jpeg", "assets/galeria/galeria-04.jpeg", "assets/galeria/galeria-05.jpeg", "assets/galeria/galeria-06.jpeg", "assets/galeria/galeria-07.jpeg", "assets/galeria/galeria-08.jpeg", "assets/galeria/galeria-09.jpeg", "assets/galeria/galeria-10.jpeg"];
let GALLERY_CAPTIONS = [];
let GALLERY_INDEX = 0;

function gqs(sel){ return document.querySelector(sel); }
function gqsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function galleryShow(index){
  const img = gqs('#gOverlayImg');
  const counter = gqs('#gCounter');
  const thumbs = gqsa('.g-thumb');

  const total = GALLERY_IMAGES.length;
  const i = (index + total) % total;
  GALLERY_INDEX = i;

  if(img) img.src = GALLERY_IMAGES[i];
  if(counter) counter.textContent = `${i+1}/${total}`;

  thumbs.forEach((t, idx)=> t.classList.toggle('active', idx===i));

  // garante que a thumb ativa fique visível
  const activeThumb = thumbs[i];
  const thumbsWrap = gqs('#gThumbs');
  if(activeThumb && thumbsWrap){
    const a = activeThumb.getBoundingClientRect();
    const w = thumbsWrap.getBoundingClientRect();
    if(a.left < w.left || a.right > w.right){
      activeThumb.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    }
  }

  // animação suave do swap
  if(img){
    img.style.opacity = '0';
    requestAnimationFrame(()=>{ img.style.opacity = '1'; });
  }
}

function galleryOpen(index){
  const overlay = gqs('#gOverlay');
  if(!overlay) return;

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';

  galleryShow(index);
}

function galleryClose(){
  const overlay = gqs('#gOverlay');
  if(!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
}

function galleryPrev(){ galleryShow(GALLERY_INDEX - 1); }
function galleryNext(){ galleryShow(GALLERY_INDEX + 1); }

function galleryUpdateActiveCard(){
  const track = gqs('#gTrack');
  if(!track) return;
  const cards = gqsa('#gTrack .g-card');
  if(!cards.length) return;

  const trackRect = track.getBoundingClientRect();
  const centerX = trackRect.left + trackRect.width/2;

  let bestIdx = 0;
  let bestDist = Infinity;

  cards.forEach((card, idx)=>{
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width/2;
    const dist = Math.abs(cx - centerX);
    if(dist < bestDist){ bestDist = dist; bestIdx = idx; }
  });

  cards.forEach((card, idx)=> card.classList.toggle('active', idx===bestIdx));
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Cards: clique abre overlay
  const track = gqs('#gTrack');
  if(track){
    track.addEventListener('scroll', ()=> {
      window.requestAnimationFrame(galleryUpdateActiveCard);
    }, {passive:true});
    window.addEventListener('resize', ()=> window.requestAnimationFrame(galleryUpdateActiveCard));
    window.requestAnimationFrame(galleryUpdateActiveCard);
  }

  if(track) track.addEventListener('click', e=>{const btn=e.target.closest('.g-card');if(btn)galleryOpen(Number(btn.dataset.index||0));});

  // Thumbs: cria dinamicamente
  const thumbsWrap = gqs('#gThumbs');
  if(thumbsWrap){
    thumbsWrap.innerHTML = '';
    GALLERY_IMAGES.forEach((src, idx)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-thumb' + (idx===0 ? ' active' : '');
      b.setAttribute('aria-label', `Abrir miniatura ${idx+1}`);
      b.innerHTML = `<img loading="lazy" src="${src}" alt="Miniatura ${idx+1}">`;
      b.addEventListener('click', ()=> galleryShow(idx));
      thumbsWrap.appendChild(b);
    });
  }

  document.addEventListener('republica:site-settings-loaded', event=>{
    const photos=event.detail?.gallery;
    if(!Array.isArray(photos)||!photos.length)return;
    GALLERY_IMAGES=photos.map(photo=>photo.src);
    GALLERY_CAPTIONS=photos.map(photo=>photo.caption||'República da Praia');
    const galleryTrack=gqs('#gTrack');
    if(galleryTrack)galleryTrack.innerHTML=photos.map((photo,idx)=>`<button class="g-card" type="button" data-index="${idx}" aria-label="Abrir foto ${idx+1}"><img loading="lazy" src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.caption||`Galeria ${idx+1}`)} — República da Praia"><div class="g-cap"><div class="g-title">${escapeHtml(photo.caption||`Foto ${idx+1}`)}</div><div class="g-chip">📸 ${idx+1}/${photos.length}</div></div></button>`).join('');
    if(thumbsWrap){thumbsWrap.innerHTML='';GALLERY_IMAGES.forEach((src,idx)=>{const b=document.createElement('button');b.type='button';b.className='g-thumb'+(idx===0?' active':'');b.setAttribute('aria-label',`Abrir miniatura ${idx+1}`);b.innerHTML=`<img loading="lazy" src="${escapeHtml(src)}" alt="Miniatura ${idx+1}">`;b.addEventListener('click',()=>galleryShow(idx));thumbsWrap.appendChild(b);});}
    GALLERY_INDEX=0;galleryUpdateActiveCard();
  });

  // Overlay events
  const backdrop = gqs('#gOverlayBackdrop');
  const closeBtn = gqs('#gClose');
  const prevBtn = gqs('#gPrev');
  const nextBtn = gqs('#gNext');
  if(backdrop) backdrop.addEventListener('click', galleryClose);
  if(closeBtn) closeBtn.addEventListener('click', galleryClose);
  if(prevBtn) prevBtn.addEventListener('click', galleryPrev);
  if(nextBtn) nextBtn.addEventListener('click', galleryNext);

  document.addEventListener('keydown', (e)=>{
    const overlay = gqs('#gOverlay');
    if(!overlay || !overlay.classList.contains('open')) return;

    if(e.key === 'Escape') galleryClose();
    if(e.key === 'ArrowLeft') galleryPrev();
    if(e.key === 'ArrowRight') galleryNext();
  });

  // Swipe no mobile (na área da imagem)
  const stage = gqs('.g-overlay-stage');
  if(stage){
    let startX = 0;
    let dragging = false;

    stage.addEventListener('pointerdown', (e)=>{
      dragging = true;
      startX = e.clientX || 0;
      stage.setPointerCapture?.(e.pointerId);
    });

    const end = (e)=>{
      if(!dragging) return;
      dragging = false;
      const dx = (e.clientX || 0) - startX;
      if(Math.abs(dx) > 60){
        if(dx > 0) galleryPrev();
        else galleryNext();
      }
    };

    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', ()=>{ dragging=false; });
  }
});


// =========================
// Cancelamento (somente telefone)
// =========================
function getCancelPhoneDigits(){
  if(AUTH_USER && AUTH_USER.phone){ const el0 = document.getElementById('cancelPhone'); if(el0 && !el0.value) el0.value = AUTH_USER.phone; }
  const el = document.getElementById('cancelPhone');
  const v = el ? el.value : '';
  return String(v||'').replace(/\D+/g,'');
}

async function buscarReservasPorTelefone(){
  const phoneDigits = getCancelPhoneDigits();
  const status = document.getElementById('cancelStatus');
  const list = document.getElementById('cancelList');
  if(status) status.textContent = '';
  if(list) list.innerHTML = '';

  if(!phoneDigits){
    if(status) status.textContent = 'Informe seu WhatsApp para buscar suas reservas.';
    return;
  }

  try{
    if(status) status.textContent = 'Buscando suas reservas...';
    const res = await fetch(`${API_BASE}/api/cancel_lookup`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ phone: phoneDigits })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      if(status) status.textContent = data.error || 'Não foi possível buscar.';
      return;
    }

    const reservations = Array.isArray(data.reservations) ? data.reservations : [];
    if(!reservations.length){
      if(status) status.textContent = 'Nenhuma reserva encontrada para esse telefone.';
      return;
    }

    if(status) status.textContent = `Encontrei ${reservations.length} reserva(s). Estas são as suas próximas reservas:`;

    const frag = document.createDocumentFragment();
    reservations.forEach(r=>{
      const card = document.createElement('div');
      card.className = 'slot';
      card.style.cursor = 'default';
      card.innerHTML = `
        <div class="cancel-left">
          <div class="cancel-title">${r.start}–${r.end}</div>
          <div class="cancel-sub">${r.date}${r.court ? ' • ' + r.court : ''}</div>
        </div>
        <div class="cancel-cta"><span class="dot"></span>Confirmada</div>
      `;
      frag.appendChild(card);
    });
    if(list) list.appendChild(frag);

  }catch(e){
    console.error(e);
    if(status) status.textContent = 'Erro ao buscar reservas.';
  }
}

async function cancelarProximaReserva(){
  const phoneDigits = getCancelPhoneDigits();
  const status = document.getElementById('cancelStatus');
  const list = document.getElementById('cancelList');
  if(list) list.innerHTML = '';
  if(!phoneDigits){
    if(status) status.textContent = 'Informe seu WhatsApp para cancelar.';
    return;
  }
  const ok = confirm('Cancelar a sua PRÓXIMA reserva?');
  if(!ok) return;

  try{
    if(status) status.textContent = 'Cancelando...';
    const res = await fetch(`${API_BASE}/api/cancel_by_phone`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ phone: phoneDigits })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      if(status) status.textContent = data.error || 'Não foi possível cancelar.';
      return;
    }
    if(status) status.textContent = 'Reserva cancelada ✅';
    // atualiza lista
    setTimeout(buscarReservasPorTelefone, 500);
    // refresca slots caso o modal esteja aberto
    if(document.getElementById('reservaModal')?.getAttribute('aria-hidden') === 'false'){
      try{ await carregarSlots(); }catch(_){}
    }
  }catch(e){
    console.error(e);
    if(status) status.textContent = 'Erro ao cancelar.';
  }
}

async function cancelarReservaPorEventId(eventId){
  const phoneDigits = getCancelPhoneDigits();
  const status = document.getElementById('cancelStatus');
  if(!phoneDigits){
    if(status) status.textContent = 'Informe seu WhatsApp para cancelar.';
    return;
  }
  const ok = confirm('Tem certeza que deseja cancelar essa reserva?');
  if(!ok) return;

  try{
    if(status) status.textContent = 'Cancelando...';
    const res = await fetch(`${API_BASE}/api/cancel_by_phone`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ phone: phoneDigits, eventId })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      if(status) status.textContent = data.error || 'Não foi possível cancelar.';
      return;
    }
    if(status) status.textContent = 'Reserva cancelada ✅';
    setTimeout(buscarReservasPorTelefone, 500);
    if(document.getElementById('reservaModal')?.getAttribute('aria-hidden') === 'false'){
      try{ await carregarSlots(); }catch(_){}
    }
  }catch(e){
    console.error(e);
    if(status) status.textContent = 'Erro ao cancelar.';
  }
}


// =========================
// Auth (cadastro/login)
// =========================
function authDigits(v){ return String(v||'').replace(/\D+/g,''); }
function loadAuthUser(){ try{ AUTH_USER = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); }catch(e){ AUTH_USER=null; } applyAuthUI(); }
function saveAuthUser(user){ AUTH_USER=user||null; try{ AUTH_USER ? localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(AUTH_USER)) : localStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){} applyAuthUI(); }

  const authBtn = document.getElementById('btnAuthOpen'); if(authBtn){ authBtn.addEventListener('click', ()=>{ window.location.href = (AUTH_USER ? 'usuario.html' : 'auth.html'); }); }
function applyAuthUI(){
  const info=document.getElementById('authUserInfo'), req=document.getElementById('authRequiredBox'), usr=document.getElementById('authUserBox'), btn=document.getElementById('btnAuthOpen'), phone=document.getElementById('cancelPhone'), greet=document.getElementById('navUserGreet');
  if(AUTH_USER){
    const nome = String(AUTH_USER.name||'').trim();
    const primeiroNome = nome ? nome.split(/\s+/)[0] : 'Cliente';
    if(info) info.textContent = `${AUTH_USER.name} • ${AUTH_USER.phone}`;
    if(req) req.style.display='none';
    if(usr) usr.style.display='block';
    if(btn) btn.textContent='Minha conta';
    if(greet){ greet.innerHTML = `<strong>Olá,</strong> ${primeiroNome}`; greet.style.display='inline-flex'; greet.title = nome || ''; }
    if(phone && !phone.value) phone.value = AUTH_USER.phone || '';
  }else{
    if(info) info.textContent='';
    if(req) req.style.display='block';
    if(usr) usr.style.display='none';
    if(btn) btn.textContent='Entrar / Cadastrar';
    if(greet){ greet.style.display='none'; greet.textContent=''; }
  }
}
function setAuthTab(mode){
  const isLogin = mode !== 'register';
  const lf=document.getElementById('authLoginForm'), rf=document.getElementById('authRegisterForm'), tl=document.getElementById('authTabLogin'), tr=document.getElementById('authTabRegister'), st=document.getElementById('authStatus');
  if(st) st.textContent='';
  if(lf) lf.style.display=isLogin?'block':'none';
  if(rf) rf.style.display=isLogin?'none':'block';
  if(tl){ tl.classList.toggle('btn-primary',isLogin); tl.classList.toggle('btn-outline',!isLogin); }
  if(tr){ tr.classList.toggle('btn-primary',!isLogin); tr.classList.toggle('btn-outline',isLogin); }
}
function abrirAuthModal(mode='login'){ window.location.href = mode==='register' ? 'auth.html#cadastro' : 'auth.html'; }
function fecharAuthModal(){ const m=document.getElementById('authModal'); if(!m) return; m.classList.remove('open'); m.style.display='none'; m.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
function logoutConta(){ saveAuthUser(null); }
async function authRegister(){
  const st=document.getElementById('authStatus');
  try{
    if(st) st.textContent='Criando conta...';
    const payload={ name:document.getElementById('authRegName')?.value?.trim(), phone:authDigits(document.getElementById('authRegPhone')?.value), email:document.getElementById('authRegEmail')?.value?.trim(), password:document.getElementById('authRegPass')?.value||'' };
    const r=await fetch(`${API_BASE}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Erro ao criar conta');
    saveAuthUser(data.user); if(st) st.textContent='Conta criada ✅'; setTimeout(fecharAuthModal,400);
  }catch(e){ if(st) st.textContent=String(e.message||e); }
}
async function authLogin(){
  const st=document.getElementById('authStatus'); const login=(document.getElementById('authLoginUser')?.value||'').trim(); const password=document.getElementById('authLoginPass')?.value||'';
  try{
    if(st) st.textContent='Entrando...';
    const r=await fetch(`${API_BASE}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,email:login,phone:authDigits(login),password})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Erro no login');
    saveAuthUser(data.user); if(st) st.textContent='Login realizado ✅'; setTimeout(fecharAuthModal,300);
  }catch(e){ if(st) st.textContent=String(e.message||e); }
}
window.abrirAuthModal = abrirAuthModal;
window.fecharAuthModal = fecharAuthModal;
window.logoutConta = logoutConta;

// ===== Inline JS extraído =====

(function(){
  function $(id){ return document.getElementById(id); }

  function openCancel(){
    const modal = $('cancelModal');
    if(!modal){ console.warn('cancelModal não encontrado'); return; }
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    setTimeout(()=>{ try{ $('cancelPhone')?.focus(); }catch(e){} }, 30);
  }

  function closeCancel(){
    const modal = $('cancelModal');
    if(!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  }

  window.abrirCancelModal = openCancel;
  window.fecharCancelModal = closeCancel;

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      const modal = $('cancelModal');
      if(modal && modal.getAttribute('aria-hidden') === 'false') closeCancel();
    }
  });

  function safeBind(){
    $('btnCancelOpen')?.addEventListener('click', openCancel);
    $('btnAuthOpen')?.addEventListener('click', ()=>window.abrirAuthModal?.('login'));
    $('authTabLogin')?.addEventListener('click', ()=>setAuthTab('login'));
    $('authTabRegister')?.addEventListener('click', ()=>setAuthTab('register'));
    $('btnDoLogin')?.addEventListener('click', ()=>authLogin());
    $('btnDoRegister')?.addEventListener('click', ()=>authRegister());
    $('btnCancelLookup')?.addEventListener('click', ()=>window.buscarReservasPorTelefone?.());
    $('btnCancelNext')?.addEventListener('click', ()=>window.cancelarProximaReserva?.());
  }

  function boot(){ try{ loadAuthUser(); }catch(e){} safeBind(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
