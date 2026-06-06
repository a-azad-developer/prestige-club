import type { MatchResult } from "../types/user.types";
import { prisma } from "../lib/prisma";

/**
 * Thresholds for pre-filtering candidates via indexed columns.
 * Keeps the expensive Jaccard similarity computation in SQL
 * bounded to a small candidate set.
 */
const AGE_RANGE = 15;
const SCORE_RANGE = 40;

// ─── Raw SQL query ─────────────────────────────────────────
//
// The compatibility formula computed entirely in PostgreSQL:
//
//   S = 0.2*C + 0.2*A + 0.3*G + 0.3*Sg
//
//   C  = 100 if same city, 0 otherwise
//   A  = 100 × max(0, 1 − |Δage| / 20)
//   G  = 100 × |goals₁ ∩ goals₂| / |goals₁ ∪ goals₂|
//   Sg = 100 − |Δscore|
//
// Parameters: $1 = targetUserId, $2 = targetCity,
//             $3 = targetAge, $4 = targetGoals (text[]),
//             $5 = targetScore,
//             $6 = ageRange, $7 = scoreRange, $8 = limit

const MATCH_QUERY = `
  SELECT
    u.id,
    u.name,
    u.age,
    u.city,
    u."educationLevel",
    u.goals,
    u."score_selfGrowth",
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
    AND u.age BETWEEN ($3 - $6) AND ($3 + $6)
    AND u."score_selfGrowth" BETWEEN GREATEST(0, $5 - $7) AND LEAST(100, $5 + $7)
  ORDER BY "compatibilityScore" DESC
  LIMIT $8
`;

const FALLBACK_QUERY = `
  SELECT
    u.id,
    u.name,
    u.age,
    u.city,
    u."educationLevel",
    u.goals,
    u."score_selfGrowth",
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
    AND u.age BETWEEN ($3 - $6) AND ($3 + $6)
    AND u."score_selfGrowth" BETWEEN GREATEST(0, $5 - $7) AND LEAST(100, $5 + $7)
  ORDER BY "compatibilityScore" DESC
  LIMIT $8
`;

interface MatchRow {
  id: string;
  name: string;
  age: number;
  city: string;
  educationLevel: string;
  goals: string[];
  score_selfGrowth: number;
  compatibilityScore: number;
}

/**
 * Execute the match query with the given parameters.
 * Returns rows already sorted by compatibility score descending.
 */
async function runMatchQuery(
  sql: string,
  targetUserId: string,
  targetCity: string,
  targetAge: number,
  targetGoals: string[],
  targetScore: number,
  ageRange: number,
  scoreRange: number,
  limit: number,
): Promise<MatchRow[]> {
  return prisma.$queryRawUnsafe<MatchRow[]>(
    sql,
    targetUserId,
    targetCity,
    targetAge,
    targetGoals,
    targetScore,
    ageRange,
    scoreRange,
    limit,
  );
}

// ─── Public API ────────────────────────────────────────────

/**
 * Find the top N most compatible users for a given user.
 *
 * The full compatibility score is computed inside PostgreSQL so
 * the database can sort and limit before returning — zero
 * post-processing in the application layer.
 *
 * Pre-filtering uses the composite index (city, age, score_selfGrowth),
 * keeping the expensive Jaccard similarity (goals) computation
 * bounded to a small candidate set.
 *
 * Three fallback tiers ensure results even for users in small cities
 * or with extreme attribute values.
 */
export async function findTopMatches(
  targetUserId: string,
  targetCity: string,
  targetAge: number,
  targetGoals: string[],
  targetScore: number,
  topN: number = 3,
): Promise<MatchResult[]> {
  // Prepare goals array once — lowercased, trimmed, deduplicated
  const normalizedGoals = [
    ...new Set(targetGoals.map((g) => g.toLowerCase().trim())),
  ];

  // Attempt 1: standard filter (same city, moderate ranges)
  let rows = await runMatchQuery(
    MATCH_QUERY,
    targetUserId,
    targetCity,
    targetAge,
    normalizedGoals,
    targetScore,
    AGE_RANGE,
    SCORE_RANGE,
    topN,
  );

  if (rows.length >= topN) return mapResults(rows);

  // Attempt 2: widen age and score ranges
  rows = await runMatchQuery(
    MATCH_QUERY,
    targetUserId,
    targetCity,
    targetAge,
    normalizedGoals,
    targetScore,
    AGE_RANGE * 2,
    SCORE_RANGE * 2,
    topN,
  );

  if (rows.length >= topN) return mapResults(rows);

  // Attempt 3: drop city filter entirely
  rows = await runMatchQuery(
    FALLBACK_QUERY,
    targetUserId,
    targetCity,
    targetAge,
    normalizedGoals,
    targetScore,
    AGE_RANGE * 2,
    SCORE_RANGE * 2,
    topN,
  );

  return mapResults(rows);
}

function mapResults(rows: MatchRow[]): MatchResult[] {
  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    age: row.age,
    city: row.city,
    educationLevel: row.educationLevel,
    goals: row.goals,
    score_selfGrowth: row.score_selfGrowth,
    compatibilityScore: row.compatibilityScore,
  }));
}
