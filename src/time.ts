import { Time } from "koishi";

export function formatKoishiDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const timestamp = date.valueOf();
  if (!Number.isFinite(timestamp)) return "Invalid Date";

  const localDate = new Date(timestamp - Time.getTimezoneOffset() * Time.minute);
  const datePart = [
    localDate.getUTCFullYear(),
    Time.toDigits(localDate.getUTCMonth() + 1),
    Time.toDigits(localDate.getUTCDate()),
  ].join("-");
  const timePart = [
    Time.toDigits(localDate.getUTCHours()),
    Time.toDigits(localDate.getUTCMinutes()),
    Time.toDigits(localDate.getUTCSeconds()),
  ].join(":");

  return `${datePart} ${timePart}`;
}
