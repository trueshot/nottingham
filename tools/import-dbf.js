#!/usr/bin/env node
// import-dbf.js — move legacy LISTHEAD/LISTTAIL/LISTNOTE notes into the notes service
// Author: nottingham gen-1
//
//   node tools/import-dbf.js --dataset WILLIS --dir <folder> [--dir <folder> ...] [--dry-run] [--out f.json]
//                            [--url http://15.30.60.40:3005/notes]   (token from env NOTES_TOKEN)
//
// --dir holds the three DBFs (any case): the central dbf\ folder and/or per-lot
// loads\<d>\<lot>\ folders. Later --dir wins per (LISTNO, LISTNOIDX), so pass
// central first, then the lots that changed since (per-lot copies are fresher —
// 2026-10-01 willis: lot 60000 had writes central did not).
//
// Posts through the service (Reggi stays the ONLY writer), 500 notes per batch.
// Re-runnable: the service keys on (legacy_listno, legacy_idx) and never
// overwrites a note already edited in the new UI.
//
// Body = NOTE1..NOTE10. A field filled to 250 chars runs straight on into the
// next (one 2500-char buffer, as trues.js renderNoteList joins them); a field
// that stops short and is followed by more text was a separate line.

const fs = require('fs');
const path = require('path');

function args() {
  const a = { dirs: [], dryRun: false, url: 'http://15.30.60.40:3005/notes', out: null, dataset: null };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '--dir') a.dirs.push(v[++i]);
    else if (v[i] === '--dataset') a.dataset = String(v[++i]).toUpperCase();
    else if (v[i] === '--url') a.url = v[++i];
    else if (v[i] === '--out') a.out = v[++i];
    else if (v[i] === '--dry-run') a.dryRun = true;
    else if (v[i] === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).join('\n')); process.exit(0); }
    else throw new Error('unknown arg ' + v[i]);
  }
  if (!a.dataset || !a.dirs.length) throw new Error('need --dataset and at least one --dir (see --help)');
  return a;
}

// Minimal dBASE III/FoxPro reader: header, field descriptors, fixed-width records.
function readDbf(file) {
  const buf = fs.readFileSync(file);
  const nRec = buf.readUInt32LE(4), hdrLen = buf.readUInt16LE(8), recLen = buf.readUInt16LE(10);
  const fields = [];
  for (let off = 32; off < hdrLen - 1 && buf[off] !== 0x0d; off += 32) {
    const name = buf.toString('latin1', off, off + 11).replace(/\0.*$/, '').trim().toLowerCase();
    fields.push({ name, type: String.fromCharCode(buf[off + 11]), len: buf[off + 16] });
  }
  const rows = [];
  for (let r = 0; r < nRec; r++) {
    const base = hdrLen + r * recLen;
    if (base + recLen > buf.length) break;
    if (buf[base] === 0x2a) continue;            // '*' = deleted record
    let p = base + 1;
    const row = {};
    for (const f of fields) { row[f.name] = buf.toString('latin1', p, p + f.len); p += f.len; }
    rows.push(row);
  }
  return rows;
}
function findFile(dir, name) {
  const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === name.toLowerCase());
  return hit ? path.join(dir, hit) : null;
}
const num = s => { const n = parseInt(String(s).trim(), 10); return Number.isFinite(n) ? n : null; };

function joinNote(n) {
  const lines = [];
  let cur = '';
  for (let i = 1; i <= 10; i++) {
    const raw = n['note' + i] || '';
    const t = raw.replace(/\s+$/, '');
    cur += t;
    if (t.length < raw.length) { lines.push(cur); cur = ''; }   // stopped short -> line ended
  }
  if (cur) lines.push(cur);
  return lines.join('\n').replace(/\s+$/, '');
}

function collect(dirs) {
  const lists = new Map(), notes = new Map();
  const stats = { dirs: 0, tails: 0, orphanNotes: 0, missingNote: 0 };
  for (const dir of dirs) {
    const fh = findFile(dir, 'listhead.dbf'), ft = findFile(dir, 'listtail.dbf'), fn = findFile(dir, 'listnote.dbf');
    if (!fh || !ft || !fn) { console.warn('skip (missing DBF): ' + dir); continue; }
    stats.dirs++;
    for (const h of readDbf(fh)) {
      const id = num(h.listno);
      if (id) lists.set(id, { list_id: id, name: h.listname.trim(), short: h.listshort.trim(), descr: (h.listdesc || '').trim() });
    }
    const bodies = new Map();
    for (const n of readDbf(fn)) bodies.set(num(n.listno) + ':' + num(n.listnoidx), joinNote(n));
    const seen = new Set();
    for (const t of readDbf(ft)) {
      const listNo = num(t.listno), idx = num(t.listnoidx), load = String(t.invce_no || '').trim();
      if (!listNo || idx == null || !load) continue;
      const k = listNo + ':' + idx;
      seen.add(k);
      stats.tails++;
      if (!bodies.has(k)) stats.missingNote++;
      notes.set(k, { legacy_listno: listNo, legacy_idx: idx, load_no: load, item_no: (t.item_no || '').trim(), id_no: (t.id_no || '').trim(), body: bodies.get(k) || '' });
    }
    for (const k of bodies.keys()) if (!seen.has(k)) stats.orphanNotes++;
  }
  // Lists referenced by a note but absent from every LISTHEAD still need a row.
  for (const n of notes.values()) if (!lists.has(n.legacy_listno)) lists.set(n.legacy_listno, { list_id: n.legacy_listno, name: 'List ' + n.legacy_listno, short: String(n.legacy_listno) });
  return { lists: [...lists.values()], notes: [...notes.values()], stats };
}

(async () => {
  const a = args();
  const data = collect(a.dirs);
  console.log(`read ${data.stats.dirs} dir(s): ${data.lists.length} lists, ${data.notes.length} notes ` +
    `(${data.stats.missingNote} tails without text, ${data.stats.orphanNotes} texts without a tail — skipped)`);
  if (a.out) { fs.writeFileSync(a.out, JSON.stringify(data, null, 2)); console.log('wrote ' + a.out); }
  if (a.dryRun) return;

  const token = process.env.NOTES_TOKEN;
  if (!token) throw new Error('NOTES_TOKEN env var required (a normal ProduceFlow bearer token for ' + a.dataset + ')');
  const total = { lists: 0, inserted: 0, updated: 0, unchanged: 0, kept_app_edit: 0, errors: [] };
  for (let i = 0; i < data.notes.length || i === 0; i += 500) {
    const body = { lists: i === 0 ? data.lists : [], notes: data.notes.slice(i, i + 500) };
    const r = await fetch(a.url + '/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-Notes-Dataset': a.dataset },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`batch at ${i}: HTTP ${r.status} ${JSON.stringify(j)}`);
    for (const k of ['lists', 'inserted', 'updated', 'unchanged', 'kept_app_edit']) total[k] += j[k];
    total.errors.push(...j.errors);
    process.stdout.write(`  batch ${i / 500 + 1}: +${j.inserted} ~${j.updated} =${j.unchanged}\n`);
    if (!data.notes.length) break;
  }
  console.log(JSON.stringify(Object.assign({}, total, { errors: total.errors.slice(0, 20), error_count: total.errors.length }), null, 2));
})().catch(e => { console.error('import failed: ' + e.message); process.exit(1); });
