"use client";

// 청사 3D 장면(React Three Fiber). 이동·길찾기·판정은 HallEngine이 하고, 이 화면은 그 상태를 매 프레임 읽어 그린다.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { HallEngine } from "./engine";
import { C, H, buildFurniture, buildWalls, type Part } from "./layout3d";
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
const BG = "#A4ABB5";
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
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
        camera={{ position: [30, 30, 30], zoom: 30, near: -200, far: 400 }}
      >
        <color attach="background" args={[BG]} />

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
            <N8AO aoRadius={0.7} intensity={2.6} distanceFalloff={0.8} halfRes quality="medium" color="#20242c" />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        )}
      </Canvas>
      {floor && <Labels floor={floor} focus={focus} anchors={anchors} />}
      {/* 가장자리를 살짝 어둡게: 흰 모형이 배경에서 떠 보이게 */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_55%_45%,transparent_45%,rgba(28,34,46,0.28)_100%)]" />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-[#9CA3AE]" style={{ opacity: 0 }} />
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
  // 주광이 층 가운데를 향하도록 대상 물체를 장면에 넣는다.
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(MAP_W / 2, 0, MAP_H / 2);
    return o;
  }, []);
  // 그림자 카메라 범위는 직접 넣고 갱신해야 한다(기본값은 가운데 10칸뿐).
  const sun = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const cam = sun.current?.shadow.camera;
    if (!cam) return;
    cam.left = -30;
    cam.right = 30;
    cam.top = 24;
    cam.bottom = -24;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
  }, []);
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
      <hemisphereLight args={["#ffffff", "#b9b2a8", 0.35]} />
      {/* 왼쪽 위에서 들어오는 따뜻한 주광: 화면 왼쪽 면은 밝고 오른쪽 면은 은은하게 */}
      <directionalLight
        ref={sun}
        position={[MAP_W / 2 - 14, 17, MAP_H / 2 + 14]}
        intensity={3.0}
        color="#FFF3E2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <primitive object={target} attach="target" />
      </directionalLight>
      <primitive object={target} />
      <directionalLight position={[MAP_W / 2 + 20, 12, MAP_H / 2 - 6]} intensity={0.35} color="#DCE6F5" />
      {/* 실내 사진처럼 부드러운 환경광(외부 파일 없이 만든 조명판) */}
      <Environment resolution={128} frames={1} environmentIntensity={0.8}>
        <Lightformer form="rect" intensity={1.5} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#FFF1DE" position={[-8, 3, 6]} rotation-y={Math.PI / 3} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#DDE8F7" position={[8, 3, -6]} rotation-y={-Math.PI / 1.5} scale={[10, 4, 1]} />
      </Environment>
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
    // 3D는 참고 이미지처럼 가까이서 보는 것이 기본(사용자 배율 1 = 층 전체의 2.2배), 축소하면 층 전체가 보인다.
    const scale = Math.max(1, v.zoom * 2.2);
    const zoom = fit * scale;
    const follow = Math.max(0, Math.min(1, (scale - 1) / 0.6));
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
  cyl: new THREE.CylinderGeometry(1, 0.88, 1, 24),
  ball: new THREE.IcosahedronGeometry(1, 2),
  cone: new THREE.ConeGeometry(1, 1, 20),
};

function PartGroup({ list, castShadow }: { list: Part[]; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const first = list[0];
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      q.setFromEuler(e.set(p.rx ?? 0, p.ry ?? 0, 0, "YXZ"));
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
        roughness={first.glow ? 0.25 : first.shape === "ball" ? 0.75 : first.color === C.dark ? 0.4 : 0.7}
        metalness={0}
        envMapIntensity={0.9}
        emissive={first.glow ? first.color : "#000000"}
        emissiveIntensity={first.glow ? 0.45 : 0}
        transparent={alpha < 1}
        opacity={alpha}
        depthWrite={alpha === 1}
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
    // 밝은 오크 마루: 판마다 색을 조금씩, 결은 가는 선으로
    const tones = ["#E4C79E", "#DDBE93", "#E8CEA8", "#D9B98C", "#E2C49A", "#EBD3AF"];
    const plank = 32;
    for (let y = 0; y < 256; y += plank) {
      let x = -((y / plank) % 4) * 37;
      let i = y / plank;
      while (x < 256) {
        const len = 110 + ((i * 53) % 90);
        g.fillStyle = tones[i % tones.length];
        g.fillRect(x, y, len, plank);
        g.strokeStyle = "rgba(150, 105, 60, 0.10)";
        g.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          const gy = y + 5 + k * 7 + ((i * 3 + k) % 4);
          g.beginPath();
          g.moveTo(x + 4, gy);
          g.bezierCurveTo(x + len * 0.3, gy + 2, x + len * 0.6, gy - 2, x + len - 4, gy + 1);
          g.stroke();
        }
        g.fillStyle = "rgba(110, 75, 40, 0.22)";
        g.fillRect(x, y, 1.2, plank);
        x += len;
        i++;
      }
      g.fillStyle = "rgba(110, 75, 40, 0.25)";
      g.fillRect(0, y, 256, 1.2);
    }
  } else if (kind === "tile") {
    // 복도: 따뜻한 밝은 회색 대형 타일
    g.fillStyle = "#E4E6E9";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120, 110, 100, ${Math.random() * 0.035})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    g.strokeStyle = "rgba(90, 85, 80, 0.14)";
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
        // 채용 예정 방은 불이 꺼진 듯 살짝 어둡게
        const dim = room.kind === "planned" ? "#D6D3CF" : room.kind === "void" ? "#B4B8BF" : "#FFFFFF";
        return { w, d, x: p.x - 0.5 + w / 2, z: p.y - 0.5 + d / 2, map, dim };
      }),
    [room, tex],
  );
  return (
    <>
      {materials.map((m, i) => (
        <mesh key={i} position={[m.x, 0.006, m.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[m.w, m.d]} />
          <meshStandardMaterial map={room.kind === "void" ? null : m.map} color={m.dim} roughness={0.55} envMapIntensity={0.6} />
        </mesh>
      ))}
      {room.kind === "ai" && (
        <pointLight position={[room.x + room.w / 2, 1.8, room.y + room.h / 2]} intensity={3} distance={7} decay={1.5} color="#FFF1DC" />
      )}
    </>
  );
}

function FloorScene({ floor, engineRef }: { floor: FloorMap; engineRef: RefObject<HallEngine | null> }) {
  const walls = useMemo(() => buildWalls(floor), [floor]);
  const furniture = useMemo(() => buildFurniture(floor), [floor]);
  const slab = useMemo(() => {
    const parts: Part[] = [];
    // 바닥판: 칸마다 나누면 옆면에 줄이 생기므로 같은 가로 구간이 이어지는 줄끼리 큰 사각형으로 묶는다.
    const runs: string[] = [];
    for (let y = 0; y < MAP_H; y++) {
      const row: [number, number][] = [];
      let x = 0;
      while (x < MAP_W) {
        if (floor.grid[y][x] === " ") {
          x++;
          continue;
        }
        const x0 = x;
        while (x < MAP_W && floor.grid[y][x] !== " ") x++;
        row.push([x0, x]);
      }
      runs.push(JSON.stringify(row));
    }
    let y0 = 0;
    for (let y = 1; y <= MAP_H; y++) {
      if (y < MAP_H && runs[y] === runs[y0]) continue;
      for (const [a, b] of JSON.parse(runs[y0]) as [number, number][]) {
        parts.push({ shape: "box", x: (a + b) / 2, y: -H.slab / 2, z: (y0 + y) / 2, sx: b - a, sy: H.slab, sz: y - y0, color: C.slab });
      }
      y0 = y;
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (floor.grid[y][x] === "r") parts.push({ shape: "box", x: x + 0.5, y: 0.004, z: y + 0.5, sx: 1, sy: 0.01, sz: 1, color: "#BFE6EA", noShadow: true });
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
      <Instanced parts={slab} castShadow />
      <mesh position={[MAP_W / 2, -H.slab - 0.001, MAP_H / 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[MAP_W * 3, MAP_H * 3]} />
        <shadowMaterial transparent opacity={0.22} color="#1c2230" />
      </mesh>
      <mesh
        position={[MAP_W / 2, 0.001, MAP_H / 2]}
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerMove={(e) => pointer(e, false)}
        onClick={(e) => pointer(e, true)}
      >
        <planeGeometry args={[MAP_W, MAP_H]} />
        <meshStandardMaterial map={corridorTex} transparent opacity={0} depthWrite={false} />
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
      <meshStandardMaterial map={tex} color="#FFFFFF" roughness={0.4} envMapIntensity={0.7} side={THREE.DoubleSide} />
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
    if (room.kind !== "ai" && !on) {
      // AI 주무관이 없는 방은 바닥 안내 글씨처럼 조용하게
      items.push({
        key: room.id,
        at: [lx, 0.9, lz],
        node: (
          <span className={`text-[11px] font-semibold whitespace-nowrap [text-shadow:0_0_3px_#fff,0_0_6px_#fff] ${room.kind === "planned" ? "text-slate-muted" : "text-slate-ink"}`}>
            {room.name}
          </span>
        ),
      });
      continue;
    }
    items.push({
      key: room.id,
      at: [lx, 1.25, lz],
      node: (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-[0_4px_14px_rgba(20,30,50,0.18)] ${on ? "border-osan-teal ring-2 ring-osan-teal-tint" : "border-white"} ${room.kind === "planned" ? "text-slate-muted" : "text-slate-ink"}`}
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
