// Client for OpenAI-compatible chat APIs (OpenAI, xAI, Groq, OpenRouter,
// Gemini, Ollama): model listing, streaming completions with tool calls, and
// OpenAI text to speech.
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { Message, truncateMessages, countTokens } from "./Message";
import { getModelInfo } from "./Model";
import { ProviderConnection } from "./Providers";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function assertIsError(e: any): asserts e is Error {
  if (!(e instanceof Error)) {
    throw new Error("Not an error");
  }
}

// HTTP or network failure from a provider, with the provider's message
export class CompletionError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, fallback: string) {
    let message = body || fallback;
    try {
      const parsed = JSON.parse(body);
      const error = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
      message =
        (typeof error === "string" ? error : error?.message) ||
        parsed.message ||
        message;
    } catch {}
    super(message);
    this.status = status;
    this.body = body;
  }
}

const authHeaders = (key: string | undefined): Record<string, string> =>
  key ? { Authorization: `Bearer ${key}` } : {};

export async function testKey(
  key: string | undefined,
  baseUrl: string = OPENAI_BASE_URL,
  path = "/models"
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${path}`, { headers: authHeaders(key) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModels(
  connection: ProviderConnection
): Promise<string[]> {
  const res = await fetch(`${connection.baseUrl}/models`, {
    headers: authHeaders(connection.apiKey),
  });
  if (!res.ok) {
    throw new CompletionError(res.status, await res.text(), "Could not load models");
  }
  const data = await res.json();
  return (data.data || data.models || []).map((model: any) => model.id || model.name);
}

interface ChatCompletionParams {
  model: string;
  temperature: number;
  top_p: number;
  n: number;
  stop: string;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
  logit_bias: string;
}

export interface StreamedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface CompletionResult {
  content: string;
  reasoning: string;
  toolCalls: StreamedToolCall[];
  aborted: boolean;
  promptTokens: number;
  completionTokens: number;
}

// Expand our messages into the API format: tool calls and their results are
// stored on the assistant message and sent as assistant + tool messages.
export const toApiMessages = (messages: Message[]) =>
  messages.flatMap((m): Record<string, unknown>[] => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      return [
        {
          role: "assistant",
          content: m.content || "",
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.arguments || "{}" },
          })),
        },
        ...m.toolCalls.map((c) => ({
          role: "tool",
          tool_call_id: c.id,
          content: c.result ?? "No result",
        })),
      ];
    }
    // Skip empty assistant placeholders
    if (m.role === "assistant" && !m.content.trim()) return [];
    return [{ role: m.role, content: m.content }];
  });

export async function streamCompletion({
  messages,
  params,
  connection,
  tools,
  signal,
  onContent,
  onReasoning,
}: {
  messages: Message[];
  params: ChatCompletionParams;
  connection: ProviderConnection;
  tools?: Record<string, unknown>[];
  signal?: AbortSignal;
  onContent?: (content: string) => void;
  onReasoning?: (content: string) => void;
}): Promise<CompletionResult> {
  const modelInfo = getModelInfo(params.model);

  // Truncate messages to fit within maxTokens parameter
  const submitMessages = truncateMessages(
    messages,
    modelInfo.maxTokens,
    params.max_tokens
  );

  const logitBias = JSON.parse(params.logit_bias || "{}");
  const payload = JSON.stringify({
    model: params.model,
    messages: toApiMessages(submitMessages),
    stream: true,
    temperature: params.temperature,
    top_p: params.top_p,
    // Leave out unset parameters, some providers reject them
    stop: params.stop || undefined,
    logit_bias: _.isEmpty(logitBias) ? undefined : logitBias,
    presence_penalty: params.presence_penalty || undefined,
    frequency_penalty: params.frequency_penalty || undefined,
    n: params.n === 1 ? undefined : params.n,
    // 0 == unlimited
    max_tokens: params.max_tokens || undefined,
    tools: tools?.length ? tools : undefined,
  });

  const result: CompletionResult = {
    content: "",
    reasoning: "",
    toolCalls: [],
    aborted: false,
    promptTokens: 0,
    completionTokens: 0,
  };

  let res: Response;
  try {
    res = await fetch(`${connection.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(connection.apiKey),
      },
      body: payload,
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return { ...result, aborted: true };
    throw new CompletionError(0, "", `Could not reach ${connection.baseUrl}`);
  }

  if (!res.ok || !res.body) {
    throw new CompletionError(res.status, await res.text(), `HTTP ${res.status}`);
  }

  // Tool call fragments arrive spread over many chunks, keyed by index
  const calls: StreamedToolCall[] = [];
  const addToolCallDelta = (delta: any) => {
    let call =
      delta.index !== undefined
        ? calls[delta.index]
        : delta.id
        ? calls.find((c) => c.id === delta.id)
        : calls[calls.length - 1];
    if (!call) {
      call = { id: "", name: "", arguments: "" };
      if (delta.index !== undefined) calls[delta.index] = call;
      else calls.push(call);
    }
    if (delta.id) call.id = delta.id;
    if (delta.function?.name) call.name += delta.function.name;
    if (delta.function?.arguments) {
      const args = delta.function.arguments;
      call.arguments += typeof args === "string" ? args : JSON.stringify(args);
    }
  };

  // Server-sent events can be split across chunks, keep the incomplete line
  let pending = "";
  let usage: any;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const cleaned = line.slice(5).trim();
    if (!cleaned || cleaned === "[DONE]") return;

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error(e);
      return;
    }
    if (parsed.error) {
      throw new CompletionError(500, cleaned, "Stream error");
    }
    if (parsed.usage) usage = parsed.usage;

    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return;
    const reasoning = delta.reasoning_content || delta.reasoning;
    if (typeof reasoning === "string" && reasoning) {
      result.reasoning += reasoning;
      onReasoning?.(reasoning);
    }
    if (delta.content) {
      result.content += delta.content;
      onContent?.(delta.content);
    }
    (delta.tool_calls || []).forEach(addToolCallDelta);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      lines.forEach((line) => handleLine(line.trim()));
    }
    handleLine(pending.trim());
  } catch (e) {
    if (signal?.aborted) return { ...result, aborted: true };
    if (e instanceof CompletionError) throw e;
    throw new CompletionError(0, "", String(e));
  }

  result.toolCalls = calls
    .filter((c) => c && c.name)
    .map((c) => ({ ...c, id: c.id || `call_${uuidv4().slice(0, 8)}` }));

  const [loadingMessages, loadedMessages] = _.partition(submitMessages, "loading");
  result.promptTokens =
    usage?.prompt_tokens ??
    countTokens(loadedMessages.map((m) => m.content).join("\n"));
  result.completionTokens =
    usage?.completion_tokens ??
    countTokens(
      loadingMessages.map((m) => m.content).join("\n") +
        result.content +
        result.toolCalls.map((c) => c.arguments).join("")
    );
  return result;
}

export const OPENAI_TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer"
] as const;

export const validateVoice = (voice: any): voice is typeof OPENAI_TTS_VOICES[number] => {
  if (!OPENAI_TTS_VOICES.includes(voice)) {
    return false;
  }
  return true;
}

export async function genAudio({
  text,
  key,
  voice,
  model
}: {
  text: string;
  key: string;
  voice?: string;
  model?: string;
}): Promise<string | null> {
  if (!voice || !model) {
    throw new Error("Missing voice or model");
  }
  const body = JSON.stringify({
    model,
    input: text,
    voice,
    response_format: 'mp3',
  });
  const res = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body
  });

  return URL.createObjectURL(await res.blob());
}
