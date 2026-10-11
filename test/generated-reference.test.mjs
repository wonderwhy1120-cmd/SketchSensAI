// Checks generated reference prompts, caching, and validation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {generateReference,referencePrompt,imageParameters,excludedDetails} from '../generated-reference.mjs';
import {traceReferenceImage,repairReferenceImage,tracePixels} from '../trace-reference.mjs';
import {isVisibleGuide} from '../server.mjs';
import {guidePlacement} from '../public/guide-placement.js';
const picture=async body=>sharp(Buffer.from(`<svg width="160" height="120"><rect width="160" height="120" fill="white"/>${body}</svg>`)).png().toBuffer();

test('colored, shaded and solid subjects become clean outlines with white interiors',async()=>{
 for(const body of ['<rect x="30" y="20" width="100" height="70" fill="#555"/>','<path d="M20 90 Q80 10 140 90" stroke="red" fill="none" stroke-width="5"/>','<rect x="30" y="20" width="100" height="70" fill="#bbb"/>']){
  const result=await repairReferenceImage(await picture(body));
  assert.equal(result.repaired,true);assert.ok(result.paths.every(isVisibleGuide));
  const png=Buffer.from(result.url.split(',')[1],'base64'),pixels=await sharp(png).greyscale().raw().toBuffer();
  assert.ok(pixels.every(value=>value===0||value===255));assert.ok(pixels.filter(value=>value===255).length/pixels.length>.8);await traceReferenceImage(png);
 }
});
test('exhausted quality retries recover source contours without any additional paid generation',async()=>{
 const bad=await picture('<rect x="30" y="20" width="100" height="70" fill="#555"/>');let calls=0;
 const result=await generateReference('a shaded box',{detail:'less',generateImage:async()=>{calls++;return bad;}});
 assert.equal(calls,2);assert.equal(result.repaired,true);assert.equal(result.generated,true);assert.ok(result.paths.every(isVisibleGuide));
});

test('generated reference keeps the actual image and extracts its outlines instead of asking for coordinates',async()=>{
 const bytes=await picture('<path d="M20 90 Q80 10 140 90" fill="none" stroke="black" stroke-width="3"/><circle cx="80" cy="75" r="3"/>');let calls=0;
 const result=await generateReference('a flying whale',{generateImage:async description=>{calls++;assert.equal(description,'a flying whale');return bytes;}});
 assert.equal(calls,1);assert.equal(result.raster,true);assert.equal(result.generated,true);assert.equal(result.cachedExample,false);assert.equal(result.width,160);assert.equal(result.height,120);assert.match(result.url,/^data:image\/png;base64,/);assert.ok(result.paths.every(isVisibleGuide));assert.ok(result.paths.some(path=>path.includes('A')));assert.deepEqual(result.credits,[]);
});

test('detailed scene contours remain available rather than being rejected by preschool limits',async()=>{
 const {readFile}=await import('node:fs/promises');
 const oldScene=await readFile(new URL('../public/references/bunny-forest.png',import.meta.url));
 let calls=0;
 const result=await generateReference('a bunny in the forest',{generateImage:async()=>{calls++;return oldScene;}});
 assert.ok(result.paths.length>35);assert.ok(result.paths.every(isVisibleGuide));assert.ok(calls<=2);
});

test('blank, dense and invalid reference images do not become invented guides',async()=>{
 await assert.rejects(traceReferenceImage(await picture('')),/clean outline/);
 await assert.rejects(traceReferenceImage(await picture('<rect width="160" height="120" fill="black"/>')),/shading|white paper/);
 await assert.rejects(traceReferenceImage(Buffer.from('not an image')));
 assert.throws(()=>tracePixels(new Uint8Array(100),10,10),/clean outline/);
});

test('shading, colored contours and sparse large fills are rejected while off-white outlines are normalized',async()=>{
 await assert.rejects(traceReferenceImage(await picture('<rect x="20" y="20" width="50" height="50" fill="#bbb"/>')),/shading/);
 await assert.rejects(traceReferenceImage(await picture('<path d="M20 90 Q80 10 140 90" fill="none" stroke="red" stroke-width="4"/>')),/color/);
 await assert.rejects(traceReferenceImage(await picture('<rect x="20" y="20" width="50" height="50" fill="black"/>')),/solid fills/);
 const result=await traceReferenceImage(await picture('<rect width="160" height="120" fill="#faf7f0"/><path d="M20 90 Q80 10 140 90" fill="none" stroke="#333" stroke-width="3"/>'));
 const pixels=await sharp(Buffer.from(result.url.split(',')[1],'base64')).greyscale().raw().toBuffer();
 assert.ok(pixels.every(value=>value===0||value===255));assert.ok(result.paths.length);
});

test('an unsuitable generation gets one stricter retry within the shared deadline',async()=>{
 const good=await picture('<path d="M20 90 Q80 10 140 90" fill="none" stroke="black" stroke-width="3"/>'),bad=await picture('<rect width="160" height="120" fill="#777"/>');
 const attempts=[];
 const result=await generateReference('a house in the woods',{generateImage:async(description,options)=>{assert.equal(description,'a house in the woods');attempts.push(options);return options.attempt?good:bad;}});
 assert.equal(result.raster,true);assert.deepEqual(attempts.map(a=>a.attempt),[0,1]);assert.equal(attempts[0].signal,attempts[1].signal);
 let calls=0;
 await assert.rejects(generateReference('a busy forest',{generateImage:async()=>{calls++;return bad;}}),/Could not convert the generated image into tracing lines/);assert.equal(calls,2);
 calls=0;
 await assert.rejects(generateReference('a bird',{generateImage:async()=>{calls++;throw Error('Provider billing error');}}),/Provider billing error/);assert.equal(calls,1);
});

test('one-attempt setting disables the paid quality retry',async()=>{
 const original=process.env.IMAGE_MAX_ATTEMPTS;process.env.IMAGE_MAX_ATTEMPTS='1';let calls=0;
 try{await assert.rejects(generateReference('a lake',{generateImage:async()=>{calls++;return picture('');}}),/Could not convert the generated image into tracing lines/);assert.equal(calls,1);}
 finally{if(original===undefined)delete process.env.IMAGE_MAX_ATTEMPTS;else process.env.IMAGE_MAX_ATTEMPTS=original;}
});

test('gray anti-aliasing beside actual contours is not mistaken for broad shading',async()=>{
 const path='M10 25 L150 25 M10 60 L150 60 M10 95 L150 95';
 const result=await traceReferenceImage(await picture(`<path d="${path}" stroke="#ccc" stroke-width="6"/><path d="${path}" stroke="black" stroke-width="2"/>`));
 assert.equal(result.paths.length,3);
});

test('extracted lines follow both disconnected source strokes and keep a small filled eye',()=>{
 const width=100,height=80,data=new Uint8Array(width*height).fill(255);
 for(let x=10;x<=80;x++)for(let y=20;y<=22;y++)data[y*width+x]=0;
 for(let y=40;y<=70;y++)for(let x=40;x<=42;x++)data[y*width+x]=0;
 for(let y=30;y<=34;y++)for(let x=70;x<=74;x++)data[y*width+x]=0;
 const paths=tracePixels(data,width,height);assert.ok(paths.every(isVisibleGuide));assert.ok(paths.some(path=>/M\d+ 21 L\d+ 21/.test(path)));assert.ok(paths.some(path=>/M41 \d+ L41 \d+/.test(path)));assert.ok(paths.some(path=>path.startsWith('M69.5 32 A2.5 2.5')));
});

test('complete-guide fitting enlarges a tiny reference while preserving margins and placement for every part',()=>{
 for(const bounds of [{x:400,y:300,width:40,height:30},{x:-100,y:-80,width:2000,height:1600}]){
 const {scale,dx,dy}=guidePlacement(bounds,true);assert.ok(bounds.x*scale+dx>=39.9);assert.ok(bounds.y*scale+dy>=39.9);assert.ok((bounds.x+bounds.width)*scale+dx<=760.1);assert.ok((bounds.y+bounds.height)*scale+dy<=560.1);assert.equal((bounds.x+bounds.width/2)*scale+dx,400);assert.equal((bounds.y+bounds.height/2)*scale+dy,300);
 }
 assert.ok(guidePlacement({x:400,y:300,width:40,height:30},true).scale>10);
 assert.equal(guidePlacement({x:300,y:200,width:100,height:100}).scale,1);
 assert.throws(()=>guidePlacement({x:0,y:0,width:NaN,height:100}));
});

test('image prompt includes the complete user request and excludes collage and shading',()=>{
 const prompt=referencePrompt('a boat by a lighthouse');assert.match(prompt,/a boat by a lighthouse/);assert.match(prompt,/pure white background/i);assert.match(prompt,/collage/);
 assert.match(prompt,/WHITE interiors/);assert.match(prompt,/detailed black-and-white/);assert.doesNotMatch(prompt,/Woodland scenes should/);assert.doesNotMatch(prompt,/preschool diagram\. Flat|at most two windows|85 percent/);assert.match(referencePrompt('a boat by a lighthouse',1,'less'),/Reduce detail even further/);assert.match(referencePrompt('a boat by a lighthouse',1,'more'),/Keep the full richness/);
 const parameters=imageParameters('Qwen/Qwen-Image-2512','fal-ai');assert.deepEqual(parameters.image_size,{width:1024,height:768});assert.match(parameters.negative_prompt,/solid black fills/);assert.equal(parameters.guidance_scale,4);assert.equal(parameters.num_inference_steps,28);
 assert.equal(imageParameters('black-forest-labs/FLUX.1-schnell','fal-ai').num_inference_steps,undefined);
});

test('outline repair follows a colored stroke once instead of outlining both edges',async()=>{
 const result=await repairReferenceImage(await picture('<path d="M20 90 Q80 10 140 90" fill="none" stroke="red" stroke-width="5"/>'));
 assert.equal(result.paths.length,1);
 const numbers=result.paths[0].match(/-?\d+(?:\.\d+)?/g).map(Number);
 assert.ok(Math.abs(numbers[0]-20)<4);assert.ok(Math.abs(numbers[1]-90)<4);
});
test('requested detail strokes are preserved without an unnecessary generation retry',async()=>{
 const strokes=Array.from({length:40},(_,i)=>`<path d="M${10+(i%8)*18} ${10+Math.floor(i/8)*20} h10" stroke="black" stroke-width="2"/>`).join('');
 const busy=await picture(strokes),simple=await picture('<path d="M20 90 L80 20 L140 90 Z" fill="none" stroke="black" stroke-width="3"/>');let calls=0;
 const result=await generateReference('a complicated object',{generateImage:async()=>++calls===1?busy:simple});
 assert.equal(calls,1);assert.ok(result.paths.length>=40);assert.ok(result.paths.every(isVisibleGuide));
});

test('a building with wings retains both attached wing outlines and building details',async()=>{
 const bytes=await picture('<g fill="none" stroke="black" stroke-width="2"><path d="M55 100 L55 45 L80 25 L105 45 L105 100 Z"/><path d="M55 55 Q30 20 5 30 Q10 60 55 80 M105 55 Q130 20 155 30 Q150 60 105 80"/><path d="M72 100 L72 80 L88 80 L88 100"/>'+Array.from({length:40},(_,i)=>{const x=60+(i%8)*5,y=48+Math.floor(i/8)*5;return `<path d="M${x} ${y} L${x+2} ${y}"/>`;}).join('')+'</g>');
 let calls=0;const result=await generateReference('a building with wings',{generateImage:async description=>{calls++;assert.equal(description,'a building with wings');return bytes;}});
 assert.equal(calls,1);assert.ok(result.paths.length>=4);assert.ok(result.paths.every(isVisibleGuide));
 const coordinates=result.paths.flatMap(path=>path.match(/-?\d+(?:\.\d+)?/g).map(Number));assert.ok(coordinates.some(n=>n<15));assert.ok(coordinates.some(n=>n>145));
});

test('long detailed contours split into safe paths while preserving the full extent',()=>{
 const width=720,height=540,pixels=new Uint8Array(width*height).fill(255);
 for(let x=10;x<710;x++){const y=100+Math.round(30*Math.sin(x/3));pixels[y*width+x]=0;const previous=100+Math.round(30*Math.sin((x-1)/3));for(let yy=Math.min(y,previous);yy<=Math.max(y,previous);yy++)pixels[yy*width+x]=0;}
 const paths=tracePixels(pixels,width,height,{tolerance:.1});assert.ok(paths.length>1);assert.ok(paths.every(isVisibleGuide));
 const coordinates=paths.flatMap(path=>path.match(/-?\d+(?:\.\d+)?/g).map(Number));assert.ok(coordinates.some(n=>n>=700));
});

test('parking garage prompts have no woodland instructions and honor explicit exclusions',()=>{
 const description='a parking garage with specifically no woods';
 const prompt=referencePrompt(description);assert.ok(prompt.includes(JSON.stringify(description)));assert.doesNotMatch(referencePrompt('parking garage'),/woods|forest|foliage|tree branches/i);assert.match(prompt,/strict constraints/);
 const parameters=imageParameters('Qwen/Qwen-Image-2512','fal-ai',description);assert.match(parameters.negative_prompt,/trees, woods, forest/);assert.deepEqual(excludedDetails('a garage without cars'),['cars']);assert.deepEqual(excludedDetails('a garage'),[]);
});

test('more and less detail use distinct prompts and forward the choice to inference',async()=>{
 assert.match(referencePrompt('car',0,'less'),/broad clean outlines/);assert.doesNotMatch(referencePrompt('car',0,'less'),/rich interior detail/);assert.match(referencePrompt('car',0,'more'),/rich interior detail/);
 const bytes=await picture('<path d="M20 90 Q80 10 140 90" fill="none" stroke="black" stroke-width="2"/>');
 for(const detail of ['more','less']){const reference=await generateReference('car',{detail,generateImage:async(description,options)=>{assert.equal(options.detail,detail);return bytes;}});assert.equal(reference.detail,detail);assert.ok(reference.paths.every(isVisibleGuide));}
 await assert.rejects(generateReference('car',{detail:'invalid'}),/valid image detail level/);
});

test('detailed mode preserves the first image through contour recovery before requesting a simpler replacement',async()=>{
 const bytes=await picture('<rect x="30" y="20" width="100" height="70" fill="#555"/>');let calls=0;
 const result=await generateReference('detailed building',{detail:'more',generateImage:async()=>{calls++;return bytes;}});assert.equal(calls,1);assert.equal(result.repaired,true);assert.equal(result.detail,'more');assert.ok(result.paths.every(isVisibleGuide));
 assert.doesNotMatch(referencePrompt('detailed building',1,'more'),/Reduce detail even further/);
});
