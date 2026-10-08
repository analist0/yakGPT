import { useEffect, useSyncExternalStore } from "react";
import { Loader } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getLoadedImage, loadImage, subscribeImages } from "@/lib/images";
import classes from "./StoredImage.module.css";

// undefined while loading, null when the image is gone
export const useImageUrl = (id: string) => {
  const url = useSyncExternalStore(
    subscribeImages,
    () => getLoadedImage(id),
    () => undefined
  );
  useEffect(() => {
    loadImage(id).catch(() => {});
  }, [id]);
  return url;
};

export default function StoredImage({
  id,
  alt = "",
  className,
  onClick,
}: {
  id: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}) {
  const url = useImageUrl(id);
  if (url === undefined) {
    return (
      <div className={`${classes.placeholder} ${className || ""}`}>
        <Loader size="xs" />
      </div>
    );
  }
  if (url === null) {
    return (
      <div className={`${classes.placeholder} ${className || ""}`}>
        <IconPhotoOff size={18} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={`${classes.image} ${className || ""}`}
      onClick={onClick}
      data-clickable={!!onClick || undefined}
      draggable={false}
    />
  );
}
