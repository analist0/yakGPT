import { useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconExternalLink, IconPlugConnected, IconTrash } from "@tabler/icons-react";
import { useChatStore, ChatState } from "@/stores/ChatStore";
import { activateProviderIfNeeded, update } from "@/stores/ChatActions";
import {
  DEFAULT_OLLAMA_BASE_URL,
  normalizeOllamaBaseUrl,
  ProviderId,
  providerKeyField,
  providers,
} from "@/stores/Providers";
import { testKey as testKeyOpenAI } from "@/stores/OpenAI";
import { testKey as testKeyAzure } from "@/stores/AzureSDK";
import { testKey as testKey11Labs } from "@/stores/ElevenLabs";
import { checkOllama } from "@/stores/Ollama";
import { captureError } from "@/stores/ErrorLog";
import { useT } from "@/lib/i18n";
import classes from "./ProvidersPanel.module.css";

type Field = keyof ChatState;

interface CardProps {
  title: string;
  description: string;
  field: Field;
  secondField?: { field: Field; label: string; placeholder: string };
  keyUrl?: string;
  placeholder?: string;
  secret?: boolean;
  inputLabel?: string;
  validate: (value: string, second?: string) => Promise<boolean>;
  onSaved?: () => void;
  normalize?: (value: string) => string;
}

function ProviderCard({
  title,
  description,
  field,
  secondField,
  keyUrl,
  placeholder = "sk-…",
  secret = true,
  inputLabel,
  validate,
  onSaved,
  normalize = (v) => v.trim(),
}: CardProps) {
  const t = useT();
  const saved = useChatStore((state) => state[field] as string | undefined);
  const savedSecond = useChatStore((state) =>
    secondField ? (state[secondField.field] as string | undefined) : undefined
  );
  const [value, setValue] = useState(saved || "");
  const [second, setSecond] = useState(savedSecond || "");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");

  const dirty = value !== (saved || "") || (secondField && second !== (savedSecond || ""));

  const save = async () => {
    if (!value.trim()) return;
    setStatus("checking");
    const normalized = normalize(value);
    let ok = false;
    try {
      ok = await validate(normalized, second.trim());
    } catch (error) {
      captureError("network", error, { details: `validate ${title}` });
    }
    if (!ok) {
      setStatus("error");
      notifications.show({
        color: "red",
        message: t(`Could not verify the ${title} key`, `לא הצלחנו לאמת את המפתח של ${title}`),
      });
      return;
    }
    update({
      [field]: normalized,
      ...(secondField ? { [secondField.field]: second.trim() } : {}),
    } as Partial<ChatState>);
    setValue(normalized);
    setStatus("idle");
    notifications.show({ color: "teal", message: t(`${title} connected`, `${title} חובר`) });
    onSaved?.();
  };

  const remove = () => {
    update({
      [field]: undefined,
      ...(secondField ? { [secondField.field]: undefined } : {}),
    } as Partial<ChatState>);
    setValue("");
    setSecond("");
  };

  const Input = secret ? PasswordInput : TextInput;

  return (
    <div className={classes.card} data-connected={!!saved || undefined}>
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Text fw={600}>{title}</Text>
        {saved ? (
          <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
            {t("Connected", "מחובר")}
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            {t("Not set", "לא מוגדר")}
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        {description}
      </Text>
      <Stack gap={8}>
        <Input
          size="sm"
          aria-label={inputLabel || `${title} key`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setStatus("idle");
          }}
          error={status === "error"}
          className={classes.ltr}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        {secondField && (
          <TextInput
            size="sm"
            aria-label={secondField.label}
            placeholder={secondField.placeholder}
            value={second}
            onChange={(e) => setSecond(e.currentTarget.value)}
            className={classes.ltr}
          />
        )}
        <Group justify="space-between" gap="xs">
          {keyUrl ? (
            <Anchor href={keyUrl} target="_blank" size="xs">
              <Group gap={4} component="span">
                {t("Get a key", "קבלת מפתח")}
                <IconExternalLink size={12} />
              </Group>
            </Anchor>
          ) : (
            <span />
          )}
          <Group gap={6}>
            {saved && (
              <Button size="xs" variant="subtle" color="red" onClick={remove} leftSection={<IconTrash size={13} />}>
                {t("Remove", "הסרה")}
              </Button>
            )}
            <Button size="xs" onClick={save} loading={status === "checking"} disabled={!dirty || !value.trim()}>
              {t("Save", "שמירה")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </div>
  );
}

const CHAT_DESCRIPTIONS: Record<Exclude<ProviderId, "ollama">, [string, string]> = {
  openai: ["GPT models, Whisper speech to text and OpenAI voices", "מודלי GPT, תמלול Whisper וקולות OpenAI"],
  xai: ["Grok models and realtime voice conversations", "מודלי Grok ושיחה קולית בזמן אמת"],
  groq: ["Extremely fast open models (Llama, Qwen, gpt-oss)", "מודלים פתוחים מהירים במיוחד (Llama, Qwen, gpt-oss)"],
  openrouter: ["One key for hundreds of models from every lab", "מפתח אחד למאות מודלים מכל החברות"],
  gemini: ["Google Gemini models, generous free tier", "מודלי Gemini של גוגל, עם מכסה חינמית נדיבה"],
};

export function ChatProviderCards() {
  const t = useT();
  const ids = Object.keys(CHAT_DESCRIPTIONS) as (keyof typeof CHAT_DESCRIPTIONS)[];
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {ids.map((id) => (
        <ProviderCard
          key={id}
          title={providers[id].name}
          description={t(...CHAT_DESCRIPTIONS[id])}
          field={providerKeyField[id]}
          keyUrl={providers[id].keyUrl}
          placeholder={id === "gemini" ? "AIza…" : id === "groq" ? "gsk_…" : id === "xai" ? "xai-…" : "sk-…"}
          validate={(key) => testKeyOpenAI(key, providers[id].baseUrl, providers[id].keyCheckPath)}
          onSaved={() => activateProviderIfNeeded(id)}
        />
      ))}
      <ProviderCard
        title="Ollama"
        description={t(
          "Local models on your computer. No key needed.",
          "מודלים מקומיים במחשב שלך. אין צורך במפתח."
        )}
        field="ollamaBaseUrl"
        secret={false}
        inputLabel="Ollama URL"
        placeholder={DEFAULT_OLLAMA_BASE_URL}
        normalize={normalizeOllamaBaseUrl}
        validate={async (url) => testKeyOpenAI(undefined, url)}
        onSaved={() => {
          activateProviderIfNeeded("ollama");
          checkOllama();
        }}
      />
    </SimpleGrid>
  );
}

export default function ProvidersPanel() {
  const t = useT();
  return (
    <Stack gap="lg">
      <div>
        <Group gap={8} mb="xs">
          <IconPlugConnected size={18} />
          <Text fw={600}>{t("Chat providers", "ספקי צ'אט")}</Text>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          {t(
            "Keys are stored only in this browser and sent only to the provider.",
            "המפתחות נשמרים רק בדפדפן הזה ונשלחים רק לספק עצמו."
          )}
        </Text>
        <ChatProviderCards />
      </div>
      <div>
        <Text fw={600} mb="md">
          {t("Voice", "קול")}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <ProviderCard
            title="Azure Speech"
            description={t("Streaming speech to text and natural voices", "תמלול רציף וקולות טבעיים")}
            field="apiKeyAzure"
            secondField={{ field: "apiKeyAzureRegion", label: "Region", placeholder: "westeurope" }}
            placeholder={t("Azure key", "מפתח Azure")}
            keyUrl="https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices"
            validate={(key, region) => testKeyAzure(key, region)}
          />
          <ProviderCard
            title="ElevenLabs"
            description={t("Premium text to speech voices", "קולות הקראה איכותיים")}
            field="apiKey11Labs"
            placeholder={t("ElevenLabs key", "מפתח ElevenLabs")}
            keyUrl="https://elevenlabs.io/app/settings/api-keys"
            validate={(key) => testKey11Labs(key)}
          />
        </SimpleGrid>
      </div>
    </Stack>
  );
}
