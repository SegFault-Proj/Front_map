import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import './styles.css';

const API = '/api';
const MAP_ID = 'venue-001';
const congestion = {
  LOW: { label: '여유', color: '#55c9ae', fill: '#e4f8f2' },
  NORMAL: { label: '보통', color: '#f5a623', fill: '#fff1d7' },
  HIGH: { label: '혼잡', color: '#ef625e', fill: '#ffe4e1' },
  CLOSED: { label: '운영 중단', color: '#718096', fill: '#e9edf2' },
};

const fallbackMap = {
  mapId: MAP_ID, width: 1200, height: 800,
  spaces: [
    { id: 'SPACE_01', name: '안내데스크', type: 'INFO', polygon: [[105,485],[270,485],[270,615],[105,615]], congestion: 'LOW', selectable: true },
    { id: 'SPACE_02', name: '전시장 A', type: 'EXHIBITION', polygon: [[300,180],[520,180],[520,450],[300,450]], congestion: 'NORMAL', selectable: true },
    { id: 'SPACE_03', name: '푸드존', type: 'FOOD', polygon: [[550,180],[715,180],[715,405],[550,405]], congestion: 'NORMAL', selectable: true },
    { id: 'SPACE_04', name: '팝업존', type: 'POPUP', polygon: [[745,180],[1010,180],[1010,405],[745,405]], congestion: 'HIGH', selectable: true },
    { id: 'SPACE_05', name: '휴식존', type: 'REST', polygon: [[785,425],[1060,425],[1060,625],[785,625]], congestion: 'LOW', selectable: true },
    { id: 'SPACE_06', name: '전시장 B', type: 'EXHIBITION', polygon: [[550,450],[760,450],[760,650],[550,650]], congestion: 'NORMAL', selectable: true },
  ],
  nodes: [{id:'NODE_01',x:145,y:615,kind:'ENTRANCE'},{id:'NODE_02',x:270,y:615},{id:'NODE_03',x:270,y:450},{id:'NODE_04',x:470,y:450},{id:'NODE_05',x:470,y:260},{id:'NODE_06',x:715,y:260},{id:'NODE_07',x:715,y:405},{id:'NODE_08',x:940,y:405,kind:'DESTINATION'}],
  edges: [{from:'NODE_01',to:'NODE_02',distance:125},{from:'NODE_02',to:'NODE_03',distance:165},{from:'NODE_03',to:'NODE_04',distance:200},{from:'NODE_04',to:'NODE_05',distance:190},{from:'NODE_05',to:'NODE_06',distance:245},{from:'NODE_06',to:'NODE_07',distance:145},{from:'NODE_07',to:'NODE_08',distance:225}],
};

const labels = { SPACE_01: '안내데스크', SPACE_02: '전시장 A', SPACE_03: '푸드존', SPACE_04: '팝업존', SPACE_05: '휴식존', SPACE_06: '전시장 B' };
const iconFor = type => ({ INFO: 'ⓘ', EXHIBITION: '▧', FOOD: '♨', POPUP: '♧', REST: '▱' }[type] || '●');
const center = s => { const xs=s.polygon.map(p=>p[0]), ys=s.polygon.map(p=>p[1]); return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]; };
function normalizeMap(raw) { const source = raw || fallbackMap; return { ...fallbackMap, ...source, spaces: (source.spaces || fallbackMap.spaces).map(s => ({ ...s, name: labels[s.id] || s.name || s.id, congestion: s.congestion || 'NORMAL', selectable: s.selectable !== false })) }; }
function localRoute(map, start, end) { const queue=[start], previous={[start]:null}; while(queue.length){const current=queue.shift(); if(current===end) break; (map.edges||[]).filter(e=>e.from===current||e.to===current).forEach(e=>{const next=e.from===current?e.to:e.from;if(previous[next]===undefined){previous[next]=current;queue.push(next);}});} if(previous[end]===undefined)return[]; const ids=[]; for(let id=end;id!==null;id=previous[id])ids.unshift(id); return ids.map(id=>map.nodes.find(n=>n.id===id)).filter(Boolean); }

function MapSvg({ map, selectedId, onSelect, route }) {
  const routePoints = route?.routePoints?.length ? route.routePoints : localRoute(map, 'NODE_01', 'NODE_08');
  return <svg viewBox="0 0 1200 800" role="img" aria-label="2.5D 실내 지도">
    <defs><linearGradient id="floor" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fbfffd"/><stop offset="1" stopColor="#eef5f5"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="#7894a0" floodOpacity=".22"/></filter></defs>
    <rect x="60" y="100" width="1080" height="610" rx="22" fill="url(#floor)" stroke="#d8e5e6" strokeWidth="5" filter="url(#shadow)"/>
    <path d="M85 675H1115M85 135H1115" stroke="#eaf1f1" strokeWidth="2"/>
    {map.spaces.map(space => { const meta=congestion[space.congestion]||congestion.NORMAL; const points=space.polygon.map(p=>p.join(',')).join(' '); const [x,y]=center(space); return <g key={space.id} className={`map-space ${selectedId===space.id?'is-selected':''}`} onClick={()=>onSelect(space)}>
      <polygon points={points} fill={meta.fill} stroke={selectedId===space.id?'#1677ff':'#a7c2c3'} strokeWidth={selectedId===space.id?5:3}/><path d={`M ${space.polygon[0][0]} ${space.polygon[0][1]} L ${space.polygon[1][0]} ${space.polygon[1][1]}`} stroke="#fff" strokeWidth="7" opacity=".7"/>
      <text x={x} y={y-3} textAnchor="middle" className="map-label">{labels[space.id] || space.name}</text><text x={x} y={y+18} textAnchor="middle" className="map-sub">{space.type} · {meta.label}</text>
    </g>; })}
    <g className="route-layer"><polyline points={routePoints.map(n=>`${n.x},${n.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/><polyline points={routePoints.map(n=>`${n.x},${n.y}`).join(' ')} fill="none" stroke="#1677ff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 20"/></g>
    <circle cx="145" cy="615" r="22" fill="#1677ff" stroke="#fff" strokeWidth="8"/><circle cx="145" cy="615" r="7" fill="#fff"/><path d="M940 360c-19 0-33 15-33 33 0 25 33 57 33 57s33-32 33-57c0-18-14-33-33-33Z" fill="#ef625e" stroke="#fff" strokeWidth="6"/><circle cx="940" cy="393" r="8" fill="#fff"/>
    <g className="guide-marker"><circle cx="615" cy="330" r="25" fill="#fff" stroke="#1677ff" strokeWidth="5"/><text x="615" y="337" textAnchor="middle">✦</text></g>
  </svg>;
}

function QRModal({ url, onClose }) { const canvasRef=useRef(null); const [ready,setReady]=useState(false); useEffect(()=>{ QRCode.toCanvas(canvasRef.current,url,{width:260,margin:2,color:{dark:'#142b4a',light:'#ffffff'}}).then(()=>setReady(true)); },[url]); const download=()=>{const a=document.createElement('a');a.download='live-miniature-qr.png';a.href=canvasRef.current.toDataURL('image/png');a.click();}; return <div className="modal-backdrop" onClick={onClose}><section className="qr-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><p className="eyebrow">QR ENTRY</p><h2>현장 입장 QR</h2><p>스캔하면 방문객 안내 화면이 열립니다.</p><div className="qr-frame"><canvas ref={canvasRef}/>{!ready&&<span>QR 생성 중…</span>}</div><code>{url}</code><div className="modal-actions"><button className="ghost" onClick={onClose}>닫기</button><button className="primary" onClick={download} disabled={!ready}>PNG 다운로드</button></div></section></div>; }

function Editor() {
  const [map,setMap]=useState(fallbackMap); const [selectedId,setSelectedId]=useState('SPACE_04'); const [route,setRoute]=useState(null); const [status,setStatus]=useState('저장되지 않은 변경 없음'); const [qrOpen,setQrOpen]=useState(false); const [uploading,setUploading]=useState(false); const [health,setHealth]=useState('확인 중'); const [startNode,setStartNode]=useState('NODE_01'); const [destinationNode,setDestinationNode]=useState('NODE_08');
  const selected=map.spaces.find(s=>s.id===selectedId)||map.spaces[0];
  const qrUrl=useMemo(()=>`${location.origin}/map/${map.mapId}?startNodeId=${startNode}&destinationNodeId=${destinationNode}`,[map.mapId,startNode,destinationNode]);
  useEffect(()=>{fetch(`${API}/maps/${MAP_ID}`).then(r=>r.ok?r.json():Promise.reject()).then(data=>setMap(normalizeMap(data))).catch(()=>setStatus('샘플 지도로 작업 중')); fetch(`${API}/ai/health`).then(r=>r.json()).then(data=>setHealth(data.ok?'연결됨':'대기 중')).catch(()=>setHealth('대기 중'));},[]);
  const updateSpace=(patch)=>{setMap(prev=>({...prev,spaces:prev.spaces.map(s=>s.id===selected.id?{...s,...patch}:s)}));setStatus('변경사항이 있습니다');};
  const save=async()=>{setStatus('저장 중…');try{const r=await fetch(`${API}/maps/${map.mapId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(map)});if(!r.ok)throw new Error();setStatus('저장 완료 · 방금 전');}catch{setStatus('저장 실패 · 서버 연결을 확인하세요');}};
  const preview=async()=>{setStatus('AI 경로 계산 중…'); try{const r=await fetch(`${API}/ai/routes/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapId:map.mapId,startNodeId:startNode,destinationNodeId:destinationNode})}); const body=await r.json(); setRoute(body.data||body);setStatus(`${(body.data||body).source==='fallback'?'fallback':'AI'} 경로 반영`);}catch{setRoute({routePoints:localRoute(map,startNode,destinationNode),source:'fallback'});setStatus('fallback 경로 반영');}};
  const analyze=async e=>{const file=e.target.files?.[0];if(!file)return;setUploading(true);setStatus('도면 분석 중…');try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const r=await fetch(`${API}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,dataUrl})});if(!r.ok)throw new Error();const result=await r.json();if(result.spaces?.length)setMap(prev=>({...prev,spaces:result.spaces.map(s=>({...s,name:s.name||s.id,congestion:'NORMAL',selectable:true}))}));setStatus('도면 분석 완료 · 결과를 확인하고 저장하세요');}catch{setStatus('도면 분석 실패 · 기존 지도를 유지합니다');}finally{setUploading(false);e.target.value='';}};
  return <div className="guide-app"><header className="guide-header"><div className="guide-brand"><div className="guide-logo">◇</div><div><b>LIVE<br/>MINIATURE</b><small>INDOOR MAP STUDIO</small></div></div><div className="header-right"><span className="guide-status"><i className="guide-dot"/>실시간 혼잡도 {health}</span><label className="guide-upload">{uploading?'분석 중…':'도면 업로드'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={analyze} hidden/></label><button className="ghost" onClick={()=>setQrOpen(true)}>▣ QR 생성</button><button className="primary" onClick={save}>지도 저장</button></div></header>
    <main className="studio-main"><aside className="studio-left"><p className="guide-kicker">맵 제작 스튜디오</p><h1>캐릭터가 안내하는<br/><em>2.5D 실내 지도</em></h1><p className="guide-copy">실시간 혼잡도를 반영한 최적 경로를 만들고, 완성된 지도를 QR로 현장에 배포하세요.</p><div className="feature-list"><div><b>01</b><span><strong>도면 업로드</strong><small>이미지 도면을 공간 데이터로 변환</small></span></div><div><b>02</b><span><strong>공간·혼잡도 편집</strong><small>방문객이 이해하기 쉬운 색상 체계</small></span></div><div><b>03</b><span><strong>QR로 현장 배포</strong><small>생성된 링크는 방문객 화면으로 연결</small></span></div></div><div className="pipeline"><strong>연동 상태</strong><span><i/> 지도 API · 연결됨</span><span><i/> 경로 API · {health}</span><span><i/> 저장 API · 사용 가능</span></div></aside>
      <section className="studio-center"><div className="map-head"><div><p className="eyebrow">{map.mapId.toUpperCase()} · LIVE MAP</p><h2>행사장 안내 지도</h2></div><div className="map-tools"><button className="active">2.5D</button><button>전체 보기</button><button onClick={preview}>↗ 경로 미리보기</button></div></div><div className="studio-map"><MapSvg map={map} selectedId={selectedId} onSelect={s=>setSelectedId(s.id)} route={route}/><div className="map-status"><i/> 실시간 혼잡도 반영 <span>·</span> 클릭해 공간 편집</div><div className="route-badge">➜ 추천 경로 <small>{route?.source||'demo'}</small></div><div className="map-callout callout-a">ⓘ <b>안내데스크</b><small>여유</small></div><div className="map-callout callout-b">♧ <b>팝업존</b><small>혼잡</small></div><div className="map-callout callout-c">▱ <b>휴식존</b><small>여유</small></div></div><div className="legend"><span><i className="low"/>여유</span><span><i className="normal"/>보통</span><span><i className="high"/>혼잡</span><span><i className="closed"/>운영 중단</span><b>파란 선 = 추천 이동 경로</b></div><div className="space-cards">{map.spaces.slice(0,6).map(s=><button key={s.id} className={selectedId===s.id?'selected':''} onClick={()=>setSelectedId(s.id)}><span className="card-icon">{iconFor(s.type)}</span><strong>{labels[s.id]||s.name}</strong><small>{s.type} · {(congestion[s.congestion]||congestion.NORMAL).label}</small></button>)}</div></section>
      <aside className="studio-right"><div className="inspector-card"><p className="eyebrow">SPACE INSPECTOR</p><div className="inspector-title"><h2>{selected?.name||'공간 선택'}</h2><span style={{color:congestion[selected?.congestion]?.color}}>{congestion[selected?.congestion]?.label}</span></div><p className="id-line">{selected?.id} · {selected?.type}</p><label>혼잡도 상태</label><div className="congestion-buttons">{Object.entries(congestion).map(([key,value])=><button key={key} className={selected?.congestion===key?'on':''} onClick={()=>updateSpace({congestion:key})}><i style={{background:value.color}}/>{value.label}</button>)}</div><div className="inspector-stats"><div><b>{selected?.polygon?.length||0}</b><small>경계점</small></div><div><b>{map.nodes.length}</b><small>노드</small></div><div><b>{map.edges.length}</b><small>연결선</small></div></div><label>공간 이름</label><input value={selected?.name||''} onChange={e=>updateSpace({name:e.target.value})}/><div className="route-select"><label>경로 미리보기</label><select value={startNode} onChange={e=>setStartNode(e.target.value)}>{map.nodes.map(n=><option key={n.id} value={n.id}>출발 · {n.id}</option>)}</select><select value={destinationNode} onChange={e=>setDestinationNode(e.target.value)}>{map.nodes.map(n=><option key={n.id} value={n.id}>목적 · {n.id}</option>)}</select><button className="dark-button" onClick={preview}>경로 계산 및 지도에 표시</button></div><button className="publish-button" onClick={()=>setQrOpen(true)}>▣ 이 지도를 QR로 배포하기</button></div><div className="character-card"><img src="/characters/luna.png" alt="루나 가이드"/><div><b>루나 가이드</b><p>지금 편집한 지도를 방문객에게 바로 안내해 보세요.</p><button onClick={()=>setQrOpen(true)}>QR 만들기 →</button></div></div><div className="save-note"><i/> {status}</div></aside>
    </main>{qrOpen&&<QRModal url={qrUrl} onClose={()=>setQrOpen(false)}/>}</div>;
}

function App(){ return <Editor/>; }
createRoot(document.getElementById('root')).render(<App/>);
