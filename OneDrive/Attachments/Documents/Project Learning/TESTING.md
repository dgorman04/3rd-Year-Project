# Testing Guide – STATO / SportsHub (3rd Year CS Project)

This document describes how to run **unit** and **integration** tests for the backend and frontend.

---

## Backend (Django)

All backend tests live under `backend/stato/tests/`.

### Run all backend tests

From the project root:

```bash
cd backend
python manage.py test stato.tests
```

From the `backend` folder:

```bash
python manage.py test stato.tests
```

### Run with more output

```bash
python manage.py test stato.tests --verbosity=2
```

### Run a single test file or test case

```bash
# All tests in test_api_chat
python manage.py test stato.tests.test_api_chat

# One test class
python manage.py test stato.tests.test_api_chat.ChatAPIIntegrationTests

# One test method
python manage.py test stato.tests.test_api_chat.ChatAPIIntegrationTests.test_chat_get_returns_empty_list
```

### What’s covered

| Category | File | Description |
|----------|------|-------------|
| **Unit** | `test_models.py` | Team, Profile, Player, Match, ChatMessage, constraints (e.g. unique team+player name) |
| **Unit** | `test_permissions.py` | `IsManager`, `IsEnabled` |
| **Unit** | `test_views_helpers.py` | `_get_team`, `_parse_kickoff` |
| **Unit** | `test_serializers.py` | TeamSerializer, TeamSignupSerializer, MatchSerializer |
| **Integration** | `test_api_auth.py` | Login, refresh, `/api/auth/me/` |
| **Integration** | `test_api_matches.py` | Match list/detail, timer, permissions |
| **Integration** | `test_api_chat.py` | GET/POST `/api/chat/messages/`, no team, empty message, player access |
| **Integration** | `test_api_players.py` | Signup, join-team, leave-team, `/api/players/me/`, `/api/players/me/stats/` |
| **Integration** | `test_api_teams.py` | `/api/teams/me/`, team signup, `/api/teams/performance-stats/` |

Tests use Django’s test database (SQLite in memory by default). No Redis or external services are required for the current tests.

---

## Frontend (Expo / React Native)

Tests use **Jest** with the **jest-expo** preset.

### Install test dependencies (once)

In `frontend3/SportsHub`:

```bash
npm install --save-dev jest jest-expo
```

Add to `package.json` under `"scripts"`:

```json
"test": "jest",
"test:watch": "jest --watch"
```

### Run frontend tests

From `frontend3/SportsHub`:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

### What’s covered

| Category | File | Description |
|----------|------|-------------|
| **Unit** | `__tests__/lib/auth.test.js` | `getToken`, `setToken`, `clearToken` (with mocked AsyncStorage) |
| **Unit** | `__tests__/lib/config.test.js` | `API`, `ngrokHeaders`, `normalizeRecordingUrl` |

Config: `jest.config.js` (preset `jest-expo`, `jest.setup.js` for `__DEV__`).

---

## Summary

- **Backend:** `cd backend && python manage.py test stato.tests`
- **Frontend:** `cd frontend3/SportsHub && npm test` (after adding Jest and scripts as above)

For a 3rd year project, this gives you a clear split between **unit** tests (models, serializers, permissions, helpers, auth/config) and **integration** tests (HTTP API for auth, matches, chat, players, teams).
