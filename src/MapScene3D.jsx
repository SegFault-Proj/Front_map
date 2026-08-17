import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const palette = { INFO: '#bfeee4', EXHIBITION: '#c9dcff', FOOD: '#ffe4a7', POPUP: '#ffd1cb', REST: '#c9eee8', COMMON_AREA: '#e4d8ff' };
const accent = { INFO: '#13ad9b', EXHIBITION: '#4c7dff', FOOD: '#e79621', POPUP: '#ed6c77', REST: '#1baf9e', COMMON_AREA: '#8f6bdd' };
const world = (value, axis) => axis === 'x' ? (value - 600) / 75 : (value - 400) / 75;
const sizeOf = polygon => ({
  width: Math.max(.55, (Math.max(...polygon.map(p => p[0])) - Math.min(...polygon.map(p => p[0]))) / 75),
  depth: Math.max(.42, (Math.max(...polygon.map(p => p[1])) - Math.min(...polygon.map(p => p[1]))) / 75)
});

function box(color, args, position = [0, 0, 0], extra = {}) {
  return <mesh position={position} castShadow receiveShadow {...extra}><boxGeometry args={args}/><meshStandardMaterial color={color} roughness={.68}/></mesh>;
}

function Floor({ polygon, color }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    polygon.forEach(([x, y], i) => i ? shape.lineTo(world(x, 'x'), world(y, 'y')) : shape.moveTo(world(x, 'x'), world(y, 'y')));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: .34, bevelEnabled: true, bevelSegments: 3, bevelSize: .045, bevelThickness: .035 });
  }, [polygon]);
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.78}/></mesh>;
}

function EdgeTrim({ polygon, color }) {
  const geometry = useMemo(() => {
    const points = polygon.map(([x, y]) => new THREE.Vector3(world(x, 'x'), .38, -world(y, 'y')));
    points.push(points[0]);
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [polygon]);
  return <line geometry={geometry}><lineBasicMaterial color={color} linewidth={2}/></line>;
}

function RoomWalls({ polygon, color, type }) {
  const segments = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const ax = world(point[0], 'x'); const az = -world(point[1], 'y');
    const bx = world(next[0], 'x'); const bz = -world(next[1], 'y');
    const length = Math.hypot(bx - ax, bz - az);
    return { x: (ax + bx) / 2, z: (az + bz) / 2, length, angle: Math.atan2(bz - az, bx - ax) };
  }).filter(segment => segment.length > .42);
  return <group>{segments.map((segment, index) => <group key={index} position={[segment.x, .53, segment.z]} rotation={[0, -segment.angle, 0]}>
    <mesh castShadow><boxGeometry args={[segment.length, .3, .065]}/><meshStandardMaterial color="#f8ffff" roughness={.45} metalness={.08}/></mesh>
    <mesh position={[0, .03, -.041]}><boxGeometry args={[segment.length * .72, .15, .012]}/><meshStandardMaterial color={type === 'POPUP' ? '#f9a3a0' : type === 'EXHIBITION' ? '#a9c5ff' : color} transparent opacity={.72} roughness={.32}/></mesh>
    <mesh position={[0, .17, 0]}><boxGeometry args={[segment.length, .035, .085]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.22} roughness={.38}/></mesh>
  </group>)}</group>;
}

function Plant({ position, scale = 1 }) {
  return <group position={position} scale={scale}>
    {box('#d98b68', [.18, .14, .18], [0, .07, 0])}
    <mesh position={[0, .34, 0]} castShadow><sphereGeometry args={[.24, 10, 8]}/><meshStandardMaterial color="#4ea878" roughness={.9}/></mesh>
    <mesh position={[.15, .43, .03]} castShadow><sphereGeometry args={[.16, 10, 8]}/><meshStandardMaterial color="#76bd83" roughness={.9}/></mesh>
  </group>;
}

function Chair({ position, color = '#5f80bd' }) {
  return <group position={position}>{box(color, [.18, .07, .18], [0, .17, 0])}{box(color, [.16, .23, .05], [0, .29, -.07])}</group>;
}

function SurfaceDetails({ type, width, depth, color }) {
  const floorLines = Math.max(2, Math.min(6, Math.floor(width * 2)));
  const tileColor = type === 'EXHIBITION' || type === 'POPUP' ? '#ffffff' : '#d6e8e5';
  return <group>
    <mesh position={[0, .175, .02]} receiveShadow>
      <boxGeometry args={[Math.min(width * .86, 2.8), .012, Math.min(depth * .52, 1.35)]}/>
      <meshStandardMaterial color={type === 'EXHIBITION' ? '#edf2ff' : type === 'POPUP' ? '#fff0ed' : '#f8fcfa'} roughness={.92}/>
    </mesh>
    {Array.from({ length: floorLines }).map((_, i) => <mesh key={`tile-${i}`} position={[(i / Math.max(1, floorLines - 1) - .5) * Math.min(width * .82, 2.6), .184, .02]}>
      <boxGeometry args={[.008, .006, Math.min(depth * .5, 1.25)]}/><meshStandardMaterial color={tileColor} roughness={1}/>
    </mesh>)}
    <mesh position={[0, .19, depth * .31]}>
      <boxGeometry args={[Math.min(width * .72, 2.3), .018, .035]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.16} roughness={.45}/>
    </mesh>
    {[-1, 1].map(side => <group key={side} position={[side * Math.min(width * .38, 1.15), .66, -depth * .22]}>
      <mesh castShadow><cylinderGeometry args={[.075, .075, .16, 12]}/><meshStandardMaterial color="#f7d68a" emissive="#ffd875" emissiveIntensity={1.4}/></mesh>
      <mesh position={[0, -.13, 0]}><cylinderGeometry args={[.16, .11, .035, 16]}/><meshStandardMaterial color="#ffffff" roughness={.3}/></mesh>
    </group>)}
    <mesh position={[0, .195, -depth * .08]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.min(.22, width * .12), Math.min(.29, width * .16), 32]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.45} roughness={.35}/>
    </mesh>
  </group>;
}

function SpaceSign({ type, width, color }) {
  const title = type === 'EXHIBITION' ? 'EXHIBIT' : type === 'FOOD' ? 'CATERING' : type === 'POPUP' ? 'POP-UP' : type === 'REST' ? 'REST' : 'INFO';
  return <group position={[Math.min(width * .27, .58), .82, 0]} rotation={[0, -.08, 0]}>
    {box(color, [.065, .62, .055], [0, -.25, 0])}
    {box('#ffffff', [.52, .2, .06], [0, .1, 0])}
    <Html position={[0, .1, .04]} center distanceFactor={15} style={{ pointerEvents: 'none' }}><span style={{ color: '#173452', font: '900 8px Inter, sans-serif', letterSpacing: '1px' }}>{title}</span></Html>
  </group>;
}

function Table({ position, width = .9, color = '#ffffff' }) {
  return <group position={position}>{box(color, [width, .07, .35], [0, .34, 0])}{box('#9bb1b8', [width * .78, .35, .06], [0, .15, 0])}<Chair position={[-width * .34, 0, .28]}/><Chair position={[width * .34, 0, .28]} color="#ef9b83"/></group>;
}

function Counter({ position, width = 1, color = '#14aa99' }) {
  return <group position={position}>{box('#f8ffff', [width, .48, .34], [0, .27, 0])}{box(color, [width * .86, .08, .025], [0, .36, -.18])}{box('#ffffff', [width * .72, .06, .28], [0, .55, 0])}{box('#b8cbd0', [width * .62, .06, .06], [0, .08, 0])}</group>;
}

function Sofa({ position, width = 1, color = '#7d9cd3' }) {
  return <group position={position}>{box(color, [width, .18, .42], [0, .2, 0])}{box(color, [width, .34, .09], [0, .38, -.16])}{box(color, [.09, .22, .48], [-width * .46, .29, 0])}{box(color, [.09, .22, .48], [width * .46, .29, 0])}</group>;
}

function Canopy({ color, width, depth }) {
  const span = Math.min(1.4, width * .8);
  return <group position={[0, 0, -depth * .18]}>
    {[-1, 1].map(side => <group key={side} position={[side * span * .44, .48, 0]}>{box('#ffffff', [.045, .72, .045], [0, .25, 0])}{box(color, [.12, .08, .12], [0, .65, 0])}</group>)}
    <mesh position={[0, .82, 0]} castShadow><boxGeometry args={[span, .08, .45]}/><meshStandardMaterial color={color} roughness={.4} metalness={.1}/></mesh>
    <mesh position={[0, .76, .22]}><boxGeometry args={[span * .86, .025, .025]}/><meshStandardMaterial color="#fff5cf" emissive="#ffe28b" emissiveIntensity={1.2}/></mesh>
  </group>;
}

function FeatureSet({ type, width, depth, color }) {
  const isExpo = type === 'EXHIBITION';
  const isFood = type === 'FOOD';
  const isPopup = type === 'POPUP';
  if (isExpo || isPopup) return <group>
    <Canopy color={color} width={width} depth={depth}/>
    <group position={[0, .3, -depth * .22]}>{box(color, [Math.min(1.35, width * .75), .58, .08])}{box('#ffffff', [Math.min(1.15, width * .62), .13, .04], [0, .38, .06])}<mesh position={[0, .7, 0]}><sphereGeometry args={[.12, 10, 8]}/><meshStandardMaterial color={isPopup ? '#f05f6e' : '#5481e6'}/></mesh></group>
    <Table position={[0, 0, depth * .12]} width={Math.min(1.2, width * .52)} color={isPopup ? '#fff4f2' : '#eef3ff'}/>
    <Plant position={[-width * .32, 0, depth * .27]} scale={.7}/>
  </group>;
  if (isFood) return <group>
    <group position={[0, .34, -depth * .2]}>{box('#d88b38', [Math.min(1.5, width * .78), .52, .3])}{box('#fff4d5', [Math.min(1.42, width * .72), .06, .35], [0, .29, .02])}</group>
    <Table position={[0, 0, depth * .22]} width={Math.min(1.1, width * .56)} color="#fffaf0"/><Plant position={[width * .34, 0, depth * .25]} scale={.7}/>
  </group>;
  if (type === 'REST') return <group><Sofa position={[-width * .18, 0, 0]} width={Math.min(1.1, width * .5)} color="#79b8b4"/><mesh position={[width * .2, .21, .05]}><cylinderGeometry args={[.22, .22, .07, 24]}/><meshStandardMaterial color="#ffffff" roughness={.3}/></mesh><Plant position={[width * .36, 0, -depth * .25]} scale={.75}/></group>;
  if (type === 'COMMON_AREA') return <group><Counter position={[0, 0, -depth * .2]} width={Math.min(1.2, width * .62)} color="#916fdd"/><Sofa position={[0, 0, depth * .2]} width={Math.min(1.0, width * .48)} color="#c4a8ec"/></group>;
  if (type === 'INFO') return <group><Counter position={[0, 0, depth * .05]} width={Math.min(1.2, width * .62)} color="#14aa99"/><Plant position={[-width * .34, 0, -depth * .23]} scale={.72}/></group>;
  return <group><Table position={[0, 0, 0]} width={Math.min(1.05, width * .55)} color="#ffffff"/><Plant position={[-width * .32, 0, -depth * .25]} scale={.65}/></group>;
}

function RoomLabel({ space, center, color }) {
  return <Html position={[world(center[0], 'x'), .92, -world(center[1], 'y')]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
    <div style={{ padding: '6px 10px', borderRadius: 12, border: `2px solid ${color}`, background: 'rgba(255,255,255,.96)', boxShadow: '0 7px 18px rgba(28,61,78,.18)', color: '#173452', whiteSpace: 'nowrap', font: '800 11px Inter, Noto Sans KR, sans-serif' }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: color, marginRight: 6 }}/>{space.name || space.id}
    </div>
  </Html>;
}

function SpaceMesh({ space }) {
  const polygon = space.polygon || [];
  if (polygon.length < 3) return null;
  const center = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map(value => value / polygon.length);
  const { width, depth } = sizeOf(polygon);
  const type = space.type || 'INFO';
  const floorColor = space.color || palette[type] || '#dbe8f0';
  const trim = accent[type] || '#5b7b91';
  return <group>
    <Floor polygon={polygon} color={floorColor}/><EdgeTrim polygon={polygon} color={trim}/><RoomWalls polygon={polygon} color={trim} type={type}/>
    <group position={[world(center[0], 'x'), 0, -world(center[1], 'y')]}><SurfaceDetails type={type} width={width} depth={depth} color={trim}/><SpaceSign type={type} width={width} color={trim}/><FeatureSet type={type} width={width} depth={depth} color={trim}/></group>
    <RoomLabel space={space} center={center} color={trim}/>
  </group>;
}

function Walkways({ map }) {
  const geometry = useMemo(() => {
    const byId = new Map((map.nodes || []).map(node => [node.id, node]));
    return (map.edges || []).flatMap(edge => { const a = byId.get(edge.from); const b = byId.get(edge.to); return a && b ? [[new THREE.Vector3(world(a.x, 'x'), .015, -world(a.y, 'y')), new THREE.Vector3(world(b.x, 'x'), .015, -world(b.y, 'y'))]] : []; });
  }, [map.nodes, map.edges]);
  return <group>{geometry.map((pair, index) => <mesh key={index} geometry={new THREE.TubeGeometry(new THREE.LineCurve3(pair[0], pair[1]), 1, .11, 8, false)}><meshStandardMaterial color="#d5e6e9" roughness={.9}/></mesh>)}</group>;
}

function RouteOverlay({ points = [] }) {
  const geometry = useMemo(() => points.length < 2 ? null : new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(world(point.x, 'x'), .3, -world(point.y, 'y')))), Math.max(8, points.length * 8), .07, 10, false), [points]);
  if (!geometry) return null;
  return <group><mesh geometry={geometry} castShadow><meshStandardMaterial color="#176dff" emissive="#0d4fc7" emissiveIntensity={.35} roughness={.4}/></mesh><mesh position={[world(points[0].x, 'x'), .33, -world(points[0].y, 'y')]}><sphereGeometry args={[.16, 16, 12]}/><meshStandardMaterial color="#ffffff" emissive="#2e79ff" emissiveIntensity={.8}/></mesh></group>;
}

function CharacterMarker({ point }) {
  const group = useRef();
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = 0.3 + Math.sin(clock.elapsedTime * 3) * 0.035;
  });
  if (!point) return null;
  return <group ref={group} position={[world(point.x, 'x'), 0.3, -world(point.y, 'y')]}>
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.34, 32]}/><meshBasicMaterial color="#176dff" transparent opacity={.18}/>
    </mesh>
    <Html position={[0, 1.05, 0]} center transform distanceFactor={8} style={{ pointerEvents: 'none' }}>
      <div className="character-marker"><div className="character-bubble">현재 위치</div><img src="/characters/luna.png" alt="루나 안내 캐릭터"/></div>
    </Html>
  </group>;
}

function MobileMapPreview({ map, routePoints = [], currentPoint }) {
  const selected = typeof window !== 'undefined' ? sessionStorage.getItem('selected-character') : 'luna';
  const characterImage = `/characters/${selected || 'luna'}.png`;
  const route = routePoints.length > 1 ? routePoints : (map.nodes || []);
  const points = route.map(point => `${point.x},${point.y}`).join(' ');
  const current = currentPoint || route[0] || { x: 145, y: 615 };
  const destination = route[route.length - 1] || { x: 940, y: 405 };
  return <svg className="mobile-map-visual" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="mobileMapBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#effbf8"/><stop offset="1" stopColor="#eaf1ff"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#mobileMapBg)"/>
    <path d="M0 160H1200M0 320H1200M0 480H1200M0 640H1200M200 0V800M400 0V800M600 0V800M800 0V800M1000 0V800" stroke="#dcebea" strokeWidth="4" opacity=".55"/>
    <rect x="42" y="44" width="1116" height="710" rx="36" fill="#ffffff" fillOpacity=".48" stroke="#d4e5e8" strokeWidth="8"/>
    {(map.spaces || []).map((space, index) => {
      const polygon = space.polygon || [];
      if (polygon.length < 3) return null;
      const center = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map(value => value / polygon.length);
      return <g key={space.id || index}><polygon points={polygon.map(point => point.join(',')).join(' ')} fill={space.color || '#d9f1eb'} stroke="#ffffff" strokeWidth="7"/><text x={center[0]} y={center[1]} textAnchor="middle" fill="#294561" fontSize="22" fontWeight="800">{space.name || space.id}</text></g>;
    })}
    {route.length > 1 && <><polyline points={points} fill="none" stroke="#ffffff" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round"/><polyline points={points} fill="none" stroke="#176dff" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 34"/></>}
    <circle cx={current.x} cy={current.y} r="34" fill="#176dff" fillOpacity=".17"/><circle cx={current.x} cy={current.y} r="18" fill="#176dff" stroke="#ffffff" strokeWidth="7"/>
    <g transform={`translate(${destination.x - 22} ${destination.y - 70})`}><path d="M22 0C10 0 0 10 0 23c0 17 22 47 22 47s22-30 22-47C44 10 34 0 22 0Z" fill="#ef625e" stroke="#fff" strokeWidth="5"/><circle cx="22" cy="22" r="7" fill="#fff"/></g>
    <g transform={`translate(${current.x - 54} ${current.y - 170})`}><rect width="108" height="34" rx="12" fill="#0ca894"/><text x="54" y="23" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">현재 위치</text><path d="M45 34h18l-9 12Z" fill="#0ca894"/><image href={characterImage} x="-18" y="28" width="90" height="120" preserveAspectRatio="xMidYMax meet"/></g>
  </svg>;
}

export default function MapScene3D({ map, routePoints = [], currentPoint, showCharacter = false }) {
  if (typeof window !== 'undefined' && window.location.pathname === '/mobile') return <MobileMapPreview map={map} routePoints={routePoints} currentPoint={currentPoint}/>;
  const characterPoint = routePoints[0] || map.nodes?.[0];
  return <Canvas shadows orthographic camera={{ position: [10, 13, 15], zoom: 50 }} style={{ width: '100%', height: '100%' }}>
    <color attach="background" args={['#e9f7f5']} /><ambientLight intensity={1.35}/><directionalLight castShadow position={[4, 10, 5]} intensity={4.2} shadow-mapSize={[2048, 2048]}/><pointLight position={[-4, 5, 3]} intensity={1.3} color="#d9f5ff"/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.08, 0]} receiveShadow><planeGeometry args={[18, 13]}/><meshStandardMaterial color="#fbfefd" roughness={.92}/></mesh>
    <Walkways map={map}/><RouteOverlay points={routePoints}/>{showCharacter&&<CharacterMarker point={characterPoint}/>} {(map.spaces || []).map(space => <SpaceMesh key={space.id} space={space}/>)}
    <OrbitControls enablePan={false} minZoom={32} maxZoom={70} maxPolarAngle={Math.PI / 2.25} minPolarAngle={Math.PI / 5}/>
  </Canvas>;
}
