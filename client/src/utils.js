// Огноо (Улаанбаатарын цаг), эх сурвалж, badge-ийн туслах функцууд
export const TZ = 'Asia/Ulaanbaatar';

export const WEEKDAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
export const WEEKDAYS_SHORT = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function parts(date) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd: WD[p.weekday] };
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (date) => { const p = parts(date); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const timeStr = (date) => { const p = parts(date); return `${pad(p.h)}:${pad(p.mi)}`; };

// "YYYY-MM-DD" + хоног → шинэ түлхүүр
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export const keyParts = (key) => { const [y, m, d] = key.split('-').map(Number); return { y, m, d, wd: (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 }; };
export const diffDays = (a, b) => Math.round((Date.UTC(...toYMD(b)) - Date.UTC(...toYMD(a))) / 864e5);
const toYMD = (key) => { const [y, m, d] = key.split('-').map(Number); return [y, m - 1, d]; };

// Улаанбаатарын огноо + цаг → ISO
export function ubToIso(key, hhmm) {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 8, mi)).toISOString();
}

export const todayKey = () => dayKey(new Date());
export const weekStart = (key) => addDays(key, -keyParts(key).wd);

export function longDate(key) { const p = keyParts(key); return `${WEEKDAYS[p.wd]}, ${p.m}-р сарын ${p.d}`; }
export function shortDate(key) { const p = keyParts(key); return `${WEEKDAYS[p.wd]}, ${p.m}/${p.d}`; }

// Жагсаалтын бүлгийн гарчиг: «Өнөөдөр», «Маргааш · Мягмар», «Лхагва, 11/4»
export function groupLabel(key, today = todayKey()) {
  const n = diffDays(today, key);
  const p = keyParts(key);
  if (n < 0) return 'Хоцорсон';
  if (n === 0) return 'Өнөөдөр';
  if (n === 1) return `Маргааш · ${WEEKDAYS[p.wd]}`;
  return `${WEEKDAYS[p.wd]}, ${p.m}/${p.d}`;
}

// Үлдсэн хугацааны badge: tone = red | yellow | gray
export function dueBadge(task, { long = false } = {}) {
  const now = Date.now();
  const due = new Date(task.due).getTime();
  if (task.done) return { text: 'Дууссан', tone: 'green' };
  if (task.cancelled) return { text: 'Цуцлагдсан', tone: 'gray' };
  if (due < now) return { text: 'Хоцорсон', tone: 'redSolid' };
  const n = diffDays(todayKey(), dayKey(task.due));
  if (n === 0) return { text: 'Өнөөдөр', tone: 'red' };
  if (n === 1) return { text: long ? 'Маргааш' : '1 өдөр', tone: 'red' };
  if (n <= 3) return { text: long ? `${n} өдөр үлдсэн` : `${n} өдөр`, tone: 'yellow' };
  return { text: long ? `${n} өдөр үлдсэн` : `${n} өдөр`, tone: 'gray' };
}

export function countdown(due) {
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return 'Хугацаа дууслаа';
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return `${Math.floor(h / 24)} өдөр ${h % 24} цаг үлдлээ`;
  return h ? `${h} цаг ${m} минут үлдлээ` : `${m} минут үлдлээ`;
}

export const REMINDER_OPTIONS = [
  { min: 15, label: '15 минут өмнө' },
  { min: 60, label: '1 цаг өмнө' },
  { min: 180, label: '3 цаг өмнө' },
  { min: 1440, label: '1 өдөр өмнө' },
  { min: 4320, label: '3 өдөр өмнө' },
  { min: 10080, label: '1 долоо хоног өмнө' },
];

export function reminderLabel(min) {
  if (min < 60) return `${min} минутын өмнө`;
  if (min < 1440) return `${min / 60} цагийн өмнө`;
  if (min % 10080 === 0) return `${min / 10080} долоо хоногийн өмнө`;
  return `${Math.round(min / 1440)} өдрийн өмнө`;
}

export const SOURCES = {
  moodle: { name: 'Moodle', short: 'Moodle', letter: 'M', color: 'var(--moodle)', tint: 'var(--moodle-tint)' },
  teams: { name: 'Microsoft Teams', short: 'Teams', letter: 'T', color: 'var(--teams)', tint: 'var(--teams-tint)' },
  mel: { name: 'MyEnglishLab', short: 'MyEnglishLab', letter: 'E', color: 'var(--mel)', tint: 'var(--mel-tint)' },
  manual: { name: 'Гараар нэмсэн', short: 'Гараар', letter: '•', color: 'var(--manual)', tint: 'var(--manual-tint)' },
};

export const COURSES = ['Програмчлалын үндэс', 'Мэдээллийн системийн үндэс', 'Англи хэл I', 'Математик I'];

export function ago(iso) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  if (m < 1) return 'дөнгөж сая';
  if (m < 60) return `${m} мин өмнө`;
  if (m < 1440) return `${Math.round(m / 60)} цагийн өмнө`;
  return `${Math.round(m / 1440)} өдрийн өмнө`;
}

export const isActive = (t) => !t.done && !t.cancelled;

// ---------- Хичээлийн хуваарь ----------
export const CLASS_KINDS = { lecture: 'Лекц', seminar: 'Семинар', lab: 'Лаб' };

// Хичээл бүрт тогтмол өнгө (нэрээс нь hash хийж сонгоно)
const COURSE_PALETTE = [
  ['#2f4fd8', '#eaeefc'], ['#0f766e', '#e1f3ef'], ['#b45309', '#fdf0dc'], ['#7c3aed', '#f1eafd'],
  ['#be185d', '#fce7f1'], ['#0369a1', '#e0f0fa'], ['#4d7c0f', '#ecf5dc'], ['#b42318', '#fde8e6'],
];
export function courseColor(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [color, tint] = COURSE_PALETTE[h % COURSE_PALETTE.length];
  return { color, tint };
}

export const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
export function durationLabel(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ц ${m} мин` : `${h} цаг`;
}

// Улаанбаатарын цагаар одоо: гараг (0=Даваа) ба өдрийн минут
export function nowUb() { const p = parts(new Date()); return { wd: p.wd, min: p.h * 60 + p.mi }; }

export const sortClasses = (list) => [...list].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

// Өнөөдрийн хичээлийн төлөв: past | now | next | later
export function classStatus(c, list, now = nowUb()) {
  if (c.day !== now.wd) return null;
  const s = toMinutes(c.start); const e = toMinutes(c.end);
  if (now.min >= e) return 'past';
  if (now.min >= s) return 'now';
  const upcoming = list.filter((x) => x.day === now.wd && toMinutes(x.start) > now.min).sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0]?.id === c.id ? 'next' : 'later';
}

// Одоо явагдаж буй эсвэл дараагийн хичээл (7 хоногийн дотор): { cls, now: bool, inDays }
export function currentOrNextClass(list, now = nowUb()) {
  const sorted = sortClasses(list);
  const cur = sorted.find((c) => c.day === now.wd && toMinutes(c.start) <= now.min && now.min < toMinutes(c.end));
  if (cur) return { cls: cur, now: true, inDays: 0 };
  for (let i = 0; i < 7; i++) {
    const wd = (now.wd + i) % 7;
    const c = sorted.find((x) => x.day === wd && (i > 0 || toMinutes(x.start) > now.min));
    if (c) return { cls: c, now: false, inDays: i };
  }
  return null;
}
