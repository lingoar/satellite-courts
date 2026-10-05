// Turns the city's hand-edited sheet tabs into clean reservation entries.
// Runs in the browser (window.CourtParser) and in Node (require).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourtParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 864e5;
  const DAY_RE = /^(mon|tues|wednes|thurs|fri|satur|sun)day/;
  const DAY_KEYS = ['mon', 'tues', 'wednes', 'thurs', 'fri', 'satur', 'sun'];

  const toDn = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  const ymdToDn = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return toDn(y, m, d);
  };
  const dnToYmd = (dn) => new Date(dn * DAY_MS).toISOString().slice(0, 10);
  const dowOf = (dn) => (new Date(dn * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // "10/5/2026", "9/29/26", "9/28" (year chosen to land nearest today)
  function parseDate(text, todayDn) {
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text.trim());
    if (!m) return null;
    const mo = +m[1], d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (m[3]) return toDn(+m[3] < 100 ? 2000 + +m[3] : +m[3], mo, d);
    const y = new Date(todayDn * DAY_MS).getUTCFullYear();
    return [y - 1, y, y + 1]
      .map((yy) => toDn(yy, mo, d))
      .sort((a, b) => Math.abs(a - todayDn) - Math.abs(b - todayDn))[0];
  }

  const RANGE_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p|m)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p|m)?(?![a-z0-9:])/g;

  function normalizeTime(s) {
    return s.toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/\bto\b/g, '-')
      .replace(/a\.m\.?/g, 'am').replace(/p\.m\.?/g, 'pm')
      .replace(/(\d)\.(\d)/g, '$1:$2')
      .replace(/noon/g, '12pm').replace(/midnight/g, '12am');
  }

  const mer = (s) => (s === 'am' || s === 'a' ? 'a' : s === 'pm' || s === 'p' ? 'p' : null);
  const at = (h, m, half) => (h > 12 ? h * 60 + m : ((h % 12) + (half === 'p' ? 12 : 0)) * 60 + m);
  const flip = (half) => (half === 'a' ? 'p' : 'a');

  // The sheet often leaves out AM/PM on one or both ends ("6:30-8:30", "11-1:30pm").
  function resolveRange(sh, sm, sHalf, eh, em, eHalf, prevEnd) {
    if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
    if (sh > 12) sHalf = 'p';
    if (eh > 12) eHalf = 'p';
    let start, end, ambiguous = false;
    if (sHalf && eHalf) {
      start = at(sh, sm, sHalf); end = at(eh, em, eHalf);
      if (end === 0) end = 1440;
    } else if (eHalf) {
      end = at(eh, em, eHalf) || 1440;
      start = at(sh, sm, eHalf);
      if (start >= end) start = at(sh, sm, flip(eHalf));
    } else if (sHalf) {
      start = at(sh, sm, sHalf);
      end = at(eh, em, sHalf);
      if (end <= start) end = at(eh, em, flip(sHalf));
      if (end <= start) end += 720;
    } else {
      // Nobody books a court at 3am: 12 and 1–6 read as PM, 7–11 as AM.
      let half = sh === 12 || sh <= 6 ? 'p' : 'a';
      const forced = half === 'a' && prevEnd != null && at(sh, sm, 'a') < prevEnd;
      if (forced) half = 'p';
      start = at(sh, sm, half);
      end = at(eh, em, half);
      if (end <= start) end = half === 'a' ? at(eh, em, 'p') : end + 720;
      // 7, 8 and 9 o'clock starts could be morning or evening.
      ambiguous = half === 'a' && !forced && sh >= 7 && sh <= 9 && end + 720 <= 1380;
    }
    if (!(start >= 0 && end > start && end <= 1440)) return null;
    return { start, end, ambiguous };
  }

  function parseTimes(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const ranges = [];
    let seg = 0;
    lines.forEach((line, lineIdx) => {
      line.split('/').forEach((part) => {
        let prevEnd = null, m;
        RANGE_RE.lastIndex = 0;
        const norm = normalizeTime(part);
        while ((m = RANGE_RE.exec(norm))) {
          const r = resolveRange(+m[1], +(m[2] || 0), mer(m[3]), +m[4], +(m[5] || 0), mer(m[6]), prevEnd);
          if (!r) continue;
          prevEnd = r.end;
          ranges.push({ ...r, line: lineIdx, seg });
        }
        seg++;
      });
    });
    return { ranges, lineCount: lines.length, segCount: seg };
  }

  // "1", "1,2,3", "1-3", "3/1", "3, 2"
  function parseCourts(text) {
    const out = new Set();
    for (const tok of text.split(/[\s,&/;]+|\band\b/i)) {
      const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(tok.trim());
      if (!m) continue;
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 1 || a > 30 || b < 1 || b > 30) continue;
      if (b > a) for (let c = a; c <= b; c++) out.add(c);
      else { out.add(a); out.add(b); }
    }
    return [...out].sort((x, y) => x - y);
  }

  // A cell can stack several times against several court lists, line by line.
  function pairRanges(timeText, courtText) {
    const { ranges, lineCount, segCount } = parseTimes(timeText);
    const courtLines = courtText.split('\n').map((s) => s.trim()).filter(Boolean);
    const slashCourts = courtText.split('/');
    const all = parseCourts(courtText);
    return ranges.map((r, i) => {
      let courts = all;
      if (courtLines.length > 1) {
        if (courtLines.length === lineCount) courts = parseCourts(courtLines[r.line]);
        else if (courtLines.length === ranges.length) courts = parseCourts(courtLines[i]);
      } else if (slashCourts.length > 1 && slashCourts.length === segCount) {
        courts = parseCourts(slashCourts[r.seg]);
      }
      return { start: r.start, end: r.end, ambiguous: r.ambiguous, courts };
    });
  }

  const ORG_WORDS = /eagle\s*fustar|\bEF\b|life\s*time(\s+activities)?|\busta\b|baitl|\butr\b|reservation/gi;

  function parseTeam(raw) {
    const team = raw.replace(/\s+/g, ' ').trim();
    let org = 'other';
    if (/\busta\b|\bjtt\b/i.test(team)) org = 'usta';
    else if (/baitl/i.test(team)) org = 'baitl';
    else if (/\butr\b/i.test(team)) org = 'utr';
    else if (/life\s*time/i.test(team)) org = 'lifetime';
    else if (/eagle\s*fustar|\bEF\b/i.test(team)) org = 'ef';
    else if (/reserv/i.test(team)) org = 'private';
    let who = team.replace(ORG_WORDS, ' ').replace(/[()]/g, ' ')
      .replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ')
      .replace(/^[\s\-–:,]+|[\s\-–:,]+$/g, '');
    if (who && who === who.toLowerCase()) who = who.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { team, org, who };
  }

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function parseVenue(tab, todayDn) {
    const rows = parseCSV(tab.csv || '');
    const v = { id: slug(tab.name), name: tab.name, gid: tab.gid, notices: [], courts: 0, entries: [], undated: [] };
    const addNotice = (text) => {
      const t = text.replace(/\*+\s*attention\s*\*+/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
      if (!t || v.notices.some((n) => n.toLowerCase().includes(t.toLowerCase()))) return;
      v.notices.push(t);
    };

    const col = { day: 0, date: 1, time: 2, court: 3, team: 4 };
    const h = rows.findIndex((r) => r.some((c) => /^\s*day of the week/i.test(c)));
    if (h >= 0) {
      const find = (re) => rows[h].findIndex((c) => re.test(c));
      const found = { day: find(/day of the week/i), date: find(/^\s*date/i), time: find(/^\s*time/i), court: find(/court/i), team: find(/team|event/i) };
      for (const k in found) if (found[k] >= 0) col[k] = found[k];
    }

    // Everything above the header row is a notice, minus the tab's own title.
    for (const r of rows.slice(0, Math.max(h, 0))) {
      for (const cell of r) {
        let t = cell.trim();
        if (t.toLowerCase().startsWith(v.name.toLowerCase())) t = t.slice(v.name.length).replace(/^[\s\-–:]+/, '');
        if (t) addNotice(t);
      }
    }

    // Group rows under the weekday/date row they sit beneath.
    const groups = [];
    let cur = null;
    for (let i = h + 1; i < rows.length; i++) {
      const get = (k) => (rows[i][col[k]] || '').trim();
      const dayTxt = get('day'), dateTxt = get('date');
      const dm = DAY_RE.exec(dayTxt.toLowerCase());
      const dn = parseDate(dateTxt, todayDn);
      if (dm || (dn != null && (!cur || cur.dn !== dn))) {
        cur = { dayIdx: dm ? DAY_KEYS.indexOf(dm[1]) : dowOf(dn), dn, dayTxt, dateTxt, rows: [] };
        groups.push(cur);
      }
      if (!cur) continue;
      const time = get('time'), court = get('court'), team = get('team');
      for (const c of parseCourts(court)) v.courts = Math.max(v.courts, c);
      if (!time) {
        const said = v.notices.some((n) => n.toLowerCase().includes(team.toLowerCase()));
        if (dateTxt && dn == null && team && !said) addNotice(`${dateTxt}: ${team}`);
        continue;
      }
      cur.rows.push({ i, time, court, team });
    }

    // Weeks run Monday to Sunday down the tab. When a date disagrees with its own
    // weekday label (a stale cell from an earlier week), place it by the rest of its week.
    const weeks = [];
    let prevDay = -1;
    for (const g of groups) {
      if (!weeks.length || g.dayIdx < prevDay) weeks.push([]);
      weeks[weeks.length - 1].push(g);
      prevDay = g.dayIdx;
    }
    for (const week of weeks) {
      const votes = new Map();
      for (const g of week) {
        if (g.dn == null) continue;
        let monday = g.dn - g.dayIdx;
        const off = dowOf(monday);
        g.consistent = off === 0;
        monday += off <= 3 ? -off : 7 - off;
        const vote = votes.get(monday) || { n: 0, anchor: false };
        vote.n++;
        vote.anchor = vote.anchor || g.consistent;
        votes.set(monday, vote);
      }
      const cands = [...votes].sort((a, b) => b[0] - a[0]);
      const pick = cands.find(([, vote]) => vote.anchor || vote.n >= 2) || cands[0];
      for (const g of week) {
        if (g.consistent) g.date = g.dn;
        else if (pick) { g.date = pick[0] + g.dayIdx; g.inferred = true; }
        else g.date = null;
      }
    }

    for (const g of groups) {
      for (const r of g.rows) {
        if (/no activity|closed|cancel/i.test(r.time)) continue;
        const raw = { day: g.dayTxt, date: g.dateTxt, time: r.time, court: r.court, team: r.team };
        if (g.date == null) { v.undated.push(raw); continue; }
        const base = {
          ...parseTeam(r.team),
          date: dnToYmd(g.date),
          inferredDate: !!g.inferred,
          raw,
        };
        const parts = pairRanges(r.time, r.court);
        if (!parts.length) {
          v.entries.push({ ...base, id: `${v.id}-${r.i}`, start: null, end: null, ambiguous: false, courts: parseCourts(r.court) });
        }
        parts.forEach((p, k) => v.entries.push({ ...base, id: `${v.id}-${r.i}-${k}`, ...p }));
      }
    }
    return v;
  }

  function parseAll(tabs, todayYmd) {
    const todayDn = ymdToDn(todayYmd);
    return { venues: tabs.map((t) => parseVenue(t, todayDn)) };
  }

  return { parseAll, parseVenue, parseCSV, parseTimes, parseCourts, parseTeam, pairRanges, ymdToDn, dnToYmd, dowOf };
});
