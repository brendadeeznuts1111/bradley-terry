# Architecture Overview

Effect HTTP service for Bradley-Terry ratings — ANSI-colored layer stack, matrix layout, dark terminal aesthetic.

## Layer stack (bottom → top)

| Layer | Color | Nodes |
|-------|-------|-------|
| **Config** | Gray | `RatingsConfig` → masseyUrl, dbPath, interval |
| **Services** | Multi | `MasseyClient` (fetch+decode), `RatingsDB` (sqlite+CRUD), `BTCompute` (pure+convergence) |
| **Effect Runtime** | Green | `Effect.gen`, `tryPromise`, `sync`, `catchAll`, `Layer.provide`, `Effect.run` |
| **HTTP Server** | Purple | `GET /api/ratings/bt`, `POST /api/ratings/refresh`, `GET /health` |
| **Schema** | Cyan | `MasseyTeam`, `MasseyData`, `BTRating`, `Schema.Struct`, `decodeUnknownSync` |

## Error channel

Tagged errors surface as red **E** badges on service nodes:

- **MasseyFetchError** — tagged, typed, catchable
- **DBError** — sqlite operation failures
- **BTComputationError** — convergence failures, team count context

## Data flow

1. **Config** fans out to all three services (`MasseyClient`, `RatingsDB`, `BTCompute`)
2. **Services** emit `Effect<_, E>` into the runtime layer
3. **Runtime** composes handlers for `Bun.serve`
4. **Server** responses encode through the Schema layer

## Mermaid source

```mermaid
flowchart BT
  subgraph schema ["Schema (cyan)"]
    MT[MasseyTeam]
    MD[MasseyData]
    BR[BTRating]
    SD[Schema.Struct / decodeUnknownSync]
  end

  subgraph http ["HTTP Server (purple)"]
    R1["GET /api/ratings/bt"]
    R2["POST /api/ratings/refresh"]
    R3["GET /health"]
  end

  subgraph runtime ["Effect Runtime (green)"]
    EG[Effect.gen]
    TP[tryPromise]
    SY[sync]
    CA[catchAll]
    LP[Layer.provide]
    ER[Effect.run]
  end

  subgraph services ["Services"]
    MC[MasseyClient\nfetch+decode]
    RD[RatingsDB\nsqlite+CRUD]
    BC[BTCompute\npure+convergence]
  end

  subgraph config ["Config (gray)"]
    RC[RatingsConfig]
    CFG["masseyUrl · dbPath · interval"]
  end

  RC --> CFG
  CFG --> MC
  CFG --> RD
  CFG --> BC
  MC --> EG
  RD --> EG
  BC --> EG
  EG --> TP --> SY --> CA --> LP --> ER
  ER --> R1 & R2 & R3
  R1 & R2 & R3 --> SD
  SD --> MT & MD & BR

  MC -.->|MasseyFetchError| CA
  RD -.->|DBError| CA
  BC -.->|BTComputationError| CA
```

## Library modules (package consumers)

For embedded use without the HTTP server:

```
BT Core → Loader (SQLite + Massey) → Repository → Cascade Integration
```

| Module | Role |
|--------|------|
| `schema.ts` | Branded `EntityId`, `Match`, `FitResult` |
| `massey-loader.ts` | Streaming Massey CSV ingestion |
| `match-adapter.ts` | SQLite `MatchRow` → validated `Match` |
| `src/bradley-terry/` | `fit()` core algorithm |
| `src/repository/` | Snapshot persistence |
| `src/integrations/cascade-mover.ts` | Win prob + delta consumer |
