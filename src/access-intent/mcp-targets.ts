import { getNonEmptyString, toRecord } from "#src/value-guards";

/**
 * An ordered accumulator that owns the uniqueness invariant.
 *
 * `add` ignores null/empty values and silently skips duplicates (first-insertion
 * wins). `toArray` returns the ordered result as an independent copy.
 */
export class McpTargetList {
  private readonly targets: string[] = [];

  add(value: string | null): void {
    if (!value) {
      return;
    }
    if (!this.targets.includes(value)) {
      this.targets.push(value);
    }
  }

  toArray(): string[] {
    return [...this.targets];
  }
}

/** Native Pi names are policy identities; arguments cannot override them. */
export function createNativeMcpPermissionTargets(
  toolName: string,
  input: unknown,
  configuredServerNames: readonly string[] = [],
  nativeServerName?: string,
): string[] {
  const targets = new McpTargetList();
  if (toolName.startsWith("mcp__")) {
    targets.add(toolName);
    // Prefer known names: a server name can itself contain double underscores.
    const server =
      nativeServerName ??
      [...configuredServerNames]
        .sort((a, b) => b.length - a.length)
        .find((name) =>
          toolName.startsWith(`mcp__${name.replace(/[^A-Za-z0-9_-]/g, "_")}__`),
        );
    const prefix = server
      ? `mcp__${server.replace(/[^A-Za-z0-9_-]/g, "_")}__`
      : undefined;
    const parts = /^mcp__(.+?)__(.+)$/.exec(toolName);
    const resolvedServer = server ?? parts?.[1];
    const tool = prefix ? toolName.slice(prefix.length) : parts?.[2];
    if (resolvedServer && tool) {
      targets.add(`${resolvedServer}_${tool}`);
      targets.add(`${resolvedServer}:${tool}`);
    }
    // Pi may shorten the entire name, including the separator after the server.
    // The runtime namespace still supplies the exact server identity.
    targets.add(resolvedServer ?? null);
    if (tool) targets.add(tool);
  } else {
    // The native resource tools identify the selected server in their input.
    const server = getNonEmptyString(toRecord(input).server);
    if (server) {
      targets.add(`${server}:${toolName}`);
      targets.add(server);
    }
    targets.add(toolName);
  }
  targets.add("mcp_call");
  return targets.toArray();
}

/**
 * Parse a qualified MCP tool name of the form `server:tool`.
 *
 * Returns `{ server, tool }` when the string contains exactly one colon with
 * non-empty text on both sides; otherwise returns `null`.
 */
export function parseQualifiedMcpToolName(
  value: string,
): { server: string; tool: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0 || colonIndex >= trimmed.length - 1) {
    return null;
  }

  const server = trimmed.slice(0, colonIndex).trim();
  const tool = trimmed.slice(colonIndex + 1).trim();
  if (!server || !tool) {
    return null;
  }

  return { server, tool };
}

function addDerivedMcpServerTargets(
  toolName: string,
  configuredServerNames: readonly string[],
  targets: McpTargetList,
): void {
  const trimmedToolName = toolName.trim();
  if (!trimmedToolName) {
    return;
  }

  for (const serverName of configuredServerNames) {
    const trimmedServerName = serverName.trim();
    if (!trimmedServerName) {
      continue;
    }

    if (!trimmedToolName.endsWith(`_${trimmedServerName}`)) {
      continue;
    }

    if (trimmedToolName.startsWith(`${trimmedServerName}_`)) {
      continue;
    }

    targets.add(`${trimmedServerName}_${trimmedToolName}`);
    targets.add(`${trimmedServerName}:${trimmedToolName}`);
    targets.add(trimmedServerName);
  }
}

function pushMcpToolPermissionTargets(
  rawReference: string,
  serverHint: string | null,
  configuredServerNames: readonly string[],
  targets: McpTargetList,
): void {
  if (rawReference.startsWith("mcp__")) {
    for (const target of createNativeMcpPermissionTargets(
      rawReference,
      {},
      configuredServerNames,
    ))
      targets.add(target);
    return;
  }
  const qualified = parseQualifiedMcpToolName(rawReference);
  const resolvedServer = serverHint ?? qualified?.server ?? null;
  const resolvedTool = qualified?.tool ?? rawReference;

  if (resolvedServer) {
    targets.add(`${resolvedServer}_${resolvedTool}`);
    targets.add(`${resolvedServer}:${resolvedTool}`);
    targets.add(resolvedServer);
  } else {
    addDerivedMcpServerTargets(resolvedTool, configuredServerNames, targets);
  }

  targets.add(resolvedTool);
  targets.add(rawReference);
}

/**
 * Derive the ordered list of MCP permission-lookup candidates from a raw MCP
 * tool invocation input.
 *
 * Candidates are ordered from most-specific to least-specific so that
 * `evaluateFirst()` stops at the first non-default match.
 */
export function createMcpPermissionTargets(
  input: unknown,
  configuredServerNames: readonly string[] = [],
): string[] {
  const record = toRecord(input);
  const tool = getNonEmptyString(record.tool);
  const server = getNonEmptyString(record.server);
  const connect = getNonEmptyString(record.connect);
  const describe = getNonEmptyString(record.describe);
  const search = getNonEmptyString(record.search);

  const targets = new McpTargetList();

  if (tool) {
    pushMcpToolPermissionTargets(tool, server, configuredServerNames, targets);
    targets.add("mcp_call");
    return targets.toArray();
  }

  if (connect) {
    targets.add(`mcp_connect_${connect}`);
    targets.add(connect);
    targets.add("mcp_connect");
    return targets.toArray();
  }

  if (describe) {
    pushMcpToolPermissionTargets(
      describe,
      server,
      configuredServerNames,
      targets,
    );
    targets.add("mcp_describe");
    return targets.toArray();
  }

  if (search) {
    if (server) {
      targets.add(`mcp_server_${server}`);
      targets.add(server);
    }

    targets.add(search);
    targets.add("mcp_search");
    return targets.toArray();
  }

  if (server) {
    targets.add(`mcp_server_${server}`);
    targets.add(server);
    targets.add("mcp_list");
    return targets.toArray();
  }

  targets.add("mcp_status");
  return targets.toArray();
}
