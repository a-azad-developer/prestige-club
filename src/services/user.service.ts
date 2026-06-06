import type { User, $Enums } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import type { CreateUserBody } from "../types/user.types";

export async function createUser(data: CreateUserBody): Promise<User> {
  return prisma.user.create({
    data: {
      name: data.name,
      age: data.age,
      city: data.city,
      educationLevel: data.educationLevel as $Enums.EducationLevel,
      goals: data.goals,
      score_selfGrowth: data.score_selfGrowth,
    },
  });
}

export async function getAllUsers(
  page: number,
  limit: number,
): Promise<{ users: User[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count(),
  ]);

  return { users, total, page, limit };
}

export async function getUserById(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError("User", id);
  }
  return user;
}
