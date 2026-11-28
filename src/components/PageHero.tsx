import type { ReactNode } from "react";

export function PageHero({
  kicker,
  title,
  lede,
}: {
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
}) {
  return (
    <header className="page-hero">
      <div className="wrap">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
    </header>
  );
}
