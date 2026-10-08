// Central error log: every caught error goes through captureError so it shows up
// in the in-app error log, the console and (if configured) Sentry.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/browser";

export type ErrorSource =
  | "chat"
  | "network"
  | "voice"
  | "realtime"
  | "mcp"
  | "tools"
  | "models"
  | "ui"
  | "unhandled";

export interface ErrorEntry {
  id: string;
  time: string;
  source: ErrorSource;
  message: string;
  stack?: string;
  details?: string;
  url?: string;
}

const MAX_ENTRIES = 300;

interface ErrorLogState {
  entries: ErrorEntry[];
  unread: number;
}

export const useErrorLog = create<ErrorLogState>()(
  persist(() => ({ entries: [], unread: 0 }) as ErrorLogState, {
    name: "yakgpt-error-log",
  })
);

let sentryEnabled = false;

export const initMonitoring = () => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn && !sentryEnabled) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    });
    sentryEnabled = true;
  }

  const onError = (event: ErrorEvent) =>
    captureError("unhandled", event.error || event.message, {
      details: `${event.filename}:${event.lineno}:${event.colno}`,
    });
  const onRejection = (event: PromiseRejectionEvent) =>
    captureError("unhandled", event.reason);

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
};

const describe = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
};

export const captureError = (
  source: ErrorSource,
  error: unknown,
  extra: { details?: string } = {}
) => {
  const { message, stack } = describe(error);
  const entry: ErrorEntry = {
    id: uuidv4(),
    time: new Date().toISOString(),
    source,
    message,
    stack,
    details: extra.details,
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
  };
  console.error(`[${source}]`, error, extra.details || "");

  useErrorLog.setState((state) => ({
    entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    unread: state.unread + 1,
  }));

  if (sentryEnabled) {
    Sentry.withScope((scope) => {
      scope.setTag("source", source);
      if (extra.details) scope.setExtra("details", extra.details);
      Sentry.captureException(error instanceof Error ? error : new Error(message));
    });
  }
  return entry;
};

export const clearErrors = () => useErrorLog.setState({ entries: [], unread: 0 });

export const markErrorsRead = () => useErrorLog.setState({ unread: 0 });

export const exportErrors = () => {
  const { entries } = useErrorLog.getState();
  const report = {
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    entries,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yakgpt-errors-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
