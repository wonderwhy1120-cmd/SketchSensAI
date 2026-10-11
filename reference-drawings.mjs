// Fetch and transform vector outlines so guides fit the drawing canvas.
const api='https://api.iconify.design';
const numberPattern=/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const tokenPattern=/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;

// Normalize source geometry, including relative commands and implicit repeated values.
// Retrieved geometry stays unchanged; numeric generated primitives use the same normalizer.
export function normalizePath(path){
 if(typeof path!=='string'||path.length>20000||path.replace(tokenPattern,'').replace(/[\s,]/g,''))throw Error('Invalid source drawing path');
 const tokens=path.match(tokenPattern)||[],arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
 let i=0,x=0,y=0,startX=0,startY=0,command;const result=[];
 const n=value=>Number(value.toFixed(6));
 while(i<tokens.length){
  if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
  if(!command||(!result.length&&command.toUpperCase()!=='M'))throw Error('Drawing path must start with a move');
  const type=command.toUpperCase(),relative=command!==type;
  if(type==='Z'){result.push('Z');x=startX;y=startY;command=null;continue;}
  const count=arity[type],values=tokens.slice(i,i+count).map(Number);
  if(!count||values.length!==count||!values.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw Error('Invalid source drawing coordinates');i+=count;
  const point=(a,b)=>[n(a+(relative?x:0)),n(b+(relative?y:0))];
  let output=type,coordinates;
  if(type==='H'){coordinates=[n(values[0]+(relative?x:0)),y];output='L';}
  else if(type==='V'){coordinates=[x,n(values[0]+(relative?y:0))];output='L';}
  else if(type==='A'){if(values[0]<0||values[1]<0||![0,1].includes(values[3])||![0,1].includes(values[4]))throw Error('Invalid source arc');coordinates=[...values.slice(0,5),...point(values[5],values[6])];}
  else{coordinates=[];for(let j=0;j<count;j+=2)coordinates.push(...point(values[j],values[j+1]));}
  x=coordinates.at(-2);y=coordinates.at(-1);
  if(type==='M'){startX=x;startY=y;command=relative?'l':'L';}
  result.push(output+coordinates.join(' '));
 }
 if(!result.length)throw Error('Empty source drawing');return result.join(' ');
}
export function sourceDrawingPaths(body){
 if(typeof body!=='string'||body.length>64000||/<\s*(?:script|style|use|image|foreignObject|defs|clipPath|mask)\b|\btransform\s*=/i.test(body))throw Error('Unsupported drawing format');
 const paths=[];
 for(const tag of body.matchAll(/<([a-z]+)\b([^>]*)>/gi)){
  const name=tag[1].toLowerCase();
  if(!['g','path','circle','ellipse','line','rect','polyline','polygon'].includes(name))throw Error('Unsupported drawing element');
  const attrs={};for(const match of tag[2].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g))attrs[match[1]]=match[3];
  if(attrs.opacity==='0'||attrs.fill==='none'&&attrs.stroke==='none')continue;
  if(attrs.fill&&attrs.fill!=='none')throw Error('Reference must be an outline drawing');if(name==='g')continue;
  const value=(key,fallback=0)=>{const n=Number(attrs[key]??fallback);if(!Number.isFinite(n)||Math.abs(n)>10000)throw Error('Invalid drawing element');return n;};
  let d;
  if(name==='path')d=attrs.d;
  else if(name==='line')d=`M${value('x1')} ${value('y1')} L${value('x2')} ${value('y2')}`;
  else if(name==='circle'||name==='ellipse'){const cx=value('cx'),cy=value('cy'),rx=value(name==='circle'?'r':'rx'),ry=value(name==='circle'?'r':'ry');d=`M${cx-rx} ${cy} A${rx} ${ry} 0 1 0 ${cx+rx} ${cy} A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}`;}
  else if(name==='rect'){const x=value('x'),y=value('y'),w=value('width'),h=value('height'),rx=Math.min(w/2,value('rx',value('ry'))),ry=Math.min(h/2,value('ry',rx));d=rx&&ry?`M${x+rx} ${y} L${x+w-rx} ${y} A${rx} ${ry} 0 0 1 ${x+w} ${y+ry} L${x+w} ${y+h-ry} A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h} L${x+rx} ${y+h} A${rx} ${ry} 0 0 1 ${x} ${y+h-ry} L${x} ${y+ry} A${rx} ${ry} 0 0 1 ${x+rx} ${y} Z`:`M${x} ${y} L${x+w} ${y} L${x+w} ${y+h} L${x} ${y+h} Z`;}
  else{const points=attrs.points?.match(numberPattern)?.map(Number)||[];if(points.length<4||points.length%2)throw Error('Invalid source polygon');d=points.reduce((text,v,i)=>text+(i%2?' '+v:(i?' L':'M')+v),'')+(name==='polygon'?' Z':'');}
  const normalized=normalizePath(d);
  paths.push(...normalized.split(/ (?=M)/).filter(p=>/[LCAQST]/.test(p)));
 }
 if(!paths.length||paths.length>100)throw Error('No traceable reference lines');return paths;
}
export function placeDrawing(paths,width,height,anchors=[]){
 const points=anchors.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const left=points.length?Math.min(...xs):200,right=points.length?Math.max(...xs):600;
 const top=points.length?Math.min(...ys):100,bottom=points.length?Math.max(...ys):500;
 const size=Math.min(500,Math.max(160,Math.max(right-left,bottom-top)*1.1));
 const scale=size/Math.max(width,height),cx=Math.max(size/2+16,Math.min(800-size/2-16,(left+right)/2)),cy=Math.max(size/2+16,Math.min(600-size/2-16,(top+bottom)/2));
 return transformDrawing(paths,scale,cx-width*scale/2,cy-height*scale/2);
}
// One uniform transform preserves downloaded silhouettes and generated scene layout.
export function transformDrawing(paths,scale,tx,ty){
 const n=v=>Number(v.toFixed(3));
 return paths.map(path=>{
  const tokens=path.match(tokenPattern),result=[];let i=0;
  const arity={M:2,L:2,C:6,S:4,Q:4,T:2,A:7,Z:0};
  while(i<tokens.length){const cmd=tokens[i++],count=arity[cmd];if(!count){result.push(cmd);continue;}const values=tokens.slice(i,i+count).map(Number);i+=count;
   if(cmd==='A')result.push('A'+[n(values[0]*scale),n(values[1]*scale),values[2],values[3],values[4],n(tx+values[5]*scale),n(ty+values[6]*scale)].join(' '));
   else result.push(cmd+values.map((v,j)=>n((j%2?ty:tx)+v*scale)).join(' '));
  }return result.join(' ');
 });
}
async function getJSON(url){
 const response=await fetch(url,{headers:{'User-Agent':'SketchSensAI/1.0'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Online drawing search is unavailable');return response.json();
}
export async function findReference(object){
 const query=object.toLowerCase().trim().replace(/^(?:a|an|the) /,'').replace(/[^a-z0-9 -]/g,' ').replace(/\s+/g,' ').trim();
 if(!query)throw Error('Enter a searchable object name');
 const data=await getJSON(`${api}/search?${new URLSearchParams({query,prefixes:'tabler,lucide',limit:'32'})}`);
 const slug=query.replaceAll(' ','-');
 const candidates=(Array.isArray(data.icons)?data.icons:[]).filter(id=>/^(tabler|lucide):[a-z0-9-]+$/.test(id)&&!/(?:-off|-filled|brand-)/.test(id)).sort((a,b)=>{
  const score=id=>{const [prefix,name]=id.split(':');return (name===slug?100:0)+(name.includes(slug)?30:0)-name.length/10+(prefix==='tabler'?1:0);};return score(b)-score(a);
 });
 // Catalog search can omit renamed/hidden exact drawings (e.g. ocean waves),
 // leaving decorated UI variants. Try the exact noun before those variants.
 if(!query.includes(' ')&&!candidates.some(id=>id.split(':')[1]===slug))candidates.unshift(`lucide:${slug}`,`tabler:${slug}`);
 for(const id of candidates.slice(0,5)){
  const [prefix,name]=id.split(':');
  try{
   const collection=await getJSON(`${api}/${prefix}.json?${new URLSearchParams({icons:name})}`),icon=collection.icons?.[name];if(!icon)continue;
   const width=icon.width||collection.width||24,height=icon.height||collection.height||24;if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>1024||height>1024)continue;
   const paths=sourceDrawingPaths(icon.body),info=data.collections?.[prefix];
   return {id,title:name.replaceAll('-',' '),url:`${api}/${prefix}/${name}.svg`,sourceUrl:`https://icon-sets.iconify.design/${prefix}/${name}/`,artist:info?.author?.name||(prefix==='tabler'?'Tabler Icons':'Lucide Contributors'),license:info?.license?.title||(prefix==='tabler'?'MIT':'ISC'),width,height,paths};
  }catch{continue;}
 }
 throw Error(`No suitable 2D outline drawing found for "${object}". Try a simpler object name`);
}
