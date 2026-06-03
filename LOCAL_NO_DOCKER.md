# Modo local sin Docker

Esta rama permite correr GateStack, GateWiki y GateStorage directo en Windows usando tu MySQL local.

## Puertos

- GateStack API: `http://192.168.1.150:8000`
- GateWiki API: `http://192.168.1.150:8001`
- GateStorage API: `http://192.168.1.150:8002`
- GateStack web: `http://192.168.1.150:5173`
- GateStorage web: `http://192.168.1.150:5174`
- GateWiki web: `http://192.168.1.150:5175`

## Primera instalacion

Desde la raiz del repo:

```powershell
.\scripts\install-local.ps1 -DbPassword "TU_PASSWORD_MYSQL"
```

Ese script crea `venv` en cada backend, instala dependencias Python, corre `npm install` en cada frontend y crea la base `gatestack` si tienes `mysql` en PATH.

## Arrancar todo

```powershell
.\scripts\start-local.ps1 -HostIp "192.168.1.150" -DbPassword "TU_PASSWORD_MYSQL"
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
- Si cambias tu IPv4, vuelve a arrancar con `-HostIp "TU_IPV4"`.
