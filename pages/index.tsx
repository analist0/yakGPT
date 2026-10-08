import ChatDisplay from "@/components/ChatDisplay";
import Hero from "@/components/Hero";
import { useChatStore } from "@/stores/ChatStore";
import { isProviderConfigured } from "@/stores/Providers";

export default function Home() {
  const chatConfigured = useChatStore(isProviderConfigured);

  return chatConfigured ? <ChatDisplay /> : <Hero />;
}
