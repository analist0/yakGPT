import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Group, Stepper, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconCloud, IconCpu, IconLanguage, IconRocket } from "@tabler/icons-react";
import { useChatStore } from "@/stores/ChatStore";
import { update } from "@/stores/ChatActions";
import { configuredProviders } from "@/stores/Providers";
import { useT, useDirection } from "@/lib/i18n";
import { LogoMark } from "@/components/Logo";
import LocalModelsPanel from "@/components/modals/LocalModelsPanel";
import { ChatProviderCards } from "@/components/modals/ProvidersPanel";
import AppModals from "@/components/modals/AppModals";
import classes from "./Welcome.module.css";

export default function Welcome() {
  const t = useT();
  const dir = useDirection();
  const [step, setStep] = useState(0);
  const uiLanguage = useChatStore((state) => state.uiLanguage);
  const ready = useChatStore((state) => configuredProviders(state).length > 0);
  const Next = dir === "rtl" ? IconArrowLeft : IconArrowRight;
  const Back = dir === "rtl" ? IconArrowRight : IconArrowLeft;

  const finish = () => update({ onboardingDone: true });

  return (
    <div className={classes.root}>
      <motion.div
        className={classes.card}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <Group gap="sm" mb="lg">
          <LogoMark size={40} />
          <div>
            <Title order={2} className={classes.title}>
              {t("Welcome to ", "ברוכים הבאים ל־")}
              <span className="gradient-text">{t("Hamal", "חמ״ל")}</span>
            </Title>
            <Text size="sm" c="dimmed">
              {t("Every AI model in one fast, private place", "כל מודלי הבינה המלאכותית במקום אחד, מהיר ופרטי")}
            </Text>
          </div>
        </Group>

        <Stepper active={step} onStepClick={setStep} size="sm" mb="xl" allowNextStepsSelect={false}>
          <Stepper.Step icon={<IconLanguage size={16} />} label={t("Language", "שפה")} />
          <Stepper.Step icon={<IconCpu size={16} />} label={t("Local models", "מודלים מקומיים")} />
          <Stepper.Step icon={<IconCloud size={16} />} label={t("Cloud providers", "ספקי ענן")} />
        </Stepper>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: dir === "rtl" ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir === "rtl" ? 24 : -24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={classes.stepBody}
          >
            {step === 0 && (
              <div>
                <Text mb="md">{t("Choose your language:", "בחר שפה:")}</Text>
                <Group grow>
                  {(["he", "en"] as const).map((lang) => (
                    <UnstyledButton
                      key={lang}
                      className={classes.langOption}
                      data-selected={uiLanguage === lang || undefined}
                      onClick={() => update({ uiLanguage: lang })}
                    >
                      <Text size="xl" fw={700}>
                        {lang === "he" ? "עברית" : "English"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {lang === "he" ? "ממשק מימין לשמאל" : "Left-to-right interface"}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Group>
              </div>
            )}
            {step === 1 && (
              <div>
                <Text size="sm" c="dimmed" mb="md">
                  {t(
                    "We checked your computer. These models run privately on it with Ollama — no internet or key needed.",
                    "בדקנו את המחשב שלך. המודלים האלה רצים אצלך באופן פרטי עם Ollama — בלי אינטרנט ובלי מפתח."
                  )}
                </Text>
                <LocalModelsPanel compact />
              </div>
            )}
            {step === 2 && (
              <div>
                <Text size="sm" c="dimmed" mb="md">
                  {t(
                    "Add a key for any provider you use. You can add or change them later.",
                    "הוסף מפתח לכל ספק שאתה משתמש בו. אפשר להוסיף ולשנות אחר כך."
                  )}
                </Text>
                <ChatProviderCards />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <Group justify="space-between" mt="xl">
          <Group gap="xs">
            {step > 0 && (
              <Button variant="subtle" color="gray" leftSection={<Back size={16} />} onClick={() => setStep(step - 1)}>
                {t("Back", "הקודם")}
              </Button>
            )}
            <Button variant="subtle" color="gray" onClick={finish}>
              {t("Skip setup", "דילוג")}
            </Button>
          </Group>
          {step < 2 ? (
            <Button rightSection={<Next size={16} />} onClick={() => setStep(step + 1)}>
              {t("Continue", "המשך")}
            </Button>
          ) : (
            <Button
              variant="gradient"
              gradient={{ from: "brand.6", to: "cyan.5", deg: 135 }}
              rightSection={<IconRocket size={16} />}
              onClick={finish}
              disabled={!ready}
            >
              {t("Start chatting", "בואו נתחיל")}
            </Button>
          )}
        </Group>
      </motion.div>
      <AppModals />
    </div>
  );
}
