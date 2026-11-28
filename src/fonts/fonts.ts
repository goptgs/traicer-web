import localFont from "next/font/local";

export const rajdhani = localFont({
  src: [
    { path: "./Rajdhani-Medium.woff2", weight: "500", style: "normal" },
    { path: "./Rajdhani-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./Rajdhani-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-rajdhani",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const inter = localFont({
  src: [
    { path: "./Inter-roman.woff2", weight: "100 900", style: "normal" },
    { path: "./Inter-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
});
