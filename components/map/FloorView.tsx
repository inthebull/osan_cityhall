import Link from "next/link";
import type { Floor, Room } from "@/lib/map/types";

function roomHref(room: Room): string | null {
  if (room.status !== "active") return null;
  if (room.virtual_space) return "/dispatch";
  return room.dept_id ? `/room/${room.dept_id}` : null;
}

export function FloorView({ floor }: { floor: Floor }) {
  const { w, h } = floor.size;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto rounded-lg border border-black/10" role="img" aria-label={`${floor.title} 평면도`}>
      {floor.corridors.map((c, i) => (
        <line key={i} x1={c.from[0]} y1={c.from[1]} x2={c.to[0]} y2={c.to[1]} stroke="var(--corridor)" strokeWidth={c.width ?? 2} />
      ))}
      {floor.rooms.map((room) => {
        const href = roomHref(room);
        const { x, y, w: rw, h: rh } = room.shape;
        const body = (
          <g>
            <rect
              x={x} y={y} width={rw} height={rh} rx={0.6}
              fill={room.status === "active" ? "var(--room-active)" : "var(--room-planned)"}
              stroke="var(--room-stroke)" strokeWidth={0.25}
              strokeDasharray={room.confirmed ? undefined : "1 0.6"}
            />
            <text x={x + rw / 2} y={y + rh / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.2} fill="currentColor">
              {room.name}
            </text>
            {room.status === "planned" && (room.kind === "dept" || room.kind === "civil") && (
              <text x={x + rw / 2} y={y + rh / 2 + 3} textAnchor="middle" fontSize={1.5} fill="currentColor" opacity={0.6}>
                채용 예정
              </text>
            )}
            <circle cx={room.door.x} cy={room.door.y} r={0.6} fill="var(--room-stroke)" />
          </g>
        );
        return href ? (
          <Link key={room.id} href={href} aria-label={`${room.name} 들어가기`}>{body}</Link>
        ) : (
          <g key={room.id}>{body}</g>
        );
      })}
    </svg>
  );
}
