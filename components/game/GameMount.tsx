"use client";

import dynamic from "next/dynamic";

// 캔버스·localStorage·오디오를 쓰므로 브라우저에서만 띄운다.
const HallGame = dynamic(() => import("./HallGame").then((m) => m.HallGame), {
  ssr: false,
  loading: () => <main className="h-dvh w-full bg-navy-2" />,
});

export function GameMount() {
  return <HallGame />;
}
