export type StatusPillTone = "success" | "warning" | "danger" | "neutral";

type StatusPillProps = {
  label: string;
  tone: StatusPillTone;
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span className="status-pill" data-tone={tone}>
      <span className="status-pill__dot" />
      {label}
    </span>
  );
}
