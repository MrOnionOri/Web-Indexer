# Video Watcher

Video Watcher is a GateStack satellite app for offline visual QA on recorded screens or TV captures.

The first MVP follows the same service boundary as the Confluence/GateWiki workspace:

- GateStack owns IAM and user sessions.
- Video Watcher validates the current user through GateStack `/auth/me`.
- Video Watcher stores its own jobs, candidate events, verifier decisions, and final issues.
- The visual pipeline is independent from the frontend and from GateStack business tables.

## IAM permissions

Create these permissions in GateStack IAM before using the app:

```text
video_watcher:view
video_watcher:analyze
video_watcher:admin
```

`video_watcher:admin` and platform admins can access all Video Watcher actions.

## Local endpoints

```text
Backend:  http://localhost:8003
Frontend: http://localhost:5176
Health:   http://localhost:8003/health
```

## Run without Docker

Use this mode when MySQL and GateStack are already running on the real machine.

1. Copy the backend local env:

```powershell
Copy-Item video-watcher\backend\.env.local.example video-watcher\backend\.env.local
```

Then edit `video-watcher\backend\.env.local` and set `DB_PASSWORD` for your real MySQL user. The default local connection is:

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=gatestack
DB_USER=root
```

2. Copy the frontend local env:

```powershell
Copy-Item video-watcher\frontend\.env.local.example video-watcher\frontend\.env.local
```

3. Start both apps:

```powershell
.\video-watcher\scripts\start-local.ps1
```

Or start them separately:

```powershell
.\video-watcher\scripts\start-backend-local.ps1 -Install
.\video-watcher\scripts\start-frontend-local.ps1
```

The backend stores uploads, frames, reports, and dataset artifacts under `video-watcher\backend\data` unless `VIDEO_WATCHER_DATA_ROOT` is changed.

## Run with Docker

Docker still works through the root `docker-compose.yml`. In that mode the service receives `DB_HOST=host.docker.internal` from Compose so it can keep using the MySQL installed on the real machine.

## Current MVP

- Upload short video files.
- Sample frames with OpenCV.
- Detect black screen, freeze-like states, and large visual changes.
- Extract evidence windows with FFmpeg when available.
- Verify through a mock vision verifier by default.
- Store JSON reports under `data/reports`.

The LLM verifier is provider-agnostic. The current default is `LLM_PROVIDER=mock` so local testing does not send frames outside the machine.

## Future Excel flow

The Excel you mentioned should fit as a catalog/context import layer, for example:

- TV identifier
- expected channel/dashboard
- location
- error categories
- expected visual state
- escalation owner

That imported context can be attached to each job as `project_context` or later normalized into first-class tables.
