import { useEffect, useState } from "react";
import { Badge, Button, Code, Collapse, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconDownload, IconTrash, IconCircleCheck } from "@tabler/icons-react";
import { clearErrors, ErrorEntry, exportErrors, markErrorsRead, useErrorLog } from "@/stores/ErrorLog";
import { useT } from "@/lib/i18n";
import classes from "./ErrorLogPanel.module.css";

const SOURCE_COLORS: Record<string, string> = {
  chat: "brand",
  network: "orange",
  voice: "pink",
  realtime: "pink",
  mcp: "cyan",
  tools: "grape",
  models: "blue",
  ui: "red",
  unhandled: "red",
};

function Entry({ entry }: { entry: ErrorEntry }) {
  const [open, setOpen] = useState(false);
  const time = new Date(entry.time);
  return (
    <div className={classes.entry}>
      <UnstyledButton className={classes.header} onClick={() => setOpen((o) => !o)}>
        <Badge size="sm" variant="light" color={SOURCE_COLORS[entry.source] || "gray"}>
          {entry.source}
        </Badge>
        <Text size="sm" className={classes.message} lineClamp={open ? undefined : 1}>
          {entry.message}
        </Text>
        <Text size="xs" c="dimmed" className={classes.time}>
          {time.toLocaleTimeString()} · {time.toLocaleDateString()}
        </Text>
        <IconChevronDown size={14} className={classes.chevron} data-open={open || undefined} />
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap={6} p="sm" pt={0}>
          {entry.details && (
            <Text size="xs" c="dimmed" dir="ltr" ta="start">
              {entry.details}
            </Text>
          )}
          {entry.url && (
            <Text size="xs" c="dimmed" dir="ltr" ta="start">
              {entry.url}
            </Text>
          )}
          {entry.stack && (
            <Code block className={classes.stack}>
              {entry.stack}
            </Code>
          )}
        </Stack>
      </Collapse>
    </div>
  );
}

export default function ErrorLogPanel() {
  const t = useT();
  const entries = useErrorLog((state) => state.entries);
  const sentry = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  useEffect(() => {
    markErrorsRead();
  }, [entries.length]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap={8}>
          <Text size="sm" c="dimmed">
            {t(`${entries.length} errors recorded`, `${entries.length} שגיאות נרשמו`)}
          </Text>
          <Badge variant="light" color={sentry ? "teal" : "gray"}>
            Sentry {sentry ? t("on", "פעיל") : t("off", "כבוי")}
          </Badge>
        </Group>
        <Group gap="xs">
          <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={exportErrors} disabled={!entries.length}>
            {t("Export report", "ייצוא דוח")}
          </Button>
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={clearErrors} disabled={!entries.length}>
            {t("Clear", "ניקוי")}
          </Button>
        </Group>
      </Group>
      {entries.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconCircleCheck size={40} color="var(--mantine-color-teal-5)" />
          <Text c="dimmed">{t("No errors. Everything is running smoothly.", "אין שגיאות. הכול עובד כמו שצריך.")}</Text>
        </Stack>
      ) : (
        <Stack gap={6}>
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
