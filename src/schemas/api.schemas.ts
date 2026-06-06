/**
 * Fastify JSON schemas for Swagger/OpenAPI documentation.
 * Fastify reads the `schema` property on route definitions to
 * validate requests AND generate the OpenAPI spec.
 */

// ─── Shared schemas ──────────────────────────────────────────

const educationLevelEnum = [
  "HIGH_SCHOOL",
  "ASSOCIATE",
  "BACHELOR",
  "MASTER",
  "DOCTORATE",
  "OTHER",
] as const;

// ─── User object schema ──────────────────────────────────────

const userObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", description: "User UUID" },
    name: { type: "string", description: "Full name" },
    age: { type: "integer", minimum: 18, maximum: 120, description: "Age" },
    city: { type: "string", description: "City of residence" },
    educationLevel: { type: "string", enum: educationLevelEnum },
    goals: {
      type: "array",
      items: { type: "string" },
      description: "Personal goals",
    },
    score_selfGrowth: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Self-growth score",
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "age",
    "city",
    "educationLevel",
    "goals",
    "score_selfGrowth",
    "createdAt",
    "updatedAt",
  ],
};

// ─── Match result schema ─────────────────────────────────────

const matchResultSchema = {
  type: "object",
  properties: {
    userId: { type: "string", format: "uuid" },
    name: { type: "string" },
    age: { type: "integer" },
    city: { type: "string" },
    educationLevel: { type: "string", enum: educationLevelEnum },
    goals: { type: "array", items: { type: "string" } },
    score_selfGrowth: { type: "number" },
    compatibilityScore: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Compatibility score (0–100)",
    },
  },
  required: [
    "userId",
    "name",
    "age",
    "city",
    "educationLevel",
    "goals",
    "score_selfGrowth",
    "compatibilityScore",
  ],
};

// ─── POST /users ──────────────────────────────────────────────

export const createUserRouteSchema = {
  description: "Create a new user",
  tags: ["Users"],
  body: {
    type: "object",
    required: [
      "name",
      "age",
      "city",
      "educationLevel",
      "goals",
      "score_selfGrowth",
    ],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 255,
        description: "Full name",
        example: "John Doe",
      },
      age: {
        type: "integer",
        minimum: 18,
        maximum: 120,
        description: "Age (must be 18+)",
        example: 30,
      },
      city: {
        type: "string",
        minLength: 1,
        maxLength: 255,
        description: "City of residence",
        example: "New York",
      },
      educationLevel: {
        type: "string",
        enum: educationLevelEnum,
        description: "Highest education level attained",
        example: "BACHELOR",
      },
      goals: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "string", minLength: 1 },
        description: "Personal goals / interests",
        example: ["career growth", "fitness", "networking"],
      },
      score_selfGrowth: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Self-growth commitment score (0–100)",
        example: 80,
      },
    },
  },
  response: {
    201: {
      description: "User created successfully",
      type: "object",
      properties: {
        data: userObjectSchema,
      },
      required: ["data"],
    },
  },
};

// ─── GET /users ───────────────────────────────────────────────

export const getUsersRouteSchema = {
  description: "Retrieve all users (paginated)",
  tags: ["Users"],
  querystring: {
    type: "object",
    properties: {
      page: {
        type: "integer",
        minimum: 1,
        default: 1,
        description: "Page number",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
        description: "Items per page",
      },
    },
  },
  response: {
    200: {
      description: "Paginated list of users",
      type: "object",
      properties: {
        data: {
          type: "array",
          items: userObjectSchema,
        },
        meta: {
          type: "object",
          properties: {
            total: { type: "integer", description: "Total number of users" },
            page: { type: "integer", description: "Current page" },
            limit: { type: "integer", description: "Items per page" },
            totalPages: {
              type: "integer",
              description: "Total number of pages",
            },
          },
          required: ["total", "page", "limit", "totalPages"],
        },
      },
      required: ["data", "meta"],
    },
  },
};

// ─── GET /users/:id/match ─────────────────────────────────────

export const getUserMatchesRouteSchema = {
  description: "Get top 3 most compatible users for the specified user",
  tags: ["Matching"],
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
        description: "Target user UUID",
      },
    },
  },
  response: {
    200: {
      description: "Top 3 compatible users",
      type: "object",
      properties: {
        data: {
          type: "array",
          items: matchResultSchema,
          description: "Compatible users sorted by score descending",
        },
      },
      required: ["data"],
    },
  },
};
