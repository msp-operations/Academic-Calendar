// MSP Academic Operations Calendar — build script
// Reads data\year-*.yaml + data\events.yaml, writes site\events.json + feeds\*.ics
// No dependencies. Run: node build.mjs
//
// Data format (constrained YAML subset, parsed here — keep files flat):
//   - list items start with "- ", fields are "key: value", one per line, no nesting.
//   - events `when` grammar:  "2026-10-05"                       absolute date
//                             "P1.end +10wd"                     anchor + offset
//                             "{P}.exam.end +15wd" + repeat      one instance per listed period
//     anchors: Pn.start Pn.end Pn.exam.start Pn.exam.end year.start year.end
//     offsets: +Nd / -Nd calendar days, +Nw / -Nw weeks, +Nwd / -Nwd working days (skips Sat/Sun)

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const SITE = ROOT; // site lives at repo root (GitHub Pages serves index.html from /)
const FEEDS = join(ROOT, 'feeds');

// ---------- tiny YAML-subset parser ----------
function parseFlatYaml(text) {
  const scalars = {};
  const items = [];
  let current = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      current = {};
      items.push(current);
      raw = listMatch[1];
      const kv = raw.match(/^([\w-]+):\s*(.*)$/);
      if (kv) current[kv[1]] = unquote(kv[2]);
      continue;
    }
    const kv = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (!kv) throw new Error(`Cannot parse line: "${raw}"`);
    const [, indent, key, value] = kv;
    if (indent.length > 0 && current) current[key] = unquote(value);
    else { scalars[key] = unquote(value); current = null; }
  }
  return { scalars, items };
}
const unquote = (s) => {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1) : t;
};

// ---------- date helpers (all dates are UTC-noon Date objects; output YYYY-MM-DD) ----------
const parseDate = (s) => {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
};
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
function addWorkingDays(d, n) {
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n), cur = d;
  while (left > 0) {
    cur = addDays(cur, step);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return cur;
}

// ---------- load year config ----------
const yearFile = readdirSync(DATA).filter(f => /^year-.*\.ya?ml$/.test(f)).sort().pop();
if (!yearFile) throw new Error('No data/year-*.yaml found');
const yearData = parseFlatYaml(readFileSync(join(DATA, yearFile), 'utf8'));
const YEAR = yearData.scalars.year || yearFile.replace(/^year-|\.ya?ml$/g, '');
const periods = {};
for (const p of yearData.items) {
  if (!p.id) continue;
  periods[p.id] = {
    id: p.id,
    start: parseDate(p.start), end: parseDate(p.end),
    examStart: p.exam_start ? parseDate(p.exam_start) : null,
    examEnd: p.exam_end ? parseDate(p.exam_end) : null,
    status: p.status || 'confirmed',
  };
}

// ---------- resolve `when` expressions ----------
function resolveAnchor(token, periodId) {
  const t = token.replace('{P}', periodId || '');
  if (t === 'year.start') return periods.P1?.start ?? null;
  if (t === 'year.end') return periods.P6?.end ?? periods.P5?.end ?? null;
  const m = t.match(/^(P\d)\.(start|end|exam\.start|exam\.end)$/);
  if (!m) return null;
  const p = periods[m[1]];
  if (!p) return null;
  return { 'start': p.start, 'end': p.end, 'exam.start': p.examStart, 'exam.end': p.examEnd }[m[2]] ?? null;
}
function resolveWhen(when, periodId) {
  const abs = parseDate(when);
  if (abs) return abs;
  const m = when.trim().match(/^(\S+)(?:\s+([+-]\d+)(wd|w|d))?$/);
  if (!m) return null;
  let d = resolveAnchor(m[1], periodId);
  if (!d) return null;
  if (m[2]) {
    const n = parseInt(m[2], 10);
    if (m[3] === 'wd') d = addWorkingDays(d, n);
    else if (m[3] === 'w') d = addDays(d, n * 7);
    else d = addDays(d, n);
  }
  return d;
}

// ---------- load events, expand instances ----------
const eventsData = parseFlatYaml(readFileSync(join(DATA, 'events.yaml'), 'utf8'));
const instances = [];
const problems = [];
for (const ev of eventsData.items) {
  if (!ev.id || !ev.when) { problems.push(`Event missing id/when: ${JSON.stringify(ev)}`); continue; }
  const reps = ev.repeat ? ev.repeat.split(',').map(s => s.trim()) : [null];
  for (const p of reps) {
    const date = resolveWhen(ev.when, p);
    if (!date) { problems.push(`Cannot resolve "${ev.when}" (period ${p ?? '-'}) for ${ev.id}`); continue; }
    const periodStatus = p && periods[p] ? periods[p].status : 'confirmed';
    instances.push({
      id: p ? `${ev.id}-${p.toLowerCase()}` : ev.id,
      title: p ? `${ev.title} (${p})` : ev.title,
      office: ev.office || 'general',
      staff: (ev.staff === 'academic' || ev.staff === 'support') ? ev.staff : 'both',
      date: fmtDate(date),
      audience: ev.audience || '',
      notes: ev.notes || '',
      link: ev.link || '',
      status: (ev.status === 'unconfirmed' || periodStatus === 'unconfirmed') ? 'unconfirmed' : 'confirmed',
    });
  }
}
instances.sort((a, b) => a.date.localeCompare(b.date) || a.office.localeCompare(b.office));

// ---------- write site/events.json + site/events.js (file:// fallback, no server needed) ----------
mkdirSync(SITE, { recursive: true });
const payload = {
  year: YEAR,
  generated: new Date().toISOString().slice(0, 10),
  periods: Object.values(periods).map(p => ({
    id: p.id, start: fmtDate(p.start), end: fmtDate(p.end),
    exam_start: p.examStart ? fmtDate(p.examStart) : null,
    exam_end: p.examEnd ? fmtDate(p.examEnd) : null,
    status: p.status,
  })),
  events: instances,
};
writeFileSync(join(SITE, 'events.json'), JSON.stringify(payload, null, 2));
writeFileSync(join(SITE, 'events.js'), 'window.MSP_EVENTS = ' + JSON.stringify(payload) + ';\n');

// ---------- write feeds/*.ics (confirmed events only) ----------
mkdirSync(FEEDS, { recursive: true });
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function writeIcs(name, calName, evs) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//MSP Operations//Academic Calendar//EN',
    `X-WR-CALNAME:${icsEscape(calName)}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  ];
  for (const e of evs) {
    const d = e.date.replace(/-/g, '');
    const dEnd = fmtDate(addDays(parseDate(e.date), 1)).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}-${YEAR.replace(/\W/g, '')}@msp-operations`,
      `DTSTAMP:${d}T000000Z`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${dEnd}`,
      `SUMMARY:${icsEscape(`[MSP ${e.office.toUpperCase()}] ${e.title}`)}`,
      ...(e.notes || e.audience ? [`DESCRIPTION:${icsEscape([e.notes, e.audience && `For: ${e.audience}`].filter(Boolean).join(' | '))}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  writeFileSync(join(FEEDS, name), lines.join('\r\n') + '\r\n');
}
const confirmed = instances.filter(e => e.status === 'confirmed');
writeIcs('msp-all.ics', `MSP Deadlines ${YEAR} (all offices)`, confirmed);
writeIcs('msp-academic-staff.ics', `MSP academic staff deadlines ${YEAR}`, confirmed.filter(e => e.staff !== 'support'));
writeIcs('msp-support-staff.ics', `MSP support staff deadlines ${YEAR}`, confirmed.filter(e => e.staff !== 'academic'));
for (const office of [...new Set(confirmed.map(e => e.office))]) {
  writeIcs(`msp-${office}.ics`, `MSP ${office.toUpperCase()} deadlines ${YEAR}`, confirmed.filter(e => e.office === office));
}

// ---------- report ----------
console.log(`Year ${YEAR}: ${Object.keys(periods).length} periods, ${instances.length} event instances (${confirmed.length} confirmed -> ics).`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ! ' + p);
  process.exitCode = 1;
}
