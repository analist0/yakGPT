import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/styles/globals.css";

import { useEffect, useSyncExternalStore } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import { JetBrains_Mono, Rubik } from "next/font/google";
import {
  DirectionProvider,
  Loader,
  MantineProvider,
  useDirection as useMantineDirection,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { theme } from "@/lib/theme";
import { useDirection } from "@/lib/i18n";
import { useChatStore } from "@/stores/ChatStore";
import { configuredProviders } from "@/stores/Providers";
import { initMonitoring } from "@/stores/ErrorLog";
import { startMcpServers } from "@/stores/Mcp";
import { checkOllama } from "@/stores/Ollama";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "@/components/layout/AppLayout";
import Welcome from "@/components/Welcome";

const sans = Rubik({
  subsets: ["latin", "hebrew"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Keeps Mantine and <html dir/lang> in sync with the chosen UI language
function DirectionSync() {
  const dir = useDirection();
  const { setDirection } = useMantineDirection();
  useEffect(() => {
    setDirection(dir);
    document.documentElement.dir = dir;
    document.documentElement.lang = dir === "rtl" ? "he" : "en";
  }, [dir, setDirection]);
  return null;
}

function Splash() {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <Loader type="dots" />
    </div>
  );
}

const noopSubscribe = () => () => {};

export default function App({ Component, pageProps }: AppProps) {
  // false while server rendering and hydrating, true afterwards: the persisted
  // store only exists in the browser
  const isHydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const onboardingDone = useChatStore((state) => state.onboardingDone);

  // Wait until the persisted store is loaded on the client
  useEffect(() => {
    // Fonts are applied on <html> so portals (modals, menus) get them too
    document.documentElement.classList.add(sans.variable, mono.variable);
    const stopMonitoring = initMonitoring();
    // Users who already set up a provider skip the setup wizard
    const state = useChatStore.getState();
    if (!state.onboardingDone && configuredProviders(state).length > 0) {
      useChatStore.setState({ onboardingDone: true });
    }
    startMcpServers();
    // Detect a running Ollama so local models work without setup
    checkOllama();
    return stopMonitoring;
  }, []);

  const showWelcome = !onboardingDone;

  return (
    <>
      <Head>
        <title>YakGPT</title>
        <meta name="description" content="A fast, private chat UI for every AI provider" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <DirectionProvider initialDirection="rtl" detectDirection={false}>
          <MantineProvider theme={theme} defaultColorScheme="dark">
            <DirectionSync />
            <Notifications position="top-center" limit={4} zIndex={4000} />
            <ErrorBoundary>
              {!isHydrated ? (
                <Splash />
              ) : showWelcome ? (
                <Welcome />
              ) : (
                <AppLayout>
                  <Component {...pageProps} />
                </AppLayout>
              )}
            </ErrorBoundary>
          </MantineProvider>
      </DirectionProvider>
    </>
  );
}
