---
name: Think Health Training Manager
description: The coordinators' and participants' portal at training.thinkhealth.in, set in the language of safety signage.
colors:
  navy: "#034f72"
  navy-deep: "#023a55"
  action: "#0077b6"
  action-hover: "#00659b"
  cerulean: "#0088c8"
  ink: "#0f2a3a"
  ink-2: "#3a5263"
  muted: "#587080"
  line: "#d3dfe7"
  line-strong: "#b5c7d3"
  ground: "#f2f6f9"
  surface: "#ffffff"
  sign-green: "#00843d"
  sign-blue: "#005387"
  sign-red: "#c8102e"
  danger: "#b42318"
  danger-bg: "#fdf0ee"
  ok-bg: "#e9f6ef"
  warn: "#9a5b00"
  warn-bg: "#fff7e6"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 6vw, 72px)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(34px, 4vw, 48px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  section:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 3vw, 32px)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(21px, 2.2vw, 24px)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.625
  subhead:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  value:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
  secondary:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.55
  stamp-date:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  field-label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
  value-label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.12em"
  stamp:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  stamp: "6px"
  plate: "8px"
  sign: "10px"
  control: "12px"
  panel: "16px"
  full: "9999px"
spacing:
  gutter: "20px"
  gutter-wide: "32px"
  panel-pad: "20px"
  panel-pad-wide: "28px"
  stack: "16px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.action}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  navy-band:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
    padding: "16px 32px 40px"
  logo-plate:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.plate}"
    padding: "6px 10px"
  training-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "28px"
  programme-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  state-stamp:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "6px 10px 4px"
  sign-square:
    rounded: "{rounded.sign}"
    size: "52px"
  sign-circle:
    backgroundColor: "{colors.sign-blue}"
    rounded: "{rounded.full}"
    size: "52px"
---

# Design System: Think Health Training Manager

## Overview

**Creative North Star: "The Safety Sign Board"**

The Training Manager speaks the international safety-sign language (ISO 7010) as an identity system. Every programme is a sign: First Aid and AED are safe-condition green squares, Fire Safety is a fire-equipment red square carrying an extinguisher, CPR is a mandatory-action blue circle. The signs are set with signage discipline: fixed shapes, a fixed pictogram-to-tile ratio, white pictograms, and identical tiles on one baseline. Around them sits a calm, light world of deep petrol navy and white panels, the way a printed sign board is mounted on a wall.

Hierarchy comes from scale contrast in a single face, not from colour or boxes. Headings are large, heavy, sentence-case statements; values sit in panels under small field labels; colour is rationed by meaning. Blue means one of two things and never both: the pressable action blue, or the sign blue of a mandatory sign. The portal is a separate world from the staff dashboard (work.thinkhealth.in); it has its own root layout and stylesheet, and nothing from the dashboard's look carries over.

The world is light only (`color-scheme: light`): coordinators use it at a desk in daylight, participants on a phone. It rejects the generic SaaS portal of grey cards and a sidebar.

**Key Characteristics:**
- One navy band at the top carries the wordmark on a white plate, the page's greeting, and a compact labelled strip of the four signs.
- Safety-sign colours appear only as programme identity, inside sign tiles.
- Action blue marks only things you can press.
- States are ink stamps that stack; nothing vanishes.
- One face (Manrope) at extreme weight and size contrast; sentence-case headings, no kickers.
- One authored motion moment, the welcome; everything respects reduced motion.

## Colors

A deep petrol navy and white world, with the ISO 7010 sign colours held strictly inside the signs and a single pressable blue.

### Primary
- **Petrol Navy** (navy): the header band, the sign-in panel, the participant band, the welcome screen, the focused-panel ring, the stamp ink, text selection and the browser theme colour. The brand's ground colour.
- **Deep Petrol** (navy-deep): the Stay connected footer only; one step darker than the band so the page closes on a heavier note.

### Secondary
- **Press Blue** (action): every primary button, the secondary button's text and rule, text links, the play disc on programme videos, the checked toggle, the caret and the focus outline. The brand's cerulean deepened so white text on it holds 4.9:1.
- **Press Blue, Pressed** (action-hover): the hover state of primary buttons; nothing else.
- **Brand Cerulean** (cerulean): the brand's reference cerulean, kept as a token for parity with thinkhealth.in; not set on any portal surface directly. Use action, not cerulean, for anything a person presses.

### Tertiary (sign colours)
- **Safe-Condition Green** (sign-green): the First Aid and AED sign squares.
- **Mandatory Blue** (sign-blue): the CPR sign circle. A sign colour, never pressable.
- **Fire Red** (sign-red): the Fire Safety sign square.

### Neutral
- **Deep Ink** (ink): headings, values, primary text; also the QR code's modules.
- **Slate Ink** (ink-2): secondary text, descriptions, field labels.
- **Harbour Grey** (muted): small-caps value labels, metadata, help text, placeholders (at 70-80%).
- **Rule** (line): panel rings, dividers between panel sections, field borders.
- **Rule, Strong** (line-strong): the toggle track when off.
- **Mist** (ground): the page ground under panels, segmented-control trays, inline info wells.
- **Panel White** (surface): every sign panel, field and card; the logo plate.
- **Alarm** (danger) on **Alarm Wash** (danger-bg): error notes and the Remove action.
- **Clear Wash** (ok-bg): confirmation notes (for example, "a code is on its way").
- **Caution** (warn) on **Caution Wash** (warn-bg): things to look at, not errors: a headcount that differs from the quotation, the same phone twice on the list.

### Named Rules
**The Press Blue Rule.** Action blue is used only on things you can press: buttons, links, the play disc, the checked toggle, focus. If it cannot be pressed, it is not action blue.

**The Two Blues Rule.** Sign blue (CPR) and action blue never trade places. A sign is never a button colour; a button is never sign blue.

**The Sign Colour Rule.** Green, red and sign blue appear only as programme identity, inside a sign tile. They are not status colours.

**The White Rim Rule.** A sign set on navy carries a 2px white rim, as printed signs do; without it the CPR blue sinks into the band. Signs on white carry no rim.

## Typography

**Display Font:** Manrope (with ui-sans-serif, system-ui, sans-serif), loaded through next/font as `--font-manrope`
**Body Font:** Manrope
**Label/Mono Font:** Manrope with tabular numerals for numbers (TH IDs, dates, counts); the system monospace only for the raw join link.

**Character:** thinkhealth.in's own face, used as a single family across a wide weight range: extra-bold (800) for every heading so the page reads by scale, regular to semibold for everything else.

### Hierarchy
- **Display** (800, 40px to 72px, 1.06, -0.03em): the welcome's first line. The next two lines step down to 24px to 40px at 85% white.
- **Headline** (800, 34px to 48px, 1.04, -0.025em): the band greeting ("Welcome, Name."), the participant's name, the join page's training name. The sign-in hero line runs to 52px on wide screens.
- **Section** (800, 26px to 32px, -0.02em): sentence-case section headings ("Your trainings", "Our programmes", "Stay connected" at 24px to 28px on navy).
- **Title** (800, 21px to 24px, -0.015em): a training panel's name. Programme tile names step down to 16px to 17px.
- **Body** (400, 15px to 16px, relaxed 1.625): descriptions, prompts, notes, held to 46-56ch.
- **Field label** (600, 13.5px, sentence case, ink-2): the name above an input.
- **Value label** (700, 12.5px, uppercase, 0.12em, muted): the small-caps name of a shown value: On, At, Attending, For, Participants, What's included.
- **Stamp** (800, 11.5px, uppercase, 0.14em): the state word inside a stamp; its date at 10px.

### Named Rules
**The Scale Not Kicker Rule.** Section headings are display-scale, sentence case, and stand alone. No eyebrow or kicker sits above a heading. Small caps exist only as labels for values (On / At / For) and inside stamps.

**The Tabular Numbers Rule.** Every TH number, date, count and phone number uses tabular figures.

## Layout

A single centred column per page. The coordinator's dashboard runs at 72rem (max-w-6xl) with 20px gutters widening to 32px; participant pages run at 48rem (max-w-3xl) with 20px gutters; the sign-in form column is 400px.

The dashboard reads top to bottom: the navy band (wordmark plate and "Training Manager" left, email and Sign out right; below, the greeting and summary, with the labelled four-sign strip aligned to the right on wide screens and below the greeting on narrow ones), then **Your trainings**, then **Our programmes**, then the Stay connected footer. Trainings come before programmes because the coordinator's work comes first.

Sign-in is two panels side by side from 1024px (navy at 1.05fr with signs and one sentence; white at 1fr with logo, title, form) and stacks on smaller screens.

Training panels stack 16px apart; each panel is divided into full-width sections by hairline rules, 20px padding widening to 28px. Programme tiles sit two across, four across from 1024px, on one baseline with 12px to 16px gaps. Stay connected links run one, two, then three across. The participant's own page lays On / At / For as a 64px label column beside its value.

## Elevation & Depth

Flat, with depth carried by tone (white panels on a mist ground, a navy band against both) and 1px rings rather than shadows. The few shadows are small, soft and navy-tinted, used only where an object is physically "mounted": a sign, the logo plate, a pressable button.

### Shadow Vocabulary
- **Mounted sign** (`box-shadow: 0 2px 6px rgb(2 40 60 / 0.25)`): every sign tile.
- **Logo plate** (`box-shadow: 0 2px 6px rgb(0 20 35 / 0.3)`): the white plate behind the wordmark on navy.
- **Pressable lift** (`box-shadow: 0 2px 8px rgb(0 80 130 / 0.22)`): primary buttons.
- **Panel rest** (`box-shadow: 0 1px 2px rgb(2 40 60 / 0.06)`): programme tiles, under their 1px ring.
- **Play disc** (`box-shadow: 0 6px 18px rgb(0 40 70 / 0.35)`): the action-blue disc on a programme video.
- **Selected tab** (`box-shadow: 0 1px 3px rgb(2 40 60 / 0.12)`): the active segment of a segmented control.

### Named Rules
**The Mounted Not Floating Rule.** Shadows are soft and close (2px to 8px blur, navy-tinted). No hard offset shadows, no large ambient glows; panels separate by ring and tone.

## Shapes

Softly squared. Panels and tiles round at 16px, controls (buttons, fields, notes, trays) at 12px, the logo plate at 8px, stamps and small tags at 6px. Signs keep the sign grammar exactly: safe-condition and fire-equipment signs are squares with 10px corners; the mandatory sign is a full circle. Pictograms are white SVG at 66% of the tile. Panels are bounded by a 1px line ring, not a border plus shadow; the focused training panel takes a 2px navy ring.

## Components

### Buttons
Confident and plain: a solid blue slab or a blue-ruled outline, nothing else.
- **Shape:** gently rounded (12px), 44px tall (48px on sign-in and join, where the button spans the column).
- **Primary:** action blue with white bold 15px text, pressable lift shadow; hover to action-hover; press scales to 0.99; disabled at 50%.
- **Secondary:** white with action-blue bold text and a 1px inset ring at 35% action; hover washes the fill with 6% action.
- **Text link:** semibold action blue, underline on hover.
- **On navy:** Sign out is white text with a 1px white-at-25% inset ring; hover washes 10% white.
- **Focus:** a 3px outline of action at 45%, offset 2px, everywhere.

### Inputs / Fields
- **Style:** white, 1px line border, 12px radius, 44px to 48px tall, 15px to 16px ink text; field label above in 13.5px semibold ink-2.
- **Focus:** border turns action blue with a 4px action-at-15% ring.
- **Toggle:** a 44 by 24 pill, line-strong when off, action when on, white knob.
- **Segmented control:** a mist tray at 12px radius; the selected segment becomes a white 8px pill with the selected-tab shadow and ink text; others are muted until hover.

### Cards / Containers
- **Training panel:** white, 16px radius, 1px line ring, sections split by hairlines. The header section holds a 52px sign, the quote number and date in tabular muted type, the title, the customer and the stamps.
- **Programme tile:** white, 16px radius, line ring plus panel-rest shadow; a 16:9 media well (photo, YouTube poster, or the 76px sign on mist when neither exists) over the name and one line.
- **Notes:** 12px radius wells: danger-bg with danger text for errors, ok-bg with ink-2 for confirmations, ground for neutral info.

### Navigation
- **Navy band:** the only header on the dashboard. The wordmark sits on a white 8px plate (the logo is blue on white; no reversed mark exists), followed by "Training Manager" at 14px to 15px semibold white at 90%. Below it, the greeting and the signs strip: four 40px rimmed signs, each labelled underneath in 11.5px semibold white at 75%.
- **Participant band:** a white logo strip ("Training" beside a hairline divider) above a navy band holding a row of 34px rimmed signs and the page title.
- **Footer:** Stay connected on navy-deep; each link a white-at-6% tile with a 10% white ring, a 24px white line icon (inline SVG), a bold label and a one-line note.

### Sign Tile (signature)
The programme's identity mark, drawn as SVG in ISO 7010 grammar. First Aid: white cross on a green square. AED: white heart with a green lightning bolt on a green square. Fire Safety: white extinguisher on a red square (never a flame, which means "flammable"). CPR: white heartbeat line on a sign-blue circle. Sizes in use: 34, 40, 48, 52, 76px; the pictogram is always 66% of the tile. On navy, a 2px white rim.

### State Stamp (signature)
An ink stamp, not a pill. Navy text on white, a 2px navy border with a second inset navy rule (a double-rule stamp), 6px radius, rotated -4deg. The state word in 11.5px extra-bold uppercase; the date it landed beneath in 10px. States stack in order (Awaiting decision, Accepted, then Confirmed; or Rejected): earlier stamps stay at 90% scale and 40% opacity with their dates; only the newest stamp is at full strength and lands with a short press. Stamps sit right-aligned in a column on wide screens and wrap in a row under the title on phones.

Confirmed lands only when Think Health marks the Performa Confirmed. Between Convert to PI and that, the stamp stays Accepted, the Change action goes, and one line takes its place, in the same pattern as the confirmed line (bold fact, then how to change things): "**Think Health is preparing your Performa Invoice.** To change anything now, write to learn@thinkhealth.in." No new stamp, colour or layout for this state.

A **Completed** stamp lands when the Training board marks the training completed.

### Attendance (owner, 13 Nov)
- **Confirmed panel:** the heading "Training confirmed". On / At / For stacked in a 56px label column on the left; the fixed **Attendance QR** (168px, with Print / Download / New QR as text links and "Works on the training day only" under it) on the right; on phones the QR stacks below. A date the Training board moved shows the coordinator's struck through beneath it.
- **Start training (owner, 13 Nov):** attendance and the quiz open only when the coordinator starts the training, on its date. The day's strip carries the control. Before Start it's a mist well ("Training today", meta, "Attendance and the quiz open when you start.") with a 48px action-blue **Start training**. While running, the strip turns **navy** ("Training in progress", "Started at 10:02 am …"), the one navy surface inside a panel and the signal that it's live, with **End training** as a white-ringed button. After End, it returns to mist ("Today's training has ended") with a secondary **Start again**.
- **Quiz results** (under the QR, once the quiz has opened): three mist stat tiles (taken of present, passed, average), the leaderboard as a ringed list (rank in tabular extra-bold, navy for first; name; TH number, time and Passed / Badge in muted; points and percent right-aligned), and "See the answers by question": thin bars, navy for the right option, line-strong for the others. It refreshes every 5 seconds while the quiz is open.
- **On the training day:** the panel takes the 2px navy ring. A mist well leads: "Training today" at title scale, then "Day 2 of 3 · 10:00 am · place · With trainer" in tabular slate. Below it, the QR at 260px beside the live count: the number at 64px extra-bold ink, "of 36" at 28px muted, "present today" at 17px bold. The details move under a hairline.
- **Attendance ticks:** a 36px circle per training day at the end of each participant row. Not present: a 2px line-strong ring with no mark. Present: a solid navy disc with a white check. Ink, never sign green (the Sign Colour Rule). A day still ahead shows the ring at 40%. Ticks don't animate (`transition-none`), so no frame catches them blank.
- **Attendance page** (`/<number>/attend`): the participant band with the training and today's date. One decision per screen: the mobile number, then "Welcome back, Riya." (or "Welcome, Riya." for a walk-in) with **one round Present button**: a 176–192px action-blue disc with a soft 8px action-at-10% halo ring, "Present" in 24px extra-bold white. Under it, the name and TH number in muted tabular type, and "Not you?" as a text link.
- **Attendance marked:** full navy, like the participant thank-you. A large PRESENT stamp (white plate, navy double rule, rotated -6deg, 34–42px letters) lands with `stamp-present`, a harder press from 2.4× scale with a small overshoot, 0.6s. Then two lines rise ("Attendance marked." / "Thank you for being here, Riya."), and their page opens after 3.2s. With reduced motion: no animation, 1.2s.
- **Participant page:** an Attendance panel lists each training day; a day they were present carries the small PRESENT stamp, other days say "Mark it on the day" / "Not marked yet" / "Not marked" in muted.

### The quiz: its own world (owner, 13 Nov)
The participant's quiz deliberately leaves the safety-sign world. The owner asked to copy the **AED Readiness Campaign** design (github.com/thinkhealthcareandsafety/aed-readiness-campaign), so it lives in `app/training/quiz.css`, scoped under `.qz`, light only:
- **Ground and colour:** warm paper (#f5f6f3) with faint orange and teal radial glows. Orange (#d9761c, deep #a6540f, tint #fbeada) marks what's chosen; teal (#2f5d5a) marks structure; green and red mark right and wrong in the review.
- **Type:** Fraunces for display (the quiz title, "Quiz complete", "Leaderboard"), Inter for text, IBM Plex Mono for numbers. These load only on participant pages, through next/font in `[number]/[th]/page.tsx`.
- **Frame:** a frosted sticky top bar (logo, title, an "Answered 12 / 30" pill that pulses on each answer, "Q 13 / 30") over segmented step dots: teal answered, orange current and longer. Below it sits one raised wizard card per question (20px radius, deep soft shadow), and a sticky Back / Next footer.
- **Answers:** option rows (1.5px rule, 12px radius, native radio, orange tint when chosen). Questions with pictures use picture cards in a 2–4 column grid, with a corner check, and the others fade once one is chosen.
- **Moments:** the intro has three teal fact tiles (30 questions, 70% to pass, 100% earns a First Aid Badge) and a full-width orange gradient button. The finish is a stamped seal: the ring draws, then the tick (green when passed, orange when not), with score / percent / rank tiles, a verdict pill, then the leaderboard with "you" in the orange tint. The right answers (green, theirs in red) appear only after the coordinator ends the training.
- Reduced motion turns off every transition and the seal's drawing.

### Welcome (the authored motion moment)
Shown once, right after signing in, on full navy: the four rimmed signs set in one after another (0.7s, 140ms apart, rising 10px from 94% scale), then three lines rise 28px into place (0.9s each, 800ms apart), all on `cubic-bezier(0.16, 1, 0.3, 1)`. It lasts 4.6s, fades out over 0.5s, and is skipped by a tap, Enter, Space or Escape. The dashboard mounts only after it, fading in over 0.6s. With reduced motion the welcome is not shown and no animation runs. The same sign set-in plays on the sign-in panel, and the participant thank-you reuses the line rise; these are echoes of the welcome, not new moments.

## Do's and Don'ts

### Do:
- **Do** put the wordmark on a white plate whenever it sits on navy; the logo is blue on white and has no reversed form.
- **Do** draw programmes only as sign tiles in their ISO 7010 shape and colour: green squares for First Aid and AED, a red square with an extinguisher for Fire Safety, a sign-blue circle for CPR.
- **Do** give every sign on navy a 2px white rim.
- **Do** keep action blue (#0077b6) for things you can press, and sign blue (#005387) for the CPR sign only.
- **Do** show state as stacked double-rule ink stamps that keep earlier states, faded, with their dates.
- **Do** set section headings at display scale in sentence case, and use small caps only to label values (On / At / For).
- **Do** use tabular figures for every TH number, date, count and phone number.
- **Do** honour `prefers-reduced-motion`: no welcome, no set-in, no stamp landing.

### Don't:
- **Don't** add eyebrows or kickers above headings.
- **Don't** use sign green, sign red or sign blue as status, success or decoration colours.
- **Don't** use action blue on anything that cannot be pressed, or sign blue on anything that can.
- **Don't** draw Fire Safety as a flame, or put any programme in a shape its sign category does not use.
- **Don't** add a dark theme; the portal is light only.
- **Don't** use hard offset shadows or large glows; mounted objects get the soft, close navy shadow.
- **Don't** borrow the staff dashboard's look, sidebar or grey-card layout.
- **Don't** add a second authored motion moment; the welcome is the one. Entrance motion elsewhere reuses its vocabulary (the sign set-in, the line rise) and stays brief.
