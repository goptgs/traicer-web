import { TryMock } from "@/components/TryMock";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Try it Free",
  description:
    "A preview of the TrAIcer editor: drop clips, mark the landing, set hang time and shot shape, preview, and export 4K. Nothing is uploaded yet.",
  path: "/try",
});

export default function TryPage() {
  return <TryMock />;
}
