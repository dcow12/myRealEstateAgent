'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MapControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { lotFills, paintLots, parcelLines, ringPoints, VERDICT_COLORS, COTTAGE_COLOR } from '@/lib/town/geometry.ts';
import { buildCity } from '@/lib/town/houses.ts';
import { GROUND, parcelFills, roadSurfaces, treeSpots } from '@/lib/town/ground.ts';
import type { TownData, AgentId } from '@/lib/town/types.ts';
import type { Verdict } from '@/lib/engine/rules.ts';
import { ROLES, ROLE_ORDER } from '@/lib/agents/roles.ts';

export type SceneProps = {
  town: TownData;
  verdicts: Verdict[];
  selected: number | null;
  onSelect: (lotIndex: number) => void;
  activeAgent: AgentId;
  agentLine: string;
  agentBusy: boolean;
  square: [number, number];
  flyKey: number;
  dark: boolean;
  /** Lots to outline as search matches, and the place they were measured from. */
  highlight?: number[] | null;
  place?: { name: string; x: number; y: number } | null;
};

/** Scene colours. Neutral city, verdict-tinted lots, accent-coloured proposed units; one set per theme. */
const SKY = {
  day: { bg: '#e3e8dd', ground: '#e9ebe8', road: '#ffffff', line: '#9aa29c', boundary: '#52525b', select: '#18181b', hemi: ['#ffffff', '#d9dcd6', 1.75], sun: 1.35, house: '#f5f4f1', other: '#dcdee2', est: '#ebe6dc', pin: '#71717a', pinOn: '#18181b', unit: '#9fb3ec' },
  night: { bg: '#050506', ground: '#14161b', road: '#23262d', line: '#3a3e47', boundary: '#a1a1aa', select: '#ededef', hemi: ['#c8d0e0', '#1a1c21', 1.45], sun: 0.95, house: '#8d8f96', other: '#5c5f67', est: '#7d786f', pin: '#8b8b94', pinOn: '#ededef', unit: '#4a68c9' },
} as const;

const CLICK_SLOP = 5;
const S = 4; // agent figures are drawn ~4x human scale so they read from the air
const TAG_POS: [number, number, number] = [0, 9.4 * S, 0];

function City({ town, verdicts, selected, onSelect, dark }: Pick<SceneProps, 'town' | 'verdicts' | 'selected' | 'onSelect' | 'dark'>) {
  const sky = dark ? SKY.night : SKY.day;
  const lotByParcel = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of town.parcels) if (p.lot >= 0) m.set(p.id, p.lot);
    return m;
  }, [town]);

  const fills = useMemo(() => lotFills(town), [town]);
  useEffect(() => { paintLots(fills, verdicts); }, [fills, verdicts]);

  const theme = dark ? 'night' : 'day';
  const buildings = useMemo(() => buildCity(town.buildings.map((b, i) => {
    const lot = lotByParcel.get(b.p);
    return { g: b.g, h: b.h, owner: lot ?? -1, kind: lot != null || b.est ? 'house' as const : 'other' as const, seed: i };
  }), theme), [town, lotByParcel, theme]);

  const cottages = useMemo(() => buildCity(town.lots.flatMap((l, i) => (l.cottage ? [{ g: l.cottage, h: 14, owner: i, kind: 'cottage' as const, seed: i }] : [])), theme), [town, theme]);
  useEffect(() => () => { for (const m of [buildings, cottages]) { m.body.geometry.dispose(); m.glass.geometry.dispose(); } }, [buildings, cottages]);

  const lines = useMemo(() => parcelLines(town), [town]);
  const roads = useMemo(() => roadSurfaces(town, theme), [town, theme]);
  const land = useMemo(() => parcelFills(town, theme), [town, theme]);
  useEffect(() => () => { roads.asphalt.dispose(); roads.markings.dispose(); land.dispose(); }, [roads, land]);
  const boundary = useMemo(() => ringPoints(town.boundary, 2), [town]);

  const pick = (owners: Int32Array) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP || e.faceIndex == null) return;
    const lot = owners[e.faceIndex];
    if (lot >= 0) { e.stopPropagation(); onSelect(lot); }
  };

  const sel = selected != null ? town.lots[selected] : null;
  const selRings = useMemo(
    () => (selected == null ? [] : town.parcels.filter((p) => p.lot === selected).map((p) => ringPoints(p.poly, 2.5))),
    [town, selected],
  );

  return (
    <group>
      {/* Flat ground layers: no depth writes, painted strictly in renderOrder so they never z-fight. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]} renderOrder={-10}>
        <planeGeometry args={[60000, 60000]} />
        <meshLambertMaterial color={GROUND[theme].base} depthWrite={false} />
      </mesh>
      <mesh geometry={land} raycast={() => null} renderOrder={-9}>
        <meshLambertMaterial vertexColors depthWrite={false} />
      </mesh>
      <mesh geometry={roads.asphalt} raycast={() => null} renderOrder={-8}>
        <meshLambertMaterial vertexColors depthWrite={false} />
      </mesh>
      <mesh geometry={roads.markings} raycast={() => null} renderOrder={-7}>
        <meshBasicMaterial vertexColors depthWrite={false} />
      </mesh>
      <mesh geometry={fills.geometry} onClick={pick(fills.triOwner)} renderOrder={-6}>
        <meshLambertMaterial vertexColors transparent opacity={dark ? 0.74 : 0.78} depthWrite={false} />
      </mesh>
      <Trees town={town} theme={theme} />
      <lineSegments geometry={lines} renderOrder={-5}>
        <lineBasicMaterial color={sky.line} transparent opacity={0.4} depthWrite={false} />
      </lineSegments>
      <mesh geometry={buildings.body.geometry} onClick={pick(buildings.body.triOwner)}>
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={buildings.glass.geometry} onClick={pick(buildings.glass.triOwner)}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={cottages.body.geometry} onClick={pick(cottages.body.triOwner)}>
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={cottages.glass.geometry} onClick={pick(cottages.glass.triOwner)}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <Line points={boundary} color={sky.boundary} lineWidth={1.5} dashed dashSize={40} gapSize={24} />
      {selRings.map((pts, i) => <Line key={i} points={pts} color={sky.select} lineWidth={2.5} />)}
      {sel?.cottage && (
        <Line points={ringPoints(sel.cottage, 1.4)} color={COTTAGE_COLOR} lineWidth={2.5} />
      )}
    </group>
  );
}

/** Instanced street, yard and park trees: a trunk and a two-tier low-poly canopy. Not pickable. */
function Trees({ town, theme }: { town: TownData; theme: 'day' | 'night' }) {
  const spots = useMemo(() => treeSpots(town), [town]);
  const geos = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.9, 1.2, 9, 5).translate(0, 4.5, 0),
    low: new THREE.IcosahedronGeometry(9, 0).scale(1, 0.85, 1).translate(0, 14, 0),
    high: new THREE.IcosahedronGeometry(6.2, 0).translate(0, 20.5, 0),
  }), []);
  const refs = { trunk: useRef<THREE.InstancedMesh>(null), low: useRef<THREE.InstancedMesh>(null), high: useRef<THREE.InstancedMesh>(null) };
  useEffect(() => {
    const P = GROUND[theme];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color(), c2 = new THREE.Color();
    spots.forEach((t, i) => {
      q.setFromAxisAngle(up, t.tone * Math.PI * 2);
      m.compose(new THREE.Vector3(t.x, 0, -t.y), q, new THREE.Vector3(t.s, t.s * (0.9 + t.tone * 0.25), t.s));
      for (const k of ['trunk', 'low', 'high'] as const) refs[k].current?.setMatrixAt(i, m);
      c.set(P.canopy[Math.floor(t.tone * P.canopy.length) % P.canopy.length]);
      refs.low.current?.setColorAt(i, c);
      refs.high.current?.setColorAt(i, c2.copy(c).offsetHSL(0, 0, 0.04));
      refs.trunk.current?.setColorAt(i, c.set(P.trunk));
    });
    for (const k of ['trunk', 'low', 'high'] as const) {
      const im = refs[k].current;
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }, [spots, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { geos.trunk.dispose(); geos.low.dispose(); geos.high.dispose(); }, [geos]);
  return (
    <group>
      {(['trunk', 'low', 'high'] as const).map((k) => (
        <instancedMesh key={k} ref={refs[k]} args={[geos[k], undefined, spots.length]} raycast={() => null} frustumCulled={false}>
          <meshLambertMaterial flatShading />
        </instancedMesh>
      ))}
    </group>
  );
}

/** Search matches outlined in one batched line set, plus a map pin at the place searched from. */
function SearchLayer({ town, highlight, place }: { town: TownData; highlight?: number[] | null; place?: SceneProps['place'] }) {
  const segs = useMemo(() => {
    if (!highlight?.length) return null;
    const want = new Set(highlight);
    const pts: [number, number, number][] = [];
    for (const p of town.parcels) {
      if (p.lot < 0 || !want.has(p.lot)) continue;
      const g = p.poly, n = g.length / 2;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; pts.push([g[i * 2], 1.6, -g[i * 2 + 1]], [g[j * 2], 1.6, -g[j * 2 + 1]]); }
    }
    return pts.length ? pts : null;
  }, [town, highlight]);
  return (
    <group>
      {segs && <Line points={segs} segments color="#1a73e8" lineWidth={2.2} />}
      {place && (
        <group position={[place.x, 0, -place.y]}>
          {/* Screen-space pin, so it stays readable at every zoom level. */}
          <Html position={[0, 2, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <div className="place-pin">
              <svg width="26" height="36" viewBox="0 0 26 36" aria-hidden><path d="M13 35s11-12.6 11-21.5C24 6.6 19.1 1.5 13 1.5S2 6.6 2 13.5C2 22.4 13 35 13 35z" fill="#ea4335" stroke="#b3261e" strokeWidth="1.5" /><circle cx="13" cy="13.5" r="4.5" fill="#7a1712" /></svg>
              <span className="place-tag">{place.name}</span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

/* ---------- Agents ---------- */
function AgentPin({ id, active, target, world, dark }: { id: AgentId; active: boolean; target: THREE.Vector3; world: Record<string, THREE.Vector3>; dark: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const pos = useRef(target.clone());
  const sky = dark ? SKY.night : SKY.day;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = target.clone().sub(pos.current);
    const dist = d.length();
    if (dist > 0.5) pos.current.add(d.normalize().multiplyScalar(Math.min(dist, (dist > 2000 ? 2400 : 420) * dt)));
    g.position.set(pos.current.x, 0, pos.current.z);
    (world[id] ??= new THREE.Vector3()).set(pos.current.x, TAG_POS[1], pos.current.z);
  });
  const color = active ? sky.pinOn : sky.pin;
  return (
    <group ref={ref}>
      <mesh position={[0, 4 * S, 0]}>
        <cylinderGeometry args={[0.18 * S, 0.18 * S, 8 * S, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 8.2 * S, 0]}>
        <boxGeometry args={[1.4 * S, 1.4 * S, 1.4 * S]} />
        <meshStandardMaterial color={active ? COTTAGE_COLOR : color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.2 * S, (active ? 2.6 : 1.8) * S, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.5 : 0.25} />
      </mesh>
    </group>
  );
}

function Agents({ town, selected, activeAgent, square, world, dark }: Pick<SceneProps, 'town' | 'selected' | 'activeAgent' | 'square' | 'dark'> & { world: Record<string, THREE.Vector3> }) {
  const targets = useMemo(() => {
    const out = {} as Record<AgentId, THREE.Vector3>;
    ROLE_ORDER.forEach((id, i) => {
      const a = (i / ROLE_ORDER.length) * Math.PI * 2;
      out[id] = new THREE.Vector3(square[0] + Math.cos(a) * 70, 0, -(square[1] + Math.sin(a) * 70));
    });
    if (selected != null) {
      const l = town.lots[selected];
      const anchor = l.cottage ? [l.cottage[0], l.cottage[1]] : l.pos;
      out[activeAgent] = new THREE.Vector3(anchor[0] + 8, 0, -(anchor[1] + 8));
    }
    return out;
  }, [town, selected, activeAgent, square]);
  return (
    <>
      {/* One pin: the active agent, at the selected lot, and only for agents that work on a single lot. */}
      {selected != null && activeAgent !== 'planner' && (
        <AgentPin key={activeAgent} id={activeAgent} active target={targets[activeAgent]} world={world} dark={dark} />
      )}
    </>
  );
}

/** Projects each agent's head position to screen space and moves its DOM tag. No per-tag React roots. */
function TagProjector({ world, tags, active, shown }: { world: Record<string, THREE.Vector3>; tags: React.RefObject<Record<string, HTMLDivElement | null>>; active: AgentId; shown: boolean }) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const id of ROLE_ORDER) {
      const el = tags.current?.[id];
      const w = world[id];
      if (!el || !w) continue;
      v.copy(w).project(camera);
      // Only the active agent is labelled; the others stay as unlabelled pins so labels never stack.
      const visible = id === activeRef.current && shownRef.current && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.display = visible ? '' : 'none';
      if (visible) el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

/* ---------- Camera ---------- */
function CameraRig({ town, selected, square, flyKey, highlight, place }: Pick<SceneProps, 'town' | 'selected' | 'square' | 'flyKey' | 'highlight' | 'place'>) {
  const controls = useRef<MapControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const at = selected != null ? town.lots[selected].pos : square;
    const t = new THREE.Vector3(at[0], 0, -at[1]);
    const near = selected != null;
    goal.current = { target: t, pos: t.clone().add(near ? new THREE.Vector3(-170, 210, 260) : new THREE.Vector3(-900, 1500, 2200)) };
  }, [town, selected, square, flyKey]);

  // New search results: frame the place and the matching lots together.
  useEffect(() => {
    if (!highlight?.length && !place) return;
    const pts: [number, number][] = (highlight ?? []).map((i) => town.lots[i].pos);
    if (place) pts.push([place.x, place.y]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const t = new THREE.Vector3((x0 + x1) / 2, 0, -(y0 + y1) / 2);
    // Fit the larger of width/height into the narrower field of view (the map panel is often taller than wide).
    const cam = camera as THREE.PerspectiveCamera;
    const vHalf = THREE.MathUtils.degToRad(cam.fov / 2), hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const span = Math.max(800, x1 - x0 + 1400, y1 - y0 + 1400);
    const dist = (span / 2 / Math.tan(Math.min(vHalf, hHalf))) * 1.3;
    goal.current = { target: t, pos: t.clone().add(new THREE.Vector3(0, 0.66, 0.75).normalize().multiplyScalar(dist)) };
  }, [town, highlight, place, camera]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => { goal.current = null; };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, []);

  useFrame((_, dt) => {
    const c = controls.current;
    const g = goal.current;
    if (!c || !g) return;
    const k = 1 - Math.pow(0.02, dt);
    c.target.lerp(g.target, k);
    camera.position.lerp(g.pos, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 2) goal.current = null;
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2.25}
      minDistance={60}
      maxDistance={26000}
      screenSpacePanning={false}
    />
  );
}

export default function TownScene(props: SceneProps) {
  const world = useMemo<Record<string, THREE.Vector3>>(() => ({}), []);
  const tags = useRef<Record<string, HTMLDivElement | null>>({});
  const sky = props.dark ? SKY.night : SKY.day;
  return (
    <div className="scene">
      <Canvas
        camera={{ position: [props.square[0] - 900, 1500, -props.square[1] + 2200], fov: 42, near: 4, far: 90000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={[sky.bg]} />
        <fog attach="fog" args={[sky.bg, 9000, 30000]} />
        <hemisphereLight args={sky.hemi as unknown as [string, string, number]} />
        <directionalLight position={[-3000, 6000, 2000]} intensity={sky.sun} color="#ffffff" />
        <City town={props.town} verdicts={props.verdicts} selected={props.selected} onSelect={props.onSelect} dark={props.dark} />
        <SearchLayer town={props.town} highlight={props.highlight} place={props.place} />
        <Agents town={props.town} selected={props.selected} activeAgent={props.activeAgent} square={props.square} world={world} dark={props.dark} />
        <TagProjector world={world} tags={tags} active={props.activeAgent} shown={props.selected != null && props.activeAgent !== 'planner'} />
        <CameraRig town={props.town} selected={props.selected} square={props.square} flyKey={props.flyKey} highlight={props.highlight} place={props.place} />
      </Canvas>
      <div className="tags" aria-hidden>
        {ROLE_ORDER.map((id) => {
          const role = ROLES[id];
          const on = id === props.activeAgent;
          return (
            <div key={id} ref={(el) => { tags.current[id] = el; }} className={`agent-tag${on ? ' on' : ''}`} style={{ display: 'none' }}>
              {role.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { VERDICT_COLORS };
