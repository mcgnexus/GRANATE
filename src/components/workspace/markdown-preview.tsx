"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
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
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), "u", "mark", "span"])),
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
    return (
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

const PREVIEW_COMPONENTS: Components = {
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
  blockquote: editable("blockquote"),
  li: editable("li"),
  pre: editable("pre"),
  table: editable("table"),
};

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
  const bodyMatch = /^---[\s\S]*?---\s*/.exec(content);
  const bodyOffset = bodyMatch?.[0].length ?? 0;
  const body = content.slice(bodyOffset);
  let mappedMarkdown = {
    text: body,
    sourceMap: identitySourceMap(body.length, bodyOffset),
  };
  mappedMarkdown = transformWithSourceMap(
    mappedMarkdown.text,
    mappedMarkdown.sourceMap,
    /%%([\s\S]+?)%%/g,
    (match) => `<!-- ${match[1].replace(/--+/g, "·")} -->`,
  );
  mappedMarkdown = transformWithSourceMap(
    mappedMarkdown.text,
    mappedMarkdown.sourceMap,
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
      return `[${alias}](granate:${encodeURIComponent(target)})`;
    },
  );
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
    <PreviewContext.Provider value={context}>
      <div className="prose-granate px-6 py-8 sm:px-10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          // Sanitiza primero el HTML del usuario; KaTeX después añade su markup de confianza.
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
          components={PREVIEW_COMPONENTS}
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
      className="w-full resize-y rounded-lg border border-[var(--accent)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm leading-6 text-[var(--text)] outline-none ring-2 ring-[var(--accent-soft)]"
    />
  );
}
