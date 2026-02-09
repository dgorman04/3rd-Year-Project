# Deploying SportsHub to the Cloud

Yes, it’s **reasonably easy** to put the app in the cloud now. You don’t need to change much; the main work is configuring the host and env vars.

---

## What you have now

| Part | Current | Cloud-ready? |
|------|---------|--------------|
| **Frontend** | Expo app, API URL from `.env` | ✅ Just set `EXPO_PUBLIC_API_BASE` to your backend URL |
| **Backend** | Django + SQLite + local `media/` | ✅ Deploy Django; optionally switch to Postgres + S3 later |
| **WebSockets** | Node `server.js` + Redis | ⚠️ Deploy as extra service, or use REST-only at first |

---

## Easiest path: backend only (REST, no WebSockets)

1. **Pick a host** (one backend service):
   - **Railway** – [railway.app](https://railway.app) – simple Django deploy
   - **Render** – [render.com](https://render.com) – free tier, Web Service for Django

2. **Backend setup**
   - In the backend folder you have (or will have) `requirements.txt`.
   - Add a **start command** so the host runs Django, e.g.:
     - `gunicorn backend.wsgi:application` (Railway/Render often auto-detect this)
   - Set **environment variables** on the host:
     - `SECRET_KEY` – e.g. a long random string
     - `DEBUG=0`
     - `ALLOWED_HOSTS` – e.g. `your-app.railway.app` or `your-app.onrender.com`
   - **Media files:** On free tiers the filesystem is often ephemeral (uploads disappear after redeploy). For a demo that’s OK. For real use, add S3 (or similar) later.

3. **Database**
   - **Keep SQLite** for the simplest deploy: it works on Railway/Render for low traffic; data can be lost on redeploy on some free tiers.
   - **Or** use the host’s **Postgres** (Render/Railway both offer it): set `DATABASE_URL` and use `dj-database-url` in `settings.py` when `DATABASE_URL` is set.

4. **Frontend**
   - In the Expo app’s `.env` set:
     - `EXPO_PUBLIC_API_BASE=https://your-backend-url`
   - Then use the app (Expo Go or web) against that URL. No code change needed if `config.js` already uses `EXPO_PUBLIC_API_BASE`.

5. **WebSockets (optional)**
   - To keep “live” updates over WebSockets you’d also deploy the Node `server.js` and Redis (e.g. Redis Cloud free tier) and set `EXPO_PUBLIC_WS_URL` to the WebSocket URL. You can do that after the REST API works in the cloud.

---

## Summary

- **Easiest:** Deploy Django (with `requirements.txt` + gunicorn) to Railway or Render, set `SECRET_KEY`, `DEBUG=0`, `ALLOWED_HOSTS`, and point the Expo app’s `.env` at that URL. No cloud is *required* for your project to work, but this gets it “in the cloud” quickly.
- **More robust later:** Add Postgres (via `DATABASE_URL`) and S3 (or similar) for media if you need persistence and “proper” cloud infrastructure for your report.
