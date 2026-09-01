import type { ToolAccessExtractorLookup } from "#src/tool-access-extractor-registry";
import { getNonEmptyString, toRecord } from "#src/value-guards";
import { classifyToolKind } from "./tool-kind";

export function getPathBearingToolPath(
  toolName: string,
  input: unknown,
): string | null {
  if (classifyToolKind(toolName) !== "path") {
    return null;
  }

  return getNonEmptyString(toRecord(input).path);
}

/**
 * Normalize an extractor result into unique, non-empty path strings.
 * Order is preserved; lexical duplicates are dropped.
 */
export function normalizeExtractedPaths(
  value: string | readonly string[] | undefined | null,
): string[] {
  if (value == null) return [];
  const items = typeof value === "string" ? [value] : value;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const path = item.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function extractedPaths(
  toolName: string,
  input: unknown,
  extractors?: ToolAccessExtractorLookup,
): string[] {
  const record = toRecord(input);

  switch (classifyToolKind(toolName)) {
    case "bash":
      return [];
    case "path":
      return normalizeExtractedPaths(getNonEmptyString(record.path));
    case "mcp":
      return normalizeExtractedPaths(
        getNonEmptyString(toRecord(record.arguments).path),
      );
    case "skill":
    case "extension": {
      const custom = extractors?.get(toolName);
      if (custom) {
        return normalizeExtractedPaths(custom(record));
      }
      return normalizeExtractedPaths(getNonEmptyString(record.path));
    }
  }
}

/**
 * Extract every filesystem path a tool will access, for the cross-cutting
 * path and external_directory gates.
 *
 * Unlike getPathBearingToolPath (built-in tools only), this recognizes
 * extension and MCP tools so they are no longer exempt from path gating:
 *
 * - bash: empty (bash has its own token-based path gates).
 * - Built-in path-bearing tools: input.path.
 * - mcp: input.arguments.path.
 * - Any other tool: a registered ToolAccessExtractor path list, else input.path.
 */
export function getToolInputPaths(
  toolName: string,
  input: unknown,
  extractors?: ToolAccessExtractorLookup,
): string[] {
  return extractedPaths(toolName, input, extractors);
}

/**
 * First extracted path, or null. Prefer getToolInputPaths when a tool can
 * touch more than one file.
 */
export function getToolInputPath(
  toolName: string,
  input: unknown,
  extractors?: ToolAccessExtractorLookup,
): string | null {
  return getToolInputPaths(toolName, input, extractors)[0] ?? null;
}
