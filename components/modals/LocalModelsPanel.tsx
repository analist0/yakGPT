import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCpu,
  IconDeviceDesktop,
  IconDownload,
  IconRefresh,
  IconServer,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  detectHardware,
  FitLevel,
  HardwareInfo,
  memoryBudget,
  ModelTag,
  recommendModels,
  requiredMemoryGB,
} from "@/lib/localModels";
import { cancelPull, checkOllama, deleteModel, pullModel, useOllama } from "@/stores/Ollama";
import { selectModel } from "@/stores/ChatActions";
import { useT } from "@/lib/i18n";
import classes from "./LocalModelsPanel.module.css";

const formatGB = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

function HardwareCard({ hw }: { hw: HardwareInfo | undefined }) {
  const t = useT();
  if (!hw) {
    return (
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={74} radius="md" />
        ))}
      </SimpleGrid>
    );
  }
  const budget = memoryBudget(hw);
  const gpu = hw.gpus[0];
  const stats = [
    { icon: IconCpu, label: t("Processor", "מעבד"), value: hw.cpu || `${hw.threads} ${t("threads", "ליבות")}`, sub: hw.cores ? `${hw.cores} ${t("cores", "ליבות")} · ${hw.threads} ${t("threads", "תהליכונים")}` : "" },
    { icon: IconServer, label: t("Memory", "זיכרון"), value: hw.ramGB ? `${hw.ramGB} GB` : "?", sub: hw.freeRamGB ? `${hw.freeRamGB} GB ${t("free", "פנוי")}` : hw.source === "browser" ? t("estimate", "הערכה") : "" },
    { icon: IconDeviceDesktop, label: t("Graphics", "כרטיס מסך"), value: gpu?.model || t("None found", "לא נמצא"), sub: gpu?.vramGB ? `${gpu.vramGB} GB VRAM` : hw.appleSilicon ? t("Unified memory", "זיכרון משותף") : "" },
    { icon: IconSparkles, label: t("Model budget", "תקציב למודל"), value: `${(budget.fastGB || budget.totalGB).toFixed(1)} GB`, sub: budget.fastGB ? t("full speed on GPU", "מהירות מלאה על GPU") : t("on CPU (slower)", "על המעבד (איטי יותר)") },
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      {stats.map(({ icon: Icon, label, value, sub }, i) => (
        <motion.div
          key={label}
          className={classes.stat}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <Group gap={6} mb={4}>
            <Icon size={15} className={classes.statIcon} />
            <Text size="xs" c="dimmed">
              {label}
            </Text>
          </Group>
          <Text fw={600} size="sm" lineClamp={1} dir="ltr" ta="start">
            {value}
          </Text>
          {sub && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {sub}
            </Text>
          )}
        </motion.div>
      ))}
    </SimpleGrid>
  );
}

const FIT_STYLE: Record<FitLevel, { color: string; en: string; he: string }> = {
  gpu: { color: "teal", en: "Runs fast", he: "רץ מהר" },
  cpu: { color: "blue", en: "Runs on CPU", he: "רץ על המעבד" },
  tight: { color: "yellow", en: "Slow", he: "איטי" },
  no: { color: "red", en: "Too big", he: "גדול מדי" },
};

function PullStatus({ name }: { name: string }) {
  const t = useT();
  const pull = useOllama((state) => state.pulls[name]);
  if (!pull) return null;
  if (pull.error) {
    return (
      <Text size="xs" c="red" lineClamp={2}>
        {pull.error}
      </Text>
    );
  }
  const percent = pull.total ? Math.round(((pull.completed || 0) / pull.total) * 100) : 0;
  return (
    <Stack gap={4} mt={6}>
      <Progress value={pull.done ? 100 : percent} animated={!pull.done} size="sm" radius="xl" />
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {pull.done ? t("Installed", "הותקן") : pull.status}
        </Text>
        {!pull.done && (
          <Text size="xs" c="dimmed">
            {percent}%
          </Text>
        )}
      </Group>
    </Stack>
  );
}

export default function LocalModelsPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [hw, setHw] = useState<HardwareInfo>();
  const [filter, setFilter] = useState<"all" | ModelTag>("all");
  const [custom, setCustom] = useState("");
  const reachable = useOllama((state) => state.reachable);
  const installed = useOllama((state) => state.installed);
  const pulls = useOllama((state) => state.pulls);

  useEffect(() => {
    detectHardware().then(setHw);
    checkOllama();
  }, []);

  const recommendations = useMemo(() => (hw ? recommendModels(hw) : []), [hw]);
  const installedNames = new Set(installed.map((m) => m.name));
  const shown = recommendations
    .filter((r) => filter === "all" || r.model.tags.includes(filter))
    .filter((r) => !compact || r.fit === "gpu" || r.fit === "cpu")
    .slice(0, compact ? 6 : undefined);

  return (
    <Stack gap="lg">
      <div>
        <Group justify="space-between" mb="sm">
          <Text fw={600}>{t("Your computer", "המחשב שלך")}</Text>
          {hw?.source === "browser" && (
            <Badge variant="light" color="yellow">
              {t("Browser estimate", "הערכת דפדפן")}
            </Badge>
          )}
        </Group>
        <HardwareCard hw={hw} />
      </div>

      <AnimatePresence mode="wait">
        {reachable === false && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Alert
              color="yellow"
              variant="light"
              icon={<IconAlertCircle size={18} />}
              title={t("Ollama is not running", "Ollama לא פועל")}
            >
              <Text size="sm" mb={6}>
                {t(
                  "Install Ollama from ollama.com, then start it so this site can reach it:",
                  "התקן את Ollama מ־ollama.com והפעל אותו כך שהאתר יוכל להתחבר אליו:"
                )}
              </Text>
              <Code block dir="ltr">
                {`OLLAMA_ORIGINS=${typeof window !== "undefined" ? window.location.origin : "*"} ollama serve`}
              </Code>
              <Button
                mt="sm"
                size="xs"
                variant="light"
                leftSection={<IconRefresh size={14} />}
                onClick={() => checkOllama()}
              >
                {t("Check again", "בדיקה חוזרת")}
              </Button>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Group gap={8}>
            <Text fw={600}>{t("Recommended for you", "מומלצים בשבילך")}</Text>
            {reachable === undefined && <Loader size="xs" type="dots" />}
          </Group>
          {!compact && (
            <SegmentedControl
              size="xs"
              radius="md"
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              data={[
                { value: "all", label: t("All", "הכול") },
                { value: "chat", label: t("Chat", "צ'אט") },
                { value: "code", label: t("Code", "קוד") },
                { value: "reasoning", label: t("Reasoning", "חשיבה") },
                { value: "vision", label: t("Vision", "תמונות") },
              ]}
            />
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {shown.map(({ model, fit, best }) => {
            const isInstalled = installedNames.has(model.id) || installedNames.has(`${model.id}:latest`);
            const pulling = !!pulls[model.id] && !pulls[model.id].done && !pulls[model.id].error;
            const style = FIT_STYLE[fit];
            return (
              <motion.div
                key={model.id}
                layout
                className={classes.model}
                data-best={best || undefined}
                data-disabled={fit === "no" || undefined}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600} size="sm" dir="ltr">
                        {model.family} <Text span c="dimmed" size="sm">{model.params}</Text>
                      </Text>
                      {best && (
                        <Badge size="xs" variant="gradient" gradient={{ from: "brand.6", to: "cyan.5" }}>
                          {t("Best fit", "הכי מתאים")}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {model.description}
                    </Text>
                  </div>
                  {isInstalled ? (
                    <Tooltip label={t("Use this model", "שימוש במודל")}>
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => selectModel(installed.find((m) => m.name.startsWith(model.id))?.name || model.id, "ollama")}
                      >
                        {t("Use", "שימוש")}
                      </Button>
                    </Tooltip>
                  ) : pulling ? (
                    <ActionIcon variant="light" color="red" onClick={() => cancelPull(model.id)} aria-label="Cancel">
                      <IconX size={16} />
                    </ActionIcon>
                  ) : (
                    <Button
                      size="xs"
                      variant={best ? "filled" : "light"}
                      leftSection={<IconDownload size={14} />}
                      disabled={fit === "no" || reachable === false}
                      onClick={() => pullModel(model.id)}
                    >
                      {model.sizeGB} GB
                    </Button>
                  )}
                </Group>
                <Group gap={6} mt={8}>
                  <Badge size="xs" variant="dot" color={style.color}>
                    {t(style.en, style.he)}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {t("needs", "דורש")} ~{requiredMemoryGB(model)} GB
                  </Text>
                </Group>
                <PullStatus name={model.id} />
              </motion.div>
            );
          })}
        </SimpleGrid>
      </div>

      {!compact && (
        <>
          <div>
            <Text fw={600} mb="xs">
              {t("Any other model", "כל מודל אחר")}
            </Text>
            <Group gap="xs" align="flex-start">
              <TextInput
                flex={1}
                dir="ltr"
                placeholder="e.g. mistral-nemo:12b"
                value={custom}
                onChange={(e) => setCustom(e.currentTarget.value)}
                description={t("Any tag from ollama.com/library", "כל תג מ־ollama.com/library")}
              />
              <Button
                leftSection={<IconDownload size={15} />}
                disabled={!custom.trim() || reachable === false}
                onClick={() => {
                  pullModel(custom.trim());
                  setCustom("");
                }}
              >
                {t("Download", "הורדה")}
              </Button>
            </Group>
            {Object.keys(pulls)
              .filter((name) => !recommendations.some((r) => r.model.id === name))
              .map((name) => (
                <div key={name} className={classes.model} style={{ marginTop: 8 }}>
                  <Text size="sm" fw={600} dir="ltr">
                    {name}
                  </Text>
                  <PullStatus name={name} />
                </div>
              ))}
          </div>

          {installed.length > 0 && (
            <div>
              <Text fw={600} mb="xs">
                {t("Installed models", "מודלים מותקנים")}
              </Text>
              <Stack gap={6}>
                {installed.map((m) => (
                  <Group key={m.name} justify="space-between" className={classes.installed}>
                    <Text size="sm" dir="ltr">
                      {m.name} <Text span size="xs" c="dimmed">{formatGB(m.size)}</Text>
                    </Text>
                    <Group gap={4}>
                      <Button size="compact-xs" variant="light" onClick={() => selectModel(m.name, "ollama")}>
                        {t("Use", "שימוש")}
                      </Button>
                      <ActionIcon size="sm" color="red" variant="subtle" onClick={() => deleteModel(m.name)} aria-label="Delete">
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </div>
          )}
        </>
      )}
    </Stack>
  );
}
