// client/src/lib/api.js
const API_ORIGIN = (import.meta.env?.VITE_API_ORIGIN || '').trim();
const SITE_ORIGIN = (import.meta.env?.VITE_SITE_ORIGIN || '').trim();

// Фолбэк: если билд открыт на finshard.com — используем продовый API
function inferApiFromLocation() {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname } = window.location;
  if (hostname.endsWith('finshard.com')) return 'https://api.finshard.com';
  // локалка/дев: тот же хост, порт 5000
  return `${protocol}//${hostname}:5000`;
}

const API =
  API_ORIGIN ||
  (SITE_ORIGIN.includes('finshard.com') ? 'https://api.finshard.com' : '') ||
  inferApiFromLocation();

function join(base, path) {
  if (!path.startsWith('/')) path = '/' + path;
  return base.replace(/\/+$/, '') + path;
}

export async function apiGet(path) {
  const r = await fetch(join(API, path), { credentials: 'include' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(join(API, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
