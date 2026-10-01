# Nottingham Tools

| Tool | Purpose |
|------|---------|
| `node readme.js [--facets\|--facet-*]` | Domain overview + facets |
| `node service/server.js` | Standalone notes service on :3520 (dev; NOTES_DEV=1) |
| `node service/test.js` | End-to-end test, 29 checks, throwaway data dir |
| `node tools/import-dbf.js --dataset X --dir <dbfdir> [--dry-run] [--out f.json]` | Legacy DBF -> notes service (NOTES_TOKEN env) |

Production: `monkey/reggi-notes.js` mounted at /notes inside Reggi (Monkey:3005).
