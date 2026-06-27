/* Helper penomoran dokumen (bagian murni; increment atomik di API). */

/** Kunci periode dari tanggal ISO sesuai granularitas. "" = berkelanjutan. */
export function periodKey(dateIso: string, granularity: "none" | "year" | "month" = "year"): string {
  if (granularity === "none") return "";
  const [y, m] = dateIso.split("-");
  return granularity === "month" ? `${y}-${m}` : `${y}`;
}

/** Format nomor dokumen: `<prefix><period?>/<urut berpad>`. */
export function formatDocNumber(prefix: string, period: string, value: number, padding = 4): string {
  const seq = String(value).padStart(padding, "0");
  const mid = period ? `${period}/` : "";
  return `${prefix}${mid}${seq}`;
}
