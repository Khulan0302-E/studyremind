// API клиент + офлайн кэш ба өөрчлөлтийн дараалал (FR-14, FR-15)
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* дүүрсэн */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* */ } },
};
export { LS };

export function getToken() { return sessionStorage.getItem('sr_token') || LS.get('sr_token', null); }
export function setToken(token, remember) {
  sessionStorage.setItem('sr_token', token);
  if (remember) LS.set('sr_token', token); else LS.del('sr_token');
}
export function clearSession() {
  sessionStorage.removeItem('sr_token');
  ['sr_token', 'sr_tasks', 'sr_classes', 'sr_queue', 'sr_user', 'sr_sources', 'sr_settings', 'sr_lastSync'].forEach(LS.del);
}

export class ApiError extends Error {
  constructor(status, data) { super(data.error || 'Алдаа гарлаа'); this.status = status; this.data = data; }
}

export async function api(method, url, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new ApiError(0, { error: 'Интернэт холболтоо шалгана уу' });
    err.offline = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---- офлайн дараалал ----
export const queue = {
  list() { return LS.get('sr_queue', []); },
  push(op) { const q = queue.list(); q.push({ ...op, at: Date.now() }); LS.set('sr_queue', q); },
  async flush() {
    let q = queue.list();
    const done = [];
    for (const op of q) {
      try {
        await api(op.method, op.url, op.body);
        done.push(op);
      } catch (e) {
        if (e.offline) break; // одоо ч офлайн
        done.push(op); // сервер татгалзсан → дахин оролдохгүй
      }
    }
    q = queue.list().filter((x) => !done.some((d) => d.at === x.at && d.url === x.url));
    LS.set('sr_queue', q);
    return { sent: done.length, left: q.length };
  },
};

// Өөрчлөлт илгээх: офлайн бол дараалалд хийнэ
export async function mutate(method, url, body) {
  try {
    return { data: await api(method, url, body), queued: false };
  } catch (e) {
    if (e.offline) { queue.push({ method, url, body }); return { data: null, queued: true }; }
    throw e;
  }
}
