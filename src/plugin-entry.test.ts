import { describe, expect, test } from "bun:test";

/**
 * Smoke test: verifies src/index.ts loads without throwing
 * and exports a default plugin object.
 */
describe("plugin entry smoke test", () => {
  test("src/index.ts exports a default plugin function", async () => {
    const mod = await import("./index");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("plugin function can be called and returns hooks", async () => {
    const mod = await import("./index");
    const hooks = await mod.default({
      client: {} as any,
      project: {} as any,
      directory: "/tmp/plugin-entry-test",
      worktree: "/tmp/plugin-entry-test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    });
    expect(hooks).toBeDefined();
    expect(hooks.config).toBeDefined();
    expect(hooks.tool).toBeDefined();
    expect(hooks.event).toBeDefined();
  });
});
