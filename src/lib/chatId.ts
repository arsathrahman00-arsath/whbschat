import md5 from "md5";

export function generateChatId(
  userId1: string | number,
  userId2: string | number
): string {
  const sorted = [String(userId1), String(userId2)].sort();
  const concatenated = sorted.join("");
  const hash = md5(concatenated);
  // Convert 32-char hex to UUID format: 8-4-4-4-12
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
