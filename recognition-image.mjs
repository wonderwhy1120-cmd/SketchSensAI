import sharp from 'sharp';
const background='#fffef9';
const dataUrl=bytes=>`data:image/png;base64,${bytes.toString('base64')}`;

// The largest connected ink component describes the main silhouette. Its
// principal axis provides an optional level view without assuming an object.
function tilt(mask,width,height){
 const queue=new Uint32Array(mask.length);let largest;
 for(let seed=0;seed<mask.length;seed++){
  if(!mask[seed])continue;
  let read=0,count=1,sx=0,sy=0,sxx=0,syy=0,sxy=0;queue[0]=seed;mask[seed]=0;
  while(read<count){
   const pixel=queue[read++],x=pixel%width,y=Math.floor(pixel/width);
   sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy,index=ny*width+nx;
    if(nx>=0&&nx<width&&ny>=0&&ny<height&&mask[index]){mask[index]=0;queue[count++]=index;}
   }
  }
  if(!largest||count>largest.count)largest={count,sx,sy,sxx,syy,sxy};
 }
 if(!largest||largest.count<40)return 0;
 const {count,sx,sy,sxx,syy,sxy}=largest;
 const xx=sxx-sx*sx/count,yy=syy-sy*sy/count,xy=sxy-sx*sy/count;
 const spread=Math.hypot(xx-yy,2*xy),ratio=(xx+yy+spread)/Math.max(1,xx+yy-spread);
 const angle=Math.atan2(2*xy,xx-yy)*90/Math.PI;
 // Leave vertical, round and nearly level subjects alone. Keep the original
 // view alongside this alternate so a meaningful tilt is never erased.
 return ratio>=1.5&&Math.abs(angle)>=12&&Math.abs(angle)<=40?-angle:0;
}

export async function recognitionViews(image){
 try{
  const bytes=Buffer.from(image.split(',')[1],'base64');
  const pixels=await sharp(bytes,{limitInputPixels:16_000_000}).rotate().flatten({background}).resize(800,600,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const source=sharp(pixels);
  const {data,info}=await source.clone().toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const mask=new Uint8Array(info.width*info.height);
  let left=info.width,top=info.height,right=-1,bottom=-1,ink=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*info.channels;
   if(Math.min(data[i],data[i+1],data[i+2])<225){mask[y*info.width+x]=1;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);ink++;}
  }
  if(ink<12)return {images:[image],leveled:false};
  const padding=Math.max(12,Math.ceil(Math.max(right-left,bottom-top)*.1));
  left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(info.width-1,right+padding);bottom=Math.min(info.height-1,bottom+padding);
  const crop=await source.extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer();
  const original=dataUrl(await sharp(crop).resize(640,480,{fit:'contain',background}).png().toBuffer());
  const angle=tilt(mask,info.width,info.height);
  if(!angle)return {images:[original],leveled:false};
  const leveled=dataUrl(await sharp(crop).rotate(angle,{background}).resize(640,480,{fit:'contain',background}).png().toBuffer());
  return {images:[leveled,original],leveled:true};
 }catch{return {images:[image],leveled:false};}
}
export async function recognitionImage(image){return (await recognitionViews(image)).images.at(-1);}
