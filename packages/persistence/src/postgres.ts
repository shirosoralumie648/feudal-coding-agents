import { Pool, type Pool as PgPool, types } from "pg";

const INT8_OID = 20;
const MAX_SAFE_INT64 = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INT64 = BigInt(Number.MIN_SAFE_INTEGER);

function parseSafeInt8(value: string): number {
  const parsed = BigInt(value);

  if (parsed > MAX_SAFE_INT64 || parsed < MIN_SAFE_INT64) {
    throw new Error(`int8 value exceeds JavaScript safe integer range: ${value}`);
  }

  return Number(parsed);
}

types.setTypeParser(INT8_OID, parseSafeInt8);

export function createPostgresPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({ connectionString, max: 5 });
}

export type SqlPool = PgPool;
