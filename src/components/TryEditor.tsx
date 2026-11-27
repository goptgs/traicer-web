"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { requestExport } from "@/lib/entitlements";
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
  friendlyJobError,
  getJob,
  putFile,
  readTraicerApiBase,
  shotShape,
  startRender,
  apiColour,
  statusLine,
  type Job,
  type NormPoint,
  type OutputFormat,
  type ShotShape,
} from "@/lib/traicerApi";
import { CANT_PLAY_MESSAGE, PROBE_WAIT_MS, playbackGaveUp, probeDuration } from "@/lib/probeClip";
import { parseTrajectory, rowsUntil, trailOpacity, type Trajectory } from "@/lib/trajectory";

type Tool = "ball" | "landing";
type Points = { ball: NormPoint | null; landing: NormPoint | null };
type UploadState = "uploading" | "done" | "error";
type Phase = "mark" | "drafting" | "draft" | "rendering" | "done" | "error";

type Clip = {
  id: string;
  file: File;
  name: string;
  url: string;
  duration: number;
  contentType: string;
  jobId: string | null;
  upload: UploadState;
  uploadProgress: number;
  uploadError: string | null;
  points: Points;
  hang: number;
  shape: ShotShape;
  colour: string;
  phase: Phase;
  job: Job | null;
  trajectory: Trajectory | null;
  snappedBall: NormPoint | null;
  stepsOpen: boolean;
  portrait: boolean;
  tracerOn: boolean;
};

const SWATCHES = [
  { name: "Ice", hex: "#2EE8FF" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Navy", hex: "#071526" },
  { name: "Yellow", hex: "#FFD60A" },
  { name: "Red", hex: "#FF5C76" },
] as const;

const ROW_LABEL = { high: "High", mid: "Mid", low: "Low" } as const;
const COL_LABEL = { draw: "Draw", straight: "Straight", fade: "Fade" } as const;
const GRID = 4;

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

function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function loadTrajectory(job: Job): Promise<Trajectory | null> {
  const inline = parseTrajectory(job.trajectory);
  if (inline) return inline;
  if (!job.trajectoryUrl) return null;
  const response = await fetch(job.trajectoryUrl);
  if (!response.ok) return null;
  return parseTrajectory(await response.json());
}

export function TryEditor() {
  const base = readTraicerApiBase();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const tokens = useRef<Record<string, number>>({});
  const aborts = useRef<Record<string, () => void>>({});

  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("ball");
  const [gridOn, setGridOn] = useState(false);
  const [zoom, setZoom] = useState<{ col: number; row: number } | null>(null);
  const [mag, setMag] = useState<{ x: number; y: number } | null>(null);
  const [time, setTime] = useState(0);
  const [resetId, setResetId] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [custom, setCustom] = useState("#2EE8FF");
  const [readyId, setReadyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);
  const [content, setContent] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const selected = clips.find((clip) => clip.id === selectedId) ?? null;
  const frameReady = Boolean(selected && readyId === selected.id);
  const playbackError = Boolean(selected && failedId === selected.id);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  useEffect(() => {
    return () => {
      for (const id of Object.keys(tokens.current)) tokens.current[id] = -1;
      for (const abort of Object.values(aborts.current)) abort();
      for (const clip of clipsRef.current) URL.revokeObjectURL(clip.url);
    };
  }, []);

  function patch(id: string, update: (clip: Clip) => Clip) {
    setClips((current) => current.map((clip) => (clip.id === id ? update(clip) : clip)));
  }

  function measureContent() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    return contentRect(
      { left: 0, top: 0, width: video.clientWidth, height: video.clientHeight },
      video.videoWidth,
      video.videoHeight,
    );
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (!video.videoWidth || !video.clientWidth) return;
      setContent(
        contentRect(
          { left: 0, top: 0, width: video.clientWidth, height: video.clientHeight },
          video.videoWidth,
          video.videoHeight,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(video);
    video.addEventListener("loadedmetadata", update);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", update);
    };
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.phase !== "done") return;
    if (!selected.job?.playUrl && !selected.job?.downloadUrl) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [selected?.phase, selected?.job?.playUrl, selected?.job?.downloadUrl]);

  useEffect(() => {
    const clipId = selected?.id;
    if (!clipId || frameReady) return;
    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      if (playbackGaveUp({ readyState: video.readyState, videoWidth: video.videoWidth, errored: Boolean(video.error) })) {
        setFailedId(clipId);
      }
    }, PROBE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [selected?.id, frameReady]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const clip = selected;
    if (!video || !canvas || !clip?.trajectory || clip.phase === "mark") return;
    let frame = 0;
    const draw = () => {
      const box = measureContent();
      if (!box) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.left = `${box.left}px`;
      canvas.style.top = `${box.top}px`;
      canvas.style.width = `${box.width}px`;
      canvas.style.height = `${box.height}px`;
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      const trajectory = clip.trajectory;
      if (!trajectory) return;
      const now = video.currentTime || 0;
      const rows = rowsUntil(trajectory, now);
      const alpha = trailOpacity(now, trajectory.landingTime, trajectory.holdAfterLanding, trajectory.fadeDuration);
      if (rows.length > 1 && alpha > 0) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = clip.colour;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        rows.forEach((row, index) => {
          const x = row.x * box.width;
          const y = row.y * box.height;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        const width = 2 + (rows[rows.length - 1]?.widthFactor ?? 1) * 3;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (clip.portrait && rows.length) {
        const ball = rows[rows.length - 1];
        const cropW = Math.min(box.width, box.height * (9 / 16));
        const cx = ball.x * box.width;
        const left = Math.min(box.width - cropW, Math.max(0, cx - cropW / 2));
        ctx.strokeStyle = "#ffffff";
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(left, 0, cropW, box.height);
        ctx.setLineDash([]);
      }
    };
    const loop = () => {
      draw();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  async function poll(clipId: string, jobId: string, token: number, exporting: boolean) {
    if (!base) return;
    for (;;) {
      if (tokens.current[clipId] !== token) return;
      const job = await getJob(base, jobId);
      if (tokens.current[clipId] !== token) return;
      const trajectory = job.status === "done" ? await loadTrajectory(job) : null;
      if (tokens.current[clipId] !== token) return;
      patch(clipId, (clip) => ({
        ...clip,
        job,
        trajectory: trajectory ?? clip.trajectory,
        snappedBall: job.ball ?? clip.snappedBall,
        phase: job.status === "done" ? (exporting ? "done" : "draft") : job.status === "error" ? "error" : clip.phase,
        stepsOpen: exporting && job.status === "done" ? false : clip.stepsOpen,
      }));
      if (job.status === "done") return;
      if (job.status === "error") return;
      await sleep(2000);
    }
  }

  async function begin(clip: Clip, outputs: OutputFormat[]) {
    if (!base || !clip.jobId || !clip.points.landing) return;
    const exporting = outputs.length > 0;
    if (exporting) {
      const decision = requestExport(clip.id);
      if (!decision.allowed) {
        setUpgrade(decision.reason);
        return;
      }
    }
    const token = (tokens.current[clip.id] ?? 0) + 1;
    tokens.current[clip.id] = token;
    patch(clip.id, (current) => ({
      ...current,
      phase: exporting ? "rendering" : "drafting",
      job: null,
    }));
    try {
      await startRender(base, clip.jobId, {
        landing: clip.points.landing,
        ball: clip.points.ball ?? undefined,
        hangTime: clip.hang,
        shape: clip.shape,
        color: apiColour(clip.colour),
        outputs,
      });
      await poll(clip.id, clip.jobId, token, exporting);
    } catch (error) {
      if (tokens.current[clip.id] !== token) return;
      patch(clip.id, (current) => ({
        ...current,
        phase: "error",
        job: {
          status: "error",
          progress: 0,
          message: "",
          error: plainError(error, "The tracer didn't finish."),
        },
      }));
    }
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = [...list];
    for (const file of incoming) {
      const type = contentTypeFor(file);
      if (!type) {
        setNotice(`${file.name}: use an mp4 or mov.`);
        continue;
      }
      if (file.size > MAX_CLIP_BYTES) {
        setNotice(`${file.name} is over 500 MB.`);
        continue;
      }
      const probed = await probeDuration(file);
      if (probed.status === "reject") {
        setNotice(probed.reason === "too-long" ? `${file.name} is longer than 60 seconds.` : CANT_PLAY_MESSAGE);
        continue;
      }
      if (probed.status !== "accept") continue;
      const duration = probed.duration ?? 0;
      const id = crypto.randomUUID();
      const clip: Clip = {
        id,
        file,
        name: file.name,
        url: URL.createObjectURL(file),
        duration,
        contentType: type,
        jobId: null,
        upload: "uploading",
        uploadProgress: 0,
        uploadError: null,
        points: { ball: null, landing: null },
        hang: 6,
        shape: "mid-straight",
        colour: "#2EE8FF",
        phase: "mark",
        job: null,
        trajectory: null,
        snappedBall: null,
        stepsOpen: true,
        portrait: false,
        tracerOn: true,
      };
      setClips((current) => [...current, clip]);
      setSelectedId((current) => current ?? id);
      setNotice(null);
      void uploadClip(clip);
    }
  }

  async function uploadClip(clip: Clip) {
    if (!base) return;
    try {
      const ticket = await createUpload(base, clip.file, clip.contentType);
      patch(clip.id, (current) => ({ ...current, jobId: ticket.jobId }));
      const transfer = putFile(ticket.uploadUrl, clip.file, clip.contentType, (fraction) => {
        patch(clip.id, (current) => ({ ...current, uploadProgress: fraction }));
      });
      aborts.current[clip.id] = transfer.abort;
      await transfer.done;
      patch(clip.id, (current) => ({ ...current, upload: "done", uploadProgress: 1 }));
    } catch (error) {
      patch(clip.id, (current) => ({
        ...current,
        upload: "error",
        uploadError: plainError(error, "Upload failed."),
      }));
    }
  }

  function tap(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    const clip = selected;
    if (!video || !clip || !clip.stepsOpen || !frameReady) return;
    if (gridOn && !zoom) {
      const point = framePoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
      if (!point) return;
      setZoom({
        col: Math.min(GRID - 1, Math.floor(point.x * GRID)),
        row: Math.min(GRID - 1, Math.floor(point.y * GRID)),
      });
      return;
    }
    const point = framePoint(
      event.clientX,
      event.clientY,
      video.getBoundingClientRect(),
      video.videoWidth,
      video.videoHeight,
    );
    if (!point) return;
    patch(clip.id, (current) => ({
      ...current,
      points: tool === "ball" ? { ...current.points, ball: point } : { ...current.points, landing: point },
    }));
    if (zoom) setZoom(null);
  }

  function drawMagnifier(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    const canvas = magRef.current;
    if (!video || !canvas || !video.videoWidth || zoom || !selected?.stepsOpen) {
      setMag(null);
      return;
    }
    const point = framePoint(
      event.clientX,
      event.clientY,
      video.getBoundingClientRect(),
      video.videoWidth,
      video.videoHeight,
    );
    if (!point) {
      setMag(null);
      return;
    }
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    setMag({ x: event.clientX - stage.left, y: event.clientY - stage.top });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const srcW = video.videoWidth / 4;
    const srcH = video.videoHeight / 4;
    const sx = point.x * video.videoWidth - srcW / 2;
    const sy = point.y * video.videoHeight - srcH / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(video, sx, sy, srcW, srcH, 0, 0, canvas.width, canvas.height);
    } catch {
      setMag(null);
    }
  }

  function resetClip(id: string) {
    tokens.current[id] = -1;
    patch(id, (clip) => ({
      ...clip,
      points: { ball: null, landing: null },
      hang: 6,
      shape: "mid-straight",
      phase: "mark",
      job: null,
      trajectory: null,
      snappedBall: null,
      stepsOpen: true,
    }));
    setResetId(null);
  }

  function traceAll() {
    for (const clip of clips) {
      if (clip.upload === "done" && clip.points.landing && clip.phase !== "drafting" && clip.phase !== "rendering") {
        void begin(clip, []);
      }
    }
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

  const outputs = (clip: Clip): OutputFormat[] => (clip.portrait ? ["mp4", "mp4_9x16"] : ["mp4"]);

  return (
    <div className="wrap try-page">
      <h1>Edit</h1>
      <p className="lede">Mark a clip while the others trace. The line stays on top of the original until you render.</p>
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }}
      >
        <strong>Drop clips</strong>
        <p>mp4 or mov, up to 500 MB and 60 seconds. One, or a batch.</p>
        <label className="btn btn-secondary">
          Choose clips
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            multiple
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {notice ? (
        <p className="form-alert" role="alert">
          {notice}
        </p>
      ) : null}

      {clips.length > 0 ? (
        <div className="edit-layout">
          <aside className="clip-list">
            <h2>Clips ({clips.length})</h2>
            <ul>
              {clips.map((clip) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    aria-current={clip.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(clip.id)}
                  >
                    <strong>{clip.name}</strong>
                    <span>
                      {clock(clip.duration)} · {clipStatus(clip)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={traceAll}>
              Trace all
            </button>
          </aside>

          {selected ? (
            <div className="edit-main">
              <div className="stage-column">
              <div className="stage" ref={stageRef}>
                <div
                  className="stage-media"
                  style={
                    zoom && content && videoRef.current
                      ? {
                          transform: "scale(4)",
                          transformOrigin: `${((content.left + ((zoom.col + 0.5) / GRID) * content.width) / (videoRef.current.clientWidth || 1)) * 100}% ${((content.top + ((zoom.row + 0.5) / GRID) * content.height) / (videoRef.current.clientHeight || 1)) * 100}%`,
                        }
                      : undefined
                  }
                >
                  <video
                    key={selected.id}
                    ref={(node) => {
                      videoRef.current = node;
                      node?.setAttribute("playsinline", "");
                      node?.setAttribute("webkit-playsinline", "");
                    }}
                    className="frame-video"
                    src={selected.url}
                    playsInline
                    muted
                    preload="auto"
                    onLoadedMetadata={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      const learned = video.duration;
                      if (Number.isFinite(learned) && learned > 0) {
                        patch(selected.id, (clip) => ({ ...clip, duration: learned }));
                        if (learned > MAX_CLIP_SECONDS) {
                          aborts.current[selected.id]?.();
                          setNotice(`${selected.name} is longer than 60 seconds.`);
                        }
                      }
                      try {
                        video.currentTime = 0.001;
                      } catch {
                        /* WebKit can throw before the first frame is seekable. */
                      }
                      if (video.videoWidth && video.clientWidth) {
                        setContent(
                          contentRect(
                            { left: 0, top: 0, width: video.clientWidth, height: video.clientHeight },
                            video.videoWidth,
                            video.videoHeight,
                          ),
                        );
                      }
                    }}
                    onLoadedData={() => setReadyId(selected.id)}
                    onError={() => setFailedId(selected.id)}
                    onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
                  />
                  <canvas ref={canvasRef} className="tracer-layer" hidden={!selected.tracerOn || !selected.trajectory} />
                  {content ? (
                    <div className="content-frame" style={{ left: content.left, top: content.top, width: content.width, height: content.height }}>
                      {gridOn && !zoom
                        ? Array.from({ length: GRID * GRID }, (_, index) => (
                            <span
                              key={index}
                              className="grid-cell"
                              style={{
                                left: `${(index % GRID) * (100 / GRID)}%`,
                                top: `${Math.floor(index / GRID) * (100 / GRID)}%`,
                                width: `${100 / GRID}%`,
                                height: `${100 / GRID}%`,
                              }}
                            />
                          ))
                        : null}
                      {selected.points.ball ? (
                        <i className="marker is-ball" style={{ left: `${selected.points.ball.x * 100}%`, top: `${selected.points.ball.y * 100}%` }} />
                      ) : null}
                      {selected.snappedBall ? (
                        <i
                          className="marker is-found"
                          title="Ball found"
                          style={{ left: `${selected.snappedBall.x * 100}%`, top: `${selected.snappedBall.y * 100}%` }}
                        />
                      ) : null}
                      {selected.points.landing ? (
                        <i
                          className="marker is-landing"
                          style={{ left: `${selected.points.landing.x * 100}%`, top: `${selected.points.landing.y * 100}%` }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={frameReady ? "tap-layer" : "tap-layer is-waiting"}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={tap}
                    onPointerMove={drawMagnifier}
                    onPointerLeave={() => setMag(null)}
                  />
                </div>
                <canvas
                  ref={magRef}
                  width={160}
                  height={160}
                  className="magnifier"
                  hidden={!mag || !selected.stepsOpen}
                  style={mag ? { left: mag.x + 16, top: mag.y - 80 } : undefined}
                />
                {!frameReady && !playbackError ? (
                  <p className="loading-clip" role="status">
                    Loading clip…
                  </p>
                ) : null}
              </div>
              {playbackError ? (
                <p className="form-alert" role="alert">
                  {CANT_PLAY_MESSAGE}
                </p>
              ) : null}
              <label className="scrubber">
                <span className="visually-hidden">Scrub</span>
                <input
                  type="range"
                  min={0}
                  max={selected.duration || 0}
                  step={0.01}
                  value={Math.min(time, selected.duration || 0)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (videoRef.current) videoRef.current.currentTime = next;
                    setTime(next);
                  }}
                />
              </label>
              <p className="export-note">
                Frame {Math.round(time * 30)} · {clock(time)} / {clock(selected.duration)}
                {uploadLabel(selected)}
              </p>
              {gridOn ? (
                <p className="zoom-strip" aria-label="Grid zoom">
                  <span className={!zoom ? "is-on" : ""}>1 Grid</span>
                  <span className={zoom ? "is-on" : ""}>2 Zoom 4×</span>
                  <span>3 Tap</span>
                </p>
              ) : null}
              </div>

              <div className="edit-panel">
                <div className="panel-head">
                  <h2>{selected.name}</h2>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResetId(selected.id)}>
                    ↺ Reset
                  </button>
                </div>
                {selected.stepsOpen ? (
                  <div className="step-cards">
                    <Step
                      title="Ball"
                      done={Boolean(selected.points.ball || selected.snappedBall)}
                      onEdit={() => setTool("ball")}
                      active={tool === "ball"}
                    >
                      Optional, we'll find it. Tap near the ball.
                    </Step>
                    <Step title="Landing" done={Boolean(selected.points.landing)} onEdit={() => setTool("landing")} active={tool === "landing"}>
                      Scrub to the landing, then tap it.
                    </Step>
                    <Step title="Hang time" done onEdit={() => undefined} active={false}>
                      <label className="hang">
                        {selected.hang.toFixed(1)} s
                        <input
                          type="range"
                          min={2}
                          max={10}
                          step={0.1}
                          value={selected.hang}
                          onChange={(event) => {
                            const hang = Number(event.target.value);
                            patch(selected.id, (clip) => ({ ...clip, hang }));
                          }}
                        />
                      </label>
                    </Step>
                    <Step title="Shape" done onEdit={() => undefined} active={false}>
                      <ShapeGrid
                        value={selected.shape}
                        onChange={(shape) => patch(selected.id, (clip) => ({ ...clip, shape }))}
                      />
                    </Step>
                  </div>
                ) : (
                  <ul className="step-summary">
                    <li>
                      Ball {selected.points.ball || selected.snappedBall ? "✓" : "—"}{" "}
                      <button type="button" className="edit-chip" onClick={() => { patch(selected.id, (clip) => ({ ...clip, stepsOpen: true })); setTool("ball"); }}>
                        Edit
                      </button>
                    </li>
                    <li>
                      Landing {selected.points.landing ? "✓" : "—"}{" "}
                      <button type="button" className="edit-chip" onClick={() => { patch(selected.id, (clip) => ({ ...clip, stepsOpen: true })); setTool("landing"); }}>
                        Edit
                      </button>
                    </li>
                    <li>
                      Hang {selected.hang.toFixed(1)}s{" "}
                      <button type="button" className="edit-chip" onClick={() => patch(selected.id, (clip) => ({ ...clip, stepsOpen: true }))}>
                        Edit
                      </button>
                    </li>
                    <li>
                      Shape {selected.shape}{" "}
                      <button type="button" className="edit-chip" onClick={() => patch(selected.id, (clip) => ({ ...clip, stepsOpen: true }))}>
                        Edit
                      </button>
                    </li>
                  </ul>
                )}
                <div className="step-card">
                  <div className="step-head">
                    <span>Colour</span>
                  </div>
                  <div className="swatches">
                    {SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        aria-label={swatch.name}
                        aria-pressed={selected.colour.toLowerCase() === swatch.hex.toLowerCase()}
                        style={{ background: swatch.hex }}
                        onClick={() => patch(selected.id, (clip) => ({ ...clip, colour: swatch.hex }))}
                      />
                    ))}
                    <label className="custom-colour">
                      Custom
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : "#2EE8FF"}
                        onChange={(event) => {
                          setCustom(event.target.value);
                          patch(selected.id, (clip) => ({ ...clip, colour: event.target.value }));
                        }}
                      />
                      <input
                        aria-label="Hex colour"
                        value={selected.colour}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(value)) {
                            patch(selected.id, (clip) => ({ ...clip, colour: value }));
                            if (/^#[0-9a-fA-F]{6}$/.test(value)) setCustom(value);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSignup(true)}>
                    Save as my default colour
                  </button>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selected.portrait}
                    onChange={(event) => patch(selected.id, (clip) => ({ ...clip, portrait: event.target.checked }))}
                  />
                  9:16 as well as 16:9. The portrait crop follows the ball.
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={gridOn}
                    onChange={(event) => {
                      setGridOn(event.target.checked);
                      if (!event.target.checked) setZoom(null);
                    }}
                  />
                  Precision grid
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                        checked={Boolean(selected.trajectory) && selected.tracerOn}
                        disabled={!selected.trajectory}
                    onChange={(event) => {
                      const tracerOn = event.target.checked;
                      patch(selected.id, (clip) => ({ ...clip, tracerOn }));
                    }}
                  />
                  Tracer layer
                </label>

                {selected.upload === "uploading" ? (
                  <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(selected.uploadProgress * 100)}>
                    <span style={{ width: `${Math.round(selected.uploadProgress * 100)}%` }} />
                  </div>
                ) : null}
                {selected.uploadError ? (
                  <p className="form-alert" role="alert">
                    {selected.uploadError}{" "}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void uploadClip(selected)}>
                      Retry
                    </button>
                  </p>
                ) : null}

                <div className="hero-actions">
                  {selected.trajectory && selected.phase !== "drafting" && selected.phase !== "rendering" ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      disabled={selected.upload !== "done" || !selected.points.landing}
                      onClick={() => void begin(selected, outputs(selected))}
                    >
                      Render
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      disabled={
                        selected.upload !== "done" ||
                        !selected.points.landing ||
                        selected.phase === "drafting" ||
                        selected.phase === "rendering"
                      }
                      onClick={() => void begin(selected, [])}
                    >
                      {selected.phase === "rendering" ? "Rendering…" : selected.phase === "drafting" ? "Tracing…" : "Trace this clip"}
                    </button>
                  )}
                  {selected.trajectory ? (
                    <button type="button" className="btn btn-secondary" onClick={() => patch(selected.id, (clip) => ({ ...clip, stepsOpen: true, phase: clip.phase === "done" ? "draft" : clip.phase }))}>
                      Redo tracer
                    </button>
                  ) : null}
                </div>

                {(selected.phase === "drafting" || selected.phase === "rendering") && selected.job ? (
                  <div className="trace-status" role="status">
                    <p>{friendlyJobError(selected.job.errorCode, statusLine(selected.job))}</p>
                    <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(selected.job.progress * 100)}>
                      <span style={{ width: `${Math.round(selected.job.progress * 100)}%` }} />
                    </div>
                  </div>
                ) : null}
                {selected.phase === "error" && selected.job ? (
                  <p className="form-alert" role="alert">
                    {friendlyJobError(selected.job.errorCode, selected.job.error || statusLine(selected.job))}{" "}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void begin(selected, selected.trajectory ? outputs(selected) : [])}>
                      Retry
                    </button>
                  </p>
                ) : null}

                <div ref={resultRef}>
                  {selected.phase === "done" && (selected.job?.playUrl || selected.job?.downloadUrl) ? (
                    <div className="trace-result">
                      <video
                        src={selected.job.playUrl || selected.job.downloadUrl}
                        autoPlay
                        muted
                        controls
                        playsInline
                        ref={(node) => {
                          node?.setAttribute("playsinline", "");
                          node?.setAttribute("webkit-playsinline", "");
                        }}
                      />
                      <div className="hero-actions">
                        {selected.job.downloadUrl ? (
                          <a className="btn btn-primary" href={selected.job.downloadUrl}>
                            Download 16:9
                          </a>
                        ) : null}
                        {selected.job.vertical?.downloadUrl ? (
                          <a className="btn btn-secondary" href={selected.job.vertical.downloadUrl}>
                            Download 9:16
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {resetId ? (
        <div className="modal-backdrop" onMouseDown={() => setResetId(null)}>
          <div className="modal confirm" role="dialog" aria-modal="true" aria-labelledby="reset-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="reset-title">Reset this clip?</h2>
            <p>Clears all markings and the tracer. Can't be undone.</p>
            <div className="hero-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResetId(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => resetClip(resetId)}>
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {signup ? (
        <div className="modal-backdrop" onMouseDown={() => setSignup(false)}>
          <div className="modal confirm" role="dialog" aria-modal="true" aria-labelledby="signup-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="signup-title">Save as my default colour</h2>
            <p>An account will remember this colour on every clip. Sign-up is coming.</p>
            <div className="hero-actions">
              <button type="button" className="btn btn-primary" onClick={() => setSignup(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {upgrade ? (
        <div className="modal-backdrop" onMouseDown={() => setUpgrade(null)}>
          <div className="modal confirm" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="upgrade-title">Save your work</h2>
            <p>{upgrade}</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/pricing">
                See pricing
              </Link>
              <button type="button" className="btn btn-secondary" onClick={() => setUpgrade(null)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function clipStatus(clip: Clip): string {
  if (clip.upload === "uploading") return "Uploading";
  if (clip.upload === "error") return "Upload failed";
  if (clip.phase === "drafting") return "Tracing";
  if (clip.phase === "rendering") return "Rendering";
  if (clip.phase === "done") return "Ready";
  if (clip.phase === "error") return "Needs a retry";
  if (clip.phase === "draft") return "Draft";
  if (!clip.points.landing) return "Needs a landing";
  return "Ready to trace";
}

function uploadLabel(clip: Clip): string {
  if (clip.upload === "uploading") return ` · Uploading ${Math.round(clip.uploadProgress * 100)}%`;
  if (clip.upload === "done") return " · Uploaded";
  if (clip.upload === "error") return " · Upload failed";
  return "";
}

function Step({
  title,
  done,
  active,
  onEdit,
  children,
}: {
  title: string;
  done: boolean;
  active: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className={active ? "step-card is-on" : "step-card"}>
      <div className="step-head">
        <span>
          {done ? "✓ " : ""}
          {title}
        </span>
        <button type="button" className="edit-chip" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div>{children}</div>
    </section>
  );
}

function ShapeGrid({ value, onChange }: { value: ShotShape; onChange: (shape: ShotShape) => void }) {
  return (
    <table className="nine-box">
      <caption className="visually-hidden">Shot shape. High draw is the top left. Low fade is the bottom right.</caption>
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
              const shape = shotShape(row, col);
              const pressed = value === shape;
              return (
                <td key={shape}>
                  <button type="button" aria-pressed={pressed} aria-label={`${ROW_LABEL[row]} ${COL_LABEL[col]}`} onClick={() => onChange(shape)}>
                    {pressed ? <span className="visually-hidden">Selected</span> : null}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
