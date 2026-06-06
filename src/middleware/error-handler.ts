import type {
  FastifyInstance,
  FastifyError,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { handleAppError } from "../lib/errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      // Fastify validation errors (schema mismatch)
      if (error.validation) {
        const details = error.validation.map((v) => ({
          field: v.instancePath || "(root)",
          message: v.message || "Invalid value",
        }));

        reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details,
          },
        });
        return;
      }

      handleAppError(reply, error);
    },
  );
}
