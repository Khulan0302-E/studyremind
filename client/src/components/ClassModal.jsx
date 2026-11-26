import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { CLASS_KINDS, COURSES, WEEKDAYS, courseColor, durationLabel, toMinutes } from '../utils.js';

// Хичээл нэмэх / засах модал
export default function ClassModal({ cls, defaults, courses, onSave, onDelete, onClose }) {
  const isNew = !cls;
  const [course, setCourse] = useState(cls?.course || '');
  const [kind, setKind] = useState(cls?.kind || 'lecture');
  const [day, setDay] = useState(cls?.day ?? defaults?.day ?? 0);
  const [start, setStart] = useState(cls?.start || defaults?.start || '08:00');
  const [end, setEnd] = useState(cls?.end || defaults?.end || '09:30');
  const [room, setRoom] = useState(cls?.room || '');
  const [teacher, setTeacher] = useState(cls?.teacher || '');
  const [touched, setTouched] = useState(false);
  const courseRef = useRef(null);

  useEffect(() => {
    if (isNew) courseRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Эхлэх цагийг өөрчлөхөд үргэлжлэх хугацааг хадгална
  const changeStart = (v) => {
    const dur = toMinutes(end) - toMinutes(start);
    setStart(v);
    if (v && dur > 0) {
      const e = Math.min(toMinutes(v) + dur, 23 * 60 + 59);
      setEnd(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`);
    }
  };

  const options = useMemo(() => [...new Set([...COURSES, ...(courses || [])].filter(Boolean))], [courses]);
  const timeOk = start && end && end > start;
  const valid = course.trim() && timeOk;
  const color = courseColor(course.trim()).color;

  function save() {
    setTouched(true);
    if (!valid) return;
    onSave({ course: course.trim(), kind, day: Number(day), start, end, room: room.trim(), teacher: teacher.trim() });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="cm-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="cm-title">{isNew ? 'Хичээл нэмэх' : 'Хичээл засах'}</h2>
            <p className="muted">7 хоног бүр давтагдана</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Хаах"><Icon name="x" size={20} /></button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Хичээлийн нэр</span>
            <div className="input-swatch">
              <i style={{ background: course.trim() ? color : 'var(--gray-300)' }} />
              <input ref={courseRef} list="course-options" className={touched && !course.trim() ? 'invalid' : ''} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Жишээ нь: Математик I" maxLength={120} />
            </div>
            <datalist id="course-options">{options.map((c) => <option key={c} value={c} />)}</datalist>
            {touched && !course.trim() && <small className="field-error">Хичээлийн нэр оруулна уу</small>}
          </label>

          <div className="field">
            <span>Төрөл</span>
            <div className="type-group" role="radiogroup">
              {Object.entries(CLASS_KINDS).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={kind === v} className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{l}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Гараг</span>
            <div className="day-picker" role="radiogroup">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" role="radio" aria-checked={Number(day) === i} aria-label={w} className={Number(day) === i ? 'on' : ''} onClick={() => setDay(i)}>{w.slice(0, 2)}</button>
              ))}
            </div>
          </div>

          <div className="grid-2 keep-2">
            <label className="field">
              <span>Эхлэх</span>
              <input type="time" value={start} onChange={(e) => changeStart(e.target.value)} />
            </label>
            <label className="field">
              <span>Дуусах</span>
              <input type="time" className={touched && !timeOk ? 'invalid' : ''} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          {!timeOk && start && end
            ? <small className="field-error block-msg">Дуусах цаг эхлэх цагаас хойш байх ёстой</small>
            : timeOk && <small className="muted block-msg">Үргэлжлэх хугацаа: {durationLabel(toMinutes(end) - toMinutes(start))}</small>}

          <div className="grid-2">
            <label className="field">
              <span>Танхим</span>
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="3-304" maxLength={40} />
            </label>
            <label className="field">
              <span>Багш</span>
              <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Б.Болд" maxLength={80} />
            </label>
          </div>
        </div>

        <footer className="modal-foot">
          {!isNew && <button className="btn btn-ghost danger" onClick={() => onDelete(cls)}><Icon name="trash" size={16} />Устгах</button>}
          <div className="spacer" />
          <button className="btn btn-outline" onClick={onClose}>Болих</button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>Хадгалах</button>
        </footer>
      </div>
    </div>
  );
}
