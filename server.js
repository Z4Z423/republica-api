import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TZ = process.env.BASE_TZ || 'America/Sao_Paulo';

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, cb){
    if(!origin) return cb(null, true); // curl / server-to-server
    if(allowedOrigins.length === 0) return cb(null, true); // permissivo por padrão
    return cb(null, allowedOrigins.includes(origin));
  }
}));

// === Google Calendar auth (Service Account) ===
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

let SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

const SA_JSON_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
const SA_JSON_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function loadServiceAccountFromEnv(){
  try{
    let raw = null;
    if(SA_JSON_B64){
      raw = Buffer.from(SA_JSON_B64, 'base64').toString('utf8');
    }else if(SA_JSON_RAW){
      raw = SA_JSON_RAW;
    }
    if(!raw) return;

    const obj = JSON.parse(raw);
    if(obj.client_email) SA_EMAIL = obj.client_email;
    if(obj.private_key) SA_PRIVATE_KEY = obj.private_key;
  }catch(e){
    // fallback para envs separados
  }
}
loadServiceAccountFromEnv();

if (SA_PRIVATE_KEY) {
  SA_PRIVATE_KEY = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
}

function requireEnv(){
  const missing = [];
  if(!CALENDAR_ID) missing.push('GOOGLE_CALENDAR_ID');
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
function normalizePhone(s){ return String(s || '').replace(/\D+/g, ''); }

// =========================
// Arquivos / Auth local
// =========================
const AUTH_SECRET = process.env.AUTH_SECRET || 'troque-essa-chave-no-render';
const USERS_FILE = path.join(process.cwd(), 'users.json');

// =========================
// Admin (somente e-mail + senha)
// =========================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'napraiasjp@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admnapraia#1505';
const ADMIN_TOKEN_TTL_HOURS = 12;

function makeAdminToken(){
  const payload = {
    email: ADMIN_EMAIL,
    exp: Date.now() + ADMIN_TOKEN_TTL_HOURS * 60 * 60 * 1000
  };
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(json).digest('hex');
  return Buffer.from(`${json}.${sig}`).toString('base64url');
}

function verifyAdminToken(token){
  try{
    if(!token) return false;
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const idx = raw.lastIndexOf('.');
    if(idx <= 0) return false;

    const json = raw.slice(0, idx);
    const sig = raw.slice(idx + 1);

    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(json).digest('hex');
    if(sig !== expected) return false;

    const payload = JSON.parse(json);
    if(!payload?.exp || Date.now() > payload.exp) return false;
    if(String(payload.email).toLowerCase() !== String(ADMIN_EMAIL).toLowerCase()) return false;

    return true;
  }catch{
    return false;
  }
}

function adminAuth(req, res, next){
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if(!verifyAdminToken(token)){
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

function readUsers(){
  try{
    if(!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function writeUsers(users){
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function hashPassword(password){
  return crypto
    .createHash('sha256')
    .update(String(password) + '|' + AUTH_SECRET)
    .digest('hex');
}

function makePublicUser(u){
  return { id: u.id, name: u.name, email: u.email, phone: u.phone };
}

function extractPhoneFromEvent(ev){
  const hay = `${ev.summary || ''}\n${ev.description || ''}\n${ev.location || ''}`;
  const m = hay.match(/WhatsApp:\s*([^\n]+)/i);
  if(!m) return '';
  return normalizePhone(m[1]);
}

function extractCustomerFromEvent(ev){
  const desc = String(ev.description || '');
  const m = desc.match(/Cliente:\s*([^\n]+)/i);
  return m ? m[1].trim() : '';
}

async function ensureAuth(){
  await jwtClient.authorize();
}

async function listUpcomingReservationsByPhone(phoneDigits){
  await ensureAuth();

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 120).toISOString();

  const resp = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500
  });

  const items = (resp.data.items || []).map(e => ({
    id: e.id,
    summary: e.summary || '',
    description: e.description || '',
    location: e.location || '',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || ''
  }));

  const out = [];
  for(const ev of items){
    if(!ev.start || String(ev.start).length <= 10) continue; // ignora dia inteiro
    const ph = extractPhoneFromEvent(ev);
    if(!ph) continue;
    if(ph === phoneDigits){
      out.push({
        eventId: ev.id,
        summary: ev.summary,
        start: ev.start,
        end: ev.end
      });
    }
  }
  return out;
}

// Converte "YYYY-MM-DD" + "HH:MM" para ISO sem offset (Google interpreta pelo timeZone)
function toDateTimeISO(dateStr, timeStr){
  return `${dateStr}T${timeStr}:00`;
}

// ====== Regras de disponibilidade ======
function isWeekend(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Dom, 6=Sáb
  return dow === 0 || dow === 6;
}

// Seg-Sex 17:00–23:00 | Sáb-Dom 09:00–19:00
function generateSlots(dateISO, durationMinutes){
  const weekend = isWeekend(String(dateISO || ''));
  const startHour = weekend ? 9 : 17;
  const endHour = weekend ? 19 : 23;

  const slots = [];
  const lastStart = endHour * 60 - durationMinutes;

  for(let t = startHour * 60; t <= lastStart; t += 60){
    const sh = Math.floor(t / 60), sm = t % 60;
    const eh = Math.floor((t + durationMinutes) / 60), em = (t + durationMinutes) % 60;
    slots.push({ start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` });
  }
  return slots;
}

function overlaps(aStart, aEnd, bStart, bEnd){
  return (aStart < bEnd) && (bStart < aEnd);
}

// ====== Classificação de eventos para quadras ======
let DEFAULT_KEYWORD_MAP = [
  { pattern: 'futevolei|futvolei|futev[oó]lei', court: 1 },
  { pattern: 'v[oó]lei(?!.*fute)', court: 2 },
  { pattern: 'beach\\s*tennis|\\bbt\\b', court: 2 }
];

try{
  if(process.env.COURT_KEYWORDS_JSON){
    const parsed = JSON.parse(process.env.COURT_KEYWORDS_JSON);
    if(Array.isArray(parsed) && parsed.length) DEFAULT_KEYWORD_MAP = parsed;
  }
}catch{
  // ignora
}

function classifyEventToCourts(ev){
  const text = `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''}`.toLowerCase();

  const q1 = text.includes('quadra 1') || text.includes('q1') || text.includes('quadra1');
  const q2 = text.includes('quadra 2') || text.includes('q2') || text.includes('quadra2');

  if(q1 && !q2) return { kind:'known', courts:[1], blockBoth:false };
  if(q2 && !q1) return { kind:'known', courts:[2], blockBoth:false };
  if(q1 && q2) return { kind:'known', courts:[1,2], blockBoth:true };

  for(const rule of DEFAULT_KEYWORD_MAP){
    try{
      const re = new RegExp(rule.pattern, 'i');
      if(re.test(text)){
        const c = Number(rule.court);
        if(c === 1 || c === 2) return { kind:'known', courts:[c], blockBoth:false };
      }
    }catch{
      // ignora regra inválida
    }
  }

  return { kind:'unknownSingle', courts:[], blockBoth:false };
}

async function listEventsForDay(dateStr){
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
    start: ev.start?.dateTime || ev.start?.date,
    end: ev.end?.dateTime || ev.end?.date
  }));
}

function isoToMinutes(iso){
  const s = String(iso || '');

  const mOffset = s.match(/T(\d{2}):(\d{2}).*([+-]\d{2}:?\d{2})$/);
  if(mOffset){
    return Number(mOffset[1]) * 60 + Number(mOffset[2]);
  }

  try{
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
  }catch{
    const m = s.match(/T(\d{2}):(\d{2})/);
    if(!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

function computeAvailability(events, duration, date){
  const baseSlots = generateSlots(date, duration);
  const out = baseSlots.map(s => ({ ...s, availableCourts: 2 }));

  for(const slot of out){
    const slotStartMin = Number(slot.start.split(':')[0]) * 60 + Number(slot.start.split(':')[1]);
    const slotEndMin = Number(slot.end.split(':')[0]) * 60 + Number(slot.end.split(':')[1]);

    let busyKnown = new Set();
    let unknownCount = 0;

    for(const ev of events){
      if(String(ev.start).length <= 10){
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

// =========================
// Health
// =========================
app.get('/health', async (req, res) => {
  const missing = requireEnv();
  if(missing.length){
    return res.status(500).json({ ok:false, error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
  }
  return res.json({ ok:true });
});

// =========================
// Horários / Reservas
// =========================
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
    const slots = computeAvailability(events, duration, date);

    res.json({ date, duration, slots });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'Erro ao buscar horários.' });
  }
});

app.post('/api/book', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const { date, start, duration, name, phone } = req.body || {};

    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error:'date inválida (YYYY-MM-DD)' });
    if(!/^\d{2}:\d{2}$/.test(String(start || ''))) return res.status(400).json({ error:'start inválido (HH:MM)' });

    const dur = Number(duration || 60);
    if(![60,120].includes(dur)) return res.status(400).json({ error:'duration inválida (60 ou 120)' });
    if(!String(name || '').trim() || !String(phone || '').trim()) return res.status(400).json({ error:'name e phone são obrigatórios' });

    const startMin = Number(start.split(':')[0]) * 60 + Number(start.split(':')[1]);
    const endMin = startMin + dur;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const end = `${pad(endH)}:${pad(endM)}`;

    const allowedSlots = generateSlots(String(date), dur);
    const isValidSlot = allowedSlots.some(s => s.start === String(start) && s.end === String(end));
    if(!isValidSlot){
      return res.status(400).json({ error:'Horário inválido para esse dia.' });
    }

    await ensureAuth();
    const events = await listEventsForDay(String(date));

    const slotEvents = events.filter(ev => {
      if(String(ev.start).length <= 10) return true;
      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);
      return overlaps(startMin, endMin, evStartMin, evEndMin);
    });

    if(slotEvents.some(ev => String(ev.start).length <= 10)){
      return res.status(409).json({ error:'Esse horário está indisponível.' });
    }

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

    const freeCourts = [1,2].filter(c => !busyKnown.has(c));
    const chosen = freeCourts[0] ?? 1;

    const summary = `Locação Avulsa — Quadra ${chosen}`;
    const warning = (unknownCount > 0 && busyKnown.size === 0)
      ? '\nObs: havia aula/evento sem quadra definida nesse horário. Confirme com a equipe para evitar conflito.\n'
      : '';
    const description = `Cliente: ${name}\nWhatsApp: ${phone}\nDuração: ${dur === 120 ? '2h' : '1h'}\nOrigem: site\n${warning}`;

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
      ok: true,
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

// =========================
// Cancelamento por telefone
// =========================
app.post('/api/cancel_lookup', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const { phone } = req.body || {};
    const phoneDigits = normalizePhone(phone);
    if(!phoneDigits) return res.status(400).json({ error:'phone é obrigatório' });

    const reservations = await listUpcomingReservationsByPhone(phoneDigits);

    if(!reservations.length){
      return res.json({ ok:true, reservations: [] });
    }

    const formatted = reservations.map(r => {
      const date = String(r.start).slice(0,10);
      const hhmm = String(r.start).slice(11,16);
      const ehhmm = String(r.end).slice(11,16);
      const courtMatch = String(r.summary || '').match(/Quadra\s*(\d)/i);

      return {
        eventId: r.eventId,
        date,
        start: hhmm,
        end: ehhmm,
        court: courtMatch ? `Quadra ${courtMatch[1]}` : '',
        summary: r.summary || ''
      };
    });

    return res.json({ ok:true, reservations: formatted });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'Erro ao buscar reservas.' });
  }
});

app.post('/api/cancel_by_phone', async (req,res)=>{
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    const { phone, eventId } = req.body || {};
    const phoneDigits = normalizePhone(phone);
    if(!phoneDigits) return res.status(400).json({ error:'phone é obrigatório' });

    if(!eventId){
      const list = await listUpcomingReservationsByPhone(phoneDigits);
      if(!list.length) return res.status(404).json({ error:'Nenhuma reserva encontrada para esse telefone.' });

      const pick = list[0];
      await ensureAuth();
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: pick.eventId });
      return res.json({ ok:true, canceledEventId: pick.eventId });
    }

    await ensureAuth();
    const ev = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    const ph = extractPhoneFromEvent({
      summary: ev.data.summary || '',
      description: ev.data.description || '',
      location: ev.data.location || ''
    });

    if(ph !== phoneDigits){
      return res.status(403).json({ error:'Este telefone não confere com a reserva.' });
    }

    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
    return res.json({ ok:true, canceledEventId: eventId });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'Erro ao cancelar reserva.' });
  }
});

// =========================
// Reset de senha (sem login)
// Confirma por e-mail + WhatsApp cadastrados
// =========================
app.post('/api/auth/reset_password', (req, res) => {
  try{
    const { email, phone, newPassword } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phone);
    const cleanPass = String(newPassword || '');

    if(!cleanEmail || !cleanPhone || !cleanPass){
      return res.status(400).json({ error:'Preencha e-mail, WhatsApp e nova senha.' });
    }

    if(cleanPass.length < 4){
      return res.status(400).json({ error:'A nova senha deve ter pelo menos 4 caracteres.' });
    }

    const users = readUsers();
    const idx = users.findIndex(u =>
      String(u.email || '').toLowerCase() === cleanEmail &&
      normalizePhone(u.phone) === cleanPhone
    );

    if(idx === -1){
      return res.status(404).json({ error:'Conta não encontrada com esse e-mail + WhatsApp.' });
    }

    users[idx].passwordHash = hashPassword(cleanPass);
    users[idx].updatedAt = new Date().toISOString();
    writeUsers(users);

    return res.json({ ok:true, message:'Senha redefinida com sucesso.' });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao redefinir senha.' });
  }
});

// =========================
// Auth usuários
// =========================
app.post('/api/auth/register', (req,res)=>{
  try{
    const { name, email, phone, password } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phone);
    const cleanPass = String(password || '');

    if(!cleanName || !cleanEmail || !cleanPhone || !cleanPass){
      return res.status(400).json({ error:'Preencha nome, e-mail, WhatsApp e senha.' });
    }
    if(cleanPass.length < 4){
      return res.status(400).json({ error:'A senha deve ter pelo menos 4 caracteres.' });
    }

    const users = readUsers();

    if(users.find(u => String(u.email).toLowerCase() === cleanEmail)){
      return res.status(409).json({ error:'Este e-mail já está cadastrado.' });
    }
    if(users.find(u => normalizePhone(u.phone) === cleanPhone)){
      return res.status(409).json({ error:'Este WhatsApp já está cadastrado.' });
    }

    const user = {
      id: crypto.randomUUID(),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash: hashPassword(cleanPass),
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeUsers(users);

    return res.json({ ok:true, user: makePublicUser(user) });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao criar conta.' });
  }
});

app.post('/api/auth/login', (req,res)=>{
  try{
    const { login, email, phone, password } = req.body || {};
    const rawLogin = String(login || email || phone || '').trim();
    const byEmail = rawLogin.includes('@');

    const cleanEmail = String(email || (byEmail ? rawLogin : '') || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phone || (!byEmail ? rawLogin : ''));

    const users = readUsers();
    const user = users.find(u =>
      (cleanEmail && String(u.email).toLowerCase() === cleanEmail) ||
      (cleanPhone && normalizePhone(u.phone) === cleanPhone)
    );

    if(!user) return res.status(404).json({ error:'Conta não encontrada.' });
    if(user.passwordHash !== hashPassword(password || '')){
      return res.status(401).json({ error:'Senha inválida.' });
    }

    return res.json({ ok:true, user: makePublicUser(user) });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro no login.' });
  }
});

app.get('/api/my_reservations', async (req,res)=>{
  try{
    const phoneDigits = normalizePhone(req.query.phone);
    if(!phoneDigits) return res.status(400).json({ error:'phone é obrigatório' });

    const reservations = await listUpcomingReservationsByPhone(phoneDigits);

    const formatted = reservations.map(r => {
      const date = String(r.start).slice(0,10);
      const hhmm = String(r.start).slice(11,16);
      const ehhmm = String(r.end).slice(11,16);
      const courtMatch = String(r.summary || '').match(/Quadra\s*(\d)/i);

      return {
        eventId: r.eventId,
        date,
        start: hhmm,
        end: ehhmm,
        court: courtMatch ? `Quadra ${courtMatch[1]}` : '',
        summary: r.summary || ''
      };
    });

    return res.json({ ok:true, reservations: formatted });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao buscar reservas da conta.' });
  }
});

// =========================
// Admin login / sessão
// =========================
app.post('/api/admin/login', (req, res) => {
  try{
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if(!email || !password){
      return res.status(400).json({ error:'E-mail e senha são obrigatórios.' });
    }

    if(email !== String(ADMIN_EMAIL).toLowerCase() || password !== String(ADMIN_PASSWORD)){
      return res.status(401).json({ error:'Credenciais inválidas.' });
    }

    const token = makeAdminToken();

    return res.json({
      ok: true,
      token,
      admin: { email: ADMIN_EMAIL }
    });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro no login ADM.' });
  }
});

app.get('/api/admin/me', adminAuth, (req, res) => {
  return res.json({ ok:true, admin:{ email: ADMIN_EMAIL } });
});

// =========================
// Admin APIs (painel)
// =========================

// Lista contas cadastradas (sem senha)
app.get('/api/admin/users', adminAuth, (req, res) => {
  try{
    const users = readUsers()
      .map(u => ({
        id: u.id,
        name: u.name || '',
        email: u.email || '',
        phone: u.phone || '',
        createdAt: u.createdAt || ''
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.json({ ok:true, users });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao buscar usuários.' });
  }
});

// Lista reservas futuras (todas)
app.get('/api/admin/reservations', adminAuth, async (req, res) => {
  try{
    const missing = requireEnv();
    if(missing.length){
      return res.status(500).json({ error:`Faltam variáveis de ambiente: ${missing.join(', ')}` });
    }

    await ensureAuth();

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 120).toISOString();

    const resp = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500
    });

    const reservations = (resp.data.items || [])
      .filter(ev => !!(ev.start?.dateTime || ev.start?.date))
      .map(ev => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        const end = ev.end?.dateTime || ev.end?.date || '';

        return {
          eventId: ev.id,
          summary: ev.summary || '',
          customer: extractCustomerFromEvent(ev),
          phone: extractPhoneFromEvent(ev),
          start,
          end
        };
      })
      .filter(r => String(r.start).length > 10) // ignora all-day
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));

    return res.json({ ok:true, reservations });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao buscar reservas.' });
  }
});

// Métricas simples
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try{
    const users = readUsers();
    let reservationsCount = 0;

    try{
      const missing = requireEnv();
      if(missing.length === 0){
        await ensureAuth();

        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 120).toISOString();

        const resp = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500
        });

        reservationsCount = (resp.data.items || [])
          .filter(ev => String(ev.start?.dateTime || '').length > 10)
          .length;
      }
    }catch(err){
      console.error('Erro stats reservas:', err);
    }

    return res.json({
      ok: true,
      stats: {
        totalUsers: users.length,
        totalReservationsFuture: reservationsCount,
        adminEmail: ADMIN_EMAIL
      }
    });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error:'Erro ao buscar métricas.' });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});