export type Rect = { x: number; y: number; w: number; h: number };

export type Room = {
  id: string;
  name: string;
  dept_id: string | null;
  kind: "dept" | "civil" | "exec" | "meeting" | "facility" | "common";
  shape: Rect;
  door: { x: number; y: number };
  status: "active" | "planned" | "facility";
  confirmed: boolean;
  virtual_space?: string;
  source: string;
};

export type Floor = {
  id: string;
  building_id: string;
  level: string;
  title: string;
  size: { w: number; h: number };
  rooms: Room[];
  corridors: { from: number[]; to: number[]; width?: number }[];
  vertical?: { id: string; type: "elevator" | "stairs"; x: number; y: number }[];
};

export type Building = {
  id: string;
  name: string;
  shape: Rect;
  confirmed: boolean;
  floors: string[];
  note: string;
};

export type Dept = {
  dept_id: string;
  name: string;
  bureau: string | null;
  phone: string | null;
  room_ids: string[];
  teams: { team_id: string; name: string; phone?: string }[];
  source: string;
};
