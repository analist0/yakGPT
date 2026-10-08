import { Modal, ScrollArea } from "@mantine/core";
import { closeModal, useUi } from "@/stores/Ui";
import { useT } from "@/lib/i18n";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProvidersPanel from "./ProvidersPanel";
import SettingsPanel from "./SettingsPanel";
import ToolsPanel from "./ToolsPanel";
import LocalModelsPanel from "./LocalModelsPanel";
import ErrorLogPanel from "./ErrorLogPanel";

export default function AppModals() {
  const t = useT();
  const modal = useUi((state) => state.modal);
  const tab = useUi((state) => state.tab);

  const titles = {
    keys: t("Providers & keys", "ספקים ומפתחות"),
    settings: t("Settings", "הגדרות"),
    tools: t("Tools, skills & MCP", "כלים, סקילים ו־MCP"),
    models: t("Local models", "מודלים מקומיים"),
    errors: t("Error log", "יומן שגיאות"),
  };

  return (
    <Modal
      opened={!!modal}
      onClose={closeModal}
      title={modal ? titles[modal] : ""}
      size={modal === "settings" ? "lg" : "xl"}
      scrollAreaComponent={ScrollArea.Autosize}
      styles={{ title: { fontWeight: 700, fontSize: "1.1rem" } }}
    >
      <ErrorBoundary inline>
        {modal === "keys" && <ProvidersPanel />}
        {modal === "settings" && <SettingsPanel close={closeModal} />}
        {modal === "tools" && <ToolsPanel defaultTab={tab} />}
        {modal === "models" && <LocalModelsPanel />}
        {modal === "errors" && <ErrorLogPanel />}
      </ErrorBoundary>
    </Modal>
  );
}
