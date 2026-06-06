import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { registerErrorHandler } from "./middleware/error-handler";
import userRoutes from "./routes/user.routes";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    // Allow OpenAPI keywords (example, etc.) in route schemas without
    // throwing validation errors. Fastify v5 uses Ajv strict mode by
    // default, which rejects non-standard JSON Schema keywords.
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // ── Plugins ──────────────────────────────────────────────

  await app.register(cors);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Prestige Club API",
        description:
          "User matching system API — find compatible users based on city, age, goals, and self-growth score.",
        version: "1.0.0",
        contact: {
          name: "Prestige Club",
          url: "https://github.com/prestige-club",
        },
      },
      externalDocs: {
        url: "https://github.com/prestige-club/prestige-club",
        description: "Project repository",
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT ?? 3000}`,
          description: "Local development server",
        },
      ],
      tags: [
        { name: "Users", description: "User CRUD operations" },
        { name: "Matching", description: "User compatibility matching" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: true,
    transformSpecification: (swaggerObject) => swaggerObject,
  });

  // ── Error handling ───────────────────────────────────────

  registerErrorHandler(app);

  // ── Routes ───────────────────────────────────────────────

  await app.register(userRoutes);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`📚 Swagger docs at http://${host}:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
