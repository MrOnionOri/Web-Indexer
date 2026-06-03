import React, { useRef } from "react";
import MarkdownContent from "./MarkdownContent";

export type EditorMode = "split" | "visual" | "markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  textareaId?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  mode,
  onModeChange,
  textareaId,
  rows = 15,
  placeholder = "Escribe aqui en formato Markdown...",
  required = false,
  emptyTitle = "Empieza tu pagina",
  emptyMessage = "Escribe en Markdown y veras el resultado aqui en tiempo real."
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertText = (before: string, after = "", fallback = "") => {
    if (mode === "visual") {
      onModeChange("split");
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${before}${fallback}${after}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + before.length + selected.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleToolbarInsert = (tag: string) => {
    if (tag === "h1") insertText("# ", "", "Titulo 1");
    if (tag === "h2") insertText("## ", "", "Titulo 2");
    if (tag === "bold") insertText("**", "**", "texto");
    if (tag === "italic") insertText("*", "*", "texto");
    if (tag === "code") insertText("`", "`", "codigo");
    if (tag === "list") insertText("- ", "", "Elemento");
    if (tag.startsWith("code-block:")) {
      const language = tag.split(":")[1] || "";
      insertText(`\n\`\`\`${language}\n`, "\n```\n", "codigo");
    }
  };

  const renderTextarea = () => (
    <textarea
      ref={textareaRef}
      id={textareaId}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    />
  );

  const renderPreview = () => (
    <div className="page-content editor-visual-content">
      {value.trim() ? (
        <MarkdownContent content={value} />
      ) : (
        <div className="editor-empty-state">
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
          {mode === "visual" && (
            <button type="button" className="btn-secondary" onClick={() => onModeChange("split")}>
              Escribir contenido
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        <div className="editor-mode-toggle" role="tablist" aria-label="Modo de edicion">
          <button type="button" className={`editor-mode-btn ${mode === "split" ? "active" : ""}`} onClick={() => onModeChange("split")}>
            Visual + Markdown
          </button>
          <button type="button" className={`editor-mode-btn ${mode === "visual" ? "active" : ""}`} onClick={() => onModeChange("visual")}>
            Visual
          </button>
          <button type="button" className={`editor-mode-btn ${mode === "markdown" ? "active" : ""}`} onClick={() => onModeChange("markdown")}>
            Markdown
          </button>
        </div>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("h1")}>H1</button>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("h2")}>H2</button>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("bold")}>B</button>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("italic")}>I</button>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("code")}>Code</button>
        <button type="button" className="toolbar-btn" onClick={() => handleToolbarInsert("list")}>List</button>
        <select
          className="toolbar-select"
          onChange={(e) => {
            const language = e.target.value;
            if (language) {
              handleToolbarInsert(`code-block:${language}`);
              e.target.value = "";
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>Bloque de codigo...</option>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="sql">SQL</option>
          <option value="bash">Bash / Shell</option>
          <option value="json">JSON</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
        </select>
      </div>

      <div className="editor-body">
        {mode === "split" && (
          <div className="editor-split">
            <div className="editor-pane editor-source-pane">
              <div className="editor-pane-header">Markdown</div>
              {renderTextarea()}
            </div>
            <div className="editor-pane editor-preview-pane">
              <div className="editor-pane-header">Visual</div>
              {renderPreview()}
            </div>
          </div>
        )}
        {mode === "visual" && renderPreview()}
        {mode === "markdown" && renderTextarea()}
      </div>
    </div>
  );
}
