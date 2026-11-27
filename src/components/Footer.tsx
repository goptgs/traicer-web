import Link from "next/link";
import { site } from "@/config/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <nav className="footer-nav" aria-label="Footer">
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help</Link>
          <Link href="/skill">AI Skill</Link>
          <Link href="/privacy">Privacy (draft)</Link>
          <Link href="/terms">Terms (draft)</Link>
        </nav>
        <p className="fine footer-meta">
          © {site.updated.slice(0, 4)} {site.publisher}. {site.url.replace("https://", "")}
        </p>
      </div>
    </footer>
  );
}
