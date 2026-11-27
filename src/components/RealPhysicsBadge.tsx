import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  alt?: string;
};

/**
 * “Real Physics!” sticker. Replace public/brand/real-physics-badge.svg
 * to swap the art. Keep a square viewBox so this slot does not shift.
 */
export function RealPhysicsBadge({ alt = "Real Physics!", className, ...rest }: Props) {
  const classes = className ? `real-physics-badge ${className}` : "real-physics-badge";
  return (
    <img
      className={classes}
      src="/brand/real-physics-badge.svg"
      alt={alt}
      width={200}
      height={200}
      {...rest}
    />
  );
}
