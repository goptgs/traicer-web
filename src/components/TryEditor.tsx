"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
import { advanceStep, chooseFps, frameIndex, medianFps, removeClip, restoreClip, stepFrames, stepPrompt, type MarkStep } from "@/lib/editorUx";
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
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", update);
    };
  }, [selected?.id]);

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
        points: { ball: null, impact: null, landing: null },
        impactTime: null,
        landingTime: null,
        hang: 6,
        hangOverride: false,
        colour: "#2EE8FF",
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
    if (!video || !clip || !clip.stepsOpen || !frameReady || showResult) return;
    if (tool !== "ball" && tool !== "landing") return;
    const point = framePoint(
      event.clientX,
      event.clientY,
      video.getBoundingClientRect(),
      video.videoWidth,
      video.videoHeight,
    );
    if (!point) return;
    if (tool === "ball") {
      patch(clip.id, (current) => ({ ...current, points: { ...current.points, ball: point } }));
      setTool("impact");
      return;
    }
    const landingTime = video.currentTime;
    const next = { ...clip, points: { ...clip.points, landing: point }, landingTime, hangOverride: false };
    patch(clip.id, (current) => ({ ...current, points: { ...current.points, landing: point }, landingTime, hangOverride: false }));
    if (clip.upload === "done" && clip.jobId) void traceClip(next);
  }

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
    if (!video || !canvas || !video.videoWidth || !selected?.stepsOpen || showResult || (tool !== "ball" && tool !== "landing")) {
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
      hang: 6,
      hangOverride: false,
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
    }, 5000);
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

  function traceAll() {
    for (const clip of clips) {
      if (clip.upload === "done" && clip.points.landing && clip.phase !== "drafting" && clip.phase !== "rendering" && !clip.busy) {
        void traceClip(clip);
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
        <div className={selected ? "edit-layout is-focus" : "edit-layout"}>
          <aside className="clip-list">
            <h2>Clips ({clips.length})</h2>
            <ul>
              {clips.map((clip, index) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    className="clip-select"
                    title={clip.name}
                    aria-current={clip.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(clip.id)}
                  >
                    <strong className="clip-name">{clip.name}</strong>
                    <span className="clip-index">{index + 1}</span>
                    <span>
                      {clock(clip.duration)} · {clipStatus(clip)}
                    </span>
                  </button>
                  <button type="button" className="clip-remove" title={clip.name} aria-label={`Remove ${clip.name}`} onClick={() => deleteClip(clip.id)}>
                    ×
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
              <p className="step-prompt">{stepPrompt(tool)}</p>
              <div className="stage-slot" ref={slotRef}>
              <div className="stage" ref={stageRef} style={!stageFull && stageSize ? { width: stageSize.width, height: stageSize.height } : undefined}>
                <button
                  type="button"
                  className="stage-full"
                  onClick={() => {
                    const node = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
                    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
                    if (!node) return;
                    if (document.fullscreenElement || doc.webkitFullscreenElement) {
                      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
                    } else {
                      void (node.requestFullscreen?.() ?? node.webkitRequestFullscreen?.());
                    }
                  }}
                >
                  Full screen
                </button>
                <div className="stage-media">
                  <video
                    key={showResult && (selected.job?.playUrl || selected.job?.downloadUrl) ? `${selected.id}-result` : selected.id}
                    ref={(node) => {
                      videoRef.current = node;
                      node?.setAttribute("playsinline", "");
                      node?.setAttribute("webkit-playsinline", "");
                    }}
                    className="frame-video"
                    src={showResult && (selected.job?.playUrl || selected.job?.downloadUrl) ? selected.job.playUrl || selected.job.downloadUrl : selected.url}
                    playsInline
                    muted
                    controls={showResult}
                    autoPlay={showResult}
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
                    onLoadedData={() => {
                      setReadyId(selected.id);
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
                      {selected.points.ball && !showResult ? (
                        <i className="marker is-ball" style={{ left: `${selected.points.ball.x * 100}%`, top: `${selected.points.ball.y * 100}%` }} />
                      ) : null}
                      {selected.snappedBall && !showResult ? (
                        <i
                          className="marker is-found"
                          title="Ball found"
                          style={{ left: `${selected.snappedBall.x * 100}%`, top: `${selected.snappedBall.y * 100}%` }}
                        />
                      ) : null}
                      {selected.points.impact && !showResult ? (
                        <i
                          className="marker is-impact"
                          title="Impact"
                          style={{ left: `${selected.points.impact.x * 100}%`, top: `${selected.points.impact.y * 100}%` }}
                        />
                      ) : null}
                      {selected.points.landing && !showResult ? (
                        <i
                          className="marker is-landing"
                          style={{ left: `${selected.points.landing.x * 100}%`, top: `${selected.points.landing.y * 100}%` }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {!showResult ? (
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
                            <i className="handle is-impact" title="Impact" style={{ left: `${shown.impact.x * 100}%`, top: `${shown.impact.y * 100}%` }} />
                            <button type="button" className="handle is-apex" aria-label="Apex" style={{ left: `${shown.apex.x * 100}%`, top: `${shown.apex.y * 100}%` }} {...bind("apex")} />
                            <button type="button" className="handle is-end" aria-label="End" style={{ left: `${shown.end.x * 100}%`, top: `${shown.end.y * 100}%` }} {...bind("end")} />
                          </div>
                        );
                      })()
                    : null}
                </div>
                <canvas
                  ref={magRef}
                  width={160}
                  height={160}
                  className={mag?.touch ? "magnifier" : "magnifier is-centred"}
                  hidden={!mag || (tool !== "ball" && tool !== "landing") || showResult}
                  style={mag ? { left: mag.touch ? mag.x + 16 : mag.x - 70, top: mag.touch ? mag.y - 80 : mag.y - 70 } : undefined}
                />
                {!frameReady && !playbackError ? (
                  <p className="loading-clip" role="status">
                    Loading clip…
                  </p>
                ) : null}
              </div>
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
                Frame {frameIndex(time, chooseFps(selected.job?.fps, selected.trajectory?.fps, measuredFps))} · {clock(time)} / {clock(selected.duration)}
                {uploadLabel(selected)}
              </p>
              <div className="action-bar">
                {(tool === "shape" || selected.preview) && selected.trajectory ? (
                  <button
                    type="button"
                    className={selected.preview ? "btn btn-primary" : "btn btn-secondary"}
                    disabled={!selected.preview || selected.busy != null}
                    onClick={() => void updateCurve(selected)}
                  >
                    {selected.busy === "update" ? "Updating curve..." : "Update curve"}
                  </button>
                ) : null}
                {selected.trajectory && selected.phase !== "drafting" && selected.phase !== "rendering" && (selected.phase !== "done" || selected.preview) ? (
                  <button
                    type="button"
                    className={selected.preview ? "btn btn-secondary" : "btn btn-primary"}
                    disabled={selected.upload !== "done" || !selected.points.landing || Boolean(selected.preview) || !selected.fitId || selected.busy != null}
                    onClick={() => void renderClip(selected)}
                  >
                    {selected.busy === "render" ? "Rendering…" : "Render"}
                  </button>
                ) : selected.phase === "drafting" || selected.phase === "rendering" || !selected.trajectory ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      selected.upload !== "done" ||
                      !selected.points.landing ||
                      selected.phase === "drafting" ||
                      selected.phase === "rendering" ||
                      selected.busy != null
                    }
                    onClick={() => void traceClip(selected)}
                  >
                    {selected.phase === "rendering" ? "Rendering…" : selected.phase === "drafting" ? "Tracing…" : "Trace this clip"}
                  </button>
                ) : null}
                {selected.preview ? <p className="export-note">Update curve first</p> : null}
                {selected.trajectory ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowResult(false);
                      setTool("shape");
                      patch(selected.id, (clip) => ({ ...clip, stepsOpen: true }));
                    }}
                  >
                    Adjust shape
                  </button>
                ) : null}
                {selected.job?.playUrl || selected.job?.downloadUrl ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowResult((on) => {
                        if (on) setTool("shape");
                        return !on;
                      });
                    }}
                  >
                    {showResult ? "Edit" : "Result"}
                  </button>
                ) : null}
                {selected.job?.downloadUrl ? (
                  <a className="btn btn-secondary" href={selected.job.downloadUrl}>
                    Download
                  </a>
                ) : null}
                {selected.job?.vertical?.downloadUrl ? (
                  <a className="btn btn-secondary" href={selected.job.vertical.downloadUrl}>
                    Download 9:16
                  </a>
                ) : null}
              </div>
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
                      n={1}
                      title="Find ball location"
                      done={Boolean(selected.points.ball || selected.snappedBall)}
                      onEdit={() => setTool("ball")}
                      active={tool === "ball"}
                    >
                      We can find it automatically, and you can tap near the ball to speed it up.
                    </Step>
                    <Step n={2} title="Set impact" done={selected.impactTime != null} onEdit={() => setTool("impact")} active={tool === "impact"}>
                      Scrub to the strike, then set that frame. Enter works too.
                      <button type="button" className="btn btn-primary" onClick={setImpact}>
                        Set impact
                      </button>
                    </Step>
                    <Step n={3} title="Landing" done={Boolean(selected.points.landing)} onEdit={() => setTool("landing")} active={tool === "landing"}>
                      Scrub to the landing, then tap it.
                    </Step>
                    <Step n={4} title="Render" done={selected.phase === "done"} onEdit={() => { setShowResult(false); setTool("render"); }} active={tool === "render"}>
                      <p>The line is ready. Render it. Adjusting the shape is optional, after you have watched it.</p>
                    </Step>
                    {tool === "shape" ? (
                      <section className="step-card is-on">
                        <div className="step-head">
                          <span>Adjust shape</span>
                        </div>
                        <p>Drag the apex or end point, then press Update curve. Optional.</p>
                        <label className="hang">
                          {selected.hang.toFixed(1)} s
                          <input
                            type="range"
                            min={2}
                            max={10}
                            step={0.1}
                            value={selected.hang}
                            onChange={(event) => {
                              hangTouched.current = true;
                              const hang = Number(event.target.value);
                              patch(selected.id, (clip) => ({ ...clip, hang, hangOverride: true }));
                            }}
                            onPointerUp={(event) => {
                              if (!hangTouched.current || !selected.points.landing) return;
                              hangTouched.current = false;
                              const hang = Number(event.currentTarget.value);
                              void traceClip({ ...selected, hang, hangOverride: true });
                            }}
                            onKeyUp={(event) => {
                              if (!hangTouched.current || !selected.points.landing) return;
                              hangTouched.current = false;
                              const hang = Number(event.currentTarget.value);
                              void traceClip({ ...selected, hang, hangOverride: true });
                            }}
                          />
                        </label>
                        {selected.trackedFrames === 0 ? (
                          <p className="export-note">Couldn't track the ball's start, so the start direction is estimated.</p>
                        ) : null}
                        {selected.firstDraft ? (
                          <button type="button" className="text-link" onClick={() => resetShape(selected.id)}>
                            Reset shape
                          </button>
                        ) : null}
                      </section>
                    ) : null}
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
                      Impact {selected.impactTime != null ? "✓" : "—"}{" "}
                      <button type="button" className="edit-chip" onClick={() => { patch(selected.id, (clip) => ({ ...clip, stepsOpen: true })); setTool("impact"); }}>
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
                      <button type="button" className="edit-chip" onClick={() => { patch(selected.id, (clip) => ({ ...clip, stepsOpen: true })); setTool("shape"); }}>
                        Edit
                      </button>
                    </li>
                    <li>
                      Shape {selected.trajectory ? "✓" : "—"}{" "}
                      <button type="button" className="edit-chip" onClick={() => patch(selected.id, (clip) => ({ ...clip, stepsOpen: true }))}>
                        Edit
                      </button>
                    </li>
                  </ul>
                )}
                <details className="more-options">
                  <summary>Colour, crop and tracer</summary>
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
                        onClick={() => {
                          setCustom(swatch.hex);
                          patch(selected.id, (clip) => ({ ...clip, colour: swatch.hex }));
                        }}
                      />
                    ))}
                    <label className="custom-colour">
                      Custom
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(selected.colour) ? selected.colour : /^#[0-9a-fA-F]{6}$/.test(custom) ? custom : "#2EE8FF"}
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
                        checked={Boolean(selected.trajectory) && selected.tracerOn}
                        disabled={!selected.trajectory}
                    onChange={(event) => {
                      const tracerOn = event.target.checked;
                      patch(selected.id, (clip) => ({ ...clip, tracerOn }));
                    }}
                  />
                  Tracer layer
                </label>
                </details>

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

                {selected.busy === "update" ? (
                  <p className="trace-status" role="status">
                    Updating curve...
                  </p>
                ) : null}
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
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void (selected.fitId && !selected.preview ? renderClip(selected) : traceClip(selected))}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}

              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {undo ? (
        <div className="undo-toast" role="status">
          <span>{undo.clip.name} removed.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={undoDelete}>
            Undo
          </button>
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
  if (clip.busy === "update") return "Updating curve";
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
  n,
  title,
  done,
  active,
  onEdit,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  const tone = active ? "is-on" : done ? "is-done" : "is-dim";
  return (
    <section className={`step-card ${tone}`}>
      <div className="step-head">
        <span className="step-num" aria-hidden="true">{done && !active ? "✓" : n}</span>
        <span>{title}</span>
        <button type="button" className="edit-chip" onClick={onEdit}>
          Edit
        </button>
      </div>
      {active ? <div>{children}</div> : null}
    </section>
  );
}

