// reggi-notes.js — ProduceFlow load notes router, hosted inside Reggi (Monkey:3005)
// Author: nottingham gen-1 — 2026-10-01
//
// Mount (prosser, in ProstanEntityAPI.js):
//   try {
//     const r = require('D:/clients/nottingham/monkey/reggi-notes.js')
//     app.use('/notes', r)
//   } catch (err) { console.warn('  WARN: /notes not mounted:', err.message) }
//
// Contract: node c:/clients/prosser/readme.js --facet-reggi-mount (9 conditions).
//   #1 every handler through safe() + router error backstop   #2 router-scoped middleware only
//   #4 data in D:\clients\nottingham\data\ (503 if missing)    #5 express/better-sqlite3 via host
//   #6 DB closes on SIGTERM/SIGINT/exit                        #7 oakley edge identity, no secrets
//   #8 every list capped (200/page, 500/load, 500/import)      #9 POST idempotent via client_key
// Health: GET http://15.30.60.40:3005/notes/health

module.exports = require('../service/router.js');
