import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 지침 쪽 텍스트는 서버 라우트가 fs로 읽으므로 배포 번들에 포함시킨다.
  outputFileTracingIncludes: {
    "/api/officer/ask": ["./data/manuals/**/*"],
  },
};

export default nextConfig;
