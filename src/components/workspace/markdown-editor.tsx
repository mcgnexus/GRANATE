"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { foldGutter, indentOnInput, bracketMatching as bm } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import {
  AlignLeft,
  Bold,
  ClipboardPaste,
  ClipboardType,
  Code,
  Eraser,
  ExternalLink,
  FileOutput,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pilcrow,
  Sigma,
  SquareRadical,
  Tag,
  TextQuote,
  TextSelect,
  Type,
} from "lucide-react";
import { ContextMenu, type MenuEntry } from "@/components/ui/context-menu";
import { ContextBottomSheet } from "@/components/ui/context-bottom-sheet";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import {
  findHeadingSection,
  renameHeadingRange,
  stripFormatting,
  toggleHeadingTagRange,
  toggleListLines,
  toggleQuoteLines,
} from "@/lib/markdown/formatting";
import { NotePicker } from "./note-picker";
import type { TreeNote } from "./file-tree";

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
  /** Notas de la bóveda, para el selector de "Añade enlace" del menú contextual. */
  notes?: TreeNote[];
  activeNoteId?: string;
  vimMode?: boolean;
  /**
   * Se emite al confirmar "Extraer este encabezado". El workspace crea la nota
   * nueva, quita la sección del contenido actual y la abre.
   */
  onExtractSection?: (section: { title: string; body: string; anchor: number }) => void;
  onToast?: (message: string) => void;
};

type LinkModalState = { url: string; text: string };
type RenameModalState = { value: string; anchor: number };
type ExtractModalState = { title: string; body: string; anchor: number };

const HIGHLIGHT_COLORS = [
  { key: "yellow", label: "Amarillo" },
  { key: "green", label: "Verde" },
  { key: "red", label: "Rojo" },
  { key: "blue", label: "Azul" },
  { key: "purple", label: "Morado" },
] as const;

const TEXT_COLORS = [
  { key: "red", label: "Rojo" },
  { key: "green", label: "Verde" },
  { key: "blue", label: "Azul" },
  { key: "purple", label: "Morado" },
  { key: "orange", label: "Naranja" },
] as const;

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, readOnly = false, onSave, notes, activeNoteId, vimMode = false, onExtractSection, onToast },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const saveRef = useRef(onSave);
  const extractRef = useRef(onExtractSection);
  const toastRef = useRef(onToast);
  const coarsePointer = useCoarsePointer();
  const [menu, setMenu] = useState<{ x: number; y: number } | { sheet: true } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkModal, setLinkModal] = useState<LinkModalState | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [extractModal, setExtractModal] = useState<ExtractModalState | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    saveRef.current = onSave;
    extractRef.current = onExtractSection;
    toastRef.current = onToast;
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

  /** Aplica/quita un tipo de lista sobre las líneas de la selección (o la línea actual). */
  function toggleList(kind: "bullet" | "number" | "task") {
    const view = viewRef.current;
    if (!view) return;
    const range = selectedRange(view);
    const updated = toggleListLines(view.state.sliceDoc(range.from, range.to), kind);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: updated },
      selection: { anchor: range.from + updated.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Aplica/quita cita sobre las líneas de la selección (o la línea actual). */
  function applyQuote() {
    const view = viewRef.current;
    if (!view) return;
    const range = selectedRange(view);
    const updated = toggleQuoteLines(view.state.sliceDoc(range.from, range.to));
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: updated },
      selection: { anchor: range.from + updated.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Limpia el formato de la selección (o de la línea actual si no hay selección). */
  function clearFormatting() {
    const view = viewRef.current;
    if (!view) return;
    const range = selectedRange(view);
    const cleaned = stripFormatting(view.state.sliceDoc(range.from, range.to));
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: cleaned },
      selection: { anchor: range.from + cleaned.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Código inline en una línea; bloque cercado si hay varias líneas. */
  function insertCode() {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    if (selected.includes("\n")) {
      const insert = `\`\`\`\n${selected}\n\`\`\`\n`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
      });
    } else {
      wrapSelection("`", "`", "código");
      return;
    }
    view.focus();
  }

  function insertMathInline() {
    wrapSelection("$", "$", "x^2");
  }

  function insertMathBlock() {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to) || "x^2";
    const prefix = from > 0 ? "\n" : "";
    const insert = `${prefix}$$\n${selected}\n$$\n`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + prefix.length + 3 },
      scrollIntoView: true,
    });
    view.focus();
  }

  function insertWebLink() {
    if (!linkModal) return;
    const url = linkModal.url.trim();
    if (!url) return;
    const text = linkModal.text.trim() || url;
    insertText(`[${text}](${url})`);
    setLinkModal(null);
  }

  /** Pega el contenido del portapapeles; `plain` lo limpia con stripFormatting. */
  async function pasteFromClipboard(plain: boolean) {
    const view = viewRef.current;
    if (!view) return;
    try {
      const read = navigator.clipboard?.readText?.bind(navigator.clipboard);
      if (!read) {
        toastRef.current?.("El portapapeles no está disponible en este navegador");
        return;
      }
      const text = await read();
      if (!text) return;
      const insert = plain ? stripFormatting(text) : text;
      if (!insert) return;
      insertText(insert);
    } catch {
      toastRef.current?.("No se pudo leer el portapapeles (permiso denegado)");
    }
  }

  /** Selecciona el documento completo. */
  function selectAllDoc() {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      selection: { anchor: 0, head: view.state.doc.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Encabezado bajo el cursor, si lo hay. */
  function headingAtCursor() {
    const view = viewRef.current;
    if (!view) return null;
    return findHeadingSection(view.state.doc.toString(), view.state.selection.main.head);
  }

  function openRenameModal() {
    const found = headingAtCursor();
    if (!found) return;
    setMenu(null);
    setRenameModal({ value: found.title, anchor: found.sectionStart });
  }

  function confirmRename() {
    if (!renameModal) return;
    const view = viewRef.current;
    if (!view) {
      setRenameModal(null);
      return;
    }
    const range = renameHeadingRange(
      view.state.doc.toString(),
      renameModal.anchor,
      renameModal.value,
    );
    if (!range) {
      toastRef.current?.("No se pudo renombrar el encabezado");
      setRenameModal(null);
      return;
    }
    view.dispatch({
      changes: range,
      selection: { anchor: range.from + range.insert.length },
      scrollIntoView: true,
    });
    view.focus();
    setRenameModal(null);
  }

  /** Añade o quita `#marcado` al final del encabezado bajo el cursor. */
  function toggleMark() {
    const view = viewRef.current;
    if (!view) return;
    const range = toggleHeadingTagRange(
      view.state.doc.toString(),
      view.state.selection.main.head,
    );
    if (!range) return;
    view.dispatch({ changes: range, scrollIntoView: true });
    view.focus();
  }

  function openExtractModal() {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const found = findHeadingSection(doc, view.state.selection.main.head);
    if (!found) return;
    const body = doc.slice(found.sectionStart, found.sectionEnd).trim();
    if (!body) {
      toastRef.current?.("La sección está vacía");
      return;
    }
    setMenu(null);
    setExtractModal({ title: found.title || "Sección", body, anchor: found.sectionStart });
  }

  function confirmExtract() {
    if (!extractModal) return;
    extractRef.current?.(extractModal);
    setExtractModal(null);
  }

  /** Cursor en el punto pulsado antes de abrir el menú (UX estándar de editores). */
  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    // En táctil no se intercepta el long-press: es el gesto de selección
    // nativa y el menú se abre solo con el botón explícito de acciones.
    if (coarsePointer) return;
    event.preventDefault();
    if (readOnly) return;
    const view = viewRef.current;
    if (!view) return;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos != null) view.dispatch({ selection: { anchor: pos, head: pos } });
    setMenu({ x: event.clientX, y: event.clientY });
  }

  function buildMenuEntries(): MenuEntry[] {
    const closeMenu = () => setMenu(null);
    const heading = headingAtCursor();

    const formatEntries: MenuEntry[] = [
      {
        label: "Negrita",
        icon: <Bold size={13} />,
        shortcut: "Ctrl+B",
        onClick: () => wrapSelection("**", "**"),
      },
      {
        label: "Cursiva",
        icon: <Italic size={13} />,
        shortcut: "Ctrl+I",
        onClick: () => wrapSelection("*", "*"),
      },
      {
        label: "Colores",
        icon: <Highlighter size={13} />,
        children: [
          {
            label: "Resaltado",
            icon: <Highlighter size={13} />,
            children: HIGHLIGHT_COLORS.map((color) => ({
              label: color.label,
              onClick: () => wrapSelection(`<mark class="hl-${color.key}">`, "</mark>", "texto"),
            })),
          },
          {
            label: "Texto",
            icon: <Type size={13} />,
            children: TEXT_COLORS.map((color) => ({
              label: color.label,
              onClick: () => wrapSelection(`<span class="tx-${color.key}">`, "</span>", "texto"),
            })),
          },
        ],
      },
      { separator: true },
      { label: "Código", icon: <Code size={13} />, onClick: insertCode },
      {
        label: "Fórmula matemática",
        icon: <Sigma size={13} />,
        children: [
          { label: "En línea ($x^2$)", icon: <Sigma size={13} />, onClick: insertMathInline },
          {
            label: "Bloque ($$…$$)",
            icon: <SquareRadical size={13} />,
            onClick: insertMathBlock,
          },
        ],
      },
      {
        label: "Comentario",
        icon: <MessageSquareText size={13} />,
        shortcut: "%%",
        onClick: () => wrapSelection("%%", "%%", "comentario"),
      },
      { separator: true },
      { label: "Limpiar formato", icon: <Eraser size={13} />, onClick: clearFormatting },
    ];

    const paragraphEntries: MenuEntry[] = [
      { label: "Lista de viñetas", icon: <List size={13} />, onClick: () => toggleList("bullet") },
      {
        label: "Lista numerada",
        icon: <ListOrdered size={13} />,
        onClick: () => toggleList("number"),
      },
      { label: "Lista de tareas", icon: <ListTodo size={13} />, onClick: () => toggleList("task") },
      { separator: true },
      { label: "Título 1", icon: <Heading1 size={13} />, onClick: () => applyHeading(1) },
      { label: "Título 2", icon: <Heading2 size={13} />, onClick: () => applyHeading(2) },
      { label: "Título 3", icon: <Heading3 size={13} />, onClick: () => applyHeading(3) },
      { label: "Título 4", icon: <Heading4 size={13} />, onClick: () => applyHeading(4) },
      { label: "Título 5", icon: <Heading5 size={13} />, onClick: () => applyHeading(5) },
      { label: "Título 6", icon: <Heading6 size={13} />, onClick: () => applyHeading(6) },
      { label: "Cuerpo", icon: <AlignLeft size={13} />, onClick: () => applyHeading(0) },
      { separator: true },
      { label: "Cita", icon: <TextQuote size={13} />, onClick: applyQuote },
    ];

    return [
      { label: "Pegar", icon: <ClipboardPaste size={13} />, shortcut: "Ctrl+V", onClick: () => void pasteFromClipboard(false) },
      {
        label: "Pegar como texto sin formato",
        icon: <ClipboardType size={13} />,
        onClick: () => void pasteFromClipboard(true),
      },
      {
        label: "Seleccionar todo",
        icon: <TextSelect size={13} />,
        shortcut: "Ctrl+A",
        onClick: selectAllDoc,
      },
      { separator: true },
      {
        label: "Añade enlace",
        icon: <Link2 size={13} />,
        children: [
          {
            label: "Enlace a nota…",
            icon: <FileText size={13} />,
            onClick: () => {
              closeMenu();
              setPickerOpen(true);
            },
          },
          {
            label: "Enlace web…",
            icon: <ExternalLink size={13} />,
            onClick: () => {
              closeMenu();
              setLinkModal({ url: "", text: "" });
            },
          },
        ],
      },
      { separator: true },
      { label: "Formato", icon: <Type size={13} />, children: formatEntries },
      { separator: true },
      { label: "Párrafo", icon: <Pilcrow size={13} />, children: paragraphEntries },
      { separator: true },
      {
        label: "Renombrar este encabezado",
        icon: <Pencil size={13} />,
        disabled: !heading,
        onClick: openRenameModal,
      },
      {
        label: "Marcar este encabezado",
        icon: <Tag size={13} />,
        disabled: !heading,
        onClick: toggleMark,
      },
      {
        label: "Extraer este encabezado",
        icon: <FileOutput size={13} />,
        disabled: !heading,
        onClick: openExtractModal,
      },
    ];
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
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        ...(vimMode ? [vim()] : []),
        EditorView.lineWrapping,
        bracketMatching(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        autocompletion({
          override: [
            (context: CompletionContext): CompletionResult | null => {
              const word = context.matchBefore(/\[\[[^\]]*/);
              if (!word) return null;
              const typed = word.text.slice(2).toLowerCase();
              const options = (notes ?? [])
                .flatMap((note) => {
                  const aliases = (note as { aliases?: string[] }).aliases ?? [];
                  const items = [{ label: note.path, detail: note.title ?? note.path }];
                  for (const alias of aliases) items.push({ label: alias, detail: `${note.path} (alias)` });
                  return items;
                })
                .filter((item) => item.label.toLowerCase().includes(typed) || (item.detail ?? "").toLowerCase().includes(typed))
                .slice(0, 20)
                .map((item) => ({ label: item.label, detail: item.detail, apply: item.label }));
              if (options.length === 0) return null;
              return { from: word.to, options };
            },
            (context: CompletionContext): CompletionResult | null => {
            const word = context.matchBefore(/\/[\w-]*/);
            if (!word || word.from === word.to) return null;
            const options = [
              { label: "/h1", detail: "Encabezado 1", apply: "# " },
              { label: "/h2", detail: "Encabezado 2", apply: "## " },
              { label: "/h3", detail: "Encabezado 3", apply: "### " },
              { label: "/bullet", detail: "Lista con viñetas", apply: "- " },
              { label: "/numbered", detail: "Lista numerada", apply: "1. " },
              { label: "/quote", detail: "Cita", apply: "> " },
              { label: "/code", detail: "Bloque de código", apply: "```\n\n```" },
              { label: "/callout", detail: "Callout", apply: "> [!note] Título\n> " },
              { label: "/hr", detail: "Línea horizontal", apply: "---\n" },
              { label: "/task", detail: "Tarea", apply: "- [ ] " },
            ].filter((o) => o.label.startsWith(word.text));
            return { from: word.from, options };
          },
          ],
        }),
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
  }, [vimMode]);

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

  return (
    <div className="relative h-full overflow-hidden" onContextMenu={handleContextMenu}>
      <div ref={host} className="cm-host h-full" />

      {coarsePointer && !readOnly ? (
        <button
          type="button"
          aria-label="Abrir acciones de formato"
          title="Acciones de formato"
          onClick={() => setMenu({ sheet: true })}
          className="panel absolute bottom-4 right-4 z-10 grid h-11 w-11 place-items-center rounded-full shadow-2xl"
        >
          <MoreHorizontal size={18} />
        </button>
      ) : null}

      {menu && !readOnly && "sheet" in menu ? (
        <ContextBottomSheet
          title="Acciones de formato"
          entries={buildMenuEntries()}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {menu && !readOnly && "x" in menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={buildMenuEntries()}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {pickerOpen && notes ? (
        <NotePicker
          notes={notes}
          activeNoteId={activeNoteId}
          positionClass="left-1/2 top-24 -translate-x-1/2"
          onPick={(note) => {
            const target = note.path.replace(/\.md$/i, "");
            insertText(`[[${target}]]`);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {linkModal ? (
        <>
          <button
            type="button"
            aria-label="Cerrar formulario"
            className="fixed inset-0 z-[62] cursor-default bg-black/20"
            onClick={() => setLinkModal(null)}
          />
          <div className="panel fixed left-1/2 top-1/2 z-[63] w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden p-4 shadow-2xl">
            <h3 className="font-display mb-3 text-sm">Enlace web</h3>
            <label className="mb-3 block text-[11px] text-[var(--muted)]">
              URL
              <input
                autoFocus
                value={linkModal.url}
                onChange={(event) => setLinkModal({ ...linkModal, url: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setLinkModal(null);
                  if (event.key === "Enter") insertWebLink();
                }}
                placeholder="https://ejemplo.com"
                className="input mt-1 h-8 text-xs"
              />
            </label>
            <label className="mb-4 block text-[11px] text-[var(--muted)]">
              Texto (opcional)
              <input
                value={linkModal.text}
                onChange={(event) => setLinkModal({ ...linkModal, text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setLinkModal(null);
                  if (event.key === "Enter") insertWebLink();
                }}
                placeholder="Texto del enlace"
                className="input mt-1 h-8 text-xs"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                className="btn btn-ghost h-8 px-3 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={insertWebLink}
                disabled={!linkModal.url.trim()}
                className="btn h-8 px-3 text-xs"
              >
                Insertar
              </button>
            </div>
          </div>
        </>
      ) : null}

      {renameModal ? (
        <>
          <button
            type="button"
            aria-label="Cerrar formulario"
            className="fixed inset-0 z-[62] cursor-default bg-black/20"
            onClick={() => setRenameModal(null)}
          />
          <div className="panel fixed left-1/2 top-1/2 z-[63] w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden p-4 shadow-2xl">
            <h3 className="font-display mb-3 text-sm">Renombrar encabezado</h3>
            <label className="mb-4 block text-[11px] text-[var(--muted)]">
              Nuevo título
              <input
                autoFocus
                value={renameModal.value}
                onChange={(event) => setRenameModal({ ...renameModal, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenameModal(null);
                  if (event.key === "Enter") confirmRename();
                }}
                placeholder="Título del encabezado"
                className="input mt-1 h-8 text-xs"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="btn btn-ghost h-8 px-3 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRename}
                disabled={!renameModal.value.trim()}
                className="btn h-8 px-3 text-xs"
              >
                Renombrar
              </button>
            </div>
          </div>
        </>
      ) : null}

      {extractModal ? (
        <>
          <button
            type="button"
            aria-label="Cerrar confirmación"
            className="fixed inset-0 z-[62] cursor-default bg-black/20"
            onClick={() => setExtractModal(null)}
          />
          <div className="panel fixed left-1/2 top-1/2 z-[63] w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden p-4 shadow-2xl">
            <h3 className="font-display mb-3 text-sm">Extraer este encabezado</h3>
            <p className="mb-4 text-[11px] leading-relaxed text-[var(--text-soft)]">
              Se creará una nota nueva en la misma carpeta con la sección{" "}
              <strong>«{extractModal.title}»</strong> y se quitará de esta nota.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtractModal(null)}
                className="btn btn-ghost h-8 px-3 text-xs"
              >
                Cancelar
              </button>
              <button type="button" onClick={confirmExtract} className="btn h-8 px-3 text-xs">
                Extraer
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});

/** Rango activo: la selección, o la línea actual si la selección está vacía. */
function selectedRange(view: EditorView): { from: number; to: number } {
  const { from, to } = view.state.selection.main;
  if (from !== to) return { from, to };
  const line = view.state.doc.lineAt(from);
  return { from: line.from, to: line.to };
}
