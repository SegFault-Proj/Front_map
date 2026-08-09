(function () {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  document.querySelectorAll('.generated-map-visual,.generated-map-labels').forEach(node => node.remove());
  const oldSvg = document.getElementById('mapSvg');
  if (oldSvg) oldSvg.style.display = 'none';
  const canvas = document.createElement('canvas');
  canvas.className = 'dynamic-3d-map';
  canvas.setAttribute('aria-label', '도면 데이터 기반 3D 실내 지도');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const palette = { INFO:'#ccefe8', EXHIBITION:'#cfe1ff', FOOD:'#ffe6aa', POPUP:'#ffd6d2', REST:'#ccefe8', COMMON_AREA:'#eadcff' };
  const statusColor = { LOW:'#11ad96', NORMAL:'#f39a18', HIGH:'#ef625e', CLOSED:'#718096' };
  const statusName = { LOW:'여유', NORMAL:'보통', HIGH:'혼잡', CLOSED:'운영 중단' };
  const asPolygon = space => Array.isArray(space.polygon) ? space.polygon : (typeof space.points === 'string' ? space.points.trim().split(/\s+/).map(item => item.split(',').map(Number)) : []);
  const bounds = points => { const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]); return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}; };
  const project = (x,y,w,h) => { const scale=Math.min(w/1420,h/980); return [w/2+(x-600)*scale-(y-400)*scale*.22,h*.52+(x-600)*scale*.10+(y-400)*scale*.60]; };
  const path = points => { ctx.beginPath(); points.forEach((p,i)=>{const q=project(p[0],p[1],canvas.clientWidth,canvas.clientHeight);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);}); ctx.closePath(); };
  const fillPolygon = (points,fill,stroke='#fff',line=3) => { path(points); ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=line; ctx.stroke(); };
  const rounded = (x,y,w,h,r) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); };
  const center = points => { const b=bounds(points); return [b.x+b.w/2,b.y+b.h/2]; };
  function roomFurniture(space, box, fill, w, h) {
    const count = space.type === 'FOOD' || space.type === 'POPUP' ? 4 : space.type === 'EXHIBITION' ? 3 : 2;
    for (let i=0;i<count;i++) {
      const x=box.x+box.w*(.25+((i*31)%45)/100), y=box.y+box.h*(.38+((i*19)%35)/100), q=project(x,y,w,h);
      ctx.fillStyle='#ffffffd9'; ctx.shadowColor='#315f7730'; ctx.shadowBlur=7; rounded(q[0]-18,q[1]-7,36,14,5); ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle=fill; ctx.fillRect(q[0]-13,q[1]+4,26,4);
    }
  }
  function facilityLabels(map,w,h) {
    const ignored=new Set(['ELEVATOR','STAIR','DOOR','WINDOW']), seen=new Set();
    (map.ocrTextCandidates||[]).filter(item=>item.role&&!ignored.has(item.role)&&String(item.text||'').trim()).forEach(item=>{
      const text=String(item.text).trim().replace(/\s+/g,' '), key=text.replace(/[^가-힣A-Za-z0-9]/g,'').toLowerCase();
      if(seen.has(key))return; seen.add(key);
      const q=project(item.x+(item.width||0)/2,item.y+(item.height||0)/2,w,h);
      ctx.font='800 11px Inter, Noto Sans KR, sans-serif'; const tw=ctx.measureText(text).width;
      ctx.fillStyle='#ffffff'; ctx.shadowColor='#315f7730'; ctx.shadowBlur=8; rounded(q[0]-tw/2-10,q[1]-15,tw+20,30,10); ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle='#087f72'; ctx.textAlign='center'; ctx.fillText(text,q[0],q[1]+4);
    });
    ctx.textAlign='left';
  }
  function draw() {
    const map=window.liveMapData; if(!map)return;
    const rect=wrap.getBoundingClientRect(), w=Math.max(500,Math.round(rect.width)), h=Math.max(500,Math.round(rect.height));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas.style.width=w+'px';canvas.style.height=h+'px';}
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#edf8f7'; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.shadowColor='#46697933'; ctx.shadowBlur=22; ctx.fillStyle='#fbfefd'; rounded(w*.07,h*.12,w*.86,h*.75,20); ctx.fill(); ctx.restore();
    const spaces=(map.spaces||[]).map(space=>({...space,polygon:asPolygon(space)})).filter(space=>space.polygon.length>=3).sort((a,b)=>bounds(a.polygon).y-bounds(b.polygon).y);
    spaces.forEach(space=>{
      const box=bounds(space.polygon), fill=space.color||palette[space.type]||'#e3edf5';
      const side=space.polygon.map(point=>[point[0],point[1]+34]);
      fillPolygon(side,'#b7cbd0','#a8bcc4',2); fillPolygon(space.polygon,fill,'#ffffff',4); roomFurniture(space,box,fill,w,h);
      const c=project(box.x+box.w/2,box.y+box.h*.18,w,h), label=space.name||space.id;
      ctx.font='800 13px Inter, Noto Sans KR, sans-serif'; const tw=ctx.measureText(label).width;
      ctx.fillStyle='#ffffffef'; ctx.shadowColor='#315f7725'; ctx.shadowBlur=9; rounded(c[0]-tw/2-10,c[1]-17,tw+20,29,9); ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle='#142b4a'; ctx.textAlign='center'; ctx.fillText(label,c[0],c[1]);
      ctx.fillStyle=statusColor[space.congestion]||statusColor.NORMAL; ctx.font='700 9px Inter, Noto Sans KR, sans-serif'; ctx.fillText(statusName[space.congestion]||'보통',c[0],c[1]+13);
    });
    facilityLabels(map,w,h);
    const wallKeys=new Set(); (map.walls||[]).forEach(wall=>{const key=[Math.round(wall.x1/5),Math.round(wall.y1/5),Math.round(wall.x2/5),Math.round(wall.y2/5)].join(':');if(wallKeys.has(key))return;wallKeys.add(key);const a=project(wall.x1,wall.y1,w,h),b=project(wall.x2,wall.y2,w,h);ctx.strokeStyle='#6f8490';ctx.lineWidth=5;ctx.lineCap='round';ctx.shadowColor='#46697930';ctx.shadowBlur=4;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.shadowBlur=0;});
    ctx.textAlign='left';
  }
  function frame(){draw();requestAnimationFrame(frame);} frame();
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{const is2d=tab.dataset.view==='2d';if(oldSvg)oldSvg.style.display=is2d?'block':'none';canvas.style.display=is2d?'none':'block';}));
})();
