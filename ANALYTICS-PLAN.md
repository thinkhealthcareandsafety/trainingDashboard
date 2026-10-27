# Analytics plan — reports and interactive dashboards inside the Training Dashboard

_Written 22 Oct 2026 for the owner (sshah@thinkhealth.in) and the Claude Code sessions that will build it. Read with
HANDOFF.md and MONDAY-PLAN.md. Every phase waits for the owner's go-ahead, and each one is restated with questions +
recommended defaults before building (the owner's usual "yeah" = all defaults)._

**Status (26 Oct):** §10 defaults accepted ("yeah", 22 Oct). **Phase 1 is live** (`5b623b7` … `b88fb24`): Sales,
Trainings and Quotes dashboards, filters, click-to-filter, same-days comparison, table / CSV, builder, saved reports —
data from the Zoho Analytics copy of all of Books (part of Phase 1b already: 8 tables in `za_tables`). Next: Phase 2
(owner's go-ahead pending) and the rest of 1b (purchases, expenses, stock — HANDOFF §10 #105–#107). How it's built:
HANDOFF.md §3 "Reports + Zoho Analytics".

**Session 15 (27 Oct) — advanced Reports, all defaults accepted ("yessir"):** see §11 for the 27 report ideas and the
build order. Built locally, not pushed yet: (a) ₹50 L goal meter, (b) less congested layout, (c) more KPIs,
(d) compare / filters / views / "Change this chart" / what-if, (e) first batch of reports (Growth, Team & pipeline,
Collections tabs). Left: the rest of the ✅ reports, then (f) "My dashboard".

---

## 0. In one page

**Goal:** a **Reports** page (sidebar, under Calendar) where the team makes its own reports and **interactive
dashboards** — everything people use Power BI and Tableau for — on the dashboard's own live data, in its own look and
themes, with no extra licences. Then go further than they do where they are weak.

**Why build it rather than buy it** (checked 22 Oct, see §9 sources):
- **Power BI**: private embedding needs a Pro licence for authors plus a capacity billed by the hour (from ~$1/hour);
  "Publish to web" is public to anyone with the link. No official connector from Zoho Analytics.
- **Tableau**: a Creator ($75/month) + a Viewer seat ($15/month) per person, or an unpublished "embedded" price;
  Tableau Public is public. No direct Zoho Analytics link — a paid go-between copies the data.
- **Zoho Analytics**: the owner's reports and dashboards "look really terrible", and it only sees Zoho data.
- **Ours**: already has the data live (Zoho Books copy + everything the boards record that Zoho never sees —
  trainings completed, people trained, trainers, certificates, reminders, stages), already has sign-in and roles, and
  already has a look the team likes. What's missing is the report builder and the dashboard canvas.

**The rule that keeps the numbers right:** nobody writes queries. All data goes through one **semantic layer** (§3) —
a fixed list of datasets, fields and measures defined once in code and checked against Zoho and the Overview. Every
report, dashboard, tile and AI answer is built from it, so two charts of "revenue" can never disagree.

**Order** (each phase is usable on its own; §6 has the detail):

| Phase | What the team gets | Size |
|---|---|---|
| 1 | Semantic layer + **report builder** + one live dashboard with filters and click-to-filter | 2–3 sessions |
| 1b | **Whole of Zoho Books** (all sales, purchases, expenses, stock, accounts) read from the **Zoho Analytics tables** + the owner's 28 query tables rebuilt (§2b) | 1–2 sessions |
| 2 | **Dashboard canvas**: drag / resize, many dashboards, drill-down / drill-through, tooltips, tables with totals, export | 2–3 sessions |
| 3 | **Insights**: compare periods, targets, forecasts, anomalies, "why did this change", annotations | 2 sessions |
| 4 | **Alerts & subscriptions**: WhatsApp / email when a number crosses a line; scheduled digests | 1–2 sessions |
| 5 | **Ask in plain words** (Claude): question → chart; written summaries of a dashboard | 1–2 sessions |
| 6 | **More data**: Zoho Analytics tables, Zoho Sheets, CSV uploads, expenses → profit per training | 2 sessions |
| 7 | **Polish**: phone layouts, version history, usage, speed, print / PDF | ongoing |

---

## 1. What Power BI and Tableau do — and what we do with each

Grouped by what a user is trying to do. "Ours" says how we cover it and in which phase (P1…P7). "Skip" = deliberately
not built (§7 says why).

### 1.1 Getting data in and shaping it

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Connectors to many sources | 100s (Power Query) | 100s | **Zoho Books + boards built in (P1)**; Zoho Analytics tables, Zoho Sheets, CSV/Excel upload (P6). Only what we need — each source checked once. |
| Data prep (clean, rename, split, merge, pivot) | Power Query (M language) | Tableau Prep (separate app) | **Done once in code inside the semantic layer** (P1); for uploads, a small guided "clean this column" step (P6). Nobody learns M or Prep. |
| Data model / relationships | Model view, star schema, relationships | Relationships, joins, blending | **Pre-joined datasets** (training ↔ PI ↔ invoice ↔ payment ↔ customer already linked by the boards' merges) (P1). Users never draw joins. |
| Scheduled refresh / gateways | 8 refreshes/day on Pro; on-prem gateway | Extract refresh schedules | **Always live** — reads the same copy the boards read, refreshed by the hourly Zoho sync + every team change within seconds (P1). |
| Incremental refresh, large data | Premium feature | Extracts / Hyper | Not needed at our size (~5k customers, ~200 documents a year). Cache per data version (§4.5). |
| Live vs import | DirectQuery vs Import | Live vs Extract | Always "live" from our copy; no choice to make. |

### 1.2 Calculations

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Measures | DAX (steep learning curve) | Calculated fields | **Ready-made measures** (revenue, trainings, people, average deal size, days to pay, conversion…) (P1); **simple formula field** with a guided editor (`Revenue ÷ Trainings`, `People × 450`) and plain-English names (P3). |
| Level-of-detail / table calcs | DAX CALCULATE, iterators | LOD expressions, table calcs | **Common ones as buttons**: % of total, running total, rank, change vs previous period, moving average, share of customer (P2–P3). No LOD syntax to learn. |
| Time intelligence | DAX time functions | Date functions | **Built in**: Indian fiscal year (Apr–Mar), month / quarter / FY, "same days last month" (as the Overview), YTD, last 12 months (P1). |
| What-if parameters | What-if parameters | Parameters | **Scenario slider** on a dashboard ("price per head +10 %", "2 more trainings a month") feeding a measure (P3). |
| Groups / bins / sets | Groups, bins | Groups, sets, bins | **Group values** (e.g. hotel chains, cities into regions) and **bins** (deal size bands) saved on the field (P3). |
| Field parameters / calculation groups | Yes | Parameters | **"Measure switch"** chip on a chart (Revenue ⇄ Trainings ⇄ People), like the Overview's switch (P2). |

### 1.3 Building visuals

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Drag-and-drop builder | Fields pane, wells | VizQL shelves, Show Me | **Three questions** — *what data → what to measure → split by* — then a suggested chart (like Show Me) you can switch (P1). |
| Chart types | ~30 + custom visuals marketplace | ~24 + extensions | **Bar, column, stacked, line, area, combo (bar + line), pie / donut, table, matrix (pivot), KPI tile, gauge / bullet vs target, funnel, scatter, heat-map calendar, map of India** (P1–P3). No marketplace (§7). |
| Maps | Map, filled map, Azure maps | Strong geo | **India map by state / city** from the customers' addresses (P3). |
| Formatting | Many format panes, tedious | Many menus, tedious | **Good by default**: the dashboard's colours, fonts, number format (₹, lakh / crore, %), light / dark / every theme — automatically (P1). A short "Format" panel for title, colours, labels, sort, axis (P2). |
| Conditional formatting | Rules, colour scales, icons | Colour by measure | Table / matrix cells coloured by rule (overdue red, above target green), data bars (P2). |
| Tooltips | Report-page tooltips | Viz in tooltip | **Rich hover card**: the numbers + a mini trend + the top documents behind the point (P2). |
| Small multiples | Yes | Trellis | One chart per trainer / per customer type, same scale (P3). |
| Reference lines / targets / bands | Analytics pane | Reference lines | Target line (10 trainings / ₹ target), average, last year — one click (P2). |

### 1.4 Dashboards and interaction

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Canvas layout | Fixed pages, separate phone layout | Fixed / automatic sizes, device designer | **Responsive grid**: drag to place, drag a corner to resize; fits the owner's 1728×958 without scrolling when it can; **phones stack automatically** — no second layout to maintain (P2). |
| Slicers / filters | Slicers, filter pane | Filters, quick filters | **Filter bar** at the top (date range, customer, sales person, trainer, training type, sector, city) applied to every chart (P1). |
| Cross-filter / highlight | Click a visual filters others | Filter / highlight actions | **Click any bar, slice, row or map area → every chart filters** to it; chips show what's active; one "Clear" (P1). |
| Drill-down | Hierarchies | Hierarchies | **FY → quarter → month → day**, **sector → customer → document** (P2). |
| Drill-through | Drill-through pages | Actions | **"Show the documents"** under any point → the list of PIs / invoices / trainings → **opens the card on its board** (P2). That's something neither tool can do: jump into the work itself. |
| Bookmarks / stories | Bookmarks, buttons | Stories | **Saved views** (filters + selections) with a name; "story" mode = a few saved views in order with a note each — for the monthly review with the boss (P3). |
| Tabs / multi-page | Pages | Dashboards / sheets | **Several dashboards**, each a page in Reports; tabs inside a dashboard (P2). |
| URL / parameter actions | Limited | URL / parameter / set actions | Click a customer → opens their card; click a trainer → their calendar (P2). |

### 1.5 Sharing, security and governance

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Sharing | Workspaces, apps — Pro per viewer | Projects — seat per viewer | **Everyone on the team, no licences**: a dashboard is private, shared with named people, or the whole team (P1–P2). |
| Row-level security | RLS roles in DAX | User filters | **The board rules already in `roles.ts`**: Priyanka sees AED only, Arti Logistics only, Shreya Fulfillment only; money hidden from anyone without the Training board (P1). Enforced on the server, not in the chart. |
| Embedding | Embedded capacity, tokens | Embedded licences | Not needed — it *is* the website. A **read-only link** for the boss (PIN or expiry) later if asked (P7). |
| Comments | Comments on visuals | Comments | **Comments pinned to a point** ("Sept dip = monsoon closures") visible to everyone, also shown on the chart as a marker (P3). |
| Version history | Weak (binary .pbix files) | Revision history (Server) | **Every save is a version**; undo / restore like the board's change log (P7). |
| Certified / endorsed content | Endorsement | Certified data sources | **"Official" badge** on the starter dashboards (Admin only), so team-made ones are clearly unofficial (P2). |
| Lineage / usage metrics | Lineage view, usage reports | Admin insights | **"Where does this number come from?"** on every measure (plain-English definition + the Zoho fields) (P1); who opened what (P7). |
| Export | Excel, PDF, PowerPoint | Image, PDF, crosstab | **CSV / Excel of any chart's data, PNG of a chart, PDF of a dashboard** (P2); print-friendly (P7). |

### 1.6 AI and insight

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Natural-language Q&A | Q&A, Copilot (needs paid Fabric capacity) | Ask Data (retired) → Tableau Agent / Pulse | **Ask in plain words** — Claude turns "revenue by sector this FY vs last" into a report built **only from the semantic layer** (so it can't invent fields), shows the chart and how it read the question (P5). |
| Auto narratives | Smart narrative | Pulse summaries | **"Summarise this dashboard"** — a short paragraph in the team's wording, copy-ready for WhatsApp / the boss (P5). |
| Key influencers / explain | Key influencers, decomposition tree | Explain Data (retired) | **"Why did this change?"** — splits a change (e.g. revenue −35 % vs last month) by customer, sector, sales person, training type and lists the biggest contributors (P3). |
| Forecasting | Line-chart forecast | Forecast | **Already started**: the Overview's forecast (booked + last year × growth). Offer it on any monthly measure, with the method shown (P3). |
| Anomaly detection | Anomalies on line charts | — | **Flag unusual months** (well outside the usual range) with a dot and why (P3). |
| Metrics / goals / scorecards | Metrics (Goals) | Pulse metrics | **Targets** on any measure (the team's 10 trainings / 300 people a month, Priyanka's 5 AED trainings) with progress tiles — same targets as the Overview (P3). |

### 1.7 Alerts, subscriptions, mobile

| Capability | Power BI | Tableau | Ours |
|---|---|---|---|
| Data alerts | On dashboard tiles | Data-driven alerts | **Alert on any tile** ("overdue > ₹2L", "fewer than 5 trainings booked for next month") → **WhatsApp** (Anantya, already set up) or email, to one owner — not a broadcast (P4). |
| Subscriptions | Email snapshots | Email subscriptions | **Weekly / monthly digest** of a dashboard: image + numbers + the AI summary, by WhatsApp or email (P4). |
| Mobile apps | Apps, separate layout | App, device layouts | **The website on the phone**: charts stack, filters in a drawer, tap = hover (P2, P7). No app to install. |

---

## 2. Their weak points — and how we avoid them

| Their problem | Where | How we fix it |
|---|---|---|
| **Licences per person**, expensive at small scale | Both | No licences at all; the whole team, the boss read-only. |
| **Steep learning curve** (DAX, M, LOD, table calcs) | Both | Three questions to a chart; ready-made measures; % / rank / running total as buttons; plain-English formula editor. |
| **Numbers disagree between reports** (everyone builds their own measure) | Both | One semantic layer; every report reuses the same measure; "where does this come from" on each. |
| **Data goes stale** (refresh schedules, failed gateways) | Both | Always live; the Sync log already shows when Zoho was last read. |
| **Separate desktop app** for full authoring (Windows-only for Power BI) | Both | Everything in the browser, any computer. |
| **Fixed layouts**, separate phone layouts to keep in sync | Both | Responsive grid; phones stack automatically. |
| **Formatting is tedious**; defaults look plain | Both | Good by default in the dashboard's design and themes; ₹ and lakh / crore built in. |
| **"Publish to web" leaks data**; secure embedding costs extra | Both | It's the website itself, behind the sign-in and the board roles. |
| **Analysis is cut off from the work** — see a number, then go find the documents elsewhere | Both | Every number drills to its documents and **opens the card on the board**; alerts land with the person who acts. |
| **AI features need premium capacity** (Copilot on Fabric F64; Tableau Pulse / Agent tiers) | Both | Claude via API, pay per question (pennies), limited to the semantic layer so it can't make numbers up. |
| **AI answers you can't check** | Both | Every AI chart shows the report it built (data, measure, split, filters) — editable like any report. |
| **Version control is poor** (binary .pbix) | Power BI | Every save is a version with who / when; restore in one click. |
| **Slow dashboards** on big models | Both | Our data is small; server-side aggregation + cache per data version → aim for < 300 ms per chart. |
| **No Indian fiscal year / number style out of the box** | Both | FY Apr–Mar, ₹, lakh / crore, IST everywhere by default. |
| **Can't write back** (a dashboard is read-only; actions happen elsewhere) | Both | Drill-through opens the real card — merge, schedule, mark paid right there. |
| **No knowledge of our business** (trainings, certificates, renewals, stages) | Both | First-class datasets for trainings, people trained, certificates, renewals, deal stages, reminders. |

---

## 2b. Data inventory — everything there is to analyse

### 2b.1 Zoho Books (checked 22 Oct through the Zoho Books connector, read-only)
- **Organisation:** Think Health Care and Safety, India / GST, INR, fiscal year **April–March**, on **Zoho One
  (Enterprise)** — so **Zoho Analytics is included** in the plan. Connected apps: **Books, Expense, Inventory,
  Commerce (store)**. Locations enabled (one location so far). No custom modules.
- **What the dashboard copies today** (`zohoSync.ts`): only documents with the **tracked training items** (quotes, PIs,
  invoices since the previous FY start) + **AED invoices since 1 Sept 2026** + their payments + all customers + items +
  users. **Everything else in Books is not copied yet** — the analytics need a wider copy (§6 Phase 1b).

| Books module | Used by the business? | In the dashboard's copy today? | For analytics |
|---|---|---|---|
| Customers (contacts) | yes (~4,000) | yes, all | Customers dataset |
| Vendors | yes (POs to N.S Stationers, Mediline Surgicals, Dhwani Systems, ABM Corp, Yash Marketing…) | **no** | Purchases, supplier spend |
| Quotes (estimates) | yes | training ones only | **all quotes**: pipeline, conversion, lead source, product type |
| Sales orders (= PIs) | yes | training ones only | **all PIs** |
| Invoices | yes | training + AED only | **all invoices**: revenue by product type / business type / lead source |
| Payments received | yes | for copied invoices only | **all payments**, days to pay, TDS |
| Credit notes / sales returns | to confirm | no | net revenue |
| Purchase orders | **yes, daily** (PO-00559 on 22 Oct) | **no** | purchases, cost per product, margin |
| Bills + vendor payments | likely (POs are "billed") | no | cost, payables |
| Expenses (+ Zoho Expense) | some (Zoho Payments fees, petty cash) | no | overheads, trainer travel → profit per training |
| Items + stock (Inventory) | yes (SKUs on, stock status field) | items only, no stock | stock, sell-through, reorder |
| Chart of accounts (incl. Cost of Goods Sold, Subcontractor, Travel, Lodging, Freight-related) | yes | no | P&L by account, gross margin |
| Zoho Commerce orders | to confirm | no | online sales (Amazon / BuyAEDINDIA leads are tagged) |
| Recurring invoices, retainers, journals, bank transactions, projects / timesheets | to confirm | no | only if used |

**Custom fields that matter for analysis** (active ones; none are used by the dashboard yet except where noted):

| Record | Field (API name) | Values / use |
|---|---|---|
| Customer | Type (`cf_type`) — *used* | New / Old Customer, New / Old Reseller, New / Old Vendor |
| Customer | Sector (`cf_sector`) — *used* | 19 sectors (Tourism & Hospitality, IT, Manufacturing, Aviation, School & College, …) |
| Customer | **Special Identifier** (`cf_special_identifier`) | **Chain**: Marriott Hotels, Lemon Tree, Hyatt Hotels, Medic Assist → revenue per hotel chain |
| Customer | Accounts Email Id (`cf_accounts_email_id`) | for collections |
| Quote | **Product Type** (`cf_category`) | AED, Battery, Pads, Training, First Aid / CPR Training, AED Cabinet, Trauma Kit, Fire Safety, 5SU, … |
| Quote | **Lead Source** (`cf_lead_source`) | Indiamart, BuyAEDINDIA, Direct, Social Media, Events, Reference, Amazon |
| Quote | Deal Name (`cf_deal_name`), Send to CRM, Reminder Frequency / Date | deal labels; follow-up discipline |
| PI (sales order) | **Trainer Name** (`cf_trainer_name`), **Training Date** (`cf_training_date`) | cross-check with the board |
| PI | Lead Source (`cf_lead_source1`), Business Type (Products / Services / Both), Product Type (`cf_productt_type`) | as quotes |
| PI | Purchase Order Number / Date (customer's PO) | "Verbal" vs written PO |
| Invoice | **Product Type** (`cf_product_type`, multi), **Business Types** (multi: Products / Services / Training) | revenue mix |
| Invoice | **Lead Source** (`cf_lead_source`) | revenue by channel |
| Invoice | Trainer Name, Training Date, Certificate Expiry | older trainings (before the board) — renewals back-fill |
| Invoice | **Freight Incurred** (`cf_freight_incurred`, amount), **Shipped by** (courier), Tracking Details | shipping cost per order, courier performance |
| Invoice | Last Reminder Sent Date | collections follow-up |
| Item | **Item Identifier** (`cf_item_identifier`) — *used* | All AEDs, AED Batteries / Pads / Cabinet / Accessories, Trauma, Fire / Road / Pool Safety, PPE, Training Services, … |
| Item | Stock Status, Offer Price | stock and pricing |
| Purchase order | Payment Terms, Delivery Timeline | supplier terms |

Spellings differ between records (e.g. "Training " with a trailing space, " CPR Training" with a leading one, three
"Lead Source" fields) — the semantic layer cleans them into one list each.

### 2b.2 Zoho Analytics (read 22 Oct — connected by Admin, read-only)
Full column-by-column reference: **[ANALYTICS-SCHEMA.md](ANALYTICS-SCHEMA.md)** (metadata only, no data).
- **Connection:** Admin → sidebar → **Zoho Analytics** (`src/components/AnalyticsConnect.tsx`, route
  `/api/zoho-analytics`, `src/lib/zohoAnalytics.ts`; kv `zoho_analytics:workspace` — refresh token, never shown).
  Scopes `ZohoAnalytics.metadata.read,ZohoAnalytics.data.read`. Organisation *thinkhealthcareandsafety*, workspace
  `421000000000021002`. Zoho rate-limits bursts (≈50 quick calls → "exceeded the allowed limits"): pace calls, cache.
- **475 items:** 110 tables · 28 query tables · 85 pivots · 224 charts · 18 dashboards · 4 summary views · 6 reports.
- **Tables = the whole of Zoho Books + Inventory + Commerce**, already synced by Zoho (data since 2021; dashboards are
  titled "2021–2027"). 84 hold data, e.g. Invoices 1,790 · Invoice Items 3,632 · Quotes 2,397 · Quote Items 5,389 ·
  Sales Orders 1,483 · Bills 1,398 · Bill Items 2,314 · Purchase Orders 527 · Expenses 210 · Items 1,113 ·
  Customers 4,120 · Customer Addresses 7,341 · Customer Payments 1,812 · Vendor Payments 1,305 · stock in / out flows ·
  FIFO mapping · Accrual Transactions 42,449 · Cash Transactions 42,277 · Bank Statements · Accounts · Taxes ·
  Shipments / Packages · Commerce cart + site traffic. 26 are empty (projects, timesheets, sales returns, transfer
  orders, budgets…) — not used by the business.
- **Query tables (the owner's formulas, by Sumit A Shah):** customer churn (risk score, days since last purchase, FY25 vs
  FY26 revenue), Marriott (conversion, invoiced, remaining, outstanding with risk status), year-on-year differences
  (type, sector, state), cash flow, stock (in / out / on hand / committed / available, as-on-date), product prices
  (average selling price, by year), KPI (customer × invoice × sales person), quote values, single-invoice customers,
  last billed date per item, a customer "Details" sheet (lead source, product type, courier, shipment status…).
  **The API gives their columns and source tables but not their SQL** — each one's SQL is copied from its *Edit*
  screen when we rebuild it (the owner pastes it, or a screenshot).
- **Dashboards (18):** All Sales Data · Business Intelligence · Customers (2021-2027) · Customers Insights · Dashboard
  (2021-2027) · Extra I / II · Finance Overview · Financial Statement · Inventory · Inventory Sales Orders and Invoices ·
  Inventory Shipment and Sales Returns · Invoice Overview · **Marriot Dashboard** · Purchases and Payables · Sales and
  Receivables · Vendor Insights · Zoho Commerce. Many charts come in "Top / Bottom 10" × customers / products / cities /
  states / sectors × FY 25-26 / 26-27 pairs, plus weekly targets and weekly reseller views.

**What this changes:** Zoho Analytics already holds a clean, joined copy of *everything* in Books (with keys between
tables — e.g. Invoices → Customers, Salespersons, Quotes). So **Phase 1b reads the wide data from Zoho Analytics**
(Export API, one table at a time, read-only — synchronous export works for tables under 1 million rows; the largest is
42k) instead of building a second full copy from the Books API. No new Books token, no Books call budget. The boards
keep their own live Books copy (it must be up to the minute; Analytics syncs from Books on its own schedule — **check
the sync interval** in the workspace's data-source settings: hourly / every 3 hours / daily).

---

## 3. The semantic layer — datasets, fields, measures

Defined once in code (`src/lib/analytics/model.ts`, pure, shared by server and browser — like `pipeline.ts`), each
with a **plain-English definition** shown in the app, and **checked against Zoho Books and the Overview** before release.

### 3.1 Datasets (v1)

| Dataset | One row per | Built from | Notes |
|---|---|---|---|
| **Trainings** | training (deal) — multi-day = one | `boardTrainings` (fulfilServer) — as the Overview / Calendar | status, dates, trainers, people (checked number wins — `peopleOf`), type, customer, location, sales person, PI / invoice, completed by / on, certificates made |
| **Training days** | trainer × day | same | trainer load, days out of office |
| **Revenue** | invoice line (tracked items) | `zohoDocs` invoices | amount before / after tax, date, customer, sales person, item, training vs AED |
| **Payments** | payment | `zohoPayments` | amount, TDS, date, days to pay (invoice date → paid) |
| **Receivables** | open invoice | invoices + payments | balance, due date, age band (0–30 / 31–60 / 61–90 / 90+), part paid |
| **Quotes & PIs** | quotation / PI | `zohoDocs` + board merges | status (open / lost / converted), age (the 15-day rule), value, converted to PI / training, days to convert |
| **Customers** | customer | `zohoCustomers` | type, sector, city / state, first / last training, lifetime revenue, trainings, people |
| **AED** | AED invoice | AedSmartx board | delivered, contacted, scheduled, completed, not required, battery / pads expiry (`aedParse`) |
| **Certificates** | certificate row | `fulfil_certs` events | people certified per training / day / design, expiry (+2 years) → **renewals** |
| **Pipeline stages** | card × stage change | board change log | time in each stage (quote → PI → scheduled → completed → invoiced → paid), where deals stall |
| **Sales (all products)** | invoice / quote / PI line, every item | wider Books copy (Phase 1b) | product type, item identifier, business type, lead source, chain — AEDs, consumables, safety supplies, training together |
| **Purchases** | PO / bill line | Books POs, bills, vendor payments (Phase 1b) | supplier, item, cost, billed / received, payment terms |
| **Margin** | item × month | sales lines − purchase cost (average cost per item) | gross margin per product / customer / sales person |
| **Expenses** | expense | Books expenses + Zoho Expense | account (travel, lodging, freight, fees…), customer-linked expenses → profit per training |
| **Stock** | item | Zoho Inventory | on hand, stock status, sold per month, days of cover |
| **Freight & shipping** | shipped invoice | invoice custom fields | freight incurred, courier, delivered on time (with Logistics board) |

### 3.2 Dimensions (split by / filter by)
Date (day / week / month / quarter / **FY**), customer, customer type, sector, **chain** (Marriott / Lemon Tree / Hyatt /
Medic Assist), city, state, sales person, trainer (own / external), training type, **product type**, **item identifier**,
**business type** (products / services / training), **lead source** (Indiamart, BuyAEDINDIA, Direct, Social Media,
Events, Reference, Amazon), supplier, expense account, courier, board stage, document type, AED model, payment status,
age band, deal size band, first-time vs repeat customer.

### 3.3 Measures (ready-made)
Revenue (₹, before / after tax), invoices, average invoice, payments received, TDS, outstanding, overdue, days to
pay (average / median), trainings (completed / scheduled / to mark), people trained, people per training, revenue
per person, quotes sent, quote value, conversion rate (quote → PI → trained → paid), days to convert, deals lost,
trainer days, AED sold / delivered / trained, certificates issued, renewals due (90 / 60 / 30 days), repeat-customer
share, new customers, **revenue by lead source / product type / chain**, **purchases, cost of goods, gross margin
(₹ and %)**, **freight per order**, **expenses by account**, **profit per training** (revenue − trainer, travel, kit,
printing, freight costs), stock on hand, days of stock cover, payables due.
Each with: format (₹ / count / % / days), how to add up (sum / average / distinct count), the Overview's targets where
they exist, and its definition text.

### 3.4 Rules that keep it honest
- Same definitions as the Overview (`kpi.ts`, `forecast.ts`) — reuse those functions, don't re-write them.
- Fiscal year Apr–Mar; dates in IST; the team year counts from Oct 2026 where the Overview does.
- Revenue from Zoho invoices; trainings and people from the boards (owner's rule: "use our new data").
- A release only ships when its checks pass: totals per month = Zoho, = Overview (§8).

---

## 4. How it's built (for the developer sessions)

> AGENTS.md: this Next.js (16.3) differs from training data — read `node_modules/next/dist/docs/` before writing routes.

### 4.1 Pieces
- **`src/lib/analytics/model.ts`** — datasets, fields, measures, formats, definitions (pure).
- **`src/lib/analytics/query.ts`** (server) — takes a **report spec** (JSON: dataset, measures, split-by, filters, sort,
  limit, compare-to) → validates it against the model (unknown field = refused) → builds the rows from the Zoho copy +
  boards (the in-memory snapshot already used by `/api/trainings`) → aggregates → returns rows + totals.
- **`POST /api/analytics/query`** — signed-in members; applies the **row-level rules from `roles.ts`** before
  aggregating (Priyanka: AED only; money only for Training-board members).
- **`/api/analytics/reports`, `/api/analytics/dashboards`** — saved specs in Mongo **`reports`** / **`dashboards`**
  (owner, sharing, versions); every save also writes a version doc (P7: restore).
- **`src/app/reports/page.tsx`** + **`src/components/reports/*`** — Reports home (dashboards + saved reports), report
  builder, dashboard canvas, filter bar, chart renderer.

### 4.2 Report spec (example)
```json
{ "dataset": "revenue", "measures": ["revenue"], "by": ["month"], "filters": { "fy": "2026-27", "salesperson": ["Ashish Dalal"] },
  "compare": "last_year", "chart": "column", "sort": "by-asc", "title": "Ashish's revenue by month" }
```
A dashboard = tiles (`{ reportId | inline spec, x, y, w, h }`) + its own filters + saved views.

### 4.3 Charts
- **Recommended: Apache ECharts** (one library, canvas + SVG, every chart type above incl. India map, drill-down,
  brush selection, very fast, themeable from our CSS tokens, PNG export built in). Load it only on the Reports page
  (dynamic import) so the boards stay light. Alternative: keep hand-made SVG (as the Overview) for KPI tiles and
  sparklines only.
- **Grid**: `react-grid-layout` (drag / resize, responsive breakpoints) — or a small own grid if it fights React 19.
- Both pinned to exact versions; checked with `next build`; licences MIT / Apache.

### 4.4 Cross-filtering
The dashboard holds one **selection state** (`{ field: values[] }`) next to its filters; each tile re-queries with
`filters ∪ selection` except the tile the click came from (it highlights instead — Power BI's "highlight" behaviour).
Chips above the grid show every active filter; Esc / Clear removes them.

### 4.5 Speed
- Queries are small (hundreds to a few thousand rows). Cache results per **data version** = `zoho_state.version` +
  the latest `cardEvents` time; a new sync or team change invalidates it.
- Target: dashboard of 8 tiles < 1 s, a filter click < 300 ms.

### 4.6 AI (P5)
- Claude (latest model — check the `claude-api` skill for the current id and pricing before building) gets the
  **model description** (datasets, fields, measures, definitions) and returns a **report spec** — never data, never
  SQL. The server validates it like any spec. The answer shows the spec as editable chips.
- API key in Vercel env only (`ANTHROPIC_API_KEY`), never in Mongo or the browser.
- Summaries: the spec + the aggregated numbers (not raw customer rows) go to the model.

---

## 5. What the team will see

- **Sidebar → Reports** (below Calendar). Home: **Dashboards** (cards: Sales, Trainings, Collections, + New) and
  **Reports** (saved, with owner and "official" badge), a search box.
- **Report builder** (one screen): left — *Data* (dataset), *Measure*, *Split by*, *Filters*; middle — the chart, live
  as you choose; top — chart type (suggested one highlighted), **Save**. Every change is instant.
- **Dashboard**: filter bar on top · KPI tiles · charts in a grid · click to filter · hover cards · "Show the
  documents" · ⋯ on a tile (edit, duplicate, export, alert, comment) · **Edit layout** to drag / resize.
- **Starter dashboards** (official, Admin-made, editable copies for anyone):
  1. **Sales** — revenue by month (vs last year, target), by sales person, by sector, top customers, quote → PI
     conversion, quotes about to expire (day 10 of 15).
  2. **Trainings** — completed / scheduled by month, people trained, by trainer, by type, by city, trainer days,
     to-mark-completed list.
  3. **Collections** — outstanding, overdue by age, days to pay by customer, part-paid that stopped moving, TDS.
  4. **AED** (Priyanka sees this one) — sold, delivered, contacted, trained, not required, battery / pads expiring.
  5. **Renewals** (when "My day + renewals" lands) — certificates expiring in 90 / 60 / 30 days by customer, headcount,
     last price.
  6. **Products & margin** (after Phase 1b; Admin only by default) — sales by product type / item identifier, purchases
     by supplier, gross margin per product and customer, stock and days of cover, freight per order.
  7. **Channels** — revenue and conversion by lead source (Indiamart, BuyAEDINDIA, Amazon, Direct, Reference…) and by
     hotel chain (Marriott, Lemon Tree, Hyatt, Medic Assist).

---

## 6. Phases in detail (each restated with the owner before building)

### Phase 1 — foundation + first working dashboard
- Semantic layer: Trainings, Revenue, Payments, Receivables, Quotes & PIs, Customers, AED.
- Query route with row-level rules; cache.
- Report builder: dataset → measure → split by → chart (bar / column / line / pie / table / KPI) → filters → save.
- Reports page; saved reports (shared with the team; author / Admin edit).
- **One dashboard (Sales)** with filter bar, KPI tiles, cross-filtering. ECharts in the dashboard's themes.
- Checks (§8). **Owner tries it on localhost before anything is pushed.**

### Phase 1b — the whole of Books, read from Zoho Analytics (before Sales / Purchases / Margin dashboards)
- **Source: the Zoho Analytics tables** (§2b.2) — already a joined copy of all of Books / Inventory / Commerce since
  2021. Connection done (22 Oct). Pull the ~30 tables the datasets need (Invoices, Invoice Items, Quotes, Quote Items,
  Sales Orders, Sales Order Items, Customers, Customer Addresses, Customer Payments, Invoice Payments, Items, Bills, Bill
  Item, Purchase Orders, Purchase Order Items, Vendors, Vendor Payments, Expenses, Expense Item, Accounts, Accrual
  Transactions, stock in / out flows, FIFO mapping, Packages / Shipment Order, Salespersons, Credit Notes…) with the
  Export API (JSON), into their own Mongo collections (`za_<table>`), **separate from the boards' Books copy** — the
  boards and their full checks never touch them.
- **Refresh:** after Zoho Analytics' own sync (owner checks the interval), or a few times a day; tables whose
  "last modified" hasn't changed are skipped. Paced calls (Zoho rate-limits bursts). Each refresh logged like the Sync log.
- **Rebuild the owner's 28 query tables as datasets / measures** in the semantic layer (their SQL pasted by the owner),
  and **check each one against Zoho Analytics' own result** before it ships (§8).
- **Fallback:** if a table isn't in Zoho Analytics or its sync is too slow, read it from the Books API instead (would
  need a new read-only Books token — the current one was made for the boards only, HANDOFF §6).

### Phase 2 — the dashboard canvas
- Many dashboards; drag / resize grid; tabs; phone stacking.
- Drill-down (FY → month → day; sector → customer → document) and **drill-through to the board's card**.
- Rich hover cards; table / matrix with totals and conditional colours; reference / target lines; measure switch.
- Export: CSV / Excel, PNG, PDF; "official" badge; Trainings and Collections dashboards.

### Phase 3 — insights
- Compare to previous period / last year everywhere; % of total, running total, rank, moving average.
- Targets and progress tiles (shared with the Overview); forecast on any monthly measure; anomaly dots.
- **"Why did this change?"** breakdown; formula fields; groups / bins; scenario slider; India map; small multiples;
  saved views + story mode; comments on points.

### Phase 4 — alerts and subscriptions
- Alert on any tile (threshold, change %, "no data") → WhatsApp (Anantya — needs a new approved template) or email
  (learn@ / a new sender), one owner per alert, at most once a day, logged in the Sync log.
- Weekly / monthly digests of a dashboard.

### Phase 5 — ask in plain words
- Question box on Reports and on every dashboard; answer = an editable report; "Summarise this dashboard".
- Needs: Anthropic API key in Vercel; a monthly spend cap.

### Phase 6 — more data
- **Zoho Analytics**: read the owner's finished tables through its API (Admin connects once, like the other Zoho links)
  as extra datasets — keep the joins there, draw them here.
- Zoho Sheets / CSV / Excel upload with a guided clean-up step.
- **Expenses** (Zoho Books expenses, or a sheet) → **profit per training** (trainer fees, travel, kits, printing,
  shipping) — MONDAY-PLAN §4 #1.

### Phase 7 — polish
- Version history + restore; usage (who opens what); speed tuning; print layout; a read-only link for the boss
  (PIN / expiry) if wanted; keyboard shortcuts; accessibility pass (colour-blind-safe palette, keyboard-only use).

---

## 7. Deliberately not doing (and why)

| Not doing | Why |
|---|---|
| Free-form SQL / DAX / M | The main reason numbers disagree and people get stuck; the formula field covers the real needs. |
| Custom-visual marketplace / extensions | Security and upkeep; our chart list covers what a team our size uses. |
| A desktop app | The browser does everything; works on any computer. |
| Pixel-perfect paginated reports (invoices-style) | Zoho Books already prints documents; dashboard PDF is enough. |
| Our own data warehouse / big-data engine | ~200 documents a year; the Mongo copy is plenty. Revisit only if data grows 100×. |
| Replacing Zoho Analytics for Zoho-side joins | Keep it as a data source (P6) where it already does the work. |

---

## 8. How we check it (no test data in the shared database)

- **Numbers**: for each measure, a script compares our totals month by month with Zoho Books (read-only, the cached
  token pattern in HANDOFF §9) and with the Overview's own functions. Differences must be explained before release.
- **Row-level rules**: query as each member (Priyanka, Arti, Shreya, Admin) through the server — AED-only, no money
  where not allowed.
- **Browser**: read-only puppeteer at 1728×958 and 390 px phone (HANDOFF §9 #14): every chart renders, no page
  scroll on the owner's screen when the layout allows, cross-filter / drill / export work; **saves blocked** while
  testing, or a throwaway `thinkhealth_qa` database for the save flows (with the owner's OK).
- **Speed**: time each dashboard; < 1 s target.
- Saved reports / dashboards made during testing go to the throwaway database only; the live `reports` /
  `dashboards` collections start empty (plus the starter dashboards the owner approves).

---

## 9. Sources (checked 22 Oct 2026)

- Power BI Embedded capacity & SKUs — https://learn.microsoft.com/power-bi/developer/embedded-capacity
- Publish to web vs Embedded — https://datatako.com/blog/power-bi-publish-to-web-vs-embedded
- Power BI Embedded cost — https://www.thebricks.com/resources/guide-how-much-does-power-bi-embedded-cost
- Tableau pricing — https://tableau.com/pricing
- Tableau embedded cost — https://www.thebricks.com/resources/guide-how-much-does-tableau-embedded-analytics-cost ,
  https://www.toucantoco.com/en/blog/tableau-pricing
- Zoho Analytics embedding / permalinks — https://help.zoho.com/portal/en/kb/analytics/users-guide/sharing-and-publishing/publishing-options/articles/embedding-views-in-web-pages
- Zoho Analytics → Tableau go-betweens — https://skyvia.com/data-integration/analyze-zoho-analytics-with-tableau ,
  https://www.coupler.io/tableau-integrations/zoho-analytics-metadata-api-to-tableau
- Feature lists for both tools are from their public documentation and general product knowledge; check any single
  feature in their current docs before quoting it to someone.

---

## 10. Questions for the owner before Phase 1 (recommended default first)

1. **Phase 1 scope** as in §6 (builder + Sales dashboard with filters and click-to-filter). — *Default: yes.*
2. **Who builds**: Admin, Shikha, Sumit, Ashish; everyone else views what's shared with them; Priyanka sees AED data
   only. — *Default: yes.*
3. **Saved reports and dashboards**: shared with the whole team by default; only the author / Admin edits. — *Default: yes.*
4. **Chart library**: Apache ECharts (free, Apache licence). — *Default: yes.*
5. **Your Zoho Analytics reports**: send screenshots of the 4–6 you use most — they become the starter dashboards'
   first charts (and tell us whether Phase 6's Zoho Analytics link is needed early). — *Default: Sales / Trainings /
   Collections as in §5 until then.*
6. **"My day + renewals"** (agreed earlier, MONDAY-PLAN §3a) — build it **before** this plan, or after Phase 1? —
   *Default: after Phase 1 — the Renewals dashboard then comes almost free.*
7. ~~Zoho Analytics schema~~ — **done 22 Oct**: connected by API, every table and column in ANALYTICS-SCHEMA.md.
   Still needed: **the Zoho Analytics → Books sync interval** (workspace → data sources → Zoho Books → settings), and the
   **SQL of the query tables** we rebuild first (the owner copies it from each one's *Edit* screen).
8. **Whole of Books, not just trainings and AEDs** (§2b.1, Phase 1b): read all sales, purchases, expenses, stock and
   accounts **from the Zoho Analytics tables** for the Sales / Margin / Purchases / Profit dashboards? — *Default: yes,
   right after Phase 1 (no new Books token needed).*
11. **Which of the 18 Zoho Analytics dashboards to rebuild first?** — *Default: Sales and Receivables, Marriot
    Dashboard, Customers Insights (churn), Inventory, Finance Overview.*
9. **Modules marked "to confirm"** in §2b.1 (credit notes, Commerce orders, recurring invoices, journals, bank,
   projects): which does the business actually use? — *Default: include credit notes; skip the rest until asked.*
10. **Margin / profit numbers** are sensitive: who sees cost, margin and profit? — *Default: Admin only (the owner),
    until the owner widens it.*

---

## 11. Advanced Reports (owner, 26–27 Oct — defaults accepted 27 Oct)

**The ask:** 20+ advanced reports that growing businesses use; each user picks which reports they see; more KPIs; a
**₹50 L monthly goal** as a vertical meter on the left; Tableau / Power BI flexibility (custom filters, parameters);
a less congested UI.

**Decisions (defaults accepted):**
1. Goal meter on the **left of every Reports tab** (a strip on top on narrow screens) — not on the Overview, whose
   revenue tile is training-only.
2. Goal = **every Zoho Books invoice, before tax** (Sales dataset "Revenue").
3. **Admin** changes the goal, and can set a different goal for single months (kv `reports_goal`).
4. The meter is seen by whoever sees the Sales dashboard (Training-board members).
5. "Choose your reports" is **per person**; Admin sets the starting layout for new people.
6. First batch of reports: #1, 2, 4, 6, 8, 10, 13, 14, 17, 24 below; then the other ✅ ones; then ⚠.
7. Copy **Sales Orders + Sales Order Items** (done 27 Oct) and later **Quote Items**; margin tables later, Admin only.
8. "Less congested" covers **Reports only**.
9. Order: (a) goal meter → (b) less congested Reports layout → (c) more KPIs → (d) parameters + custom filters →
   (e) new reports in 2–3 batches → (f) "My dashboard" chooser. Each local first, own commit, pushed on the owner's word.

**Report ideas** — ✅ data we have · ⚠ in Zoho Analytics, not copied yet · ❌ missing

| # | Report | Data |
|---|---|---|
| 1 | This year vs last year by sector × customer type, several selections at once, ₹ and % change, same days | ✅ Sales |
| 2 | Revenue bridge (waterfall): last year → this year = new customers + growth − shrink − lost | ✅ |
| 3 | Price · volume · mix by item group | ✅ qty + amount |
| 4 | ₹50 L goal tracker (so far, % of goal, ₹ needed per working day, month-end estimate, booked PIs) | ✅ (Sales Orders added) |
| 5 | Seasonality heatmap: month × FY since 2021 | ✅ |
| 6 | Customer concentration (80/20; share of the top 10) | ✅ |
| 7 | RFM segments (Champions / Loyal / At risk / Lost) | ✅ |
| 8 | Win-back list: bought last FY, nothing this FY | ✅ |
| 9 | Cohort retention by first-purchase FY | ✅ |
| 10 | New vs repeat revenue, from invoice history (not the hand-typed New / Old tag) | ✅ |
| 11 | Consumables reorder list: AEDs bought 18–30 months ago, no pads / batteries since | ✅ item group |
| 12 | Cross-sell gaps: AED buyers with no training, and the other way round | ✅ |
| 13 | Sales-person scorecard | ✅ |
| 14 | Quote funnel: quotes → won → invoiced, days to invoice | ✅ (quotes have no lead source ❌) |
| 15 | Open quotes by age (valid 15 days / expired) | ✅ |
| 16 | Lead-source performance | ✅ invoices; win rate per channel ❌ |
| 17 | Collections: ageing, overdue %, days-to-pay trend, slow payers | ✅ |
| 18 | Geography: state / city, change vs last year, India map | ✅ (+ a free India outline file) |
| 19 | Product mix trend (share per quarter) | ✅ |
| 20 | Average selling price per item over time | ✅; line discounts ⚠ |
| 21 | Resellers vs direct | ✅ |
| 22 | Hotel chains | ✅ (chain is tagged on few customers) |
| 23 | Training economics: revenue per training / per person | ✅ board + Sales |
| 24 | "What changed?" breakdown (decomposition tree) | ✅ |
| 25 | Gross margin by product / customer (Admin only) | ⚠ Bills, Bill Items, FIFO |
| 26 | Freight cost as % of revenue | ⚠ column copied, format to check |
| 27 | Stock on hand, days of cover | ⚠ stock tables |

**Parameters and filters (d):** compare to previous period / same period last year / none; measure switch and "split
by" switch on a chart; top N; month / quarter / FY; a what-if growth % with the goal as an editable number; filters on
any field with include **or exclude**, "contains", amount ranges and saved filter sets; two selections side by side.

**Data checks done 27 Oct:** sector and customer type are blank on ~1% of revenue since Apr 2025 (safe to report on);
hotel chain is set on few customers; Zoho Analytics' Quotes table has no lead source / product type (only invoices do);
Sales Orders' "Total (BCY)" exports abbreviated — use "Sub Total (BCY)".
