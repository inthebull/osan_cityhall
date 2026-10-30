import Link from "next/link";
import { campusData, getFloor } from "@/lib/map/data";

export default function Home() {
  const { size, buildings, external } = campusData;
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">오산시청 청사 배치</h1>
        <p className="text-sm opacity-70 mt-1">
          불 켜진 건물에 AI 주무관이 근무합니다. 점선은 공개 자료로 위치를 아직 확인하지 못한 곳입니다.
        </p>
      </section>
      <svg viewBox={`0 0 ${size.w} ${size.h}`} className="w-full h-auto rounded-lg border border-black/10" role="img" aria-label="오산시청 건물 배치도">
        {buildings.map((b) => {
          const floorId = b.floors[0];
          const active = floorId ? getFloor(floorId)?.rooms.some((r) => r.status === "active" && r.dept_id) : false;
          const g = (
            <g>
              <rect x={b.shape.x} y={b.shape.y} width={b.shape.w} height={b.shape.h} rx={1}
                fill={active ? "var(--room-active)" : "var(--room-planned)"} stroke="var(--room-stroke)" strokeWidth={0.3}
                strokeDasharray={b.confirmed ? undefined : "1.2 0.8"} />
              <text x={b.shape.x + b.shape.w / 2} y={b.shape.y + b.shape.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} fill="currentColor">{b.name}</text>
            </g>
          );
          return floorId ? <Link key={b.id} href={`/hall/${floorId}`}>{g}</Link> : <g key={b.id}>{g}</g>;
        })}
      </svg>
      <section className="grid gap-3 sm:grid-cols-2">
        {buildings.map((b) => (
          <div key={b.id} className="text-sm"><b>{b.name}</b> · {b.note}</div>
        ))}
        {external.map((e) => (
          <Link key={e.id} href={`/hall/${e.floors[0]}`} className="text-sm underline">
            {e.name} ({e.address}) 들어가기
          </Link>
        ))}
      </section>
    </div>
  );
}
