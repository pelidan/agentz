import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { AgentzDB } from "./index";
import { createSchema } from "./schema";

/**
 * Initializes the database at the given path.
 * Creates the directory if it doesn't exist.
 * Creates tables if they don't exist.
 * Returns a fully initialized AgentzDB instance; call db.close() when done.
 */
export function initDatabase(dbPath: string): AgentzDB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  createSchema(raw);
  return new AgentzDB(raw);
}
