const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 4101);
const publicDir = path.join(__dirname, 'public');
const mapsDir = path.join(__dirname, 'data', 'maps');
const uploadsDir = path.join(__dirname, 'data', 'uploads');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const aiBaseUrl = process.env.AI_BASE_URL || 'http://127.0.0.1:4000';
const tlsKey = process.env.TLS_KEY ? path.resolve(process.env.TLS_KEY) : path.join(__dirname, 'certs', 'localhost-key.pem');
const tlsCert = process.env.TLS_CERT ? path.resolve(process.env.TLS_CERT) : path.join(__dirname, 'certs', 'localhost.pem');
const tlsPfx = process.env.TLS_PFX ? path.resolve(process.env.TLS_PFX) : path.join(__dirname, 'certs', 'localhost.pfx');
const tlsPfxPassword = process.env.TLS_PFX_PASSWORD || 'live-miniature';
const usePfx = fs.existsSync(tlsPfx);
const useHttps = usePfx || (fs.existsSync(tlsKey) && fs.existsSync(tlsCert));
let latestIndoorPosition = null;

function lanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) return entry.address;
  }
  return 'localhost';
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (body.length > 12_000_000) {
        settled = true;
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(body); } });
    req.on('error', error => { if (!settled) { settled = true; reject(error); } });
  });
}

function requestJson(url, options = {}, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? require('https') : http;
    const request = client.request(target, { method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => { try { const json = JSON.parse(body || '{}'); if (response.statusCode >= 400) reject(new Error(`AI_${response.statusCode}`)); else resolve(json); } catch { reject(new Error('AI_INVALID_JSON')); } });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('AI_TIMEOUT')));
    request.on('error', reject); if (options.body) request.write(options.body); request.end();
  });
}

function fallbackRoute(map, startId, destinationId) {
  const queue = [startId], previous = { [startId]: null };
  while (queue.length) { const current = queue.shift(); if (current === destinationId) break; (map.edges || []).filter(edge => edge.from === current || edge.to === current).forEach(edge => { const next = edge.from === current ? edge.to : edge.from; if (previous[next] === undefined) { previous[next] = current; queue.push(next); } }); }
  if (previous[destinationId] === undefined) return { path: [], edgeIds: [], routePoints: [], instructions: [], totalDistance: 0, estimatedSeconds: 0, source: 'fallback' };
  const path = []; for (let id = destinationId; id !== null; id = previous[id]) path.unshift(id);
  const nodes = path.map(id => (map.nodes || []).find(node => node.id === id)).filter(Boolean);
  const edgeIds = []; let totalDistance = 0;
  for (let i = 1; i < path.length; i++) { const edge = (map.edges || []).find(item => (item.from === path[i-1] && item.to === path[i]) || (item.to === path[i-1] && item.from === path[i])); if (edge) { edgeIds.push(edge.id || `${path[i-1]}-${path[i]}`); totalDistance += Number(edge.distance) || 0; } }
  return { path, edgeIds, routePoints: nodes, instructions: [{ text: '우회전', distance: 20 }], totalDistance, estimatedSeconds: Math.max(60, Math.round(totalDistance / 1.1)), source: 'fallback' };
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function runTesseract(buffer, psm = 11) {
  return new Promise(resolve => {
    const executable = process.env.TESSERACT_PATH || 'tesseract';
    const child = spawn(executable, ['stdin', 'stdout', '--psm', String(psm), '-l', 'kor+eng', 'tsv'], { windowsHide: true });
    let output = ''; let settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish([]); }, 12000);
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.on('error', () => finish([]));
    child.on('close', code => {
      if (code !== 0) return finish([]);
      const words = output.split(/\r?\n/).slice(1).map(row => row.split('\t')).filter(row => row.length >= 12 && Number(row[10]) >= 35 && row[11].trim()).map(row => ({ x:Number(row[6]), y:Number(row[7]), width:Number(row[8]), height:Number(row[9]), confidence:Number(row[10]), text:row[11].trim() }));
      finish(words);
    });
    child.stdin.on('error', () => {}); child.stdin.end(buffer);
  });
}

async function runOcr(buffer) {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 1, height = metadata.height || 1;
  const results = await Promise.all([0, 90, 270].flatMap(angle => [11, 6].map(async psm => {
      const rotated = angle ? await sharp(buffer).rotate(angle).png().toBuffer() : buffer;
      // Architectural drawings contain thin gray strokes and colored label
      // boxes. Normalize them before OCR so Korean glyphs survive the scan.
      const prepared = await sharp(rotated).grayscale().normalize().sharpen({ sigma: 1.1 }).png().toBuffer();
      const words = [...await runTesseract(rotated, psm), ...await runTesseract(prepared, psm)];
    return words.map(word => {
      const corners = [[word.x, word.y], [word.x + word.width, word.y], [word.x, word.y + word.height], [word.x + word.width, word.y + word.height]].map(([x, y]) => {
        if (angle === 90) return [y, height - x];
        if (angle === 270) return [width - y, x];
        return [x, y];
      });
      const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
      return { x:Math.min(...xs), y:Math.min(...ys), width:Math.max(...xs)-Math.min(...xs), height:Math.max(...ys)-Math.min(...ys), confidence:word.confidence, text:word.text };
    });
  })));
  const unique = new Map();
  results.flat().filter(word => word.text.length > 1 || /[A-Za-z0-9]/.test(word.text)).forEach(word => {
    const key = `${word.text.toLowerCase()}-${Math.round(word.x/24)}-${Math.round(word.y/24)}`;
    const previous = unique.get(key);
    if (!previous || word.confidence > previous.confidence) unique.set(key, word);
  });
  return [...unique.values()];
}

async function analyzeImage(buffer, roi = null) {
  const normalizedBuffer = await sharp(buffer).rotate().toBuffer();
  const metadata = await sharp(normalizedBuffer).metadata();
  const sourceWidth = metadata.width || 1; const sourceHeight = metadata.height || 1;
  const thumb = await sharp(normalizedBuffer).resize(240, 180, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let leftStructurePixels=0;
  for(let y=0;y<thumb.info.height;y++)for(let x=0;x<Math.floor(thumb.info.width*.22);x++){const at=(y*thumb.info.width+x)*3;if(thumb.data[at]<170&&thumb.data[at+1]<170&&thumb.data[at+2]<170)leftStructurePixels++;}
  const fullPlanLayout=leftStructurePixels>thumb.info.width*thumb.info.height*.22*.02;
  const autoRoi = !roi && sourceWidth >= 1300 && sourceHeight >= 700 && !fullPlanLayout
    ? { x: 0.19, y: 0.10, width: 0.79, height: 0.75 }
    : { x: 0, y: 0, width: 1, height: 1 };
  const requestedRoi = roi || autoRoi;
  const safeRoi = {
    x: clamp(Number(requestedRoi.x) || 0, 0, 1), y: clamp(Number(requestedRoi.y) || 0, 0, 1),
    width: clamp(Number(requestedRoi.width) || 1, 0.02, 1), height: clamp(Number(requestedRoi.height) || 1, 0.02, 1)
  };
  safeRoi.width = Math.min(safeRoi.width, 1 - safeRoi.x); safeRoi.height = Math.min(safeRoi.height, 1 - safeRoi.y);
  const targetWidth = Math.min(1000, Math.max(120, Math.round(sourceWidth * safeRoi.width)));
  const targetHeight = Math.min(760, Math.max(120, Math.round(sourceHeight * safeRoi.height)));
  const left = Math.round(sourceWidth * safeRoi.x); const top = Math.round(sourceHeight * safeRoi.y);
  const roiBuffer = await sharp(normalizedBuffer).extract({ left, top, width: Math.max(1, Math.round(sourceWidth * safeRoi.width)), height: Math.max(1, Math.round(sourceHeight * safeRoi.height)) }).png().toBuffer();
  const [rawResult, ocrWords] = await Promise.all([
    sharp(roiBuffer).resize(targetWidth, targetHeight, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    runOcr(roiBuffer)
  ]);
  const { data, info } = rawResult;
  const width = info.width, height = info.height, size = width * height;
  const purple = new Uint8Array(size);
  const architecture = new Uint8Array(size);
  let purpleCount = 0;
  for (let i = 0; i < size; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    // Purple layer: high red/blue relative to green. This intentionally
    // ignores gray/black architectural strokes and most shadows.
    const isPurple = r > 65 && b > 65 && r + b > g * 2.05 && Math.max(r, b) - g > 22;
    purple[i] = isPurple ? 1 : 0; if (isPurple) purpleCount++;
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    architecture[i] = luminance < 205 && chroma < 42 ? 1 : 0;
  }
  const toMap = (x, y) => [Math.round(70 + x / Math.max(1, width - 1) * 1060), Math.round(120 + y / Math.max(1, height - 1) * 580)];
  const inFrame = (x, y) => x > 12 && y > 12 && x < width - 12 && y < height - 12;
  const lines = [];
  const collectRuns = (mask, horizontal, fraction, source) => {
    const outer = horizontal ? height : width, inner = horizontal ? width : height;
    const minimum = Math.max(16, Math.round(inner * fraction));
    for (let a = 0; a < outer; a++) { let start = -1;
      for (let b = 0; b <= inner; b++) { const hit = b < inner && (horizontal ? mask[a * width + b] : mask[b * width + a]);
        if (hit && start < 0) start = b;
        if ((!hit || b === inner) && start >= 0) { const length = b - start;
          if (length >= minimum && inFrame(horizontal ? start : a, horizontal ? a : start) && inFrame(horizontal ? b - 1 : a, horizontal ? a : b - 1)) {
            const p1 = horizontal ? toMap(start, a) : toMap(a, start); const p2 = horizontal ? toMap(b - 1, a) : toMap(a, b - 1);
            lines.push({ x1:p1[0], y1:p1[1], x2:p2[0], y2:p2[1], axis: a, horizontal, source, confidence: Number(Math.min(.96, .58 + length / inner * .35).toFixed(2)) });
          } start = -1;
        }
      }
    }
  };
  collectRuns(purple, true, .10, 'color'); collectRuns(purple, false, .10, 'color');
  collectRuns(architecture, true, .035, 'architecture'); collectRuns(architecture, false, .035, 'architecture');
  const merged = [];
  lines.sort((a,b) => Math.max(Math.abs(b.x2-b.x1),Math.abs(b.y2-b.y1)) - Math.max(Math.abs(a.x2-a.x1),Math.abs(a.y2-a.y1))).forEach(line => {
    const axis = line.horizontal ? line.y1 : line.x1; const start = line.horizontal ? Math.min(line.x1,line.x2) : Math.min(line.y1,line.y2); const end = line.horizontal ? Math.max(line.x1,line.x2) : Math.max(line.y1,line.y2);
    const same = merged.find(other => other.horizontal === line.horizontal && Math.abs(other.axis-axis) <= 10 && Math.min(end,other.end)-Math.max(start,other.start) > Math.min(end-start,other.end-other.start)*.35);
    if (same) { same.start=Math.min(same.start,start); same.end=Math.max(same.end,end); same.axis=(same.axis+axis)/2; same.source = same.source === line.source ? same.source : 'mixed'; } else merged.push({horizontal:line.horizontal,start,end,axis,source:line.source,confidence:line.confidence});
  });
  const dedupedLines = merged.map(line => line.horizontal ? {x1:Math.round(line.start),y1:Math.round(line.axis),x2:Math.round(line.end),y2:Math.round(line.axis),horizontal:true,source:line.source,confidence:line.confidence} : {x1:Math.round(line.axis),y1:Math.round(line.start),x2:Math.round(line.axis),y2:Math.round(line.end),horizontal:false,source:line.source,confidence:line.confidence}).slice(0, 80);
  const pointDistance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
  const lineLength = line => Math.hypot(line.x2-line.x1, line.y2-line.y1);
  const connectionCount = line => {
    const ends = [[line.x1,line.y1],[line.x2,line.y2]];
    return dedupedLines.filter(other => other !== line).filter(other => {
      const otherEnds = [[other.x1,other.y1],[other.x2,other.y2]];
      return ends.some(end => otherEnds.some(otherEnd => pointDistance(end,otherEnd) <= 18));
    }).length;
  };
  // Repeated short parallel strokes in a compact band are usually stairs,
  // furniture, or door marks rather than navigable walls.
  const repeatedBand = line => {
    if (lineLength(line) > 125) return false;
    const parallel = dedupedLines.filter(other => other !== line && other.horizontal === line.horizontal && Math.abs((line.horizontal ? line.y1 : line.x1) - (other.horizontal ? other.y1 : other.x1)) <= 22);
    return parallel.length >= 4;
  };
  const filteredLines = dedupedLines.map(line => {
    const length = lineLength(line);
    const connectedCount = connectionCount(line);
    const nearHorizontal = Math.abs(line.y2-line.y1) <= 8;
    const nearVertical = Math.abs(line.x2-line.x1) <= 8;
    const touchesBoundary = Math.min(line.x1,line.x2) < 120 || Math.max(line.x1,line.x2) > 1080 || Math.min(line.y1,line.y2) < 170 || Math.max(line.y1,line.y2) > 650;
    let status = 'NOISE';
    if (line.source !== 'color' && (nearHorizontal || nearVertical) && length >= 90 && (connectedCount >= 2 || (touchesBoundary && length >= 180) || (line.source === 'architecture' && connectedCount >= 1 && length >= 55))) status = 'CONFIRMED';
    else if ((nearHorizontal || nearVertical) && length >= 25 && (connectedCount >= 1 || touchesBoundary || length >= 70)) status = 'CANDIDATE';
    if (repeatedBand(line) && length < 125) status = 'CANDIDATE';
    return {...line, status, connectedCount, type: length > (line.horizontal ? width * .38 : height * .38) ? 'OUTER' : 'INNER'};
  });
  // Connected purple components provide booth/facility candidates. Tiny text,
  // border fragments and very thin text-like components are discarded.
  const visited = new Uint8Array(size), spaces = [], facilities = [];
  for (let i=0;i<size;i++) if (purple[i] && !visited[i]) { const queue=[i]; visited[i]=1; let count=0,minX=width,maxX=0,minY=height,maxY=0;
    while(queue.length){const at=queue.pop(),x=at%width,y=Math.floor(at/width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const n of [at-1,at+1,at-width,at+width]){if(n>=0&&n<size&&!visited[n]&&purple[n]&&Math.abs((n%width)-x)<=1){visited[n]=1;queue.push(n)}}}
    const boxWidth=maxX-minX+1,boxHeight=maxY-minY+1, ratio=Math.max(boxWidth,boxHeight)/Math.max(1,Math.min(boxWidth,boxHeight));
    if(count>=150 && boxWidth>=35 && boxHeight>=20 && ratio<=15 && minX>12 && minY>12 && maxX<width-12 && maxY<height-12) { const polygon=[toMap(minX,minY),toMap(maxX,minY),toMap(maxX,maxY),toMap(minX,maxY)]; spaces.push({polygon,area:count,confidence:Number(Math.min(.95,.62+Math.min(.3,count/size*8)).toFixed(2)),source:'purple',type:'EXHIBITION',name:'홍보부스'}); if(boxWidth<=180&&boxHeight>=30&&boxHeight<=140&&boxWidth/boxHeight<3) facilities.push({id:`BOOTH_${String(facilities.length+1).padStart(2,'0')}`,type:'BOOTH',name:'홍보부스',polygon,confidence:.9,source:'purple-component'}); }
  }
  const colorFacilityMasks=[
    {type:'PHOTO',name:'포토존',hit:(r,g,b)=>r>210&&g>120&&b>150&&r>g*1.08&&r>b*.92},
    {type:'CATERING',name:'케이터링',hit:(r,g,b)=>r>200&&g>155&&b>100&&r>b*1.18},
    {type:'INFO',name:'안내데스크',hit:(r,g,b)=>g>145&&g>r*1.05&&g>b*1.02&&r<205},
    {type:'BOOTH',name:'홍보부스',hit:(r,g,b)=>b>r*1.03&&b>g*1.12&&r>100}
  ];
  colorFacilityMasks.forEach(({type,name,hit})=>{
    const mask=new Uint8Array(size),seen=new Uint8Array(size);for(let i=0;i<size;i++){const r=data[i*3],g=data[i*3+1],b=data[i*3+2];if(hit(r,g,b))mask[i]=1;}
    for(let i=0;i<size;i++)if(mask[i]&&!seen[i]){const queue=[i];seen[i]=1;let count=0,minX=width,maxX=0,minY=height,maxY=0;while(queue.length){const at=queue.pop(),x=at%width,y=Math.floor(at/width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const n of [at-1,at+1,at-width,at+width])if(n>=0&&n<size&&!seen[n]&&mask[n]&&Math.abs((n%width)-x)<=1){seen[n]=1;queue.push(n)}}const bw=maxX-minX+1,bh=maxY-minY+1;if(count>=120&&bw>=25&&bh>=15&&bw<360&&bh<260)facilities.push({id:`${type}_${String(facilities.length+1).padStart(2,'0')}`,type,name,polygon:[toMap(minX,minY),toMap(maxX,minY),toMap(maxX,maxY),toMap(minX,maxY)],confidence:.86,source:'color-semantic'});}
  });
  // Build spaces from a snapped wall mask rather than from individual lines.
  // This keeps rooms separate when line endpoints are a few pixels apart.
  const structuralLines = filteredLines.filter(line => line.status !== 'NOISE');
  const snapped = structuralLines.map(line => ({...line}));
  for (let i=0;i<snapped.length;i++) for (let j=i+1;j<snapped.length;j++) {
    const a=snapped[i], b=snapped[j], ap=[[a.x1,a.y1],[a.x2,a.y2]], bp=[[b.x1,b.y1],[b.x2,b.y2]];
    ap.forEach((point,ai)=>bp.forEach((other,bi)=>{if(Math.hypot(point[0]-other[0],point[1]-other[1])<=15){const mx=Math.round((point[0]+other[0])/2),my=Math.round((point[1]+other[1])/2);if(ai===0){a.x1=mx;a.y1=my}else{a.x2=mx;a.y2=my}if(bi===0){b.x1=mx;b.y1=my}else{b.x2=mx;b.y2=my}}}));
  }
  // Extend near-intersections so an almost-touching horizontal/vertical pair
  // closes a room instead of leaking into the outside flood-fill region.
  for (const horizontal of snapped) for (const vertical of snapped) {
    if (!horizontal.horizontal || vertical.horizontal) continue;
    const y=horizontal.y1, x=vertical.x1;
    const hStart=Math.min(horizontal.x1,horizontal.x2), hEnd=Math.max(horizontal.x1,horizontal.x2);
    const vStart=Math.min(vertical.y1,vertical.y2), vEnd=Math.max(vertical.y1,vertical.y2);
    if (y>=vStart-25&&y<=vEnd+25&&x>=hStart-25&&x<=hEnd+25) {
      if (Math.abs(horizontal.x1-x)<=25) horizontal.x1=x;
      if (Math.abs(horizontal.x2-x)<=25) horizontal.x2=x;
      if (Math.abs(vertical.y1-y)<=25) vertical.y1=y;
      if (Math.abs(vertical.y2-y)<=25) vertical.y2=y;
    }
  }
  const wallMask = new Uint8Array(size);
  const markWall = (x1,y1,x2,y2) => { const ax=Math.round((x1-70)/1060*(width-1)), ay=Math.round((y1-120)/580*(height-1)), bx=Math.round((x2-70)/1060*(width-1)), by=Math.round((y2-120)/580*(height-1)); const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay),1); for(let s=0;s<=steps;s++){const x=Math.round(ax+(bx-ax)*s/steps),y=Math.round(ay+(by-ay)*s/steps);for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height)wallMask[ny*width+nx]=1}}};
  snapped.forEach(line=>markWall(line.x1,line.y1,line.x2,line.y2));
  const outside = new Uint8Array(size), queue=[];
  const enqueue=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return;const at=y*width+x;if(wallMask[at]||outside[at])return;outside[at]=1;queue.push(at)};
  for(let x=0;x<width;x++){enqueue(x,0);enqueue(x,height-1)} for(let y=0;y<height;y++){enqueue(0,y);enqueue(width-1,y)}
  for(let head=0;head<queue.length;head++){const at=queue[head],x=at%width,y=Math.floor(at/width);enqueue(x-1,y);enqueue(x+1,y);enqueue(x,y-1);enqueue(x,y+1)}
  const internalSeen = new Uint8Array(size), structuralSpaces=[];
  for(let start=0;start<size;start++) if(!wallMask[start]&&!outside[start]&&!internalSeen[start]){const cells=[start];internalSeen[start]=1;let count=0,minX=width,maxX=0,minY=height,maxY=0;for(let head=0;head<cells.length;head++){const at=cells[head],x=at%width,y=Math.floor(at/width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const next of [at-1,at+1,at-width,at+width]){if(next<0||next>=size||internalSeen[next]||wallMask[next]||outside[next])continue;if(Math.abs((next%width)-x)>1)continue;internalSeen[next]=1;cells.push(next)}}const boxWidth=maxX-minX+1,boxHeight=maxY-minY+1;if(count>=size*.002&&count<=size*.45&&boxWidth>35&&boxHeight>25)structuralSpaces.push({polygon:[toMap(minX,minY),toMap(maxX,minY),toMap(maxX,maxY),toMap(minX,maxY)],area:count,confidence:.68,source:'closed-wall-mask'})}
  const allSpaces=[...structuralSpaces,...spaces];
  const uniqueSpaces=[];allSpaces.sort((a,b)=>b.area-a.area).forEach(space=>{const p=space.polygon,xs=p.map(point=>point[0]),ys=p.map(point=>point[1]),box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};const duplicate=uniqueSpaces.some(other=>{const q=other.polygon,qx=q.map(point=>point[0]),qy=q.map(point=>point[1]);const overlapX=Math.max(0,Math.min(box.x+box.w,Math.max(...qx))-Math.max(box.x,Math.min(...qx)));const overlapY=Math.max(0,Math.min(box.y+box.h,Math.max(...qy))-Math.max(box.y,Math.min(...qy)));const otherArea=(Math.max(...qx)-Math.min(...qx))*(Math.max(...qy)-Math.min(...qy));return overlapX*overlapY>Math.min(box.w*box.h,otherArea)*.82});if(!duplicate)uniqueSpaces.push(space)});
  // A large closed region may contain a long internal divider. Split its
  // bounding polygon into smaller editor-friendly space candidates.
  const splitSpaces=[];uniqueSpaces.forEach(space=>{const points=space.polygon,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};if(box.w<260||box.h<150){splitSpaces.push(space);return}const verticalCuts=filteredLines.filter(line=>!line.horizontal&&line.status!=='NOISE'&&line.x1>box.x+25&&line.x1<box.x+box.w-25&&Math.min(line.y1,line.y2)<=box.y+box.h*.35&&Math.max(line.y1,line.y2)>=box.y+box.h*.65).map(line=>line.x1).sort((a,b)=>a-b);const horizontalCuts=filteredLines.filter(line=>line.horizontal&&line.status!=='NOISE'&&line.y1>box.y+25&&line.y1<box.y+box.h-25&&Math.min(line.x1,line.x2)<=box.x+box.w*.35&&Math.max(line.x1,line.x2)>=box.x+box.w*.65).map(line=>line.y1).sort((a,b)=>a-b);const xCuts=[box.x,...verticalCuts.slice(0,3),box.x+box.w],yCuts=[box.y,...horizontalCuts.slice(0,3),box.y+box.h];for(let xi=0;xi<xCuts.length-1;xi++)for(let yi=0;yi<yCuts.length-1;yi++){const x1=xCuts[xi],x2=xCuts[xi+1],y1=yCuts[yi],y2=yCuts[yi+1];if(x2-x1>60&&y2-y1>50)splitSpaces.push({polygon:[[x1,y1],[x2,y1],[x2,y2],[x1,y2]],area:(x2-x1)*(y2-y1),confidence:Math.max(.55,space.confidence-.05),source:'split-wall'})}});
  const textCandidates=ocrWords.map(word=>{const localX=word.x/Math.max(1,Math.round(sourceWidth*safeRoi.width))*width,localY=word.y/Math.max(1,Math.round(sourceHeight*safeRoi.height))*height;const p=toMap(localX,localY);return {...word,x:p[0],y:p[1],width:Math.round(word.width/Math.max(1,Math.round(sourceWidth*safeRoi.width))*1060),height:Math.round(word.height/Math.max(1,Math.round(sourceHeight*safeRoi.height))*580)}});
  // Use clean Korean semantic matching alongside the legacy detector. The old
  // patterns are kept for backward compatibility with earlier saved results.
  const groupedTextCandidates=[];
  [...textCandidates].sort((a,b)=>a.y-b.y||a.x-b.x).forEach(word=>{const previous=groupedTextCandidates.at(-1);const close=previous&&Math.abs(previous.y-word.y)<=24&&word.x-(previous.x+previous.width)<=150;if(close){previous.text=`${previous.text} ${word.text}`.trim();const right=Math.max(previous.x+previous.width,word.x+word.width);previous.width=right-previous.x;previous.height=Math.max(previous.height,word.height);previous.confidence=Math.max(previous.confidence,word.confidence)}else groupedTextCandidates.push({...word})});
  const semanticPatternsFixed=[['DOOR',/(문|출입|door|dr\.?\d*)/i],['WINDOW',/(창|window)/i],['INFO',/(안내|데스크|info|desk)/i],['PHOTO',/(포토|사진|photo)/i],['CATERING',/(케이터링|식음|푸드|catering|food)/i],['BOOTH',/(부스|홍보|팝업|booth|popup)/i],['STAIR',/(계단|stair|stairs|up|down)/i],['ELEVATOR',/(엘리베이터|승강기|elevator|lift|e\s*[\\/-]?\s*v|e\s*[\\/-]?\s*l)/i]];
  groupedTextCandidates.forEach(text=>{const match=semanticPatternsFixed.find(([,pattern])=>pattern.test(text.text));if(!match)return;const [type]=match;const dimensions={CATERING:[190,120],BOOTH:[180,110],INFO:[130,75],PHOTO:[150,95],STAIR:[90,140],ELEVATOR:[100,100],DOOR:[55,28],WINDOW:[90,24]}[type]||[110,64];const x=Math.max(75,text.x+text.width/2-dimensions[0]/2),y=Math.max(125,text.y+text.height/2-dimensions[1]/2);facilities.push({id:`${type}_OCR_${String(facilities.length+1).padStart(2,'0')}`,type,name:text.text,polygon:[[x,y],[x+dimensions[0],y],[x+dimensions[0],y+dimensions[1]],[x,y+dimensions[1]]],confidence:Number(Math.min(.94,.55+text.confidence/200).toFixed(2)),source:'ocr-semantic-fixed'})});
  const semanticPatterns=[['DOOR',/(문|door|dr\.?\d*)/i],['WINDOW',/(창|window)/i],['INFO',/(안내|데스크|info|desk)/i],['PHOTO',/(포토|사진|photo)/i],['CATERING',/(케이터링|catering|food)/i],['BOOTH',/(홍보|부스|booth|popup)/i],['STAIR',/(계단|stair|stairs|up|down)/i],['ELEVATOR',/(엘리베이터|승강기|elevator|lift|e\s*[\\/-]?\s*v|e\s*[\\/-]?\s*l)/i]];
  textCandidates.forEach(text=>{const match=semanticPatterns.find(([,pattern])=>pattern.test(text.text));if(!match)return;const [type]=match;const dimensions={CATERING:[190,120],BOOTH:[180,110],INFO:[130,75],PHOTO:[150,95],STAIR:[90,140],ELEVATOR:[100,100],DOOR:[55,28],WINDOW:[90,24]}[type]||[110,64];const x=Math.max(75,text.x-dimensions[0]/2),y=Math.max(125,text.y-dimensions[1]/2);facilities.push({id:`${type}_${String(facilities.length+1).padStart(2,'0')}`,type,name:text.text,polygon:[[x,y],[x+dimensions[0],y],[x+dimensions[0],y+dimensions[1]],[x,y+dimensions[1]]],confidence:Number(Math.min(.94,.55+text.confidence/200).toFixed(2)),source:'ocr-semantic'})});
  const colorFacilities=facilities.filter(item=>item.source==='color-semantic');
  const nonColorFacilities=facilities.filter(item=>item.source!=='color-semantic');
  const mergedColorFacilities=[];
  ['PHOTO','CATERING','INFO'].forEach(type=>{
    const items=colorFacilities.filter(item=>item.type===type); if(!items.length)return;
    if(type==='BOOTH'){
      mergedColorFacilities.push(...items);
    } else if(type==='PHOTO'){
      const candidate=items.map(item=>{const xs=item.polygon.map(point=>point[0]),ys=item.polygon.map(point=>point[1]);return {item,ratio:(Math.max(...xs)-Math.min(...xs))/Math.max(1,Math.max(...ys)-Math.min(...ys))}}).filter(item=>item.ratio>=2).sort((a,b)=>b.ratio-a.ratio)[0];
      if(candidate)mergedColorFacilities.push(candidate.item);
    } else if(type==='CATERING') {
      const usable=items.filter(item=>{const xs=item.polygon.map(point=>point[0]),ys=item.polygon.map(point=>point[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);return Math.max(w,h)/Math.max(1,Math.min(w,h))<2.4;});
      mergedColorFacilities.push(...usable);
    } else {
      const points=items.flatMap(item=>item.polygon),xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
      mergedColorFacilities.push({...items[0],id:`${type}_COLOR_01`,polygon:[[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)],[Math.min(...xs),Math.max(...ys)]]});
    }
  });
  facilities.splice(0,facilities.length,...nonColorFacilities,...mergedColorFacilities);
  // OCR labels are often the only reliable clue in architectural drawings.
  // Reconstruct a room around a label using the nearest structural boundaries,
  // even when a doorway leaves a small gap in the wall loop.
  const verticalBoundaries=filteredLines.filter(line=>line.source!=='color'&&line.status!=='NOISE'&&Math.abs(line.x2-line.x1)<=14).map(line=>({x:(line.x1+line.x2)/2,y1:Math.min(line.y1,line.y2),y2:Math.max(line.y1,line.y2)}));
  const horizontalBoundaries=filteredLines.filter(line=>line.source!=='color'&&line.status!=='NOISE'&&Math.abs(line.y2-line.y1)<=14).map(line=>({y:(line.y1+line.y2)/2,x1:Math.min(line.x1,line.x2),x2:Math.max(line.x1,line.x2)}));
  const labelSpaces=[];
  const isRoomLabel=text=>/^[1-9]\d{2}[a-z]?$/i.test(text.replace(/[\s._-]/g,''))||/(회의|사무|전시|강의|room|hall|office|meeting)/i.test(text);
  textCandidates.filter(text=>text.confidence>=42&&isRoomLabel(text.text)).forEach((text,index)=>{
    const left=verticalBoundaries.filter(line=>line.x<text.x&&line.y1<text.y+70&&line.y2>text.y-70).sort((a,b)=>b.x-a.x)[0];
    const right=verticalBoundaries.filter(line=>line.x>text.x&&line.y1<text.y+70&&line.y2>text.y-70).sort((a,b)=>a.x-b.x)[0];
    const top=horizontalBoundaries.filter(line=>line.y<text.y&&line.x1<text.x+100&&line.x2>text.x-100).sort((a,b)=>b.y-a.y)[0];
    const bottom=horizontalBoundaries.filter(line=>line.y>text.y&&line.x1<text.x+100&&line.x2>text.x-100).sort((a,b)=>a.y-b.y)[0];
    const x1=left&&text.x-left.x<320?left.x:Math.max(75,text.x-135),x2=right&&right.x-text.x<320?right.x:Math.min(1125,text.x+135);
    const y1=top&&text.y-top.y<240?top.y:Math.max(125,text.y-95),y2=bottom&&bottom.y-text.y<240?bottom.y:Math.min(705,text.y+95);
    if(x2-x1>=70&&y2-y1>=55&&x2-x1<=430&&y2-y1<=340) labelSpaces.push({id:`LABEL_SPACE_${String(index+1).padStart(2,'0')}`,name:text.text,type:'COMMON_AREA',polygon:[[Math.round(x1),Math.round(y1)],[Math.round(x2),Math.round(y1)],[Math.round(x2),Math.round(y2)],[Math.round(x1),Math.round(y2)]],confidence:Number(Math.min(.84,.56+text.confidence/300).toFixed(2)),source:'ocr-room-label'});
  });
  const uniqueLabelSpaces=[];
  labelSpaces.forEach(space=>{
    const xs=space.polygon.map(point=>point[0]),ys=space.polygon.map(point=>point[1]);
    const box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    const duplicate=uniqueLabelSpaces.some(other=>{
      const ox=other.polygon.map(point=>point[0]),oy=other.polygon.map(point=>point[1]);
      const overlapX=Math.max(0,Math.min(box.x+box.w,Math.max(...ox))-Math.max(box.x,Math.min(...ox)));
      const overlapY=Math.max(0,Math.min(box.y+box.h,Math.max(...oy))-Math.max(box.y,Math.min(...oy)));
      return other.name===space.name && overlapX*overlapY>Math.min(box.w*box.h,(Math.max(...ox)-Math.min(...ox))*(Math.max(...oy)-Math.min(...oy)))*.35;
    });
    if(!duplicate) uniqueLabelSpaces.push(space);
  });
  const graphNodes=[], graphEdges=[];const nodeFor=(x,y)=>{let node=graphNodes.find(item=>Math.hypot(item.x-x,item.y-y)<=15);if(!node){node={id:`N${String(graphNodes.length+1).padStart(3,'0')}`,x:Math.round(x),y:Math.round(y)};graphNodes.push(node)}return node.id};filteredLines.filter(line=>line.status!=='NOISE').forEach(line=>{const from=nodeFor(line.x1,line.y1),to=nodeFor(line.x2,line.y2);graphEdges.push({from,to,status:line.status})});
  const cleanTextCandidates=textCandidates.filter(word=>word.confidence>=58&&word.text.trim().length>=2&&!/^[^\p{L}\p{N}]+$/u.test(word.text)&&!/^공간\s*\d+$/u.test(word.text));
  return { width:1200, height:800, sourceWidth, sourceHeight, roi:safeRoi, normalized:true, colorLayer:purpleCount > size * .002 ? 'purple+structural' : 'structural', analysisMode:'roi-multi-detector-semantic-v8-room-labels', lines:filteredLines.slice(0,80), spaces:[...splitSpaces,...spaces,...uniqueLabelSpaces].slice(0,64), facilities, textCandidates:cleanTextCandidates, topology:{nodes:graphNodes,edges:graphEdges}, confidence:{confirmedLines:filteredLines.filter(line=>line.status==='CONFIRMED').length,candidateLines:filteredLines.filter(line=>line.status==='CANDIDATE').length,noiseLines:filteredLines.filter(line=>line.status==='NOISE').length,autoConfirmedSpaces:splitSpaces.filter(space=>space.confidence>=.9).length,labelSpaces:uniqueLabelSpaces.length}, structuralSpaceCount:structuralSpaces.length };
}

const serverHandler = (req, res) => {
  const requestPath = req.url === '/' ? '/' : req.url.split('?')[0];
  if (requestPath === '/api/ai/health' && req.method === 'GET') {
    return requestJson(`${aiBaseUrl}/health`, {}, 2500).then(data => sendJson(res, 200, { ok: true, ai: data, baseUrl: aiBaseUrl })).catch(() => sendJson(res, 200, { ok: false, ai: 'unavailable', baseUrl: aiBaseUrl }));
  }
  if (requestPath === '/api/access-url' && req.method === 'GET') {
    const host = lanAddress();
    const configuredBase = process.env.PUBLIC_BASE_URL;
    const base = configuredBase ? configuredBase.replace(/\/$/, '') : `${useHttps ? 'https' : 'http'}://${host}:${PORT}`;
    return sendJson(res, 200, { host, secure: base.startsWith('https://'), url: `${base}/mobile?map=venue-001&start=NODE_01` });
  }
  if (requestPath === '/api/position' && req.method === 'GET') return sendJson(res, 200, { ok: true, position: latestIndoorPosition, source: latestIndoorPosition?.source || 'none' });
  if (requestPath === '/api/position' && req.method === 'POST') return readBody(req).then(body => { const position = JSON.parse(body || '{}'); if (!Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) return sendJson(res, 400, { error: 'POSITION_XY_REQUIRED' }); latestIndoorPosition = { x: Number(position.x), y: Number(position.y), nodeId: position.nodeId || null, source: position.source || 'wifi', updatedAt: new Date().toISOString() }; return sendJson(res, 200, { ok: true, position: latestIndoorPosition }); }).catch(() => sendJson(res, 400, { error: 'INVALID_POSITION' }));
  if (requestPath === '/api/qr' && req.method === 'GET') {
    const query = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
    const data = query.get('data');
    if (!data) return sendJson(res, 400, { error: 'QR_DATA_REQUIRED' });
    return QRCode.toBuffer(data, { type: 'png', width: 420, margin: 2, color: { dark: '#142b4a', light: '#ffffff' } }).then(buffer => { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buffer); }).catch(() => sendJson(res, 400, { error: 'QR_GENERATION_FAILED' }));
  }
  if (requestPath === '/api/ai/routes/preview' && req.method === 'POST') {
    return readBody(req).then(async body => {
      const input = JSON.parse(body || '{}');
      const mapId = input.mapId || 'venue-001';
      const mapPath = path.join(mapsDir, `${mapId}.json`);
      let map;
      try { map = JSON.parse(await fs.promises.readFile(mapPath, 'utf8')); } catch { return sendJson(res, 404, { error: 'MAP_NOT_FOUND', mapId }); }
      const startId = input.startNodeId || input.start_id || map.nodes?.[0]?.id;
      const destinationId = input.destinationNodeId || input.destination_id || map.nodes?.at(-1)?.id;
      const venueMap = { id: map.mapId, name: map.mapId, image: `/map/${map.mapId}`, width: map.width, height: map.height, nodes: (map.nodes || []).map(node => ({ id: node.id, name: node.name || node.id, x: Number(node.x), y: Number(node.y), type: node.type || node.kind || 'WAYPOINT', selectable: node.selectable !== false })), edges: (map.edges || []).map(edge => ({ id: edge.id || `${edge.from}-${edge.to}`, from: edge.from, to: edge.to, distance: Number(edge.distance) || 1, widthM: edge.widthM || 2, zone: edge.zone || edge.zoneId || 'PATH', crowdRegion: edge.crowdRegion || null, bidirectional: edge.bidirectional !== false })) };
      const fallback = fallbackRoute(map, startId, destinationId);
      try {
        const ai = await requestJson(`${aiBaseUrl}/route/preview`, { method: 'POST', body: JSON.stringify({ venue_map: venueMap, start_id: startId, destination_id: destinationId }) });
        const data = ai.data || ai;
        return sendJson(res, 200, { ok: true, data: { ...fallback, ...data, source: data.source || 'ai' }, source: data.source || 'ai' });
      } catch (error) {
        return sendJson(res, 200, { ok: true, data: fallback, source: 'fallback', warning: error.message });
      }
    }).catch(() => sendJson(res, 400, { error: 'INVALID_ROUTE_REQUEST' }));
  }
  if (requestPath === '/api/analyze' && req.method === 'POST') {
    return readBody(req).then(body => {
      const input = JSON.parse(body);
      if (!input.fileName || !input.mimeType || !input.dataUrl) throw new Error('Invalid upload');
      const match = String(input.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Only base64 data URLs are supported');
      const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedName = `${Date.now()}-${safeName}`;
      const extension = path.extname(safeName).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
      if (!isImage) return sendJson(res, 415, { error: 'IMAGE_ONLY', message: 'JPG, JPEG, PNG 파일만 분석할 수 있습니다.' });
      if (!/^image\/(jpeg|png|webp)$/i.test(match[1]) || !/^image\/(jpeg|png|webp)$/i.test(input.mimeType)) {
        return sendJson(res, 415, { error: 'IMAGE_ONLY', message: '이미지 MIME 타입만 분석할 수 있습니다.' });
      }
      const imageBuffer = Buffer.from(match[2], 'base64');
      return fs.mkdir(uploadsDir, { recursive: true }, error => {
        if (error) return sendJson(res, 500, { error: 'UPLOAD_DIR_FAILED' });
        fs.writeFile(path.join(uploadsDir, storedName), imageBuffer, async writeError => {
          if (writeError) return sendJson(res, 500, { error: 'UPLOAD_SAVE_FAILED' });
          try {
            const candidates = await analyzeImage(imageBuffer, input.roi);
            const previewName = `${storedName}-preview.png`;
            const previewPath = path.join(uploadsDir, previewName);
            await sharp(imageBuffer).rotate().resize(1200, 800, { fit: 'fill' }).png().toFile(previewPath);
            await fs.promises.copyFile(previewPath, path.join(uploadsDir, 'current-preview.png'));
            return sendJson(res, 200, { ok: true, fileName: safeName, storedName, previewUrl: `/uploads/${previewName}`, analysisMode: 'sharp-vector-floorplan-v2', ...candidates });
          } catch (analysisError) {
            return sendJson(res, 422, { error: 'IMAGE_ANALYSIS_FAILED', message: analysisError.message });
          }
        });
      });
    }).catch(() => sendJson(res, 400, { error: 'INVALID_UPLOAD' }));
  }
  const mapApi = requestPath.match(/^\/api\/maps\/([a-zA-Z0-9_-]+)$/);
  if (mapApi) {
    const mapId = mapApi[1];
    const mapPath = path.join(mapsDir, `${mapId}.json`);
    if (req.method === 'GET') {
      return fs.readFile(mapPath, 'utf8', (error, data) => {
        if (error) return sendJson(res, 404, { error: 'MAP_NOT_FOUND', mapId });
        try { return sendJson(res, 200, JSON.parse(data)); } catch { return sendJson(res, 500, { error: 'MAP_INVALID' }); }
      });
    }
    if (req.method === 'PUT') {
      return readBody(req).then(body => {
        const map = JSON.parse(body);
        if (map.mapId !== mapId || !Array.isArray(map.spaces) || !Array.isArray(map.nodes) || !Array.isArray(map.edges)) throw new Error('Invalid MapData');
        fs.mkdir(mapsDir, { recursive: true }, error => {
          if (error) return sendJson(res, 500, { error: 'MAP_DIR_FAILED' });
          fs.writeFile(mapPath, JSON.stringify(map, null, 2), 'utf8', writeError => {
            if (writeError) return sendJson(res, 500, { error: 'MAP_SAVE_FAILED' });
            return sendJson(res, 200, { ok: true, mapId, savedAt: new Date().toISOString() });
          });
        });
      }).catch(() => sendJson(res, 400, { error: 'INVALID_MAP_DATA' }));
    }
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  if (requestPath.startsWith('/map/')) {
    return fs.readFile(path.join(publicDir, 'map.html'), (error, data) => {
      if (error) return res.writeHead(404).end('Map page not found');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  if (requestPath === '/mobile' || requestPath === '/mobile.html') {
    return fs.readFile(path.join(publicDir, 'app', 'index.html'), (error, data) => {
      if (error) return res.writeHead(404).end('Mobile page not found');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  if (requestPath.startsWith('/uploads/')) {
    const uploadName = path.basename(requestPath.slice('/uploads/'.length));
    return fs.readFile(path.join(uploadsDir, uploadName), (error, data) => {
      if (error) return res.writeHead(404).end('Upload not found');
      res.writeHead(200, { 'Content-Type': uploadName.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  }
  if (requestPath === '/' || requestPath === '') {
    return fs.readFile(path.join(publicDir, 'app', 'index.html'), (error, data) => {
      if (error) return res.writeHead(404).end('Build the React app first: npm run build');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  if (requestPath === '/app' || requestPath === '/app/') {
    return fs.readFile(path.join(publicDir, 'app', 'index.html'), (error, data) => {
      if (error) return res.writeHead(404).end('Build the React app first: npm run build');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  const filePath = path.resolve(publicDir, `.${requestPath}`);
  const relativePath = path.relative(publicDir, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return res.writeHead(403).end('Forbidden');
  fs.readFile(filePath, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
};
const server = useHttps ? https.createServer(usePfx ? { pfx: fs.readFileSync(tlsPfx), passphrase: tlsPfxPassword } : { key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCert) }, serverHandler) : http.createServer(serverHandler);
server.listen(PORT, () => console.log(`Indoor map MVP running at ${useHttps ? 'https' : 'http'}://localhost:${PORT}`));
