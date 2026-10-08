import encoder from "@nem035/gpt-3-encoder";

export const countTokens = (text: string) => encoder.encode(text).length;

export interface ToolCall {
  id: string;
  name: string;
  label?: string;
  arguments: string;
  result?: string;
  // pending: waiting for the user's approval
  status?: "running" | "pending" | "done" | "error" | "denied";
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  loading?: boolean;
  // Model thinking, shown collapsed
  reasoning?: string;
  // Function calls made by the assistant in this step, with their results
  toolCalls?: ToolCall[];
  // Attached images (ids in lib/images.ts)
  images?: string[];
}

const messageText = (message: Message) =>
  message.content +
  (message.toolCalls || [])
    .map((c) => c.arguments + (c.result || ""))
    .join("");

// Rough cost of one attached image; providers count roughly 500-1600 tokens
const IMAGE_TOKENS = 1000;

// Helper function to estimate tokens
function estimateTokens(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words * (100 / 75));
}

// Truncate messages
export function truncateMessages(
  messages: Message[],
  modelMaxTokens: number,
  userMaxTokens: number
): Message[] {
  if (messages.length <= 1) return messages;

  if (!userMaxTokens) {
    // Try to reserve some room for the model output by default
    userMaxTokens = 1024;
  }
  const targetTokens = modelMaxTokens - userMaxTokens;

  // Never remove the system message
  let accumulatedTokens = 0;
  const ret = [];
  let startIdx = 0;

  if (messages[0].role === "system") {
    accumulatedTokens = estimateTokens(messageText(messages[0]));
    ret.push(messages[0]);
    startIdx = 1;
  }

  // Try to truncate messages as is
  for (let i = messages.length - 1; i >= startIdx; i--) {
    const message = messages[i];
    const tokens =
      estimateTokens(messageText(message)) + (message.images?.length || 0) * IMAGE_TOKENS;
    if (accumulatedTokens + tokens > targetTokens) {
      break;
    }
    accumulatedTokens += tokens;
    // Insert right after the system message, keeping the original order
    ret.splice(startIdx, 0, message);
  }
  return ret;
}
