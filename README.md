# Schedules Service

Vessel sailing schedules service built with TypeScript and Fastify.

## Overview

RESTful API for managing vessel sailing schedules with JWT-based authentication, search, and lifecycle management (DRAFT → OPEN → CLOSED).

## Quick Start

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `GET` | `/schedules` | Bearer token | Search schedules |
| `GET` | `/schedules/:id` | Bearer token | Get schedule by ID |
| `POST` | `/schedules` | Bearer token (modify) | Create schedule |
| `PUT` | `/schedules/:id` | Bearer token (modify) | Update schedule |
| `PATCH` | `/schedules/:id/close` | Bearer token (modify) | Close/open schedule |
| `PATCH` | `/schedules/:id/open` | Bearer token (modify) | Re-open schedule |
| `DELETE` | `/schedules/:id` | Bearer token (modify) | Delete schedule |
| `POST` | `/dev/generate-token` | No | Generate test token |

## Testing

```bash
npm test
```

## Deployment

The repo includes:

- **Dockerfile** — multi-stage build for container deployment
- **Bicep template** (`infra/azure/main.bicep`) — Azure infrastructure as code
- **GitHub Actions workflows** (`.github/workflows/`) — CI, provision, deploy
