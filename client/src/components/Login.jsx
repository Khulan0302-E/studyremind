import { useState } from 'react';
import Icon from '../icons.jsx';
import { Logo } from './common.jsx';
import { api, ApiError } from '../api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(mode, f) {
  const e = {};
  if (mode === 'register' && !f.name.trim()) e.name = 'Нэрээ оруулна уу';
  if (mode !== 'reset' && !EMAIL_RE.test(f.email.trim())) e.email = 'И-мэйл хаяг дутуу байна. Жишээ нь: name@example.mn';
  if (mode !== 'forgot' && f.password.length < 8) e.password = 'Нууц үг хамгийн багадаа 8 тэмдэгт байна';
  return e;
}

export default function Login({ onLoggedIn }) {
  const resetToken = new URLSearchParams(location.search).get('reset');
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login'); // login | register | forgot | reset
  const [f, setF] = useState({ name: '', email: '', password: '', remember: true });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const switchMode = (m) => { setMode(m); setFields({}); setError(''); setInfo(''); };

  async function submit(ev) {
    ev.preventDefault();
    setInfo('');
    const v = validate(mode, f);
    setFields(v);
    if (Object.keys(v).length) { setError(mode === 'login' ? '' : ''); return; }
    setBusy(true);
    try {
      if (mode === 'reset') {
        const r = await api('POST', '/auth/reset', { token: resetToken, password: f.password });
        history.replaceState(null, '', '/');
        setMode('login'); setF({ ...f, password: '' }); setError(''); setInfo(r.message + '. Шинэ нууц үгээрээ нэвтэрнэ үү.');
      } else if (mode === 'forgot') {
        const r = await api('POST', '/auth/forgot', { email: f.email.trim() });
        setError(''); setInfo(r.message);
      } else {
        const r = await api('POST', mode === 'login' ? '/auth/login' : '/auth/register', {
          name: f.name, email: f.email.trim(), password: f.password, remember: f.remember,
        });
        onLoggedIn(r, mode === 'register' ? true : f.remember);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.data.fields) setFields(e.data.fields);
      } else setError('Алдаа гарлаа. Дахин оролдоно уу.');
    } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <aside className="login-hero">
        <Logo light />
        <div className="hero-copy">
          <h1>Даалгавраа цагт нь хийж, хугацаагаа хэзээ ч бүү алдаарай</h1>
          <p>Бүх хичээлийнхээ даалгавар, шалгалтыг нэг хуанлид бүртгээд, дуусахаас нь өмнө сануулга аваарай.</p>
        </div>
        <div className="hero-cards" aria-hidden="true">
          <div className="hero-card">
            <span className="bar" style={{ background: 'var(--moodle)' }} />
            <div><strong>Лаб 5: Давталт</strong><small>Програмчлалын үндэс · 23:59</small></div>
            <span className="badge badge-red">Маргааш</span>
          </div>
          <div className="hero-card shift">
            <span className="bar" style={{ background: 'var(--teams)' }} />
            <div><strong>Сорил 2</strong><small>Математик I · Шалгалт · 10:00</small></div>
            <span className="badge badge-yellow">4 өдөр</span>
          </div>
          <div className="hero-note"><Icon name="bell" size={16} /> 1 цагийн дараа «Quiz 3» хаагдана</div>
        </div>
      </aside>

      <main className="login-main">
        <form className="login-form" onSubmit={submit} noValidate>
          <h2>{mode === 'forgot' || mode === 'reset' ? 'Нууц үг сэргээх' : 'Тавтай морил'}</h2>
          <p className="muted">
            {mode === 'forgot' ? 'Бүртгэлтэй и-мэйлээ оруулбал сэргээх холбоос илгээнэ.' : mode === 'reset' ? 'Шинэ нууц үгээ оруулна уу.' : 'Даалгавар, шалгалтаа харахын тулд нэвтэрнэ үү.'}
          </p>

          {(mode === 'login' || mode === 'register') && (
            <div className="segmented full" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>Нэвтрэх</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchMode('register')}>Бүртгүүлэх</button>
            </div>
          )}

          {error && <div className="alert" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
          {info && <div className="alert alert-ok" role="status"><Icon name="check" size={18} /><span>{info}</span></div>}

          {mode === 'register' && (
            <label className="field">
              <span>Нэр</span>
              <input className={fields.name ? 'invalid' : ''} value={f.name} onChange={set('name')} placeholder="Намжаа" autoComplete="name" />
              {fields.name && <small className="field-error">{fields.name}</small>}
            </label>
          )}

          {mode !== 'reset' && <label className="field">
            <span>И-мэйл</span>
            <input className={fields.email ? 'invalid' : ''} type="email" value={f.email} onChange={set('email')} placeholder="name@example.mn" autoComplete="email" />
            {fields.email && <small className="field-error">{fields.email}</small>}
          </label>}

          {mode !== 'forgot' && (
            <div className="field">
              <div className="field-row">
                <label htmlFor="pw">{mode === 'reset' ? 'Шинэ нууц үг' : 'Нууц үг'}</label>
                {mode === 'login' && <button type="button" className="link" onClick={() => switchMode('forgot')}>Нууц үгээ мартсан?</button>}
              </div>
              <div className="input-icon">
                <input id="pw" className={fields.password ? 'invalid' : ''} type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" className="icon-btn ghost" onClick={() => setShow(!show)} aria-label={show ? 'Нууц үг нуух' : 'Нууц үг харуулах'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              {fields.password && <small className="field-error">{fields.password}</small>}
            </div>
          )}

          {mode === 'login' && (
            <label className="check-row">
              <input type="checkbox" checked={f.remember} onChange={set('remember')} />
              <span className="cb-native" />
              Намайг сана
            </label>
          )}

          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Түр хүлээнэ үү…' : mode === 'login' ? 'Нэвтрэх' : mode === 'register' ? 'Бүртгүүлэх' : mode === 'reset' ? 'Нууц үг шинэчлэх' : 'Холбоос илгээх'}
          </button>

          <p className="login-foot">
            {mode === 'login' && <>Бүртгэлгүй юу? <button type="button" className="link strong" onClick={() => switchMode('register')}>Бүртгүүлэх</button></>}
            {mode === 'register' && <>Бүртгэлтэй юу? <button type="button" className="link strong" onClick={() => switchMode('login')}>Нэвтрэх</button></>}
            {(mode === 'forgot' || mode === 'reset') && <button type="button" className="link strong" onClick={() => switchMode('login')}>← Нэвтрэх рүү буцах</button>}
          </p>
          {mode === 'login' && <p className="demo-hint">Демо: namjaa@example.mn / password123</p>}
        </form>
      </main>
    </div>
  );
}
