import { useRouter } from "next/router";
import {
  ActionIcon,
  Burger,
  Group,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconBrandGithub, IconLanguage, IconMoon, IconPlus, IconSun } from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { setNavOpened, update } from "@/stores/ChatActions";
import { getModelInfo } from "@/stores/Model";
import { useT } from "@/lib/i18n";
import ModelPicker from "@/components/chat/ModelPicker";
import classes from "./TopBar.module.css";

export default function TopBar() {
  const t = useT();
  const router = useRouter();
  const activeChatId = router.query.chatId as string | undefined;
  const chat = useChatStore((state) => state.chats.find((c) => c.id === activeChatId));
  const model = useChatStore((state) => state.settingsForm.model);
  const navOpened = useChatStore((state) => state.navOpened);
  const uiLanguage = useChatStore((state) => state.uiLanguage);
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("dark");
  const cost = chat?.costIncurred || 0;
  const priced = getModelInfo(model).costPer1kTokens.prompt > 0;

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="xs" wrap="nowrap" className={classes.start}>
        <Burger
          hiddenFrom="sm"
          size="sm"
          opened={navOpened}
          onClick={() => setNavOpened(!navOpened)}
          aria-label="Menu"
        />
        <div className={classes.titleBlock}>
          <Text fw={600} size="sm" truncate className={classes.title}>
            {chat?.title || chat?.chosenCharacter || t("New chat", "שיחה חדשה")}
          </Text>
          {chat && (
            <Text size="xs" c="dimmed" className={classes.meta}>
              {t(`${chat.messages.length} messages`, `${chat.messages.length} הודעות`)}
              {priced && cost > 0 ? ` · $${cost.toFixed(3)}` : ""}
            </Text>
          )}
        </div>
      </Group>

      <ModelPicker />

      <Group gap={4} wrap="nowrap">
        <Tooltip label={t("New chat", "שיחה חדשה")}>
          <ActionIcon size="lg" color="gray" onClick={() => router.push("/")} hiddenFrom="sm">
            <IconPlus size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={uiLanguage === "he" ? "English" : "עברית"}>
          <ActionIcon
            size="lg"
            color="gray"
            onClick={() => update({ uiLanguage: uiLanguage === "he" ? "en" : "he" })}
            visibleFrom="xs"
          >
            <IconLanguage size={19} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={scheme === "dark" ? t("Light mode", "מצב בהיר") : t("Dark mode", "מצב כהה")}>
          <ActionIcon
            size="lg"
            color="gray"
            onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}
          >
            {scheme === "dark" ? <IconSun size={19} /> : <IconMoon size={19} />}
          </ActionIcon>
        </Tooltip>
        <ActionIcon
          size="lg"
          color="gray"
          component="a"
          href="https://github.com/analist0/yakGPT"
          target="_blank"
          visibleFrom="sm"
          aria-label="GitHub"
        >
          <IconBrandGithub size={19} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
