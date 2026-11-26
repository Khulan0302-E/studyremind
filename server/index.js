// StudyRemind — backend (Node.js, гадны сангүй)
// Ажиллуулах: node server/index.js   →  http://localhost:3000

// Node 22.5–22.12 дээр node:sqlite-д флаг хэрэгтэй тул өөрийгөө флагтай дахин эхлүүлнэ.
(function ensureSqliteFlag() {
  try { require('node:sqlite'); return; } catch (_) { /* доор шалгана */ }
  const [maj, min] = process.versions.node.split('.').map(Number);
  const supports = maj > 22 || (maj === 22 && min >= 5);
  if (supports && !process.execArgv.includes('--experimental-sqlite')) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
})();
process.removeAllListeners('warning');

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');
const { parseIcal, parseCsv, parseScheduleCsv, normTime } = require('./importers');
const { seedDemo, createUserData, teamsMockAssignments, DEFAULT_SETTINGS } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// ---------- туслах функцууд ----------
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, program: u.program || 'МС · 1-р курс' });
const settingsOf = (userId) => db.get('settings', userId) || { id: userId, userId, ...DEFAULT_SETTINGS };

function notify(userId, kind, text) {
  db.put('notifications', { id: db.newId(), userId, kind, text, read: false, at: new Date().toISOString() });
}

// Эх сурвалжаас ирсэн даалгавруудыг нэгтгэх: шинэ → нэмэх, өөрчлөгдсөн → шинэчлэх, алга болсон → «Цуцлагдсан»
function upsertFromSource(userId, source, items, { cancelMissing = true } = {}) {
  const settings = settingsOf(userId);
  const existing = db.all('tasks', userId).filter((t) => t.source === source);
  const byUid = new Map(existing.map((t) => [t.extUid, t]));
  const seen = new Set();
  let added = 0; let updated = 0; let cancelled = 0;
  const now = new Date().toISOString();
  for (const it of items) {
    seen.add(it.extUid);
    const t = byUid.get(it.extUid);
    if (!t) {
      db.put('tasks', {
        id: db.newId(), userId, source, extUid: it.extUid, title: it.title, course: it.course, type: it.type,
        due: it.due, done: false, doneAt: null, cancelled: false, reminders: [...settings.defaultReminders],
        channels: { push: true, email: false }, checklist: [], notes: it.notes || '', createdAt: now, updatedAt: now,
      });
      added++;
    } else if (t.due !== it.due || t.title !== it.title || t.cancelled) {
      // Хугацаа, нэр эх сурвалжаас; дууссан төлөв ба сануулгын тохиргоо хэрэглэгчийнх хэвээр
      Object.assign(t, { title: it.title, course: it.course, due: it.due, cancelled: false, updatedAt: now });
      db.put('tasks', t);
      updated++;
    }
  }
  if (cancelMissing) {
    for (const t of existing) {
      if (t.extUid && !seen.has(t.extUid) && !t.cancelled && !String(t.extUid).startsWith('demo-')) {
        t.cancelled = true; t.updatedAt = now; db.put('tasks', t); cancelled++;
      }
    }
  }
  return { added, updated, cancelled };
}

async function syncMoodle(userId) {
  const src = db.get('sources', `${userId}:moodle`);
  if (!src || src.status === 'disconnected' || !src.url) throw new Error('Moodle холбогдоогүй байна');
  if (src.url === 'demo') {
    src.lastSync = new Date().toISOString(); src.status = 'connected'; db.put('sources', src);
    return { added: 0, updated: 0, cancelled: 0 };
  }
  let text;
  try {
    const r = await fetch(src.url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    text = await r.text();
  } catch (e) {
    src.status = 'error'; src.error = 'Холбоос хүчингүй эсвэл интернэт холболт алга'; db.put('sources', src);
    throw new Error(src.error);
  }
  if (!text.includes('BEGIN:VCALENDAR')) {
    src.status = 'error'; src.error = 'Энэ холбоос iCal (календарийн экспорт) биш байна'; db.put('sources', src);
    throw new Error(src.error);
  }
  const result = upsertFromSource(userId, 'moodle', parseIcal(text));
  Object.assign(src, { status: 'connected', error: null, lastSync: new Date().toISOString() });
  db.put('sources', src);
  return result;
}

function syncTeams(userId) {
  const src = db.get('sources', `${userId}:teams`);
  if (!src || src.status === 'disconnected') throw new Error('Teams холбогдоогүй байна');
  const result = upsertFromSource(userId, 'teams', teamsMockAssignments());
  src.lastSync = new Date().toISOString(); src.status = 'connected'; db.put('sources', src);
  return result;
}

// ---------- маршрутууд ----------
const routes = [];
const route = (method, pattern, handler, { auth = true } = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler, auth });
};

const attemptsByEmail = new Map(); // бүртгэлгүй и-мэйлийн оролдлого

route('GET', '/api/health', (req, res) => send(res, 200, { ok: true, db: db.kind }), { auth: false });

route('POST', '/api/auth/register', async (req, res, { body }) => {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const errors = {};
  if (!name) errors.name = 'Нэрээ оруулна уу';
  if (!EMAIL_RE.test(email)) errors.email = 'И-мэйл хаяг дутуу байна. Жишээ нь: name@example.mn';
  if (password.length < 8) errors.password = 'Нууц үг хамгийн багадаа 8 тэмдэгт байна';
  if (Object.keys(errors).length) return fail(res, 400, 'Талбаруудаа шалгана уу', { fields: errors });
  if (db.all('users').some((u) => u.email === email)) return fail(res, 409, 'Энэ и-мэйлээр бүртгэл үүссэн байна', { fields: { email: 'Энэ и-мэйлээр бүртгэл үүссэн байна' } });
  const { salt, hash } = hashPassword(password);
  const id = db.newId();
  const user = db.put('users', { id, userId: id, name, email, program: 'МС · 1-р курс', salt, hash, failed: 0, lockedUntil: null, createdAt: new Date().toISOString() });
  createUserData(user, { demo: false });
  const token = signToken({ uid: id }, 60 * 60 * 24);
  send(res, 201, { token, user: publicUser(user) });
}, { auth: false });

route('POST', '/api/auth/login', async (req, res, { body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const errors = {};
  if (!EMAIL_RE.test(email)) errors.email = 'И-мэйл хаяг дутуу байна. Жишээ нь: name@example.mn';
  if (password.length < 8) errors.password = 'Нууц үг хамгийн багадаа 8 тэмдэгт байна';
  if (Object.keys(errors).length) return fail(res, 400, 'Талбаруудаа шалгана уу', { fields: errors });

  const user = db.all('users').find((u) => u.email === email);
  const now = Date.now();
  if (user && user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - now) / 60e3);
    return fail(res, 423, `Хэт олон буруу оролдлого хийсэн тул ${mins} минутын дараа дахин оролдоно уу.`, { attempt: MAX_ATTEMPTS, max: MAX_ATTEMPTS, lockedUntil: user.lockedUntil });
  }
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    let attempt;
    if (user) {
      user.failed = (user.lockedUntil && new Date(user.lockedUntil).getTime() <= now ? 0 : user.failed || 0) + 1;
      attempt = user.failed;
      if (attempt >= MAX_ATTEMPTS) user.lockedUntil = new Date(now + LOCK_MINUTES * 60e3).toISOString();
      db.put('users', user);
    } else {
      attempt = (attemptsByEmail.get(email) || 0) + 1;
      attemptsByEmail.set(email, attempt);
    }
    if (attempt >= MAX_ATTEMPTS) {
      return fail(res, 423, `Хэт олон буруу оролдлого хийсэн тул ${LOCK_MINUTES} минутын дараа дахин оролдоно уу.`, { attempt: MAX_ATTEMPTS, max: MAX_ATTEMPTS });
    }
    return fail(res, 401, `И-мэйл эсвэл нууц үг буруу байна. Дахин оролдоно уу (${attempt}/${MAX_ATTEMPTS}).`, { attempt, max: MAX_ATTEMPTS });
  }
  user.failed = 0; user.lockedUntil = null; db.put('users', user);
  const ttl = body.remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  send(res, 200, { token: signToken({ uid: user.id }, ttl), user: publicUser(user), remember: !!body.remember });
}, { auth: false });

route('POST', '/api/auth/forgot', async (req, res, { body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'И-мэйл хаяг дутуу байна. Жишээ нь: name@example.mn');
  const user = db.all('users').find((u) => u.email === email);
  if (user) {
    const token = signToken({ uid: user.id, reset: true }, 30 * 60);
    console.log(`[Нууц үг сэргээх] ${email}: http://localhost:${PORT}/?reset=${token}`);
  }
  // Данс байгаа эсэхийг задлахгүй
  send(res, 200, { message: 'Хэрэв энэ и-мэйлээр бүртгэл байгаа бол нууц үг сэргээх холбоос илгээгдлээ.' });
}, { auth: false });

route('POST', '/api/auth/reset', async (req, res, { body }) => {
  const p = verifyToken(body.token);
  if (!p || !p.reset) return fail(res, 400, 'Холбоосны хугацаа дууссан байна');
  if (String(body.password || '').length < 8) return fail(res, 400, 'Нууц үг хамгийн багадаа 8 тэмдэгт байна');
  const user = db.get('users', p.uid);
  Object.assign(user, hashPassword(body.password), { failed: 0, lockedUntil: null });
  db.put('users', user);
  send(res, 200, { message: 'Нууц үг шинэчлэгдлээ' });
}, { auth: false });

route('GET', '/api/me', (req, res, { user }) => send(res, 200, { user: publicUser(user) }));

// --- tasks ---
route('GET', '/api/tasks', (req, res, { user }) => {
  const tasks = db.all('tasks', user.id).sort((a, b) => a.due.localeCompare(b.due));
  send(res, 200, { tasks, serverTime: new Date().toISOString() });
});

function sanitizeTask(body, base = {}) {
  const t = { ...base };
  if ('title' in body) t.title = String(body.title || '').trim().slice(0, 200);
  if ('course' in body) t.course = String(body.course || '').trim().slice(0, 120);
  if ('type' in body) t.type = ['assignment', 'exam', 'other'].includes(body.type) ? body.type : 'assignment';
  if ('due' in body) t.due = new Date(body.due).toISOString();
  if ('done' in body) { t.done = !!body.done; t.doneAt = t.done ? new Date().toISOString() : null; }
  if ('reminders' in body) t.reminders = [...new Set((body.reminders || []).map(Number).filter((n) => n > 0))].sort((a, b) => b - a);
  if ('channels' in body) t.channels = { push: !!body.channels.push, email: !!body.channels.email };
  if ('checklist' in body) t.checklist = (body.checklist || []).map((c) => ({ id: String(c.id), text: String(c.text).slice(0, 200), done: !!c.done }));
  if ('notes' in body) t.notes = String(body.notes || '').slice(0, 2000);
  return t;
}

route('POST', '/api/tasks', async (req, res, { user, body }) => {
  if (!String(body.title || '').trim()) return fail(res, 400, 'Гарчиг оруулна уу');
  if (!body.due || isNaN(new Date(body.due))) return fail(res, 400, 'Дуусах огноо оруулна уу');
  const now = new Date().toISOString();
  const t = sanitizeTask(body, {
    id: body.id || db.newId(), userId: user.id, source: 'manual', extUid: null, done: false, doneAt: null, cancelled: false,
    reminders: settingsOf(user.id).defaultReminders, channels: { push: true, email: false }, checklist: [], notes: '', type: 'assignment', course: '', createdAt: now,
  });
  t.updatedAt = now;
  if (db.get('tasks', t.id)) return send(res, 200, { task: db.get('tasks', t.id) }); // офлайн давхардлаас сэргийлнэ
  db.put('tasks', t);
  send(res, 201, { task: t });
});

route('PATCH', '/api/tasks/:id', async (req, res, { user, body, params }) => {
  const t = db.get('tasks', params.id);
  if (!t || t.userId !== user.id) return fail(res, 404, 'Даалгавар олдсонгүй');
  // Эх сурвалжаас ирсэн task-ийн гарчиг, хугацааг гараар өөрчлөхгүй
  const allowed = t.source === 'manual' ? body : Object.fromEntries(Object.entries(body).filter(([k]) => !['title', 'course', 'due', 'type'].includes(k)));
  const next = sanitizeTask(allowed, t);
  next.updatedAt = new Date().toISOString();
  db.put('tasks', next);
  send(res, 200, { task: next });
});

route('DELETE', '/api/tasks/:id', (req, res, { user, params }) => {
  const t = db.get('tasks', params.id);
  if (!t || t.userId !== user.id) return fail(res, 404, 'Даалгавар олдсонгүй');
  db.remove('tasks', t.id);
  send(res, 200, { ok: true });
});

// --- sources ---
route('GET', '/api/sources', (req, res, { user }) => {
  const tasks = db.all('tasks', user.id);
  const sources = ['moodle', 'teams', 'mel'].map((k) => {
    const s = db.get('sources', `${user.id}:${k}`) || { kind: k, status: 'disconnected' };
    return { ...s, count: tasks.filter((t) => t.source === k && !t.cancelled).length };
  });
  sources.push({ kind: 'manual', status: 'connected', count: tasks.filter((t) => t.source === 'manual').length });
  send(res, 200, { sources, pearsonEnabled: false });
});

route('POST', '/api/sources/moodle', async (req, res, { user, body }) => {
  const url = String(body.url || '').trim();
  if (!/^https?:\/\/\S+/.test(url)) return fail(res, 400, 'Холбоос хүчингүй байна. Moodle-ээс шинэ холбоос аваад дахин оролдоно уу');
  const src = db.get('sources', `${user.id}:moodle`);
  Object.assign(src, { url, status: 'connected' });
  db.put('sources', src);
  try {
    const r = await syncMoodle(user.id);
    notify(user.id, 'sync', `Moodle холбогдлоо: ${r.added} шинэ даалгавар`);
    send(res, 200, { result: r });
  } catch (e) {
    src.status = 'error'; db.put('sources', src);
    fail(res, 422, e.message);
  }
});

route('POST', '/api/sources/teams/connect', (req, res, { user }) => {
  const src = db.get('sources', `${user.id}:teams`);
  Object.assign(src, { status: 'connected', account: user.email });
  db.put('sources', src);
  const r = syncTeams(user.id);
  notify(user.id, 'sync', `Teams холбогдлоо: ${r.added} шинэ даалгавар`);
  send(res, 200, { result: r });
});

route('POST', '/api/sources/mel/import', async (req, res, { user, body }) => {
  const name = String(body.filename || '').toLowerCase();
  const content = String(body.content || '');
  let items;
  try {
    if (name.endsWith('.ics')) items = parseIcal(content);
    else if (name.endsWith('.csv')) items = parseCsv(content);
    else return fail(res, 400, 'Дэмжигдэх формат: .ics, .csv');
  } catch (e) { return fail(res, 400, e.message); }
  if (!items.length) return fail(res, 400, 'Файлаас даалгавар олдсонгүй');
  if (body.preview) return send(res, 200, { items });
  const r = upsertFromSource(user.id, 'mel', items, { cancelMissing: false });
  const src = db.get('sources', `${user.id}:mel`);
  Object.assign(src, { lastSync: new Date().toISOString(), via: 'file' });
  db.put('sources', src);
  notify(user.id, 'sync', `MyEnglishLab: ${r.added} даалгавар импортлогдлоо`);
  send(res, 200, { result: r });
});

route('POST', '/api/sources/mel/pearson', (req, res) => fail(res, 403, 'Pearson-ы албан ёсны зөвшөөрөл хараахан баталгаажаагүй тул одоогоор «Файл импортлох»-ыг ашиглана уу.'));

route('POST', '/api/sources/:kind/sync', async (req, res, { user, params }) => {
  try {
    const r = params.kind === 'moodle' ? await syncMoodle(user.id) : params.kind === 'teams' ? syncTeams(user.id) : null;
    if (!r) return fail(res, 400, 'Энэ эх сурвалжийг синк хийх боломжгүй');
    send(res, 200, { result: r });
  } catch (e) { fail(res, 422, e.message); }
});

route('PATCH', '/api/sources/:kind', async (req, res, { user, body, params }) => {
  const src = db.get('sources', `${user.id}:${params.kind}`);
  if (!src) return fail(res, 404, 'Олдсонгүй');
  if ('autoSync' in body) src.autoSync = !!body.autoSync;
  db.put('sources', src);
  send(res, 200, { source: src });
});

route('POST', '/api/sources/:kind/disconnect', (req, res, { user, params }) => {
  const src = db.get('sources', `${user.id}:${params.kind}`);
  if (!src) return fail(res, 404, 'Олдсонгүй');
  Object.assign(src, { status: 'disconnected', url: '', error: null });
  db.put('sources', src);
  send(res, 200, { source: src });
});

route('POST', '/api/sync', async (req, res, { user }) => {
  const out = {};
  for (const k of ['moodle', 'teams']) {
    const s = db.get('sources', `${user.id}:${k}`);
    if (s && s.status !== 'disconnected' && s.autoSync) {
      try { out[k] = k === 'moodle' ? await syncMoodle(user.id) : syncTeams(user.id); } catch (e) { out[k] = { error: e.message }; }
    }
  }
  send(res, 200, { result: out });
});

// --- хичээлийн хуваарь ---
const CLASS_KINDS = ['lecture', 'seminar', 'lab'];

// Хүчинтэй бол цэвэрлэсэн объект, үгүй бол { error } буцаана
function sanitizeClass(body, base = {}) {
  const c = { ...base };
  if ('course' in body) c.course = String(body.course || '').trim().slice(0, 120);
  if ('kind' in body) c.kind = CLASS_KINDS.includes(body.kind) ? body.kind : 'lecture';
  if ('day' in body) c.day = Number(body.day);
  if ('start' in body) c.start = normTime(body.start);
  if ('end' in body) c.end = normTime(body.end);
  if ('room' in body) c.room = String(body.room || '').trim().slice(0, 40);
  if ('teacher' in body) c.teacher = String(body.teacher || '').trim().slice(0, 80);
  if (!c.course) return { error: 'Хичээлийн нэр оруулна уу' };
  if (!Number.isInteger(c.day) || c.day < 0 || c.day > 6) return { error: 'Гараг буруу байна' };
  if (!c.start || !c.end) return { error: 'Цагаа ЦЦ:ММ хэлбэрээр оруулна уу' };
  if (c.end <= c.start) return { error: 'Дуусах цаг эхлэх цагаас хойш байх ёстой' };
  return c;
}

route('GET', '/api/classes', (req, res, { user }) => {
  const classes = db.all('classes', user.id).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  send(res, 200, { classes });
});

route('POST', '/api/classes', async (req, res, { user, body }) => {
  if (body.id && db.get('classes', body.id)) return send(res, 200, { class: db.get('classes', body.id) }); // офлайн давхардал
  const now = new Date().toISOString();
  const c = sanitizeClass(body, { id: body.id || db.newId(), userId: user.id, kind: 'lecture', room: '', teacher: '', createdAt: now });
  if (c.error) return fail(res, 400, c.error);
  c.updatedAt = now;
  db.put('classes', c);
  send(res, 201, { class: c });
});

route('PATCH', '/api/classes/:id', async (req, res, { user, body, params }) => {
  const cur = db.get('classes', params.id);
  if (!cur || cur.userId !== user.id) return fail(res, 404, 'Хичээл олдсонгүй');
  const c = sanitizeClass(body, cur);
  if (c.error) return fail(res, 400, c.error);
  c.updatedAt = new Date().toISOString();
  db.put('classes', c);
  send(res, 200, { class: c });
});

route('DELETE', '/api/classes/:id', (req, res, { user, params }) => {
  const c = db.get('classes', params.id);
  if (!c || c.userId !== user.id) return fail(res, 404, 'Хичээл олдсонгүй');
  db.remove('classes', c.id);
  send(res, 200, { ok: true });
});

// CSV импорт: preview=true бол зөвхөн шалгаж харуулна, replace=true бол хуучин хуваарийг солино
route('POST', '/api/classes/import', async (req, res, { user, body }) => {
  let parsed;
  try { parsed = parseScheduleCsv(String(body.content || '')); } catch (e) { return fail(res, 400, e.message); }
  const { items, errors } = parsed;
  if (!items.length) return fail(res, 400, errors.length ? `Зөв мөр олдсонгүй. ${errors[0].line}-р мөр: ${errors[0].error}` : 'Файлаас хичээл олдсонгүй', { errors });
  if (body.preview) return send(res, 200, { items, errors });
  const existing = db.all('classes', user.id);
  if (body.replace) for (const c of existing) db.remove('classes', c.id);
  const keep = body.replace ? [] : existing;
  const same = (a, b) => a.course === b.course && a.day === b.day && a.start === b.start;
  const now = new Date().toISOString();
  let added = 0; let skipped = 0;
  for (const it of items) {
    if (keep.some((c) => same(c, it))) { skipped++; continue; }
    const c = { id: db.newId(), userId: user.id, ...it, createdAt: now, updatedAt: now };
    db.put('classes', c); keep.push(c); added++;
  }
  notify(user.id, 'sync', `Хуваарь импортлогдлоо: ${added} хичээл`);
  send(res, 200, { result: { added, skipped, errors: errors.length } });
});

// --- settings ---
route('GET', '/api/settings', (req, res, { user }) => send(res, 200, { settings: settingsOf(user.id) }));
route('PUT', '/api/settings', async (req, res, { user, body }) => {
  const s = settingsOf(user.id);
  if (Array.isArray(body.defaultReminders)) s.defaultReminders = body.defaultReminders.map(Number).filter((n) => n > 0).sort((a, b) => b - a);
  if ([5, 15, 30, 60].includes(Number(body.syncInterval))) s.syncInterval = Number(body.syncInterval);
  if (/^\d{2}:\d{2}$/.test(body.quietStart || '')) s.quietStart = body.quietStart;
  if (/^\d{2}:\d{2}$/.test(body.quietEnd || '')) s.quietEnd = body.quietEnd;
  if ('morningSummary' in body) s.morningSummary = !!body.morningSummary;
  db.put('settings', s);
  send(res, 200, { settings: s });
});

// --- notifications ---
route('GET', '/api/notifications', (req, res, { user }) => {
  const list = db.all('notifications', user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  send(res, 200, { notifications: list });
});
route('POST', '/api/notifications/read', (req, res, { user }) => {
  for (const n of db.all('notifications', user.id)) if (!n.read) { n.read = true; db.put('notifications', n); }
  send(res, 200, { ok: true });
});

// ---------- статик файл ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  if (!r) return fail(res, 404, 'Олдсонгүй');
  const m = url.pathname.match(r.re);
  const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  let user = null;
  if (r.auth) {
    const p = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    user = p && !p.reset ? db.get('users', p.uid) : null;
    if (!user) return fail(res, 401, 'Дахин нэвтэрнэ үү', { code: 'unauthorized' });
  }
  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    await r.handler(req, res, { user, body, params, query: url.searchParams });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Серверийн алдаа гарлаа');
  }
});

// Арын синк: хэрэглэгч бүрийн тохируулсан давтамжаар Moodle/Teams-ийг шинэчилнэ
setInterval(async () => {
  for (const u of db.all('users')) {
    const s = settingsOf(u.id);
    for (const k of ['moodle', 'teams']) {
      const src = db.get('sources', `${u.id}:${k}`);
      if (!src || src.status === 'disconnected' || !src.autoSync) continue;
      const last = src.lastSync ? new Date(src.lastSync).getTime() : 0;
      if (Date.now() - last < s.syncInterval * 60e3) continue;
      try { k === 'moodle' ? await syncMoodle(u.id) : syncTeams(u.id); } catch (_) { /* төлөв нь 'error' болно */ }
    }
  }
}, 60e3).unref();

seedDemo();
server.listen(PORT, () => {
  console.log(`\nStudyRemind ажиллаж байна → http://localhost:${PORT}`);
  console.log(`Өгөгдлийн сан: ${db.kind === 'sqlite' ? 'SQLite (data/studyremind.db)' : 'JSON (data/studyremind.json)'}`);
  console.log('Демо нэвтрэх: namjaa@example.mn / password123\n');
});
