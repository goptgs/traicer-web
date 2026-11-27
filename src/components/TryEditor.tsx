"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  MISSING_API_MESSAGE,
  SHOT_COLS,
  SHOT_ROWS,
  contentRect,
  contentTypeFor,
  createUpload,
  framePoint,
  getJob,
  putFile,
  readTraicerApiBase,
  shotShape,
  startRender,
  statusLine,
  type Job,
  type NormPoint,
  type ShotShape,
} from "@/lib/traicerApi";

type Tool = "ball" | "landing";
type Points = { ball: NormPoint | null; landing: NormPoint | null };
type UploadState = "idle" | "uploading" | "done" | "error";

const ROW_LABEL: Record<(typeof SHOT_ROWS)[number], string> = {
  high: "High",
  mid: "Mid",
  low: "Low",
};
const COL_LABEL: Record<(typeof SHOT_COLS)[number], string> = {
  draw: "Draw",
  straight: "Straight",
  fade: "Fade",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function plainError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "Couldn't reach the editor. Check the connection and try again.";
  }
  return error.message;
}

function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const timer = window.setTimeout(() => finish(new Error("Couldn't read that clip.")), 8000);
    function finish(error?: Error, duration?: number) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      if (error) reject(error);
      else resolve(duration ?? NaN);
    }
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(undefined, video.duration);
    video.onerror = () => finish(new Error("Couldn't read that clip."));
    video.src = url;
  });
}

export function TryEditor() {
  const base = readTraicerApiBase();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const objectUrl = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("ball");
  const [history, setHistory] = useState<{ past: Points[]; present: Points; future: Points[] }>({
    past: [],
    present: { ball: null, landing: null },
    future: [],
  });
  const [contentBox, setContentBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hang, setHang] = useState(6);
  const [shape, setShape] = useState<ShotShape>("mid-straight");
  const [phase, setPhase] = useState<"edit" | "tracing" | "done">("edit");
  const [job, setJob] = useState<Job | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      generation.current += 1;
      abortRef.current?.();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function measure() {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage || !video.videoWidth) {
      setContentBox(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const content = contentRect(
      {
        left: videoRect.left - stageRect.left,
        top: videoRect.top - stageRect.top,
        width: videoRect.width,
        height: videoRect.height,
      },
      video.videoWidth,
      video.videoHeight,
    );
    setContentBox(content);
  }

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const points = history.present;

  function commitPoints(next: Points) {
    setHistory((current) => ({
      past: [...current.past, current.present],
      present: next,
      future: [],
    }));
  }

  function undo() {
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const present = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present,
        future: [current.present, ...current.future],
      };
    });
  }

  function redo() {
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const [present, ...future] = current.future;
      return {
        past: [...current.past, current.present],
        present,
        future,
      };
    });
  }

  async function upload(chosen: File, type: string) {
    if (!base) return;
    const token = ++generation.current;
    abortRef.current?.();
    setUploadState("uploading");
    setUploadProgress(0);
    setJobId(null);
    setNotice(null);
    try {
      const ticket = await createUpload(base, chosen, type);
      if (generation.current !== token) return;
      setJobId(ticket.jobId);
      const transfer = putFile(ticket.uploadUrl, chosen, type, (fraction) => {
        if (generation.current === token) setUploadProgress(fraction);
      });
      abortRef.current = transfer.abort;
      await transfer.done;
      if (generation.current !== token) return;
      setUploadState("done");
    } catch (error) {
      if (generation.current !== token) return;
      setUploadState("error");
      setNotice(plainError(error, "Upload failed."));
    }
  }

  async function takeFile(chosen: File) {
    const type = contentTypeFor(chosen);
    if (!type) {
      setNotice("Use an mp4 or mov.");
      return;
    }
    if (chosen.size > MAX_CLIP_BYTES) {
      setNotice("That clip is over 500 MB.");
      return;
    }
    let seconds = 0;
    try {
      seconds = await probeDuration(chosen);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't read that clip.");
      return;
    }
    if (!Number.isFinite(seconds) || seconds > MAX_CLIP_SECONDS) {
      setNotice("That clip is longer than 60 seconds.");
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(chosen);
    objectUrl.current = url;
    setFile(chosen);
    setPreviewUrl(url);
    setContentType(type);
    setHistory({ past: [], present: { ball: null, landing: null }, future: [] });
    setTool("ball");
    setPhase("edit");
    setJob(null);
    setTraceError(null);
    setHang(6);
    setShape("mid-straight");
    setNotice(null);
    void upload(chosen, type);
  }

  function onPick(list: FileList | null) {
    const chosen = list?.[0];
    if (chosen) void takeFile(chosen);
  }

  function onTap(event: MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    const rect = video.getBoundingClientRect();
    const point = framePoint(event.clientX, event.clientY, rect, video.videoWidth, video.videoHeight);
    if (!point) return;
    commitPoints(tool === "ball" ? { ...points, ball: point } : { ...points, landing: point });
  }

  async function trace() {
    if (!base || !jobId || !points.landing || uploadState !== "done") return;
    const token = ++generation.current;
    setPhase("tracing");
    setTraceError(null);
    setJob(null);
    try {
      await startRender(base, jobId, {
        landing: points.landing,
        ball: points.ball ?? undefined,
        hangTime: hang,
        shape,
      });
      for (;;) {
        if (generation.current !== token) return;
        const next = await getJob(base, jobId);
        if (generation.current !== token) return;
        setJob(next);
        if (next.status === "done") {
          setPhase("done");
          return;
        }
        if (next.status === "error") {
          setPhase("edit");
          setTraceError(next.error || next.message || "The tracer didn't finish.");
          return;
        }
        await sleep(2000);
      }
    } catch (error) {
      if (generation.current !== token) return;
      setPhase("edit");
      setTraceError(plainError(error, "The tracer didn't finish."));
    }
  }

  function resetClip() {
    generation.current += 1;
    abortRef.current?.();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setFile(null);
    setPreviewUrl(null);
    setUploadState("idle");
    setJobId(null);
    setPhase("edit");
    setJob(null);
    setTraceError(null);
    setNotice(null);
    setHistory({ past: [], present: { ball: null, landing: null }, future: [] });
  }

  if (!base) {
    return (
      <div className="wrap try-page">
        <h1>Try it Free!</h1>
        <p className="form-alert" role="status">
          {MISSING_API_MESSAGE}
        </p>
      </div>
    );
  }

  const canTrace = uploadState === "done" && points.landing !== null && phase !== "tracing";

  return (
    <div className="wrap try-page">
      <h1>Try it Free!</h1>
      <p className="lede">Drop a clip. Mark the landing. Trace it.</p>

      {!file ? (
        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onPick(event.dataTransfer.files);
          }}
        >
          <strong>Drop a clip</strong>
          <p>mp4 or mov, up to 500 MB and 60 seconds.</p>
          <label className="btn btn-secondary">
            Choose a clip
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              onChange={(event) => {
                onPick(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <div className="editor">
          <div>
            <div className="stage" ref={stageRef}>
              <video
                ref={videoRef}
                className="frame-video"
                src={previewUrl ?? undefined}
                playsInline
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  setDuration(video.duration || 0);
                  measure();
                }}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
              />
              {contentBox ? (
                <div
                  className="tap-layer"
                  style={{
                    left: contentBox.left,
                    top: contentBox.top,
                    width: contentBox.width,
                    height: contentBox.height,
                  }}
                  onClick={onTap}
                >
                  {points.ball ? (
                    <span
                      className="marker is-ball"
                      style={{ left: `${points.ball.x * 100}%`, top: `${points.ball.y * 100}%` }}
                    >
                      <span>Ball</span>
                    </span>
                  ) : null}
                  {points.landing ? (
                    <span
                      className="marker is-landing"
                      style={{ left: `${points.landing.x * 100}%`, top: `${points.landing.y * 100}%` }}
                    >
                      <span>Landing</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <label className="scrubber">
              <span className="visually-hidden">Scrub</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (videoRef.current) videoRef.current.currentTime = next;
                  setCurrentTime(next);
                }}
              />
            </label>
            <p className="export-note">
              {file.name}
              {uploadState === "uploading" ? ` · Uploading ${Math.round(uploadProgress * 100)}%` : null}
              {uploadState === "done" ? " · Uploaded" : null}
            </p>
            {uploadState === "uploading" ? (
              <div
                className="meter"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(uploadProgress * 100)}
                aria-label="Upload"
              >
                <span style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
              </div>
            ) : null}
          </div>

          <div className="editor-controls">
            <div className="point-tools">
              <button type="button" className={tool === "ball" ? "is-on" : ""} onClick={() => setTool("ball")}>
                1. Tap the ball
              </button>
              <button
                type="button"
                className={tool === "landing" ? "is-on" : ""}
                onClick={() => setTool("landing")}
              >
                2. Tap where it landed
              </button>
            </div>
            <p className="export-note">
              {tool === "ball"
                ? "Optional, we'll find it. Scrub if you need another frame."
                : "Required. Scrub forward to see where it landed."}
            </p>
            <div className="point-tools">
              <button type="button" onClick={undo} disabled={history.past.length === 0}>
                Undo point
              </button>
              <button type="button" onClick={redo} disabled={history.future.length === 0}>
                Redo point
              </button>
            </div>

            <label className="hang">
              3. Hang time · {hang.toFixed(1)} s
              <input
                type="range"
                min={2}
                max={10}
                step={0.1}
                value={hang}
                onChange={(event) => setHang(Number(event.target.value))}
              />
            </label>

            <div>
              <p className="mock-label">4. Shot shape</p>
              <table className="nine-box">
                <caption className="visually-hidden">
                  Shot shape. High draw is the top left. Low fade is the bottom right.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">Height</span>
                    </th>
                    {SHOT_COLS.map((col) => (
                      <th key={col} scope="col">
                        {COL_LABEL[col]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHOT_ROWS.map((row) => (
                    <tr key={row}>
                      <th scope="row">{ROW_LABEL[row]}</th>
                      {SHOT_COLS.map((col) => {
                        const value = shotShape(row, col);
                        const pressed = shape === value;
                        return (
                          <td key={value}>
                            <button
                              type="button"
                              aria-pressed={pressed}
                              aria-label={`${ROW_LABEL[row]} ${COL_LABEL[col]}`}
                              onClick={() => setShape(value)}
                            >
                              {pressed ? <span className="visually-hidden">Selected</span> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn btn-primary btn-lg" disabled={!canTrace} onClick={() => void trace()}>
              {phase === "tracing" ? "Tracing…" : "Trace it"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetClip}>
              Try another clip
            </button>
          </div>
        </div>
      )}

      {notice ? (
        <p className="form-alert" role="alert">
          {notice}{" "}
          {file && uploadState === "error" && contentType ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void upload(file, contentType)}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}

      {phase === "tracing" && job ? (
        <div className="trace-status" role="status">
          <p>{statusLine(job)}</p>
          <div
            className="meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(job.progress * 100)}
            aria-label="Tracer"
          >
            <span style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {traceError ? (
        <p className="form-alert" role="alert">
          {traceError}{" "}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void trace()}>
            Retry
          </button>
        </p>
      ) : null}

      {phase === "done" && job?.downloadUrl ? (
        <div className="trace-result">
          <video src={job.downloadUrl} autoPlay muted controls playsInline />
          <div className="hero-actions">
            <a className="btn btn-primary" href={job.downloadUrl}>
              Download
            </a>
            <button type="button" className="btn btn-secondary" onClick={() => setPhase("edit")}>
              Adjust and re-trace
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
