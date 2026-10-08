import { ReactNode } from "react";
import { AppShell } from "@mantine/core";
import { useChatStore } from "@/stores/ChatStore";
import { setNavOpened } from "@/stores/ChatActions";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AppModals from "@/components/modals/AppModals";
import AudioPlayer from "@/components/AudioPlayer";
import ErrorBoundary from "@/components/ErrorBoundary";
import classes from "./AppLayout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  const navOpened = useChatStore((state) => state.navOpened);
  const playerMode = useChatStore((state) => state.playerMode);

  return (
    <AppShell
      layout="alt"
      header={{ height: 60 }}
      navbar={{
        width: 290,
        breakpoint: "sm",
        collapsed: { mobile: !navOpened },
      }}
      padding={0}
      transitionDuration={260}
      transitionTimingFunction="cubic-bezier(0.22, 1, 0.36, 1)"
      classNames={{
        header: classes.header,
        navbar: classes.navbar,
        main: classes.main,
      }}
    >
      <AppShell.Header>
        <TopBar />
      </AppShell.Header>
      <AppShell.Navbar>
        <ErrorBoundary inline>
          <Sidebar />
        </ErrorBoundary>
      </AppShell.Navbar>
      <AppShell.Main>
        {/* Tap outside the drawer to close it on mobile */}
        {navOpened && (
          <div className={classes.scrim} onClick={() => setNavOpened(false)} />
        )}
        {children}
      </AppShell.Main>
      <AppModals />
      {playerMode && <AudioPlayer />}
    </AppShell>
  );
}
