const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "Not given";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    if (month) return `${Number(iso[3])} ${month} ${iso[1]}`;
  }
  if (/^\d{4}$/.test(value)) return value;
  return value;
}

export function sentences(reason: string): string[] {
  const parts = reason
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [reason];
}

export function blank(value: string | null | undefined): string {
  if (!value || !value.trim()) return "Not given";
  return value;
}
