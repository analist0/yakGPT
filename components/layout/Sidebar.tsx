import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from "motion/react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconBug,
  IconCheck,
  IconCpu,
  IconKey,
  IconMessageCircle,
  IconPencil,
  IconPlugConnected,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { clearChats, deleteChat, setNavOpened, updateChat } from "@/stores/ChatActions";
import { useErrorLog } from "@/stores/ErrorLog";
import { openModal, ModalId } from "@/stores/Ui";
import { useT } from "@/lib/i18n";
import { Chat } from "@/stores/Chat";
import Logo from "@/components/Logo";
import classes from "./Sidebar.module.css";

type Group = { key: string; label: string; chats: Chat[] };

const DAY = 24 * 60 * 60 * 1000;

function ChatRow({ chat, active }: { chat: Chat; active: boolean }) {
  const t = useT();
  const router = useRouter();
  const isSmall = useMediaQuery("(max-width: 48em)");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (title.trim()) updateChat({ id: chat.id, title: title.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        size="xs"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={save}
        className={classes.renameInput}
      />
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <UnstyledButton
        className={classes.chatRow}
        data-active={active || undefined}
        onClick={() => {
          router.push(`/chat/${chat.id}`);
          if (isSmall) setNavOpened(false);
        }}
      >
        <IconMessageCircle size={16} stroke={1.6} className={classes.chatIcon} />
        <Text size="sm" truncate className={classes.chatTitle}>
          {chat.title || chat.chosenCharacter || t("New chat", "שיחה חדשה")}
        </Text>
        <div className={classes.chatActions} onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <>
              <ActionIcon
                size="sm"
                color="red"
                variant="light"
                aria-label={t("Confirm delete", "אישור מחיקה")}
                onClick={() => {
                  deleteChat(chat.id);
                  if (active) router.push("/");
                }}
              >
                <IconCheck size={14} />
              </ActionIcon>
              <ActionIcon size="sm" color="gray" onClick={() => setConfirmDelete(false)}>
                <IconX size={14} />
              </ActionIcon>
            </>
          ) : (
            <>
              <Tooltip label={t("Rename", "שינוי שם")}>
                <ActionIcon
                  size="sm"
                  color="gray"
                  onClick={() => {
                    setTitle(chat.title || "");
                    setEditing(true);
                  }}
                >
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Delete", "מחיקה")}>
                <ActionIcon size="sm" color="gray" onClick={() => setConfirmDelete(true)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </div>
      </UnstyledButton>
    </motion.div>
  );
}

function NavItem({
  icon: Icon,
  label,
  modal,
  badge,
}: {
  icon: typeof IconKey;
  label: string;
  modal: ModalId;
  badge?: number;
}) {
  const isSmall = useMediaQuery("(max-width: 48em)");
  return (
    <UnstyledButton
      className={classes.navItem}
      onClick={() => {
        openModal(modal);
        if (isSmall) setNavOpened(false);
      }}
    >
      <Icon size={18} stroke={1.6} />
      <span>{label}</span>
      {!!badge && (
        <Badge size="xs" color="red" variant="filled" circle className={classes.badge}>
          {badge > 99 ? "99+" : badge}
        </Badge>
      )}
    </UnstyledButton>
  );
}

export default function Sidebar() {
  const t = useT();
  const router = useRouter();
  const activeChatId = router.query.chatId as string | undefined;
  const chats = useChatStore((state) => state.chats);
  const unreadErrors = useErrorLog((state) => state.unread);
  const isSmall = useMediaQuery("(max-width: 48em)");
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  // Date buckets are relative to when the sidebar mounted
  const [now] = useState(() => Date.now());

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = chats.filter(
      (c) =>
        !q ||
        (c.title || "").toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const buckets: Group[] = [
      { key: "today", label: t("Today", "היום"), chats: [] },
      { key: "yesterday", label: t("Yesterday", "אתמול"), chats: [] },
      { key: "week", label: t("Previous 7 days", "7 הימים האחרונים"), chats: [] },
      { key: "older", label: t("Older", "ישן יותר"), chats: [] },
    ];
    [...filtered].reverse().forEach((chat) => {
      const time = chat.createdAt ? new Date(chat.createdAt).getTime() : 0;
      if (time >= startOfToday) buckets[0].chats.push(chat);
      else if (time >= startOfToday - DAY) buckets[1].chats.push(chat);
      else if (time >= now - 7 * DAY) buckets[2].chats.push(chat);
      else buckets[3].chats.push(chat);
    });
    return buckets.filter((b) => b.chats.length > 0);
  }, [chats, query, t, now]);

  return (
    <div className={classes.root}>
      <Group justify="space-between" className={classes.brand}>
        <Logo />
        {isSmall && (
          <ActionIcon color="gray" onClick={() => setNavOpened(false)} aria-label="Close">
            <IconX size={18} />
          </ActionIcon>
        )}
      </Group>

      <Button
        fullWidth
        size="md"
        leftSection={<IconPlus size={18} />}
        variant="gradient"
        gradient={{ from: "brand.6", to: "violet.5", deg: 135 }}
        className={classes.newChat}
        onClick={() => {
          router.push("/");
          if (isSmall) setNavOpened(false);
        }}
      >
        {t("New chat", "שיחה חדשה")}
      </Button>

      <TextInput
        placeholder={t("Search chats…", "חיפוש בשיחות…")}
        leftSection={<IconSearch size={15} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        size="sm"
        className={classes.search}
        variant="filled"
      />

      <ScrollArea className={classes.list} type="hover" scrollbarSize={6}>
        <AnimatePresence initial={false}>
          {groups.map((group) => (
            <motion.div key={group.key} layout>
              <Text className={classes.groupLabel}>{group.label}</Text>
              <AnimatePresence initial={false}>
                {group.chats.map((chat) => (
                  <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} />
                ))}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        {groups.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            {query ? t("No matching chats", "לא נמצאו שיחות") : t("No chats yet", "עדיין אין שיחות")}
          </Text>
        )}
      </ScrollArea>

      <div className={classes.footer}>
        <NavItem icon={IconCpu} label={t("Local models", "מודלים מקומיים")} modal="models" />
        <NavItem icon={IconPlugConnected} label={t("Tools, skills & MCP", "כלים, סקילים ו־MCP")} modal="tools" />
        <NavItem icon={IconKey} label={t("Providers & keys", "ספקים ומפתחות")} modal="keys" />
        <NavItem icon={IconSettings} label={t("Settings", "הגדרות")} modal="settings" />
        <NavItem icon={IconBug} label={t("Error log", "יומן שגיאות")} modal="errors" badge={unreadErrors} />
        {chats.length > 0 && (
          <UnstyledButton
            className={classes.navItem}
            data-danger={confirmClear || undefined}
            onBlur={() => setConfirmClear(false)}
            onClick={() => {
              if (confirmClear) {
                clearChats();
                router.push("/");
                setConfirmClear(false);
              } else setConfirmClear(true);
            }}
          >
            {confirmClear ? <IconCheck size={18} /> : <IconTrash size={18} stroke={1.6} />}
            <span>
              {confirmClear
                ? t("Click again to delete all", "לחץ שוב למחיקת הכול")
                : t("Clear all chats", "מחיקת כל השיחות")}
            </span>
          </UnstyledButton>
        )}
      </div>
    </div>
  );
}
