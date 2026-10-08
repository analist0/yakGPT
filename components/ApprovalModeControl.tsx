import { SegmentedControl, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useChatStore } from "@/stores/ChatStore";
import { ApprovalMode, setApprovalMode } from "@/stores/Approval";
import { useT } from "@/lib/i18n";

export default function ApprovalModeControl({ withDescription = true }: { withDescription?: boolean }) {
  const t = useT();
  const mode = useChatStore((state) => state.approvalMode);

  const descriptions: Record<ApprovalMode, string> = {
    normal: t(
      "Tools that only read run on their own. Anything that changes something asks first.",
      "כלים שרק קוראים רצים לבד. כל דבר שמשנה משהו מבקש אישור."
    ),
    medium: t(
      "Reads and reversible changes run on their own. Deleting, sending, paying or publishing asks first.",
      "קריאה ושינויים הפיכים רצים לבד. מחיקה, שליחה, תשלום או פרסום מבקשים אישור."
    ),
    free: t(
      "Everything runs without asking. Tools you set to “Ask” still ask.",
      "הכול רץ בלי לשאול. כלים שהגדרת „לשאול” עדיין ישאלו."
    ),
  };

  return (
    <div>
      <SegmentedControl
        fullWidth
        size="xs"
        value={mode}
        onChange={(value) => {
          setApprovalMode(value as ApprovalMode);
          if (value === "free") {
            notifications.show({
              color: "yellow",
              title: t("Free driving", "נהיגה חופשית"),
              message: t(
                "The model can now delete, send and change things without asking you.",
                "המודל יכול עכשיו למחוק, לשלוח ולשנות דברים בלי לשאול אותך."
              ),
            });
          }
        }}
        data={[
          { value: "normal", label: t("Normal", "רגיל") },
          { value: "medium", label: t("Medium", "בינוני") },
          { value: "free", label: t("Free driving", "נהיגה חופשית") },
        ]}
        color={mode === "free" ? "orange" : mode === "medium" ? "yellow" : "teal"}
      />
      {withDescription && (
        <Text size="xs" c="dimmed" mt={6} maw={260}>
          {descriptions[mode]}
        </Text>
      )}
    </div>
  );
}
