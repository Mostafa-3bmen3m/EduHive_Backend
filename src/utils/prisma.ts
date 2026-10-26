import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adpater = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter: adpater,
});

export default prisma;
