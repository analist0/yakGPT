import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from "motion/react";
import { ActionIcon } from "@mantine/core";
import { IconArrowDown } from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { setActiveChatId } from "@/stores/ChatActions";
import ErrorBoundary from "@/components/ErrorBoundary";
import MessageBubble from "./MessageBubble";
import NewChat from "./NewChat";
import Composer from "./Composer";
import SummaryDivider from "./SummaryDivider";
import classes from "./ChatView.module.css";

const nearBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;

export default function ChatView() {
  const router = useRouter();
  const chatId = router.query.chatId as string | undefined;
  const chat = useChatStore((state) => state.chats.find((c) => c.id === chatId));
  const [atBottom, setAtBottom] = useState(true);
  const stickToBottom = useRef(true);

  useEffect(() => {
    setActiveChatId(chatId);
  }, [chatId]);

  useEffect(() => {
    const onScroll = () => {
      const bottom = nearBottom();
      stickToBottom.current = bottom;
      setAtBottom(bottom);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const last = chat?.messages[chat.messages.length - 1];
  // Follow streaming output only while the user is at the bottom
  useEffect(() => {
    if (chatId && stickToBottom.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [chatId, chat?.messages.length, last?.content, last?.toolCalls, last?.reasoning]);

  useEffect(() => {
    stickToBottom.current = true;
    window.scrollTo({ top: chatId ? document.documentElement.scrollHeight : 0 });
  }, [chatId]);

  return (
    <div className={classes.root}>
      <div className={classes.content}>
        {!chatId || !chat ? (
          <NewChat />
        ) : (
          <div className={classes.messages}>
            {chat.messages.map((message, index) => (
              <ErrorBoundary inline key={message.id}>
                <MessageBubble
                  message={message}
                  // One avatar per run of assistant steps
                  showAvatar={chat.messages[index - 1]?.role !== message.role}
                  // Actions go on the last step of an assistant run
                  showActions={
                    message.role !== "assistant" ||
                    chat.messages[index + 1]?.role !== "assistant"
                  }
                />
                {chat.summary?.throughId === message.id && (
                  <SummaryDivider summary={chat.summary} />
                )}
              </ErrorBoundary>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {!atBottom && chat && (
          <motion.div
            className={classes.scrollButton}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <ActionIcon
              size="lg"
              radius="xl"
              variant="default"
              onClick={() =>
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })
              }
              aria-label="Scroll to bottom"
            >
              <IconArrowDown size={18} />
            </ActionIcon>
          </motion.div>
        )}
      </AnimatePresence>

      <Composer />
    </div>
  );
}
