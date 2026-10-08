// Hardware detection and a catalog of Ollama models with rough memory needs,
// used to suggest local models that will run well on this machine.

export interface GpuInfo {
  model: string;
  vendor?: string;
  vramGB?: number;
  dynamic?: boolean;
}

export interface HardwareInfo {
  source: "server" | "browser";
  os?: string;
  arch?: string;
  cpu?: string;
  cores?: number;
  threads?: number;
  ramGB?: number;
  freeRamGB?: number;
  gpus: GpuInfo[];
  appleSilicon?: boolean;
}

export type ModelTag = "chat" | "code" | "reasoning" | "vision" | "tools" | "multilingual";

export interface LocalModel {
  id: string; // Ollama tag
  family: string;
  params: string;
  sizeGB: number; // download size (q4)
  tags: ModelTag[];
  description: string;
}

// Download sizes are for the default (q4) tags on ollama.com
export const LOCAL_MODELS: LocalModel[] = [
  { id: "qwen3:0.6b", family: "Qwen 3", params: "0.6B", sizeGB: 0.5, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Tiny, runs anywhere" },
  { id: "gemma3:1b", family: "Gemma 3", params: "1B", sizeGB: 0.8, tags: ["chat", "multilingual"], description: "Very small Google model" },
  { id: "llama3.2:1b", family: "Llama 3.2", params: "1B", sizeGB: 1.3, tags: ["chat", "tools"], description: "Small Meta model" },
  { id: "qwen3:1.7b", family: "Qwen 3", params: "1.7B", sizeGB: 1.4, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Small with thinking mode" },
  { id: "llama3.2:3b", family: "Llama 3.2", params: "3B", sizeGB: 2.0, tags: ["chat", "tools"], description: "Fast everyday assistant" },
  { id: "phi4-mini:3.8b", family: "Phi-4 mini", params: "3.8B", sizeGB: 2.5, tags: ["chat", "reasoning", "tools"], description: "Strong reasoning for its size" },
  { id: "qwen3:4b", family: "Qwen 3", params: "4B", sizeGB: 2.6, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Best small all-rounder" },
  { id: "gemma3:4b", family: "Gemma 3", params: "4B", sizeGB: 3.3, tags: ["chat", "vision", "multilingual"], description: "Small model that sees images" },
  { id: "qwen2.5-coder:7b", family: "Qwen 2.5 Coder", params: "7B", sizeGB: 4.7, tags: ["code", "tools"], description: "Code generation and completion" },
  { id: "llama3.1:8b", family: "Llama 3.1", params: "8B", sizeGB: 4.9, tags: ["chat", "tools", "multilingual"], description: "Reliable general model" },
  { id: "qwen3:8b", family: "Qwen 3", params: "8B", sizeGB: 5.2, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Great quality per GB" },
  { id: "deepseek-r1:8b", family: "DeepSeek R1", params: "8B", sizeGB: 5.2, tags: ["reasoning"], description: "Step-by-step reasoning" },
  { id: "gemma3:12b", family: "Gemma 3", params: "12B", sizeGB: 8.1, tags: ["chat", "vision", "multilingual"], description: "Strong multilingual + vision" },
  { id: "phi4:14b", family: "Phi-4", params: "14B", sizeGB: 9.1, tags: ["chat", "reasoning"], description: "Math and logic" },
  { id: "qwen3:14b", family: "Qwen 3", params: "14B", sizeGB: 9.3, tags: ["chat", "reasoning", "tools", "multilingual"], description: "High quality mid-size" },
  { id: "qwen2.5-coder:14b", family: "Qwen 2.5 Coder", params: "14B", sizeGB: 9.0, tags: ["code", "tools"], description: "Stronger coding model" },
  { id: "gpt-oss:20b", family: "gpt-oss", params: "20B", sizeGB: 14, tags: ["chat", "reasoning", "tools"], description: "OpenAI open-weight model" },
  { id: "mistral-small3.2:24b", family: "Mistral Small 3.2", params: "24B", sizeGB: 15, tags: ["chat", "vision", "tools", "multilingual"], description: "Fast, capable, sees images" },
  { id: "gemma3:27b", family: "Gemma 3", params: "27B", sizeGB: 17, tags: ["chat", "vision", "multilingual"], description: "Top open multilingual model" },
  { id: "qwen3:30b", family: "Qwen 3 MoE", params: "30B (3B active)", sizeGB: 19, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Big model, fast as a small one" },
  { id: "qwen3:32b", family: "Qwen 3", params: "32B", sizeGB: 20, tags: ["chat", "reasoning", "tools", "multilingual"], description: "Flagship dense Qwen" },
  { id: "qwen2.5-coder:32b", family: "Qwen 2.5 Coder", params: "32B", sizeGB: 20, tags: ["code", "tools"], description: "Best open coding model of its size" },
  { id: "deepseek-r1:32b", family: "DeepSeek R1", params: "32B", sizeGB: 20, tags: ["reasoning"], description: "Deep reasoning" },
  { id: "llama3.3:70b", family: "Llama 3.3", params: "70B", sizeGB: 43, tags: ["chat", "tools", "multilingual"], description: "Large high-quality model" },
  { id: "gpt-oss:120b", family: "gpt-oss", params: "120B", sizeGB: 65, tags: ["chat", "reasoning", "tools"], description: "Largest OpenAI open-weight model" },
];

// Memory a model needs while running: weights plus context and runtime overhead
export const requiredMemoryGB = (model: LocalModel) =>
  Math.round((model.sizeGB * 1.2 + 1) * 10) / 10;

export type FitLevel = "gpu" | "cpu" | "tight" | "no";

export interface Budget {
  // Memory that runs a model at full speed (VRAM or unified memory)
  fastGB: number;
  // Memory that runs it at all (system RAM, CPU speed)
  totalGB: number;
  accelerator: "nvidia" | "amd" | "apple" | "intel" | "none";
}

export const memoryBudget = (hw: HardwareInfo): Budget => {
  const ram = hw.ramGB || 8;
  if (hw.appleSilicon) {
    // macOS lets the GPU use about 70-75% of unified memory
    return { fastGB: ram * 0.7, totalGB: ram * 0.75, accelerator: "apple" };
  }
  const dedicated = hw.gpus
    .filter((g) => g.vramGB && g.vramGB >= 2 && !g.dynamic)
    .sort((a, b) => (b.vramGB || 0) - (a.vramGB || 0))[0];
  const vendor = (dedicated?.vendor || dedicated?.model || "").toLowerCase();
  const accelerator = !dedicated
    ? "none"
    : vendor.includes("nvidia")
    ? "nvidia"
    : vendor.includes("amd") || vendor.includes("advanced micro")
    ? "amd"
    : vendor.includes("intel")
    ? "intel"
    : "none";
  return {
    fastGB: dedicated ? (dedicated.vramGB || 0) * 0.9 : 0,
    // Ollama can split a model between VRAM and RAM
    totalGB: ram * 0.6 + (dedicated ? (dedicated.vramGB || 0) * 0.9 : 0),
    accelerator,
  };
};

export const modelFit = (model: LocalModel, budget: Budget): FitLevel => {
  const need = requiredMemoryGB(model);
  if (budget.fastGB >= need) return "gpu";
  if (budget.totalGB >= need) {
    // CPU inference gets slow beyond ~8B parameters
    return model.sizeGB <= 6 || budget.fastGB > 0 ? "cpu" : "tight";
  }
  return "no";
};

export interface Recommendation {
  model: LocalModel;
  fit: FitLevel;
  best?: boolean;
}

export const recommendModels = (hw: HardwareInfo): Recommendation[] => {
  const budget = memoryBudget(hw);
  const ranked = LOCAL_MODELS.map((model) => ({
    model,
    fit: modelFit(model, budget),
  }));
  // Best pick per purpose: the largest model that runs at full speed, else on CPU
  const pick = (tag: ModelTag) =>
    [...ranked]
      .filter((r) => r.model.tags.includes(tag) && (r.fit === "gpu" || r.fit === "cpu"))
      .sort(
        (a, b) =>
          (a.fit === "gpu" ? 0 : 1) - (b.fit === "gpu" ? 0 : 1) ||
          b.model.sizeGB - a.model.sizeGB
      )[0];
  const best = new Set(
    (["chat", "code", "reasoning", "vision"] as ModelTag[])
      .map(pick)
      .filter(Boolean)
      .map((r) => r!.model.id)
  );
  const order: Record<FitLevel, number> = { gpu: 0, cpu: 1, tight: 2, no: 3 };
  return ranked
    .map((r) => ({ ...r, best: best.has(r.model.id) }))
    .sort(
      (a, b) =>
        Number(!!b.best) - Number(!!a.best) ||
        order[a.fit] - order[b.fit] ||
        b.model.sizeGB - a.model.sizeGB
    );
};

// Fallback when the server route is unavailable: what the browser can see
export const detectBrowserHardware = async (): Promise<HardwareInfo> => {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter: () => Promise<any> };
    userAgentData?: { platform?: string };
  };
  const gpus: GpuInfo[] = [];
  try {
    const adapter = await nav.gpu?.requestAdapter();
    const info = adapter?.info;
    if (info) {
      gpus.push({
        model: [info.vendor, info.architecture, info.description]
          .filter(Boolean)
          .join(" ") || "WebGPU adapter",
        vendor: info.vendor,
      });
    }
  } catch {}
  const platform = nav.userAgentData?.platform || navigator.platform || "";
  return {
    source: "browser",
    os: platform,
    threads: navigator.hardwareConcurrency,
    // Browsers cap deviceMemory at 8, so this is a lower bound
    ramGB: nav.deviceMemory,
    gpus,
    appleSilicon: /mac/i.test(platform) && gpus.some((g) => /apple/i.test(g.model)),
  };
};

export const detectHardware = async (): Promise<HardwareInfo> => {
  try {
    const res = await fetch("/api/hardware");
    if (res.ok) return await res.json();
  } catch {}
  return detectBrowserHardware();
};
