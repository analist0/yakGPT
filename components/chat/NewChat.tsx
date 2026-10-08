import Image from "next/image";
import { useRouter } from "next/router";
import { v4 as uuidv4 } from "uuid";
import { motion } from "motion/react";
import { SimpleGrid, Text, Title, UnstyledButton } from "@mantine/core";
import {
  IconBulb,
  IconCode,
  IconLanguage,
  IconListDetails,
} from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { addChat, setChosenCharacter } from "@/stores/ChatActions";
import { submitMessage } from "@/stores/SubmitMessage";
import { characterPrompt, characters } from "@/lib/characters";
import { providers } from "@/stores/Providers";
import { getModelInfo } from "@/stores/Model";
import { useT } from "@/lib/i18n";
import { LogoMark } from "@/components/Logo";
import classes from "./NewChat.module.css";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function NewChat() {
  const t = useT();
  const router = useRouter();
  const provider = useChatStore((state) => state.chatProvider);
  const model = useChatStore((state) => state.settingsForm.model);

  const suggestions = [
    {
      icon: IconBulb,
      text: t("Give me 5 creative ideas for a weekend project", "תן לי 5 רעיונות יצירתיים לפרויקט לסוף השבוע"),
    },
    {
      icon: IconCode,
      text: t("Explain async/await in JavaScript with an example", "הסבר async/await ב־JavaScript עם דוגמה"),
    },
    {
      icon: IconLanguage,
      text: t("Translate to Hebrew: Good morning, how can I help?", "תרגם לאנגלית: בוקר טוב, איך אפשר לעזור?"),
    },
    {
      icon: IconListDetails,
      text: t("Plan a 3-day trip to Tel Aviv", "תכנן טיול של 3 ימים בצפון"),
    },
  ];

  const startWith = (content: string, role: "user" | "system", character?: string) => {
    addChat(router);
    if (character) setChosenCharacter(character);
    submitMessage({ id: uuidv4(), content, role });
  };

  return (
    <motion.div className={classes.root} variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className={classes.hero}>
        <div className={classes.logo}>
          <LogoMark size={56} />
        </div>
        <Title order={1} className={classes.title}>
          <span className="gradient-text">{t("How can I help today?", "במה אפשר לעזור היום?")}</span>
        </Title>
        <Text c="dimmed" size="sm" className={classes.subtitle}>
          {providers[provider].name} · <span dir="ltr">{getModelInfo(model).displayName}</span>
        </Text>
      </motion.div>

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" className={classes.suggestions}>
        {suggestions.map(({ icon: Icon, text }) => (
          <motion.div key={text} variants={item}>
            <UnstyledButton className={classes.suggestion} onClick={() => startWith(text, "user")}>
              <Icon size={18} className={classes.suggestionIcon} />
              <Text size="sm">{text}</Text>
            </UnstyledButton>
          </motion.div>
        ))}
      </SimpleGrid>

      <motion.div variants={item}>
        <Text className={classes.sectionLabel}>{t("Or talk to a persona", "או שוחח עם דמות")}</Text>
      </motion.div>
      <SimpleGrid cols={{ base: 2, xs: 3, md: 4 }} spacing="sm">
        {Object.entries(characters).map(([name, character]) => (
          <motion.div key={name} variants={item}>
            <UnstyledButton
              className={classes.persona}
              onClick={() => startWith(characterPrompt(name), "system", name)}
            >
              <Image
                src={character.avatar}
                alt={name}
                fill
                sizes="(max-width: 768px) 50vw, 220px"
                className={classes.personaImage}
              />
              <div className={classes.personaOverlay} />
              <div className={classes.personaText} dir="ltr">
                <Text fw={600} size="sm" c="white">
                  {name}
                </Text>
                <Text size="xs" c="gray.3" lineClamp={1}>
                  {character.shortDescription}
                </Text>
              </div>
            </UnstyledButton>
          </motion.div>
        ))}
      </SimpleGrid>
    </motion.div>
  );
}
