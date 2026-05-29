// GateWiki - Lógica Frontend
document.addEventListener("DOMContentLoaded", () => {
    // API central de GateStack (para Login e Identidad)
    const GATESTACK_AUTH_URL = "http://localhost:8000";

    // Estado local de la aplicación
    let currentUser = null;
    let currentToken = null;
    let spaces = [];
    let pages = [];
    let activeSpaceFilter = null;
    let activePageView = null; // página activa leyendo

    // Elementos DOM
    const initialLoader = document.getElementById("initial-loader");
    const loginScreen = document.getElementById("login-screen");
    const mainShell = document.getElementById("main-shell");
    const loginForm = document.getElementById("login-form");
    const loginEmailInput = document.getElementById("login-email");
    const loginPasswordInput = document.getElementById("login-password");
    const loginError = document.getElementById("login-error");

    // Elementos del Main Shell
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const avatarInitials = document.getElementById("user-avatar-initials");
    const permissionsBadges = document.getElementById("user-permissions-badges");
    const btnLogout = document.getElementById("btn-logout");
    const btnCreatePage = document.getElementById("btn-create-page");
    const btnAddSpace = document.getElementById("btn-add-space");
    const spacesListContainer = document.getElementById("spaces-list");
    const searchInput = document.getElementById("search-input");
    const btnAdminPanel = document.getElementById("btn-admin-panel");

    // Vistas
    const views = {
        dashboard: document.getElementById("view-dashboard"),
        read: document.getElementById("view-page-read"),
        edit: document.getElementById("view-page-edit"),
        admin: document.getElementById("view-admin")
    };

    // Subvistas / Dashboard
    const welcomeMsg = document.getElementById("dashboard-welcome-msg");
    const statTotalPages = document.getElementById("stat-total-pages");
    const statTotalSpaces = document.getElementById("stat-total-spaces");
    const statPrivatePages = document.getElementById("stat-private-pages");
    const recentPagesList = document.getElementById("recent-pages-list");
    const permissionsDescriptionList = document.getElementById("permissions-description-list");

    // Vista Lectura Página
    const readSpaceBadge = document.getElementById("read-page-space");
    const readPagePrivacy = document.getElementById("read-page-privacy-status");
    const readPageTitle = document.getElementById("read-page-title");
    const readPageAuthorAvatar = document.getElementById("read-page-author-avatar");
    const readPageAuthor = document.getElementById("read-page-author");
    const readPageDate = document.getElementById("read-page-date");
    const readPageBody = document.getElementById("read-page-body");
    const btnEditPageTrigger = document.getElementById("btn-edit-page-trigger");
    const btnDeletePageTrigger = document.getElementById("btn-delete-page-trigger");
    const btnBackToDashboard = document.getElementById("btn-back-to-dashboard");
    const privateNotice = document.getElementById("private-restriction-notice");
    const allowedUsersDisplay = document.getElementById("allowed-users-list-display");

    // Vista Formulario Creación/Edición
    const pageEditForm = document.getElementById("page-edit-form");
    const editPageIdInput = document.getElementById("edit-page-id");
    const editPageTitleInput = document.getElementById("edit-page-title-input");
    const editPageSpaceSelect = document.getElementById("edit-page-space-select");
    const editPageContentInput = document.getElementById("edit-page-content-input");
    const restrictCheckbox = document.getElementById("restrict-visibility-checkbox");
    const restrictionInputGroup = document.getElementById("restriction-input-group");
    const restrictEmailsInput = document.getElementById("restrict-emails-input");
    const btnCancelEdit = document.getElementById("btn-cancel-edit");
    const editViewTitle = document.getElementById("edit-view-title");

    // Consola Admin
    const adminStatSpaces = document.getElementById("admin-stat-spaces");
    const adminStatPages = document.getElementById("admin-stat-pages");
    const adminStatRestricted = document.getElementById("admin-stat-restricted");
    const btnSeedData = document.getElementById("btn-seed-data");
    const seedSuccessMsg = document.getElementById("seed-success-msg");

    // Modal Crear Espacio
    const spaceModal = document.getElementById("space-modal");
    const spaceModalForm = document.getElementById("space-modal-form");
    const spaceNameInput = document.getElementById("space-name-input");
    const spaceKeyInput = document.getElementById("space-key-input");
    const spaceDescInput = document.getElementById("space-desc-input");
    const btnCancelSpaceModal = document.getElementById("btn-cancel-space-modal");
    const btnCloseSpaceModal = document.getElementById("btn-close-space-modal");

    // ----------------- SEGURIDAD & INICIALIZACIÓN -----------------
    const token = localStorage.getItem("gatewiki_token");
    if (token) {
        currentToken = token;
        validateTokenAndInit(token);
    } else {
        showScreen("login");
    }

    async function validateTokenAndInit(jwtToken) {
        try {
            // Validamos contra el endpoint del SSO (GateStack)
            const response = await fetch(`${GATESTACK_AUTH_URL}/auth/me`, {
                headers: { "Authorization": `Bearer ${jwtToken}` }
            });

            if (!response.ok) {
                throw new Error("Token expirado o no autorizado por GateStack.");
            }

            currentUser = await response.json();
            
            // Verificar si el usuario tiene el permiso mínimo para entrar a GateWiki
            const userPermissions = currentUser.permissions || [];
            const hasAccess = userPermissions.includes("gatewiki:view") || currentUser.is_platform_admin;
            
            if (!hasAccess) {
                localStorage.removeItem("gatewiki_token");
                showLoginError("Acceso denegado: Tu usuario de GateStack no tiene el permiso 'gatewiki:view'.");
                showScreen("login");
                return;
            }

            // Inicializar Aplicación
            initApp();

        } catch (error) {
            console.error(error);
            localStorage.removeItem("gatewiki_token");
            showLoginError("Sesión inválida o conexión perdida con GateStack IAM.");
            showScreen("login");
        }
    }

    function initApp() {
        showScreen("main");
        
        // Cargar metadatos de usuario en UI
        profileName.textContent = currentUser.full_name;
        profileEmail.textContent = currentUser.email;
        avatarInitials.textContent = getInitials(currentUser.full_name);
        
        // Crear insignias de permisos
        renderPermissionsBadges();
        
        // Habilitar controles según permisos del usuario
        configurePermissionsControls();
        
        // Navegar por defecto a Dashboard
        navigate("dashboard");
        
        // Recargar datos
        refreshData();
    }

    function configurePermissionsControls() {
        const perms = currentUser.permissions || [];
        const isGlobalAdmin = currentUser.is_platform_admin || perms.includes("gatewiki:admin");

        // Crear página / espacio
        if (perms.includes("gatewiki:create") || isGlobalAdmin) {
            btnCreatePage.removeAttribute("disabled");
            btnAddSpace.removeAttribute("disabled");
        } else {
            btnCreatePage.setAttribute("disabled", "true");
            btnAddSpace.setAttribute("disabled", "true");
        }

        // Mostrar pestaña Admin
        if (isGlobalAdmin) {
            btnAdminPanel.style.display = "inline-flex";
        } else {
            btnAdminPanel.style.display = "none";
        }
    }

    function renderPermissionsBadges() {
        permissionsBadges.innerHTML = "";
        const perms = currentUser.permissions || [];
        
        if (currentUser.is_platform_admin) {
            permissionsBadges.innerHTML += `<span class="permission-badge admin">Platform Admin</span>`;
        } else if (perms.includes("gatewiki:admin")) {
            permissionsBadges.innerHTML += `<span class="permission-badge admin">GateWiki Admin</span>`;
        }

        // Mostrar permisos clave como badges
        const relevantPerms = ["gatewiki:create", "gatewiki:edit", "gatewiki:delete"];
        relevantPerms.forEach(p => {
            if (perms.includes(p)) {
                const label = p.split(":")[1].toUpperCase();
                permissionsBadges.innerHTML += `<span class="permission-badge">${label}</span>`;
            }
        });
    }

    // ----------------- CRUD CON EL BACKEND DE CONFLUENCE -----------------

    async function apiFetch(endpoint, options = {}) {
        if (!options.headers) {
            options.headers = {};
        }
        options.headers["Authorization"] = `Bearer ${currentToken}`;
        
        // La API de confluence corre bajo la misma URL relativa ya que FastAPI sirve el frontend
        const response = await fetch(endpoint, options);
        if (response.status === 401) {
            logout();
            throw new Error("Token expirado o no autorizado.");
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.detail || "Error en la llamada al servidor.");
        }
        if (response.status === 204) return null;
        return response.json();
    }

    async function refreshData() {
        try {
            // Obtener espacios y páginas en paralelo
            spaces = await apiFetch("/api/spaces");
            pages = await apiFetch("/api/pages");

            // Rellenar UI
            renderSpacesList();
            renderPagesTable();
            updateDashboardMetrics();
            populateSpacesDropdown();
            updateAdminPanelStats();

        } catch (error) {
            console.error("Error al cargar datos: ", error);
        }
    }

    function renderSpacesList() {
        spacesListContainer.innerHTML = "";
        
        // Botón "Todos los espacios"
        const allBtn = document.createElement("button");
        allBtn.className = `space-nav-btn ${activeSpaceFilter === null ? 'active' : ''}`;
        allBtn.innerHTML = `
            <div class="space-nav-left">
                <i data-lucide="layout-grid"></i>
                <span>Todos los espacios</span>
            </div>
        `;
        allBtn.addEventListener("click", () => {
            activeSpaceFilter = null;
            renderSpacesList();
            renderPagesTable();
        });
        spacesListContainer.appendChild(allBtn);

        // Espacios de la base de datos
        spaces.forEach(s => {
            const btn = document.createElement("button");
            btn.className = `space-nav-btn ${activeSpaceFilter === s.key ? 'active' : ''}`;
            btn.innerHTML = `
                <div class="space-nav-left">
                    <span class="space-nav-badge">${s.key}</span>
                    <span>${s.name}</span>
                </div>
            `;
            btn.addEventListener("click", () => {
                activeSpaceFilter = s.key;
                renderSpacesList();
                renderPagesTable();
            });
            spacesListContainer.appendChild(btn);
        });

        lucide.createIcons();
    }

    function renderPagesTable() {
        recentPagesList.innerHTML = "";

        // Filtrar páginas según espacio activo
        let filteredPages = pages;
        if (activeSpaceFilter) {
            filteredPages = pages.filter(p => p.space_key === activeSpaceFilter);
        }

        // Filtro de búsqueda
        const query = searchInput.value.toLowerCase().trim();
        if (query) {
            filteredPages = filteredPages.filter(p => 
                p.title.toLowerCase().includes(query) || 
                p.content.toLowerCase().includes(query) ||
                p.space_key.toLowerCase().includes(query)
            );
        }

        if (filteredPages.length === 0) {
            recentPagesList.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center;" class="text-muted">
                        No hay páginas creadas en este espacio.
                    </td>
                </tr>
            `;
            return;
        }

        const perms = currentUser.permissions || [];
        const isGlobalAdmin = currentUser.is_platform_admin || perms.includes("gatewiki:admin");

        filteredPages.forEach(p => {
            const tr = document.createElement("tr");

            // Visibilidad badge
            const visBadge = p.is_restricted 
                ? `<span class="badge-privacy restricted"><i data-lucide="lock"></i> Privado</span>`
                : `<span class="badge-privacy public"><i data-lucide="globe"></i> Público</span>`;

            // Acciones disponibles según el permiso
            const canDelete = isGlobalAdmin || perms.includes("gatewiki:delete") || p.created_by_id === currentUser.id;
            const deleteBtn = canDelete 
                ? `<button class="btn-table-action delete" data-id="${p.id}" title="Eliminar página"><i data-lucide="trash-2"></i></button>`
                : "";

            tr.innerHTML = `
                <td><span class="row-page-title" data-id="${p.id}">${escapeHtml(p.title)}</span></td>
                <td><span class="space-badge">${p.space_key}</span></td>
                <td>${escapeHtml(p.created_by_name)}</td>
                <td>${formatDate(p.created_at)}</td>
                <td>${visBadge}</td>
                <td class="text-right">
                    <button class="btn-table-action read-btn" data-id="${p.id}" title="Leer página"><i data-lucide="eye"></i></button>
                    ${deleteBtn}
                </td>
            `;

            // Eventos
            tr.querySelector(".row-page-title").addEventListener("click", () => readPage(p.id));
            tr.querySelector(".read-btn").addEventListener("click", () => readPage(p.id));
            if (canDelete) {
                tr.querySelector(".delete").addEventListener("click", () => deletePage(p.id));
            }

            recentPagesList.appendChild(tr);
        });

        lucide.createIcons();
    }

    function updateDashboardMetrics() {
        statTotalPages.textContent = pages.length;
        statTotalSpaces.textContent = spaces.length;
        statPrivatePages.textContent = pages.filter(p => p.is_restricted).length;

        // Nombre de bienvenida
        welcomeMsg.textContent = `¡Hola, ${currentUser.full_name}!`;

        // Detalle de permisos en español para el panel lateral de Dashboard
        permissionsDescriptionList.innerHTML = "";
        const perms = currentUser.permissions || [];

        const descripciones = {
            "gatewiki:view": "Ver páginas y espacios públicos y autorizados.",
            "gatewiki:create": "Crear nuevos espacios y páginas.",
            "gatewiki:edit": "Editar páginas que hayas creado o páginas públicas.",
            "gatewiki:delete": "Eliminar páginas de tu autoría.",
            "gatewiki:admin": "Control completo de la consola de GateWiki."
        };

        if (currentUser.is_platform_admin) {
            permissionsBadges.innerHTML = `<span class="permission-badge admin">Platform Admin</span>`;
            permissionsDescriptionList.innerHTML += `<li>Acceso Superusuario: Tienes todos los permisos habilitados.</li>`;
        }

        Object.keys(descripciones).forEach(p => {
            if (perms.includes(p) || currentUser.is_platform_admin) {
                permissionsDescriptionList.innerHTML += `<li><strong>${p.split(":")[1].toUpperCase()}:</strong> ${descripciones[p]}</li>`;
            }
        });
    }

    function populateSpacesDropdown() {
        editPageSpaceSelect.innerHTML = '<option value="" disabled selected>Selecciona un espacio...</option>';
        spaces.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.key;
            opt.textContent = `[${s.key}] ${s.name}`;
            editPageSpaceSelect.appendChild(opt);
        });
    }

    // ----------------- CONTROL DE VISTAS (ENRUTAMIENTO) -----------------
    function navigate(viewName) {
        // Ocultar todas las vistas
        Object.keys(views).forEach(k => {
            views[k].classList.add("hidden");
        });

        // Mostrar la activa
        if (views[viewName]) {
            views[viewName].classList.remove("hidden");
        }

        // Manejar clases activas de barra lateral
        document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
        if (viewName === "dashboard") {
            document.getElementById("nav-dashboard").classList.add("active");
        } else if (viewName === "all-pages") {
            document.getElementById("nav-all-pages").classList.add("active");
        }
    }

    function showScreen(screen) {
        if (screen === "login") {
            initialLoader.classList.add("hidden");
            mainShell.classList.add("hidden");
            loginScreen.classList.remove("hidden");
        } else if (screen === "main") {
            initialLoader.classList.add("hidden");
            loginScreen.classList.add("hidden");
            mainShell.classList.remove("hidden");
        }
    }

    // ----------------- OPERACIONES ESPECÍFICAS DE PÁGINAS -----------------

    async function readPage(id) {
        try {
            const page = await apiFetch(`/api/pages/${id}`);
            activePageView = page;

            // Renderizar contenido
            readSpaceBadge.textContent = page.space_key;
            readPageTitle.textContent = page.title;
            readPageAuthor.textContent = page.created_by_name;
            readPageDate.textContent = `Creada el ${formatDate(page.created_at)}`;
            readPageAuthorAvatar.textContent = getInitials(page.created_by_name);

            // Visibilidad y aviso de restricciones
            if (page.is_restricted) {
                readPagePrivacy.className = "page-privacy text-muted";
                readPagePrivacy.innerHTML = `<i data-lucide="lock" style="color:var(--color-warning);"></i> Restringido`;
                
                privateNotice.classList.remove("hidden");
                allowedUsersDisplay.textContent = page.allowed_emails || currentUser.email;
            } else {
                readPagePrivacy.className = "page-privacy text-success";
                readPagePrivacy.innerHTML = `<i data-lucide="globe"></i> Público`;
                privateNotice.classList.add("hidden");
            }

            // Parser sencillo de Markdown a HTML (Para wowear visualmente)
            readPageBody.innerHTML = parseMarkdown(page.content);

            // Permisos de edición / borrado
            const perms = currentUser.permissions || [];
            const isOwner = page.created_by_id === currentUser.id;
            const isGlobalAdmin = currentUser.is_platform_admin || perms.includes("gatewiki:admin");

            if (isGlobalAdmin || perms.includes("gatewiki:edit") || isOwner) {
                btnEditPageTrigger.removeAttribute("disabled");
            } else {
                btnEditPageTrigger.setAttribute("disabled", "true");
            }

            if (isGlobalAdmin || perms.includes("gatewiki:delete") || isOwner) {
                btnDeletePageTrigger.removeAttribute("disabled");
            } else {
                btnDeletePageTrigger.setAttribute("disabled", "true");
            }

            navigate("read");
            lucide.createIcons();

        } catch (error) {
            alert("No tienes permiso o no pudiste abrir la página: " + error.message);
        }
    }

    async function deletePage(id) {
        if (!confirm("¿Estás seguro de que deseas eliminar esta página de forma permanente?")) {
            return;
        }

        try {
            await apiFetch(`/api/pages/${id}`, { method: "DELETE" });
            refreshData();
            if (activePageView && activePageView.id === id) {
                navigate("dashboard");
            }
        } catch (error) {
            alert("Error al eliminar página: " + error.message);
        }
    }

    // ----------------- FORMULARIO EDICIÓN -----------------
    
    // Toggle de visibilidad de email de restricción
    restrictCheckbox.addEventListener("change", () => {
        if (restrictCheckbox.checked) {
            restrictionInputGroup.classList.remove("hidden");
            restrictEmailsInput.setAttribute("required", "true");
        } else {
            restrictionInputGroup.classList.add("hidden");
            restrictEmailsInput.removeAttribute("required");
        }
    });

    pageEditForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const pageId = editPageIdInput.value;
        const payload = {
            title: editPageTitleInput.value,
            space_key: editPageSpaceSelect.value,
            content: editPageContentInput.value,
            is_restricted: restrictCheckbox.checked,
            allowed_emails: restrictCheckbox.checked ? restrictEmailsInput.value : ""
        };

        try {
            let result;
            if (pageId) {
                // Actualizar
                result = await apiFetch(`/api/pages/${pageId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                // Crear
                result = await apiFetch("/api/pages", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }

            await refreshData();
            readPage(result.id);

        } catch (error) {
            alert("Error al guardar la página: " + error.message);
        }
    });

    // ----------------- FORMULARIO ESPACIOS -----------------

    spaceModalForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const payload = {
            name: spaceNameInput.value,
            key: spaceKeyInput.value.toUpperCase().trim(),
            description: spaceDescInput.value
        };

        try {
            await apiFetch("/api/spaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            closeSpaceModal();
            refreshData();

        } catch (error) {
            alert("Error al crear espacio: " + error.message);
        }
    });

    // ----------------- CONSOLA ADMIN -----------------
    function updateAdminPanelStats() {
        adminStatSpaces.textContent = spaces.length;
        adminStatPages.textContent = pages.length;
        adminStatRestricted.textContent = pages.filter(p => p.is_restricted).length;
    }

    btnSeedData.addEventListener("click", async () => {
        try {
            btnSeedData.setAttribute("disabled", "true");
            const res = await apiFetch("/api/seed", { method: "POST" });
            seedSuccessMsg.textContent = `¡Datos cargados con éxito! ${res.message || ""}`;
            seedSuccessMsg.classList.remove("hidden");
            
            await refreshData();
            
            setTimeout(() => {
                seedSuccessMsg.classList.add("hidden");
                btnSeedData.removeAttribute("disabled");
            }, 4000);

        } catch (error) {
            alert("Error cargando semillas: " + error.message);
            btnSeedData.removeAttribute("disabled");
        }
    });

    // ----------------- MANEJO DE ENTRADAS DE MENÚ Y BOTONES -----------------

    // Clic en Crear Página
    btnCreatePage.addEventListener("click", () => {
        editViewTitle.textContent = "Crear Nueva Página";
        editPageIdInput.value = "";
        editPageTitleInput.value = "";
        editPageSpaceSelect.value = activeSpaceFilter || "";
        editPageContentInput.value = "";
        restrictCheckbox.checked = false;
        restrictEmailsInput.value = "";
        restrictionInputGroup.classList.add("hidden");
        
        navigate("edit");
    });

    // Clic en Editar (Lectura -> Edición)
    btnEditPageTrigger.addEventListener("click", () => {
        if (!activePageView) return;
        
        editViewTitle.textContent = "Editar Página de Conocimiento";
        editPageIdInput.value = activePageView.id;
        editPageTitleInput.value = activePageView.title;
        editPageSpaceSelect.value = activePageView.space_key;
        editPageContentInput.value = activePageView.content;
        
        if (activePageView.is_restricted) {
            restrictCheckbox.checked = true;
            restrictEmailsInput.value = activePageView.allowed_emails;
            restrictionInputGroup.classList.remove("hidden");
        } else {
            restrictCheckbox.checked = false;
            restrictEmailsInput.value = "";
            restrictionInputGroup.classList.add("hidden");
        }
        
        navigate("edit");
    });

    // Toolbar de edición Markdown helper
    document.querySelectorAll(".toolbar-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tag = btn.getAttribute("data-tag");
            const start = editPageContentInput.selectionStart;
            const end = editPageContentInput.selectionEnd;
            const text = editPageContentInput.value;
            const selectedText = text.substring(start, end);
            
            let replacement = "";
            if (tag === "h1") replacement = `# ${selectedText || "Título 1"}`;
            else if (tag === "h2") replacement = `## ${selectedText || "Título 2"}`;
            else if (tag === "bold") replacement = `**${selectedText || "Texto en negrita"}**`;
            else if (tag === "italic") replacement = `*${selectedText || "Texto en itálica"}*`;
            else if (tag === "code") replacement = `\`${selectedText || "código"}\``;
            else if (tag === "list") replacement = `\n* ${selectedText || "Elemento"}`;

            editPageContentInput.value = text.substring(0, start) + replacement + text.substring(end);
            editPageContentInput.focus();
        });
    });

    // Cancelar edición
    btnCancelEdit.addEventListener("click", () => {
        if (editPageIdInput.value) {
            readPage(editPageIdInput.value);
        } else {
            navigate("dashboard");
        }
    });

    btnDeletePageTrigger.addEventListener("click", () => {
        if (activePageView) {
            deletePage(activePageView.id);
        }
    });

    // Clic en Navegación Lateral
    document.getElementById("nav-dashboard").addEventListener("click", () => {
        activeSpaceFilter = null;
        renderSpacesList();
        renderPagesTable();
        navigate("dashboard");
    });

    document.getElementById("nav-all-pages").addEventListener("click", () => {
        activeSpaceFilter = null;
        renderSpacesList();
        renderPagesTable();
        navigate("dashboard"); // Dashboard actúa como lista filtrable general
    });

    btnBackToDashboard.addEventListener("click", () => {
        navigate("dashboard");
    });

    // Pestaña Admin
    btnAdminPanel.addEventListener("click", () => {
        navigate("admin");
    });

    // Búsqueda instantánea
    searchInput.addEventListener("input", renderPagesTable);

    // Modal Crear Espacio abrir/cerrar
    btnAddSpace.addEventListener("click", () => {
        spaceModal.classList.remove("hidden");
    });
    btnCloseSpaceModal.addEventListener("click", closeSpaceModal);
    btnCancelSpaceModal.addEventListener("click", closeSpaceModal);

    function closeSpaceModal() {
        spaceModal.classList.add("hidden");
        spaceNameInput.value = "";
        spaceKeyInput.value = "";
        spaceDescInput.value = "";
    }

    // ----------------- AUTENTICACIÓN (LOGIN & LOGOUT) -----------------

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;

        // Mostrar estado de carga en el botón
        const btn = document.getElementById("btn-login-submit");
        const origText = btn.innerHTML;
        btn.innerHTML = `<span>Procesando...</span> <div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>`;
        btn.setAttribute("disabled", "true");
        loginError.classList.add("hidden");

        try {
            // Llamamos a la API central de GateStack para autenticar
            const response = await fetch(`${GATESTACK_AUTH_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || "Credenciales incorrectas o usuario no aprobado.");
            }

            const authData = await response.json();
            
            if (authData.must_reset_password) {
                throw new Error("Debes restablecer tu contraseña en el panel principal antes de entrar.");
            }

            if (!authData.access_token) {
                throw new Error("Respuesta de autenticación incompleta.");
            }

            currentToken = authData.access_token;
            localStorage.setItem("gatewiki_token", currentToken);
            
            // Validar token completo e iniciar app
            await validateTokenAndInit(currentToken);

        } catch (error) {
            showLoginError(error.message);
        } finally {
            btn.innerHTML = origText;
            btn.removeAttribute("disabled");
        }
    });

    btnLogout.addEventListener("click", logout);

    function logout() {
        localStorage.removeItem("gatewiki_token");
        currentUser = null;
        currentToken = null;
        showScreen("login");
    }

    function showLoginError(msg) {
        loginError.textContent = msg;
        loginError.classList.remove("hidden");
    }

    // ----------------- HELPERS / FORMATOS -----------------

    function getInitials(name) {
        return name
            .split(" ")
            .map(n => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
    }

    function formatDate(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getInitials(name) {
        if (!name) return "U";
        return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // Simple markdown helper parser
    function parseMarkdown(md) {
        if (!md) return "";
        let html = escapeHtml(md);

        // Cabeceras
        html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");
        html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
        html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");

        // Alertas github-style
        html = html.replace(/&gt; \[!CAUTION\]\n(.*?)$/gm, '<div class="alert-box info-alert" style="border-color:var(--color-danger); background:var(--color-danger-glow); color:#f87171;"><i data-lucide="alert-triangle"></i><div>$1</div></div>');
        html = html.replace(/&gt; \[!NOTE\]\n(.*?)$/gm, '<div class="alert-box info-alert"><i data-lucide="info"></i><div>$1</div></div>');

        // Código en bloque
        html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
        // Código en línea
        html = html.replace(/`(.*?)`/g, "<code>$1</code>");

        // Listas
        html = html.replace(/^\* (.*?)$/gm, "<li>$1</li>");
        html = html.replace(/((?:<li>.*?<\/li>\s*)+)/gs, "<ul>$1</ul>");

        // Negrita e itálica
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

        // Párrafos (líneas vacías)
        html = html.replace(/\n\n/g, "</p><p>");

        return html;
    }
});
