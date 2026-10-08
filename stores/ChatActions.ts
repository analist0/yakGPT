import { v4 as uuidv4 } from "uuid";
import { Message } from "./Message";
import { Chat } from "./Chat";
import { getChatById, updateChatMessages } from "./utils";
import { NextRouter } from "next/router";
import { APIState, ChatState, useChatStore } from "./ChatStore";
import { submitMessage } from "./SubmitMessage";
import { fetchModels } from "./OpenAI";
import { captureError } from "./ErrorLog";
import {
  ProviderId,
  getProviderConnection,
  isProviderConfigured,
  providers,
} from "./Providers";

const get = useChatStore.getState;
const set = useChatStore.setState;

export const update = (newState: Partial<ChatState>) => set(() => newState);

export const clearChats = () => set(() => ({ chats: [] }));

export const deleteChat = (id: string) =>
  set((state) => ({
    chats: state.chats.filter((chat) => chat.id !== id),
  }));

export const addChat = (router: NextRouter) => {
  const id = uuidv4();

  set((state) => ({
    activeChatId: id,
    chats: [
      ...state.chats,
      {
        id,
        title: undefined,
        messages: [],
        createdAt: new Date(),
      },
    ],
  }));
  router.push(`/chat/${id}`);
};

export const setActiveChatId = (id: string | undefined) =>
  set(() => ({ activeChatId: id }));

export const updateMessage = (message: Message) => {
  const chat = getChatById(get().chats, get().activeChatId);
  if (chat === undefined) {
    console.error("Chat not found");
    return;
  }
  set((state) => ({
    chats: updateChatMessages(state.chats, chat.id, (messages) => {
      return messages.map((m) => (m.id === message.id ? message : m));
    }),
  }));
};

export const pushMessage = (message: Message) => {
  const chat = getChatById(get().chats, get().activeChatId);
  if (chat === undefined) {
    console.error("Chat not found");
    return;
  }
  set((state) => ({
    chats: updateChatMessages(state.chats, chat.id, (messages) => {
      return [...messages, message];
    }),
  }));
};

export const delMessage = (message: Message) => {
  const chat = getChatById(get().chats, get().activeChatId);
  if (chat === undefined) {
    console.error("Chat not found");
    return;
  }
  set((state) => ({
    chats: updateChatMessages(state.chats, chat.id, (messages) => {
      return messages.filter((m) => m.id !== message.id);
    }),
  }));
};

export const setColorScheme = (scheme: "light" | "dark") =>
  set((state) => ({ colorScheme: scheme }));

export const setApiKey = (key: string) => set((state) => ({ apiKey: key }));

export const setApiKey11Labs = (key: string) =>
  set((state) => ({ apiKey11Labs: key }));

export const setApiState = (apiState: APIState) =>
  set((state) => ({ apiState }));

export const updateSettingsForm = (settingsForm: ChatState["settingsForm"]) =>
  set((state) => ({ settingsForm }));

export const updateChat = (options: Partial<Chat>) =>
  set((state) => ({
    chats: state.chats.map((c) => {
      if (c.id === options.id) {
        return { ...c, ...options };
      }
      return c;
    }),
  }));

export const setChosenCharacter = (name: string) =>
  set((state) => ({
    chats: state.chats.map((c) =>
      c.id === state.activeChatId ? { ...c, chosenCharacter: name } : c
    ),
  }));

export const setNavOpened = (navOpened: boolean) =>
  set((state) => ({ navOpened }));

export const setPushToTalkMode = (pushToTalkMode: boolean) =>
  set((state) => ({ pushToTalkMode }));

export const setPlayerMode = (playerMode: boolean) => {
  set((state) => ({ playerMode }));
};

export const setEditingMessage = (editingMessage: Message | undefined) =>
  set((state) => ({ editingMessage }));

export const regenerateAssistantMessage = (message: Message) => {
  const chat = getChatById(get().chats, get().activeChatId);
  if (chat === undefined) {
    console.error("Chat not found");
    return;
  }

  // Resubmit the user message this answer (and its tool steps) replied to
  const index = chat.messages.findIndex((m) => m.id === message.id);
  const prevUser = [...chat.messages.slice(0, index)]
    .reverse()
    .find((m) => m.role === "user" || m.role === "system");
  if (prevUser) {
    submitMessage(prevUser);
  }
};

export const refreshModels = async () => {
  const state = get();
  const provider = state.chatProvider;
  if (!isProviderConfigured(state)) return;

  try {
    const modelIDs = providers[provider].filterModels(
      await fetchModels(getProviderConnection(state))
    );
    // Ignore stale results if the provider was switched meanwhile
    if (get().chatProvider !== provider) return;
    update({ modelChoicesChat: modelIDs });

    // Make sure the selected model exists for this provider, preferring the
    // one last used with it
    const { settingsForm, lastModelByProvider } = get();
    if (modelIDs.length > 0 && !modelIDs.includes(settingsForm.model)) {
      const remembered = lastModelByProvider[provider];
      updateSettingsForm({
        ...settingsForm,
        model: remembered && modelIDs.includes(remembered) ? remembered : modelIDs[0],
      });
    }
  } catch (error) {
    captureError("models", error, { details: providers[provider].name });
  }
};

export const selectModel = (model: string, provider = get().chatProvider) => {
  if (provider !== get().chatProvider) {
    update({ chatProvider: provider, modelChoicesChat: undefined });
  }
  set((state) => ({
    settingsForm: { ...state.settingsForm, model },
    lastModelByProvider: { ...state.lastModelByProvider, [provider]: model },
  }));
  refreshModels();
};

export const setChatProvider = (chatProvider: ProviderId) => {
  update({ chatProvider, modelChoicesChat: undefined });
  refreshModels();
};

// Switch to a newly configured provider if the current one is unusable
export const activateProviderIfNeeded = (provider: ProviderId) => {
  if (!isProviderConfigured(get())) {
    setChatProvider(provider);
  } else if (get().chatProvider === provider) {
    refreshModels();
  }
};
