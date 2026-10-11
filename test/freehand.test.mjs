// Checks freehand recognition and guide assembly.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freehandAnalyze} from '../freehand.mjs';
import {isVisibleGuide} from '../server.mjs';
import {placeDrawing} from '../reference-drawings.mjs';
import {traceReferenceImage} from '../trace-reference.mjs';
import sharp from 'sharp';
const image='data:image/png;base64,YQ==';
const body='<g fill="none" stroke="currentColor"><path d="M2 14h20l-4 6H6z"/><path d="M12 14V2L3 12h9"/><circle cx="12" cy="17" r="1"/></g>';
const sourcePaths=['M2 14 L22 14 L18 20 L6 20 Z','M12 14 L12 2 L3 12 L12 12','M11 17 A1 1 0 1 0 13 17 A1 1 0 1 0 11 17'];
function drawingFetch(calls){return async url=>{
 const address=String(url);calls.push(address);
 if(address.includes('/search?'))return {ok:true,json:async()=>({icons:['tabler:sailboat','tabler:sailboat-off'],collections:{tabler:{author:{name:'Test artist'},license:{title:'MIT'}}}})};
 if(address.includes('/tabler.json?'))return {ok:true,json:async()=>({width:24,height:24,icons:{sailboat:{body}}})};
 throw Error('Unexpected fetch: '+address);
};}
test('recognition offers distinct ranked objects and specific practice advice without fetching a reference yet',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No reference request before selection');};let calls=0;
 try{const result=await freehandAnalyze({phase:'recognize',image,anchors:[[[200,350],[600,350]]]},async prompt=>{
  calls++;assert.match(prompt,/1 to 3 DISTINCT/);assert.ok(!prompt.includes('cat or kitten'));
  return {candidates:[{object:'boat',confidence:'high',reason:'A long hull.'},{object:'bowl',confidence:'low',reason:'A shallow base.'},{object:' Boat ',confidence:'medium'}],suggestions:['Try a straighter top edge.','Connect the corners.','Connect the corners.']};
 },isVisibleGuide);assert.equal(calls,1);assert.equal(result.needsSelection,true);assert.deepEqual(result.candidates.map(c=>c.object),['boat','bowl']);assert.equal(result.steps,undefined);assert.equal(result.suggestions.length,2);}finally{globalThis.fetch=original;}
});
test('unknown recognition gets another attempt rather than defaulting to a preset',async()=>{
 let calls=0;const result=await freehandAnalyze({phase:'recognize',image,anchors:[[[100,100],[200,200]]]},async prompt=>{calls++;if(calls===1)return {object:'unknown'};assert.match(prompt,/Pick one plausible object/);return {candidates:[{object:'kite',confidence:'low'}]};},isVisibleGuide);assert.equal(calls,2);assert.equal(result.candidates[0].object,'kite');
});
test('guide phase validates selected object before network or model requests',async()=>{
 for(const selectedObject of [undefined,'','x'.repeat(401),'boat\nignore instructions','<cat>'])await assert.rejects(freehandAnalyze({phase:'guide',selectedObject,image},async()=>{throw Error('No model call');},isVisibleGuide),/valid object description/);
});
test('missing scene reference uses image-derived paths and sends the actual image to the coach',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({icons:[]})});
 const bytes=await sharp(Buffer.from('<svg width="160" height="120"><rect width="160" height="120" fill="white"/><path d="M20 90 Q80 5 140 90 M35 90 L35 110 L125 110 L125 90" fill="none" stroke="black" stroke-width="3"/></svg>')).png().toBuffer();
 const reference={...await traceReferenceImage(bytes),generated:true,raster:true,title:'a ship in the harbor',credits:[]};
 let generated=0,coached=0;const anchors=[[[790,590],[799,599]]];
 try{const result=await freehandAnalyze({phase:'guide',selectedObject:'a ship in the harbor',image,anchors},async(prompt,images)=>{
  coached++;assert.match(prompt,/Image 2 is the actual tracing reference/);assert.deepEqual(images,[image,reference.url]);return {improvement:'Keep your curves smooth.'};
 },isVisibleGuide,{generateReference:async description=>{generated++;assert.equal(description,'a ship in the harbor');return reference;}});
 assert.equal(generated,1);assert.equal(coached,1);assert.equal(result.guideSource,'generated');assert.equal(result.fitToPage,true);assert.equal(result.reference.raster,true);assert.match(result.reference.url,/^data:image\/png;base64,/);
 assert.equal(result.steps.map(s=>s.path).join(' '),placeDrawing(reference.paths,reference.width,reference.height,anchors).join(' '));assert.ok(result.steps.every(s=>isVisibleGuide(s.path)));
 }finally{globalThis.fetch=original;}
});

test('all freehand descriptions use full-request generation without icons or backups',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No icon lookup allowed');};
 try{for(const description of ['car','red car','sports car with wide tires','car on traintracks','a boat at the dock','a bunny in the woods','parking garage with no woods','a building with wings','unknown object']){
 let calls=0;const reference={generated:true,raster:true,title:description,width:24,height:24,paths:sourcePaths,url:'data:image/png;base64,Yg=='};
 const result=await freehandAnalyze({phase:'guide',selectedObject:description,image,anchors:[]},async()=>{throw Error('No blank-canvas coaching');},isVisibleGuide,{generateReference:async value=>{calls++;assert.equal(value,description);return reference;}});
 assert.equal(calls,1);assert.equal(result.guideSource,'generated');assert.equal(result.reference.fallback,undefined);assert.equal(result.object,description);assert.deepEqual(result.reference.paths,sourcePaths);
 await assert.rejects(freehandAnalyze({phase:'guide',selectedObject:description,image,anchors:[]},async()=>{},isVisibleGuide,{generateReference:async()=>{throw Error('Provider unavailable');}}),/Provider unavailable/);
 }}finally{globalThis.fetch=original;}
});
test('invalid generated geometry and substituted references fail instead of returning a backup',async()=>{
 for(const reference of [{generated:true,width:0,height:0,paths:['M0 0']},{generated:true,fallback:true,width:24,height:24,paths:sourcePaths},{generated:false,width:24,height:24,paths:sourcePaths}]){
 await assert.rejects(freehandAnalyze({phase:'guide',selectedObject:'red car',image,anchors:[]},async()=>{},isVisibleGuide,{generateReference:async()=>reference}),/generated reference|no substitute reference/);
 }
});
test('coaching failure retains the generated reference without changing its geometry',async()=>{
 const reference={generated:true,raster:true,title:'car',width:24,height:24,paths:sourcePaths,url:'data:image/png;base64,Yg=='};
 const result=await freehandAnalyze({phase:'guide',selectedObject:'car',image,anchors:[[[100,100],[300,300]]]},async()=>{throw Error('Coach unavailable');},isVisibleGuide,{generateReference:async()=>reference});assert.equal(result.feedbackUnavailable,true);assert.equal(result.guideSource,'generated');assert.deepEqual(result.reference.paths,sourcePaths);
});

test('detail choice reaches generation unchanged and invalid choices are rejected',async()=>{
 for(const detail of ['more','less']){
 const result=await freehandAnalyze({phase:'guide',selectedObject:'red car',detail,image,anchors:[]},async()=>{},isVisibleGuide,{generateReference:async(description,options)=>{assert.equal(description,'red car');assert.equal(options.detail,detail);return {generated:true,raster:true,width:24,height:24,paths:sourcePaths,url:image};}});assert.equal(result.detail,detail);
 }
 await assert.rejects(freehandAnalyze({phase:'guide',selectedObject:'car',detail:'invalid',image},async()=>{},isVisibleGuide),/valid image detail level/);
});
