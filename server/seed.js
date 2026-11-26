// Демо хэрэглэгч ба дизайн дээрх даалгаврууд (өнөөдрөөс хамааруулж үүсгэнэ).
const db = require('./db');
const { hashPassword } = require('./auth');

const UB_OFFSET_H = 8;

// Улаанбаатарын цагаар өнөөдрөөс dayOffset хоногийн дараах HH:MM → ISO
function ubAt(dayOffset, hhmm) {
  const now = new Date(Date.now() + UB_OFFSET_H * 3600e3);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, h - UB_OFFSET_H, m)).toISOString();
}

const DEFAULT_SETTINGS = {
  defaultReminders: [1440, 180], // 1 өдөр, 3 цагийн өмнө
  syncInterval: 15,
  quietStart: '23:00',
  quietEnd: '07:00',
  morningSummary: true,
};

const P = 'Програмчлалын үндэс';
const E = 'Англи хэл I';
const MS = 'Мэдээллийн системийн үндэс';
const M = 'Математик I';

const DEMO_TASKS = [
  [-5, '23:59', 'Лаб 4: Нөхцөл шалгах', P, 'moodle', 'assignment', true],
  [-3, '23:59', 'Unit 3 Homework', E, 'mel', 'assignment', true],
  [0, '18:00', 'Quiz 3: Хувьсагч ба төрөл', P, 'moodle', 'exam', false, [180]],
  [0, '21:00', 'Үгийн сан давтах', E, 'manual', 'other', false, [60]],
  [1, '23:59', 'Лаб 5: Давталт', P, 'moodle', 'assignment', false, [1440]],
  [2, '23:59', 'Unit 4 Homework', E, 'mel', 'assignment', false, [1440]],
  [3, '23:59', 'Бие даалт 2: Процессын диаграм', MS, 'teams', 'assignment', false, [2880]],
  [4, '10:00', 'Сорил 2', M, 'moodle', 'exam', false, [1440, 180]],
  [4, '12:00', 'Homework 5 шалгуулах', M, 'manual', 'assignment', false, [60]],
  [4, '16:00', 'Багийн уулзалтад бэлдэх', MS, 'manual', 'assignment', false, [60, 1440]],
  [4, '23:59', 'Unit 4 Speaking', E, 'mel', 'assignment', false],
  [7, '20:00', 'Unit 5 Homework', E, 'mel', 'assignment', false],
  [8, '23:59', 'Лаб 6: Массив', P, 'moodle', 'assignment', false],
  [10, '23:59', 'Бие даалт 3: ERD диаграм', MS, 'teams', 'assignment', false],
  [11, '23:59', 'Бодлогын даалгавар 4', M, 'moodle', 'assignment', false],
  [14, '23:59', 'Unit 6 Homework', E, 'mel', 'assignment', false],
  [16, '09:00', 'Явцын шалгалт 1', P, 'moodle', 'exam', false],
  [18, '17:00', 'Багийн төсөл: танилцуулга', MS, 'teams', 'assignment', false],
  [22, '23:59', 'Лаб 7: Функц', P, 'moodle', 'assignment', false],
  [24, '23:59', 'Эссэ: Мэдээллийн систем', MS, 'teams', 'assignment', false],
  [25, '20:00', 'Unit 7 Homework', E, 'mel', 'assignment', false],
  [30, '23:59', 'Бодлогын даалгавар 5', M, 'moodle', 'assignment', false],
];

// Демо хичээлийн хуваарь: [гараг (0=Даваа), эхлэх, дуусах, хичээл, төрөл, танхим, багш]
const DEMO_CLASSES = [
  [0, '08:00', '09:30', M, 'lecture', '3-304', 'Б.Болд'],
  [0, '09:40', '11:10', P, 'lecture', '1-201', 'Д.Сараа'],
  [0, '13:00', '14:30', E, 'seminar', '2-110', 'S. Smith'],
  [1, '09:40', '11:10', MS, 'lecture', '3-401', 'Г.Энхжин'],
  [1, '11:20', '12:50', P, 'lab', 'Комп. лаб 5', 'Д.Сараа'],
  [2, '08:00', '09:30', M, 'seminar', '3-208', 'Б.Болд'],
  [2, '13:00', '14:30', MS, 'seminar', '3-305', 'Г.Энхжин'],
  [3, '09:40', '11:10', E, 'lecture', '2-110', 'S. Smith'],
  [3, '11:20', '12:50', P, 'lab', 'Комп. лаб 5', 'Д.Сараа'],
  [3, '14:40', '16:10', MS, 'lab', 'Комп. лаб 2', 'Г.Энхжин'],
  [4, '08:00', '09:30', M, 'lecture', '3-304', 'Б.Болд'],
  [4, '11:20', '12:50', E, 'seminar', '2-112', 'S. Smith'],
];

function addDemoClasses(userId) {
  const now = new Date().toISOString();
  for (const [day, start, end, course, kind, room, teacher] of DEMO_CLASSES) {
    db.put('classes', { id: db.newId(), userId, course, kind, day, start, end, room, teacher, createdAt: now, updatedAt: now });
  }
}

// Teams-ийн mock даалгаврууд (Microsoft Graph API-ийн оронд)
function teamsMockAssignments() {
  return [
    { extUid: 'teams-bd2', title: 'Бие даалт 2: Процессын диаграм', course: MS, due: ubAt(3, '23:59'), type: 'assignment' },
    { extUid: 'teams-bd3', title: 'Бие даалт 3: ERD диаграм', course: MS, due: ubAt(10, '23:59'), type: 'assignment' },
    { extUid: 'teams-team', title: 'Багийн төсөл: танилцуулга', course: MS, due: ubAt(18, '17:00'), type: 'assignment' },
    { extUid: 'teams-essay', title: 'Эссэ: Мэдээллийн систем', course: MS, due: ubAt(24, '23:59'), type: 'assignment' },
    { extUid: 'teams-quiz', title: 'Forms тест: Өгөгдлийн сан', course: MS, due: ubAt(6, '12:00'), type: 'exam' },
  ];
}

function createUserData(user, { demo }) {
  const now = new Date().toISOString();
  db.put('settings', { id: user.id, userId: user.id, ...DEFAULT_SETTINGS });
  const src = (kind, extra) => db.put('sources', {
    id: `${user.id}:${kind}`, userId: user.id, kind, status: 'disconnected', url: '', autoSync: true, lastSync: null, ...extra,
  });
  if (!demo) {
    src('moodle'); src('teams'); src('mel');
    return;
  }
  src('moodle', { status: 'connected', url: 'demo', lastSync: new Date(Date.now() - 5 * 60e3).toISOString() });
  src('teams', { status: 'connected', lastSync: new Date(Date.now() - 5 * 60e3).toISOString() });
  src('mel', { status: 'disconnected', lastSync: new Date(Date.now() - 60 * 60e3).toISOString(), via: 'file' });
  addDemoClasses(user.id);
  const teamsUid = { 'Бие даалт 2: Процессын диаграм': 'teams-bd2', 'Бие даалт 3: ERD диаграм': 'teams-bd3', 'Багийн төсөл: танилцуулга': 'teams-team', 'Эссэ: Мэдээллийн систем': 'teams-essay' };
  for (const [off, time, title, course, source, type, done, reminders] of DEMO_TASKS) {
    db.put('tasks', {
      id: db.newId(), userId: user.id, source, extUid: source === 'teams' ? teamsUid[title] : (source === 'manual' ? null : `demo-${title}`),
      title, course, type, due: ubAt(off, time), done, doneAt: done ? now : null, cancelled: false,
      reminders: reminders || DEFAULT_SETTINGS.defaultReminders, channels: { push: true, email: false },
      checklist: title.startsWith('Багийн уулзалт')
        ? [{ id: 'c1', text: 'Процессын диаграмын ноорог зурах', done: true }, { id: 'c2', text: 'Багийнхантай үүрэг хуваарилах', done: false }, { id: 'c3', text: 'Слайд бэлдэх', done: false }]
        : [],
      notes: '', createdAt: now, updatedAt: now,
    });
  }
}

function seedDemo() {
  const exists = db.all('users').find((u) => u.email === 'namjaa@example.mn');
  if (exists) {
    // Хуучин өгөгдлийн санд хуваарь байхгүй бол демо хуваарийг нэмнэ
    if (!db.all('classes', exists.id).length) addDemoClasses(exists.id);
    return;
  }
  const { salt, hash } = hashPassword('password123');
  const user = db.put('users', {
    id: db.newId(), userId: null, name: 'Намжаа', email: 'namjaa@example.mn', program: 'МС · 1-р курс',
    salt, hash, failed: 0, lockedUntil: null, createdAt: new Date().toISOString(),
  });
  user.userId = user.id; db.put('users', user);
  createUserData(user, { demo: true });
  console.log('Демо хэрэглэгч үүслээ: namjaa@example.mn / password123');
}

module.exports = { seedDemo, createUserData, teamsMockAssignments, DEFAULT_SETTINGS, ubAt };
