import { MapEditor } from "./MapEditor";
import { listDepts, listFloors } from "@/lib/map/data";

export const metadata = { title: "지도 편집기 · 오산시 AI 청사" };

export default function MapEditorPage() {
  return <MapEditor floors={listFloors()} depts={listDepts().map((d) => ({ id: d.dept_id, name: d.name }))} />;
}
