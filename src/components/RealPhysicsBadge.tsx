import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  alt?: string;
};

/**
 * Shelved. Not mounted anywhere. Put it back by rendering this component.
 * Swap the art by replacing public/brand/real-physics-badge.svg.
 * Keep a square viewBox so the slot does not shift.
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
