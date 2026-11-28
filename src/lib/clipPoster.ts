/**
 * Paint a JPEG poster from a clip URL.
 * The element is attached (Safari will not decode a detached video) inside a
 * closed shadow root, so the editor still has one visible <video>.
 */
export function capturePosterFromUrl(url: string, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("data-poster-capture", "");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:160px;height:90px;pointer-events:none;";
    const root = host.attachShadow({ mode: "closed" });
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.style.width = "160px";
    video.style.height = "90px";
    root.appendChild(video);
    document.body.appendChild(host);

    let settled = false;
    const finish = (poster: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* The element is about to be removed. */
      }
      host.remove();
      resolve(poster);
    };

    const draw = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
      try {
        const canvas = document.createElement("canvas");
        const width = 160;
        const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return false;
        context.drawImage(video, 0, 0, width, height);
        const poster = canvas.toDataURL("image/jpeg", 0.72);
        if (!poster.startsWith("data:image/jpeg")) return false;
        finish(poster);
        return true;
      } catch {
        return false;
      }
    };

    const present = () => {
      if (draw()) return;
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(() => {
          draw();
        });
      }
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.onloadeddata = present;
    video.onseeked = present;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const at = duration > 0.05 ? Math.min(0.1, duration / 2) : 0;
      try {
        if (Math.abs(video.currentTime - at) > 0.0001) video.currentTime = at;
        else present();
      } catch {
        present();
      }
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
