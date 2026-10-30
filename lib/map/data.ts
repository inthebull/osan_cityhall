import campus from "@/data/map/campus.json";
import civil1 from "@/data/map/floors/civil-1.json";
import mainX from "@/data/map/floors/main-x.json";
import dongSema1 from "@/data/map/floors/dong-sema-1.json";
import orgs from "@/data/kb/orgs.json";
import type { Building, Dept, Floor } from "./types";

const floors: Record<string, Floor> = {
  "civil-1": civil1 as Floor,
  "main-x": mainX as Floor,
  "dong-sema-1": dongSema1 as Floor,
};

export const campusData = campus as typeof campus & { buildings: Building[] };

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
