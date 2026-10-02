// --- Load notes: chips + Add / Edit, backed by the /notes service ---------
// nottingham gen-1 — billet nottinghamListNotes. Owns #theListDiv render.
// Source of truth for this block: c:/clients/nottingham/ui/notes-strip.js
// (pasted into willdev/javascripts/trues.js between these markers; deploy: gitgeorg push.js willdev).
//
// Data: /notes/api (Reggi on Monkey via oakley's edge; the session cookie
// carries identity + dataset). Chips: click to open; an open note has Edit.
// "+ Note" (createListNote) and Edit open one modal: just the text, no list picker
// (George 2026-10-02: lists were a hack; labels come later). createnote.prg is retired.
// If /notes cannot be reached, the strip shows the legacy DBF notes read-only.
var NTG_PALETTE = [
   '#d32f2f', '#1976d2', '#2e7d32', '#ef6c00',
   '#6a1b9a', '#00838f', '#c2185b', '#455a64',
]
var NTG_API = '/notes/api'
function ntgEsc(s) {
   return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
}
function ntgEnsureNotesCss() {
   if (document.getElementById('ntgn-css')) return
   var s = document.createElement('style')
   s.id = 'ntgn-css'
   s.textContent =
      '.ntgn-wrap{font-family:Roboto,Arial,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 0;}' +
      '.ntgn-sum{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#5f6368;cursor:pointer;background:none;border:none;padding:2px 6px;border-radius:4px;}' +
      '.ntgn-sum:hover{background:#eef1f5;}' +
      '.ntgn-caret{font-size:9px;color:#80868b;}' +
      '.ntgn-chip{display:inline-flex;align-items:center;gap:6px;max-width:300px;padding:3px 11px 3px 9px;border-radius:14px;background:#f1f3f4;border:1px solid #e3e6e9;font-size:12px;color:#3c4043;cursor:pointer;line-height:18px;transition:background .12s,box-shadow .12s;}' +
      '.ntgn-chip:hover{background:#e8eaed;box-shadow:0 1px 3px rgba(0,0,0,.14);}' +
      '.ntgn-chip.ntgn-on{background:#e8f0fe;border-color:#c5d8fb;}' +
      '.ntgn-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}' +
      '.ntgn-tag{font-weight:600;}' +
      '.ntgn-snip{color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px;}' +
      '.ntgn-panel{flex:1 1 100%;box-sizing:border-box;background:#fff;border:1px solid #e3e6e9;border-left:3px solid #1976d2;border-radius:6px;padding:8px 12px;margin:1px 0 3px;font-size:13px;color:#202124;white-space:pre-wrap;line-height:1.45;box-shadow:0 1px 2px rgba(0,0,0,.06);}' +
      '.ntgn-ph{display:flex;align-items:center;gap:8px;font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:3px;white-space:normal;}' +
      '.ntgn-meta{font-weight:400;letter-spacing:0;text-transform:none;color:#80868b;}' +
      '.ntgn-empty{font-size:12px;color:#9aa0a6;font-style:italic;}' +
      '.ntgn-btn{font:600 12px Roboto,Arial,sans-serif;padding:3px 12px;border-radius:4px;border:1px solid #dadce0;background:#fff;color:#1a73e8;cursor:pointer;}' +
      '.ntgn-btn:hover{background:#f1f6fe;}' +
      '.ntgn-btn.ntgn-primary{background:#1a73e8;border-color:#1a73e8;color:#fff;}' +
      '.ntgn-btn.ntgn-primary:hover{background:#1765cc;}' +
      '.ntgn-btn[disabled]{opacity:.55;cursor:default;}' +
      '.ntgn-ph .ntgn-btn{margin-left:auto;padding:1px 10px;font-size:11px;letter-spacing:0;text-transform:none;}' +
      '.ntgn-overlay{position:fixed;inset:0;z-index:100000;background:rgba(32,33,36,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;}' +
      '.ntgn-dialog{width:520px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:16px 20px 14px;font-family:Roboto,Arial,sans-serif;color:#202124;}' +
      '.ntgn-dhead{display:flex;align-items:baseline;gap:10px;margin-bottom:12px;}' +
      '#ntgn-title{font-size:16px;font-weight:600;}' +
      '.ntgn-dload{font-size:12px;color:#5f6368;}' +
      '.ntgn-x{margin-left:auto;border:none;background:none;font-size:22px;line-height:1;color:#5f6368;cursor:pointer;padding:0 4px;}' +
      '.ntgn-x:hover{color:#202124;}' +
      '.ntgn-lbl{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#5f6368;margin:8px 0 4px;}' +
      '.ntgn-dialog select{width:100%;box-sizing:border-box;font:14px Roboto,Arial,sans-serif;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;background:#fff;}' +
      '.ntgn-dialog textarea{display:block;width:100%;box-sizing:border-box;min-height:140px;padding:8px 10px;font:14px/1.45 Roboto,Arial,sans-serif;border:1px solid #dadce0;border-radius:4px;resize:vertical;}' +
      '.ntgn-dialog textarea:focus,.ntgn-dialog select:focus{outline:2px solid #c5d8fb;border-color:#1a73e8;}' +
      '.ntgn-dfoot{display:flex;align-items:center;gap:8px;margin-top:12px;}' +
      '.ntgn-hint{font-size:11px;color:#9aa0a6;}' +
      '.ntgn-err{color:#c5221f;font-size:12px;margin-right:auto;}'
   document.head.appendChild(s)
}
function getNotesDisplayMode() {
   if (!_app.notesDisplayMode) {
      var saved = null
      try {
         saved = localStorage.getItem('notesDisplayMode')
      } catch (e) {}
      _app.notesDisplayMode = saved === 'expanded' ? 'expanded' : 'compact'
   }
   return _app.notesDisplayMode
}
function ntgApi(method, path, body) {
   return fetch(NTG_API + path, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
   }).then(function (r) {
      return r
         .json()
         .catch(function () {
            return {}
         })
         .then(function (j) {
            if (!r.ok) {
               var e = new Error(j.error || 'HTTP ' + r.status)
               e.status = r.status
               e.body = j
               throw e
            }
            return j
         })
   })
}
function ntgLoadNo() {
   return String(_app.theCurrentLoad || '').trim()
}
// _app.ntg = {load, live, ready, notes, lists}   _app.ntgEdit = open modal state
//   live=true  -> notes came from /notes (editable)
//   live=false -> /notes unreachable; legacy DBF notes, read-only
function ntgFetch() {
   var load = ntgLoadNo()
   var lists = _app.ntg && _app.ntg.lists
   _app.ntg = { load: load, live: false, ready: false, notes: [], lists: lists }
   _app.notesOpen = {}
   if (!load) return
   Promise.all([
      ntgApi('GET', '/loads/' + encodeURIComponent(load) + '/notes'),
      lists ? { lists: lists } : ntgApi('GET', '/lists'),
   ])
      .then(function (r) {
         if (!_app.ntg || _app.ntg.load !== load) return // user moved to another load
         _app.ntg.notes = r[0].notes || []
         _app.ntg.lists = r[1].lists || []
         _app.ntg.live = true
         _app.ntg.ready = true
         renderNoteList()
      })
      .catch(function (e) {
         console.warn('[notes] /notes unavailable, showing legacy DBF notes read-only: ' + e.message)
         if (!_app.ntg || _app.ntg.load !== load) return
         _app.ntg.ready = true
         renderNoteList()
      })
}
function ntgRefresh() {
   var load = ntgLoadNo()
   return ntgApi('GET', '/loads/' + encodeURIComponent(load) + '/notes').then(function (r) {
      if (_app.ntg && _app.ntg.load === load) {
         _app.ntg.notes = r.notes || []
         renderNoteList()
      }
   })
}
function ntgAccent(listId) {
   var lists = (_app.ntg && _app.ntg.lists) || []
   for (var i = 0; i < lists.length; i++) {
      if (lists[i].list_id === listId) return lists[i].color || NTG_PALETTE[i % NTG_PALETTE.length]
   }
   return NTG_PALETTE[0]
}
// Legacy: join the head/tail/note DBF tables for the current load.
function ntgLegacyNotes() {
   var nl = _app.theCurrentNoteList
   var list = []
   if (!(nl && nl.LISTHEAD && nl.LISTHEAD.length)) return list
   for (var i = 0; i < nl.LISTHEAD.length; i++) {
      for (var p = 0; p < nl.LISTTAIL.length; p++) {
         if (nl.LISTHEAD[i].listno !== nl.LISTTAIL[p].listno) continue
         for (var q = 0; q < nl.LISTNOTE.length; q++) {
            if (nl.LISTTAIL[p].listno !== nl.LISTNOTE[q].listno) continue
            if (nl.LISTTAIL[p].listnoidx !== nl.LISTNOTE[q].listnoidx) continue
            var n = nl.LISTNOTE[q]
            var full = [n.note1, n.note2, n.note3, n.note4, n.note5, n.note6, n.note7, n.note8, n.note9, n.note10]
               .map(function (x) {
                  return x || ''
               })
               .join('')
               .replace(/\s+$/, '')
            list.push({
               id: null,
               short: nl.LISTHEAD[i].listshort || '(list)',
               name: nl.LISTHEAD[i].listname || '',
               full: full,
               accent: NTG_PALETTE[i % NTG_PALETTE.length],
            })
         }
      }
   }
   return list
}
function ntgNotesData() {
   if (!(_app.ntg && _app.ntg.ready)) return [] // blank until /notes answers (no legacy flash)
   if (!_app.ntg.live) return ntgLegacyNotes()
   return _app.ntg.notes.map(function (n) {
      return {
         id: n.id,
         list_id: n.list_id,
         short: n.list_short || '',
         name: n.list_name || '',
         full: n.body || '',
         accent: n.list_id ? ntgAccent(n.list_id) : '#5f6368',
         updated_at: n.updated_at,
         updated_by: n.updated_by,
      }
   })
}
function ntgToggleAll() {
   _app.notesDisplayMode = getNotesDisplayMode() === 'expanded' ? 'compact' : 'expanded'
   try {
      localStorage.setItem('notesDisplayMode', _app.notesDisplayMode)
   } catch (e) {}
   renderNoteList()
}
function ntgToggleNote(i) {
   _app.notesOpen = _app.notesOpen || {}
   _app.notesOpen[i] = !_app.notesOpen[i]
   renderNoteList()
}
// --- modal editor: Add (+ Note) and Edit share it ---
// Lives on <body>, outside #theListDiv, so strip re-renders never touch it.
function ntgModalOpen(noteId) {
   if (document.getElementById('ntgn-modal')) return
   var load = ntgLoadNo()
   if (!load) return
   var ed = { id: noteId == null ? null : noteId, load: load, body: '', stamp: null, saving: false }
   if (ed.id == null) {
      ed.key = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
   } else {
      var n = ((_app.ntg && _app.ntg.notes) || []).filter(function (x) {
         return x.id === ed.id
      })[0]
      if (!n) return
      ed.body = n.body || ''
      ed.stamp = n.updated_at
   }
   _app.ntgEdit = ed
   var m = document.createElement('div')
   m.id = 'ntgn-modal'
   m.className = 'ntgn-overlay'
   m.innerHTML =
      '<div class="ntgn-dialog" role="dialog" aria-modal="true" aria-labelledby="ntgn-title">' +
      '<div class="ntgn-dhead"><span id="ntgn-title">' + (ed.id == null ? 'Add note' : 'Edit note') +
      '</span><span class="ntgn-dload">Load ' + ntgEsc(load) + '</span>' +
      '<button type="button" class="ntgn-x" title="Close (Esc)" onclick="ntgModalClose()">&times;</button></div>' +
      '<textarea id="ntgn-ta" maxlength="20000" placeholder="Type the note…"></textarea>' +
      '<div class="ntgn-dfoot"><span class="ntgn-err" id="ntgn-err"></span>' +
      '<span class="ntgn-hint">Ctrl+Enter to save</span>' +
      '<button type="button" class="ntgn-btn" id="ntgn-cancel" onclick="ntgModalClose()">Cancel</button>' +
      '<button type="button" class="ntgn-btn ntgn-primary" id="ntgn-save" onclick="ntgSave()">Save</button></div>' +
      '</div>'
   document.body.appendChild(m)
   var ta = document.getElementById('ntgn-ta')
   ta.value = ed.body
   m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') ntgModalClose()
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ntgSave()
   })
   ta.focus()
   ta.setSelectionRange(ta.value.length, ta.value.length)
}
function ntgModalClose() {
   var ed = _app.ntgEdit
   if (ed && ed.saving) return
   var m = document.getElementById('ntgn-modal')
   if (m) m.parentNode.removeChild(m)
   _app.ntgEdit = null
}
function ntgModalError(msg) {
   var e = document.getElementById('ntgn-err')
   if (e) e.textContent = msg || ''
}
function ntgModalBusy(busy) {
   var s = document.getElementById('ntgn-save')
   var c = document.getElementById('ntgn-cancel')
   if (s) {
      s.disabled = busy
      s.textContent = busy ? 'Saving…' : 'Save'
   }
   if (c) c.disabled = busy
}
function ntgSave() {
   var ed = _app.ntgEdit
   if (!ed || ed.saving) return
   var body = document.getElementById('ntgn-ta').value
   if (!body.trim()) return ntgModalError('The note is empty.')
   ed.saving = true
   ntgModalError('')
   ntgModalBusy(true)
   var p =
      ed.id == null
         ? ntgApi('POST', '/loads/' + encodeURIComponent(ed.load) + '/notes', { body: body, client_key: ed.key })
         : ntgApi('PUT', '/notes/' + ed.id, { body: body, expect_updated_at: ed.stamp })
   p.then(function (r) {
      ed.saving = false
      ntgModalClose()
      var savedId = r.note && r.note.id
      if (ed.load !== ntgLoadNo()) return
      return ntgRefresh().then(function () {
         // open the saved note so the user sees what was stored
         var notes = ntgNotesData()
         for (var i = 0; i < notes.length; i++) if (notes[i].id === savedId) _app.notesOpen[i] = true
         renderNoteList()
      })
   }).catch(function (e) {
      ed.saving = false
      ntgModalBusy(false)
      if (e.status === 409 && e.body && e.body.current) {
         ed.stamp = e.body.current.updated_at
         ntgModalError(
            'Changed by ' + (e.body.current.updated_by || 'someone else') + ' while you were editing. Their text: "' +
               String(e.body.current.body || '').slice(0, 80) + '". Save again to replace it with yours.',
         )
      } else if (e.status === 401) {
         ntgModalError('Your session has expired. Copy your note, sign in again, then retry.')
      } else {
         ntgModalError('Not saved: ' + e.message)
      }
   })
}
function ntgWhen(iso) {
   if (!iso) return ''
   var d = new Date(iso)
   return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear()
}
function renderNoteList() {
   var div = document.getElementById('theListDiv')
   if (!div) return
   if (!_app.ntg || _app.ntg.load !== ntgLoadNo()) ntgFetch()
   ntgEnsureNotesCss()
   var notes = ntgNotesData()
   if (!notes.length) {
      div.innerHTML = ''
      return
   }
   var allOpen = getNotesDisplayMode() === 'expanded'
   _app.notesOpen = _app.notesOpen || {}
   var caret = allOpen ? '&#9662;' : '&#9656;'
   var h = ['<span class="ntgn-wrap">']
   if (notes.length) {
      h.push(
         '<button type="button" class="ntgn-sum" title="' + (allOpen ? 'Collapse all' : 'Expand all') +
            '" onclick="ntgToggleAll()"><span class="ntgn-caret">' + caret + '</span>' +
            notes.length + ' note' + (notes.length === 1 ? '' : 's') + '</button>',
      )
   }
   notes.forEach(function (x, i) {
      var on = allOpen || _app.notesOpen[i]
      var plain = x.full ? x.full.replace(/\s+/g, ' ').trim() : ''
      var snipHtml = ntgEsc(plain.slice(0, 24)) + (plain.length > 24 ? '&#8230;' : '')
      h.push(
         '<span class="ntgn-chip' + (on ? ' ntgn-on' : '') + '" onclick="ntgToggleNote(' + i + ')" title="' +
            ntgEsc((x.short ? x.short + ': ' : '') + plain) + '"><span class="ntgn-dot" style="background:' + x.accent + '"></span>' +
            // legacy notes keep their list label; new notes have none (George 2026-10-02) -> text only
            (x.short ? '<span class="ntgn-tag" style="color:' + x.accent + '">' + ntgEsc(x.short) + '</span>' : '') +
            (on && x.short ? '' : '<span class="ntgn-snip">' + snipHtml + '</span>') + '</span>',
      )
      if (on) {
         var meta = x.updated_by ? x.updated_by.replace(/^import:.*/, 'imported') + (x.updated_at ? ', ' + ntgWhen(x.updated_at) : '') : ''
         h.push(
            '<span class="ntgn-panel" style="border-left-color:' + x.accent + '"><span class="ntgn-ph" style="color:' +
               x.accent + '">' + (x.short ? ntgEsc(x.short) + (x.name && x.name !== x.short ? ' &mdash; ' + ntgEsc(x.name) : '') : 'Note') +
               (meta ? '<span class="ntgn-meta">' + ntgEsc(meta) + '</span>' : '') +
               (x.id != null ? '<button type="button" class="ntgn-btn" onclick="event.stopPropagation();ntgEdit(' + x.id + ')">Edit</button>' : '') +
               '</span>' + (x.full ? ntgEsc(x.full) : '<span class="ntgn-empty">(no text)</span>') + '</span>',
         )
      }
   })
   h.push('</span>')
   div.innerHTML = h.join('')
}
// "+ Note" in the load header (salesgrid.js) and the Edit button call these.
function ntgEdit(noteId) {
   ntgModalOpen(noteId)
}
var createListNote = function () {
   ntgModalOpen(null)
}
// --- end load notes ---------------------------------------------------------
