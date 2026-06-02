import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, FileText, Save } from "lucide-react";

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  created_by_name: string;
  created_at: string;
}

interface TopicOrderProps {
  activeSpace: Space;
  pages: Page[];
  onBackClick: () => void;
  onSaveOrder: (spaceKey: string, orderedPageIds: string[]) => Promise<void>;
}

export default function TopicOrder({ activeSpace, pages, onBackClick, onSaveOrder }: TopicOrderProps) {
  const initialPages = useMemo(() => pages.filter(page => page.space_key === activeSpace.key), [pages, activeSpace.key]);
  const [orderedPages, setOrderedPages] = useState(initialPages);
  const [saving, setSaving] = useState(false);

  const moveTopic = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedPages.length) return;
    const nextPages = [...orderedPages];
    [nextPages[index], nextPages[nextIndex]] = [nextPages[nextIndex], nextPages[index]];
    setOrderedPages(nextPages);
  };

  const saveOrder = async () => {
    setSaving(true);
    try {
      await onSaveOrder(activeSpace.key, orderedPages.map(page => page.id));
      onBackClick();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="subview">
      <button className="btn-back" onClick={onBackClick}>
        <ArrowLeft size={14} />
        <span>Volver al workspace</span>
      </button>

      <div className="topic-order-shell">
        <div className="topic-order-header">
          <div>
            <span className="space-nav-badge">{activeSpace.key}</span>
            <h1>Ordenar temas</h1>
            <p className="text-muted">Acomoda los temas principales del workspace.</p>
          </div>
          <button type="button" className="btn-primary" onClick={saveOrder} disabled={saving}>
            <Save size={15} />
            <span>{saving ? "Guardando..." : "Guardar orden"}</span>
          </button>
        </div>

        <div className="topic-order-list">
          {orderedPages.length === 0 ? (
            <div className="subtopics-empty">Este workspace todavia no tiene temas.</div>
          ) : (
            orderedPages.map((page, index) => (
              <div key={page.id} className="topic-order-item">
                <div className="topic-order-main">
                  <span className="subtopic-order">{index + 1}</span>
                  <FileText size={16} />
                  <span>{page.title}</span>
                </div>
                <div className="topic-order-actions">
                  <button type="button" className="btn-icon subtle" onClick={() => moveTopic(index, -1)} disabled={index === 0} title="Subir">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" className="btn-icon subtle" onClick={() => moveTopic(index, 1)} disabled={index === orderedPages.length - 1} title="Bajar">
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
