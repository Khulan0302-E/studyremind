import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { EmptyState } from './common.jsx';
import { TaskCard } from './lists.jsx';
import { api } from '../api.js';
import {
  CLASS_KINDS, WEEKDAYS, WEEKDAYS_SHORT, addDays, classStatus, courseColor, currentOrNextClass, dayKey, durationLabel,
  isActive, keyParts, nowUb, sortClasses, toMinutes, todayKey, weekStart,
} from '../utils.js';

const HOUR_PX = 60;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Нэг өдөр давхацсан хичээлүүдийг зэрэгцүүлэн байрлуулах (lane)
function layoutDay(list) {
  const items = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const lanesEnd = [];
  const placed = items.map((c) => {
    let lane = lanesEnd.findIndex((e) => e <= toMinutes(c.start));
    if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(0); }
    lanesEnd[lane] = toMinutes(c.end);
    return { c, lane };
  });
  return placed.map((p) => ({ ...p, lanes: lanesEnd.length }));
}

function KindTag({ kind }) {
  return <span className={`kind-tag kind-${kind}`}>{CLASS_KINDS[kind] || 'Лекц'}</span>;
}

// ---------- Компьютер: 7 хоногийн хүснэгт ----------
export function TimetableGrid({ classes, tasks, onOpenClass, onAddAt, onPickDay }) {
  const now = nowUb();
  const today = todayKey();
  const ws = weekStart(today);
  const hasSunday = classes.some((c) => c.day === 6);
  const days = hasSunday ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  const minStart = Math.min(8 * 60, ...classes.map((c) => toMinutes(c.start)));
  const maxEnd = Math.max(18 * 60, ...classes.map((c) => toMinutes(c.end)));
  const from = Math.floor(minStart / 60) * 60;
  const to = Math.ceil(maxEnd / 60) * 60;
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const height = ((to - from) / 60) * HOUR_PX;
  const scroller = useRef(null);

  useEffect(() => {
    // Одоогийн цаг руу гүйлгэнэ
    if (scroller.current && now.min > from) scroller.current.scrollTop = Math.max(0, ((now.min - from) / 60 - 1) * HOUR_PX);
  }, []);

  return (
    <div className="tt card" style={{ '--cols': days.length }}>
      <div className="tt-head">
        <div className="tt-gutter" />
        {days.map((d) => {
          const k = addDays(ws, d);
          const due = tasks.filter((t) => isActive(t) && dayKey(t.due) === k);
          return (
            <button key={d} className={`tt-day ${k === today ? 'today' : ''}`} onClick={() => onPickDay?.(k)}>
              <small>{WEEKDAYS[d]}</small>
              <b>{keyParts(k).d}</b>
              {due.length > 0 && <span className={`tt-due ${due.some((t) => t.type === 'exam') ? 'exam' : ''}`}>{due.length} даалгавар</span>}
            </button>
          );
        })}
      </div>
      <div className="tt-scroll" ref={scroller}>
        <div className="tt-body" style={{ height }}>
          <div className="tt-gutter">
            {hours.map((h) => <span key={h} style={{ top: ((h - from) / 60) * HOUR_PX }}>{hhmm(h)}</span>)}
          </div>
          {days.map((d) => {
            const isToday = d === now.wd;
            return (
              <div
                key={d}
                className={`tt-col ${isToday ? 'today' : ''}`}
                onClick={(e) => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const m = from + Math.floor(y / HOUR_PX) * 60;
                  onAddAt?.({ day: d, start: hhmm(m), end: hhmm(Math.min(m + 90, 23 * 60 + 59)) });
                }}
              >
                {hours.map((h) => <i key={h} className="tt-line" style={{ top: ((h - from) / 60) * HOUR_PX }} />)}
                {layoutDay(classes.filter((c) => c.day === d)).map(({ c, lane, lanes }) => {
                  const st = classStatus(c, classes, now);
                  const col = courseColor(c.course);
                  const top = ((toMinutes(c.start) - from) / 60) * HOUR_PX;
                  const h = ((toMinutes(c.end) - toMinutes(c.start)) / 60) * HOUR_PX;
                  return (
                    <button
                      key={c.id}
                      className={`tt-block ${st === 'past' ? 'past' : ''} ${st === 'now' ? 'now' : ''}`}
                      style={{ top, height: h - 3, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, background: col.tint, borderColor: col.color, color: col.color }}
                      onClick={(e) => { e.stopPropagation(); onOpenClass(c); }}
                      title={`${c.start}–${c.end} ${c.course}${c.room ? ` · ${c.room}` : ''}`}
                    >
                      <span className="tt-time">{c.start}–{c.end}{st === 'now' && <em>Одоо</em>}</span>
                      <strong>{c.course}</strong>
                      {h > 60 && <small>{CLASS_KINDS[c.kind]}{c.room ? ` · ${c.room}` : ''}</small>}
                    </button>
                  );
                })}
                {isToday && now.min >= from && now.min <= to && <i className="tt-now" style={{ top: ((now.min - from) / 60) * HOUR_PX }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Өдрийн хичээлийн жагсаалт (утас, баруун самбар) ----------
function ClassRow({ c, classes, onOpen, compact }) {
  const st = classStatus(c, classes);
  const col = courseColor(c.course);
  const now = nowUb();
  const pct = st === 'now' ? Math.round(((now.min - toMinutes(c.start)) / (toMinutes(c.end) - toMinutes(c.start))) * 100) : 0;
  return (
    <button className={`class-row ${st || ''} ${compact ? 'compact' : ''}`} onClick={() => onOpen(c)}>
      <span className="class-time"><b>{c.start}</b><small>{c.end}</small></span>
      <span className="class-body" style={{ borderColor: col.color, background: st === 'now' ? col.tint : undefined }}>
        <span className="class-top">
          <strong>{c.course}</strong>
          {st === 'now' ? <span className="now-pill">Одоо</span> : st === 'next' ? <span className="next-pill">Дараагийнх</span> : <KindTag kind={c.kind} />}
        </span>
        {(c.room || c.teacher) && (
          <small className="class-meta">
            {c.room && <span><Icon name="mapPin" size={12} />{c.room}</span>}
            {c.teacher && !compact && <span><Icon name="user" size={12} />{c.teacher}</span>}
          </small>
        )}
        {st === 'now' && <span className="class-progress"><i style={{ width: `${pct}%`, background: col.color }} /></span>}
      </span>
    </button>
  );
}

function DayClasses({ list, classes, onOpen, compact }) {
  const sorted = sortClasses(list);
  return (
    <div className="class-list">
      {sorted.map((c, i) => {
        const prev = sorted[i - 1];
        const gap = prev ? toMinutes(c.start) - toMinutes(prev.end) : 0;
        return (
          <div key={c.id}>
            {gap >= 30 && !compact && <div className="class-gap">Завсарлага · {durationLabel(gap)}</div>}
            <ClassRow c={c} classes={classes} onOpen={onOpen} compact={compact} />
          </div>
        );
      })}
    </div>
  );
}

// Баруун самбар: өнөөдрийн хичээл
export function TodayClasses({ classes, onOpen, onShowAll }) {
  const { wd } = nowUb();
  const list = classes.filter((c) => c.day === wd);
  return (
    <section className="today-classes">
      <div className="panel-head"><strong>Өнөөдрийн хичээл</strong>{onShowAll && <button className="link" onClick={onShowAll}>Хуваарь →</button>}</div>
      {list.length ? <DayClasses list={list} classes={classes} onOpen={onOpen} compact /> : <p className="muted small">Өнөөдөр хичээлгүй.</p>}
    </section>
  );
}

// Утасны жагсаалтын дээрх «Одоо / Дараагийн хичээл» мөр
export function NextClassStrip({ classes, onClick }) {
  const r = currentOrNextClass(classes);
  if (!r) return null;
  const { cls, now, inDays } = r;
  const col = courseColor(cls.course);
  const when = now ? `Одоо · ${cls.end} хүртэл` : inDays === 0 ? `Дараагийн хичээл · ${cls.start}` : inDays === 1 ? `Маргааш · ${cls.start}` : `${WEEKDAYS[cls.day]} · ${cls.start}`;
  return (
    <button className={`next-class ${now ? 'is-now' : ''}`} onClick={onClick}>
      <span className="next-class-dot" style={{ background: col.color }} />
      <span className="next-class-main">
        <small>{when}</small>
        <strong>{cls.course}</strong>
      </span>
      {cls.room && <span className="next-class-room"><Icon name="mapPin" size={13} />{cls.room}</span>}
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

// ---------- Утас: «Хуваарь» таб ----------
export function MobileSchedule({ classes, tasks, day, setDay, onOpenClass, onOpenTask, onToggle, onImport }) {
  const today = todayKey();
  const ws = weekStart(today);
  const k = addDays(ws, day);
  const list = classes.filter((c) => c.day === day);
  const due = tasks.filter((t) => !t.cancelled && dayKey(t.due) === k).sort((a, b) => a.due.localeCompare(b.due));
  const total = list.reduce((s, c) => s + toMinutes(c.end) - toMinutes(c.start), 0);
  const { wd } = nowUb();

  return (
    <div className="m-sched">
      <div className="sched-days" role="tablist">
        {WEEKDAYS_SHORT.map((w, i) => {
          const n = classes.filter((c) => c.day === i).length;
          return (
            <button key={w} role="tab" aria-selected={day === i} className={`sd ${day === i ? 'on' : ''} ${i === wd ? 'today' : ''}`} onClick={() => setDay(i)}>
              <small>{w}</small>
              <b>{keyParts(addDays(ws, i)).d}</b>
              <span>{n ? `${n} хич.` : '—'}</span>
            </button>
          );
        })}
      </div>

      <div className="m-body">
        <div className="sched-title">
          <div>
            <h3>{day === wd ? 'Өнөөдөр' : WEEKDAYS[day]}</h3>
            <small className="muted">{list.length ? `${list.length} хичээл · ${durationLabel(total)}` : 'Хичээлгүй өдөр'}</small>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onImport}><Icon name="upload" size={15} />CSV</button>
        </div>
        {list.length
          ? <DayClasses list={list} classes={classes} onOpen={onOpenClass} />
          : classes.length
            ? <p className="muted small sched-empty">Энэ өдөр хичээл алга. + товчоор нэмж болно.</p>
            : <EmptyState title="Хуваариа оруулаарай" text="Хичээлээ + товчоор нэг нэгээр нь, эсвэл CSV файлаар нэг дор оруулна." action={<button className="btn btn-primary btn-sm" onClick={onImport}><Icon name="upload" size={15} />CSV-ээр оруулах</button>} />}

        {due.length > 0 && (
          <section className="group sched-due">
            <h3>Энэ өдөр дуусах даалгавар</h3>
            {due.map((t) => <TaskCard key={t.id} task={t} onToggle={onToggle} onOpen={onOpenTask} />)}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- CSV импорт ----------
const TEMPLATE = '﻿course,day,start,end,room,teacher,type\nМатематик I,Даваа,08:00,09:30,3-304,Б.Болд,Лекц\nАнгли хэл I,Мягмар,11:20,12:50,2-110,S. Smith,Семинар\nПрограмчлалын үндэс,Пүрэв,14:40,16:10,Комп. лаб 5,Д.Сараа,Лаб\n';

export function ImportDialog({ hasClasses, onDone, onClose, toast }) {
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function check(text) {
    setError(''); setPreview(null);
    if (!text.trim()) return;
    try { setPreview(await api('POST', '/classes/import', { content: text, preview: true })); } catch (e) { setError(e.message); }
  }

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setFileName(f.name); setContent(text); check(text);
    e.target.value = '';
  }

  async function run(replace) {
    setBusy(true);
    try {
      const r = await api('POST', '/classes/import', { content, replace });
      toast(`${r.result.added} хичээл нэмэгдлээ${r.result.skipped ? ` · ${r.result.skipped} давхардсан` : ''}`);
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    a.download = 'huvaari_zagvar.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="imp-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="imp-title">Хуваарь импортлох</h2>
            <p className="muted">CSV файлаар семестрийн хуваариа нэг дор оруулна</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Хаах"><Icon name="x" size={20} /></button>
        </header>
        <div className="modal-body">
          <ol className="howto">
            <li>Загвар файлыг татаж Excel эсвэл Google Sheets-ээр нээнэ.</li>
            <li>Хичээл бүрийг нэг мөрөнд бичнэ: хичээл, гараг, эхлэх, дуусах, танхим, багш, төрөл.</li>
            <li>CSV хэлбэрээр хадгалаад доор оруулна.</li>
          </ol>
          <div className="imp-actions">
            <button className="btn btn-outline btn-sm" onClick={downloadTemplate}><Icon name="download" size={15} />Загвар татах</button>
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} />Файл сонгох</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pick} />
          </div>
          <details className="paste">
            <summary>Эсвэл текстээр буулгах</summary>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => check(content)} rows={5} placeholder={'course,day,start,end,room\nМатематик I,Даваа,08:00,09:30,3-304'} />
          </details>
          {fileName && <p className="small muted">Файл: {fileName}</p>}
          {error && <div className="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
          {preview && (
            <div className="preview">
              <strong>{preview.items.length} хичээл олдлоо</strong>
              <ul>
                {sortClasses(preview.items).map((c, i) => (
                  <li key={i}><span><i className="dot-inline" style={{ background: courseColor(c.course).color }} />{c.course}</span><span className="muted">{WEEKDAYS_SHORT[c.day]} {c.start}–{c.end}{c.room ? ` · ${c.room}` : ''}</span></li>
                ))}
              </ul>
              {preview.errors.length > 0 && (
                <div className="imp-errors">
                  <strong>{preview.errors.length} мөр алгасагдана:</strong>
                  {preview.errors.slice(0, 5).map((er) => <small key={er.line}>{er.line}-р мөр: {er.error}</small>)}
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <div className="spacer" />
          <button className="btn btn-outline" onClick={onClose}>Болих</button>
          {hasClasses && <button className="btn btn-outline" disabled={!preview || busy} onClick={() => run(true)}>Хуучныг солих</button>}
          <button className="btn btn-primary" disabled={!preview || busy} onClick={() => run(false)}>{hasClasses ? 'Нэмэх' : 'Импортлох'}</button>
        </footer>
      </div>
    </div>
  );
}

export { KindTag };
