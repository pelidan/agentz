import { describe, expect, test } from "bun:test";
import type { Config } from "@opencode-ai/sdk";
import plugin from "./index";

describe("plugin entry point", () => {
  test("plugin is a function", () => {
    expect(typeof plugin).toBe("function");
  });

  test("plugin returns hooks object", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks).toBeDefined();
  });

  test("config hook registers agents", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks.config).toBeDefined();

    // Simulate config hook call
    const config: Config = {};
    await hooks.config!(config);

    expect(config.agent).toBeDefined();
    expect(config.agent!["agentz"]).toBeDefined();
    expect(config.agent!["agentz"]!.mode).toBe("primary");
    expect(config.agent!["agentz-worker"]).toBeDefined();
    expect(config.agent!["agentz-worker"]!.mode).toBe("subagent");
  });

  test("config hook preserves existing agents", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);

    const config: Config = {
      agent: {
        build: { prompt: "existing build agent" },
      },
    };
    await hooks.config!(config);

    // New agents added
    expect(config.agent!["agentz"]).toBeDefined();
    // Existing agent preserved
    expect(config.agent!["build"]!.prompt).toBe("existing build agent");
  });

  test("tool registrations exist", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool!["agentz_dispatch"]).toBeDefined();
    expect(hooks.tool!["agentz_query"]).toBeDefined();
  });

  test("hook registrations exist", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    expect(hooks.event).toBeDefined();
    expect(hooks["chat.message"]).toBeDefined();
    expect(hooks["experimental.chat.system.transform"]).toBeDefined();
    expect(hooks["experimental.session.compacting"]).toBeDefined();
  });

  test("agentz_dispatch returns stub response", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    const dispatch = hooks.tool!["agentz_dispatch"];
    const result = await dispatch.execute(
      { todo_id: 1, skill: "backend-developer" } as any,
      {
        sessionID: "s1",
        messageID: "m1",
        agent: "agentz",
        directory: "/tmp",
        worktree: "/tmp",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      } as any,
    );
    expect(result).toContain("[STUB]");
  });

  test("agentz_query returns stub response", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);
    const query = hooks.tool!["agentz_query"];
    const result = await query.execute(
      { section: "todos" } as any,
      {
        sessionID: "s1",
        messageID: "m1",
        agent: "agentz",
        directory: "/tmp",
        worktree: "/tmp",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      } as any,
    );
    expect(result).toContain("[STUB]");
  });

  test("chat.message hook tracks agent identity", async () => {
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    };

    const hooks = await plugin(mockInput);

    // Calling with agent set should not throw
    await hooks["chat.message"]!(
      { sessionID: "s1", agent: "agentz" },
      { message: {} as any, parts: [] },
    );
  });
});
