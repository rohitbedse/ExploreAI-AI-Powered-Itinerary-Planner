export function formatMoney(amount: number, currency = "INR"): string {
  if (amount === 0) return "Free";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** A stop price. null/undefined means the price is unknown, which is NOT the same as free. */
export function formatStopCost(cost: number | null | undefined, currency = "INR"): string {
  return cost == null ? "Price unknown" : formatMoney(cost, currency);
}

/** Plan total. Unknown stays unknown; a partial total is shown as a lower bound. */
export function formatPlanCost(
  summary: { total_cost: number; currency: string; cost_status?: "known" | "partial" | "unknown" },
): string {
  if (summary.cost_status === "unknown") return "Price unknown";
  const text = formatMoney(summary.total_cost, summary.currency);
  return summary.cost_status === "partial" ? `${text}+` : text;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
