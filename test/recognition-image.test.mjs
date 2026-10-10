import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {recognitionViews} from '../recognition-image.mjs';
import {recognizeFreehand} from '../freehand.mjs';
const png=async body=>'data:image/png;base64,'+(await sharp(Buffer.from(`<svg width="800" height="600"><rect width="800" height="600" fill="white"/>${body}</svg>`)).png().toBuffer()).toString('base64');
const bytes=url=>Buffer.from(url.split(',')[1],'base64');
async function bounds(url){
 const {data,info}=await sharp(bytes(url)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,r=-1,t=info.height,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(Math.min(...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3))<225){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return {width:r-l+1,height:b-t+1,info};
}
test('recognition crops small colored ink without stretching its proportions',async()=>{
 const image=await png('<rect x="350" y="275" width="100" height="50" stroke="#294a3c" stroke-width="3" fill="none"/>');
 const view=await recognitionViews(image);assert.equal(view.leveled,false);assert.equal(view.images.length,1);
 const box=await bounds(view.images[0]);assert.equal(box.info.width,640);assert.equal(box.info.height,480);assert.ok(box.width>400);assert.ok(Math.abs(box.width/box.height-103/53)<.05);
});
test('tilted elongated ink gets a level view alongside the unchanged orientation',async()=>{
 const image=await png('<path d="M270 360 L450 270 L490 350 L310 440 Z" stroke="#294a3c" stroke-width="4" fill="none"/>');
 const views=await recognitionViews(image);assert.equal(views.leveled,true);assert.equal(views.images.length,2);
 const original=await bounds(views.images[1]),level=await bounds(views.images[0]);assert.ok(level.width/level.height>original.width/original.height);
});
test('vertical subjects, blank canvases and unreadable images retain a usable original view',async()=>{
 const image=await png('<rect x="370" y="150" width="60" height="250" stroke="black" stroke-width="3" fill="none"/>');
 assert.equal((await recognitionViews(image)).leveled,false);
 const blank=await png('');assert.deepEqual((await recognitionViews(blank)).images,[blank]);
 const invalid='data:image/png;base64,YQ==';assert.deepEqual((await recognitionViews(invalid)).images,[invalid]);
});
test('recognition ignores unrelated typed descriptions and uses ink views in one request',async()=>{
 const image=await png('<path d="M270 360 L450 270 L490 350 L310 440 Z" stroke="black" stroke-width="4" fill="none"/>');let calls=0;
 const result=await recognizeFreehand({image,selectedObject:'unrelated dragon description',anchors:[[[1,2],[3,4]]]},async(prompt,images,options)=>{
  calls++;assert.ok(!prompt.includes('unrelated dragon'));assert.ok(!prompt.includes('[[1,2]'));assert.match(prompt,/SAME sketch/);assert.equal(images.length,2);assert.equal(options.temperature,.1);
  return {candidates:[{object:'boat',confidence:'low',reason:'An elongated outline.'}]};
 });assert.equal(calls,1);assert.equal(result.candidates[0].object,'boat');
});
