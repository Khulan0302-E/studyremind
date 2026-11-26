import Icon from '../icons.jsx';
import { Checkbox, Logo, Badge, SourceLabel, EmptyState } from './common.jsx';
import { GroupedList, DoneList, ReminderBanner } from './lists.jsx';
import { TimetableGrid, TodayClasses } from './Schedule.jsx';
import {
  SOURCES, WEEKDAYS, addDays, ago, dayKey, diffDays, durationLabel, isActive, keyParts, longDate, reminderLabel, shortDate, timeStr, toMinutes, todayKey, weekStart,
} from '../utils.js';

function Sidebar({ allTasks, sources, filters, setFilters, onAdd, onConnections, stats, permission, onEnableNotifications }) {
  const order = ['moodle', 'teams', 'mel', 'manual'];
  const count = (k) => allTasks.filter((t) => t.source === k && !t.cancelled).length;
  const src = Object.fromEntries((sources || []).map((s) => [s.kind, s]));
  const synced = ['moodle', 'teams'].filter((k) => src[k]?.status === 'connected');
  return (
    <aside className="sidebar">
      <Logo sub={stats.program} />
      <button className="btn btn-primary btn-block" onClick={onAdd}><Icon name="plus" size={18} />Даалгавар нэмэх</button>
      <div className="stats">
        <div className="stat stat-red"><b>{stats.today}</b><span>Өнөөдөр</span></div>
        <div className="stat stat-blue"><b>{stats.week}</b><span>Энэ 7 хоног</span></div>
      </div>
      <div className="week-progress">
        <div className="field-row"><strong>Энэ 7 хоногийн явц</strong><span className="link strong">{stats.weekDone}/{stats.weekTotal} дууссан</span></div>
        <div className="progress"><span style={{ width: `${stats.weekTotal ? (stats.weekDone / stats.weekTotal) * 100 : 0}%` }} /></div>
      </div>
      <div className="side-label">ЭХ СУРВАЛЖ</div>
      <ul className="src-filter">
        {order.map((k) => (
          <li key={k}>
            <Checkbox size="sm" checked={filters[k]} color={SOURCES[k].color} label={`${SOURCES[k].name} шүүх`} onChange={(v) => setFilters({ ...filters, [k]: v })} />
            <i className="dot" style={{ background: SOURCES[k].color }} />
            <span>{k === 'manual' ? 'Гараар нэмсэн' : SOURCES[k].short}</span>
            <small>{count(k)}</small>
          </li>
        ))}
      </ul>
      <div className="sync-card">
        <div className="sync-title"><Icon name="refresh" size={15} />Синк хийгдсэн</div>
        {synced.length > 0 && <small className="muted">{synced.map((k) => SOURCES[k].short).join(', ')} — {ago(src[synced[0]].lastSync)}</small>}
        {src.mel?.lastSync && <small className="muted">MyEnglishLab — {ago(src.mel.lastSync)}</small>}
        {['moodle', 'teams'].some((k) => src[k]?.status === 'error') && <small className="danger-text">Moodle синк алдаатай</small>}
        <button className="link strong" onClick={onConnections}>Холболт тохируулах →</button>
      </div>
      {permission !== 'granted' && permission !== 'unsupported' && (
        <div className="sync-card perm">
          <div className="sync-title"><Icon name="bell" size={15} />Мэдэгдэл унтраалттай</div>
          <small className="muted">Хугацаа дуусахаас өмнө сануулга авахын тулд зөвшөөрнө үү.</small>
          <button className="link strong" onClick={onEnableNotifications} disabled={permission === 'denied'}>{permission === 'denied' ? 'Хөтчийн тохиргооноос зөвшөөрнө үү' : 'Идэвхжүүлэх →'}</button>
        </div>
      )}
    </aside>
  );
}

function Chip({ task, onOpen }) {
  const s = SOURCES[task.source];
  return (
    <button className={`ev ${task.done || task.cancelled ? 'ev-done' : ''}`} style={{ background: task.done ? 'var(--gray-100)' : s.tint, color: task.done ? 'var(--muted)' : s.color }} onClick={(e) => { e.stopPropagation(); onOpen(task); }} title={`${timeStr(task.due)} ${task.title}`}>
      <i style={{ background: s.color }} />{timeStr(task.due) !== '23:59' && <b className="ev-time">{timeStr(task.due)}</b>}<span className="ev-title">{task.title}</span>
    </button>
  );
}

function MonthGrid({ month, tasks, selected, setSelected, onOpen }) {
  const first = `${month.y}-${String(month.m).padStart(2, '0')}-01`;
  const start = weekStart(first);
  const today = todayKey();
  const byDay = {};
  for (const t of tasks) (byDay[dayKey(t.due)] ||= []).push(t);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="month card">
      <div className="month-head">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
      <div className="month-grid">
        {days.map((k) => {
          const p = keyParts(k);
          const list = (byDay[k] || []).sort((a, b) => a.due.localeCompare(b.due));
          return (
            <div key={k} role="button" tabIndex={0} className={`cell ${p.m !== month.m ? 'out' : ''} ${k === selected ? 'sel' : ''}`} onClick={() => setSelected(k)} onKeyDown={(e) => e.key === 'Enter' && setSelected(k)} aria-label={longDate(k)}>
              <span className={`num ${k === today ? 'today' : ''}`}>{p.d}</span>
              {list.slice(0, 3).map((t) => <Chip key={t.id} task={t} onOpen={onOpen} />)}
              {list.length > 3 && <span className="more">+{list.length - 3} бусад</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ anchor, tasks, selected, setSelected, onOpen }) {
  const start = weekStart(anchor);
  const today = todayKey();
  return (
    <div className="week card">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((k) => {
        const list = tasks.filter((t) => dayKey(t.due) === k).sort((a, b) => a.due.localeCompare(b.due));
        const p = keyParts(k);
        return (
          <div key={k} className={`week-col ${k === selected ? 'sel' : ''}`} onClick={() => setSelected(k)}>
            <div className="week-col-head"><small>{WEEKDAYS[p.wd]}</small><span className={`num ${k === today ? 'today' : ''}`}>{p.d}</span></div>
            {list.map((t) => <Chip key={t.id} task={t} onOpen={onOpen} />)}
          </div>
        );
      })}
    </div>
  );
}

function RightPanel({ tasks, selected, onToggle, onOpen, next, classes, onOpenClass, onShowSchedule }) {
  const dayTasks = tasks.filter((t) => dayKey(t.due) === selected && !t.cancelled).sort((a, b) => a.due.localeCompare(b.due));
  const upcoming = tasks.filter((t) => isActive(t) && new Date(t.due) > Date.now()).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  return (
    <aside className="right-panel">
      <ReminderBanner task={next} compact onOpen={onOpen} />
      <TodayClasses classes={classes} onOpen={onOpenClass} onShowAll={onShowSchedule} />
      <div className="panel-head"><strong>{longDate(selected)}</strong><small className="muted">{dayTasks.length} даалгавар</small></div>
      {dayTasks.length === 0 && <p className="muted small pad-y">Энэ өдөр даалгавар алга.</p>}
      <ul className="day-list">
        {dayTasks.map((t) => (
          <li key={t.id} onClick={() => onOpen(t)}>
            <Checkbox checked={t.done} label={`${t.title} дууссан`} onChange={() => onToggle(t)} />
            <span className="bar" style={{ background: SOURCES[t.source].color }} />
            <div className="task-main"><strong className={t.done ? 'struck' : ''}>{t.title}</strong><small className="muted">{timeStr(t.due)} · {SOURCES[t.source].short} · {t.course}</small></div>
          </li>
        ))}
      </ul>
      <div className="panel-head"><strong>Ойртож буй хугацаа</strong></div>
      {upcoming.length === 0 && <p className="muted small">Ойрын хугацаанд даалгавар алга.</p>}
      {upcoming.map((t) => (
        <div key={t.id} className="up-card" onClick={() => onOpen(t)}>
          <div className="up-top"><SourceLabel source={t.source} /><Badge task={t} long /></div>
          <div className="up-title"><Checkbox checked={t.done} label={`${t.title} дууссан`} onChange={() => onToggle(t)} /><strong>{t.title}</strong></div>
          <small className="muted">{t.course}</small>
          <div className="up-foot"><span>{shortDate(dayKey(t.due))} · {timeStr(t.due)}</span>{t.reminders?.length > 0 && <span className="muted"><Icon name="bell" size={13} />{reminderLabel(Math.max(...t.reminders))}</span>}</div>
        </div>
      ))}
    </aside>
  );
}

const VIEWS = ['Хуваарь', '7 хоног', 'Сар', 'Жагсаалт'];
function ViewSwitch({ view, setView }) {
  return (
    <div className="segmented">
      {VIEWS.map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}
    </div>
  );
}

export default function Desktop(props) {
  const { tasks, allTasks, view, setView, page, setPage, month, setMonth, selected, setSelected, search, setSearch, onOpen, onToggle, next, classes, onOpenClass, onAddClass, onImportClasses } = props;
  const weekMinutes = classes.reduce((s, c) => s + toMinutes(c.end) - toMinutes(c.start), 0);
  const today = todayKey();
  const shiftMonth = (n) => {
    if (view === '7 хоног') { const k = addDays(selected, 7 * n); setSelected(k); const p = keyParts(k); setMonth({ y: p.y, m: p.m }); return; }
    let { y, m } = month; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    setMonth({ y, m });
  };
  const goToday = () => { const p = keyParts(today); setMonth({ y: p.y, m: p.m }); setSelected(today); };

  let main;
  if (page === 'connections') main = props.connections;
  else if (page === 'done') {
    main = (
      <div className="main-inner">
        <div className="cal-head"><button className="icon-btn outline" onClick={() => setPage('calendar')} aria-label="Буцах"><Icon name="chevronLeft" size={18} /></button><h1>Дууссан</h1></div>
        <div className="list-wrap"><DoneList tasks={allTasks} onToggle={onToggle} onOpen={onOpen} /></div>
      </div>
    );
  } else if (view === 'Хуваарь') {
    main = (
      <div className="main-inner">
        <div className="cal-head">
          <div>
            <h1>Хичээлийн хуваарь</h1>
            <small className="muted">{classes.length ? `7 хоногт ${classes.length} хичээл · ${durationLabel(weekMinutes)}` : 'Хуваарь хоосон байна'}</small>
          </div>
          <div className="spacer" />
          <button className="btn btn-outline btn-sm" onClick={onImportClasses}><Icon name="upload" size={15} />CSV импорт</button>
          <button className="btn btn-primary btn-sm" onClick={() => onAddClass()}><Icon name="plus" size={15} />Хичээл нэмэх</button>
        </div>
        <div className="toolbar">
          <ViewSwitch view={view} setView={setView} />
          <small className="muted">Хоосон нүдэн дээр дарж тухайн цагт хичээл нэмнэ</small>
        </div>
        {classes.length === 0
          ? <div className="card"><EmptyState title="Хуваариа оруулаарай" text="Хичээлээ нэг нэгээр нь нэмэх эсвэл CSV файлаар семестрийн хуваариа нэг дор оруулна." action={<div className="imp-actions"><button className="btn btn-outline btn-sm" onClick={onImportClasses}><Icon name="upload" size={15} />CSV импорт</button><button className="btn btn-primary btn-sm" onClick={() => onAddClass()}><Icon name="plus" size={15} />Хичээл нэмэх</button></div>} /></div>
          : <TimetableGrid classes={classes} tasks={allTasks} onOpenClass={onOpenClass} onAddAt={onAddClass} onPickDay={setSelected} />}
      </div>
    );
  } else {
    main = (
      <div className="main-inner">
        <div className="cal-head">
          <h1>{view === '7 хоног' ? `${keyParts(weekStart(selected)).m}-р сарын ${keyParts(weekStart(selected)).d} – ${keyParts(addDays(weekStart(selected), 6)).d}` : `${month.y} оны ${month.m}-р сар`}</h1>
          {view !== 'Жагсаалт' && <>
            <button className="icon-btn outline" onClick={() => shiftMonth(-1)} aria-label="Өмнөх"><Icon name="chevronLeft" size={18} /></button>
            <button className="icon-btn outline" onClick={() => shiftMonth(1)} aria-label="Дараах"><Icon name="chevronRight" size={18} /></button>
            <button className="btn btn-outline btn-sm" onClick={goToday}>Өнөөдөр</button>
          </>}
          <div className="spacer" />
          <label className="search"><Icon name="search" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Даалгавар хайх" /></label>
        </div>
        <div className="toolbar">
          <ViewSwitch view={view} setView={setView} />
          <button className="link" onClick={() => setPage('done')}>Дууссан даалгаврууд →</button>
        </div>
        {view === 'Сар' && <MonthGrid month={month} tasks={tasks} selected={selected} setSelected={setSelected} onOpen={onOpen} />}
        {view === '7 хоног' && <WeekView anchor={selected} tasks={tasks} selected={selected} setSelected={setSelected} onOpen={onOpen} />}
        {view === 'Жагсаалт' && <div className="list-wrap">{search && tasks.length === 0 ? <EmptyState title="Илэрц олдсонгүй" text={`«${search}» гэсэн даалгавар алга.`} /> : <GroupedList tasks={tasks.filter(isActive).sort((a, b) => a.due.localeCompare(b.due))} onToggle={onToggle} onOpen={onOpen} />}</div>}
      </div>
    );
  }

  return (
    <div className="desktop">
      <Sidebar {...props} onConnections={() => setPage('connections')} />
      <main className="desk-main">{main}</main>
      {page !== 'connections' && <RightPanel tasks={allTasks.filter((t) => props.filters[t.source])} selected={selected} onToggle={onToggle} onOpen={onOpen} next={next} classes={classes} onOpenClass={onOpenClass} onShowSchedule={view === 'Хуваарь' ? null : () => { setPage('calendar'); setView('Хуваарь'); }} />}
    </div>
  );
}

export { diffDays };
