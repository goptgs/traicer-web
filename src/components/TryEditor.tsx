"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { requestExport } from "@/lib/entitlements";
import {
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  MISSING_API_MESSAGE,
  contentRect,
  contentTypeFor,
  createUpload,
  framePoint,
  friendlyJobError,
  getJob,
  magnifierSample,
  putFile,
  readTraicerApiBase,
  startRender,
  apiColour,
  statusLine,
  type Job,
  type NormPoint,
  type OutputFormat,
  type RenderInput,
} from "@/lib/traicerApi";
import {
  arcPoints,
  curveHandles,
  dragApex,
  dragEnd,
  readServerCurve,
  type ArcModel,
  type CurveHandles,
  type Limits,
} from "@/lib/traicerArc";
import { CANT_PLAY_MESSAGE, PROBE_WAIT_MS, playbackGaveUp, probeDuration } from "@/lib/probeClip";
import { renderInput as fitRenderInput } from "@/lib/renderInput";
import { draftKey, dropDraft, readDrafts, upsertDraft, writeDrafts, type ClipDraft } from "@/lib/clipDraft";
import {
  DEFAULT_HANG,
  UNDO_MS,
  backStep,
  canOpenStep,
  clipStatusLabel,
  creditLabel,
  landingTapDecision,
  hangReadout,
  instruction,
  isTapStep,
  primaryButton,
  stepHang,
  viewportTooSmall,
} from "@/lib/editScreen";
import { advanceStep, chooseFps, frameIndex, medianFps, removeClip, restoreClip, stepFrames, type MarkStep } from "@/lib/editorUx";
import { parseTrajectory, rowsUntil, trailOpacity, type Trajectory } from "@/lib/trajectory";

type Tool = MarkStep;
type Points = { ball: NormPoint | null; impact: NormPoint | null; landing: NormPoint | null };
type Busy = "trace" | "update" | "render" | null;

type CurveSnapshot = {
  trajectory: Trajectory;
  arcModel: ArcModel | null;
  handles: CurveHandles | null;
  limits: Limits | null;
  fitId: string | null;
  hang: number;
  trackedFrames: number | null;
  landing: NormPoint | null;
  landingTime: number | null;
};
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
  impactTime: number | null;
  landingTime: number | null;
  hang: number;
  hangOverride: boolean;
  colour: string;
  busy: Busy;
  fitId: string | null;
  trackedFrames: number | null;
  arcModel: ArcModel | null;
  limits: Limits | null;
  handles: CurveHandles | null;
  preview: ArcModel | null;
  firstDraft: CurveSnapshot | null;
  phase: Phase;
  job: Job | null;
  trajectory: Trajectory | null;
  snappedBall: NormPoint | null;
  stepsOpen: boolean;
  portrait: boolean;
  tracerOn: boolean;
  step: Tool;
  hangFitted: boolean;
  poster: string | null;
};

const SWATCHES = [
  { name: "Ice", hex: "#2EE8FF" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Navy", hex: "#071526" },
  { name: "Yellow", hex: "#FFD60A" },
  { name: "Red", hex: "#FF5C76" },
] as const;

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

async function loadTrajectory(job: Job): Promise<{ trajectory: Trajectory | null; raw: unknown }> {
  if (job.trajectory) {
    const trajectory = parseTrajectory(job.trajectory);
    if (trajectory) return { trajectory, raw: job.trajectory };
  }
  if (!job.trajectoryUrl) return { trajectory: null, raw: null };
  const response = await fetch(job.trajectoryUrl);
  if (!response.ok) return { trajectory: null, raw: null };
  const raw = await response.json();
  return { trajectory: parseTrajectory(raw), raw };
}

export function TryEditor() {
  const base = readTraicerApiBase();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magRef = useRef<HTMLCanvasElement>(null);
  const hangTouched = useRef(false);
  const tokens = useRef<Record<string, number>>({});
  const aborts = useRef<Record<string, () => void>>({});

  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("ball");
  const [mag, setMag] = useState<{ x: number; y: number; touch: boolean } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [paused, setPaused] = useState(true);
  const [tapReject, setTapReject] = useState<string | null>(null);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [stageFull, setStageFull] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [undo, setUndo] = useState<{ clip: Clip; index: number } | null>(null);
  const [measuredFps, setMeasuredFps] = useState<number | null>(null);
  const undoTimer = useRef<number | null>(null);
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
  const gesture = useRef<number | null>(null);
  const videoSize = useRef({ width: 0, height: 0 });
  const [frame, setFrame] = useState({ width: 1280, height: 800 });
  useEffect(() => {
    const read = () => setFrame({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  useEffect(() => {
    let next = readDrafts(localStorage);
    for (const clip of clips) {
      const draft: ClipDraft = {
        key: draftKey(clip.file),
        name: clip.name,
        points: clip.points,
        impactTime: clip.impactTime,
        landingTime: clip.landingTime,
        hang: clip.hang,
        hangOverride: clip.hangOverride,
        hangFitted: clip.hangFitted,
        colour: clip.colour,
        portrait: clip.portrait,
        step: clip.id === selectedId ? tool : clip.step,
      };
      next = upsertDraft(next, draft);
    }
    writeDrafts(localStorage, next);
  }, [clips, selectedId, tool]);
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
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setStageFull(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const update = () => {
      const video = videoRef.current;
      if (!video?.videoWidth || !slot.clientWidth || !slot.clientHeight) return;
      const fit = contentRect(
        { left: 0, top: 0, width: slot.clientWidth, height: slot.clientHeight },
        video.videoWidth,
        video.videoHeight,
      );
      if (fit) setStageSize({ width: Math.floor(fit.width), height: Math.floor(fit.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", update);
    return () => {
      observer.disconnect();
      video?.removeEventListener("loadedmetadata", update);
    };
  }, [selected?.id, showResult]);

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
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", update);
      window.removeEventListener("resize", update);
    };
  }, [selected?.id, stageSize, showResult]);

  useEffect(() => {
    const video = videoRef.current;
    const clipId = selected?.id;
    if (!video || !clipId) return;
    const mark = () => {
      if (video.videoWidth > 0 && video.readyState >= 2) setReadyId(clipId);
    };
    mark();
    video.addEventListener("loadeddata", mark);
    video.addEventListener("canplay", mark);
    const timer = window.setInterval(mark, 200);
    return () => {
      video.removeEventListener("loadeddata", mark);
      video.removeEventListener("canplay", mark);
      window.clearInterval(timer);
    };
  }, [selected?.id, selected?.url]);

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
    if (!video || !("requestVideoFrameCallback" in video)) return;
    setMeasuredFps(null);
    setShowResult(false);
    const deltas: number[] = [];
    let last = -1;
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      if (last >= 0) {
        const delta = meta.mediaTime - last;
        if (delta > 0) deltas.push(delta);
        if (deltas.length > 8) deltas.shift();
        const fps = medianFps(deltas);
        if (fps) setMeasuredFps(fps);
      }
      last = meta.mediaTime;
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => video.cancelVideoFrameCallback(handle);
  }, [selected?.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Enter" && tool === "impact") {
        event.preventDefault();
        setImpact();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const video = videoRef.current;
      if (!video) return;
      event.preventDefault();
      if (!video.paused) video.pause();
      const fps = chooseFps(selected?.job?.fps, selected?.trajectory?.fps, measuredFps);
      const delta = (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1);
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
      const next = stepFrames(video.currentTime, fps, delta, duration);
      video.currentTime = next;
      setTime(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selected?.id, selected?.job?.fps, selected?.trajectory?.fps, measuredFps]);

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
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const paint = (pts: Array<{ x: number; y: number }>, colour: string, alpha: number, width: number) => {
        if (pts.length < 2 || alpha <= 0) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach((pt, index) => {
          const x = pt.x * box.width;
          const y = pt.y * box.height;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      if (clip.preview && clip.arcModel) {
        paint(
          arcPoints(clip.arcModel).map((row) => ({ x: row[1], y: row[2] })),
          clip.colour,
          0.28,
          2,
        );
        paint(
          arcPoints(clip.preview).map((row) => ({ x: row[1], y: row[2] })),
          clip.colour,
          1,
          3,
        );
      } else {
        const rows = rowsUntil(trajectory, now);
        const alpha = trailOpacity(now, trajectory.landingTime, trajectory.holdAfterLanding, trajectory.fadeDuration);
        paint(rows, clip.colour, alpha, 2 + (rows[rows.length - 1]?.widthFactor ?? 1) * 3);
      }
      const guide = clip.preview ? arcPoints(clip.preview) : null;
      const head = guide?.length ? { x: guide[guide.length - 1][1], y: guide[guide.length - 1][2] } : rowsUntil(trajectory, now).at(-1);
      if (clip.portrait && head) {
        const ball = head;
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

  function outputsFor(clip: Clip): OutputFormat[] {
    return clip.portrait ? ["mp4", "mp4_9x16"] : ["mp4"];
  }

  function draftInput(clip: Clip, handles?: CurveHandles | null): RenderInput {
    const landing = handles ? { x: handles.end.x, y: handles.end.y } : clip.points.landing;
    const body: RenderInput = { outputs: [], color: apiColour(clip.colour) };
    if (landing) body.landing = landing;
    const ball = clip.points.ball ?? clip.snappedBall;
    if (ball) body.ball = ball;
    if (clip.impactTime != null) body.impactTime = clip.impactTime;
    if (handles) {
      body.apex = { x: handles.apex.x, y: handles.apex.y, t: handles.apex.t };
      body.end = { x: handles.end.x, y: handles.end.y, t: handles.end.t };
    } else if (clip.hangOverride) {
      body.hangTime = clip.hang;
    } else if (clip.landingTime != null) {
      body.landingTime = clip.landingTime;
    } else {
      body.hangTime = clip.hang;
    }
    return body;
  }

  async function poll(clipId: string, jobId: string, token: number, kind: Exclude<Busy, null>): Promise<{ job: Job; fitId: string | null } | null> {
    if (!base) return null;
    const exporting = kind === "render";
    for (;;) {
      if (tokens.current[clipId] !== token) return null;
      const job = await getJob(base, jobId);
      if (tokens.current[clipId] !== token) return null;
      const loaded = job.status === "done" ? await loadTrajectory(job) : null;
      if (tokens.current[clipId] !== token) return null;
      let fitId: string | null = null;
      patch(clipId, (clip) => {
        const curve = loaded ? readServerCurve(loaded.raw) : null;
        const trajectory = loaded?.trajectory ?? clip.trajectory;
        fitId = curve?.fitId ?? job.fitId ?? clip.fitId;
        const hang = curve?.impliedHang ?? trajectory?.hangTime ?? clip.hang;
        const landing = curve?.handles ? { x: curve.handles.end.x, y: curve.handles.end.y } : clip.points.landing;
        const snapshot: CurveSnapshot | null =
          trajectory && curve
            ? {
                trajectory,
                arcModel: curve.arcModel,
                handles: curve.handles,
                limits: curve.limits,
                fitId,
                hang,
                trackedFrames: curve.trackedFrames,
                landing,
                landingTime: curve.handles?.end.t ?? clip.landingTime,
              }
            : null;
        const fresh = job.status === "done" && kind !== "render" && kind !== "update";
        return {
          ...clip,
          job,
          trajectory,
          snappedBall: job.ball ?? clip.snappedBall,
          phase: job.status === "done" ? (exporting ? "done" : "draft") : job.status === "error" ? "error" : clip.phase,
          stepsOpen: clip.stepsOpen,
          busy: job.status === "done" || job.status === "error" ? null : kind,
          fitId,
          trackedFrames: curve?.trackedFrames ?? (typeof job.trackedFrames === "number" ? job.trackedFrames : clip.trackedFrames),
          arcModel: job.status === "done" && !exporting && curve ? curve.arcModel : clip.arcModel,
          limits: job.status === "done" && !exporting && curve?.limits ? curve.limits : clip.limits,
          handles: job.status === "done" && !exporting && curve ? curve.handles : clip.handles,
          preview: job.status === "done" && !exporting ? null : clip.preview,
          hang: job.status === "done" && !exporting ? hang : clip.hang,
          hangOverride: job.status === "done" && !exporting ? false : clip.hangOverride,
          hangFitted: job.status === "done" && !exporting ? true : clip.hangFitted,
          points:
            job.status === "done" && kind === "update" && curve?.handles
              ? { ...clip.points, landing: { x: curve.handles.end.x, y: curve.handles.end.y } }
              : clip.points,
          firstDraft: clip.firstDraft ?? (fresh ? snapshot : null),
        };
      });
      if (job.status === "done" && clipId === selectedId) {
        if (job.ball) setTool((step) => advanceStep(step, "ball"));
        if (kind === "trace") setTool((step) => advanceStep(step, "draft"));
        if (kind === "update") setTool("render");
        if (kind === "render" && (job.playUrl || job.downloadUrl)) setShowResult(true);
      }
      if (job.status === "done" || job.status === "error") return { job, fitId };
      await sleep(2000);
    }
  }

  async function run(clip: Clip, input: RenderInput, kind: Exclude<Busy, null>) {
    if (!base || !clip.jobId) return null;
    if (kind === "render") {
      const decision = requestExport(clip.id);
      if (!decision.allowed) {
        setUpgrade(decision.reason);
        return null;
      }
    }
    const token = (tokens.current[clip.id] ?? 0) + 1;
    tokens.current[clip.id] = token;
    patch(clip.id, (current) => ({
      ...current,
      phase: kind === "render" ? "rendering" : kind === "trace" ? "drafting" : current.phase,
      busy: kind,
      job: null,
    }));
    try {
      await startRender(base, clip.jobId, input);
      return await poll(clip.id, clip.jobId, token, kind);
    } catch (error) {
      if (tokens.current[clip.id] !== token) return null;
      patch(clip.id, (current) => ({
        ...current,
        phase: "error",
        busy: null,
        job: {
          status: "error",
          progress: 0,
          message: "",
          error: plainError(error, "The tracer didn't finish."),
        },
      }));
      return null;
    }
  }

  async function traceClip(clip: Clip) {
    if (!clip.points.landing) return;
    await run(clip, draftInput(clip), "trace");
  }

  async function updateCurve(clip: Clip) {
    if (!clip.preview) return;
    await run(clip, draftInput(clip, curveHandles(clip.preview)), "update");
  }

  /** Render body: the API still validates landing, and ball + impactTime let it reuse the cached track. */
  function renderInput(clip: Clip, fitId: string): RenderInput {
    return fitRenderInput(draftInput(clip, clip.handles), fitId, outputsFor(clip));
  }

  async function renderClip(clip: Clip, allowRetry = true) {
    if (!clip.fitId || clip.preview) return;
    const result = await run(clip, renderInput(clip, clip.fitId), "render");
    if (result?.job.errorCode === "FIT_NOT_FOUND" && allowRetry && clip.handles) {
      const updated = await run(clip, draftInput(clip, clip.handles), "update");
      if (updated?.fitId) {
        await run({ ...clip, fitId: updated.fitId, preview: null }, renderInput(clip, updated.fitId), "render");
      }
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
      const saved = readDrafts(localStorage).find((item) => item.key === draftKey(file));
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
        points: saved?.points ?? { ball: null, impact: null, landing: null },
        impactTime: saved?.impactTime ?? null,
        landingTime: saved?.landingTime ?? null,
        hang: saved?.hang ?? DEFAULT_HANG,
        hangOverride: saved?.hangOverride ?? false,
        hangFitted: saved?.hangFitted ?? false,
        step: saved?.step ?? "ball",
        poster: null,
        colour: saved?.colour ?? "#2EE8FF",
        busy: null,
        fitId: null,
        trackedFrames: null,
        arcModel: null,
        limits: null,
        handles: null,
        preview: null,
        firstDraft: null,
        phase: "mark",
        job: null,
        trajectory: null,
        snappedBall: null,
        stepsOpen: true,
        portrait: saved?.portrait ?? false,
        tracerOn: true,
      };
      setClips((current) => [...current, clip]);
      setSelectedId((current) => {
        if (current) return current;
        setTool(saved?.step ?? "ball");
        return id;
      });
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

  const placeAt = useRef<(clientX: number, clientY: number) => void>(() => {});
  placeAt.current = (clientX, clientY) => {
    const video = videoRef.current;
    const clip = clipsRef.current.find((item) => item.id === selectedId) ?? null;
    const step = document.querySelector(".edit-app")?.getAttribute("data-step") || tool;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      videoSize.current = { width: video.videoWidth, height: video.videoHeight };
    }
    const width = video?.videoWidth || videoSize.current.width;
    const height = video?.videoHeight || videoSize.current.height;
    const layer = document.querySelector(".tap-layer");
    const box = layer?.getBoundingClientRect() ?? video?.getBoundingClientRect();
    const point = box && width > 0 && height > 0 ? framePoint(clientX, clientY, box, width, height) : null;
    const ready = Boolean(video && video.readyState >= 2 && width > 0 && height > 0);
    if (!video || !clip) {
      setTapReject("The video is not on the page.");
      return;
    }
    if (step === "ball") {
      if (!ready) {
        setTapReject("The frame is not ready yet.");
        return;
      }
      if (!point) {
        setTapReject("That tap missed the picture.");
        return;
      }
      setTapReject(null);
      patch(clip.id, (current) => ({ ...current, points: { ...current.points, ball: point }, step: "impact" }));
      setTool("impact");
      return;
    }
    const decision = landingTapDecision({
      step,
      ready,
      showingResult: showResult,
      onPicture: Boolean(point),
      impactTime: clip.impactTime,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : clip.duration,
    });
    if (!decision.ok) {
      setTapReject(decision.reason);
      return;
    }
    if (!point) {
      setTapReject("That tap missed the picture.");
      return;
    }
    setTapReject(null);
    const next = { ...clip, points: { ...clip.points, landing: point }, landingTime: decision.landingTime, hangOverride: false };
    patch(clip.id, (current) => ({
      ...current,
      points: { ...current.points, landing: point },
      landingTime: decision.landingTime,
      hangOverride: false,
      step: "landing",
    }));
    if (clip.upload !== "done" || !clip.jobId) {
      setTapReject("Landing is marked. The clip is still uploading, so the draft has not been sent.");
      return;
    }
    void traceClip(next);
  };

  useEffect(() => {
    function onDown(event: globalThis.PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select, label")) return;
      const pointerId = event.pointerId;
      const origin = { x: event.clientX, y: event.clientY };
      const generation = (gesture.current ?? 0) + 1;
      gesture.current = generation;
      const finish = (up: globalThis.PointerEvent) => {
        if (up.pointerId !== pointerId || up.type !== "pointerup") return;
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (gesture.current !== generation) return;
        gesture.current = null;
        placeAt.current(origin.x, origin.y);
      };
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  function setImpact() {
    const video = videoRef.current;
    const clip = selected;
    if (!video || !clip) return;
    patch(clip.id, (current) => ({ ...current, impactTime: video.currentTime }));
    setTool((step) => advanceStep(step, "impact"));
  }

  function drawMagnifier(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    const canvas = magRef.current;
    if (!video || !canvas || !video.videoWidth || showResult || !isTapStep(tool)) {
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
    setMag({
      x: event.clientX - stage.left,
      y: event.clientY - stage.top,
      touch: event.pointerType === "touch",
    });
    const ctx = canvas.getContext("2d");
    const box = measureContent();
    if (!ctx || !box) return;
    const sample = magnifierSample(point, video.videoWidth, video.videoHeight, box.width, box.height, canvas.clientWidth || canvas.width, 4);
    if (!sample) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(video, sample.sx, sample.sy, sample.srcW, sample.srcH, 0, 0, canvas.width, canvas.height);
    } catch {
      setMag(null);
    }
  }

  function resetClip(id: string) {
    tokens.current[id] = -1;
    patch(id, (clip) => ({
      ...clip,
      points: { ball: null, impact: null, landing: null },
      impactTime: null,
      landingTime: null,
      hang: DEFAULT_HANG,
      hangOverride: false,
      hangFitted: false,
      step: "ball",
      poster: clip.poster,
      busy: null,
      fitId: null,
      trackedFrames: null,
      arcModel: null,
      limits: null,
      handles: null,
      preview: null,
      firstDraft: null,
      phase: "mark",
      job: null,
      trajectory: null,
      snappedBall: null,
      stepsOpen: true,
    }));
    setResetId(null);
  }

  function moveHandle(kind: "apex" | "end", event: PointerEvent<HTMLElement>) {
    const video = videoRef.current;
    const clip = selected;
    if (!video || !clip?.arcModel) return;
    const point = framePoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
    if (!point) return;
    const next = kind === "apex" ? dragApex(clip.arcModel, point.x, point.y, clip.limits ?? undefined) : dragEnd(clip.arcModel, point.x, point.y, clip.limits ?? undefined);
    const moved = curveHandles(next);
    patch(clip.id, (current) => ({
      ...current,
      preview: next,
      hang: next.T,
      points: kind === "end" ? { ...current.points, landing: { x: moved.end.x, y: moved.end.y } } : current.points,
    }));
  }

  function resetShape(id: string) {
    patch(id, (clip) => {
      if (!clip.firstDraft) return clip;
      const saved = clip.firstDraft;
      return {
        ...clip,
        trajectory: saved.trajectory,
        arcModel: saved.arcModel,
        handles: saved.handles,
        limits: saved.limits,
        fitId: saved.fitId,
        hang: saved.hang,
        trackedFrames: saved.trackedFrames,
        hangOverride: false,
        preview: null,
        busy: null,
        points: { ...clip.points, landing: saved.landing },
        landingTime: saved.landingTime,
        phase: clip.phase === "done" ? "draft" : clip.phase,
      };
    });
  }

  function deleteClip(id: string) {
    tokens.current[id] = -1;
    aborts.current[id]?.();
    const result = removeClip(clips, id, selectedId);
    if (!result.removed) return;
    if (undo && undo.clip.id !== id) URL.revokeObjectURL(undo.clip.url);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setClips(result.clips);
    setSelectedId(result.selectedId);
    setUndo(result.removed);
    undoTimer.current = window.setTimeout(() => {
      setUndo((toast) => {
        if (toast?.clip.id !== id) return toast;
        URL.revokeObjectURL(toast.clip.url);
        return null;
      });
    }, UNDO_MS);
    writeDrafts(localStorage, dropDraft(readDrafts(localStorage), draftKey(result.removed.clip.file)));
  }

  function undoDelete() {
    setUndo((current) => {
      if (!current) return null;
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      setClips((clips) => restoreClip(clips, current));
      setSelectedId(current.clip.id);
      return null;
    });
  }

  function selectClip(clip: Clip) {
    setSelectedId(clip.id);
    setTool(clip.step);
    setShowResult(clip.step === "render" && Boolean(clip.job?.playUrl || clip.job?.downloadUrl) && !clip.preview);
  }

  function openStep(step: Tool) {
    if (!selected) return;
    const flags = {
      ball: Boolean(selected.points.ball || selected.snappedBall),
      impact: selected.impactTime != null,
      landing: Boolean(selected.points.landing),
      rendered: Boolean(selected.job?.playUrl || selected.job?.downloadUrl),
    };
    if (!canOpenStep(step, flags)) return;
    setTool(step);
    patch(selected.id, (clip) => ({ ...clip, step }));
    setShowResult(step === "render" && flags.rendered && !selected.preview);
  }

  function goBack() {
    const previous = backStep(tool);
    if (previous) openStep(previous);
  }

  function stepBy(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    const fps = chooseFps(selected?.job?.fps, selected?.trajectory?.fps, measuredFps);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const next = stepFrames(video.currentTime, fps, delta, duration);
    video.currentTime = next;
    setTime(next);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function changeHang(next: number) {
    if (!selected) return;
    patch(selected.id, (clip) => ({ ...clip, hang: stepHang(next, 0), hangOverride: true }));
  }

  function retryFind() {
    if (!selected) return;
    const clip = selected;
    patch(clip.id, (current) => ({
      ...current,
      phase: "mark",
      busy: null,
      job: current.job ? { ...current.job, status: "done", error: undefined, errorCode: undefined } : current.job,
    }));
    setTool("ball");
    if (clip.points.landing && clip.jobId) void traceClip({ ...clip, phase: "mark" });
  }

  function traceAll() {
    for (const clip of clips) {
      if (clip.upload === "done" && clip.points.landing && clip.phase !== "drafting" && clip.phase !== "rendering" && !clip.busy) {
        void traceClip(clip);
      }
    }
  }


  if (!base) {
    return (
      <div className="edit-app">
        <p className="form-alert" role="status">
          {MISSING_API_MESSAGE}
        </p>
      </div>
    );
  }

  const ballMissing = selected?.job?.errorCode === "BALL_NOT_FOUND";
  const renderFailed =
    !ballMissing && (selected?.job?.errorCode === "RENDER_FAILED" || (selected?.phase === "error" && Boolean(selected.fitId)));
  const rendered = Boolean(showResult && (selected?.job?.playUrl || selected?.job?.downloadUrl));
  const primary = primaryButton({
    step: tool,
    ballMissing,
    renderFailed,
    hasDraft: Boolean(selected?.fitId) && !selected?.preview,
    rendered,
    shapeDirty: Boolean(selected?.preview),
    busy: Boolean(selected?.busy),
  });
  const line = instruction({ step: tool, ballMissing: Boolean(ballMissing), renderFailed, rendered });
  const hangShown = hangReadout({
    fitted: Boolean(selected?.hangFitted),
    hangOverride: Boolean(selected?.hangOverride),
    hang: selected?.hang ?? DEFAULT_HANG,
  });
  const showFormat = Boolean(selected && (tool === "landing" || tool === "render" || tool === "shape"));
  const tooSmall = viewportTooSmall(frame.width, frame.height);
  const fps = chooseFps(selected?.job?.fps, selected?.trajectory?.fps, measuredFps);
  const duration = selected?.duration ?? 0;
  const flags = {
    ball: Boolean(selected?.points.ball || selected?.snappedBall),
    impact: selected?.impactTime != null,
    landing: Boolean(selected?.points.landing),
    rendered: Boolean(selected?.job?.playUrl || selected?.job?.downloadUrl),
  };
  const steps: Array<{ id: Tool; label: string; n: string }> = [
    { id: "ball", label: "Find ball", n: "1" },
    { id: "impact", label: "Impact", n: "2" },
    { id: "landing", label: "Landing", n: "3" },
    { id: "render", label: "Render", n: "4" },
  ];

  function pressPrimary() {
    if (!selected || !primary.enabled) return;
    if (primary.action === "impact") setImpact();
    if (primary.action === "render" || primary.action === "retry-render") void renderClip(selected);
    if (primary.action === "update") void updateCurve(selected);
    if (primary.action === "retry-find") retryFind();
  }

  function toggleFull() {
    const node = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    if (!node) return;
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (node.requestFullscreen?.() ?? node.webkitRequestFullscreen?.());
    }
  }

  return (
    <div
      className="edit-app"
      data-step={tool}
      data-upload={selected?.upload ?? ""}
      data-error={ballMissing ? "ball" : renderFailed ? "render" : ""}
      data-tap-reject={tapReject ?? ""}
    >
      <header className="app-bar">
        <Link href="/" className="wordmark-link">
          <img className="wordmark" src="/brand/logos/traicer-wordmark-light-tight.svg" alt="TrAIcer" width={423} height={192} />
        </Link>
        <span className="app-title">Edit</span>
        <button
          type="button"
          className="btn btn-secondary save-session"
          onClick={() => {
            setSessionSaved(true);
            window.setTimeout(() => setSessionSaved(false), 1500);
          }}
        >
          {sessionSaved ? "Saved" : "Save session"}
        </button>
      </header>
      <aside
        className="clip-rail"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }}
      >
        <label className="btn add-clip">
          + Add clip
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
        <ul className="clip-thumbs">
          {clips.map((clip, index) => (
            <li key={clip.id}>
              <button
                type="button"
                className={clip.id === selectedId ? "clip-thumb is-on" : "clip-thumb"}
                onClick={() => selectClip(clip)}
                title={clip.name}
              >
                {clip.poster ? <img src={clip.poster} alt="" /> : <span className="thumb-blank" />}
                <span>
                  Clip {index + 1} ·{" "}
                  {clipStatusLabel({
                    ball: Boolean(clip.points.ball || clip.snappedBall),
                    impact: clip.impactTime != null,
                    landing: Boolean(clip.points.landing),
                    drafted: clip.phase === "draft" || Boolean(clip.trajectory) || Boolean(clip.fitId),
                    rendered: clip.phase === "done",
                  })}
                </span>
              </button>
              <button type="button" className="clip-x" aria-label={`Remove ${clip.name}`} onClick={() => deleteClip(clip.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="rail-drop">Drop videos here or click to choose</div>
      </aside>
      <section className="edit-stage">
        <div className="stepper" role="tablist" aria-label="Steps">
          {steps.map((step) => {
            const active = tool === step.id;
            const done = !active && (step.id === "ball" ? flags.ball : step.id === "impact" ? flags.impact : step.id === "landing" ? flags.landing : flags.rendered);
            return (
              <button
                key={step.id}
                type="button"
                className={active ? "step is-active" : "step"}
                aria-current={active ? "step" : undefined}
                disabled={!selected || !canOpenStep(step.id, flags)}
                onClick={() => openStep(step.id)}
              >
                <i>{done ? "✓" : step.n}</i>
                {step.label}
              </button>
            );
          })}
          <button
            type="button"
            className={tool === "shape" ? "step is-optional is-active" : "step is-optional"}
            disabled={!selected || !canOpenStep("shape", flags)}
            onClick={() => openStep("shape")}
          >
            <i>+</i>
            Shape (optional)
          </button>
        </div>
        <p className="instruction">{tapReject ?? (selected ? line : "Add a clip to begin.")}</p>
        <div className="stage-slot" ref={slotRef}>
          <div
            className="stage"
            ref={stageRef}
            style={!stageFull && stageSize ? { width: stageSize.width, height: stageSize.height } : undefined}
          >
            {selected ? (
              <button type="button" className="stage-full" onClick={toggleFull}>
                {stageFull ? "Exit" : "Full screen"}
              </button>
            ) : null}
            {selected ? (
              <div className="stage-media">
                <video
                  key={rendered ? `${selected.id}-result` : selected.id}
                  ref={(node) => {
                    videoRef.current = node;
                    node?.setAttribute("playsinline", "");
                    node?.setAttribute("webkit-playsinline", "");
                  }}
                  className="frame-video"
                  src={rendered ? selected.job?.playUrl || selected.job?.downloadUrl : selected.url}
                  playsInline
                  muted
                  autoPlay={rendered}
                  preload="auto"
                  onPlay={() => setPaused(false)}
                  onPause={() => setPaused(true)}
                  onLoadedMetadata={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.readyState >= 2) setReadyId(selected.id);
                    const learned = video.duration;
                    if (Number.isFinite(learned) && learned > 0) {
                      patch(selected.id, (clip) => ({ ...clip, duration: learned }));
                      if (learned > MAX_CLIP_SECONDS) {
                        aborts.current[selected.id]?.();
                        setNotice(`${selected.name} is longer than 60 seconds.`);
                      }
                    }
                  }}
                  onCanPlay={() => setReadyId(selected.id)}
                  onLoadedData={() => {
                    setReadyId(selected.id);
                    const shot = videoRef.current;
                    if (shot?.videoWidth && !selected.poster) {
                      const canvas = document.createElement("canvas");
                      canvas.width = 160;
                      canvas.height = Math.max(1, Math.round((160 * shot.videoHeight) / shot.videoWidth));
                      canvas.getContext("2d")?.drawImage(shot, 0, 0, canvas.width, canvas.height);
                      const poster = canvas.toDataURL("image/jpeg", 0.72);
                      patch(selected.id, (clip) => (clip.poster ? clip : { ...clip, poster }));
                    }
                    const video = videoRef.current;
                    if (!video || video.currentTime !== 0) return;
                    try {
                      video.currentTime = 0.001;
                    } catch {
                      /* Leave the playhead if this frame is not seekable yet. */
                    }
                  }}
                  onError={() => setFailedId(selected.id)}
                  onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
                />
                <canvas ref={canvasRef} className="tracer-layer" hidden={showResult || !selected.tracerOn || !selected.trajectory} />
                {content ? (
                  <div className="content-frame" style={{ left: content.left, top: content.top, width: content.width, height: content.height }}>
                    {(selected.points.ball || selected.snappedBall) && !showResult ? (
                      <i
                        className="marker is-ball"
                        style={{
                          left: `${(selected.points.ball ?? selected.snappedBall)!.x * 100}%`,
                          top: `${(selected.points.ball ?? selected.snappedBall)!.y * 100}%`,
                        }}
                      />
                    ) : null}
                    {selected.points.landing && !showResult ? (
                      <i className="marker is-landing" style={{ left: `${selected.points.landing.x * 100}%`, top: `${selected.points.landing.y * 100}%` }} />
                    ) : null}
                  </div>
                ) : null}
                {isTapStep(tool) && !showResult ? (
                  <div
                    className={frameReady ? "tap-layer" : "tap-layer is-waiting"}
                    onPointerMove={drawMagnifier}
                    onPointerLeave={() => setMag(null)}
                  />
                ) : null}
                {content && tool === "shape" && !showResult
                  ? (() => {
                      const shown = selected.preview ? curveHandles(selected.preview) : selected.handles;
                      if (!shown) return null;
                      const bind = (kind: "apex" | "end") => ({
                        onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                        },
                        onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveHandle(kind, event);
                        },
                      });
                      return (
                        <div className="handle-layer" style={{ left: content.left, top: content.top, width: content.width, height: content.height }}>
                          <button type="button" className="handle is-apex" aria-label="Apex" style={{ left: `${shown.apex.x * 100}%`, top: `${shown.apex.y * 100}%` }} {...bind("apex")} />
                          <button type="button" className="handle is-end" aria-label="End" style={{ left: `${shown.end.x * 100}%`, top: `${shown.end.y * 100}%` }} {...bind("end")} />
                        </div>
                      );
                    })()
                  : null}
              </div>
            ) : (
              <div className="stage-media" />
            )}
            <canvas
              ref={magRef}
              width={160}
              height={160}
              className={mag?.touch ? "magnifier" : "magnifier is-centred"}
              hidden={!mag || !isTapStep(tool) || showResult}
              style={mag ? { left: mag.touch ? mag.x + 16 : mag.x - 70, top: mag.touch ? mag.y - 80 : mag.y - 70 } : undefined}
            />
            {rendered && paused === false ? <span className="playing">Playing</span> : null}
            {ballMissing ? (
              <div className="stage-alert" role="alert">
                <strong>Ball not found</strong>
                <span>Tap near the ball, or retry the auto-find.</span>
              </div>
            ) : null}
            {renderFailed ? (
              <div className="stage-alert" role="alert">
                <strong>Render failed</strong>
                <span>Your markings are safe.</span>
              </div>
            ) : null}
            {playbackError ? (
              <p className="stage-alert" role="alert">
                {CANT_PLAY_MESSAGE}
              </p>
            ) : null}
            {selected && !frameReady && !playbackError ? (
              <p className="loading-clip" role="status">
                Loading clip…
              </p>
            ) : null}
          </div>
        </div>
        <div className="transport">
          <button type="button" className="hit" aria-label="Previous frame" onClick={() => stepBy(-1)} disabled={!selected}>
            ‹
          </button>
          <button type="button" className="hit" aria-label={paused ? "Play" : "Pause"} onClick={togglePlay} disabled={!selected}>
            {paused ? "▶" : "❚❚"}
          </button>
          <button type="button" className="hit" aria-label="Next frame" onClick={() => stepBy(1)} disabled={!selected}>
            ›
          </button>
          <label className="scrub">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.001}
              value={Math.min(time, duration || 0)}
              aria-label="Scrub"
              disabled={!selected}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (videoRef.current) videoRef.current.currentTime = next;
                setTime(next);
              }}
            />
            {selected?.impactTime != null && duration > 0 ? (
              <i className="impact-mark" style={{ left: `${(selected.impactTime / duration) * 100}%` }} title="Impact" />
            ) : null}
          </label>
          <span className="frame-count">
            Frame {frameIndex(time, fps)} / {duration > 0 ? frameIndex(Math.max(0, duration - 1e-4), fps) : 0}
          </span>
        </div>
        <div className="hang-row">
          <span className="hang-label">Hang time</span>
          <button type="button" className="hit" aria-label="Decrease hang time" disabled={!selected} onClick={() => changeHang(stepHang(hangShown, -1))}>
            ‹
          </button>
          <input
            className="hang-slider"
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            aria-label="Hang time"
            value={hangShown}
            disabled={!selected}
            onChange={(event) => changeHang(Number(event.target.value))}
          />
          <button type="button" className="hit" aria-label="Increase hang time" disabled={!selected} onClick={() => changeHang(stepHang(hangShown, 1))}>
            ›
          </button>
          <output className="hang-value">{hangShown.toFixed(1)} s</output>
          <span className="row-gap" />
          <button type="button" className="btn btn-secondary" onClick={goBack} disabled={!selected || !backStep(tool)}>
            ‹ Back
          </button>
          {flags.rendered && tool !== "shape" ? (
            <button type="button" className="btn btn-secondary" onClick={() => openStep("shape")}>
              Shape (opt.)
            </button>
          ) : null}
          {showFormat ? (
            <label className="format-choice">
              <input
                type="checkbox"
                checked={Boolean(selected?.portrait)}
                onChange={(event) => {
                  if (!selected) return;
                  patch(selected.id, (clip) => ({ ...clip, portrait: event.target.checked }));
                }}
              />
              9:16
              <span>{creditLabel(Boolean(selected?.portrait))}</span>
            </label>
          ) : null}
          {primary.action === "export" && selected?.job?.downloadUrl ? (
            <a className="btn btn-primary" href={selected.job.downloadUrl}>
              Export
            </a>
          ) : (
            <button type="button" className={primary.enabled ? "btn btn-primary" : "btn btn-secondary"} disabled={!primary.enabled} onClick={pressPrimary}>
              {selected?.busy === "render" ? "Rendering…" : selected?.busy === "update" ? "Updating…" : primary.label}
            </button>
          )}
          {selected?.portrait && selected.job?.vertical?.downloadUrl ? (
            <a className="portrait-file" href={selected.job.vertical.downloadUrl}>
              9:16 file
            </a>
          ) : null}
        </div>
      </section>
      {tooSmall ? (
        <div className="enlarge" role="status">
          Please enlarge your window
        </div>
      ) : null}
      {notice ? (
        <p className="edit-notice" role="status">
          {notice}
        </p>
      ) : null}
      {undo ? (
        <div className="undo-toast" role="status">
          Clip removed.{" "}
          <button type="button" onClick={undoDelete}>
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
