import { useState } from "react";
import { Collapse, Group, Progress, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconCircle, IconCircleCheckFilled, IconListCheck, IconLoader2 } from "@tabler/icons-react";
import { Plan } from "@/stores/Agent";
import { useT } from "@/lib/i18n";
import classes from "./PlanCard.module.css";

// The agent's task list (update_plan), shown at the end of the chat
export default function PlanCard({ plan }: { plan: Plan }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const done = plan.items.filter((i) => i.status === "done").length;
  const current = plan.items.find((i) => i.status === "in_progress");

  return (
    <div className={classes.card}>
      <UnstyledButton className={classes.header} onClick={() => setOpen((o) => !o)}>
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconListCheck size={16} />
          <Text size="sm" fw={600}>
            {t("Plan", "תוכנית")} · {done}/{plan.items.length}
          </Text>
          {!open && current && (
            <Text size="sm" c="dimmed" truncate>
              {current.text}
            </Text>
          )}
        </Group>
        <IconChevronDown size={14} className={classes.chevron} data-open={open || undefined} />
      </UnstyledButton>
      <Progress value={(done / plan.items.length) * 100} size={3} radius={0} />
      <Collapse expanded={open}>
        <ul className={classes.items}>
          {plan.items.map((item, i) => (
            <li key={i} data-status={item.status}>
              {item.status === "done" ? (
                <IconCircleCheckFilled size={16} className={classes.done} />
              ) : item.status === "in_progress" ? (
                <IconLoader2 size={16} className={classes.spin} />
              ) : (
                <IconCircle size={16} className={classes.pending} />
              )}
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
