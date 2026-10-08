import { Component, ReactNode } from "react";
import { Button, Code, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { captureError } from "@/stores/ErrorLog";

interface Props {
  children: ReactNode;
  // Compact fallback for a single region instead of the whole page
  inline?: boolean;
}

interface State {
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureError("ui", error, { details: info.componentStack || undefined });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Stack
        align="center"
        justify="center"
        gap="sm"
        p="xl"
        style={{ minHeight: this.props.inline ? 120 : "60vh", textAlign: "center" }}
      >
        <IconAlertTriangle size={36} color="var(--mantine-color-red-5)" />
        <Title order={4}>Something went wrong · משהו השתבש</Title>
        <Code block style={{ maxWidth: 560, direction: "ltr", textAlign: "left" }}>
          {error.message}
        </Code>
        <Text size="sm" c="dimmed">
          The error was saved to the error log · השגיאה נשמרה ביומן השגיאות
        </Text>
        <Button variant="light" onClick={() => this.setState({ error: undefined })}>
          Try again · נסה שוב
        </Button>
      </Stack>
    );
  }
}
