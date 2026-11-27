"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/#try", label: "Try it" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
  { href: "/skill", label: "AI Skill" },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href.startsWith("/#")) return false;
  return pathname === href;
}

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const earlyHref = pathname === "/skill" ? "#early-access" : "/skill#early-access";

  return (
    <header className="site-header">
      <div className="wrap site-header-inner">
        <Link href="/" className="wordmark-link">
          <img
            className="wordmark"
            src="/brand/logos/traicer-wordmark-dark-nobg.svg"
            alt="TrAIcer"
            width={423}
            height={192}
          />
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <nav id="site-nav" className={open ? "site-nav is-open" : "site-nav"} aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href={earlyHref} className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
            Early access
          </Link>
        </nav>
      </div>
    </header>
  );
}
