import Icon from '../icons.jsx';
import { SOURCES, dueBadge, timeStr, ago } from '../utils.js';

export function Logo({ sub, light }) {
  return (
    <div className={`logo ${light ? 'logo-light' : ''}`}>
      <span className="logo-mark"><Icon name="calendarCheck" size={sub ? 18 : 20} /></span>
      <span>
        <span className="logo-name">Даалгавар</span>
        {sub && <span className="logo-sub">{sub}</span>}
      </span>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, color, size = 'md' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={label}
      className={`cb cb-${size} ${checked ? 'cb-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    >
      <span className="cb-box" style={color && checked ? { background: color, borderColor: color } : undefined}>{checked && <Icon name="check" size={size === 'sm' ? 11 : 14} stroke={3} />}</span>
    </button>
  );
}

export function Badge({ task, long }) {
  const b = dueBadge(task, { long });
  return <span className={`badge badge-${b.tone}`}>{b.text}</span>;
}

// «Moodle · 23:59» чип
export function SourceTime({ task }) {
  const s = SOURCES[task.source];
  return <span className="chip" style={{ color: s.color, background: s.tint }}>{s.short} · {timeStr(task.due)}</span>;
}

// «Moodle» шошго
export function SourceLabel({ source }) {
  const s = SOURCES[source];
  return <span className="chip chip-sm" style={{ color: s.color, background: s.tint }}>{s.short === 'Гараар' ? 'Гараар нэмсэн' : s.short}</span>;
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action && <button className="toast-action" onClick={() => { toast.action.run(); onClose(); }}>{toast.action.label}</button>}
    </div>
  );
}

export function OfflineBar({ online, lastSync, pending }) {
  if (online && !pending) return null;
  return (
    <div className={`offline-bar ${online ? 'syncing' : ''}`} role="status">
      <Icon name={online ? 'refresh' : 'wifiOff'} size={15} />
      {online
        ? `Синк хийж байна… (${pending} өөрчлөлт)`
        : `Офлайн · сүүлд синк: ${lastSync ? timeStr(lastSync) : '—'}${pending ? ` · ${pending} өөрчлөлт хүлээгдэж байна` : ''}`}
    </div>
  );
}

export function NotificationsPanel({ items, onClose, permission, onEnable }) {
  return (
    <div className="popover" onClick={(e) => e.stopPropagation()}>
      <div className="popover-head">
        <strong>Мэдэгдэл</strong>
        <button className="icon-btn sm" onClick={onClose} aria-label="Хаах"><Icon name="x" size={16} /></button>
      </div>
      {permission !== 'granted' && (
        <div className="perm-box">
          <p>Даалгаврын хугацаа дуусахаас өмнө утас, компьютер дээрээ сануулга авахын тулд мэдэгдлийг зөвшөөрнө үү.</p>
          <button className="btn btn-primary btn-sm" onClick={onEnable} disabled={permission === 'denied' || permission === 'unsupported'}>
            {permission === 'denied' ? 'Хөтчийн тохиргооноос зөвшөөрнө үү' : permission === 'unsupported' ? 'Энэ хөтөч дэмжихгүй' : 'Мэдэгдэл идэвхжүүлэх'}
          </button>
        </div>
      )}
      {items.length === 0 && <p className="muted pad">Одоогоор мэдэгдэл алга.</p>}
      <ul className="notif-list">
        {items.map((n) => (
          <li key={n.id} className={n.read ? '' : 'unread'}>
            <Icon name={n.kind === 'sync' ? 'refresh' : 'bell'} size={15} />
            <div><div>{n.text}</div><small className="muted">{ago(n.at)}</small></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name="calendarCheck" size={28} /></div>
      <strong>{title}</strong>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}
