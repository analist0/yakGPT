import { useState } from "react";
import { Modal } from "@mantine/core";
import { useT } from "@/lib/i18n";
import StoredImage from "./StoredImage";
import classes from "./MessageImages.module.css";

export default function MessageImages({ ids }: { ids: string[] }) {
  const t = useT();
  const [open, setOpen] = useState<string>();

  return (
    <>
      <div className={classes.grid} data-single={ids.length === 1 || undefined}>
        {ids.map((id, i) => (
          <StoredImage
            key={id}
            id={id}
            alt={t(`Attached image ${i + 1}`, `תמונה מצורפת ${i + 1}`)}
            className={classes.image}
            onClick={() => setOpen(id)}
          />
        ))}
      </div>
      <Modal
        opened={!!open}
        onClose={() => setOpen(undefined)}
        size="auto"
        centered
        withCloseButton={false}
        padding={0}
        radius="lg"
      >
        {open && (
          <StoredImage id={open} className={classes.full} onClick={() => setOpen(undefined)} />
        )}
      </Modal>
    </>
  );
}
