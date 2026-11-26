import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Login from './components/Login.jsx';
import Desktop from './components/Desktop.jsx';
import Mobile from './components/Mobile.jsx';
import Connections from './components/Connections.jsx';
import TaskModal from './components/TaskModal.jsx';
import ClassModal from './components/ClassModal.jsx';
import { ImportDialog } from './components/Schedule.jsx';
import { NotificationsPanel, OfflineBar, Toast } from './components/common.jsx';
import { LS, api, clearSession, getToken, mutate, queue, setToken } from './api.js';
import { addDays, countdown, dayKey, isActive, keyParts, nowUb, parts, todayKey, weekStart } from './utils.js';

const DEFAULT_SETTINGS = { defaultReminders: [1440, 180], syncInterval: 15, quietStart: '23:00', quietEnd: '07:00', morningSummary: true };

function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  return m;
}

const minutesOfDay = (date) => { const p = parts(date); return p.h * 60 + p.mi; };
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
// Дараалалд байгаа офлайн өөрчлөлтийг серверийн жагсаалт дээр давхарлана
function overlayQueue(list, base, extra = {}) {
  for (const op of queue.list()) {
    if (op.url === base && op.method === 'POST' && !list.some((x) => x.id === op.body.id)) list = [...list, { ...op.body, ...extra, _pending: true }];
    if (!op.url.startsWith(`${base}/`)) continue;
    const id = op.url.split('/').pop();
    if (op.method === 'PATCH') list = list.map((x) => (x.id === id ? { ...x, ...op.body, _pending: true } : x));
    if (op.method === 'DELETE') list = list.filter((x) => x.id !== id);
  }
  return list;
}

function inQuiet(date, s) {
  const a = toMin(s.quietStart); const b = toMin(s.quietEnd); const x = minutesOfDay(date);
  if (a === b) return false;
  return a < b ? x >= a && x < b : x >= a || x < b;
}

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? LS.get('sr_user', null) : null));
  const [tasks, setTasks] = useState(() => LS.get('sr_tasks', []));
  const [sources, setSources] = useState(() => LS.get('sr_sources', []));
  const [classes, setClasses] = useState(() => LS.get('sr_classes', []));
  const [classModal, setClassModal] = useState(null); // { cls } | { cls: null, defaults }
  const [importOpen, setImportOpen] = useState(false);
  const [schedDay, setSchedDay] = useState(() => nowUb().wd);
  const [settings, setSettings] = useState(() => LS.get('sr_settings', DEFAULT_SETTINGS));
  const [serverNotifs, setServerNotifs] = useState([]);
  const [localNotifs, setLocalNotifs] = useState(() => LS.get('sr_local_notifs', []));
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(() => LS.get('sr_lastSync', null));
  const [pending, setPending] = useState(() => queue.list().length);
  const [toast, setToastState] = useState(null);
  const [modal, setModal] = useState(null); // { task } | { task: null, date }
  const [bellOpen, setBellOpen] = useState(false);
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const [, tick] = useState(0);

  const isDesktop = useIsDesktop();
  const today = todayKey();
  const tp = keyParts(today);
  const [view, setView] = useState('Сар');
  const [page, setPage] = useState('calendar');
  const [tab, setTab] = useState('list');
  const [month, setMonth] = useState({ y: tp.y, m: tp.m });
  const [selected, setSelected] = useState(today);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ moodle: true, teams: true, mel: true, manual: true });
  const toastTimer = useRef(null);

  const showToast = useCallback((text, action) => {
    clearTimeout(toastTimer.current);
    setToastState({ text, action });
    toastTimer.current = setTimeout(() => setToastState(null), action ? 5000 : 2800);
  }, []);

  const saveTasks = (list) => { setTasks(list); LS.set('sr_tasks', list); };
  const saveClasses = (list) => { setClasses(list); LS.set('sr_classes', list); };
  const classesRef = useRef(classes);
  classesRef.current = classes;

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [t, s, st, n, c] = await Promise.all([api('GET', '/tasks'), api('GET', '/sources'), api('GET', '/settings'), api('GET', '/notifications'), api('GET', '/classes')]);
      saveTasks(overlayQueue(t.tasks, '/tasks', { source: 'manual' }));
      saveClasses(overlayQueue(c.classes, '/classes'));
      setSources(s.sources); LS.set('sr_sources', s.sources);
      setSettings(st.settings); LS.set('sr_settings', st.settings);
      setServerNotifs(n.notifications);
      const now = new Date().toISOString();
      setLastSync(now); LS.set('sr_lastSync', now);
      setOnline(true);
    } catch (e) {
      if (e.status === 401) { clearSession(); setUser(null); }
      if (e.offline) setOnline(false);
    }
  }, []);

  const flush = useCallback(async () => {
    if (!queue.list().length) return;
    setPending(queue.list().length);
    const r = await queue.flush();
    setPending(r.left);
    if (r.sent) showToast(`Офлайн хийсэн ${r.sent} өөрчлөлт синк хийгдлээ`);
  }, [showToast]);

  // эхлэх, онлайн/офлайн
  useEffect(() => {
    if (!user) return;
    (async () => { await flush(); await load(); })();
    const goOnline = async () => { setOnline(true); await flush(); await load(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const refresh = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60e3);
    const clock = setInterval(() => tick((x) => x + 1), 30e3);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); clearInterval(refresh); clearInterval(clock); };
  }, [user, load, flush]);

  // тохируулсан давтамжаар эх сурвалжуудыг синк хийх
  useEffect(() => {
    if (!user) return;
    const id = setInterval(async () => { if (navigator.onLine) { try { await api('POST', '/sync'); await load(); } catch (_) { /* */ } } }, settings.syncInterval * 60e3);
    return () => clearInterval(id);
  }, [user, settings.syncInterval, load]);

  // ---- үйлдлүүд ----
  const applyLocal = (id, patch) => saveTasks(tasksRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const toggle = useCallback(async (task, value) => {
    const done = value ?? !task.done;
    applyLocal(task.id, { done, doneAt: done ? new Date().toISOString() : null });
    const undo = () => toggle({ ...task, done }, !done);
    if (value === undefined) showToast(done ? 'Дууссан гэж тэмдэглэлээ' : 'Дахин идэвхжүүллээ', { label: 'Буцаах', run: undo });
    try {
      const { queued } = await mutate('PATCH', `/tasks/${task.id}`, { done });
      if (queued) { applyLocal(task.id, { _pending: true }); setPending(queue.list().length); }
    } catch (e) { applyLocal(task.id, { done: task.done }); showToast(e.message); }
  }, [showToast]);

  async function saveModal(data) {
    const editing = modal.task;
    setModal(null);
    if (editing) {
      applyLocal(editing.id, data);
      try {
        const { queued, data: r } = await mutate('PATCH', `/tasks/${editing.id}`, data);
        if (queued) { applyLocal(editing.id, { _pending: true }); setPending(queue.list().length); } else applyLocal(editing.id, { ...r.task, _pending: false });
        showToast('Хадгалагдлаа');
      } catch (e) { showToast(e.message); }
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const local = { id, source: 'manual', done: false, cancelled: false, ...data, createdAt: new Date().toISOString() };
      saveTasks([...tasksRef.current, local]);
      try {
        const { queued, data: r } = await mutate('POST', '/tasks', { id, ...data });
        if (queued) { applyLocal(id, { _pending: true }); setPending(queue.list().length); showToast('Офлайн хадгаллаа — интернэт орж ирэхэд синк хийнэ'); } else { applyLocal(id, r.task); showToast('Даалгавар нэмэгдлээ'); }
      } catch (e) { saveTasks(tasksRef.current.filter((t) => t.id !== id)); showToast(e.message); }
    }
  }

  async function deleteTask(task) {
    setModal(null);
    saveTasks(tasksRef.current.filter((t) => t.id !== task.id));
    try { const { queued } = await mutate('DELETE', `/tasks/${task.id}`); if (queued) setPending(queue.list().length); showToast('Устгагдлаа'); } catch (e) { showToast(e.message); }
  }

  // ---- хичээлийн хуваарь ----
  async function saveClass(data) {
    const editing = classModal.cls;
    setClassModal(null);
    const apply = (id, patch) => saveClasses(classesRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (editing) {
      apply(editing.id, data);
      try {
        const { queued, data: r } = await mutate('PATCH', `/classes/${editing.id}`, data);
        if (queued) { apply(editing.id, { _pending: true }); setPending(queue.list().length); } else apply(editing.id, { ...r.class, _pending: false });
        showToast('Хичээл хадгалагдлаа');
      } catch (e) { apply(editing.id, editing); showToast(e.message); }
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      saveClasses([...classesRef.current, { id, ...data }]);
      try {
        const { queued, data: r } = await mutate('POST', '/classes', { id, ...data });
        if (queued) { apply(id, { _pending: true }); setPending(queue.list().length); showToast('Офлайн хадгаллаа — интернэт орж ирэхэд синк хийнэ'); } else { apply(id, r.class); showToast('Хичээл нэмэгдлээ'); }
      } catch (e) { saveClasses(classesRef.current.filter((c) => c.id !== id)); showToast(e.message); }
    }
  }

  async function deleteClass(cls) {
    setClassModal(null);
    const before = classesRef.current;
    saveClasses(before.filter((c) => c.id !== cls.id));
    const undo = async () => {
      saveClasses([...classesRef.current, cls]);
      try { await mutate('POST', '/classes', cls); } catch (e) { showToast(e.message); }
    };
    try {
      const { queued } = await mutate('DELETE', `/classes/${cls.id}`);
      if (queued) setPending(queue.list().length);
      showToast('Хичээл устгагдлаа', { label: 'Буцаах', run: undo });
    } catch (e) { saveClasses(before); showToast(e.message); }
  }

  async function updateSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next); LS.set('sr_settings', next);
    try { await api('PUT', '/settings', patch); } catch (e) { showToast(e.offline ? 'Офлайн үед тохиргоо хадгалагдахгүй' : e.message); }
  }

  function onLoggedIn(r, remember) {
    setToken(r.token, remember);
    LS.set('sr_user', r.user);
    setUser(r.user);
  }
  function logout() { clearSession(); setUser(null); saveTasks([]); saveClasses([]); }

  // ---- сануулга (FR-10–13, FR-19, FR-23) ----
  const notifyOS = useCallback(async (title, body, task) => {
    const n = { id: `l${Date.now()}${Math.random()}`, kind: 'reminder', text: `${title}: ${body}`, at: new Date().toISOString(), read: false, taskId: task?.id };
    setLocalNotifs((cur) => { const list = [n, ...cur].slice(0, 30); LS.set('sr_local_notifs', list); return list; });
    if (task && task.channels && !task.channels.push) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const opts = { body, tag: task ? `task-${task.id}` : 'summary', data: { taskId: task?.id }, icon: '/icon.svg', badge: '/icon.svg' };
        if (reg) await reg.showNotification(title, { ...opts, actions: task ? [{ action: 'done', title: 'Дууссан' }, { action: 'snooze', title: '10 мин дараа' }] : [] });
        else new Notification(title, opts);
      } catch (_) { /* */ }
    }
    showToast(`🔔 ${title}: ${body}`);
  }, [showToast]);

  useEffect(() => {
    if (!user) return;
    const check = () => {
      const now = Date.now();
      const fired = LS.get('sr_fired', {});
      const snooze = LS.get('sr_snooze', {});
      for (const t of tasksRef.current) {
        if (!isActive(t)) continue;
        const due = new Date(t.due).getTime();
        for (const r of t.reminders || []) {
          let at = due - r * 60e3;
          if (inQuiet(new Date(at), settings)) {
            // чимээгүй цагийн төгсгөл хүртэл хойшлуулна; хугацаа түүнээс өмнө дуусах бол үл харгалзана
            for (let i = 0; i < 24 * 60 && inQuiet(new Date(at), settings); i += 5) at += 5 * 60e3;
            if (at >= due) at = due - r * 60e3;
          }
          const key = `${t.id}:${r}:${t.due}`;
          if (now >= at && now - at < 2 * 3600e3 && now < due && !fired[key]) {
            fired[key] = now;
            notifyOS(`${t.course} — ${countdown(t.due)}`, t.title, t);
          }
        }
        if (snooze[t.id] && now >= snooze[t.id]) {
          delete snooze[t.id];
          notifyOS(`${t.course} — ${countdown(t.due)}`, t.title, t);
        }
      }
      // Өглөөний тойм 08:00
      const p = parts(new Date());
      const sk = `summary:${todayKey()}`;
      if (settings.morningSummary && p.h >= 8 && p.h < 12 && !fired[sk]) {
        fired[sk] = now;
        const list = tasksRef.current.filter((t) => isActive(t) && dayKey(t.due) === todayKey());
        if (list.length) notifyOS('Өдрийн тойм', `Өнөөдөр ${list.length} даалгавар: ${list.map((t) => t.title).slice(0, 3).join(', ')}`);
      }
      for (const k of Object.keys(fired)) if (now - fired[k] > 14 * 864e5) delete fired[k];
      LS.set('sr_fired', fired); LS.set('sr_snooze', snooze);
    };
    check();
    const id = setInterval(check, 20e3);
    return () => clearInterval(id);
  }, [user, settings, notifyOS]);

  // Service worker-ийн мэдэгдлийн товч болон ?task= холбоос
  const handleAction = useCallback((taskId, action) => {
    const t = tasksRef.current.find((x) => x.id === taskId);
    if (!t) return;
    if (action === 'done') toggle(t, true);
    else if (action === 'snooze') { const s = LS.get('sr_snooze', {}); s[taskId] = Date.now() + 10 * 60e3; LS.set('sr_snooze', s); showToast('10 минутын дараа дахин сануулна'); }
    else setModal({ task: t });
  }, [toggle, showToast]);

  useEffect(() => {
    if (!user) return;
    const onMsg = (e) => { if (e.data?.type === 'notif-action') handleAction(e.data.taskId, e.data.action); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    const qs = new URLSearchParams(location.search);
    if (qs.get('task')) { setTimeout(() => handleAction(qs.get('task'), qs.get('action')), 500); history.replaceState(null, '', '/'); }
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [user, handleAction]);

  async function enableNotifications() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === 'granted') showToast('Мэдэгдэл идэвхжлээ');
  }

  async function openBell() {
    setBellOpen(!bellOpen);
    if (!bellOpen) {
      setLocalNotifs((cur) => { const l = cur.map((n) => ({ ...n, read: true })); LS.set('sr_local_notifs', l); return l; });
      try { await api('POST', '/notifications/read'); } catch (_) { /* */ }
      setTimeout(() => setServerNotifs((c) => c.map((n) => ({ ...n, read: true }))), 1500);
    }
  }

  // ---- харагдах өгөгдөл ----
  const visible = useMemo(() => tasks.filter((t) => filters[t.source] && (!search || `${t.title} ${t.course}`.toLowerCase().includes(search.toLowerCase()))), [tasks, filters, search]);
  const stats = useMemo(() => {
    const ws = weekStart(today); const we = addDays(ws, 6);
    const week = tasks.filter((t) => !t.cancelled && dayKey(t.due) >= ws && dayKey(t.due) <= we);
    return {
      program: user?.program || 'МС · 1-р курс',
      today: tasks.filter((t) => isActive(t) && dayKey(t.due) === today).length,
      week: week.filter((t) => !t.done).length,
      weekDone: week.filter((t) => t.done).length,
      weekTotal: week.length,
    };
  }, [tasks, today, user]);
  const next = useMemo(() => tasks.filter((t) => isActive(t) && new Date(t.due) > Date.now()).sort((a, b) => a.due.localeCompare(b.due))[0], [tasks, toast]);
  const courses = useMemo(() => [...new Set([...classes.map((c) => c.course), ...tasks.map((t) => t.course)].filter(Boolean))], [tasks, classes]);
  const notifs = useMemo(() => [...localNotifs, ...serverNotifs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30), [localNotifs, serverNotifs]);
  const unread = notifs.filter((n) => !n.read).length;

  if (!user) return <Login onLoggedIn={onLoggedIn} />;

  const openTask = (t) => setModal({ task: t });
  const onAdd = () => setModal({ task: null, date: isDesktop && selected >= today ? selected : undefined });
  const connections = (
    <Connections
      sources={sources} settings={settings} user={user} online={online}
      onBack={() => (isDesktop ? setPage('calendar') : setTab('list'))}
      onChanged={load} onSettings={updateSettings} onLogout={logout} toast={showToast}
    />
  );
  const bellPanel = <NotificationsPanel items={notifs} permission={permission} onEnable={enableNotifications} onClose={() => setBellOpen(false)} />;
  const common = {
    user, tasks: visible, allTasks: tasks, sources, filters, setFilters, search, setSearch, onOpen: openTask, onToggle: (t) => toggle(t),
    onAdd, next, stats, month, setMonth, selected, setSelected, connections, unread, bellOpen, bellPanel, onBell: openBell,
    permission, onEnableNotifications: enableNotifications,
    classes, schedDay, setSchedDay,
    onOpenClass: (c) => setClassModal({ cls: c }),
    onAddClass: (defaults) => setClassModal({ cls: null, defaults }),
    onImportClasses: () => (online ? setImportOpen(true) : showToast('CSV импорт хийхэд интернэт хэрэгтэй')),
  };

  return (
    <div className="app" onClick={() => bellOpen && setBellOpen(false)}>
      <OfflineBar online={online} lastSync={lastSync} pending={pending} />
      {isDesktop
        ? <Desktop {...common} view={view} setView={setView} page={page} setPage={setPage} />
        : <Mobile {...common} tab={tab} setTab={setTab} />}
      {classModal && <ClassModal cls={classModal.cls} defaults={classModal.defaults} courses={courses} onSave={saveClass} onDelete={deleteClass} onClose={() => setClassModal(null)} />}
      {importOpen && <ImportDialog hasClasses={classes.length > 0} toast={showToast} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
      {modal && <TaskModal task={modal.task} defaultDate={modal.date} settings={settings} courses={courses} onSave={saveModal} onDelete={deleteTask} onClose={() => setModal(null)} />}
      <Toast toast={toast} onClose={() => setToastState(null)} />
    </div>
  );
}
