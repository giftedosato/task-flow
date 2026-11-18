# TaskFlow React App

A React dashboard for managing tasks with the existing TaskFlow Next.js API. The frontend does not contain a separate backend or access the database directly.

## Technologies

- React 19
- TypeScript
- Vite
- Native `fetch` and browser form APIs
- Auth.js Credentials session cookies from the TaskFlow backend

## Features

- Account registration, login, session restoration, and logout.
- Cookie-authenticated task listing and task create, edit, and delete.
- Backend search by task title or description.
- Combined status, priority, assignee, and due-date filtering.
- Server-side pagination (10 tasks per page).
- Loading, success, empty, validation, and error feedback.

## Requirements

- Node.js and npm.
- Access to the deployed TaskFlow API.
- For local development, the Vite development proxy must be able to reach the backend.

## Installation and development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. The development server proxies `/api` requests to `https://task-flow-six-rouge.vercel.app`.

The public Vite setting in `.env.example` is:

```dotenv
VITE_API_BASE_URL=/api
```

`TASKFLOW_API_ORIGIN` is a public backend URL used by the Render Node proxy. It is not a credential and is not exposed as a `VITE_` browser variable.

Only public configuration belongs in `VITE_` variables. Never put passwords, database credentials, or personal access tokens in frontend environment variables. `.env` and other `.env.*` files are ignored by Git; `.env.example` is intentionally tracked.

## API integration

The reusable API client is in `src/services/taskflowApi.ts`. It centralizes `/api` paths, cookies, JSON requests, cancellation, and structured API errors. Task ownership is enforced by the backend; the frontend does not send an owner ID.

Integrated routes:

- `POST /api/register`
- `GET /api/auth/csrf`
- `POST /api/auth/callback/credentials`
- `GET /api/auth/session`
- `POST /api/auth/signout`
- `GET /api/tasks` (search, filters, and pagination)
- `GET /api/tasks/{id}`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `DELETE /api/tasks/{id}`

Task API requests use Auth.js cookie sessions. Login and logout fetch a fresh CSRF token; login uses URL-encoded credentials and the required `X-Auth-Return-Redirect` header. The app does not use `/api/v1` Bearer tokens.

## Authentication and security

The dashboard is rendered only after the session endpoint confirms an authenticated user. Session cookies remain browser-managed (`credentials: include`); passwords are submitted to the documented auth endpoints and are not persisted in browser storage. CSRF protection and backend origin checks are not bypassed.

## Validation

```powershell
npm run lint
npm run build
```

There is currently no automated unit or browser test suite configured. Registration, authentication, and task mutations require manual testing with a student account.

## Deployment requirements and limitations

If a local auth or registration request returns `403` with `INVALID_ORIGIN`, the backend has not trusted the local frontend origin. The backend administrator must authorize the development origin or provide an approved same-origin development setup. Do not work around this by changing or spoofing request origin/host headers.

The Render Blueprint in `render.yaml` defines one Node web service. It serves the Vite build and forwards `/api` traffic to TaskFlow, preserving session cookies and the browser's `Origin` header. The Vite proxy in `vite.config.ts` is development-only; `npm run preview` is not a production API proxy.

The backend must explicitly trust the final Render site origin before registration or login can work. Render assigns the site URL; configure the backend using the exact origin shown after creating the service. This proxy does not spoof or remove the browser's `Origin` header and cannot override backend origin restrictions. Do not rely on the deployment until the backend owner has authorized the Render origin and the proxy has been verified end to end.

The Blueprint disables automatic deploys from later commits. Creating the service still requires an explicit action in Render. The UI currently covers authentication and tasks; profile and password-management screens are not implemented.
