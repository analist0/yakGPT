import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Collapse,
  FileButton,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBook,
  IconBrain,
  IconBrandGithub,
  IconDownload,
  IconPencil,
  IconPlug,
  IconPlus,
  IconRefresh,
  IconTool,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { update } from "@/stores/ChatActions";
import { allTools, toggleTool, ToolRisk } from "@/stores/Tools";
import { setToolRule, ToolRule } from "@/stores/Approval";
import ApprovalModeControl from "@/components/ApprovalModeControl";
import {
  connectMcpServer,
  McpServerConfig,
  parseMcpJson,
  removeMcpServer,
  saveMcpServer,
  setMcpServerEnabled,
  useMcpStatus,
} from "@/stores/Mcp";
import {
  addExampleSkills,
  deleteSkill,
  exportSkills,
  importSkills,
  saveSkill,
  Skill,
  toggleSkill,
} from "@/stores/Skills";
import { captureError } from "@/stores/ErrorLog";
import GithubSkillsImport from "./GithubSkillsImport";
import MemoryTab from "./MemoryTab";
import { useT } from "@/lib/i18n";
import classes from "./ToolsPanel.module.css";

function ToolsTab() {
  const t = useT();
  const toolsEnabled = useChatStore((state) => state.toolsEnabled);
  const disabled = useChatStore((state) => state.disabledTools);
  const toolRules = useChatStore((state) => state.toolRules);
  useChatStore((state) => state.skills);
  useMcpStatus((state) => state.servers);
  const tools = allTools();

  const sourceLabel = {
    builtin: t("Built-in", "מובנה"),
    skill: t("Skills", "סקילים"),
    mcp: "MCP",
    memory: t("Memory", "זיכרון"),
  };
  const riskLabel: Record<ToolRisk, string> = {
    read: t("Reads", "קורא"),
    write: t("Changes", "משנה"),
    destructive: t("Can delete or send", "יכול למחוק או לשלוח"),
  };
  const riskColor: Record<ToolRisk, string> = { read: "teal", write: "yellow", destructive: "red" };

  return (
    <Stack gap="md">
      <Group justify="space-between" className={classes.row}>
        <div>
          <Text fw={600}>{t("Let the model use tools", "לאפשר למודל להשתמש בכלים")}</Text>
          <Text size="xs" c="dimmed">
            {t(
              "The model decides when to call a tool. Models without tool support answer normally.",
              "המודל מחליט מתי להפעיל כלי. מודלים שלא תומכים בכלים יענו כרגיל."
            )}
          </Text>
        </div>
        <Switch checked={toolsEnabled} onChange={(e) => update({ toolsEnabled: e.currentTarget.checked })} />
      </Group>
      <div className={classes.row}>
        <Text fw={600} mb={6}>
          {t("Ask before running tools", "אישור לפני הפעלת כלים")}
        </Text>
        <ApprovalModeControl />
      </div>
      {tools.map((tool) => (
        <Group key={tool.name} justify="space-between" wrap="nowrap" className={classes.row} data-off={!toolsEnabled || undefined}>
          <div style={{ minWidth: 0 }}>
            <Group gap={6}>
              <Text size="sm" fw={600}>
                {tool.label}
              </Text>
              <Badge size="xs" variant="light" color={tool.source === "mcp" ? "cyan" : tool.source === "skill" ? "grape" : tool.source === "memory" ? "pink" : "brand"}>
                {sourceLabel[tool.source]}
              </Badge>
              <Badge size="xs" variant="dot" color={riskColor[tool.risk]}>
                {riskLabel[tool.risk]}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {tool.description}
            </Text>
          </div>
          <Group gap={8} wrap="nowrap">
            <Select
              size="xs"
              w={120}
              allowDeselect={false}
              disabled={!toolsEnabled || disabled.includes(tool.name)}
              value={toolRules[tool.name] || "mode"}
              onChange={(value) => setToolRule(tool.name, value === "mode" ? undefined : (value as ToolRule))}
              data={[
                { value: "mode", label: t("By mode", "לפי המצב") },
                { value: "ask", label: t("Always ask", "תמיד לשאול") },
                { value: "auto", label: t("Never ask", "אף פעם לא לשאול") },
              ]}
              aria-label={t("Approval", "אישור")}
            />
            <Switch
              size="sm"
              disabled={!toolsEnabled}
              checked={!disabled.includes(tool.name)}
              onChange={() => toggleTool(tool.name)}
            />
          </Group>
        </Group>
      ))}
    </Stack>
  );
}

const MCP_PRESETS: { label: string; config: Omit<McpServerConfig, "id"> }[] = [
  { label: "DeepWiki", config: { name: "deepwiki", transport: "http", url: "https://mcp.deepwiki.com/mcp", enabled: true } },
  { label: "Context7 docs", config: { name: "context7", transport: "http", url: "https://mcp.context7.com/mcp", enabled: true } },
  {
    label: "Filesystem",
    config: { name: "filesystem", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."], enabled: true },
  },
  { label: "Fetch", config: { name: "fetch", transport: "stdio", command: "uvx", args: ["mcp-server-fetch"], enabled: true } },
  { label: "Memory", config: { name: "memory", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], enabled: true } },
];

const toLines = (record?: Record<string, string>) =>
  Object.entries(record || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

const fromLines = (text: string, separator: string) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(separator);
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
      .filter(([k]) => k)
  );

function McpForm({ initial, onDone }: { initial?: McpServerConfig; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name || "");
  const [transport, setTransport] = useState<McpServerConfig["transport"]>(initial?.transport || "http");
  const [url, setUrl] = useState(initial?.url || "");
  const [headers, setHeaders] = useState(
    Object.entries(initial?.headers || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")
  );
  const [command, setCommand] = useState(initial?.command || "");
  const [args, setArgs] = useState((initial?.args || []).join("\n"));
  const [env, setEnv] = useState(toLines(initial?.env));

  const valid = name.trim() && (transport === "http" ? /^https?:\/\//.test(url) : command.trim());

  return (
    <Stack gap="sm" className={classes.form}>
      <Group grow align="flex-start">
        <TextInput label={t("Name", "שם")} value={name} onChange={(e) => setName(e.currentTarget.value)} dir="ltr" />
        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("Connection", "חיבור")}
          </Text>
          <SegmentedControl
            fullWidth
            value={transport}
            onChange={(v) => setTransport(v as McpServerConfig["transport"])}
            data={[
              { value: "http", label: t("Remote (HTTP)", "מרוחק (HTTP)") },
              { value: "stdio", label: t("Local (stdio)", "מקומי (stdio)") },
            ]}
          />
        </div>
      </Group>
      {transport === "http" ? (
        <>
          <TextInput label="URL" placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.currentTarget.value)} dir="ltr" />
          <Textarea
            label={t("Headers (one per line)", "כותרות (אחת בכל שורה)")}
            placeholder="Authorization: Bearer …"
            autosize
            minRows={1}
            value={headers}
            onChange={(e) => setHeaders(e.currentTarget.value)}
            dir="ltr"
          />
        </>
      ) : (
        <>
          <TextInput label={t("Command", "פקודה")} placeholder="npx" value={command} onChange={(e) => setCommand(e.currentTarget.value)} dir="ltr" />
          <Textarea
            label={t("Arguments (one per line)", "ארגומנטים (אחד בכל שורה)")}
            autosize
            minRows={2}
            value={args}
            onChange={(e) => setArgs(e.currentTarget.value)}
            dir="ltr"
          />
          <Textarea
            label={t("Environment (KEY=value per line)", "משתני סביבה (KEY=value בכל שורה)")}
            autosize
            minRows={1}
            value={env}
            onChange={(e) => setEnv(e.currentTarget.value)}
            dir="ltr"
          />
        </>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" onClick={onDone}>
          {t("Cancel", "ביטול")}
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            saveMcpServer({
              id: initial?.id,
              name: name.trim(),
              transport,
              url: transport === "http" ? url.trim() : undefined,
              headers: transport === "http" ? fromLines(headers, ":") : undefined,
              command: transport === "stdio" ? command.trim() : undefined,
              args: transport === "stdio" ? args.split("\n").map((a) => a.trim()).filter(Boolean) : undefined,
              env: transport === "stdio" ? fromLines(env, "=") : undefined,
              enabled: initial?.enabled ?? true,
            });
            onDone();
          }}
        >
          {t("Save & connect", "שמירה וחיבור")}
        </Button>
      </Group>
    </Stack>
  );
}

function McpTab() {
  const t = useT();
  const servers = useChatStore((state) => state.mcpServers);
  const status = useMcpStatus((state) => state.servers);
  const [editing, setEditing] = useState<McpServerConfig | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const doImport = () => {
    try {
      const configs = parseMcpJson(importText);
      configs.forEach(saveMcpServer);
      notifications.show({ color: "teal", message: t(`Imported ${configs.length} servers`, `יובאו ${configs.length} שרתים`) });
      setImportText("");
      setImportOpen(false);
    } catch (error) {
      captureError("mcp", error, { details: "import" });
      notifications.show({ color: "red", message: (error as Error).message });
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t(
          "Connect Model Context Protocol servers to give the model new tools. Remote servers connect from the browser; local (stdio) servers run on the machine serving Hamal.",
          "חבר שרתי Model Context Protocol כדי לתת למודל כלים חדשים. שרתים מרוחקים מתחברים מהדפדפן; שרתים מקומיים (stdio) רצים על המחשב שמריץ את חמ״ל."
        )}
      </Text>

      <AnimatePresence initial={false}>
        {servers.map((server) => {
          const s = status[server.id];
          const state = server.enabled ? s?.state || "disconnected" : "disconnected";
          return (
            <motion.div key={server.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className={classes.row}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
                    <span className={classes.status} data-state={state} />
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6}>
                        <Text fw={600} size="sm" dir="ltr">
                          {server.name}
                        </Text>
                        <Badge size="xs" variant="light" color={server.transport === "http" ? "cyan" : "grape"}>
                          {server.transport === "http" ? "HTTP" : "stdio"}
                        </Badge>
                        {state === "connected" && (
                          <Badge size="xs" variant="light" color="teal">
                            {s.tools.length} {t("tools", "כלים")}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" truncate dir="ltr" ta="start">
                        {server.transport === "http" ? server.url : [server.command, ...(server.args || [])].join(" ")}
                      </Text>
                    </div>
                  </Group>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label={t("Reconnect", "חיבור מחדש")}>
                      <ActionIcon size="sm" color="gray" onClick={() => connectMcpServer(server)} disabled={!server.enabled}>
                        <IconRefresh size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon size="sm" color="gray" onClick={() => setEditing(server)}>
                      <IconPencil size={14} />
                    </ActionIcon>
                    <ActionIcon size="sm" color="red" onClick={() => removeMcpServer(server)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                    <Switch size="sm" checked={server.enabled} onChange={(e) => setMcpServerEnabled(server, e.currentTarget.checked)} />
                  </Group>
                </Group>
                {state === "error" && (
                  <Text size="xs" c="red" mt={6} dir="ltr" ta="start">
                    {s?.error}
                  </Text>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <Collapse expanded={!!editing}>
        {editing && (
          <McpForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Collapse>

      {!editing && (
        <>
          <Group gap="xs">
            <Button leftSection={<IconPlus size={15} />} onClick={() => setEditing("new")}>
              {t("Add server", "הוספת שרת")}
            </Button>
            <Button variant="light" leftSection={<IconUpload size={15} />} onClick={() => setImportOpen((o) => !o)}>
              {t("Import JSON", "ייבוא JSON")}
            </Button>
          </Group>
          <div>
            <Text size="xs" c="dimmed" mb={6}>
              {t("Quick add", "הוספה מהירה")}
            </Text>
            <Group gap={6}>
              {MCP_PRESETS.map((preset) => (
                <Badge
                  key={preset.label}
                  variant="outline"
                  size="lg"
                  radius="md"
                  className={classes.preset}
                  leftSection={<IconPlus size={11} />}
                  onClick={() => saveMcpServer(preset.config)}
                >
                  {preset.label}
                </Badge>
              ))}
            </Group>
          </div>
        </>
      )}

      <Collapse expanded={importOpen}>
        <Stack gap="xs">
          <Textarea
            dir="ltr"
            autosize
            minRows={5}
            placeholder={'{\n  "mcpServers": {\n    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }\n  }\n}'}
            value={importText}
            onChange={(e) => setImportText(e.currentTarget.value)}
            description={t("Same format as Claude Desktop / Cursor mcp.json", "אותו פורמט כמו mcp.json של Claude Desktop / Cursor")}
          />
          <Group justify="flex-end">
            <Button size="xs" onClick={doImport} disabled={!importText.trim()}>
              {t("Import", "ייבוא")}
            </Button>
          </Group>
        </Stack>
      </Collapse>

      <Alert variant="light" color="gray">
        <Text size="xs">
          {t(
            "Local servers only run when Hamal is opened from the same machine, or when the server sets",
            "שרתים מקומיים רצים רק כשחמ״ל נפתח מאותו מחשב, או כשהשרת מוגדר עם"
          )}{" "}
          <Code>YAKGPT_LOCAL_FEATURES=1</Code>
        </Text>
      </Alert>
    </Stack>
  );
}

function SkillForm({ initial, onDone }: { initial?: Skill; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [instructions, setInstructions] = useState(initial?.instructions || "");
  return (
    <Stack gap="sm" className={classes.form}>
      <TextInput
        label={t("Name", "שם")}
        description={t("Lowercase, used by the model to load it", "אותיות קטנות באנגלית, המודל טוען לפיו")}
        placeholder="code-review"
        dir="ltr"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <TextInput
        label={t("When to use", "מתי להשתמש")}
        description={t("The model reads this to decide when the skill applies", "המודל קורא את זה כדי להחליט מתי להשתמש בסקיל")}
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
      />
      <Textarea
        label={t("Instructions", "הוראות")}
        autosize
        minRows={5}
        maxRows={14}
        value={instructions}
        onChange={(e) => setInstructions(e.currentTarget.value)}
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" onClick={onDone}>
          {t("Cancel", "ביטול")}
        </Button>
        <Button
          disabled={!name.trim() || !description.trim() || !instructions.trim()}
          onClick={() => {
            saveSkill({ id: initial?.id, name, description, instructions, enabled: initial?.enabled ?? true });
            onDone();
          }}
        >
          {t("Save skill", "שמירת סקיל")}
        </Button>
      </Group>
    </Stack>
  );
}

function SkillsTab() {
  const t = useT();
  const skills = useChatStore((state) => state.skills);
  const [editing, setEditing] = useState<Skill | "new" | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);

  const importFile = async (file: File | null) => {
    if (!file) return;
    try {
      const count = importSkills(await file.text());
      notifications.show({ color: "teal", message: t(`Imported ${count} skills`, `יובאו ${count} סקילים`) });
    } catch (error) {
      captureError("tools", error, { details: "import skills" });
      notifications.show({ color: "red", message: (error as Error).message });
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t(
          "Skills are instruction packs. The model sees each skill's name and description and loads the full instructions when a task matches.",
          "סקילים הם חבילות הוראות. המודל רואה את השם והתיאור של כל סקיל, וטוען את ההוראות המלאות כשהמשימה מתאימה."
        )}
      </Text>
      {skills.map((skill) => (
        <Group key={skill.id} justify="space-between" wrap="nowrap" className={classes.row}>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} size="sm" dir="ltr" ta="start">
              {skill.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {skill.description}
            </Text>
            {skill.source && (
              <Text size="xs" c="dimmed" truncate dir="ltr" ta="start">
                {skill.source.replace("https://github.com/", "")}
              </Text>
            )}
          </div>
          <Group gap={4} wrap="nowrap">
            <ActionIcon size="sm" color="gray" onClick={() => setEditing(skill)}>
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon size="sm" color="red" onClick={() => deleteSkill(skill.id)}>
              <IconTrash size={14} />
            </ActionIcon>
            <Switch size="sm" checked={skill.enabled} onChange={() => toggleSkill(skill.id)} />
          </Group>
        </Group>
      ))}
      {skills.length === 0 && !editing && (
        <Text size="sm" ta="center" c="dimmed" py="md">
          {t("No skills yet", "עדיין אין סקילים")}
        </Text>
      )}
      <Collapse expanded={!!editing}>
        {editing && (
          <SkillForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Collapse>
      <Collapse expanded={githubOpen}>
        {githubOpen && <GithubSkillsImport onDone={() => setGithubOpen(false)} />}
      </Collapse>
      {!editing && !githubOpen && (
        <Group gap="xs">
          <Button leftSection={<IconPlus size={15} />} onClick={() => setEditing("new")}>
            {t("New skill", "סקיל חדש")}
          </Button>
          <Button variant="light" leftSection={<IconBrandGithub size={15} />} onClick={() => setGithubOpen(true)}>
            {t("Import from GitHub", "ייבוא מ־GitHub")}
          </Button>
          <FileButton onChange={importFile} accept=".md,.json,.txt">
            {(props) => (
              <Button {...props} variant="light" leftSection={<IconUpload size={15} />}>
                {t("Import SKILL.md / JSON", "ייבוא SKILL.md / JSON")}
              </Button>
            )}
          </FileButton>
          {skills.length > 0 && (
            <Button variant="light" leftSection={<IconDownload size={15} />} onClick={exportSkills}>
              {t("Export", "ייצוא")}
            </Button>
          )}
          <Button variant="subtle" onClick={addExampleSkills}>
            {t("Add examples", "הוספת דוגמאות")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export default function ToolsPanel({ defaultTab }: { defaultTab?: string }) {
  const t = useT();
  return (
    <Tabs defaultValue={defaultTab || "tools"} keepMounted={false} variant="pills" radius="md">
      <Tabs.List mb="md">
        <Tabs.Tab value="tools" leftSection={<IconTool size={15} />}>
          {t("Tools", "כלים")}
        </Tabs.Tab>
        <Tabs.Tab value="mcp" leftSection={<IconPlug size={15} />}>
          {t("MCP servers", "שרתי MCP")}
        </Tabs.Tab>
        <Tabs.Tab value="skills" leftSection={<IconBook size={15} />}>
          {t("Skills", "סקילים")}
        </Tabs.Tab>
        <Tabs.Tab value="memory" leftSection={<IconBrain size={15} />}>
          {t("Memory", "זיכרון")}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="tools">
        <ToolsTab />
      </Tabs.Panel>
      <Tabs.Panel value="mcp">
        <McpTab />
      </Tabs.Panel>
      <Tabs.Panel value="memory">
        <MemoryTab />
      </Tabs.Panel>
      <Tabs.Panel value="skills">
        <SkillsTab />
      </Tabs.Panel>
    </Tabs>
  );
}
