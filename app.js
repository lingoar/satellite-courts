(() => {
  'use strict';

  const CFG = COURTS_CONFIG;
  const P = CourtParser;
  const SHEET = `https://docs.google.com/spreadsheets/d/${CFG.sheetId}`;
  const ORGS = {
    ef: { label: 'Eagle Fustar' },
    lifetime: { label: 'Lifetime Activities', short: 'Lifetime' },
    usta: { label: 'USTA' },
    baitl: { label: 'BAITL' },
    utr: { label: 'UTR' },
    private: { label: 'Private reservation', short: 'Private' },
    other: { label: 'Other' },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const root = document.documentElement;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------- time ----------
  function venueNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CFG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { ymd: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
  }
  const addDays = (ymd, n) => P.dnToYmd(P.ymdToDn(ymd) + n);
  const fmtDay = (ymd, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${ymd}T00:00:00Z`));
  const hm = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}`; };
  const half = (min) => (Math.floor(min / 60) % 24 < 12 ? 'AM' : 'PM');
  const fmt = (min) => `${hm(min)} ${half(min)}`;
  const fmtRange = (a, b) => (half(a) === half(b) ? `${hm(a)}–${hm(b)} ${half(b)}` : `${fmt(a)}–${fmt(b)}`);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function courtsLabel(courts) {
    if (!courts.length) return 'Court not listed';
    const runs = [];
    for (const c of courts) {
      const last = runs[runs.length - 1];
      if (last && last[1] === c - 1) last[1] = c; else runs.push([c, c]);
    }
    return `Court${courts.length > 1 ? 's' : ''} ${runs.map(([a, b]) => (a === b ? a : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`)).join(', ')}`;
  }
  const whoLabel = (e) => e.who || ORGS[e.org].short || ORGS[e.org].label;
  const fullLabel = (e) => (e.who && e.org !== 'other' ? `${ORGS[e.org].label} · ${e.who}` : e.who || ORGS[e.org].label);
  const timeLabel = (e) => (e.start == null ? `Time unclear (“${e.raw.time}”)` : fmtRange(e.start, e.end));

  // ---------- state ----------
  const now0 = venueNow();
  const S = {
    raw: null, live: false, busy: false,
    venues: [], byDate: new Map(), byId: new Map(),
    today: now0.ymd, nowMin: now0.min,
    date: /^#\d{4}-\d{2}-\d{2}$/.test(location.hash) ? location.hash.slice(1) : now0.ymd,
    cursor: now0.min, follow: true,
    view: store.get('sc:view', 'board'), sort: store.get('sc:sort', 'sheet'),
    q: '', lit: store.get('sc:lit', false), off: new Set(), favs: new Set(store.get('sc:favs', [])),
    axis: { start: 420, end: 1320 }, rail: [],
  };

  function build() {
    const data = P.parseAll(CFG.tabs.map((t) => ({ ...t, csv: S.raw.tabs[t.gid] || '' })), S.today);
    S.venues = data.venues;
    S.byDate = new Map();
    S.byId = new Map();
    for (const v of S.venues) {
      v.n = Math.max(1, v.courts);
      v.lights = !!CFG.tabs.find((t) => t.gid === v.gid).lights;
      for (const e of v.entries) {
        e.venue = v;
        if (!e.courts.length && v.n === 1) e.courts = [1];
        e.guess = e.inferredDate || e.ambiguous;
        e.hay = `${e.team} ${ORGS[e.org].label} ${e.who} ${v.name}`.toLowerCase();
        S.byId.set(e.id, e);
        if (!S.byDate.has(e.date)) S.byDate.set(e.date, []);
        S.byDate.get(e.date).push(e);
      }
    }
    let last = addDays(S.today, 13);
    for (const d of S.byDate.keys()) if (d > last) last = d;
    const cap = addDays(S.today, 27);
    let from = addDays(S.today, -7), to = last > cap ? cap : last;
    if (S.date < from) from = S.date;
    if (S.date > to) to = S.date;
    S.rail = [];
    for (let d = from; d <= to; d = addDays(d, 1)) S.rail.push(d);
  }

  const dayEntries = (date, v) => (S.byDate.get(date) || []).filter((e) => !v || e.venue === v);
  const matches = (e) => !S.off.has(e.org) && (!S.q || e.hay.includes(S.q));
  const shown = () => (S.lit ? S.venues.filter((v) => v.lights) : S.venues);

  function statusAt(v, date, t) {
    const busy = new Set();
    let unnamed = 0, until = Infinity, next = Infinity, any = false;
    for (const e of dayEntries(date, v)) {
      if (e.start == null) continue;
      any = true;
      if (e.start <= t && t < e.end) {
        if (e.courts.length) e.courts.forEach((c) => busy.add(c)); else unnamed++;
        until = Math.min(until, e.end);
      } else if (e.start > t) next = Math.min(next, e.start);
    }
    const taken = Math.min(v.n, busy.size + unnamed);
    return { open: v.n - taken, n: v.n, until, next, any };
  }

  function statusHTML(st) {
    let cls, text, sub;
    if (st.open === st.n) {
      cls = 'open';
      text = st.n === 1 ? 'Open' : `All ${st.n} open`;
      sub = st.next < Infinity ? `until ${fmt(st.next)}` : st.any ? 'for the rest of the day' : 'all day';
    } else if (st.open > 0) {
      cls = 'some';
      text = `${st.open} of ${st.n} open`;
      sub = `until ${fmt(Math.min(st.until, st.next))}`;
    } else {
      cls = 'full';
      text = st.n === 1 ? 'Reserved' : `All ${st.n} reserved`;
      sub = `until ${fmt(st.until)}`;
    }
    return `<span class="pill ${cls}">${text}</span><span>${sub}</span>`;
  }

  // ---------- render ----------
  function computeAxis() {
    let a = 420, b = 1320;
    for (const e of dayEntries(S.date)) {
      if (e.start == null) continue;
      a = Math.min(a, Math.floor(e.start / 60) * 60);
      b = Math.max(b, Math.ceil(e.end / 60) * 60);
    }
    S.axis = { start: a, end: b };
  }

  function renderRail() {
    const rail = $('#rail');
    const keep = rail.scrollLeft;
    const load = (d) => dayEntries(d).reduce((sum, e) => sum + (e.start == null ? 0 : (e.end - e.start) * Math.max(1, e.courts.length)), 0);
    const loads = S.rail.map(load);
    const max = Math.max(1, ...loads);
    let html = '', month = '';
    S.rail.forEach((d, i) => {
      const m = fmtDay(d, { month: 'short' });
      if (m !== month) { html += `<span class="month">${m}</span>`; month = m; }
      const cls = `${d === S.today ? ' is-today' : ''}${d < S.today ? ' is-past' : ''}`;
      html += `<button type="button" class="chip${cls}" data-date="${d}" aria-pressed="${d === S.date}" aria-label="${esc(fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' }))}${d === S.today ? ', today' : ''}">
        <span class="dow">${fmtDay(d, { weekday: 'short' })}</span><span class="num">${+d.slice(8)}</span>
        <span class="load" style="--load:${(loads[i] / max).toFixed(3)}"><b></b></span></button>`;
    });
    rail.innerHTML = html;
    rail.scrollLeft = keep;
    const chip = $('.chip[aria-pressed="true"]', rail);
    if (!chip) return;
    const r = rail.getBoundingClientRect(), c = chip.getBoundingClientRect();
    if (c.left < r.left + 8 || c.right > r.right - 8 || !renderRail.done) {
      rail.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
      renderRail.done = true;
    }
  }

  function renderAxis() {
    const { start, end } = S.axis;
    root.style.setProperty('--hours', (end - start) / 60);
    const input = $('#cursor');
    input.min = start; input.max = end;
    let html = '';
    for (let t = start; t <= end; t += 60) {
      const h = t / 60;
      html += `<span class="tick${h % 3 ? ' minor' : ''}" style="--p:${((t - start) / (end - start)).toFixed(4)}">${h % 12 || 12}${h % 24 < 12 ? 'a' : 'p'}</span>`;
    }
    $('#ticks').innerHTML = html;
  }

  function renderLegend() {
    const counts = {};
    for (const e of dayEntries(S.date)) counts[e.org] = (counts[e.org] || 0) + 1;
    const seen = new Set();
    for (const es of S.byDate.values()) for (const e of es) seen.add(e.org);
    $('#legend').innerHTML = Object.keys(ORGS).filter((k) => seen.has(k)).map((k) =>
      `<button type="button" class="lg org-${k}" data-org="${k}" aria-pressed="${!S.off.has(k)}"><i class="dot"></i>${esc(ORGS[k].label)}<small>${counts[k] || 0}</small></button>`).join('');
  }

  function blockHTML(e, i, ax) {
    const span = ax.end - ax.start;
    const tip = `${fmtRange(e.start, e.end)} · ${fullLabel(e)}`;
    return `<button type="button" class="blk org-${e.org}${e.guess ? ' is-guess' : ''}${matches(e) ? '' : ' is-dim'}" data-e="${e.id}"
      style="--s:${((e.start - ax.start) / span).toFixed(4)};--w:${((e.end - e.start) / span).toFixed(4)};--i:${i}"
      title="${esc(tip)}" aria-label="${esc(`${courtsLabel(e.courts)}, ${tip}`)}"><span>${e.guess ? '≈ ' : ''}${esc(whoLabel(e))}</span></button>`;
  }

  function lanesHTML(v, entries, ax, seq) {
    const timed = entries.filter((e) => e.start != null);
    const lanes = [];
    for (let c = 1; c <= v.n; c++) lanes.push({ label: c, es: timed.filter((e) => e.courts.includes(c)) });
    const loose = timed.filter((e) => !e.courts.length);
    if (loose.length) lanes.push({ label: '?', es: loose });
    return `<div class="v-lanes">${lanes.map((l) =>
      `<div class="lane"><span class="lane-n" title="${l.label === '?' ? 'Court not listed in the sheet' : `Court ${l.label}`}">${l.label}</span><div class="track">${l.es.map((e) => blockHTML(e, seq.i++, ax)).join('')}</div></div>`).join('')}</div>`;
  }

  const mapUrl = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name} tennis courts, ${CFG.city}`)}`;
  const tabUrl = (v) => `${SHEET}/edit#gid=${v.gid}`;
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.2-4 5.7-.7z"/></svg>';

  const BULB = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.1v.7h4v-.7c0-.4.2-.8.6-1.1A4.5 4.5 0 0 0 8 1.5zM6.2 13h3.6v1.2a.8.8 0 0 1-.8.8H7a.8.8 0 0 1-.8-.8z"/></svg>';

  function sortedVenues() {
    const idx = new Map(S.venues.map((v, i) => [v, i]));
    const openness = (v) => { const st = statusAt(v, S.date, S.cursor); return st.open / st.n * 100 + st.open; };
    return [...shown()].sort((a, b) =>
      (S.favs.has(b.id) - S.favs.has(a.id)) ||
      (S.sort === 'open' ? openness(b) - openness(a) : 0) ||
      idx.get(a) - idx.get(b));
  }

  function renderBoard() {
    const seq = { i: 0 };
    return sortedVenues().map((v) => {
      const es = dayEntries(S.date, v).sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
      const odd = es.filter((e) => e.start == null);
      const fav = S.favs.has(v.id);
      return `<article class="venue" data-v="${v.id}">
        <div class="v-info">
          <div class="v-head">
            <button type="button" class="star" data-star="${v.id}" aria-pressed="${fav}" aria-label="${fav ? 'Unpin' : 'Pin'} ${esc(v.name)} ${fav ? 'from' : 'to'} the top">${STAR}</button>
            <h3><button type="button" class="v-name" data-venue="${v.id}">${esc(v.name)}</button></h3>
          </div>
          <div class="v-status" data-status="${v.id}"></div>
          <div class="v-links"><span class="lights${v.lights ? '' : ' none'}">${v.lights ? BULB + 'Lights' : 'No lights'}</span><a href="${mapUrl(v)}" target="_blank" rel="noopener">Map</a><a href="${tabUrl(v)}" target="_blank" rel="noopener">Sheet tab</a></div>
          ${v.notices.length ? `<details class="v-note"><summary>Notice from the city</summary>${v.notices.map((n) => `<p>${esc(n)}</p>`).join('')}</details>` : ''}
        </div>
        ${lanesHTML(v, es, S.axis, seq)}
        ${odd.length ? `<p class="v-odd">${odd.map((e) => `<button type="button" data-e="${e.id}">${esc(`${courtsLabel(e.courts)} · ${fullLabel(e)} · time unclear (“${e.raw.time}”)`)}</button>`).join('<br>')}</p>` : ''}
        ${es.length ? `<ul class="v-list">${es.map((e) => `<li><button type="button" data-e="${e.id}" class="${matches(e) ? '' : 'is-dim'}"><span class="t">${e.guess ? '≈ ' : ''}${esc(e.start == null ? 'Time unclear' : fmtRange(e.start, e.end))}</span><span class="w"><i class="dot org-${e.org}"></i> <b>${esc(whoLabel(e))}</b> · ${esc(courtsLabel(e.courts))}</span></button></li>`).join('')}</ul>` : ''}
      </article>`;
    }).join('');
  }

  function renderAgenda() {
    const dates = S.q ? [...S.byDate.keys()].filter((d) => d >= S.today || d === S.date).sort() : [S.date];
    const order = new Map(S.venues.map((v, i) => [v, i]));
    const html = dates.map((d) => {
      const es = dayEntries(d).filter((e) => matches(e) && (!S.lit || e.venue.lights)).sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9) || order.get(a.venue) - order.get(b.venue));
      if (!es.length) return '';
      return `<section class="ag-day"><h3>${esc(fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3><ol class="ag">${es.map((e) =>
        `<li><button type="button" class="ag-row" data-e="${e.id}">
          <span class="ag-time">${e.guess ? '≈ ' : ''}${esc(e.start == null ? 'Time unclear' : fmtRange(e.start, e.end))}</span>
          <span class="ag-where"><b>${esc(e.venue.name)}</b> <span>· ${esc(courtsLabel(e.courts))}</span></span>
          <span class="ag-who"><i class="dot org-${e.org}"></i>${esc(fullLabel(e))}</span>
        </button></li>`).join('')}</ol></section>`;
    }).join('');
    if (html) return html;
    return `<p class="empty">${S.q ? `Nothing in the sheet matches “${esc(S.q)}” from today on.` : 'No reservations are listed for this day. Every court is open.'}</p>`;
  }

  function renderNotes() {
    const items = [];
    for (const v of S.venues) {
      for (const e of v.entries) {
        if (e.date < S.today) continue;
        const where = `${v.name}, ${fmtDay(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}`;
        if (e.start == null) items.push(`${where}: couldn't read the time “${e.raw.time}”.`);
        else if (e.ambiguous) items.push(`${where}: “${e.raw.time}” has no AM or PM. Shown as ${fmtRange(e.start, e.end)}.`);
      }
      const moved = new Set(v.entries.filter((e) => e.inferredDate && e.date >= S.today).map((e) => `${e.raw.day.trim()} “${e.raw.date}” → ${fmtDay(e.date, { month: 'short', day: 'numeric' })}`));
      for (const m of moved) items.push(`${v.name}: the sheet's date doesn't match its weekday. Placed by the rest of that week: ${m}.`);
      for (const r of v.undated) items.push(`${v.name}: “${r.time}” (${r.team || 'no name'}) has no date and is not shown.`);
    }
    const box = $('#notes');
    box.hidden = !items.length;
    $('summary', box).textContent = `${items.length} sheet ${items.length === 1 ? 'cell' : 'cells'} needed a best reading`;
    $('ul', box).innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('');
  }

  function updateCursor() {
    const { start, end } = S.axis;
    const isToday = S.date === S.today;
    if (isToday && S.follow) S.cursor = S.nowMin;
    S.cursor = clamp(S.cursor, start, end);
    const input = $('#cursor');
    input.value = S.cursor;
    if (!(isToday && S.follow)) S.cursor = +input.value; // keep the real minute while following the clock
    input.setAttribute('aria-valuetext', fmt(S.cursor));
    root.style.setProperty('--cur', ((S.cursor - start) / (end - start)).toFixed(4));
    root.style.setProperty('--now', clamp((S.nowMin - start) / (end - start), 0, 1).toFixed(4));
    document.body.classList.toggle('is-today', isToday);
    document.body.classList.toggle('is-past', S.date < S.today);
    const following = isToday && S.follow;
    $('#readLabel').textContent = following ? 'Now' : 'At';
    $('#readTime').textContent = fmt(S.cursor);
    $('#nowBtn').setAttribute('aria-pressed', following);

    let open = 0, total = 0;
    for (const v of shown()) {
      const st = statusAt(v, S.date, S.cursor);
      open += st.open; total += st.n;
      const el = $(`[data-status="${v.id}"]`);
      if (el) el.innerHTML = statusHTML(st);
    }
    $('#heroStat').innerHTML = S.venues.length
      ? `<b>${open} of ${total}</b> ${S.lit ? 'lit' : 'listed'} courts have no reservation at <b>${fmt(S.cursor)}</b>. Drag the ball to check another time.`
      : 'No schedule loaded yet.';
  }

  function render(animate) {
    computeAxis();
    renderAxis();
    renderRail();
    renderLegend();
    const rel = S.date === S.today ? 'Today, ' : S.date === addDays(S.today, 1) ? 'Tomorrow, ' : '';
    $('#heroDate').textContent = rel + fmtDay(S.date, rel ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' });
    const main = $('#main');
    main.classList.toggle('no-anim', !animate);
    if (S.view === 'board') { updateCursor(); main.innerHTML = renderBoard(); }
    else main.innerHTML = renderAgenda();
    $('#scrub').hidden = S.view !== 'board';
    $('.sort').hidden = S.view !== 'board';
    $('#lit').setAttribute('aria-pressed', S.lit);
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === S.view));
    updateCursor();
    renderNotes();
  }

  function setDate(d) {
    if (!d || d === S.date) return;
    S.date = d;
    if (d < S.rail[0] || d > S.rail[S.rail.length - 1]) build();
    history.replaceState(null, '', d === S.today ? location.pathname + location.search : `#${d}`);
    render(true);
  }

  // ---------- dialogs ----------
  const dlg = $('#dlg');
  const openDlg = (html) => {
    dlg.innerHTML = `<button type="button" class="dlg-x" data-close aria-label="Close">×</button><div class="dlg-body">${html}</div>`;
    if (!dlg.open) dlg.showModal();
  };

  function openEntry(e) {
    const v = e.venue;
    const notes = [];
    if (e.inferredDate) notes.push(`The sheet lists this under ${esc(e.raw.day.trim())} with the date “${esc(e.raw.date || 'blank')}”, which don't agree. It is shown on ${esc(fmtDay(e.date, { weekday: 'long', month: 'long', day: 'numeric' }))} to match the rest of that week.`);
    if (e.ambiguous) notes.push('The sheet gives no AM or PM for this time. It is shown as a morning booking and could be an evening one.');
    if (e.start == null) notes.push('The time in the sheet could not be read, so this booking is not drawn on the court.');
    const row = (k, val) => `<dt>${k}</dt><dd>${esc(val) || '—'}</dd>`;
    openDlg(`
      <p class="eyebrow"><i class="dot org-${e.org}"></i>${esc(ORGS[e.org].label)}</p>
      <h2 id="dlgTitle">${esc(e.who || e.team || ORGS[e.org].label)}</h2>
      <dl class="facts">
        <dt>Where</dt><dd>${esc(v.name)} · ${esc(courtsLabel(e.courts))}</dd>
        <dt>When</dt><dd>${esc(fmtDay(e.date, { weekday: 'long', month: 'long', day: 'numeric' }))}<br>${esc(timeLabel(e))}</dd>
      </dl>
      ${notes.map((n) => `<p class="flag">≈ ${n}</p>`).join('')}
      <div class="rawbox"><h3>As written in the sheet</h3>
        <dl class="facts">${row('Day', e.raw.day)}${row('Date', e.raw.date)}${row('Time', e.raw.time)}${row('Court', e.raw.court)}${row('Team', e.raw.team)}</dl>
      </div>
      <div class="dlg-links"><a class="ghost" href="${tabUrl(v)}" target="_blank" rel="noopener">Open this tab in the sheet</a><a class="ghost" href="${mapUrl(v)}" target="_blank" rel="noopener">Map</a></div>`);
  }

  function openVenue(v) {
    const dates = S.rail.filter((d) => d >= S.today || d === S.date);
    let a = 420, b = 1320;
    for (const e of v.entries) if (e.start != null && dates.includes(e.date)) { a = Math.min(a, Math.floor(e.start / 60) * 60); b = Math.max(b, Math.ceil(e.end / 60) * 60); }
    const ax = { start: a, end: b };
    const seq = { i: 0 };
    const count = dates.reduce((n, d) => n + dayEntries(d, v).length, 0);
    openDlg(`
      <p class="eyebrow">${v.n} ${v.n === 1 ? 'court' : 'courts'} listed · ${v.lights ? 'lights' : 'no lights'} · ${count} ${count === 1 ? 'reservation' : 'reservations'} ahead</p>
      <h2 id="dlgTitle">${esc(v.name)}</h2>
      ${v.notices.map((n) => `<p class="flag" style="white-space:pre-line">${esc(n)}</p>`).join('')}
      <div class="wk" style="--hours:${(b - a) / 60}">
        <div class="wk-axis"><span>${fmt(a)}</span><span>${fmt((a + b) / 2)}</span><span>${fmt(b)}</span></div>
        ${dates.map((d) => `<div class="wk-row${d === S.date ? ' is-sel' : ''}"><button type="button" data-date="${d}" data-close>${esc(fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' }))}</button>${lanesHTML(v, dayEntries(d, v), ax, seq)}</div>`).join('')}
      </div>
      <div class="dlg-links"><a class="ghost" href="${tabUrl(v)}" target="_blank" rel="noopener">Open this tab in the sheet</a><a class="ghost" href="${mapUrl(v)}" target="_blank" rel="noopener">Map</a></div>`);
  }

  // ---------- data ----------
  function setSync() {
    const btn = $('#sync');
    const t = S.raw ? new Date(S.raw.fetchedAt) : null;
    const sameDay = t && t.toDateString() === new Date().toDateString();
    const when = t ? t.toLocaleString([], sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    btn.dataset.state = S.busy ? 'busy' : S.live ? 'live' : 'saved';
    $('#syncText').textContent = S.busy ? 'Checking the sheet' : S.live ? `Live · ${when}` : `Saved copy · ${when}`;
    btn.title = S.live ? 'Read from the city sheet. Click to check again.' : 'Could not reach the city sheet. Showing the last saved copy. Click to try again.';
  }

  async function fetchTab(gid, retry = true) {
    try { return await fetchTabOnce(gid); } catch (err) {
      if (!retry) throw err;
      await new Promise((r) => setTimeout(r, 1200));
      return fetchTab(gid, false);
    }
  }

  async function fetchTabOnce(gid) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('<')) throw new Error('not CSV');
      return text;
    } finally { clearTimeout(timer); }
  }

  async function refresh() {
    if (S.busy) return;
    S.busy = true; setSync();
    const results = await Promise.allSettled(CFG.tabs.map((t) => fetchTab(t.gid)));
    const tabs = { ...(S.raw ? S.raw.tabs : {}) };
    let ok = 0;
    results.forEach((r, i) => { if (r.status === 'fulfilled') { tabs[CFG.tabs[i].gid] = r.value; ok++; } });
    S.busy = false;
    if (ok) {
      const changed = !S.raw || JSON.stringify(tabs) !== JSON.stringify(S.raw.tabs);
      S.raw = { fetchedAt: Date.now(), tabs };
      S.live = true;
      store.set('sc:data', S.raw);
      if (changed) { build(); render(false); }
    } else S.live = false;
    setSync();
  }

  function tick() {
    const n = venueNow();
    const rolled = n.ymd !== S.today;
    if (rolled && S.date === S.today) S.date = n.ymd;
    S.today = n.ymd; S.nowMin = n.min;
    if (rolled) { build(); render(false); } else if (S.view === 'board') updateCursor();
  }

  // ---------- events ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-e],[data-date],[data-venue],[data-star],[data-org],[data-view],[data-close]');
    if (ev.target === dlg) return dlg.close();
    if (!el) return;
    const d = el.dataset;
    if ('close' in d) dlg.close();
    if (d.e) openEntry(S.byId.get(d.e));
    else if (d.date) setDate(d.date);
    else if (d.venue) openVenue(S.venues.find((v) => v.id === d.venue));
    else if (d.star) {
      S.favs.has(d.star) ? S.favs.delete(d.star) : S.favs.add(d.star);
      store.set('sc:favs', [...S.favs]);
      render(false);
    } else if (d.org) {
      S.off.has(d.org) ? S.off.delete(d.org) : S.off.add(d.org);
      render(false);
    } else if (d.view) {
      S.view = d.view; store.set('sc:view', S.view);
      render(true);
    }
  });

  $('#cursor').addEventListener('input', (ev) => { S.follow = false; S.cursor = +ev.target.value; updateCursor(); });
  $('#nowBtn').addEventListener('click', () => {
    S.follow = true;
    if (S.date !== S.today) setDate(S.today); else updateCursor();
  });
  $('#prevDay').addEventListener('click', () => setDate(addDays(S.date, -1)));
  $('#nextDay').addEventListener('click', () => setDate(addDays(S.date, 1)));
  $('#q').addEventListener('input', (ev) => { S.q = ev.target.value.trim().toLowerCase(); render(false); });
  $('#sort').value = S.sort;
  $('#sort').addEventListener('change', (ev) => { S.sort = ev.target.value; store.set('sc:sort', S.sort); render(false); });
  $('#lit').addEventListener('click', () => { S.lit = !S.lit; store.set('sc:lit', S.lit); render(false); });
  $('#sync').addEventListener('click', refresh);
  $('#theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('sc:theme', root.dataset.theme);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || dlg.open || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowLeft') setDate(addDays(S.date, -1));
    else if (ev.key === 'ArrowRight') setDate(addDays(S.date, 1));
    else if (ev.key === 't') { S.follow = true; setDate(S.today); updateCursor(); }
    else if (ev.key === '/') { ev.preventDefault(); $('#q').focus(); }
  });
  window.addEventListener('hashchange', () => { if (/^#\d{4}-\d{2}-\d{2}$/.test(location.hash)) setDate(location.hash.slice(1)); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tick(); if (!S.raw || Date.now() - S.raw.fetchedAt > CFG.refreshMinutes * 6e4) refresh(); }
  });

  // ---------- start ----------
  $('#sheetLink').href = $('#sheetLink2').href = `${SHEET}/edit`;
  const cached = store.get('sc:data', null);
  const snap = window.COURTS_SNAPSHOT || null;
  S.raw = cached && snap ? (cached.fetchedAt > snap.fetchedAt ? cached : snap) : cached || snap;
  if (S.raw) { build(); render(true); }
  setSync();
  refresh();
  setInterval(tick, 30000);
  setInterval(() => { if (!document.hidden) refresh(); }, CFG.refreshMinutes * 6e4);
})();
