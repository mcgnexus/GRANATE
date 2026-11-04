"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { hideComments } from "@/lib/markdown/comments";

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
    mark: [...(defaultSchema.attributes?.mark ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: Array.from(new Set([...(defaultSchema.protocols?.href ?? []), "granate"])),
  },
};

function wikilinksToMarkdown(
  content: string,
  vaultId: string,
  attachmentUrl?: (target: string) => string,
): string {
  return content.replace(/(!)?\[\[([^\]]+?)\]\]/g, (full, embed: string | undefined, inner: string) => {
    const target = inner.split("|")[0].split("#")[0].trim();
    const alias = inner.includes("|") ? inner.split("|").slice(1).join("|") : target;
    if (embed && IMAGE_RE.test(target)) {
      const src =
        attachmentUrl?.(target) ??
        `/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(target)}`;
      return `![${alias}](${src})`;
    }
    return `[${alias}](granate:${encodeURIComponent(target)})`;
  });
}

export function MarkdownPreview({
  content,
  vaultId,
  onOpenNote,
  attachmentUrl,
}: {
  content: string;
  vaultId: string;
  onOpenNote: (path: string) => void;
  attachmentUrl?: (target: string) => string;
}) {
  const body = content.replace(/^---[\s\S]*?---\s*/, "");
  const markdown = wikilinksToMarkdown(hideComments(body), vaultId, attachmentUrl);

  const components: Components = {
    a: ({ href, children, className }) => {
      if (href?.startsWith("granate:")) {
        const path = decodeURIComponent(href.slice("granate:".length));
        return (
          <a
            href="#"
            className={`wiki-link ${className ?? ""}`}
            onClick={(event) => {
              event.preventDefault();
              onOpenNote(path);
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
    },
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" />
    ),
    input: ({ type, checked }) =>
      type === "checkbox" ? (
        <input type="checkbox" checked={checked} readOnly className="mr-1.5 align-middle" />
      ) : null,
  };

  return (
    <div className="prose-granate px-6 py-8 sm:px-10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // Sanitiza primero el HTML del usuario; KaTeX después añade su markup de confianza.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
        components={components}
        urlTransform={(url) => url}
      >
        {markdown || "_Nota vacía._"}
      </ReactMarkdown>
    </div>
  );
}
