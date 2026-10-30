# Report builder v2 — plan (30 Oct 2026, session 19)

Owner, 30 Oct: "editing reports or creating them is so trash, I should rather have columns and attributes … if I
select 3 of these what am I getting … why can't I edit labels, add label text plus dynamic labeling … Tableau has
parameters and aggregated fields, we have nothing … everything is too jumbled and messy."

**About Tableau's source:** Tableau Desktop's authoring UI is not open source — github.com/tableau holds the
Extensions API, Hyper API, TabPy, REST clients and samples, not the drag-and-drop builder. So this plan follows
Tableau's *documented concepts* (Data pane, shelves, Marks card, calculated fields, parameters, dynamic titles), mapped
onto our own engine (`model.ts` / `query.ts`). No Tableau code is copied.

## 1. What's wrong today (and the fix for each)

| Frustration | Cause in today's builder (`Builder.tsx`) | Fix |
|---|---|---|
| "If I select 3, what am I getting?" | Measures are a cloud of pills; picking 3 with no split shows **one** number (the first) under a joined title "Average invoice & New customers & Revenue" — a real bug | A **"What you'll get" sentence** always under the preview; several values with no split = **one card per value**, side by side; with a split = one column / bar per value |
| No columns and attributes | Fields are hidden in a "Split by" dropdown | A **Data pane**: every *Attribute* (text / date — Tableau "dimensions") and *Number* (Tableau "measures") listed with its plain-English definition, dragged or clicked onto **shelves** |
| Labels can't be edited | Only the title box; column names, axis names, number labels come from the model | **Every text is editable in place** (title, subtitle, column headers, axis names, legend names, value labels) |
| No custom / dynamic label text | — | **Label templates** with tokens: `Revenue {period}` → "Revenue This FY (2026-27)" |
| No parameters, no own fields | — | **Parameters** and **calculated fields** (guided, so they read as a sentence) |
| Jumbled | One long left column of everything | Three clear panes (Data · Build + preview · Format), one job each |

## 2. Data model

All pure and shared by the browser and the server (like `model.ts`), stored in Mongo.

```ts
// What the Data pane lists (built-in, from model.ts — unchanged meaning):
type Attribute = { key: string; label: string; kind: "text" | "date"; def?: string };   // Tableau: dimension
type NumberField = { key: string; label: string; format: Format; def: string };          // Tableau: measure

// A field someone made (Tableau: calculated field) — Mongo `reportFields`, shared with the team.
type CalcField = {
  id: string; dataset: string; name: string; format: Format; createdBy: string;
  formula:
    | { op: "sum" | "avg" | "min" | "max"; of: string; where?: Filter[] }       // Sum of Amount where Sector is Hotels
    | { op: "count"; where?: Filter[] }                                          // Count of invoices where …
    | { op: "distinct"; of: string; where?: Filter[] }                           // Number of different Customers
    | { op: "ratio" | "diff" | "pctChange"; a: string; b: string }               // Revenue ÷ Customers billed
    | { op: "param"; param: string };                                            // = the value of a parameter
};
// Each formula has one sentence form, shown wherever the field is ("Sum of Revenue where Sector is Hotels").

// Parameters (Tableau: parameters) — Mongo `reportParams`; the viewer changes them from the dashboard toolbar.
type Param = { id: string; name: string; type: "number" | "text" | "date" | "list"; value: string | number; options?: string[] };

// The report itself — Spec v2. Old specs are read through `upgradeSpec` (§11 #18) and keep working.
type ReportSpec = {
  v: 2; dataset: string;
  rows: string[];                    // attributes down the side / along the axis (1–2)
  values: { ref: string; label?: string }[];   // numbers (built-in key or CalcField id), each with its own name
  colour?: string;                   // split each bar / line by this attribute (Tableau: Marks → Color)
  tooltip?: string[];                // extra numbers on hover
  filters: (Filter | { field: string; param: string })[];    // a filter may follow a parameter
  period?: string; sort?: "value" | "label"; limit?: number;
  chart: ChartKind | "auto";
  labels: {
    title: string; subtitle?: string;                        // templates (see 3)
    axisX?: string; axisY?: string;
    columns?: Record<string, string>;                        // header text per row / value ref
    valueLabels?: "off" | "on" | { template: string };       // e.g. "{value} ({share})"
  };
};
```

Why guided formulas, not free text like Tableau's `SUM([Sales])`: the owner's complaint is *understanding* what
was made. A formula built from three picks (what · of which field · only where) always has a readable sentence,
can't have a syntax error, and the engine already computes every op (`agg` in `model.ts`). A free-text editor can
come later if anyone asks.

## 3. Labels and dynamic labels

- Every label is a **template string**; plain text is just a template with no tokens.
- Tokens (picked from an "Insert value ▾" list, never typed blind):
  `{period}` · `{compare}` · `{filters}` · `{today}` · `{total:<value>}` · `{max:<value>}` · `{top:<row>}` (the
  biggest row's name) · `{param:<name>}` · `{value}` / `{share}` / `{change}` (value labels only).
- Stored as text in `ReportSpec.labels`; rendered by one pure function `renderLabel(template, ctx)` from the query's
  answer — the same on screen, in CSV / Excel headers and in PDF.
- Editing: click any title, axis name, column header or legend entry → it becomes a text box with "Insert value ▾";
  Enter saves, Esc cancels, an empty box goes back to the automatic name. Dynamic parts show with a dotted underline
  so it's clear which words change by themselves.

## 4. The builder screen

```
┌ Data ───────────────┬ Build ──────────────────────────────────────┬ Format ──────────┐
│ Sales ▾             │ Rows      [Sector ×] [+]                     │ Title            │
│ ATTRIBUTES          │ Values    [Revenue ×] [Invoices ×] [+]       │ Subtitle         │
│  Customer           │ Colour    [+]          Tooltip [+]           │ Axis names       │
│  Sector  …          │ Filters   [Sales person is Sumit ×] [+]      │ Column names     │
│ NUMBERS             │ Period    This FY ▾   Chart  Auto ▾          │ Number labels    │
│  Revenue  …         │ ─────────────────────────────────────────    │ Sort / top N     │
│ MY FIELDS  + New    │  live preview (chart or table)               │                  │
│ PARAMETERS + New    │  You'll get: a bar per Sector, two bars each │                  │
│                     │  — Revenue and Invoices — This FY, only      │                  │
│                     │  Sumit's invoices.                            │                  │
└─────────────────────┴──────────────────────────────────────────────┴──────────────────┘
```

- Click a field in the Data pane = it goes to the obvious shelf (an attribute → Rows, a number → Values); drag to put
  it anywhere else. Hover = its definition.
- **"You'll get" sentence** is built from the spec, always visible, updated on every change.
- Several values, no rows = number cards side by side (each with its own name). With rows = table columns or
  grouped bars. "Auto" chart picks from that, like Tableau's "Show Me"; any chart can be forced.
- Phone: the three panes become three tabs (Data · Build · Format) with the preview on top.
- Opened from: "+ New report", a saved report's Edit, and **⋯ → Edit report… on every dashboard tile, KPIs
  included** (owner, 30 Oct). Saving from a tile replaces it on that dashboard for the team (Admin, Ashish, Shikha,
  Sumit, Nikita), and "Restore" brings back the original.

## 5. Tableau → ours

| Tableau | Ours |
|---|---|
| Data pane: Dimensions / Measures | Data pane: Attributes / Numbers (`model.ts` fields / measures + My fields) |
| Rows / Columns shelves | Rows (1–2 attributes) / Values |
| Marks card: Color · Label · Tooltip | Colour · Number labels · Tooltip |
| Filters shelf | Filters (is / is not / contains / range, or "follows parameter") |
| Calculated field | Guided `CalcField` (sentence form) |
| Parameter + parameter control | `Param` + a control in the dashboard toolbar |
| Show Me | Chart: Auto |
| Dynamic titles (`<Sheet Name>`, `<Parameters.X>`) | Label templates with tokens |

## 6. Build order (one commit each, pushed when the owner says)

1. Builder shell: three panes, shelves, "You'll get" sentence, several-values fix, Spec v2 + `upgradeSpec` + tests.
2. Editable labels + tokens (`renderLabel`, used in charts, tables, CSV / Excel).
3. ⋯ → Edit report… on every tile (KPIs too), save to the dashboard, Restore.
4. Calculated fields (`reportFields`, route, guided editor, tests).
5. Parameters (`reportParams`, toolbar control, filters / fields / labels that follow them).
