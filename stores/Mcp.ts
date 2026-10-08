// MCP servers: remote (Streamable HTTP / SSE) servers are connected straight
// from the browser; local stdio servers run inside the Next.js server and are
// reached through /api/mcp.
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useChatStore } from "./ChatStore";
import { captureError } from "./ErrorLog";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "http" | "stdio";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  // MCP tool hints, used to decide which calls need approval
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

export type McpConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface McpStatus {
  servers: Record<
    string,
    { state: McpConnectionState; error?: string; tools: McpTool[] }
  >;
}

// Connection status is runtime only, configs live in the persisted chat store
export const useMcpStatus = create<McpStatus>()(() => ({ servers: {} }));

const httpClients = new Map<string, Client>();

const setStatus = (id: string, status: McpStatus["servers"][string]) =>
  useMcpStatus.setState((s) => ({ servers: { ...s.servers, [id]: status } }));

const postServer = async (body: Record<string, unknown>) => {
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `MCP server error (${res.status})`);
  return data;
};

const connectHttp = async (config: McpServerConfig) => {
  const [{ Client }, { StreamableHTTPClientTransport }, { SSEClientTransport }] =
    await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
      import("@modelcontextprotocol/sdk/client/sse.js"),
    ]);
  const url = new URL(config.url!);
  const requestInit = { headers: config.headers || {} };

  const client = new Client({ name: "yakgpt", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
  } catch (streamableError) {
    // Older servers only speak the SSE transport
    const sseClient = new Client({ name: "yakgpt", version: "1.0.0" });
    try {
      await sseClient.connect(new SSEClientTransport(url, { requestInit }));
    } catch {
      throw streamableError;
    }
    return sseClient;
  }
  return client;
};

export const connectMcpServer = async (config: McpServerConfig) => {
  setStatus(config.id, { state: "connecting", tools: [] });
  try {
    let tools: McpTool[];
    if (config.transport === "http") {
      await httpClients.get(config.id)?.close().catch(() => {});
      const client = await connectHttp(config);
      httpClients.set(config.id, client);
      const result = await client.listTools();
      tools = result.tools.map((t) => ({
        serverId: config.id,
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
        annotations: t.annotations,
      }));
    } else {
      const data = await postServer({ action: "listTools", config });
      tools = (data.tools as Omit<McpTool, "serverId">[]).map((t) => ({
        ...t,
        serverId: config.id,
      }));
    }
    setStatus(config.id, { state: "connected", tools });
    return tools;
  } catch (error) {
    const message = (error as Error).message || String(error);
    setStatus(config.id, { state: "error", error: message, tools: [] });
    captureError("mcp", error, { details: `${config.name} (${config.transport})` });
    return [];
  }
};

export const disconnectMcpServer = async (config: McpServerConfig) => {
  if (config.transport === "http") {
    await httpClients.get(config.id)?.close().catch(() => {});
    httpClients.delete(config.id);
  } else {
    await postServer({ action: "disconnect", config }).catch(() => {});
  }
  setStatus(config.id, { state: "disconnected", tools: [] });
};

const formatContent = (content: unknown): string => {
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((part: any) => {
      if (part.type === "text") return part.text;
      if (part.type === "resource" && part.resource?.text) return part.resource.text;
      if (part.type === "image") return `[image ${part.mimeType}]`;
      return JSON.stringify(part);
    })
    .join("\n");
};

export const callMcpTool = async (
  serverId: string,
  name: string,
  args: Record<string, unknown>
) => {
  const config = useChatStore.getState().mcpServers.find((s) => s.id === serverId);
  if (!config) throw new Error("MCP server was removed");

  let result: any;
  if (config.transport === "http") {
    let client = httpClients.get(serverId);
    if (!client) {
      await connectMcpServer(config);
      client = httpClients.get(serverId);
      if (!client) throw new Error(`Cannot connect to ${config.name}`);
    }
    result = await client.callTool({ name, arguments: args });
  } else {
    result = (await postServer({ action: "callTool", config, name, args })).result;
  }

  const text = formatContent(result?.content ?? result);
  if (result?.isError) throw new Error(text || "Tool returned an error");
  return text;
};

export const saveMcpServer = (config: Omit<McpServerConfig, "id"> & { id?: string }) => {
  const id = config.id || uuidv4();
  useChatStore.setState((state) => ({
    mcpServers: state.mcpServers.some((s) => s.id === id)
      ? state.mcpServers.map((s) => (s.id === id ? { ...config, id } : s))
      : [...state.mcpServers, { ...config, id }],
  }));
  const saved = { ...config, id };
  if (saved.enabled) connectMcpServer(saved);
  return saved;
};

export const removeMcpServer = (config: McpServerConfig) => {
  disconnectMcpServer(config);
  useChatStore.setState((state) => ({
    mcpServers: state.mcpServers.filter((s) => s.id !== config.id),
  }));
  useMcpStatus.setState((s) => {
    const servers = { ...s.servers };
    delete servers[config.id];
    return { servers };
  });
};

export const setMcpServerEnabled = (config: McpServerConfig, enabled: boolean) => {
  useChatStore.setState((state) => ({
    mcpServers: state.mcpServers.map((s) =>
      s.id === config.id ? { ...s, enabled } : s
    ),
  }));
  if (enabled) connectMcpServer({ ...config, enabled });
  else disconnectMcpServer(config);
};

// Connect all enabled servers once at startup
let started = false;
export const startMcpServers = () => {
  if (started) return;
  started = true;
  useChatStore
    .getState()
    .mcpServers.filter((s) => s.enabled)
    .forEach(connectMcpServer);
};

// Parse a Claude Desktop style config: {"mcpServers": {"name": {...}}}
export const parseMcpJson = (text: string) => {
  const data = JSON.parse(text);
  const entries = Object.entries(data.mcpServers || data) as [string, any][];
  return entries.map(([name, s]) => {
    const isHttp = !!s.url;
    return {
      name,
      transport: isHttp ? "http" : "stdio",
      url: s.url,
      headers: s.headers,
      command: s.command,
      args: s.args,
      env: s.env,
      enabled: true,
    } as Omit<McpServerConfig, "id">;
  });
};
