import { memo, useState } from "react";
import { motion } from "motion/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconPencil, IconRefresh, IconTrash } from "@tabler/icons-react";
import { Message } from "@/stores/Message";
import { delMessage, regenerateAssistantMessage, setEditingMessage } from "@/stores/ChatActions";
import { useT } from "@/lib/i18n";
import { LogoMark } from "@/components/Logo";
import MessageContent from "./MessageContent";
import classes from "./MessageBubble.module.css";

function MessageBubble({
  message,
  showAvatar,
  showActions = true,
}: {
  message: Message;
  showAvatar: boolean;
  showActions?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <motion.div
      className={classes.row}
      data-role={message.role}
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {!isUser && (
        <div className={classes.avatar} data-hidden={!showAvatar || undefined}>
          <LogoMark size={30} />
        </div>
      )}
      <div className={classes.body}>
        <div className={isUser ? classes.userBubble : classes.assistant}>
          <MessageContent message={message} />
        </div>
        {showActions && !message.loading && message.role !== "system" && (
          <div className={classes.actions}>
            {message.content && (
              <Tooltip label={copied ? t("Copied", "הועתק") : t("Copy", "העתקה")}>
                <ActionIcon size="sm" color="gray" onClick={copy}>
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
            {isUser ? (
              <Tooltip label={t("Edit", "עריכה")}>
                <ActionIcon size="sm" color="gray" onClick={() => setEditingMessage(message)}>
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Tooltip label={t("Regenerate", "יצירה מחדש")}>
                <ActionIcon size="sm" color="gray" onClick={() => regenerateAssistantMessage(message)}>
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("Delete", "מחיקה")}>
              <ActionIcon size="sm" color="gray" onClick={() => delMessage(message)}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(MessageBubble);
