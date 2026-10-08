import { useState } from "react";
import { Collapse, Text, UnstyledButton } from "@mantine/core";
import { IconFold } from "@tabler/icons-react";
import { ChatSummary } from "@/stores/Compaction";
import { useT } from "@/lib/i18n";
import classes from "./SummaryDivider.module.css";

// Marks where context compaction summarized the messages above
export default function SummaryDivider({ summary }: { summary: ChatSummary }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={classes.root}>
      <UnstyledButton className={classes.line} onClick={() => setOpen((o) => !o)}>
        <IconFold size={14} />
        <Text size="xs" c="dimmed">
          {t(
            `The ${summary.count} messages above are sent to the model as a summary · ${open ? "hide" : "show"}`,
            `${summary.count} ההודעות שלמעלה נשלחות למודל כסיכום · ${open ? "הסתרה" : "הצגה"}`
          )}
        </Text>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Text size="sm" className={classes.text}>
          {summary.text}
        </Text>
      </Collapse>
    </div>
  );
}
