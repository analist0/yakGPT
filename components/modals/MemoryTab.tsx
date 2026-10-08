import { useState } from "react";
import { ActionIcon, Button, Group, Stack, Switch, Text, Textarea, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { addMemory, deleteMemory, updateMemory } from "@/stores/Memory";
import { useT } from "@/lib/i18n";
import classes from "./ToolsPanel.module.css";

export default function MemoryTab() {
  const t = useT();
  const enabled = useChatStore((state) => state.memoryEnabled);
  const memories = useChatStore((state) => state.memories);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const run = (action: () => void) => {
    try {
      action();
      return true;
    } catch (error) {
      notifications.show({ color: "red", message: (error as Error).message });
      return false;
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" className={classes.row}>
        <div>
          <Text fw={600}>{t("Long-term memory", "זיכרון ארוך טווח")}</Text>
          <Text size="xs" c="dimmed">
            {t(
              "The model saves facts about you and sees them in every chat. Passwords and keys are never saved.",
              "המודל שומר עובדות עליך ורואה אותן בכל שיחה. סיסמאות ומפתחות לא נשמרים אף פעם."
            )}
          </Text>
        </div>
        <Switch
          checked={enabled}
          onChange={(e) => useChatStore.setState({ memoryEnabled: e.currentTarget.checked })}
        />
      </Group>

      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Textarea
          style={{ flex: 1 }}
          autosize
          minRows={1}
          maxRows={4}
          placeholder={t("Add something to remember…", "להוסיף משהו לזכור…")}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
        />
        <Button
          leftSection={<IconPlus size={15} />}
          disabled={!draft.trim()}
          onClick={() => run(() => addMemory(draft)) && setDraft("")}
        >
          {t("Add", "הוספה")}
        </Button>
      </Group>

      {memories.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {t("Nothing saved yet", "עדיין לא נשמר כלום")}
        </Text>
      ) : (
        [...memories].reverse().map((memory) => (
          <Group key={memory.id} justify="space-between" wrap="nowrap" className={classes.row} data-off={!enabled || undefined}>
            {editing?.id === memory.id ? (
              <Textarea
                style={{ flex: 1 }}
                autosize
                minRows={1}
                value={editing.text}
                onChange={(e) => setEditing({ id: memory.id, text: e.currentTarget.value })}
              />
            ) : (
              <div style={{ minWidth: 0 }}>
                <Text size="sm" style={{ unicodeBidi: "plaintext" }}>
                  {memory.text}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(memory.updatedAt).toLocaleDateString()}
                </Text>
              </div>
            )}
            <Group gap={4} wrap="nowrap">
              {editing?.id === memory.id ? (
                <>
                  <ActionIcon
                    color="teal"
                    onClick={() => run(() => updateMemory(memory.id, editing.text)) && setEditing(null)}
                    aria-label={t("Save", "שמירה")}
                  >
                    <IconCheck size={16} />
                  </ActionIcon>
                  <ActionIcon color="gray" onClick={() => setEditing(null)} aria-label={t("Cancel", "ביטול")}>
                    <IconX size={16} />
                  </ActionIcon>
                </>
              ) : (
                <Tooltip label={t("Edit", "עריכה")}>
                  <ActionIcon color="gray" onClick={() => setEditing({ id: memory.id, text: memory.text })}>
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label={t("Delete", "מחיקה")}>
                <ActionIcon color="red" variant="subtle" onClick={() => run(() => deleteMemory(memory.id))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        ))
      )}

      {memories.length > 1 && (
        <Group>
          <Button
            variant="subtle"
            color="red"
            onClick={() => {
              if (window.confirm(t("Delete all memories?", "למחוק את כל הזיכרונות?"))) {
                useChatStore.setState({ memories: [] });
              }
            }}
          >
            {t("Delete all", "מחיקת הכול")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
