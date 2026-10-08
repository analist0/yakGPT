// Chat providers that speak the OpenAI-compatible /v1/chat/completions API.
export type ProviderId =
  | "openai"
  | "xai"
  | "groq"
  | "openrouter"
  | "gemini"
  | "ollama";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

// Name of the store field holding each provider's key
export const providerKeyField = {
  openai: "apiKey",
  xai: "apiKeyXai",
  groq: "apiKeyGroq",
  openrouter: "apiKeyOpenRouter",
  gemini: "apiKeyGemini",
} as const;

type KeyedProvider = keyof typeof providerKeyField;

interface ProviderInfo {
  name: string;
  baseUrl?: string;
  keyUrl?: string;
  // Endpoint that rejects invalid keys (default /models)
  keyCheckPath?: string;
  local?: boolean;
  // Keep only models that can be used for chat
  filterModels: (ids: string[]) => string[];
}

export const providers: Record<ProviderId, ProviderInfo> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/account/api-keys",
    filterModels: (ids) =>
      ids.filter(
        (id) =>
          /^(gpt-|chatgpt-|o\d)/.test(id) &&
          !/(instruct|audio|realtime|transcribe|tts|search|image|embedding)/.test(
            id
          )
      ),
  },
  xai: {
    name: "xAI",
    baseUrl: "https://api.x.ai/v1",
    keyUrl: "https://console.x.ai",
    filterModels: (ids) =>
      ids.filter((id) => id.startsWith("grok") && !/(image|video)/.test(id)),
  },
  groq: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    filterModels: (ids) =>
      ids.filter((id) => !/(whisper|tts|guard|playai)/.test(id)),
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    // The model list is public, so check the key itself
    keyCheckPath: "/key",
    filterModels: (ids) => ids,
  },
  gemini: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    filterModels: (ids) =>
      ids
        .map((id) => id.replace(/^models\//, ""))
        .filter(
          (id) =>
            id.startsWith("gemini") &&
            !/(embedding|image|tts|live|native-audio)/.test(id)
        ),
  },
  ollama: {
    name: "Ollama",
    local: true,
    filterModels: (ids) => ids,
  },
};

// Accept "http://host:11434" as well as "http://host:11434/v1"
export const normalizeOllamaBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

// Ollama's native API (model pulls, details) lives next to /v1
export const ollamaNativeUrl = (baseUrl: string | undefined) =>
  normalizeOllamaBaseUrl(baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(
    /\/v1$/,
    ""
  );

export const providerIds = Object.keys(providers) as ProviderId[];

export interface ProviderConnection {
  baseUrl: string;
  apiKey: string | undefined;
}

type ProviderState = {
  chatProvider: ProviderId;
  ollamaBaseUrl: string | undefined;
} & { [K in (typeof providerKeyField)[KeyedProvider]]: string | undefined };

export const getProviderKey = (state: ProviderState, provider: ProviderId) =>
  provider === "ollama"
    ? undefined
    : state[providerKeyField[provider as KeyedProvider]];

export const getProviderConnection = (
  state: ProviderState,
  provider: ProviderId = state.chatProvider
): ProviderConnection => {
  if (provider === "ollama") {
    return {
      baseUrl: normalizeOllamaBaseUrl(
        state.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL
      ),
      apiKey: undefined,
    };
  }
  return {
    baseUrl: providers[provider].baseUrl!,
    apiKey: getProviderKey(state, provider),
  };
};

export const isProviderConfigured = (
  state: ProviderState,
  provider: ProviderId = state.chatProvider
) => {
  if (provider === "ollama") return !!state.ollamaBaseUrl;
  return !!getProviderKey(state, provider);
};

export const configuredProviders = (state: ProviderState) =>
  providerIds.filter((id) => isProviderConfigured(state, id));
