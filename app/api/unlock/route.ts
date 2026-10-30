import { NextResponse } from "next/server";
import { checkPasscode, DEMO_COOKIE, passcodeToken } from "@/lib/auth/demo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { passcode }: { passcode?: string } = await req.json().catch(() => ({}));
  if (!process.env.DEMO_PASSCODE) {
    return NextResponse.json({ error: "시연용 접속 암호가 아직 설정되지 않았습니다." }, { status: 503 });
  }
  if (!passcode || !checkPasscode(passcode)) {
    return NextResponse.json({ error: "접속 암호가 맞지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, passcodeToken(passcode), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
