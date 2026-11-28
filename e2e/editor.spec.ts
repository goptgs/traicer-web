import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const clipPath = "/tmp/e2e-clip.mp4";
const cors = {
  "access-control-allow-origin": "http://127.0.0.1:4173",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "*",
};

const arc = {
  model: "traicer-arc-v1",
  x0: 0.42,
  y0: 0.62,
  t0: 0.2,
  xA: 0.56,
  yA: 0.23,
  TA: 3.47,
  xE: 0.71,
  yE: 0.78,
  T: 6.8,
  b: 0.03,
  c: 0.002,
  d: 0,
  riseExp: 4.5,
  fallExp: 2,
  launchTan: 0.12,
  aspect: 16 / 9,
  hangK: 9.88,
};

function job(play: boolean) {
  return {
    status: "done",
    progress: 1,
    fitId: "fit-1",
    ...(play
      ? { playUrl: "http://127.0.0.1:4173/e2e-clip.mp4", downloadUrl: "http://127.0.0.1:4173/e2e-clip.mp4" }
      : {}),
    ball: { x: 0.4, y: 0.6 },
    fps: 30,
    trajectory: {
      fps: 30,
      impactTime: 0.2,
      landingTime: 1.2,
      hangTime: 6.8,
      frames: { rows: [[0, 0.4, 0.6, 1], [15, 0.55, 0.3, 1], [30, 0.71, 0.78, 1]] },
      fitId: "fit-1",
      impliedHang: 6.8,
      trackedFrames: 8,
      handles: {
        impact: { x: 0.42, y: 0.62, t: 0.2 },
        apex: { x: 0.56, y: 0.23, t: 0.7 },
        end: { x: 0.71, y: 0.78, t: 1.2 },
      },
      arcModel: arc,
    },
  };
}

test.beforeAll(() => {
  mkdirSync("out", { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=1920x1080:rate=30:duration=2",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    clipPath,
  ]);
  execFileSync("cp", [clipPath, "out/e2e-clip.mp4"]);
});

async function installApi(page: Page, bodies: unknown[]) {
  const fulfill = async (route: Route, body: unknown) => {
    await route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "OPTIONS" && url.includes("modal.run")) {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (url.endsWith("/put") || url.includes("/put?")) {
      await route.fulfill({ status: 200, headers: cors, body: "" });
      return;
    }
    if (!url.includes("modal.run")) {
      await route.continue();
      return;
    }
    if (url.includes("/api/uploads")) {
      await fulfill(route, { jobId: "job-1", uploadUrl: "http://127.0.0.1:4173/put", key: "k" });
      return;
    }
    if (request.method() === "POST" && url.includes("/render")) {
      const payload = request.postDataJSON() as { outputs?: string[]; apex?: unknown };
      bodies.push(payload);
      await fulfill(route, { status: "queued" });
      return;
    }
    if (url.includes("/api/jobs/")) {
      const last = bodies.at(-1) as { outputs?: string[] } | undefined;
      await fulfill(route, job(Boolean(last?.outputs?.includes("mp4"))));
      return;
    }
    await route.continue();
  });
}

test("marks a real clip through landing, render, shape, and a second render", async ({ page }) => {
  const bodies: unknown[] = [];
  await page.addInitScript(() => localStorage.clear());
  await installApi(page, bodies);
  await page.goto("/try");
  await page.locator("input[type=file]").setInputFiles(clipPath);
  await expect(page.locator("video")).toHaveCount(1);
  await page.waitForFunction(() => document.querySelector(".stage video") && (document.querySelector(".stage video") as HTMLVideoElement).videoWidth === 1920);
  await page.waitForFunction(() => document.querySelector(".edit-app")?.getAttribute("data-upload") === "done");
  await page.waitForFunction(() => document.querySelector(".tap-layer") && !document.querySelector(".tap-layer.is-waiting"));
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByText("Clip 1 · Not started")).toBeVisible();

  const box = await page.locator(".stage video").boundingBox();
  if (!box) throw new Error("video has no box");
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.55);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.55);
  await expect(page.getByText("Clip 1 · Ball set")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);

  await page.getByRole("button", { name: "Set impact" }).click();
  await expect(page.getByText("Clip 1 · Impact set")).toBeVisible();
  await expect(page.getByText("Tap where the ball landed.")).toBeVisible();
  await page.evaluate(async () => {
    const video = document.querySelector(".stage video") as HTMLVideoElement;
    video.pause();
    video.currentTime = 1;
    await new Promise((resolve) => {
      video.onseeked = () => resolve(null);
      setTimeout(resolve, 4000);
    });
  });

  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.72, { steps: 8 });
  await expect(page.locator(".magnifier")).toBeVisible();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.72);
  await expect(page.locator(".marker.is-landing")).toBeVisible();
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(JSON.stringify(bodies[0])).toContain('"outputs":[]');
  await expect(page.getByText("Clip 1 · Drafted")).toBeVisible();
  await expect(page.getByText("6.8 s")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);

  await page.getByRole("button", { name: "Render", exact: true }).click();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
  await expect(page.getByText("Clip 1 · Rendered")).toBeVisible();
  await expect.poll(async () => page.locator(".stage video").getAttribute("src")).toContain("e2e-clip.mp4");
  await expect(page.locator("video")).toHaveCount(1);

  await page.getByRole("button", { name: "Shape (opt.)" }).click();
  const apex = page.getByRole("button", { name: "Apex" });
  await expect(apex).toBeVisible();
  const handle = await apex.boundingBox();
  if (!handle) throw new Error("apex has no box");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 36, handle.y + handle.height / 2 + 28, { steps: 6 });
  await page.mouse.up();
  const update = page.getByRole("button", { name: "Update curve" });
  await expect(update).toBeEnabled();
  await update.click();
  await expect.poll(() => bodies.some((body) => JSON.stringify(body).includes("apex"))).toBe(true);
  await page.getByRole("button", { name: "Render", exact: true }).click();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
});

test("landing click after a seek on a 4K 120fps clip", async ({ page }) => {
  const fourK = "/tmp/e2e-4k120.mp4";
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=3840x2160:rate=120:duration=2",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    fourK,
  ]);
  const bodies: unknown[] = [];
  await page.addInitScript(() => localStorage.clear());
  await installApi(page, bodies);
  await page.goto("/try");
  await page.locator("input[type=file]").setInputFiles(fourK);
  await page.waitForFunction(() => (document.querySelector(".stage video") as HTMLVideoElement | null)?.videoWidth === 3840);
  await page.waitForFunction(() => document.querySelector(".edit-app")?.getAttribute("data-upload") === "done");
  await page.waitForFunction(() => document.querySelector(".tap-layer") && !document.querySelector(".tap-layer.is-waiting"));
  await expect(page.locator("video")).toHaveCount(1);

  const tapAt = async (nx: number, ny: number) => {
    const box = await page.locator(".tap-layer, .stage-media").first().boundingBox();
    if (!box) throw new Error("no tap target");
    return { x: box.x + nx * box.width, y: box.y + ny * box.height };
  };
  const ball = await tapAt(0.4905, 0.5897);
  await page.touchscreen.tap(ball.x, ball.y);
  await expect(page.getByText("Clip 1 · Ball set")).toBeVisible();
  await page.getByRole("button", { name: "Set impact", exact: true }).click();
  await expect(page.getByText("Tap where the ball landed.")).toBeVisible();

  await page.evaluate(async () => {
    const video = document.querySelector(".stage video") as HTMLVideoElement;
    video.pause();
    video.currentTime = 10.28;
    await new Promise((resolve) => {
      video.onseeked = () => resolve(null);
      setTimeout(resolve, 4000);
    });
  });
  await page.waitForTimeout(250);
  const landing = await tapAt(0.5022, 0.5195);
  await page.mouse.move(landing.x, landing.y);
  await expect(page.locator(".magnifier:not([hidden])")).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(".marker.is-landing")).toBeVisible();
  await expect.poll(() => bodies.some((body) => JSON.stringify(body).includes('"outputs":[]'))).toBe(true);
  await expect(page.getByText("Clip 1 · Drafted")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
});

test("119.88 fps, 492 frames: frame 308 sets landing and 10.28s is not silent", async ({ page }) => {
  const fps = 120000 / 1001;
  const frames = 492;
  const path = "/tmp/e2e-11988.mp4";
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=640x360:rate=${fps}:duration=${frames / fps}`,
    "-frames:v",
    String(frames),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path,
  ]);
  const bodies: unknown[] = [];
  await page.addInitScript(() => localStorage.clear());
  await installApi(page, bodies);
  await page.goto("/try");
  await page.locator("input[type=file]").setInputFiles(path);
  await page.waitForFunction(() => (document.querySelector(".stage video") as HTMLVideoElement | null)?.videoWidth === 640);
  await page.waitForFunction(() => document.querySelector(".edit-app")?.getAttribute("data-upload") === "done");
  await page.waitForFunction(() => document.querySelector(".tap-layer") && !document.querySelector(".tap-layer.is-waiting"));

  const seek = async (time: number) => {
    await page.evaluate(async (time) => {
      const video = document.querySelector(".stage video") as HTMLVideoElement;
      video.pause();
      video.currentTime = time;
      await new Promise((resolve) => {
        video.onseeked = () => resolve(null);
        setTimeout(resolve, 4000);
      });
    }, time);
    await page.waitForTimeout(250);
  };
  const clickNorm = async (nx: number, ny: number) => {
    const box = await page.locator(".tap-layer, .stage-media").first().boundingBox();
    if (!box) throw new Error("no tap target");
    await page.mouse.click(box.x + nx * box.width, box.y + ny * box.height);
  };

  await clickNorm(0.49, 0.59);
  await expect(page.getByText("Clip 1 · Ball set")).toBeVisible();
  await seek(141 / fps);
  await page.getByRole("button", { name: "Set impact", exact: true }).click();
  await expect(page.getByText("Tap where the ball landed.")).toBeVisible();
  await seek(308 / fps);
  await clickNorm(0.5022, 0.5195);
  await expect(page.locator(".marker.is-landing")).toBeVisible();
  await expect(page.getByText("Clip 1 · Landing set")).toBeVisible();
  await expect.poll(() => bodies.some((body) => JSON.stringify(body).includes('"outputs":[]'))).toBe(true);

  await seek(10.28);
  await clickNorm(0.51, 0.48);
  const outcome = await page.evaluate(() => ({
    reject: document.querySelector(".edit-app")?.getAttribute("data-tap-reject") ?? "",
    instruction: document.querySelector(".instruction")?.textContent ?? "",
    marker: Boolean(document.querySelector(".marker.is-landing")),
  }));
  expect(outcome.marker || /after the impact|maximum is 10|missed the picture|not ready|still uploading/.test(`${outcome.reject} ${outcome.instruction}`)).toBeTruthy();
});
