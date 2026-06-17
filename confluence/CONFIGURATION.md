# Configuracion local

GateWiki puede seguir usando la IPv4 de tu PC para pruebas desde otros dispositivos. Evita dejar IPs y claves directamente en el codigo; usa variables de entorno.

El frontend ya no llama directo a GateStack IAM. Llama al backend de GateWiki en el mismo origen (`/auth/login` y `/auth/me`), y GateWiki reenvia esas peticiones a GateStack usando `GATESTACK_API_URL`. Asi evitas la trampa de abrir `localhost:8001` y que el navegador busque tokens en el host equivocado.

## Backend

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=gatewiki_app
DB_PASSWORD=replace-with-generated-password
DB_NAME=gatestack
SECRET_KEY=replace-with-at-least-32-random-characters
DATA_ENCRYPTION_KEY=replace-with-at-least-32-random-characters
GATESTACK_API_URL=http://192.168.1.150:8000
GATESTACK_FALLBACK_URLS=http://host.docker.internal:8000,http://gatestack-backend:8000
CORS_ALLOWED_ORIGINS=
```

Si `CORS_ALLOWED_ORIGINS` queda vacio, el backend acepta origenes `localhost`, `127.0.0.1` y rangos privados LAN por regex.

## Frontend dev server

```env
VITE_GATEWIKI_BACKEND_URL=http://192.168.1.150:8001
```

En desarrollo, Vite usa este valor para proxyear `/api` y `/auth` hacia el backend GateWiki. En el build Docker no hace falta porque FastAPI sirve el frontend compilado desde el mismo origen.

## Migraciones

Alembic queda configurado en `backend/`. Para una base nueva puedes ejecutar:

```powershell
cd backend
alembic upgrade head
```

Si ya tienes tablas creadas por la version de pruebas, primero marca la migracion actual sin recrear tablas:

```powershell
cd backend
alembic stamp head
```
