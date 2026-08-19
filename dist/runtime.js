// src/index.ts
import { getAgentDir as getAgentDir2, getPackageDir } from "@earendil-works/pi-coding-agent";

// src/access-intent/bash/parser.ts
import { createRequire } from "node:module";

// src/async-cache.ts
function memoizeAsyncWithRetry(factory) {
  let cached = null;
  return () => {
    cached ??= factory().catch((error) => {
      cached = null;
      throw error;
    });
    return cached;
  };
}

// src/access-intent/bash/parser.ts
async function initParser() {
  const { Parser, Language } = await import("web-tree-sitter");
  const req = createRequire(import.meta.url);
  const treeSitterWasm = req.resolve("web-tree-sitter/web-tree-sitter.wasm");
  await Parser.init({ locateFile: () => treeSitterWasm });
  const parser = new Parser();
  const bashWasm = req.resolve("tree-sitter-bash/tree-sitter-bash.wasm");
  const bash = await Language.load(bashWasm);
  parser.setLanguage(bash);
  return parser;
}
var getParser = memoizeAsyncWithRetry(initParser);
var warmedParser = null;
async function warmBashParser() {
  if (warmedParser) return;
  try {
    warmedParser = await getParser();
  } catch {
  }
}
function getWarmBashParser() {
  return warmedParser;
}

// src/bash-arity.ts
var ARITY = {
  // Version control
  git: 2,
  hg: 2,
  svn: 2,
  // Node.js package managers
  npm: 2,
  "npm run": 3,
  "npm exec": 3,
  npx: 2,
  pnpm: 2,
  "pnpm run": 3,
  "pnpm exec": 3,
  "pnpm dlx": 3,
  yarn: 2,
  "yarn run": 3,
  bun: 2,
  "bun run": 3,
  "bun add": 2,
  "bun x": 3,
  // Runtimes
  deno: 2,
  "deno run": 3,
  "deno task": 3,
  "deno compile": 3,
  // Python
  pip: 2,
  pip3: 2,
  uv: 2,
  "uv run": 3,
  "uv pip": 3,
  // Rust
  cargo: 2,
  // Go
  go: 2,
  "go run": 3,
  // Ruby
  bundle: 2,
  "bundle exec": 3,
  // Docker / container
  docker: 2,
  "docker compose": 3,
  "docker container": 3,
  "docker image": 3,
  "docker network": 3,
  "docker volume": 3,
  podman: 2,
  "podman compose": 3,
  // Kubernetes
  kubectl: 2,
  helm: 2,
  // Cloud CLIs
  aws: 3,
  az: 3,
  gcloud: 3,
  gh: 2,
  "gh pr": 3,
  "gh issue": 3,
  "gh repo": 3,
  fly: 2,
  vercel: 2,
  wrangler: 2,
  // Build tools
  make: 1,
  bazel: 2,
  // Infrastructure
  terraform: 2,
  tofu: 2,
  pulumi: 2,
  // System service management
  systemctl: 2,
  service: 2,
  // Shell file-ops — args are paths/targets, not subcommands
  ls: 1,
  ll: 1,
  la: 1,
  cat: 1,
  less: 1,
  more: 1,
  head: 1,
  tail: 1,
  grep: 1,
  rg: 1,
  ag: 1,
  find: 1,
  touch: 1,
  mkdir: 1,
  rm: 1,
  cp: 1,
  mv: 1,
  ln: 1,
  chmod: 1,
  chown: 1,
  du: 1,
  df: 1,
  echo: 1,
  printf: 1,
  diff: 1,
  patch: 1,
  wc: 1,
  sort: 1,
  uniq: 1,
  awk: 1,
  sed: 1,
  tar: 1,
  zip: 1,
  unzip: 1,
  // Network
  curl: 1,
  wget: 1,
  ssh: 1,
  scp: 1,
  rsync: 1,
  ping: 1,
  // Process management
  kill: 1,
  killall: 1,
  pkill: 1,
  // Package managers (system)
  brew: 2,
  apt: 2,
  "apt-get": 2,
  yum: 2,
  dnf: 2
};
function prefix(tokens) {
  if (tokens.length === 0) return [];
  for (let n = tokens.length; n >= 1; n--) {
    const key = tokens.slice(0, n).map((t) => t.toLowerCase()).join(" ");
    const arity = ARITY[key];
    if (arity !== void 0) {
      return tokens.slice(0, Math.min(arity, tokens.length));
    }
  }
  return [tokens[0]];
}
function stripBashCommentLines(command) {
  const lines = command.split("\n");
  const meaningful = lines.filter((line) => !/^\s*#/.test(line));
  return meaningful.join("\n").trim();
}

// src/value-guards.ts
function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}
function getNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// src/access-intent/mcp-targets.ts
var McpTargetList = class {
  targets = [];
  add(value) {
    if (!value) {
      return;
    }
    if (!this.targets.includes(value)) {
      this.targets.push(value);
    }
  }
  toArray() {
    return [...this.targets];
  }
};
function parseQualifiedMcpToolName(value) {
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
function addDerivedMcpServerTargets(toolName, configuredServerNames, targets) {
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
function pushMcpToolPermissionTargets(rawReference, serverHint, configuredServerNames, targets) {
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
function createMcpPermissionTargets(input, configuredServerNames = []) {
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
      targets
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

// src/access-intent/path-surfaces.ts
var READ_ONLY_PATH_BEARING_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "find",
  "grep",
  "ls"
]);
var PATH_BEARING_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "write",
  "edit",
  "find",
  "grep",
  "ls"
]);
var PATH_SURFACES = /* @__PURE__ */ new Set([
  ...PATH_BEARING_TOOLS,
  "external_directory",
  "path"
]);

// src/access-intent/tool-kind.ts
function classifyToolKind(toolName) {
  const name = toolName.trim();
  if (name === "bash") return "bash";
  if (name === "mcp") return "mcp";
  if (name === "skill") return "skill";
  if (PATH_BEARING_TOOLS.has(name)) return "path";
  return "extension";
}
function resolveShellInvocation(toolName, input, aliases) {
  const name = toolName.trim();
  const record = toRecord(input);
  if (name === "bash") {
    return {
      command: getNonEmptyString(record.command) ?? "",
      workdir: void 0
    };
  }
  const alias = aliases?.[name];
  if (alias) {
    return {
      command: getNonEmptyString(record[alias.commandArgument]) ?? "",
      workdir: alias.workdirArgument ? getNonEmptyString(record[alias.workdirArgument]) ?? void 0 : void 0
    };
  }
  return null;
}
function isMcpCheck(check) {
  return check.source === "mcp" || classifyToolKind(check.toolName) === "mcp";
}

// src/access-intent/input-normalizer.ts
function buildAccessIntentForSurface(surface, value, normalizer, agentName) {
  const pathValue = getNonEmptyString(value);
  if (pathValue !== null && PATH_SURFACES.has(surface)) {
    return {
      kind: "access-path",
      surface,
      path: normalizer.forPath(pathValue),
      agentName
    };
  }
  return {
    kind: "tool",
    surface,
    input: buildInputForSurface(surface, value),
    agentName
  };
}
function buildResolvedIntentFromMatchValues(surface, matchValues, agentName) {
  if (PATH_SURFACES.has(surface)) {
    return {
      kind: "path-values",
      surface,
      values: [...matchValues],
      agentName
    };
  }
  return {
    kind: "tool",
    surface,
    input: buildInputForSurface(surface, matchValues[0]),
    agentName
  };
}
function buildInputForSurface(surface, value) {
  const v = value ?? "";
  if (surface === "bash") return { command: v };
  if (surface === "skill") return { name: v };
  if (surface === "external_directory") return { path: v };
  return {};
}
function normalizeInput(toolName, input, configuredMcpServerNames) {
  switch (classifyToolKind(toolName)) {
    // --- Skill ---
    case "skill": {
      const record = toRecord(input);
      const skillName = record.name;
      const lookupValue = typeof skillName === "string" ? skillName : "*";
      return {
        surface: "skill",
        values: [lookupValue],
        resultExtras: {}
      };
    }
    // --- Bash ---
    case "bash": {
      const record = toRecord(input);
      const command = typeof record.command === "string" ? record.command : "";
      const matchValue = stripBashCommentLines(command) || command;
      return {
        surface: "bash",
        values: [matchValue],
        resultExtras: { command }
      };
    }
    // --- MCP ---
    case "mcp": {
      const mcpTargets = [
        ...createMcpPermissionTargets(input, configuredMcpServerNames),
        "mcp"
      ];
      const fallbackTarget = mcpTargets[0] ?? "mcp";
      return {
        surface: "mcp",
        values: mcpTargets,
        resultExtras: { target: fallbackTarget }
      };
    }
    // --- All other surfaces (path-bearing tools and extension tools) ---
    // Path-bearing tools with a present path never reach here — the gate emits
    // an access-path intent (#502). Missing-path and extension-tool cases both
    // collapse to the surface catch-all.
    case "path":
    case "extension":
      return {
        surface: toolName,
        values: ["*"],
        resultExtras: {}
      };
  }
}

// src/authority/authorizer-registry.ts
var AuthorizerRegistry = class {
  links = /* @__PURE__ */ new Map();
  /**
   * Register a link under `name`.
   *
   * Throws if a link is already registered for that name — keeps resolution
   * deterministic (a pi-permission-system package priority). Returns a disposer
   * that removes the link; the disposer is identity-guarded so a stale call
   * cannot evict a later registration.
   */
  register(name, authorize) {
    if (this.links.has(name)) {
      throw new Error(`An authorizer is already registered for '${name}'.`);
    }
    this.links.set(name, authorize);
    return () => {
      if (this.links.get(name) === authorize) {
        this.links.delete(name);
      }
    };
  }
  get(name) {
    return this.links.get(name);
  }
};

// src/authority/approval-escalator.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/active-agent.ts
var ACTIVE_AGENT_TAG_REGEX = /<active_agent\s+name=["']([^"']+)["'][^>]*>/i;
function normalizeAgentName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function getActiveAgentName(ctx) {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom" || entry.customType !== "active_agent") {
      continue;
    }
    const data = entry.data;
    const normalizedName = normalizeAgentName(data?.name);
    if (normalizedName) {
      return normalizedName;
    }
    if (data?.name === null) {
      return null;
    }
  }
  return null;
}
function getActiveAgentNameFromSystemPrompt(systemPrompt) {
  if (!systemPrompt) {
    return null;
  }
  const match = ACTIVE_AGENT_TAG_REGEX.exec(systemPrompt);
  if (!match?.[1]) {
    return null;
  }
  return normalizeAgentName(match[1]);
}

// src/authority/forwarder-context.ts
function getCwd(ctx) {
  return ctx.cwd;
}
function getSessionId(ctx) {
  try {
    const sessionId = ctx.sessionManager.getSessionId();
    if (typeof sessionId === "string" && sessionId.trim()) {
      return sessionId.trim();
    }
  } catch {
  }
  return "unknown";
}

// src/authority/forwarding-io.ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";

// src/authority/decision-source.ts
var MAX_DECISION_SOURCE_DEPTH = 4;
function asDecisionSource(value) {
  return narrowSource(value, MAX_DECISION_SOURCE_DEPTH);
}
function narrowSource(value, depthBudget) {
  const candidate = asObject(value);
  if (!candidate) return void 0;
  switch (candidate.kind) {
    case "user":
      return narrowUser(candidate);
    case "authorizer":
      return narrowAuthorizer(candidate);
    case "rule":
      return narrowRule(candidate);
    case "session_approval":
      return narrowSessionApproval(candidate);
    case "yolo":
      return isNullableString(candidate.pattern) ? { kind: "yolo", pattern: candidate.pattern } : void 0;
    case "infrastructure_read":
      return { kind: "infrastructure_read" };
    case "unavailable":
      return typeof candidate.reason === "string" ? { kind: "unavailable", reason: candidate.reason } : void 0;
    case "gate_error":
      return typeof candidate.reason === "string" ? { kind: "gate_error", reason: candidate.reason } : void 0;
    case "forwarded":
      return narrowForwarded(candidate, depthBudget);
    default:
      return void 0;
  }
}
function narrowUser(candidate) {
  const via = USER_DECISION_SURFACES.find((entry) => entry === candidate.via);
  return via ? { kind: "user", via } : void 0;
}
function narrowAuthorizer(candidate) {
  const verdict = AUTHORIZER_VERDICTS.find(
    (entry) => entry === candidate.verdict
  );
  if (!verdict || typeof candidate.name !== "string" || !isNullableString(candidate.reason)) {
    return void 0;
  }
  return {
    kind: "authorizer",
    name: candidate.name,
    verdict,
    reason: candidate.reason
  };
}
function narrowRule(candidate) {
  if (typeof candidate.surface !== "string" || !isNullableString(candidate.pattern) || !isNullableString(candidate.origin)) {
    return void 0;
  }
  return {
    kind: "rule",
    surface: candidate.surface,
    pattern: candidate.pattern,
    origin: candidate.origin
  };
}
function narrowSessionApproval(candidate) {
  if (typeof candidate.surface !== "string" || !isNullableString(candidate.pattern)) {
    return void 0;
  }
  return {
    kind: "session_approval",
    surface: candidate.surface,
    pattern: candidate.pattern
  };
}
function narrowForwarded(candidate, depthBudget) {
  if (depthBudget <= 0 || !isNullableString(candidate.responderSessionId)) {
    return void 0;
  }
  if (candidate.decision === null) {
    return {
      kind: "forwarded",
      responderSessionId: candidate.responderSessionId,
      decision: null
    };
  }
  const decision = narrowSource(candidate.decision, depthBudget - 1);
  return decision ? {
    kind: "forwarded",
    responderSessionId: candidate.responderSessionId,
    decision
  } : void 0;
}
var USER_DECISION_SURFACES = [
  "dialog",
  "select"
];
var AUTHORIZER_VERDICTS = ["allow", "deny"];
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function isNullableString(value) {
  return value === null || typeof value === "string";
}

// src/authority/permission-dialog.ts
var APPROVE_OPTION = "Yes";
var APPROVE_FOR_SESSION_OPTION = "Yes, for this session";
var DENY_OPTION = "No";
var DENY_WITH_REASON_OPTION = "No, provide reason";
function normalizePermissionDenialReason(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function createDeniedPermissionDecision(denialReason) {
  const normalizedReason = normalizePermissionDenialReason(denialReason);
  return normalizedReason ? {
    approved: false,
    state: "denied_with_reason",
    denialReason: normalizedReason
  } : {
    approved: false,
    state: "denied"
  };
}
function isPermissionDecisionState(value) {
  return value === "approved" || value === "approved_for_session" || value === "approved_for_serving_session" || value === "denied" || value === "denied_with_reason";
}
async function requestPermissionDecisionFromUi(ui, title, message, options) {
  const sessionOption = options?.sessionLabel ?? APPROVE_FOR_SESSION_OPTION;
  const decisionOptions = [
    APPROVE_OPTION,
    sessionOption,
    DENY_OPTION,
    DENY_WITH_REASON_OPTION
  ];
  const selected = await ui.select(`${title}
${message}`, [
    ...decisionOptions
  ]);
  if (selected === APPROVE_OPTION) {
    return {
      approved: true,
      state: "approved"
    };
  }
  if (selected === sessionOption) {
    if (options?.sessionScope) {
      const scope = await ui.select(`${title}
Apply this session grant to:`, [
        options.sessionScope.subagentLabel,
        options.sessionScope.servingSessionLabel
      ]);
      return {
        approved: true,
        // A cancelled scope select (undefined) falls back to the
        // least-privilege subagent scope.
        state: scope === options.sessionScope.servingSessionLabel ? "approved_for_serving_session" : "approved_for_session"
      };
    }
    return {
      approved: true,
      state: "approved_for_session"
    };
  }
  if (selected === DENY_WITH_REASON_OPTION) {
    const denialReason = normalizePermissionDenialReason(
      await ui.input(
        `${title}
Share why this request was denied (optional).`,
        "Reason shown back to the agent"
      )
    );
    return createDeniedPermissionDecision(denialReason);
  }
  return createDeniedPermissionDecision();
}

// src/authority/permission-forwarding.ts
import { join } from "node:path";
var PERMISSION_FORWARDING_POLL_INTERVAL_MS = 250;
var PERMISSION_FORWARDING_TIMEOUT_MS = 10 * 60 * 1e3;
var PERMISSION_FORWARDING_SERVING_GRACE_MS = 8 * PERMISSION_FORWARDING_POLL_INTERVAL_MS;
var SUBAGENT_ENV_HINT_KEYS = [
  // pi-agent-router (original)
  "PI_IS_SUBAGENT",
  "PI_SUBAGENT_SESSION_ID",
  "PI_AGENT_ROUTER_SUBAGENT",
  // nicobailon/pi-subagents
  "PI_SUBAGENT_CHILD",
  "PI_SUBAGENT_RUN_ID",
  "PI_SUBAGENT_CHILD_AGENT",
  "PI_SUBAGENT_DEPTH",
  // HazAT/pi-interactive-subagents
  "PI_SUBAGENT_NAME",
  "PI_SUBAGENT_ID",
  "PI_SUBAGENT_SESSION",
  "PI_SUBAGENT_ACTIVITY_FILE"
];
var SUBAGENT_PARENT_SESSION_ENV_CANDIDATES = [
  // pi-agent-router (original)
  "PI_AGENT_ROUTER_PARENT_SESSION_ID",
  // Shared convention for CLI-based subagent extensions
  // (nicobailon/pi-subagents, HazAT/pi-interactive-subagents, etc.)
  "PI_SUBAGENT_PARENT_SESSION"
];
var SUBAGENT_PARENT_SESSION_ENV_KEY = SUBAGENT_PARENT_SESSION_ENV_CANDIDATES[0];
var SESSION_FORWARDING_ROOT_DIRECTORY_NAME = "sessions";
var SESSION_FORWARDING_REQUESTS_DIRECTORY_NAME = "requests";
var SESSION_FORWARDING_RESPONSES_DIRECTORY_NAME = "responses";
function normalizePermissionForwardingSessionId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
}
function encodeSessionIdForPath(sessionId) {
  return encodeURIComponent(sessionId);
}
function createPermissionForwardingLocation(forwardingRootDir, sessionId) {
  const normalizedSessionId = normalizePermissionForwardingSessionId(sessionId);
  if (!normalizedSessionId) {
    throw new Error(
      "Permission forwarding session id must be a non-empty string."
    );
  }
  const sessionRootDir = join(
    forwardingRootDir,
    SESSION_FORWARDING_ROOT_DIRECTORY_NAME,
    encodeSessionIdForPath(normalizedSessionId)
  );
  return {
    sessionId: normalizedSessionId,
    sessionRootDir,
    requestsDir: join(
      sessionRootDir,
      SESSION_FORWARDING_REQUESTS_DIRECTORY_NAME
    ),
    responsesDir: join(
      sessionRootDir,
      SESSION_FORWARDING_RESPONSES_DIRECTORY_NAME
    ),
    label: "primary"
  };
}
function resolvePermissionForwardingTarget(options) {
  if (options.hasUI) {
    const own = normalizePermissionForwardingSessionId(
      options.currentSessionId
    );
    return own === null ? null : { sessionId: own, source: "self" };
  }
  if (!options.isSubagent) {
    return null;
  }
  if (options.registry && options.sessionId) {
    const entry = options.registry.get(options.sessionId);
    const resolved = normalizePermissionForwardingSessionId(
      entry?.parentSessionId
    );
    if (resolved) return { sessionId: resolved, source: "registry" };
  }
  const env = options.env ?? process.env;
  for (const key of SUBAGENT_PARENT_SESSION_ENV_CANDIDATES) {
    const resolved = normalizePermissionForwardingSessionId(env[key]);
    if (resolved) return { sessionId: resolved, source: "env" };
  }
  return null;
}
function isForwardedPermissionRequestForSession(request, sessionId) {
  const normalizedRequestSessionId = normalizePermissionForwardingSessionId(
    request.targetSessionId
  );
  const normalizedSessionId = normalizePermissionForwardingSessionId(sessionId);
  return normalizedRequestSessionId !== null && normalizedRequestSessionId === normalizedSessionId;
}

// src/log-file-permissions.ts
import { chmodSync } from "node:fs";
var OWNER_ONLY_FILE_MODE = 384;
var OWNER_ONLY_DIRECTORY_MODE = 448;
function restrictExistingPathToOwner(path, mode) {
  try {
    chmodSync(path, mode);
  } catch {
  }
}

// src/presentation/prompt-payload.ts
function localRequester(agentName) {
  return { agentName, forwarded: false, sessionId: null };
}
var PROMPT_PAYLOAD_KINDS = [
  "bash",
  "mcp",
  "tool",
  "path",
  "external_directory",
  "bash_external_directory",
  "skill",
  "skill_read",
  "forwarded"
];
var BASH_COMMAND_CONTEXTS = [
  "command_substitution",
  "process_substitution",
  "subshell"
];
function asPromptPayload(value) {
  const candidate = asObject2(value);
  if (!candidate) return void 0;
  const kind = PROMPT_PAYLOAD_KINDS.find((entry) => entry === candidate.kind);
  const request = asPromptRequestFacts(candidate.request);
  const evidence = asArrayOf(candidate.evidence, asPromptEvidence);
  const annotations = asArrayOf(candidate.annotations, asPromptAnnotation);
  if (!kind || !request || !evidence || !annotations) return void 0;
  return { kind, request, evidence, annotations };
}
function asPromptRequestFacts(value) {
  const candidate = asObject2(value);
  if (!candidate) return void 0;
  const requester = asPromptRequester(candidate.requester);
  const commandContext = asNullableMember(
    candidate.commandContext,
    BASH_COMMAND_CONTEXTS
  );
  if (!requester || commandContext === void 0 || typeof candidate.surface !== "string" || typeof candidate.value !== "string" || !isNullableString2(candidate.toolName) || !isNullableString2(candidate.invokedToolName) || !isNullableString2(candidate.matchedPattern) || !isNullableString2(candidate.executedUnit)) {
    return void 0;
  }
  return {
    requester,
    surface: candidate.surface,
    toolName: candidate.toolName,
    invokedToolName: candidate.invokedToolName,
    value: candidate.value,
    matchedPattern: candidate.matchedPattern,
    commandContext: commandContext.value,
    executedUnit: candidate.executedUnit
  };
}
function asPromptRequester(value) {
  const candidate = asObject2(value);
  if (!candidate || typeof candidate.forwarded !== "boolean" || !isNullableString2(candidate.agentName) || !isNullableString2(candidate.sessionId)) {
    return void 0;
  }
  return {
    agentName: candidate.agentName,
    forwarded: candidate.forwarded,
    sessionId: candidate.sessionId
  };
}
function asPromptEvidence(value) {
  const candidate = asObject2(value);
  if (!candidate || typeof candidate.label !== "string" || typeof candidate.text !== "string" || !isNullableString2(candidate.detail)) {
    return void 0;
  }
  return {
    label: candidate.label,
    text: candidate.text,
    detail: candidate.detail
  };
}
function asPromptAnnotation(value) {
  const candidate = asObject2(value);
  if (!candidate || typeof candidate.source !== "string" || typeof candidate.text !== "string") {
    return void 0;
  }
  return { source: candidate.source, text: candidate.text };
}
function asObject2(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function asArrayOf(value, narrow) {
  if (!Array.isArray(value)) return void 0;
  const narrowed = [];
  for (const entry of value) {
    const result = narrow(entry);
    if (!result) return void 0;
    narrowed.push(result);
  }
  return narrowed;
}
function isNullableString2(value) {
  return value === null || typeof value === "string";
}
function asNullableMember(value, members) {
  if (value === null) return { value: null };
  const member = members.find((entry) => entry === value);
  return member ? { value: member } : void 0;
}
function findEvidence(payload, label) {
  return payload.evidence.find((entry) => entry.label === label);
}
function allEvidence(payload, label) {
  return payload.evidence.filter((entry) => entry.label === label);
}

// src/authority/forwarding-io.ts
var UI_PROMPT_SOURCES = [
  "tool_call",
  "skill_input",
  "skill_read"
];
function asUiPromptSource(value) {
  return UI_PROMPT_SOURCES.find((source) => source === value);
}
function asNullableDisplayString(value) {
  if (value === null || typeof value === "string") {
    return value;
  }
  return void 0;
}
function asForwardedSessionApproval(value) {
  if (typeof value !== "object" || value === null) {
    return void 0;
  }
  const candidate = value;
  if (typeof candidate.surface !== "string" || candidate.surface.length === 0 || !Array.isArray(candidate.patterns) || !candidate.patterns.every((pattern) => typeof pattern === "string")) {
    return void 0;
  }
  return { surface: candidate.surface, patterns: [...candidate.patterns] };
}
function asForwardedAccessIntent(value) {
  if (typeof value !== "object" || value === null) {
    return void 0;
  }
  const candidate = value;
  if (typeof candidate.surface !== "string" || !Array.isArray(candidate.matchValues) || !candidate.matchValues.every((entry) => typeof entry === "string") || !(candidate.boundaryValue === null || typeof candidate.boundaryValue === "string") || typeof candidate.requesterCwd !== "string" || typeof candidate.principal !== "object" || candidate.principal === null) {
    return void 0;
  }
  const principal = candidate.principal;
  if (typeof principal.sessionId !== "string" || typeof principal.agentName !== "string") {
    return void 0;
  }
  return {
    surface: candidate.surface,
    matchValues: [...candidate.matchValues],
    boundaryValue: candidate.boundaryValue,
    requesterCwd: candidate.requesterCwd,
    principal: {
      sessionId: principal.sessionId,
      agentName: principal.agentName
    }
  };
}
function formatUnknownErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
function isErrnoCode(error, code) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === code
  );
}
function logPermissionForwardingWarning(logger, message, error) {
  const details = typeof error === "undefined" ? { message } : { message, error: formatUnknownErrorMessage(error) };
  logger?.review("permission_forwarding.warning", details);
  logger?.debug("permission_forwarding.warning", details);
}
function logPermissionForwardingError(logger, message, error) {
  const details = typeof error === "undefined" ? { message } : { message, error: formatUnknownErrorMessage(error) };
  logger?.review("permission_forwarding.error", details);
  logger?.debug("permission_forwarding.error", details);
}
function ensureDirectoryExists(logger, path, description) {
  try {
    mkdirSync(path, { recursive: true, mode: OWNER_ONLY_DIRECTORY_MODE });
    return true;
  } catch (error) {
    logPermissionForwardingError(
      logger,
      `Failed to create ${description} directory '${path}'`,
      error
    );
    return false;
  }
}
function getPermissionForwardingLocationForSession(forwardingDir, sessionId) {
  return createPermissionForwardingLocation(forwardingDir, sessionId);
}
function ensurePermissionForwardingLocation(logger, forwardingDir, sessionId) {
  let location;
  try {
    location = getPermissionForwardingLocationForSession(
      forwardingDir,
      sessionId
    );
  } catch (error) {
    logPermissionForwardingError(
      logger,
      "Failed to resolve permission forwarding location",
      error
    );
    return null;
  }
  const sessionRootReady = ensureDirectoryExists(
    logger,
    location.sessionRootDir,
    "permission forwarding session root"
  );
  const requestsReady = ensureDirectoryExists(
    logger,
    location.requestsDir,
    "permission forwarding requests"
  );
  const responsesReady = ensureDirectoryExists(
    logger,
    location.responsesDir,
    "permission forwarding responses"
  );
  return sessionRootReady && requestsReady && responsesReady ? location : null;
}
function getExistingPermissionForwardingLocation(forwardingDir, sessionId) {
  let location;
  try {
    location = getPermissionForwardingLocationForSession(
      forwardingDir,
      sessionId
    );
  } catch {
    return null;
  }
  return existsSync(location.requestsDir) ? location : null;
}
function tryRemoveDirectoryIfEmpty(logger, path, description) {
  if (!existsSync(path)) {
    return true;
  }
  let entries;
  try {
    entries = readdirSync(path);
  } catch (error) {
    logPermissionForwardingWarning(
      logger,
      `Failed to inspect ${description} directory '${path}'`,
      error
    );
    return false;
  }
  if (entries.length > 0) {
    return false;
  }
  try {
    rmdirSync(path);
    return true;
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return true;
    }
    if (isErrnoCode(error, "ENOTEMPTY")) {
      return false;
    }
    logPermissionForwardingWarning(
      logger,
      `Failed to remove empty ${description} directory '${path}'`,
      error
    );
    return false;
  }
}
function cleanupPermissionForwardingLocationIfEmpty(logger, location) {
  const requestsGone = tryRemoveDirectoryIfEmpty(
    logger,
    location.requestsDir,
    `${location.label} permission forwarding requests`
  );
  if (requestsGone) {
    tryRemoveDirectoryIfEmpty(
      logger,
      location.responsesDir,
      `${location.label} permission forwarding responses`
    );
  }
  tryRemoveDirectoryIfEmpty(
    logger,
    location.sessionRootDir,
    `${location.label} permission forwarding session root`
  );
}
function safeDeleteFile(logger, filePath, description) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return;
    }
    logPermissionForwardingWarning(
      logger,
      `Failed to delete ${description} file '${filePath}'`,
      error
    );
  }
}
function writeJsonFileAtomic(logger, filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(value), {
      encoding: "utf-8",
      mode: OWNER_ONLY_FILE_MODE
    });
    renameSync(tempPath, filePath);
  } catch (error) {
    safeDeleteFile(logger, tempPath, "temporary permission-forwarding");
    throw error;
  }
}
function readForwardedPermissionRequest(logger, filePath) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JSON.parse can return null for the string "null"
      !parsed || typeof parsed.id !== "string" || typeof parsed.createdAt !== "number" || typeof parsed.requesterSessionId !== "string" || typeof parsed.targetSessionId !== "string" || typeof parsed.requesterAgentName !== "string"
    ) {
      logPermissionForwardingWarning(
        logger,
        `Ignoring invalid forwarded permission request format in '${filePath}'`
      );
      return null;
    }
    return {
      id: parsed.id,
      createdAt: parsed.createdAt,
      requesterSessionId: parsed.requesterSessionId,
      targetSessionId: parsed.targetSessionId,
      requesterAgentName: parsed.requesterAgentName,
      // Tolerant read: the payload and display fields are optional and may be
      // absent (older child) or malformed; reconstruct only the well-formed
      // ones. An older child's `message` is deliberately not salvaged — a
      // skewed ask renders from the fields it does carry (ADR 0011 §9).
      payload: asPromptPayload(parsed.payload),
      source: asUiPromptSource(parsed.source),
      surface: asNullableDisplayString(parsed.surface),
      value: asNullableDisplayString(parsed.value),
      sessionApproval: asForwardedSessionApproval(parsed.sessionApproval),
      accessIntent: asForwardedAccessIntent(parsed.accessIntent)
    };
  } catch (error) {
    logPermissionForwardingWarning(
      logger,
      `Failed to read forwarded permission request '${filePath}'`,
      error
    );
    return null;
  }
}
function readForwardedPermissionResponse(logger, filePath) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- JSON.parse can return null for the string "null"
      !parsed || typeof parsed.approved !== "boolean" || !isPermissionDecisionState(parsed.state) || typeof parsed.responderSessionId !== "string"
    ) {
      logPermissionForwardingWarning(
        logger,
        `Ignoring invalid forwarded permission response format in '${filePath}'`
      );
      return null;
    }
    return {
      approved: parsed.approved,
      state: parsed.state,
      denialReason: typeof parsed.denialReason === "string" ? parsed.denialReason : void 0,
      responderSessionId: parsed.responderSessionId,
      respondedAt: typeof parsed.respondedAt === "number" ? parsed.respondedAt : Date.now(),
      // Tolerant like the request's `accessIntent`: an unusable provenance
      // record is dropped, but the decision itself still has to reach the
      // requester, so it never rejects the response.
      decidedBy: asDecisionSource(parsed.decidedBy)
    };
  } catch (error) {
    logPermissionForwardingWarning(
      logger,
      `Failed to read forwarded permission response '${filePath}'`,
      error
    );
    return null;
  }
}
function listRequestFiles(logger, requestsDir) {
  try {
    return readdirSync(requestsDir).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    logPermissionForwardingWarning(
      logger,
      `Failed to read permission forwarding requests from '${requestsDir}'`,
      error
    );
    return [];
  }
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// src/permission-request-id.ts
import { randomUUID } from "node:crypto";
function createPermissionRequestId() {
  return `perm-${randomUUID()}`;
}

// src/permission-ui-prompt.ts
function buildUiPrompt(input) {
  return {
    requestId: input.requestId,
    source: input.source,
    surface: input.surface !== void 0 ? input.surface : directSurface(input),
    value: input.value !== void 0 ? input.value : directValue(input),
    agentName: input.agentName,
    request: input.payload.request,
    forwarding: input.forwarding ?? null
  };
}
function directSurface(input) {
  if (input.source === "skill_input" || input.source === "skill_read") {
    return "skill";
  }
  return input.toolName ?? null;
}
function directValue(input) {
  return input.command ?? input.path ?? input.target ?? input.skillName ?? input.toolName ?? null;
}

// src/authority/approval-escalator.ts
function getContextSystemPrompt(ctx) {
  const getSystemPrompt = toRecord(ctx).getSystemPrompt;
  if (typeof getSystemPrompt !== "function") {
    return void 0;
  }
  try {
    const systemPrompt = getSystemPrompt.call(ctx);
    return typeof systemPrompt === "string" ? systemPrompt : void 0;
  } catch (error) {
    logPermissionForwardingWarning(
      null,
      "Failed to read context system prompt for forwarded permission metadata",
      error
    );
    return void 0;
  }
}
function abandon(denialReason) {
  return {
    approved: false,
    state: "denied",
    confirmationUnavailable: true,
    denialReason,
    decidedBy: { kind: "unavailable", reason: denialReason }
  };
}
function relayDecision(response) {
  return {
    ...response,
    decidedBy: {
      kind: "forwarded",
      responderSessionId: response.responderSessionId,
      decision: response.decidedBy ?? null
    }
  };
}
var FILENAME_SAFE_REQUEST_ID = /^[A-Za-z0-9._-]+$/;
function forwardableRequestId(requesterRequestId) {
  return FILENAME_SAFE_REQUEST_ID.test(requesterRequestId) ? requesterRequestId : createPermissionRequestId();
}
var ParentAuthorizer = class {
  constructor(ctx, deps) {
    this.ctx = ctx;
    this.forwardingDir = deps.forwardingDir;
    this.registry = deps.registry;
    this.serving = deps.serving;
    this.getTimeoutMs = deps.getTimeoutMs;
    this.logger = deps.logger;
  }
  ctx;
  forwardingDir;
  registry;
  serving;
  getTimeoutMs;
  logger;
  authorize(details) {
    const uiPrompt = buildUiPrompt(details);
    return this.waitForForwardedApproval(this.ctx, {
      requestId: details.requestId,
      payload: details.payload,
      display: {
        source: uiPrompt.source,
        surface: uiPrompt.surface,
        value: uiPrompt.value
      },
      sessionApproval: details.sessionApproval,
      accessIntent: details.accessIntent
    });
  }
  // ── Private methods ────────────────────────────────────────────────────
  async waitForForwardedApproval(ctx, facts) {
    const requesterSessionId = getSessionId(ctx);
    const target = resolvePermissionForwardingTarget({
      hasUI: ctx.hasUI,
      // Invariant: selectAuthorizer only selects ParentAuthorizer for a
      // no-UI subagent context, so this is always true — no detection dep
      // needed to re-derive it here.
      isSubagent: true,
      currentSessionId: requesterSessionId,
      env: process.env,
      sessionId: requesterSessionId,
      registry: this.registry
    });
    if (!target) {
      logPermissionForwardingError(
        this.logger,
        `Permission forwarding target session could not be resolved. Checked env vars: ${SUBAGENT_PARENT_SESSION_ENV_CANDIDATES.join(", ")}. If you are using a subagent extension (nicobailon/pi-subagents, HazAT/pi-interactive-subagents, etc.), ask its maintainer to set PI_SUBAGENT_PARENT_SESSION in the child process environment (see https://github.com/gotgenes/pi-permission-system/issues/143).`
      );
      return abandon(
        "Could not resolve a parent session to forward this permission request to"
      );
    }
    const location = ensurePermissionForwardingLocation(
      this.logger,
      this.forwardingDir,
      target.sessionId
    );
    if (!location) {
      logPermissionForwardingError(
        this.logger,
        `Permission forwarding is unavailable because session-scoped directories could not be prepared for '${target.sessionId}'`
      );
      return abandon(
        `Permission forwarding directories could not be prepared for session '${target.sessionId}'`
      );
    }
    const request = this.buildForwardedRequest(
      ctx,
      facts,
      requesterSessionId,
      target.sessionId
    );
    const requestPath = join2(location.requestsDir, `${request.id}.json`);
    const responsePath = join2(location.responsesDir, `${request.id}.json`);
    this.logger.review("forwarded_permission.request_created", {
      requestId: request.id,
      requesterAgentName: request.requesterAgentName,
      requesterSessionId: request.requesterSessionId,
      targetSessionId: target.sessionId,
      requestPath,
      responsePath
    });
    try {
      writeJsonFileAtomic(this.logger, requestPath, request);
    } catch (error) {
      logPermissionForwardingError(
        this.logger,
        `Failed to write forwarded permission request '${requestPath}'`,
        error
      );
      cleanupPermissionForwardingLocationIfEmpty(this.logger, location);
      return abandon("The forwarded permission request could not be written");
    }
    return this.pollForForwardedResponse(
      location,
      request,
      requestPath,
      responsePath,
      target
    );
  }
  buildForwardedRequest(ctx, facts, requesterSessionId, targetSessionId) {
    const requestId = forwardableRequestId(facts.requestId);
    const requesterAgentName = getActiveAgentName(ctx) ?? getActiveAgentNameFromSystemPrompt(getContextSystemPrompt(ctx)) ?? "unknown";
    const accessIntent = facts.accessIntent ? {
      ...facts.accessIntent,
      requesterCwd: getCwd(ctx),
      principal: {
        sessionId: requesterSessionId,
        agentName: requesterAgentName
      }
    } : void 0;
    return {
      id: requestId,
      createdAt: Date.now(),
      requesterSessionId,
      targetSessionId,
      requesterAgentName,
      payload: facts.payload,
      ...facts.display ? {
        source: facts.display.source,
        surface: facts.display.surface,
        value: facts.display.value
      } : {},
      ...facts.sessionApproval ? { sessionApproval: facts.sessionApproval } : {},
      ...accessIntent ? { accessIntent } : {}
    };
  }
  async pollForForwardedResponse(location, request, requestPath, responsePath, target) {
    const { id: requestId, requesterAgentName, targetSessionId } = request;
    const timeoutMs = this.getTimeoutMs();
    const deadline = Date.now() + timeoutMs;
    let unservedSince = null;
    while (Date.now() < deadline) {
      if (existsSync2(responsePath)) {
        const response = readForwardedPermissionResponse(
          this.logger,
          responsePath
        );
        const relayed = response ? relayDecision(response) : null;
        this.logger.review("forwarded_permission.response_received", {
          requestId,
          approved: response?.approved ?? null,
          state: response?.state ?? null,
          denialReason: response?.denialReason ?? null,
          responderSessionId: response?.responderSessionId ?? null,
          targetSessionId,
          responsePath,
          decidedBy: relayed?.decidedBy
        });
        this.discardRequest(location, requestPath, responsePath);
        return relayed ?? abandon("The parent session's permission response could not be read");
      }
      unservedSince = this.checkServingLiveness(target, unservedSince);
      if (unservedSince !== null && Date.now() - unservedSince >= PERMISSION_FORWARDING_SERVING_GRACE_MS) {
        const observation = this.serving.describe(target);
        this.logger.review("forwarded_permission.no_serving_session", {
          requestId,
          requesterSessionId: request.requesterSessionId,
          targetSessionId,
          // Which channel answered, and what it saw: the difference between a
          // parent that exited, one that was killed, and one polling under a
          // different session id is the whole diagnosis of a stalled forward.
          servingChannel: observation.channel,
          servingState: observation.state,
          servingSessionIds: observation.servingIds
        });
        this.discardRequest(location, requestPath);
        return abandon(
          `Session '${target.sessionId}' is not serving forwarded permission requests`
        );
      }
      await sleep(PERMISSION_FORWARDING_POLL_INTERVAL_MS);
    }
    logPermissionForwardingWarning(
      this.logger,
      `Timed out waiting for forwarded permission response '${responsePath}'`
    );
    this.logger.review("forwarded_permission.response_timed_out", {
      requestId,
      requesterAgentName,
      targetSessionId,
      responsePath
    });
    this.discardRequest(location, requestPath);
    return abandon(
      `Session '${target.sessionId}' did not answer within ${timeoutMs / 1e3}s`
    );
  }
  /**
   * Track how long the target has looked unserved, or `null` while it looks fine.
   *
   * Which channel can answer for this target is the judge's decision, not this
   * one's: a target it cannot judge answers `null`, which resets the window
   * exactly as "serving" does, so an unjudgeable target waits out the timeout.
   */
  checkServingLiveness(target, unservedSince) {
    return this.serving.isServing(target) === false ? unservedSince ?? Date.now() : null;
  }
  /**
   * Drop this exchange's files and, if nothing else is pending, its directories.
   *
   * Deleting the request is what makes an abandonment final: a request left
   * behind would be answered by the parent long after the child gave up.
   */
  discardRequest(location, requestPath, responsePath) {
    if (responsePath) {
      safeDeleteFile(
        this.logger,
        responsePath,
        "forwarded permission response"
      );
    }
    safeDeleteFile(this.logger, requestPath, "forwarded permission request");
    cleanupPermissionForwardingLocationIfEmpty(this.logger, location);
  }
};

// src/authority/denying-authorizer.ts
var NO_AUTHORITY_REASON = "No live authority was reachable for this session";
var DenyingAuthorizer = class {
  authorize() {
    return Promise.resolve({
      approved: false,
      state: "denied",
      confirmationUnavailable: true,
      decidedBy: { kind: "unavailable", reason: NO_AUTHORITY_REASON }
    });
  }
};

// src/pattern-suggest.ts
function suggestBashPattern(command) {
  const trimmed = command.trim();
  if (!trimmed) return "";
  const stripped = stripBashCommentLines(trimmed);
  if (!stripped) return "";
  const tokens = stripped.split(/\s+/);
  if (tokens.length === 1) return stripped;
  const meaningful = prefix(tokens);
  if (meaningful.length >= tokens.length) {
    return `${stripped}*`;
  }
  return `${meaningful.join(" ")} *`;
}
function suggestMcpPattern(target) {
  const trimmed = target.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    return `${trimmed.slice(0, colonIndex)}:*`;
  }
  const underscoreIndex = trimmed.indexOf("_");
  if (underscoreIndex > 0) {
    return `${trimmed.slice(0, underscoreIndex)}_*`;
  }
  return "*";
}
function buildForwardedScopeLabels(agentName, surface, pattern) {
  const subagentLabel = agentName ? `This subagent ('${agentName}') only` : "This subagent only";
  return {
    subagentLabel,
    servingSessionLabel: `The whole session \u2014 allow ${surface} "${pattern}" for parent and all subagents`
  };
}
function buildLabel(pattern, surface) {
  switch (surface) {
    case "bash":
      return `Yes, allow bash "${pattern}" for this session`;
    case "mcp":
      return `Yes, allow mcp tool "${pattern}" for this session`;
    case "skill":
      return `Yes, allow skill "${pattern}" for this session`;
    case "external_directory":
      return `Yes, allow access to external directory "${pattern}" for this session`;
    case "path":
      return `Yes, allow path "${pattern}" for this session`;
    default:
      if (PATH_BEARING_TOOLS.has(surface) && pattern !== "*") {
        return `Yes, allow ${surface} "${pattern}" for this session`;
      }
      return `Yes, allow tool "${surface}" for this session`;
  }
}
function suggestSessionPattern(surface, value) {
  let pattern;
  switch (surface) {
    case "bash":
      pattern = suggestBashPattern(value);
      break;
    case "mcp":
      pattern = suggestMcpPattern(value);
      break;
    case "skill":
      pattern = value;
      break;
    default:
      pattern = "*";
      break;
  }
  return { surface, pattern, label: buildLabel(pattern, surface) };
}
function suggestPathSessionPattern(surface, approvalPattern) {
  return {
    surface,
    pattern: approvalPattern,
    label: buildLabel(approvalPattern, surface)
  };
}

// src/permission-events.ts
var PERMISSIONS_READY_CHANNEL = "permissions:ready";
var PERMISSIONS_UI_PROMPT_CHANNEL = "permissions:ui_prompt";
var PERMISSIONS_DECISION_CHANNEL = "permissions:decision";
function emitReadyEvent(events) {
  const payload = {};
  try {
    events.emit(PERMISSIONS_READY_CHANNEL, payload);
  } catch {
  }
}
function emitUiPromptEvent(events, event) {
  try {
    events.emit(PERMISSIONS_UI_PROMPT_CHANNEL, event);
  } catch {
  }
}
function emitDecisionEvent(events, event) {
  try {
    events.emit(PERMISSIONS_DECISION_CHANNEL, event);
  } catch {
  }
}

// src/authority/local-user-authorizer.ts
var LocalUserAuthorizer = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  authorize(details) {
    const uiPrompt = buildUiPrompt(details);
    emitUiPromptEvent(this.deps.events, uiPrompt);
    return this.deps.requestPermissionDecision(
      {
        mode: this.deps.mode,
        ui: this.deps.ui,
        ...this.deps.getPromptPreferences()
      },
      details.forwarding ? "Permission Required (Subagent)" : "Permission Required",
      details.payload,
      buildRequestOptions(details)
    );
  }
};
function buildRequestOptions(details) {
  const pattern = details.sessionApproval?.patterns[0];
  if (details.forwarding && details.sessionApproval && pattern) {
    return {
      sessionScope: buildForwardedScopeLabels(
        details.forwarding.requesterAgentName,
        details.sessionApproval.surface,
        pattern
      )
    };
  }
  return details.sessionLabel ? { sessionLabel: details.sessionLabel } : void 0;
}

// src/authority/authorizer.ts
function selectAuthorizer(ctx, deps) {
  if (ctx.hasUI) {
    return {
      terminal: new LocalUserAuthorizer({
        ui: ctx.ui,
        mode: ctx.mode,
        events: deps.events,
        getPromptPreferences: deps.getPromptPreferences,
        requestPermissionDecision: deps.requestPermissionDecision
      }),
      adjudicatesLocally: true
    };
  }
  if (deps.detection.isSubagent(ctx)) {
    return {
      terminal: new ParentAuthorizer(ctx, {
        forwardingDir: deps.forwardingDir,
        registry: deps.registry,
        serving: deps.serving,
        getTimeoutMs: deps.getForwardingTimeoutMs,
        logger: deps.logger
      }),
      adjudicatesLocally: false
    };
  }
  return { terminal: new DenyingAuthorizer(), adjudicatesLocally: true };
}

// src/authority/authorizer-chain.ts
function composeAuthorizerChain(links, terminal, query, log) {
  if (links.length === 0) {
    return terminal;
  }
  return {
    async authorize(details) {
      for (const link of links) {
        const verdict = await link.authorize(details, query, log);
        const decision = decideFromVerdict(link.name, verdict);
        if (decision) {
          return decision;
        }
      }
      return terminal.authorize(details);
    }
  };
}
function decideFromVerdict(name, verdict) {
  switch (verdict.kind) {
    case "allow":
      return {
        approved: true,
        state: "approved",
        decidedBy: decidedByLink(name, "allow", null)
      };
    case "deny":
      return {
        ...createDeniedPermissionDecision(verdict.reason),
        decidedBy: decidedByLink(name, "deny", verdict.reason ?? null)
      };
    case "defer":
      return null;
  }
}
function decidedByLink(name, verdict, reason) {
  return { kind: "authorizer", name, verdict, reason };
}

// src/authority/delegation-envelope.ts
var DELEGATION_EXCLUDED_SURFACES = /* @__PURE__ */ new Set([
  "external_directory",
  "path"
]);
function encloseInDelegationEnvelope(authorize) {
  return async (details, query, log) => {
    const verdict = await authorize(details, query, log);
    if (verdict.kind === "allow" && isExcludedSurface(details)) {
      return { kind: "defer" };
    }
    return verdict;
  };
}
function isExcludedSurface(details) {
  const surface = details.accessIntent?.surface ?? details.surface ?? void 0;
  return surface === void 0 || DELEGATION_EXCLUDED_SURFACES.has(surface);
}

// src/authority/authorizer-selection.ts
var AuthorizerSelection = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  authority = null;
  /**
   * Select the live authority for `ctx` and store it. The non-terminal
   * chain is composed per ask in {@link escalate}, not here: ADR 0007 §4 lets a
   * link register in a `permissions:ready` handler that may fire after
   * activation, so link resolution is deferred to the session's first ask.
   */
  activate(ctx) {
    this.authority = selectAuthorizer(ctx, this.deps);
  }
  /**
   * The chain links for this ask.
   *
   * A node that adjudicates locally resolves its configured names; a relaying
   * node resolves none. Its terminal hands the ask to a serving node, which
   * resolves the request against its own recorded authority and escalates it
   * through *its* chain over the same child-fixed facts (#635) — so running
   * links here would adjudicate one ask twice, and a relaying node cannot host
   * a link in the first place (#699). The delegation is recorded rather than
   * reported as a fail-safe skip: an absent link is the design here, not the
   * misconfiguration `authorizer_chain_unregistered_link` exists to surface.
   */
  linksFor(authority, requestId) {
    const configured = this.deps.getAuthorizerChain();
    if (configured.length === 0) {
      return [];
    }
    if (!authority.adjudicatesLocally) {
      this.deps.logger.review("authorizer_chain_delegated", {
        requestId,
        links: configured
      });
      return [];
    }
    return this.resolveConfiguredLinks(configured, requestId);
  }
  /**
   * Resolve the operator's `authorizerChain` names to registered links, in
   * config order (ADR 0007 invariant 1). An unregistered name is skipped with a
   * warning (invariant 2 — more prompting, never less); each resolved link is
   * wrapped in the bounded-delegation envelope so an `allow` on an excluded
   * surface cannot exceed the operator's policy.
   *
   * The resolved names are recorded against the ask before any link runs — a
   * link that defers decides nothing and would otherwise leave no evidence it
   * was consulted at all, which is what makes "the judge never ran" and "the
   * judge ran and deferred" indistinguishable in the review log.
   */
  resolveConfiguredLinks(configured, requestId) {
    const links = [];
    const resolved = [];
    for (const name of configured) {
      const authorize = this.deps.authorizerRegistry.get(name);
      if (authorize === void 0) {
        this.deps.logger.review("authorizer_chain_unregistered_link", {
          requestId,
          name
        });
        continue;
      }
      resolved.push(name);
      links.push({ name, authorize: encloseInDelegationEnvelope(authorize) });
    }
    if (resolved.length > 0) {
      this.deps.logger.review("authorizer_chain_resolved", {
        requestId,
        links: resolved
      });
    }
    return links;
  }
  /** Clear the stored selection. */
  deactivate() {
    this.authority = null;
  }
  /**
   * Escalate an ask through the composed chain and return its decision.
   *
   * Resolves this ask's links freshly (so a link registered any time before
   * this first ask is honored) and composes them ahead of the selected
   * terminal. With zero links — no chain configured, or a relaying node that
   * delegates adjudication to the serving node — the composed value **is** the
   * terminal instance, so behavior is identical to a bare terminal escalation.
   *
   * Rejects if no terminal has been selected — i.e. before the session was
   * activated. Implements {@link AskEscalator}.
   */
  escalate(details) {
    const authority = this.authority;
    if (authority === null) {
      return Promise.reject(
        new Error("escalate called before the session was activated")
      );
    }
    const chain = composeAuthorizerChain(
      this.linksFor(authority, details.requestId),
      authority.terminal,
      this.deps.getPermissionQuery(),
      this.deps.logger
    );
    return this.deps.prompter.prompt(chain, details);
  }
};

// src/authority/forwarded-request-server.ts
import { join as join3 } from "node:path";

// src/presentation/forwarded-ask-payload.ts
function buildForwardedAskPayload(request) {
  const requester = {
    agentName: request.requesterAgentName,
    forwarded: true,
    sessionId: request.requesterSessionId
  };
  return request.payload ? {
    ...request.payload,
    request: { ...request.payload.request, requester }
  } : degradedForwardedPayload(request, requester);
}
function degradedForwardedPayload(request, requester) {
  return {
    kind: "forwarded",
    request: {
      requester,
      // The child's display projection: what the ask was about, as the child's
      // own gate named it.
      surface: request.surface ?? "",
      toolName: null,
      invokedToolName: null,
      value: request.value ?? "",
      matchedPattern: null,
      commandContext: null,
      executedUnit: null
    },
    // Nothing to carry: the wire no longer relays a sentence, and inventing
    // evidence the child never sent is exactly the fiction the bounded
    // renderers would then have to trust.
    evidence: [],
    annotations: []
  };
}

// src/session-approval.ts
var SessionApproval = class _SessionApproval {
  constructor(surface, patterns) {
    this.surface = surface;
    this.patterns = patterns;
  }
  surface;
  patterns;
  /** Create an approval for a single pattern (the common case). */
  static single(surface, pattern) {
    return new _SessionApproval(surface, [pattern]);
  }
  /**
   * Create an approval for multiple patterns (e.g. bash external-directory
   * gates that cover several uncovered paths in one prompt).
   */
  static multiple(surface, patterns) {
    return new _SessionApproval(surface, [...patterns]);
  }
  /** Representative pattern for the interactive prompt — the first, if any. */
  get representativePattern() {
    return this.patterns[0];
  }
  /**
   * Single-pattern shape `applyPermissionGate` echoes back to the caller.
   * Returns `undefined` when patterns is empty (degenerate case).
   */
  toGateApproval() {
    const pattern = this.representativePattern;
    if (pattern === void 0) return void 0;
    return { surface: this.surface, pattern };
  }
  /**
   * Plain data shape for relaying this approval on a forwarded request, so the
   * serving node can record the same pattern(s) as a whole-session grant.
   * Returns a defensive copy of the patterns.
   */
  toForwardedData() {
    return { surface: this.surface, patterns: [...this.patterns] };
  }
};

// src/authority/forwarded-request-server.ts
function buildForwardedAskDetails(request) {
  const payload = buildForwardedAskPayload(request);
  return {
    requestId: request.id,
    source: request.source ?? "tool_call",
    agentName: request.requesterAgentName || null,
    payload,
    surface: request.surface ?? null,
    value: request.value ?? null,
    forwarding: {
      requesterAgentName: request.requesterAgentName || null,
      requesterSessionId: request.requesterSessionId || null
    },
    // Carries the child's suggestion so LocalUserAuthorizer can offer the
    // whole-session grant scope; absent for a legacy/version-skew request.
    ...request.sessionApproval ? { sessionApproval: request.sessionApproval } : {},
    // Absent for a version-skew request that carried no intent — which the
    // delegation envelope reads as "surface undetermined" and fail-safes to
    // excluded, so absence must stay absence rather than become `undefined`.
    ...request.accessIntent ? { accessIntent: toAccessFacts(request.accessIntent) } : {}
  };
}
function toAccessFacts(intent) {
  return {
    surface: intent.surface,
    matchValues: intent.matchValues,
    boundaryValue: intent.boundaryValue
  };
}
function buildServedDecisionEvent(details, decision) {
  const facts = details.payload.request;
  return {
    requestId: details.requestId,
    // The child's display projection, falling back to the payload's own facts
    // for a version-skewed request that carried none. Both are non-nullable
    // there, so the event's non-null contract holds without a sentinel.
    surface: details.surface ?? facts.surface,
    value: details.value ?? facts.value,
    agentName: details.agentName,
    result: decision.approved ? "allow" : "deny",
    resolution: servedResolution(decision),
    origin: null,
    matchedPattern: null,
    forwarding: details.forwarding ?? null
  };
}
function servedResolution(decision) {
  if (decision.decidedBy.kind === "gate_error") {
    return "gate_error";
  }
  if (decision.confirmationUnavailable) {
    return "confirmation_unavailable";
  }
  if (!decision.approved) {
    return "user_denied";
  }
  return decision.state === "approved_for_session" || decision.state === "approved_for_serving_session" ? "user_approved_for_session" : "user_approved";
}
var ForwardedRequestServer = class {
  forwardingDir;
  logger;
  policy;
  escalator;
  broadcaster;
  recorder;
  registry;
  constructor(deps) {
    this.forwardingDir = deps.forwardingDir;
    this.logger = deps.logger;
    this.policy = deps.policy;
    this.escalator = deps.escalator;
    this.broadcaster = deps.broadcaster;
    this.recorder = deps.recorder;
    this.registry = deps.registry;
  }
  /** Drain and respond to this session's forwarded-permission inbox. */
  async processInbox(ctx) {
    const currentSessionId = getSessionId(ctx);
    const location = getExistingPermissionForwardingLocation(
      this.forwardingDir,
      currentSessionId
    );
    if (!location) {
      return;
    }
    const requestFiles = listRequestFiles(this.logger, location.requestsDir);
    if (requestFiles.length === 0) {
      return;
    }
    if (!ensureDirectoryExists(
      this.logger,
      location.responsesDir,
      "permission forwarding responses"
    )) {
      return;
    }
    for (const fileName of requestFiles) {
      const requestPath = join3(location.requestsDir, fileName);
      const request = readForwardedPermissionRequest(this.logger, requestPath);
      if (!request) {
        safeDeleteFile(
          this.logger,
          requestPath,
          `${location.label} forwarded permission request`
        );
        continue;
      }
      await this.processSingleForwardedRequest(
        request,
        location,
        requestPath,
        currentSessionId
      );
    }
    cleanupPermissionForwardingLocationIfEmpty(this.logger, location);
  }
  // ── Private methods ────────────────────────────────────────────────────
  async processSingleForwardedRequest(request, location, requestPath, currentSessionId) {
    if (!isForwardedPermissionRequestForSession(request, currentSessionId)) {
      logPermissionForwardingWarning(
        this.logger,
        `Ignoring forwarded permission request '${request.id}' because it targets session '${request.targetSessionId}' instead of '${currentSessionId}'`
      );
      safeDeleteFile(
        this.logger,
        requestPath,
        `${location.label} forwarded permission request`
      );
      return;
    }
    this.warnOnMultiHop(request, currentSessionId);
    const forwardedPermissionLogDetails = {
      requestId: request.id,
      source: location.label,
      requesterAgentName: request.requesterAgentName,
      requesterSessionId: request.requesterSessionId,
      targetSessionId: request.targetSessionId,
      requestPath
    };
    const decision = await this.resolveDecision(
      request,
      forwardedPermissionLogDetails
    );
    this.recordForwardedDecision(
      request,
      location,
      requestPath,
      currentSessionId,
      this.applyGrantScope(request, decision, forwardedPermissionLogDetails)
    );
  }
  /**
   * Apply the human's grant-scope choice on a forwarded approval.
   *
   * A whole-session grant (`approved_for_serving_session`) records the child's
   * suggested pattern into this serving node's `SessionRules` — the single
   * source of truth for the scope — and is then translated to a plain
   * `approved` so the child records nothing (its next identical action
   * re-forwards and resolves as recorded authority). Every other decision
   * passes through unchanged (`approved_for_session` → the child records).
   *
   * The translation rewrites the grant's *scope*, never its decider: the human
   * who chose the wider scope is still the one who decided (#726).
   */
  applyGrantScope(request, decision, logDetails) {
    if (decision.state !== "approved_for_serving_session") {
      return decision;
    }
    if (request.sessionApproval) {
      this.recorder.recordSessionApproval(
        SessionApproval.multiple(
          request.sessionApproval.surface,
          request.sessionApproval.patterns
        )
      );
      this.logger.review("forwarded_permission.session_recorded", {
        ...logDetails,
        surface: request.sessionApproval.surface,
        patterns: request.sessionApproval.patterns
      });
    }
    return {
      approved: true,
      state: "approved",
      decidedBy: decision.decidedBy
    };
  }
  /**
   * Persist the served decision: write the response file the child polls for,
   * log the outcome, and delete the drained request. The symmetric "respond"
   * half to {@link resolveDecision}'s "decide" half.
   */
  recordForwardedDecision(request, location, requestPath, currentSessionId, decision) {
    const responsePath = join3(location.responsesDir, `${request.id}.json`);
    this.logger.review(
      decision.approved ? "forwarded_permission.approved" : "forwarded_permission.denied",
      {
        requestId: request.id,
        source: location.label,
        requesterAgentName: request.requesterAgentName,
        requesterSessionId: request.requesterSessionId,
        targetSessionId: request.targetSessionId,
        responsePath,
        resolution: decision.state,
        denialReason: decision.denialReason ?? null,
        decidedBy: decision.decidedBy
      }
    );
    try {
      writeJsonFileAtomic(this.logger, responsePath, {
        approved: decision.approved,
        state: decision.state,
        denialReason: decision.denialReason,
        responderSessionId: currentSessionId,
        respondedAt: Date.now(),
        // Carried onto the wire so the requester can name what decided inside
        // this session, not merely that this session answered (#726).
        decidedBy: decision.decidedBy
      });
    } catch (error) {
      logPermissionForwardingError(
        this.logger,
        `Failed to write ${location.label} forwarded permission response '${responsePath}'`,
        error
      );
      return;
    }
    safeDeleteFile(
      this.logger,
      requestPath,
      `${location.label} forwarded permission request`
    );
  }
  /**
   * Resolve the request the same way the session resolves a local action:
   * recorded authority first (a request carrying an `accessIntent` — the
   * child-fixed facts, ADR 0008 §2 — resolves against the serving node's
   * composed ruleset — `allow`, including yolo-rewritten, auto-approves;
   * `deny` auto-denies), then escalate `ask` (or a request missing
   * `accessIntent`, the version-skew floor, ADR 0008 §4) to the selected
   * `Authorizer`.
   */
  async resolveDecision(request, logDetails) {
    const check = request.accessIntent ? this.policy.resolve(request.accessIntent) : null;
    if (check && check.state !== "ask") {
      const decidedBy = {
        kind: "rule",
        surface: request.accessIntent?.surface ?? check.toolName,
        pattern: check.matchedPattern ?? null,
        origin: check.origin
      };
      const approved = check.state === "allow";
      this.logger.review(
        approved ? "forwarded_permission.auto_approved" : "forwarded_permission.auto_denied",
        { ...logDetails, decidedBy }
      );
      return approved ? { approved: true, state: "approved", decidedBy } : { approved: false, state: "denied", decidedBy };
    }
    this.logger.review("forwarded_permission.prompted", logDetails);
    const details = buildForwardedAskDetails(request);
    const decision = await this.escalateAsk(details);
    this.broadcaster.emitDecision(buildServedDecisionEvent(details, decision));
    return decision;
  }
  /**
   * Escalate a forwarded ask to the serving session's selected `Authorizer`,
   * failing closed instead of throwing: an escalation that breaks is nobody's
   * denial, so the node records itself as the decider.
   *
   * Separate from {@link resolveDecision} so the ask's details outlive the
   * call — every record of the served ask is a render over that one object.
   */
  async escalateAsk(details) {
    try {
      return await this.escalator.escalate(details);
    } catch (error) {
      const reason = formatUnknownErrorMessage(error);
      logPermissionForwardingError(
        this.logger,
        `Failed to escalate forwarded permission request '${details.requestId}'`,
        error
      );
      return {
        approved: false,
        state: "denied",
        decidedBy: { kind: "gate_error", reason }
      };
    }
  }
  /**
   * One-hop canary: forwarding is depth-1 (child → root). If the requester is
   * itself a registered subagent whose parent is not this serving session, the
   * request came through more than one hop (or was misrouted) — resolution is
   * still well-defined, so keep serving, but warn loudly so a future
   * recursion-guard break is visible rather than silent. Unregistered
   * (external file-based) requesters have no recorded parent and are silent.
   */
  warnOnMultiHop(request, currentSessionId) {
    const requesterInfo = this.registry?.get(request.requesterSessionId);
    if (requesterInfo?.parentSessionId && requesterInfo.parentSessionId !== currentSessionId) {
      logPermissionForwardingWarning(
        this.logger,
        `Forwarded permission request '${request.id}' violates the one-hop invariant: requester '${request.requesterSessionId}' is a registered subagent whose parent '${requesterInfo.parentSessionId}' is not this serving session '${currentSessionId}' (multi-hop or misrouted).`
      );
    }
  }
};

// src/authority/forwarding-liveness.ts
import { readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
var SERVING_HEARTBEAT_REFRESH_MS = 4 * PERMISSION_FORWARDING_POLL_INTERVAL_MS;
var SERVING_HEARTBEAT_STALE_MS = 5 * SERVING_HEARTBEAT_REFRESH_MS;
var ForwardingLivenessJudge = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  isServing(target) {
    switch (target.source) {
      case "registry":
        return this.deps.registry.isServing(target.sessionId);
      case "env":
        return this.deps.heartbeats.read(target.sessionId) === "alive";
      case "self":
        return null;
    }
  }
  describe(target) {
    switch (target.source) {
      case "registry":
        return {
          channel: "registry",
          state: null,
          servingIds: this.deps.registry.servingIds()
        };
      case "env":
        return {
          channel: "heartbeat",
          state: this.deps.heartbeats.read(target.sessionId),
          servingIds: this.deps.heartbeats.servingIds()
        };
      case "self":
        return { channel: "none", state: null, servingIds: [] };
    }
  }
};
var SERVING_HEARTBEAT_DIRECTORY_NAME = "serving";
function servingHeartbeatDir(forwardingDir) {
  return join4(forwardingDir, SERVING_HEARTBEAT_DIRECTORY_NAME);
}
function servingHeartbeatPath(forwardingDir, sessionId) {
  return join4(
    servingHeartbeatDir(forwardingDir),
    `${encodeSessionIdForPath(sessionId)}.json`
  );
}
var ServingHeartbeatStore = class {
  forwardingDir;
  logger;
  now;
  pid;
  isProcessAlive;
  published = null;
  hasSweptDeadRecords = false;
  constructor(deps) {
    this.forwardingDir = deps.forwardingDir;
    this.logger = deps.logger;
    this.now = deps.now ?? Date.now;
    this.pid = deps.pid ?? process.pid;
    this.isProcessAlive = deps.isProcessAlive ?? isRunningProcess;
  }
  /** Publish (or refresh) `sessionId`'s heartbeat. Throttled; never throws. */
  markServing(sessionId) {
    const at = this.now();
    if (this.isThrottled(sessionId, at)) {
      return;
    }
    const directory = servingHeartbeatDir(this.forwardingDir);
    if (!ensureDirectoryExists(
      this.logger,
      directory,
      "permission forwarding serving heartbeat"
    )) {
      return;
    }
    this.sweepDeadRecordsOnce();
    const heartbeat = {
      sessionId,
      pid: this.pid,
      updatedAt: at
    };
    try {
      writeJsonFileAtomic(
        this.logger,
        servingHeartbeatPath(this.forwardingDir, sessionId),
        heartbeat
      );
    } catch (error) {
      logPermissionForwardingError(
        this.logger,
        `Failed to publish the serving heartbeat for session '${sessionId}'`,
        error
      );
      return;
    }
    this.published = { sessionId, at };
  }
  /** Withdraw `sessionId`'s heartbeat, leaving the directory for its siblings. */
  clearServing(sessionId) {
    if (this.published?.sessionId === sessionId) {
      this.published = null;
    }
    safeDeleteFile(
      this.logger,
      servingHeartbeatPath(this.forwardingDir, sessionId),
      "permission forwarding serving heartbeat"
    );
  }
  /** How `sessionId`'s heartbeat reads right now. */
  read(sessionId) {
    const record = this.readRecord(
      servingHeartbeatPath(this.forwardingDir, sessionId)
    );
    return record === null ? "absent" : this.classify(record);
  }
  /** Every session whose record reads as alive. */
  servingIds() {
    const ids = [];
    for (const { record } of this.listRecords()) {
      if (record !== null && this.classify(record) === "alive") {
        ids.push(record.sessionId);
      }
    }
    return ids;
  }
  // ── Private methods ────────────────────────────────────────────────
  /**
   * Delete the records of processes that are provably gone, once per session.
   *
   * Without this the directory grows one record per session that was killed
   * rather than shut down, forever. Bounded to a single directory read at the
   * first announcement, and safe under pid reuse: a wrongly swept owner
   * republishes within the refresh window, which is shorter than the grace a
   * forwarding child waits out.
   *
   * Only a dead pid is proof. A record that is merely stale belongs to a
   * process that still exists, and the reader already reports it as stale
   * without anyone having to remove it.
   */
  sweepDeadRecordsOnce() {
    if (this.hasSweptDeadRecords) {
      return;
    }
    this.hasSweptDeadRecords = true;
    for (const { path, record } of this.listRecords()) {
      if (record !== null && this.isProcessAlive(record.pid)) {
        continue;
      }
      safeDeleteFile(
        this.logger,
        path,
        "abandoned permission forwarding serving heartbeat"
      );
    }
  }
  /** Every published record, paired with its path; unusable ones read as `null`. */
  listRecords() {
    const directory = servingHeartbeatDir(this.forwardingDir);
    let names;
    try {
      names = readdirSync2(directory);
    } catch {
      return [];
    }
    return names.filter((name) => name.endsWith(".json")).map((name) => {
      const path = join4(directory, name);
      return { path, record: this.readRecord(path) };
    });
  }
  /**
   * Read a record, or `null` when it is missing or unusable.
   *
   * Silent by design: a forwarding child calls this on every poll tick, so a
   * warning per unreadable read would flood the review log at four lines a
   * second. The unusability is already reported once, as the `absent` state on
   * the abandonment entry.
   */
  readRecord(path) {
    try {
      return asServingHeartbeat(JSON.parse(readFileSync2(path, "utf-8")));
    } catch {
      return null;
    }
  }
  /** Which of the four states a well-formed record is in. */
  classify(record) {
    if (!this.isProcessAlive(record.pid)) {
      return "dead_pid";
    }
    return this.now() - record.updatedAt >= SERVING_HEARTBEAT_STALE_MS ? "stale" : "alive";
  }
  /**
   * Whether the record on disk is recent enough to leave alone.
   *
   * Time alone, with no existence probe: an existence check would cost a
   * syscall on every poll tick to save at most one refresh window, and a record
   * removed underneath its owner reappears inside the grace window anyway.
   */
  isThrottled(sessionId, at) {
    return this.published !== null && this.published.sessionId === sessionId && at - this.published.at < SERVING_HEARTBEAT_REFRESH_MS;
  }
};
function asServingHeartbeat(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value;
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.length === 0 || typeof candidate.pid !== "number" || !Number.isInteger(candidate.pid) || candidate.pid <= 0 || typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt)) {
    return null;
  }
  return {
    sessionId: candidate.sessionId,
    pid: candidate.pid,
    updatedAt: candidate.updatedAt
  };
}
function isRunningProcess(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrnoCode(error, "EPERM");
  }
}

// src/authority/forwarding-manager.ts
var ForwardingManager = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  timer = null;
  context = null;
  processing = false;
  servingSessionId = null;
  /**
   * Start polling if `ctx` has UI and is not a subagent execution context.
   * No-op (timer stays running) if already polling — updates the stored
   * context so the next tick uses the latest session.
   * Stops any existing poll when the context does not qualify for forwarding.
   */
  start(ctx) {
    if (!ctx.hasUI || this.deps.detection.isSubagent(ctx)) {
      this.stop();
      return;
    }
    this.context = ctx;
    this.announceServing(getSessionId(ctx));
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.refreshServing();
      if (!this.context || this.processing) {
        return;
      }
      this.processing = true;
      void this.deps.forwarder.processInbox(this.context).finally(() => {
        this.processing = false;
      });
    }, PERMISSION_FORWARDING_POLL_INTERVAL_MS);
  }
  /** Stop polling and clear all internal state. */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.withdrawServing();
    this.context = null;
    this.processing = false;
  }
  // ── Private methods ────────────────────────────────────────────────
  /**
   * Publish `sessionId` as the served session, replacing any previous one.
   *
   * A no-op when the id is unchanged, since `start` runs on every
   * `before_agent_start`, `input`, and `tool_call` — the announcement must not
   * cost a log line per turn.
   */
  announceServing(sessionId) {
    if (this.servingSessionId === sessionId) {
      return;
    }
    this.withdrawServing();
    this.servingSessionId = sessionId;
    this.deps.serving.markServing(sessionId);
    this.deps.logger.review("forwarded_permission.serving_started", {
      sessionId
    });
  }
  /**
   * Re-announce the served session, keeping a decayable channel current.
   *
   * Separate from {@link announceServing} because that one detects a change to
   * write its log line, and this one deliberately writes none — four review
   * entries a second would drown the log the announcement exists to make
   * readable.
   */
  refreshServing() {
    if (this.servingSessionId === null) {
      return;
    }
    this.deps.serving.markServing(this.servingSessionId);
  }
  /** Withdraw the published session, if any. */
  withdrawServing() {
    const sessionId = this.servingSessionId;
    if (sessionId === null) {
      return;
    }
    this.servingSessionId = null;
    this.deps.serving.clearServing(sessionId);
    this.deps.logger.review("forwarded_permission.serving_stopped", {
      sessionId
    });
  }
};

// src/authority/permission-prompt-component.ts
import { Input, matchesKey } from "@earendil-works/pi-tui";

// src/authority/bracketed-paste.ts
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var NEWLINE_RUN = /[\r\n]+/g;
function collapsePastedNewlines(data) {
  const start = data.indexOf(PASTE_START);
  if (start === -1) {
    return data;
  }
  const contentStart = start + PASTE_START.length;
  const contentEnd = data.indexOf(PASTE_END, contentStart);
  if (contentEnd === -1) {
    return data;
  }
  const content = data.slice(contentStart, contentEnd).replace(NEWLINE_RUN, " ");
  return data.slice(0, contentStart) + content + data.slice(contentEnd);
}

// src/authority/permission-prompt-decision.ts
var OPTION_ORDER = ["y", "s", "n", "r"];
var OPTION_VERBS = {
  y: "approve",
  s: "approve for this session",
  n: "deny",
  r: "deny with a reason"
};
function initialPromptState(_config) {
  return {
    step: "decision",
    highlightedKey: "y",
    armedKey: void 0,
    hint: "",
    reasonError: void 0,
    scopeServing: false
  };
}
function reducePrompt(config, state, event) {
  switch (state.step) {
    case "decision":
      return reduceDecisionStep(config, state, event);
    case "reason":
      return reduceReasonStep(state, event);
    case "scope":
      return reduceScopeStep(state, event);
  }
}
function reduceDecisionStep(config, state, event) {
  switch (event.type) {
    case "nav":
      return render({
        ...state,
        highlightedKey: shiftKey(state.highlightedKey, event.direction),
        armedKey: void 0,
        hint: ""
      });
    case "hotkey":
      return pressHotkey(config, state, event.key);
    case "confirm":
      return commit(config, state, state.highlightedKey);
    case "cancel":
      return { kind: "decision", decision: createDeniedPermissionDecision() };
    case "submitReason":
      return render(state);
  }
}
function pressHotkey(config, state, key) {
  if (!config.doublePressToConfirm || state.armedKey === key) {
    return commit(config, state, key);
  }
  return render({
    ...state,
    highlightedKey: key,
    armedKey: key,
    hint: `Press ${key} again to ${OPTION_VERBS[key]}.`
  });
}
function commit(config, state, key) {
  switch (key) {
    case "y":
      return {
        kind: "decision",
        decision: { approved: true, state: "approved" }
      };
    case "n":
      return { kind: "decision", decision: createDeniedPermissionDecision() };
    case "r":
      return render({
        ...state,
        step: "reason",
        highlightedKey: "r",
        armedKey: void 0,
        hint: "",
        reasonError: void 0
      });
    case "s":
      if (config.sessionScope) {
        return render({
          ...state,
          step: "scope",
          highlightedKey: "s",
          armedKey: void 0,
          hint: "",
          scopeServing: false
        });
      }
      return {
        kind: "decision",
        decision: { approved: true, state: "approved_for_session" }
      };
  }
}
function reduceReasonStep(state, event) {
  if (event.type === "cancel") {
    return render({
      ...state,
      step: "decision",
      armedKey: void 0,
      hint: "",
      reasonError: void 0
    });
  }
  if (event.type === "submitReason") {
    const reason = normalizePermissionDenialReason(event.draft);
    if (reason === void 0) {
      return render({
        ...state,
        reasonError: "A reason is required."
      });
    }
    return {
      kind: "decision",
      decision: createDeniedPermissionDecision(reason)
    };
  }
  return render(state);
}
function reduceScopeStep(state, event) {
  switch (event.type) {
    case "nav":
      return render({ ...state, scopeServing: event.direction === "down" });
    case "confirm":
      return {
        kind: "decision",
        decision: {
          approved: true,
          state: state.scopeServing ? "approved_for_serving_session" : "approved_for_session"
        }
      };
    case "cancel":
      return render({
        ...state,
        step: "decision",
        armedKey: void 0,
        hint: ""
      });
    default:
      return render(state);
  }
}
function shiftKey(current, direction) {
  const index = OPTION_ORDER.indexOf(current);
  const delta = direction === "down" ? 1 : -1;
  const next = (index + delta + OPTION_ORDER.length) % OPTION_ORDER.length;
  return OPTION_ORDER[next] ?? current;
}
function render(state) {
  return { kind: "render", state };
}

// src/presentation/fact-vocabulary.ts
function flaggedElements(payload) {
  if (payload.kind === "bash_external_directory") {
    return allEvidence(payload, "external path").map((entry) => entry.text);
  }
  return payload.request.value === "" ? [] : [payload.request.value];
}
function flaggedElementLabel(payload) {
  return payload.kind === "bash_external_directory" ? "path" : valueLabel(payload);
}
function valueLabel(payload) {
  switch (payload.kind) {
    case "bash":
    case "bash_external_directory":
      return "command";
    case "mcp":
      return "target";
    case "tool":
      return "tool";
    case "path":
    case "external_directory":
      return "path";
    case "skill":
    case "skill_read":
      return "skill";
    case "forwarded":
      return forwardedValueLabel(payload.request.surface);
  }
}
function forwardedValueLabel(surface) {
  switch (surface) {
    case "bash":
      return "command";
    case "skill":
      return "skill";
    default:
      return "value";
  }
}
function describeBashCommandContext(context) {
  switch (context) {
    case "command_substitution":
      return "command substitution";
    case "process_substitution":
      return "process substitution";
    case "subshell":
      return "subshell";
    case null:
      return void 0;
  }
}

// src/presentation/line-fitting.ts
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
function fitLinesToWidth(lines, width) {
  if (width <= 0) {
    return [];
  }
  return lines.flatMap(
    (line) => wrapTextWithAnsi(line, width).map(
      (wrapped) => truncateToWidth(wrapped, width)
    )
  );
}

// src/presentation/dialog-renderer.ts
function renderPromptDialog(payload, budget, paint = plainText) {
  const core = coreFacts(payload).map(
    (fact) => capField(fact, budget.fieldMaxWidth)
  );
  const evidence = evidenceFacts(payload).map(
    (fact) => capField(fact, budget.fieldMaxWidth)
  );
  const blocks = layout(
    [...core, ...evidence],
    flaggedElements(payload),
    paint
  ).map((block) => fitLinesToWidth(block, budget.width));
  const fitted = fitToRows(
    blocks.slice(0, core.length).flat(),
    blocks.slice(core.length),
    budget.maxRows
  );
  return {
    lines: fitted.lines,
    elided: fitted.dropped || [...core, ...evidence].some((fact) => fact.clipped)
  };
}
var DEFAULT_RENDER_BUDGET = {
  maxRows: 24,
  fieldMaxWidth: 400
};
function resolveRenderBudget(config) {
  return {
    maxRows: config.promptMaxRows ?? DEFAULT_RENDER_BUDGET.maxRows,
    fieldMaxWidth: config.promptFieldMaxWidth ?? DEFAULT_RENDER_BUDGET.fieldMaxWidth
  };
}
function completeViewBudget(width) {
  return {
    maxRows: Number.POSITIVE_INFINITY,
    fieldMaxWidth: Number.POSITIVE_INFINITY,
    width
  };
}
var plainText = (text) => text;
function capField(fact, fieldMaxWidth) {
  if (fact.text.length <= fieldMaxWidth) {
    return { ...fact, clipped: false };
  }
  return {
    ...fact,
    text: `${fact.text.slice(0, fieldMaxWidth)}\u2026`,
    clipped: true
  };
}
function fitToRows(core, evidence, maxRows) {
  const total = evidence.reduce((rows, block) => rows + block.length, 0);
  if (core.length + total <= maxRows) {
    return { lines: [...core, ...evidence.flat()], dropped: false };
  }
  const limit = maxRows - ELISION_MARKER_ROWS;
  const lines = [...core];
  for (const block of evidence) {
    if (lines.length + block.length > limit) {
      break;
    }
    lines.push(...block);
  }
  if (lines.length < maxRows) {
    lines.push(ELISION_MARKER);
  }
  return { lines, dropped: true };
}
var ELISION_MARKER = "\u2026";
var ELISION_MARKER_ROWS = 1;
function coreFacts(payload) {
  const { request } = payload;
  const facts = [];
  const requester = requesterFact(payload);
  if (requester) {
    facts.push(requester);
  }
  if (request.toolName !== null) {
    facts.push({ label: "tool", text: toolText(payload) });
  }
  const label = valueLabel(payload);
  if (request.surface !== request.toolName && request.surface !== label) {
    facts.push({ label: "surface", text: request.surface });
  }
  if (request.matchedPattern !== null) {
    facts.push({ label: "rule", text: request.matchedPattern });
  }
  if (request.value !== "" && request.value !== request.toolName) {
    facts.push({ label, text: request.value });
  }
  if (request.executedUnit !== null) {
    facts.push({ label: "runs", text: request.executedUnit });
  }
  const context = describeBashCommandContext(request.commandContext);
  if (context !== void 0) {
    facts.push({ label: "context", text: context });
  }
  return facts;
}
function evidenceFacts(payload) {
  return payload.evidence.map((entry) => ({
    label: entry.label,
    text: entry.detail === null ? entry.text : `${entry.text} \u2192 ${entry.detail}`
  }));
}
function requesterFact(payload) {
  const { agentName, forwarded, sessionId } = payload.request.requester;
  if (!forwarded) {
    return agentName ? { label: "agent", text: agentName } : void 0;
  }
  const name = agentName || "unknown";
  return {
    label: "subagent",
    text: sessionId ? `${name} \xB7 session ${sessionId}` : name
  };
}
function toolText(payload) {
  const { toolName, invokedToolName } = payload.request;
  return invokedToolName === null ? String(toolName) : `${String(toolName)} (invoked as ${invokedToolName})`;
}
function layout(facts, flagged, paint) {
  const width = Math.max(0, ...facts.map((fact) => fact.label.length));
  const indent = " ".repeat(width + 3);
  return facts.map((fact) => {
    const highlight = flagged.includes(fact.text) ? paint : (line) => paintTokens(line, flagged, paint);
    return fact.text.split("\n").map(
      (line, index) => index === 0 ? `${fact.label.padEnd(width)} : ${highlight(line)}` : indent + highlight(line)
    );
  });
}
var TOKEN_CHARACTER = /[\w/.-]/;
function paintTokens(line, flagged, paint) {
  return flagged.reduce(
    (painted, needle) => paintOccurrences(painted, needle, paint),
    line
  );
}
function paintOccurrences(line, needle, paint) {
  if (needle === "" || needle.includes("\n")) {
    return line;
  }
  let result = "";
  let cursor = 0;
  for (let at = line.indexOf(needle, cursor); at !== -1; at = line.indexOf(needle, cursor)) {
    const end = at + needle.length;
    const whole = !TOKEN_CHARACTER.test(line[at - 1] ?? " ") && !TOKEN_CHARACTER.test(line[end] ?? " ");
    result += line.slice(cursor, at) + (whole ? paint(needle) : needle);
    cursor = end;
  }
  return result + line.slice(cursor);
}

// src/authority/permission-prompt-component.ts
async function requestPermissionDecision(view, title, payload, options) {
  if (view.mode === "tui") {
    return attributeToHuman(
      await presentInlinePermissionPrompt(view, title, payload, options),
      "dialog"
    );
  }
  const rendered = renderPromptDialog(payload, {
    ...view.budget,
    width: FALLBACK_RENDER_WIDTH
  });
  return attributeToHuman(
    await requestPermissionDecisionFromUi(
      view.ui,
      title,
      rendered.lines.join("\n"),
      options
    ),
    "select"
  );
}
function attributeToHuman(decision, via) {
  const decidedBy = { kind: "user", via };
  return { ...decision, decidedBy };
}
var FALLBACK_RENDER_WIDTH = 80;
var DEFAULT_SESSION_LABEL = "Yes, for this session";
var OPTION_LABELS = {
  y: "Yes",
  s: DEFAULT_SESSION_LABEL,
  n: "No",
  r: "No, provide reason"
};
var OPTION_ORDER2 = ["y", "s", "n", "r"];
function presentInlinePermissionPrompt(view, title, payload, options) {
  const config = {
    doublePressToConfirm: view.doublePressToConfirm,
    sessionLabel: options?.sessionLabel ?? DEFAULT_SESSION_LABEL,
    sessionScope: options?.sessionScope
  };
  return view.ui.custom(
    (tui, theme, keybindings, done) => new PermissionPromptComponent(
      theme,
      config,
      title,
      payload,
      view.budget,
      (data) => handleToolsExpandAction(data, keybindings, view.ui),
      () => {
        tui.requestRender();
      },
      done
    ),
    { overlay: false }
  );
}
function handleToolsExpandAction(data, keybindings, ui) {
  if (!keybindings.matches(data, "app.tools.expand")) {
    return false;
  }
  ui.setToolsExpanded(!ui.getToolsExpanded());
  return true;
}
var PermissionPromptComponent = class {
  constructor(theme, config, title, payload, budget, handleAppAction, requestRender, done) {
    this.theme = theme;
    this.config = config;
    this.title = title;
    this.payload = payload;
    this.budget = budget;
    this.handleAppAction = handleAppAction;
    this.requestRender = requestRender;
    this.done = done;
    this.state = initialPromptState(config);
    this.reason = this.createReasonEditor();
  }
  theme;
  config;
  title;
  payload;
  budget;
  handleAppAction;
  requestRender;
  done;
  state;
  /** The denial-reason line editor, rebuilt each time the step is entered. */
  reason;
  /** Whether the operator asked to see the complete request (ADR 0011 §4). */
  expanded = false;
  /**
   * A fresh editor per visit to the reason step.
   *
   * The framework editor carries an undo stack and a kill ring, so reusing one
   * instance would let a reason the operator backed out of be restored into a
   * later ask.
   */
  createReasonEditor() {
    const editor = new Input();
    editor.focused = true;
    editor.onSubmit = (draft) => {
      this.apply({ type: "submitReason", draft });
    };
    editor.onEscape = () => {
      this.apply({ type: "cancel" });
    };
    return editor;
  }
  invalidate() {
  }
  render(width) {
    return fitLinesToWidth(this.renderStep(width), width);
  }
  renderStep(width) {
    switch (this.state.step) {
      case "decision":
        return this.renderDecision(width);
      case "reason":
        return this.renderReason(width);
      case "scope":
        return this.renderScope();
    }
  }
  /**
   * The ask itself, bounded to the budget at this frame's width.
   *
   * Rendered per frame rather than once, because the row budget is a function
   * of the width the host gives us, which a resize changes.
   */
  renderAsk(width) {
    return renderPromptDialog(
      this.payload,
      this.expanded ? completeViewBudget(width) : { ...this.budget, width },
      (text) => this.theme.fg("warning", text)
    );
  }
  /**
   * The key hints, naming the expansion only when it would do something.
   *
   * An affordance advertised when there is nothing to expand is noise; one
   * left unadvertised when the render dropped something is a decision made
   * without the evidence.
   */
  hint(view) {
    const keys = [
      "\u2191/\u2193 move",
      "enter confirm",
      "esc deny",
      "press a letter, then again to confirm"
    ];
    if (this.expanded) {
      keys.push("ctrl+o collapse");
    } else if (view.elided) {
      keys.push("ctrl+o full request");
    }
    return this.theme.fg("muted", keys.join(" \xB7 "));
  }
  handleInput(data) {
    if (this.state.step === "reason") {
      this.handleReasonInput(data);
      return;
    }
    if (this.handleAppAction(data)) {
      this.expanded = !this.expanded;
      this.requestRender();
      return;
    }
    const event = this.toEvent(data);
    if (event) {
      this.apply(event);
    }
  }
  /**
   * Hand the keystroke to the framework line editor.
   *
   * Delegating is what makes the field accept a paste: a paste arrives as one
   * multi-character chunk wrapped in bracketed-paste markers, which the editor
   * understands and a per-character reader cannot. Submit and cancel come back
   * through the editor's callbacks, so the decision model still owns them.
   */
  handleReasonInput(data) {
    this.reason.handleInput(collapsePastedNewlines(data));
    this.requestRender();
  }
  toEvent(data) {
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      return { type: "nav", direction: "up" };
    }
    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      return { type: "nav", direction: "down" };
    }
    if (matchesKey(data, "enter")) {
      return { type: "confirm" };
    }
    if (matchesKey(data, "escape")) {
      return { type: "cancel" };
    }
    if (this.state.step === "decision") {
      const key = OPTION_ORDER2.find((option) => matchesKey(data, option));
      if (key) {
        return { type: "hotkey", key };
      }
    }
    return void 0;
  }
  apply(event) {
    const outcome = reducePrompt(this.config, this.state, event);
    if (outcome.kind === "decision") {
      this.done(outcome.decision);
      return;
    }
    if (outcome.state.step === "reason" && this.state.step !== "reason") {
      this.reason = this.createReasonEditor();
    }
    this.state = outcome.state;
    this.requestRender();
  }
  renderDecision(width) {
    const ask = this.renderAsk(width);
    const lines = [this.theme.fg("accent", this.title), ...ask.lines, ""];
    for (const key of OPTION_ORDER2) {
      const label = key === "s" ? this.config.sessionLabel : OPTION_LABELS[key];
      const selected = this.state.highlightedKey === key;
      const marker = selected ? "\u25B6" : " ";
      const row = `${marker} (${key}) ${label}`;
      lines.push(selected ? this.theme.fg("accent", row) : row);
    }
    lines.push("");
    lines.push(this.state.hint || this.hint(ask));
    return lines;
  }
  renderReason(width) {
    const lines = [
      this.theme.fg("accent", this.title),
      ...this.renderAsk(width).lines,
      "",
      "Reason (required):",
      // Exactly one row, whatever its length: the editor scrolls horizontally.
      ...this.reason.render(width)
    ];
    if (this.state.reasonError) {
      lines.push(this.theme.fg("error", this.state.reasonError));
    }
    lines.push("");
    lines.push(this.theme.fg("muted", "enter submit \xB7 esc back"));
    return lines;
  }
  renderScope() {
    const scope = this.config.sessionScope;
    const subagentLabel = scope?.subagentLabel ?? "This subagent only";
    const servingLabel = scope?.servingSessionLabel ?? "The whole session";
    const rows = [
      { label: subagentLabel, serving: false },
      { label: servingLabel, serving: true }
    ];
    const lines = [
      this.theme.fg("accent", this.title),
      "Apply this session grant to:",
      ""
    ];
    for (const row of rows) {
      const selected = this.state.scopeServing === row.serving;
      const marker = selected ? "\u25B6" : " ";
      const text = `${marker} ${row.label}`;
      lines.push(selected ? this.theme.fg("accent", text) : text);
    }
    lines.push("");
    lines.push(this.theme.fg("muted", "\u2191/\u2193 move \xB7 enter confirm \xB7 esc back"));
    return lines;
  }
};

// src/presentation/review-log-renderer.ts
function renderReviewLogFacts(payload) {
  const { request } = payload;
  return {
    surface: request.surface,
    ...present("matchedPattern", request.matchedPattern),
    ...present("executedUnit", request.executedUnit),
    ...present("commandContext", request.commandContext),
    ...present("invokedToolName", request.invokedToolName),
    ...forwardingFacts(payload)
  };
}
function forwardingFacts(payload) {
  const { forwarded, sessionId } = payload.request.requester;
  return forwarded ? { forwarded: true, ...present("requesterSessionId", sessionId) } : {};
}
function present(key, value) {
  return value === null ? {} : { [key]: value };
}

// src/authority/permission-prompter.ts
var PermissionPrompter = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  async prompt(authorizer, details) {
    this.writeReviewEntry("permission_request.waiting", details);
    const decision = await authorizer.authorize(details);
    this.writeReviewEntry(
      decision.approved ? "permission_request.approved" : "permission_request.denied",
      {
        ...details,
        resolution: decision.confirmationUnavailable ? "confirmation_unavailable" : decision.state,
        denialReason: decision.denialReason,
        decidedBy: decision.decidedBy
      }
    );
    return decision;
  }
  // ── Private helpers ──────────────────────────────────────────────────────
  /**
   * The `waiting` entry carries no `decidedBy` — nothing has decided yet, and
   * a `null` there would read as "decided by nobody" rather than "not yet".
   */
  writeReviewEntry(event, details) {
    this.deps.logger.review(event, {
      ...details.decidedBy ? { decidedBy: details.decidedBy } : {},
      requestId: details.requestId,
      source: details.source,
      agentName: details.agentName,
      ...renderReviewLogFacts(details.payload),
      toolCallId: details.toolCallId ?? null,
      toolName: details.toolName ?? null,
      skillName: details.skillName ?? null,
      path: details.path ?? null,
      command: details.command ?? null,
      target: details.target ?? null,
      toolInputPreview: details.toolInputPreview ?? null,
      resolution: details.resolution ?? null,
      denialReason: details.denialReason ?? null
    });
  }
};

// src/authority/serving-registry.ts
var SERVING_SESSION_REGISTRY_KEY = /* @__PURE__ */ Symbol.for(
  "@gotgenes/pi-permission-system:serving-registry"
);
function composeServingAnnouncers(...announcers) {
  return {
    markServing(sessionId) {
      for (const announcer of announcers) {
        announcer.markServing(sessionId);
      }
    },
    clearServing(sessionId) {
      for (const announcer of announcers) {
        announcer.clearServing(sessionId);
      }
    }
  };
}
var ServingSessionRegistry = class {
  serving = /* @__PURE__ */ new Set();
  /** Record that `sessionId` is polling its inbox. Idempotent. */
  markServing(sessionId) {
    this.serving.add(sessionId);
  }
  /** Record that `sessionId` has stopped polling. No-op if unmarked. */
  clearServing(sessionId) {
    this.serving.delete(sessionId);
  }
  /** Return `true` when `sessionId` is currently polling its inbox. */
  isServing(sessionId) {
    return this.serving.has(sessionId);
  }
  /** Every currently-serving session id, for diagnostics. */
  servingIds() {
    return [...this.serving];
  }
};
function getServingSessionRegistry() {
  const store = globalThis;
  const existing = store[SERVING_SESSION_REGISTRY_KEY];
  if (existing) {
    return existing;
  }
  const registry = new ServingSessionRegistry();
  store[SERVING_SESSION_REGISTRY_KEY] = registry;
  return registry;
}

// src/authority/subagent-context.ts
function normalizeFilesystemPath(pathValue, flavor) {
  return flavor.fold(flavor.impl.normalize(pathValue));
}
function isRegisteredSubagentChild(ctx, registry) {
  try {
    const sessionId = ctx.sessionManager.getSessionId();
    if (!sessionId) {
      return false;
    }
    return registry.has(sessionId);
  } catch {
    return false;
  }
}
function isSubagentExecutionContext(ctx, subagentSessionsDir, flavor, registry) {
  if (registry && isRegisteredSubagentChild(ctx, registry)) {
    return true;
  }
  const sessionDir = ctx.sessionManager.getSessionDir();
  for (const key of SUBAGENT_ENV_HINT_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return true;
    }
  }
  if (!sessionDir) {
    return false;
  }
  const normalizedSessionDir = normalizeFilesystemPath(sessionDir, flavor);
  const normalizedSubagentRoot = normalizeFilesystemPath(
    subagentSessionsDir,
    flavor
  );
  return flavor.isWithin(normalizedSessionDir, normalizedSubagentRoot);
}

// src/authority/subagent-detection.ts
var SubagentDetection = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  isSubagent(ctx) {
    return isSubagentExecutionContext(
      ctx,
      this.deps.subagentSessionsDir,
      this.deps.flavor,
      this.deps.registry
    );
  }
  isRegisteredChild(ctx) {
    return this.deps.registry ? isRegisteredSubagentChild(ctx, this.deps.registry) : false;
  }
};

// src/authority/subagent-lifecycle-events.ts
var SUBAGENT_CHILD_SESSION_CREATED = "subagents:child:session-created";
var SUBAGENT_CHILD_DISPOSED = "subagents:child:disposed";
function subscribeSubagentLifecycle(events, registry) {
  const unsubCreated = events.on(SUBAGENT_CHILD_SESSION_CREATED, (data) => {
    const event = data;
    registry.register(event.sessionId, {
      parentSessionId: event.parentSessionId
    });
  });
  const unsubDisposed = events.on(SUBAGENT_CHILD_DISPOSED, (data) => {
    const event = data;
    registry.unregister(event.sessionId);
  });
  return () => {
    unsubCreated();
    unsubDisposed();
  };
}

// src/authority/subagent-registry.ts
var SUBAGENT_SESSION_REGISTRY_KEY = /* @__PURE__ */ Symbol.for(
  "@gotgenes/pi-permission-system:subagent-registry"
);
function getSubagentSessionRegistry() {
  const store = globalThis;
  const existing = store[SUBAGENT_SESSION_REGISTRY_KEY];
  if (existing) {
    return existing;
  }
  const registry = new SubagentSessionRegistry();
  store[SUBAGENT_SESSION_REGISTRY_KEY] = registry;
  return registry;
}
var SubagentSessionRegistry = class {
  sessions = /* @__PURE__ */ new Map();
  /**
   * Register an in-process subagent session.
   *
   * If a previous entry exists for `sessionId`, it is overwritten
   * (last-write-wins; single-writer expected per key).
   */
  register(sessionId, info) {
    this.sessions.set(sessionId, info);
  }
  /** Remove a previously registered session. No-op if the key is absent. */
  unregister(sessionId) {
    this.sessions.delete(sessionId);
  }
  /** Return the registered info for `sessionId`, or `undefined` if absent. */
  get(sessionId) {
    return this.sessions.get(sessionId);
  }
  /** Return `true` when `sessionId` has a registered entry. */
  has(sessionId) {
    return this.sessions.has(sessionId);
  }
};

// src/json-safe-stringify.ts
function createJsonSafeReplacer(transform) {
  const seen = /* @__PURE__ */ new WeakSet();
  return (key, rawValue) => {
    const value = transform ? transform(key, rawValue) : rawValue;
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}
function safeJsonStringify(value) {
  return JSON.stringify(value, createJsonSafeReplacer());
}

// src/log-redaction.ts
var REDACTED_PLACEHOLDER = "[redacted]";
var SENSITIVE_KEY_PATTERN = /authorization|api[-_]?key|secret|token|password|passwd|credential|cookie|private[-_]?key/i;
function isSensitiveLogKey(key) {
  return SENSITIVE_KEY_PATTERN.test(key);
}
function redactedJsonStringify(value) {
  return JSON.stringify(
    value,
    createJsonSafeReplacer(
      (key, currentValue) => currentValue != null && isSensitiveLogKey(key) ? REDACTED_PLACEHOLDER : currentValue
    )
  );
}

// src/tool-input-preview.ts
var TOOL_INPUT_PREVIEW_MAX_LENGTH = 200;
var TOOL_TEXT_SUMMARY_MAX_LENGTH = 80;
function truncateInlineText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\u2026` : value;
}
function countTextLines(value) {
  if (!value) {
    return 0;
  }
  return value.split(/\r\n|\r|\n/).length;
}
function formatCount(value, singular, plural) {
  return `${value} ${value === 1 ? singular : plural}`;
}
function serializeToolInputPreview(input) {
  return normalizeSerializedPreview(safeJsonStringify(input));
}
function serializeRedactedToolInputPreview(input) {
  return normalizeSerializedPreview(redactedJsonStringify(input));
}
function normalizeSerializedPreview(serialized) {
  if (!serialized || serialized === "{}" || serialized === "null") {
    return "";
  }
  return serialized.replace(/\s+/g, " ").trim();
}

// src/builtin-tool-input-formatters.ts
var MCP_ARGS_SUMMARY_MAX_LENGTH = 160;
var MCP_ARG_VALUE_MAX_LENGTH = 60;
function renderArgValue(value) {
  if (typeof value === "string") {
    return `"${truncateInlineText(value, MCP_ARG_VALUE_MAX_LENGTH)}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === "object" && value !== null) {
    return "{\u2026}";
  }
  return String(value);
}
var formatMcpInputForPrompt = (input) => {
  const args = toRecord(input.arguments);
  const entries = Object.entries(args);
  if (entries.length === 0) return void 0;
  const parts = entries.map(
    ([key, value]) => `${key}: ${renderArgValue(value)}`
  );
  const summary = truncateInlineText(
    parts.join(", "),
    MCP_ARGS_SUMMARY_MAX_LENGTH
  );
  return `with ${summary}`;
};
function registerBuiltinToolInputFormatters(registry) {
  registry.register("mcp", formatMcpInputForPrompt);
}

// src/config-modal.ts
import {
  getSettingsListTheme
} from "@earendil-works/pi-coding-agent";
import { SettingsList } from "@earendil-works/pi-tui";

// src/extension-config.ts
import { mkdirSync as mkdirSync2 } from "node:fs";
import { dirname, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";
var EXTENSION_ID = "pi-permission-system";
var DEFAULT_EXTENSION_CONFIG = {
  debugLog: false,
  permissionReviewLog: true,
  yoloMode: false,
  doublePressToConfirm: true
};
function resolveExtensionRoot(moduleUrl = import.meta.url) {
  return join5(dirname(fileURLToPath(moduleUrl)), "..");
}
var EXTENSION_ROOT = resolveExtensionRoot();
function normalizePermissionSystemConfig(raw) {
  const result = {
    debugLog: raw.debugLog === true,
    permissionReviewLog: raw.permissionReviewLog !== false,
    yoloMode: raw.yoloMode === true,
    doublePressToConfirm: raw.doublePressToConfirm !== false
  };
  if (raw.piInfrastructureReadPaths !== void 0) {
    result.piInfrastructureReadPaths = raw.piInfrastructureReadPaths;
  }
  if (raw.forwardingTimeoutMs !== void 0) {
    result.forwardingTimeoutMs = raw.forwardingTimeoutMs;
  }
  if (raw.promptMaxRows !== void 0) {
    result.promptMaxRows = raw.promptMaxRows;
  }
  if (raw.promptFieldMaxWidth !== void 0) {
    result.promptFieldMaxWidth = raw.promptFieldMaxWidth;
  }
  if (raw.reviewLogFieldMaxWidth !== void 0) {
    result.reviewLogFieldMaxWidth = raw.reviewLogFieldMaxWidth;
  }
  if (raw.shellTools !== void 0) {
    result.shellTools = raw.shellTools;
  }
  if (raw.authorizerChain !== void 0) {
    result.authorizerChain = raw.authorizerChain;
  }
  return result;
}
function isYoloModeEnabled(config) {
  return Boolean(config.yoloMode);
}
function ensurePermissionSystemLogsDirectory(logsDir) {
  try {
    mkdirSync2(logsDir, { recursive: true, mode: OWNER_ONLY_DIRECTORY_MODE });
    restrictExistingPathToOwner(logsDir, OWNER_ONLY_DIRECTORY_MODE);
    return void 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to create permission-system log directory '${logsDir}': ${message}`;
  }
}

// src/config-modal.ts
var ON_OFF = ["on", "off"];
var COMMAND_ARGUMENTS = [
  {
    value: "show",
    label: "Show active settings",
    description: "Display the current permission-system config summary"
  },
  {
    value: "path",
    label: "Show config path",
    description: "Display the config.json path used by pi-permission-system"
  },
  {
    value: "reset",
    label: "Reset defaults",
    description: "Restore default yolo/logging settings and persist them"
  },
  {
    value: "help",
    label: "Show help",
    description: "Display command usage"
  }
];
var USAGE_TEXT = "Usage: /permission-system [show|path|reset|help] (or run /permission-system with no args to open settings modal)";
function cloneDefaultConfig() {
  return {
    debugLog: DEFAULT_EXTENSION_CONFIG.debugLog,
    permissionReviewLog: DEFAULT_EXTENSION_CONFIG.permissionReviewLog,
    yoloMode: DEFAULT_EXTENSION_CONFIG.yoloMode,
    doublePressToConfirm: DEFAULT_EXTENSION_CONFIG.doublePressToConfirm
  };
}
function toOnOff(value) {
  return value ? "on" : "off";
}
function formatRulesSummary(rules) {
  const configRules = rules.filter((r) => r.layer === "config" && r.origin);
  if (configRules.length === 0) return "";
  const formatted = configRules.map((r) => {
    const key = r.pattern === "*" ? r.surface : `${r.surface}["${r.pattern}"]`;
    return `${key}=${r.action} (${r.origin})`;
  }).join(", ");
  return `
  rules: ${formatted}`;
}
function summarizeConfig(config, rules) {
  const knobs = [
    `yoloMode=${toOnOff(config.yoloMode)}`,
    `permissionReviewLog=${toOnOff(config.permissionReviewLog)}`,
    `debugLog=${toOnOff(config.debugLog)}`
  ].join(", ");
  const rulesSuffix = rules ? formatRulesSummary(rules) : "";
  return `${knobs}${rulesSuffix}`;
}
function buildSettingItems(config) {
  return [
    {
      id: "yoloMode",
      label: "YOLO mode",
      description: "Auto-approve ask-state permission checks, including subagent approval forwarding",
      currentValue: toOnOff(config.yoloMode),
      values: ON_OFF
    },
    {
      id: "permissionReviewLog",
      label: "Permission review log",
      description: "Write permission request and decision audit events to the extension logs directory",
      currentValue: toOnOff(config.permissionReviewLog),
      values: ON_OFF
    },
    {
      id: "debugLog",
      label: "Debug logging",
      description: "Write verbose permission-system diagnostics to the extension logs directory",
      currentValue: toOnOff(config.debugLog),
      values: ON_OFF
    },
    {
      id: "doublePressToConfirm",
      label: "Double-press to confirm",
      description: "Require a confirming second press of a decision hotkey in the inline TUI permission dialog",
      currentValue: toOnOff(config.doublePressToConfirm),
      values: ON_OFF
    }
  ];
}
function applySetting(config, id, value) {
  switch (id) {
    case "yoloMode":
      return { ...config, yoloMode: value === "on" };
    case "permissionReviewLog":
      return { ...config, permissionReviewLog: value === "on" };
    case "debugLog":
      return { ...config, debugLog: value === "on" };
    case "doublePressToConfirm":
      return { ...config, doublePressToConfirm: value === "on" };
    default:
      return config;
  }
}
function syncSettingValues(settingsList, config) {
  settingsList.updateValue("yoloMode", toOnOff(config.yoloMode));
  settingsList.updateValue(
    "permissionReviewLog",
    toOnOff(config.permissionReviewLog)
  );
  settingsList.updateValue("debugLog", toOnOff(config.debugLog));
  settingsList.updateValue(
    "doublePressToConfirm",
    toOnOff(config.doublePressToConfirm)
  );
}
function getArgumentCompletions(argumentPrefix) {
  const normalized = argumentPrefix.trim().toLowerCase();
  if (normalized.includes(" ")) {
    return null;
  }
  const filtered = COMMAND_ARGUMENTS.filter(
    (item) => item.value.startsWith(normalized)
  );
  return filtered.length > 0 ? [...filtered] : null;
}
async function openSettingsModal(ctx, controller) {
  const overlayOptions = {
    anchor: "center",
    width: 82,
    maxHeight: "85%",
    margin: 1
  };
  await ctx.ui.custom(
    (_tui, _theme, _keybindings, done) => {
      let current = controller.config.current();
      const settingsList = new SettingsList(
        buildSettingItems(current),
        10,
        getSettingsListTheme(),
        (id, newValue) => {
          current = applySetting(current, id, newValue);
          controller.config.save(current, ctx);
          current = controller.config.current();
          syncSettingValues(settingsList, current);
        },
        () => done()
      );
      return settingsList;
    },
    { overlay: true, overlayOptions }
  );
}
function handleArgs(args, ctx, controller) {
  const normalized = args.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "show") {
    const rules = controller.getActiveAgentConfigRules();
    ctx.ui.notify(
      `permission-system: ${summarizeConfig(controller.config.current(), rules)}`,
      "info"
    );
    return true;
  }
  if (normalized === "path") {
    ctx.ui.notify(`permission-system config: ${controller.configPath}`, "info");
    return true;
  }
  if (normalized === "reset") {
    controller.config.save(cloneDefaultConfig(), ctx);
    ctx.ui.notify("Permission system settings reset to defaults.", "info");
    return true;
  }
  if (normalized === "help") {
    ctx.ui.notify(USAGE_TEXT, "info");
    return true;
  }
  ctx.ui.notify(USAGE_TEXT, "warning");
  return true;
}
function registerPermissionSystemCommand(pi, controller) {
  pi.registerCommand("permission-system", {
    description: "Configure pi-permission-system logging and yolo-mode behavior",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      if (handleArgs(args, ctx, controller)) {
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify(
          "/permission-system requires interactive TUI mode.",
          "warning"
        );
        return;
      }
      await openSettingsModal(ctx, controller);
    }
  });
}

// src/config-paths.ts
import { join as join6 } from "node:path";
var EXTENSION_ID2 = "pi-permission-system";
var DEBUG_LOG_FILENAME = `${EXTENSION_ID2}-debug.jsonl`;
var REVIEW_LOG_FILENAME = `${EXTENSION_ID2}-permission-review.jsonl`;
function getGlobalConfigDir(agentDir) {
  return join6(agentDir, "extensions", EXTENSION_ID2);
}
function getGlobalConfigPath(agentDir) {
  return join6(getGlobalConfigDir(agentDir), "config.json");
}
function getGlobalLogsDir(agentDir) {
  return join6(getGlobalConfigDir(agentDir), "logs");
}
function getProjectConfigPath(cwd) {
  return join6(cwd, ".pi", "extensions", EXTENSION_ID2, "config.json");
}
function getProjectAgentsDir(cwd) {
  return join6(cwd, ".pi", "agents");
}
function getLegacyGlobalPolicyPath(agentDir) {
  return join6(agentDir, "pi-permissions.jsonc");
}
function getLegacyProjectPolicyPath(cwd) {
  return join6(cwd, ".pi", "agent", "pi-permissions.jsonc");
}
function getLegacyExtensionConfigPath(extensionRoot) {
  return join6(extensionRoot, "config.json");
}

// src/config-store.ts
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  renameSync as renameSync2,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import { dirname as dirname2, normalize as normalize2 } from "node:path";

// src/config-loader.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { normalize } from "node:path";

// src/config-schema.ts
import { z } from "zod";
var permissionStateSchema = z.union([
  z.literal("allow").meta({
    description: "Permit the action silently with no user interaction."
  }),
  z.literal("deny").meta({
    description: "Block the action with an error message. The agent is told not to retry."
  }),
  z.literal("ask").meta({
    description: "Prompt the user for confirmation via the interactive UI before proceeding."
  })
]).meta({
  id: "permissionState",
  description: "A permission decision: allow (permit silently), deny (block with error), or ask (prompt the user for confirmation)."
});
var denyWithReasonSchema = z.strictObject({
  action: z.literal("deny").meta({
    description: 'The permission decision \u2014 must be "deny".'
  }),
  reason: z.string().max(500).optional().meta({
    description: "Optional reason shown to the agent when this action is denied."
  })
}).meta({
  id: "denyWithReason",
  description: "Deny with an optional custom reason shown to the agent when the action is blocked."
});
var patternValueSchema = z.union([
  permissionStateSchema,
  denyWithReasonSchema
]);
var permissionMapSchema = z.record(
  z.string().min(1).meta({
    description: "A non-empty pattern string. Use * for wildcard matching. Prefix with ~/ or $HOME/ for home-relative paths."
  }),
  patternValueSchema
).meta({
  id: "permissionMap",
  description: "A map of wildcard patterns to permission states. Last matching pattern wins.",
  markdownDescription: "A map of wildcard patterns to permission states.\n\nUse `*` for wildcard matching. When multiple patterns match, the **last matching rule wins** \u2014 put broad catch-alls first and specific overrides after them.\n\nPattern keys support home directory expansion:\n- `~/path` or `$HOME/path` \u2014 expanded to the OS home directory at match time.\n- `~` or `$HOME` alone \u2014 expands to the home directory itself.\n\nThe stored pattern is always shown in logs and approval dialogs as written (e.g. `~/dev/*`)."
});
var permissionSchema = z.record(
  z.string().min(1).meta({
    description: "A surface name or the universal fallback key '*'."
  }),
  z.union([permissionStateSchema, permissionMapSchema])
).meta({
  description: "Flat permission policy. Each key is a surface name; values are a PermissionState string (catch-all) or a pattern\u2192action map.",
  markdownDescription: 'Flat permission policy.\n\nEach top-level key is a surface name:\n- `"*"` \u2014 universal fallback (replaces `defaultPolicy.tools` from the legacy format)\n- Tool names (`read`, `write`, `bash`, `mcp`, `skill`, `external_directory`, `path`, etc.)\n\nA **string** value is shorthand for `{ "*": action }` (surface-level catch-all).\nAn **object** value maps wildcard patterns to actions \u2014 last matching pattern wins.\n\nFor built-in file tools (`read`, `write`, `edit`, `find`, `grep`, `ls`), patterns are matched against the file path from `input.path`. For example, `"read": { "*": "allow", "*.env": "deny" }` allows reads but denies `.env` files.\n\nWhen Pi\'s current working directory is known, relative path inputs also match their cwd-normalized absolute form, so `src/App.jsx` can match both `src/*` and `/workspace/project/*`. Bash path tokens use the effective directory after literal `cd` commands for this matching; non-literal `cd "$DIR"` style commands remain conservative.\n\nThe `path` surface is a cross-cutting gate that applies to **all** file access: Pi tools, bash commands, MCP calls (via `input.arguments.path`), and extension tools (via `input.path` or a registered access extractor). A `path` deny cannot be overridden by a per-tool allow. Use it to protect sensitive files (`.env`, `~/.ssh/*`) from all path-aware tools at once.\n\nThe `external_directory` surface gates access **outside** the working directory. Give it a pattern map to allow specific outside-CWD directories without opening all external access \u2014 e.g. `"external_directory": { "*": "ask", "~/.cargo/registry/*": "allow" }` to silence repeated prompts on a local cache. The trailing `*` is greedy and crosses subdirectory boundaries; a bare `~/.cargo/registry` matches only the directory entry itself. Because layers compose with most-restrictive-wins, a `path` allow cannot loosen an `external_directory: ask` boundary \u2014 allow outside-CWD directories here, not on `path`.\n\n**Merge order (lowest \u2192 highest precedence):** global \u2192 project \u2192 per-agent frontmatter.',
  examples: [
    {
      "*": "ask",
      path: {
        "*": "allow",
        "*.env": "deny",
        "*.env.*": "deny",
        "*.env.example": "allow"
      },
      read: "allow",
      write: "deny",
      edit: "deny",
      bash: {
        "*": "ask",
        "git *": "ask",
        "git status": "allow",
        "git diff": "allow"
      },
      mcp: { "*": "ask", mcp_status: "allow", "exa:*": "allow" },
      skill: { "*": "ask", librarian: "allow" },
      external_directory: { "*": "ask", "~/.cargo/registry/*": "allow" }
    }
  ]
});
var shellToolAliasSchema = z.strictObject({
  commandArgument: z.string().min(1).meta({
    description: "The name of the tool's input argument holding the shell command string (e.g. 'cmd')."
  }),
  workdirArgument: z.string().min(1).optional().meta({
    description: "Optional name of the tool's input argument holding the working directory (e.g. 'workdir')."
  })
}).meta({
  description: "Maps one shell-aliased tool to the input arguments holding its command and (optionally) its working directory."
});
var shellToolsSchema = z.record(
  z.string().min(1).meta({
    description: "A non-bash tool name that carries shell semantics."
  }),
  shellToolAliasSchema
).meta({
  description: "Maps non-bash tool names that carry shell semantics to the input arguments holding their command and working directory.",
  markdownDescription: 'Records which non-`bash` tools carry shell semantics, mapping each tool name to the input argument holding its command (and optionally its working directory).\n\nUse this when an extension replaces the native `bash` tool under a different name \u2014 e.g. `@howaboua/pi-codex-conversion` registers `exec_command` with a `cmd` argument and an optional `workdir`. Recording the alias lets the permission system gate that tool through the same bash enforcement stack as native `bash` (command decomposition, wrapper flooring, path/external-directory token gates, and `bash:` rules).\n\nExample:\n\n```json\n"shellTools": {\n  "exec_command": { "commandArgument": "cmd", "workdirArgument": "workdir" }\n}\n```\n\n**Merge order:** shallow-merge by tool name across global \u2192 project. A project entry overrides a specific tool\'s mapping on key collision but never drops a global entry.',
  examples: [
    {
      exec_command: { commandArgument: "cmd", workdirArgument: "workdir" }
    }
  ]
});
var unifiedConfigSchema = z.strictObject({
  $schema: z.string().optional().meta({
    description: "JSON Schema URI for editor autocomplete and validation."
  }),
  debugLog: z.boolean().optional().meta({
    description: "Write verbose permission-system diagnostics to the extension logs directory.",
    markdownDescription: "Write verbose permission-system diagnostics to `logs/pi-permission-system-debug.jsonl` under the extension config directory.",
    default: false
  }),
  permissionReviewLog: z.boolean().optional().meta({
    description: "Write permission request and decision audit events to the extension logs directory.",
    markdownDescription: "Write permission request and decision audit events to `logs/pi-permission-system-permission-review.jsonl` under the extension config directory.",
    default: true
  }),
  yoloMode: z.boolean().optional().meta({
    description: "Auto-approve ask-state permission checks, including subagent approval forwarding.",
    markdownDescription: "Auto-approve `ask`-state permission checks, including subagent approval forwarding.\n\n\u26A0\uFE0F **Use with caution** \u2014 this disables all interactive confirmation prompts.",
    default: false
  }),
  doublePressToConfirm: z.boolean().optional().meta({
    description: "Require a confirming second press of a decision hotkey in the inline permission dialog. Applies to TUI sessions only.",
    markdownDescription: "Require a confirming second press of a decision hotkey (`y`/`s`/`n`/`r`) in the inline permission dialog before it commits \u2014 the first press arms the action and shows a `Press y again to approve.` hint.\n\nApplies to interactive **TUI** sessions only; the non-TUI (RPC/frontend) prompt keeps its single-select flow. Set to `false` to commit decisions on the first hotkey press.",
    default: true
  }),
  forwardingTimeoutMs: z.number().int().min(1).optional().meta({
    description: "How long a subagent waits for the parent session to answer a forwarded permission request, in milliseconds. Omit to use the default (600000, ten minutes).",
    markdownDescription: "How long a subagent waits for the parent session to answer a forwarded permission request, in milliseconds.\n\nOmit to use the default (`600000`, ten minutes). A child whose in-process parent is not draining its inbox at all gives up in a couple of seconds regardless of this value, so lower it only to bound how long you are willing to leave an *unanswered* prompt pending.",
    default: 6e5
  }),
  promptMaxRows: z.number().int().min(1).optional().meta({
    description: "Maximum rows a permission prompt renders before eliding its evidence. Omit to use the default (24).",
    markdownDescription: "Maximum rows a permission prompt renders before eliding its evidence.\n\nOmit to use the default (24). The request's own facts \u2014 the requesting agent, the tool, the matched rule, the decision-relevant value \u2014 are never elided by this budget; what gives way is the supporting evidence, and `Ctrl+O` expands the prompt to the complete request.",
    default: 24
  }),
  promptFieldMaxWidth: z.number().int().min(1).optional().meta({
    description: "Maximum characters of any one field shown in a permission prompt. Omit to use the default (400).",
    markdownDescription: "Maximum characters of any one field shown in a permission prompt.\n\nOmit to use the default (400). This is what bounds a single pathological field \u2014 a long here-string command, say \u2014 that would otherwise fill the prompt through wrapping. A shortened field is marked with an ellipsis, and `Ctrl+O` shows it in full.",
    default: 400
  }),
  reviewLogFieldMaxWidth: z.number().int().min(1).optional().meta({
    description: "Maximum characters of any one value written to the permission review log. Omit to use the default (1000).",
    markdownDescription: "Maximum characters of any one value written to the permission review log.\n\nOmit to use the default (1000). Every string the review log writes is narrowed to this width and marked with an ellipsis, so the log's growth is a decision you make rather than a side effect of how long a command happened to be. Raise it to keep longer values \u2014 a bash command exceeding the width is stored shortened.\n\nThis is a length bound, not redaction: it never inspects a value to decide what to hide. Key-name masking is unchanged and applies independently.",
    default: 1e3
  }),
  toolInputPreviewMaxLength: z.number().int().min(1).optional().meta({
    deprecated: true,
    description: "Deprecated and ignored. Superseded by promptMaxRows and promptFieldMaxWidth, which bound the whole prompt rather than one preview. Still accepted so an existing config is not rejected; remove it.",
    markdownDescription: "**Deprecated and ignored.** Superseded by `promptMaxRows` and `promptFieldMaxWidth`, which bound the whole permission prompt rather than one preview inside it.\n\nStill accepted so an existing config is not rejected fail-closed, but the value no longer takes effect. Remove it."
  }),
  toolTextSummaryMaxLength: z.number().int().min(1).optional().meta({
    deprecated: true,
    description: "Deprecated and ignored. Superseded by promptMaxRows and promptFieldMaxWidth, which bound the whole prompt rather than one summary. Still accepted so an existing config is not rejected; remove it.",
    markdownDescription: "**Deprecated and ignored.** Superseded by `promptMaxRows` and `promptFieldMaxWidth`, which bound the whole permission prompt rather than one summary inside it.\n\nStill accepted so an existing config is not rejected fail-closed, but the value no longer takes effect. Remove it."
  }),
  piInfrastructureReadPaths: z.array(z.string().min(1)).optional().meta({
    description: "Additional directories to auto-allow for reads as Pi infrastructure, bypassing the external_directory gate. Supports ~ expansion and wildcard patterns (* and ?).",
    markdownDescription: "Additional directories to auto-allow for reads as Pi infrastructure, bypassing the `external_directory` gate.\n\nThe extension auto-discovers the global node_modules root (walks up from the extension's install path; falls back to `npm root -g` from a dev checkout), Pi's own install directory (via the coding-agent `getPackageDir()` API), `agentDir`, `agentDir/git`, and project-local `.pi/npm/` and `.pi/git/`. Add entries here for edge cases where auto-discovery is insufficient (e.g. custom `npmCommand` pointing to pnpm).\n\nSupports `~`/`$HOME` expansion. Entries may be plain directory prefixes or wildcard patterns using `*` (matches any characters, including `/`) and `?` (matches exactly one character). `**` and `*` are equivalent \u2014 both cross directory boundaries.\n\nOn Windows, matching is case-insensitive and tolerant of either path separator.",
    default: []
  }),
  authorizerChain: z.array(z.string().min(1)).optional().meta({
    description: "Ordered names of registered live-authority chain links to consult before the terminal authorizer. Config order (not registration order) fixes the chain order; an unregistered name is skipped fail-safe (more prompting, never less); a link decides nothing until it is named here.",
    markdownDescription: "Ordered names of registered **live-authority chain links** (e.g. a model judge) to consult before the terminal authorizer (the human, or the subagent-forwarding / headless-deny fallback).\n\nA link reviews an `ask` and returns `allow` / `deny` (with an optional teaching reason) / `defer` to the next link. Three invariants govern the chain:\n\n- **Config order wins.** The order here \u2014 not the order extensions register in \u2014 fixes the security-relevant chain order.\n- **Fail-safe skip.** A name with no registered link is skipped with a warning; the `ask` still reaches the terminal (more prompting, never less).\n- **Opt-in activation.** Installing a judge extension grants it no authority; a link decides nothing until you name it here.\n\nThe chain owner caps every verdict with a bounded-delegation checkpoint: a link's `allow` on an excluded surface (`external_directory` or `path`) is downgraded to `defer`, so a link cannot exceed your policy.\n\nDefaults to an empty list (no links).",
    default: []
  }),
  permission: permissionSchema.optional(),
  shellTools: shellToolsSchema.optional()
}).meta({
  title: "PI Permission System Configuration",
  description: "Unified config file combining runtime knobs and flat permission policy for pi-permission-system.",
  markdownDescription: "Unified config file combining runtime knobs and flat permission policy for [pi-permission-system](https://github.com/gotgenes/pi-packages/tree/main/packages/pi-permission-system).\n\nPlace at `~/.pi/agent/extensions/pi-permission-system/config.json` (global) or `<project>/.pi/extensions/pi-permission-system/config.json` (project)."
});

// src/permission-merge.ts
function mergeFlatPermissions(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseVal = merged[key];
    if (typeof baseVal === "object" && baseVal !== null && typeof value === "object" && value !== null) {
      merged[key] = {
        ...baseVal,
        ...value
      };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// src/types.ts
function isPermissionState(value) {
  return value === "allow" || value === "deny" || value === "ask";
}
function isDenyWithReason(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value;
  return record.action === "deny" && (record.reason === void 0 || typeof record.reason === "string");
}

// src/config-loader.ts
function stripJsonComments(input) {
  let output = "";
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1] ?? "";
    if (char === "/" && next === "/") {
      const seg = consumeLineComment(input, i);
      output += seg.output;
      i = seg.nextIndex;
      continue;
    }
    if (char === "/" && next === "*") {
      const seg = consumeBlockComment(input, i);
      output += seg.output;
      i = seg.nextIndex;
      continue;
    }
    if (char === '"' || char === "'") {
      const seg = consumeString(input, i);
      output += seg.output;
      i = seg.nextIndex;
      continue;
    }
    output += char;
    i++;
  }
  return output;
}
function consumeLineComment(input, start) {
  const newlineIndex = input.indexOf("\n", start);
  if (newlineIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "\n", nextIndex: newlineIndex + 1 };
}
function consumeBlockComment(input, start) {
  const closeIndex = input.indexOf("*/", start + 2);
  if (closeIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "", nextIndex: closeIndex + 2 };
}
function consumeString(input, start) {
  const quote = input[start];
  let output = quote;
  let i = start + 1;
  let escaping = false;
  while (i < input.length) {
    const char = input[i];
    output += char;
    i++;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === quote) break;
  }
  return { output, nextIndex: i };
}
function normalizeFlatPermissionValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const record = value;
  const normalized = {};
  let hasAny = false;
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string") {
      if (isPermissionState(val)) {
        normalized[key] = val;
        hasAny = true;
      }
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const map = {};
      let mapHasAny = false;
      for (const [pattern, action] of Object.entries(
        val
      )) {
        if (isDenyWithReason(action)) {
          map[pattern] = action;
          mapHasAny = true;
        } else if (isPermissionState(action)) {
          map[pattern] = action;
          mapHasAny = true;
        }
      }
      if (mapHasAny) {
        normalized[key] = map;
        hasAny = true;
      }
    }
  }
  return hasAny ? normalized : void 0;
}
function validateUnifiedConfig(parsed) {
  const result = unifiedConfigSchema.safeParse(parsed);
  if (result.success) {
    return { config: result.data, issues: [] };
  }
  return { config: {}, issues: formatConfigIssues(result.error) };
}
function formatConfigIssues(error) {
  const messages = [];
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        messages.push(`Unrecognized config key '${key}'.`);
      }
      continue;
    }
    const location = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
    messages.push(`Invalid config value at '${location}': ${issue.message}`);
  }
  return messages;
}
function mergeUnifiedConfigs(base, override) {
  const merged = {};
  for (const key of [
    "debugLog",
    "permissionReviewLog",
    "yoloMode",
    "doublePressToConfirm"
  ]) {
    const value = override[key] ?? base[key];
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  for (const key of [
    "forwardingTimeoutMs",
    "promptMaxRows",
    "promptFieldMaxWidth",
    "reviewLogFieldMaxWidth",
    "toolInputPreviewMaxLength",
    "toolTextSummaryMaxLength"
  ]) {
    const value = override[key] ?? base[key];
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  for (const key of ["piInfrastructureReadPaths", "authorizerChain"]) {
    const value = override[key] ?? base[key];
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  const baseShell = base.shellTools;
  const overrideShell = override.shellTools;
  if (baseShell && overrideShell) {
    merged.shellTools = { ...baseShell, ...overrideShell };
  } else if (baseShell) {
    merged.shellTools = baseShell;
  } else if (overrideShell) {
    merged.shellTools = overrideShell;
  }
  const basePerm = base.permission;
  const overridePerm = override.permission;
  if (basePerm && overridePerm) {
    merged.permission = mergeFlatPermissions(basePerm, overridePerm);
  } else if (basePerm) {
    merged.permission = basePerm;
  } else if (overridePerm) {
    merged.permission = overridePerm;
  }
  return merged;
}
function loadAndMergeConfigs(agentDir, cwd, extensionRoot, options = {}) {
  const includeProjectScope = options.includeProjectScope !== false;
  const allIssues = [];
  const newGlobalPath = getGlobalConfigPath(agentDir);
  const newProjectPath = getProjectConfigPath(cwd);
  const legacyGlobalPolicyPath = getLegacyGlobalPolicyPath(agentDir);
  const legacyProjectPolicyPath = getLegacyProjectPolicyPath(cwd);
  const legacyExtConfigPath = getLegacyExtensionConfigPath(extensionRoot);
  let merged = {};
  if (existsSync3(legacyGlobalPolicyPath)) {
    const legacy = loadUnifiedConfig(legacyGlobalPolicyPath);
    allIssues.push(
      `Legacy global policy found at '${legacyGlobalPolicyPath}'. Move it to '${newGlobalPath}':
  mv '${legacyGlobalPolicyPath}' '${newGlobalPath}'`
    );
    merged = mergeUnifiedConfigs(merged, legacy.config);
  }
  const normalizedLegacyExt = normalize(legacyExtConfigPath);
  const normalizedNewGlobal = normalize(newGlobalPath);
  if (normalizedLegacyExt !== normalizedNewGlobal && existsSync3(legacyExtConfigPath)) {
    const legacy = loadUnifiedConfig(legacyExtConfigPath);
    allIssues.push(
      `Legacy extension config found at '${legacyExtConfigPath}'. Move runtime settings to '${newGlobalPath}':
  mv '${legacyExtConfigPath}' '${newGlobalPath}'`
    );
    merged = mergeUnifiedConfigs(merged, legacy.config);
  }
  const globalResult = loadUnifiedConfig(newGlobalPath);
  allIssues.push(...globalResult.issues);
  const globalConfig = globalResult.config;
  merged = mergeUnifiedConfigs(merged, globalConfig);
  if (includeProjectScope && existsSync3(legacyProjectPolicyPath)) {
    const legacy = loadUnifiedConfig(legacyProjectPolicyPath);
    allIssues.push(
      `Legacy project policy found at '${legacyProjectPolicyPath}'. Move it to '${newProjectPath}':
  mv '${legacyProjectPolicyPath}' '${newProjectPath}'`
    );
    merged = mergeUnifiedConfigs(merged, legacy.config);
  }
  const projectResult = includeProjectScope ? loadUnifiedConfig(newProjectPath) : { config: {}, issues: [] };
  allIssues.push(...projectResult.issues);
  const projectConfig = projectResult.config;
  merged = mergeUnifiedConfigs(merged, projectConfig);
  const bashFallbackIssue = detectPermissiveBashFallback(merged.permission);
  if (bashFallbackIssue) allIssues.push(bashFallbackIssue);
  const deprecatedCapsIssue = detectDeprecatedPreviewCaps(merged);
  if (deprecatedCapsIssue) allIssues.push(deprecatedCapsIssue);
  return {
    global: globalConfig,
    project: projectConfig,
    merged,
    issues: allIssues
  };
}
function detectPermissiveBashFallback(permission) {
  if (permission?.["*"] !== "allow") return void 0;
  const surfaces = permission;
  const bash = surfaces.bash;
  if (typeof bash === "string") return void 0;
  if (bash && Object.hasOwn(bash, "*")) return void 0;
  return `Permission config sets a permissive top-level '*': 'allow' with no 'bash' '*' policy, so bash commands silently inherit 'allow'. Set an explicit 'bash' policy (e.g. "bash": { "*": "ask" }) to gate bash commands.`;
}
function detectDeprecatedPreviewCaps(config) {
  const set = ["toolInputPreviewMaxLength", "toolTextSummaryMaxLength"].filter((key) => config[key] !== void 0);
  if (set.length === 0) return void 0;
  return `Permission config sets ${set.map((key) => `'${key}'`).join(" and ")}, which is deprecated and ignored. The prompt is bounded by 'promptMaxRows' and 'promptFieldMaxWidth' instead; remove the setting.`;
}
function loadUnifiedConfig(path) {
  if (!existsSync3(path)) {
    return { config: {}, issues: [] };
  }
  try {
    const raw = readFileSync3(path, "utf-8");
    const parsed = JSON.parse(stripJsonComments(raw));
    return validateUnifiedConfig(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: {},
      issues: [`Failed to read config at '${path}': ${message}`]
    };
  }
}

// src/config-reporter.ts
function buildResolvedConfigLogEntry(options) {
  return {
    ...options.policyPaths,
    legacyGlobalPolicyDetected: options.legacyGlobalPolicyDetected ?? false,
    legacyProjectPolicyDetected: options.legacyProjectPolicyDetected ?? false,
    legacyExtensionConfigDetected: options.legacyExtensionConfigDetected ?? false
  };
}

// src/status.ts
var PERMISSION_SYSTEM_STATUS_KEY = EXTENSION_ID;
var PERMISSION_SYSTEM_YOLO_STATUS_VALUE = "yolo";
function getPermissionSystemStatus(config) {
  return isYoloModeEnabled(config) ? PERMISSION_SYSTEM_YOLO_STATUS_VALUE : void 0;
}
function syncPermissionSystemStatus(ctx, config) {
  ctx.ui.setStatus(
    PERMISSION_SYSTEM_STATUS_KEY,
    getPermissionSystemStatus(config)
  );
}

// src/config-store.ts
var ConfigStore = class {
  constructor(deps) {
    this.deps = deps;
    this.config = { ...DEFAULT_EXTENSION_CONFIG };
  }
  deps;
  config;
  lastConfigWarning = null;
  /** Return the current extension config. */
  current() {
    return this.config;
  }
  /**
   * Reload merged config from disk.
   *
   * If `ctx` is provided, uses it to derive the cwd and sync UI status.
   * When `projectTrusted` is `false`, the project scope is withheld so an
   * untrusted repository's runtime config (`yoloMode`, `permissionReviewLog`,
   * …) cannot loosen the operator's global config (#644).
   */
  refresh(ctx, projectTrusted) {
    const cwd = ctx?.cwd ?? null;
    const mergeResult = loadAndMergeConfigs(
      this.deps.agentDir,
      cwd ?? "",
      EXTENSION_ROOT,
      { includeProjectScope: projectTrusted }
    );
    const runtimeConfig = normalizePermissionSystemConfig(mergeResult.merged);
    this.config = runtimeConfig;
    if (ctx?.hasUI) {
      syncPermissionSystemStatus(ctx, runtimeConfig);
    }
    const warning = mergeResult.issues.length > 0 ? mergeResult.issues.join("\n") : void 0;
    if (warning && warning !== this.lastConfigWarning) {
      this.lastConfigWarning = warning;
      ctx?.ui.notify(warning, "warning");
    } else if (!warning) {
      this.lastConfigWarning = null;
    }
    this.deps.logger.debug("config.loaded", {
      warning: warning ?? null,
      debugLog: runtimeConfig.debugLog,
      permissionReviewLog: runtimeConfig.permissionReviewLog,
      yoloMode: runtimeConfig.yoloMode,
      projectTrusted
    });
  }
  /**
   * Save updated runtime knobs to the global config file, then update
   * the current config and sync UI status.
   *
   * Equivalent to `saveExtensionConfig(runtime, next, ctx)`.
   */
  // Called via the CommandConfigStore interface from config-modal.ts — fallow cannot trace through interfaces.
  // fallow-ignore-next-line unused-class-member
  save(next, ctx) {
    const normalized = normalizePermissionSystemConfig(next);
    const globalPath = getGlobalConfigPath(this.deps.agentDir);
    const existing = loadUnifiedConfig(globalPath);
    const merged = {
      ...existing.config,
      debugLog: normalized.debugLog,
      permissionReviewLog: normalized.permissionReviewLog,
      yoloMode: normalized.yoloMode
    };
    const tmpPath = `${globalPath}.tmp`;
    try {
      mkdirSync3(dirname2(globalPath), { recursive: true });
      writeFileSync2(tmpPath, `${JSON.stringify(merged, null, 2)}
`, "utf-8");
      renameSync2(tmpPath, globalPath);
    } catch (error) {
      try {
        if (existsSync4(tmpPath)) {
          unlinkSync2(tmpPath);
        }
      } catch {
      }
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `Failed to save permission-system config at '${globalPath}': ${message}`,
        "error"
      );
      return;
    }
    this.config = normalized;
    syncPermissionSystemStatus(ctx, normalized);
    this.lastConfigWarning = null;
    this.deps.logger.debug("config.saved", {
      debugLog: normalized.debugLog,
      permissionReviewLog: normalized.permissionReviewLog,
      yoloMode: normalized.yoloMode
    });
  }
  /**
   * Write the resolved config path set to the review and debug logs.
   *
   * Equivalent to `logResolvedConfigPaths(runtime)`.
   */
  logResolvedPaths(cwd) {
    const policyPaths = this.deps.policyPaths.getResolvedPolicyPaths();
    const { agentDir } = this.deps;
    const legacyGlobalPolicyDetected = existsSync4(
      getLegacyGlobalPolicyPath(agentDir)
    );
    const legacyProjectPolicyDetected = cwd ? existsSync4(getLegacyProjectPolicyPath(cwd)) : false;
    const legacyExtConfigPath = getLegacyExtensionConfigPath(EXTENSION_ROOT);
    const newGlobalPath = getGlobalConfigPath(agentDir);
    const legacyExtensionConfigDetected = normalize2(legacyExtConfigPath) !== normalize2(newGlobalPath) && existsSync4(legacyExtConfigPath);
    const entry = buildResolvedConfigLogEntry({
      policyPaths,
      legacyGlobalPolicyDetected,
      legacyProjectPolicyDetected,
      legacyExtensionConfigDetected
    });
    this.deps.logger.review(
      "config.resolved",
      entry
    );
    this.deps.logger.debug(
      "config.resolved",
      entry
    );
  }
};

// src/decision-audit.ts
var DecisionAudit = class {
  toolCalls = 0;
  allowed = 0;
  blocked = 0;
  errors = 0;
  recordDecision(action) {
    this.toolCalls++;
    if (action === "allow") {
      this.allowed++;
    } else {
      this.blocked++;
    }
  }
  recordError() {
    this.toolCalls++;
    this.errors++;
  }
  /**
   * Emit one `permission.session_summary` debug line with the counters. When
   * `toolCalls !== allowed + blocked + errors`, also emit a warning — the
   * invariant violation means a tool call resolved without a recorded terminal
   * decision (a re-opened silent path).
   */
  writeSummary(logger) {
    const counts = {
      toolCalls: this.toolCalls,
      allowed: this.allowed,
      blocked: this.blocked,
      errors: this.errors
    };
    logger.debug("permission.session_summary", counts);
    if (this.toolCalls !== this.allowed + this.blocked + this.errors) {
      logger.warn(
        `[pi-permission-system] decision audit invariant violated: ${this.toolCalls} tool calls != ${this.allowed} allowed + ${this.blocked} blocked + ${this.errors} errors. A tool call resolved without a recorded terminal decision.`
      );
    }
  }
};

// src/decision-reporter.ts
var GateDecisionReporter = class {
  constructor(logger, events) {
    this.logger = logger;
    this.events = events;
  }
  logger;
  events;
  writeReviewLog(event, details) {
    this.logger.review(event, details);
  }
  emitDecision(event) {
    emitDecisionEvent(this.events, event);
  }
};

// src/extension-paths.ts
import { join as join7 } from "node:path";

// src/node-modules-discovery.ts
import { spawnSync } from "node:child_process";
import { existsSync as existsSync5 } from "node:fs";
import { basename, dirname as dirname3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function walkUpToNodeModules(fromUrl) {
  try {
    const thisFile = fileURLToPath2(fromUrl);
    let dir = dirname3(thisFile);
    while (dir !== dirname3(dir)) {
      if (basename(dir) === "node_modules") {
        return dir;
      }
      dir = dirname3(dir);
    }
    return null;
  } catch {
    return null;
  }
}
function discoverGlobalNodeModulesViaSubprocess() {
  try {
    const result = spawnSync("npm", ["root", "-g"], {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const root = result.stdout.trim();
    if (result.status === 0 && root && existsSync5(root)) {
      return root;
    }
    return null;
  } catch {
    return null;
  }
}
function discoverGlobalNodeModulesRoot(fromUrl = import.meta.url) {
  const fromSelf = walkUpToNodeModules(fromUrl);
  if (fromSelf) return fromSelf;
  return discoverGlobalNodeModulesViaSubprocess();
}

// src/extension-paths.ts
function computeExtensionPaths(agentDir, piPackageDir) {
  const sessionsDir = join7(agentDir, "sessions");
  const subagentSessionsDir = join7(agentDir, "subagent-sessions");
  const forwardingDir = join7(sessionsDir, "permission-forwarding");
  const globalLogsDir = getGlobalLogsDir(agentDir);
  const globalNodeModulesRoot = discoverGlobalNodeModulesRoot();
  const piInfrastructureDirs = [
    agentDir,
    join7(agentDir, "git"),
    ...globalNodeModulesRoot ? [globalNodeModulesRoot] : [],
    ...piPackageDir ? [piPackageDir] : []
  ];
  return {
    agentDir,
    sessionsDir,
    subagentSessionsDir,
    forwardingDir,
    globalLogsDir,
    piInfrastructureDirs
  };
}

// src/skill-prompt-sanitizer.ts
import { dirname as dirname4 } from "node:path";
var AVAILABLE_SKILLS_OPEN_TAG = "<available_skills>";
var AVAILABLE_SKILLS_CLOSE_TAG = "</available_skills>";
var SKILL_BLOCK_PATTERN = "<skill>([\\s\\S]*?)<\\/skill>";
var SKILL_NAME_REGEX = /<name>([\s\S]*?)<\/name>/;
var SKILL_DESCRIPTION_REGEX = /<description>([\s\S]*?)<\/description>/;
var SKILL_LOCATION_REGEX = /<location>([\s\S]*?)<\/location>/;
function decodeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function encodeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function parseSkillEntries(sectionBody) {
  const entries = [];
  const skillBlockRegex = new RegExp(SKILL_BLOCK_PATTERN, "g");
  for (const match of sectionBody.matchAll(skillBlockRegex)) {
    const block = match[1];
    const nameMatch = SKILL_NAME_REGEX.exec(block);
    const descriptionMatch = SKILL_DESCRIPTION_REGEX.exec(block);
    const locationMatch = SKILL_LOCATION_REGEX.exec(block);
    if (!nameMatch || !descriptionMatch || !locationMatch) {
      continue;
    }
    const name = decodeXml(nameMatch[1].trim());
    const description = decodeXml(descriptionMatch[1].trim());
    const location = decodeXml(locationMatch[1].trim());
    if (!name || !location) {
      continue;
    }
    entries.push({ name, description, location });
  }
  return entries;
}
function parseAllSkillPromptSections(prompt) {
  const sections = [];
  let searchStart = 0;
  while (searchStart < prompt.length) {
    const start = prompt.indexOf(AVAILABLE_SKILLS_OPEN_TAG, searchStart);
    if (start === -1) {
      break;
    }
    const closeStart = prompt.indexOf(
      AVAILABLE_SKILLS_CLOSE_TAG,
      start + AVAILABLE_SKILLS_OPEN_TAG.length
    );
    if (closeStart === -1) {
      break;
    }
    const end = closeStart + AVAILABLE_SKILLS_CLOSE_TAG.length;
    const sectionBody = prompt.slice(
      start + AVAILABLE_SKILLS_OPEN_TAG.length,
      closeStart
    );
    sections.push({
      start,
      end,
      entries: parseSkillEntries(sectionBody)
    });
    searchStart = end;
  }
  return sections;
}
function resolvePermissionState(skillName, permissionManager, agentName, cache) {
  const cachedState = cache.get(skillName);
  if (cachedState) {
    return cachedState;
  }
  const state = permissionManager.checkPermission(
    "skill",
    { name: skillName },
    agentName ?? void 0
  ).state;
  cache.set(skillName, state);
  return state;
}
function createResolvedSkillEntry(entry, state, normalizer) {
  return {
    name: entry.name,
    description: entry.description,
    location: entry.location,
    state,
    normalizedLocation: normalizer.comparableValue(entry.location),
    normalizedBaseDir: normalizer.comparableValue(dirname4(entry.location))
  };
}
function renderAvailableSkillsSection(entries) {
  return [
    AVAILABLE_SKILLS_OPEN_TAG,
    ...entries.flatMap((entry) => [
      "  <skill>",
      `    <name>${encodeXml(entry.name)}</name>`,
      `    <description>${encodeXml(entry.description)}</description>`,
      `    <location>${encodeXml(entry.location)}</location>`,
      "  </skill>"
    ]),
    AVAILABLE_SKILLS_CLOSE_TAG
  ].join("\n");
}
function removePromptRange(prompt, start, end) {
  const beforeSection = prompt.slice(0, start).replace(/\n+$/, "");
  const afterSection = prompt.slice(end);
  return `${beforeSection}${afterSection}`;
}
function resolveSkillPromptEntries(prompt, permissionManager, agentName, normalizer) {
  const sections = parseAllSkillPromptSections(prompt);
  if (sections.length === 0) {
    return { prompt, entries: [] };
  }
  const permissionCache = /* @__PURE__ */ new Map();
  const visibleEntries = [];
  const replacements = [];
  for (const section of sections) {
    const resolvedEntries = section.entries.map((entry) => {
      const state = resolvePermissionState(
        entry.name,
        permissionManager,
        agentName,
        permissionCache
      );
      return createResolvedSkillEntry(entry, state, normalizer);
    });
    const visibleSectionEntries = resolvedEntries.filter(
      (entry) => entry.state !== "deny"
    );
    visibleEntries.push(...visibleSectionEntries);
    if (visibleSectionEntries.length === resolvedEntries.length) {
      continue;
    }
    replacements.push({
      start: section.start,
      end: section.end,
      content: visibleSectionEntries.length > 0 ? renderAvailableSkillsSection(visibleSectionEntries) : ""
    });
  }
  if (replacements.length === 0) {
    return { prompt, entries: visibleEntries };
  }
  let sanitizedPrompt = prompt;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i];
    sanitizedPrompt = replacement.content.length > 0 ? `${sanitizedPrompt.slice(0, replacement.start)}${replacement.content}${sanitizedPrompt.slice(replacement.end)}` : removePromptRange(
      sanitizedPrompt,
      replacement.start,
      replacement.end
    );
  }
  return {
    prompt: sanitizedPrompt,
    entries: visibleEntries
  };
}
function findSkillPathMatch(normalizedPath, entries, normalizer) {
  if (!normalizedPath || entries.length === 0) {
    return null;
  }
  for (const entry of entries) {
    if (entry.normalizedLocation && normalizedPath === entry.normalizedLocation) {
      return entry;
    }
  }
  let bestMatch = null;
  for (const entry of entries) {
    if (!entry.normalizedBaseDir || !normalizer.isWithinDirectory(normalizedPath, entry.normalizedBaseDir)) {
      continue;
    }
    if (!bestMatch || entry.normalizedBaseDir.length > bestMatch.normalizedBaseDir.length) {
      bestMatch = entry;
    }
  }
  return bestMatch;
}

// src/system-prompt-sanitizer.ts
var AVAILABLE_TOOLS_SECTION_HEADER = "Available tools:";
var GUIDELINES_SECTION_HEADER = "Guidelines:";
var TOOL_GUIDELINE_RULES = [
  {
    matches: (guideline) => guideline === "use bash for file operations like ls, rg, find",
    shouldKeep: (allowedTools) => allowedTools.has("bash")
  },
  {
    matches: (guideline) => guideline === "prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
    shouldKeep: (allowedTools) => allowedTools.has("bash") && (allowedTools.has("grep") || allowedTools.has("find") || allowedTools.has("ls"))
  },
  {
    matches: (guideline) => guideline === "use read to examine files before editing. you must use this tool instead of cat or sed." || guideline === "use read to examine files instead of cat or sed.",
    shouldKeep: (allowedTools) => allowedTools.has("read")
  },
  {
    matches: (guideline) => guideline === "use edit for precise changes (old text must match exactly)",
    shouldKeep: (allowedTools) => allowedTools.has("edit")
  },
  {
    matches: (guideline) => guideline === "use write only for new files or complete rewrites",
    shouldKeep: (allowedTools) => allowedTools.has("write")
  },
  {
    matches: (guideline) => guideline === "when summarizing your actions, output plain text directly - do not use cat or bash to display what you did",
    shouldKeep: (allowedTools) => allowedTools.has("edit") || allowedTools.has("write")
  },
  {
    matches: (guideline) => guideline === "use task when work should be delegated to one or more specialized agents instead of handled entirely in the current session.",
    shouldKeep: (allowedTools) => allowedTools.has("task")
  },
  {
    matches: (guideline) => guideline === "use mcp for mcp discovery first: search by capability, describe one exact tool name, then call it.",
    shouldKeep: (allowedTools) => allowedTools.has("mcp")
  }
];
function normalizePrompt(prompt) {
  return (prompt || "").replace(/\r\n/g, "\n");
}
function collapseExtraBlankLines(text) {
  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
}
function normalizeGuidelineText(line) {
  return line.trim().replace(/^[-*]\s+/, "").replace(/\s+/g, " ").toLowerCase();
}
function isTopLevelSectionHeader(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed.endsWith(":") && !trimmed.startsWith("-");
}
function isSectionBodyLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.startsWith("- ")) return true;
  if (line !== line.trimStart()) return true;
  return false;
}
function findSection(lines, header) {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return null;
  }
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isTopLevelSectionHeader(lines[index])) {
      return { start, end: index };
    }
  }
  let end = start + 1;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!isSectionBodyLine(lines[index])) {
      end = index;
      break;
    }
    end = index + 1;
  }
  return { start, end };
}
function extractToolBulletName(line) {
  const match = /^\s*-\s+([A-Za-z0-9_-]+)/.exec(line);
  return match ? match[1] : null;
}
function narrowAvailableToolsSection(lines, allowedTools) {
  const section = findSection(lines, AVAILABLE_TOOLS_SECTION_HEADER);
  if (!section) {
    return { lines: [...lines], removed: false };
  }
  const before = lines.slice(0, section.start);
  const header = lines[section.start];
  const body = lines.slice(section.start + 1, section.end);
  const after = lines.slice(section.end);
  const filteredBody = body.filter((line) => {
    const toolName = extractToolBulletName(line);
    if (toolName === null) {
      return true;
    }
    return allowedTools.has(toolName);
  });
  const removed = filteredBody.length !== body.length;
  if (!removed) {
    return { lines: [...lines], removed: false };
  }
  const hasToolBullet = filteredBody.some(
    (line) => extractToolBulletName(line) !== null
  );
  if (!hasToolBullet) {
    return { lines: [...before, ...after], removed: true };
  }
  return {
    lines: [...before, header, ...filteredBody, ...after],
    removed: true
  };
}
function shouldKeepGuideline(line, allowedTools) {
  const normalized = normalizeGuidelineText(line);
  for (const rule of TOOL_GUIDELINE_RULES) {
    if (rule.matches(normalized)) {
      return rule.shouldKeep(allowedTools);
    }
  }
  return true;
}
function sanitizeGuidelinesSection(lines, allowedTools) {
  const section = findSection(lines, GUIDELINES_SECTION_HEADER);
  if (!section) {
    return { lines: [...lines], removed: false };
  }
  const before = lines.slice(0, section.start + 1);
  const after = lines.slice(section.end);
  const body = lines.slice(section.start + 1, section.end);
  const filteredBody = body.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      return true;
    }
    return shouldKeepGuideline(line, allowedTools);
  });
  const removed = filteredBody.length !== body.length;
  if (!removed) {
    return { lines: [...lines], removed: false };
  }
  const hasBullet = filteredBody.some((line) => line.trim().startsWith("- "));
  if (!hasBullet) {
    return {
      lines: [...lines.slice(0, section.start), ...after],
      removed: true
    };
  }
  return {
    lines: [...before, ...filteredBody, ...after],
    removed: true
  };
}
function sanitizeAvailableToolsSection(systemPrompt, allowedToolNames) {
  const allowedTools = new Set(
    allowedToolNames.map((toolName) => toolName.trim()).filter(Boolean)
  );
  const normalizedLines = normalizePrompt(systemPrompt).split("\n");
  const narrowedToolsSection = narrowAvailableToolsSection(
    normalizedLines,
    allowedTools
  );
  const sanitizedGuidelines = sanitizeGuidelinesSection(
    narrowedToolsSection.lines,
    allowedTools
  );
  const removed = narrowedToolsSection.removed || sanitizedGuidelines.removed;
  return {
    prompt: removed ? collapseExtraBlankLines(sanitizedGuidelines.lines.join("\n")) : systemPrompt,
    removed
  };
}

// src/tool-registry.ts
function normalizeToolName(toolName, aliases) {
  return aliases[toolName] || toolName;
}
function buildReverseAliases(aliases) {
  const reverse = /* @__PURE__ */ new Map();
  for (const [alias, canonical] of Object.entries(aliases)) {
    const existing = reverse.get(canonical) ?? [];
    if (!existing.includes(alias)) {
      existing.push(alias);
    }
    reverse.set(canonical, existing);
  }
  return reverse;
}
function addToolNameVariants(value, names, aliases, reverseAliases) {
  names.add(value);
  const normalized = normalizeToolName(value, aliases);
  names.add(normalized);
  const canonicalFromAlias = aliases[value];
  if (canonicalFromAlias) {
    names.add(canonicalFromAlias);
  }
  const aliasValues = reverseAliases.get(value);
  if (aliasValues) {
    for (const alias of aliasValues) {
      names.add(alias);
    }
  }
  const aliasValuesForNormalized = reverseAliases.get(normalized);
  if (aliasValuesForNormalized) {
    for (const alias of aliasValuesForNormalized) {
      names.add(alias);
    }
  }
}
function getToolNameFromValue(value) {
  const direct = getNonEmptyString(value);
  if (direct) {
    return direct;
  }
  const record = toRecord(value);
  const candidates = [record.toolName, record.name, record.tool];
  for (const candidate of candidates) {
    const stringValue = getNonEmptyString(candidate);
    if (stringValue) {
      return stringValue;
    }
  }
  return null;
}
function checkRequestedToolRegistration(requestedToolName, registeredTools, aliases = {}) {
  const requested = getNonEmptyString(requestedToolName);
  if (!requested) {
    return {
      status: "missing-tool-name"
    };
  }
  const normalizedToolName = normalizeToolName(requested, aliases);
  const reverseAliases = buildReverseAliases(aliases);
  const registeredLookup = /* @__PURE__ */ new Set();
  const availableToolNames = /* @__PURE__ */ new Set();
  for (const tool of registeredTools) {
    const name = getToolNameFromValue(tool);
    if (!name) {
      continue;
    }
    availableToolNames.add(name);
    addToolNameVariants(name, registeredLookup, aliases, reverseAliases);
  }
  const isRegistered = registeredLookup.has(requested) || registeredLookup.has(normalizedToolName);
  if (isRegistered) {
    return {
      status: "registered",
      requestedToolName: requested,
      normalizedToolName
    };
  }
  return {
    status: "unregistered",
    requestedToolName: requested,
    normalizedToolName,
    availableToolNames: [...availableToolNames].sort(
      (a, b) => a.localeCompare(b)
    )
  };
}

// src/handlers/before-agent-start.ts
function shouldExposeTool(toolName, agentName, getToolPermission) {
  const toolPermission = getToolPermission(toolName, agentName ?? void 0);
  return toolPermission !== "deny";
}
var AgentPrepHandler = class {
  constructor(session, resolver, toolRegistry, warmParser) {
    this.session = session;
    this.resolver = resolver;
    this.toolRegistry = toolRegistry;
    this.warmParser = warmParser;
  }
  session;
  resolver;
  toolRegistry;
  warmParser;
  // eslint-disable-next-line @typescript-eslint/require-await
  async handle(event, ctx) {
    this.warmParser();
    this.session.activate(ctx);
    this.session.refreshConfig(ctx, ctx.isProjectTrusted());
    const agentName = this.session.resolveAgentName(ctx, event.systemPrompt);
    const activeTools = this.toolRegistry.getActive();
    const allowedTools = [];
    for (const tool of activeTools) {
      const toolName = getToolNameFromValue(tool);
      if (!toolName) {
        continue;
      }
      if (shouldExposeTool(
        toolName,
        agentName,
        (t, a) => this.resolver.getToolPermission(t, a)
      )) {
        allowedTools.push(toolName);
      }
    }
    this.toolRegistry.setActive(allowedTools);
    const toolPromptResult = sanitizeAvailableToolsSection(
      event.systemPrompt,
      allowedTools
    );
    const skillPromptResult = resolveSkillPromptEntries(
      toolPromptResult.prompt,
      this.resolver,
      agentName,
      this.session.getPathNormalizer()
    );
    this.session.setActiveSkillEntries(skillPromptResult.entries);
    return skillPromptResult.prompt !== event.systemPrompt ? { systemPrompt: skillPromptResult.prompt } : {};
  }
};

// src/handlers/lifecycle.ts
var UNTRUSTED_PROJECT_MESSAGE = "pi-permission-system: project is not trusted \u2014 skipping project-scoped permission configuration. Only global policy applies. Grant project trust to load this project's permission rules.";
var SessionLifecycleHandler = class {
  constructor(session, resolver, serviceLifecycle, logger, audit) {
    this.session = session;
    this.resolver = resolver;
    this.serviceLifecycle = serviceLifecycle;
    this.logger = logger;
    this.audit = audit;
  }
  session;
  resolver;
  serviceLifecycle;
  logger;
  audit;
  handleSessionStart(event, ctx) {
    const projectTrusted = ctx.isProjectTrusted();
    this.session.refreshConfig(ctx, projectTrusted);
    this.session.resetForNewSession(ctx, projectTrusted);
    this.session.logResolvedConfigPaths();
    if (!projectTrusted) {
      this.warnProjectUntrusted(ctx, "session_start");
    }
    const agentName = this.session.resolveAgentName(ctx);
    const policyIssues = this.resolver.getConfigIssues(agentName ?? void 0);
    for (const issue of policyIssues) {
      this.logger.warn(issue);
    }
    if (event.reason === "reload") {
      this.logger.debug("lifecycle.reload", {
        triggeredBy: "session_start",
        reason: event.reason,
        cwd: ctx.cwd
      });
    }
    this.serviceLifecycle.activate(ctx);
    return Promise.resolve();
  }
  handleResourcesDiscover(event, ctx) {
    if (event.reason !== "reload") {
      return Promise.resolve();
    }
    const projectTrusted = ctx.isProjectTrusted();
    this.session.reload(projectTrusted);
    if (!projectTrusted) {
      this.warnProjectUntrusted(ctx, "resources_discover");
    }
    this.logger.debug("lifecycle.reload", {
      triggeredBy: "resources_discover",
      reason: event.reason,
      cwd: this.session.getRuntimeContext()?.cwd ?? null
    });
    return Promise.resolve();
  }
  /**
   * Record the project-trust skip in the review log and surface a loud warning
   * to the user, so the reduced (global-only) scope is never silent (#644).
   */
  warnProjectUntrusted(ctx, phase) {
    this.logger.review("project_trust.skipped", { cwd: ctx.cwd, phase });
    this.logger.warn(UNTRUSTED_PROJECT_MESSAGE);
  }
  handleSessionShutdown() {
    const ctx = this.session.getRuntimeContext();
    if (ctx) {
      ctx.ui.setStatus(PERMISSION_SYSTEM_STATUS_KEY, void 0);
    }
    this.audit.writeSummary(this.logger);
    this.session.shutdown();
    this.serviceLifecycle.teardown();
    return Promise.resolve();
  }
};

// src/permission-prompts.ts
function formatMissingToolNameReason() {
  return "Tool call was blocked because no tool name was provided. Use a registered tool name from pi.getAllTools().";
}
function formatUnknownToolReason(toolName, availableToolNames) {
  const preview = availableToolNames.slice(0, 10);
  const suffix = availableToolNames.length > preview.length ? ", ..." : "";
  const availableList = preview.length > 0 ? `${preview.join(", ")}${suffix}` : "none";
  const mcpHint = classifyToolKind(toolName) === "mcp" ? "" : ` If this was intended as an MCP server tool, call the registered 'mcp' tool when available (for example: {"tool":"server:tool"}).`;
  return `Tool '${toolName}' is not registered in this runtime and was blocked before permission checks.${mcpHint} Registered tools: ${availableList}.`;
}

// src/handlers/permission-gate-handler.ts
var PermissionGateHandler = class {
  constructor(session, toolRegistry, pipeline, skillInputPipeline, runner) {
    this.session = session;
    this.toolRegistry = toolRegistry;
    this.pipeline = pipeline;
    this.skillInputPipeline = skillInputPipeline;
    this.runner = runner;
  }
  session;
  toolRegistry;
  pipeline;
  skillInputPipeline;
  runner;
  async handleToolCall(event, ctx) {
    this.session.activate(ctx);
    const validation = validateRequestedTool(event, this.toolRegistry.getAll());
    if (validation.status === "block") {
      return { action: "block", reason: validation.reason };
    }
    const toolName = validation.toolName;
    const agentName = this.session.resolveAgentName(ctx);
    const input = getEventInput(event);
    const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : "";
    const tcc = {
      toolName,
      agentName,
      input,
      toolCallId,
      cwd: ctx.cwd
    };
    return await this.pipeline.evaluate(tcc, this.runner);
  }
  async handleInput(event, ctx) {
    this.session.activate(ctx);
    const skillName = extractSkillNameFromInput(event.text);
    if (!skillName) {
      return { action: "continue" };
    }
    const agentName = this.session.resolveAgentName(ctx);
    const notifier = {
      warn: (message) => {
        if (ctx.hasUI) {
          ctx.ui.notify(message, "warning");
        }
      }
    };
    const outcome = await this.skillInputPipeline.evaluate(
      skillName,
      agentName,
      notifier,
      this.runner
    );
    return outcome.action === "block" ? { action: "handled" } : { action: "continue" };
  }
};
function validateRequestedTool(event, availableTools) {
  const toolName = getToolNameFromValue(event);
  if (!toolName) {
    return { status: "block", reason: formatMissingToolNameReason() };
  }
  const check = checkRequestedToolRegistration(toolName, availableTools);
  if (check.status === "missing-tool-name") {
    return { status: "block", reason: formatMissingToolNameReason() };
  }
  if (check.status === "unregistered") {
    return {
      status: "block",
      reason: formatUnknownToolReason(
        check.requestedToolName,
        check.availableToolNames
      )
    };
  }
  return { status: "ok", toolName };
}
function getEventInput(event) {
  const record = toRecord(event);
  if (record.input !== void 0) {
    return record.input;
  }
  if (record.arguments !== void 0) {
    return record.arguments;
  }
  return {};
}
function extractSkillNameFromInput(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/skill:")) {
    return null;
  }
  const afterPrefix = trimmed.slice("/skill:".length);
  if (!afterPrefix) {
    return null;
  }
  const firstWhitespace = afterPrefix.search(/\s/);
  const skillName = (firstWhitespace === -1 ? afterPrefix : afterPrefix.slice(0, firstWhitespace)).trim();
  return skillName || null;
}

// src/permission-gate.ts
async function applyPermissionGate(params) {
  const { state, promptForApproval, writeLog, logContext, messages } = params;
  if (state === "deny") {
    writeLog("permission_request.blocked", {
      ...logContext,
      resolution: "policy_denied",
      decidedBy: params.decidedByRule
    });
    return { action: "block", reason: messages.denyReason };
  }
  if (state === "ask") {
    const decision = await promptForApproval();
    if (!decision.approved) {
      return {
        action: "block",
        reason: decision.confirmationUnavailable ? messages.unavailableReason(decision) : messages.userDeniedReason(decision)
      };
    }
    if (decision.state === "approved_for_session" && params.sessionApproval) {
      return { action: "allow", sessionApproval: params.sessionApproval };
    }
  }
  return { action: "allow" };
}

// src/presentation/agent-renderer.ts
var EXTENSION_TAG = `[${EXTENSION_ID}]`;
function renderPolicyDenial(payload, ruleReason, budget = DEFAULT_RENDER_BUDGET) {
  return tagged(
    `Denied by policy: ${identification(payload, budget, "")}${boundaryClause(payload)}${provenanceClause(payload)}.`,
    ruleReason
  );
}
function renderUserDenial(payload, denialReason, budget = DEFAULT_RENDER_BUDGET) {
  return tagged(
    `The user denied this ${identification(payload, budget, "call")}${boundaryClause(payload)}${provenanceClause(payload)}.`,
    denialReason
  );
}
function renderUnavailableDenial(payload, denialReason, budget = DEFAULT_RENDER_BUDGET) {
  return tagged(
    `This ${identification(payload, budget, "call")} requires approval, but no interactive UI is available.`,
    denialReason
  );
}
function tagged(sentence, reason) {
  return `${EXTENSION_TAG} ${sentence}${reasonClause(reason)}`;
}
function identification(payload, budget, callWord) {
  return [
    `'${payload.request.surface}'`,
    callWord,
    invokedAsClause(payload),
    toolClause(payload),
    agentClause(payload),
    flaggedClause(payload, budget),
    ruleClause(payload)
  ].filter((clause) => clause !== "").join(" ");
}
function toolClause(payload) {
  const { toolName, surface } = payload.request;
  return toolName === null || toolName === surface ? "" : `for tool '${toolName}'`;
}
function invokedAsClause(payload) {
  const { invokedToolName } = payload.request;
  return invokedToolName === null ? "" : `(invoked as '${invokedToolName}')`;
}
function agentClause(payload) {
  const { agentName } = payload.request.requester;
  return agentName ? `for agent '${agentName}'` : "";
}
function flaggedClause(payload, budget) {
  if (payload.kind === "bash" || payload.kind === "forwarded") {
    return "";
  }
  const label = flaggedElementLabel(payload);
  const elements = flaggedElements(payload).filter(
    (element) => element !== payload.request.toolName
  );
  if (elements.length === 0) {
    return "";
  }
  const noun = elements.length === 1 ? label : `${label}s`;
  return `for ${noun} ${elements.map(
    (element) => `'${cap(element, budget)}'${resolvedAlias(payload, element)}`
  ).join(", ")}`;
}
function resolvedAlias(payload, element) {
  const resolved = findEvidence(payload, "resolves to")?.text ?? allEvidence(payload, "external path").find(
    (entry) => entry.text === element
  )?.detail;
  return resolved ? ` (resolves to '${resolved}')` : "";
}
function ruleClause(payload) {
  const { matchedPattern, commandContext } = payload.request;
  const parts = [];
  if (matchedPattern !== null) {
    parts.push(`rule '${matchedPattern}'`);
  }
  const context = describeBashCommandContext(commandContext);
  if (context !== void 0) {
    parts.push(`inside ${context}`);
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}
function boundaryClause(payload) {
  const cwd = findEvidence(payload, "working directory")?.text;
  return cwd ? `: outside working directory '${cwd}'` : "";
}
function provenanceClause(payload) {
  const readPath = findEvidence(payload, "read path")?.text;
  return readPath ? `, reached via '${readPath}'` : "";
}
function reasonClause(reason) {
  return reason ? ` Reason: ${reason}.` : "";
}
function cap(text, budget) {
  return text.length <= budget.fieldMaxWidth ? text : `${text.slice(0, budget.fieldMaxWidth)}\u2026`;
}

// src/handlers/gates/descriptor.ts
function isGateBypass(result) {
  return result !== null && "action" in result;
}

// src/handlers/gates/helpers.ts
function accessFactsFromPath(surface, path) {
  return {
    surface,
    matchValues: path.matchValues(),
    boundaryValue: path.boundaryValue() || null
  };
}
function accessFactsFromValue(surface, value) {
  return { surface, matchValues: [value], boundaryValue: null };
}
function deriveDecisionValue(toolName, check, path) {
  switch (classifyToolKind(toolName)) {
    case "bash":
      return check.command ?? toolName;
    case "mcp":
      return check.target ?? toolName;
    case "path":
    case "skill":
    case "extension":
      return path || toolName;
  }
}
function buildDecisionEvent(decision, check, agentName, result, resolution) {
  return {
    surface: decision.surface,
    value: decision.value,
    result,
    resolution,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ?? null normalises undefined to null for the log record
    origin: check.origin ?? null,
    agentName: agentName ?? null,
    matchedPattern: check.matchedPattern ?? null
  };
}
function deriveResolution(state, action, hasSession, confirmationUnavailable, autoApproved = false) {
  if (state === "allow") return autoApproved ? "auto_approved" : "policy_allow";
  if (state === "deny") return "policy_deny";
  if (action === "allow") {
    if (autoApproved) return "auto_approved";
    return hasSession ? "user_approved_for_session" : "user_approved";
  }
  return confirmationUnavailable ? "confirmation_unavailable" : "user_denied";
}
function resolveYoloGrant(check, yoloEnabled) {
  if (check.state === "allow" && check.origin === "yolo") {
    return check;
  }
  if (check.state === "ask" && yoloEnabled) {
    return { ...check, state: "allow", origin: "yolo" };
  }
  return null;
}

// src/handlers/gates/runner.ts
var GateRunner = class {
  constructor(resolver, recorder, prompter, reporter, isYoloEnabled) {
    this.resolver = resolver;
    this.recorder = recorder;
    this.prompter = prompter;
    this.reporter = reporter;
    this.isYoloEnabled = isYoloEnabled;
  }
  resolver;
  recorder;
  prompter;
  reporter;
  isYoloEnabled;
  /**
   * Execute a gate: null → allow; bypass → log/emit side effects then allow;
   * descriptor → full check→log→emit→approve cycle.
   *
   * The request id is minted here, before the branch, so a request that never
   * prompts is identified exactly as one that does.
   */
  async run(gate, agentName) {
    if (!gate) {
      return { action: "allow" };
    }
    const requestId = createPermissionRequestId();
    if (isGateBypass(gate)) {
      if (gate.log) {
        this.reporter.writeReviewLog(gate.log.event, {
          ...gate.log.details,
          requestId,
          decidedBy: gate.decidedBy
        });
      }
      if (gate.decision) {
        this.emitDecision(requestId, gate.decision);
      }
      return { action: "allow" };
    }
    return this.runDescriptor(gate, agentName, requestId);
  }
  // ── Private helpers ──────────────────────────────────────────────────────
  /**
   * The one place a decision event acquires its request id, so no emit path
   * can be added that forgets it.
   */
  emitDecision(requestId, facts) {
    this.reporter.emitDecision({ requestId, ...facts });
  }
  async runDescriptor(descriptor, agentName, requestId) {
    let check;
    if (descriptor.preCheck) {
      check = descriptor.preCheck;
    } else if (descriptor.preResolved) {
      check = {
        state: descriptor.preResolved.state,
        toolName: descriptor.surface,
        source: "tool",
        origin: "builtin"
      };
    } else {
      check = this.resolver.resolve({
        kind: "tool",
        surface: descriptor.surface,
        input: descriptor.input,
        agentName: agentName ?? void 0
      });
    }
    const logContext = {
      ...descriptor.logContext,
      ...renderReviewLogFacts(descriptor.payload),
      agentName,
      requestId
    };
    if (check.source === "session") {
      this.reporter.writeReviewLog("permission_request.session_approved", {
        ...logContext,
        resolution: "session_approved",
        sessionApprovalPattern: check.matchedPattern,
        decidedBy: {
          kind: "session_approval",
          surface: descriptor.surface,
          pattern: check.matchedPattern ?? null
        }
      });
      this.emitDecision(
        requestId,
        buildDecisionEvent(
          descriptor.decision,
          check,
          agentName,
          "allow",
          "session_approved"
        )
      );
      return { action: "allow" };
    }
    const yoloGrant = resolveYoloGrant(check, this.isYoloEnabled());
    if (yoloGrant) {
      this.reporter.writeReviewLog("permission_request.auto_approved", {
        ...logContext,
        resolution: "auto_approved",
        // The pattern that raised the ask, sentinel included: "yolo allowed
        // it" alone does not say why it was asked in the first place.
        decidedBy: { kind: "yolo", pattern: check.matchedPattern ?? null }
      });
      this.emitDecision(
        requestId,
        buildDecisionEvent(
          descriptor.decision,
          yoloGrant,
          agentName,
          "allow",
          deriveResolution(yoloGrant.state, "allow", false, false, true)
        )
      );
      return { action: "allow" };
    }
    const { payload } = descriptor;
    const messages = {
      denyReason: renderPolicyDenial(payload, check.reason ?? null),
      unavailableReason: (decision) => renderUnavailableDenial(payload, decision.denialReason ?? null),
      userDeniedReason: (decision) => renderUserDenial(payload, decision.denialReason ?? null)
    };
    let autoApproved = false;
    let confirmationUnavailable = false;
    const gateResult = await applyPermissionGate({
      state: check.state,
      sessionApproval: descriptor.sessionApproval?.toGateApproval(),
      promptForApproval: async () => {
        const decision = await this.prompter.escalate({
          requestId,
          payload,
          ...descriptor.promptDetails,
          ...descriptor.sessionApproval ? { sessionApproval: descriptor.sessionApproval.toForwardedData() } : {}
        });
        autoApproved = decision.autoApproved === true;
        confirmationUnavailable = decision.confirmationUnavailable === true;
        return decision;
      },
      writeLog: (event, details) => this.reporter.writeReviewLog(event, details),
      logContext,
      decidedByRule: {
        kind: "rule",
        surface: descriptor.surface,
        pattern: check.matchedPattern ?? null,
        origin: check.origin
      },
      messages
    });
    const hasSessionApproval = gateResult.action === "allow" && gateResult.sessionApproval !== void 0;
    this.emitDecision(
      requestId,
      buildDecisionEvent(
        descriptor.decision,
        check,
        agentName,
        gateResult.action === "allow" ? "allow" : "deny",
        deriveResolution(
          check.state,
          gateResult.action,
          hasSessionApproval,
          confirmationUnavailable,
          autoApproved
        )
      )
    );
    if (hasSessionApproval && descriptor.sessionApproval) {
      this.recorder.recordSessionApproval(descriptor.sessionApproval);
    }
    if (gateResult.action === "block") {
      return { action: "block", reason: gateResult.reason };
    }
    return { action: "allow" };
  }
};

// src/presentation/skill-ask-payload.ts
function buildSkillAskPayload(skillName, agentName) {
  return skillPayload("skill", skillName, agentName, []);
}
function buildSkillPathAskPayload(skill, readPath, agentName) {
  return skillPayload("skill_read", skill.name, agentName, [
    { label: "read path", text: readPath, detail: null }
  ]);
}
function skillPayload(kind, skillName, agentName, evidence) {
  return {
    kind,
    request: {
      requester: localRequester(agentName),
      surface: "skill",
      toolName: null,
      invokedToolName: null,
      value: skillName,
      matchedPattern: null,
      commandContext: null,
      executedUnit: null
    },
    evidence,
    annotations: []
  };
}

// src/handlers/gates/skill-input.ts
function describeSkillInputGate(skillName, agentName, preCheck) {
  const payload = buildSkillAskPayload(skillName, agentName);
  return {
    surface: "skill",
    input: { name: skillName },
    preCheck,
    payload,
    promptDetails: {
      source: "skill_input",
      agentName,
      skillName,
      accessIntent: accessFactsFromValue("skill", skillName)
    },
    logContext: {
      source: "skill_input",
      skillName,
      agentName
    },
    decision: {
      surface: "skill",
      value: skillName
    }
  };
}

// src/handlers/gates/skill-input-gate-pipeline.ts
var SkillInputGatePipeline = class {
  constructor(inputs) {
    this.inputs = inputs;
  }
  inputs;
  evaluate(skillName, agentName, notifier, runner) {
    const check = this.inputs.checkPermission(
      "skill",
      { name: skillName },
      agentName ?? void 0
    );
    if (check.state === "deny") {
      notifier.warn(formatSkillDenyNotice(skillName, agentName));
    }
    return runner.run(
      describeSkillInputGate(skillName, agentName, check),
      agentName
    );
  }
};
function formatSkillDenyNotice(skillName, agentName) {
  return agentName ? `Skill '${skillName}' is not permitted for agent '${agentName}'.` : `Skill '${skillName}' is not permitted by the current skill policy.`;
}

// src/access-intent/bash/shell-variable-expansion.ts
import { homedir } from "node:os";
function resolvePlainVariableExpansion(node) {
  const name = plainVariableName(node);
  return name === null ? null : RESOLVABLE_VARIABLES.get(name)?.() ?? null;
}
var RESOLVABLE_VARIABLES = /* @__PURE__ */ new Map([
  ["HOME", homedir],
  ["PWD", () => "."]
]);
var EXPANSION_DELIMITERS = /* @__PURE__ */ new Set(["$", "${", "}"]);
function plainVariableName(node) {
  let name = null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "variable_name") {
      if (name !== null) return null;
      name = child.text;
      continue;
    }
    if (!EXPANSION_DELIMITERS.has(child.type)) return null;
  }
  return name;
}

// src/access-intent/bash/node-text.ts
var SKIP_SUBTREE_TYPES = /* @__PURE__ */ new Set([
  "heredoc_body",
  "heredoc_end",
  "comment"
]);
var ARG_NODE_TYPES = /* @__PURE__ */ new Set([
  "word",
  "concatenation",
  "string",
  "raw_string"
]);
function resolveNodeText(node) {
  switch (node.type) {
    case "word":
      return node.text;
    case "raw_string": {
      const t = node.text;
      if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
        return t.slice(1, -1);
      }
      return t;
    }
    case "string": {
      let result = "";
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        if (child.type === '"') continue;
        result += resolveNodeText(child);
      }
      return result;
    }
    case "string_content":
      return node.text;
    case "simple_expansion":
    case "expansion":
      return resolvePlainVariableExpansion(node) ?? node.text;
    case "concatenation": {
      let result = "";
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        result += resolveNodeText(child);
      }
      return result;
    }
    default:
      return node.text;
  }
}

// src/access-intent/bash/token-classification.ts
function classifyTokenAsPathCandidate(token) {
  if (rejectNonPathToken(token)) return null;
  if (token.startsWith("/")) return token;
  if (token.startsWith("~/")) return token;
  if (token.includes("..")) return token;
  if (WINDOWS_DRIVE_PATH_PATTERN.test(token)) return token;
  return null;
}
function classifyTokenAsRuleCandidate(token, flavor) {
  if (rejectNonPathToken(token)) return null;
  if (token.startsWith(".")) return token;
  if (flavor.hasPathSeparator(token)) return token;
  if (token.includes("..")) return token;
  if (WINDOWS_DRIVE_PATH_PATTERN.test(token)) return token;
  return null;
}
function classifyBareTokenCandidate(token) {
  return rejectNonPathToken(token) ? null : token;
}
var WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[/\\]/;
var URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
var REGEX_METACHAR_PATTERN = /\.\*|\.\+|\\\||\\\(|\\\)|\[.*?\]|\^\//;
function rejectNonPathToken(token) {
  if (!token) return true;
  if (token.startsWith("-")) return true;
  const eqIndex = token.indexOf("=");
  const slashIndex = token.indexOf("/");
  if (eqIndex !== -1 && (slashIndex === -1 || eqIndex < slashIndex))
    return true;
  if (URL_PATTERN.test(token)) return true;
  if (token.startsWith("@") && !token.startsWith("@/")) return true;
  if (REGEX_METACHAR_PATTERN.test(token)) return true;
  return false;
}

// src/access-intent/bash/token-collection.ts
import { basename as basename2 } from "node:path";

// src/access-intent/bash/nested-execution.ts
var NESTED_EXECUTION_CONTEXTS = /* @__PURE__ */ new Map([
  ["command_substitution", "command_substitution"],
  ["process_substitution", "process_substitution"]
]);
var EXECUTION_HOST_TYPES = /* @__PURE__ */ new Set([
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "heredoc_body"
]);
function forEachNestedExecution(node, visit) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const context = NESTED_EXECUTION_CONTEXTS.get(child.type);
    if (context) {
      visit(child, context);
    } else {
      forEachNestedExecution(child, visit);
    }
  }
}

// src/access-intent/bash/token-collection.ts
function collectPathCandidateTokens(node) {
  if (node.type === "command") return collectCommandTokens(node);
  if (node.type === "file_redirect") return collectRedirectTokens(node);
  if (EXECUTION_HOST_TYPES.has(node.type)) {
    return collectHostedExecutionTokens(node);
  }
  if (SKIP_SUBTREE_TYPES.has(node.type)) return [];
  const tokens = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) tokens.push(...collectPathCandidateTokens(child));
  }
  return tokens;
}
function collectCommandTokens(node) {
  const commandName = extractCommandName(node);
  const config = commandName ? PATTERN_FIRST_COMMANDS.get(commandName) : void 0;
  const tokens = config ? collectPatternCommandTokens(node, config) : collectGenericCommandTokens(node);
  return [...tokens, ...collectEmbeddedOptionValues(node)];
}
function collectRedirectTokens(node) {
  const tokens = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (ARG_NODE_TYPES.has(child.type)) {
      tokens.push(resolveNodeText(child));
    }
    tokens.push(...collectHostedExecutionTokens(child));
  }
  return tokens;
}
function collectHostedExecutionTokens(node) {
  if (NESTED_EXECUTION_CONTEXTS.has(node.type)) {
    return collectPathCandidateTokens(node);
  }
  const tokens = [];
  forEachNestedExecution(node, (contextNode) => {
    tokens.push(...collectPathCandidateTokens(contextNode));
  });
  return tokens;
}
function extractCommandName(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_name") {
      const text = resolveNodeText(child);
      return text ? basename2(text) : void 0;
    }
  }
  return void 0;
}
var OPTION_VALUE_PATTERN = /^-{1,2}[^=\s]+=(.+)$/;
function collectEmbeddedOptionValues(node) {
  const values = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_name" || child.type === "variable_assignment")
      continue;
    if (!ARG_NODE_TYPES.has(child.type)) continue;
    const value = OPTION_VALUE_PATTERN.exec(resolveNodeText(child))?.[1];
    if (value !== void 0) values.push(value);
  }
  return values;
}
var PATTERN_FIRST_COMMANDS = /* @__PURE__ */ new Map([
  [
    "sed",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-i"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "awk",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-F", "-v"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "gawk",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-F", "-v"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "nawk",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-F", "-v"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "grep",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-A", "-B", "-C", "-m"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "egrep",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-A", "-B", "-C", "-m"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "fgrep",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-e", "-A", "-B", "-C", "-m"]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "rg",
    {
      argConsumingFlags: /* @__PURE__ */ new Set([
        "-e",
        "-A",
        "-B",
        "-C",
        "-m",
        "-g",
        "-t",
        "-T",
        "-j",
        "-M",
        "-r",
        "-E"
      ]),
      fileConsumingFlags: /* @__PURE__ */ new Set(["-f"])
    }
  ],
  [
    "sd",
    {
      argConsumingFlags: /* @__PURE__ */ new Set(["-n", "-f"]),
      fileConsumingFlags: /* @__PURE__ */ new Set([]),
      patternPositionals: 2
    }
  ]
]);
function classifyPatternCommandFlag(text, config) {
  if (text === "--") return { kind: "end-of-flags" };
  if (config.argConsumingFlags.has(text)) {
    return {
      kind: "consume-arg",
      nextArgAction: "skip",
      setsExplicitScript: text === "-e" || text === "-f"
    };
  }
  if (config.fileConsumingFlags.has(text)) {
    return {
      kind: "consume-arg",
      nextArgAction: "extract",
      setsExplicitScript: true
    };
  }
  return { kind: "regular-flag" };
}
function collectPatternCommandTokens(node, config) {
  const patternPositionals = config.patternPositionals ?? 1;
  let hasExplicitScript = false;
  let positionalsSeen = 0;
  let nextArgAction = null;
  let pastEndOfFlags = false;
  const tokens = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_name" || child.type === "variable_assignment")
      continue;
    if (!ARG_NODE_TYPES.has(child.type)) {
      tokens.push(...collectPathCandidateTokens(child));
      continue;
    }
    const text = resolveNodeText(child);
    if (nextArgAction === "skip") {
      nextArgAction = null;
      continue;
    }
    if (nextArgAction === "extract") {
      tokens.push(text);
      nextArgAction = null;
      continue;
    }
    if (!pastEndOfFlags && child.type === "word" && text.startsWith("-") && text.length > 1) {
      const directive = classifyPatternCommandFlag(text, config);
      switch (directive.kind) {
        case "end-of-flags":
          pastEndOfFlags = true;
          break;
        case "consume-arg":
          nextArgAction = directive.nextArgAction;
          if (directive.setsExplicitScript) hasExplicitScript = true;
          break;
        case "regular-flag":
          break;
      }
      continue;
    }
    if (!hasExplicitScript && positionalsSeen < patternPositionals) {
      positionalsSeen++;
      continue;
    }
    tokens.push(text);
  }
  return tokens;
}
function collectGenericCommandTokens(node) {
  const tokens = [];
  let seenCommandName = false;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_name") {
      seenCommandName = true;
      continue;
    }
    if (child.type === "variable_assignment") continue;
    if (!seenCommandName && ARG_NODE_TYPES.has(child.type)) {
      seenCommandName = true;
      continue;
    }
    if (ARG_NODE_TYPES.has(child.type)) {
      tokens.push(resolveNodeText(child));
      continue;
    }
    tokens.push(...collectPathCandidateTokens(child));
  }
  return tokens;
}

// src/expand-home.ts
import { homedir as homedir2 } from "node:os";
import { join as join8 } from "node:path";
var HOME_PREFIXES = ["~", "$HOME", "${HOME}"];
function expandHomePath(pattern) {
  for (const prefix2 of HOME_PREFIXES) {
    if (pattern === prefix2) return homedir2();
    if (!pattern.startsWith(prefix2)) continue;
    const rest = pattern.slice(prefix2.length);
    if (rest.startsWith("/") || rest.startsWith("\\")) {
      return join8(homedir2(), rest.slice(1));
    }
  }
  return pattern;
}

// src/path/canonicalize-path.ts
import { realpathSync } from "node:fs";
function canonicalizePath(absolutePath, flavor) {
  if (!absolutePath) return absolutePath;
  const { impl } = flavor;
  const root = impl.parse(absolutePath).root;
  const rest = absolutePath.slice(root.length);
  const parts = rest.split(impl.sep).filter(Boolean);
  for (let i = parts.length; i >= 0; i--) {
    const candidate = root + parts.slice(0, i).join(impl.sep);
    try {
      const real = realpathSync(candidate);
      const tail = parts.slice(i);
      return tail.length === 0 ? real : impl.join(real, ...tail);
    } catch (error) {
      const code = error.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return absolutePath;
    }
  }
  return absolutePath;
}

// src/access-intent/path-normalization.ts
function normalizePathForComparison(pathValue, base, flavor) {
  const cleaned = normalizePathPolicyLiteral(pathValue);
  return cleaned ? flavor.comparable(cleaned, base) : "";
}
function normalizePathPolicyLiteral(pathValue) {
  const trimmed = pathValue.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  const unprefixed = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return expandHomePath(unprefixed);
}
function getPathPolicyValues(pathValue, options, flavor) {
  const literal = normalizePathPolicyLiteral(pathValue);
  if (!literal) return [];
  if (literal === "*") return ["*"];
  return [
    .../* @__PURE__ */ new Set([
      ...getAbsolutePathPolicyValues(pathValue, options, flavor),
      literal
    ])
  ];
}
function getAbsolutePathPolicyValues(pathValue, options, flavor) {
  const resolveBase = options.resolveBase ?? options.cwd;
  if (!resolveBase) return [];
  const absolute = normalizePathForComparison(pathValue, resolveBase, flavor);
  if (!absolute) return [];
  return [
    absolute,
    ...getCwdRelativePathPolicyValues(absolute, options.cwd, flavor)
  ];
}
function getCwdRelativePathPolicyValues(absolute, cwd, flavor) {
  if (!cwd) return [];
  const normalizedCwd = normalizePathForComparison(cwd, cwd, flavor);
  if (!normalizedCwd) return [];
  if (absolute !== normalizedCwd && !flavor.isWithin(absolute, normalizedCwd)) {
    return [];
  }
  const relativeValue = flavor.impl.relative(normalizedCwd, absolute);
  return relativeValue ? [relativeValue] : [];
}
function canonicalNormalizePathForComparison(pathValue, base, flavor) {
  const lexical = normalizePathForComparison(pathValue, base, flavor);
  if (!lexical) return "";
  return flavor.fold(canonicalizePath(lexical, flavor));
}

// src/safe-system-paths.ts
var SAFE_SYSTEM_PATHS = /* @__PURE__ */ new Set([
  "/dev/null",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr"
]);
function isSafeSystemPath(normalizedPath) {
  return SAFE_SYSTEM_PATHS.has(normalizedPath);
}

// src/access-intent/bash/bash-path-resolver.ts
var CWD_BASE = { kind: "known", offset: "" };
var UNKNOWN_BASE = { kind: "unknown" };
var BashPathResolver = class {
  constructor(normalizer, workdir) {
    this.normalizer = normalizer;
    this.workdir = workdir;
  }
  normalizer;
  workdir;
  /**
   * Resolve a parsed bash program's path references into its external-path and
   * rule-candidate slices, walking the AST exactly once.
   *
   * When a `workdir` is set (an aliased shell tool's working directory, #574),
   * it seeds the initial effective base — as if the program were prefixed with
   * `cd <workdir>` — so relative tokens resolve against it, and the `workdir`
   * itself is added to the external paths when it resolves outside the cwd.
   * Containment is always measured against the session cwd baked into the
   * normalizer, so a `workdir` outside the cwd does not widen the sandbox.
   */
  resolve(rootNode) {
    const initialBase = this.workdir === void 0 ? CWD_BASE : this.deriveBaseFromCdTarget(CWD_BASE, this.workdir);
    const candidates = this.collectPathCandidates(rootNode, initialBase);
    return {
      externalPaths: this.withWorkdirExternal(
        this.projectExternalPaths(candidates)
      ),
      ruleCandidates: this.projectRuleCandidates(candidates)
    };
  }
  /**
   * Prepend the `workdir`'s own {@link AccessPath} to the external paths when it
   * resolves outside the cwd. A real `cd /etc` flags `/etc` via its argument
   * token; the seeded base carries no such token, so it is added explicitly and
   * deduplicated against the command's own external tokens (#574).
   */
  withWorkdirExternal(tokenExternals) {
    if (this.workdir === void 0) return [...tokenExternals];
    const wdPath = this.normalizer.forBashToken(this.workdir);
    const canonical = wdPath.boundaryValue();
    const isExternal = canonical ? this.normalizer.isBoundaryOutsideWorkingDirectory(canonical) : true;
    if (!isExternal) return [...tokenExternals];
    const key = canonical || wdPath.value();
    const alreadyPresent = tokenExternals.some(
      (p) => (p.boundaryValue() || p.value()) === key
    );
    return alreadyPresent ? [...tokenExternals] : [wdPath, ...tokenExternals];
  }
  // ── AST walk — collect PathCandidates ──────────────────────────────────
  /**
   * Walk the AST once, collecting every path-candidate token tagged with the
   * effective working directory projected onto its position.
   *
   * The effective directory is stateful: it starts at `cwd` and each
   * current-shell `cd <literal>` (joined by `&&`, `||`, `;`, or a newline)
   * folds into it for subsequent commands.
   * A `cd` inside a pipeline or a backgrounded command runs in a subshell and
   * does not update the running directory; subshell and brace-group interiors
   * inherit the enclosing base without folding their own `cd`s (a conservative
   * first tier).
   */
  collectPathCandidates(rootNode, initialBase) {
    const out = [];
    this.walkForCandidates(rootNode, initialBase, out);
    return out;
  }
  /**
   * Collect a single node's candidates tagged with `base`, returning the
   * effective base in force *after* the node (the input base unless the node is
   * a current-shell `cd <literal>` that folds the running directory).
   */
  walkForCandidates(node, base, out) {
    switch (node.type) {
      case "program":
      case "list":
      case "redirected_statement":
        return this.walkCurrentShellSequence(node, base, out);
      case "command":
        tagTokens(collectCommandTokens(node), base, out);
        return this.foldCd(node, base);
      case "pipeline":
        return this.walkPipeline(node, base, out);
      case "subshell":
        this.walkCurrentShellSequence(node, base, out);
        return base;
      case "compound_statement":
        return this.walkCurrentShellSequence(node, base, out);
      default:
        tagTokens(collectPathCandidateTokens(node), base, out);
        return base;
    }
  }
  /**
   * Fold a current-shell sequence (`program` / `list` / `redirected_statement`):
   * thread the effective base left-to-right through the children so a `cd`
   * updates the base for following siblings.
   * A statement immediately followed by the background operator (`&`) runs in a
   * subshell, so its folded base is discarded.
   */
  walkCurrentShellSequence(seqNode, base, out) {
    let current = base;
    for (let i = 0; i < seqNode.childCount; i++) {
      const child = seqNode.child(i);
      if (!child?.isNamed) continue;
      if (SKIP_SUBTREE_TYPES.has(child.type)) continue;
      const after = this.walkForCandidates(child, current, out);
      current = isBackgrounded(seqNode, i) ? current : after;
    }
    return current;
  }
  /**
   * Walk a `pipeline` node, returning the effective base in force after it.
   *
   * Each stage of a true pipeline (`A | B | C`) runs in a subshell, so a `cd`
   * inside any stage must not leak — the base normally passes through unchanged.
   * The exception is the first stage: tree-sitter-bash wraps a redirect-bearing
   * current-shell `&&`/`;` list (`cd a && pnpm x 2>&1 | tail`) as that stage,
   * and bash precedence makes the list's leading commands current-shell, so they
   * fold and the folded base persists past the pipeline to following siblings.
   *
   * The terminal command of the first stage is the real pipe stage (a subshell)
   * and must not fold; every stage after a `|` is a downstream subshell stage
   * and collects tokens against the folded base without folding (#454).
   */
  walkPipeline(node, base, out) {
    let current = base;
    let first = true;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child?.isNamed) continue;
      if (SKIP_SUBTREE_TYPES.has(child.type)) continue;
      if (first) {
        current = this.foldPipelineFirstStage(child, current, out);
        first = false;
        continue;
      }
      tagTokens(collectPathCandidateTokens(child), current, out);
    }
    return current;
  }
  /**
   * Collect the first pipe stage's candidates, folding its leading current-shell
   * `cd` commands when tree-sitter wrapped a `list` or `redirected_statement`
   * around them.
   * The terminal command of that container is the real pipe stage (a subshell)
   * and is collected without folding.
   * A bare `command` first stage (a true pipeline first stage such as
   * `cd nested | cat ../b`) is a subshell: it collects against the input base
   * and does not fold.
   */
  foldPipelineFirstStage(node, base, out) {
    if (node.type === "list")
      return this.foldListExceptTerminal(node, base, out);
    if (node.type === "redirected_statement") {
      let current = base;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child?.isNamed) continue;
        if (child.type === "file_redirect") {
          tagTokens(collectRedirectTokens(child), current, out);
          continue;
        }
        current = this.foldPipelineFirstStage(child, current, out);
      }
      return current;
    }
    tagTokens(collectPathCandidateTokens(node), base, out);
    return base;
  }
  /**
   * Fold every named, non-skip child of a `list` except the last, threading the
   * effective base left-to-right through the leading current-shell commands; the
   * terminal child is the real pipe stage and is collected without folding.
   */
  foldListExceptTerminal(node, base, out) {
    const namedChildren = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.isNamed && !SKIP_SUBTREE_TYPES.has(child.type)) {
        namedChildren.push(child);
      }
    }
    let current = base;
    for (let i = 0; i < namedChildren.length; i++) {
      const child = namedChildren[i];
      if (i < namedChildren.length - 1) {
        current = this.walkForCandidates(child, current, out);
      } else {
        tagTokens(collectPathCandidateTokens(child), current, out);
      }
    }
    return current;
  }
  /**
   * Compute the effective base after a command runs.
   * Returns `base` unchanged unless the command is `cd`:
   *
   * - `cd /abs` (absolute literal) → a fresh known base, recovering from an
   *   earlier unknown base. On win32 a drive-mount target (`cd /c/x`) folds to
   *   its translated Windows base, while a non-mount POSIX absolute
   *   (`cd /tmp`) is not deterministically resolvable and yields unknown (#533).
   * - `cd rel` (relative literal) → fold into a known base, or stay unknown if
   *   the base was already unknown.
   * - `cd "$DIR"` / `cd $(…)` / `cd -` / bare `cd` / `cd ~…` (non-literal) →
   *   unknown.
   *
   * The target's platform/MSYS interpretation is delegated to the
   * {@link PathNormalizer}; this method owns only the base-folding state.
   */
  foldCd(commandNode, base) {
    if (extractCommandName(commandNode) !== "cd") return base;
    const target = cdLiteralTarget(commandNode);
    if (target === null) return UNKNOWN_BASE;
    return this.deriveBaseFromCdTarget(base, target);
  }
  /**
   * Fold a literal `cd`/working-directory target string into the effective
   * base, delegating the platform/MSYS interpretation to the
   * {@link PathNormalizer}. Owns only the base-folding state:
   *
   * - `absolute` → a fresh known base (recovers from an earlier unknown base).
   * - `unknown` → the base becomes conservatively unknown.
   * - `relative` → join into a known base, or stay unknown if already unknown.
   *
   * Shared by {@link foldCd} (inline `cd` commands) and the initial-base seed
   * (an aliased shell tool's `workdir`, an implicit leading `cd <workdir>`).
   */
  deriveBaseFromCdTarget(base, target) {
    const interpreted = this.normalizer.interpretBashCdTarget(target);
    switch (interpreted.kind) {
      case "absolute":
        return { kind: "known", offset: interpreted.value };
      case "unknown":
        return UNKNOWN_BASE;
      case "relative":
        if (base.kind === "unknown") return UNKNOWN_BASE;
        return {
          kind: "known",
          offset: this.normalizer.joinBase(base.offset, target)
        };
    }
  }
  // ── Projection ─────────────────────────────────────────────────────────
  /**
   * Project the collected candidates into deduplicated external paths.
   *
   * Filters candidates through the strict path classifier
   * (`classifyTokenAsPathCandidate`), resolves each against its effective working
   * directory base, and returns only paths that resolve outside the baked cwd in
   * their lexical (as-typed, normalized but not symlink-resolved) form.
   *
   * The outside-cwd decision and the dedup identity use the canonical
   * (symlink-resolved) form so `external_directory` config patterns match the
   * path as the user typed it (#418).
   */
  projectExternalPaths(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const externalPaths = [];
    for (const { token, base } of candidates) {
      const candidate = classifyTokenAsPathCandidate(token);
      if (!candidate) {
        const probed = this.probeBareToken(token, base);
        if (probed) this.collectIfExternal(probed.path, seen, externalPaths);
        continue;
      }
      if (base.kind === "unknown" && this.isRelativeCandidate(candidate)) {
        const accessPath = this.normalizer.forPath(candidate);
        const canonical = accessPath.boundaryValue();
        if (canonical && !isSafeSystemPath(canonical) && !seen.has(canonical)) {
          seen.add(canonical);
          externalPaths.push(accessPath);
        }
        continue;
      }
      const resolveBase = base.kind === "known" ? this.normalizer.resolveBase(base.offset) : void 0;
      this.collectIfExternal(
        this.normalizer.forBashToken(candidate, { resolveBase }),
        seen,
        externalPaths
      );
    }
    return externalPaths;
  }
  /**
   * Record `accessPath` when it resolves outside the working directory and has
   * not already been collected.
   *
   * The boundary decision and dedup identity use the canonical
   * (symlink-resolved) form the {@link AccessPath} already derived, while the
   * stored value keeps the lexical form so config patterns match the path as
   * the user typed it (#418). A win32 device path preserves `/dev/null` as its
   * boundary value, so `isBoundaryOutsideWorkingDirectory` reaches the
   * safe-path exclusion (#533).
   *
   * A literal-only bash token (a win32 non-mount POSIX absolute like `/tmp`)
   * has no canonical form; it is foreign to the win32 cwd, so it is always
   * external. Its lexical value is the dedup identity so two distinct
   * literal-only paths do not collapse (#533).
   */
  collectIfExternal(accessPath, seen, out) {
    const lexical = accessPath.value();
    if (!lexical) return;
    const canonical = accessPath.boundaryValue();
    const isExternal = canonical ? this.normalizer.isBoundaryOutsideWorkingDirectory(canonical) : true;
    const dedupKey = canonical || lexical;
    if (isExternal && !seen.has(dedupKey)) {
      seen.add(dedupKey);
      out.push(accessPath);
    }
  }
  /**
   * Project the collected candidates into rule candidates with their cd-aware
   * policy lookup values.
   *
   * Filters candidates through the broad path classifier
   * (`classifyTokenAsRuleCandidate`), falling back to {@link probeBareToken}
   * for a bare token the broad classifier rejects for shape — admitted only
   * when it names an existing filesystem entry (#645).
   * On win32 the broad classifier is told to treat a backslash as a path
   * separator, so a backslash-relative token (`dir\file`) is recognized as a
   * rule candidate the same as its forward-slash equivalent (#520); on POSIX
   * `\` is a legal filename character, so the token stays bare there.
   * Pairs each qualifying token with its set of policy values (absolute +
   * project-relative + raw).
   * A token after a non-literal `cd` keeps only its literal value so no
   * spurious absolute rule can match (#393).
   */
  projectRuleCandidates(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const { token, base } of candidates) {
      const shaped = classifyTokenAsRuleCandidate(
        token,
        this.normalizer.flavor
      );
      const candidate = shaped === null ? this.probeBareToken(token, base) : { token: shaped, path: this.buildRuleCandidatePath(shaped, base) };
      if (!candidate) continue;
      const matchValues = candidate.path.matchValues();
      if (matchValues.length === 0) continue;
      const key = matchValues.join("\0");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(candidate);
    }
    return result;
  }
  /**
   * Promote a bare token the shape gates rejected, when it names an existing
   * filesystem entry — the existence probe (ADR 0009, #645).
   *
   * Most bash argument tokens are not paths (`status`, `build`, `main`), so a
   * bare token is admitted only when the filesystem confirms it names something
   * real. Candidacy therefore comes from the filesystem and never from the
   * ruleset, which keeps the classifiers pure and lets a symlink be matched by
   * rules naming its *target* — the case raw-token matching could not see.
   *
   * Returns `null` when the token's shape rules out a path, when the effective
   * base is unknown (no concrete directory to resolve against, so the token
   * stays unpromoted per #393 conservatism), or when nothing exists at the
   * resolved location.
   *
   * Shared by both projections so a promoted token is identical whether it is
   * being matched against `path` rules or tested against the cwd boundary.
   */
  probeBareToken(token, base) {
    const bare = classifyBareTokenCandidate(token);
    if (bare === null) return null;
    if (base.kind !== "known") return null;
    const path = this.normalizer.forBashToken(bare, {
      resolveBase: this.normalizer.resolveBase(base.offset)
    });
    const lexical = path.value();
    if (!lexical || !this.normalizer.entryExists(lexical)) return null;
    return { token: bare, path };
  }
  buildRuleCandidatePath(candidate, base) {
    if (base.kind === "unknown" && this.isRelativeCandidate(candidate)) {
      return this.normalizer.forLiteral(normalizePathPolicyLiteral(candidate));
    }
    const resolveBase = base.kind === "known" ? this.normalizer.resolveBase(base.offset) : void 0;
    return this.normalizer.forBashToken(candidate, { resolveBase });
  }
  /**
   * True when a path candidate is relative (resolved against the effective
   * directory) rather than absolute or home-relative (`~…`), which are
   * base-independent.
   *
   * Delegates the absoluteness decision to the platform-aware `PathNormalizer`
   * rather than a POSIX-only `startsWith("/")` check, so Windows drive-letter
   * paths (`C:/…`, `C:\…`) are correctly treated as absolute on win32 and as
   * relative on POSIX (where they denote an in-CWD path).
   */
  isRelativeCandidate(candidate) {
    return !this.normalizer.isAbsolute(candidate) && !candidate.startsWith("~");
  }
};
function isBackgrounded(seqNode, index) {
  const next = seqNode.child(index + 1);
  if (!next || next.isNamed) return false;
  return next.type === "&";
}
function tagTokens(tokens, base, out) {
  for (const token of tokens) out.push({ token, base });
}
function cdLiteralTarget(commandNode) {
  for (let i = 0; i < commandNode.childCount; i++) {
    const child = commandNode.child(i);
    if (!child) continue;
    if (child.type === "command_name" || child.type === "variable_assignment")
      continue;
    if (!child.isNamed) continue;
    if (child.type === "word" && child.text === "--") continue;
    if (!ARG_NODE_TYPES.has(child.type)) return null;
    return literalTextOf(child);
  }
  return null;
}
function literalTextOf(node) {
  switch (node.type) {
    case "word": {
      const text = node.text;
      if (text === "-" || text.startsWith("~")) return null;
      return text;
    }
    case "raw_string": {
      const text = node.text;
      return text.length >= 2 && text.startsWith("'") && text.endsWith("'") ? text.slice(1, -1) : text;
    }
    case "concatenation": {
      let result = "";
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        const part = literalTextOf(child);
        if (part === null) return null;
        result += part;
      }
      return result;
    }
    case "string": {
      let result = "";
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        if (child.type === '"') continue;
        if (child.type !== "string_content") return null;
        result += child.text;
      }
      return result;
    }
    default:
      return null;
  }
}

// src/access-intent/bash/wrapper-analysis.ts
function classifyWrapperWords(words) {
  const commandName = wrapperName(words);
  if (commandName === void 0) return void 0;
  const args = words.slice(1).map((word) => word.text);
  if (commandName === "eval") return "opaque-payload";
  if (SHELL_WRAPPER_NAMES.has(commandName) && hasShortFlagC(args)) {
    return "opaque-payload";
  }
  if (INDIRECTION_WRAPPER_NAMES.has(commandName)) return "indirection";
  if (execFlagIndex(commandName, args) !== -1) return "indirection";
  return void 0;
}
function executedUnitOf(unitText, words) {
  let text = unitText;
  let current = words;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
    const kind = classifyWrapperWords(current);
    if (kind === void 0) break;
    if (kind === "opaque-payload") {
      return nothingNew(opaquePayload(current), unitText);
    }
    const start = innerCommandIndex(current);
    if (start === -1 || start >= current.length) break;
    const end = execTerminatorIndex(current, start);
    text = sliceWords(text, current, start, end).trimEnd();
    current = rebase(current, start, end);
  }
  return nothingNew(text, unitText);
}
var MAX_UNWRAP_DEPTH = 4;
function nothingNew(text, unitText) {
  if (text === null || text === "" || text === unitText) return null;
  return text.startsWith("-") ? null : text;
}
function opaquePayload(words) {
  const args = words.slice(1);
  const flagIndex = shortFlagCIndex(args.map((word) => word.text));
  const payload = args[flagIndex + 1];
  return payload === void 0 ? null : unquote(payload.text);
}
function unquote(text) {
  const first = text.at(0);
  const quoted = (first === "'" || first === '"') && text.length >= 2 && text.endsWith(first);
  return quoted ? text.slice(1, -1) : text;
}
function innerCommandIndex(words) {
  const name = wrapperName(words);
  if (name === void 0) return -1;
  const argTexts = words.slice(1).map((word) => word.text);
  const execFlag = execFlagIndex(name, argTexts);
  if (execFlag !== -1) return execFlag + 2;
  const valueTaking = VALUE_TAKING_FLAGS.get(name) ?? EMPTY_FLAGS;
  let operandPending = LEADING_OPERAND_WRAPPERS.has(name);
  let index = 1;
  while (index < words.length) {
    const word = words[index].text;
    if (word === "--") return index + 1;
    if (isEnvironmentAssignment(word)) {
      index++;
      continue;
    }
    if (word.startsWith("-")) {
      index += valueTaking.has(word) ? 2 : 1;
      continue;
    }
    if (operandPending) {
      operandPending = false;
      index++;
      continue;
    }
    return index;
  }
  return -1;
}
function execTerminatorIndex(words, start) {
  const terminator = words.findIndex(
    (word, index) => index >= start && EXEC_TERMINATORS.has(word.text.replace(/^\\/, ""))
  );
  return terminator === -1 ? words.length : terminator;
}
function sliceWords(unitText, words, start, end) {
  const from = words[start].offset;
  return end < words.length ? unitText.slice(from, words[end].offset) : unitText.slice(from);
}
function rebase(words, start, end) {
  const origin = words[start].offset;
  return words.slice(start, end).map((word) => ({ text: word.text, offset: word.offset - origin }));
}
function isEnvironmentAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}
var SHELL_WRAPPER_NAMES = /* @__PURE__ */ new Set(["bash", "sh", "dash", "zsh", "ksh"]);
var INDIRECTION_WRAPPER_NAMES = /* @__PURE__ */ new Set([
  "sudo",
  "env",
  "xargs",
  "time",
  "nohup",
  "timeout",
  "nice",
  // Exec-capable rewrites and prefix wrappers surveyed in #575: parallelizers
  // (parallel/rust-parallel/rush), a sudo rewrite (doas), and prefix wrappers
  // (setsid/stdbuf/watch/flock) that all always invoke a following command.
  "parallel",
  "rust-parallel",
  "rush",
  "doas",
  "setsid",
  "stdbuf",
  "watch",
  "flock"
]);
var EXEC_CONDITIONAL_WRAPPERS = /* @__PURE__ */ new Map([
  ["find", /* @__PURE__ */ new Set(["-exec", "-execdir", "-ok", "-okdir"])],
  ["fd", /* @__PURE__ */ new Set(["-x", "--exec", "-X", "--exec-batch"])]
]);
var VALUE_TAKING_FLAGS = /* @__PURE__ */ new Map([
  ["sudo", /* @__PURE__ */ new Set(["-u", "-g", "-p", "-C", "-h", "-U", "-r", "-t"])],
  ["doas", /* @__PURE__ */ new Set(["-u", "-C"])],
  ["env", /* @__PURE__ */ new Set(["-u", "-C", "--unset", "--chdir"])],
  [
    "xargs",
    /* @__PURE__ */ new Set(["-n", "-P", "-I", "-i", "-d", "-E", "-L", "-l", "-s", "-a"])
  ],
  ["timeout", /* @__PURE__ */ new Set(["-s", "-k", "--signal", "--kill-after"])],
  ["nice", /* @__PURE__ */ new Set(["-n", "--adjustment"])],
  ["time", /* @__PURE__ */ new Set(["-o", "-f", "--output", "--format"])],
  ["stdbuf", /* @__PURE__ */ new Set(["-i", "-o", "-e", "--input", "--output", "--error"])],
  ["watch", /* @__PURE__ */ new Set(["-n", "--interval"])],
  ["flock", /* @__PURE__ */ new Set(["-w", "-E", "--timeout", "--conflict-exit-code"])]
]);
var EMPTY_FLAGS = /* @__PURE__ */ new Set();
var LEADING_OPERAND_WRAPPERS = /* @__PURE__ */ new Set(["timeout", "flock"]);
var EXEC_TERMINATORS = /* @__PURE__ */ new Set([";", "+"]);
function wrapperName(words) {
  return words.length === 0 ? void 0 : basename3(words[0].text);
}
function hasShortFlagC(args) {
  return shortFlagCIndex(args) !== -1;
}
function shortFlagCIndex(args) {
  for (const [index, arg] of args.entries()) {
    if (arg === "--") return -1;
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.includes("c")) {
      return index;
    }
  }
  return -1;
}
function execFlagIndex(commandName, args) {
  const execFlags = EXEC_CONDITIONAL_WRAPPERS.get(commandName);
  if (!execFlags) return -1;
  return args.findIndex((arg) => execFlags.has(arg));
}
function basename3(name) {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

// src/access-intent/bash/command-enumeration.ts
var COMMAND_ENUM_DESCEND = /* @__PURE__ */ new Set([
  "program",
  "list",
  "pipeline",
  "redirected_statement"
]);
var COMMAND_ENUM_SKIP = /* @__PURE__ */ new Set(["comment", "heredoc_end"]);
function collectCommands(node) {
  const out = [];
  collectCommandsInto(node, void 0, out);
  return out;
}
function collectCommandsInto(node, context, out) {
  if (!node.isNamed) return;
  if (COMMAND_ENUM_SKIP.has(node.type)) return;
  if (node.type === "command") {
    out.push(makeCommandUnit(node, context));
    collectHostedCommands(node, out);
    return;
  }
  if (EXECUTION_HOST_TYPES.has(node.type)) {
    collectHostedCommands(node, out);
    return;
  }
  if (node.type === "subshell") {
    out.push(makeUnit(node.text, context));
    descendCommandChildren(node, "subshell", out);
    return;
  }
  if (COMMAND_ENUM_DESCEND.has(node.type)) {
    descendCommandChildren(node, context, out);
    return;
  }
  out.push(makeUnit(node.text, context));
}
function makeUnit(text, context, wrapperKind, executedUnit) {
  const unit = context ? { text, context } : { text };
  const flagged = wrapperKind ? { ...unit, wrapperKind } : unit;
  return executedUnit === void 0 ? flagged : { ...flagged, executedUnit };
}
function makeCommandUnit(node, context) {
  const text = commandUnitText(node);
  const words = readCommandWords(node);
  return makeUnit(
    text,
    context,
    classifyWrapperWords(words),
    executedUnitOf(text, words) ?? void 0
  );
}
function readCommandWords(node) {
  const words = [];
  let unitStart;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child?.isNamed) continue;
    if (child.type === "variable_assignment") continue;
    unitStart ??= child.startIndex;
    words.push({ text: child.text, offset: child.startIndex - unitStart });
  }
  return words;
}
function commandUnitText(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.isNamed && child.type !== "variable_assignment") {
      return node.text.slice(child.startIndex - node.startIndex);
    }
  }
  return node.text;
}
function descendCommandChildren(node, context, out) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectCommandsInto(child, context, out);
  }
}
function collectHostedCommands(node, out) {
  forEachNestedExecution(node, (contextNode, context) => {
    descendCommandChildren(contextNode, context, out);
  });
}

// src/access-intent/bash/program.ts
var BashProgram = class _BashProgram {
  constructor(sourceCommand, commandUnits, resolvedExternalPaths, resolvedRuleCandidates) {
    this.sourceCommand = sourceCommand;
    this.commandUnits = commandUnits;
    this.resolvedExternalPaths = resolvedExternalPaths;
    this.resolvedRuleCandidates = resolvedRuleCandidates;
  }
  sourceCommand;
  commandUnits;
  resolvedExternalPaths;
  resolvedRuleCandidates;
  /**
   * Parse a bash command into a born-ready `BashProgram`.
   *
   * Uses tree-sitter-bash to build the full AST, enumerates command units and
   * walks path-candidate tokens once, then eagerly resolves all three slices
   * through the injected {@link PathNormalizer} (platform + cwd baked in).
   * Heredoc bodies, comments, and other non-argument content are skipped. An
   * unparseable command yields an empty program.
   *
   * A bare token (e.g. `id_rsa`, `outside-link`) enters both slices when it
   * names an existing filesystem entry — the existence probe the resolver owns
   * (ADR 0009, #645). No policy is consulted, so every caller gets identical
   * slices for a given command and working directory.
   *
   * `options.workdir`, when supplied (an aliased shell tool's working directory,
   * #574), seeds the initial effective base — as if the command were prefixed
   * with `cd <workdir>` — so relative tokens resolve against it, and the workdir
   * itself is flagged as external when it resolves outside the cwd.
   */
  static async parse(command, normalizer, options) {
    const parser = await getParser();
    const tree = parser.parse(command);
    if (!tree) return new _BashProgram(command, [], [], []);
    try {
      const { externalPaths, ruleCandidates } = new BashPathResolver(
        normalizer,
        options?.workdir
      ).resolve(tree.rootNode);
      return new _BashProgram(
        command,
        collectCommands(tree.rootNode),
        externalPaths,
        ruleCandidates
      );
    } finally {
      tree.delete();
    }
  }
  /**
   * The source command string this program was parsed from.
   *
   * The bash gates read this for prompts, logs, and decision display instead of
   * receiving the command as a separate parameter — the program is the parsed
   * command, so it owns its source text (#574). Native `bash` and an aliased
   * shell tool alike reach the gates through this single collaborator.
   */
  commandText() {
    return this.sourceCommand;
  }
  /**
   * The top-level command-pattern units of the chain, in source order.
   *
   * Splits on the shell chain operators (`&&`, `||`, `;`, `|`, `&`, newlines);
   * quotes, command substitution, and subshells are respected by the parser and
   * are NOT split — a subshell or other compound statement is emitted whole.
   * Each unit has any leading `variable_assignment` prefix stripped, and a
   * wrapper unit (`bash -c`/`eval`, or an indirection wrapper such as `sudo`) is
   * tagged with a `wrapperKind` so its decision is floored to `ask`.
   * May be empty (e.g. an empty command or a comment-only line); callers fall
   * back to the whole command so the surface is never evaluated weaker than
   * before.
   */
  commands() {
    return [...this.commandUnits];
  }
  /**
   * Deduplicated paths that resolve outside `cwd`, as {@link AccessPath} value
   * objects holding both the lexical (as-typed) and canonical (symlink-resolved)
   * forms behind distinct accessors.
   *
   * Resolved eagerly at parse time through the `PathNormalizer` supplied to
   * `parse()` (platform + cwd baked in).
   * Use `.matchValues()` for `external_directory` pattern matching and
   * `.boundaryValue()` for containment checks; `.value()` for display and logs.
   */
  externalPaths() {
    return [...this.resolvedExternalPaths];
  }
  /**
   * Path-rule candidates paired with their policy lookup values.
   *
   * Resolved eagerly at parse time through the `PathNormalizer` supplied to
   * `parse()` (platform + cwd baked in).
   * Each token is resolved against the effective working directory in force at
   * the token's position (folding literal current-shell `cd` commands), while
   * raw and project-relative aliases are retained for backward-compatible
   * relative rules. A token after a non-literal `cd` keeps only its literal
   * value so no spurious absolute rule can match (#393).
   */
  pathRuleCandidates() {
    return [...this.resolvedRuleCandidates];
  }
};

// src/access-intent/tool-input-path.ts
function getPathBearingToolPath(toolName, input) {
  if (classifyToolKind(toolName) !== "path") {
    return null;
  }
  return getNonEmptyString(toRecord(input).path);
}
function getToolInputPath(toolName, input, extractors) {
  const record = toRecord(input);
  switch (classifyToolKind(toolName)) {
    case "bash":
      return null;
    case "path":
      return getNonEmptyString(record.path);
    case "mcp":
      return getNonEmptyString(toRecord(record.arguments).path);
    case "skill":
    case "extension": {
      const custom = extractors?.get(toolName);
      if (custom) {
        return getNonEmptyString(custom(record));
      }
      return getNonEmptyString(record.path);
    }
  }
}

// src/tool-input-prompt-formatters.ts
function getPromptPath(input) {
  return getNonEmptyString(input.path) ?? getNonEmptyString(input.file_path);
}
function formatEditInputForPrompt(input) {
  const path = getPromptPath(input);
  const rawEdits = Array.isArray(input.edits) ? input.edits : typeof input.oldText === "string" && typeof input.newText === "string" ? [{ oldText: input.oldText, newText: input.newText }] : [];
  const edits = rawEdits.map((edit) => toRecord(edit)).filter(
    (edit) => typeof edit.oldText === "string" && typeof edit.newText === "string"
  );
  const pathPart = path ? `for '${path}'` : "";
  if (edits.length === 0) {
    return pathPart ? `${pathPart} with edit input` : "with edit input";
  }
  const firstEdit = edits[0];
  const oldText = String(firstEdit.oldText);
  const newText = String(firstEdit.newText);
  const firstEditSummary = `edit #1 replaces ${formatCount(countTextLines(oldText), "line", "lines")} with ${formatCount(countTextLines(newText), "line", "lines")}`;
  const extraEdits = edits.length > 1 ? `, plus ${formatCount(edits.length - 1, "additional edit", "additional edits")}` : "";
  const summary = `(${formatCount(edits.length, "replacement", "replacements")}: ${firstEditSummary}${extraEdits})`;
  return pathPart ? `${pathPart} ${summary}` : summary;
}
function formatWriteInputForPrompt(input) {
  const path = getPromptPath(input);
  const content = typeof input.content === "string" ? input.content : "";
  const summary = `(${formatCount(countTextLines(content), "line", "lines")}, ${formatCount(content.length, "character", "characters")})`;
  return path ? `for '${path}' ${summary}` : summary;
}
function formatReadInputForPrompt(input) {
  const path = getPromptPath(input);
  const parts = path ? [`path '${path}'`] : [];
  if (typeof input.offset === "number") {
    parts.push(`offset ${input.offset}`);
  }
  if (typeof input.limit === "number") {
    parts.push(`limit ${input.limit}`);
  }
  return parts.length > 0 ? `for ${parts.join(", ")}` : "";
}

// src/tool-preview-formatter.ts
function resolveToolPreviewLimits() {
  return {
    toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
    toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH
  };
}
var ToolPreviewFormatter = class {
  constructor(options, customFormatters) {
    this.options = options;
    this.customFormatters = customFormatters;
  }
  options;
  customFormatters;
  // ── Prompt formatting ───────────────────────────────────────────────────
  /**
   * Collapse whitespace, trim, and truncate a string to fit inline.
   * An explicit `maxLength` overrides the constructor default.
   */
  sanitizeInlineText(value, maxLength) {
    const limit = maxLength ?? this.options.toolTextSummaryMaxLength;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized ? truncateInlineText(normalized, limit) : "empty text";
  }
  /** Serialize `input` to inline JSON and truncate at `toolInputPreviewMaxLength`. */
  formatJsonInputForPrompt(input) {
    const inline = serializeToolInputPreview(input);
    return inline ? `with input ${truncateInlineText(inline, this.options.toolInputPreviewMaxLength)}` : "";
  }
  /** Format search-tool (grep/find/ls) input for a permission prompt. */
  formatSearchInputForPrompt(toolName, input) {
    const parts = [];
    const path = getPromptPath(input);
    const pattern = getNonEmptyString(input.pattern);
    const glob = getNonEmptyString(input.glob);
    if (pattern) {
      parts.push(`pattern '${this.sanitizeInlineText(pattern)}'`);
    }
    if (glob) {
      parts.push(`glob '${this.sanitizeInlineText(glob)}'`);
    }
    if (path) {
      parts.push(`path '${path}'`);
    } else if (toolName === "find" || toolName === "grep" || toolName === "ls") {
      parts.push("current working directory");
    }
    return parts.length > 0 ? `for ${parts.join(", ")}` : "";
  }
  /**
   * Format any tool input for display in a permission ask-prompt.
   *
   * Dispatches to the appropriate pure formatter for known tools
   * and falls back to inline JSON for everything else.
   */
  formatToolInputForPrompt(toolName, input) {
    const inputRecord = toRecord(input);
    const custom = this.customFormatters?.get(toolName);
    if (custom) {
      const rendered = custom(inputRecord);
      if (rendered !== void 0) {
        return rendered;
      }
    }
    switch (toolName) {
      case "edit":
        return formatEditInputForPrompt(inputRecord);
      case "write":
        return formatWriteInputForPrompt(inputRecord);
      case "read":
        return formatReadInputForPrompt(inputRecord);
      case "find":
      case "grep":
      case "ls":
        return this.formatSearchInputForPrompt(toolName, inputRecord);
      case "mcp":
        return "";
      default:
        return this.formatJsonInputForPrompt(input);
    }
  }
  // ── Log formatting ──────────────────────────────────────────────────────
  /**
   * Serialize `input` to inline JSON for the review log, masking
   * sensitive-keyed values.
   *
   * Unbounded here: the writer narrows every field it persists to
   * `reviewLogFieldMaxWidth`, so a second bound at the producer would be a
   * limit the operator cannot see or change.
   */
  formatGenericToolInputForLog(input) {
    const inline = serializeRedactedToolInputPreview(input);
    return inline ? `input ${inline}` : void 0;
  }
  /** Derive a loggable input preview string for the review log. */
  getToolInputPreviewForLog(result, input, pathBearingTools) {
    if (classifyToolKind(result.toolName) === "bash" || isMcpCheck(result)) {
      return void 0;
    }
    if (pathBearingTools.has(result.toolName)) {
      return this.formatToolInputForPrompt(result.toolName, input) || void 0;
    }
    return this.formatGenericToolInputForLog(input);
  }
  /** Build the structured log context object for a permission review log entry. */
  getPermissionLogContext(result, input, pathBearingTools) {
    return {
      command: result.command,
      target: result.target,
      toolInputPreview: this.getToolInputPreviewForLog(
        result,
        input,
        pathBearingTools
      ),
      origin: result.origin
    };
  }
};

// src/handlers/gates/candidate-check.ts
var RESTRICTIVENESS = {
  allow: 0,
  ask: 1,
  deny: 2
};
function pickMostRestrictive(results) {
  let worst;
  for (const result of results) {
    if (worst === void 0 || RESTRICTIVENESS[result.state] > RESTRICTIVENESS[worst.state]) {
      worst = result;
    }
  }
  return worst;
}

// src/handlers/gates/bash-command.ts
var WRAPPER_SENTINEL = {
  "opaque-payload": "<opaque-bash-wrapper>",
  indirection: "<indirection-bash-wrapper>"
};
function resolveBashCommandCheck(command, commands, agentName, resolver) {
  if (commands.length === 0) {
    if (isTriviallyEmptyCommand(command)) {
      return resolveWholeCommand(command, agentName, resolver);
    }
    const whole = resolveWholeCommand(command, agentName, resolver);
    if (whole.state === "deny") {
      return whole;
    }
    return {
      state: "ask",
      toolName: "bash",
      source: "bash",
      origin: "builtin",
      command,
      matchedPattern: "<unparseable-bash-command>"
    };
  }
  const results = commands.map((cmd) => {
    const base = resolver.resolve({
      kind: "tool",
      surface: "bash",
      input: { command: cmd.text },
      agentName
    });
    const floored = cmd.wrapperKind && base.state === "allow" ? {
      ...base,
      state: "ask",
      matchedPattern: WRAPPER_SENTINEL[cmd.wrapperKind]
    } : base;
    const result = cmd.context ? { ...floored, commandContext: cmd.context } : floored;
    return cmd.executedUnit === void 0 ? result : { ...result, executedUnit: cmd.executedUnit };
  });
  return pickMostRestrictive(results) ?? resolveWholeCommand(command, agentName, resolver);
}
function isTriviallyEmptyCommand(command) {
  const lines = command.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines.every((line) => line.startsWith("#"));
}
function resolveWholeCommand(command, agentName, resolver) {
  return resolver.resolve({
    kind: "tool",
    surface: "bash",
    input: { command },
    agentName
  });
}

// src/presentation/path-ask-payload.ts
function buildPathAskPayload(facts) {
  return pathPayload("path", "path", facts, []);
}
function buildExternalDirectoryAskPayload(facts) {
  return pathPayload("external_directory", "external_directory", facts, [
    ...resolvedAliasEvidence(facts.resolvedPath),
    workingDirectoryEvidence(facts.cwd)
  ]);
}
function buildBashExternalDirectoryAskPayload(facts) {
  return {
    kind: "bash_external_directory",
    request: {
      requester: localRequester(facts.agentName),
      surface: "external_directory",
      toolName: facts.toolName,
      invokedToolName: null,
      value: facts.command,
      matchedPattern: facts.matchedPattern ?? null,
      commandContext: null,
      executedUnit: null
    },
    evidence: [
      workingDirectoryEvidence(facts.cwd),
      ...facts.externalPaths.map(externalPathEvidence)
    ],
    annotations: []
  };
}
function pathPayload(kind, surface, facts, evidence) {
  return {
    kind,
    request: {
      requester: localRequester(facts.agentName),
      surface,
      toolName: facts.toolName,
      invokedToolName: null,
      value: facts.pathValue,
      matchedPattern: facts.matchedPattern ?? null,
      commandContext: null,
      executedUnit: null
    },
    evidence,
    annotations: []
  };
}
function resolvedAliasEvidence(resolvedPath) {
  return resolvedPath === void 0 ? [] : [{ label: "resolves to", text: resolvedPath, detail: null }];
}
function workingDirectoryEvidence(cwd) {
  return { label: "working directory", text: cwd, detail: null };
}
function externalPathEvidence({
  path,
  resolvedPath
}) {
  return { label: "external path", text: path, detail: resolvedPath ?? null };
}

// src/handlers/gates/external-directory-policy.ts
function resolveExternalDirectoryPolicy(path, resolver, agentName) {
  return resolver.resolve({
    kind: "access-path",
    surface: "external_directory",
    path,
    agentName
  });
}
function selectUncoveredExternalPaths(paths, resolver, agentName) {
  const uncovered = [];
  for (const path of paths) {
    const check = resolveExternalDirectoryPolicy(path, resolver, agentName);
    if (check.state !== "allow") {
      uncovered.push({ path, check });
    }
  }
  return {
    uncovered,
    worstCheck: pickMostRestrictive(uncovered.map(({ check }) => check))
  };
}

// src/handlers/gates/bash-external-directory.ts
function describeBashExternalDirectoryGate(tcc, bashProgram, resolver, normalizer) {
  if (!bashProgram) return null;
  const command = bashProgram.commandText();
  const externalPaths = bashProgram.externalPaths();
  if (externalPaths.length === 0) return null;
  const { uncovered: uncoveredEntries, worstCheck } = selectUncoveredExternalPaths(
    externalPaths,
    resolver,
    tcc.agentName ?? void 0
  );
  const uncoveredPaths = uncoveredEntries.map(({ path }) => path.value());
  if (uncoveredPaths.length === 0) {
    return {
      action: "allow",
      // A whole-command bypass covers every external path at once, and each
      // may have matched a different session pattern -- so the surface is one
      // value and the pattern is not. The entry's `externalPaths` lists what
      // was covered.
      decidedBy: {
        kind: "session_approval",
        surface: "external_directory",
        pattern: null
      },
      log: {
        event: "permission_request.session_approved",
        details: {
          source: "tool_call",
          toolCallId: tcc.toolCallId,
          toolName: tcc.toolName,
          agentName: tcc.agentName,
          command,
          externalPaths: externalPaths.map((p) => p.value()),
          resolution: "session_approved"
        }
      }
    };
  }
  const preCheck = worstCheck ?? uncoveredEntries[0].check;
  const worstEntry = uncoveredEntries.find(({ check }) => check === preCheck) ?? uncoveredEntries[0];
  const disclosures = uncoveredEntries.map(({ path }) => ({
    path: path.value(),
    resolvedPath: path.resolvedAlias()
  }));
  const payload = buildBashExternalDirectoryAskPayload({
    command,
    externalPaths: disclosures,
    cwd: tcc.cwd,
    agentName: tcc.agentName,
    toolName: tcc.toolName,
    matchedPattern: preCheck.matchedPattern
  });
  const patterns = uncoveredEntries.map(
    ({ path }) => normalizer.approvalPatternFor(path)
  );
  return {
    surface: "external_directory",
    input: {},
    payload,
    sessionApproval: SessionApproval.multiple("external_directory", patterns),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      command,
      accessIntent: accessFactsFromPath("external_directory", worstEntry.path)
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      command,
      externalPaths: uncoveredPaths
    },
    decision: {
      surface: "external_directory",
      value: command
    },
    preCheck
  };
}

// src/handlers/gates/bash-path.ts
function describeBashPathGate(tcc, bashProgram, resolver, normalizer) {
  if (!bashProgram) return null;
  const command = bashProgram.commandText();
  const candidates = bashProgram.pathRuleCandidates();
  if (candidates.length === 0) return null;
  const tokens = candidates.map(({ token }) => token);
  const uncovered = [];
  let allSessionCovered = true;
  for (const { token, path } of candidates) {
    const check = resolver.resolve({
      kind: "access-path",
      surface: "path",
      path,
      agentName: tcc.agentName ?? void 0
    });
    if (check.matchedPattern === void 0 && check.source !== "session") {
      allSessionCovered = false;
      continue;
    }
    if (check.source !== "session") {
      allSessionCovered = false;
    }
    if (check.state === "deny") {
      uncovered.push({ token, path, check });
      break;
    }
    if (check.state === "ask") {
      uncovered.push({ token, path, check });
    }
  }
  if (allSessionCovered) {
    return {
      action: "allow",
      // Every token was covered, each possibly by a different session pattern
      // -- the surface is one value and the pattern is not. The entry's
      // `tokens` lists what was covered.
      decidedBy: {
        kind: "session_approval",
        surface: "path",
        pattern: null
      },
      log: {
        event: "permission_request.session_approved",
        details: {
          source: "tool_call",
          toolCallId: tcc.toolCallId,
          toolName: tcc.toolName,
          agentName: tcc.agentName,
          command,
          tokens,
          resolution: "session_approved"
        }
      }
    };
  }
  const worstCheck = pickMostRestrictive(uncovered.map(({ check }) => check));
  const worstEntry = worstCheck ? uncovered.find(({ check }) => check === worstCheck) : void 0;
  const worstToken = worstEntry?.token ?? null;
  if (!worstCheck || !worstToken || !worstEntry) return null;
  const pattern = normalizer.approvalPatternFor(worstEntry.path);
  const payload = buildPathAskPayload({
    toolName: tcc.toolName,
    pathValue: worstToken,
    agentName: tcc.agentName,
    matchedPattern: worstCheck.matchedPattern
  });
  return {
    surface: "path",
    input: { path: worstToken },
    payload,
    sessionApproval: SessionApproval.single("path", pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      command,
      accessIntent: accessFactsFromPath("path", worstEntry.path)
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      command,
      path: worstToken
    },
    decision: {
      surface: "path",
      value: worstToken
    },
    preCheck: worstCheck
  };
}

// src/handlers/gates/external-directory.ts
function describeExternalDirectoryGate(tcc, infraDirs, resolver, normalizer, extractors) {
  const externalDirectoryPath = getToolInputPath(
    tcc.toolName,
    tcc.input,
    extractors
  );
  if (!externalDirectoryPath) return null;
  if (!normalizer.isOutsideWorkingDirectory(externalDirectoryPath)) {
    return null;
  }
  const accessPath = normalizer.forPath(externalDirectoryPath);
  if (normalizer.isInfrastructureRead(tcc.toolName, accessPath, infraDirs)) {
    return {
      action: "allow",
      // Containment allowed this, not a rule the operator wrote.
      decidedBy: { kind: "infrastructure_read" },
      log: {
        event: "permission_request.infrastructure_auto_allowed",
        details: {
          source: "tool_call",
          toolCallId: tcc.toolCallId,
          toolName: tcc.toolName,
          agentName: tcc.agentName,
          path: externalDirectoryPath
        }
      },
      decision: {
        surface: tcc.toolName,
        value: externalDirectoryPath,
        result: "allow",
        resolution: "infrastructure_auto_allowed",
        origin: null,
        agentName: tcc.agentName ?? null,
        matchedPattern: null
      }
    };
  }
  const resolvedAlias2 = accessPath.resolvedAlias();
  const preCheck = resolveExternalDirectoryPolicy(
    accessPath,
    resolver,
    tcc.agentName ?? void 0
  );
  const pattern = normalizer.approvalPatternFor(accessPath);
  const payload = buildExternalDirectoryAskPayload({
    toolName: tcc.toolName,
    pathValue: externalDirectoryPath,
    resolvedPath: resolvedAlias2,
    cwd: tcc.cwd,
    agentName: tcc.agentName,
    matchedPattern: preCheck.matchedPattern
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
      accessIntent: accessFactsFromPath("external_directory", accessPath)
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: externalDirectoryPath
    },
    decision: {
      surface: "external_directory",
      value: externalDirectoryPath
    }
  };
}

// src/handlers/gates/path.ts
function describePathGate(tcc, resolver, normalizer, extractors) {
  const filePath = getToolInputPath(tcc.toolName, tcc.input, extractors);
  if (!filePath) return null;
  const accessPath = normalizer.forPath(filePath);
  const check = resolver.resolve({
    kind: "access-path",
    surface: "path",
    path: accessPath,
    agentName: tcc.agentName ?? void 0
  });
  if (check.state === "allow") return null;
  if (check.matchedPattern === void 0) return null;
  const pattern = normalizer.approvalPatternFor(accessPath);
  const payload = buildPathAskPayload({
    toolName: tcc.toolName,
    pathValue: filePath,
    agentName: tcc.agentName,
    matchedPattern: check.matchedPattern
  });
  const descriptor = {
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
      accessIntent: accessFactsFromPath("path", accessPath)
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: filePath
    },
    decision: {
      surface: "path",
      value: filePath
    },
    preCheck: check
  };
  return descriptor;
}

// src/handlers/gates/skill-read.ts
function describeSkillReadGate(tcc, normalizer, getActiveSkillEntries) {
  const activeSkillEntries = getActiveSkillEntries();
  if (tcc.toolName !== "read" || activeSkillEntries.length === 0) {
    return null;
  }
  const inputRecord = toRecord(tcc.input);
  const path = typeof inputRecord.path === "string" ? inputRecord.path : "";
  if (!path) {
    return null;
  }
  const normalizedReadPath = normalizer.comparableValue(path);
  const matchedSkill = findSkillPathMatch(
    normalizedReadPath,
    activeSkillEntries,
    normalizer
  );
  if (!matchedSkill) {
    return null;
  }
  const payload = buildSkillPathAskPayload(matchedSkill, path, tcc.agentName);
  return {
    surface: "skill",
    input: { name: matchedSkill.name },
    payload,
    promptDetails: {
      source: "skill_read",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      skillName: matchedSkill.name,
      path,
      accessIntent: accessFactsFromValue("skill", matchedSkill.name)
    },
    logContext: {
      source: "skill_read",
      toolCallId: tcc.toolCallId,
      skillName: matchedSkill.name,
      agentName: tcc.agentName,
      path
    },
    decision: {
      surface: "skill",
      value: matchedSkill.name
    },
    preResolved: {
      state: matchedSkill.state
    }
  };
}

// src/presentation/tool-ask-payload.ts
function buildToolAskPayload(facts) {
  const { check } = facts;
  const bash = classifyToolKind(check.toolName) === "bash";
  const mcp = isMcpCheck(check) && check.target !== void 0;
  return {
    kind: bash ? "bash" : mcp ? "mcp" : "tool",
    request: {
      requester: localRequester(facts.agentName),
      surface: facts.surface,
      toolName: check.toolName,
      invokedToolName: distinctInvokedName(facts),
      value: askValue(check, bash, mcp),
      matchedPattern: check.matchedPattern ?? null,
      commandContext: check.commandContext ?? null,
      executedUnit: check.executedUnit ?? null
    },
    evidence: bash ? fullCommandEvidence(facts) : inputPreviewEvidence(facts, mcp),
    annotations: []
  };
}
function askValue(check, bash, mcp) {
  if (bash) return check.command ?? "";
  if (mcp) return check.target ?? "";
  return check.toolName;
}
function distinctInvokedName(facts) {
  const invoked = facts.invokedToolName ?? null;
  return invoked === null || invoked === facts.check.toolName ? null : invoked;
}
function fullCommandEvidence(facts) {
  const fullCommand = getNonEmptyString(toRecord(facts.input).command);
  if (fullCommand === null || fullCommand === facts.check.command) {
    return [];
  }
  return [{ label: "full command", text: fullCommand, detail: null }];
}
function inputPreviewEvidence(facts, mcp) {
  const preview = facts.formatter?.formatToolInputForPrompt(
    mcp ? "mcp" : facts.check.toolName,
    facts.input
  );
  return preview ? [{ label: "input", text: preview, detail: null }] : [];
}

// src/handlers/gates/tool.ts
function deriveSuggestionValue(toolName, check) {
  switch (classifyToolKind(toolName)) {
    case "bash":
      return check.command ?? "";
    case "mcp":
      return check.target ?? "mcp";
    default:
      return "*";
  }
}
function describeToolGate(tcc, check, formatter, pathAccess, shell) {
  const gateSurface = shell ? "bash" : tcc.toolName;
  const permissionLogContext = formatter.getPermissionLogContext(
    check,
    tcc.input,
    PATH_BEARING_TOOLS
  );
  const suggestion = pathAccess ? suggestPathSessionPattern(gateSurface, pathAccess.approvalPattern) : suggestSessionPattern(
    gateSurface,
    deriveSuggestionValue(gateSurface, check)
  );
  const payload = buildToolAskPayload({
    check,
    agentName: tcc.agentName,
    surface: gateSurface,
    invokedToolName: tcc.toolName,
    input: tcc.input,
    formatter
  });
  const decisionValue = deriveDecisionValue(
    gateSurface,
    check,
    getPathBearingToolPath(tcc.toolName, tcc.input) ?? void 0
  );
  const accessIntent = pathAccess ? accessFactsFromPath(gateSurface, pathAccess.path) : accessFactsFromValue(gateSurface, decisionValue);
  return {
    surface: gateSurface,
    input: tcc.input,
    payload,
    sessionApproval: SessionApproval.single(
      suggestion.surface,
      suggestion.pattern
    ),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      sessionLabel: suggestion.label,
      accessIntent,
      ...permissionLogContext
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      ...permissionLogContext
    },
    decision: {
      surface: gateSurface,
      value: decisionValue
    }
  };
}

// src/handlers/gates/tool-call-gate-pipeline.ts
var ToolCallGatePipeline = class {
  constructor(resolver, inputs, customFormatters, customExtractors) {
    this.resolver = resolver;
    this.inputs = inputs;
    this.customFormatters = customFormatters;
    this.customExtractors = customExtractors;
  }
  resolver;
  inputs;
  customFormatters;
  customExtractors;
  async evaluate(tcc, runner) {
    const shell = resolveShellInvocation(
      tcc.toolName,
      tcc.input,
      this.inputs.getShellToolAliases()
    );
    const normalizer = this.inputs.getPathNormalizer();
    const bashProgram = shell?.command ? await BashProgram.parse(shell.command, normalizer, {
      workdir: shell.workdir
    }) : null;
    const formatter = new ToolPreviewFormatter(
      this.inputs.getToolPreviewLimits(),
      this.customFormatters
    );
    const infraDirs = this.inputs.getInfrastructureReadDirs();
    const gateProducers = [
      () => describeSkillReadGate(
        tcc,
        normalizer,
        () => this.inputs.getActiveSkillEntries()
      ),
      () => describePathGate(tcc, this.resolver, normalizer, this.customExtractors),
      () => describeExternalDirectoryGate(
        tcc,
        infraDirs,
        this.resolver,
        normalizer,
        this.customExtractors
      ),
      () => describeBashExternalDirectoryGate(
        tcc,
        bashProgram,
        this.resolver,
        normalizer
      ),
      () => describeBashPathGate(tcc, bashProgram, this.resolver, normalizer),
      () => {
        const { toolCheck, pathAccess } = this.resolvePerToolCheck(
          tcc,
          shell,
          bashProgram,
          normalizer
        );
        const toolDescriptor = describeToolGate(
          tcc,
          toolCheck,
          formatter,
          pathAccess,
          shell
        );
        toolDescriptor.preCheck = toolCheck;
        return toolDescriptor;
      }
    ];
    for (const produce of gateProducers) {
      const outcome = await runner.run(await produce(), tcc.agentName);
      if (outcome.action === "block") {
        return outcome;
      }
    }
    return { action: "allow" };
  }
  /**
   * Resolve the per-tool gate's check, choosing the intent by tool shape:
   * bash chains its sub-commands; a path-bearing tool with a path emits an
   * `access-path` intent (so the per-tool surface matches lexical ∪ canonical,
   * #502); every other tool (and a path-bearing tool with no path) keeps the
   * raw `tool` intent the manager normalizes.
   *
   * Returns the resolved path alongside the check, already paired with the
   * session scope approving it grants — derived here, where the normalizer
   * lives, rather than inside the gate (#655).
   */
  resolvePerToolCheck(tcc, shell, bashProgram, normalizer) {
    if (shell) {
      if (bashProgram) {
        return {
          toolCheck: resolveBashCommandCheck(
            bashProgram.commandText(),
            bashProgram.commands(),
            tcc.agentName ?? void 0,
            this.resolver
          )
        };
      }
      return {
        toolCheck: this.resolver.resolve({
          kind: "tool",
          surface: "bash",
          input: { command: shell.command },
          agentName: tcc.agentName ?? void 0
        })
      };
    }
    const filePath = getPathBearingToolPath(tcc.toolName, tcc.input);
    if (filePath !== null) {
      const accessPath = normalizer.forPath(filePath);
      return {
        pathAccess: {
          path: accessPath,
          approvalPattern: normalizer.approvalPatternFor(accessPath)
        },
        toolCheck: this.resolver.resolve({
          kind: "access-path",
          surface: tcc.toolName,
          path: accessPath,
          agentName: tcc.agentName ?? void 0
        })
      };
    }
    return {
      toolCheck: this.resolver.resolve({
        kind: "tool",
        surface: tcc.toolName,
        input: tcc.input,
        agentName: tcc.agentName ?? void 0
      })
    };
  }
};

// src/handlers/tool-call-boundary.ts
function createFailClosedToolCall(gate, reporter, audit, tracer) {
  return async (event, ctx) => {
    try {
      const outcome = await gate(event, ctx);
      audit.recordDecision(outcome.action);
      tracer.debug("permission.decision", {
        toolName: bestEffortToolName(event),
        action: outcome.action,
        ...outcome.action === "block" ? { reason: outcome.reason } : {}
      });
      return outcome.action === "block" ? { block: true, reason: outcome.reason } : {};
    } catch (error) {
      recordGateError(reporter, audit, event, error);
      return { block: true, reason: formatGateErrorReason(error) };
    }
  };
}
function recordGateError(reporter, audit, event, error) {
  try {
    audit.recordError();
    const reason = errorMessage(error);
    const requestId = createPermissionRequestId();
    const toolName = bestEffortToolName(event);
    const command = bestEffortCommand(event);
    reporter.writeReviewLog("permission_request.blocked", {
      requestId,
      toolName,
      command,
      resolution: "gate_error",
      error: reason,
      // The boundary decided, by failing closed -- no rule and no human did.
      decidedBy: { kind: "gate_error", reason }
    });
    reporter.emitDecision({
      requestId,
      surface: toolName,
      value: command ?? toolName,
      result: "deny",
      resolution: "gate_error",
      origin: null,
      agentName: null,
      matchedPattern: null
    });
  } catch {
  }
}
function bestEffortToolName(event) {
  const record = toRecord(event);
  const name = record.name ?? record.toolName;
  return typeof name === "string" && name ? name : "<unknown>";
}
function bestEffortCommand(event) {
  const record = toRecord(event);
  const input = toRecord(record.input ?? record.arguments);
  return typeof input.command === "string" ? input.command : void 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatGateErrorReason(error) {
  return `Permission gate failed and blocked the tool call (fail-closed): ${errorMessage(error)}`;
}

// src/path/path-flavor.ts
import { posix as posixPath, win32 as winPath } from "node:path";

// src/access-intent/bash/msys-bash-tokens.ts
var MSYS_DRIVE_MOUNT_PATTERN = /^\/([a-zA-Z])(\/.*)?$/;
function classifyWin32BashToken(token) {
  if (isSafeSystemPath(token)) return { kind: "device" };
  const driveMatch = MSYS_DRIVE_MOUNT_PATTERN.exec(token);
  if (driveMatch) {
    return {
      kind: "drive-mount",
      windowsPath: toWindowsDrivePath(driveMatch[1], driveMatch[2])
    };
  }
  if (token.startsWith("/")) return { kind: "posix-absolute" };
  return { kind: "plain" };
}
function toWindowsDrivePath(letter, rest) {
  const drive = `${letter.toUpperCase()}:`;
  const tail = (rest ?? "").replace(/^\//, "").replaceAll("/", "\\");
  return tail ? `${drive}\\${tail}` : `${drive}\\`;
}

// src/path/path-flavor.ts
var PlatformPathFlavor = class {
  constructor(impl, windows) {
    this.impl = impl;
    this.windows = windows;
    this.matchOptions = windows ? { caseInsensitive: true, windowsSeparators: true } : void 0;
    this.separators = windows ? ["/", "\\"] : ["/"];
  }
  impl;
  windows;
  matchOptions;
  /** Every separator spelling this platform recognizes, the one alphabet both separator answers read. */
  separators;
  fold(value) {
    return this.windows ? value.toLowerCase() : value;
  }
  comparable(pathValue, base) {
    return this.fold(this.impl.normalize(this.impl.resolve(base, pathValue)));
  }
  isWithin(pathValue, directory) {
    if (!pathValue || !directory) return false;
    if (pathValue === directory) return true;
    const rel = this.impl.relative(directory, pathValue);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${this.impl.sep}`) && !this.impl.isAbsolute(rel);
  }
  hasPathSeparator(token) {
    return this.lastSeparatorIndex(token) >= 0;
  }
  lastSeparatorIndex(value) {
    return this.separators.reduce(
      (last, separator) => Math.max(last, value.lastIndexOf(separator)),
      -1
    );
  }
  bashTokenShape(token) {
    return this.windows ? classifyWin32BashToken(token) : { kind: "plain" };
  }
};
var posixPathFlavor = new PlatformPathFlavor(
  posixPath,
  false
);
var win32PathFlavor = new PlatformPathFlavor(
  winPath,
  true
);
function pathFlavorForPlatform(platform) {
  return platform === "win32" ? win32PathFlavor : posixPathFlavor;
}

// src/permission-manager.ts
import { join as join10 } from "node:path";

// src/normalize.ts
function normalizeFlatConfig(permission) {
  const rules = [];
  for (const [surface, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      if (isPermissionState(value)) {
        rules.push({ surface, pattern: "*", action: value, origin: "builtin" });
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [pattern, action] of Object.entries(value)) {
        if (isDenyWithReason(action)) {
          rules.push({
            surface,
            pattern,
            action: "deny",
            reason: action.reason,
            origin: "builtin"
          });
        } else if (isPermissionState(action)) {
          rules.push({ surface, pattern, action, origin: "builtin" });
        }
      }
    }
  }
  return rules;
}

// src/policy-loader.ts
import { existsSync as existsSync6, readFileSync as readFileSync4, statSync } from "node:fs";
import { dirname as dirname5, join as join9 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// src/yaml-frontmatter.ts
function parseSimpleYamlMap(input) {
  const root = {};
  const stack = [{ indent: -1, target: root }];
  const lines = input.split(/\r?\n/);
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().replace(/^['"]|['"]$/g, "");
    const rawValue = line.slice(separatorIndex + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const current = stack[stack.length - 1].target;
    if (!rawValue) {
      const child = {};
      current[key] = child;
      stack.push({ indent, target: child });
      continue;
    }
    let scalar = rawValue;
    if (scalar.startsWith('"') && scalar.endsWith('"') || scalar.startsWith("'") && scalar.endsWith("'")) {
      scalar = scalar.slice(1, -1);
    }
    current[key] = scalar;
  }
  return root;
}
function extractFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return "";
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    return "";
  }
  return normalized.slice(4, end);
}

// src/policy-loader.ts
function getFileStamp(path) {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return "missing";
  }
}
function readConfiguredMcpServerNamesFromConfigPath(configPath) {
  try {
    const raw = readFileSync4(configPath, "utf-8");
    const parsed = JSON.parse(stripJsonComments(raw));
    const root = toRecord(parsed);
    const serverRecord = toRecord(root.mcpServers ?? root["mcp-servers"]);
    return Object.keys(serverRecord).map((name) => name.trim()).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}
function getConfiguredMcpServerNamesFromPaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  for (const path of paths) {
    for (const name of readConfiguredMcpServerNamesFromConfigPath(path)) {
      seen.add(name);
    }
  }
  return [...seen].sort(
    (left, right) => right.length - left.length || left.localeCompare(right)
  );
}
function defaultGlobalConfigPath() {
  return getGlobalConfigPath(getAgentDir());
}
function defaultAgentsDir() {
  return join9(getAgentDir(), "agents");
}
function defaultGlobalMcpConfigPath() {
  return join9(getAgentDir(), "mcp.json");
}
var FilePolicyLoader = class {
  globalConfigPath;
  agentsDir;
  projectGlobalConfigPath;
  projectAgentsDir;
  globalMcpConfigPath;
  configuredMcpServerNamesOverride;
  packagedDefaultConfigPath;
  globalConfigCache = null;
  projectGlobalConfigCache = null;
  agentConfigCache = /* @__PURE__ */ new Map();
  projectAgentConfigCache = /* @__PURE__ */ new Map();
  configuredMcpServerNamesCache = null;
  accumulatedConfigIssues = [];
  constructor(options = {}) {
    this.globalConfigPath = options.globalConfigPath ?? defaultGlobalConfigPath();
    this.agentsDir = options.agentsDir ?? defaultAgentsDir();
    this.projectGlobalConfigPath = options.projectGlobalConfigPath ?? null;
    this.projectAgentsDir = options.projectAgentsDir ?? null;
    this.globalMcpConfigPath = options.globalMcpConfigPath ?? defaultGlobalMcpConfigPath();
    this.packagedDefaultConfigPath = options.packagedDefaultConfigPath === void 0 ? join9(dirname5(fileURLToPath3(import.meta.url)), "..", "config", "config.default.json") : options.packagedDefaultConfigPath;
    this.configuredMcpServerNamesOverride = options.mcpServerNames ? [
      ...new Set(
        options.mcpServerNames.map((name) => name.trim()).filter((name) => name.length > 0)
      )
    ] : null;
  }
  // ── Config issue accumulation ────────────────────────────────────────
  accumulateConfigIssues(issues) {
    for (const issue of issues) {
      if (!this.accumulatedConfigIssues.includes(issue)) {
        this.accumulatedConfigIssues.push(issue);
      }
    }
  }
  getConfigIssues() {
    return [...this.accumulatedConfigIssues];
  }
  // ── Scope loaders ────────────────────────────────────────────────────
  loadGlobalConfig() {
    const stamp = getFileStamp(this.globalConfigPath);
    if (this.globalConfigCache?.stamp === stamp) {
      return this.globalConfigCache.value;
    }
    const sourcePath = existsSync6(this.globalConfigPath) || !this.packagedDefaultConfigPath ? this.globalConfigPath : this.packagedDefaultConfigPath;
    const { config, issues } = loadUnifiedConfig(sourcePath);
    this.accumulateConfigIssues(issues);
    const value = {
      permission: config.permission
    };
    this.globalConfigCache = { stamp, value };
    return value;
  }
  loadProjectConfig() {
    if (!this.projectGlobalConfigPath) {
      return {};
    }
    const stamp = getFileStamp(this.projectGlobalConfigPath);
    if (this.projectGlobalConfigCache?.stamp === stamp) {
      return this.projectGlobalConfigCache.value;
    }
    const { config, issues } = loadUnifiedConfig(this.projectGlobalConfigPath);
    this.accumulateConfigIssues(issues);
    const value = {
      permission: config.permission,
      ...issues.length > 0 ? { invalid: true } : {}
    };
    this.projectGlobalConfigCache = { stamp, value };
    return value;
  }
  loadScopeConfigFrom(dir, cache, agentName) {
    if (!dir || !agentName) {
      return {};
    }
    const filePath = join9(dir, `${agentName}.md`);
    const stamp = getFileStamp(filePath);
    const cached = cache.get(agentName);
    if (cached?.stamp === stamp) {
      return cached.value;
    }
    if (stamp === "missing") {
      const value2 = {};
      cache.set(agentName, { stamp, value: value2 });
      return value2;
    }
    let value;
    try {
      const markdown = readFileSync4(filePath, "utf-8");
      const frontmatter = extractFrontmatter(markdown);
      if (!frontmatter) {
        value = {};
      } else {
        const parsed = parseSimpleYamlMap(frontmatter);
        value = {
          permission: normalizeFlatPermissionValue(parsed.permission)
        };
      }
    } catch {
      value = { invalid: true };
    }
    cache.set(agentName, { stamp, value });
    return value;
  }
  loadAgentConfig(agentName) {
    return this.loadScopeConfigFrom(
      this.agentsDir,
      this.agentConfigCache,
      agentName
    );
  }
  loadProjectAgentConfig(agentName) {
    return this.loadScopeConfigFrom(
      this.projectAgentsDir,
      this.projectAgentConfigCache,
      agentName
    );
  }
  // ── MCP server names ─────────────────────────────────────────────────
  getConfiguredMcpServerNames() {
    if (this.configuredMcpServerNamesOverride) {
      return this.configuredMcpServerNamesOverride;
    }
    const paths = [this.globalMcpConfigPath];
    const stamp = paths.map((path) => `${path}:${getFileStamp(path)}`).join("|");
    if (this.configuredMcpServerNamesCache?.stamp === stamp) {
      return this.configuredMcpServerNamesCache.value;
    }
    const value = getConfiguredMcpServerNamesFromPaths(paths);
    this.configuredMcpServerNamesCache = { stamp, value };
    return value;
  }
  // ── Cache stamp ───────────────────────────────────────────────────────
  getCacheStamp(agentName) {
    const agentStamp = agentName ? getFileStamp(join9(this.agentsDir, `${agentName}.md`)) : "missing";
    const projectStamp = this.projectGlobalConfigPath ? getFileStamp(this.projectGlobalConfigPath) : "none";
    const projectAgentStamp = this.projectAgentsDir && agentName ? getFileStamp(join9(this.projectAgentsDir, `${agentName}.md`)) : "none";
    return `${getFileStamp(this.globalConfigPath)}|${projectStamp}|${agentStamp}|${projectAgentStamp}`;
  }
  // ── Resolved paths ────────────────────────────────────────────────────
  getResolvedPolicyPaths() {
    return {
      globalConfigPath: this.globalConfigPath,
      globalConfigExists: existsSync6(this.globalConfigPath),
      projectConfigPath: this.projectGlobalConfigPath,
      projectConfigExists: this.projectGlobalConfigPath ? existsSync6(this.projectGlobalConfigPath) : false,
      agentsDir: this.agentsDir,
      agentsDirExists: existsSync6(this.agentsDir),
      projectAgentsDir: this.projectAgentsDir,
      projectAgentsDirExists: this.projectAgentsDir ? existsSync6(this.projectAgentsDir) : false
    };
  }
};

// src/wildcard-matcher.ts
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compileWildcardPattern(pattern, state, options) {
  const expanded = foldSeparators(expandHomePath(pattern), options);
  let escaped = expanded.split("*").map((part) => escapeRegExp(part).replaceAll("\\?", ".")).join(".*");
  if (escaped.endsWith(" .*")) {
    escaped = `${escaped.slice(0, -3)}( .*)?`;
  }
  const regex = new RegExp(
    `^${escaped}$`,
    options?.caseInsensitive ? "si" : "s"
  );
  return {
    pattern,
    state,
    matches: (value) => regex.test(foldSeparators(value, options))
  };
}
function wildcardMatch(pattern, value, options) {
  return compileWildcardPattern(pattern, null, options).matches(value);
}
function foldSeparators(value, options) {
  return options?.windowsSeparators ? value.replaceAll("/", "\\") : value;
}

// src/rule.ts
function rewriteAsksToYolo(rules) {
  return rules.map(
    (rule) => rule.action === "ask" ? { ...rule, action: "allow", origin: "yolo" } : rule
  );
}
function floorAllowsToAsk(rules) {
  return rules.map(
    (rule) => rule.action === "allow" ? { ...rule, action: "ask", origin: "fail-closed" } : rule
  );
}
function evaluate(surface, pattern, rules, flavor, defaultAction) {
  const rule = rules.findLast((r) => ruleMatches(r, surface, pattern, flavor));
  if (rule !== void 0) return rule;
  return {
    surface,
    pattern,
    action: defaultAction ?? "ask",
    origin: "builtin"
  };
}
function pathMatchOptions(surface, flavor) {
  return PATH_SURFACES.has(surface) ? flavor.matchOptions : void 0;
}
function ruleMatches(rule, surface, value, flavor) {
  const matchOptions = pathMatchOptions(surface, flavor);
  return wildcardMatch(rule.surface, surface) && wildcardMatch(rule.pattern, value, matchOptions);
}
function evaluateFirst(surface, values, rules, flavor) {
  for (const value of values) {
    const rule = evaluate(surface, value, rules, flavor);
    if (rule.layer !== "default") {
      return { rule, value };
    }
  }
  const fallbackValue = values[0] ?? "*";
  return {
    rule: evaluate(surface, fallbackValue, rules, flavor),
    value: fallbackValue
  };
}
function evaluateAnyValue(surface, values, rules, flavor) {
  const fallbackValue = values[0] ?? "*";
  const rule = rules.findLast(
    (r) => values.some((value) => ruleMatches(r, surface, value, flavor))
  );
  if (rule !== void 0) {
    return {
      rule,
      value: values.find((value) => ruleMatches(rule, surface, value, flavor)) ?? fallbackValue
    };
  }
  return {
    rule: evaluate(surface, fallbackValue, rules, flavor),
    value: fallbackValue
  };
}

// src/scope-merge.ts
function mergeScopesWithOrigins(scopes) {
  const origins = /* @__PURE__ */ new Map();
  let mergedPermission = {};
  for (const [scopeName, scope] of scopes) {
    if (!scope.permission) continue;
    for (const [surface, value] of Object.entries(scope.permission)) {
      const baseVal = mergedPermission[surface];
      const bothObjects = typeof baseVal === "object" && baseVal !== null && typeof value === "object" && value !== null;
      if (bothObjects) {
        if (!origins.has(surface)) origins.set(surface, /* @__PURE__ */ new Map());
        for (const pattern of Object.keys(value)) {
          origins.get(surface)?.set(pattern, scopeName);
        }
      } else {
        const surfaceOrigins = /* @__PURE__ */ new Map();
        if (typeof value === "string") {
          surfaceOrigins.set("*", scopeName);
        } else if (typeof value === "object" && value !== null) {
          for (const pattern of Object.keys(value)) {
            surfaceOrigins.set(pattern, scopeName);
          }
        }
        origins.set(surface, surfaceOrigins);
      }
    }
    mergedPermission = mergeFlatPermissions(mergedPermission, scope.permission);
  }
  return { mergedPermission, origins };
}

// src/synthesize.ts
function synthesizeDefaults(universalDefault, origin = "builtin") {
  return [
    {
      surface: "*",
      pattern: "*",
      action: universalDefault,
      layer: "default",
      origin
    }
  ];
}
var MCP_BASELINE_TARGETS = [
  "mcp_status",
  "mcp_list",
  "mcp_search",
  "mcp_describe",
  "mcp_connect"
];
function synthesizeBaseline(configRules) {
  const hasAnyMcpAllow = configRules.some(
    (r) => r.surface === "mcp" && r.action === "allow"
  );
  if (!hasAnyMcpAllow) {
    return [];
  }
  return MCP_BASELINE_TARGETS.map(
    (target) => ({
      surface: "mcp",
      pattern: target,
      action: "allow",
      layer: "baseline",
      origin: "baseline"
    })
  );
}
function composeRuleset(defaults, baseline, config) {
  return [...defaults, ...baseline, ...config];
}

// src/permission-manager.ts
var SPECIAL_PERMISSION_KEYS = /* @__PURE__ */ new Set(["external_directory", "path"]);
var DEFAULT_UNIVERSAL_FALLBACK = "ask";
var YOLO_DISABLED = () => false;
var PermissionManager = class {
  agentDir;
  flavor;
  isYoloEnabled;
  loader;
  resolvedPermissionsCache = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.agentDir = options.agentDir;
    this.flavor = options.flavor ?? posixPathFlavor;
    this.isYoloEnabled = options.isYoloEnabled ?? YOLO_DISABLED;
    this.loader = options.policyLoader ?? new FilePolicyLoader(
      options.agentDir !== void 0 ? derivePolicyLoaderOptions(options.agentDir, void 0) : options
    );
  }
  /**
   * Rebuild the policy loader for a new working directory and clear the
   * resolved-permissions cache.
   *
   * When `agentDir` was not provided at construction (e.g. test managers
   * built with explicit paths), only the cache is cleared.
   */
  configureForCwd(cwd) {
    if (this.agentDir !== void 0) {
      this.loader = new FilePolicyLoader(
        derivePolicyLoaderOptions(this.agentDir, cwd)
      );
    }
    this.resolvedPermissionsCache.clear();
  }
  getConfigIssues(agentName) {
    const { failClosedScopes } = this.resolvePermissions(agentName);
    const issues = [...this.loader.getConfigIssues()];
    if (failClosedScopes.length > 0) {
      issues.push(
        `Invalid ${failClosedScopes.join(", ")} configuration detected \u2014 failing closed: 'allow' rules are clamped to 'ask' for this session until the configuration is corrected.`
      );
    }
    return issues;
  }
  getResolvedPolicyPaths() {
    return this.loader.getResolvedPolicyPaths();
  }
  resolvePermissions(agentName) {
    const cacheKey = agentName ?? "__global__";
    const stamp = this.loader.getCacheStamp(agentName);
    const cached = this.resolvedPermissionsCache.get(cacheKey);
    if (cached?.stamp === stamp) {
      return cached.value;
    }
    const globalConfig = this.loader.loadGlobalConfig();
    const projectConfig = this.loader.loadProjectConfig();
    const agentConfig = this.loader.loadAgentConfig(agentName);
    const projectAgentConfig = this.loader.loadProjectAgentConfig(agentName);
    const { mergedPermission, origins } = mergeScopesWithOrigins([
      ["global", globalConfig],
      ["project", projectConfig],
      ["agent", agentConfig],
      ["project-agent", projectAgentConfig]
    ]);
    const universalFallback = isPermissionState(mergedPermission["*"]) ? mergedPermission["*"] : DEFAULT_UNIVERSAL_FALLBACK;
    const universalFallbackOrigin = origins.get("*")?.get("*") ?? "builtin";
    const permissionWithoutUniversal = Object.fromEntries(
      Object.entries(mergedPermission).filter(([k]) => k !== "*")
    );
    const configRules = normalizeFlatConfig(
      permissionWithoutUniversal
    ).map(
      (r) => ({
        ...r,
        layer: "config",
        origin: origins.get(r.surface)?.get(r.pattern) ?? "builtin"
      })
    );
    const composedRules = composeRuleset(
      synthesizeDefaults(universalFallback, universalFallbackOrigin),
      synthesizeBaseline(configRules),
      configRules
    );
    const failClosedScopes = [];
    if (projectConfig.invalid === true) failClosedScopes.push("project");
    if (agentConfig.invalid === true) failClosedScopes.push("agent");
    if (projectAgentConfig.invalid === true)
      failClosedScopes.push("project-agent");
    const effectiveRules = failClosedScopes.length > 0 ? floorAllowsToAsk(composedRules) : composedRules;
    const value = {
      composedRules: effectiveRules,
      failClosedScopes
    };
    this.resolvedPermissionsCache.set(cacheKey, { stamp, value });
    return value;
  }
  /**
   * Return the composed config-layer rules for the given agent scope.
   * Used by the `/permission-system show` command to display effective rules
   * with their origin annotations.
   * Session rules are not included — they are runtime-only.
   */
  getComposedConfigRules(agentName) {
    const { composedRules } = this.resolvePermissions(agentName);
    return composedRules.filter((r) => r.layer === "config");
  }
  /**
   * Get the tool-level permission state for a tool, without considering
   * command-level rules. Used for tool injection decisions.
   */
  getToolPermission(toolName, agentName) {
    const { composedRules } = this.resolvePermissions(agentName);
    return evaluate(toolName.trim(), "*", composedRules, this.flavor).action;
  }
  /**
   * Unified resolution entry point — dispatches on intent kind.
   *
   * `"tool"` → normalizes raw input through `normalizeInput` (bash, skill, mcp,
   * extension surfaces). Path-bearing surfaces arrive as `"path-values"` via
   * the access-path gate (#502) or service/RPC builder (#503).
   * `"path-values"` → evaluates the precomputed values directly.
   *
   * The manager stays string-based by design: it consumes `ResolvedAccessIntent`
   * (`tool | path-values`) and never imports `AccessPath`. This deliberate
   * boundary is formalized in ADR-0002
   * (`docs/decisions/0002-path-values-string-boundary.md`) and guarded by a
   * `no-restricted-imports` lint rule on this file.
   */
  check(intent, sessionRules) {
    const { composedRules } = this.resolvePermissions(intent.agentName);
    const composedWithSession = sessionRules?.length ? [...composedRules, ...sessionRules] : composedRules;
    const fullRules = this.isYoloEnabled() ? rewriteAsksToYolo(composedWithSession) : composedWithSession;
    if (intent.kind === "path-values") {
      const lookupValues = intent.values.length > 0 ? [...intent.values] : ["*"];
      return buildCheckResult(
        intent.surface,
        lookupValues,
        {},
        intent.surface,
        intent.surface,
        fullRules,
        this.flavor
      );
    }
    const toolName = intent.surface.trim();
    const { surface, values, resultExtras } = normalizeInput(
      toolName,
      intent.input,
      this.loader.getConfiguredMcpServerNames()
    );
    return buildCheckResult(
      surface,
      values,
      resultExtras,
      toolName,
      intent.surface,
      fullRules,
      this.flavor
    );
  }
};
function buildCheckResult(surface, values, resultExtras, normalizedToolName, toolName, fullRules, flavor) {
  const { rule, value } = PATH_SURFACES.has(surface) ? evaluateAnyValue(surface, values, fullRules, flavor) : evaluateFirst(surface, values, fullRules, flavor);
  const extras = classifyToolKind(surface) === "mcp" ? { ...resultExtras, target: value } : resultExtras;
  return {
    toolName,
    state: rule.action,
    reason: rule.reason,
    matchedPattern: rule.layer === "config" || rule.layer === "session" ? rule.pattern : void 0,
    source: deriveSource(rule, normalizedToolName),
    origin: rule.origin,
    ...extras
  };
}
function derivePolicyLoaderOptions(agentDir, cwd) {
  return {
    globalConfigPath: getGlobalConfigPath(agentDir),
    agentsDir: join10(agentDir, "agents"),
    projectGlobalConfigPath: cwd ? getProjectConfigPath(cwd) : void 0,
    projectAgentsDir: cwd ? getProjectAgentsDir(cwd) : void 0
  };
}
function deriveSource(rule, toolName) {
  if (rule.layer === "session") return "session";
  if (SPECIAL_PERMISSION_KEYS.has(toolName)) return "special";
  switch (classifyToolKind(toolName)) {
    case "mcp":
      return rule.layer === "default" ? "default" : "mcp";
    case "skill":
      return "skill";
    case "bash":
      return "bash";
    case "path":
      return "tool";
    case "extension":
      return rule.layer === "default" ? "default" : "tool";
  }
}

// src/permission-resolver.ts
function toResolvedIntent(intent) {
  if (intent.kind === "access-path") {
    return {
      kind: "path-values",
      surface: intent.surface,
      values: intent.path.matchValues(),
      agentName: intent.agentName
    };
  }
  return intent;
}
var PermissionResolver = class {
  constructor(permissionManager, sessionRules) {
    this.permissionManager = permissionManager;
    this.sessionRules = sessionRules;
  }
  permissionManager;
  sessionRules;
  /**
   * Answer a gate-emitted access intent, composing the current session ruleset
   * so callers never thread it by hand. Unwraps the `access-path` variant via
   * `matchValues()` before handing a string-based intent to the manager.
   *
   * Also accepts a pre-fixed `path-values` intent (the forwarded-serving wire,
   * #597) — a passthrough, since it is already a `ResolvedAccessIntent`. The
   * gate-facing {@link ScopedPermissionResolver} interface stays narrow
   * (`AccessIntent` only); this wider acceptance is available only through the
   * concrete `PermissionResolver` instance the composition root holds.
   */
  resolve(intent) {
    return this.permissionManager.check(
      toResolvedIntent(intent),
      this.sessionRules.getRuleset()
    );
  }
  /**
   * Raw permission check without session rules — the no-session-rules path
   * consumed by `SkillInputGateInputs` / `SkillPermissionChecker`.
   *
   * Not on `ScopedPermissionResolver` (ISP: gates do not use this).
   */
  checkPermission(surface, input, agentName, sessionRules) {
    return this.permissionManager.check(
      { kind: "tool", surface, input, agentName },
      sessionRules
    );
  }
  getToolPermission(toolName, agentName) {
    return this.permissionManager.getToolPermission(toolName, agentName);
  }
  getConfigIssues(agentName) {
    return this.permissionManager.getConfigIssues(agentName);
  }
};

// src/path-normalizer.ts
import { lstatSync } from "node:fs";

// src/access-intent/access-path.ts
var AccessPath = class _AccessPath {
  constructor(lexical, matchAliases, canonical) {
    this.lexical = lexical;
    this.matchAliases = matchAliases;
    this.canonical = canonical;
  }
  lexical;
  matchAliases;
  canonical;
  /**
   * Pattern-match values for the `external_directory` surface: the lexical
   * alias union plus the canonical alias, so a config pattern on either the
   * typed form (`/tmp/*`) or the symlink-resolved form (`/private/tmp/*`)
   * matches (#418).
   *
   * Collapses to the lexical aliases when the canonical equals one of them
   * (e.g. when the path is not a symlink).
   */
  matchValues() {
    return this.canonical ? [.../* @__PURE__ */ new Set([...this.matchAliases, this.canonical])] : [...this.matchAliases];
  }
  /**
   * Canonical (symlink-resolved, win32-lowercased) form, for the outside-CWD
   * boundary decision and Pi infrastructure-read containment checks.
   *
   * Returns `""` when the path could not be resolved (empty input).
   */
  boundaryValue() {
    return this.canonical;
  }
  /**
   * Lexical (as-typed, normalized but not symlink-resolved) form, for display,
   * approval patterns, decision values, and log messages.
   *
   * Returns `""` for empty input.
   */
  value() {
    return this.lexical;
  }
  /**
   * The canonical (symlink-resolved) form when it names a location distinct
   * from the lexical form — for disclosing the resolved target in a prompt or
   * denial message. `undefined` when the path is not a symlink (canonical
   * equals lexical) or has no canonical (literal-only / empty input).
   */
  resolvedAlias() {
    if (!this.canonical || this.canonical === this.lexical) {
      return void 0;
    }
    return this.canonical;
  }
  /**
   * Build an `AccessPath` for a tool-input or bash-token path, resolved against
   * `resolveBase` (the cd-folded effective directory; defaults to `cwd`).
   *
   * Serves every path surface: the tool path gate, the tool external-directory
   * gate, and the bash path/external-directory gates (which pass a cd-resolved
   * `resolveBase`).
   *
   * - `matchValues()` returns the lexical alias union from `getPathPolicyValues`
   *   plus the canonical alias from `canonicalNormalizePathForComparison`
   *   (#418), so a config pattern on either the typed or symlink-resolved form
   *   matches.
   * - `boundaryValue()` returns
   *   `canonicalNormalizePathForComparison(pathValue, resolveBase)`, which is
   *   win32-lowercased (#382) — do not substitute a raw `canonicalizePath`
   *   output here.
   * - `value()` returns `normalizePathForComparison(pathValue, resolveBase)`,
   *   the absolute lexical form.
   */
  static forPath(pathValue, options) {
    const { cwd, resolveBase = cwd, flavor } = options;
    return new _AccessPath(
      normalizePathForComparison(pathValue, resolveBase, flavor),
      getPathPolicyValues(pathValue, { cwd, resolveBase }, flavor),
      canonicalNormalizePathForComparison(pathValue, resolveBase, flavor)
    );
  }
  /**
   * Build a literal-only `AccessPath` for a path whose effective base is
   * unknown (a relative bash token after a non-literal `cd`).
   *
   * Carries no canonical alias and no absolute resolution — `matchValues()` is
   * `[literal]` (or `[]` when empty) and `boundaryValue()` is `""` — so no
   * spurious absolute or symlink-resolved rule can match (#393).
   */
  static forLiteral(literal) {
    if (!literal) return new _AccessPath("", [], "");
    return new _AccessPath(literal, [literal], "");
  }
  /**
   * Build an `AccessPath` for a Git Bash/MSYS device path (`/dev/null`,
   * `/dev/std{in,out,err}`) seen in a bash command on a win32 host.
   *
   * The token names an MSYS runtime device, not a filesystem path, so it is
   * preserved verbatim across all three representations — `value()`,
   * `boundaryValue()`, and `matchValues()` are the device path itself, never
   * `win32.resolve`-mangled into `c:\dev\null`. The identical lexical and
   * canonical forms let the boundary check reach `isSafeSystemPath` (so the
   * device never triggers `external_directory`) while a config rule still
   * matches the path as typed.
   */
  static forDevice(devicePath) {
    return new _AccessPath(devicePath, [devicePath], devicePath);
  }
};

// src/path/approval-pattern.ts
function deriveApprovalPattern(pathValue, flavor) {
  const lastSeparator = flavor.lastSeparatorIndex(pathValue);
  if (lastSeparator < 0) return `.${flavor.impl.sep}*`;
  return `${pathValue.slice(0, lastSeparator + 1)}*`;
}

// src/path/path-containment.ts
function isPathOutsideWorkingDirectory(canonicalPath, canonicalCwd, flavor) {
  if (!canonicalCwd || !canonicalPath) {
    return false;
  }
  if (isSafeSystemPath(canonicalPath)) {
    return false;
  }
  return !flavor.isWithin(canonicalPath, canonicalCwd);
}

// src/path/pi-infrastructure-read.ts
import { join as join11 } from "node:path";
function containsGlobChars(value) {
  return value.includes("*") || value.includes("?");
}
function isPiInfrastructureRead(toolName, normalizedPath, infrastructureDirs, cwd, flavor) {
  if (!READ_ONLY_PATH_BEARING_TOOLS.has(toolName)) {
    return false;
  }
  for (const dir of infrastructureDirs) {
    if (containsGlobChars(dir)) {
      if (wildcardMatch(dir, normalizedPath, flavor.matchOptions)) return true;
    } else {
      if (flavor.isWithin(normalizedPath, expandHomePath(dir))) return true;
    }
  }
  const projectNpmDir = join11(cwd, ".pi", "npm");
  const projectGitDir = join11(cwd, ".pi", "git");
  if (flavor.isWithin(normalizedPath, projectNpmDir)) {
    return true;
  }
  if (flavor.isWithin(normalizedPath, projectGitDir)) {
    return true;
  }
  return false;
}

// src/path-normalizer.ts
var PathNormalizer = class {
  constructor(flavor, cwd) {
    this.flavor = flavor;
    this.cwd = cwd;
    this.canonicalCwd = canonicalNormalizePathForComparison(cwd, cwd, flavor);
  }
  flavor;
  cwd;
  /** Canonical form of the baked cwd, resolved once (the symlink target is stable per session). */
  canonicalCwd;
  /** Build an AccessPath for a token, resolved against `resolveBase` (default cwd). */
  forPath(pathValue, options) {
    return AccessPath.forPath(pathValue, {
      cwd: this.cwd,
      resolveBase: options?.resolveBase,
      flavor: this.flavor
    });
  }
  /** Build a literal-only AccessPath (unknown base after a non-literal `cd`). */
  forLiteral(literal) {
    return AccessPath.forLiteral(literal);
  }
  /**
   * Build an AccessPath for a bash-command token, applying Git Bash/MSYS
   * semantics on a win32 host.
   *
   * Pi core always executes bash through Git Bash on Windows, so a POSIX-shaped
   * absolute token carries MSYS semantics, not `node:path.win32` semantics. The
   * flavor classifies the token's shape: on win32 the recognized safe device
   * paths (`/dev/null`, `/dev/std{in,out,err}`) are preserved verbatim as
   * devices instead of being resolved into `c:\dev\null`, and MSYS drive mounts
   * (`/c/…`) are translated to their Windows equivalent (`C:\…`) before
   * resolution; every other token delegates to {@link forPath}. On POSIX every
   * token is `plain`, so this is a straight delegation to {@link forPath}.
   */
  forBashToken(token, options) {
    const shape = this.flavor.bashTokenShape(token);
    switch (shape.kind) {
      case "device":
        return AccessPath.forDevice(token);
      case "drive-mount":
        return this.forPath(shape.windowsPath, options);
      case "posix-absolute":
        return this.forLiteral(normalizePathPolicyLiteral(token));
      case "plain":
        return this.forPath(token, options);
    }
  }
  /**
   * The session-approval glob for an accessed path: its directory scope plus
   * `*`, derived through the baked flavor.
   *
   * Takes the already-built {@link AccessPath} — the lexical form is what a
   * later tool call is matched on, so the pattern must be derived from the
   * same representation the decision displayed (#438). Deriving it here rather
   * than at each gate keeps the platform's separator alphabet with the object
   * that owns the flavor, instead of an ambient `node:path` read (#655).
   */
  approvalPatternFor(accessPath) {
    return deriveApprovalPattern(accessPath.value(), this.flavor);
  }
  /** Platform-aware absoluteness (`win32` vs `posix` rules). */
  isAbsolute(pathValue) {
    return this.flavor.impl.isAbsolute(pathValue);
  }
  /**
   * Interpret a literal `cd` target's effect on the effective base.
   *
   * On win32 the target carries Git Bash/MSYS semantics: a drive mount
   * (`cd /c/x`) resolves to a translated Windows base (`C:\x`), a non-mount
   * POSIX absolute (`cd /tmp`) is not deterministically resolvable and yields an
   * `unknown` base, and a native/relative target is handled as usual. On POSIX
   * every token is `plain`, so an absolute target is absolute and everything
   * else is relative.
   */
  interpretBashCdTarget(target) {
    const shape = this.flavor.bashTokenShape(target);
    switch (shape.kind) {
      case "drive-mount":
        return { kind: "absolute", value: shape.windowsPath };
      case "device":
      case "posix-absolute":
        return { kind: "unknown" };
      case "plain":
        return this.flavor.impl.isAbsolute(target) ? { kind: "absolute", value: target } : { kind: "relative" };
    }
  }
  /** Resolve a `cd`-folded offset against the baked cwd (platform-aware). */
  resolveBase(offset) {
    return this.flavor.impl.resolve(this.cwd, offset);
  }
  /** Join a `cd` offset with a relative target (platform-aware), for cd-folding. */
  joinBase(offset, target) {
    return this.flavor.impl.join(offset, target);
  }
  /** Containment of `pathValue` within `directory` (platform-aware). */
  isWithinDirectory(pathValue, directory) {
    return this.flavor.isWithin(pathValue, directory);
  }
  /** Canonical (symlink-resolved) outside-cwd test against the baked cwd. */
  isOutsideWorkingDirectory(pathValue) {
    const canonicalPath = canonicalNormalizePathForComparison(
      pathValue,
      this.cwd,
      this.flavor
    );
    return isPathOutsideWorkingDirectory(
      canonicalPath,
      this.canonicalCwd,
      this.flavor
    );
  }
  /**
   * Outside-cwd test for an already-canonical boundary value (from
   * {@link AccessPath.boundaryValue}), against the baked cwd.
   *
   * Unlike {@link isOutsideWorkingDirectory}, it does not re-derive the
   * canonical form — the caller passes a value the {@link AccessPath} already
   * canonicalized, so a device's preserved `/dev/null` reaches the pure check's
   * `isSafeSystemPath` exclusion intact.
   */
  isBoundaryOutsideWorkingDirectory(canonicalPath) {
    return isPathOutsideWorkingDirectory(
      canonicalPath,
      this.canonicalCwd,
      this.flavor
    );
  }
  /**
   * Lexical (not symlink-resolved) comparison value, resolved against the baked
   * cwd. Mirrors the as-typed absolute form used for skill-prompt matching;
   * touches no filesystem, unlike {@link forPath}'s canonical alias.
   */
  comparableValue(pathValue) {
    return normalizePathForComparison(pathValue, this.cwd, this.flavor);
  }
  /**
   * Pi infrastructure-read containment for a read-only tool, decided against
   * the canonical (symlink-resolved) path and the baked cwd/flavor. Takes the
   * already-built {@link AccessPath} so the caller does not re-resolve it.
   */
  isInfrastructureRead(toolName, accessPath, infraDirs) {
    return isPiInfrastructureRead(
      toolName,
      accessPath.boundaryValue(),
      infraDirs,
      this.cwd,
      this.flavor
    );
  }
  /**
   * True when `absolutePath` names an existing filesystem entry.
   *
   * The existence probe that resolves an *unknown* bash token: a bare word is a
   * path candidate iff it names something real (ADR 0009, #645). Uses `lstat`,
   * not `stat`, so a symlink counts as an entry even when its target is
   * dangling — the link is the operand the command names, and dropping it would
   * reopen the bypass this probe closes.
   *
   * Any error (ENOENT, ENOTDIR, EACCES, ELOOP) answers `false`: an entry the
   * gate cannot confirm is not promoted, leaving the token exactly as
   * unrestricted as it is today.
   *
   * Lives here beside {@link forPath}'s canonicalization so the package keeps a
   * single filesystem edge for path interpretation.
   */
  entryExists(absolutePath) {
    if (!absolutePath) return false;
    try {
      lstatSync(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
};

// src/permission-session.ts
var PermissionSession = class {
  constructor(paths, forwarding, permissionManager, sessionRules, configStore, authorizerSelection, flavor) {
    this.paths = paths;
    this.forwarding = forwarding;
    this.permissionManager = permissionManager;
    this.sessionRules = sessionRules;
    this.configStore = configStore;
    this.authorizerSelection = authorizerSelection;
    this.flavor = flavor;
    this.pathNormalizer = new PathNormalizer(flavor, "");
  }
  paths;
  forwarding;
  permissionManager;
  sessionRules;
  configStore;
  authorizerSelection;
  flavor;
  context = null;
  skillEntries = [];
  knownAgentName = null;
  pathNormalizer;
  // ── Context lifecycle ──────────────────────────────────────────────────
  /**
   * Store the current extension context, rebuild the path normalizer for its
   * cwd, start forwarding, and activate the gateway.
   *
   * The normalizer is (re)built here rather than only at `resetForNewSession`
   * so it always tracks the active context's cwd — `ctx.cwd` is stable within a
   * session, so this is a no-op rebuild in production, but it closes the
   * fail-open gap if a tool call ever arrives before `session_start`.
   */
  activate(ctx) {
    this.context = ctx;
    this.pathNormalizer = new PathNormalizer(this.flavor, ctx.cwd);
    this.forwarding.start(ctx);
    this.authorizerSelection.activate(ctx);
  }
  /** Clear the context, stop forwarding, and deactivate the authorizer selection. */
  deactivate() {
    this.context = null;
    this.forwarding.stop();
    this.authorizerSelection.deactivate();
  }
  /** Return the current runtime context, or null if not activated. */
  getRuntimeContext() {
    return this.context;
  }
  // ── UI notifications ────────────────────────────────────────────────────
  /** Surface a warning message to the user via the active UI context, if any. */
  notify(message) {
    this.context?.ui.notify(message, "warning");
  }
  // ── Session lifecycle ────────────────────────────────────────────────────
  /**
   * Reset all mutable state for a new session.
   *
   * Configures the injected PermissionManager for `ctx.cwd` (or global-only
   * when `projectTrusted` is `false`, withholding the project cwd so an
   * untrusted project's policy scopes are not loaded, #644), clears skill
   * entries, and activates the new context.
   */
  resetForNewSession(ctx, projectTrusted) {
    this.permissionManager.configureForCwd(
      projectTrusted ? ctx.cwd : void 0
    );
    this.skillEntries = [];
    this.activate(ctx);
  }
  /**
   * Shut down the session: clear rules, skill entries, and deactivate
   * context + forwarding.
   */
  shutdown() {
    this.sessionRules.clear();
    this.skillEntries = [];
    this.deactivate();
  }
  /**
   * Reload permission manager and clear skill entries for the current context.
   * Used on config reload (e.g. `resources_discover` with reason "reload").
   *
   * When `projectTrusted` is `false` the project cwd is withheld, so a reload
   * in an untrusted project reloads only global policy; a trust grant on a
   * later reload re-includes the project scope (#644).
   */
  reload(projectTrusted) {
    this.permissionManager.configureForCwd(
      projectTrusted ? this.context?.cwd : void 0
    );
    this.skillEntries = [];
  }
  // ── Skill entries ──────────────────────────────────────────────────────
  getActiveSkillEntries() {
    return this.skillEntries;
  }
  setActiveSkillEntries(entries) {
    this.skillEntries = entries;
  }
  // ── Agent name ─────────────────────────────────────────────────────────
  /**
   * Resolve the active agent name from the session context, system prompt,
   * or last known name. Updates lastKnownActiveAgentName as a side effect.
   */
  resolveAgentName(ctx, systemPrompt) {
    const fromSession = getActiveAgentName(ctx);
    if (fromSession) {
      this.knownAgentName = fromSession;
      return fromSession;
    }
    const fromSystemPrompt = getActiveAgentNameFromSystemPrompt(systemPrompt);
    if (fromSystemPrompt) {
      this.knownAgentName = fromSystemPrompt;
      return fromSystemPrompt;
    }
    return this.knownAgentName;
  }
  // Read by the `index.ts` config-modal adapter closure:
  // `permissionManager.getComposedConfigRules(session.lastKnownActiveAgentName ?? undefined)`.
  get lastKnownActiveAgentName() {
    return this.knownAgentName;
  }
  // ── Config ─────────────────────────────────────────────────────────────
  /**
   * Reload merged config from disk; optionally update the stored runtime
   * context. When `projectTrusted` is `false`, the project scope is withheld
   * so an untrusted project's runtime config is not merged (#644).
   */
  refreshConfig(ctx, projectTrusted) {
    this.configStore.refresh(ctx, projectTrusted);
  }
  /** Write the resolved config path set to the review and debug logs. */
  logResolvedConfigPaths() {
    this.configStore.logResolvedPaths(this.context?.cwd);
  }
  /** Read current extension config. */
  get config() {
    return this.configStore.current();
  }
  // ── Infrastructure paths ───────────────────────────────────────────────
  /**
   * Combined infrastructure read directories: static paths from
   * `ExtensionPaths` plus config-derived paths.
   */
  getInfrastructureReadDirs() {
    return [
      ...this.paths.piInfrastructureDirs,
      ...this.config.piInfrastructureReadPaths ?? []
    ];
  }
  /**
   * Resolved tool-preview formatter options from the current config.
   *
   * Replaces the handler's `resolveToolPreviewLimits(session.config)` reach
   * so the pipeline reads a clean value rather than pulling raw config.
   */
  getToolPreviewLimits() {
    return resolveToolPreviewLimits();
  }
  /**
   * The configured shell-tool aliases (`shellTools`), mapping a non-`bash` tool
   * name to the input arguments holding its command and optional working
   * directory. `undefined` when no aliases are configured. Consumed by the
   * gate pipeline's {@link resolveShellInvocation} consult (#574).
   */
  getShellToolAliases() {
    return this.config.shellTools;
  }
  // ── Path normalization ────────────────────────────────────────────────
  /**
   * The session's {@link PathNormalizer}, carrying the host path flavor and the
   * session cwd. Rebuilt on every `resetForNewSession` so a session switch
   * rebinds the cwd.
   */
  getPathNormalizer() {
    return this.pathNormalizer;
  }
};

// src/access-intent/bash/sync-commands.ts
function parseBashCommandsSync(command) {
  const parser = getWarmBashParser();
  if (!parser) return null;
  const tree = parser.parse(command);
  if (!tree) return [];
  try {
    return collectCommands(tree.rootNode);
  } finally {
    tree.delete();
  }
}

// src/bash-advisory-check.ts
function resolveBashAdvisoryCheck(command, agentName, resolver) {
  const commands = parseBashCommandsSync(command);
  if (commands === null) {
    return resolver.resolve({
      kind: "tool",
      surface: "bash",
      input: { command },
      agentName
    });
  }
  return resolveBashCommandCheck(command, commands, agentName, resolver);
}

// src/permissions-service.ts
var LocalPermissionsService = class {
  constructor(resolver, session, formatterRegistry, accessExtractorRegistry, authorizerRegistry) {
    this.resolver = resolver;
    this.session = session;
    this.formatterRegistry = formatterRegistry;
    this.accessExtractorRegistry = accessExtractorRegistry;
    this.authorizerRegistry = authorizerRegistry;
  }
  resolver;
  session;
  formatterRegistry;
  accessExtractorRegistry;
  authorizerRegistry;
  checkPermission(surface, value, agentName) {
    if (surface === "bash") {
      return resolveBashAdvisoryCheck(value ?? "", agentName, this.resolver);
    }
    const intent = buildAccessIntentForSurface(
      surface,
      value,
      this.session.getPathNormalizer(),
      agentName
    );
    return this.resolver.resolve(intent);
  }
  getToolPermission(toolName, agentName) {
    return this.resolver.getToolPermission(toolName, agentName);
  }
  registerToolInputFormatter(toolName, formatter) {
    return this.formatterRegistry.register(toolName, formatter);
  }
  registerToolAccessExtractor(toolName, extractor) {
    return this.accessExtractorRegistry.register(toolName, extractor);
  }
  registerAuthorizer(name, authorize) {
    return this.authorizerRegistry.register(name, authorize);
  }
};

// src/service.ts
var SERVICE_KEY = /* @__PURE__ */ Symbol.for("@gotgenes/pi-permission-system:service");
function publishPermissionsService(service) {
  globalThis[SERVICE_KEY] = service;
}
function getPermissionsService() {
  return globalThis[SERVICE_KEY];
}
function unpublishPermissionsService(service) {
  if (getPermissionsService() !== service) {
    return;
  }
  delete globalThis[SERVICE_KEY];
}

// src/service-lifecycle.ts
var PermissionServiceLifecycle = class {
  constructor(service, detection, events, subscriptions) {
    this.service = service;
    this.detection = detection;
    this.events = events;
    this.subscriptions = subscriptions;
  }
  service;
  detection;
  events;
  subscriptions;
  activate(ctx) {
    if (!this.detection.isRegisteredChild(ctx)) {
      publishPermissionsService(this.service);
    }
    emitReadyEvent(this.events);
  }
  teardown() {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    unpublishPermissionsService(this.service);
  }
};

// src/session-logger.ts
import { join as join12 } from "node:path";

// src/logging.ts
import { appendFileSync } from "node:fs";

// src/log-field-cap.ts
var DEFAULT_REVIEW_LOG_FIELD_MAX_WIDTH = 1e3;
function resolveReviewLogFieldWidth(config) {
  return config.reviewLogFieldMaxWidth ?? DEFAULT_REVIEW_LOG_FIELD_MAX_WIDTH;
}
function capLogFieldWidths(details, maxWidth) {
  return capValue(details, maxWidth);
}
function capValue(value, maxWidth) {
  if (typeof value === "string") {
    return value.length <= maxWidth ? value : `${value.slice(0, maxWidth)}\u2026`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => capValue(entry, maxWidth));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        capValue(entry, maxWidth)
      ])
    );
  }
  return value;
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// src/logging.ts
function createPermissionSystemLogger(options) {
  const { debugLogPath, reviewLogPath, ensureLogsDirectory } = options;
  const hardened = /* @__PURE__ */ new Set();
  const writeLine = (stream, path, event, details, maxFieldWidth) => {
    const directoryError = ensureLogsDirectory();
    if (directoryError) {
      return directoryError;
    }
    try {
      const bounded = maxFieldWidth === void 0 ? details : capLogFieldWidths(details, maxFieldWidth);
      const line = redactedJsonStringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        extension: EXTENSION_ID,
        stream,
        event,
        ...bounded
      });
      if (!line) {
        return `Failed to write permission-system ${stream} log '${path}': event could not be serialized.`;
      }
      appendFileSync(path, `${line}
`, {
        encoding: "utf-8",
        mode: OWNER_ONLY_FILE_MODE
      });
      if (!hardened.has(path)) {
        hardened.add(path);
        restrictExistingPathToOwner(path, OWNER_ONLY_FILE_MODE);
      }
      return void 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to write permission-system ${stream} log '${path}': ${message}`;
    }
  };
  const debug = (event, details = {}) => {
    if (!options.getConfig().debugLog) {
      return void 0;
    }
    return writeLine("debug", debugLogPath, event, details);
  };
  const review = (event, details = {}) => {
    const config = options.getConfig();
    if (!config.permissionReviewLog) {
      return void 0;
    }
    return writeLine(
      "review",
      reviewLogPath,
      event,
      details,
      resolveReviewLogFieldWidth(config)
    );
  };
  return { debug, review };
}

// src/session-logger.ts
var PermissionSessionLogger = class {
  writer;
  reported = /* @__PURE__ */ new Set();
  notify;
  constructor(deps) {
    this.writer = createPermissionSystemLogger({
      getConfig: deps.getConfig,
      debugLogPath: join12(deps.globalLogsDir, DEBUG_LOG_FILENAME),
      reviewLogPath: join12(deps.globalLogsDir, REVIEW_LOG_FILENAME),
      ensureLogsDirectory: () => ensurePermissionSystemLogsDirectory(deps.globalLogsDir)
    });
    this.notify = deps.notify;
  }
  debug(event, details) {
    const warning = this.writer.debug(event, details);
    if (warning) this.reportOnce(warning);
  }
  review(event, details) {
    const warning = this.writer.review(event, details);
    if (warning) this.reportOnce(warning);
  }
  warn(message) {
    this.notify(message);
  }
  reportOnce(warning) {
    if (this.reported.has(warning)) return;
    this.reported.add(warning);
    this.notify(warning);
  }
};

// src/session-rules.ts
var SessionRules = class {
  rules = [];
  /** Record a wildcard pattern as approved for the given surface. */
  approve(surface, pattern) {
    this.rules.push({
      surface,
      pattern,
      action: "allow",
      layer: "session",
      origin: "session"
    });
  }
  /** Return a defensive copy of the current session ruleset. */
  getRuleset() {
    return [...this.rules];
  }
  /**
   * Record all patterns from a `SessionApproval` value object.
   *
   * The loop lives here so callers never need to know whether an approval
   * carries one pattern or many — they just tell the store to record it.
   */
  recordSessionApproval(approval) {
    for (const pattern of approval.patterns) {
      this.approve(approval.surface, pattern);
    }
  }
  /** Remove all session approvals. */
  clear() {
    this.rules = [];
  }
};

// src/tool-access-extractor-registry.ts
var ToolAccessExtractorRegistry = class {
  extractors = /* @__PURE__ */ new Map();
  /**
   * Register an extractor for `toolName`.
   *
   * Throws if an extractor is already registered for that name — keeps
   * resolution deterministic (a pi-permission-system package priority).
   * Returns a disposer that removes the extractor; the disposer is
   * identity-guarded so a stale call cannot evict a later registration.
   */
  register(toolName, extractor) {
    if (this.extractors.has(toolName)) {
      throw new Error(
        `A tool access extractor is already registered for '${toolName}'.`
      );
    }
    this.extractors.set(toolName, extractor);
    return () => {
      if (this.extractors.get(toolName) === extractor) {
        this.extractors.delete(toolName);
      }
    };
  }
  get(toolName) {
    return this.extractors.get(toolName);
  }
};

// src/tool-input-formatter-registry.ts
var ToolInputFormatterRegistry = class {
  formatters = /* @__PURE__ */ new Map();
  /**
   * Register a formatter for `toolName`.
   *
   * Throws if a formatter is already registered for that name — keeps
   * resolution deterministic (a pi-permission-system package priority).
   * Returns a disposer that removes the formatter; the disposer is
   * identity-guarded so a stale call cannot evict a later registration.
   */
  register(toolName, formatter) {
    if (this.formatters.has(toolName)) {
      throw new Error(
        `A tool input formatter is already registered for '${toolName}'.`
      );
    }
    this.formatters.set(toolName, formatter);
    return () => {
      if (this.formatters.get(toolName) === formatter) {
        this.formatters.delete(toolName);
      }
    };
  }
  get(toolName) {
    return this.formatters.get(toolName);
  }
};

// src/index.ts
function piPermissionSystemExtension(pi) {
  const agentDir = getAgentDir2();
  const paths = computeExtensionPaths(agentDir, getPackageDir());
  const hostFlavor = pathFlavorForPlatform(process.platform);
  const sessionRules = new SessionRules();
  const subagentRegistry = getSubagentSessionRegistry();
  const servingRegistry = getServingSessionRegistry();
  const subagentDetection = new SubagentDetection({
    subagentSessionsDir: paths.subagentSessionsDir,
    flavor: hostFlavor,
    registry: subagentRegistry
  });
  const formatterRegistry = new ToolInputFormatterRegistry();
  registerBuiltinToolInputFormatters(formatterRegistry);
  const accessExtractorRegistry = new ToolAccessExtractorRegistry();
  const authorizerRegistry = new AuthorizerRegistry();
  let configStore;
  let session;
  const isYoloEnabled = () => isYoloModeEnabled(configStore.current());
  const permissionManager = new PermissionManager({
    agentDir,
    flavor: hostFlavor,
    isYoloEnabled
  });
  const logger = new PermissionSessionLogger({
    globalLogsDir: paths.globalLogsDir,
    getConfig: () => configStore.current(),
    notify: (message) => session.notify(message)
  });
  configStore = new ConfigStore({
    agentDir,
    policyPaths: permissionManager,
    logger
  });
  const prompter = new PermissionPrompter({ logger });
  const servingHeartbeats = new ServingHeartbeatStore({
    forwardingDir: paths.forwardingDir,
    logger
  });
  const servingLiveness = new ForwardingLivenessJudge({
    registry: servingRegistry,
    heartbeats: servingHeartbeats
  });
  const authorizerSelection = new AuthorizerSelection({
    detection: subagentDetection,
    events: pi.events,
    getPromptPreferences: () => ({
      doublePressToConfirm: configStore.current().doublePressToConfirm,
      budget: resolveRenderBudget(configStore.current())
    }),
    requestPermissionDecision,
    forwardingDir: paths.forwardingDir,
    registry: subagentRegistry,
    serving: servingLiveness,
    getForwardingTimeoutMs: () => configStore.current().forwardingTimeoutMs ?? PERMISSION_FORWARDING_TIMEOUT_MS,
    logger,
    prompter,
    // The published service is the narrow, session-scoped PermissionQuery a
    // chain link is handed (it routes bash/path at gate parity against the live
    // session cwd). A thunk because `permissionsService` is constructed below;
    // it resolves at session_start (activate), well after assignment.
    getPermissionQuery: () => permissionsService,
    // Same registry instance the registerAuthorizer service surface writes to,
    // resolved in config order at activation.
    authorizerRegistry,
    getAuthorizerChain: () => configStore.current().authorizerChain ?? []
  });
  const resolver = new PermissionResolver(permissionManager, sessionRules);
  const servingPolicy = {
    resolve: (intent) => resolver.resolve(
      buildResolvedIntentFromMatchValues(
        intent.surface,
        intent.matchValues,
        intent.principal.agentName
      )
    )
  };
  const reporter = new GateDecisionReporter(logger, pi.events);
  const requestServer = new ForwardedRequestServer({
    forwardingDir: paths.forwardingDir,
    logger,
    policy: servingPolicy,
    escalator: authorizerSelection,
    // The forwarded ask's own gate lives in the requesting session, so the
    // serving side announces the terminal decision on this session's bus.
    broadcaster: reporter,
    // Records a whole-session grant into the same SessionRules the resolver and
    // gate runner read, so a serving-scope grant governs the parent and future
    // forwarded resolutions.
    recorder: sessionRules,
    registry: subagentRegistry
  });
  session = new PermissionSession(
    paths,
    new ForwardingManager({
      detection: subagentDetection,
      forwarder: requestServer,
      serving: composeServingAnnouncers(servingRegistry, servingHeartbeats),
      logger
    }),
    permissionManager,
    sessionRules,
    configStore,
    authorizerSelection,
    hostFlavor
  );
  configStore.refresh(void 0, false);
  const configPath = getGlobalConfigPath(agentDir);
  registerPermissionSystemCommand(pi, {
    config: configStore,
    configPath,
    getActiveAgentConfigRules: () => permissionManager.getComposedConfigRules(
      session.lastKnownActiveAgentName ?? void 0
    )
  });
  const permissionsService = new LocalPermissionsService(
    resolver,
    session,
    formatterRegistry,
    accessExtractorRegistry,
    authorizerRegistry
  );
  const unsubSubagentLifecycle = subscribeSubagentLifecycle(
    pi.events,
    subagentRegistry
  );
  const serviceLifecycle = new PermissionServiceLifecycle(
    permissionsService,
    subagentDetection,
    pi.events,
    [unsubSubagentLifecycle]
  );
  const toolRegistry = {
    getAll: () => pi.getAllTools(),
    getActive: () => pi.getActiveTools(),
    setActive: (names) => pi.setActiveTools(names)
  };
  const audit = new DecisionAudit();
  const lifecycle = new SessionLifecycleHandler(
    session,
    resolver,
    serviceLifecycle,
    logger,
    audit
  );
  const agentPrep = new AgentPrepHandler(
    session,
    resolver,
    toolRegistry,
    () => {
      void warmBashParser();
    }
  );
  const gateRunner = new GateRunner(
    resolver,
    sessionRules,
    authorizerSelection,
    reporter,
    isYoloEnabled
  );
  const toolCallGatePipeline = new ToolCallGatePipeline(
    resolver,
    session,
    formatterRegistry,
    accessExtractorRegistry
  );
  const skillInputGatePipeline = new SkillInputGatePipeline(resolver);
  const gates = new PermissionGateHandler(
    session,
    toolRegistry,
    toolCallGatePipeline,
    skillInputGatePipeline,
    gateRunner
  );
  pi.on(
    "session_start",
    (event, ctx) => lifecycle.handleSessionStart(event, ctx)
  );
  pi.on(
    "resources_discover",
    (event, ctx) => lifecycle.handleResourcesDiscover(event, ctx)
  );
  pi.on("session_shutdown", () => lifecycle.handleSessionShutdown());
  pi.on("before_agent_start", (event, ctx) => agentPrep.handle(event, ctx));
  pi.on("input", (event, ctx) => gates.handleInput(event, ctx));
  pi.on(
    "tool_call",
    createFailClosedToolCall(
      (event, ctx) => gates.handleToolCall(event, ctx),
      reporter,
      audit,
      logger
    )
  );
}
export {
  piPermissionSystemExtension as default
};
