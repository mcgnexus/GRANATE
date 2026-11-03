"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";

export type MarkdownEditorHandle = {
  wrapSelection: (before: string, after: string, placeholder?: string) => void;
  insertText: (text: string) => void;
  applyHeading: (level: number) => void;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onSave?: () => void;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, readOnly = false, onSave },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const saveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    saveRef.current = onSave;
  });

  function wrapSelection(before: string, after: string, placeholder = "texto") {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to) || placeholder;
    const insert = `${before}${selected}${after}`;
    const selectionStart = from + before.length;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: selectionStart, head: selectionStart + selected.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function insertText(text: string) {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function applyHeading(level: number) {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const first = view.state.doc.lineAt(from).number;
    const last = view.state.doc.lineAt(to).number;
    const changes: Array<{ from: number; to: number; insert: string }> = [];

    for (let number = first; number <= last; number++) {
      const line = view.state.doc.line(number);
      const text = line.text.replace(/^#{1,6}\s+/, "");
      changes.push({
        from: line.from,
        to: line.to,
        insert: level > 0 ? `${"#".repeat(level)} ${text}` : text,
      });
    }

    view.dispatch({ changes, scrollIntoView: true });
    view.focus();
  }

  useImperativeHandle(ref, () => ({
    wrapSelection,
    insertText,
    applyHeading,
    focus: () => viewRef.current?.focus(),
  }));

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        EditorView.lineWrapping,
        bracketMatching(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          {
            key: "Mod-b",
            preventDefault: true,
            run: () => {
              wrapSelection("**", "**");
              return true;
            },
          },
          {
            key: "Mod-i",
            preventDefault: true,
            run: () => {
              wrapSelection("*", "*");
              return true;
            },
          },
          {
            key: "Mod-u",
            preventDefault: true,
            run: () => {
              wrapSelection("<u>", "</u>");
              return true;
            },
          },
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              saveRef.current?.();
              return true;
            },
          },
        ]),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={host} className="cm-host h-full overflow-hidden" />;
});
