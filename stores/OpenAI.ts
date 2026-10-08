import _ from "lodash";
import { Message, truncateMessages, countTokens } from "./Message";
import { getModelInfo } from "./Model";
import axios from "axios";
import { ProviderConnection } from "./Providers";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function assertIsError(e: any): asserts e is Error {
  if (!(e instanceof Error)) {
    throw new Error("Not an error");
  }
}

async function fetchFromAPI(endpoint: string, key: string | undefined) {
  try {
    const res = await axios.get(endpoint, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    return res;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      console.error(e.response?.data);
    }
    throw e;
  }
}

export async function testKey(
  key: string | undefined,
  baseUrl: string = OPENAI_BASE_URL
): Promise<boolean> {
  try {
    const res = await fetchFromAPI(`${baseUrl}/models`, key);
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

export async function fetchModels(
  connection: ProviderConnection
): Promise<string[]> {
  try {
    const res = await fetchFromAPI(
      `${connection.baseUrl}/models`,
      connection.apiKey
    );
    return res.data.data.map((model: any) => model.id);
  } catch (e) {
    return [];
  }
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

const paramKeys = [
  "model",
  "temperature",
  "top_p",
  "n",
  "stop",
  "max_tokens",
  "presence_penalty",
  "frequency_penalty",
  "logit_bias",
];

export async function streamCompletion(
  messages: Message[],
  params: ChatCompletionParams,
  connection: ProviderConnection,
  abortController?: AbortController,
  callback?: ((content: string) => void) | undefined,
  endCallback?:
    | ((promptTokensUsed: number, completionTokensUsed: number) => void)
    | undefined,
  errorCallback?: ((status: number, body: string) => void) | undefined
) {
  const modelInfo = getModelInfo(params.model);

  // Truncate messages to fit within maxTokens parameter
  const submitMessages = truncateMessages(
    messages,
    modelInfo.maxTokens,
    params.max_tokens
  );

  const submitParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => paramKeys.includes(key))
  );

  const logitBias = JSON.parse(params.logit_bias || "{}");
  const payload = JSON.stringify({
    messages: submitMessages.map(({ role, content }) => ({ role, content })),
    stream: true,
    ...submitParams,
    // Leave out unset parameters, some providers reject them
    stop: params.stop || undefined,
    logit_bias: _.isEmpty(logitBias) ? undefined : logitBias,
    presence_penalty: params.presence_penalty || undefined,
    frequency_penalty: params.frequency_penalty || undefined,
    n: params.n === 1 ? undefined : params.n,
    // 0 == unlimited
    max_tokens: params.max_tokens || undefined,
  });

  let res: Response;
  try {
    res = await fetch(`${connection.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey
          ? { Authorization: `Bearer ${connection.apiKey}` }
          : {}),
      },
      body: payload,
      signal: abortController?.signal,
    });
  } catch (e) {
    if (abortController?.signal.aborted) {
      endCallback?.(0, 0);
      return;
    }
    errorCallback?.(0, `Could not reach ${connection.baseUrl}`);
    return;
  }

  if (!res.ok || !res.body) {
    errorCallback?.(res.status, await res.text());
    return;
  }

  let buffer = "";
  // Server-sent events can be split across chunks, keep the incomplete line
  let pending = "";
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

    const content = parsed.choices?.[0]?.delta?.content;
    if (!content) return;
    buffer += content;
    callback?.(content);
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
    if (abortController?.signal.aborted) {
      endCallback?.(0, 0);
      return;
    }
    errorCallback?.(0, String(e));
    return;
  }

  const [loadingMessages, loadedMessages] = _.partition(
    submitMessages,
    "loading"
  );
  const promptTokensUsed = countTokens(
    loadedMessages.map((m) => m.content).join("\n")
  );

  const completionTokensUsed = countTokens(
    loadingMessages.map((m) => m.content).join("\n") + buffer
  );

  endCallback?.(promptTokensUsed, completionTokensUsed);
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
