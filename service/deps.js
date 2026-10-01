// deps.js — resolve host-provided modules (express, better-sqlite3)
// Author: nottingham gen-1 (pattern: ticonderoga service/deps.js)
//
// Nothing is installed in this repo. Inside Reggi the modules come from the
// host's node_modules (require.main) — prosser condition #5. Standalone on
// georg they come from a sibling repo.

const path = require('path');

const SIBLINGS = [
  'c:/clients/marshalltown/node_modules',
  'd:/clients/marshalltown/node_modules',
  path.resolve(__dirname, '..', 'node_modules')
];

function hostRequire(name) {
  try { return require(name); } catch (e) { /* fall through */ }
  if (require.main && require.main !== module) {
    try { return require.main.require(name); } catch (e) { /* fall through */ }
  }
  let lastErr = null;
  for (const dir of SIBLINGS) {
    try { return require(path.join(dir, name)); } catch (e) { lastErr = e; }
  }
  throw new Error(`Cannot resolve '${name}' from host or siblings: ${lastErr ? lastErr.message : 'no candidates'}`);
}

module.exports = { hostRequire };
