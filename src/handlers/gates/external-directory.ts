import { getToolInputPaths } from "#src/access-intent/tool-input-path";
import type { PathNormalizer } from "#src/path-normalizer";
import type { ScopedPermissionResolver } from "#src/permission-resolver";
import { buildExternalDirectoryAskPayload } from "#src/presentation/path-ask-payload";
import { SessionApproval } from "#src/session-approval";
import type { ToolAccessExtractorLookup } from "#src/tool-access-extractor-registry";
import type { GateResult } from "./descriptor";
import { resolveExternalDirectoryPolicy } from "./external-directory-policy";
import { accessFactsFromPath } from "./helpers";
import type { ToolCallContext } from "./types";

/**
 * Build a descriptor for one already-known external path.
 */
function describeOneExternalDirectoryPath(
  tcc: ToolCallContext,
  externalDirectoryPath: string,
  infraDirs: string[],
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
): GateResult {
  if (!normalizer.isOutsideWorkingDirectory(externalDirectoryPath)) {
    return null;
  }

  const accessPath = normalizer.forPath(externalDirectoryPath);

  if (normalizer.isInfrastructureRead(tcc.toolName, accessPath, infraDirs)) {
    return {
      action: "allow",
      decidedBy: { kind: "infrastructure_read" },
      log: {
        event: "permission_request.infrastructure_auto_allowed",
        details: {
          source: "tool_call",
          toolCallId: tcc.toolCallId,
          toolName: tcc.toolName,
          agentName: tcc.agentName,
          path: externalDirectoryPath,
        },
      },
      decision: {
        surface: tcc.toolName,
        value: externalDirectoryPath,
        result: "allow",
        resolution: "infrastructure_auto_allowed",
        origin: null,
        agentName: tcc.agentName ?? null,
        matchedPattern: null,
      },
    };
  }

  const resolvedAlias = accessPath.resolvedAlias();
  const preCheck = resolveExternalDirectoryPolicy(
    accessPath,
    resolver,
    tcc.agentName ?? undefined,
  );
  const pattern = normalizer.approvalPatternFor(accessPath);

  const payload = buildExternalDirectoryAskPayload({
    toolName: tcc.toolName,
    pathValue: externalDirectoryPath,
    resolvedPath: resolvedAlias,
    cwd: tcc.cwd,
    agentName: tcc.agentName,
    matchedPattern: preCheck.matchedPattern,
  });

  return {
    surface: "external_directory",
    input: {},
    preCheck,
    payload,
    sessionApproval: SessionApproval.single("external_directory", pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      path: externalDirectoryPath,
      accessIntent: accessFactsFromPath("external_directory", accessPath),
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: externalDirectoryPath,
    },
    decision: {
      surface: "external_directory",
      value: externalDirectoryPath,
    },
  };
}

/**
 * Gate every out-of-workspace path a tool will touch.
 *
 * Lexical duplicates are already dropped by getToolInputPaths. Do not collapse
 * by directory before the resolver: two files in the same folder can have
 * different explicit allow/deny rules. Session approval still suppresses
 * repeated asks after a human grant.
 */
export function describeExternalDirectoryGates(
  tcc: ToolCallContext,
  infraDirs: string[],
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
  extractors?: ToolAccessExtractorLookup,
): GateResult[] {
  const paths = getToolInputPaths(tcc.toolName, tcc.input, extractors);
  const gates: GateResult[] = [];
  for (const raw of paths) {
    const gate = describeOneExternalDirectoryPath(
      tcc,
      raw,
      infraDirs,
      resolver,
      normalizer,
    );
    if (gate) gates.push(gate);
  }
  return gates;
}

/**
 * Build a pure descriptor for the external-directory permission gate.
 *
 * Single-path convenience used by existing tests: first extracted path, or
 * `null` when the gate does not apply. The tool-call pipeline uses
 * {@link describeExternalDirectoryGates} so a multi-file tool cannot hide a
 * later outside path behind an inside first path.
 */
export function describeExternalDirectoryGate(
  tcc: ToolCallContext,
  infraDirs: string[],
  resolver: ScopedPermissionResolver,
  normalizer: PathNormalizer,
  extractors?: ToolAccessExtractorLookup,
): GateResult {
  return (
    describeExternalDirectoryGates(
      tcc,
      infraDirs,
      resolver,
      normalizer,
      extractors,
    )[0] ?? null
  );
}
