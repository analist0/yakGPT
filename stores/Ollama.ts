// Talks to Ollama's native API to list, download and remove local models.
import { create } from "zustand";
import { useChatStore } from "./ChatStore";
import { DEFAULT_OLLAMA_BASE_URL, ollamaNativeUrl } from "./Providers";
import { captureError } from "./ErrorLog";
import { activateProviderIfNeeded, refreshModels } from "./ChatActions";

export interface InstalledModel {
  name: string;
  size: number;
  modifiedAt: string;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
}

interface OllamaState {
  reachable: boolean | undefined;
  version?: string;
  installed: InstalledModel[];
  pulls: Record<string, PullProgress>;
}

export const useOllama = create<OllamaState>()(() => ({
  reachable: undefined,
  installed: [],
  pulls: {},
}));

const pullControllers = new Map<string, AbortController>();

const baseUrl = () =>
  ollamaNativeUrl(useChatStore.getState().ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);

export const checkOllama = async () => {
  try {
    const [version, tags] = await Promise.all([
      fetch(`${baseUrl()}/api/version`).then((r) => r.json()),
      fetch(`${baseUrl()}/api/tags`).then((r) => r.json()),
    ]);
    useOllama.setState({
      reachable: true,
      version: version.version,
      installed: (tags.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
      })),
    });
    // Remember the server so chat can use it
    if (!useChatStore.getState().ollamaBaseUrl) {
      useChatStore.setState({ ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL });
      activateProviderIfNeeded("ollama");
    }
    return true;
  } catch {
    useOllama.setState({ reachable: false, installed: [] });
    return false;
  }
};

const setPull = (name: string, progress: PullProgress | undefined) =>
  useOllama.setState((s) => {
    const pulls = { ...s.pulls };
    if (progress) pulls[name] = progress;
    else delete pulls[name];
    return { pulls };
  });

export const pullModel = async (name: string) => {
  const controller = new AbortController();
  pullControllers.set(name, controller);
  setPull(name, { status: "starting" });
  try {
    const res = await fetch(`${baseUrl()}/api/pull`, {
      method: "POST",
      body: JSON.stringify({ model: name, stream: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}`);

    // Progress arrives as newline-delimited JSON
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.error) throw new Error(event.error);
        setPull(name, {
          status: event.status,
          completed: event.completed,
          total: event.total,
        });
      }
    }
    setPull(name, { status: "success", done: true });
    await checkOllama();
    useChatStore.setState((s) => ({
      lastModelByProvider: { ...s.lastModelByProvider, ollama: name },
    }));
    activateProviderIfNeeded("ollama");
    refreshModels();
  } catch (error) {
    if (controller.signal.aborted) {
      setPull(name, undefined);
      return;
    }
    captureError("models", error, { details: `ollama pull ${name}` });
    setPull(name, { status: "error", error: (error as Error).message });
  } finally {
    pullControllers.delete(name);
  }
};

export const cancelPull = (name: string) => pullControllers.get(name)?.abort();

export const deleteModel = async (name: string) => {
  try {
    const res = await fetch(`${baseUrl()}/api/delete`, {
      method: "DELETE",
      body: JSON.stringify({ model: name }),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    await checkOllama();
    refreshModels();
  } catch (error) {
    captureError("models", error, { details: `ollama delete ${name}` });
    throw error;
  }
};
