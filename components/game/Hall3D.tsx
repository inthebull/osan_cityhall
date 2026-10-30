"use client";

// 청사 3D 장면(React Three Fiber). 이동·길찾기·판정은 HallEngine이 하고, 이 화면은 그 상태를 매 프레임 읽어 그린다.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import * as THREE from "three";
import type { HallEngine } from "./engine";
import { C, buildFurniture, buildWalls, type Part } from "./layout3d";
import { MAP_H, MAP_W, TILE, type FloorMap, type RoomRect } from "./world";

type Props = {
  engineRef: RefObject<HallEngine | null>;
  insetLeft: number;
  insetRight: number;
  onBackgroundClick?: () => void;
};

// 이름표는 캔버스 밖 HTML로 그리고, 카메라가 움직일 때마다 화면 좌표만 다시 계산한다.
type Anchor = { el: HTMLElement; x: number; y: number; z: number };
type Anchors = RefObject<Map<string, Anchor>>;
type RigProps = Props & { anchors: Anchors };

const ELEV = (35 * Math.PI) / 180;
const CAM_DIR = new THREE.Vector3(Math.cos(ELEV) / Math.SQRT2, Math.sin(ELEV), Math.cos(ELEV) / Math.SQRT2).normalize();
const u = (px: number) => px / TILE;
// 발표 노트북 내장 그래픽에서도 부드럽게: 프레임이 떨어지면 AO를 끄고 해상도를 1배로 낮춘다.
// ?lite 는 처음부터 낮은 품질, ?hq 는 끝까지 높은 품질(화면 캡처용).
const QUERY = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const FORCE: "lite" | "hq" | null = QUERY?.has("lite") ? "lite" : QUERY?.has("hq") ? "hq" : null;

export function Hall3D({ engineRef, insetLeft, insetRight, onBackgroundClick }: Props) {
  const fadeRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const [high, setHigh] = useState(FORCE !== "lite");
  const [floor, setFloor] = useState<FloorMap | null>(() => engineRef.current?.view().floor ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const anchors = useRef(new Map<string, Anchor>());
  return (
    <div
      className="absolute inset-0 touch-none"
      onPointerDown={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const down = pressRef.current;
        pressRef.current = null;
        if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 8) onBackgroundClick?.();
      }}
      onWheel={(event) => engineRef.current?.zoomBy(event.deltaY > 0 ? 0.9 : 1.1)}
    >
      <Canvas
        orthographic
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true }}
        camera={{ position: [30, 30, 30], zoom: 30, near: -200, far: 400 }}
      >
        <color attach="background" args={["#E4E7EC"]} />
        {FORCE === null && <PerformanceMonitor onDecline={() => setHigh(false)} />}
        {floor && (
          <Scene
            engineRef={engineRef}
            insetLeft={insetLeft}
            insetRight={insetRight}
            anchors={anchors}
            floor={floor}
            focus={focus}
            onFloor={setFloor}
            onFocus={setFocus}
            fadeRef={fadeRef}
          />
        )}
        {high && (
          <EffectComposer enableNormalPass={false} multisampling={4}>
            <N8AO aoRadius={0.55} intensity={2.2} distanceFalloff={0.6} halfRes quality="medium" color="#1b2230" />
          </EffectComposer>
        )}
      </Canvas>
      {floor && <Labels floor={floor} focus={focus} anchors={anchors} />}
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-[#EEF1F6]" style={{ opacity: 0 }} />
    </div>
  );
}

function Scene({
  engineRef,
  insetLeft,
  insetRight,
  anchors,
  floor,
  focus,
  onFloor,
  onFocus,
  fadeRef,
}: RigProps & {
  floor: FloorMap;
  focus: string | null;
  onFloor: (floor: FloorMap) => void;
  onFocus: (id: string | null) => void;
  fadeRef: RefObject<HTMLDivElement | null>;
}) {
  useFrame(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const v = engine.view();
    if (v.floor !== floor) onFloor(v.floor);
    const f = v.hovered ?? v.nearId;
    if (f !== focus) onFocus(f);
    if (fadeRef.current) fadeRef.current.style.opacity = String(v.fade);
  });

  return (
    <>
      <hemisphereLight args={["#ffffff", "#cfd4dc", 1.25]} />
      <directionalLight
        position={[MAP_W / 2 + 6, 26, MAP_H / 2 + 20]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-near={1}
        shadow-camera-far={90}
      >
        <object3D attach="target" position={[MAP_W / 2, 0, MAP_H / 2]} />
      </directionalLight>
      <CameraRig engineRef={engineRef} insetLeft={insetLeft} insetRight={insetRight} anchors={anchors} />
      <FloorScene key={floor.id} floor={floor} engineRef={engineRef} />
      <Player engineRef={engineRef} />
      <Marker engineRef={engineRef} />
      <Envelopes engineRef={engineRef} />
    </>
  );
}

function CameraRig({ engineRef, insetLeft, insetRight, anchors }: RigProps) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2));
  const ready = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const engine = engineRef.current;
    if (!engine) return;
    const v = engine.view();
    const cam = camera as THREE.OrthographicCamera;
    // 한 층이 화면에 다 들어오는 배율을 기본으로, 사용자가 확대하면 그만큼 사람을 따라간다.
    const availW = Math.max(200, size.width - insetLeft - insetRight - 80);
    const spanW = (MAP_W + MAP_H) / Math.SQRT2;
    const spanH = ((MAP_W + MAP_H) / Math.SQRT2) * Math.sin(ELEV) + 1.6;
    const fit = Math.min(availW / spanW, (size.height - 120) / spanH);
    const zoom = fit * v.zoom;
    const follow = Math.max(0, Math.min(1, (v.zoom - 1) / 0.5));
    const center = new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2);
    const player = new THREE.Vector3(u(v.x), 0, u(v.y));
    const goal = center.clone().lerp(player, follow);
    // 왼쪽 목록·오른쪽 서랍만큼 화면 가운데를 옮긴다.
    const right = new THREE.Vector3(1, 0, -1).normalize();
    goal.addScaledVector(right, -((insetLeft - insetRight) / 2) / zoom);
    const k = ready.current ? Math.min(1, dt * 5) : 1;
    target.current.lerp(goal, k);
    cam.zoom += (zoom - cam.zoom) * k;
    cam.position.copy(target.current).addScaledVector(CAM_DIR, 60);
    cam.lookAt(target.current);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    ready.current = true;
    for (const a of anchors.current.values()) {
      tmp.set(a.x, a.y, a.z).project(cam);
      a.el.style.transform = `translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`;
      a.el.style.opacity = "1";
    }
  });
  return null;
}

function Instanced({ parts, castShadow = true }: { parts: Part[]; castShadow?: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, Part[]>();
    for (const p of parts) {
      const key = `${p.shape}|${p.color}|${p.glow ? 1 : 0}|${p.alpha ?? 1}|${p.noShadow ? 1 : 0}`;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [parts]);
  return (
    <>
      {groups.map(([key, list]) => (
        <PartGroup key={key} list={list} castShadow={castShadow} />
      ))}
    </>
  );
}

const GEOS = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 0.85, 1, 18),
  ball: new THREE.IcosahedronGeometry(1, 1),
};

function PartGroup({ list, castShadow }: { list: Part[]; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const first = list[0];
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  const alpha = first.alpha ?? 1;
  return (
    <instancedMesh
      ref={ref}
      args={[GEOS[first.shape], undefined, list.length]}
      castShadow={castShadow && !first.noShadow && alpha === 1}
      receiveShadow={alpha === 1}
    >
      <meshStandardMaterial
        color={first.color}
        roughness={first.glow ? 0.3 : first.shape === "ball" ? 0.7 : 0.82}
        metalness={0}
        emissive={first.glow ? first.color : "#000000"}
        emissiveIntensity={first.glow ? 0.55 : 0}
        transparent={alpha < 1}
        opacity={alpha}
        depthWrite={alpha === 1}
        flatShading={first.shape === "ball"}
      />
    </instancedMesh>
  );
}

function makeTexture(kind: "wood" | "tile" | "carpet" | "grass") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  if (kind === "wood") {
    const tones = ["#E8D3B1", "#E3CBA6", "#EDD9B9", "#E0C7A0", "#E9D4B3"];
    const plank = 32;
    for (let y = 0; y < 256; y += plank) {
      let x = -((y / plank) % 3) * 40;
      let i = y / plank;
      while (x < 256) {
        const len = 90 + ((i * 37) % 70);
        g.fillStyle = tones[i % tones.length];
        g.fillRect(x, y, len, plank);
        g.fillStyle = "rgba(120, 85, 45, 0.18)";
        g.fillRect(x, y, 1.5, plank);
        x += len;
        i++;
      }
      g.fillStyle = "rgba(120, 85, 45, 0.22)";
      g.fillRect(0, y, 256, 1.5);
    }
  } else if (kind === "tile") {
    g.fillStyle = "#EFF0F2";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(60, 70, 85, 0.12)";
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
  } else if (kind === "carpet") {
    g.fillStyle = "#DADFE7";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(40, 55, 80, ${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  } else {
    g.fillStyle = "#CFE3C6";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(60, 120, 60, ${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let TEX: Record<string, THREE.Texture> | null = null;
function textures() {
  if (!TEX) TEX = { w: makeTexture("wood"), t: makeTexture("tile"), c: makeTexture("carpet"), g: makeTexture("grass") };
  return TEX;
}

function RoomFloor({ room }: { room: RoomRect }) {
  const tex = textures();
  const materials = useMemo(
    () =>
      room.parts.map((p) => {
        const w = p.w + 1;
        const d = p.h + 1;
        const base = tex[room.ground] ?? tex.w;
        const map = base.clone();
        map.needsUpdate = true;
        const scale = room.ground === "w" ? 0.5 : room.ground === "t" ? 1 : 0.5;
        map.repeat.set(w * scale, d * scale);
        const dim = room.kind === "planned" ? "#C9CBD0" : room.kind === "void" ? "#9EA3AB" : "#FFFFFF";
        return { w, d, x: p.x - 0.5 + w / 2, z: p.y - 0.5 + d / 2, map, dim };
      }),
    [room, tex],
  );
  return (
    <>
      {materials.map((m, i) => (
        <mesh key={i} position={[m.x, 0.006, m.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[m.w, m.d]} />
          <meshStandardMaterial map={room.kind === "void" ? null : m.map} color={m.dim} roughness={0.85} />
        </mesh>
      ))}
      {(room.kind === "ai" || room.kind === "feature") && room.w > 3 && room.h > 3 && (
        <mesh position={[room.x + room.w / 2, 0.012, room.y + room.h / 2]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[room.w - 1.6, room.h - 1.6]} />
          <meshStandardMaterial color={C.teal} transparent opacity={0.16} roughness={1} />
        </mesh>
      )}
      {room.kind === "ai" && (
        <pointLight position={[room.x + room.w / 2, 1.6, room.y + room.h / 2]} intensity={2.2} distance={6} decay={1.6} color="#fff6e5" />
      )}
    </>
  );
}

function FloorScene({ floor, engineRef }: { floor: FloorMap; engineRef: RefObject<HallEngine | null> }) {
  const walls = useMemo(() => buildWalls(floor), [floor]);
  const furniture = useMemo(() => buildFurniture(floor), [floor]);
  const slab = useMemo(() => {
    const parts: Part[] = [];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const ch = floor.grid[y][x];
        if (ch === " ") continue;
        parts.push({ shape: "box", x: x + 0.5, y: -0.15, z: y + 0.5, sx: 1, sy: 0.3, sz: 1, color: C.slab });
        if (ch === "r") parts.push({ shape: "box", x: x + 0.5, y: 0.004, z: y + 0.5, sx: 1, sy: 0.01, sz: 1, color: "#BFE6EA", noShadow: true });
      }
    }
    return parts;
  }, [floor]);
  const corridorTex = useMemo(() => {
    const t = textures().t.clone();
    t.needsUpdate = true;
    t.repeat.set(MAP_W / 2, MAP_H / 2);
    return t;
  }, []);

  const pointer = (event: ThreeEvent<PointerEvent | MouseEvent>, click: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    const wx = event.point.x * TILE;
    const wy = event.point.z * TILE;
    if (click) {
      if (event.delta > 6) return;
      engine.clickWorld(wx, wy);
    } else {
      const hit = engine.hoverWorld(wx, wy);
      document.body.style.cursor = hit ? "pointer" : "default";
    }
  };

  return (
    <group>
      <Instanced parts={slab} castShadow={false} />
      <mesh
        position={[MAP_W / 2, 0.001, MAP_H / 2]}
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerMove={(e) => pointer(e, false)}
        onClick={(e) => pointer(e, true)}
      >
        <planeGeometry args={[MAP_W, MAP_H]} />
        <meshStandardMaterial map={corridorTex} color={C.corridor} roughness={0.6} transparent opacity={0} depthWrite={false} />
      </mesh>
      <CorridorFloor floor={floor} />
      {floor.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} />
      ))}
      <Instanced parts={walls} />
      <Instanced parts={furniture} />
      {floor.spots
        .filter((s) => s.action === "floors")
        .map((s) => (
          <mesh key={s.id} position={[u(s.x), 0.014, u(s.y) - 0.25]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshStandardMaterial color={C.navy} transparent opacity={0.14} />
          </mesh>
        ))}
      {floor.spots
        .filter((s) => s.actor)
        .map((s) => (
          <Person key={s.id} x={u(s.x)} z={u(s.y)} body={C.teal} face={0} />
        ))}
    </group>
  );
}

function CorridorFloor({ floor }: { floor: FloorMap }) {
  const geo = useMemo(() => {
    // 바닥판 위의 복도 면: 방이 아닌 칸만 모아 한 장으로
    const positions: number[] = [];
    const uvs: number[] = [];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const ch = floor.grid[y][x];
        if (ch === " ") continue;
        const quad = [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y],
          [x + 1, y + 1],
          [x, y + 1],
        ];
        for (const [px, pz] of quad) {
          positions.push(px, 0.003, pz);
          uvs.push(px / 2, pz / 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }, [floor]);
  const tex = useMemo(() => {
    const t = textures().t.clone();
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={tex} color="#FFFFFF" roughness={0.55} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Person({ x, z, body, face }: { x: number; z: number; body: string; face: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={face}>
      <Figure body={body} />
    </group>
  );
}

function Figure({ body, legRefs }: { body: string; legRefs?: [RefObject<THREE.Mesh | null>, RefObject<THREE.Mesh | null>] }) {
  return (
    <>
      <mesh position={[-0.06, 0.16, 0]} castShadow ref={legRefs?.[0]}>
        <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
        <meshStandardMaterial color="#2B3340" roughness={0.8} />
      </mesh>
      <mesh position={[0.06, 0.16, 0]} castShadow ref={legRefs?.[1]}>
        <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
        <meshStandardMaterial color="#2B3340" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow>
        <capsuleGeometry args={[0.13, 0.26, 6, 12]} />
        <meshStandardMaterial color={body} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.8, 0]} castShadow>
        <sphereGeometry args={[0.105, 20, 16]} />
        <meshStandardMaterial color="#F0D3BE" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.84, -0.015]} castShadow>
        <sphereGeometry args={[0.11, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2E2A28" roughness={0.8} />
      </mesh>
    </>
  );
}

function Player({ engineRef }: { engineRef: RefObject<HallEngine | null> }) {
  const group = useRef<THREE.Group>(null);
  const legA = useRef<THREE.Mesh>(null);
  const legB = useRef<THREE.Mesh>(null);
  const heading = useRef(0);
  useFrame(() => {
    const engine = engineRef.current;
    const g = group.current;
    if (!engine || !g) return;
    const v = engine.view();
    g.position.set(u(v.x), 0, u(v.y));
    if (v.moving) {
      const want = Math.atan2(v.vx, v.vy);
      let d = want - heading.current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      heading.current += d * 0.25;
    }
    g.rotation.y = heading.current;
    const swing = v.moving ? Math.sin(v.time * 12) * 0.5 : 0;
    if (legA.current) legA.current.rotation.x = swing;
    if (legB.current) legB.current.rotation.x = -swing;
    g.position.y = v.moving ? Math.abs(Math.sin(v.time * 12)) * 0.025 : 0;
  });
  return (
    <group ref={group}>
      <Figure body={C.navy} legRefs={[legA, legB]} />
    </group>
  );
}

function Marker({ engineRef }: { engineRef: RefObject<HallEngine | null> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const v = engineRef.current?.view();
    const m = ref.current;
    if (!v || !m) return;
    m.visible = Boolean(v.marker);
    if (v.marker) {
      m.position.set(u(v.marker.x), 0.02, u(v.marker.y));
      const s = 1 + Math.sin(v.time * 6) * 0.12;
      m.scale.set(s, s, s);
    }
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.28, 0.36, 40]} />
      <meshBasicMaterial color={C.teal} transparent opacity={0.85} />
    </mesh>
  );
}

function Envelopes({ engineRef }: { engineRef: RefObject<HallEngine | null> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const v = engineRef.current?.view();
    const m = ref.current;
    if (!v || !m) return;
    const env = v.envelopes[0];
    m.visible = Boolean(env);
    if (!env) return;
    const k = env.t * env.t * (3 - 2 * env.t);
    m.position.set(u(env.x + (env.tx - env.x) * k), 1 + Math.sin(env.t * Math.PI) * 1.6, u(env.y + (env.ty - env.y) * k));
    m.rotation.y = env.t * Math.PI * 2;
  });
  return (
    <mesh ref={ref} visible={false} castShadow>
      <boxGeometry args={[0.36, 0.02, 0.24]} />
      <meshStandardMaterial color="#FFFFFF" emissive={C.teal} emissiveIntensity={0.15} />
    </mesh>
  );
}

function Labels({ floor, focus, anchors }: { floor: FloorMap; focus: string | null; anchors: Anchors }) {
  const items: { key: string; at: [number, number, number]; node: ReactNode }[] = [];
  for (const room of floor.rooms) {
    if (room.kind === "void") continue;
    const cx = room.x + room.w / 2;
    const cz = room.y + room.h / 2;
    if (room.kind === "utility") {
      items.push({ key: room.id, at: [cx, 0.05, cz], node: <span className="text-[10px] whitespace-nowrap text-slate-muted/80">{room.name}</span> });
      continue;
    }
    const spot = floor.spots.find((s) => s.id === room.id);
    const lx = spot ? cx - (u(spot.x) - cx) * 0.6 : cx;
    const lz = spot ? cz - (u(spot.y) - cz) * 0.6 : cz;
    const on = focus === room.id;
    items.push({
      key: room.id,
      at: [lx, 1.1, lz],
      node: (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border bg-white/95 px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-md ${on ? "border-osan-teal ring-2 ring-osan-teal-tint" : "border-hairline"} ${room.kind === "planned" ? "text-slate-muted" : "text-slate-ink"}`}
        >
          {room.kind === "ai" && <span className="h-2 w-2 rounded-full bg-osan-teal" />}
          {room.name}
          {room.kind === "ai" && <span className="text-[10.5px] font-medium text-osan-teal-deep">AI 주무관</span>}
          {room.kind === "planned" && <span className="text-[10.5px] font-medium text-slate-muted">채용 예정</span>}
        </span>
      ),
    });
  }
  for (const s of floor.spots) {
    if (s.actor) {
      items.push({
        key: `${s.id}:ai`,
        at: [u(s.x), 1.02, u(s.y)],
        node: <span className="rounded-full border border-osan-teal bg-white px-1.5 py-px text-[10px] font-bold text-osan-teal-deep shadow-sm">AI</span>,
      });
    }
    if (s.kind === "feature" || (s.kind === "facility" && focus === s.id)) {
      items.push({
        key: `${s.id}:name`,
        at: [u(s.x), s.kind === "feature" ? 1.75 : 0.8, u(s.y)],
        node: (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-slate-ink shadow-md ${focus === s.id ? "border-osan-teal ring-2 ring-osan-teal-tint" : "border-hairline"}`}
          >
            {s.kind === "feature" && <span className="h-2 w-2 rounded-full bg-osan-teal" />}
            {s.title}
          </span>
        ),
      });
    }
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((item) => (
        <div
          key={`${floor.id}:${item.key}`}
          className="absolute top-0 left-0 opacity-0 will-change-transform"
          ref={(el) => {
            const id = `${floor.id}:${item.key}`;
            if (el) anchors.current.set(id, { el, x: item.at[0], y: item.at[1], z: item.at[2] });
            else anchors.current.delete(id);
          }}
        >
          <div className="-translate-x-1/2 -translate-y-1/2">{item.node}</div>
        </div>
      ))}
    </div>
  );
}
