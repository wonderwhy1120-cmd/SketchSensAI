// Turn generated line-art images into clean, traceable vector paths.
import sharp from 'sharp';
export class OutlineQualityError extends Error{
 constructor(message){super(message);this.name='OutlineQualityError';}
}
function simplify(points,tolerance=.9){
 if(points.length<3)return points;
 const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[[0,points.length-1]];
 while(stack.length){
  const [start,end]=stack.pop(),a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  let furthest=-1,distance=tolerance*tolerance;
  for(let i=start+1;i<end;i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;const d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;if(d>distance){distance=d;furthest=i;}}
  if(furthest>=0){keep[furthest]=1;stack.push([start,furthest],[furthest,end]);}
 }
 return points.filter((_,i)=>keep[i]);
}
// Zhang–Suen thinning keeps the centerline of each actual raster stroke.
export function tracePixels(data,width,height,{tolerance=.4,maxPaths=2000,trim=false}={}){
 const stride=width+2,mask=new Uint8Array(stride*(height+2));let ink=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[y*width+x]<175){mask[(y+1)*stride+x+1]=1;ink++;}
 if(ink<12||ink/(width*height)>.2)throw new OutlineQualityError('The generated image is not a clean outline drawing');
 // Large solid regions are not contours, even when the rest of the page is white.
 const sumStride=width+1,sums=new Uint32Array(sumStride*(height+1));
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){row+=mask[(y+1)*stride+x+1];sums[(y+1)*sumStride+x+1]=sums[y*sumStride+x+1]+row;}}
 let filled=0;
 for(let y=0;y+9<=height;y++)for(let x=0;x+9<=width;x++)if(sums[(y+9)*sumStride+x+9]-sums[y*sumStride+x+9]-sums[(y+9)*sumStride+x]+sums[y*sumStride+x]===81)filled++;
 if(filled/(width*height)>.01)throw new OutlineQualityError('The generated image contains large solid fills instead of outlines');
 const offsets=[-stride,-stride+1,1,stride+1,stride,stride-1,-1,-stride-1];
 const dots=[],seen=new Uint8Array(mask.length);
 for(let start=0;start<mask.length;start++)if(mask[start]&&!seen[start]){
  const queue=[start];seen[start]=1;let left=width,top=height,right=0,bottom=0;
  for(let j=0;j<queue.length;j++){const i=queue[j],x=i%stride-1,y=Math.floor(i/stride)-1;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const offset of offsets)if(mask[i+offset]&&!seen[i+offset]){seen[i+offset]=1;queue.push(i+offset);}}
  const w=right-left+1,h=bottom-top+1;
  if(queue.length>=6&&w<=24&&h<=24&&Math.min(w,h)/Math.max(w,h)>=.6&&queue.length/(w*h)>.55)dots.push({x:(left+right)/2,y:(top+bottom)/2,r:Math.max(1.5,(w+h)/4)});
 }
 for(let round=0;round<48;round++){
  let changed=0;
  for(let pass=0;pass<2;pass++){
   const remove=[];
   for(let y=1;y<=height;y++)for(let x=1;x<=width;x++){
    const i=y*stride+x;if(!mask[i])continue;const p=offsets.map(offset=>mask[i+offset]),count=p.reduce((sum,v)=>sum+v,0);
    if(count<2||count>6)continue;let transitions=0;for(let j=0;j<8;j++)if(!p[j]&&p[(j+1)%8])transitions++;
    if(transitions!==1)continue;
    if(pass===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;
    remove.push(i);
   }
   for(const i of remove)mask[i]=0;changed+=remove.length;
  }
  if(!changed)break;
 }
 const neighbors=i=>offsets.flatMap((offset,j)=>{
  if(!mask[i+offset])return [];
  if(j%2&&(mask[i+offsets[j-1]]||mask[i+offsets[(j+1)%8]]))return [];
  return [i+offset];
 });
 const indices=[];for(let i=0;i<mask.length;i++)if(mask[i])indices.push(i);
 const visited=new Set(),lines=[],point=i=>[i%stride-1,Math.floor(i/stride)-1];
 const edge=(a,b)=>Math.min(a,b)*mask.length+Math.max(a,b);
 const walk=(start,next)=>{
  const points=[point(start)];let previous=start,current=next,length=0;
  while(!visited.has(edge(previous,current))){
   visited.add(edge(previous,current));points.push(point(current));length+=Math.hypot(...point(current).map((v,j)=>v-point(previous)[j]));
   const adjacent=neighbors(current);if(adjacent.length!==2)break;
   const following=adjacent.find(i=>i!==previous);previous=current;current=following;
  }
  if(length>=5)lines.push({points:simplify(points,tolerance),length});
 };
 for(const i of indices){const adjacent=neighbors(i);if(adjacent.length!==2)for(const next of adjacent)if(!visited.has(edge(i,next)))walk(i,next);}
 for(const i of indices)for(const next of neighbors(i))if(!visited.has(edge(i,next)))walk(i,next);
 let paths=lines.filter(({points})=>!dots.some(dot=>points.every(p=>Math.hypot(p[0]-dot.x,p[1]-dot.y)<dot.r+2))).sort((a,b)=>b.length-a.length).flatMap(({points})=>{
  const chunks=[];for(let i=0;i<points.length-1;i+=79)chunks.push(points.slice(i,i+80));return chunks;
 }).map(points=>{
  if(points.length<3)return points.map((p,i)=>`${i?'L':'M'}${p.join(' ')}`).join(' ');
  const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2).join(' ');
  let d=`M${points[0].join(' ')} L${midpoint(points[0],points[1])}`;
  for(let i=1;i<points.length-1;i++)d+=` Q${points[i].join(' ')} ${midpoint(points[i],points[i+1])}`;
  return d+` L${points.at(-1).join(' ')}`;
 });
 // Filled eyes and other small marks retain their original position and size.
 for(const {x,y,r} of dots)paths.push(`M${x-r} ${y} A${r} ${r} 0 1 0 ${x+r} ${y} A${r} ${r} 0 1 0 ${x-r} ${y}`);
 if(trim)paths=paths.filter(path=>path.length<5800).slice(0,maxPaths);
 if(!paths.length||paths.length>maxPaths||paths.some(path=>path.length>=5800))throw new OutlineQualityError(`The generated outline could not be traced (${paths.length} paths; limit ${maxPaths}; longest path ${Math.max(0,...paths.map(path=>path.length))} characters)`);
 return paths;
}

async function outlineReference(paths,width,height,repaired){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths.map(path=>`<path d="${path}"/>`).join('')}</g></svg>`;
 const png=await sharp(Buffer.from(svg)).greyscale().threshold(175).png().toBuffer();
 return {width,height,paths,url:`data:image/png;base64,${png.toString('base64')}`,...(repaired?{repaired:true}:{})};
}

// Recover visible contours from colored, shaded or filled generations. The preview
// is rendered from these same simplified paths, never from the unsuitable bitmap.
export async function repairReferenceImage(bytes,{tolerance=.6,edgeTolerance=.8}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>10_000_000)throw Error('Invalid reference image');
 const {data,info}=await sharp(bytes,{limitInputPixels:16_000_000}).rotate().flatten({background:'#fff'}).resize({width:480,height:360,fit:'inside',withoutEnlargement:true}).greyscale().blur(.8).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=info;
 // Try the ink itself first. Running an edge detector on an existing outline
 // creates two contours (one on each side of every stroke).
 const ink=Uint8Array.from(data,value=>value<225?0:255);
 try{return await outlineReference(tracePixels(ink,width,height,{tolerance,maxPaths:2000}),width,height,true);}catch(error){if(!(error instanceof OutlineQualityError))throw error;}
 const area=width*height,magnitude=new Float32Array(area),direction=new Uint8Array(area),values=[];
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,gx=-data[i-width-1]+data[i-width+1]-2*data[i-1]+2*data[i+1]-data[i+width-1]+data[i+width+1],gy=-data[i-width-1]-2*data[i-width]-data[i-width+1]+data[i+width-1]+2*data[i+width]+data[i+width+1];
  magnitude[i]=Math.hypot(gx,gy);direction[i]=(Math.round(Math.atan2(gy,gx)*4/Math.PI)+4)%4;
  if(magnitude[i]>24)values.push(magnitude[i]);
 }
 if(values.length<12)throw new OutlineQualityError('No visible subject contours to recover');
 values.sort((a,b)=>a-b);const threshold=Math.max(28,values[Math.floor(values.length*.65)]),edges=new Uint8Array(area).fill(255),offsets=[1,width+1,width,width-1];
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,offset=offsets[direction[i]];
  if(magnitude[i]>=threshold&&magnitude[i]>=magnitude[i-offset]&&magnitude[i]>magnitude[i+offset])edges[i]=0;
 }
 const paths=tracePixels(edges,width,height,{tolerance:edgeTolerance,maxPaths:2000});
 const result=await outlineReference(paths,width,height,true);
 // The recovered preview is drawn solely from validated unfilled stroke paths.
 // Retracing it would fragment fine detail and reject dense but valid linework.
 return result;
}
export async function traceReferenceImage(bytes,{tolerance=.4}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>10_000_000)throw Error('Invalid reference image');
 const image=sharp(bytes,{limitInputPixels:16_000_000}).rotate().flatten({background:'#fff'}).resize({width:720,height:540,fit:'inside',withoutEnlargement:true});
 const {data:rgb,info:colorInfo}=await image.clone().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
 let paper=0,midtones=0,colored=0;
 const dark=new Uint8Array(colorInfo.width*colorInfo.height);
 for(let i=0;i<rgb.length;i+=colorInfo.channels)dark[i/colorInfo.channels]=Math.min(rgb[i],rgb[i+1],rgb[i+2])<175?1:0;
 for(let i=0;i<rgb.length;i+=colorInfo.channels){
  const min=Math.min(rgb[i],rgb[i+1],rgb[i+2]),max=Math.max(rgb[i],rgb[i+1],rgb[i+2]);
  if(min>=225)paper++;
  // Grays directly beside a dark contour are normal resizing anti-aliasing.
  if(min>80&&max<225){
   const pixel=i/colorInfo.channels,x=pixel%colorInfo.width,y=Math.floor(pixel/colorInfo.width);let nearLine=false;
   for(let dy=-2;dy<=2&&!nearLine;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<colorInfo.width&&y+dy>=0&&y+dy<colorInfo.height&&dark[(y+dy)*colorInfo.width+x+dx]){nearLine=true;break;}
   if(!nearLine)midtones++;
  }
  if(max-min>35&&min<225)colored++;
 }
 const area=colorInfo.width*colorInfo.height;
 if(paper/area<.8||midtones/area>.06||colored/area>.005)throw new OutlineQualityError('The generated image has shading, color or too little white paper');
 const {data,info}=await image.clone().greyscale().removeAlpha().raw().toBuffer({resolveWithObject:true});
 const paths=tracePixels(data,info.width,info.height,{tolerance});
 // Remove mild off-white paper and anti-aliasing grays from an accepted outline.
 const png=await image.greyscale().threshold(175).png().toBuffer();
 return {width:info.width,height:info.height,paths,url:`data:image/png;base64,${png.toString('base64')}`};
}
