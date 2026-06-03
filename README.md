# GateStack

Portal central para registrar aplicaciones, aprobar usuarios, administrar permisos por templates editables y preparar un flujo seguro de revision/despliegue de proyectos.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLAlchemy
- Base de datos: MySQL

## Estructura

```txt
backend/   API, auth, permisos, admin tools y registro de proyectos
frontend/  Portal web para usuarios y administradores
```

## Arranque rapido

### Sin Docker

Esta rama incluye scripts para correr todo local con tu MySQL instalado:

```powershell
.\scripts\install-local.ps1 -DbPassword "TU_PASSWORD_MYSQL"
.\scripts\start-local.ps1 -HostIp "192.168.1.150" -DbPassword "TU_PASSWORD_MYSQL"
```

Mas detalle en [LOCAL_NO_DOCKER.md](LOCAL_NO_DOCKER.md).

### Solo GateStack

Base de datos con MySQL local:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS gatestack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Si prefieres Docker, tambien puedes usar `docker compose up -d mysql`.

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

La API queda por defecto en `http://localhost:8000` y el frontend en `http://localhost:5173`.

## Primer admin

Configura estas variables en `backend/.env` antes de iniciar:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@gatestack.dev
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123!
```

Al arrancar, el backend crea permisos base, templates iniciales y el usuario admin si no existe.
