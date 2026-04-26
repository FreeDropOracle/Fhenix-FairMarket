import { StatusPill } from "@/components/status-pill";

type RoutePlaceholderProps = {
  kicker: string;
  title: string;
  description: string;
  highlights: string[];
};

export function RoutePlaceholder({ kicker, title, description, highlights }: RoutePlaceholderProps) {
  return (
    <main className="page-grid">
      <section className="section-block">
        <div className="placeholder-shell">
          <div className="placeholder-panel">
            <StatusPill label={kicker} tone="neutral" />
            <h1 className="placeholder-title">{title}</h1>
            <p className="placeholder-copy">{description}</p>
          </div>
          <article className="placeholder-panel">
            <p className="eyebrow">Next implementation slice</p>
            <ul className="placeholder-list">
              {highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
