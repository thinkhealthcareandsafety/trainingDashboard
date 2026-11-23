"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import "./fillin.css";

/*
 * The template editor without the codes (owner, 23 Nov: templates "a bit hard to understand… make it nice and easy to edit
 * and use"). The saved text keeps the little language of templateText.ts — {total}, [, valid until {valid}], {is|are} — but
 * here each of those is a box in plain words ("Total price") that can be moved or deleted whole, never half-typed.
 * Typing is ordinary text; Enter makes a new line (none in a one-line field such as the subject).
 */

export type FillIn = { label: string; example?: string };
export type EditorHandle = { insert: (name: string) => void; focus: () => void };

const TOKEN = /\[[^[\]]*\{\w+\}[^[\]]*\]|\{[^{}|]*\|[^{}]*\}|\{\w+\}/g;

const labelOf = (name: string, fills: Record<string, FillIn>) => fills[name]?.label ?? name;

/** One box: what it shows and what its tooltip says. */
function chip(raw: string, fills: Record<string, FillIn>): HTMLSpanElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.tok = raw;
  el.className = "fi-chip";
  if (raw.startsWith("[")) {
    // An optional part: its words, with the fill-ins inside shown as names; left out when one of them is empty.
    const inner = raw.slice(1, -1);
    const names = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    el.classList.add("fi-opt");
    el.textContent = inner.replace(/\{(\w+)\}/g, (_, n: string) => `‹${labelOf(n, fills)}›`).replace(/\n/g, " ⏎ ").trim();
    el.title = `Only when there is a ${names.map((n) => labelOf(n, fills).toLowerCase()).join(" and ")}; otherwise these words are left out.`;
  } else if (raw.includes("|")) {
    const [one, many] = raw.slice(1, -1).split("|");
    el.classList.add("fi-choice");
    el.textContent = `${one} / ${many}`;
    el.title = `"${one}" with one item, "${many}" with several.`;
  } else {
    const name = raw.slice(1, -1);
    el.textContent = labelOf(name, fills);
    const ex = fills[name]?.example;
    el.title = ex ? `Filled in for each email, e.g. ${ex}` : "Filled in for each email";
  }
  return el;
}

function render(root: HTMLElement, text: string, fills: Record<string, FillIn>) {
  root.replaceChildren();
  let at = 0;
  const addText = (s: string) => {
    s.split("\n").forEach((part, i) => {
      if (i) root.appendChild(document.createElement("br"));
      if (part) root.appendChild(document.createTextNode(part));
    });
  };
  for (const m of text.matchAll(TOKEN)) {
    addText(text.slice(at, m.index));
    root.appendChild(chip(m[0], fills));
    at = m.index! + m[0].length;
  }
  addText(text.slice(at));
  // Chrome needs a last <br> to show (and keep the caret on) an empty last line.
  root.appendChild(document.createElement("br"));
}

/** The DOM back into template text. Lines the browser wrapped in <div>s count as new lines. */
function serialise(root: HTMLElement): string {
  let out = "";
  const walk = (n: Node, top: boolean) => {
    n.childNodes.forEach((c, i) => {
      if (c.nodeType === Node.TEXT_NODE) out += (c.textContent ?? "").replace(/ /g, " ").replace(/​/g, "");
      else if (c instanceof HTMLElement) {
        if (c.dataset.tok) out += c.dataset.tok;
        else if (c.tagName === "BR") out += "\n";
        else if (c.tagName === "DIV" || c.tagName === "P") {
          if (!(top && i === 0) && !out.endsWith("\n")) out += "\n";
          walk(c, false);
        } else walk(c, false);
      }
    });
  };
  walk(root, true);
  return out.replace(/\n$/, "");
}

type Props = {
  value: string; onChange: (v: string) => void; fills: Record<string, FillIn>;
  readOnly?: boolean; singleLine?: boolean; label: string; onFocus?: () => void; className?: string;
};

export const FillInEditor = forwardRef<EditorHandle, Props>(function FillInEditor({ value, onChange, fills, readOnly, singleLine, label, onFocus, className = "" }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const mine = useRef<string | null>(null); // the text this editor itself last sent up
  const range = useRef<Range | null>(null); // where the caret was, for "Add detail"

  useLayoutEffect(() => {
    if (!el.current || value === mine.current) return;
    render(el.current, value, fills);
    mine.current = value;
  }, [value, fills]);

  const emit = () => {
    if (!el.current) return;
    let v = serialise(el.current);
    if (singleLine) v = v.replace(/\n+/g, " ");
    mine.current = v;
    onChange(v);
  };
  const keep = () => {
    const s = window.getSelection();
    if (s?.rangeCount && el.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange();
  };

  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    insert: (name: string) => {
      const root = el.current;
      if (!root || readOnly) return;
      root.focus();
      let r = range.current && root.contains(range.current.startContainer) ? range.current : null;
      if (!r) { r = document.createRange(); r.selectNodeContents(root); r.collapse(false); if (root.lastChild?.nodeName === "BR") r.setStartBefore(root.lastChild); }
      r.deleteContents();
      const c = chip(`{${name}}`, fills);
      const space = document.createTextNode(" ");
      r.insertNode(space);
      r.insertNode(c);
      const after = document.createRange();
      after.setStartAfter(space); after.collapse(true);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(after);
      range.current = after.cloneRange();
      emit();
    },
  }));

  return (
    <div
      ref={el}
      role="textbox"
      aria-label={label}
      aria-multiline={!singleLine}
      aria-readonly={readOnly}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      className={`fi-ed ${singleLine ? "fi-line" : ""} ${className}`}
      onInput={emit}
      onKeyUp={keep}
      onMouseUp={keep}
      onBlur={keep}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!singleLine) document.execCommand("insertLineBreak");
      }}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, singleLine ? t.replace(/\s*\n\s*/g, " ") : t);
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
});
