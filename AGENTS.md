# Agent Operating Procedures

## Blueprint Maintenance
Whenever you make changes to the app's structural architecture, tech stack, directory layout, UI logic, Firebase data models, or core features, you **MUST** simultaneously update `APP_BLUEPRINT.md` (and `firebase-blueprint.json` if data schemas have changed) to reflect those updates. 

This ensures that the `APP_BLUEPRINT.md` acts as a continuously updated living document for the application.

## Security Note: AI API Key
The `GEMINI_API_KEY` must **NEVER** be exposed to the frontend. All AI-related requests must go through the backend proxy server (`server.ts`).
