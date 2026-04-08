#!/usr/bin/env node
// readme.js — nottingham gen-0
// nottinghamListNotes billet interface

const args = process.argv.slice(2);

if (args.includes('--json')) {
  console.log(JSON.stringify({
    repo: 'nottingham',
    domain: 'List/notes system — listhead, listTail, listnote DBFs',
    holder: 'nottingham',
    billet: 'nottinghamListNotes',
    island: 'core-nottingham',
    tools: [],
    docs: [],
    status: 'development'
  }, null, 2));
  process.exit(0);
}

console.log(`
# Nottingham — List/Notes System

Three DBF tables store structured notes across ProduceFlow:

  listhead  — list definitions (LISTNO, LISTNAME, NEXTIDX)
  listTail  — entries linking lists to lots/invoices (LISTNO + LISTNOIDX → INVCE_NO)
  listnote  — note content (NOTE1-NOTE10, 250 chars each = 2500 chars/entry)

## Locations

  Central:   c:/clients/willdev/dbf/LISTHEAD.DBF, LISTTAIL.DBF, LISTNOTE.DBF
  Per-lot:   c:/clients/willdev/loads/{last digit}/{lot}/listhead.dbf, listTail.dbf, listnote.dbf

## Inspect a lot's notes

  node c:/clients/desoto/tools/dbf-query.js c:/clients/willdev/loads/0/29710/listhead.dbf "true"
  node c:/clients/desoto/tools/dbf-query.js c:/clients/willdev/loads/0/29710/listTail.dbf "true"
  node c:/clients/desoto/tools/dbf-query.js c:/clients/willdev/loads/0/29710/listnote.dbf "true"

## Known lists

  1003  Tag Problems  (TAGPROB)
  1005  2020

## Library

  cat c:/clients/nottingham/library/INDEX.md

## Key contacts

  resort    — repack workflow (consumer of notes)
  palmbeach — PRG code that reads/writes DBFs
  detroit   — API routes
  desoto    — DBF query/schema tools
`.trim());
