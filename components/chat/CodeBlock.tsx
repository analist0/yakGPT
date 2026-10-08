import { useState } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import classes from "./CodeBlock.module.css";

export default function CodeBlock({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const language = className?.match(/(?:^|\s)lang(?:uage)?-(\S+)/)?.[1];

  // No language and a single line: inline code
  if (!language && !code.includes("\n")) {
    return <code>{code}</code>;
  }

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Text size="xs" className={classes.lang}>
          {language || "text"}
        </Text>
        <Tooltip label={copied ? "Copied" : "Copy"}>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={copy} aria-label="Copy code">
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, background: "transparent", padding: "14px 16px", fontSize: "0.85rem" }}
        codeTagProps={{ style: { fontFamily: "var(--mantine-font-family-monospace)" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
