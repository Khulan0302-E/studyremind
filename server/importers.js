// iCal (Moodle-ийн календарийн экспорт) болон CSV импорт.

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescape(v) {
  return (v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

// 20261102T100000Z | 20261102T100000 | 20261102
function parseIcalDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '00', z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
  // "Z"-гүй (TZID-тэй эсвэл floating) цагийг Улаанбаатарын цаг (UTC+8) гэж үзнэ
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 8, +mi, +s)).toISOString();
}

const EXAM_RE = /(quiz|exam|test|шалгалт|сорил|тест|явц)/i;

function cleanMoodleTitle(summary) {
  // Moodle: "Лаб 5 is due", "Quiz 3 closes", "Quiz 3 opens"
  return summary.replace(/\s+(is due|closes|opens|due|хаагдана|дуусна)$/i, '').trim();
}

function parseIcal(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(';');
    cur[name.toUpperCase()] = { value, params: paramParts.join(';') };
  }
  return events
    .filter((e) => e.SUMMARY && (e.DTEND || e.DTSTART))
    .filter((e) => !/opens$/i.test(e.SUMMARY.value.trim()))
    .map((e) => {
      const dt = e.DTEND && e.DTSTART && e.DTEND.value !== e.DTSTART.value ? e.DTSTART : (e.DTSTART || e.DTEND);
      const title = cleanMoodleTitle(unescape(e.SUMMARY.value));
      return {
        extUid: e.UID ? e.UID.value : `${title}-${dt.value}`,
        title,
        course: unescape(e.CATEGORIES ? e.CATEGORIES.value : '') || 'Moodle',
        due: parseIcalDate(dt.value, dt.params),
        type: EXAM_RE.test(title) ? 'exam' : 'assignment',
        notes: unescape(e.DESCRIPTION ? e.DESCRIPTION.value : ''),
      };
    })
    .filter((e) => e.due);
}

// CSV: title,course,due,type   (due = 2026-11-04 23:59)
function parseCsv(text) {
  const rows = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!rows.length) return [];
  const split = (l) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if ((ch === ',' || ch === ';') && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(rows[0]).map((h) => h.toLowerCase());
  const col = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ti = col(['title', 'гарчиг', 'нэр', 'name']);
  const ci = col(['course', 'хичээл']);
  const di = col(['due', 'огноо', 'date', 'хугацаа']);
  const yi = col(['type', 'төрөл']);
  if (ti < 0 || di < 0) throw new Error('CSV-д "title" ба "due" багана заавал байна');
  return rows.slice(1).map((r, i) => {
    const c = split(r);
    const m = (c[di] || '').match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    const [, y, mo, d, h = '23', mi = '59'] = m;
    const due = new Date(Date.UTC(+y, +mo - 1, +d, +h - 8, +mi)).toISOString();
    const type = /exam|шалгалт/i.test(c[yi] || '') || EXAM_RE.test(c[ti]) ? 'exam' : 'assignment';
    return { extUid: `csv-${c[ti]}-${due}`, title: c[ti], course: c[ci] || 'Англи хэл I', due, type, notes: '' };
  }).filter(Boolean);
}

// ---------- Хичээлийн хуваарь (CSV) ----------
// Жишээ: course,day,start,end,room,teacher,type
//        Математик I,Даваа,08:00,09:30,3-304,Б.Болд,Лекц
// «time» баганад «08:00-09:30» гэж нэг дор бичиж болно. Тусгаарлагч: , эсвэл ;
const DAY_NAMES = [
  ['даваа', 'да', 'mon', 'monday', '1'],
  ['мягмар', 'мя', 'tue', 'tuesday', '2'],
  ['лхагва', 'лх', 'wed', 'wednesday', '3'],
  ['пүрэв', 'пү', 'thu', 'thursday', '4'],
  ['баасан', 'ба', 'fri', 'friday', '5'],
  ['бямба', 'бя', 'sat', 'saturday', '6'],
  ['ням', 'ня', 'sun', 'sunday', '7'],
];

function parseDay(v) {
  const s = String(v || '').trim().toLowerCase().replace(/\.$/, '');
  const i = DAY_NAMES.findIndex((names) => names.includes(s));
  return i;
}

function normTime(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function parseKind(v) {
  const s = String(v || '').toLowerCase();
  if (/сем|sem/.test(s)) return 'seminar';
  if (/лаб|lab|дадлага|practic/.test(s)) return 'lab';
  return 'lecture';
}

function splitCsvLine(l) {
  const out = []; let cur = ''; let q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if ((ch === ',' || ch === ';') && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Мөр бүрийг шалгаж, зөвийг нь items-д, алдаатайг errors-д буцаана
function parseScheduleCsv(text) {
  const rows = String(text).replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!rows.length) return { items: [], errors: [] };
  const header = splitCsvLine(rows[0]).map((h) => h.toLowerCase());
  const col = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const ci = col(['course', 'хичээл', 'subject']);
  const di = col(['day', 'гараг', 'өдөр', 'weekday']);
  const si = col(['start', 'эхлэх', 'from']);
  const ei = col(['end', 'дуусах', 'to']);
  const ti = col(['time', 'цаг']);
  const ri = col(['room', 'танхим', 'анги', 'байр']);
  const pi = col(['teacher', 'багш', 'instructor']);
  const ki = col(['type', 'төрөл', 'kind']);
  if (ci < 0 || di < 0 || ((si < 0 || ei < 0) && ti < 0)) {
    throw new Error('CSV-д «course», «day», «start», «end» (эсвэл «time») багана заавал байна');
  }
  const items = []; const errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const c = splitCsvLine(r);
    const course = (c[ci] || '').slice(0, 120);
    const day = parseDay(c[di]);
    let start = si >= 0 ? normTime(c[si]) : null;
    let end = ei >= 0 ? normTime(c[ei]) : null;
    if ((!start || !end) && ti >= 0) {
      const [a, b] = String(c[ti] || '').split(/\s*[-–—]\s*/);
      start = start || normTime(a); end = end || normTime(b);
    }
    if (!course) return errors.push({ line, error: 'Хичээлийн нэр хоосон' });
    if (day < 0) return errors.push({ line, error: `«${c[di] || ''}» гараг танигдсангүй (Даваа … Ням)` });
    if (!start || !end) return errors.push({ line, error: 'Цаг буруу (жишээ нь 08:00)' });
    if (end <= start) return errors.push({ line, error: 'Дуусах цаг эхлэх цагаас хойш байх ёстой' });
    items.push({
      course, day, start, end,
      room: ri >= 0 ? (c[ri] || '').slice(0, 40) : '',
      teacher: pi >= 0 ? (c[pi] || '').slice(0, 80) : '',
      kind: ki >= 0 ? parseKind(c[ki]) : 'lecture',
    });
  });
  return { items, errors };
}

module.exports = { parseIcal, parseCsv, parseScheduleCsv, normTime };
