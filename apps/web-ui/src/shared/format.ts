export const padNumber = (value: number): string => String(value).padStart(2, "0");

export const formatTime = (date: Date): string =>
  `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(
    date.getSeconds()
  )}`;

export const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
};

export const normalizePath = (value: string): string => value.trim().replace(/[\\/]+$/, "");

export const buildLineNumbers = (content: string): string => {
  const count = content.split("\n").length;
  const lines: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    lines.push(String(i));
  }
  return lines.join("\n");
};
