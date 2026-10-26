# Progress tracker — architecture (`/progress-tracker`)

_Written 26 Oct 2026 for the owner (sshah@thinkhealth.in) and the Claude Code sessions that will build it. Read with
HANDOFF.md (§8 owner's preferences, §11 "Changing things without breaking the live site"). **Nothing here is built
yet.** Every phase is restated with the owner before building, with a recommended default per question._

**Status (26 Oct, evening):** the owner said "build it" (both defaults accepted: D4 = waited-on member or requester
resolve, + Admin; D9 = everyone, Reports shows only the tracker to members without the Training board).
**P1 + P2 are built, not pushed:**
- **Requests:** create (from the hub, from a check-in blocker, or **"Ask a teammate"** on any board card's header),
  ping, resolve, withdraw, reopen, priority, seen, history.
- **Board views:** Waiting on you / You're waiting on, the matrix, and the header counts with filters.
- **Status cards:** Away / Back, Set focus, last seen and the micro-log line.
- **Check-ins and threads:** check-ins (format, prefill, blocker → request), and threads on requests and check-ins.
- **Notices and badge:** notices (top-right pop-ups) and the sidebar badge.

**Added the same evening, "Everyone's to-do"** (owner: "I need to see what everyone needs to do or is going to do"). It
is the page's first view, one column per person, read from the boards (nothing typed in, nothing saved;
`src/lib/progress/todos.ts` + `GET /api/progress/todos`). Owner's answers:
1. Admin / Shikha / Sumit / Ashish see every column; the others see their own.
2. A training's to-dos (mark completed **or postpone** once its date has passed; a missing contact number) belong to
   whoever scheduled it, else its trainers.
3. No sales items.
4. Window: overdue + today + next 7 days.
5. No renewals.

What each column holds:
- Trainers: the trainings they give.
- Priyanka: AED contact / schedule / trainings.
- Shreya: gratitude email, ★ replies, Send to Logistics / on hold.
- Arti: mark AED delivered, merge, packing, shipping, confirm received.
- Everyone: meetings / events and the requests waiting on them.

Items open their card on its board: `/follow-up?open=` now also opens Fulfillment (`fulfil:`) and Logistics (`logi:`,
`logipay:`) cards, and AED cards on Logistics for Arti.

**Then (owner, same evening):**
- **Check-ins removed** ("I don't need post today's check-ins"): the form, `/api/progress/standups`, the feed tabs and
  focus-from-check-in are gone. §6 and the S7 / S24 parts of this plan are **dropped**.
- **Work done** replaces them ("an auto record of all the work the user has completed, not just what needs to be
  done"). It is the second view, with one column per person for the last 7 days, grouped by day.
  - It comes from the boards' change log (`buildDone` in `todos.ts`); an undone change doesn't count, and the
    requests they resolved are included.
  - Repeats on one card the same day show once as ×n.
  - The same who-sees-whom rule as the to-dos applies.
- **(i)** next to the page title (`Info.tsx`) explains the three views, who sees what, and what is (not) tracked.
- The page's tabs: **Everyone's to-do · Work done · Requests**.

Not built: P3 digest, P4+ webhooks. Code is in `src/lib/progress/` (`model.ts` pure, `server.ts`),
`src/app/api/progress/*`, `src/components/progress/*` and `src/app/reports/progress-tracker/page.tsx`; the heartbeat
(`useProgressPulse`, every 30 s while the tab is visible) is in AppShell. **Changed from the plan while building:**
- A check-in blocker may say **"outside the team"** (a customer, a supplier) instead of a request **[A38]**. A request
  must name a team member, and much of this team's waiting is on customers.
- The heartbeat is its own 30 s call (it also brings the notices), not the Zoho 2-min timer.
- Fulfillment / Logistics cards open on the board by search (`?q=`), because `?open=` only opens Training / AedSmartx
  cards.

**How to read this document**
- **[S1]…[S26]** are the requirements from the owner's spec (listed in §0.2). Every design choice cites one.
- **[A1]…[A38]** are **assumptions**: details the spec doesn't give but that a build needs. Each one is stated where
  it's used and collected in §9. Change any of them and the design changes in that one place.
- **[D1]…[D16]** are **open decisions** the team must make (§8). Each one has a recommended default, so a build can
  start before every decision is made.

---

## 0. Purpose and core questions

### 0.1 The three questions
The page has to answer three questions at any moment, and every module on it serves at least one of them:

| # | Question | Answered by |
|---|---|---|
| **Q1** | What is each person working on, and when were they last active? | Team status cards (§4): current focus, availability, last seen, recent activity |
| **Q2** | What progress and automated milestones have been reached? | Async Progress & Automated Activity (§5, §6): standups, tool events flagged as milestones |
| **Q3** | Who is waiting on whom to finish dependent work? | Dependency & Hand-off Board (§3): "Waiting on You", the Blocked Work matrix, header counts |

Anything that answers none of the three stays out of v1.

### 0.2 The requirements from the spec (traceability list)
| ID | Requirement (spec) |
|---|---|
| S1 | Show what each person is working on and when they were last active |
| S2 | Show what progress and automated milestones have been reached |
| S3 | Show who is waiting on whom to finish dependent work |
| S4 | Header bar with team-wide counts: active members, open blockers, pending hand-offs |
| S5 | Main feed, section 1 — Dependency & Hand-off Board: direct **"Waiting on You"** requests |
| S6 | …and a **"Blocked Work" matrix** |
| S7 | Main feed, section 2 — Async Progress & Automated Activity: **daily standup submissions** |
| S8 | …plus a **webhook stream** from GitHub / GitLab, Jira / Linear / Trello, Figma / Notion / Google Docs, Vercel / AWS / Sentry |
| S9 | Sidebar: **team status cards** — avatars, timestamps, live status, micro-logs |
| S10 | Sidebar: **quick action hub** — request input or hand-off, post a standup update |
| S11 | Four pre-set request categories: **Input Needed, Review Required, Hand-off Ready, Critical Blocker** |
| S12 | Each request records: requesting member, task, member waited on, category, waiting time, status — with **ping** and **resolve** actions |
| S13 | Requests are created **from a task card** |
| S14 | Requests carry a **Normal or Urgent** priority |
| S15 | A request puts an **inline badge on the recipient's profile card** |
| S16 | A **polite ping** becomes available after a set interval (spec suggests **4 hours**) |
| S17 | **Resolving notifies the requester** to resume |
| S18 | Requests open **longer than 24 hours** are **visually escalated** |
| S19 | The status tracker is driven by **tool activity logs and self-reported status**, **not intrusive monitoring** |
| S20 | Status card: **availability** (active, away, with last-seen time) |
| S21 | Status card: **current focus** |
| S22 | Status card: **pending requests in each direction** |
| S23 | Status card: a **short recent-activity line** |
| S24 | Daily async check-in, fixed format: **completed items · today's focus · blockers and dependencies with request references** |
| S25 | All discussion **threaded** under updates and requests |
| S26 | A **bot digest every evening at 6:00 PM**: accomplishments and unresolved blockers |

### 0.3 Where it lives in this app
- **It lives in the Reports section** (owner, 26 Oct: "it goes under report, section"):
  - **Route `/reports/progress-tracker`** (owner's name).
  - In the sidebar, an indented sub-item **"Progress tracker"** under Reports (`AppShell` `NAV`; the rail and the
    phone tab bar link it from the Reports icon).
  - A **"Progress tracker"** tab at the end of the Reports tab row (after Saved reports). It navigates to the route,
    so the tracker keeps its own full-height layout (§1.1) and doesn't sit inside a dashboard.
  - **Visibility conflict:** today Reports is shown only to members whose boards include Training, because its data
    is Books money (`AppShell` `nav` filter, `/api/analytics`). The tracker holds no money data and is needed by
    everyone, so the default is that **every member sees the Reports section, but members without the Training board
    see only Progress tracker in it**. Their Reports link opens the tracker, and the dashboards and saved reports
    stay hidden and refused as now. See D9.
- The app's left navigation already exists, so the spec's "sidebar" [S9, S10] is a **right-hand panel inside the
  page**, not a second navigation bar. **[A1]**
- **Users** = the members in Mongo `members` (Shikha, Ashish, Sumit, Priyanka, Arti, Shreya) plus Admin. Sign-in,
  session cookie and the 401 rules are the existing ones (HANDOFF §3 "Sign-in and API protection").
  **Every signed-in member sees the page** [D9]. **[A2]**
- **Stack and habits** as for the rest of the app: Next.js 16 route handlers (read `node_modules/next/dist/docs/`
  first; `AGENTS.md`), MongoDB, Tailwind tokens and themes, 15 s polling like `/api/store` (Vercel serverless keeps
  no open sockets). "Live" therefore means **at most ~15 s late**. **[A3]**
- **Pure logic in one shared module**, `src/lib/progress/model.ts`, used by both server and browser (like
  `pipeline.ts` / `analytics/model.ts`), so a script can check it on real data without a browser (HANDOFF §9 #7).

---

## 1. Layout and module architecture

### 1.1 Screen (desktop, the owner's 1728×958)
The page fits the screen with **no page scroll**. Each column scrolls on its own, with hidden scrollbars (HANDOFF §8
owner's standing preference). **[A4]**

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER BAR [S4]   ● 4 active members   ⛔ 2 open blockers   ⇄ 3 pending hand-offs   (as of 10:42)│
├──────────────────────────────────────────────────────────────┬────────────────────────────────┤
│ MAIN FEED                                                    │ SIDEBAR                        │
│ ┌─ Dependency & Hand-off Board [S3,S5,S6] ─────────────────┐ │ ┌─ Quick actions [S10] ──────┐ │
│ │ Waiting on You (3)            [S5]                        │ │ │ + Request input / hand-off │ │
│ │  ⛔ R-0042 Critical · Urgent · from Shreya · 26 h ▲       │ │ │ + Post standup update      │ │
│ │  ◐ R-0045 Review Required · from Sumit · 3 h              │ │ └────────────────────────────┘ │
│ │ Blocked Work matrix           [S6]                        │ │ ┌─ Team status [S9,S20–S23] ─┐ │
│ │        waits on → Shikha Sumit Ashish …                   │ │ │ (S) Shikha  ● Active       │ │
│ │  Shreya            2⛔    ·     ·                         │ │ │  Focus: Hotel certificates │ │
│ │  Arti              ·      1     ·                         │ │ │  ⇣2 waiting on her ⇡1     │ │
│ └───────────────────────────────────────────────────────────┘ │ │  Merged PR #12 · 8 min    │ │
│ ┌─ Async Progress & Automated Activity [S2,S7,S8] ─────────┐ │ │ (P) Priyanka ○ Away · 2 h │ │
│ │ [Standups] [Tool activity] [Everything]                   │ │ │  …                         │ │
│ │  Sumit — standup 09:12 · ✓3 · focus 2 · blockers 1 (R-…)  │ │ └────────────────────────────┘ │
│ │  ★ Vercel · Production deploy succeeded · 10:31           │ │                                │
│ └───────────────────────────────────────────────────────────┘ │                                │
└──────────────────────────────────────────────────────────────┴────────────────────────────────┘
```

- The main feed is about **two thirds** of the width and the sidebar **one third**, at ≥ 360 px. **[A5]**
- In the main feed, the Dependency board takes the top part and Activity the rest. The two split the height evenly,
  but the Dependency board **grows to fit its open requests**, up to 60 %, because Q3 is the most urgent question.
  **[A6]**
- **Phones (390 px):** a single column in the order Header counts → Waiting on You → Quick actions → Team status →
  Blocked Work matrix (scrolls sideways inside its own box) → Activity. **[A7]**

### 1.2 Modules
| Module | Spec | Component (`src/components/progress/`) | Data it reads |
|---|---|---|---|
| Header bar | S4 | `HeaderCounts.tsx` | `counts(snapshot)` from `model.ts` (§3.6) |
| Waiting on You | S5, S12, S16–S18 | `WaitingOnYou.tsx` | open requests where `waitingOnId` = me |
| Blocked Work matrix | S6 | `BlockedMatrix.tsx` | every open request (§3.7) |
| Standups | S7, S24 | `StandupList.tsx`, `StandupForm.tsx` | `ptStandups` for today (IST) |
| Tool activity stream | S2, S8 | `ActivityStream.tsx` | `ptActivity`, newest first, paged |
| Team status cards | S9, S20–S23 | `StatusCards.tsx` | `ptPresence` + requests + latest activity per member |
| Quick action hub | S10, S13 | `QuickActions.tsx` → `RequestForm.tsx`, `StandupForm.tsx` | — |
| Request card / detail | S12, S16–S18, S25 | `RequestCard.tsx`, `RequestDetail.tsx` (popup via portal, HANDOFF §11 #9) | one request + its thread |
| Threads | S25 | `Thread.tsx` | `ptComments` for one parent |
| Notifications | S15, S17 | `ProgressToasts.tsx` (bottom-right, same pattern as `DayReminders.tsx`) + badge | `ptNotifications` for me |

### 1.3 Server pieces
| Piece | Path | Who may call it |
|---|---|---|
| Snapshot (everything the page needs, one call) | `GET /api/progress` | signed-in member |
| Requests: create / ping / resolve / withdraw / comment | `POST /api/progress/requests`, `PATCH /api/progress/requests?id=` | signed-in member (rules §3.5) |
| Standups: post / edit own | `PUT /api/progress/standups` | signed-in member, own standup only |
| Presence: heartbeat, set status / focus | `POST /api/progress/presence` | signed-in member, own presence only |
| Notifications: mark read | `PATCH /api/progress/notifications` | own only |
| Webhooks (one per source) | `POST /api/progress/hooks/[source]` | **public**, but the signature must verify (§5.3) |
| Evening digest | `GET /api/cron/digest` | `CRON_SECRET` (like `/api/cron/sync`) |
| Pure logic | `src/lib/progress/model.ts` | shared |
| Source adapters | `src/lib/progress/sources/<source>.ts` | server only |
| Digest builder | `src/lib/progress/digest.ts` | server only |

**The server stamps who did what** (member from the cookie), the same as `/api/store` does for `cardEvents`. The
browser never sends `requesterId` / `by`. **[A8]**

---

## 2. Shared constants (one place, `model.ts`)
| Constant | Value | Source |
|---|---|---|
| `PING_AFTER_MS` | 4 h, from creation or from the last ping | **S16** (spec suggests 4 h) |
| `ESCALATE_AFTER_MS` | 24 h open | **S18** |
| `DIGEST_AT` | 18:00, team time zone | **S26** |
| `TEAM_TZ` | `Asia/Kolkata` | **A9** — everyone works from India today; see D1 |
| `ACTIVE_APP_MS` | 10 min since the last visible-tab heartbeat | **A10** |
| `ACTIVE_TOOL_MS` | 30 min since the member's last tool event | **A10** |
| `POLL_MS` | 15 s | **A3** |
| `ACTIVITY_KEEP_DAYS` | 90 | **A11**, see D3 |

---

## 3. The dependency system ("Unblock Me")

### 3.1 Categories [S11]
The four categories are fixed in code, not editable by users. **[A12]**

| Category | Use it when… (guidance shown in the form) | Is the requester blocked? | "Resolve" means | Look |
|---|---|---|---|---|
| **Input Needed** | You need information, a file or a decision from someone | Partly; work can often go on | "Here's what you needed" | amber |
| **Review Required** | Your work is done and needs someone's review or approval | On that piece | "Reviewed / approved" (or changes asked, in the thread) | blue |
| **Hand-off Ready** | Your part is finished and the next step is theirs | No; **they** now hold the work | "Picked up" | teal |
| **Critical Blocker** | Your work has **stopped** until they act | Fully | "Unblocked — you can resume" | red, always |

The "Requester blocked?" and "Resolve means" columns are **[A13]**: the spec names the categories but not their
meaning. They decide the header counts (§3.6) and the wording of the resume notice (§3.8).

### 3.2 Data model
**`ptRequests`** — one document per request. This is **real team data**: never write test documents to it (HANDOFF §11 #4).

| Field | Type | Spec | Notes |
|---|---|---|---|
| `_id` | string (uuid) | — | |
| `ref` | string `"R-0042"` | S24 | Readable number for standups and threads; from an `$inc` counter in kv `pt_request_seq` **[A14]** |
| `category` | `"input" \| "review" \| "handoff" \| "critical"` | S11, S12 | |
| `priority` | `"normal" \| "urgent"` | S14 | Default `normal` **[A15]** |
| `requesterId` / `requesterName` | string | S12 | Set by the server from the session [A8] |
| `waitingOnId` / `waitingOnName` | string | S12 | One member per request; a request to two people = two requests **[A16]** |
| `task` | `TaskRef` (below) | S12, S13 | |
| `note` | string ≤ 1,000 chars | — | What exactly is needed **[A17]** |
| `status` | `"open" \| "resolved" \| "withdrawn"` | S12 | Stored states only. "Pinged", "Escalated" and "Waiting time" are **derived** (§3.3) |
| `createdAt` | ISO UTC | S12 | Waiting time starts here |
| `seenAt` | ISO UTC? | — | First time the recipient opened it (shown as "Seen 10:12") **[A18]** |
| `pings` | `{at, by}[]` | S16 | |
| `resolvedAt` / `resolvedBy` / `resolution` | ISO / string / string ≤ 1,000 | S17 | `resolution` = optional note to the requester |
| `withdrawnAt` / `withdrawnBy` | | — | Requester no longer needs it **[A19]** |
| `log` | `{at, by, action, detail?}[]` | S25 | Append-only history: created, seen, pinged, resolved, withdrawn, reopened, priority changed |
| `updatedAt` | ISO UTC | — | For the 15 s diff |

**`TaskRef`** — what the request is about [S13]. The spec says requests start "from a task card" but doesn't say
where tasks live. This app has no task list, so a task can be any of the following **[A20]**:

| `task.kind` | Created from | Fields | Opens |
|---|---|---|---|
| `board` | A card on a Follow-ups board ("Request input" in the card's menu) | `cardId`, `title` (customer + document) | `/follow-up?open=<cardId>` |
| `external` | An item in the tool activity stream (PR, issue, Figma file, doc, deploy) | `source`, `externalId`, `title`, `url` | the tool's own page |
| `standup` | A blocker line in a standup ("Make this a request") | `standupId`, `line`, `title` | the standup |
| `free` | Quick action hub, typed title | `title` | — |

On the Follow-ups boards a member can only open cards their boards allow (`roles.ts`). A request on a `board` task
shows the title to everyone, but the link only works for members who can open that board. **[A21]**

**`ptComments`** (threads [S25]): `_id`, `parent {kind: "request" | "standup", id}`, `by`, `byId`, `text` ≤ 2,000,
`at`, `editedAt?`, `deletedAt?`. Only the author can edit or delete, and a deleted comment shows as "removed". **[A22]**

**`ptNotifications`**: `_id`, `to` (memberId), `kind`, `requestId?`, `standupId?`, `text`, `at`, `readAt?`. In-app
only in v1 [D5].

### 3.3 Derived values (computed in `model.ts`, never stored)
| Value | Rule | Spec |
|---|---|---|
| **Waiting time** | open: now − `createdAt`; closed: `resolvedAt`/`withdrawnAt` − `createdAt`. Shown "3 h 20 m", "1 d 4 h" | S12 |
| **Can ping** | open **and** now − max(`createdAt`, last ping) ≥ `PING_AFTER_MS` **and** the viewer is the requester | S16 |
| **Next ping at** | max(`createdAt`, last ping) + 4 h ("Ping available at 14:20") | S16 |
| **Escalated** | open **and** waiting time > 24 h | S18 |
| **Severity** (sort order, colour) | critical > escalated > urgent > normal; then oldest first | S5, S18 |

Waiting time is **wall-clock** time: nights and Sundays count. **[A23]** Whether to count working hours only is D2.

### 3.4 Request lifecycle
```
             create (from a task card or the hub)            [S13]
                          │
                          ▼
   ┌──────────────────── OPEN ───────────────────────┐
   │  · ping (requester, every 4 h)     [S16]         │
   │  · comment (either side)            [S25]        │──── > 24 h ──► shown ESCALATED (still OPEN) [S18]
   │  · change priority (requester)                   │
   └──────┬──────────────────────────────┬────────────┘
          │ resolve                      │ withdraw (requester)
          ▼                              ▼
       RESOLVED  [S17]               WITHDRAWN
          │  reopen within 7 days (requester) — goes back to OPEN, waiting time restarts
```
- **Reopen** exists because a "resolved" review sometimes isn't. It restarts the clock (`createdAt` stays; a
  `reopenedAt` drives the waiting time). The 7-day window is **[A24]**.
- **Not in v1:** decline, reassign to someone else, and multiple people waited on. Reassign is D7.
- Nothing is ever deleted; withdrawn and resolved requests stay as history (retention: D3).

### 3.5 Who may do what (v1 defaults — the spec is silent, see D4)
| Action | Requester | Waited-on member | Others | Admin |
|---|---|---|---|---|
| Create | ✓ (as themselves) | — | — | ✓ |
| Ping | ✓ (when allowed, §3.3) | — | — | — |
| Comment | ✓ | ✓ | ✓ (anyone can help) | ✓ |
| Resolve | ✓ (e.g. unblocked another way) | ✓ (main case) | — | ✓ |
| Withdraw | ✓ | — | — | ✓ |
| Reopen | ✓ (≤ 7 days) | — | — | ✓ |
| Change priority | ✓ | — | — | ✓ |

The server enforces this table (like `roles.ts` for boards) and refuses anything else with 403. **[A25]**

### 3.6 Header counts [S4]
| Count | Rule | Assumption |
|---|---|---|
| **Active members** | members whose availability is **Active** now (§4.2); Admin not counted | A26 |
| **Open blockers** | open requests with category **Critical Blocker**, **plus** any open request that is **escalated** (> 24 h), each request counted once | A27 |
| **Pending hand-offs** | open requests with category **Hand-off Ready** | — |

Each count is a button that filters the main feed to the requests behind it. An "as of" time shows that the data is
at most ~15 s old.

### 3.7 "Waiting on You" and the Blocked Work matrix [S5, S6]
**Waiting on You** lists the viewer's incoming open requests, sorted by severity (§3.3). Each row shows the
category icon + label, the priority (Urgent pill), the task title (link), who is waiting, the waiting time and the
"Seen" state. Actions: **Resolve** (with an optional note), **Open thread**. A small "You're waiting on (n)" line
under it opens the viewer's outgoing requests, with **Ping** / **Withdraw** / **Open thread**.

**Blocked Work matrix.** The spec names it but doesn't define its axes. **[A28]** It's read as **person × person**:

| | **waits on → Shikha** | **Sumit** | **Ashish** | … |
|---|---|---|---|---|
| **Shreya** | **2** ⛔ (1 critical, 1 escalated) | · | · | |
| **Arti** | · | **1** ◐ | · | |
| **Sumit** | 1 ⇄ | · | · | |

- A row is the member who is waiting, and a column is the member they wait on. Members with no open requests in
  either direction are hidden. With 7 members the matrix never needs paging.
- A cell shows the count of open requests and the icon and colour of the most severe one. Hovering shows the list;
  clicking filters "Waiting on You" to that pair (or opens a popup when the viewer isn't in the pair).
- Two summary edges: the row total ("Shreya is waiting on 2") and the column total ("4 people wait on Shikha"). A
  column total is the quickest answer to "who is the bottleneck".
- The other way to read the spec (rows = blocked **tasks**, columns = blocking tasks) needs task-to-task links, which
  nothing records. Not in v1; see D8.

### 3.8 Nudges, escalation and notifications
| Trigger | Who is told | In-app (v1) | Spec |
|---|---|---|---|
| Request created | waited-on member | **Badge** on their status card (count of incoming open requests) + a toast; an **Urgent** or **Critical** toast stays until it's closed | S15 |
| Ping | waited-on member | Toast "Gentle reminder from Shreya: R-0042 · waiting 4 h"; the ping is logged on the request | S16 |
| Resolved | requester | Toast "Shikha resolved R-0042 — you can resume" + the resolution note; the request flashes green in "You're waiting on" | S17 |
| Escalated (passes 24 h) | — | **Visual only**: red edge, "Open 1 d 2 h ▲", moved to the top. Also listed in the digest | S18 |
| Withdrawn | waited-on member | Quiet: the badge goes down; no toast | A29 |
| Comment | the other party (and anyone who commented before) | Badge on the request + a quiet toast | S25 |
| Reopened | waited-on member | Toast, as for "created" | A24 |

- **The badge [S15]** sits on the recipient's avatar on their status card, and on the recipient's own sidebar **"Progress tracker"** sub-item (under Reports). It shows the incoming open count, and turns red if any of those requests is critical,
  urgent or escalated.
- **Toasts** use the bottom-right queue pattern of `DayReminders.tsx` and pause while a dialog is open. A toast is
  shown once per member per notification (`readAt`).
- The **ping wording is fixed and polite** (S16 "polite"). The requester can't type a custom ping text; they can
  add a comment in the thread instead. **[A30]**
- **No automatic pings and no automatic messages on escalation in v1**: escalation only changes how the request
  looks [S18] and puts it in the digest [S26]. Email / WhatsApp is D5.

---

## 4. The status tracker [S1, S9, S19–S23]

### 4.1 What a card shows
```
 (avatar)  Shikha Dixit            ● Active · last seen 2 min ago       ← S9 avatar, S20 availability + timestamp
           Focus: Hotel certificates (R-0042)   set 09:15              ← S21 current focus
           ⇣ 2 waiting on her   ⇡ 1 she's waiting on                   ← S22 both directions (⇣ carries the S15 badge)
           Merged PR #12 "Reports drill-through" · 8 min ago           ← S23 micro-log line
```
- **Avatar:** the member's initials in their existing calendar colour (`personColour`). There's no photo upload in
  v1.
- **Clicking a card** opens the member's detail: today's standup, open requests in both directions, and their last
  20 activity events.

### 4.2 Availability — derived from coarse signals, never from monitoring [S19, S20]
| State | Rule (first match wins) |
|---|---|
| **Away** (manual) | The member set "Away" (optionally "until 14:00"); it wins over every signal |
| **Active** | A visible-tab heartbeat in the last 10 min **or** a tool event by them in the last 30 min **or** a standup / request action in the last 10 min |
| **Away** (automatic) | Otherwise — shown as "Away · last seen 2 h ago" |

- The spec gives two states, active and away, plus a last-seen time. "Offline" isn't a third state; a last-seen
  time like "yesterday 18:40" says it.
- **Last seen** = the latest of: the visible-tab heartbeat, a tool event, a standup or request action. Only that one
  timestamp is stored, in `ptPresence.lastSeenAt` — **no history of when someone was online** (§5.5).
- The **heartbeat** is sent only while the dashboard tab is **visible** (`document.visibilityState`), at most every
  2 min. It reuses the existing `SyncPanel` timer, which already calls `/api/zoho/sync` every 2 min, so it adds no
  new background activity.
- The member's own card has **"Set status"** (Active / Away / Away until …) and **"Set focus"**.

### 4.3 Current focus [S21]
Self-reported only. The card shows the most recent of:
1. "Set focus" on the member's own card (free text, may link a task), or
2. the **first "Today's focus" line** of today's standup.

If neither exists today, the card shows "No focus shared today" in a neutral grey (no shaming, §7.1).

### 4.4 Data sources
| Card element | Source | Stored in |
|---|---|---|
| Availability, last seen | Heartbeat (visible tab) · tool events · page actions · manual status | `ptPresence {_id: memberId, lastSeenAt, manual?: {state, until?, at}, focus?: {text, task?, at}}` |
| Current focus | Set focus · today's standup | `ptPresence.focus`, `ptStandups` |
| Requests both ways | `ptRequests` (open) | — |
| Micro-log line | The member's latest `ptActivity` event, else their latest request / standup action | — |

---

## 5. The webhook activity stream [S2, S8]

### 5.1 Pipeline
```
tool ──HTTPS POST──► /api/progress/hooks/[source]
                       1. read the raw body (request.text()) — needed for the signature
                       2. verify the signature / token for that source (§5.3) → 401 if wrong
                       3. dedupe by the source's delivery id (_id = source:deliveryId) → 200 if seen
                       4. normalise (sources/<source>.ts) → 0..n ActivityEvent (§5.2); unknown event types → dropped
                       5. map the actor to a member (ptIdentities) — unknown actor → kept as "external"
                       6. insert into ptActivity; update ptPresence.lastSeenAt for a mapped member
                       7. answer 200 quickly (tools retry on slow answers)
```
- **The raw payload is not stored** (§5.5). A rejected delivery is counted per source in kv
  `pt_hook_stats:<source>` (count, last error, last at) so Admin can see "GitHub: 3 refused today". **[A31]**
- Only **projects / repos / boards / files that Admin connects** send events (each tool's webhook is set up per
  project). Nothing is pulled from a tool on its own.

### 5.2 Normalised event (`ptActivity`)
| Field | Type | Notes |
|---|---|---|
| `_id` | `"<source>:<deliveryId>[:n]"` | Dedupe; `:n` when one delivery yields several events (e.g. a push with 3 commits → one event, see below) |
| `source` | `github \| gitlab \| jira \| linear \| trello \| figma \| notion \| gdocs \| vercel \| aws \| sentry` | S8 |
| `kind` | normalised verb (table below) | |
| `actorId` | memberId or `null` | via `ptIdentities` |
| `actorLabel` | the tool's display name / handle | shown when `actorId` is null |
| `subject` | `{title ≤ 140, url, project}` | e.g. PR title, issue key + title, file name |
| `milestone` | boolean | S2 "automated milestones", see the table below |
| `at` | ISO UTC | when it happened in the tool (not when it arrived) |
| `receivedAt` | ISO UTC | TTL index → retention (D3) |

**Normalised kinds** (one vocabulary for every tool; ★ = milestone [S2]; the milestone choice is **[A32]**, D10):

| Kind | Meaning | Typical sources |
|---|---|---|
| `code.pushed` | Commits pushed (one event per push, "3 commits to master") | GitHub, GitLab |
| `code.pr_opened` / `code.review_requested` / `code.reviewed` | Pull / merge request activity | GitHub, GitLab |
| ★ `code.merged` | PR / MR merged | GitHub, GitLab |
| ★ `code.released` | Release / tag published | GitHub, GitLab |
| `work.created` / `work.moved` | Issue / card created or moved between columns | Jira, Linear, Trello |
| ★ `work.done` | Issue / card reached a done state | Jira, Linear, Trello |
| `design.updated` / `design.commented` | Figma file version saved / comment added (no comment text) | Figma |
| ★ `design.published` | Library published | Figma |
| `doc.updated` | Page / doc edited | Notion, Google Docs |
| `deploy.started` / `deploy.failed` | Deployment began / failed | Vercel, AWS |
| ★ `deploy.succeeded` | **Production** deployment succeeded (previews aren't milestones) | Vercel, AWS |
| `incident.opened` | New issue / alert | Sentry, AWS |
| ★ `incident.resolved` | Issue resolved | Sentry |

### 5.3 Sources: how each one connects
Written from knowledge of these APIs as of 2026. **Check each provider's current webhook docs before building its
adapter** (header names and signature schemes change). **[A33]** One source per release (§10).

| Source | How events arrive | Verification | Dedupe id | Notes |
|---|---|---|---|---|
| **GitHub** | Repo / org webhook | `X-Hub-Signature-256` = HMAC-SHA256(secret, body) | `X-GitHub-Delivery` | Events: push, pull_request, pull_request_review, release |
| **GitLab** | Project / group webhook | `X-Gitlab-Token` = shared secret (compare in constant time) | event UUID header | Push, merge request, tag, release |
| **Jira** | Jira Cloud webhook (admin) | Secret → HMAC signature header (verify current scheme) | webhook id + timestamp | Issue created / updated (status → done = `work.done`) |
| **Linear** | Workspace webhook | `Linear-Signature` = HMAC-SHA256(secret, body); reject old `webhookTimestamp` | delivery header | Issue create / update |
| **Trello** | Webhook per board (created via API; Trello sends a HEAD check first) | `X-Trello-Webhook` = base64 HMAC-SHA1(secret, body + callback URL) | action id | createCard, updateCard (list moved), card into a "Done" list |
| **Figma** | Webhooks API (team / project / file) | `passcode` echoed in the body | webhook id + timestamp | FILE_VERSION_UPDATE, FILE_COMMENT, LIBRARY_PUBLISH |
| **Notion** | Integration webhook | Verification token at setup, then a signature header | event id | page.content_updated, page.created |
| **Google Docs** | No direct webhooks: Drive API push channels (`files.watch` / `changes.watch`) | Channel token header | message number | **Hardest**: channels expire and need renewing by a scheduled job, and the domain must be verified. Last in line |
| **Vercel** | Account / project webhook | `x-vercel-signature` = HMAC-SHA1(secret, body) | event id | deployment.created / succeeded / error; production only = milestone |
| **AWS** | EventBridge rule → API destination (HTTP) or SNS HTTPS subscription | API-destination auth header, or SNS message signature + subscription confirm | event id / MessageId | Deploy (CodeDeploy / CodePipeline), CloudWatch alarms |
| **Sentry** | Integration (internal) webhooks | `Sentry-Hook-Signature` = HMAC-SHA256(client secret, body) | `Request-ID` | issue created / resolved |

- **Secrets** are typed once by Admin into a "Connect <tool>" popup, as with Zoho Analytics, and kept in kv
  `pt_hook:<source>`. They're **never returned to the browser** and never committed (the repo is public).
- **Identity mapping** (`ptIdentities`): Admin links each member to their handle per tool (GitHub login, Jira
  account id, Linear user id, Figma handle, Google email…). Until a handle is linked, that member's events show as
  "external" and don't move their last-seen time.

### 5.4 How the stream shows
- In the Activity section: **[Standups] [Tool activity] [Everything]** tabs. Events are grouped by day, newest first,
  and a run of `code.pushed` events from one person within 30 minutes is folded into one line.
- **★ Milestones** are shown bold, and the toggle "Only milestones" answers Q2 at a glance.
- Every event links to the tool. "Make a request about this" creates an `external` task (§3.2).

### 5.5 Privacy stance [S19]
The tracker shows **work that people already share with the team in their tools, plus what they choose to say about
themselves**. It is not a monitoring tool.

| We do | We never do |
|---|---|
| Record finished, team-visible work events from tools Admin connected (PR merged, card moved, deploy) | Track keystrokes, mouse, screenshots, open apps, URLs visited, or "idle" time |
| Keep **one** last-seen timestamp per member | Keep a timeline of when someone was online, or count hours |
| Store a title and link per event | Store code, diffs, document contents, comment text or raw webhook payloads |
| Let members set their own status, focus and "Away" | Score, rank or compare people by activity; no "most active" lists, no per-person activity counts in the digest |
| Show everyone the same view, including about themselves | Give anyone a hidden view of others |
| Expire activity events after 90 days (D3) | Keep presence history at all |

- **"What's recorded about me"** (on your own card): your presence document, your linked handles, and your activity
  events, with a link to ask Admin to unlink a handle.
- **Evenings and Sundays:** nothing changes in how data is gathered. The page simply shows "Away · last seen
  yesterday 18:40". The digest never mentions who was or wasn't online.
- Whether members can hide their last-seen time is D6.

---

## 6. The daily async check-in [S7, S24]

### 6.1 Fixed format
| Section | Content | Rules |
|---|---|---|
| **Completed** | What you finished since your last check-in | 0–10 lines; each line may link a task, a request or an activity event |
| **Today's focus** | What you'll work on today | 1–5 lines; the first line becomes your **current focus** (§4.3) |
| **Blockers & dependencies** | What's in your way | Each line **must** either reference a request (`R-0042`, auto-linked) **or** tick "Make this a request", which opens the request form prefilled (category, waited-on member) |

The rule that every blocker line links a request is how S24's "with request references" is enforced.

### 6.2 Rules
- **One check-in per member per team-time-zone day** (`_id` = `memberId:YYYY-MM-DD`). It can be edited until
  midnight and shows "edited 11:02" when changed. **[A34]**
- **Prefill** (the member can change all of it):
  - Completed ← yesterday's "Today's focus" lines, the requests they resolved since their last check-in, and their
    own ★ milestones since then.
  - Blockers ← their open outgoing requests.
- **No deadline and no reminders in v1.** A member without a check-in shows "No update yet" in grey. A reminder time
  is D11. **[A35]**
- Every check-in has its own **thread** [S25] (§7.1).

### 6.3 How it reads in the feed
```
Sumit A Shah · 09:12
✓ Completed   · Reports: bigger text (PR #31 ★ merged) · Resolved R-0039 for Shikha
→ Today       · Drill-through in Reports · Check the AED reminders
⛔ Blockers   · Waiting on Shikha for the client's number — R-0042 (Critical · 26 h ▲)
💬 2 replies
```

---

## 7. Operational guidelines

### 7.1 Working agreements (shown once as a "How we use this" card, and in this document)
1. **Discussion lives in threads** [S25]: every request and every check-in has a thread. Reply there rather than in
   chat, so the context stays with the work. Threads are plain text, no attachments in v1. **[A36]**
2. **Pick the right category** (§3.1). Use **Critical Blocker** only when your work has stopped; **Urgent** is for
   time pressure, not importance.
3. **Resolve with a short note** so the requester knows what changed. Resolving tells them to resume [S17].
4. **Ping politely, not often.** The button unlocks every 4 h [S16]; past that, use the thread.
5. **Post your check-in at the start of your day** (when exactly is D11).
6. Absence is normal: set **Away** when you're out. Nobody is judged by activity counts (§5.5).

### 7.2 The evening digest [S26]
- **When:** 18:00 team time (D1), Monday–Saturday, the team's working days (Zoho syncs follow the same days). Whether
  to send one on Sunday is D12. **[A37]**
- **What:**
  1. **Accomplishments today:** each member's check-in "Completed" lines, requests resolved today (who unblocked
     whom), and ★ milestones (merges, production deploys, issues done).
  2. **Unresolved blockers:** every open Critical Blocker and every escalated request, oldest first, with ref,
     waiting time, and who waits on whom. Then the other open requests as a count per category.
  3. **Tomorrow's carry-over:** check-in blocker lines not yet resolved.
  4. One line of counts: "3 resolved · 2 new · 1 escalated". **No per-person activity numbers** (§5.5).
- **Where:** posted in the Activity feed as a **"Progress bot"** item with its own thread (v1). Email or WhatsApp is
  D5.
- **How it runs:** `GET /api/cron/digest` with `CRON_SECRET`, under a Mongo lease lock. The digest is stored as
  `ptDigests {_id: "YYYY-MM-DD"}`, so a second trigger the same day does nothing (idempotent).
  - **Timing caveat:** Vercel Hobby crons are daily only and fire **anywhere within the hour** (HANDOFF §2), so
    `30 12 * * *` UTC gives 18:00–18:59 IST.
  - To hit 18:00 exactly, add a GitHub Actions schedule. That needs the **`CRON_SECRET` repo secret**, still
    missing (HANDOFF §10 #11). See D13.
  - **Fallback:** the first page heartbeat after 18:00 builds it (like the Zoho heartbeat sync).
- **Like all sending code**, any email / WhatsApp delivery runs **only in production** (`VERCEL_ENV`); tests go only
  to the owner (HANDOFF §11 #5).

### 7.3 Admin tasks
Connect tools (per source), link member handles, see webhook stats, and withdraw / resolve any request (§3.5).
Admin is never counted in "Active members" [A26].

---

## 8. Open decisions (recommended default first)
| # | Decision | Recommended default | Other options |
|---|---|---|---|
| **D1** | **Time zone handling** | One team zone, `Asia/Kolkata`: "today", the 18:00 digest and every timestamp use IST; stored in UTC | Per-member zone (each member's "today", digest per zone) — only if someone works from abroad |
| **D2** | Does waiting time count nights / Sundays? | **Wall-clock** (simple, matches "24 h" literally) | Working hours only (Mon–Sat 9:00–19:00 IST, as the Zoho sync hours) for ping and escalation |
| **D3** | **Retention of activity logs** | Tool events 90 days (TTL); requests, check-ins, threads and digests kept indefinitely; no presence history at all | 30 / 180 days; archive requests after 1 year |
| **D4** | **Who can resolve a request** | Waited-on member **or** requester, plus Admin (§3.5) | Waited-on member only (requester can only withdraw); anyone |
| **D5** | Notification channels beyond in-app | In-app only in v1 | Email for Critical / Urgent and the digest (needs a sending mailbox: learn@ / hello@ are customer-facing — a separate internal one is better); WhatsApp (new Meta-approved templates, Anantya) |
| **D6** | Can members hide their last-seen time? | No; everyone sees the same coarse "last seen" (keeps Q1 answerable) | Yes, per member ("Active / Away" only) |
| **D7** | Reassign a request to another member | Not in v1 (withdraw + new request) | Waited-on member can hand it on, logged |
| **D8** | Task-to-task dependencies (a task blocked by another task) | Not in v1; the matrix is person × person | Add `blockedBy` task links later (needs a task store) |
| **D9** | Who sees the page (it sits under Reports, which is Training-board members only today) | Every signed-in member, same view. Priyanka, Arti and Shreya get the Reports section with **only** Progress tracker in it (the dashboards stay hidden and refused) | Only members who already see Reports (then Priyanka, Arti and Shreya can't make or answer requests); or a separate top-level nav item instead |
| **D10** | Which events are milestones | The ★ list in §5.2 | Per-project choice by Admin |
| **D11** | Check-in reminder | None in v1 | A toast at 10:30 IST if no check-in yet |
| **D12** | Sunday digest | No (Mon–Sat) | Every day; skip days with nothing to report |
| **D13** | Exact 18:00 for the digest | Accept 18:00–18:59 from Vercel Hobby + heartbeat fallback | GitHub Actions schedule (add the `CRON_SECRET` repo secret) or Vercel Pro |
| **D14** | Which tools to connect first | **GitHub + Vercel** (already used for this dashboard) | The others when the team actually uses them |
| **D15** | **Zoho Sprints** (the owner reports status there) isn't in the spec's tool list | Leave out of v1 | Add an adapter later if Zoho Sprints webhooks fit `work.*` |
| **D16** | Should the Follow-ups boards' own actions (Training completed, Certificates Generated, Shipped…) feed the activity stream? | Not in v1 (not in the spec) | Yes, as an internal source `board` — this team's richest progress signal; read from `cardEvents`, no webhook needed |

---

## 9. Assumptions register
| # | Assumption | Where |
|---|---|---|
| A1 | The spec's "sidebar" is a right-hand panel inside the page; the app's left nav stays. The page sits under Reports (owner) as a sub-item + tab, at `/reports/progress-tracker` | §0.3 |
| A2 | Users = existing members + Admin; every signed-in member uses the page | §0.3 |
| A3 | "Live" = 15 s polling (no sockets on Vercel serverless) | §0.3, §2 |
| A4 | Fits 1728×958 with no page scroll; columns scroll, hidden scrollbars | §1.1 |
| A5 | Main feed ≈ 2/3 width, sidebar ≈ 1/3 (≥ 360 px) | §1.1 |
| A6 | Dependency board grows with its open requests up to 60 % of the main feed's height | §1.1 |
| A7 | Phone order: counts → Waiting on You → actions → status → matrix → activity | §1.1 |
| A8 | Server stamps the member on every write; the browser never sends who | §1.3 |
| A9 | Team time zone `Asia/Kolkata` | §2 |
| A10 | Active = visible-tab heartbeat ≤ 10 min, tool event ≤ 30 min, or page action ≤ 10 min | §2, §4.2 |
| A11 | Activity events kept 90 days | §2 |
| A12 | The four categories are fixed in code | §3.1 |
| A13 | Each category's meaning, blocked-or-not, and what "resolve" means | §3.1 |
| A14 | Readable refs `R-0001…` from a counter | §3.2 |
| A15 | Default priority Normal | §3.2 |
| A16 | One waited-on member per request | §3.2 |
| A17 | A request carries an optional note (≤ 1,000 chars) | §3.2 |
| A18 | "Seen" is recorded the first time the recipient opens a request | §3.2 |
| A19 | Requester can withdraw | §3.2, §3.4 |
| A20 | "Task card" = a board card, an external item, a check-in blocker line, or a typed title | §3.2 |
| A21 | Board-card links follow existing board permissions | §3.2 |
| A22 | Comments: author edits / deletes; deleted shows "removed" | §3.2 |
| A23 | Waiting time is wall-clock | §3.3 |
| A24 | Reopen within 7 days restarts the clock | §3.4 |
| A25 | The permission table in §3.5, enforced on the server | §3.5 |
| A26 | Admin isn't counted as an active member | §3.6 |
| A27 | "Open blockers" = open Critical Blockers + any escalated request | §3.6 |
| A28 | The Blocked Work matrix is person × person | §3.7 |
| A29 | Withdrawal is quiet (badge only) | §3.8 |
| A30 | The ping text is fixed and polite | §3.8 |
| A31 | Raw webhook payloads aren't stored; rejected deliveries are counted | §5.1 |
| A32 | The milestone set in §5.2 | §5.2 |
| A33 | Webhook header / signature details need checking against current provider docs | §5.3 |
| A34 | One check-in per member per day, editable until midnight | §6.2 |
| A35 | No check-in deadline or reminder in v1 | §6.2 |
| A36 | Threads are plain text, no attachments | §7.1 |
| A37 | Digest Mon–Sat | §7.2 |
| A38 | A check-in blocker links a request **or** is marked "outside the team" (customer / supplier) — added while building, 26 Oct | §6.1 |

---

## 10. Build order (one release per idea, HANDOFF §11)
Each phase is restated with the owner before building, tried on localhost, and pushed only when asked. Note that
the local server shares the **live** database, so a request made on localhost is a real request.

| Phase | What ships | Spec covered | Depends on |
|---|---|---|---|
| **P1** | Page at `/reports/progress-tracker` + the Reports sub-item / tab (and the Reports section for every member per D9); requests (create from the hub and from board cards, ping, resolve, withdraw, reopen); "Waiting on You"; matrix; header counts; status cards (manual status, focus, heartbeat last-seen); badge + toasts | S3–S6, S9–S18, S20–S22 | D4, D9 |
| **P2** | Check-ins (format, prefill, request refs); threads on requests and check-ins; focus from check-in | S7, S21, S24, S25 | D11 |
| **P3** | Evening digest (feed item; delivery per D5) | S26 | D1, D5, D12, D13 |
| **P4** | Webhook framework + **GitHub** + **Vercel**; identity mapping; milestones; micro-log line; privacy panel | S2, S8, S19, S23 | D3, D10, D14 |
| **P5+** | One adapter per release: GitLab, Linear, Jira, Trello, Sentry, Figma, Notion, AWS, Google Docs (last) | S8 | A33 check per source |

**Checks before each push** (HANDOFF §11 #13–#17): `tsc` + `next build`; a secret scan (webhook secrets live only
in kv); a read-only browser run at 1728×958 and 390 px that **aborts every non-GET `/api/progress*`**; and webhook
adapters tested with **recorded sample payloads in the scratchpad** against a pure `normalise()` — never by posting
to the live hook URL.

---

## 11. Traceability (spec → where it's designed)
| Spec | Sections |
|---|---|
| S1 | §0.1, §4 |
| S2 | §0.1, §5.2 (★ milestones), §5.4 |
| S3 | §0.1, §3 |
| S4 | §1.1, §3.6 |
| S5 | §1.2, §3.7 |
| S6 | §3.7 |
| S7 | §1.2, §6 |
| S8 | §5.1–§5.3 |
| S9 | §1.1, §4.1 |
| S10 | §1.2, §3.2 (`free` task), §6 |
| S11 | §3.1 |
| S12 | §3.2, §3.3 |
| S13 | §3.2 (`TaskRef`) |
| S14 | §3.2, §3.3 (severity) |
| S15 | §3.8 (badge) |
| S16 | §2, §3.3, §3.8 |
| S17 | §3.4, §3.8 |
| S18 | §2, §3.3, §3.8 |
| S19 | §4.2, §5.5 |
| S20 | §4.2 |
| S21 | §4.3 |
| S22 | §4.1 |
| S23 | §4.1, §4.4 |
| S24 | §6 |
| S25 | §3.2 (`ptComments`), §6.2, §7.1 |
| S26 | §7.2 |
