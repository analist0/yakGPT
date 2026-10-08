import { createTheme, MantineColorsTuple, rem } from "@mantine/core";

// Violet-indigo brand, tuned for both schemes
const brand: MantineColorsTuple = [
  "#f1efff",
  "#dfdbff",
  "#bcb3ff",
  "#9787fe",
  "#7862fd",
  "#6449fd",
  "#5a3dfe",
  "#4a2fe3",
  "#4128cb",
  "#341fb3",
];

// Deep graphite with a hint of blue for dark mode surfaces
const dark: MantineColorsTuple = [
  "#d5d7e6",
  "#a9adc4",
  "#7f84a0",
  "#5b6080",
  "#3d4160",
  "#2a2d45",
  "#1d2034",
  "#151726",
  "#0f111c",
  "#0a0b14",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  colors: { brand, dark },
  fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
  fontFamilyMonospace:
    "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: { fontFamily: "var(--font-sans), system-ui, sans-serif", fontWeight: "700" },
  defaultRadius: "md",
  cursorType: "pointer",
  autoContrast: true,
  radius: { xs: rem(6), sm: rem(8), md: rem(12), lg: rem(16), xl: rem(24) },
  shadows: {
    md: "0 8px 30px -12px rgba(15, 17, 40, 0.25)",
    lg: "0 20px 50px -20px rgba(15, 17, 40, 0.35)",
  },
  components: {
    Modal: {
      defaultProps: {
        radius: "lg",
        centered: true,
        overlayProps: { backgroundOpacity: 0.45, blur: 6 },
        transitionProps: { transition: "pop", duration: 220 },
      },
    },
    Menu: {
      defaultProps: {
        radius: "md",
        shadow: "lg",
        transitionProps: { transition: "pop", duration: 160 },
      },
    },
    Tooltip: {
      defaultProps: { withArrow: true, openDelay: 250, transitionProps: { transition: "fade", duration: 150 } },
    },
    Button: { defaultProps: { radius: "md" } },
    ActionIcon: { defaultProps: { radius: "md", variant: "subtle" } },
    TextInput: { defaultProps: { radius: "md" } },
    PasswordInput: { defaultProps: { radius: "md" } },
    Select: { defaultProps: { radius: "md" } },
    Notification: { defaultProps: { radius: "md" } },
  },
});
