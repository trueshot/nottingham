#!/usr/bin/env node
// server.js — standalone host for the notes service (dev + tests). Production is NOT
// this file: production mounts service/router.js inside Reggi at /notes.
// Author: nottingham gen-1
//
//   node service/server.js                 -> http://localhost:3520/notes/health
//   NOTES_PORT=4000 NOTES_DATA_DIR=... node service/server.js
//   NOTES_DEV=1 (default here) allows the X-Notes-Dev-User header.

if (process.env.NOTES_DEV == null) process.env.NOTES_DEV = '1';
const fs = require('fs');
const { hostRequire } = require('./deps');
const express = hostRequire('express');
const db = require('./db');

if (!process.env.NOTES_DATA_DIR) fs.mkdirSync(db.DATA, { recursive: true });   // explicit dir must already exist (tests the 503 path)
const app = express();
app.use('/notes', require('./router'));

const port = Number(process.env.NOTES_PORT) || 3520;
app.listen(port, () => {
  const st = db.status();
  console.log(`nottingham notes service  http://localhost:${port}/notes/health`);
  console.log(`  data: ${st.dbPath}${st.ok ? '' : '  (!) ' + st.error}`);
});
