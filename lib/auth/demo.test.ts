import { afterEach, describe, expect, it } from "vitest";
import { checkPasscode, DEMO_COOKIE, isUnlocked, passcodeToken } from "./demo";

const req = (cookie?: string) => new Request("http://x/api", { headers: cookie ? { cookie } : {} });

afterEach(() => {
  delete process.env.DEMO_PASSCODE;
});

describe("시연용 접속 암호", () => {
  it("암호가 설정되지 않으면 항상 잠겨 있다", () => {
    expect(checkPasscode("")).toBe(false);
    expect(isUnlocked(req(`${DEMO_COOKIE}=${passcodeToken("")}`))).toBe(false);
  });

  it("맞는 암호와 쿠키만 통과한다", () => {
    process.env.DEMO_PASSCODE = "f4o-2026";
    expect(checkPasscode("f4o-2026")).toBe(true);
    expect(checkPasscode("wrong")).toBe(false);
    expect(isUnlocked(req(`a=1; ${DEMO_COOKIE}=${passcodeToken("f4o-2026")}`))).toBe(true);
    expect(isUnlocked(req(`${DEMO_COOKIE}=${passcodeToken("wrong")}`))).toBe(false);
    expect(isUnlocked(req())).toBe(false);
  });
});
