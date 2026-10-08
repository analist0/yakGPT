import { v4 as uuidv4 } from "uuid";
import { Message, ToolCall } from "./Message";
import { CompletionError, streamCompletion } from "./OpenAI";
import { getChatById, updateChatMessages } from "./utils";
import { notifications } from "@mantine/notifications";
import { getModelInfo } from "./Model";
import { useChatStore } from "./ChatStore";
import { getProviderConnection, isProviderConfigured } from "./Providers";
import { activeTools, runTool, toOpenAITools, ToolSpec } from "./Tools";
import { skillsPrompt } from "./Skills";
import { captureError } from "./ErrorLog";
import { DECLINED_RESULT, needsApproval, requestApproval } from "./Approval";

const get = useChatStore.getState;
const set = useChatStore.setState;

// Upper bound on model -> tool -> model round trips per user message
const MAX_TOOL_STEPS = 8;

export const abortCurrentRequest = () => {
  const currentAbortController = get().currentAbortController;
  if (currentAbortController?.abort) currentAbortController?.abort();
  set((state) => ({
    apiState: "idle",
    currentAbortController: undefined,
  }));
};

const updateMessageById = (
  chatId: string,
  messageId: string,
  update: (message: Message) => void
) =>
  set((state) => ({
    chats: updateChatMessages(state.chats, chatId, (messages) =>
      messages.map((m) => {
        if (m.id !== messageId) return m;
        const copy = { ...m, toolCalls: m.toolCalls?.map((c) => ({ ...c })) };
        update(copy);
        return copy;
      })
    ),
  }));

const pushAssistantMessage = (chatId: string) => {
  const id = uuidv4();
  set((state) => ({
    chats: updateChatMessages(state.chats, chatId, (messages) => [
      ...messages,
      { id, content: "", role: "assistant", loading: true },
    ]),
  }));
  return id;
};

// Skill list is appended to the chat's own system prompt, or sent as one
const withSkills = (messages: Message[], tools: ToolSpec[]) => {
  const prompt = tools.some((t) => t.name === "load_skill") && skillsPrompt();
  if (!prompt) return messages;
  if (messages[0]?.role === "system") {
    return [
      { ...messages[0], content: `${messages[0].content}\n\n${prompt}` },
      ...messages.slice(1),
    ];
  }
  return [{ id: "skills", role: "system" as const, content: prompt }, ...messages];
};

const isToolsUnsupported = (error: CompletionError) =>
  error.status >= 400 &&
  error.status < 500 &&
  /tool|function/i.test(error.message);

// A 4xx that looks like the model rejecting image input
const isImagesUnsupported = (error: unknown, chatId: string) =>
  error instanceof CompletionError &&
  error.status >= 400 &&
  error.status < 500 &&
  /image|vision|multimodal|image_url|content.*(array|type)/i.test(error.message) &&
  !!getChatById(get().chats, chatId)?.messages.some((m) => m.images?.length);

export const submitMessage = async (message: Message) => {
  // If message is empty, do nothing
  if (message.content.trim() === "" && !message.images?.length) {
    console.error("Message is empty");
    return;
  }

  const activeChatId = get().activeChatId;
  const chat = get().chats.find((c) => c.id === activeChatId!);
  if (chat === undefined) {
    console.error("Chat not found");
    return;
  }

  // If this is an existing message, remove all the messages after it
  const index = chat.messages.findIndex((m) => m.id === message.id);
  set((state) => ({
    apiState: "loading",
    chats: updateChatMessages(state.chats, chat.id, (messages) => [
      ...(index !== -1 ? messages.slice(0, index) : messages),
      message,
    ]),
  }));

  if (!isProviderConfigured(get())) {
    notifications.show({ message: "Chat provider not configured", color: "red" });
    set({ apiState: "idle" });
    return;
  }
  const connection = getProviderConnection(get());
  const settings = get().settingsForm;

  const updateTokens = (promptTokensUsed: number, completionTokensUsed: number) => {
    const { prompt: promptCost, completion: completionCost } = getModelInfo(
      settings.model
    ).costPer1kTokens;
    set((state) => ({
      chats: state.chats.map((c) => {
        if (c.id !== chat.id) return c;
        return {
          ...c,
          promptTokensUsed: (c.promptTokensUsed || 0) + promptTokensUsed,
          completionTokensUsed: (c.completionTokensUsed || 0) + completionTokensUsed,
          costIncurred:
            (c.costIncurred || 0) +
            (promptTokensUsed / 1000) * promptCost +
            (completionTokensUsed / 1000) * completionCost,
        };
      }),
    }));
  };

  const abortController = new AbortController();
  let tools = activeTools();

  for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
    const assistantMsgId = pushAssistantMessage(chat.id);
    set({
      currentAbortController: abortController,
      ttsID: assistantMsgId,
      ttsText: "",
    });

    // Offer tools until the last step, then force a text answer
    const offeredTools = step < MAX_TOOL_STEPS ? tools : [];
    const history = withSkills(
      getChatById(get().chats, chat.id)!.messages.filter((m) => m.id !== assistantMsgId),
      offeredTools
    );

    let result;
    try {
      result = await streamCompletion({
        messages: history,
        params: settings,
        connection,
        tools: toOpenAITools(offeredTools),
        signal: abortController.signal,
        onContent: (content) =>
          set((state) => ({
            ttsText: (state.ttsText || "") + content,
            chats: updateChatMessages(state.chats, chat.id, (messages) =>
              messages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + content } : m
              )
            ),
          })),
        onReasoning: (content) =>
          updateMessageById(chat.id, assistantMsgId, (m) => {
            m.reasoning = (m.reasoning || "") + content;
          }),
      });
    } catch (error) {
      if (
        error instanceof CompletionError &&
        offeredTools.length > 0 &&
        isToolsUnsupported(error)
      ) {
        // The model cannot call tools: drop them and ask again
        tools = [];
        notifications.show({
          message: `${settings.model} does not support tools, answering without them`,
          color: "yellow",
        });
        set((state) => ({
          chats: updateChatMessages(state.chats, chat.id, (messages) =>
            messages.filter((m) => m.id !== assistantMsgId)
          ),
        }));
        step--;
        continue;
      }
      captureError("chat", error, {
        details: `${connection.baseUrl} · ${settings.model}`,
      });
      notifications.show({
        message: isImagesUnsupported(error, chat.id)
          ? `${(error as Error).message}\n\n${settings.model} may not accept images. Pick a vision model (for example GPT-4o, Gemini, Grok with vision, or gemma3 / qwen2.5vl on Ollama).`
          : (error as Error).message,
        color: "red",
      });
      updateMessageById(chat.id, assistantMsgId, (m) => {
        m.loading = false;
      });
      abortCurrentRequest();
      return;
    }

    updateMessageById(chat.id, assistantMsgId, (m) => {
      m.loading = false;
      if (result.toolCalls.length > 0) {
        m.toolCalls = result.toolCalls.map((c) => ({
          ...c,
          label: tools.find((t) => t.name === c.name)?.label,
          status: "running",
        }));
      }
    });
    updateTokens(result.promptTokens, result.completionTokens);

    if (result.aborted || result.toolCalls.length === 0) break;

    // Run the requested tools and store their results on the message
    for (const call of result.toolCalls) {
      if (abortController.signal.aborted) break;
      let update: Partial<ToolCall>;
      const tool = tools.find((t) => t.name === call.name);
      if (tool && needsApproval(tool)) {
        updateMessageById(chat.id, assistantMsgId, (m) => {
          m.toolCalls = m.toolCalls?.map((c) => (c.id === call.id ? { ...c, status: "pending" } : c));
        });
        const approved = await requestApproval(call.id, abortController.signal);
        if (!approved) {
          updateMessageById(chat.id, assistantMsgId, (m) => {
            m.toolCalls = m.toolCalls?.map((c) =>
              c.id === call.id ? { ...c, status: "denied", result: DECLINED_RESULT } : c
            );
          });
          continue;
        }
        updateMessageById(chat.id, assistantMsgId, (m) => {
          m.toolCalls = m.toolCalls?.map((c) => (c.id === call.id ? { ...c, status: "running" } : c));
        });
      }
      try {
        update = { result: await runTool(tools, call.name, call.arguments), status: "done" };
      } catch (error) {
        captureError("tools", error, { details: call.name });
        update = { result: `Error: ${(error as Error).message}`, status: "error" };
      }
      updateMessageById(chat.id, assistantMsgId, (m) => {
        m.toolCalls = m.toolCalls?.map((c) => (c.id === call.id ? { ...c, ...update } : c));
      });
    }
    if (abortController.signal.aborted) {
      // Calls that never ran
      updateMessageById(chat.id, assistantMsgId, (m) => {
        m.toolCalls = m.toolCalls?.map((c) =>
          c.status === "running" || c.status === "pending"
            ? { ...c, status: "error", result: c.result ?? "Stopped" }
            : c
        );
      });
      break;
    }
  }

  set({ apiState: "idle", currentAbortController: undefined });
  if (settings.auto_title) {
    findChatTitle(chat.id).catch((error) => captureError("chat", error));
  }
};

const findChatTitle = async (chatId: string) => {
  const chat = getChatById(get().chats, chatId);
  if (chat === undefined || chat.title !== undefined) return;

  const text = chat.messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n");
  if (text.split(/\s+/).length < 4) return;

  const result = await streamCompletion({
    messages: [
      {
        id: uuidv4(),
        role: "system",
        content:
          "Write a title of at most 4 words for this conversation, in the conversation's language. Reply with the title only, no quotes.",
      },
      { id: uuidv4(), role: "user", content: text.slice(0, 4000) },
    ],
    params: { ...get().settingsForm, max_tokens: 0 },
    connection: getProviderConnection(get()),
  });

  // Reasoning models may wrap their thinking in <think> tags
  const title = result.content
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim()
    .replace(/^title:\s*/i, "")
    .replace(/^["'“]|["'”]$/g, "")
    .replace(/[,.;:!?]$/, "")
    .slice(0, 60);
  if (title) {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
    }));
  }
};
