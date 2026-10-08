import { memo, useState } from "react";
import Markdown from "markdown-to-jsx";
import { Button, Collapse, Group, Loader, Text, UnstyledButton } from "@mantine/core";
import {
  IconBan,
  IconBrain,
  IconCheck,
  IconChevronDown,
  IconHandStop,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import { resolveApproval, setToolRule } from "@/stores/Approval";
import { Message, ToolCall } from "@/stores/Message";
import { useT } from "@/lib/i18n";
import CodeBlock from "./CodeBlock";
import MessageImages from "./MessageImages";
import classes from "./MessageContent.module.css";

const PassThrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const markdownOptions = {
  forceBlock: true,
  overrides: {
    pre: { component: PassThrough },
    code: { component: CodeBlock },
  },
};

// Reasoning models (e.g. Qwen 3, DeepSeek R1 on Ollama) put thinking in <think> tags
export const splitThinking = (content: string) => {
  const match = content.match(/^\s*<think>([\s\S]*?)(<\/think>|$)([\s\S]*)$/);
  if (!match) return { thinking: "", answer: content, thinkingDone: true };
  return { thinking: match[1].trim(), answer: match[3], thinkingDone: !!match[2] };
};

const closeOpenFences = (text: string) =>
  (text.match(/```/g) || []).length % 2 === 0 ? text : text + "\n```";

export const MarkdownText = memo(function MarkdownText({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <div className={`markdown ${streaming ? "streaming" : ""}`}>
      <Markdown options={markdownOptions}>{closeOpenFences(text)}</Markdown>
    </div>
  );
});

function Expandable({
  icon,
  title,
  active,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={classes.expandable} data-active={active || undefined}>
      <UnstyledButton className={classes.expandHeader} onClick={() => setOpen((o) => !o)}>
        <Group gap={8} wrap="nowrap">
          {icon}
          <Text size="sm" fw={500} className={classes.expandTitle}>
            {title}
          </Text>
        </Group>
        <IconChevronDown size={14} className={classes.chevron} data-open={open || undefined} />
      </UnstyledButton>
      <Collapse expanded={open} transitionDuration={220}>
        <div className={classes.expandBody}>{children}</div>
      </Collapse>
    </div>
  );
}

function ToolCallView({ call }: { call: ToolCall }) {
  const t = useT();
  const icon =
    call.status === "running" ? (
      <Loader size={14} type="oval" />
    ) : call.status === "pending" ? (
      <IconHandStop size={15} color="var(--mantine-color-yellow-5)" />
    ) : call.status === "denied" ? (
      <IconBan size={15} color="var(--mantine-color-gray-5)" />
    ) : call.status === "error" ? (
      <IconX size={15} color="var(--mantine-color-red-5)" />
    ) : (
      <IconCheck size={15} color="var(--mantine-color-teal-5)" />
    );
  let args = call.arguments;
  try {
    args = JSON.stringify(JSON.parse(call.arguments || "{}"), null, 2);
  } catch {}
  const pending = call.status === "pending";
  return (
    <div className={pending ? classes.approval : undefined}>
    <Expandable
      icon={
        <span className={classes.toolIcon}>
          <IconTool size={14} />
        </span>
      }
      active={call.status === "running" || pending}
      title={
        <Group gap={6} wrap="nowrap" component="span">
          {icon}
          <span className={classes.toolName}>{call.label || call.name}</span>
        </Group>
      }
    >
      <Text size="xs" c="dimmed" mb={4}>
        {t("Arguments", "פרמטרים")}
      </Text>
      <pre className={classes.pre}>{args}</pre>
      {call.result !== undefined && (
        <>
          <Text size="xs" c="dimmed" mt="sm" mb={4}>
            {t("Result", "תוצאה")}
          </Text>
          <pre className={classes.pre}>
            {call.result.length > 4000 ? call.result.slice(0, 4000) + "\n…" : call.result}
          </pre>
        </>
      )}
    </Expandable>
    {pending && (
      <div className={classes.approvalBar}>
        <Text size="xs" c="dimmed" className={classes.approvalArgs}>
          {t("Wants to run with:", "מבקש להריץ עם:")} <code>{call.arguments || "{}"}</code>
        </Text>
        <Group gap={6}>
          <Button size="compact-sm" color="teal" onClick={() => resolveApproval(call.id, true)}>
            {t("Approve", "אישור")}
          </Button>
          <Button
            size="compact-sm"
            variant="light"
            color="teal"
            onClick={() => {
              setToolRule(call.name, "auto");
              resolveApproval(call.id, true);
            }}
          >
            {t("Always allow this tool", "לאשר תמיד את הכלי הזה")}
          </Button>
          <Button size="compact-sm" variant="subtle" color="red" onClick={() => resolveApproval(call.id, false)}>
            {t("Decline", "דחייה")}
          </Button>
        </Group>
      </div>
    )}
    {call.subCalls?.length ? (
      <div className={classes.subCalls}>
        {call.subCalls.map((sub) => (
          <ToolCallView key={sub.id} call={sub} />
        ))}
      </div>
    ) : null}
    </div>
  );
}

export default function MessageContent({ message }: { message: Message }) {
  const t = useT();
  const { thinking, answer, thinkingDone } = splitThinking(message.content);
  const reasoning = [message.reasoning, thinking].filter(Boolean).join("\n\n");
  const isThinking = !!message.loading && (!thinkingDone || (!answer && !!message.reasoning));

  if (message.role === "system") {
    return (
      <Expandable
        icon={<IconBrain size={15} />}
        title={t("System prompt", "הנחיית מערכת")}
      >
        <MarkdownText text={message.content} />
      </Expandable>
    );
  }

  return (
    <>
      {message.images?.length ? <MessageImages ids={message.images} /> : null}
      {reasoning && (
        <Expandable
          icon={isThinking ? <Loader size={14} type="dots" /> : <IconBrain size={15} />}
          title={isThinking ? t("Thinking…", "חושב…") : t("Thought process", "תהליך חשיבה")}
          active={isThinking}
        >
          <div className={classes.reasoning}>
            <MarkdownText text={reasoning} />
          </div>
        </Expandable>
      )}
      {(answer.trim() || (message.loading && !reasoning && !message.toolCalls)) && (
        <MarkdownText text={answer} streaming={message.loading} />
      )}
      {message.toolCalls?.map((call) => (
        <ToolCallView key={call.id} call={call} />
      ))}
    </>
  );
}
