# HTTP API reference

Base URL: `http://localhost:3000` (default `PORT`).

All JSON responses use `Content-Type: application/json`. CORS is enabled (`CORS_ORIGIN`, default `*`).

## Endpoints

### `GET /health`

Liveness + dependency checks.

**Response 200**

```json
{
  "status": "ok",
  "version": "1.3.14",
  "timestamp": 1719398400000,
  "checks": {
    "db": "ok",
    "secretsBackend": "auto",
    "lastUpdated": "2024-06-26T12:00:00.000Z",
    "teamCount": 32
  }
}
```

### `GET /api/ratings/bt`

Current Bradley-Terry ratings for a sport/season.

| Query | Default | Description |
|-------|---------|-------------|
| `sport` | `default` | Sport key |
| `season` | `default` | Season key |

**Response 200** — `BTRating[]`

```json
[
  {
    "teamID": "A",
    "teamName": "Alpha",
    "rating": 1.42,
    "confidence": 0.85,
    "rank": 1,
    "sport": "fbs",
    "season": "2025"
  }
]
```

### `GET /api/ratings/history`

Historical snapshots (one row per team per refresh).

| Query | Default | Description |
|-------|---------|-------------|
| `sport` | `default` | Sport key |
| `season` | `default` | Season key |

**Response 200** — `BTRatingHistory[]` (includes `snapshotAt`)

### `POST /api/ratings/refresh`

Fetch Massey JSON → compute BT → persist to SQLite.

**Response 202**

```json
{
  "stored": 32,
  "sport": "fbs",
  "season": "2025"
}
```

## Error responses

Structured errors use `{ "error": "<Tag>", "message": "..." }`.

| Status | Tag | When |
|--------|-----|------|
| 400 | `SchemaDecodeError` | Upstream JSON invalid |
| 401 | `SecretError` | Expired secret |
| 404 | `NotFound` | Unknown route |
| 405 | `MethodNotAllowed` | Wrong HTTP method |
| 422 | `BTComputationError` | BT fit failed |
| 500 | `DBError` | SQLite failure |
| 502 | `MasseyFetchError` | Upstream fetch failed |
| 503 | `SecretError` | Secret not found |

## curl examples

```bash
# Health
curl -s http://localhost:3000/health | jq

# Refresh (populate DB)
curl -s -X POST http://localhost:3000/api/ratings/refresh | jq

# Current ratings
curl -s "http://localhost:3000/api/ratings/bt?sport=fbs&season=2025" | jq

# History
curl -s "http://localhost:3000/api/ratings/history?sport=fbs&season=2025" | jq '.[0:3]'
```

## Auto-refresh

When `REFRESH_INTERVAL > 0` (default `3600`), the server runs `POST /api/ratings/refresh` on that interval in the background. Set `REFRESH_INTERVAL=0` to disable.

## Schema types

Defined in `src/service/schemas.ts` — decoded/encoded via Effect `Schema`.
