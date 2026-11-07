"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import { HoverPreview } from "@/components/workspace/hover-preview";
import "katex/dist/katex.min.css";
import {
  identitySourceMap,
  replaceSourceRange,
  transformWithSourceMap,
} from "@/lib/markdown/source-map";

const IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp)$/i;

/**
 * El sanitizador corre ANTES de KaTeX (que genera markup de confianza) y permite
 * `mark`/`span` con clases de color para los resaltados y textos coloreados que
 * inserta el editor. No se permite `style`, así que no hay vía de XSS por CSS.
 */
const schema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), "u", "mark", "span", "transclusion"])),
  attributes: {
    ...defaultSchema.attributes,
    // El schema base solo permite clases language-* en <code>; sin esto,
    // rehype-katex pierde math-display y renderiza los bloques $$…$$ como inline.
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^math-/]],
    mark: [...(defaultSchema.attributes?.mark ?? []), ["className", /^[a-zA-Z0-9 _-]+$/]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^[a-zA-Z0-9 _-]+$/]],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: Array.from(new Set([...(defaultSchema.protocols?.href ?? []), "granate"])),
  },
};

type SourcePosition = { start?: { offset?: number }; end?: { offset?: number } };
type PreviewBlock = { start: number; end: number; source: string; tag: string };
type EditableBlockProps = React.HTMLAttributes<HTMLElement> & ExtraProps;
type PreviewContextValue = {
  content: string;
  sourceMap: number[];
  canEdit: boolean;
  activeBlock: PreviewBlock | null;
  onOpenNote: (path: string) => void;
  onChange?: (content: string) => void;
  onEditConflict?: () => void;
  setActiveBlock: (block: PreviewBlock | null) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);
const VaultIdContext = createContext<string>("");

function editable(tag: string) {
  return function EditableBlock({ node, children, ...props }: EditableBlockProps) {
    const context = useContext(PreviewContext);
    if (!context) return React.createElement(tag, props, children);

    const position = node?.position as SourcePosition | undefined;
    const generatedStart = position?.start?.offset;
    const generatedEnd = position?.end?.offset;
    const sourceStart = generatedStart === undefined ? undefined : context.sourceMap[generatedStart];
    const sourceEnd = generatedEnd === undefined ? undefined : context.sourceMap[generatedEnd];
    const block = context.activeBlock;
    const active =
      block !== null &&
      sourceStart === block.start &&
      sourceEnd === block.end &&
      tag === block.tag;

    if (active) {
      const editor = (
        <BlockSourceEditor
          value={block.source}
          onCommit={(value) => {
            context.setActiveBlock(null);
            if (!context.canEdit || value === block.source || !context.onChange) return;
            const updated = replaceSourceRange(
              context.content,
              block.start,
              block.end,
              block.source,
              value,
            );
            if (updated === null) {
              context.onEditConflict?.();
              return;
            }
            context.onChange(updated);
          }}
          onCancel={() => context.setActiveBlock(null)}
        />
      );
      if (tag === "pre" || tag === "table") return <div className="my-3">{editor}</div>;
      return React.createElement(tag, props, editor);
    }

    const onClick = (event: React.MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest("a, button, input, textarea, select")) {
        event.stopPropagation();
        return;
      }
      if (!context.canEdit || sourceStart === undefined || sourceEnd === undefined) return;
      event.stopPropagation();
      context.setActiveBlock({
        start: sourceStart,
        end: sourceEnd,
        source: context.content.slice(sourceStart, sourceEnd),
        tag,
      });
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onClick(event as unknown as React.MouseEvent<HTMLElement>);
    };

    return React.createElement(
      tag,
      {
        ...props,
        onClick: context.canEdit ? onClick : props.onClick,
        onKeyDown: context.canEdit ? onKeyDown : props.onKeyDown,
        tabIndex: context.canEdit ? 0 : props.tabIndex,
        className: `${props.className ?? ""}${context.canEdit ? " preview-editable-block" : ""}`,
      },
      children,
    );
  };
}

function PreviewAnchor({ href, children, className }: React.ComponentProps<"a">) {
  const context = useContext(PreviewContext);
  if (href?.startsWith("granate:") && context) {
    const path = decodeURIComponent(href.slice("granate:".length));
    const vaultId = useContext(VaultIdContext);
    return (
      <HoverPreview vaultId={vaultId} path={path}>
        <a
          href="#"
          className={`wiki-link ${className ?? ""}`}
          onClick={(event) => {
            event.preventDefault();
            context.onOpenNote(path);
          }}
        >
          {children}
        </a>
      </HoverPreview>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
    </a>
  );
}

function PreviewImage({ src, alt }: React.ComponentProps<"img">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" />
  );
}

function PreviewInput({ type, checked }: React.ComponentProps<"input">) {
  return type === "checkbox" ? (
    <input type="checkbox" checked={checked} readOnly className="mr-1.5 align-middle" />
  ) : null;
}

const PREVIEW_COMPONENTS = {
  a: PreviewAnchor,
  img: PreviewImage,
  input: PreviewInput,
  p: editable("p"),
  h1: editable("h1"),
  h2: editable("h2"),
  h3: editable("h3"),
  h4: editable("h4"),
  h5: editable("h5"),
  h6: editable("h6"),
  blockquote: function CalloutBlockquote({ children, ...props }: React.ComponentProps<"blockquote">) {
    const first = Array.isArray(children) ? children[0] : children;
    const text = typeof first === "string" ? first : "";
    const match = /^\[!(\w+)\](?:\s+(.*))?$/m.exec(text.trim());
    if (match) {
      const type = match[1].toLowerCase();
      const title = match[2]?.trim() || type;
      const rest = Array.isArray(children) ? children.slice(1) : null;
      return (
        <div className={`callout callout-${type}`} data-callout={type}>
          <div className="callout-title">{title}</div>
          <div className="callout-content">{rest}</div>
        </div>
      );
    }
    return editable("blockquote")({ children, ...props } as never);
  },
  li: editable("li"),
  pre: editable("pre"),
  code: function MermaidCode({ className, children }: React.ComponentProps<"code">) {
    const isMermaid = className?.includes("language-mermaid");
    if (isMermaid) {
      const code = Array.isArray(children) ? children.join("") : String(children ?? "");
      return <MermaidDiagram code={code} />;
    }
    return <code className={className}>{children}</code>;
  },
  table: editable("table"),
  transclusion: function TransclusionComp({ vault, note, fragment, block }: { vault: string; note: string; fragment: string; block: string }) {
    return <TransclusionView vaultId={vault} notePath={decodeURIComponent(note)} fragment={decodeURIComponent(fragment)} isBlock={block === "true"} />;
  },
};


function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async (mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
      try {
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (!cancelled) setSvg(result.svg);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error Mermaid");
      }
    });
    return () => { cancelled = true; };
  }, [code]);
  if (error) return <pre className="text-[11px] text-red-400">{error}</pre>;
  return <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}


function TransclusionView({ vaultId, notePath, fragment, isBlock }: { vaultId: string; notePath: string; fragment: string; isBlock: boolean }) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/v1/vaults/${vaultId}/notes?path=${encodeURIComponent(notePath.endsWith(".md") ? notePath : `${notePath}.md`)}`);
        if (!response.ok) { if (!cancelled) { setHtml("Nota no encontrada."); setLoading(false); } return; }
        const data = (await response.json()) as { note?: { content?: string } };
        const content = data.note?.content ?? "";
        // extract section by heading or block id
        let extracted = "";
        if (isBlock && fragment) {
          const re = new RegExp(`\\^${fragment}\\b`, "m");
          // find paragraph containing the block id
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) { extracted = lines[i].replace(/\^\w+/, "").trim(); break; }
          }
        } else if (fragment) {
          const found = content.split("\n").reduce<{ start: number; end: number } | null>((acc, _line, idx, arr) => {
            if (acc) return acc;
            const headingRe = new RegExp(`^#{1,6}\\s+${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
            if (headingRe.test(arr[idx])) {
              let end = arr.length;
              for (let j = idx + 1; j < arr.length; j++) {
                if (/^#{1,6}\s/.test(arr[j])) { end = j; break; }
              }
              return { start: idx, end };
            }
            return null;
          }, null);
          if (found) extracted = content.split("\n").slice(found.start + 1, found.end).join("\n").trim();
        } else {
          extracted = content.trim();
        }
        if (!cancelled) { setHtml(extracted || "Sin contenido."); setLoading(false); }
      } catch {
        if (!cancelled) { setHtml("Error al cargar."); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [vaultId, notePath, fragment, isBlock]);
  return (
    <div className="my-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[12px]">
      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
        {isBlock ? "Bloque" : "Sección"} de {decodeURIComponent(notePath)}
      </div>
      {loading ? <span className="text-[var(--muted)]">Cargando…</span> : <div className="whitespace-pre-wrap">{html}</div>}
    </div>
  );
}

export function MarkdownPreview({
  content,
  vaultId,
  onOpenNote,
  attachmentUrl,
  canEdit = false,
  onChange,
  onEditConflict,
}: {
  content: string;
  vaultId: string;
  onOpenNote: (path: string) => void;
  attachmentUrl?: (target: string) => string;
  canEdit?: boolean;
  onChange?: (content: string) => void;
  onEditConflict?: () => void;
}) {
  const [activeBlock, setActiveBlock] = useState<PreviewBlock | null>(null);
  const mappedMarkdown = useMemo(() => {
    const bodyMatch = /^---[\s\S]*?---\s*/.exec(content);
    const bodyOffset = bodyMatch?.[0].length ?? 0;
    const body = content.slice(bodyOffset);
    let result = {
      text: body,
      sourceMap: identitySourceMap(body.length, bodyOffset),
    };
    result = transformWithSourceMap(
      result.text,
      result.sourceMap,
      /%%([\s\S]+?)%%/g,
      (match) => `<!-- ${match[1].replace(/--+/g, "·")} -->`,
    );
    result = transformWithSourceMap(
      result.text,
      result.sourceMap,
      /(!)?\[\[([^\]]+?)\]\]/g,
      (match) => {
        const embed = match[1];
        const inner = match[2];
        const target = inner.split("|")[0].split("#")[0].trim();
        const alias = inner.includes("|") ? inner.split("|").slice(1).join("|") : target;
        if (embed && IMAGE_RE.test(target)) {
          const src =
            attachmentUrl?.(target) ??
            `/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(target)}`;
          return `![${alias}](${src})`;
        }
        if (embed && (target.includes("#") || target.includes("^"))) {
          const [notePath, fragment] = target.split("#");
          const heading = fragment?.replace(/^\^/, "") ?? "";
          const isBlock = fragment?.startsWith("^") ?? false;
          return `<transclusion vault="${vaultId}" note="${encodeURIComponent(notePath)}" fragment="${encodeURIComponent(heading)}" block="${isBlock}" />`;
        }
        return `[${alias}](granate:${encodeURIComponent(target)})`;
      },
    );
    return result;
  }, [content, vaultId, attachmentUrl]);
  const markdown = mappedMarkdown.text;

  const context: PreviewContextValue = {
    content,
    sourceMap: mappedMarkdown.sourceMap,
    canEdit,
    activeBlock,
    onOpenNote,
    onChange,
    onEditConflict,
    setActiveBlock,
  };

  return (
    <VaultIdContext.Provider value={vaultId}>
      <PreviewContext.Provider value={context}>
      <div className="prose-granate px-6 py-8 sm:px-10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          // Sanitiza primero el HTML del usuario; KaTeX después añade su markup de confianza.
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
          components={PREVIEW_COMPONENTS as Components}
          urlTransform={(url) => {
            if (url.startsWith("granate:")) return url;
            if (/^(https?:|mailto:)/i.test(url)) return url;
            if (url.startsWith("//")) return "";
            if (url.startsWith("/") || url.startsWith("#")) return url;
            return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? "" : url;
          }}
        >
          {markdown || "_Nota vacía._"}
        </ReactMarkdown>
      </div>
    </PreviewContext.Provider>
      </VaultIdContext.Provider>
  );
}

function BlockSourceEditor({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  const [draft, setDraft] = useState(value);

  const resize = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  };

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    resize(node);
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const commit = (value: string) => {
    if (finished.current) return;
    finished.current = true;
    onCommit(value);
  };

  return (
    <textarea
      ref={textarea}
      autoFocus
      value={draft}
      rows={1}
      aria-label="Editar bloque Markdown"
      title="Clic fuera o Ctrl/⌘+Enter para aplicar; Escape para cancelar"
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        resize(event.currentTarget);
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finished.current = true;
          onCancel();
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
      className="w-full resize-y rounded-lg border border-[var(--accent)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm leading-6 text-[var(--text)] outline-none ring-2 ring-[var(--accent-soft)] focus-visible:ring-[var(--accent)]"
    />
  );
}
