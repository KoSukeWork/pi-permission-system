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
