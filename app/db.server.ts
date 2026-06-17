import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Singleton in ALL environments — prevents connection exhaustion on Vercel serverless
const prisma = global.prismaGlobal ?? new PrismaClient();

if (!global.prismaGlobal) {
  global.prismaGlobal = prisma;
}

export default prisma;
