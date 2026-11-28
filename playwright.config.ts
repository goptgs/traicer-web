import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 720 },
    hasTouch: true,
    launchOptions: {
      executablePath: "/usr/bin/google-chrome-stable",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "npx serve out -p 4173",
    url: "http://127.0.0.1:4173/try",
    reuseExistingServer: false,
  },
});
