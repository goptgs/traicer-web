import { TryEditor } from "@/components/TryEditor";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Try it Free",
  description:
    "Try TrAIcer on your own clip. Mark the landing, set hang time and shot shape, then trace it.",
  path: "/try",
});

export default function TryPage() {
  return <TryEditor />;
}
