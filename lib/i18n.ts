import { useCallback } from "react";
import { useChatStore } from "@/stores/ChatStore";

// UI strings are written inline in both languages: t("New chat", "שיחה חדשה")
export const useT = () => {
  const lang = useChatStore((state) => state.uiLanguage);
  return useCallback((en: string, he: string) => (lang === "he" ? he : en), [lang]);
};

export const useDirection = () =>
  useChatStore((state) => (state.uiLanguage === "he" ? "rtl" : "ltr"));
