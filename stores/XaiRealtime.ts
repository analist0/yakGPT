// Speech-to-speech conversations with Grok over xAI's realtime WebSocket API.
// Audio is sent and received as base64 PCM16 inside JSON events; transcripts of
// both sides are written into the active chat.
import { v4 as uuidv4 } from "uuid";
import { notifications } from "@mantine/notifications";
import { NextRouter } from "next/router";
import { useChatStore } from "./ChatStore";
import { getChatById, updateChatMessages } from "./utils";
import { Message } from "./Message";
import { addChat } from "./ChatActions";
import { captureError } from "./ErrorLog";
import { activeTools, runTool, ToolSpec } from "./Tools";
import { skillsPrompt } from "./Skills";
import { memoryPrompt } from "./Memory";
import { summaryPrompt } from "./Compaction";
import { DECLINED_RESULT, needsApproval, requestApproval } from "./Approval";

const get = useChatStore.getState;
const set = useChatStore.setState;

export const XAI_REALTIME_VOICES = ["ara", "eve", "leo", "rex", "sal"] as const;
export const XAI_REALTIME_MODELS = [
  "grok-voice-latest",
  "grok-voice-think-fast-2.0",
] as const;

const XAI_BASE_URL = "https://api.x.ai/v1";
const SUPPORTED_RATES = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
const OUTPUT_RATE = 24000;
// Number of previous chat messages given to the voice model as context
const CONTEXT_MESSAGES = 20;

const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

interface RealtimeSession {
  ws: WebSocket;
  audioContext: AudioContext;
  micStream: MediaStream;
  captureNode: AudioWorkletNode;
  chatId: string;
  playhead: number;
  sources: Set<AudioBufferSourceNode>;
  // Realtime item / response id -> chat message id
  messageIds: Map<string, string>;
  // User message created when speech starts, before its transcript arrives
  pendingUserMessageId: string | undefined;
  // Tools offered to the model for this session
  tools: ToolSpec[];
  // Tool calls per response: the follow-up response is requested once the
  // response is done and every call in it has an output
  toolBatches: Map<string, { pending: Set<string>; done: boolean; cancelled?: boolean }>;
  seenCalls: Set<string>;
  // Aborted when the session stops, declining pending approvals
  abort: AbortController;
}

let session: RealtimeSession | undefined;

async function createClientSecret(apiKey: string): Promise<string> {
  const res = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error;
    throw new Error(
      (typeof error === "string" ? error : error?.message) ||
        `Could not create realtime session (${res.status})`
    );
  }
  const token = data.value ?? data.client_secret?.value;
  if (!token) throw new Error("No client secret in xAI response");
  return token;
}

const floatToBase64Pcm16 = (samples: Float32Array) => {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  });
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
};

const base64Pcm16ToFloat = (data: string) => {
  const binary = atob(data);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
};

const buildInstructions = (chatId: string, tools: ToolSpec[]) => {
  const chat = getChatById(get().chats, chatId);
  const messages = chat?.messages || [];
  const systemPrompt = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const history = messages
    .filter((m) => m.role !== "system" && m.content.trim())
    .slice(-CONTEXT_MESSAGES)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const toolHint =
    tools.length > 0 &&
    "You can call tools. Before a tool call that may take a moment, say briefly what you are doing. Some tool calls wait for the user to approve them on screen; if so, tell the user.";
  const skills = tools.some((t) => t.name === "load_skill") && skillsPrompt();

  return [
    systemPrompt || "You are a helpful assistant. Keep spoken answers short.",
    toolHint,
    skills,
    memoryPrompt(),
    chat && summaryPrompt(chat),
    history && `Conversation so far:\n${history}`,
  ]
    .filter(Boolean)
    .join("\n\n");
};

const updateMessage = (
  chatId: string,
  messageId: string,
  update: (message: Message) => void
) =>
  set((state) => ({
    chats: updateChatMessages(state.chats, chatId, (messages) =>
      messages.map((m) => {
        if (m.id !== messageId) return m;
        // Copy so memoized message views re-render
        const copy = { ...m };
        update(copy);
        return copy;
      })
    ),
  }));

const addMessage = (chatId: string, role: Message["role"]) => {
  const id = uuidv4();
  set((state) => ({
    chats: updateChatMessages(state.chats, chatId, (messages) => [
      ...messages,
      { id, role, content: "", loading: true },
    ]),
  }));
  return id;
};

// Key for assistant events that carry neither a response nor an item id
const CURRENT_RESPONSE = "current-response";

// Find or create the chat message for a realtime item
const messageFor = (
  s: RealtimeSession,
  key: string | undefined,
  role: Message["role"]
) => {
  const existing = key && s.messageIds.get(key);
  if (existing) return existing;

  let id: string;
  if (role === "user" && s.pendingUserMessageId) {
    id = s.pendingUserMessageId;
    s.pendingUserMessageId = undefined;
  } else {
    id = addMessage(s.chatId, role);
  }
  if (key) s.messageIds.set(key, id);
  return id;
};

// Mark loading messages as done; voice turns without a transcript get a marker
const finalizeMessages = (s: RealtimeSession) =>
  set((state) => ({
    chats: updateChatMessages(state.chats, s.chatId, (messages) =>
      messages.map((m) => {
        const ids = [...s.messageIds.values(), s.pendingUserMessageId];
        if (!m.loading || !ids.includes(m.id)) return m;
        const empty = !m.content && !m.toolCalls?.length;
        return { ...m, loading: false, content: empty && m.role === "user" ? "🎤" : m.content };
      })
    ),
  }));

const stopPlayback = (s: RealtimeSession) => {
  s.sources.forEach((source) => source.stop());
  s.sources.clear();
  s.playhead = 0;
};

const playAudio = (s: RealtimeSession, data: string) => {
  const samples = base64Pcm16ToFloat(data);
  if (samples.length === 0) return;
  const buffer = s.audioContext.createBuffer(1, samples.length, OUTPUT_RATE);
  buffer.copyToChannel(samples, 0);

  const source = s.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(s.audioContext.destination);
  // Queue chunks back to back
  const startAt = Math.max(s.audioContext.currentTime, s.playhead);
  source.start(startAt);
  s.playhead = startAt + buffer.duration;
  s.sources.add(source);
  source.onended = () => s.sources.delete(source);
};

// Ask for the follow-up answer once the response that called tools is done
// and every one of its calls has an output
const maybeRespond = (s: RealtimeSession, responseId: string) => {
  const batch = s.toolBatches.get(responseId);
  if (!batch || !batch.done || batch.pending.size > 0) return;
  s.toolBatches.delete(responseId);
  if (!batch.cancelled && session === s && s.ws.readyState === WebSocket.OPEN) {
    s.ws.send(JSON.stringify({ type: "response.create" }));
  }
};

const handleFunctionCall = async (
  s: RealtimeSession,
  responseId: string | undefined,
  call: { call_id?: string; name?: string; arguments?: string; item_id?: string }
) => {
  const callId = call.call_id;
  if (!callId || !call.name || s.seenCalls.has(callId)) return;
  s.seenCalls.add(callId);
  const name = call.name;
  const args = call.arguments || "";
  const batchKey = responseId || CURRENT_RESPONSE;

  let batch = s.toolBatches.get(batchKey);
  if (!batch) {
    batch = { pending: new Set(), done: false };
    s.toolBatches.set(batchKey, batch);
  }
  batch.pending.add(callId);

  const messageId = messageFor(s, responseId || call.item_id || CURRENT_RESPONSE, "assistant");
  updateMessage(s.chatId, messageId, (m) => {
    m.toolCalls = [
      ...(m.toolCalls || []),
      {
        id: callId,
        name,
        label: s.tools.find((t) => t.name === name)?.label,
        arguments: args,
        status: "running",
      },
    ];
  });

  let update: { result: string; status: "done" | "error" | "denied" } | undefined;
  const tool = s.tools.find((t) => t.name === name);
  if (tool && needsApproval(tool)) {
    updateMessage(s.chatId, messageId, (m) => {
      m.toolCalls = m.toolCalls?.map((c) => (c.id === callId ? { ...c, status: "pending" } : c));
    });
    const approved = await requestApproval(callId, s.abort.signal);
    if (session !== s) return;
    if (!approved) update = { result: DECLINED_RESULT, status: "denied" };
    else {
      updateMessage(s.chatId, messageId, (m) => {
        m.toolCalls = m.toolCalls?.map((c) => (c.id === callId ? { ...c, status: "running" } : c));
      });
    }
  }
  if (!update) {
    try {
      update = { result: await runTool(s.tools, name, args), status: "done" };
    } catch (error) {
      captureError("tools", error, { details: name });
      update = { result: `Error: ${(error as Error).message}`, status: "error" };
    }
  }
  if (session !== s) return;
  const result = update;

  updateMessage(s.chatId, messageId, (m) => {
    m.toolCalls = m.toolCalls?.map((c) => (c.id === callId ? { ...c, ...result } : c));
  });
  if (s.ws.readyState === WebSocket.OPEN) {
    s.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: result.result },
      })
    );
  }
  batch.pending.delete(callId);
  maybeRespond(s, batchKey);
};

const handleEvent = (s: RealtimeSession, event: any) => {
  switch (event.type) {
    case "response.output_audio.delta":
    case "response.audio.delta":
      playAudio(s, event.delta);
      break;

    case "input_audio_buffer.speech_started":
      // The user interrupts: stop talking and reserve their message's place
      stopPlayback(s);
      if (!s.pendingUserMessageId && !s.messageIds.has(event.item_id)) {
        s.pendingUserMessageId = addMessage(s.chatId, "user");
        if (event.item_id) {
          s.messageIds.set(event.item_id, s.pendingUserMessageId);
          s.pendingUserMessageId = undefined;
        }
      }
      break;

    // xAI sends cumulative transcripts that may revise earlier text
    case "conversation.item.input_audio_transcription.updated":
    case "conversation.item.input_audio_transcription.completed": {
      const id = messageFor(s, event.item_id, "user");
      updateMessage(s.chatId, id, (m) => {
        m.content = event.transcript || m.content;
        m.loading = event.type.endsWith(".updated");
      });
      break;
    }

    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta": {
      const id = messageFor(
        s,
        event.response_id || event.item_id || CURRENT_RESPONSE,
        "assistant"
      );
      updateMessage(s.chatId, id, (m) => {
        m.content += event.delta || "";
      });
      break;
    }

    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const id = messageFor(
        s,
        event.response_id || event.item_id || CURRENT_RESPONSE,
        "assistant"
      );
      updateMessage(s.chatId, id, (m) => {
        m.content = event.transcript || m.content;
        m.loading = false;
      });
      break;
    }

    case "response.function_call_arguments.done":
      handleFunctionCall(s, event.response_id, event);
      break;

    case "response.done": {
      const responseId: string | undefined = event.response?.id || event.response_id;
      // Fallback for calls whose arguments event was missed
      for (const item of event.response?.output || []) {
        if (item?.type === "function_call") handleFunctionCall(s, responseId, item);
      }
      finalizeMessages(s);
      s.messageIds.delete(CURRENT_RESPONSE);
      const batchKey = responseId || CURRENT_RESPONSE;
      const batch = s.toolBatches.get(batchKey);
      if (batch) {
        batch.done = true;
        // An interrupted response: the user's new turn gets its own response
        batch.cancelled = event.response?.status === "cancelled";
        maybeRespond(s, batchKey);
      }
      break;
    }

    case "error":
      captureError("realtime", event.error?.message || "xAI realtime error", {
        details: JSON.stringify(event).slice(0, 500),
      });
      notifications.show({
        message: event.error?.message || "xAI realtime error",
        color: "red",
      });
      break;
  }
};

export const stopRealtime = () => {
  const s = session;
  session = undefined;
  if (s) {
    s.abort.abort();
    s.ws.onclose = null;
    s.ws.close();
    s.captureNode.port.onmessage = null;
    s.captureNode.disconnect();
    s.micStream.getTracks().forEach((track) => track.stop());
    stopPlayback(s);
    s.audioContext.close();
    finalizeMessages(s);
  }
  set({ realtimeState: "idle" });
};

export const startRealtime = async (router: NextRouter) => {
  const { apiKeyXai, settingsForm } = get();
  if (session || !apiKeyXai) return;
  set({ realtimeState: "connecting" });

  let micStream: MediaStream | undefined;
  let audioContext: AudioContext | undefined;
  try {
    const tokenPromise = createClientSecret(apiKeyXai);
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    audioContext = new AudioContext();
    if (!SUPPORTED_RATES.includes(audioContext.sampleRate)) {
      audioContext.close();
      audioContext = new AudioContext({ sampleRate: OUTPUT_RATE });
    }
    const inputRate = audioContext.sampleRate;
    const workletUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET], { type: "application/javascript" })
    );
    await audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const token = await tokenPromise;
    if (get().realtimeState !== "connecting") {
      // Stopped while connecting
      throw new Error("cancelled");
    }

    if (!get().activeChatId) addChat(router);
    const chatId = get().activeChatId!;

    const tools = activeTools();
    const model = settingsForm.realtime_model_xai || XAI_REALTIME_MODELS[0];
    const ws = new WebSocket(
      `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`,
      [`xai-client-secret.${token}`]
    );

    const captureNode = new AudioWorkletNode(audioContext, "pcm-capture");
    audioContext.createMediaStreamSource(micStream).connect(captureNode);

    const s: RealtimeSession = {
      ws,
      audioContext,
      micStream,
      captureNode,
      chatId,
      playhead: 0,
      sources: new Set(),
      messageIds: new Map(),
      pendingUserMessageId: undefined,
      tools,
      toolBatches: new Map(),
      seenCalls: new Set(),
      abort: new AbortController(),
    };
    session = s;

    // Send ~100ms of audio per event
    const chunkSize = inputRate / 10;
    let pending: Float32Array[] = [];
    let pendingLength = 0;
    captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      pending.push(e.data);
      pendingLength += e.data.length;
      if (pendingLength < chunkSize) return;

      const chunk = new Float32Array(pendingLength);
      let offset = 0;
      pending.forEach((part) => {
        chunk.set(part, offset);
        offset += part.length;
      });
      pending = [];
      pendingLength = 0;
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: floatToBase64Pcm16(chunk),
        })
      );
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            instructions: buildInstructions(chatId, tools),
            voice: settingsForm.voice_id_xai || XAI_REALTIME_VOICES[0],
            turn_detection: { type: "server_vad" },
            audio: {
              input: {
                format: { type: "audio/pcm", rate: inputRate },
                transcription: { model: "grok-transcribe" },
              },
              output: { format: { type: "audio/pcm", rate: OUTPUT_RATE } },
            },
            ...(tools.length > 0 && {
              tools: tools.map((t) => ({
                type: "function",
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            }),
          },
        })
      );
      set({ realtimeState: "active" });
    };
    ws.onmessage = (e) => {
      if (session !== s || typeof e.data !== "string") return;
      try {
        handleEvent(s, JSON.parse(e.data));
      } catch (error) {
        console.error(error);
      }
    };
    ws.onclose = (e) => {
      if (session !== s) return;
      if (e.code !== 1000) {
        captureError("realtime", `Realtime session closed (${e.code})`, { details: e.reason });
        notifications.show({
          message: `Realtime session closed${e.reason ? `: ${e.reason}` : ""}`,
          color: "red",
        });
      }
      stopRealtime();
    };
  } catch (error) {
    micStream?.getTracks().forEach((track) => track.stop());
    if (!session) audioContext?.close();
    stopRealtime();
    if ((error as Error).message !== "cancelled") {
      captureError("realtime", error);
      notifications.show({
        message: (error as Error).message || "Could not start realtime voice",
        color: "red",
      });
    }
  }
};

export const toggleRealtime = (router: NextRouter) => {
  if (get().realtimeState === "idle") {
    startRealtime(router);
  } else {
    stopRealtime();
  }
};
