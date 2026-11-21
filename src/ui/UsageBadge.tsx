import type { PhotoUsageState } from "../core";

export function usageLabel(usage: number) {
  return `Used ${usage} ${usage === 1 ? "time" : "times"} in this Album`;
}

export default function UsageBadge({ usage }: { usage: PhotoUsageState }) {
  return <>
    {usage.count !== null && usage.count > 0 && <span className="photo-usage" aria-label={usageLabel(usage.count)}>{usage.count}</span>}
    {usage.status !== "ready" && <span className="photo-identity-status" title={usage.message}>
      {usage.status === "error" ? "Check failed" : "Checking..."}
    </span>}
  </>;
}
