export const MAX_CLIP_BYTES = 500 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 60;

export type ShotShape =
  | "high-draw"
  | "high-straight"
  | "high-fade"
  | "mid-draw"
  | "mid-straight"
  | "mid-fade"
  | "low-draw"
  | "low-straight"
  | "low-fade";

export const SHOT_ROWS = ["high", "mid", "low"] as const;
export const SHOT_COLS = ["draw", "straight", "fade"] as const;

export function shotShape(row: (typeof SHOT_ROWS)[number], col: (typeof SHOT_COLS)[number]): ShotShape {
  return `${row}-${col}` as ShotShape;
}

export type NormPoint = { x: number; y: number };

export type Box = { left: number; top: number; width: number; height: number };

export type JobStatus = "queued" | "analyzing" | "rendering" | "done" | "error";

export type OutputFormat = "mp4" | "mp4_9x16";

export type VerticalOutput = {
  downloadUrl?: string;
  playUrl?: string;
  aspect?: string;
};

export type Job = {
  status: JobStatus;
  progress: number;
  message: string;
  downloadUrl?: string;
  playUrl?: string;
  error?: string;
  errorCode?: string;
  ball?: NormPoint;
  trajectory?: unknown;
  trajectoryUrl?: string;
  vertical?: VerticalOutput;
};

export type UploadTicket = {
  jobId: string;
  uploadUrl: string;
  key: string;
};

export type RenderInput = {
  landing: NormPoint;
  ball?: NormPoint;
  hangTime: number;
  shape: ShotShape;
  impactTime?: number;
  /** [] is trajectory only. Omit nothing: the editor always sends this. */
  outputs: OutputFormat[];
};

export const MISSING_API_MESSAGE =
  "Editor not connected. Set NEXT_PUBLIC_TRAICER_API_URL, then rebuild.";

const STATUSES = new Set<JobStatus>(["queued", "analyzing", "rendering", "done", "error"]);

export function readTraicerApiBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_TRAICER_API_URL?.trim() ?? "";
  if (!raw || raw.includes("YOUR_API")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
    return raw.replace(/\/+$/, "");
  }
  return null;
}

export function contentTypeFor(file: { name: string; type: string }): string | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "video/mp4" || name.endsWith(".mp4")) return "video/mp4";
  if (type === "video/quicktime" || name.endsWith(".mov")) return "video/quicktime";
  return null;
}

/** Displayed video rectangle inside a letterboxed element. Origin is the viewport. */
export function contentRect(element: Box, videoWidth: number, videoHeight: number): Box | null {
  if (videoWidth <= 0 || videoHeight <= 0 || element.width <= 0 || element.height <= 0) return null;
  const elementAspect = element.width / element.height;
  const videoAspect = videoWidth / videoHeight;
  if (elementAspect > videoAspect) {
    const height = element.height;
    const width = height * videoAspect;
    return {
      left: element.left + (element.width - width) / 2,
      top: element.top,
      width,
      height,
    };
  }
  const width = element.width;
  const height = width / videoAspect;
  return {
    left: element.left,
    top: element.top + (element.height - height) / 2,
    width,
    height,
  };
}

/** Click → 0..1 of the intrinsic frame. Null when the click is in the letterbox. */
export function framePoint(
  clientX: number,
  clientY: number,
  element: Box,
  videoWidth: number,
  videoHeight: number,
): NormPoint | null {
  const content = contentRect(element, videoWidth, videoHeight);
  if (!content) return null;
  const x = (clientX - content.left) / content.width;
  const y = (clientY - content.top) / content.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
  };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  } catch {
    /* not JSON */
  }
  return `The editor refused that request (${response.status}).`;
}

export async function createUpload(
  base: string,
  file: { name: string; size: number; type: string },
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadTicket> {
  const response = await fetchImpl(`${base}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      contentType,
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as Partial<UploadTicket>;
  if (!body.jobId || !body.uploadUrl || !body.key) {
    throw new Error("The editor didn't return an upload.");
  }
  return { jobId: body.jobId, uploadUrl: body.uploadUrl, key: body.key };
}

export function putFile(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
): { done: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

export async function startRender(
  base: string,
  jobId: string,
  input: RenderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${base}/api/jobs/${encodeURIComponent(jobId)}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function getJob(base: string, jobId: string, fetchImpl: typeof fetch = fetch): Promise<Job> {
  const response = await fetchImpl(`${base}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as Partial<Job> & { status?: string };
  if (!body.status || !STATUSES.has(body.status as JobStatus)) {
    throw new Error("The editor returned a status this page doesn't understand.");
  }
  const vertical = body.vertical;
  return {
    status: body.status as JobStatus,
    progress: typeof body.progress === "number" ? Math.min(1, Math.max(0, body.progress)) : 0,
    message: typeof body.message === "string" ? body.message : "",
    downloadUrl: typeof body.downloadUrl === "string" ? body.downloadUrl : undefined,
    playUrl: typeof body.playUrl === "string" ? body.playUrl : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    errorCode: typeof body.errorCode === "string" ? body.errorCode : undefined,
    ball: isPoint(body.ball) ? body.ball : undefined,
    trajectory: body.trajectory,
    trajectoryUrl: typeof body.trajectoryUrl === "string" ? body.trajectoryUrl : undefined,
    vertical:
      vertical && typeof vertical === "object"
        ? {
            downloadUrl: typeof vertical.downloadUrl === "string" ? vertical.downloadUrl : undefined,
            playUrl: typeof vertical.playUrl === "string" ? vertical.playUrl : undefined,
            aspect: typeof vertical.aspect === "string" ? vertical.aspect : undefined,
          }
        : undefined,
  };
}

function isPoint(value: unknown): value is NormPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && typeof point.y === "number";
}

export function friendlyJobError(code: string | undefined, fallback: string): string {
  if (code === "BALL_NOT_FOUND") return "We couldn't find the ball. Tap nearer to it and trace again.";
  if (code === "BALL_NOT_TRACKED") return "We lost the ball in flight. Move the landing, or pick another shape.";
  if (code === "RENDER_FAILED") return "The export didn't finish. Press Render to try again.";
  return fallback;
}

export function statusLine(job: Job): string {
  if (job.message.trim()) return job.message.trim();
  if (job.status === "error") return job.error?.trim() || "The tracer didn't finish.";
  if (job.status === "queued") return "Waiting to start.";
  if (job.status === "analyzing") return "Looking at the clip.";
  if (job.status === "rendering") return "Drawing the tracer.";
  return "Ready.";
}
