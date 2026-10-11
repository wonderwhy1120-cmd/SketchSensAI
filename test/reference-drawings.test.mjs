// Checks reference lookup, path normalization, and placement.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePath,sourceDrawingPaths,placeDrawing,findReference} from '../reference-drawings.mjs';
import {isVisibleGuide} from '../server.mjs';
test('relative and repeated SVG commands preserve source positions and close-path origin',()=>{
 assert.equal(normalizePath('m2 3 4 0 h5 v7 l-2-1 z m1 2 l3 4'),'M2 3 L6 3 L11 3 L11 10 L9 9 Z M3 5 L6 9');
 assert.equal(normalizePath('M1 2 c1 2 3 4 5 6 s2 3 4 5 q1 2 3 4 t5 6'),'M1 2 C2 4 4 6 6 8 S8 11 10 13 Q11 15 13 17 T18 23');
 assert.equal(normalizePath('M5 6 a2 3 45 0 1-4-5'),'M5 6 A2 3 45 0 1 1 1');
});
test('source subpaths, circles and rounded rectangles become traceable lines',()=>{
 const paths=sourceDrawingPaths('<g fill="none"><path d="M1 2h3m2 2v4"/><circle cx="12" cy="10" r="2"/><rect x="2" y="3" width="6" height="8" rx="1"/></g>');
 assert.equal(paths.length,4);assert.equal(paths[1],'M6 4 L6 8');assert.match(paths[3],/A1 1/);
 assert.ok(placeDrawing(paths,24,24).every(isVisibleGuide));
});
test('malformed or executable reference content is rejected instead of embedded',()=>{
 for(const body of ['<script>alert(1)</script>','<use href="external.svg"/>','<g transform="rotate(30)"><path d="M0 0 L1 1"/></g>','<path fill="red" d="M0 0 L1 1"/>','<path d="M0 0 LNaN 1"/>'])assert.throws(()=>sourceDrawingPaths(body));
 for(const path of ['M0 0 L','M0 0 A1 1 0 3 5 2 2','M0 0 Infinity','L0 0'])assert.throws(()=>normalizePath(path));
});
test('retrieval rejects missing and filled drawing variants and exposes original source attribution',async()=>{
 const original=globalThis.fetch;const requests=[];
 try{globalThis.fetch=async url=>{requests.push(String(url));return {ok:true,json:async()=>String(url).includes('/search?')?{icons:['tabler:boat-filled','other:boat','tabler:boat'],collections:{tabler:{author:{name:'Artist'},license:{title:'MIT'}}}}:{width:24,height:24,icons:{boat:{body:'<path fill="none" d="M2 10 L22 10 L18 20 L6 20 Z"/>'}}}};};
  const ref=await findReference('a boat');assert.equal(ref.id,'tabler:boat');assert.equal(ref.artist,'Artist');assert.equal(ref.license,'MIT');assert.equal(requests.length,2);assert.equal(ref.sourceUrl,'https://icon-sets.iconify.design/tabler/boat/');
 }finally{globalThis.fetch=original;}
});
test('exact renamed outline is preferred over unrelated decorated search variants',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/search?')?{icons:['tabler:waves-electricity','lucide:waves-arrow-up']}:{width:24,height:24,icons:{waves:{hidden:true,body:'<path fill="none" d="M2 6 Q12 10 22 6 M2 12 Q12 16 22 12"/>'}}}});
  const reference=await findReference('waves');assert.equal(reference.id,'lucide:waves');assert.equal(reference.paths.length,2);
 }finally{globalThis.fetch=original;}
});
