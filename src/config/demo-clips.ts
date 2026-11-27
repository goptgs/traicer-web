/**
 * Demo-clip slots. To drop in a real tracer clip:
 * 1. Put the poster still and the mp4 in public/media/.
 * 2. Point `poster` at the still and set `videoSrc` to the mp4.
 * Leave `videoSrc` unset and the slot keeps the poster inside a video element.
 */
export type DemoClip = {
  id: string;
  title: string;
  caption: string;
  poster: string;
  videoSrc?: string;
  fileLabel: string;
};

export const demoClips: readonly DemoClip[] = [
  {
    id: "slot-iron",
    title: "Iron down the middle",
    caption:
      "Placeholder frame. A computed 7-iron flight over a plain fairway, not a filmed hole.",
    poster: "/media/tracer-sample.svg",
    fileLabel: "placeholder-iron.mp4",
  },
  {
    id: "slot-shape",
    title: "A shot with shape",
    caption: "Same kind of slot. A real tracer clip replaces the poster and the file.",
    poster: "/media/tracer-sample.svg",
    fileLabel: "placeholder-shape.mp4",
  },
  {
    id: "slot-green",
    title: "Carry to the green",
    caption: "A third frame, held at 16:9 so the page does not jump when the clip arrives.",
    poster: "/media/tracer-sample.svg",
    fileLabel: "placeholder-green.mp4",
  },
];
