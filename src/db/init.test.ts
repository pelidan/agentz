import { describe, expect, test, afterEach } from "bun:test";
import { initDatabase } from "./init";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "../../.test-tmp-db");

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe("initDatabase", () => {
  test("creates database file and directory", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");
    const db = initDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  test("returns a working AgentzDB instance", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");
    const db = initDatabase(dbPath);

    // Should be able to create a session
    db.createSession({ id: "s-001", goal: "Test" });
    const session = db.getSession("s-001");
    expect(session).toBeDefined();
    expect(session!.goal).toBe("Test");
    db.close();
  });

  test("opens existing database without data loss", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const dbPath = join(TEST_DIR, "agentz.db");

    // First open — create data
    const db1 = initDatabase(dbPath);
    db1.createSession({ id: "s-001", goal: "Persistent" });
    db1.close();

    // Second open — data should persist
    const db2 = initDatabase(dbPath);
    const session = db2.getSession("s-001");
    expect(session).toBeDefined();
    expect(session!.goal).toBe("Persistent");
    db2.close();
  });

  test("WAL mode is enabled on file-backed database", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const TEST_DB_PATH = join(TEST_DIR, "agentz.db");
    const db = initDatabase(TEST_DB_PATH);
    const raw = (db as unknown as { db: import("bun:sqlite").Database }).db;
    const result = raw.query("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode.toLowerCase()).toBe("wal");
    db.close();
  });
});
