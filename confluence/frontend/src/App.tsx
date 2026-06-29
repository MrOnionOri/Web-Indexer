import React, { useState, useEffect, useMemo, useRef, FormEvent } from "react";
import { X } from "lucide-react";

// Import modular components
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./components/Dashboard";
import PageRead from "./components/PageRead";
import PageEdit from "./components/PageEdit";
import AdminPanel from "./components/AdminPanel";
import FeedbackModal from "./components/FeedbackModal";
import AiChatModal from "./components/AiChatModal";
import SpaceSettings from "./components/SpaceSettings";
import TopicOrder from "./components/TopicOrder";
import MarkdownContent from "./components/MarkdownContent";
import { api, Comment, Page, Space, UserListItem, UserProfile } from "./api";

export default function App() {
  // Auth states
  const [token, setToken] = useState<string | null>("cookie-session");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Business states
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [activeSpaceFilter, setActiveSpaceFilter] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [activeSubtopicIndex, setActiveSubtopicIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentView, setCurrentView] = useState<"dashboard" | "read" | "edit" | "admin" | "space-settings" | "topic-order">("dashboard");

  // Theme states
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("gatewiki_theme") as "dark" | "light") || "dark"
  );

  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
    localStorage.setItem("gatewiki_theme", theme);
  }, [theme]);

  // Space creation modal states
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceKey, setNewSpaceKey] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [newSpaceIsRestricted, setNewSpaceIsRestricted] = useState(false);
  const [newSpaceAllowedEmails, setNewSpaceAllowedEmails] = useState("");
  const [newSpaceSearchText, setNewSpaceSearchText] = useState("");
  const [newSpaceDropdownOpen, setNewSpaceDropdownOpen] = useState(false);


  // Space edit modal states
  const [editSpaceId, setEditSpaceId] = useState<string | null>(null);
  const [editSpaceName, setEditSpaceName] = useState("");
  const [editSpaceKey, setEditSpaceKey] = useState("");
  const [editSpaceDesc, setEditSpaceDesc] = useState("");
  const [editSpaceIsRestricted, setEditSpaceIsRestricted] = useState(false);
  const [editSpaceAllowedEmails, setEditSpaceAllowedEmails] = useState("");

  // Edit/Create page states
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [editPageTitle, setEditPageTitle] = useState("");
  const [editPageSpace, setEditPageSpace] = useState("");
  const [editPageContent, setEditPageContent] = useState("");
  const [editPageSubtopics, setEditPageSubtopics] = useState("");
  const [editPageIsRestricted, setEditPageIsRestricted] = useState(false);
  const [editPageAllowedEmails, setEditPageAllowedEmails] = useState("");
  const [editPageCommentsAllowed, setEditPageCommentsAllowed] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const routeRequestRef = useRef(0);

  // Admin states
  const [seedSuccessMsg, setSeedSuccessMsg] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);

  // Permissions helper
  const perms = useMemo(() => new Set(currentUser?.permissions || []), [currentUser]);
  const hasView = perms.has("gatewiki:view") || !!currentUser?.is_platform_admin;
  const hasCreateSpace = perms.has("gatewiki:create_workspace") || perms.has("gatewiki:create") || !!currentUser?.is_platform_admin;
  const hasCreatePage = perms.has("gatewiki:create_page") || perms.has("gatewiki:create") || !!currentUser?.is_platform_admin;
  const hasEditSpace = perms.has("gatewiki:edit_workspace") || perms.has("gatewiki:edit") || !!currentUser?.is_platform_admin;
  const hasEditPage = perms.has("gatewiki:edit_page") || perms.has("gatewiki:edit") || !!currentUser?.is_platform_admin;
  const hasDeleteSpace = perms.has("gatewiki:delete_workspace") || perms.has("gatewiki:delete") || !!currentUser?.is_platform_admin;
  const hasDeletePage = perms.has("gatewiki:delete_page") || perms.has("gatewiki:delete") || !!currentUser?.is_platform_admin;
  const hasAdmin = perms.has("gatewiki:admin") || !!currentUser?.is_platform_admin;


  // Initial validation
  useEffect(() => {
    if (token) {
      validateTokenAndInit(token);
    } else {
      setInitialLoading(false);
    }
  }, [token]);

  // Auto-refresh when authenticated
  useEffect(() => {
    if (currentUser && token) {
      refreshData();
    }
  }, [currentUser, token]);

  // Sincronizar campos de edición de espacio en vista de configuración
  useEffect(() => {
    if (currentView === "space-settings" && activeSpaceFilter && spaces.length > 0) {
      const spaceObj = spaces.find(s => s.key.toUpperCase() === activeSpaceFilter.toUpperCase());
      if (spaceObj) {
        setEditSpaceId(spaceObj.id);
        setEditSpaceName(spaceObj.name);
        setEditSpaceKey(spaceObj.key);
        setEditSpaceDesc(spaceObj.description);
        setEditSpaceIsRestricted(!!spaceObj.is_restricted);
        setEditSpaceAllowedEmails(spaceObj.allowed_emails || "");
      }
    }
  }, [spaces, currentView, activeSpaceFilter]);


  const validateTokenAndInit = async (jwtToken: string) => {
    try {
      localStorage.removeItem("gatewiki_token");
      document.cookie = "gatestack_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
      const profile = await api.me(jwtToken);
      const hasViewPermission = profile.permissions.includes("gatewiki:view") || profile.is_platform_admin;

      if (!hasViewPermission) {
        setToken(null);
        setLoginError("Acceso denegado: No tienes el permiso 'gatewiki:view'.");
      } else {
        setCurrentUser(profile);
      }
    } catch (err) {
      setToken(null);
      if (jwtToken !== "cookie-session") {
        setLoginError("Sesion invalida o conexion perdida con GateStack.");
      }
    } finally {
      setInitialLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      const [spacesData, pagesData, usersData] = await Promise.all([
        api.spaces(token),
        api.pages(token),
        api.users(token)
      ]);
      setSpaces(spacesData);
      setPages(pagesData);
      setAllUsers(usersData);
    } catch (error) {
      console.error("Error al refrescar datos:", error);
    }
  };

  // --- HTML5 HISTORY ROUTING ---
  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    handleRouting();
  };

  const handleRouting = async () => {
    if (!token) return;
    const path = window.location.pathname;
    const routeRequest = ++routeRequestRef.current;

    if (!path.startsWith("/page/")) {
      setActivePage(null);
      setComments([]);
    }

    if (path === "/" || path === "/dashboard") {
      setCurrentView("dashboard");
      setActiveSpaceFilter(null);
      setActiveSubtopicIndex(null);
    } else if (path.startsWith("/space/")) {
      if (path.endsWith("/order")) {
        const key = path.substring(7, path.length - 6);
        setCurrentView("topic-order");
        setActiveSpaceFilter(key.toUpperCase());
        setActiveSubtopicIndex(null);
      } else if (path.endsWith("/settings")) {
        const key = path.substring(7, path.length - 9);
        setCurrentView("space-settings");
        setActiveSpaceFilter(key.toUpperCase());
        setActiveSubtopicIndex(null);
      } else {
        const key = path.substring(7);
        setCurrentView("dashboard");
        setActiveSpaceFilter(key.toUpperCase());
        setActiveSubtopicIndex(null);
      }
    } else if (path.startsWith("/page/")) {
      const segments = path.split("/").filter(Boolean);
      const id = segments[1];
      const subtopicIndex = segments[2] === "subtopic" ? Number.parseInt(segments[3] || "", 10) : null;
      setCurrentView("read");
      setActivePage(null);
      await fetchAndSetActivePage(id, Number.isFinite(subtopicIndex) ? subtopicIndex : null, routeRequest, path);
    } else if (path === "/edit") {
      setCurrentView("edit");
      setActiveSubtopicIndex(null);
      setEditPageId(null);
      setEditPageTitle("");
      setEditPageSpace(activeSpaceFilter || "");
      setEditPageContent("");
      setEditPageSubtopics("");
      setEditPageIsRestricted(false);
      setEditPageAllowedEmails("");
      setEditPageCommentsAllowed(true);
    } else if (path.startsWith("/edit/")) {
      const id = path.substring(6);
      setCurrentView("edit");
      setActiveSubtopicIndex(null);
      await fetchAndSetEditPage(id);
    } else if (path === "/admin") {
      setCurrentView("admin");
      setActiveSubtopicIndex(null);
    } else {
      setCurrentView("dashboard");
      setActiveSpaceFilter(null);
      setActiveSubtopicIndex(null);
    }
  };

  const fetchAndSetActivePage = async (
    id: string,
    subtopicIndex: number | null = null,
    routeRequest?: number,
    expectedPath?: string
  ) => {
    try {
      const pageData = await api.page(token, id);
      if (
        (routeRequest !== undefined && routeRequest !== routeRequestRef.current) ||
        (expectedPath && window.location.pathname !== expectedPath)
      ) return;
      setActivePage(pageData);
      setActiveSpaceFilter(pageData.space_key);
      setActiveSubtopicIndex(subtopicIndex);
      fetchComments(id);
    } catch (error: any) {
      if (routeRequest !== undefined && routeRequest !== routeRequestRef.current) return;
      alert(error.message);
      navigate("/dashboard");
    }
  };

  const fetchAndSetEditPage = async (id: string) => {
    try {
      const pageData = await api.page(token, id);
      setEditPageId(pageData.id);
      setEditPageTitle(pageData.title);
      setEditPageSpace(pageData.space_key);
      setEditPageContent(pageData.content);
      setEditPageSubtopics(pageData.subtopics || "");
      setEditPageIsRestricted(pageData.is_restricted);
      setEditPageAllowedEmails(pageData.allowed_emails);
      setEditPageCommentsAllowed(pageData.comments_allowed ?? true);
    } catch (error: any) {
      alert(error.message);
      navigate("/dashboard");
    }
  };

  const fetchComments = async (pageId: string) => {
    try {
      setComments(await api.comments(token, pageId));
    } catch (err) {
      console.error("Error al cargar comentarios:", err);
    }
  };

  const handleAddComment = async (content: string, parentId?: string) => {
    if (!activePage) return;
    await api.addComment(token, activePage.id, content, parentId);
    await fetchComments(activePage.id);
  };

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    try {
      await api.toggleReaction(token, commentId, emoji);
      if (activePage) {
        await fetchComments(activePage.id);
      }
    } catch (err: any) {
      alert(err.message || "Error al procesar reacción.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.deleteComment(token, commentId);
      if (activePage) {
        await fetchComments(activePage.id);
      }
    } catch (err: any) {
      alert(err.message || "Error al eliminar comentario.");
    }
  };

  // URL router integration
  useEffect(() => {
    if (initialLoading) return;
    if (!currentUser || !token) return;

    const handlePopState = () => {
      handleRouting();
    };

    window.addEventListener("popstate", handlePopState);
    handleRouting(); // First match

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [initialLoading, currentUser, token]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setLoginError(null);

    try {
      const data = await api.login(loginEmail, loginPassword);
      if (data.must_reset_password) {
        throw new Error("Debes restablecer tu contraseña en el panel de GateStack primero.");
      }
      setToken("cookie-session");
    } catch (err: any) {
      setLoginError(err.message || "Error al conectar al servidor.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setToken(null);
    setCurrentUser(null);
    setSpaces([]);
    setPages([]);
    window.history.pushState({}, "", "/");
  };

  // --- CRUD OPERACIONES ---
  const handleCreateSpace = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createSpace(token, {
        name: newSpaceName,
        key: newSpaceKey.toUpperCase().trim(),
        description: newSpaceDesc,
        is_restricted: newSpaceIsRestricted,
        allowed_emails: newSpaceAllowedEmails
      });

      setSpaceModalOpen(false);
      setNewSpaceName("");
      setNewSpaceKey("");
      setNewSpaceDesc("");
      setNewSpaceIsRestricted(false);
      setNewSpaceAllowedEmails("");
      await refreshData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const triggerEditSpace = (space: Space) => {
    navigate(`/space/${space.key.toUpperCase()}/settings`);
  };

  const handleUpdateSpace = async (e: FormEvent) => {
    e.preventDefault();
    if (!editSpaceId) return;
    try {
      await api.updateSpace(token, editSpaceId, {
        name: editSpaceName,
        key: editSpaceKey.toUpperCase().trim(),
        description: editSpaceDesc,
        is_restricted: editSpaceIsRestricted,
        allowed_emails: editSpaceAllowedEmails
      });

      setEditSpaceId(null);
      await refreshData();
      navigate(`/space/${editSpaceKey.toUpperCase().trim()}`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteSpace = async (id: string) => {
    if (!confirm("¿Deseas eliminar este espacio y TODAS sus páginas permanentemente?")) return;
    try {
      await api.deleteSpace(token, id);
      await refreshData();
      navigate("/dashboard");
    } catch (error: any) {
      alert(error.message);
    }
  };


  const handleCreateOrUpdatePage = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      space_key: editPageSpace,
      title: editPageTitle,
      content: editPageContent,
      subtopics: editPageSubtopics,
      is_restricted: editPageIsRestricted,
      allowed_emails: editPageIsRestricted ? editPageAllowedEmails : "",
      comments_allowed: editPageCommentsAllowed
    };

    try {
      const savedPage = await api.savePage(token, editPageId, payload);
      await refreshData();
      navigate(`/page/${savedPage.id}`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleUploadMarkdownImage = async (spaceKey: string, file: File) => {
    const space = spaces.find((item) => item.key.toUpperCase() === spaceKey.toUpperCase());
    if (!space) {
      throw new Error("Selecciona un workspace antes de subir imagenes.");
    }
    const uploaded = await api.uploadMarkdownImage(token, space.id, file);
    return { url: uploaded.url, ocrText: uploaded.ocr_text || "" };
  };

  const handleDeletePage = async (id: string) => {
    if (!confirm("¿Deseas eliminar esta página de forma permanente?")) return;

    const returnSpaceKey = activeSpaceFilter || (activePage?.id === id ? activePage.space_key : null);

    try {
      await api.deletePage(token, id);
      await refreshData();
      if (activePage?.id === id) {
        setActivePage(null);
      }
      navigate(returnSpaceKey ? `/space/${returnSpaceKey}` : "/dashboard");
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleReorderPages = async (spaceKey: string, orderedPageIds: string[]) => {
    try {
      await api.reorderPages(token, spaceKey, orderedPageIds);
      await refreshData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleSeedData = async () => {
    setSeedLoading(true);
    setSeedSuccessMsg("");
    try {
      const res = await api.seed(token);
      setSeedSuccessMsg(res.message || "Datos semilla inicializados.");
      await refreshData();
    } catch (error) {
      alert("Error cargando semillas.");
    } finally {
      setSeedLoading(false);
    }
  };

  // React-based pages filter
  const filteredPages = useMemo(() => {
    let result = pages;
    if (activeSpaceFilter) {
      result = result.filter(p => p.space_key === activeSpaceFilter);
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.space_key.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pages, activeSpaceFilter, searchQuery]);

  const filteredNewSpaceUsers = useMemo(() => {
    const emails = newSpaceAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
    const unselected = allUsers.filter(u => !emails.map(e => e.toLowerCase()).includes(u.email.toLowerCase()));
    if (!newSpaceSearchText.trim()) return unselected;
    const q = newSpaceSearchText.toLowerCase();
    return unselected.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [allUsers, newSpaceAllowedEmails, newSpaceSearchText]);

  const handleAddNewSpaceEmail = (email: string) => {
    const emails = newSpaceAllowedEmails.split(",").map(em => em.trim()).filter(Boolean);
    if (email && !emails.map(em => em.toLowerCase()).includes(email.toLowerCase())) {
      const nextList = [...emails, email];
      setNewSpaceAllowedEmails(nextList.join(", "));
    }
    setNewSpaceSearchText("");
    setNewSpaceDropdownOpen(false);
  };

  // Markdown renderer helper
  const renderMarkdown = (md: string) => {
    return <MarkdownContent content={md || ""} />;
  };

  // Loader state
  if (initialLoading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Iniciando GateWiki...</p>
      </div>
    );
  }

  // Auth/Login View
  if (!currentUser) {
    return (
      <Login
        email={loginEmail}
        setEmail={setLoginEmail}
        password={loginPassword}
        setPassword={setLoginPassword}
        onSubmit={handleLogin}
        error={loginError}
        loading={authLoading}
      />
    );
  }

  // Standard platform layout shell
  return (
    <div className="main-shell">
      <Sidebar
        currentUser={currentUser}
        spaces={spaces}
        pages={pages}
        activeSpaceFilter={activeSpaceFilter}
        onSelectSpace={(key) => navigate(key ? `/space/${key}` : "/dashboard")}
        onReadPage={(id) => navigate(`/page/${id}`)}
        hasCreate={activeSpaceFilter ? hasCreatePage : hasCreateSpace}
        onAddSpaceClick={() => setSpaceModalOpen(true)}
        onCreatePageClick={() => navigate("/edit")}
        onLogout={handleLogout}
        currentView={currentView}
      />

      <main className="content-area">
        <Topbar
          currentUser={currentUser}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          hasCreate={hasCreatePage}
          hasAdmin={hasAdmin}
          onCreatePageClick={() => navigate("/edit")}
          onAdminPanelClick={() => navigate("/admin")}
          onFeedbackClick={() => setFeedbackOpen(true)}
          onAiChatClick={() => setAiChatOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        />

        <div className="view-container">
          {currentView === "dashboard" && (
            <Dashboard
              currentUser={currentUser}
              spaces={spaces}
              pages={pages}
              filteredPages={filteredPages}
              activeSpaceFilter={activeSpaceFilter}
              onReadPage={(id) => navigate(`/page/${id}`)}
              onOpenSpace={(key) => navigate(`/space/${key}`)}
              onDeletePage={handleDeletePage}
              hasDelete={hasDeletePage}
              hasAdmin={hasAdmin}
              onEditPage={(id) => navigate(`/edit/${id}`)}
              onManageTopicOrder={(spaceKey) => navigate(`/space/${spaceKey}/order`)}
              onEditSpace={triggerEditSpace}
            />
          )}

          {currentView === "topic-order" && activeSpaceFilter && (
            (() => {
              const activeSpace = spaces.find(s => s.key === activeSpaceFilter);
              if (!activeSpace) return <div>Cargando orden de temas...</div>;
              return (
                <TopicOrder
                  activeSpace={activeSpace}
                  pages={pages}
                  onBackClick={() => navigate(`/space/${activeSpace.key}`)}
                  onSaveOrder={handleReorderPages}
                />
              );
            })()
          )}

          {currentView === "read" && activePage && (
            <PageRead
              currentUser={currentUser}
              activePage={activePage}
              activeSubtopicIndex={activeSubtopicIndex}
              comments={comments}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onToggleReaction={handleToggleReaction}
              onBackClick={() => navigate(`/space/${activePage.space_key}`)}
              onEditClick={() => navigate(`/edit/${activePage.id}`)}
              onDeleteClick={handleDeletePage}
              hasEdit={hasEditPage}
              hasDelete={hasDeletePage}
              renderMarkdown={renderMarkdown}
            />
          )}

          {currentView === "edit" && (
            <PageEdit
              editPageId={editPageId}
              editPageTitle={editPageTitle}
              setEditPageTitle={setEditPageTitle}
              editPageSpace={editPageSpace}
              setEditPageSpace={setEditPageSpace}
              editPageContent={editPageContent}
              setEditPageContent={setEditPageContent}
              editPageSubtopics={editPageSubtopics}
              setEditPageSubtopics={setEditPageSubtopics}
              editPageIsRestricted={editPageIsRestricted}
              setEditPageIsRestricted={setEditPageIsRestricted}
              editPageAllowedEmails={editPageAllowedEmails}
              setEditPageAllowedEmails={setEditPageAllowedEmails}
              editPageCommentsAllowed={editPageCommentsAllowed}
              setEditPageCommentsAllowed={setEditPageCommentsAllowed}
              spaces={spaces}
              allUsers={allUsers}
              onSubmit={handleCreateOrUpdatePage}
              onUploadMarkdownImage={(file) => handleUploadMarkdownImage(editPageSpace, file)}
              onCancel={() => navigate(editPageId ? `/page/${editPageId}` : "/dashboard")}
            />
          )}

          {currentView === "admin" && hasAdmin && (
            <AdminPanel
              token={token}
              spaces={spaces}
              pages={pages}
              onSeedData={handleSeedData}
              seedLoading={seedLoading}
              seedSuccessMsg={seedSuccessMsg}
            />
          )}

          {currentView === "space-settings" && activeSpaceFilter && (
            (() => {
              const activeSpace = spaces.find(s => s.key === activeSpaceFilter);
              if (activeSpace) {
                return (
                  <SpaceSettings
                    currentUser={currentUser}
                    activeSpace={activeSpace}
                    allUsers={allUsers}
                    editSpaceName={editSpaceName}
                    setEditSpaceName={setEditSpaceName}
                    editSpaceKey={editSpaceKey}
                    setEditSpaceKey={setEditSpaceKey}
                    editSpaceDesc={editSpaceDesc}
                    setEditSpaceDesc={setEditSpaceDesc}
                    editSpaceIsRestricted={editSpaceIsRestricted}
                    setEditSpaceIsRestricted={setEditSpaceIsRestricted}
                    editSpaceAllowedEmails={editSpaceAllowedEmails}
                    setEditSpaceAllowedEmails={setEditSpaceAllowedEmails}
                    onSubmit={handleUpdateSpace}
                    onDeleteSpace={handleDeleteSpace}
                    onCancel={() => navigate(`/space/${activeSpace.key}`)}
                    token={token}
                  />
                );
              }
              return <div>Cargando configuración de espacio...</div>;
            })()
          )}
        </div>
      </main>

      <FeedbackModal token={token} activePage={activePage} open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <AiChatModal
        token={token}
        userId={currentUser?.id || currentUser?.email || "anonymous"}
        activePage={currentView === "read" ? activePage : null}
        activeSpaceFilter={
          currentView === "dashboard" || currentView === "space-settings" || currentView === "topic-order"
            ? activeSpaceFilter
            : null
        }
        open={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        onReadPage={(id) => navigate(`/page/${id}`)}
      />

      {/* Space Modal Overlay */}
      {spaceModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Crear Nuevo Espacio de Trabajo</h2>
              <button className="btn-close-modal" onClick={() => setSpaceModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateSpace} style={{ padding: "24px" }}>
              <div className="form-group">
                <label>Nombre del Espacio</label>
                <input
                  type="text"
                  placeholder="Ej: DevOps & Cloud"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Identificador único (Key)</label>
                <input
                  type="text"
                  placeholder="Ej: DEVOPS"
                  value={newSpaceKey}
                  onChange={(e) => setNewSpaceKey(e.target.value)}
                  required
                  pattern="^[A-Z0-9]+$"
                  title="Solo letras mayúsculas y números"
                />
                <span className="input-helper">Ej: DEVOPS (solo mayúsculas y números)</span>
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  rows={3}
                  placeholder="Describe el propósito de este espacio..."
                  value={newSpaceDesc}
                  onChange={(e) => setNewSpaceDesc(e.target.value)}
                  required
                />
              </div>
              <div className="restriction-section" style={{ marginTop: "16px", marginBottom: "16px", padding: "12px", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px" }}>
                <div className="toggle-control" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="restrict-space-visibility-checkbox"
                    checked={newSpaceIsRestricted}
                    onChange={(e) => setNewSpaceIsRestricted(e.target.checked)}
                  />
                  <label htmlFor="restrict-space-visibility-checkbox" style={{ margin: 0, cursor: "pointer" }}>
                    <strong>Restringir este espacio de trabajo</strong>
                  </label>
                </div>
                <p className="text-small text-muted" style={{ fontSize: "12px", marginTop: "4px", color: "var(--color-text-muted)" }}>
                  Si se activa, solo tu, los administradores y los miembros podran ver este workspace. Si esta publico, todos pueden verlo, pero solo miembros pueden colaborar.
                </p>
                {true && (
                  <div className="form-group" style={{ marginTop: "12px" }}>
                    <label>Miembros del workspace</label>
                    <div className="allowed-emails-tags" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", marginTop: "8px" }}>
                      {(() => {
                        const emails = newSpaceAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
                        if (emails.length === 0) {
                          return <span style={{ fontSize: "12px", fontStyle: "italic", color: "var(--color-text-muted)" }}>Agrega miembros a la lista.</span>;
                        }
                        return emails.map(email => {
                          const userObj = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
                          const displayName = userObj ? userObj.full_name : email;
                          return (
                            <span
                              key={email}
                              className="email-tag"
                            >
                              <span>{displayName} ({email})</span>
                              <button
                                type="button"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  padding: "0 2px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  lineHeight: 1
                                }}
                                onClick={() => {
                                  const nextList = emails.filter(e => e !== email);
                                  setNewSpaceAllowedEmails(nextList.join(", "));
                                }}
                              >
                                &times;
                              </button>
                            </span>
                          );
                        });
                      })()}
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <input
                          type="text"
                          autoComplete="new-password"
                          placeholder="Buscar usuario por nombre o correo, o escribe..."
                          id="custom-new-email-input"
                          style={{ width: "100%" }}
                          value={newSpaceSearchText}
                          onChange={(e) => {
                            setNewSpaceSearchText(e.target.value);
                            setNewSpaceDropdownOpen(true);
                          }}
                          onFocus={() => setNewSpaceDropdownOpen(true)}
                          onBlur={() => {
                            setTimeout(() => setNewSpaceDropdownOpen(false), 200);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (newSpaceSearchText.trim()) {
                                handleAddNewSpaceEmail(newSpaceSearchText.trim());
                              }
                            }
                          }}
                        />
                        {newSpaceDropdownOpen && filteredNewSpaceUsers.length > 0 && (
                          <div className="custom-combobox-dropdown">
                            {filteredNewSpaceUsers.map(u => (
                              <div
                                key={u.email}
                                className="dropdown-item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  handleAddNewSpaceEmail(u.email);
                                }}
                              >
                                <strong>{u.full_name}</strong> <span style={{ opacity: 0.7, fontSize: '0.85em' }}>({u.email})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "6px 16px", fontSize: "13.5px" }}
                        onClick={() => {
                          if (newSpaceSearchText.trim()) {
                            handleAddNewSpaceEmail(newSpaceSearchText.trim());
                          }
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setSpaceModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">Crear Espacio</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

