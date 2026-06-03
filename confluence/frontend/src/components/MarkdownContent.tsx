import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/vs2015.css";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize, rehypeHighlight]}
      components={{
        pre({ children }) {
          const codeChild = React.isValidElement<{ className?: string }>(children) ? children : null;
          const className = codeChild?.props.className || "";
          const language = className.match(/language-([\w-]+)/)?.[1];

          return (
            <div className="code-block-wrapper">
              {language && (
                <div className="code-block-header">
                  <span className="code-block-lang">{language}</span>
                </div>
              )}
              <pre>{children}</pre>
            </div>
          );
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
  );
}
