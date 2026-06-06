# Prestige Club — User Matching System

A simplified user matching system built with **Node.js**, **Fastify**, **PostgreSQL**, **Prisma ORM**, and **TypeScript**.

## Table of Contents

- [Tech Stack](#tech-stack)
- [How to Run](#how-to-run)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Compatibility Score Logic](#compatibility-score-logic)
- [Suggested Indexes](#suggested-indexes)
- [Scaling to 1M+ Users](#scaling-to-1m-users)
- [Caching Strategy](#caching-strategy)

---

## Tech Stack

| Layer          | Choice                         | Rationale                                                    |
|----------------|--------------------------------|--------------------------------------------------------------|
| Runtime        | Node.js 20+                    | Modern JS runtime, good I/O for async workloads              |
| Framework      | Fastify 5                      | Fast, low overhead, built-in schema validation, TypeScript friendly |
| API Docs       | Swagger UI (@fastify/swagger-ui) | Auto-generated OpenAPI 3.0 spec at `/docs` |
| Database       | PostgreSQL 18                  | Robust relational DB, excellent with array types and indexing |
| ORM            | Prisma                         | Type-safe, auto-generated client, great migration workflow, native PostgreSQL array support |
| Validation     | Zod                            | Composable, type-inferred schemas; integrates cleanly with TypeScript |
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
# 1. Build and start both services (PostgreSQL 18 + the app)
docker compose up --build

# 2. In a separate terminal, seed the database (optional)
docker exec -it prestige-club-app node dist/seed.js
```

The server will be available at `http://localhost:3000`.

> **Swagger UI** is available at [`http://localhost:3000/docs`](http://localhost:3000/docs).

#### Docker Compose Services

| Service | Image / Build | Port  | Description             |
|---------|---------------|-------|-------------------------|
| `db`    | `postgres:18-alpine` | 5432  | PostgreSQL 18 database  |
| `app`   | Build from `Dockerfile` | 3000  | Fastify API server      |

The `db` service includes a **health check** that waits for PostgreSQL to accept connections before the `app` service starts. The `app` container's entrypoint script also waits for the database, runs `prisma db push` to ensure the schema is up-to-date, then starts the server.

#### Useful Docker Commands

```bash
# Start in detached mode (background)
docker compose up --build -d

# View logs
docker compose logs -f

# Run database seed (uses the compiled dist/seed.js from the production image)
docker exec -it prestige-club-app node dist/seed.js

# Open a shell inside the app container
docker exec -it prestige-club-app sh

# Access psql inside the db container
docker exec -it prestige-club-db psql -U postgres -d prestige_club

# Stop all services
docker compose down

# Stop and delete volumes (wipes database data)
docker compose down -v
```

> **Note:** PostgreSQL 18+ uses a version-specific subdirectory layout (`/var/lib/postgresql/18/data`) to support `pg_upgrade --link` across major version bumps. If you previously ran the container with an older PostgreSQL image and mounted at `/var/lib/postgresql/data`, you must delete the old volume first:
> ```bash
> docker compose down -v
> docker compose up --build
> ```

### Verify It Works

```bash
# Health check
curl http://localhost:3000/health

# Create a user
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "age": 30,
    "city": "New York",
    "educationLevel": "BACHELOR",
    "goals": ["career growth", "fitness"],
    "score_selfGrowth": 80
  }'

# Get all users
curl http://localhost:3000/users?page=1&limit=10

# Get matches for a user (replace :id with actual UUID)
curl http://localhost:3000/users/USER_UUID_HERE/match
```

---

## API Endpoints

> A fully interactive Swagger UI is available at [`/docs`](http://localhost:3000/docs) when the server is running. You can test all endpoints directly from your browser.

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

**Response:** `201 Created` with the created user object.

### `GET /users` — Retrieve all users (paginated)

**Query Parameters:**

| Param | Type   | Default | Description       |
|-------|--------|---------|-------------------|
| page  | number | 1       | Page number       |
| limit | number | 20      | Items per page    |

**Response:** `200 OK` with paginated user list and metadata.

### `GET /users/:id/match` — Get top 3 compatible users

**Path Parameters:**

| Param | Type   | Description      |
|-------|--------|------------------|
| id    | uuid   | Target user ID   |

**Response:** `200 OK` with an array of up to 3 matched users, each including a `compatibilityScore`.

---

## Database Schema

### User Entity

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
  @@map("users")
}
```

### Design Decisions

- **UUID primary key**: Avoids sequential ID enumeration; globally unique without coordination.
- **`goals` as `String[]`**: PostgreSQL's native array type is efficient for storage and querying. No separate join table needed for this simple case, though a normalized `goals` table would be better at scale.
- **`score_selfGrowth` as `SmallInt`**: Values are 0–100, so a 2-byte integer is sufficient and saves space.
- **`age` as `SmallInt`**: Ages 18–120 fit comfortably in 2 bytes.

### Education Level Enum

```
HIGH_SCHOOL, ASSOCIATE, BACHELOR, MASTER, DOCTORATE, OTHER
```

---

## Compatibility Score Logic

The compatibility score **S** is calculated on a scale of **0 to 100** using the following weighted formula:

```
S = 0.2 × C  +  0.2 × A  +  0.3 × G  +  0.3 × Sg
```

### Component Breakdown

| Component | Weight | Score Formula | Example |
|-----------|--------|---------------|---------|
| **City (C)** | 20% | `100` if same city (case-insensitive), `0` otherwise | Alice & Bob (both NYC) → C = 100 |
| **Age (A)** | 20% | `100 × max(0, 1 − Δage / 20)` where `Δage = \|age₁ − age₂\|` | Alice (28) & Bob (35), Δ = 7 → A = 100 × max(0, 1 − 7/20) = 65 |
| **Goals (G)** | 30% | `100 × \|Goals₁ ∩ Goals₂\| / \|Goals₁ ∪ Goals₂\|` | Shared: `career growth, fitness` (2), Union: `career growth, networking, fitness, travel, investing, reading` (6) → G = 100 × 2/6 ≈ 33 |
| **Self-Growth (Sg)** | 30% | `100 − Δscore` where `Δscore = \|score₁ − score₂\|` | Alice (85) & Bob (72), Δ = 13 → Sg = 100 − 13 = 87 |

### Worked Example

**Alice** (NYC, 28, goals: [career growth, networking, fitness, travel], self-growth: 85)
**Bob** (NYC, 35, goals: [career growth, investing, reading, fitness], self-growth: 72)

```
C  = 100           (same city)
A  = 100 × max(0, 1 − 7/20) = 65
G  = 100 × 2/6 ≈ 33.3 → 33
Sg = 100 − 13 = 87

S  = 0.2(100) + 0.2(65) + 0.3(33) + 0.3(87)
   = 20 + 13 + 9.9 + 26.1
   = 69
```

Alice and Bob have a compatibility score of **69/100**.

---

## Suggested Indexes

The Prisma schema already defines these indexes:

| Index | Type | Rationale |
|-------|------|-----------|
| `[city]` | B-tree | Filters users by city (first filter in optimized matching) |
| `[age]` | B-tree | Range queries for age-based filtering |
| `[score_selfGrowth]` | B-tree | Range queries for self-growth score filtering |
| `[city, age, score_selfGrowth]` | Composite B-tree | Covering index for the most common matching filter combination |

### Why These Indexes

The matching algorithm currently loads all users and computes scores in-memory. However, at scale you would pre-filter candidates. The composite index on `(city, age, score_selfGrowth)` is the most important — it allows the database to quickly retrieve a subset of users that are most likely to be good matches (same city, similar age, similar self-growth score) without scanning the entire table.

---

## Scaling to 1M+ Users

If the system grows to 1M+ users, several optimizations would become necessary:

### 1. Pre-filtering Before Scoring

Instead of computing scores for all 1M users against a target, apply **coarse filters** first:

- **Same city** — Reduces candidate pool drastically (most users live in one of a few dozen cities)
- **Age ± 10 years** — Further narrows candidates
- **Score_selfGrowth ± 30 points** — Keeps only plausibly compatible users

SQL + composite indexes can return the filtered set in milliseconds.

### 2. Batch / Offline Matching

For a "top matches" feature, pre-compute compatibility scores in a **background job** (e.g., via Bull/BullMQ with Redis). Store results in a `user_matches` table:

```sql
CREATE TABLE user_matches (
  user_id UUID REFERENCES users(id),
  matched_user_id UUID REFERENCES users(id),
  score SMALLINT,
  PRIMARY KEY (user_id, matched_user_id),
  INDEX (user_id, score DESC)
);
```

Refresh periodically (e.g., daily) or on-demand when user data changes.

### 3. Parallelization

- Shard the user pool by city (users in different cities rarely match well anyway due to the 20% city weight)
- Use **worker threads** or separate microservices to compute matches per city shard in parallel

### 4. Read Replicas

- Direct all read queries (`GET /users`, matching) to **read replicas** of PostgreSQL
- Writes go to the primary; replication lag is acceptable for matching (near-real-time is fine)

### 5. Pagination & Streaming for GET /users

At 1M users, paginated queries with `offset` become slow. Use **cursor-based pagination** using the `id` or `createdAt` field:

```sql
SELECT * FROM users WHERE id > $cursor ORDER BY id LIMIT 20;
```

---

## Caching Strategy

### Where Caching Helps Most

| Cache Target | Cache Type | TTL | Rationale |
|-------------|------------|-----|-----------|
| **Top matches for a user** | Redis (key: `matches:{userId}`) | 5–15 min | Matches don't change every second; caching reduces repeated computation |
| **GET /users list (page 1)** | Redis or in-memory | 1 min | First page is frequently requested; pagination queries are repeatable |
| **Individual user profiles** | Redis (key: `user:{id}`) | 5 min | `/users/:id/match` fetches the target user; cache avoids DB lookup |
| **User count / metadata** | In-memory variable | 30 sec | `total` count used in pagination meta is cheap but still worth caching |

### Caching Architecture (Recommended)

```
                  ┌─────────────┐
                  │   Client    │
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │   Fastify   │
                  │   (API)     │
                  └──┬──────┬───┘
                     │      │
              ┌──────▼┐ ┌───▼──────┐
              │ Redis │ │ PostgreSQL│
              │(Cache)│ │ (Primary) │
              └───────┘ └──────────┘
```

### Cache-Aside Pattern Implementation

```typescript
async function getTopMatches(userId: string): Promise<MatchResult[]> {
  const cacheKey = `matches:${userId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Compute matches
  const targetUser = await userService.getUserById(userId);
  const allUsers = await userService.getAllUsersForMatching();
  const matches = matchService.findTopMatches(targetUser, allUsers);

  // Store in cache with TTL
  await redis.setex(cacheKey, 300, JSON.stringify(matches));

  return matches;
}
```

### Cache Invalidation Triggers

- When a user **updates** their profile (age, city, goals, score) → invalidate cached matches for that user
- When a **new user** is created → no immediate invalidation needed (TTL will expire naturally)
- When a user is **deleted** → invalidate cached matches for users who had them in their top N

---

## Project Structure

```
prestige-club/
├── prisma/
│   └── schema.prisma           # Database schema definition
├── src/
│   ├── lib/
│   │   ├── errors.ts           # Error classes and handler
│   │   └── prisma.ts           # Prisma client singleton
│   ├── middleware/
│   │   └── error-handler.ts    # Global Fastify error handler
│   ├── routes/
│   │   └── user.routes.ts      # User CRUD + match endpoints
│   ├── schemas/
│   │   ├── user.schema.ts      # Zod validation schemas
│   │   └── api.schemas.ts      # Fastify / OpenAPI route schemas for Swagger
│   ├── services/
│   │   ├── match.service.ts    # Matching algorithm
│   │   └── user.service.ts     # User database operations
│   ├── types/
│   │   ├── index.ts            # Type re-exports + enums
│   │   └── user.types.ts       # DTO interfaces
│   ├── app.ts                  # Fastify app bootstrap + start
│   └── seed.ts                 # Database seeding script
├── .dockerignore
├── .env.example
├── .gitignore
├── docker-compose.yml           # PostgreSQL 18 + app orchestration
├── docker-entrypoint.sh         # Wait for DB, push schema, start app
├── Dockerfile                   # Multi-stage production build
├── package.json
├── tsconfig.json
└── README.md

### Interactive API Docs

Once the server is running, open [`/docs`](http://localhost:3000/docs) in your browser to explore and test all endpoints via Swagger UI.
```
