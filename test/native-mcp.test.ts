import { describe, expect, it } from "vitest";
import {
  buildResolvedIntentFromMatchValues,
  normalizeInput,
} from "#src/access-intent/input-normalizer";
import { getToolInputPaths } from "#src/access-intent/tool-input-path";
import { classifyToolKind } from "#src/access-intent/tool-kind";
import { describeToolGate } from "#src/handlers/gates/tool";
import { suggestMcpPattern } from "#src/pattern-suggest";
import { PermissionManager } from "#src/permission-manager";
import {
  resolveToolPreviewLimits,
  ToolPreviewFormatter,
} from "#src/tool-preview-formatter";
import {
  createInMemoryPolicyLoader,
  createManagerWithConfig,
  sessionRule,
} from "#test/helpers/manager-harness";

const tool = "mcp__agent_mail__health_check";
const intent = { kind: "tool" as const, surface: tool, input: {} };

describe("Pi native MCP permissions", () => {
  it("routes native names and resource helpers to MCP without trusting argument identities", () => {
    expect(classifyToolKind(tool)).toBe("mcp");
    expect(classifyToolKind("read_mcp_resource")).toBe("mcp");
    expect(classifyToolKind("list_mcp_resources")).toBe("mcp");
    expect(classifyToolKind("list_mcp_resource_templates")).toBe("mcp");
    const normalized = normalizeInput(
      tool,
      { server: "allowed", tool: "allowed:read", connect: "allowed" },
      [],
    );
    expect(normalized.surface).toBe("mcp");
    expect(normalized.values).toEqual([
      tool,
      "agent_mail_health_check",
      "agent_mail:health_check",
      "agent_mail",
      "health_check",
      "mcp_call",
      "mcp",
    ]);
    expect(normalized.resultExtras.target).toBe(tool);
  });

  it("handles configured server names with punctuation or double underscores", () => {
    const result = normalizeInput("mcp__docs__internal_v2__search", {}, [
      "docs",
      "docs__internal.v2",
    ]);
    expect(result.values).toContain("docs__internal.v2:search");
    expect(result.values).not.toContain("docs:internal_v2__search");
  });

  it("uses runtime namespaces for registered, colliding, and shortened server names", () => {
    for (const [name, server] of [
      ["mcp__docs_local__search", "docs.local"],
      [`mcp__${"long".repeat(13)}_01234567`, "long".repeat(30)],
    ]) {
      const manager = new PermissionManager({
        policyLoader: createInMemoryPolicyLoader({
          global: { permission: { "*": "allow", mcp: { [server]: "deny" } } },
        }),
        getNativeMcpServerName: () => server,
      });
      expect(
        manager.check({
          kind: "tool",
          surface: name,
          input: { server: "spoofed" },
        }).state,
      ).toBe("deny");
      expect(
        manager.check(
          buildResolvedIntentFromMatchValues("mcp", [name], "child"),
        ).state,
      ).toBe("deny");
    }
  });

  it("applies shared server denies and preserves native tool-name denies", () => {
    for (const permission of [
      { "*": "allow", mcp: { agent_mail: "deny" } },
      { "*": "allow", [tool]: "deny" },
      { "*": "allow", mcp: { "mcp__agent_mail__*": "deny" } },
    ]) {
      const { manager, cleanup } = createManagerWithConfig(permission);
      try {
        expect(manager.check(intent).state).toBe("deny");
        expect(
          manager.check(
            buildResolvedIntentFromMatchValues("mcp", [tool], "child"),
          ).state,
        ).toBe("deny");
      } finally {
        cleanup();
      }
    }
  });

  it.each([false, true])(
    "matches configured hyphenated servers with runtime metadata=%s",
    (metadata) => {
      const name = "mcp__exa_audit__web_search_exa";
      const manager = new PermissionManager({
        policyLoader: createInMemoryPolicyLoader(
          {
            global: {
              permission: { "*": "allow", mcp: { "exa-audit": "deny" } },
            },
          },
          ["exa-audit", "exa-control"],
        ),
        getNativeMcpServerName: metadata ? () => "exa_audit" : undefined,
      });
      for (const request of [
        { kind: "tool" as const, surface: name, input: { server: "allowed" } },
        buildResolvedIntentFromMatchValues("mcp", [name], "child"),
      ]) {
        expect(manager.check(request)).toMatchObject({
          state: "deny",
          matchedPattern: "exa-audit",
          target: "exa-audit",
        });
      }
    },
  );

  it.each(["exa-audit", "exa_audit", "exa-*", "exa-audit:health_check"])(
    "matches native server rule %s without a global MCP configuration",
    (pattern) => {
      const name = "mcp__exa_audit__health_check";
      const manager = new PermissionManager({
        policyLoader: createInMemoryPolicyLoader({
          global: {
            permission: { "*": "allow", mcp: { [pattern]: "deny" } },
          },
        }),
        getNativeMcpServerName: () => "exa_audit",
      });
      for (const request of [
        { kind: "tool" as const, surface: name, input: {} },
        buildResolvedIntentFromMatchValues("mcp", [name], "child"),
      ]) {
        expect(manager.check(request)).toMatchObject({
          state: "deny",
          matchedPattern: pattern,
        });
      }
    },
  );

  it("keeps hyphenated server allows scoped and exact tool denies first", () => {
    const name = "mcp__exa_audit__health_check";
    const sibling = "mcp__exa_audit__fetch";
    const other = "mcp__exa_control__health_check";
    const manager = new PermissionManager({
      policyLoader: createInMemoryPolicyLoader({
        global: {
          permission: {
            "*": "deny",
            mcp: { "exa-audit": "allow" },
            [name]: "deny",
          },
        },
      }),
      getNativeMcpServerName: (toolName) =>
        toolName === other ? "exa_control" : "exa_audit",
    });
    for (const forwarded of [false, true]) {
      for (const [toolName, state] of [
        [name, "deny"],
        [sibling, "allow"],
        [other, "deny"],
      ] as const) {
        const request = forwarded
          ? buildResolvedIntentFromMatchValues("mcp", [toolName], "child")
          : { kind: "tool" as const, surface: toolName, input: {} };
        expect(manager.check(request).state).toBe(state);
      }
    }
  });

  it.each([
    ["exa-audit", "mcp__other__exa_audit"],
    ["other-audit", "mcp__other__audit"],
    ["*-audit", "mcp__other__exa_audit"],
    ["exa-audit_health-check", "mcp__other__exa_audit_health_check"],
  ])(
    "does not expand %s to colliding aliases on another server",
    (pattern, name) => {
      for (const configured of [[], ["exa-audit", "other-audit", "other"]]) {
        const manager = new PermissionManager({
          policyLoader: createInMemoryPolicyLoader(
            {
              global: {
                permission: { "*": "deny", mcp: { [pattern]: "allow" } },
              },
            },
            configured,
          ),
          getNativeMcpServerName: () => "other",
        });
        for (const request of [
          { kind: "tool" as const, surface: name, input: {} },
          buildResolvedIntentFromMatchValues("mcp", [name], "child"),
        ]) {
          expect(manager.check(request).state).toBe("deny");
        }
      }
    },
  );

  it.each([
    "exa-audit_health-check",
    "exa-audit:health-check",
    "mcp__exa-audit__health_*",
  ])(
    "matches a qualified native rule %s only on its owning server",
    (pattern) => {
      const manager = new PermissionManager({
        policyLoader: createInMemoryPolicyLoader({
          global: { permission: { "*": "deny", mcp: { [pattern]: "allow" } } },
        }),
        getNativeMcpServerName: (name) =>
          name.includes("__other__") ? "other" : "exa_audit",
      });
      expect(
        manager.check({
          kind: "tool",
          surface: "mcp__exa_audit__health_check",
          input: {},
        }).state,
      ).toBe("allow");
      expect(
        manager.check({
          kind: "tool",
          surface: "mcp__other__health_check",
          input: {},
        }).state,
      ).toBe("deny");
    },
  );

  it("keeps rule ordering across hyphenated and normalized server aliases", () => {
    const name = "mcp__exa_audit__health_check";
    for (const [mcp, expected] of [
      [{ "exa-audit": "allow", exa_audit: "deny" }, "deny"],
      [{ exa_audit: "deny", "exa-audit": "allow" }, "allow"],
    ] as const) {
      const manager = new PermissionManager({
        policyLoader: createInMemoryPolicyLoader(
          { global: { permission: { "*": "ask", mcp } } },
          ["exa-audit"],
        ),
        getNativeMcpServerName: () => "exa_audit",
      });
      expect(
        manager.check({ kind: "tool", surface: name, input: {} }).state,
      ).toBe(expected);
    }
  });

  it("uses runtime ownership when configured names have overlapping prefixes", () => {
    const result = normalizeInput(
      "mcp__docs__internal__search",
      {},
      ["docs", "docs--internal"],
      "docs",
    );
    expect(result.values).toContain("docs:internal__search");
    expect(result.values).not.toContain("docs--internal:search");
    const doubled = normalizeInput(
      "mcp__docs__internal__search",
      {},
      ["docs", "docs--internal"],
      "docs__internal",
    );
    expect(doubled.values).toContain("docs--internal:search");
    expect(doubled.values).not.toContain("docs:internal__search");
  });

  it("gates shortened native names using the complete sanitized namespace", () => {
    const server = `exa-${"long".repeat(25)}`;
    const name = `mcp__exa_${"long".repeat(11)}_01234567`;
    const manager = new PermissionManager({
      policyLoader: createInMemoryPolicyLoader(
        { global: { permission: { "*": "allow", mcp: { [server]: "deny" } } } },
        [server],
      ),
      getNativeMcpServerName: () => server.replace(/-/g, "_"),
    });
    expect(
      manager.check({ kind: "tool", surface: name, input: {} }),
    ).toMatchObject({ state: "deny", matchedPattern: server, target: server });
  });

  it("preserves the fail-closed floor for native aliases", () => {
    const manager = new PermissionManager({
      policyLoader: createInMemoryPolicyLoader({
        global: {
          permission: { "*": "allow", mcp: { "exa-audit": "allow" } },
        },
        project: { invalid: true },
      }),
      getNativeMcpServerName: () => "exa_audit",
    });
    expect(
      manager.check({
        kind: "tool",
        surface: "mcp__exa_audit__health_check",
        input: {},
      }),
    ).toMatchObject({ state: "ask", origin: "fail-closed" });
  });

  it("does not reinterpret legacy MCP server names as native aliases", () => {
    const manager = new PermissionManager({
      policyLoader: createInMemoryPolicyLoader({
        global: {
          permission: { "*": "allow", mcp: { "exa-audit": "deny" } },
        },
      }),
    });
    expect(
      manager.check({
        kind: "tool",
        surface: "mcp",
        input: { tool: "exa_audit:health_check" },
      }).state,
    ).toBe("allow");
    expect(
      manager.check({
        kind: "tool",
        surface: "mcp",
        input: { tool: "exa-audit:health_check" },
      }).state,
    ).toBe("deny");
  });

  it("keeps session grants on the MCP surface and scoped to the native tool", () => {
    const { manager, cleanup } = createManagerWithConfig({ "*": "ask" });
    try {
      const check = manager.check(intent);
      const gate = describeToolGate(
        {
          toolName: tool,
          input: {},
          cwd: "/test",
          toolCallId: "native-1",
          agentName: null,
        },
        check,
        new ToolPreviewFormatter(resolveToolPreviewLimits()),
      );
      expect(gate.surface).toBe("mcp");
      expect(gate.sessionApproval?.surface).toBe("mcp");
      expect(suggestMcpPattern(tool)).toBe(tool);
      const rules = [sessionRule("mcp", tool)];
      expect(manager.check(intent, rules).state).toBe("allow");
      expect(
        manager.check({ ...intent, surface: "mcp__other__health_check" }, rules)
          .state,
      ).toBe("ask");
      expect(
        manager.check(
          buildResolvedIntentFromMatchValues("mcp", [tool], "child"),
          rules,
        ).state,
      ).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("gates native paths and allows registered extractors to report every path", () => {
    expect(getToolInputPaths(tool, { path: "/private/file" })).toEqual([
      "/private/file",
    ]);
    expect(
      getToolInputPaths(tool, { arguments: { path: "/spoofed" } }),
    ).toEqual([]);
    expect(
      getToolInputPaths(
        tool,
        {},
        {
          get: (name) =>
            name === tool ? () => ["/first", "/second"] : undefined,
        },
      ),
    ).toEqual(["/first", "/second"]);
    expect(
      getToolInputPaths("mcp", { arguments: { path: "/legacy" } }),
    ).toEqual(["/legacy"]);
  });

  it("gates native resource calls with server policies", () => {
    const { manager, cleanup } = createManagerWithConfig({
      "*": "allow",
      mcp: { docs: "deny" },
    });
    try {
      expect(
        manager.check({
          kind: "tool",
          surface: "read_mcp_resource",
          input: { server: "docs", uri: "fixture:test" },
        }).state,
      ).toBe("deny");
    } finally {
      cleanup();
    }
  });
});
