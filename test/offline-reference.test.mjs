import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/references/lucide-outlines.json' with {type:'json'};
import {offlineReference,simpleSceneReference} from '../offline-reference.mjs';
import {freehandAnalyze} from '../freehand.mjs';
import {placeDrawing} from '../reference-drawings.mjs';
import {isVisibleGuide} from '../server.mjs';

test('bundled library contains only complete, safe traceable paths after placement',()=>{
 assert.ok(Object.keys(catalog.drawings).length>1700);
 for(const paths of Object.values(catalog.drawings))assert.ok(placeDrawing(paths,24,24).every(isVisibleGuide));
});
test('informal descriptions find the actual object instead of treating the entire phrase as a catalog name',()=>{
 for(const [description,id] of [['a big ah h car','lucide:car'],['a cute kitten','lucide:cat'],['a little boat','lucide:sailboat'],['a bunny in the woods','lucide:rabbit']]){
  const reference=offlineReference(description);assert.equal(reference.id,id);assert.equal(reference.matched,true);assert.ok(reference.paths.every(isVisibleGuide));
 }
 assert.match(offlineReference('a bunny in the woods').notice,/extra scene details are omitted/);
 const unknown=offlineReference('a quux creature in the forest');assert.equal(unknown.matched,false);assert.match(unknown.notice,/does not depict your requested object/);assert.ok(unknown.paths.every(isVisibleGuide));
});
test('search outage serves a matching car outline without invoking image generation',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline');};
 try{
  const result=await freehandAnalyze({phase:'guide',selectedObject:'a big ah h car',image:'data:image/png;base64,YQ==',anchors:[]},async()=>{throw Error('No vision call for empty canvas');},isVisibleGuide,{generateReference:async()=>{throw Error('No image generation needed');}});
  assert.equal(result.reference.id,'lucide:car');assert.equal(result.guideSource,'fallback-reference');assert.equal(result.fitToPage,true);assert.ok(result.steps.every(step=>isVisibleGuide(step.path)));
 }finally{globalThis.fetch=original;}
});
test('failed scene generation uses the main object and explicitly describes omitted details',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline');};let generations=0;
 try{
  const result=await freehandAnalyze({phase:'guide',selectedObject:'a house in the woods',image:'data:image/png;base64,YQ==',anchors:[]},async()=>{throw Error('No vision call');},isVisibleGuide,{generateReference:async()=>{generations++;throw Error('No traceable output');}});
  assert.equal(generations,1);assert.equal(result.reference.id,'lucide:house');assert.match(result.summary,/extra scene details are omitted/);assert.ok(result.steps.every(step=>isVisibleGuide(step.path)));
 }finally{globalThis.fetch=original;}
});
test('blank generated images and unsupported geometry recover to visible practice shapes',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline');};
 try{
  for(const anchors of [[],[[[50,50],[50,50]]],[[[50,50],[100,150]]]]){
   const result=await freehandAnalyze({phase:'guide',selectedObject:'a quux creature',image:'data:image/png;base64,YQ==',anchors},async()=>{throw Error('Model unavailable');},isVisibleGuide,{generateReference:async()=>({paths:['M0 0'],width:0,height:0})});
   assert.equal(result.reference.matched,false);assert.ok(result.steps.length>0);assert.ok(result.steps.every(step=>isVisibleGuide(step.path)));assert.match(result.summary,/practic/);
  }
 }finally{globalThis.fetch=original;}
});

test('plain road scenes preserve clean licensed vehicle paths and add only two road lines',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No reference or image call for a plain road');};
 try{
  for(const description of ['car on the road','a bicycle on a street','a truck along the highway']){
   const reference=simpleSceneReference(description);assert.ok(reference.composed);assert.equal(reference.paths.length,offlineReference(description).paths.length+2);assert.match(reference.paths.at(-1),/^M1 26 L31 26$/);
   const result=await freehandAnalyze({phase:'guide',selectedObject:description,image:'data:image/png;base64,YQ==',anchors:[]},async()=>{throw Error('No model call for empty canvas');},isVisibleGuide,{generateReference:async()=>{throw Error('No generation needed');}});
   assert.equal(result.reference.composed,true);assert.ok(result.steps.every(step=>isVisibleGuide(step.path)));
  }
  assert.equal(simpleSceneReference('car on the road with a house'),undefined);
  assert.equal(simpleSceneReference('a rabbit in the forest'),undefined);
 }finally{globalThis.fetch=original;}
});
