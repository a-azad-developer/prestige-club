import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createUserRouteSchema,
  getUsersRouteSchema,
  getUserMatchesRouteSchema,
} from "../schemas/api.schemas";
import type { CreateUserBody, PaginationQuery, UserParams } from "../types";
import * as userService from "../services/user.service";
import * as matchService from "../services/match.service";

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  // POST /users — Create a new user
  // Body is validated by Fastify against createUserRouteSchema.body
  app.post<{ Body: CreateUserBody }>(
    "/users",
    { schema: createUserRouteSchema },
    async (
      request: FastifyRequest<{ Body: CreateUserBody }>,
      reply: FastifyReply,
    ) => {
      const user = await userService.createUser(request.body);
      reply.status(201).send({ data: user });
    },
  );

  // GET /users — Retrieve all users (paginated)
  // Query params are validated by Fastify against getUsersRouteSchema.querystring
  app.get<{ Querystring: PaginationQuery }>(
    "/users",
    { schema: getUsersRouteSchema },
    async (
      request: FastifyRequest<{ Querystring: PaginationQuery }>,
      reply: FastifyReply,
    ) => {
      const { page, limit } = request.query;
      const result = await userService.getAllUsers(page, limit);
      reply.status(200).send({
        data: result.users,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    },
  );

  // GET /users/:id/match — Get top 3 most compatible users
  app.get<{ Params: UserParams }>(
    "/users/:id/match",
    { schema: getUserMatchesRouteSchema },
    async (
      request: FastifyRequest<{ Params: UserParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const targetUser = await userService.getUserById(id);
      const matches = await matchService.findTopMatches(
        targetUser.id,
        targetUser.city,
        targetUser.age,
        targetUser.goals,
        targetUser.score_selfGrowth,
        3,
      );
      reply.status(200).send({ data: matches });
    },
  );
}
