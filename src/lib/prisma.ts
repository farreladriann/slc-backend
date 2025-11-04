import { PrismaClient, Prisma } from '@prisma/client';

// Reuse koneksi saat dev (nodemon)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}
export const prisma = globalThis.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

export { Prisma };