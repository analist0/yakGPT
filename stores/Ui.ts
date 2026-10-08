// Runtime-only UI state: which modal is open and on which tab
import { create } from "zustand";

export type ModalId = "keys" | "settings" | "tools" | "models" | "errors";

interface UiState {
  modal: ModalId | null;
  tab?: string;
}

export const useUi = create<UiState>()(() => ({ modal: null }));

export const openModal = (modal: ModalId, tab?: string) =>
  useUi.setState({ modal, tab });

export const closeModal = () => useUi.setState({ modal: null, tab: undefined });
