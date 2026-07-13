# Modo local sin Docker

Este modo corre GateStack, GateWiki y GateStorage directo en Windows, sin Docker ni WSL.

Recomendado para la PC del trabajo:

- Python 3.11 x64
- Node.js 22 LTS
- MySQL 8.x local o en otro servidor
- Ollama instalado si quieres usar la AI/RAG
- Tesseract OCR instalado si quieres que GateWiki lea texto de imagenes

## Puertos

- GateStack API: `http://TU_IP:8000`
- GateWiki API: `http://TU_IP:8001`
- GateStorage API: `http://TU_IP:8002`
- GateChat API: `http://TU_IP:8013`
- GateStack web: `http://TU_IP:5173`
- GateWiki web: `http://TU_IP:5174`
- GateStorage web: `http://TU_IP:5175`
- GateChat web: `http://TU_IP:5186`

## Arranque automatico

Desde la raiz del repo:

```powershell
.\scripts\run-local.ps1
```

El script detecta la IPv4 de la PC, crea los entornos con Python 3.11, instala dependencias faltantes y arranca los seis servicios. La configuracion y credenciales se leen del `.env` incluido en la raiz.

Si MySQL esta en otra maquina:

```powershell
.\scripts\run-local.ps1 -DbHost "IP_DEL_MYSQL"
```

Si quieres forzar la IP publica de la PC donde se abre el navegador:

```powershell
.\scripts\run-local.ps1 -HostIp "IP_DE_ESTA_PC" -DbHost "IP_DEL_MYSQL"
```

Si Tesseract OCR no esta en `PATH`:

```powershell
.\scripts\run-local.ps1 -TesseractCmd "C:\Program Files\Tesseract-OCR\tesseract.exe"
```

Si Ollama corre en otra maquina:

```powershell
.\scripts\run-local.ps1 -OllamaBaseUrl "http://IP_OLLAMA:11434"
```

Si en esa PC aun no existe el perfil `gatewiki-assistant`, puedes arrancar con un modelo directo:

```powershell
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
.\scripts\run-local.ps1 -OllamaChatModel "qwen2.5:7b-instruct" -OllamaEmbedModel "nomic-embed-text"
```

Para reinstalar dependencias:

```powershell
.\scripts\run-local.ps1 -Reinstall
```

## Arrancar todo

```powershell
.\scripts\start-local.ps1
```

Los procesos arrancan en background y dejan logs en:

```txt
logs/local/
```

## Parar todo

```powershell
.\scripts\stop-local.ps1
```

## GateChat sin Docker

GateChat es independiente de GateWiki/GateStack y usa Ollama + MySQL.

```powershell
.\scripts\run-gatechat-local.ps1
```

Para usar otro modelo:

```powershell
.\scripts\run-gatechat-local.ps1 -Model "qwen2.5:14b-instruct"
```

## Notas

- No necesitas Docker para este modo.
- El instalador crea la base `gatestack` y los usuarios de app definidos en `.env` si tienes el CLI `mysql` en `PATH`.
- Si no tienes `mysql` en `PATH`, crea la base y usuarios manualmente o instala MySQL Shell/Client.
- GateStorage guarda archivos en `gatestorage/data/storage`.
- GateWiki usa GateStack IAM con `GATESTACK_API_URL`.
- GateWiki usa GateStorage con `GATESTORAGE_API_URL`.
- GateWiki usa Ollama local en `http://127.0.0.1:11434` salvo que pases `-OllamaBaseUrl`.
- Para RAG necesitas tener un modelo de chat y uno de embeddings:

```powershell
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

- Todos los backends deben compartir `DATA_ENCRYPTION_KEY` para leer columnas cifradas.
- La IPv4 se detecta automaticamente. Todavia puedes forzarla con `-HostIp "TU_IPV4"`.
