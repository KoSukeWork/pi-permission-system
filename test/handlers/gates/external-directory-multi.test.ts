import { describe, expect, it } from "vitest";

import { isGateDescriptor } from "#src/handlers/gates/descriptor";
import {
  describeExternalDirectoryGates,
} from "#src/handlers/gates/external-directory";
import { ToolCallGatePipeline } from "#src/handlers/gates/tool-call-gate-pipeline";
import type { ToolCallContext } from "#src/handlers/gates/types";
import { pathFlavorForPlatform } from "#src/path/path-flavor";
import { PathNormalizer } from "#src/path-normalizer";
import type { ToolAccessExtractorLookup } from "#src/tool-access-extractor-registry";
import {
  makeGateInputs,
  makeGateRunner,
  makePathDispatchResolver,
  makeResolver,
} from "#test/helpers/gate-fixtures";
import { makeCheckResult } from "#test/helpers/handler-fixtures";

const CWD = "/test/project";

function makeTcc(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    toolName: "apply_patch",
    agentName: null,
    input: {},
    toolCallId: "tc-1",
    cwd: CWD,
    ...overrides,
  };
}

function extractorsOf(
  paths: readonly string[],
): ToolAccessExtractorLookup {
  return {
    get: (name) =>
      name === "apply_patch" ? () => paths : undefined,
  };
}

function gatesFor(paths: readonly string[]) {
  return describeExternalDirectoryGates(
    makeTcc(),
    [],
    makeResolver(
      makeCheckResult({ state: "ask", toolName: "external_directory" }),
    ),
    new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
    extractorsOf(paths),
  );
}

describe("describeExternalDirectoryGates - multi-file extractors", () => {
  it("ignores an inside first path and gates the outside second path", () => {
    const gates = gatesFor(["inside.txt", "../outside.txt"]);
    expect(gates).toHaveLength(1);
    expect(isGateDescriptor(gates[0])).toBe(true);
    if (isGateDescriptor(gates[0])) {
      expect(gates[0].decision.value).toBe("../outside.txt");
    }
  });

  it("gates a Move-to path that leaves the workspace", () => {
    const gates = gatesFor(["inside.txt", "../outside.txt"]);
    expect(gates.map((g) => (isGateDescriptor(g) ? g.decision.value : null))).toEqual([
      "../outside.txt",
    ]);
  });

  it("emits one gate per outside path, including siblings in the same directory", () => {
    const gates = gatesFor([
      "/test/project/inside.txt",
      "/outside/a/x.txt",
      "/outside/a/y.txt",
      "/other/b/z.txt",
    ]);
    const values = gates.map((g) =>
      isGateDescriptor(g) ? g.decision.value : null,
    );
    expect(values).toEqual([
      "/outside/a/x.txt",
      "/outside/a/y.txt",
      "/other/b/z.txt",
    ]);
  });

  it("returns no gates when every path stays inside the workspace", () => {
    expect(gatesFor(["src/a.ts", "src/b.ts"])).toEqual([]);
  });

  it("still resolves deny on a later file in the same outside directory", () => {
    const resolver = makePathDispatchResolver(
      {
        "/outside/secret.txt": makeCheckResult({
          state: "deny",
          toolName: "external_directory",
          matchedPattern: "/outside/secret.txt",
        }),
        "/outside/public.txt": makeCheckResult({
          state: "allow",
          toolName: "external_directory",
          matchedPattern: "/outside/public.txt",
        }),
      },
      makeCheckResult({ state: "ask", toolName: "external_directory" }),
    );
    const gates = describeExternalDirectoryGates(
      makeTcc(),
      [],
      resolver,
      new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
      extractorsOf(["/outside/public.txt", "/outside/secret.txt"]),
    );
    expect(gates).toHaveLength(2);
    const states = gates.map((g) =>
      isGateDescriptor(g) ? g.preCheck.state : g && "action" in g ? g.action : null,
    );
    expect(states).toEqual(["allow", "deny"]);
  });
});

describe("ToolCallGatePipeline - multi-file external_directory", () => {
  it("blocks the whole call when any outside directory is denied", async () => {
    const cwd = CWD;
    const resolver = makePathDispatchResolver(
      {
        "/denied/dir/secret.txt": makeCheckResult({
          state: "deny",
          toolName: "external_directory",
          matchedPattern: "/denied/dir/*",
        }),
      },
      makeCheckResult({ state: "allow", toolName: "external_directory" }),
    );
    const inputs = makeGateInputs({
      getPathNormalizer: () =>
        new PathNormalizer(pathFlavorForPlatform(process.platform), cwd),
    });
    const { runner } = makeGateRunner();
    const pipeline = new ToolCallGatePipeline(
      resolver,
      inputs,
      undefined,
      extractorsOf(["/test/project/inside.txt", "/denied/dir/secret.txt"]),
    );

    const result = await pipeline.evaluate(makeTcc(), runner);

    expect(result.action).toBe("block");
  });

  it("blocks when a same-directory later file is denied", async () => {
    const resolver = makePathDispatchResolver(
      {
        "/outside/public.txt": makeCheckResult({
          state: "allow",
          toolName: "external_directory",
          matchedPattern: "/outside/public.txt",
        }),
        "/outside/secret.txt": makeCheckResult({
          state: "deny",
          toolName: "external_directory",
          matchedPattern: "/outside/secret.txt",
        }),
      },
      makeCheckResult({ state: "allow", toolName: "external_directory" }),
    );
    const inputs = makeGateInputs({
      getPathNormalizer: () =>
        new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
    });
    const { runner } = makeGateRunner();
    const pipeline = new ToolCallGatePipeline(
      resolver,
      inputs,
      undefined,
      extractorsOf(["/outside/public.txt", "/outside/secret.txt"]),
    );

    const result = await pipeline.evaluate(makeTcc(), runner);

    expect(result.action).toBe("block");
  });

  it("allows when every extracted path is inside the workspace", async () => {
    const resolver = makeResolver(
      makeCheckResult({ state: "ask", toolName: "external_directory" }),
    );
    const inputs = makeGateInputs({
      getPathNormalizer: () =>
        new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
    });
    const { runner } = makeGateRunner();
    const pipeline = new ToolCallGatePipeline(
      resolver,
      inputs,
      undefined,
      extractorsOf(["src/a.ts", "./src/b.ts"]),
    );

    const result = await pipeline.evaluate(makeTcc(), runner);

    expect(result).toEqual({ action: "allow" });
  });
});
