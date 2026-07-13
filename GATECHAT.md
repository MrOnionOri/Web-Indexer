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
