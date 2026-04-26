import Link from "next/link";

import { StatusPill } from "@/components/status-pill";

type RouteCardProps = {
  href: string;
  kicker: string;
  title: string;
  description: string;
  badge: string;
};

export function RouteCard({ href, kicker, title, description, badge }: RouteCardProps) {
  return (
    <article className="route-card">
      <span className="route-kicker">{kicker}</span>
      <h3 className="route-title">{title}</h3>
      <p className="route-description">{description}</p>
      <div className="route-footer">
        <StatusPill label={badge} tone="neutral" />
        <Link className="route-link" href={href}>
          Open route
        </Link>
      </div>
    </article>
  );
}
