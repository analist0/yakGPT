import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { v4 as uuidv4 } from "uuid";
import { AnimatePresence, motion } from "motion/react";
import {
  ActionIcon,
  Group,
  Indicator,
  Loader,
  Menu,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowUp,
  IconHeadset,
  IconMicrophone,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStopFilled,
  IconSettings,
  IconTool,
  IconVolume,
  IconVolumeOff,
  IconX,
} from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { abortCurrentRequest, submitMessage } from "@/stores/SubmitMessage";
import { addChat, setEditingMessage, setPlayerMode, update } from "@/stores/ChatActions";
import { toggleAudio } from "@/stores/PlayerActions";
import { toggleRealtime } from "@/stores/XaiRealtime";
import * as OpusRecorder from "@/stores/RecorderActions";
import * as AzureRecorder from "@/stores/AzureRecorderActions";
import { activeTools } from "@/stores/Tools";
import { useMcpStatus } from "@/stores/Mcp";
import { openModal } from "@/stores/Ui";
import { useT } from "@/lib/i18n";
import classes from "./Composer.module.css";

function ToolsButton() {
  const t = useT();
  const toolsEnabled = useChatStore((state) => state.toolsEnabled);
  // Re-render when tools change
  useChatStore((state) => state.disabledTools.length + state.skills.length);
  useMcpStatus((state) => state.servers);
  const count = toolsEnabled ? activeTools().length : 0;

  return (
    <Menu position="top-start" width={240}>
      <Menu.Target>
        <Indicator
          label={count}
          size={16}
          disabled={!count}
          offset={4}
          color="brand"
          inline
        >
          <ActionIcon
            size="lg"
            variant={toolsEnabled ? "light" : "subtle"}
            color={toolsEnabled ? "brand" : "gray"}
            aria-label={t("Tools", "כלים")}
          >
            <IconTool size={18} />
          </ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("Tools & MCP", "כלים ו־MCP")}</Menu.Label>
        <Group px="sm" py={6} justify="space-between">
          <Text size="sm">{t("Let the model use tools", "לאפשר למודל להשתמש בכלים")}</Text>
          <Switch
            size="sm"
            checked={toolsEnabled}
            onChange={(e) => update({ toolsEnabled: e.currentTarget.checked })}
          />
        </Group>
        <Menu.Divider />
        <Menu.Item leftSection={<IconSettings size={15} />} onClick={() => openModal("tools")}>
          {t("Manage tools, skills & MCP", "ניהול כלים, סקילים ו־MCP")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default function Composer() {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const value = useChatStore((state) => state.textInputValue);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const apiState = useChatStore((state) => state.apiState);
  const editingMessage = useChatStore((state) => state.editingMessage);
  const audioState = useChatStore((state) => state.audioState);
  const modelChoiceSTT = useChatStore((state) => state.modelChoiceSTT);
  const playerMode = useChatStore((state) => state.playerMode);
  const isPlaying = useChatStore((state) => state.playerState === "playing");
  const realtimeState = useChatStore((state) => state.realtimeState);
  const hasXai = useChatStore((state) => !!state.apiKeyXai);
  const sttReady = useChatStore((state) =>
    state.modelChoiceSTT === "azure"
      ? !!(state.apiKeyAzure && state.apiKeyAzureRegion)
      : !!state.apiKey
  );

  const Recorder = modelChoiceSTT === "azure" ? AzureRecorder : OpusRecorder;
  const loading = apiState === "loading";
  const recording = audioState === "recording";
  const transcribing = audioState === "transcribing";

  const setValue = (text: string) => update({ textInputValue: text });

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    if (editingMessage) {
      setValue(editingMessage.content);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editingMessage]);

  const doSubmit = () => {
    if (loading) {
      abortCurrentRequest();
      return;
    }
    if (!value.trim()) return;
    if (editingMessage) setEditingMessage(undefined);
    if (!activeChatId) addChat(router);
    submitMessage({
      id: editingMessage?.id || uuidv4(),
      content: value,
      role: editingMessage?.role || "user",
    });
    setValue("");
  };

  const toggleRecording = () => {
    if (!sttReady) {
      notifications.show({
        color: "yellow",
        message: t(
          "Speech to text needs an OpenAI key (Whisper) or an Azure key",
          "המרת דיבור לטקסט דורשת מפתח OpenAI ‏(Whisper) או מפתח Azure"
        ),
      });
      openModal("keys");
      return;
    }
    if (audioState === "idle") {
      Recorder.startRecording(router);
    } else if (recording) {
      if (!activeChatId) addChat(router);
      Recorder.stopRecording(true);
    }
  };

  return (
    <div className={classes.dock}>
      <div className={classes.inner}>
        <AnimatePresence>
          {editingMessage && (
            <motion.div
              className={classes.editing}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <IconPencil size={14} />
              <Text size="xs">{t("Editing message", "עריכת הודעה")}</Text>
              <ActionIcon
                size="xs"
                color="gray"
                onClick={() => {
                  setEditingMessage(undefined);
                  setValue("");
                }}
              >
                <IconX size={12} />
              </ActionIcon>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={classes.box} data-recording={recording || undefined}>
          <Textarea
            ref={inputRef}
            autosize
            minRows={1}
            maxRows={8}
            variant="unstyled"
            classNames={{ input: classes.input }}
            placeholder={
              recording
                ? t("Listening…", "מקשיב…")
                : transcribing
                ? t("Transcribing…", "מתמלל…")
                : t("Message YakGPT…", "כתוב הודעה…")
            }
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (!e.nativeEvent.isComposing && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                doSubmit();
              }
            }}
            onKeyUp={(e) => e.stopPropagation()}
          />

          <Group justify="space-between" gap={4} className={classes.toolbar} wrap="nowrap">
            <Group gap={4} wrap="nowrap">
              <ToolsButton />
              <Tooltip label={playerMode ? t("Stop reading aloud", "ביטול הקראה") : t("Read answers aloud", "הקראת תשובות")}>
                <ActionIcon
                  size="lg"
                  variant={playerMode ? "light" : "subtle"}
                  color={playerMode ? "brand" : "gray"}
                  onClick={() => setPlayerMode(!playerMode)}
                >
                  {playerMode ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
                </ActionIcon>
              </Tooltip>
              {playerMode && (
                <ActionIcon size="lg" color="gray" onClick={() => toggleAudio()}>
                  {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
                </ActionIcon>
              )}
            </Group>

            <Group gap={6} wrap="nowrap">
              {hasXai && (
                <Tooltip
                  label={
                    realtimeState === "idle"
                      ? t("Realtime voice (Grok)", "שיחה קולית בזמן אמת (Grok)")
                      : t("Stop realtime voice", "עצירת שיחה קולית")
                  }
                >
                  <ActionIcon
                    size="lg"
                    radius="xl"
                    variant={realtimeState === "idle" ? "subtle" : "filled"}
                    color={realtimeState === "idle" ? "gray" : "red"}
                    className={realtimeState === "active" ? classes.live : undefined}
                    onClick={() => toggleRealtime(router)}
                    aria-label="Realtime voice"
                  >
                    {realtimeState === "connecting" ? (
                      <Loader size={16} color="white" />
                    ) : realtimeState === "active" ? (
                      <Loader size={16} type="bars" color="white" />
                    ) : (
                      <IconHeadset size={18} />
                    )}
                  </ActionIcon>
                </Tooltip>
              )}
              {recording && (
                <ActionIcon
                  size="lg"
                  radius="xl"
                  color="gray"
                  onClick={() => Recorder.stopRecording(false)}
                  aria-label={t("Cancel recording", "ביטול הקלטה")}
                >
                  <IconX size={18} />
                </ActionIcon>
              )}
              <Tooltip label={recording ? t("Stop and send", "עצור ושלח") : t("Dictate", "הכתבה")}>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant={recording ? "filled" : "subtle"}
                  color={recording ? "red" : "gray"}
                  className={recording ? classes.live : undefined}
                  onClick={toggleRecording}
                  disabled={transcribing}
                  aria-label={t("Dictate", "הכתבה")}
                >
                  {transcribing ? <Loader size={16} /> : <IconMicrophone size={18} />}
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                size={38}
                radius="xl"
                variant="gradient"
                gradient={loading ? { from: "red.6", to: "pink.5" } : { from: "brand.6", to: "cyan.5", deg: 135 }}
                className={classes.send}
                data-ready={!!value.trim() || loading || undefined}
                onClick={doSubmit}
                aria-label={loading ? t("Stop", "עצירה") : t("Send", "שליחה")}
              >
                {loading ? <IconPlayerStopFilled size={16} /> : <IconArrowUp size={20} stroke={2.4} />}
              </ActionIcon>
            </Group>
          </Group>
        </div>
        <Text size="xs" c="dimmed" ta="center" className={classes.hint}>
          {t(
            "Enter to send · Shift+Enter for a new line · AI can make mistakes",
            "Enter לשליחה · Shift+Enter לשורה חדשה · בינה מלאכותית עלולה לטעות"
          )}
        </Text>
      </div>
    </div>
  );
}
