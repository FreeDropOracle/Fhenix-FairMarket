export type StatusPillTone = "success" | "warning" | "danger" | "neutral";

type StatusPillProps = {
  label: string;
  tone: StatusPillTone;
  pulse?: boolean;
};

export function StatusPill({ label, tone, pulse = false }: StatusPillProps) {
  return (
    <span className="status-pill" data-tone={tone}>
      <span className="status-pill__dot" data-pulse={pulse} />
      {label}
    </span>
  );
}
