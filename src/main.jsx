import React, { Component, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './mobile.css';

const API = '/api';
const characters = [
  { id: 'luna', name: '루나', role: '메인 가이드', color: '#0eb09b', text: '차분하고 정확하게 안내해요' },
  { id: 'mini', name: '미니', role: '친절한 안내자', color: '#5b86f7', text: '처음 방문해도 쉽게 알려줘요' },
  { id: 'zio', name: '지오', role: '탐험 가이드', color: '#f19b49', text: '새로운 공간을 함께 찾아요' },
  { id: 'doon', name: '둔', role: '에너지 메이커', color: '#9b72df', text: '빠르고 힘차게 이동해요' },
];
const labels = { LOW: '여유', NORMAL: '보통', HIGH: '혼잡', CLOSED: '운영 중단' };
const colors = { LOW: '#b8eee3', NORMAL: '#ffe0a8', HIGH: '#ffb5af', CLOSED: '#c6ced8' };
const fallbackMap = {
  mapId: 'venue-001', width: 1200, height: 800,
  spaces: [
    { id: 'SPACE_01', name: '안내데스크', type: 'INFO', polygon: [[105,485],[270,485],[270,615],[105,615]], congestion: 'LOW', selectable: true },
    { id: 'SPACE_02', name: '전시장 A', type: 'EXHIBITION', polygon: [[300,180],[520,180],[520,450],[300,450]], congestion: 'NORMAL', selectable: true },
    { id: 'SPACE_03', name: '팝업존 B-12', type: 'POPUP', polygon: [[550,180],[715,180],[715,405],[550,405]], congestion: 'HIGH', selectable: true },
    { id: 'SPACE_04', name: '이벤트 라운지', type: 'REST', polygon: [[745,180],[1010,180],[1010,405],[745,405]], congestion: 'LOW', selectable: true },
    { id: 'SPACE_06', name: '전시장 B', type: 'EXHIBITION', polygon: [[550,450],[760,450],[760,650]], congestion: 'NORMAL', selectable: true },
  ],
  nodes: [{id:'NODE_01',x:145,y:615,kind:'ENTRANCE'},{id:'NODE_02',x:270,y:615},{id:'NODE_03',x:270,y:450},{id:'NODE_04',x:470,y:450},{id:'NODE_05',x:470,y:260},{id:'NODE_06',x:715,y:260},{id:'NODE_07',x:715,y:405},{id:'NODE_08',x:940,y:405,kind:'DESTINATION'}],
  edges: [{from:'NODE_01',to:'NODE_02',distance:125},{from:'NODE_02',to:'NODE_03',distance:165},{from:'NODE_03',to:'NODE_04',distance:200},{from:'NODE_04',to:'NODE_05',distance:190},{from:'NODE_05',to:'NODE_06',distance:245},{from:'NODE_06',to:'NODE_07',distance:145},{from:'NODE_07',to:'NODE_08',distance:225}],
};

function normalizeMap(raw) {
  const map = raw || fallbackMap;
  const fixedNames = { SPACE_01:'안내데스크', SPACE_02:'전시장 A', SPACE_03:'팝업존 B-12', SPACE_04:'이벤트 라운지', SPACE_06:'전시장 B' };
  return { ...fallbackMap, ...map, spaces: (map.spaces || fallbackMap.spaces).map((s) => ({ ...s, name: fixedNames[s.id] || s.name || s.id, congestion: s.congestion || 'NORMAL', selectable: s.selectable !== false })) };
}
function center(space) { const xs = space.polygon.map(p => p[0]), ys = space.polygon.map(p => p[1]); return [(Math.min(...xs)+Math.max(...xs))/2, (Math.min(...ys)+Math.max(...ys))/2]; }
function nearestNode(map, space) { const [x,y] = center(space); return map.nodes.reduce((best,n) => !best || Math.hypot(n.x-x,n.y-y) < best.d ? { n, d: Math.hypot(n.x-x,n.y-y) } : best, null)?.n || map.nodes.at(-1); }
function nearestLocationNode(map, latitude, longitude) { const anchors = (map.nodes || []).map(node => ({ node, latitude: Number(node.latitude ?? node.lat ?? node.location?.latitude), longitude: Number(node.longitude ?? node.lng ?? node.location?.longitude) })).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)); if (!anchors.length) return null; return anchors.reduce((best, item) => { const distance = Math.hypot((item.latitude - latitude) * 111000, (item.longitude - longitude) * 90000); return !best || distance < best.distance ? { node: item.node, distance } : best; }, null)?.node || null; }
function localRoute(map, startId, endId) { const q=[startId], prev={ [startId]: null }; while(q.length){ const id=q.shift(); if(id===endId) break; map.edges.filter(e=>e.from===id||e.to===id).forEach(e=>{const n=e.from===id?e.to:e.from;if(prev[n]===undefined){prev[n]=id;q.push(n);}}); } if(prev[endId]===undefined)return[]; const ids=[]; for(let id=endId;id!==null;id=prev[id])ids.unshift(id); return ids.map(id=>map.nodes.find(n=>n.id===id)).filter(Boolean); }


function MapPreview({ map, route, destination, onSelect }) {
  const points = route.routePoints?.length ? route.routePoints : route.path?.map(id => map.nodes.find(n=>n.id===id)).filter(Boolean) || [];
  return <div className="map-preview"><div className="map-float"><span className="live-pulse"/> 실시간 혼잡도 반영</div><div className="indoor-scene" aria-label="캐릭터 실내 내비게이션 지도"><div className="scene-ceiling"/><div className="scene-wall scene-wall-left"><span>안내데스크</span><i className="scene-window"/><i className="scene-plant p1"/><i className="scene-plant p2"/></div><div className="scene-wall scene-wall-right"><span>{destination?.name || '목적지'}</span><i className="scene-booth"/><i className="scene-plant p3"/></div><div className="scene-floor"><i className="scene-route"/></div><div className="scene-pin"><small>{destination?.name || '전시장 A'}</small><b>여유</b></div><div className="scene-character-wrap"><img className="scene-character" src="/characters/luna.png" alt="루나 안내 캐릭터"/><i className="character-ground"/></div><div className="scene-sign">A2 <small>→</small></div><div className="scene-map-dots">{(map.spaces||[]).slice(0,5).map(s=><button key={s.id} onClick={()=>onSelect?.(s)} aria-label={`${s.name} 선택`} style={{background:colors[s.congestion]||colors.NORMAL}}/> )}</div></div><button className="map-control">⌖</button><button className="map-3d">3D</button></div>;
}

function Header({ step, onBack }) { return <header className="mobile-top">{onBack ? <button className="icon-button" onClick={onBack} aria-label="뒤로">‹</button> : <span className="header-spacer"/>}<div className="brand-lockup"><strong>LIVE MINIATURE</strong><small>실시간 실내 내비게이션</small></div><span className="step-pill">{step}/4</span></header>; }

function MobileApp() {
  const [screen, setScreen] = useState('start');
  const [map, setMap] = useState(fallbackMap); const [mapId, setMapId] = useState('venue-001'); const [character, setCharacter] = useState(characters[0]);
  const [destination, setDestination] = useState(null); const [startNode, setStartNode] = useState('NODE_01'); const [locationStatus, setLocationStatus] = useState('현재 위치 · 입구 기준');
  const [route, setRoute] = useState({}); const [loading, setLoading] = useState(false); const [apiState, setApiState] = useState('지도 연결 확인 중');
  useEffect(() => { const params = new URLSearchParams(location.search); const requestedMap = params.get('mapId') || params.get('map') || 'venue-001'; const requestedStart = params.get('startNodeId'); if (requestedStart) setStartNode(requestedStart); fetch(`${API}/maps/${encodeURIComponent(requestedMap)}`).then(r=>r.ok?r.json():Promise.reject()).then(raw=>{const next=normalizeMap(raw);setMap(next);setMapId(next.mapId||requestedMap);setApiState('지도 동기화 완료');}).catch(()=>setApiState('샘플 지도 모드')); }, []);
  useEffect(() => { if (!navigator.geolocation) { setLocationStatus('현재 위치 · 입구 기준'); return; } const watchId = navigator.geolocation.watchPosition(position => { const node = nearestLocationNode(map, position.coords.latitude, position.coords.longitude); if (node) { setStartNode(node.id); setLocationStatus(`현재 위치 · ${node.name || node.id}`); } else { setLocationStatus('현재 위치 · 실내 위치 보정 중'); } }, () => setLocationStatus('현재 위치 권한 없음 · 입구 기준'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }); return () => navigator.geolocation.clearWatch(watchId); }, [map]);
  const destinations = map.spaces.filter(s=>s.selectable !== false);
  const selectedDestination = destination || destinations.find(s=>s.id==='SPACE_04') || destinations[1];
  const destinationNode = selectedDestination ? nearestNode(map, selectedDestination) : map.nodes.at(-1);
  const fallback = useMemo(() => localRoute(map, startNode, destinationNode?.id), [map,startNode,destinationNode?.id]);
  const showRoute = async () => { if(!destinationNode)return; setLoading(true); try { const r=await fetch(`${API}/ai/routes/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapId:map.mapId,startNodeId:startNode,destinationNodeId:destinationNode.id})}); const body=await r.json(); setRoute(body.data || body); } catch { setRoute({path:fallback.map(n=>n.id),routePoints:fallback,source:'fallback'}); } finally { setLoading(false); setScreen('nav'); } };
  const routeData = route.path?.length ? route : { path:fallback.map(n=>n.id), routePoints:fallback, totalDistance:fallback.reduce((sum,n,i)=>i?sum+Math.hypot(n.x-fallback[i-1].x,n.y-fallback[i-1].y):0), estimatedSeconds: Math.max(60, fallback.length*25), source:'fallback' };
  const routePoints = routeData.routePoints?.length ? routeData.routePoints : routeData.path?.map(id=>map.nodes.find(n=>n.id===id)).filter(Boolean) || fallback;
  const distance = Math.round(routeData.totalDistance || routeData.distance || 110); const seconds = Math.round(routeData.estimatedSeconds || distance/0.8); const destinationPoint = destinationNode;
  const back = () => setScreen(screen==='characters'?'start':screen==='route'?'characters':screen==='nav'?'route':'start');
  if(screen==='start') return <div className="mobile-react"><Header step="1"/><main className="welcome-screen"><div className="mini-logo"><span>✦</span></div><p className="eyebrow">LIVE MINIATURE</p><h1>복잡한 실내도<br/><em>쉽고 빠르게</em> 안내해요</h1><p className="lead">캐릭터가 실시간으로 이동하며<br/>혼잡을 피해 최적의 경로를 안내해요.</p><div className="hero-character"><div className="speech">안녕하세요!</div><img src="/characters/luna.png" alt="루나"/><span className="hero-shadow"/></div><button className="primary-button full" onClick={()=>setScreen('characters')}>내비게이션 시작 <b>→</b></button><p className="helper">LIVE MINIATURE와 함께 목적지까지 안내받아 보세요.</p></main></div>;
  if(screen==='characters') return <div className="mobile-react"><Header step="2" onBack={back}/><main className="flow-screen"><p className="eyebrow">GUIDE CHARACTER</p><h1>함께 안내할<br/><em>캐릭터를 선택하세요</em></h1><p className="lead small">{mapId} 지도에 연결됐어요. 원하는 가이드와 함께 이동해요.</p><div className="character-grid">{characters.map(c=><button className={`character-card ${character.id===c.id?'selected':''}`} key={c.id} onClick={()=>{setCharacter(c);setScreen('route')}}><div className="character-art" style={{background:`${c.color}16`}}><img src={`/characters/${c.id}.png`} alt={c.name}/></div><strong>{c.name}</strong><small>{c.role}</small><span style={{color:c.color}}>{c.text}</span></button>)}</div><div className="status-banner"><span className="live-pulse"/><div><strong>{apiState}</strong><small>행사장 지도와 실시간 상태를 불러왔어요.</small></div></div></main></div>;
  if(screen==='route') return <div className="mobile-react"><Header step="4" onBack={back}/><main className="flow-screen"><p className="eyebrow">ROUTE SETUP · {mapId}</p><h1>어디로 이동할까요?<br/><em>목적지를 선택하세요</em></h1><p className="lead small">공간을 선택하면 현재 위치에서 가장 가까운 노드로 경로를 계산해요.</p><div className="location-card"><span className="location-dot">⌖</span><div><strong>{locationStatus}</strong><small>휴대폰 위치 기반 · 경로 시작점 {startNode}</small></div><span className="location-live"/></div><div className="destination-list">{destinations.map(s=><button key={s.id} className={selectedDestination?.id===s.id?'selected':''} onClick={()=>setDestination(s)}><span className="place-icon">{s.type==='EXHIBITION'?'▦':s.type==='INFO'?'ⓘ':s.type==='REST'?'◌':'◆'}</span><span><strong>{s.name}</strong><small>{s.type} · {labels[s.congestion]}</small></span><i>›</i></button>)}</div><div className="route-summary"><span>현재 위치</span><b>→</b><strong>{selectedDestination?.name || '목적지'}</strong><small>혼잡도를 반영한 추천 경로 · {startNode} → {destinationNode?.id || 'NODE_08'}</small></div><button className="primary-button full" disabled={loading || !selectedDestination} onClick={showRoute}>{loading?'경로 계산 중…':'추천 경로로 안내받기'} <b>→</b></button></main></div>;
  return <div className="mobile-react nav-screen"><Header step="5" onBack={back}/><main className="nav-main"><div className="nav-intro"><div><p className="eyebrow">{mapId} · 목적지</p><h1>{selectedDestination?.name || '전시장 A'}</h1><span className={`congestion ${selectedDestination?.congestion||'LOW'}`}>{labels[selectedDestination?.congestion] || '여유'}</span></div><div className="route-metric"><strong>{Math.max(1,Math.ceil(seconds/60))}<small>분</small></strong><span>{distance}m</span></div></div><MapPreview map={map} route={{...routeData,routePoints}} destination={destinationPoint} onSelect={setDestination}/><section className="direction-card"><div className="turn-icon">↱</div><div><small>다음 안내 · {routeData.instructions?.[0]?.distance || 20}m 앞</small><strong>{routeData.instructions?.[0]?.text || '우회전'}</strong><span>안내데스크를 지나 직진하세요</span></div><div className="progress-dots"><i/><i/><i/><i/></div></section><div className="nav-actions"><button onClick={()=>setScreen('route')}>목적지 변경</button><button className="primary-button" onClick={()=>setScreen('start')}>경로 종료</button></div><div className="guide-strip"><img src={`/characters/${character.id}.png`} alt={character.name}/><div><strong>{character.name}가 안내 중이에요</strong><small>혼잡이 발생하면 더 좋은 경로로 자동 재탐색해요.</small></div><span>›</span></div><div className="source-note"><span className="live-pulse"/> {routeData.source==='fallback'?'백업 경로로 안내 중':'AI 추천 경로 · 실시간 반영'}</div></main><BottomNav active="map"/></div>;
}

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? <div className="mobile-react error-screen"><main className="welcome-screen"><div className="mini-logo"><span>✦</span></div><p className="eyebrow">LIVE MINIATURE</p><h1>내비게이션을<br/><em>준비하고 있어요</em></h1><p className="lead">잠시 후 다시 시도하거나 페이지를 새로고침해 주세요.</p><button className="primary-button full" onClick={()=>location.reload()}>다시 불러오기</button></main></div> : this.props.children; }
}
function App() { return <MobileApp/>; }
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
