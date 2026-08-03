# MSP Academic Operations Calendar

One calendar of every operational deadline and rhythm at the Maastricht Science Programme, for staff.

**Live site:** https://msp-operations.github.io/Academic-Calendar/

Two outputs, one source of truth:

1. **Web calendar** - year at a glance with the P1-P6 period structure, exam and resit weeks, and
   per-office deadline layers (Exams, ESD, BTR, BoE, Scheduling, Alumni). Filter by office or by
   staff role, click a deadline for details.
2. **Subscribable .ics feeds** (`feeds/`) - one master feed plus per-office and per-role feeds.
   Subscribe once in Outlook (Add calendar, Subscribe from web, paste the feed URL) and every
   update propagates automatically.

## How it works

- `data/events.yaml` - the single source of truth. Hand-edited, one event per block. Events carry
  either an absolute date or a relative rule (for example `P1.exam.end +15wd` = 15 working days
  after the last P1 exam), so rolling the calendar to a new academic year means filling in one
  small year file, not re-dating every event.
- `data/year-XXXX-XX.yaml` - the year structure: period boundaries, exam weeks.
- `build.mjs` - Node, no dependencies. Reads the data, writes `events.json`/`events.js` for the
  site and the `.ics` feeds. Run `node build.mjs` after any data change.
- Never edit `events.json` or the `.ics` files directly, they are generated.

Events marked `unconfirmed` render flagged on the site and are excluded from the feeds until the
owning office confirms them for the current academic year.

Maintained by MSP Operations (Martijn Jeurissen). Deadlines only, no personal data.
