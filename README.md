# Notes

An AI/ML interview-prep study app. Browse a 16-phase roadmap (Python & Math through Forward Deployed Engineer topics) and read structured notes — what it is, why it exists, how it works, when to use/avoid it, what goes wrong, and a real example — for every topic. All notes are pre-written, so it works out of the box with no setup or API key required. You can still manually edit any note's text and save your changes.

Single FastAPI backend serves both the API and the plain HTML/JS/CSS frontend (`backend/static/`) — no build step, no separate frontend server.

## Run locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000**.

Study progress (the status you mark per topic) is saved in your browser's local storage — nothing to configure, nothing that resets when the server restarts.

## Deploy (free, on Render)

1. Push this repo to GitHub (if not already).
2. Go to [render.com](https://render.com) → sign in with GitHub.
3. **New → Blueprint** → select this repo → **Apply**.

That's it — Render reads `render.yaml` and deploys automatically. Every future `git push` redeploys it.
