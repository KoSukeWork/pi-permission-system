import { describe, expect, it } from "vitest";

import { isGateDescriptor } from "#src/handlers/gates/descriptor";
import { describePathGates } from "#src/handlers/gates/path";
import { ToolCallGatePipeline } from "#src/handlers/gates/tool-call-gate-pipeline";
import type { ToolCallContext } from "#src/handlers/gates/types";
import { pathFlavorForPlatform } from "#src/path/path-flavor";
import { PathNormalizer } from "#src/path-normalizer";
import type { ToolAccessExtractorLookup } from "#src/tool-access-extractor-registry";
import {
  makeGateCheckResult,
  makeGateInputs,
  makeGateRunner,
  makePathDispatchResolver,
} from "#test/helpers/gate-fixtures";

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

function pathResolver() {
  return makePathDispatchResolver(
    {
      ".env": makeGateCheckResult({
        state: "ask",
        matchedPattern: "*.env",
      }),
      "src/normal.txt": makeGateCheckResult({
        state: "allow",
        matchedPattern: "*",
      }),
      "src/a.txt": makeGateCheckResult({
        state: "allow",
        matchedPattern: "*",
      }),
    },
    makeGateCheckResult({ state: "allow" }),
  );
}

function denyEnvResolver() {
  return makePathDispatchResolver(
    {
      ".env": makeGateCheckResult({
        state: "deny",
        matchedPattern: "*.env",
      }),
      "src/normal.txt": makeGateCheckResult({
        state: "allow",
        matchedPattern: "*",
      }),
      "src/a.txt": makeGateCheckResult({
        state: "allow",
        matchedPattern: "*",
      }),
    },
    makeGateCheckResult({ state: "allow" }),
  );
}

describe("describePathGates - multi-file extractors", () => {
  const normalizer = new PathNormalizer(
    pathFlavorForPlatform(process.platform),
    CWD,
  );

  it("gates a later .env even when the first path is an allowed normal file", () => {
    const gates = describePathGates(
      makeTcc(),
      pathResolver(),
      normalizer,
      extractorsOf(["src/normal.txt", ".env"]),
    );
    const values = gates.map((g) =>
      isGateDescriptor(g) ? g.decision.value : null,
    );
    expect(values).toEqual([".env"]);
    const [gate] = gates;
    expect(isGateDescriptor(gate)).toBe(true);
    if (gate && isGateDescriptor(gate)) {
      expect(gate.preCheck?.state).toBe("ask");
      expect(gate.preCheck?.matchedPattern).toBe("*.env");
    }
  });

  it("gates a Move-to .env target even when the source file is allowed", () => {
    const gates = describePathGates(
      makeTcc(),
      pathResolver(),
      normalizer,
      extractorsOf(["src/a.txt", ".env"]),
    );
    expect(
      gates.map((g) => (isGateDescriptor(g) ? g.decision.value : null)),
    ).toEqual([".env"]);
  });

  it("returns no gates when every extracted path is allowed", () => {
    const gates = describePathGates(
      makeTcc(),
      pathResolver(),
      normalizer,
      extractorsOf(["src/normal.txt", "src/a.txt"]),
    );
    expect(gates).toEqual([]);
  });
});

describe("ToolCallGatePipeline - multi-file path", () => {
  it("blocks the whole call when a later .env path is denied", async () => {
    const inputs = makeGateInputs({
      getPathNormalizer: () =>
        new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
    });
    const { runner } = makeGateRunner();
    const pipeline = new ToolCallGatePipeline(
      denyEnvResolver(),
      inputs,
      undefined,
      extractorsOf(["src/normal.txt", ".env"]),
    );

    const result = await pipeline.evaluate(makeTcc(), runner);

    expect(result.action).toBe("block");
  });

  it("blocks a Move-to .env that is denied even when the source is allowed", async () => {
    const inputs = makeGateInputs({
      getPathNormalizer: () =>
        new PathNormalizer(pathFlavorForPlatform(process.platform), CWD),
    });
    const { runner } = makeGateRunner();
    const pipeline = new ToolCallGatePipeline(
      denyEnvResolver(),
      inputs,
      undefined,
      extractorsOf(["src/a.txt", ".env"]),
    );

    const result = await pipeline.evaluate(makeTcc(), runner);

    expect(result.action).toBe("block");
  });
});
