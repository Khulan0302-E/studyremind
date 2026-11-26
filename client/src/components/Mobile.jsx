import { useRef } from 'react';
import Icon from '../icons.jsx';
import { GroupedList, DoneList, ReminderBanner, TaskCard } from './lists.jsx';
import { EmptyState } from './common.jsx';
import { MobileSchedule, NextClassStrip } from './Schedule.jsx';
import { SOURCES, WEEKDAYS_SHORT, WEEKDAYS, addDays, dayKey, isActive, keyParts, longDate, todayKey, weekStart } from '../utils.js';

const TABS = [['list', 'list', 'Жагсаалт'], ['schedule', 'timetable', 'Хуваарь'], ['calendar', 'calendar', 'Хуанли'], ['done', 'check', 'Дууссан'], ['connections', 'link', 'Холболт']];

function WeekStrip({ tasks, selected, onPick }) {
  const today = todayKey();
  const start = weekStart(today);
  return (
    <div className="week-strip">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((k, i) => {
        const first = tasks.find((t) => dayKey(t.due) === k && isActive(t));
        const p = keyParts(k);
        return (
          <button key={k} className={`wd ${k === selected ? 'on' : ''}`} onClick={() => onPick(k)} aria-label={longDate(k)}>
            <small>{WEEKDAYS_SHORT[i]}</small>
            <b>{p.d}</b>
            <i style={{ background: first ? (k === selected ? '#fff' : SOURCES[first.source].color) : 'transparent' }} />
          </button>
        );
      })}
    </div>
  );
}

function MobileCalendar({ tasks, month, setMonth, selected, setSelected, onOpen, onToggle }) {
  const first = `${month.y}-${String(month.m).padStart(2, '0')}-01`;
  const start = weekStart(first);
  const today = todayKey();
  const shift = (n) => { let { y, m } = month; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setMonth({ y, m }); };
  const dayTasks = tasks.filter((t) => dayKey(t.due) === selected && !t.cancelled).sort((a, b) => a.due.localeCompare(b.due));
  return (
    <div className="m-cal">
      <div className="m-cal-head">
        <button className="icon-btn outline sm" onClick={() => shift(-1)} aria-label="Өмнөх сар"><Icon name="chevronLeft" size={16} /></button>
        <strong>{month.y} оны {month.m}-р сар</strong>
        <button className="icon-btn outline sm" onClick={() => shift(1)} aria-label="Дараах сар"><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="m-grid">
        {WEEKDAYS_SHORT.map((w) => <small key={w}>{w}</small>)}
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((k) => {
          const list = tasks.filter((t) => dayKey(t.due) === k && !t.cancelled);
          const p = keyParts(k);
          return (
            <button key={k} className={`m-day ${p.m !== month.m ? 'out' : ''} ${k === selected ? 'on' : ''} ${k === today ? 'today' : ''}`} onClick={() => setSelected(k)}>
              {p.d}
              <span className="dots">{list.slice(0, 3).map((t) => <i key={t.id} style={{ background: t.done ? 'var(--gray-300)' : SOURCES[t.source].color }} />)}</span>
            </button>
          );
        })}
      </div>
      <h3 className="m-day-title">{longDate(selected)}</h3>
      {dayTasks.length ? dayTasks.map((t) => <TaskCard key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />) : <p className="muted small">Энэ өдөр даалгавар алга.</p>}
    </div>
  );
}

export default function Mobile(props) {
  const { user, tasks, allTasks, tab, setTab, onOpen, onToggle, onAdd, next, unread, onBell, bellOpen, bellPanel, selected, setSelected, classes, schedDay, setSchedDay, onOpenClass, onAddClass, onImportClasses } = props;
  const refs = useRef({});
  const today = todayKey();
  const active = tasks.filter(isActive).sort((a, b) => a.due.localeCompare(b.due));
  const pick = (k) => { setSelected(k); const el = refs.current[k]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const p = keyParts(today);

  return (
    <div className="mobile">
      {tab === 'connections' ? props.connections : (
        <div className="m-scroll">
          {tab === 'list' && (
            <>
              <header className="m-head">
                <div>
                  <small className="muted">{WEEKDAYS[p.wd]}, {p.m}-р сарын {p.d}</small>
                  <h1>Сайн уу, {user.name}</h1>
                </div>
                <div className="bell-wrap">
                  <button className="icon-btn outline bell" onClick={onBell} aria-label="Мэдэгдэл">
                    <Icon name="bell" size={20} />{unread > 0 && <i className="bell-dot" />}
                  </button>
                  {bellOpen && bellPanel}
                </div>
              </header>
              <WeekStrip tasks={allTasks} selected={selected} onPick={pick} />
              <div className="m-body">
                <NextClassStrip classes={classes} onClick={() => { setTab('schedule'); }} />
                <ReminderBanner task={next} onOpen={onOpen} />
                <GroupedList tasks={active} onToggle={onToggle} onOpen={onOpen} refs={refs} />
              </div>
            </>
          )}
          {tab === 'schedule' && (
            <>
              <header className="m-head"><div><small className="muted">7 хоног бүр давтагдана</small><h1>Хичээлийн хуваарь</h1></div></header>
              <MobileSchedule classes={classes} tasks={allTasks} day={schedDay} setDay={setSchedDay} onOpenClass={onOpenClass} onOpenTask={onOpen} onToggle={onToggle} onImport={onImportClasses} />
            </>
          )}
          {tab === 'calendar' && (
            <>
              <header className="m-head"><h1>Хуанли</h1></header>
              <div className="m-body"><MobileCalendar {...props} tasks={allTasks} /></div>
            </>
          )}
          {tab === 'done' && (
            <>
              <header className="m-head"><h1>Дууссан</h1></header>
              <div className="m-body"><DoneList tasks={allTasks} onToggle={onToggle} onOpen={onOpen} /></div>
            </>
          )}
        </div>
      )}
      {tab !== 'connections' && (
        <button className="fab" onClick={tab === 'schedule' ? () => onAddClass({ day: schedDay }) : onAdd} aria-label={tab === 'schedule' ? 'Хичээл нэмэх' : 'Даалгавар нэмэх'}><Icon name="plus" size={28} /></button>
      )}
      <nav className="tabbar">
        {TABS.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
            <Icon name={icon} size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export { EmptyState };
