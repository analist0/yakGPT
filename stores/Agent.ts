// Planning and sub-agents, the "deep agent" pattern: the model keeps a task
// list with update_plan, and hands self-contained subtasks to sub-agents that
// work in their own context and return only their result. Sub-agents use the
// parent's tools (minus these two, so they cannot nest, and minus memory) and go through the
// same approvals.
import { v4 as uuidv4 } from "uuid";
import { useChatStore } from "./ChatStore";
import { Message, ToolCall } from "./Message";
import { streamCompletion } from "./OpenAI";
import { DECLINED_RESULT, needsApproval, requestApproval } from "./Approval";
import { captureError } from "./ErrorLog";
import { runTool, toOpenAITools, ToolContext, ToolSpec } from "./Tools";

export type PlanStatus = "pending" | "in_progress" | "done";

export interface Plan {
  items: { text: string; status: PlanStatus }[];
  updatedAt: number;
}

const MAX_SUBAGENT_STEPS = 6;
const MAX_RESULT_CHARS = 8000;

const SUBAGENT_PROMPT = `You are a sub-agent working on one task for a main agent.
Work on the task with the tools you have, then reply with the result only: concise, complete and self-contained, because the main agent sees nothing else from you.
If you cannot finish, say what you found and what is missing. Do not ask questions; you cannot get answers.`;

// Update a tool call wherever it is in a chat (sub-agent progress)
const updateToolCall = (chatId: string, callId: string, update: (call: ToolCall) => ToolCall) =>
  useChatStore.setState((state) => ({
    chats: state.chats.map((c) =>
      c.id !== chatId || !c.messages.some((m) => m.toolCalls?.some((t) => t.id === callId))
        ? c
        : {
            ...c,
            messages: c.messages.map((m) =>
              m.toolCalls?.some((t) => t.id === callId)
                ? { ...m, toolCalls: m.toolCalls.map((t) => (t.id === callId ? update(t) : t)) }
                : m
            ),
          }
    ),
  }));

const PLAN_TOOL: ToolSpec = {
  name: "update_plan",
  label: "Plan",
  description:
    "Write or update your task list for a task with several steps. Send the whole list every time, with each item's status. Keep exactly one item in_progress while working.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done"] },
          },
          required: ["text", "status"],
        },
      },
    },
    required: ["items"],
  },
  source: "agent",
  risk: "read",
  internal: true,
  run: async ({ items }, context) => {
    if (!context?.chatId) throw new Error("Plans are only available in chats");
    if (!Array.isArray(items) || items.length === 0) throw new Error("items must be a non-empty list");
    const plan: Plan = {
      items: items.slice(0, 30).map((i: any) => ({
        text: String(i?.text ?? "").slice(0, 300),
        status: ["pending", "in_progress", "done"].includes(i?.status) ? i.status : "pending",
      })),
      updatedAt: Date.now(),
    };
    useChatStore.setState((state) => ({
      chats: state.chats.map((c) => (c.id === context.chatId ? { ...c, plan } : c)),
    }));
    const done = plan.items.filter((i) => i.status === "done").length;
    return `Plan saved (${done}/${plan.items.length} done)`;
  },
};

const SUBAGENT_TOOL: ToolSpec = {
  name: "run_subagent",
  label: "Sub-agent",
  description:
    "Hand a self-contained subtask to a sub-agent with its own context and your tools. It returns only its final result. Calls made together run in parallel. Give it everything it needs in the task: it cannot see this conversation.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", description: "What to do and what to return" },
      context: { type: "string", description: "Facts from this conversation the sub-agent needs" },
    },
    required: ["task"],
  },
  source: "agent",
  // Spawning only costs tokens; each tool the sub-agent calls is approved on its own
  risk: "read",
  internal: true,
  run: (args, context) => runSubagent(String(args.task ?? ""), String(args.context ?? ""), context),
};

export const AGENT_TOOLS = [PLAN_TOOL, SUBAGENT_TOOL];

const runSubagent = async (task: string, extra: string, context?: ToolContext) => {
  if (!context?.agent || !context.chatId) throw new Error("Sub-agents are only available in text chats");
  if (!task.trim()) throw new Error("Missing task");
  const { connection, params } = context.agent;
  const chatId = context.chatId;
  const parentId = context.callId;
  // No nesting, and no memory writes: sub-agents don't see the user
  const tools = context.agent.tools.filter((t) => t.source !== "agent" && t.source !== "memory");

  const messages: Message[] = [
    { id: "sub-system", role: "system", content: SUBAGENT_PROMPT },
    { id: "sub-task", role: "user", content: extra ? `${task}\n\nContext:\n${extra}` : task },
  ];
  const setSubCall = (call: ToolCall) =>
    updateToolCall(chatId, parentId, (parent) => ({
      ...parent,
      subCalls: parent.subCalls?.some((c) => c.id === call.id)
        ? parent.subCalls.map((c) => (c.id === call.id ? call : c))
        : [...(parent.subCalls || []), call],
    }));

  for (let step = 0; step <= MAX_SUBAGENT_STEPS; step++) {
    const offered = step < MAX_SUBAGENT_STEPS ? tools : [];
    const result = await streamCompletion({
      messages,
      params,
      connection,
      tools: toOpenAITools(offered),
      signal: context.signal,
    });
    if (result.aborted) return "Stopped";
    const answer = result.content.replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim();
    if (result.toolCalls.length === 0) {
      return answer.length > MAX_RESULT_CHARS ? `${answer.slice(0, MAX_RESULT_CHARS)}\n…` : answer || "(no result)";
    }

    const calls: ToolCall[] = result.toolCalls.map((c) => ({
      ...c,
      // Sub-agent call ids must be unique in the chat for approvals
      id: `${parentId}-${c.id || uuidv4()}`,
      label: tools.find((t) => t.name === c.name)?.label,
      status: "running" as const,
    }));
    for (const call of calls) {
      setSubCall(call);
      const tool = tools.find((t) => t.name === call.name);
      if (tool && needsApproval(tool)) {
        setSubCall({ ...call, status: "pending" });
        if (!(await requestApproval(call.id, context.signal))) {
          Object.assign(call, { status: "denied", result: DECLINED_RESULT });
          setSubCall({ ...call });
          continue;
        }
        setSubCall({ ...call, status: "running" });
      }
      try {
        call.result = await runTool(tools, call.name, call.arguments, { ...context, callId: call.id });
        call.status = "done";
      } catch (error) {
        captureError("tools", error, { details: `sub-agent ${call.name}` });
        call.result = `Error: ${(error as Error).message}`;
        call.status = "error";
      }
      setSubCall({ ...call });
    }
    if (context.signal?.aborted) return "Stopped";
    messages.push({ id: uuidv4(), role: "assistant", content: result.content, toolCalls: calls });
  }
  return "The sub-agent stopped without a final answer";
};
