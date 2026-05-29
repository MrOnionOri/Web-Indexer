import { BookOpen, FilePlus2, Library, Search, Save, Send, SquarePen } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api, KnowledgePage, KnowledgeSpace, WikiPageStatus } from "../api";
import { EmptyState, StatusBadge } from "../components/ui";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function KnowledgeView({
  spaces,
  pages,
  permissions,
  refresh,
}: {
  spaces: KnowledgeSpace[];
  pages: KnowledgePage[];
  permissions: string[];
  refresh: () => void;
}) {
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    slug: "",
    summary: "",
    content: "",
    status: "draft" as WikiPageStatus,
  });

  const can = useMemo(() => new Set(permissions), [permissions]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const activeSpaceId = selectedSpaceId || selectedPage?.space_id || spaces[0]?.id || "";
  const visiblePages = pages.filter((page) => {
    const matchesSpace = !selectedSpaceId || page.space_id === selectedSpaceId;
    const term = query.toLowerCase().trim();
    const matchesQuery =
      !term ||
      page.title.toLowerCase().includes(term) ||
      page.summary.toLowerCase().includes(term) ||
      page.content.toLowerCase().includes(term);
    return matchesSpace && matchesQuery;
  });
  const activeSpace = spaces.find((space) => space.id === activeSpaceId);

  function startNewPage() {
    setSelectedPageId("");
    setIsEditing(true);
    setMessage("");
    setDraft({ title: "", slug: "", summary: "", content: "", status: "draft" });
  }

  function startEdit(page: KnowledgePage) {
    setSelectedPageId(page.id);
    setIsEditing(true);
    setMessage("");
    setDraft({
      title: page.title,
      slug: page.slug,
      summary: page.summary,
      content: page.content,
      status: page.status,
    });
  }

  async function saveSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("spaceName"));
    const slug = slugify(String(form.get("spaceSlug") || name));
    const description = String(form.get("spaceDescription") ?? "");
    try {
      await api.createKnowledgeSpace(name, slug, description);
      event.currentTarget.reset();
      setMessage("Espacio creado.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el espacio");
    }
  }

  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const normalizedSlug = slugify(draft.slug || draft.title);
    try {
      if (selectedPageId) {
        await api.updateKnowledgePage(selectedPageId, { ...draft, slug: normalizedSlug });
        setMessage("Página actualizada.");
      } else {
        await api.createKnowledgePage(activeSpaceId, draft.title, normalizedSlug, draft.summary, draft.content, draft.status);
        setMessage("Página creada.");
      }
      setIsEditing(false);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la página");
    }
  }

  async function publishPage(page: KnowledgePage, status: WikiPageStatus) {
    setMessage("");
    try {
      await api.updateKnowledgePage(page.id, { status });
      setMessage(status === "published" ? "Página publicada." : "Página archivada.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado");
    }
  }

  return (
    <div className="knowledge-layout">
      <section className="knowledge-sidebar table-surface">
        <div className="knowledge-section-title">
          <Library />
          <h3>Espacios</h3>
        </div>
        <button className={`space-button ${selectedSpaceId === "" ? "active" : ""}`} onClick={() => setSelectedSpaceId("")}>
          Todo el índice
        </button>
        {spaces.map((space) => (
          <button
            className={`space-button ${selectedSpaceId === space.id ? "active" : ""}`}
            key={space.id}
            onClick={() => setSelectedSpaceId(space.id)}
          >
            <strong>{space.name}</strong>
            <span>{space.description || `/${space.slug}`}</span>
          </button>
        ))}
        {can.has("knowledge:create") && (
          <form className="space-form" onSubmit={saveSpace}>
            <input name="spaceName" placeholder="Nuevo espacio" required minLength={2} />
            <input name="spaceSlug" placeholder="slug-del-espacio" />
            <textarea name="spaceDescription" placeholder="Descripción" rows={3} />
            <button className="secondary-action" type="submit">
              <FilePlus2 />
              Crear espacio
            </button>
          </form>
        )}
      </section>

      <section className="knowledge-index table-surface">
        <div className="split-toolbar">
          <label className="search-box">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en el conocimiento" />
          </label>
          {can.has("knowledge:create") && (
            <button className="primary compact" onClick={startNewPage} disabled={!activeSpaceId}>
              Nueva página
            </button>
          )}
        </div>
        {visiblePages.length === 0 && <EmptyState text="Todavía no hay páginas para este filtro." />}
        {visiblePages.map((page) => (
          <button
            className={`page-list-item ${selectedPage?.id === page.id ? "active" : ""}`}
            key={page.id}
            onClick={() => {
              setSelectedPageId(page.id);
              setIsEditing(false);
            }}
          >
            <BookOpen />
            <span>
              <strong>{page.title}</strong>
              <small>{page.summary || page.slug}</small>
            </span>
            <StatusBadge value={page.status} />
          </button>
        ))}
      </section>

      <section className="knowledge-reader table-surface">
        {message && <p className="form-note">{message}</p>}
        {isEditing ? (
          <form className="knowledge-editor" onSubmit={savePage}>
            <div className="editor-grid">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Título"
                required
                minLength={2}
              />
              <input
                value={draft.slug}
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
                placeholder="slug-de-la-pagina"
              />
            </div>
            <input
              value={draft.summary}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              placeholder="Resumen breve"
              maxLength={255}
            />
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              placeholder="Contenido tipo wiki, guías, decisiones, runbooks o notas técnicas"
              rows={15}
            />
            <div className="editor-actions">
              <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as WikiPageStatus }))}>
                <option value="draft">Borrador</option>
                <option value="published" disabled={!can.has("knowledge:publish")}>
                  Publicado
                </option>
                <option value="archived" disabled={!can.has("knowledge:publish")}>
                  Archivado
                </option>
              </select>
              <button className="secondary-action" type="button" onClick={() => setIsEditing(false)}>
                Cancelar
              </button>
              <button className="primary compact" type="submit">
                <Save />
                Guardar
              </button>
            </div>
          </form>
        ) : selectedPage ? (
          <article className="wiki-page">
            <div className="wiki-page-header">
              <div>
                <span className="eyebrow">{activeSpace?.name ?? "Knowledge base"}</span>
                <h3>{selectedPage.title}</h3>
                <p>{selectedPage.summary}</p>
              </div>
              <StatusBadge value={selectedPage.status} />
            </div>
            <pre>{selectedPage.content || "Página sin contenido todavía."}</pre>
            <div className="reader-actions">
              {can.has("knowledge:edit") && (
                <button className="secondary-action" onClick={() => startEdit(selectedPage)}>
                  <SquarePen />
                  Editar
                </button>
              )}
              {can.has("knowledge:publish") && selectedPage.status !== "published" && (
                <button className="primary compact" onClick={() => publishPage(selectedPage, "published")}>
                  <Send />
                  Publicar
                </button>
              )}
              {can.has("knowledge:publish") && selectedPage.status !== "archived" && (
                <button className="secondary-action danger" onClick={() => publishPage(selectedPage, "archived")}>
                  Archivar
                </button>
              )}
            </div>
          </article>
        ) : (
          <EmptyState text="Selecciona o crea una página para empezar la base de conocimiento." />
        )}
      </section>
    </div>
  );
}
