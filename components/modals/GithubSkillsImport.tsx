import { useMemo, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandGithub, IconSearch } from "@tabler/icons-react";
import { findGithubSkills, FoundSkill } from "@/lib/githubSkills";
import { upsertSkills } from "@/stores/Skills";
import { useChatStore } from "@/stores/ChatStore";
import { captureError } from "@/stores/ErrorLog";
import { useT } from "@/lib/i18n";
import classes from "./ToolsPanel.module.css";

const SUGGESTED = ["anthropics/skills"];

export default function GithubSkillsImport({ onDone }: { onDone: () => void }) {
  const t = useT();
  const existing = useChatStore((state) => state.skills);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [found, setFound] = useState<FoundSkill[]>();
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const existingNames = useMemo(() => new Set(existing.map((s) => s.name)), [existing]);
  const valid = (found || []).filter((f) => f.skill);
  const failed = (found || []).filter((f) => f.error);

  const search = async (value = input) => {
    if (!value.trim()) return;
    setInput(value);
    setLoading(true);
    setFound(undefined);
    setProgress([0, 0]);
    try {
      const result = await findGithubSkills(value, (done, total) => setProgress([done, total]));
      setFound(result.skills);
      setTruncated(result.truncated);
      setSelected(new Set(result.skills.filter((f) => f.skill).map((f) => f.path)));
    } catch (error) {
      captureError("tools", error, { details: `GitHub skills: ${value}` });
      notifications.show({ color: "red", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (path: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const importSelected = () => {
    const skills = valid.filter((f) => selected.has(f.path)).map((f) => f.skill!);
    upsertSkills(skills);
    notifications.show({
      color: "teal",
      message: t(`Imported ${skills.length} skills`, `יובאו ${skills.length} סקילים`),
    });
    onDone();
  };

  return (
    <Stack gap="sm" className={classes.form}>
      <Group gap={6}>
        <IconBrandGithub size={18} />
        <Text fw={600} size="sm">
          {t("Import skills from GitHub", "ייבוא סקילים מ־GitHub")}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {t(
          "A public repository, a folder in it, or a single SKILL.md link. Every SKILL.md found is listed.",
          "מאגר ציבורי, תיקייה בתוכו או קישור לקובץ SKILL.md. כל קובצי ה־SKILL.md שיימצאו יוצגו ברשימה."
        )}
      </Text>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <TextInput
          flex={1}
          dir="ltr"
          placeholder="anthropics/skills · https://github.com/owner/repo/tree/main/skills"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          aria-label={t("GitHub repository", "מאגר GitHub")}
        />
        <Button leftSection={<IconSearch size={15} />} onClick={() => search()} loading={loading} disabled={!input.trim()}>
          {t("Find", "חיפוש")}
        </Button>
      </Group>
      {!found && !loading && (
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {t("Try:", "נסה:")}
          </Text>
          {SUGGESTED.map((repo) => (
            <Badge
              key={repo}
              variant="outline"
              radius="md"
              className={classes.preset}
              onClick={() => search(repo)}
              style={{ direction: "ltr" }}
            >
              {repo}
            </Badge>
          ))}
        </Group>
      )}
      {loading && progress[1] > 0 && (
        <Stack gap={4}>
          <Progress value={(progress[0] / progress[1]) * 100} size="sm" radius="xl" animated />
          <Text size="xs" c="dimmed">
            {t(`Reading ${progress[0]} of ${progress[1]} skills…`, `קורא ${progress[0]} מתוך ${progress[1]} סקילים…`)}
          </Text>
        </Stack>
      )}

      {found && (
        <>
          <Group justify="space-between">
            <Text size="sm">
              {t(`${valid.length} skills found`, `נמצאו ${valid.length} סקילים`)}
              {truncated && t(" (first 200)", " (200 הראשונים)")}
            </Text>
            <Group gap={4}>
              <Button size="compact-xs" variant="subtle" onClick={() => setSelected(new Set(valid.map((f) => f.path)))}>
                {t("Select all", "בחירת הכול")}
              </Button>
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setSelected(new Set())}>
                {t("Clear", "ניקוי")}
              </Button>
            </Group>
          </Group>
          <ScrollArea.Autosize mah={320} type="auto">
            <Stack gap={6}>
              {valid.map((f) => (
                <Checkbox
                  key={f.path}
                  checked={selected.has(f.path)}
                  onChange={() => toggle(f.path)}
                  classNames={{ body: classes.checkRow }}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} dir="ltr">
                        {f.skill!.name}
                      </Text>
                      {existingNames.has(f.skill!.name) && (
                        <Badge size="xs" variant="light" color="yellow">
                          {t("updates existing", "יעדכן קיים")}
                        </Badge>
                      )}
                    </Group>
                  }
                  description={
                    <>
                      <Text size="xs" c="dimmed" lineClamp={2} component="div">
                        {f.skill!.description}
                      </Text>
                      <Anchor href={f.folderUrl} target="_blank" size="xs" dir="ltr">
                        {f.path}
                      </Anchor>
                    </>
                  }
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {failed.length > 0 && (
            <Text size="xs" c="red">
              {t(
                `${failed.length} files could not be read: `,
                `${failed.length} קבצים לא נקראו: `
              )}
              <span dir="ltr">{failed.map((f) => `${f.path} (${f.error})`).join(", ")}</span>
            </Text>
          )}
        </>
      )}

      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" onClick={onDone}>
          {t("Cancel", "ביטול")}
        </Button>
        {found && (
          <Button onClick={importSelected} disabled={selected.size === 0}>
            {t(`Import ${selected.size} skills`, `ייבוא ${selected.size} סקילים`)}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
