import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { Checkbox } from './common.jsx';
import { COURSES, REMINDER_OPTIONS, SOURCES, addDays, dayKey, timeStr, todayKey, ubToIso } from '../utils.js';

const TYPES = [['assignment', 'Даалгавар'], ['exam', 'Шалгалт'], ['other', 'Бусад']];

export default function TaskModal({ task, settings, courses, defaultDate, onSave, onDelete, onClose }) {
  const isNew = !task;
  const synced = task && task.source !== 'manual';
  const [title, setTitle] = useState(task?.title || '');
  const [course, setCourse] = useState(task?.course || COURSES[1]);
  const [type, setType] = useState(task?.type || 'assignment');
  const [date, setDate] = useState(task ? dayKey(task.due) : (defaultDate || addDays(todayKey(), 1)));
  const [time, setTime] = useState(task ? timeStr(task.due) : '23:59');
  const [reminders, setReminders] = useState(task?.reminders || settings?.defaultReminders || [1440, 60]);
  const [channels, setChannels] = useState(task?.channels || { push: true, email: false });
  const [checklist, setChecklist] = useState(task?.checklist || []);
  const [newStep, setNewStep] = useState('');
  const [touched, setTouched] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const courseOptions = useMemo(() => [...new Set([...COURSES, ...(courses || []), course].filter(Boolean))], [courses]);
  const doneSteps = checklist.filter((c) => c.done).length;
  const valid = title.trim() && date && time;
  const src = SOURCES[task?.source || 'manual'];

  const toggleReminder = (m) => setReminders(reminders.includes(m) ? reminders.filter((x) => x !== m) : [...reminders, m]);
  const addStep = () => {
    if (!newStep.trim()) return;
    setChecklist([...checklist, { id: `c${Date.now()}`, text: newStep.trim(), done: false }]);
    setNewStep('');
  };

  function save() {
    setTouched(true);
    if (!valid) return;
    const data = { reminders, channels, checklist };
    if (!synced) Object.assign(data, { title: title.trim(), course, type, due: ubToIso(date, time) });
    onSave(data);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tm-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="tm-title">{isNew ? 'Даалгавар нэмэх' : synced ? 'Даалгаврын дэлгэрэнгүй' : 'Даалгавар засах'}</h2>
            <p className="muted">{isNew ? 'Moodle, Teams-д байхгүй ажлаа гараар оруулна уу' : synced ? `${src.name}-ээс ирсэн — гарчиг, хугацаа эх сурвалжаас шинэчлэгдэнэ` : 'Гараар нэмсэн даалгавар'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Хаах"><Icon name="x" size={20} /></button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Гарчиг</span>
            <input ref={titleRef} className={touched && !title.trim() ? 'invalid' : ''} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Жишээ нь: Багийн уулзалтад бэлдэх" disabled={synced} maxLength={200} />
            {touched && !title.trim() && <small className="field-error">Гарчиг оруулна уу</small>}
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Хичээл</span>
              <div className="select">
                <select value={course} onChange={(e) => setCourse(e.target.value)} disabled={synced}>
                  {courseOptions.map((c) => <option key={c}>{c}</option>)}
                </select>
                <Icon name="chevronDown" size={16} />
              </div>
            </label>
            <div className="field">
              <span>Төрөл</span>
              <div className="type-group" role="radiogroup">
                {TYPES.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={type === v} className={type === v ? 'on' : ''} onClick={() => !synced && setType(v)} disabled={synced && type !== v}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <label className="field">
              <span>Дуусах огноо</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={synced} />
            </label>
            <label className="field">
              <span>Цаг</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={synced} />
            </label>
          </div>

          <div className="field">
            <div className="field-row"><span>Хэзээ сануулах вэ?</span><small className="muted">{reminders.length} сонгосон</small></div>
            <div className="chips">
              {REMINDER_OPTIONS.map((o) => (
                <button key={o.min} type="button" className={`pill ${reminders.includes(o.min) ? 'on' : ''}`} aria-pressed={reminders.includes(o.min)} onClick={() => toggleReminder(o.min)}>
                  {reminders.includes(o.min) && <Icon name="check" size={14} stroke={3} />}{o.label}
                </button>
              ))}
            </div>
            <div className="channel-box">
              <label className="check-row"><input type="checkbox" checked={channels.push} onChange={(e) => setChannels({ ...channels, push: e.target.checked })} /><span className="cb-native" />Утсанд push мэдэгдэл</label>
              <label className="check-row"><input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} /><span className="cb-native" />Сургуулийн и-мэйл рүү</label>
            </div>
          </div>

          <div className="field">
            <div className="field-row"><span>Хийх алхмууд (checklist)</span><small className="muted">{doneSteps}/{checklist.length} дууссан</small></div>
            <div className="progress"><span style={{ width: `${checklist.length ? (doneSteps / checklist.length) * 100 : 0}%` }} /></div>
            <ul className="checklist">
              {checklist.map((c) => (
                <li key={c.id}>
                  <Checkbox checked={c.done} label={c.text} onChange={(v) => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: v } : x)))} />
                  <span className={c.done ? 'struck' : ''}>{c.text}</span>
                  <button className="icon-btn ghost sm" aria-label="Алхам устгах" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}><Icon name="x" size={14} /></button>
                </li>
              ))}
              <li className="add-step">
                <Icon name="plus" size={16} />
                <input value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }} placeholder="Алхам нэмэх" />
              </li>
            </ul>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="src-pill"><i style={{ background: src.color }} />{task ? (task.source === 'manual' ? 'Гараар нэмсэн' : src.name) : 'Гараар нэмсэн'}</span>
          <div className="spacer" />
          {task && task.source === 'manual' && <button className="btn btn-ghost danger" onClick={() => onDelete(task)}><Icon name="trash" size={16} />Устгах</button>}
          <button className="btn btn-outline" onClick={onClose}>Болих</button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>Хадгалах</button>
        </footer>
      </div>
    </div>
  );
}
