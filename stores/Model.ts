export const modelInfos: Record<
  string,
  {
    displayName: string;
    maxTokens: number;
    costPer1kTokens: { prompt: number; completion: number };
  }
> = {
  "gpt-3.5-turbo": {
    displayName: "ChatGPT-3.5 Turbo",
    maxTokens: 16 * 1024,
    costPer1kTokens: { prompt: 0.001, completion: 0.002 },
  },
  "gpt-3.5-turbo-16k": {
    displayName: "ChatGPT-3.5 Turbo (16k)",
    maxTokens: 16 * 1024,
    costPer1kTokens: { prompt: 0.001, completion: 0.002 },
  },
  "gpt-3.5-turbo-instruct": {
    displayName: "ChatGPT-3.5 Instruct",
    maxTokens: 4 * 1024,
    costPer1kTokens: { prompt: 0.0015, completion: 0.002 },
  },
  "gpt-4": {
    displayName: "GPT-4",
    maxTokens: 8 * 1024,
    costPer1kTokens: { prompt: 0.03, completion: 0.06 },
  },
  "gpt-4-32k": {
    displayName: "GPT-4 (32k)",
    maxTokens: 8 * 1024,
    costPer1kTokens: { prompt: 0.06, completion: 0.12 },
  },
  "gpt-4-1106-preview": {
    displayName: "GPT-4 Turbo",
    maxTokens: 128 * 1024,
    costPer1kTokens: { prompt: 0.01, completion: 0.03 },
  },
  "gpt-4-1106-vision-preview": {
    displayName: "GPT-4 Turbo Vision",
    maxTokens: 128 * 1024,
    costPer1kTokens: { prompt: 0.01, completion: 0.03 },
  },
};

// Context sizes for model families not listed above. Costs are unknown (0).
// Conservative where families differ by size or version.
const contextByPrefix: [RegExp, number][] = [
  [/^grok-/, 128 * 1024],
  [/^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o\d|chatgpt-)/, 128 * 1024],
  [/^gpt-oss/, 128 * 1024],
  [/^gemini-/, 1000 * 1000],
  [/^gemma-?3/, 128 * 1024],
  [/^gemma/, 8 * 1024],
  [/^claude-/, 200 * 1000],
  [/^(meta-)?llama-?3\.[1-3]|^llama-?4/, 128 * 1024],
  [/^(qwen3|qwen-?2\.5|qwq)/, 32 * 1024],
  [/^(deepseek)/, 64 * 1024],
  [/^(mistral|mixtral|codestral|ministral)/, 32 * 1024],
  [/^(kimi|moonshot)/, 128 * 1024],
];

// Context size assumed for unknown models
const DEFAULT_CONTEXT = 32 * 1024;

export const getModelInfo = (model: string) => {
  if (modelInfos[model]) return modelInfos[model];
  // OpenRouter ids are vendor/model; Ollama ids are model:tag
  const id = model.toLowerCase().replace(/^.*\//, "").replace(/^models\//, "");
  return {
    displayName: model,
    maxTokens: contextByPrefix.find(([prefix]) => prefix.test(id))?.[1] || DEFAULT_CONTEXT,
    costPer1kTokens: { prompt: 0, completion: 0 },
  };
};
