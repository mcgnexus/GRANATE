"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|avif|bmp)$/i;

const schema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), "u"])),
  protocols: {
    ...defaultSchema.protocols,
    href: Array.from(new Set([...(defaultSchema.protocols?.href ?? []), "granate"])),
  },
};

function wikilinksToMarkdown(content: string, vaultId: string): string {
  return content.replace(/(!)?\[\[([^\]]+?)\]\]/g, (full, embed: string | undefined, inner: string) => {
    const target = inner.split("|")[0].split("#")[0].trim();
    const alias = inner.includes("|") ? inner.split("|").slice(1).join("|") : target;
    if (embed && IMAGE_RE.test(target)) {
      return `![${alias}](/api/v1/vaults/${vaultId}/attachments?path=${encodeURIComponent(target)})`;
    }
    return `[${alias}](granate:${encodeURIComponent(target)})`;
  });
}

export function MarkdownPreview({
  content,
  vaultId,
  onOpenNote,
}: {
  content: string;
  vaultId: string;
  onOpenNote: (path: string) => void;
}) {
  const body = content.replace(/^---[\s\S]*?---\s*/, "");
  const markdown = wikilinksToMarkdown(body, vaultId);

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
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={components}
        urlTransform={(url) => url}
      >
        {markdown || "_Nota vacía._"}
      </ReactMarkdown>
    </div>
  );
}
