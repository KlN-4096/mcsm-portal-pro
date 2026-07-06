const MINUTE_MS = 60_000;

export function formatKoishiDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const timestamp = date.valueOf();
  if (!Number.isFinite(timestamp)) return "Invalid Date";

  const localDate = new Date(timestamp - new Date().getTimezoneOffset() * MINUTE_MS);
  const datePart = [
    localDate.getUTCFullYear(),
    toDigits(localDate.getUTCMonth() + 1),
    toDigits(localDate.getUTCDate()),
  ].join("-");
  const timePart = [
    toDigits(localDate.getUTCHours()),
    toDigits(localDate.getUTCMinutes()),
    toDigits(localDate.getUTCSeconds()),
  ].join(":");

  return `${datePart} ${timePart}`;
}

function toDigits(source: number, length = 2) {
  return source.toString().padStart(length, "0");
}
