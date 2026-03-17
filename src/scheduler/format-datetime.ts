/**
 * Format a date for display in appointment emails using env:
 * APPOINTMENT_DATE_STYLE, APPOINTMENT_TIME_STYLE, APPOINTMENT_LOCALE.
 */
const dateStyle = (process.env.APPOINTMENT_DATE_STYLE ?? "long") as Intl.DateTimeFormatOptions["dateStyle"];
const timeStyle = (process.env.APPOINTMENT_TIME_STYLE ?? "short") as Intl.DateTimeFormatOptions["timeStyle"];
const locale = process.env.APPOINTMENT_LOCALE ?? "en-US";

const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle, timeStyle });

export function formatAppointmentDateTime(date: Date): string {
  return dateFormatter.format(date);
}
