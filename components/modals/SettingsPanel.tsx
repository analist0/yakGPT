import { useEffect, useState } from "react";
import ISO6391 from "iso-639-1";
import {
  Accordion,
  Autocomplete,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  useMantineColorScheme,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAdjustments, IconMicrophone, IconPalette } from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { update, updateSettingsForm } from "@/stores/ChatActions";
import * as ElevenLabs from "@/stores/ElevenLabs";
import * as Azure from "@/stores/AzureSDK";
import { OPENAI_TTS_VOICES, validateVoice } from "@/stores/OpenAI";
import { XAI_REALTIME_MODELS, XAI_REALTIME_VOICES } from "@/stores/XaiRealtime";
import { captureError } from "@/stores/ErrorLog";
import { azureCandidateLanguages } from "@/components/azureLangs";
import { useT } from "@/lib/i18n";

const languages = ISO6391.getAllCodes().map((code) => ({
  label: `${ISO6391.getName(code)} (${code})`,
  value: code,
}));
const langDisplayToCode = Object.fromEntries(languages.map((l) => [l.label, l.value]));

function LabeledSlider({
  label,
  value,
  ...props
}: { label: string; value: number } & React.ComponentProps<typeof Slider>) {
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm">{label}</Text>
        <Text size="sm" c="dimmed">
          {value}
        </Text>
      </Group>
      <Slider value={value} {...props} />
    </div>
  );
}

export default function SettingsPanel({ close }: { close: () => void }) {
  const t = useT();
  const settingsForm = useChatStore((state) => state.settingsForm);
  const defaultSettings = useChatStore((state) => state.defaultSettings);
  const uiLanguage = useChatStore((state) => state.uiLanguage);
  const modelChoiceSTT = useChatStore((state) => state.modelChoiceSTT);
  const modelChoiceTTS = useChatStore((state) => state.modelChoiceTTS);
  const apiKey11Labs = useChatStore((state) => state.apiKey11Labs);
  const apiKeyAzure = useChatStore((state) => state.apiKeyAzure);
  const apiKeyAzureRegion = useChatStore((state) => state.apiKeyAzureRegion);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [voices11Labs, setVoices11Labs] = useState<ElevenLabs.Voice[]>([]);
  const [voicesAzure, setVoicesAzure] = useState<Azure.Voice[]>([]);

  const form = useForm({
    initialValues: { ...defaultSettings, ...settingsForm },
    validate: {
      logit_bias: (value) => {
        try {
          if (value === "") return null;
          const parsed = JSON.parse(value);
          if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          return null;
        } catch {
          return t("Must be a JSON object of token id → bias", "חייב להיות אובייקט JSON של token id → bias");
        }
      },
    },
  });

  useEffect(() => {
    if (!apiKey11Labs) return;
    ElevenLabs.getVoices(apiKey11Labs)
      .then(setVoices11Labs)
      .catch((error) => captureError("voice", error, { details: "ElevenLabs voices" }));
  }, [apiKey11Labs]);

  useEffect(() => {
    if (!apiKeyAzure || !apiKeyAzureRegion) return;
    Azure.getVoices(apiKeyAzure, apiKeyAzureRegion)
      .then((voices) => voices && setVoicesAzure(voices))
      .catch((error) => captureError("voice", error, { details: "Azure voices" }));
  }, [apiKeyAzure, apiKeyAzureRegion]);

  const azureStyles =
    voicesAzure.find((v) => v.shortName === form.values.voice_id_azure)?.styleList || [];

  return (
    <form
      onSubmit={form.onSubmit((values) => {
        updateSettingsForm(values);
        close();
      })}
    >
      <Tabs defaultValue="general" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="general" leftSection={<IconPalette size={15} />}>
            {t("General", "כללי")}
          </Tabs.Tab>
          <Tabs.Tab value="model" leftSection={<IconAdjustments size={15} />}>
            {t("Model", "מודל")}
          </Tabs.Tab>
          <Tabs.Tab value="voice" leftSection={<IconMicrophone size={15} />}>
            {t("Voice", "קול")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general">
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb={6}>
                {t("Language & direction", "שפה וכיוון")}
              </Text>
              <SegmentedControl
                fullWidth
                value={uiLanguage}
                onChange={(v) => update({ uiLanguage: v as "he" | "en" })}
                data={[
                  { value: "he", label: "עברית (מימין לשמאל)" },
                  { value: "en", label: "English (LTR)" },
                ]}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={6}>
                {t("Appearance", "מראה")}
              </Text>
              <SegmentedControl
                fullWidth
                value={colorScheme}
                onChange={(v) => setColorScheme(v as "light" | "dark" | "auto")}
                data={[
                  { value: "dark", label: t("Dark", "כהה") },
                  { value: "light", label: t("Light", "בהיר") },
                  { value: "auto", label: t("System", "לפי המערכת") },
                ]}
              />
            </div>
            <Switch
              label={t("Name chats automatically", "מתן שם אוטומטי לשיחות")}
              {...form.getInputProps("auto_title", { type: "checkbox" })}
            />
            <Button variant="light" onClick={() => update({ onboardingDone: false })}>
              {t("Run the setup wizard again", "הפעלת אשף ההתקנה מחדש")}
            </Button>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="model">
          <Stack gap="md">
            <LabeledSlider
              label={t("Temperature (creativity)", "טמפרטורה (יצירתיות)")}
              value={form.values.temperature}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => form.setFieldValue("temperature", v)}
            />
            <NumberInput
              label={t("Max answer tokens (0 = unlimited)", "מקסימום טוקנים בתשובה (0 = ללא הגבלה)")}
              min={0}
              max={200000}
              {...form.getInputProps("max_tokens")}
            />
            <Accordion variant="separated" radius="md">
              <Accordion.Item value="advanced">
                <Accordion.Control>{t("Advanced", "מתקדם")}</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <LabeledSlider label="Top P" value={form.values.top_p} min={0} max={1} step={0.01} onChange={(v) => form.setFieldValue("top_p", v)} />
                    <LabeledSlider label="Presence penalty" value={form.values.presence_penalty} min={-2} max={2} step={0.1} onChange={(v) => form.setFieldValue("presence_penalty", v)} />
                    <LabeledSlider label="Frequency penalty" value={form.values.frequency_penalty} min={-2} max={2} step={0.1} onChange={(v) => form.setFieldValue("frequency_penalty", v)} />
                    <TextInput label="Stop" dir="ltr" {...form.getInputProps("stop")} />
                    <TextInput label="Logit bias" dir="ltr" placeholder='{"1234": -100}' {...form.getInputProps("logit_bias")} />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="voice">
          <Stack gap="md">
            <div>
              <Text size="sm" fw={500} mb={6}>
                {t("Speech to text", "דיבור לטקסט")}
              </Text>
              <SegmentedControl
                fullWidth
                value={modelChoiceSTT || "azure"}
                onChange={(v) => update({ modelChoiceSTT: v })}
                data={[
                  { value: "whisper", label: "Whisper (OpenAI)" },
                  { value: "azure", label: "Azure" },
                ]}
              />
            </div>
            {modelChoiceSTT === "whisper" ? (
              <>
                <Switch
                  label={t("Detect language automatically", "זיהוי שפה אוטומטי")}
                  {...form.getInputProps("auto_detect_language", { type: "checkbox" })}
                />
                <Autocomplete
                  disabled={form.values.auto_detect_language}
                  label={t("Spoken language", "שפת הדיבור")}
                  value={form.values.spoken_language}
                  onChange={(value) => {
                    form.setFieldValue("spoken_language", value);
                    if (langDisplayToCode[value]) form.setFieldValue("spoken_language_code", langDisplayToCode[value]);
                  }}
                  data={languages.map((l) => l.label)}
                />
              </>
            ) : (
              <>
                <Switch
                  label={t("Detect language automatically", "זיהוי שפה אוטומטי")}
                  {...form.getInputProps("auto_detect_language_azure", { type: "checkbox" })}
                />
                <Autocomplete
                  disabled={form.values.auto_detect_language_azure}
                  label={t("Spoken language", "שפת הדיבור")}
                  value={form.values.spoken_language_azure}
                  onChange={(value) => {
                    const key = Object.entries(azureCandidateLanguages).find(([, v]) => v === value);
                    if (key) form.setFieldValue("spoken_language_code_azure", key[0]);
                    form.setFieldValue("spoken_language_azure", value);
                  }}
                  data={Object.values(azureCandidateLanguages)}
                />
                <NumberInput label={t("Send delay after speaking (ms)", "השהיית שליחה אחרי דיבור (ms)")} {...form.getInputProps("submit_debounce_ms")} />
              </>
            )}

            <div>
              <Text size="sm" fw={500} mb={6}>
                {t("Read answers aloud with", "הקראת תשובות באמצעות")}
              </Text>
              <SegmentedControl
                fullWidth
                value={modelChoiceTTS || "azure"}
                onChange={(v) => update({ modelChoiceTTS: v })}
                data={[
                  { value: "openai", label: "OpenAI" },
                  { value: "azure", label: "Azure" },
                  { value: "11labs", label: "ElevenLabs" },
                ]}
              />
            </div>
            {modelChoiceTTS === "openai" && (
              <Group grow>
                <Select label={t("Model", "מודל")} data={["tts-1", "tts-1-hd", "gpt-4o-mini-tts"]} {...form.getInputProps("tts_model_openai")} />
                <Select label={t("Voice", "קול")} data={[...OPENAI_TTS_VOICES]} {...form.getInputProps("voice_id_openai")} />
              </Group>
            )}
            {modelChoiceTTS === "azure" && (
              <Group grow>
                <Autocomplete
                  label={t("Voice", "קול")}
                  data={voicesAzure.map((v) => v.shortName)}
                  {...form.getInputProps("voice_id_azure")}
                />
                <Select
                  label={t("Style", "סגנון")}
                  disabled={!azureStyles.length}
                  data={azureStyles}
                  {...form.getInputProps("spoken_language_style")}
                />
              </Group>
            )}
            {modelChoiceTTS === "11labs" && (
              <Select
                label={t("Voice", "קול")}
                data={voices11Labs.map((v) => ({ label: v.name, value: v.voice_id }))}
                {...form.getInputProps("voice_id")}
              />
            )}

            <div>
              <Text size="sm" fw={500} mb={6}>
                {t("Realtime voice (xAI Grok)", "שיחה קולית בזמן אמת (xAI Grok)")}
              </Text>
              <Group grow>
                <Select label={t("Model", "מודל")} data={[...XAI_REALTIME_MODELS]} {...form.getInputProps("realtime_model_xai")} />
                <Select
                  label={t("Voice", "קול")}
                  data={XAI_REALTIME_VOICES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
                  {...form.getInputProps("voice_id_xai")}
                />
              </Group>
            </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Group justify="space-between" mt="xl">
        <Button variant="subtle" color="gray" onClick={() => form.setValues(defaultSettings)}>
          {t("Reset to defaults", "איפוס לברירת מחדל")}
        </Button>
        <Button
          type="submit"
          disabled={!!form.values.voice_id_openai && !validateVoice(form.values.voice_id_openai)}
        >
          {t("Save", "שמירה")}
        </Button>
      </Group>
    </form>
  );
}
