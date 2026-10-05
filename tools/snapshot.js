#!/usr/bin/env node
// Saves a copy of every sheet tab to snapshot.js, so the page still has
// something to show when Google can't be reached. Run: node tools/snapshot.js
const fs = require('fs');
const path = require('path');
const cfg = require('../config.js');

(async () => {
  const tabs = {};
  for (const t of cfg.tabs) {
    const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/export?format=csv&gid=${t.gid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${t.name}: HTTP ${res.status}`);
    const text = await res.text();
    if (text.trimStart().startsWith('<')) throw new Error(`${t.name}: got a web page instead of CSV (is the sheet still public?)`);
    tabs[t.gid] = text;
    console.log(`${t.name}: ${text.length} bytes`);
  }
  const out = path.join(__dirname, '..', 'snapshot.js');
  fs.writeFileSync(out, `window.COURTS_SNAPSHOT = ${JSON.stringify({ fetchedAt: Date.now(), tabs })};\n`);
  console.log(`Wrote ${out}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
