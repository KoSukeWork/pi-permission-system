import { getToolInputPaths } from "#src/access-intent/tool-input-path";
import type { PathNormalizer } from "#src/path-normalizer";
import type { ScopedPermissionResolver } from "#src/permission-resolver";
import { buildPathAskPayload } from "#src/presentation/path-ask-payload";
import { SessionApproval } from "#src/session-approval";
import type { ToolAccessExtractorLookup } from "#src/tool-access-extractor-registry";
import type { GateDescriptor, GateResult } from "./descriptor";
import { accessFactsFromPath } from "./helpers";
import type { ToolCallContext } from "./types";

function describeOnePathGate(
  tcc: ToolCallContext,
  filePath: string,
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
): GateResult {
  // Emit an access-path intent so the resolver matches the lexical aliases
  // and the canonical (symlink-resolved) form, the same set
  // external_directory matches (#418, #486).
  const accessPath = normalizer.forPath(filePath);
  const check = resolver.resolve({
    kind: "access-path",
    surface: "path",
    path: accessPath,
    agentName: tcc.agentName ?? undefined,
  });

  if (check.state === "allow") return null;

  // No explicit path rule matched - only the universal default fired.
  // Skip the gate to preserve backward compatibility: configs without a
  // "path" key should not trigger path-level prompts (#58).
  if (check.matchedPattern === undefined) return null;

  const pattern = normalizer.approvalPatternFor(accessPath);

  const payload = buildPathAskPayload({
    toolName: tcc.toolName,
    pathValue: filePath,
    agentName: tcc.agentName,
    matchedPattern: check.matchedPattern,
  });

  const descriptor: GateDescriptor = {
    surface: "path",
    input: { path: filePath },
    payload,
    sessionApproval: SessionApproval.single("path", pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      path: filePath,
      accessIntent: accessFactsFromPath("path", accessPath),
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: filePath,
    },
    decision: {
      surface: "path",
      value: filePath,
    },
    preCheck: check,
  };

  return descriptor;
}

/**
 * Gate every extracted path on the cross-cutting `path` surface.
 * Lexical duplicates are already dropped by getToolInputPaths.
 * Do not collapse by directory: a later `.env` must not hide behind an
 * earlier allowed file in the same tree.
 */
export function describePathGates(
  tcc: ToolCallContext,
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
  extractors?: ToolAccessExtractorLookup,
): GateResult[] {
  const paths = getToolInputPaths(tcc.toolName, tcc.input, extractors);
  const gates: GateResult[] = [];
  for (const filePath of paths) {
    const gate = describeOnePathGate(tcc, filePath, resolver, normalizer);
    if (gate) gates.push(gate);
  }
  return gates;
}

/**
 * Single-path convenience for existing tests: first extracted path only.
 * The tool-call pipeline uses describePathGates so a later path cannot hide.
 */
export function describePathGate(
  tcc: ToolCallContext,
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
  extractors?: ToolAccessExtractorLookup,
): GateResult {
  const paths = getToolInputPaths(tcc.toolName, tcc.input, extractors);
  if (paths.length === 0) return null;
  return describeOnePathGate(tcc, paths[0], resolver, normalizer);
}
