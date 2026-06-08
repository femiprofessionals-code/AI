# Testing

## Backend

```bat
cd backend
.venv\Scripts\activate
pytest -q
```

`tests/` mocks Ollama / Piper / diffusers so unit tests run on any machine.

## Frontend

```bat
cd frontend
npm test
```

Vitest + React Testing Library.

## End-to-end smoke

With both services running:

```bat
scripts\smoke.bat
```

Generates a 15-second video on a fixed topic ("How honey is made") and checks the MP4 is ≥ 1 MB and decodable by ffprobe.

## Per-phase verification

| Phase                | Check                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Structure            | `tree /F` matches `docs/ARCHITECTURE.md`                              |
| Backend              | `curl http://localhost:8000/api/health` returns all services green    |
| Frontend             | `localhost:3000` renders the dashboard                                |
| AI integration       | `POST /api/scripts/generate` with topic `"test"` returns text         |
| Video generation     | Smoke test produces a playable MP4 in `data/projects/{id}/exports/`   |
| Optimization         | LLM + image gen on the same project never exceeds 9 GB RSS            |
