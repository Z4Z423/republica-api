import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TZ = process.env.BASE_TZ || 'America/Sao_Paulo';

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: function(origin, cb){
    // allow server-to-server / curl without origin
    if(!origin) return cb(null, true);
    if(allowedOrigins.length === 0) return cb(null, true); // permissivo por padrão
    return cb(null, allowedOrigins.includes(origin));
  }
}));

// === Google Calendar auth (Service Account) ===
// Você precisa compartilhar sua agenda com o e-mail da Service Account (permissão "Fazer alterações em eventos")
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID; // ex: napraiasjp@gmail.com ou ID da agenda

// Preferência 1: JSON completo (mais fácil em deploy): GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (base64 do arquivo .json)
let SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

const SA_JSON_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
const SA_JSON_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON; // (opcional) JSON em texto

function loadServiceAccountFromEnv(){
  try{
    let raw = null;
    if(SA_JSON_B64){
      raw = Buffer.from(SA_JSON_B64, 'base64').toString('utf8');
    } else if(SA_JSON_RAW){
      raw = SA_JSON_RAW;
    }
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(obj.client_email) SA_EMAIL = obj.client_email;
    if(obj.private_key) SA_PRIVATE_KEY = obj.private_key;
  }catch(e){
    // se der erro, mantém o modo antigo por env vars
  }
}
loadServiceAccountFromEnv();

if (SA_PRIVATE_KEY) {
  // Render/Heroku geralmente guardam com \n literal
  SA_PRIVATE_KEY = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
}

function requireEnv(){
  const missing = [];
  if(!CALENDAR_ID) missing.push('GOOGLE_CALENDAR_ID');

  // Se você usar GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, não precisa setar EMAIL/KEY separados.
  if(!SA_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL (ou GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)');
  if(!SA_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY (ou GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)');

  return missing;
}

const scopes = ['https://www.googleapis.com/auth/calendar'];
const jwtClient = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_PRIVATE_KEY,
  scopes
});
const calendar = google.calendar({ version:'v3', auth: jwtClient });

function pad(n){ return String(n).padStart(2,'0'); }

// Código curto para cancelamento (mostrado ao cliente e salvo no evento)
function genCancelCode(){
  // 6 caracteres (hex) é fácil pro cliente digitar e suficientemente imprevisível
  return crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();
}

// Converte "YYYY-MM-DD" + "HH:MM" para ISO sem offset.
// O Google usa o timeZone do requestBody para interpretar corretamente.
function toDateTimeISO(dateStr, timeStr){
  return `${dateStr}T${timeStr}:00`;
}

// ====== Regras de disponibilidade ======
// Locação avulsa NÃO disponível em sábado/domingo
function isWeekend(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d, 12, 0, 0)); // meio-dia UTC evita "virar dia" por fuso
  const dow = dt.getUTCDay(); // 0=Dom, 6=Sáb
  return dow === 0 || dow === 6;
}

// Gera lista de slots entre 18:00 e 23:00 (inicio inclusive, fim exclusivo)
function generateSlots(durationMinutes){
  const startHour = 18;
  const endHour = 23;
  const slots = [];
  const lastStart = endHour*60 - durationMinutes;
  for(let t = startHour*60; t <= lastStart; t += 60){
    const sh = Math.floor(t/60), sm = t%60;
    const eh = Math.floor((t+durationMinutes)/60), em = (t+durationMinutes)%60;
    slots.push({ start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` });
  }
  return slots;
}

function overlaps(aStart, aEnd, bStart, bEnd){
  return (aStart < bEnd) && (bStart < aEnd);
}

// ====== Classificação de eventos para quadras ======
// 1) Se o evento tem "Quadra 1/2" (ou Q1/Q2) no título/descrição/local → usa isso.
// 2) Se não tiver, tenta mapear por palavras-chave (configurável).
// 3) Se ainda assim não der, considera "ocupando 1 quadra (desconhecida)".
//    Isso resolve o bug de aparecer 0 quadras quando existe só 1 aula no horário.
let DEFAULT_KEYWORD_MAP = [
  { pattern: 'futevolei|futvolei|futev[oó]lei', court: 1 },
  { pattern: 'v[oó]lei(?!.*fute)', court: 2 },
  { pattern: 'beach\s*tennis|\bbt\b', court: 2 }
];

try{
  if(process.env.COURT_KEYWORDS_JSON){
    const parsed = JSON.parse(process.env.COURT_KEYWORDS_JSON);
    if(Array.isArray(parsed) && parsed.length) DEFAULT_KEYWORD_MAP = parsed;
  }
}catch(e){ /* ignora */ }

function classifyEventToCourts(ev){
  const text = `${ev.summary||''} ${ev.description||''} ${ev.location||''}`.toLowerCase();

  const q1 = text.includes('quadra 1') || text.includes('q1') || text.includes('quadra1');
  const q2 = text.includes('quadra 2') || text.includes('q2') || text.includes('quadra2');

  if(q1 && !q2) return { kind:'known', courts:[1], blockBoth:false };
  if(q2 && !q1) return { kind:'known', courts:[2], blockBoth:false };
  if(q1 && q2) return { kind:'known', courts:[1,2], blockBoth:true };

  // keyword mapping
  for(const rule of DEFAULT_KEYWORD_MAP){
    try{
      const re = new RegExp(rule.pattern, 'i');
      if(re.test(text)){
        const c = Number(rule.court);
        if(c === 1 || c === 2) return { kind:'known', courts:[c], blockBoth:false };
      }
    }catch(e){ /* ignora regra inválida */ }
  }

  // fallback: ocupa 1 quadra sem especificar qual
  return { kind:'unknownSingle', courts:[], blockBoth:false };
}

async function listEventsForDay(dateStr){
  // busca eventos do dia inteiro (00:00 a 23:59) no TZ
  const timeMin = `${dateStr}T00:00:00-03:00`;
  const timeMax = `${dateStr}T23:59:59-03:00`;

  const resp = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    timeZone: TZ,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return (resp.data.items || []).map(ev => ({
    id: ev.id,
    summary: ev.summary || '',
    description: ev.description || '',
    location: ev.location || '',
    start: ev.start?.dateTime || ev.start?.date, // dateTime preferido
    end: ev.end?.dateTime || ev.end?.date
  }));
}

// Converte dateTime ISO para minutos desde 00:00 em TZ.
// - Se ISO já tiver offset (ex.: -03:00), pegamos HH:MM do texto direto (mais fiel).
// - Se vier em UTC (…Z), converte com Intl no fuso TZ.
function isoToMinutes(iso){
  const s = String(iso || '');
  // Caso comum: 2026-02-12T18:00:00-03:00  → usa 18:00 direto
  const mOffset = s.match(/T(\d{2}):(\d{2}).*([+-]\d{2}:?\d{2})$/);
  if(mOffset){
    return Number(mOffset[1]) * 60 + Number(mOffset[2]);
  }

  // Caso UTC: ...Z
  try {
    const d = new Date(s);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    return hh * 60 + mm;
  } catch {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if(!m) return 0;
    return Number(m[1])*60 + Number(m[2]);
  }
}

function computeAvailability(events, duration){
  const baseSlots = generateSlots(duration);
  const out = baseSlots.map(s => ({ ...s, availableCourts: 2 }));

  for(const slot of out){
    const slotStartMin = Number(slot.start.split(':')[0])*60 + Number(slot.start.split(':')[1]);
    const slotEndMin = Number(slot.end.split(':')[0])*60 + Number(slot.end.split(':')[1]);

    let busyKnown = new Set();  // quadras conhecidas ocupadas
    let unknownCount = 0;       // eventos sem quadra definida (ocupam 1 quadra)

    for(const ev of events){
      // all-day bloqueia tudo
      if(String(ev.start).length <= 10) {
        busyKnown = new Set([1,2]);
        unknownCount = 0;
        break;
      }

      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);

      if(overlaps(slotStartMin, slotEndMin, evStartMin, evEndMin)){
        const cls = classifyEventToCourts(ev);

        if(cls.blockBoth){
          busyKnown = new Set([1,2]);
          unknownCount = 0;
          break;
        }

        if(cls.kind === 'known'){
          cls.courts.forEach(c => busyKnown.add(c));
        }else if(cls.kind === 'unknownSingle'){
          unknownCount += 1;
        }
      }
    }

    const remainingAfterKnown = Math.max(0, 2 - busyKnown.size);
    const unknownConsumes = Math.min(unknownCount, remainingAfterKnown);
    slot.availableCourts = Math.max(0, remainingAfterKnown - unknownConsumes);
  }

  return out;
}

async function ensureAuth(){
  // força autenticação (principalmente no primeiro request)
  await jwtClient.authorize();
}

app.get('/health', async (req,res)=>{
  const missing = requireEnv();
  if(missing.length){
    return res.status(500).json({ ok:false, error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
  }
  return res.json({ ok:true });
});

app.get('/api/slots', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const date = String(req.query.date || '');
    const duration = Number(req.query.duration || 60);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error:'date inválida (use YYYY-MM-DD)' });
    if(![60,120].includes(duration)) return res.status(400).json({ error:'duration inválida (60 ou 120)' });

    if(isWeekend(date)){
      return res.json({ date, duration, slots: [] , weekendBlocked:true });
    }

    await ensureAuth();
    const events = await listEventsForDay(date);
    const slots = computeAvailability(events, duration);

    res.json({ date, duration, slots });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar horários.' });
  }
});

app.post('/api/book', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const { date, start, duration, name, phone } = req.body || {};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return res.status(400).json({ error:'date inválida (YYYY-MM-DD)' });
    if(!/^\d{2}:\d{2}$/.test(String(start||''))) return res.status(400).json({ error:'start inválido (HH:MM)' });
    const dur = Number(duration || 60);
    if(![60,120].includes(dur)) return res.status(400).json({ error:'duration inválida (60 ou 120)' });
    if(!String(name||'').trim() || !String(phone||'').trim()) return res.status(400).json({ error:'name e phone são obrigatórios' });

    if(isWeekend(String(date))){
      return res.status(409).json({ error:'Sábado e domingo não possuem locação avulsa.' });
    }

    // calcula end
    const startMin = Number(start.split(':')[0])*60 + Number(start.split(':')[1]);
    const endMin = startMin + dur;
    const endH = Math.floor(endMin/60);
    const endM = endMin%60;
    const end = `${pad(endH)}:${pad(endM)}`;

    await ensureAuth();
    const events = await listEventsForDay(String(date));

    // Eventos que batem com o intervalo
    const slotEvents = events.filter(ev=>{
      if(String(ev.start).length <= 10) return true; // all-day bloqueia
      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);
      return overlaps(startMin, endMin, evStartMin, evEndMin);
    });

    // Se existir all-day => indisponível
    if(slotEvents.some(ev => String(ev.start).length <= 10)){
      return res.status(409).json({ error:'Esse horário está indisponível.' });
    }

    // Calcula ocupação: quadras conhecidas + quantidade de eventos "unknownSingle"
    const busyKnown = new Set();
    let unknownCount = 0;

    for(const ev of slotEvents){
      const cls = classifyEventToCourts(ev);
      if(cls.blockBoth){
        return res.status(409).json({ error:'Esse horário está indisponível.' });
      }
      if(cls.kind === 'known'){
        cls.courts.forEach(c => busyKnown.add(c));
      }else if(cls.kind === 'unknownSingle'){
        unknownCount += 1;
      }
    }

    const totalBusy = Math.min(2, busyKnown.size + unknownCount);
    if(totalBusy >= 2){
      return res.status(409).json({ error:'Esse horário está lotado (2 quadras ocupadas).' });
    }

    // Escolhe uma quadra livre (prioriza a que NÃO está em busyKnown)
    const freeCourts = [1,2].filter(c=>!busyKnown.has(c));
    const chosen = freeCourts[0] ?? 1;

    // cria evento no calendário
    const cancelCode = genCancelCode();
    const summary = `Locação Avulsa — Quadra ${chosen}`;
    const warning = (unknownCount > 0 && busyKnown.size === 0)
      ? '\nObs: havia aula/evento sem quadra definida nesse horário. Confirme com a equipe para evitar conflito.\n'
      : '';
    const description =
      `Cliente: ${name}\nWhatsApp: ${phone}\nDuração: ${dur===120?'2h':'1h'}\nOrigem: site\nCancelCode: ${cancelCode}\n${warning}`;

    const event = {
      summary,
      description,
      start: { dateTime: toDateTimeISO(String(date), String(start)), timeZone: TZ },
      end: { dateTime: toDateTimeISO(String(date), end), timeZone: TZ }
    };

    const created = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event
    });

    return res.json({
      ok:true,
      court: `Quadra ${chosen}`,
      start,
      end,
      eventId: created.data.id,
      cancelCode
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'Erro ao criar reserva.' });
  }
});

// Cancelamento (cliente precisa do eventId + WhatsApp e/ou cancelCode)
app.post('/api/cancel', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const { eventId, phone, cancelCode } = req.body || {};
    if(!String(eventId||'').trim()) return res.status(400).json({ error:'eventId é obrigatório' });
    if(!String(phone||'').trim()) return res.status(400).json({ error:'phone é obrigatório' });

    await ensureAuth();

    // Busca o evento para validar que pertence ao solicitante
    const ev = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: String(eventId) });
    const desc = String(ev?.data?.description || '');
    const phoneOk = desc.toLowerCase().includes(String(phone).trim().toLowerCase());
    if(!phoneOk){
      return res.status(403).json({ error:'Não foi possível validar esse agendamento para este WhatsApp.' });
    }

    // Se houver cancelCode no evento, exige bater (mais seguro)
    const m = desc.match(/CancelCode:\s*([A-Z0-9]{4,12})/i);
    if(m){
      const codeInEvent = String(m[1]||'').trim().toUpperCase();
      const codeReq = String(cancelCode||'').trim().toUpperCase();
      if(!codeReq || codeReq !== codeInEvent){
        return res.status(403).json({ error:'Código de cancelamento inválido.' });
      }
    }

    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: String(eventId) });
    return res.json({ ok:true });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao cancelar reserva.' });
  }
});

app.listen(PORT, ()=>{
  console.log(`API rodando na porta ${PORT}`);
});
