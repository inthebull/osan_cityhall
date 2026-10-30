"use client";

import { useMemo, useRef, useState } from "react";
import type { Floor, Room } from "@/lib/map/types";

type Props = { floors: Floor[]; depts: { id: string; name: string }[] };

const KINDS: Room["kind"][] = ["dept", "civil", "exec", "meeting", "facility", "common"];
const STATUSES: Room["status"][] = ["active", "planned", "facility"];

function emptyFloor(): Floor {
  return { id: "new-floor", building_id: "main", level: "1", title: "새 층", size: { w: 80, h: 30 }, rooms: [], corridors: [] };
}

export function MapEditor({ floors, depts }: Props) {
  const [floor, setFloor] = useState<Floor>(() => structuredClone(floors[0] ?? emptyFloor()));
  const [bg, setBg] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const room = useMemo(() => floor.rooms.find((r) => r.id === selected) ?? null, [floor, selected]);

  // 화면 좌표 → 격자 좌표 (0.5칸 단위로 맞춤)
  const toGrid = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const snap = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * 2) / 2));
    return { x: snap(p.x, floor.size.w), y: snap(p.y, floor.size.h) };
  };

  const updateRoom = (patch: Partial<Room>) =>
    setFloor((f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === selected ? { ...r, ...patch } : r)) }));

  const finishDrag = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (w < 2 || h < 2) return;
    const id = `R-${floor.id.toUpperCase()}-${String(floor.rooms.length + 1).padStart(2, "0")}`;
    const r: Room = {
      id, name: "새 방", dept_id: null, kind: "dept", shape: { x, y, w, h },
      door: { x: x + w / 2, y: y + h }, status: "planned", confirmed: false, source: "",
    };
    setFloor((f) => ({ ...f, rooms: [...f.rooms, r] }));
    setSelected(id);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(floor, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${floor.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadJson = async (file: File) => {
    try {
      setFloor(JSON.parse(await file.text()) as Floor);
      setSelected(null);
    } catch {
      alert("JSON 파일을 읽지 못했습니다.");
    }
  };

  const input = "border border-black/20 dark:border-white/20 rounded px-2 py-1 bg-transparent w-full";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">지도 편집기</h1>
        <p className="text-sm opacity-70">
          층별 안내도 사진을 깔고, 빈 곳을 끌어서 방을 그립니다. 다 그리면 JSON을 내려받아 <code>data/map/floors/</code>에 넣으세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end text-sm">
        <label className="space-y-1">
          <span className="block">불러올 층</span>
          <select className={input} value={floor.id} onChange={(e) => {
            const f = floors.find((x) => x.id === e.target.value);
            setFloor(structuredClone(f ?? emptyFloor()));
            setSelected(null);
          }}>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            <option value="new-floor">새 층</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">안내도 사진</span>
          <input type="file" accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setBg(URL.createObjectURL(f));
          }} />
        </label>
        <label className="space-y-1">
          <span className="block">사진 투명도</span>
          <input type="range" min={0} max={1} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="block">JSON 불러오기</span>
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])} />
        </label>
        <button className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-1.5" onClick={download}>JSON 내려받기</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <label className="space-y-1"><span className="block">층 ID</span><input className={input} value={floor.id} onChange={(e) => setFloor({ ...floor, id: e.target.value })} /></label>
        <label className="space-y-1"><span className="block">건물 ID</span><input className={input} value={floor.building_id} onChange={(e) => setFloor({ ...floor, building_id: e.target.value })} /></label>
        <label className="space-y-1"><span className="block">층</span><input className={input} value={floor.level} onChange={(e) => setFloor({ ...floor, level: e.target.value })} /></label>
        <label className="space-y-1"><span className="block">제목</span><input className={input} value={floor.title} onChange={(e) => setFloor({ ...floor, title: e.target.value })} /></label>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${floor.size.w} ${floor.size.h}`}
        className="w-full h-auto rounded-lg border border-black/20 touch-none select-none cursor-crosshair"
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-room]")) return;
          const p = toGrid(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          setSelected(null);
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, ...(({ x, y }) => ({ x1: x, y1: y }))(toGrid(e)) })}
        onPointerUp={finishDrag}
        onPointerLeave={finishDrag}
      >
        {bg && <image href={bg} x={0} y={0} width={floor.size.w} height={floor.size.h} preserveAspectRatio="none" opacity={bgOpacity} />}
        {floor.corridors.map((c, i) => (
          <line key={i} x1={c.from[0]} y1={c.from[1]} x2={c.to[0]} y2={c.to[1]} stroke="#9ca3af" strokeOpacity={0.4} strokeWidth={c.width ?? 2} />
        ))}
        {floor.rooms.map((r) => (
          <g key={r.id} data-room onPointerDown={() => setSelected(r.id)} className="cursor-pointer">
            <rect x={r.shape.x} y={r.shape.y} width={r.shape.w} height={r.shape.h}
              fill={r.status === "active" ? "#fde68a" : "#e5e7eb"} fillOpacity={0.75}
              stroke={r.id === selected ? "#2563eb" : "#4b5563"} strokeWidth={r.id === selected ? 0.5 : 0.25}
              strokeDasharray={r.confirmed ? undefined : "1 0.6"} />
            <text x={r.shape.x + r.shape.w / 2} y={r.shape.y + r.shape.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2} fill="#111">{r.name}</text>
            <circle cx={r.door.x} cy={r.door.y} r={0.6} fill="#2563eb" />
          </g>
        ))}
        {drag && (
          <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)}
            fill="#93c5fd" fillOpacity={0.4} stroke="#2563eb" strokeWidth={0.3} />
        )}
      </svg>

      {room ? (
        <div className="grid gap-3 sm:grid-cols-3 text-sm rounded-lg border border-black/10 dark:border-white/10 p-4">
          <label className="space-y-1"><span className="block">방 이름</span><input className={input} value={room.name} onChange={(e) => updateRoom({ name: e.target.value })} /></label>
          <label className="space-y-1"><span className="block">방 ID</span><input className={input} value={room.id} onChange={(e) => { updateRoom({ id: e.target.value }); setSelected(e.target.value); }} /></label>
          <label className="space-y-1"><span className="block">부서</span>
            <select className={input} value={room.dept_id ?? ""} onChange={(e) => updateRoom({ dept_id: e.target.value || null })}>
              <option value="">(연결 안 함)</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="block">종류</span>
            <select className={input} value={room.kind} onChange={(e) => updateRoom({ kind: e.target.value as Room["kind"] })}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="block">상태</span>
            <select className={input} value={room.status} onChange={(e) => updateRoom({ status: e.target.value as Room["status"] })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={room.confirmed} onChange={(e) => updateRoom({ confirmed: e.target.checked })} /> 실제 위치 확인됨</label>
          <label className="space-y-1 sm:col-span-2"><span className="block">출처 (안내판 사진, 홈페이지 주소 등)</span><input className={input} value={room.source} onChange={(e) => updateRoom({ source: e.target.value })} /></label>
          <div className="flex items-end gap-2">
            <button className="rounded border px-3 py-1.5" onClick={() => updateRoom({ door: { x: room.shape.x + room.shape.w / 2, y: room.shape.y + room.shape.h } })}>문: 아래</button>
            <button className="rounded border px-3 py-1.5" onClick={() => updateRoom({ door: { x: room.shape.x + room.shape.w / 2, y: room.shape.y } })}>문: 위</button>
            <button className="rounded border border-red-500 text-red-600 px-3 py-1.5" onClick={() => {
              setFloor((f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== selected) }));
              setSelected(null);
            }}>삭제</button>
          </div>
        </div>
      ) : (
        <p className="text-sm opacity-60">방을 누르면 이름·부서·상태를 고칠 수 있습니다. 방 {floor.rooms.length}개.</p>
      )}
    </div>
  );
}
