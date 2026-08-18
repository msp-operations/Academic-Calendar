# Editing the Academic Calendar

Plain-language guide, written for whoever runs this after Martijn. No coding needed for the
things you will actually want to do. If you can edit a text file, you can maintain this calendar.

> **The one rule:** you edit the files in `data/`. You never edit `events.json`, `events.js` or
> anything in `feeds/`. Those are produced from `data/` by the build step. If you edit them
> directly your change is wiped the next time anyone runs the build.

---

## The five-minute version

1. Open `data/events.yaml` in a text editor.
2. Copy an existing block, paste it at the bottom, change the words.
3. Save.
4. Open a terminal in the repo folder and run: `node build.mjs`
5. `git add -A`, `git commit -m "Calendar: <what you changed>"`, `git push`.
6. The live site updates itself in one to two minutes.

That is the whole loop. Everything below is detail.

---

## What lives where

| File | What it is | Edit it? |
|---|---|---|
| `data/events.yaml` | Every deadline and event. **The file you will use.** | Yes, often |
| `data/year-2026-27.yaml` | The year skeleton: when each period and exam week runs | Yes, once a year |
| `index.html` | The website itself. Has one marked `EDIT HERE` block near the bottom for office names and labels | Rarely |
| `build.mjs` | The engine that turns the data into the site and the feeds | No |
| `events.json`, `events.js`, `feeds/*.ics` | Generated output | **Never** |

---

## Adding an event

Copy this and change the values. Only the first four lines are required.

```yaml
- id: a-short-unique-name
  title: What it is called on the site
  office: exams
  when: "2026-10-16"
  staff: support
  audience: who it concerns
  notes: "Anything worth knowing when the day arrives"
  status: confirmed
```

**`office`** must be one of: `exams`, `btr`, `boe`, `scheduling`, `esd`, `alumni`, `general`.
That choice decides which filter button and which colour the event gets.

**`staff`** is who has to *act* on it: `academic`, `support`, or `both`. Leave it out and it
means both. This drives the "Academic / Support" filter and the per-role subscribe feeds.

**`status`** is `confirmed` or `unconfirmed`. Unconfirmed events still show on the site but are
visibly flagged, and they are deliberately **left out of the .ics feeds**, so nobody subscribes
to a date that might move. Use it honestly. A flagged date is better than a wrong one.

**`id`** just has to be unique. It never appears on the site.

### Dates that move with the year

This is the part that saves the real work. Instead of a fixed date you can write a rule, and the
build works out the actual day:

```yaml
  when: "P1.exam.end +15wd"      # 15 working days after the last P1 exam
  when: "P2.start -2w"           # 2 weeks before P2 begins
  when: "year.start +1d"         # the day after the year starts
```

- Anchors: `P1.start` `P1.end` `P1.exam.start` `P1.exam.end` (same for P2 to P6), `year.start`, `year.end`
- Offsets: `+3d` calendar days, `+2w` weeks, `+15wd` **working** days (skips weekends)

Write the rule rather than the date wherever the deadline is genuinely "x days after y". Then
rolling the calendar to a new year is one small file, not re-dating two hundred events.

### One event, several periods

```yaml
- id: grades-due
  title: Grades due to the exam office
  office: exams
  when: "{P}.exam.end +15wd"
  repeat: [P1, P2, P4, P5]
```

That produces four events, one per listed period, each on its own correct date.

---

## Rolling over to a new academic year

1. Copy `data/year-2026-27.yaml` to `data/year-2027-28.yaml`.
2. Fill in the new period start, end, exam_start and exam_end dates from the official Calendarium.
3. Change `year:` at the top.
4. Anything in `events.yaml` written as a rule moves by itself. Anything with a hard date needs
   checking by hand, which is the argument for using rules.
5. Run `node build.mjs`, check the site, push.

---

## Adding a new office

Four steps, all small, in this order:

1. `index.html`, in the `EDIT HERE` block: add your key and label to `OFFICES`.
2. The stylesheet in the same file: search for `--off-exams` and copy that line for your key,
   so the new layer has a colour.
3. `index.html` again: add `'msp-<yourkey>.ics': 'Your label',` to `FEEDS`.
4. Start using `office: yourkey` in `events.yaml`.

`build.mjs` generates the new feed file on its own. Run it and push.

---

## If something looks wrong

**The site did not change after a push.** Check the Actions tab on GitHub, the deploy takes a
minute or two and shows green when done. If it is red, open it and read the error.

**An event is missing from the site.** Almost always a YAML indentation problem. Every field line
needs exactly two spaces in front of it, and the block must start with `- id:`. Tabs break it.

**An event is on the site but not in Outlook.** Check its `status:`. Unconfirmed events are kept
out of the feeds on purpose.

**A relative date landed on the wrong day.** Check the anchor exists for that period in the year
file, and remember `wd` skips weekends while `d` does not.

---

## Where the deeper context lives

- `README.md` in this repo: the technical picture.
- `c:\dev\Operations\Projects\Academic-Calendar\_CALENDAR_CONTEXT.md`: the project record,
  including which dates are still unconfirmed and where the conflicts between sources are.
- `_CALENDAR_TODO.md` alongside it: what is still open.
