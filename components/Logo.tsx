import { Group, Text } from "@mantine/core";
import { useT } from "@/lib/i18n";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="hamal-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7862fd" />
          <stop offset="0.55" stopColor="#5a8bff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#hamal-logo)" />
      <path
        d="M9 10.5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2h-5.2L12 23v-3.5h-1a2 2 0 0 1-2-2v-7Z"
        fill="#fff"
        fillOpacity="0.95"
      />
      <circle cx="13" cy="14" r="1.3" fill="#5a3dfe" />
      <circle cx="16" cy="14" r="1.3" fill="#5a3dfe" />
      <circle cx="19" cy="14" r="1.3" fill="#5a3dfe" />
    </svg>
  );
}

export default function Logo() {
  const t = useT();
  return (
    <Group gap={10} wrap="nowrap">
      <LogoMark />
      <Text fw={700} size="lg" style={{ letterSpacing: "-0.01em" }}>
        {t("Ha", "")}
        <span className="gradient-text">{t("mal", "חמ״ל")}</span>
      </Text>
    </Group>
  );
}
