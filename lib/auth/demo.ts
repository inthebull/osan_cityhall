import { createHash, timingSafeEqual } from "node:crypto";

// 시연용 접속 암호. DEMO_PASSCODE가 없으면 AI 호출은 잠긴 채로 둔다(검색만 동작).
export const DEMO_COOKIE = "demo_pass";

export function passcodeToken(passcode: string): string {
  return createHash("sha256").update(`osan-cityhall:${passcode}`).digest("hex");
}

export function checkPasscode(input: string): boolean {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return false;
  const a = Buffer.from(passcodeToken(input));
  const b = Buffer.from(passcodeToken(expected));
  return timingSafeEqual(a, b);
}

export function isUnlocked(req: Request): boolean {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return false;
  const cookie = req.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(passcodeToken(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}
