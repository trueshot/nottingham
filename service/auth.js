// auth.js — who is calling, and for which dataset
// Author: nottingham gen-1 (pattern: ticonderoga service/auth.js)
//
// Condition #7 (George 2026-09-08): the NORMAL authority model, no bespoke
// tenant secret. Through the edge, oakley's ALB_RProxy validates the session
// and strips inbound X-OAuth-* before routing, so those headers are unforgeable.
// Direct callers (tinc, tools) present a Bearer token, introspected against
// oakley at localhost:3007/api/check-auth.
//
// Dataset: X-OAuth-Dataset (edge) wins. A direct caller names it with
// X-Notes-Dataset or ?dataset=. A request whose edge dataset disagrees with the
// one it asks for is refused — a willis session cannot read another dataset.
//
// Dev (NOTES_DEV=1, standalone server only, never inside Reggi): X-Notes-Dev-User
// stands in for an identity so tests can run without oakley.

const DEV = process.env.NOTES_DEV === '1';
const AUTH_URL = process.env.NOTES_AUTH_URL || 'http://localhost:3007/api/check-auth';
const authCache = new Map(); // token -> {user|null, until}

async function introspect(token) {
  const hit = authCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  let user = null;
  try {
    const r = await fetch(AUTH_URL, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const j = await r.json();
      if (j.authenticated) user = { prostan8: String(j.prostan8 || ''), username: j.username || '', name: j.name || '', dataset: (j.dataset || '').toUpperCase() || null };
    }
  } catch (e) { /* oakley unreachable -> unauthenticated */ }
  authCache.set(token, { user, until: Date.now() + (user ? 300000 : 60000) });
  if (authCache.size > 5000) authCache.clear();
  return user;
}

function bearerToken(req) {
  const h = req.get('Authorization');
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  const m = (req.get('Cookie') || '').match(/(?:^|;\s*)bearer_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function attach(req) {
  if (req.notes) return req.notes;
  const who = { user: null, dataset: null, via: null };
  let edgeDataset = null;
  if (req.get('X-OAuth-Validated') === 'true') {
    who.user = { prostan8: req.get('X-OAuth-ProStan8') || '', username: req.get('X-OAuth-User') || '', name: req.get('X-OAuth-Name') || '' };
    edgeDataset = (req.get('X-OAuth-Dataset') || '').toUpperCase() || null;
    who.via = 'edge';
  } else {
    const token = bearerToken(req);
    if (token) {
      who.user = await introspect(token);
      if (who.user) { edgeDataset = who.user.dataset; who.via = 'bearer'; }
    }
  }
  if (DEV && !who.user && req.get('X-Notes-Dev-User')) {
    who.user = { prostan8: '', username: String(req.get('X-Notes-Dev-User')).slice(0, 60), name: '' };
    who.via = 'dev';
  }
  const asked = String(req.get('X-Notes-Dataset') || req.query.dataset || '').toUpperCase() || null;
  if (edgeDataset && asked && asked !== edgeDataset) {
    who.mismatch = `session is for ${edgeDataset}, request asked for ${asked}`;
  }
  who.dataset = edgeDataset || asked;
  if (who.dataset && !/^[A-Z0-9_]{1,30}$/.test(who.dataset)) { who.mismatch = 'bad dataset'; }
  req.notes = who;
  return who;
}

// Every /api route: signed in, dataset known, no dataset mismatch.
function requireUser(req, res, next) {
  attach(req).then(w => {
    if (!w.user) return res.status(401).json({ error: 'sign-in required' });
    if (w.mismatch) return res.status(403).json({ error: w.mismatch });
    if (!w.dataset) return res.status(400).json({ error: 'dataset required (X-Notes-Dataset header or ?dataset=)' });
    next();
  }).catch(e => res.status(500).json({ error: 'auth check failed: ' + e.message }));
}

const actor = req => (req.notes && req.notes.user && (req.notes.user.username || req.notes.user.prostan8)) || 'unknown';

module.exports = { DEV, attach, requireUser, actor };
