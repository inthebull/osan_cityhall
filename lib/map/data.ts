import dongSema1 from "@/data/map/floors/dong-sema-1.json";
import orgs from "@/data/kb/orgs.json";
import type { Dept, Floor } from "./types";

const floors: Record<string, Floor> = {
  "dong-sema-1": dongSema1 as Floor,
};

export function getFloor(id: string): Floor | undefined {
  return floors[id];
}

export function listFloors(): Floor[] {
  return Object.values(floors);
}

export function getDept(id: string): Dept | undefined {
  return (orgs as Dept[]).find((d) => d.dept_id === id);
}

export function listDepts(): Dept[] {
  return orgs as Dept[];
}
