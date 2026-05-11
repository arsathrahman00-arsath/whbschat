import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a name to "Proper Case" — capitalize the first letter of each
 * whitespace/hyphen-separated word, lowercasing the rest.
 * Examples:
 *   "arsath rahman" -> "Arsath Rahman"
 *   "johnDOE" -> "Johndoe"
 *   "mary-jane o'neil" -> "Mary-Jane O'neil"
 */
export function toProperCase(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/(^|[\s\-_'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
