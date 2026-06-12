import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function jod(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-JO", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " JD";
}
