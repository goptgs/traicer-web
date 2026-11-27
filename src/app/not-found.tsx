import Link from "next/link";

export default function NotFound() {
  return (
    <header className="page-hero">
      <div className="wrap">
        <p className="kicker">404</p>
        <h1>That page isn’t here</h1>
        <p className="lede">The link may be old. The tracer is still on the home page.</p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/">
            Home
          </Link>
          <Link className="btn btn-secondary" href="/help">
            Help
          </Link>
        </div>
      </div>
    </header>
  );
}
