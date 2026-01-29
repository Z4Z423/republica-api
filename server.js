import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';

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
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

if (SA_PRIVATE_KEY) {
  // Render/Heroku geralmente guardam com \n literal
  SA_PRIVATE_KEY = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
}

function requireEnv(){
  const missing = [];
  if(!CALENDAR_ID) missing.push('GOOGLE_CALENDAR_ID');
  if(!SA_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if(!SA_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
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

// Converte "YYYY-MM-DD" + "HH:MM" para ISO com timezone (Google aceita offset via dateTime)
function toDateTimeISO(dateStr, timeStr){
  // Usa "YYYY-MM-DDTHH:MM:00" e deixa o Google interpretar no TZ informado no request
  return `${dateStr}T${timeStr}:00`;
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
    slots.push({
      start: `${pad(sh)}:${pad(sm)}`,
      end: `${pad(eh)}:${pad(em)}`
    });
  }
  return slots;
}

function overlaps(aStart, aEnd, bStart, bEnd){
  return (aStart < bEnd) && (bStart < aEnd);
}

function classifyEventToCourts(summary=''){
  const s = summary.toLowerCase();
  const q1 = s.includes('quadra 1') || s.includes('q1') || s.includes('quadra1');
  const q2 = s.includes('quadra 2') || s.includes('q2') || s.includes('quadra2');

  if(q1 && !q2) return { blockBoth:false, courts:[1] };
  if(q2 && !q1) return { blockBoth:false, courts:[2] };
  if(q1 && q2) return { blockBoth:true, courts:[1,2] };

  // Se não indicar quadra, por segurança bloqueia as duas (pode ser aula/evento)
  return { blockBoth:true, courts:[1,2] };
}

async function listEventsForDay(dateStr){
  // busca eventos do dia inteiro (00:00 a 23:59) no TZ
  const timeMin = new Date(`${dateStr}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59`).toISOString();

  const resp = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return (resp.data.items || []).map(ev => ({
    id: ev.id,
    summary: ev.summary || '',
    start: ev.start?.dateTime || ev.start?.date, // dateTime preferido
    end: ev.end?.dateTime || ev.end?.date
  }));
}

// Converte dateTime ISO para minutos desde 00:00 na data do slot.
// Para simplificar, usamos o texto "HH:MM" extraído do start/end se for dateTime.
function isoToMinutes(iso){
  // iso pode vir com timezone; pega HH:MM do string (funciona para formato 2026-01-29T18:00:00-03:00)
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  if(!m) return 0;
  return Number(m[1])*60 + Number(m[2]);
}

function computeAvailability(events, duration){
  const baseSlots = generateSlots(duration);
  const out = baseSlots.map(s => ({
    ...s,
    availableCourts: 2
  }));

  for(const slot of out){
    const slotStartMin = Number(slot.start.split(':')[0])*60 + Number(slot.start.split(':')[1]);
    const slotEndMin = Number(slot.end.split(':')[0])*60 + Number(slot.end.split(':')[1]);

    // começa com as duas quadras livres
    let free = new Set([1,2]);

    for(const ev of events){
      // ignora eventos all-day (sem horário) — se existir, deve bloquear tudo
      if(String(ev.start).length <= 10) {
        free = new Set(); 
        break;
      }

      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);

      if(overlaps(slotStartMin, slotEndMin, evStartMin, evEndMin)){
        const cls = classifyEventToCourts(ev.summary);
        if(cls.blockBoth){
          free = new Set();
          break;
        }else{
          cls.courts.forEach(c => free.delete(c));
        }
      }
    }

    slot.availableCourts = free.size;
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

    // calcula end
    const startMin = Number(start.split(':')[0])*60 + Number(start.split(':')[1]);
    const endMin = startMin + dur;
    const endH = Math.floor(endMin/60);
    const endM = endMin%60;
    const end = `${pad(endH)}:${pad(endM)}`;

    await ensureAuth();
    const events = await listEventsForDay(date);

    // Checa disponibilidade e decide quadra
    const slotEvents = events.filter(ev=>{
      if(String(ev.start).length <= 10) return true; // all-day bloqueia
      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);
      return overlaps(startMin, endMin, evStartMin, evEndMin);
    });

    // se tem qualquer evento sem quadra -> bloqueia tudo
    for(const ev of slotEvents){
      const cls = classifyEventToCourts(ev.summary);
      if(cls.blockBoth){
        return res.status(409).json({ error:'Esse horário está indisponível.' });
      }
    }

    const busy = new Set();
    for(const ev of slotEvents){
      const cls = classifyEventToCourts(ev.summary);
      cls.courts.forEach(c => busy.add(c));
    }

    const freeCourts = [1,2].filter(c=>!busy.has(c));
    if(freeCourts.length === 0){
      return res.status(409).json({ error:'Esse horário está lotado (2 quadras ocupadas).' });
    }

    const chosen = freeCourts[0];

    // cria evento no calendário
    const summary = `Locação Avulsa — Quadra ${chosen}`;
    const description = `Cliente: ${name}\nWhatsApp: ${phone}\nDuração: ${dur===120?'2h':'1h'}\nOrigem: site\n`;
    const event = {
      summary,
      description,
      start: { dateTime: toDateTimeISO(date, start), timeZone: TZ },
      end: { dateTime: toDateTimeISO(date, end), timeZone: TZ }
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
      eventId: created.data.id
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'Erro ao criar reserva.' });
  }
});

app.listen(PORT, ()=>{
  console.log(`API rodando na porta ${PORT}`);
});