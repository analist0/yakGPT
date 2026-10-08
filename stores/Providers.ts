// Chat providers that speak the OpenAI-compatible /v1/chat/completions API.
export type ProviderId = "openai" | "xai" | "ollama";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

export const providers: Record<
  ProviderId,
  {
    name: string;
    // Keep only models that can be used for chat
    filterModels: (ids: string[]) => string[];
  }
> = {
  openai: {
    name: "OpenAI",
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
    filterModels: (ids) =>
      ids.filter((id) => id.startsWith("grok") && !/(image|video)/.test(id)),
  },
  ollama: {
    name: "Ollama",
    filterModels: (ids) => ids,
  },
};

// Accept "http://host:11434" as well as "http://host:11434/v1"
export const normalizeOllamaBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

export const providerIds = Object.keys(providers) as ProviderId[];

export interface ProviderConnection {
  baseUrl: string;
  apiKey: string | undefined;
}

interface ProviderState {
  chatProvider: ProviderId;
  apiKey: string | undefined;
  apiKeyXai: string | undefined;
  ollamaBaseUrl: string | undefined;
}

export const getProviderConnection = (
  state: ProviderState,
  provider: ProviderId = state.chatProvider
): ProviderConnection => {
  switch (provider) {
    case "xai":
      return { baseUrl: "https://api.x.ai/v1", apiKey: state.apiKeyXai };
    case "ollama":
      return {
        baseUrl: normalizeOllamaBaseUrl(
          state.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL
        ),
        apiKey: undefined,
      };
    default:
      return { baseUrl: "https://api.openai.com/v1", apiKey: state.apiKey };
  }
};

export const isProviderConfigured = (
  state: ProviderState,
  provider: ProviderId = state.chatProvider
) => {
  if (provider === "ollama") return !!state.ollamaBaseUrl;
  return !!getProviderConnection(state, provider).apiKey;
};

export const configuredProviders = (state: ProviderState) =>
  providerIds.filter((id) => isProviderConfigured(state, id));
