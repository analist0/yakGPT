import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconPlus, IconSearch } from "@tabler/icons-react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "@/stores/ChatStore";
import {
  configuredProviders,
  getProviderConnection,
  ProviderId,
  providers,
} from "@/stores/Providers";
import { fetchModels } from "@/stores/OpenAI";
import { refreshModels, selectModel } from "@/stores/ChatActions";
import { getModelInfo } from "@/stores/Model";
import { openModal } from "@/stores/Ui";
import { captureError } from "@/stores/ErrorLog";
import { useT } from "@/lib/i18n";
import classes from "./ModelPicker.module.css";

// Model lists of providers other than the active one, loaded on demand
const modelCache = new Map<ProviderId, string[]>();

export default function ModelPicker() {
  const t = useT();
  const [opened, setOpened] = useState(false);
  const chatProvider = useChatStore((state) => state.chatProvider);
  const model = useChatStore((state) => state.settingsForm.model);
  const activeModels = useChatStore((state) => state.modelChoicesChat);
  const available = useChatStore(useShallow(configuredProviders));
  const [tab, setTab] = useState<ProviderId>(chatProvider);
  const [query, setQuery] = useState("");
  // Model lists fetched for providers other than the active one
  const [fetched, setFetched] = useState<Partial<Record<ProviderId, string[]>>>(() =>
    Object.fromEntries(modelCache)
  );

  useEffect(() => {
    refreshModels();
  }, [chatProvider]);

  const models =
    tab === chatProvider && activeModels ? activeModels : fetched[tab];

  useEffect(() => {
    if (!opened || tab === chatProvider || modelCache.has(tab)) return;
    let cancelled = false;
    fetchModels(getProviderConnection(useChatStore.getState(), tab))
      .then((ids) => providers[tab].filterModels(ids))
      .catch((error) => {
        captureError("models", error, { details: providers[tab].name });
        return [] as string[];
      })
      .then((ids) => {
        modelCache.set(tab, ids);
        if (!cancelled) setFetched((f) => ({ ...f, [tab]: ids }));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, tab, chatProvider]);

  const toggle = (open: boolean) => {
    if (open) {
      setTab(chatProvider);
      setQuery("");
    }
    setOpened(open);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models || []).filter((m) => !q || m.toLowerCase().includes(q)).slice(0, 300);
  }, [models, query]);

  const label = available.length ? getModelInfo(model).displayName : t("No provider", "אין ספק");

  return (
    <Popover
      opened={opened}
      onChange={toggle}
      width={380}
      position="bottom"
      shadow="lg"
      radius="lg"
      transitionProps={{ transition: "pop", duration: 180 }}
    >
      <Popover.Target>
        <UnstyledButton className={classes.trigger} onClick={() => toggle(!opened)}>
          <span className={classes.dot} data-provider={chatProvider} />
          <Text size="sm" fw={500} truncate className={classes.triggerText}>
            <span className={classes.provider}>{providers[chatProvider].name}</span>
            <span className={classes.sep}>/</span>
            {label}
          </Text>
          <IconChevronDown size={14} className={classes.chevron} data-open={opened || undefined} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0} className={classes.dropdown}>
        <ScrollArea type="never" className={classes.tabs}>
          <Group gap={6} wrap="nowrap" p="sm">
            {available.map((id) => (
              <Badge
                key={id}
                size="lg"
                radius="md"
                variant={tab === id ? "filled" : "light"}
                color={tab === id ? "brand" : "gray"}
                className={classes.tab}
                onClick={() => setTab(id)}
              >
                {providers[id].name}
              </Badge>
            ))}
            <Badge
              size="lg"
              radius="md"
              variant="outline"
              color="gray"
              className={classes.tab}
              leftSection={<IconPlus size={12} />}
              onClick={() => {
                setOpened(false);
                openModal("keys");
              }}
            >
              {t("Add", "הוספה")}
            </Badge>
          </Group>
        </ScrollArea>
        <Divider />
        <div className={classes.searchWrap}>
          <TextInput
            autoFocus
            variant="unstyled"
            placeholder={t("Search models…", "חיפוש מודל…")}
            leftSection={<IconSearch size={15} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <Divider />
        <ScrollArea.Autosize mah={340} type="hover">
          <div className={classes.list}>
            {models === undefined ? (
              <Group justify="center" p="lg">
                <Loader size="sm" type="dots" />
              </Group>
            ) : filtered.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" p="lg">
                {available.length === 0
                  ? t("Add a provider to start chatting", "הוסף ספק כדי להתחיל")
                  : t("No models found", "לא נמצאו מודלים")}
              </Text>
            ) : (
              filtered.map((id) => {
                const selected = tab === chatProvider && id === model;
                return (
                  <UnstyledButton
                    key={id}
                    className={classes.item}
                    data-selected={selected || undefined}
                    onClick={() => {
                      selectModel(id, tab);
                      setOpened(false);
                    }}
                  >
                    <Text size="sm" truncate className={classes.itemText}>
                      {getModelInfo(id).displayName}
                    </Text>
                    {selected && <IconCheck size={16} className={classes.check} />}
                  </UnstyledButton>
                );
              })
            )}
          </div>
        </ScrollArea.Autosize>
        {tab === "ollama" && (
          <>
            <Divider />
            <Button
              variant="subtle"
              fullWidth
              radius={0}
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setOpened(false);
                openModal("models");
              }}
            >
              {t("Download more local models", "הורדת מודלים מקומיים נוספים")}
            </Button>
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
