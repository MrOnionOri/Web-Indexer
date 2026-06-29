import React, { ReactNode, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeOptions } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/vs2015.css";

interface MarkdownContentProps {
  content: string;
  variant?: "default" | "chat";
}

interface CodeBlockProps {
  children: ReactNode;
  language?: string;
  variant: "default" | "chat";
}

const markdownSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      "href",
      "title"
    ],
    img: [
      ...(defaultSchema.attributes?.img || []),
      "alt",
      "title",
      "width",
      "height"
    ]
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"]
  }
};

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (React.isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return "";
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function CodeBlock({ children, language, variant }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = textFromNode(children).replace(/\n$/, "");
  const label = language || "codigo";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`code-block-wrapper ${variant === "chat" ? "code-block-chat" : ""}`}>
      <div className="code-block-header">
        <span className="code-block-lang">{label}</span>
        <button type="button" className="code-block-copy" onClick={copyCode} title={copied ? "Codigo copiado" : "Copiar codigo"}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export default function MarkdownContent({ content, variant = "default" }: MarkdownContentProps) {
  return (
    <div className={`markdown-content markdown-content-${variant}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema], rehypeHighlight]}
        components={{
          a({ href, children, ...props }) {
            const linkHref = href || "";
            const external = isExternalHref(linkHref);
            return (
              <a
                href={linkHref}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                {...props}
              >
                {children}
                {external && <ExternalLink className="markdown-link-icon" size={13} aria-hidden="true" />}
              </a>
            );
          },
          img({ alt, ...props }) {
            return (
              <img
                alt={alt || ""}
                loading="lazy"
                decoding="async"
                {...props}
              />
            );
          },
          pre({ children }) {
            const codeChild = React.isValidElement<{ className?: string }>(children) ? children : null;
            const className = codeChild?.props.className || "";
            const language = className.match(/language-([\w-]+)/)?.[1];
            return <CodeBlock language={language} variant={variant}>{children}</CodeBlock>;
          },
          code({ className, children, ...props }) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
