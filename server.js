import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dns from 'dns';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TZ = process.env.BASE_TZ || 'America/Sao_Paulo';

// ====== E-mail (notificação de reserva) ======
// Configurar no Render:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// (opcional) ADMIN_NOTIFY_EMAIL (default: napraiasjp@gmail.com)
//
// ⚠️ Se estiver dando ETIMEDOUT com Gmail, recomendo trocar para SendGrid:
// SMTP_HOST=smtp.sendgrid.net
// SMTP_PORT=587
// SMTP_USER=apikey
// SMTP_PASS=<SUA_API_KEY_SENDGRID>
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'napraiasjp@gmail.com';

function hasSmtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function makeTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,

    // força IPv4 (ajuda quando o ambiente tenta IPv6 e dá timeout)
    lookup: (hostname, options, cb) => dns.lookup(hostname, { family: 4 }, cb),

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    // timeouts
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,

    // TLS (principalmente para 587)
    requireTLS: port === 587,
    tls: {
      servername: process.env.SMTP_HOST,
      minVersion: 'TLSv1.2',
    },
  });
}

async function sendReservationEmailToAdmin({
  date,
  start,
  end,
  durText,
  court,
  name,
  email,
  phone,
  eventId,
}) {
  if (!hasSmtpConfigured()) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = makeTransport();

  const subject = `✅ Nova reserva — ${date} ${start}–${end} (${court})`;
  const text = [
    'Nova reserva criada pelo site.',
    '',
    `Data: ${date}`,
    `Horário: ${start}–${end}`,
    `Duração: ${durText}`,
    `Quadra: ${court}`,
    '',
    `Cliente: ${name}`,
    `E-mail: ${email}`,
    `WhatsApp: ${phone}`,
    '',
    `EventId (Google Calendar): ${eventId || '—'}`,
  ].join('\n');

  await transporter.sendMail({
    from,
    to: ADMIN_NOTIFY_EMAIL,
    subject,
    text,
  });

  return true;
}

// ====== Auth (simples) ======
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_ENV';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
  if (!fs.existsSync(USERS_FILE)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
    } catch (e) {}
  }
}

function readUsers() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const obj = JSON.parse(raw || '{"users":[]}');
    return Array.isArray(obj.users) ? obj.users : [];
  } catch (e) {
    return [];
  }
}

function writeUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

function newId() {
  return 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, phone: user.phoneDigits, email: user.email || '', name: user.name || '' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authMiddleware(req, res, next) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão inválida/expirada.' });
  }
}

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
  })
);

// === Google Calendar auth (Service Account) ===
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

let SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let SA_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

const SA_JSON_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
const SA_JSON_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function loadServiceAccountFromEnv() {
  try {
    let raw = null;
    if (SA_JSON_B64) {
      raw = Buffer.from(SA_JSON_B64, 'base64').toString('utf8');
    } else if (SA_JSON_RAW) {
      raw = SA_JSON_RAW;
    }
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj.client_email) SA_EMAIL = obj.client_email;
    if (obj.private_key) SA_PRIVATE_KEY = obj.private_key;
  } catch (e) {}
}
loadServiceAccountFromEnv();

if (SA_PRIVATE_KEY) {
  SA_PRIVATE_KEY = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
}

function requireEnv() {
  const missing = [];
  if (!CALENDAR_ID) missing.push('GOOGLE_CALENDAR_ID');
  if (!SA_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL (ou GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)');
  if (!SA_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY (ou GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)');
  return missing;
}

const scopes = ['https://www.googleapis.com/auth/calendar'];
const jwtClient = new google.auth.JWT({
  email: SA_EMAIL,
  key: SA_PRIVATE_KEY,
  scopes,
});
const calendar = google.calendar({ version: 'v3', auth: jwtClient });

function pad(n) {
  return String(n).padStart(2, '0');
}

function normalizePhone(s) {
  return String(s || '').replace(/\D+/g, '');
}

function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}

function sanitizeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function extractPhoneFromEvent(ev) {
  const hay = `${ev.summary || ''}\n${ev.description || ''}\n${ev.location || ''}`;
  const m = hay.match(/WhatsApp:\s*([^\n]+)/i);
  if (!m) return '';
  return normalizePhone(m[1]);
}

async function listUpcomingReservationsByPhone(phoneDigits) {
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
    maxResults: 2500,
  });
  const items = (resp.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || '',
    description: e.description || '',
    location: e.location || '',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
  }));
  const out = [];
  for (const ev of items) {
    if (!ev.start || String(ev.start).length <= 10) continue;
    const ph = extractPhoneFromEvent(ev);
    if (!ph) continue;
    if (ph === phoneDigits) {
      out.push({
        eventId: ev.id,
        summary: ev.summary,
        start: ev.start,
        end: ev.end,
      });
    }
  }
  return out;
}

function toDateTimeISO(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00`;
}

// ====== Regras de disponibilidade ======
function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  return dow === 0 || dow === 6;
}

function generateSlots(dateISO, durationMinutes) {
  const weekend = isWeekend(String(dateISO || ''));
  const startHour = weekend ? 9 : 17;
  const endHour = weekend ? 19 : 23;

  const slots = [];
  const lastStart = endHour * 60 - durationMinutes;
  for (let t = startHour * 60; t <= lastStart; t += 60) {
    const sh = Math.floor(t / 60),
      sm = t % 60;
    const eh = Math.floor((t + durationMinutes) / 60),
      em = (t + durationMinutes) % 60;
    slots.push({ start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` });
  }
  return slots;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// ====== Classificação de eventos para quadras ======
let DEFAULT_KEYWORD_MAP = [
  { pattern: 'futevolei|futvolei|futev[oó]lei', court: 1 },
  { pattern: 'v[oó]lei(?!.*fute)', court: 2 },
  { pattern: 'beach\\s*tennis|\\bbt\\b', court: 2 },
];

try {
  if (process.env.COURT_KEYWORDS_JSON) {
    const parsed = JSON.parse(process.env.COURT_KEYWORDS_JSON);
    if (Array.isArray(parsed) && parsed.length) DEFAULT_KEYWORD_MAP = parsed;
  }
} catch (e) {}

function classifyEventToCourts(ev) {
  const text = `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''}`.toLowerCase();

  const q1 = text.includes('quadra 1') || text.includes('q1') || text.includes('quadra1');
  const q2 = text.includes('quadra 2') || text.includes('q2') || text.includes('quadra2');

  if (q1 && !q2) return { kind: 'known', courts: [1], blockBoth: false };
  if (q2 && !q1) return { kind: 'known', courts: [2], blockBoth: false };
  if (q1 && q2) return { kind: 'known', courts: [1, 2], blockBoth: true };

  for (const rule of DEFAULT_KEYWORD_MAP) {
    try {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(text)) {
        const c = Number(rule.court);
        if (c === 1 || c === 2) return { kind: 'known', courts: [c], blockBoth: false };
      }
    } catch (e) {}
  }

  return { kind: 'unknownSingle', courts: [], blockBoth: false };
}

async function listEventsForDay(dateStr) {
  const timeMin = `${dateStr}T00:00:00-03:00`;
  const timeMax = `${dateStr}T23:59:59-03:00`;

  const resp = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    timeZone: TZ,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (resp.data.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '',
    description: ev.description || '',
    location: ev.location || '',
    start: ev.start?.dateTime || ev.start?.date,
    end: ev.end?.dateTime || ev.end?.date,
  }));
}

function isoToMinutes(iso) {
  const s = String(iso || '');
  const mOffset = s.match(/T(\d{2}):(\d{2}).*([+-]\d{2}:?\d{2})$/);
  if (mOffset) return Number(mOffset[1]) * 60 + Number(mOffset[2]);

  try {
    const d = new Date(s);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hh * 60 + mm;
  } catch {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

function computeAvailability(events, duration, date) {
  const baseSlots = generateSlots(date, duration);
  const out = baseSlots.map((s) => ({ ...s, availableCourts: 2 }));

  for (const slot of out) {
    const slotStartMin = Number(slot.start.split(':')[0]) * 60 + Number(slot.start.split(':')[1]);
    const slotEndMin = Number(slot.end.split(':')[0]) * 60 + Number(slot.end.split(':')[1]);

    let busyKnown = new Set();
    let unknownCount = 0;

    for (const ev of events) {
      if (String(ev.start).length <= 10) {
        busyKnown = new Set([1, 2]);
        unknownCount = 0;
        break;
      }

      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);

      if (overlaps(slotStartMin, slotEndMin, evStartMin, evEndMin)) {
        const cls = classifyEventToCourts(ev);

        if (cls.blockBoth) {
          busyKnown = new Set([1, 2]);
          unknownCount = 0;
          break;
        }

        if (cls.kind === 'known') cls.courts.forEach((c) => busyKnown.add(c));
        else if (cls.kind === 'unknownSingle') unknownCount += 1;
      }
    }

    const remainingAfterKnown = Math.max(0, 2 - busyKnown.size);
    const unknownConsumes = Math.min(unknownCount, remainingAfterKnown);
    slot.availableCourts = Math.max(0, remainingAfterKnown - unknownConsumes);
  }

  return out;
}

async function ensureAuth() {
  await jwtClient.authorize();
}

app.get('/health', async (req, res) => {
  const missing = requireEnv();
  if (missing.length) {
    return res.status(500).json({ ok: false, error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });
  }
  return res.json({ ok: true });
});

// =========================
// Auth (cadastro/login)
// =========================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    const nm = String(name || '').trim();
    const em = normalizeEmail(email);
    const ph = normalizePhone(phone);
    const pw = String(password || '');

    if (nm.length < 2) return res.status(400).json({ error: 'Nome inválido.' });
    if (!ph || ph.length < 10) return res.status(400).json({ error: 'WhatsApp inválido.' });

    // ✅ EMAIL OBRIGATÓRIO
    if (!em) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: 'E-mail inválido.' });

    if (pw.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });

    const users = readUsers();
    const exists = users.find((u) => u.phoneDigits === ph || u.email === em);
    if (exists) return res.status(409).json({ error: 'Já existe um cadastro com esse WhatsApp/e-mail.' });

    const passwordHash = await bcrypt.hash(pw, 10);
    const user = {
      id: newId(),
      name: nm,
      email: em,
      phoneDigits: ph,
      createdAt: new Date().toISOString(),
    };

    users.push({ ...user, passwordHash });
    writeUsers(users);

    const token = signToken(user);
    return res.json({ ok: true, token, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao cadastrar.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const idfRaw = String(identifier || '').trim();
    const pw = String(password || '');
    if (!idfRaw || !pw) return res.status(400).json({ error: 'Informe WhatsApp/e-mail e senha.' });

    const idEmail = normalizeEmail(idfRaw);
    const idPhone = normalizePhone(idfRaw);

    const users = readUsers();
    const user = users.find((u) => (idEmail && u.email === idEmail) || (idPhone && u.phoneDigits === idPhone));
    if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

    const ok = await bcrypt.compare(pw, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

    const publicUser = sanitizeUser(user);
    const token = signToken(publicUser);
    return res.json({ ok: true, token, user: publicUser });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao entrar.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const users = readUsers();
    const u = users.find((x) => x.id === req.user.sub);
    if (!u) return res.status(401).json({ error: 'Sessão inválida.' });
    return res.json({ ok: true, user: sanitizeUser(u) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro.' });
  }
});

app.get('/api/me/reservations', authMiddleware, async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const phoneDigits = normalizePhone(req.user.phone || '');
    if (!phoneDigits) return res.status(400).json({ error: 'Telefone inválido.' });

    const reservations = await listUpcomingReservationsByPhone(phoneDigits);

    const formatted = reservations.map((r) => {
      const start = r.start;
      const end = r.end;
      const date = String(start).slice(0, 10);
      const hhmm = String(start).slice(11, 16);
      const ehhmm = String(end).slice(11, 16);
      const courtMatch = String(r.summary || '').match(/Quadra\s*(\d)/i);
      return {
        eventId: r.eventId,
        date,
        start: hhmm,
        end: ehhmm,
        court: courtMatch ? `Quadra ${courtMatch[1]}` : '',
        summary: r.summary || '',
      };
    });

    return res.json({ ok: true, reservations: formatted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao buscar reservas.' });
  }
});

app.post('/api/me/cancel', authMiddleware, async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const { eventId } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId é obrigatório' });

    const phoneDigits = normalizePhone(req.user.phone || '');
    await ensureAuth();
    const ev = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    const ph = extractPhoneFromEvent({ summary: ev.data.summary || '', description: ev.data.description || '', location: ev.data.location || '' });
    if (ph !== phoneDigits) return res.status(403).json({ error: 'Essa reserva não pertence ao seu WhatsApp.' });

    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
    return res.json({ ok: true, canceledEventId: eventId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao cancelar reserva.' });
  }
});

app.get('/api/slots', async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const date = String(req.query.date || '');
    const duration = Number(req.query.duration || 60);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
    if (![60, 120].includes(duration)) return res.status(400).json({ error: 'duration inválida (60 ou 120)' });

    await ensureAuth();
    const events = await listEventsForDay(date);
    const slots = computeAvailability(events, duration, date);

    res.json({ date, duration, slots });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar horários.' });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const { date, start, duration, name, email, phone } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' });
    if (!/^\d{2}:\d{2}$/.test(String(start || ''))) return res.status(400).json({ error: 'start inválido (HH:MM)' });

    const dur = Number(duration || 60);
    if (![60, 120].includes(dur)) return res.status(400).json({ error: 'duration inválida (60 ou 120)' });

    if (!String(name || '').trim() || !String(email || '').trim() || !String(phone || '').trim()) {
      return res.status(400).json({ error: 'name, email e phone são obrigatórios' });
    }

    const emailNorm = normalizeEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(emailNorm)) return res.status(400).json({ error: 'email inválido' });

    const startMin = Number(start.split(':')[0]) * 60 + Number(start.split(':')[1]);
    const endMin = startMin + dur;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const end = `${pad(endH)}:${pad(endM)}`;

    const allowedSlots = generateSlots(String(date), dur);
    const isValidSlot = allowedSlots.some((s) => s.start === String(start) && s.end === String(end));
    if (!isValidSlot) return res.status(400).json({ error: 'Horário inválido para esse dia.' });

    await ensureAuth();
    const events = await listEventsForDay(String(date));

    const slotEvents = events.filter((ev) => {
      if (String(ev.start).length <= 10) return true;
      const evStartMin = isoToMinutes(ev.start);
      const evEndMin = isoToMinutes(ev.end);
      return overlaps(startMin, endMin, evStartMin, evEndMin);
    });

    if (slotEvents.some((ev) => String(ev.start).length <= 10)) {
      return res.status(409).json({ error: 'Esse horário está indisponível.' });
    }

    const busyKnown = new Set();
    let unknownCount = 0;

    for (const ev of slotEvents) {
      const cls = classifyEventToCourts(ev);
      if (cls.blockBoth) return res.status(409).json({ error: 'Esse horário está indisponível.' });
      if (cls.kind === 'known') cls.courts.forEach((c) => busyKnown.add(c));
      else if (cls.kind === 'unknownSingle') unknownCount += 1;
    }

    const totalBusy = Math.min(2, busyKnown.size + unknownCount);
    if (totalBusy >= 2) return res.status(409).json({ error: 'Esse horário está lotado (2 quadras ocupadas).' });

    const freeCourts = [1, 2].filter((c) => !busyKnown.has(c));
    const chosen = freeCourts[0] ?? 1;

    const summary = `Locação Avulsa — Quadra ${chosen}`;
    const warning =
      unknownCount > 0 && busyKnown.size === 0
        ? '\nObs: havia aula/evento sem quadra definida nesse horário. Confirme com a equipe para evitar conflito.\n'
        : '';

    const durTxt = dur === 120 ? '2h' : '1h';
    const description = `Cliente: ${name}\nE-mail: ${emailNorm}\nWhatsApp: ${phone}\nDuração: ${durTxt}\nOrigem: site\n${warning}`;

    const event = {
      summary,
      description,
      start: { dateTime: toDateTimeISO(String(date), String(start)), timeZone: TZ },
      end: { dateTime: toDateTimeISO(String(date), end), timeZone: TZ },
    };

    const created = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
    });

    let emailSent = false;
    try {
      emailSent = await sendReservationEmailToAdmin({
        date: String(date),
        start: String(start),
        end,
        durText: durTxt,
        court: `Quadra ${chosen}`,
        name: String(name).trim(),
        email: emailNorm,
        phone: String(phone).trim(),
        eventId: created.data.id,
      });
    } catch (e) {
      console.error('Falha ao enviar e-mail de notificação:', e);
      emailSent = false;
    }

    return res.json({
      ok: true,
      court: `Quadra ${chosen}`,
      start,
      end,
      eventId: created.data.id,
      emailSent,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar reserva.' });
  }
});

// =========================
// Cancelamento por telefone (somente)
// =========================
app.post('/api/cancel_lookup', async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const { phone } = req.body || {};
    const phoneDigits = normalizePhone(phone);
    if (!phoneDigits) return res.status(400).json({ error: 'phone é obrigatório' });

    const reservations = await listUpcomingReservationsByPhone(phoneDigits);
    if (!reservations.length) return res.json({ ok: true, reservations: [] });

    const formatted = reservations.map((r) => {
      const start = r.start;
      const end = r.end;
      const date = String(start).slice(0, 10);
      const hhmm = String(start).slice(11, 16);
      const ehhmm = String(end).slice(11, 16);
      const courtMatch = String(r.summary || '').match(/Quadra\s*(\d)/i);
      return {
        eventId: r.eventId,
        date,
        start: hhmm,
        end: ehhmm,
        court: courtMatch ? `Quadra ${courtMatch[1]}` : '',
        summary: r.summary || '',
      };
    });

    return res.json({ ok: true, reservations: formatted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar reservas.' });
  }
});

app.post('/api/cancel_by_phone', async (req, res) => {
  try {
    const missing = requireEnv();
    if (missing.length) return res.status(500).json({ error: `Faltam variáveis de ambiente: ${missing.join(', ')}` });

    const { phone, eventId } = req.body || {};
    const phoneDigits = normalizePhone(phone);
    if (!phoneDigits) return res.status(400).json({ error: 'phone é obrigatório' });

    if (!eventId) {
      const list = await listUpcomingReservationsByPhone(phoneDigits);
      if (!list.length) return res.status(404).json({ error: 'Nenhuma reserva encontrada para esse telefone.' });

      const pick = list[0];
      await ensureAuth();
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: pick.eventId });
      return res.json({ ok: true, canceledEventId: pick.eventId });
    }

    await ensureAuth();
    const ev = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    const desc = ev.data.description || '';
    const ph = extractPhoneFromEvent({ summary: ev.data.summary || '', description: desc, location: ev.data.location || '' });
    if (ph !== phoneDigits) return res.status(403).json({ error: 'Este telefone não confere com a reserva.' });

    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
    return res.json({ ok: true, canceledEventId: eventId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao cancelar reserva.' });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
