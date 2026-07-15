# GateChat

GateChat es un chatbot local independiente de GateWiki/GateStack. Usa Ollama como motor LLM y guarda el historial en MySQL.

## Requisitos sin Docker

- Python 3.11 x64
- Node.js 22 LTS
- MySQL accesible con el usuario `gatechat_app`
- Ollama instalado y corriendo
- Un modelo de chat, por ejemplo:

```powershell
ollama pull qwen2.5:7b-instruct
```

## Arrancar

### Sin Docker

Desde la raiz del repo:

```powershell
.\scripts\run-gatechat-local.ps1
```

Abre:

```txt
http://TU_IP:5186
```

### Con Docker

GateChat ya esta agregado al `docker-compose.yml`.

```powershell
docker compose up -d --build gatechat gatechat-frontend
```

Puertos:

```txt
GateChat web: http://TU_IP:5186
GateChat API: http://TU_IP:8013
```

En Docker, el historial se guarda en MySQL usando las tablas `gatechat_sessions` y `gatechat_messages`.

## Usar otro modelo

```powershell
ollama pull qwen2.5:14b-instruct
.\scripts\run-gatechat-local.ps1 -Model "qwen2.5:14b-instruct"
```

En Docker puedes cambiarlo en `.env`:

```txt
GATECHAT_DEFAULT_MODEL=qwen2.5:14b-instruct
```

## Usar Ollama en otra maquina

```powershell
.\scripts\run-gatechat-local.ps1 -OllamaBaseUrl "http://IP_OLLAMA:11434"
```

En Docker:

```txt
GATECHAT_OLLAMA_BASE_URL=http://host.docker.internal:11434
```

## Parametros configurables

Cada chat guarda:

- Modelo
- System prompt
- Temperature
- Top P
- Top K
- Repeat penalty
- Num ctx

Los mensajes se guardan en MySQL:

```txt
gatechat_sessions
gatechat_messages
```

## Seguridad de transporte y cifrado de peticiones

GateChat cifra los cuerpos JSON que salen del navegador antes de enviarlos al backend. El frontend genera una llave AES-256-GCM por peticion, cifra el contenido y envuelve esa llave con la llave publica RSA-OAEP-SHA256 publicada por `/api/security/public-key`. El backend descifra el sobre en memoria antes de validar los modelos de FastAPI.

Esto agrega una capa de confidencialidad sobre el cuerpo de la peticion, pero no reemplaza TLS: en redes no locales HTTPS sigue siendo la proteccion completa contra ataques man-in-the-middle sobre la entrega inicial de la llave publica y contra las respuestas. Por ahora GateChat no exige HTTPS por defecto; puedes activarlo cuando tengas un proxy inverso o certificado listo.

Variables utiles:

```txt
GATECHAT_SECURITY_KEY_PATH=/ruta/segura/gatechat-private-key.pem
GATECHAT_REQUIRE_HTTPS=false
GATECHAT_ALLOWED_ORIGINS=https://chat.tudominio.com
VITE_GATECHAT_ENCRYPT_REQUESTS=true
VITE_GATECHAT_REQUIRE_HTTPS=false
```

Notas:

- `GATECHAT_SECURITY_KEY_PATH` permite persistir la llave privada RSA entre reinicios. Si no existe, GateChat crea una con permisos restrictivos.
- `GATECHAT_ALLOWED_ORIGINS` debe limitarse al origen real del frontend en produccion; `*` queda solo como valor de desarrollo.
- Cuando quieras exigir HTTPS, cambia `GATECHAT_REQUIRE_HTTPS=true` y `VITE_GATECHAT_REQUIRE_HTTPS=true`, termina TLS en un proxy inverso o balanceador y envia `X-Forwarded-Proto: https` al backend.
