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
      // --- post-it board ---
      '.ntgn-board{font-family:Roboto,Arial,sans-serif;padding:4px 2px 10px;}' +
      '.ntgn-sum{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#5f6368;cursor:pointer;background:none;border:none;padding:2px 6px;margin:0 0 4px -6px;border-radius:4px;}' +
      '.ntgn-sum:hover{background:#eef1f5;}' +
      '.ntgn-caret{font-size:9px;color:#80868b;}' +
      '.ntgn-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px 14px;}' +
      '.ntgn-pi{position:relative;box-sizing:border-box;width:200px;min-height:104px;padding:16px 12px 14px;background:#fff7b0;' +
      'color:#3d3a1c;font-size:13px;line-height:1.4;cursor:pointer;border-radius:1px 1px 2px 2px;' +
      'box-shadow:0 1px 1px rgba(60,50,0,.10),0 6px 10px -4px rgba(60,50,0,.28);transform:rotate(var(--ntg-r,0deg));' +
      'transition:transform .15s ease,box-shadow .15s ease;' +
      'background-image:linear-gradient(135deg,transparent 0,transparent calc(100% - 16px),rgba(0,0,0,.07) calc(100% - 16px),#f2e58a calc(100% - 15px),#fff7b0 100%);}' +
      '.ntgn-pi:hover{transform:rotate(0deg) translateY(-3px);box-shadow:0 2px 2px rgba(60,50,0,.10),0 12px 18px -6px rgba(60,50,0,.32);z-index:2;}' +
      '.ntgn-pi.ntgn-ro{cursor:default;}' +
      '.ntgn-pi.ntgn-ro:hover{transform:rotate(var(--ntg-r,0deg));}' +
      '.ntgn-tape{position:absolute;top:-7px;left:50%;width:58px;height:16px;margin-left:-29px;background:rgba(255,255,255,.55);' +
      'box-shadow:0 1px 2px rgba(0,0,0,.10);transform:rotate(-2deg);}' +
      '.ntgn-pmeta{display:flex;align-items:center;gap:6px;font-size:11px;color:#8a8350;margin-bottom:5px;white-space:nowrap;}' +
      '.ntgn-pmeta > span:not(.ntgn-plab):not(.ntgn-pedit){overflow:hidden;text-overflow:ellipsis;min-width:0;}' +
      '.ntgn-plab{flex:0 0 auto;font-weight:700;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:0 5px;border-radius:3px;color:#fff;}' +
      '.ntgn-pedit{margin-left:auto;font-size:13px;color:#8a8350;opacity:0;transition:opacity .15s;}' +
      '.ntgn-pi:hover .ntgn-pedit{opacity:1;}' +
      '.ntgn-pbody{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden;}' +
      '.ntgn-pbody.ntgn-full{display:block;}' +
      '.ntgn-empty{color:#a39d6a;font-style:italic;}' +
      '.ntgn-padd{display:flex;align-items:center;justify-content:center;width:130px;min-height:104px;box-sizing:border-box;border:2px dashed #e0d58a;' +
      'border-radius:2px;color:#a39d6a;font:600 13px Roboto,Arial,sans-serif;background:rgba(255,247,176,.25);cursor:pointer;}' +
      '.ntgn-padd:hover{background:rgba(255,247,176,.6);color:#6b6430;}' +
      '.ntgn-btn{font:600 12px Roboto,Arial,sans-serif;padding:3px 12px;border-radius:4px;border:1px solid #dadce0;background:#fff;color:#1a73e8;cursor:pointer;}' +
      '.ntgn-btn:hover{background:#f1f6fe;}' +
      '.ntgn-btn.ntgn-primary{background:#1a73e8;border-color:#1a73e8;color:#fff;}' +
      '.ntgn-btn.ntgn-primary:hover{background:#1765cc;}' +
      '.ntgn-btn[disabled]{opacity:.55;cursor:default;}' +
      '.ntgn-ph .ntgn-btn{margin-left:4px;padding:1px 10px;font-size:11px;letter-spacing:0;text-transform:none;}' +
      '.ntgn-overlay{position:fixed;inset:0;z-index:100000;background:rgba(32,33,36,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;}' +
      '.ntgn-dialog{width:520px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fffbd6;border-radius:4px;border-top:6px solid #f2e58a;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:16px 20px 14px;font-family:Roboto,Arial,sans-serif;color:#202124;}' +
      '.ntgn-dhead{display:flex;align-items:baseline;gap:10px;margin-bottom:12px;}' +
      '#ntgn-title{font-size:16px;font-weight:600;}' +
      '.ntgn-dload{font-size:12px;color:#5f6368;}' +
      '.ntgn-x{margin-left:auto;border:none;background:none;font-size:22px;line-height:1;color:#5f6368;cursor:pointer;padding:0 4px;}' +
      '.ntgn-x:hover{color:#202124;}' +
      '.ntgn-lbl{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#5f6368;margin:8px 0 4px;}' +
      '.ntgn-dialog select{width:100%;box-sizing:border-box;font:14px Roboto,Arial,sans-serif;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;background:#fff;}' +
      '.ntgn-dialog textarea{display:block;width:100%;box-sizing:border-box;min-height:160px;padding:10px 12px;font:14px/1.5 Roboto,Arial,sans-serif;color:#3d3a1c;background:#fff7b0;border:1px solid #eadf8f;border-radius:2px;resize:vertical;}' +
      '.ntgn-dialog textarea:focus,.ntgn-dialog select:focus{outline:2px solid #c5d8fb;border-color:#1a73e8;}' +
      '.ntgn-dfoot{display:flex;align-items:center;gap:8px;margin-top:12px;}' +
      '.ntgn-hint{font-size:11px;color:#9aa0a6;}' +
      '.ntgn-del{color:#c5221f;border-color:#f3c2bf;}' +
      '.ntgn-del:hover{background:#fdecea;}' +
      '.ntgn-del.ntgn-armed{background:#c5221f;border-color:#c5221f;color:#fff;}' +
      '.ntgn-err{color:#c5221f;font-size:12px;margin-right:auto;}'
   document.head.appendChild(s)
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
// Notes for the current load, as delivered by the normal load call-up
// (GET /api/v1/loads/<load>/details -> all.jsn, top-level NOTES = that load's
// notes.jsn, spliced in by i_ldld — palmbeach 2026-10-02). The loader stores it in
// _app.i_ntgNotes[load]. Shape: {format:'nottingham-notes/1', notes:[...]}.
function ntgLoadedNotes() {
   var src = _app.i_ntgNotes && _app.i_ntgNotes[ntgLoadNo()]
   return src && src.format === 'nottingham-notes/1' && src.notes && src.notes.length !== undefined ? src : null
}
// _app.ntg = {load, src, live, ready, notes}   _app.ntgEdit = open modal state
//   live=true  -> notes from the load data (NOTES) or /notes (editable)
//   live=false -> neither available; legacy DBF notes (LIST), read-only
function ntgFetch() {
   var load = ntgLoadNo()
   var src = ntgLoadedNotes()
   _app.ntg = { load: load, src: src, live: false, ready: false, notes: [] }

   if (!load) return
   if (src) {
      // Normal path: the notes came with the load — no extra request.
      _app.ntg.notes = src.notes
      _app.ntg.live = true
      _app.ntg.ready = true
      return
   }
   // No NOTES in the load data (a load with no notes.jsn yet): ask /notes directly.
   ntgApi('GET', '/loads/' + encodeURIComponent(load) + '/notes')
      .then(function (r) {
         if (!_app.ntg || _app.ntg.load !== load) return // user moved to another load
         _app.ntg.notes = r.notes || []
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
// Right after a save (here or in the Flow bar) the load data is a few seconds
// behind, so re-read this load's notes straight from /notes.
function ntgRefresh() {
   var load = ntgLoadNo()
   return ntgApi('GET', '/loads/' + encodeURIComponent(load) + '/notes').then(function (r) {
      if (_app.ntg && _app.ntg.load === load) {
         _app.ntg.notes = r.notes || []
         _app.ntg.live = true
         _app.ntg.ready = true
         renderNoteList()
      }
   })
}
// Another part of the page saved a note (prospect's Flow bar):
//   document.dispatchEvent(new CustomEvent('notes:changed', {detail: {load: '60000'}}))
if (!window.__ntgHooked) {
   window.__ntgHooked = true
   document.addEventListener('notes:changed', function (e) {
      var load = e && e.detail && e.detail.load
      if (_app.ntgEdit || !(_app.ntg && _app.ntg.load === ntgLoadNo())) return
      if (!load || String(load).trim() === ntgLoadNo()) ntgRefresh().catch(function () {})
   })
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
         accent: n.list_id ? n.list_color || NTG_PALETTE[n.list_id % NTG_PALETTE.length] : '#5f6368',
         updated_at: n.updated_at,
         updated_by: n.updated_by,
      }
   })
}
// Show / hide the post-it row; remembered per browser.
function ntgCollapsed() {
   if (_app.notesCollapsed === undefined) {
      var saved = null
      try {
         saved = localStorage.getItem('notesCollapsed')
      } catch (e) {}
      _app.notesCollapsed = saved === '1'
   }
   return _app.notesCollapsed
}
function ntgToggleAll() {
   _app.notesCollapsed = !ntgCollapsed()
   try {
      localStorage.setItem('notesCollapsed', _app.notesCollapsed ? '1' : '0')
   } catch (e) {}
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
      '<div class="ntgn-dfoot">' +
      (ed.id == null ? '' : '<button type="button" class="ntgn-btn ntgn-del" id="ntgn-del" onclick="ntgDelete()">Delete</button>') +
      '<span class="ntgn-err" id="ntgn-err"></span>' +
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
   var d = document.getElementById('ntgn-del')
   if (d) d.disabled = busy
}
// Delete = soft delete (restorable; waco's audit trail records it). Two clicks,
// no browser confirm(): the first arms the button, the second deletes.
function ntgDelete() {
   var ed = _app.ntgEdit
   var btn = document.getElementById('ntgn-del')
   if (!ed || ed.saving || ed.id == null || !btn) return
   if (!ed.armDelete) {
      ed.armDelete = true
      btn.textContent = 'Click again to delete'
      btn.className = 'ntgn-btn ntgn-del ntgn-armed'
      return
   }
   ed.saving = true
   ntgModalError('')
   ntgModalBusy(true)
   btn.textContent = 'Deleting…'
   ntgApi('DELETE', '/notes/' + ed.id)
      .then(function () {
         ed.saving = false
         ntgModalClose()

         if (ed.load === ntgLoadNo()) return ntgRefresh()
      })
      .catch(function (e) {
         ed.saving = false
         ed.armDelete = false
         ntgModalBusy(false)
         btn.textContent = 'Delete'
         btn.className = 'ntgn-btn ntgn-del'
         ntgModalError(e.status === 401 ? 'Your session has expired. Sign in again, then retry.' : 'Not deleted: ' + e.message)
      })
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
      if (ed.load !== ntgLoadNo()) return
      // a new note on a hidden board: show the board so the user sees it land
      if (_app.notesCollapsed) {
         _app.notesCollapsed = false
         try {
            localStorage.setItem('notesCollapsed', '0')
         } catch (e) {}
      }
      return ntgRefresh()
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
   return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2)
}
function renderNoteList() {
   var div = document.getElementById('theListDiv')
   if (!div) return
   // (Re)read whenever the load or its retrieved data changes: open, Refresh, call-up.
   if (!_app.ntg || _app.ntg.load !== ntgLoadNo() || _app.ntg.src !== ntgLoadedNotes()) ntgFetch()
   ntgEnsureNotesCss()
   var notes = ntgNotesData()
   if (!notes.length) {
      div.innerHTML = ''
      return
   }
   var collapsed = ntgCollapsed()
   var editable = !!(_app.ntg && _app.ntg.live)
   var h = ['<div class="ntgn-board">']
   h.push(
      '<button type="button" class="ntgn-sum" title="' + (collapsed ? 'Show notes' : 'Hide notes') +
         '" onclick="ntgToggleAll()"><span class="ntgn-caret">' + (collapsed ? '&#9656;' : '&#9662;') + '</span>' +
         notes.length + ' note' + (notes.length === 1 ? '' : 's') + '</button>',
   )
   if (!collapsed) {
      h.push('<div class="ntgn-row">')
      notes.forEach(function (x) {
         // a slight, stable tilt per note (same note, same angle every render)
         var tilt = ((((x.id || x.full.length) * 37) % 7) - 3) * 0.45
         var who = x.updated_by ? x.updated_by.replace(/^import:.*/, 'imported') : ''
         var meta = who + (x.updated_at ? (who ? ' · ' : '') + ntgWhen(x.updated_at) : '')
         var canEdit = editable && x.id != null
         h.push(
            '<div class="ntgn-pi' + (canEdit ? '' : ' ntgn-ro') + '" style="--ntg-r:' + tilt.toFixed(2) + 'deg"' +
               (canEdit ? ' onclick="ntgEdit(' + x.id + ')" title="Click to edit"' : '') + '>' +
               '<span class="ntgn-tape"></span>' +
               '<div class="ntgn-pmeta">' +
               // legacy notes keep their list label; new notes have none (George 2026-10-02)
               (x.short ? '<span class="ntgn-plab" style="background:' + x.accent + '">' + ntgEsc(x.short) + '</span>' : '') +
               '<span>' + ntgEsc(meta) + '</span>' +
               (canEdit ? '<span class="ntgn-pedit">&#9998;</span>' : '') +
               '</div>' +
               '<div class="ntgn-pbody">' + (x.full ? ntgEsc(x.full) : '<span class="ntgn-empty">(no text)</span>') + '</div>' +
               '</div>',
         )
      })
      if (editable) h.push('<div class="ntgn-padd" onclick="createListNote()" title="Add a note">+ Add note</div>')
      h.push('</div>')
   }
   h.push('</div>')
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
