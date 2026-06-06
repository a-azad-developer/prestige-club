# Prestige Club — User Matching System

A user matching system built with **Node.js**, **Fastify**, **PostgreSQL**, **Prisma ORM**, and **TypeScript**. The compatibility score is computed entirely inside PostgreSQL — the database returns already-scored and sorted results.

## Table of Contents

- [Tech Stack](#tech-stack)
- [How to Run](#how-to-run)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Compatibility Score Logic](#compatibility-score-logic)
- [SQL Implementation](#sql-implementation)
- [Suggested Indexes](#suggested-indexes)
- [Scaling to 1M+ Users](#scaling-to-1m-users)
- [Caching Strategy](#caching-strategy)

---

## Tech Stack

| Layer          | Choice                         | Rationale                                                    |
|----------------|--------------------------------|--------------------------------------------------------------|
| Runtime        | Node.js 20+                    | Modern JS runtime, good I/O for async workloads              |
| Framework      | Fastify 5                      | Fast, low overhead, built-in JSON schema (Ajv) validation, TypeScript friendly |
| API Docs       | Swagger UI (`@fastify/swagger-ui`) | Auto-generated OpenAPI 3.0 spec at `/docs` |
| Database       | PostgreSQL 18                  | Handles filtering, scoring (Jaccard similarity), sorting, and limiting in a single query |
| ORM            | Prisma                         | Type-safe client, migration workflow, raw SQL via `$queryRawUnsafe` |
| Validation     | Fastify / Ajv (built-in)       | Route schemas in `api.schemas.ts` define validation AND Swagger docs — one source of truth |
| Language       | TypeScript 5                   | Full type safety across the stack                            |

---

## How to Run

### Option 1: Local Development (Node.js + PostgreSQL)

#### Prerequisites

- **Node.js** v20 or later
- **PostgreSQL** 18+ running locally or accessible remotely
- **npm** or **yarn**

#### Setup Steps

```bash
# 1. Navigate to the project directory
cd prestige-club

# 2. Install dependencies
npm install

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env to match your PostgreSQL connection string

# 4. Generate Prisma client and push schema to the database
npx prisma generate
npx prisma db push

# 5. (Optional) Seed the database with sample users
npm run db:seed

# 6. Start the development server
npm run dev
```

The server will start at `http://localhost:3000`.

### Option 2: Running with Docker (Recommended)

#### Prerequisites

- **Docker** and **Docker Compose** (v2.22+)

#### Setup Steps

```bash
# Build and start both services
npm run docker:up
```

Or step by step:

```bash
# 1. Pre-download the Prisma engine for Alpine Linux (one-time, host network)
npm run docker:prepare

# 2. Build and start
docker compose up --build

# 3. In a separate terminal, seed the database (optional)
docker exec -it prestige-club-app node dist/seed.js
```

The server will be available at `http://localhost:3000`.
> **Swagger UI** at [`/docs`](http://localhost:3000/docs)

#### Docker Build — Fully Offline

The Docker build pre-downloads the Alpine-compatible Prisma engine to `.prisma-build/`. Subsequent builds use the local copy — zero network access needed.

#### Useful Docker Commands

```bash
# Start detached
docker compose up --build -d

# View logs
docker compose logs -f

# Seed data
docker exec -it prestige-club-app node dist/seed.js

# psql inside the db container
docker exec -it prestige-club-db psql -U postgres -d prestige_club

# Stop
docker compose down

# Wipe data volume
docker compose down -v
```

---

## API Endpoints

> Interactive Swagger UI at [`/docs`](http://localhost:3000/docs).

### `POST /users` — Create a new user

**Request Body:**

```json
{
  "name": "string (required, max 255)",
  "age": "number (required, 18–120)",
  "city": "string (required, max 255)",
  "educationLevel": "enum (HIGH_SCHOOL | ASSOCIATE | BACHELOR | MASTER | DOCTORATE | OTHER)",
  "goals": "string[] (required, 1–20 items)",
  "score_selfGrowth": "number (required, 0–100)"
}
```

**Response:** `201 Created` with the created user object. All fields are validated by Fastify against the route schema — no Zod dependency.

### `GET /users` — Retrieve all users (paginated)

**Query Parameters:**

| Param | Type   | Default | Description       |
|-------|--------|---------|-------------------|
| page  | number | 1       | Page number       |
| limit | number | 20      | Items per page    |

**Response:** `200 OK` with paginated user list and metadata.

### `GET /users/:id/match` — Get top 3 compatible users

**Path Parameters:**

| Param | Type | Description      |
|-------|------|------------------|
| id    | uuid | Target user UUID |

**Response:** `200 OK` with up to 3 matched users, each including a `compatibilityScore` (0–100). The score is computed entirely in PostgreSQL.

---

## Database Schema

```prisma
model User {
  id              String         @id @default(uuid()) @db.Uuid
  name            String         @db.VarChar(255)
  age             Int            @db.SmallInt
  city            String         @db.VarChar(255)
  educationLevel  EducationLevel
  goals           String[]
  score_selfGrowth Int           @db.SmallInt

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([city])
  @@index([age])
  @@index([score_selfGrowth])
  @@index([city, age, score_selfGrowth])
  @@index([goals], type: Gin)
  @@map("users")
}
```

### Design Decisions

- **UUID primary key**: Globally unique, no sequential enumeration.
- **`goals` as `String[]`**: PostgreSQL native arrays — no join table needed, supports GIN indexing.
- **`score_selfGrowth` / `age` as `SmallInt`**: 2-byte integers (0–100 and 18–120 range).
- **GIN index on `goals`**: Enables efficient array overlap (`&&`) queries.

---

## Compatibility Score Logic

The score **S** (0–100) uses four weighted criteria:

```
S = 0.2 × C  +  0.2 × A  +  0.3 × G  +  0.3 × Sg
```

| Component | Weight | Formula | Notes |
|-----------|--------|---------|-------|
| **City (C)** | 20% | `100` if same city, `0` otherwise | Case-insensitive trim |
| **Age (A)** | 20% | `100 × max(0, 1 − Δage / 20)` | Δage ≥ 20 → score 0 |
| **Goals (G)** | 30% | `100 × \|intersection\| / \|union\|` | Jaccard similarity of goal sets |
| **Self-Growth (Sg)** | 30% | `100 − Δscore` | Δscore ≥ 100 → score 0 |

### Worked Example

**Alice** (NYC, 28, goals: [career growth, networking, fitness, travel], self-growth: 85)
**Bob** (NYC, 35, goals: [career growth, investing, reading, fitness], self-growth: 72)

```
C  = 100                              (same city)
A  = 100 × max(0, 1 − 7/20) = 65      (Δage = 7)
G  = 100 × 2/6 ≈ 33                   (intersection: career growth, fitness — 2/6)
Sg = 100 − 13 = 87                    (Δscore = 13)

S  = 0.2(100) + 0.2(65) + 0.3(33) + 0.3(87)
   = 20 + 13 + 9.9 + 26.1 = 69
```

---

## SQL Implementation

The full compatibility score is computed inside PostgreSQL via `prisma.$queryRawUnsafe`. The query uses indexed columns for pre-filtering, then computes the exact score including goals Jaccard similarity:

```sql
SELECT
  u.id, u.name, u.age, u.city,
  u."educationLevel", u.goals, u."score_selfGrowth",
  ROUND(
      0.2 * CASE WHEN u.city = $2 THEN 100 ELSE 0 END
    + 0.2 * 100.0 * GREATEST(0, 1 - ABS(u.age - $3) / 20.0)
    + 0.3 * 100.0 * COALESCE(
        (SELECT COUNT(*)::numeric
         FROM (SELECT UNNEST(u.goals) INTERSECT SELECT UNNEST($4::text[])) AS inter)
        / NULLIF(
          (SELECT COUNT(*)::numeric
           FROM (SELECT UNNEST(u.goals) UNION SELECT UNNEST($4::text[])) AS uni),
          0),
        0
      )
    + 0.3 * GREATEST(0, 100 - ABS(u."score_selfGrowth" - $5))
  )::integer AS "compatibilityScore"
FROM users u
WHERE u.id <> $1::uuid
  AND u.city = $2
  AND u.age BETWEEN ($3 - 15) AND ($3 + 15)
  AND u."score_selfGrowth" BETWEEN GREATEST(0, $5 - 40) AND LEAST(100, $5 + 40)
ORDER BY "compatibilityScore" DESC
LIMIT 3;
```

This query:
- **Filters** using the composite index `(city, age, score_selfGrowth)` — fast range scan
- **Computes** the goals Jaccard similarity using PostgreSQL's `UNNEST` + `INTERSECT` / `UNION`
- **Sorts** by the exact score descending
- **Returns** only the top N rows — zero application post-processing

### Fallback Tiers

If the standard filter returns fewer than N results, the query widens:

| Attempt | City filter | Age range | Score range |
|---------|------------|-----------|-------------|
| 1       | Same city  | ±15       | ±40         |
| 2       | Same city  | ±30       | ±80         |
| 3       | Any city   | ±30       | ±80         |

---

## Suggested Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `[city, age, score_selfGrowth]` | Composite B-tree | Main match query — filters all three columns in one index scan |
| `[goals]` | GIN | Array overlap lookups — enables fast candidate narrowing by shared goals |
| `[city]` | B-tree | Fallback queries, user listing |
| `[age]` | B-tree | Range queries |
| `[score_selfGrowth]` | B-tree | Range queries |

The composite index is the most important — it enables the match query to skip scanning 99.9% of rows at 1M+ users.

---

## Scaling to 1M+ Users

The current architecture is already designed for this scale:

### 1. SQL Pre-filtering (Already Implemented)

The composite index `(city, age, score_selfGrowth)` narrows candidates before the expensive Jaccard computation runs. At 1M users distributed across 50+ cities, the initial filter reduces the candidate pool to a few thousand rows per city. The `LIMIT 3` ensures PostgreSQL's sort is trivially cheap.

### 2. Pre-computed Matches

For very frequent access, pre-compute top matches in a background job and store them:

```sql
CREATE TABLE user_matches (
  user_id          UUID REFERENCES users(id),
  matched_user_id  UUID REFERENCES users(id),
  score            SMALLINT,
  PRIMARY KEY (user_id, matched_user_id)
);

CREATE INDEX ON user_matches (user_id, score DESC);
```

Refresh on a schedule (e.g., every hour) or trigger on profile updates.

### 3. Partitioning by City

```sql
CREATE TABLE users_nyc PARTITION OF users FOR VALUES IN ('New York');
CREATE TABLE users_sf  PARTITION OF users FOR VALUES IN ('San Francisco');
```

Since the match query always filters by city first, partitioning by city prunes entire partitions before scanning.

### 4. Read Replicas

Route match queries to PostgreSQL read replicas. Writes go to the primary. The match query is a pure read — no consistency issues.

### 5. Cursor-based Pagination for GET /users

Replace `OFFSET` with cursor pagination:

```sql
SELECT * FROM users WHERE id > $cursor ORDER BY id LIMIT 20;
```

---

## Caching Strategy

### Where Caching Helps

| Cache Target | Cache Type | TTL | Rationale |
|-------------|------------|-----|-----------|
| **Top matches for a user** | Redis (key: `matches:{userId}`) | 5–15 min | Match scores don't change every second; saves a full SQL computation |
| **GET /users (page 1)** | Redis | 1 min | Frequently requested, repeatable query |
| **Individual user profiles** | Redis (key: `user:{id}`) | 5 min | `/users/:id/match` fetches the target user |
| **User count** | In-memory | 30 sec | Cheap, but saves a `COUNT(*)` scan |

### Cache-Aside Pattern

```typescript
async function getTopMatches(userId: string): Promise<MatchResult[]> {
  const cacheKey = `matches:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const targetUser = await userService.getUserById(userId);
  const matches = await matchService.findTopMatches(
    targetUser.id, targetUser.city,
    targetUser.age, targetUser.goals,
    targetUser.score_selfGrowth,
  );

  await redis.setex(cacheKey, 300, JSON.stringify(matches));
  return matches;
}
```

### Invalidation Triggers

- User updates profile → invalidate `matches:{userId}`
- New user created → let TTL expire naturally
- User deleted → invalidate matches for users who had them in their top N

---

## Project Structure

```
prestige-club/
├── prisma/
│   └── schema.prisma           # Database schema + indexes (B-tree + GIN)
├── scripts/
│   ├── download-engine.cjs     # Runtime engine download fallback (Node.js)
│   └── prepare-engines.mjs     # Host-side engine download for Docker build
├── src/
│   ├── lib/
│   │   ├── errors.ts           # Error classes + handler
│   │   └── prisma.ts           # Prisma client singleton
│   ├── middleware/
│   │   └── error-handler.ts    # Global Fastify error handler
│   ├── routes/
│   │   └── user.routes.ts      # POST /users, GET /users, GET /users/:id/match
│   ├── schemas/
│   │   └── api.schemas.ts      # Fastify JSON schemas (validation + Swagger)
│   ├── services/
│   │   ├── match.service.ts    # Matching algorithm (raw SQL, computed in PG)
│   │   └── user.service.ts     # User CRUD operations
│   ├── types/
│   │   ├── index.ts            # Type re-exports
│   │   └── user.types.ts       # TypeScript interfaces
│   ├── app.ts                  # Fastify bootstrap + Swagger + health check
│   └── seed.ts                 # Database seeding script
├── .dockerignore
├── .env.example
├── .gitignore
├── .gitattributes              # Force LF line endings for shell scripts
├── docker-compose.yml           # PostgreSQL 18 + app orchestration
├── docker-entrypoint.sh         # Wait for PG, push schema, start app
├── Dockerfile                   # Multi-stage production build
├── package.json
├── tsconfig.json
└── README.md
```
