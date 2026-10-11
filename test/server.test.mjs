// Checks API responses and safe static-file serving.
import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {server,analyze,validateFeedback,validateAnchors,isVisibleGuide} from '../server.mjs';
let base;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});after(()=>server.close());
test('serves studio and hides environment files',async()=>{assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/keybindings.js')).status,200);});
test('demo analysis is honestly labeled',async()=>{const r=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'car',image:'data:image/png;base64,YQ=='})});const data=await r.json();assert.equal(data.source,'template');assert.equal(data.steps.length,3);});
test('rejects invalid input and cross-origin submissions',async()=>{assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{'})).status,400);assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{}'})).status,422);assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);});
test('model output must name an allowed subject and safe path',()=>{assert.throws(()=>validateFeedback({match:'unknown'}));const recovered=validateFeedback({match:'house',summary:'Try straight walls',steps:[{title:'Walls',instruction:'Straighten both walls',path:'<script>'}]},[[[50,60],[100,80]]]);assert.equal(recovered.steps[0].guideSource,'geometry');assert.ok(isVisibleGuide(recovered.steps[0].path));assert.throws(()=>validateAnchors([[[900,20]]]),/coordinates/);assert.deepEqual(validateAnchors([[[10.2,22.6]]]),[[[10,23]]]);});

test('empty, malformed and move-only AI paths recover to visible stroke guides',()=>{for(const path of ['', 'M10 20','M10 20 L','M0 0 LNaN 20']){assert.equal(isVisibleGuide(path),false);const result=validateFeedback({match:'car',summary:'Try again',steps:[{title:'Shape',instruction:'Improve the line',path}]},[[[120,210]]]);assert.ok(isVisibleGuide(result.steps[0].path));}});

test('a lone line produces subject construction rather than a retraced segment',async()=>{const {strokeGuidance}=await import('../public/templates.js');for(const subject of ['house','car','cup','tree','bicycle']){const guide=strokeGuidance(subject,[[[300,400],[500,400]]]);assert.equal(guide.steps.length,3);assert.ok(guide.steps.every(s=>isVisibleGuide(s.path)));assert.notEqual(guide.steps[0].path,'M300 400 L500 400');}const house=strokeGuidance('house',[[[300,400],[500,400]]]);assert.match(house.steps[1].path,/300 400/);assert.match(house.steps[1].path,/500 400/);});

test('whole-drawing response preserves its full path and improvement advice',()=>{const path='M100 300 L200 200 L300 300 M120 280 L120 400 L280 400 L280 280';const result=validateFeedback({match:'house',summary:'A roof starting point',improvement:'Attach straight walls beneath your roof.',path});assert.equal(result.steps.length,1);assert.equal(result.steps[0].path,path);assert.match(result.steps[0].instruction,/walls/);});

test('reference alignment preserves every subject component and falls back for invalid selections',async()=>{
 const {subjects,seedEdges,referenceGuidance}=await import('../public/templates.js');
 for(const subject of Object.keys(subjects)){
  const edge=seedEdges[subject][0];
  const guide=referenceGuidance(subject,[edge],{edge:0,stroke:0,start:0,end:1});
  assert.equal(guide.source,'reference');assert.equal(guide.steps.length,subjects[subject].paths.length);
  assert.ok(guide.steps.every(s=>isVisibleGuide(s.path)));
  const result=referenceGuidance(subject,[edge],{edge:999,stroke:0,start:0,end:1});
  assert.equal(result.source,'geometry');assert.equal(result.steps.length,3);
 }
});

test('typed freehand generation propagates configuration errors instead of returning an icon',async()=>{
 const keys=['HF_IMAGE_TOKEN','HF_TOKEN','HF_IMAGE_MODEL'],saved=keys.map(key=>process.env[key]);keys.forEach(key=>delete process.env[key]);
 try{await assert.rejects(analyze({subject:'freehand',phase:'guide',selectedObject:'red car',image:'data:image/png;base64,YQ==',anchors:[]}),/image-generation model/);}
 finally{keys.forEach((key,i)=>{if(saved[i]!==undefined)process.env[key]=saved[i];});}
});

test('merged studio serves the cover assets and retains the current drawing controls',async()=>{
 const page=await(await fetch(base)).text();
 for(const id of ['cover','house-model','accountPassword','freehandPromptForm','objectCandidateList','liveCoachEnabled','guideControls','beforePanel'])assert.ok(page.includes(`id="${id}"`),`Missing merged UI: ${id}`);
 for(const [path,type] of [['/auth.js','javascript'],['/brand.css','css'],['/cover-model.js','javascript'],['/house.stl','model/stl'],['/ssai-logo.jpg','image/jpeg'],['/fonts/fitfully/FitfullyRegular-8MBjB.ttf','font/ttf']]){
  const response=await fetch(base+path);assert.equal(response.status,200,path);assert.ok(response.headers.get('content-type').includes(type),path);assert.ok((await response.arrayBuffer()).byteLength>0,path);
 }
 assert.equal((await fetch(base+'/../.env')).status,404);
});
