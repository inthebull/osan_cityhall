import { notFound } from "next/navigation";
import { FloorView } from "@/components/map/FloorView";
import { getFloor, listFloors } from "@/lib/map/data";

export function generateStaticParams() {
  return listFloors().map((f) => ({ floorId: f.id }));
}

export default async function FloorPage({ params }: { params: Promise<{ floorId: string }> }) {
  const { floorId } = await params;
  const floor = getFloor(floorId);
  if (!floor) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{floor.title}</h1>
      <FloorView floor={floor} />
      <p className="text-xs opacity-60">노란 방을 누르면 들어갑니다. 점선 테두리는 실제 위치 확인 전인 방입니다.</p>
    </div>
  );
}
