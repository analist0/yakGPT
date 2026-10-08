// Tool registry for function calling: built-in tools, the load_skill tool and
// tools exposed by connected MCP servers.
import { useChatStore } from "./ChatStore";
import { useMcpStatus, callMcpTool, McpTool } from "./Mcp";
import { enabledSkills, findSkill } from "./Skills";
import { MEMORY_TOOLS } from "./Memory";
import { AGENT_TOOLS } from "./Agent";
import type { ProviderConnection } from "./Providers";
import type { ChatCompletionParams } from "./OpenAI";

export type ToolSource = "builtin" | "skill" | "mcp" | "memory" | "agent";

// read: only reads or computes. write: changes something that can be undone
// or stays inside a sandbox. destructive: deletes, sends, pays or publishes
export type ToolRisk = "read" | "write" | "destructive";

export interface ToolSpec {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  source: ToolSource;
  risk: ToolRisk;
  // Only changes Hamal's own data that the user can see and undo (e.g.
  // memories): runs without approval in every mode, unless a rule says ask
  internal?: boolean;
  serverId?: string;
  run: (args: Record<string, any>, context?: ToolContext) => Promise<string>;
}

// Where a tool call runs. The agent loop fills in everything; other callers
// (e.g. realtime voice) only some of it
export interface ToolContext {
  callId: string;
  chatId?: string;
  signal?: AbortSignal;
  // The running agent: lets tools such as run_subagent start their own loop
  agent?: {
    tools: ToolSpec[];
    connection: ProviderConnection;
    params: ChatCompletionParams;
  };
}

const CALC_FUNCTIONS = [
  "sqrt", "cbrt", "abs", "sin", "cos", "tan", "asin", "acos", "atan",
  "log", "log2", "log10", "exp", "pow", "min", "max", "round", "floor",
  "ceil", "PI", "E",
];

const evaluateExpression = (expression: string) => {
  const stripped = CALC_FUNCTIONS.reduce(
    (expr, fn) => expr.replace(new RegExp(`\\b${fn}\\b`, "g"), ""),
    expression
  );
  if (!/^[\d\s+\-*/%^().,eE]*$/.test(stripped)) {
    throw new Error("Only numbers, operators and Math functions are allowed");
  }
  const js = expression
    .replace(/\^/g, "**")
    .replace(new RegExp(`\\b(${CALC_FUNCTIONS.join("|")})\\b`, "g"), "Math.$1");
  const value = new Function(`"use strict"; return (${js});`)();
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error("Expression did not produce a number");
  }
  return String(value);
};

export const BUILTIN_TOOLS: ToolSpec[] = [
  {
    name: "get_current_time",
    label: "Current time",
    description: "Get the current date and time, optionally in a given IANA time zone.",
    parameters: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA time zone, e.g. Asia/Jerusalem" },
      },
    },
    source: "builtin",
    risk: "read",
    run: async ({ timezone }) => {
      const now = new Date();
      const zone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      return JSON.stringify({
        iso: now.toISOString(),
        timezone: zone,
        local: now.toLocaleString("en-GB", { timeZone: zone, dateStyle: "full", timeStyle: "long" }),
      });
    },
  },
  {
    name: "calculator",
    label: "Calculator",
    description: "Evaluate a math expression exactly, e.g. '(12.5*4)^2 / sqrt(16)'. Use for any arithmetic.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    source: "builtin",
    risk: "read",
    run: async ({ expression }) => evaluateExpression(String(expression)),
  },
  {
    name: "fetch_url",
    label: "Fetch web page",
    description: "Fetch a web page or text file by URL and return its readable text (max 20k chars).",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "http(s) URL" } },
      required: ["url"],
    },
    source: "builtin",
    risk: "read",
    run: async ({ url }) => {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return `HTTP ${data.status}${data.truncated ? " (truncated)" : ""}\n\n${data.text}`;
    },
  },
];

const LOAD_SKILL_TOOL: ToolSpec = {
  name: "load_skill",
  label: "Load skill",
  description: "Load the full instructions of a skill by name. Call before doing a task that matches a skill.",
  parameters: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  },
  source: "skill",
  risk: "read",
  run: async ({ name }) => {
    const skill = findSkill(String(name));
    if (!skill) throw new Error(`No enabled skill named "${name}"`);
    return skill.instructions;
  },
};

// OpenAI-compatible tool names: [a-zA-Z0-9_-]{1,64}
const slug = (text: string) =>
  text.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

// MCP's defaults: a tool that is not read-only counts as destructive unless it
// says otherwise
const mcpRisk = (tool: McpTool): ToolRisk =>
  tool.annotations?.readOnlyHint
    ? "read"
    : tool.annotations?.destructiveHint === false
    ? "write"
    : "destructive";

export const allTools = (): ToolSpec[] => {
  const { mcpServers } = useChatStore.getState();
  const status = useMcpStatus.getState().servers;

  const mcpTools: ToolSpec[] = mcpServers
    .filter((s) => s.enabled && status[s.id]?.state === "connected")
    .flatMap((server) =>
      status[server.id].tools.map((tool) => ({
        name: `mcp_${slug(server.name).slice(0, 20)}_${slug(tool.name)}`.slice(0, 64),
        label: `${server.name}: ${tool.name}`,
        description: tool.description || tool.name,
        parameters: tool.inputSchema || { type: "object", properties: {} },
        source: "mcp" as const,
        risk: mcpRisk(tool),
        serverId: server.id,
        run: (args) => callMcpTool(server.id, tool.name, args),
      }))
    );

  return [
    ...BUILTIN_TOOLS,
    ...(enabledSkills().length > 0 ? [LOAD_SKILL_TOOL] : []),
    ...(useChatStore.getState().memoryEnabled ? MEMORY_TOOLS : []),
    ...AGENT_TOOLS,
    ...mcpTools,
  ];
};

export const activeTools = () => {
  const { toolsEnabled, disabledTools } = useChatStore.getState();
  if (!toolsEnabled) return [];
  return allTools().filter((t) => !disabledTools.includes(t.name));
};

export const toOpenAITools = (tools: ToolSpec[]) =>
  tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

export const toggleTool = (name: string) =>
  useChatStore.setState((state) => ({
    disabledTools: state.disabledTools.includes(name)
      ? state.disabledTools.filter((n) => n !== name)
      : [...state.disabledTools, name],
  }));

export const runTool = async (
  tools: ToolSpec[],
  name: string,
  rawArgs: string,
  context?: ToolContext
) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  let args: Record<string, any> = {};
  if (rawArgs.trim()) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      throw new Error(`Invalid JSON arguments: ${rawArgs.slice(0, 200)}`);
    }
  }
  return tool.run(args, context);
};
