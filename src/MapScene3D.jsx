import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
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

function SpaceMesh({ space, hideLabel = false }) {
  const polygon = space.polygon || [];
  if (polygon.length < 3) return null;
  const center = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map(value => value / polygon.length);
  const { width, depth } = sizeOf(polygon);
  const type = space.type || 'INFO';
  const floorColor = space.color || palette[type] || '#dbe8f0';
  const trim = accent[type] || '#5b7b91';
  return <group>
    <Floor polygon={polygon} color={floorColor}/><EdgeTrim polygon={polygon} color={trim}/><RoomWalls polygon={polygon} color={trim} type={type}/>
    <group position={[world(center[0], 'x'), 0, -world(center[1], 'y')]}><SurfaceDetails type={type} width={width} depth={depth} color={trim}/>{!hideLabel && <SpaceSign type={type} width={width} color={trim}/>}<FeatureSet type={type} width={width} depth={depth} color={trim}/></group>
    {!hideLabel && <RoomLabel space={space} center={center} color={trim}/>} 
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
  const geometry = useMemo(() => points.length < 2 ? null : new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(world(point.x, 'x'), .42, -world(point.y, 'y')))), Math.max(8, points.length * 8), .075, 10, false), [points]);
  if (!geometry) return null;
  return <group><mesh geometry={geometry} castShadow><meshStandardMaterial color="#176dff" emissive="#0d4fc7" emissiveIntensity={.7} roughness={.35}/></mesh><mesh position={[world(points[0].x, 'x'), .45, -world(points[0].y, 'y')]}><sphereGeometry args={[.16, 16, 12]}/><meshStandardMaterial color="#ffffff" emissive="#2e79ff" emissiveIntensity={1}/></mesh></group>;
}

function FirstPersonCamera({ points }) {
  const { camera } = useThree();
  useEffect(() => {
    const current = points[0] || { x: 145, y: 615 };
    const next = points[1] || { x: current.x + 125, y: current.y };
    camera.position.set(world(current.x, 'x'), 1.45, -world(current.y, 'y'));
    camera.lookAt(world(next.x, 'x'), 1.2, -world(next.y, 'y'));
    camera.updateProjectionMatrix();
  }, [camera, points]);
  return null;
}

function GuideCharacter({ point, character = 'luna' }) {
  if (!point) return null;
  return <Html position={[world(point.x, 'x'), .04, -world(point.y, 'y')]} center distanceFactor={15} style={{ pointerEvents: 'none' }}><div style={{ position: 'relative', width: 48, height: 70, transform: 'translateY(4px)', filter: 'drop-shadow(0 7px 6px rgba(25,67,80,.3))' }}><img src={`/characters/${character}.png`} alt="안내 캐릭터" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom' }}/><span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', padding: '3px 6px', borderRadius: 8, background: '#0ca894', color: '#fff', font: '800 8px Inter, sans-serif' }}>안내 중</span></div></Html>;
}

function MobileGuideSceneV2({ character = 'luna', destination = '목적지' }) {
  const pathPoints = [[0,.1,4.5],[0,.1,2.8],[.25,.1,1.1],[.25,.1,-.7],[-.2,.1,-2.4],[.35,.1,-4.8]];
  const path = useMemo(() => new THREE.CatmullRomCurve3(pathPoints.map(([x,y,z]) => new THREE.Vector3(x,y,z))), []);
  const line = useMemo(() => new THREE.TubeGeometry(path, 56, .095, 14, false), [path]);
  const arrowGeometry = useMemo(() => { const shape = new THREE.Shape(); shape.moveTo(-.18,-.22); shape.lineTo(.18,-.22); shape.lineTo(.18,.02); shape.lineTo(.36,.02); shape.lineTo(0,.38); shape.lineTo(-.36,.02); shape.lineTo(-.18,.02); shape.closePath(); return new THREE.ExtrudeGeometry(shape, { depth: .1, bevelEnabled: true, bevelSegments: 2, bevelSize: .025, bevelThickness: .025 }); }, []);
  return <Canvas camera={{ position: [0, 2.05, 5.5], fov: 57, near: .05, far: 100 }} style={{width:'100%',height:'100%'}}>
    <color attach="background" args={['#ccefed']}/><fog attach="fog" args={['#ccefed',7,19]}/><ambientLight intensity={2.1}/><directionalLight position={[-5,8,6]} intensity={3.8} color="#fff8e8"/><pointLight position={[0,3,-1]} intensity={2.7} color="#c9f7ff"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.12,-.8]} receiveShadow><planeGeometry args={[12,15]}/><meshStandardMaterial color="#f8fcfb" roughness={.8}/></mesh>
    {Array.from({length:14}).map((_,i)=><mesh key={`floor-${i}`} rotation={[-Math.PI/2,0,0]} position={[0,-.105,5-i*.78]}><planeGeometry args={[11,.025]}/><meshStandardMaterial color={i%2?'#e2f1ef':'#f7fbfa'} roughness={.9}/></mesh>)}
    <mesh position={[-4,1.45,-.5]}><boxGeometry args={[.22,3.2,14]}/><meshStandardMaterial color="#b9ddda" roughness={.65}/></mesh><mesh position={[4,1.45,-.5]}><boxGeometry args={[.22,3.2,14]}/><meshStandardMaterial color="#b9ddda" roughness={.65}/></mesh>
    {[[-2.95,'#14aa99','INFO'],[2.95,'#4c7dff','101'],[-2.95,'#f09a54','POP-UP'],[2.95,'#8f6bdd','102']].map(([x,color,label],i)=><group key={`booth-${i}`} position={[x,1.15,i%2?-.9:-2.8]}><mesh><boxGeometry args={[1.55,1.5,.3]}/><meshStandardMaterial color="#f7ffff" roughness={.48}/></mesh><mesh position={[0,.58,.18]}><boxGeometry args={[1.36,.08,.08]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.75}/></mesh><Html position={[0,.35,.22]} center distanceFactor={14} style={{pointerEvents:'none'}}><span style={{padding:'4px 7px',borderRadius:7,background:'#ffffffed',color:'#173452',font:'900 8px Inter,sans-serif',whiteSpace:'nowrap'}}>{label}</span></Html></group>)}
    {[-2.15,2.15].map((x,i)=><group key={`plant-${i}`} position={[x,.1,.2]}><mesh><cylinderGeometry args={[.2,.25,.28,16]}/><meshStandardMaterial color="#d99b72"/></mesh><mesh position={[0,.42,0]}><sphereGeometry args={[.38,12,10]}/><meshStandardMaterial color="#55b985" roughness={.9}/></mesh></group>)}
    {[-2.6,-1.3,0,1.3,2.6].map((x,i)=><group key={`lamp-${i}`} position={[x,3.05,-.7]}><mesh><boxGeometry args={[.72,.045,.3]}/><meshStandardMaterial color="#fff" emissive="#e9ffff" emissiveIntensity={2.4}/></mesh></group>)}
    {[-.2,-1.15,-2.1,-3.05].map((z,i)=><mesh key={`arrow-${i}`} geometry={arrowGeometry} position={[0,.34,z]} rotation={[-Math.PI/3,0,0]} castShadow><meshStandardMaterial color="#176dff" emissive="#0b5bea" emissiveIntensity={1.1} roughness={.24} metalness={.12}/></mesh>)}
    <Html position={[0,.05,1.2]} center distanceFactor={20} style={{pointerEvents:'none'}}><div style={{position:'relative',width:78,height:110,transform:'scale(1)',filter:'drop-shadow(0 9px 8px rgba(20,60,80,.34))'}}><img src={`/characters/${character}.png`} alt="안내 캐릭터" style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'bottom'}}/><span style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'4px 8px',borderRadius:9,background:'#0ca894',color:'#fff',font:'800 9px Inter,sans-serif'}}>현재 위치</span></div></Html>
    <Html position={[.35,1.45,-4.35]} center distanceFactor={15} style={{pointerEvents:'none'}}><div style={{padding:'7px 11px',borderRadius:10,background:'#ef625e',color:'#fff',font:'900 10px Inter,sans-serif',whiteSpace:'nowrap',boxShadow:'0 6px 14px rgba(80,40,40,.25)'}}>목적지 · {destination}</div></Html>
  </Canvas>;
}

function BleConnectButton() {
  const connect = async () => {
    if (!navigator.bluetooth) return alert('이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome/Android HTTPS에서 사용하세요.');
    try {
      const params = new URLSearchParams(location.search), service = params.get('bleService'), characteristic = params.get('bleCharacteristic');
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: service ? [service] : ['battery_service'] });
      const server = await device.gatt.connect();
      const services = service ? [await server.getPrimaryService(service)] : await server.getPrimaryServices();
      let found = null;
      for (const item of services) { const list = await item.getCharacteristics(); found = list.find(c => c.properties.notify || c.properties.read); if (found) break; }
      if (!found) throw new Error('위치 데이터 특성을 찾지 못했습니다. QR 주소에 bleService/bleCharacteristic을 지정하세요.');
      const emit = value => { try { const text = new TextDecoder().decode(value); const data = JSON.parse(text); window.dispatchEvent(new CustomEvent('indoor-position', { detail: data })); } catch {} };
      found.addEventListener('characteristicvaluechanged', event => emit(event.target.value));
      if (found.properties.notify) await found.startNotifications(); else emit(found.value);
      alert(`${device.name || 'BLE 장치'} 위치 연결 완료`);
    } catch (error) { if (error?.name !== 'NotFoundError') alert(`BLE 연결 실패: ${error.message}`); }
  };
  return <button className="ble-connect" onClick={connect}>⌁ 위치 장치 연결</button>;
}

function MobileGuide2D({ map, routePoints = [], character = 'luna' }) {
  const route = routePoints.length ? routePoints : (map.nodes || []);
  const line = route.map(point => `${point.x},${point.y}`).join(' ');
  const current = route[0] || map.nodes?.[0] || { x: 145, y: 615 };
  const target = route[route.length - 1] || map.nodes?.at(-1) || { x: 940, y: 405 };
  return <svg className="mobile-guide-2d" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="guide2dBg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e7faf6"/><stop offset="1" stopColor="#eaf0ff"/></linearGradient></defs><rect width="1200" height="800" fill="url(#guide2dBg)"/><path d="M0 160H1200M0 320H1200M0 480H1200M0 640H1200M200 0V800M400 0V800M600 0V800M800 0V800M1000 0V800" stroke="#d4e8e6" strokeWidth="5" opacity=".55"/><rect x="35" y="35" width="1130" height="730" rx="30" fill="#ffffff" fillOpacity=".55" stroke="#c6dfdf" strokeWidth="8"/>{(map.spaces || []).map((space,index)=><polygon key={space.id||index} points={(space.polygon||[]).map(p=>p.join(',')).join(' ')} fill={space.color||'#d9f1eb'} stroke="#fff" strokeWidth="7"/>)}{route.length>1&&<><polyline points={line} fill="none" stroke="#fff" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round"/><polyline points={line} fill="none" stroke="#176dff" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 28"/></>}<circle cx={current.x} cy={current.y} r="34" fill="#176dff" fillOpacity=".18"/><circle cx={current.x} cy={current.y} r="18" fill="#176dff" stroke="#fff" strokeWidth="7"/><g transform={`translate(${target.x-22} ${target.y-70})`}><path d="M22 0C10 0 0 10 0 23c0 17 22 47 22 47s22-30 22-47C44 10 34 0 22 0Z" fill="#ef625e" stroke="#fff" strokeWidth="5"/><circle cx="22" cy="22" r="7" fill="#fff"/></g><image href={`/characters/${character}.png`} x={current.x-48} y={current.y-135} width="96" height="128" preserveAspectRatio="xMidYMax meet"/></svg>;
}

function WifiPositionBridge() {
  useEffect(() => { let alive = true; const poll = async () => { try { const response = await fetch('/api/position', { cache: 'no-store' }); const body = await response.json(); if (alive && body.position) window.dispatchEvent(new CustomEvent('indoor-position', { detail: body.position })); } catch {} }; poll(); const timer = setInterval(poll, 2000); return () => { alive = false; clearInterval(timer); }; }, []);
  return null;
}

function MobileSceneSwitch({ map, routePoints, character, destination }) {
  const [mode, setMode] = useState('3d');
  return <div className="mobile-scene-shell"><WifiPositionBridge/><div className="scene-toggle"><button className={mode==='3d'?'active':''} onClick={()=>setMode('3d')}>3D</button><button className={mode==='2d'?'active':''} onClick={()=>setMode('2d')}>2D</button></div>{mode==='3d'?<MobileGuideSceneV2 character={character} destination={destination}/>:<MobileGuide2D map={map} routePoints={routePoints} character={character}/>}<BleConnectButton /></div>;
}

function MobileGuideScene({ character = 'luna', destination = '목적지' }) {
  const path = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .08, 4.8), new THREE.Vector3(0, .08, 3.1), new THREE.Vector3(.05, .08, 1.4), new THREE.Vector3(-.45, .08, -.2), new THREE.Vector3(-.45, .08, -2.1), new THREE.Vector3(.25, .08, -4.7)
  ]), []);
  const line = useMemo(() => new THREE.TubeGeometry(path, 48, .075, 12, false), [path]);
  return <Canvas camera={{ position: [0, 2.1, 5.5], fov: 58, near: .05, far: 100 }} style={{ width: '100%', height: '100%' }}>
    <color attach="background" args={['#dff4f2']}/><fog attach="fog" args={['#dff4f2', 8, 22]}/><ambientLight intensity={1.9}/><directionalLight position={[-4, 7, 5]} intensity={3.2} color="#fff9e8"/><pointLight position={[0, 3, -2]} intensity={2.4} color="#d8f7ff"/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.12, -1]} receiveShadow><planeGeometry args={[12, 15]}/><meshStandardMaterial color="#f7fbfa" roughness={.82}/></mesh>
    {Array.from({length: 12}).map((_,i)=><mesh key={`tile-${i}`} rotation={[-Math.PI / 2,0,0]} position={[0,-.1,4.5-i*.85]}><planeGeometry args={[11,.018]}/><meshStandardMaterial color={i%2?'#e8f4f2':'#f5fbfa'} roughness={.9}/></mesh>)}
    <mesh position={[-3.9,1.45,-.7]}><boxGeometry args={[.18,3.2,13]}/><meshStandardMaterial color="#d4e9e7" roughness={.7}/></mesh><mesh position={[3.9,1.45,-.7]}><boxGeometry args={[.18,3.2,13]}/><meshStandardMaterial color="#d4e9e7" roughness={.7}/></mesh>
    {[-2.9,2.9].map((x,side)=><group key={side}>{[-2.8,.1,3].map((z,i)=><group key={i} position={[x,1.35,z]}><mesh><boxGeometry args={[1.55,1.55,.18]}/><meshStandardMaterial color={i===1?'#cfe0ff':'#d8f0ec'} roughness={.6}/></mesh><mesh position={[0,-.72,.1]}><boxGeometry args={[1.25,.06,.04]}/><meshStandardMaterial color={i===1?'#4c7dff':'#14aa99'} emissive={i===1?'#4c7dff':'#14aa99'} emissiveIntensity={.5}/></mesh></group>)}</group>)}
    {[-2.4,-.8,.8,2.4].map((x,i)=><group key={`light-${i}`} position={[x,3.1,-.8]}><mesh><boxGeometry args={[.8,.04,.28]}/><meshStandardMaterial color="#ffffff" emissive="#dffcff" emissiveIntensity={2.2}/></mesh></group>)}
    <mesh geometry={line} position={[0,0,0]}><meshStandardMaterial color="#176dff" emissive="#176dff" emissiveIntensity={1.1} roughness={.25}/></mesh>
    <Html position={[0,.02,-1.65]} center distanceFactor={10} style={{pointerEvents:'none'}}><div style={{position:'relative',width:62,height:92,filter:'drop-shadow(0 9px 6px rgba(20,60,80,.3))'}}><img src={`/characters/${character}.png`} alt="안내 캐릭터" style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'bottom'}}/><span style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'4px 8px',borderRadius:9,background:'#0ca894',color:'#fff',font:'800 9px Inter,sans-serif'}}>안내 중</span></div></Html>
    <Html position={[.25,1.35,-4.15]} center distanceFactor={14} style={{pointerEvents:'none'}}><div style={{padding:'6px 10px',borderRadius:10,background:'#ef625e',color:'#fff',font:'900 9px Inter,sans-serif',whiteSpace:'nowrap',boxShadow:'0 6px 14px rgba(80,40,40,.25)'}}>목적지 · {destination}</div></Html>
  </Canvas>;
}

export default function MapScene3D({ map, routePoints = [], firstPerson = false, character = 'luna' }) {
  if (firstPerson) return <MobileSceneSwitch map={map} routePoints={routePoints} character={character} destination={map.spaces?.find(space => space.type === 'EXHIBITION')?.name || '목적지'} />;
  const points = routePoints.length ? routePoints : (map.nodes || []);
  const destination = points[points.length - 1];
  return <Canvas shadows={!firstPerson} camera={firstPerson ? { position: [0, 1.45, 0], fov: 68, near: .05, far: 100 } : { position: [10, 13, 15], zoom: 50 }} style={{ width: '100%', height: '100%' }}>
    <color attach="background" args={['#e9f7f5']} /><ambientLight intensity={1.35}/><directionalLight castShadow position={[4, 10, 5]} intensity={4.2} shadow-mapSize={[2048, 2048]}/><pointLight position={[-4, 5, 3]} intensity={1.3} color="#d9f5ff"/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.08, 0]} receiveShadow><planeGeometry args={[18, 13]}/><meshStandardMaterial color="#fbfefd" roughness={.92}/></mesh>
    <Walkways map={map}/><RouteOverlay points={routePoints}/>{(map.spaces || []).map(space => <SpaceMesh key={space.id} space={space} hideLabel={firstPerson}/>)}
    {firstPerson && <><FirstPersonCamera points={points}/><GuideCharacter point={points[3] || points[2] || points[1] || points[0]} character={character}/><Html position={[world(destination?.x || 940, 'x'), .02, -world(destination?.y || 405, 'y')]} center distanceFactor={14} style={{ pointerEvents: 'none' }}><div style={{ padding: '5px 8px', borderRadius: 8, background: '#ef625e', color: '#fff', font: '900 9px Inter, sans-serif', boxShadow: '0 4px 10px rgba(80,40,40,.22)' }}>목적지</div></Html></>}
    <OrbitControls enabled={!firstPerson} enablePan={false} minZoom={32} maxZoom={70} maxPolarAngle={Math.PI / 2.25} minPolarAngle={Math.PI / 5}/>
  </Canvas>;
}
