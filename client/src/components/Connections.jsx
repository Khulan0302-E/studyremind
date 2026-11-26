import { useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { Checkbox } from './common.jsx';
import { SOURCES, ago, dayKey, shortDate, timeStr } from '../utils.js';
import { api } from '../api.js';

const STATUS = {
  connected: ['Холбогдсон', 'status-ok'],
  disconnected: ['Холбогдоогүй', 'status-off'],
  error: ['Алдаатай', 'status-err'],
};

function StatusPill({ status }) {
  const [t, c] = STATUS[status] || STATUS.disconnected;
  return <span className={`status ${c}`}>{t}</span>;
}

function SourceHead({ kind, desc, status }) {
  const s = SOURCES[kind];
  return (
    <div className="src-head">
      <span className="avatar" style={{ background: s.color }}>{s.letter}</span>
      <div className="src-title"><strong>{s.name}</strong><small className="muted">{desc}</small></div>
      <StatusPill status={status} />
    </div>
  );
}

function Meta({ src }) {
  return <p className="src-meta"><b>{src.count}</b> даалгавар <span className="sep" /> Сүүлд: <b>{ago(src.lastSync)}</b></p>;
}

export default function Connections({ sources, settings, user, online, onBack, onChanged, onSettings, onLogout, toast }) {
  const by = Object.fromEntries((sources || []).map((s) => [s.kind, s]));
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState({});
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  async function run(key, fn) {
    if (!online) { toast('Интернэт холболтгүй үед холболт өөрчлөх боломжгүй'); return; }
    setBusy(key); setErr({ ...err, [key]: '' });
    try { await fn(); await onChanged(); } catch (e) { setErr({ ...err, [key]: e.message }); } finally { setBusy(''); }
  }

  const moodle = by.moodle || { status: 'disconnected', count: 0 };
  const teams = by.teams || { status: 'disconnected', count: 0 };
  const mel = by.mel || { status: 'disconnected', count: 0 };

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const content = await file.text();
    run('mel', async () => {
      const r = await api('POST', '/sources/mel/import', { filename: file.name, content, preview: true });
      setPreview({ filename: file.name, content, items: r.items });
    });
  }

  const remindRows = [[4320, '3 өдрийн өмнө'], [1440, '1 өдрийн өмнө'], [180, '3 цагийн өмнө'], [60, '1 цагийн өмнө']];
  const toggleDefault = (m) => {
    const cur = settings.defaultReminders;
    onSettings({ defaultReminders: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] });
  };
  const quiet = `${settings.quietStart}-${settings.quietEnd}`;

  return (
    <div className="connections">
      <header className="page-head">
        <button className="icon-btn outline" onClick={onBack} aria-label="Буцах"><Icon name="chevronLeft" size={20} /></button>
        <div>
          <h1>Холболт ба сануулга</h1>
          <p className="muted">Хичээлийн платформуудаа холбоод даалгавар автоматаар хуанлид орно</p>
        </div>
      </header>

      <div className="conn-grid">
        <div className="conn-col">
          {/* Moodle */}
          <section className="card">
            <SourceHead kind="moodle" desc="Сургуулийн Moodle — календарийн экспорт (iCal) холбоос" status={moodle.status} />
            {moodle.status === 'connected' ? (
              <>
                <Meta src={moodle} />
                <div className="row-box">
                  <span>Автомат синк хийх</span>
                  <Checkbox checked={moodle.autoSync} label="Moodle автомат синк" onChange={(v) => run('moodle', () => api('PATCH', '/sources/moodle', { autoSync: v }))} />
                </div>
                <div className="src-actions">
                  <button className="btn btn-outline btn-sm" disabled={busy === 'moodle'} onClick={() => run('moodle', () => api('POST', '/sources/moodle/sync'))}><Icon name="refresh" size={15} />{busy === 'moodle' ? 'Синк хийж байна…' : 'Одоо синк хийх'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => run('moodle', () => api('POST', '/sources/moodle/disconnect'))}>Салгах</button>
                </div>
              </>
            ) : (
              <>
                {moodle.status === 'error' && <div className="alert"><Icon name="alert" size={16} /><span>{moodle.error || 'Синк амжилтгүй боллоо'}</span></div>}
                <ol className="howto">
                  <li>Moodle → <b>Хуанли</b> → <b>Import or export calendars</b> → <b>Export calendar</b></li>
                  <li>«All courses», «Recent and next 60 days»-г сонгоод <b>Get calendar URL</b> дарна</li>
                  <li>Гарсан холбоосыг доор буулгана</li>
                </ol>
                <div className="inline-form">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://moodle…/calendar/export_execute.php?…" aria-label="Moodle iCal холбоос" />
                  <button className="btn btn-primary btn-sm" disabled={!url.trim() || busy === 'moodle'} onClick={() => run('moodle', async () => { await api('POST', '/sources/moodle', { url: url.trim() }); setUrl(''); toast('Moodle холбогдлоо'); })}>
                    {busy === 'moodle' ? 'Холбож байна…' : 'Холбох'}
                  </button>
                </div>
              </>
            )}
            {err.moodle && <p className="field-error">{err.moodle}</p>}
          </section>

          {/* Teams */}
          <section className="card">
            <SourceHead kind="teams" desc="Сургуулийн Microsoft 365 бүртгэл — Assignments" status={teams.status} />
            {teams.status === 'connected' ? (
              <>
                <Meta src={teams} />
                <div className="row-box">
                  <span>Автомат синк хийх</span>
                  <Checkbox checked={teams.autoSync} label="Teams автомат синк" onChange={(v) => run('teams', () => api('PATCH', '/sources/teams', { autoSync: v }))} />
                </div>
                <div className="src-actions">
                  <button className="btn btn-outline btn-sm" disabled={busy === 'teams'} onClick={() => run('teams', () => api('POST', '/sources/teams/sync'))}><Icon name="refresh" size={15} />Одоо синк хийх</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => run('teams', () => api('POST', '/sources/teams/disconnect'))}>Салгах</button>
                </div>
              </>
            ) : (
              <div className="src-actions">
                <button className="btn btn-teams" disabled={busy === 'teams'} onClick={() => run('teams', async () => { await api('POST', '/sources/teams/connect'); toast('Teams холбогдлоо'); })}>Microsoft бүртгэлээр холбох</button>
              </div>
            )}
            <p className="hint">Демо горим: Microsoft Graph API-ийн оронд жишээ даалгавар ашиглаж байна.</p>
            {err.teams && <p className="field-error">{err.teams}</p>}
          </section>

          {/* MyEnglishLab */}
          <section className="card">
            <SourceHead kind="mel" desc="Pearson MyEnglishLab — Англи хэл I" status={mel.status} />
            {mel.lastSync && <Meta src={mel} />}
            <div className="note">Албан ёсны API байхгүй тул нэвтэрч даалгаврын жагсаалтаа татах, эсвэл багшийн хуваарийг файлаар импортлох боломжтой.</div>
            <div className="src-actions">
              <button className="btn btn-mel" onClick={() => run('pearson', () => api('POST', '/sources/mel/pearson'))}>Pearson бүртгэлээр холбох</button>
              <button className="btn btn-outline" onClick={() => fileRef.current.click()}><Icon name="upload" size={16} />Файл импортлох</button>
              <input ref={fileRef} type="file" accept=".ics,.csv" hidden onChange={onFile} />
            </div>
            {err.pearson && <p className="field-error">{err.pearson}</p>}
            {err.mel && <p className="field-error">{err.mel}</p>}
            <p className="hint">Дэмжигдэх формат: .ics, .csv (title, course, due «2026-11-20 23:59», type)</p>
            {preview && (
              <div className="preview">
                <strong>{preview.filename} — {preview.items.length} даалгавар</strong>
                <ul>{preview.items.slice(0, 8).map((it) => <li key={it.extUid}><span>{it.title}</span><small className="muted">{shortDate(dayKey(it.due))} · {timeStr(it.due)}</small></li>)}</ul>
                <div className="src-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => run('mel', async () => { const r = await api('POST', '/sources/mel/import', { filename: preview.filename, content: preview.content }); setPreview(null); toast(`${r.result.added} даалгавар импортлогдлоо`); })}>Импортлох</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Болих</button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="conn-col">
          <section className="card">
            <h3>Анхдагч сануулга</h3>
            <p className="muted small">Синкээр орж ирсэн бүх даалгаварт автоматаар тавигдана. Даалгавар бүр дээр тусад нь өөрчилж болно.</p>
            <ul className="settings-list">
              {remindRows.map(([m, l]) => (
                <li key={m}><span>{l}</span><Checkbox checked={settings.defaultReminders.includes(m)} label={l} onChange={() => toggleDefault(m)} /></li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>Ерөнхий</h3>
            <label className="field">
              <span>Синк хийх давтамж</span>
              <div className="select">
                <select value={settings.syncInterval} onChange={(e) => onSettings({ syncInterval: Number(e.target.value) })}>
                  {[5, 15, 30, 60].map((n) => <option key={n} value={n}>{n === 60 ? '1 цаг тутам' : `${n} минут тутам`}</option>)}
                </select>
                <Icon name="chevronDown" size={16} />
              </div>
            </label>
            <label className="field">
              <span>Чимээгүй цаг</span>
              <div className="select">
                <select value={quiet} onChange={(e) => { const [a, b] = e.target.value.split('-'); onSettings({ quietStart: a, quietEnd: b }); }}>
                  {['22:00-07:00', '23:00-07:00', '00:00-08:00', '00:00-00:00'].map((q) => <option key={q} value={q}>{q === '00:00-00:00' ? 'Унтраалттай' : q.replace('-', ' – ')}</option>)}
                </select>
                <Icon name="chevronDown" size={16} />
              </div>
            </label>
            <div className="settings-list"><li><span>Өглөө бүр өдрийн тойм (08:00)</span><Checkbox checked={settings.morningSummary} label="Өглөөний тойм" onChange={(v) => onSettings({ morningSummary: v })} /></li></div>
          </section>

          <section className="card account">
            <div><strong>{user.name}</strong><small className="muted">{user.email}</small></div>
            <button className="btn btn-outline btn-sm" onClick={onLogout}><Icon name="logout" size={15} />Гарах</button>
          </section>
        </div>
      </div>
    </div>
  );
}
