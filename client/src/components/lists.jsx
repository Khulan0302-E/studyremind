import Icon from '../icons.jsx';
import { Badge, Checkbox, EmptyState, SourceTime } from './common.jsx';
import { SOURCES, countdown, dayKey, groupLabel, timeStr, todayKey, shortDate } from '../utils.js';

// Утасны дизайн дээрх task карт
export function TaskCard({ task, onToggle, onOpen }) {
  const s = SOURCES[task.source];
  return (
    <article className={`task-card ${task.done ? 'is-done' : ''} ${task.cancelled ? 'is-cancelled' : ''}`} onClick={() => onOpen(task)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}>
      <Checkbox checked={task.done} label={`${task.title} дууссан`} onChange={() => onToggle(task)} />
      <span className="bar" style={{ background: s.color }} />
      <div className="task-main">
        <strong className="task-title">{task.title}{task._pending && <Icon name="clock" size={13} className="pending" />}</strong>
        <small className="muted">{task.course}{task.type === 'exam' && <span className="type-tag">Шалгалт</span>}</small>
        <span className="task-foot"><SourceTime task={task} /><Badge task={task} /></span>
      </div>
    </article>
  );
}

export function GroupedList({ tasks, onToggle, onOpen, emptyText, refs }) {
  const today = todayKey();
  const groups = [];
  for (const t of tasks) {
    const k = dayKey(t.due) < today ? 'overdue' : dayKey(t.due);
    let g = groups.find((x) => x.key === k);
    if (!g) groups.push((g = { key: k, label: k === 'overdue' ? 'Хоцорсон' : groupLabel(k, today), items: [] }));
    g.items.push(t);
  }
  if (!groups.length) return <EmptyState title="Хийх зүйл алга байна" text={emptyText || 'Ойрын хугацаанд дуусах даалгавар алга. Амраарай!'} />;
  return (
    <div className="groups">
      {groups.map((g) => (
        <section key={g.key} className="group" ref={(el) => refs && (refs.current[g.key] = el)}>
          <h3 className={g.key === 'overdue' ? 'danger-text' : ''}>{g.label}</h3>
          {g.items.map((t) => <TaskCard key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
        </section>
      ))}
    </div>
  );
}

export function DoneList({ tasks, onToggle, onOpen }) {
  const done = tasks.filter((t) => t.done || t.cancelled).sort((a, b) => (b.doneAt || b.due).localeCompare(a.doneAt || a.due));
  if (!done.length) return <EmptyState title="Дууссан даалгавар алга" text="Даалгаврын checkbox-ыг дарахад энд харагдана." />;
  return (
    <div className="groups">
      <section className="group">
        {done.map((t) => <TaskCard key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
      </section>
    </div>
  );
}

// Хамгийн ойр task-ийн бараан баннер
export function ReminderBanner({ task, compact, onOpen }) {
  if (!task) return null;
  const s = SOURCES[task.source];
  if (compact) {
    return (
      <button className="banner banner-desk" onClick={() => onOpen(task)}>
        <span className="banner-icon"><Icon name="bell" size={18} /></span>
        <span>
          <small className="banner-kicker">Сануулга · {groupLabel(dayKey(task.due))}</small>
          <strong>{task.title} — {timeStr(task.due)} цагт {task.type === 'exam' ? 'хаагдана' : 'дуусна'}</strong>
          <small className="banner-sub">{task.course} · {s.short}</small>
        </span>
      </button>
    );
  }
  return (
    <button className="banner" onClick={() => onOpen(task)}>
      <span className="banner-icon big"><Icon name="alarm" size={22} /></span>
      <span>
        <small className="banner-kicker">{countdown(task.due)}</small>
        <strong>{task.title}</strong>
        <small className="banner-sub">{task.course} · {s.short} · {timeStr(task.due)}</small>
      </span>
    </button>
  );
}

export { shortDate };
