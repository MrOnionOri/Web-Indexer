# Modo local sin Docker

Esta rama permite correr GateStack, GateWiki y GateStorage directo en Windows usando tu MySQL local.

## Puertos

- GateStack API: `http://192.168.1.150:8000`
- GateWiki API: `http://192.168.1.150:8001`
- GateStorage API: `http://192.168.1.150:8002`
- GateStack web: `http://192.168.1.150:5173`
- GateWiki web: `http://192.168.1.150:5174`
- GateStorage web: `http://192.168.1.150:5175`

## Arranque automatico

Desde la raiz del repo:

```powershell
.\scripts\run-local.ps1
```

El script detecta la IPv4 de la PC, crea los entornos con Python 3.11, instala dependencias faltantes y arranca los seis servicios. La configuracion y credenciales se leen del `.env` incluido en la raiz.

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

## Notas

- No necesitas Docker para este modo.
- GateStorage guarda archivos en `gatestorage/data/storage`.
- GateWiki usa GateStack IAM con `GATESTACK_API_URL`.
- GateWiki usa GateStorage con `GATESTORAGE_API_URL`.
- Todos los backends deben compartir `DATA_ENCRYPTION_KEY` para leer columnas cifradas.
- La IPv4 se detecta automaticamente. Todavia puedes forzarla con `-HostIp "TU_IPV4"`.
