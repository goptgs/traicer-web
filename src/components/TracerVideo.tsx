"use client";

import { useEffect, useRef } from "react";
import type { ClipSlot } from "@/config/demo-clips";

export function TracerVideo({ clip, className }: { clip: ClipSlot; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !clip.videoSrc) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    video.play().catch(() => {
      /* Poster stays up if autoplay is blocked. */
    });
  }, [clip.videoSrc]);

  return (
    <video
      ref={ref}
      className={className ? `tracer-video ${className}` : "tracer-video"}
      poster={clip.poster}
      muted
      loop
      playsInline
      preload={clip.videoSrc ? "metadata" : "none"}
      aria-label={clip.title}
      style={{ backgroundImage: `url("${clip.poster}")` }}
    >
      {clip.videoSrc ? <source src={clip.videoSrc} type="video/mp4" /> : null}
    </video>
  );
}
