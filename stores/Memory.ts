// Long-term memory: short facts about the user that the model saves with
// tools and sees in every chat. The user can view, edit and delete them.
import { v4 as uuidv4 } from "uuid";
import { useChatStore } from "./ChatStore";
import type { ToolSpec } from "./Tools";

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

const MAX_MEMORIES = 100;
const MAX_MEMORY_CHARS = 500;
// Longest memory list put in the prompt; older memories are left out first
const MAX_PROMPT_CHARS = 6000;

const get = useChatStore.getState;
const set = useChatStore.setState;

// Credentials must never be stored as memories
const SECRET_PATTERN =
  /\b(sk-[\w-]{10,}|xai-[\w-]{10,}|gsk_[\w-]{10,}|AIza[\w-]{20,}|ghp_[\w-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)|\b(password|passcode|סיסמה|סיסמא)\b/i;

const shortId = () => uuidv4().slice(0, 8);

export const addMemory = (text: string) => {
  const clean = text.trim().slice(0, MAX_MEMORY_CHARS);
  if (!clean) throw new Error("Memory is empty");
  if (SECRET_PATTERN.test(clean)) throw new Error("Memories must not contain passwords or keys");
  const memory: Memory = { id: shortId(), text: clean, createdAt: Date.now(), updatedAt: Date.now() };
  set((state) => ({ memories: [...state.memories, memory].slice(-MAX_MEMORIES) }));
  return memory;
};

export const updateMemory = (id: string, text: string) => {
  const clean = text.trim().slice(0, MAX_MEMORY_CHARS);
  if (!clean) throw new Error("Memory is empty");
  if (SECRET_PATTERN.test(clean)) throw new Error("Memories must not contain passwords or keys");
  if (!get().memories.some((m) => m.id === id)) throw new Error(`No memory with id ${id}`);
  set((state) => ({
    memories: state.memories.map((m) => (m.id === id ? { ...m, text: clean, updatedAt: Date.now() } : m)),
  }));
};

export const deleteMemory = (id: string) => {
  if (!get().memories.some((m) => m.id === id)) throw new Error(`No memory with id ${id}`);
  set((state) => ({ memories: state.memories.filter((m) => m.id !== id) }));
};

export const memoryPrompt = () => {
  const { memoryEnabled, memories } = get();
  if (!memoryEnabled) return "";
  const intro =
    "Long-term memory: facts the user shared in earlier chats. Use them when relevant. " +
    "When the user tells you something worth remembering across chats (preferences, people, projects, facts about them), save it with remember. " +
    "If a saved fact changes, use update_memory instead of adding a duplicate; use forget when asked or when a fact is wrong. " +
    "Never save passwords, keys or other secrets.";
  if (memories.length === 0) return `${intro}\nNothing saved yet.`;
  const lines: string[] = [];
  let length = 0;
  for (const m of [...memories].reverse()) {
    const line = `- [${m.id}] ${m.text}`;
    if (length + line.length > MAX_PROMPT_CHARS) break;
    lines.unshift(line);
    length += line.length;
  }
  return `${intro}\nSaved memories:\n${lines.join("\n")}`;
};

// Memory tools only change Hamal's own memory list, which the user sees and
// can undo, so they run without asking unless a tool rule says otherwise
export const MEMORY_TOOLS: ToolSpec[] = [
  {
    name: "remember",
    label: "Remember",
    description: "Save a short fact about the user to long-term memory, for use in future chats.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "One self-contained fact" } },
      required: ["text"],
    },
    source: "memory",
    risk: "write",
    internal: true,
    run: async ({ text }) => `Saved as [${addMemory(String(text ?? "")).id}]`,
  },
  {
    name: "update_memory",
    label: "Update memory",
    description: "Replace the text of a saved memory by its id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, text: { type: "string" } },
      required: ["id", "text"],
    },
    source: "memory",
    risk: "write",
    internal: true,
    run: async ({ id, text }) => {
      updateMemory(String(id), String(text ?? ""));
      return "Updated";
    },
  },
  {
    name: "forget",
    label: "Forget",
    description: "Delete a saved memory by its id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    source: "memory",
    risk: "write",
    internal: true,
    run: async ({ id }) => {
      deleteMemory(String(id));
      return "Deleted";
    },
  },
];
