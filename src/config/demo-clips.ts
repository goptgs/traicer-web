/**
 * Clip slots. Set `videoSrc` to a public mp4 and the player autoplays,
 * muted, on a loop. Leave it unset and the poster stays on screen.
 */
export type ClipSlot = {
  id: string;
  title: string;
  poster: string;
  videoSrc?: string;
};

export const heroClip: ClipSlot = {
  id: "hero",
  title: "A computed ball flight over a fairway.",
  poster: "/media/tracer-sample.svg",
};

export const demoClips: readonly ClipSlot[] = [
  {
    id: "slot-iron",
    title: "Iron down the middle",
    poster: "/media/tracer-sample.svg",
  },
  {
    id: "slot-shape",
    title: "A shot with shape",
    poster: "/media/tracer-sample.svg",
  },
  {
    id: "slot-green",
    title: "Carry to the green",
    poster: "/media/tracer-sample.svg",
  },
];
