// Runs local (stdio) MCP servers on behalf of the browser.
import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { requireLocal } from "@/lib/serverAccess";

interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// Keep processes alive across requests, keyed by their launch config
const globalForMcp = globalThis as unknown as {
  yakgptMcpClients?: Map<string, Promise<Client>>;
};
const clients: Map<string, Promise<Client>> = (globalForMcp.yakgptMcpClients ??= new Map());

const keyOf = (c: StdioConfig) =>
  JSON.stringify([c.command, c.args || [], c.env || {}]);

const getClient = (config: StdioConfig) => {
  const key = keyOf(config);
  let client = clients.get(key);
  if (!client) {
    client = (async () => {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        // Pass the full environment: launchers like npx/uvx need the user's
        // PATH, proxy and registry settings, which the SDK's minimal default drops
        env: {
          ...(process.env as Record<string, string>),
          ...(config.env || {}),
        },
        stderr: "pipe",
      });
      const c = new Client({ name: "yakgpt", version: "1.0.0" });
      transport.onclose = () => clients.delete(key);
      await c.connect(transport);
      return c;
    })();
    clients.set(key, client);
    client.catch(() => clients.delete(key));
  }
  return client;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireLocal(req, res)) return;

  const { action, config, name, args } = req.body || {};
  if (!config?.command || typeof config.command !== "string") {
    return res.status(400).json({ error: "Missing command" });
  }

  try {
    if (action === "disconnect") {
      const key = keyOf(config);
      const client = clients.get(key);
      clients.delete(key);
      await (await client)?.close();
      return res.json({ ok: true });
    }

    const client = await getClient(config);
    if (action === "listTools") {
      const { tools } = await client.listTools();
      return res.json({
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }
    if (action === "callTool") {
      const result = await client.callTool({ name, arguments: args || {} });
      return res.json({ result });
    }
    return res.status(400).json({ error: `Unknown action ${action}` });
  } catch (error) {
    clients.delete(keyOf(config));
    return res.status(500).json({ error: (error as Error).message });
  }
}
