import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {server,validateFeedback} from '../server.mjs';
let base;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});after(()=>server.close());
test('serves studio and hides environment files',async()=>{assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/.env')).status,404);});
test('demo analysis is honestly labeled',async()=>{const r=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'car',image:'data:image/png;base64,YQ=='})});const data=await r.json();assert.equal(data.source,'template');assert.equal(data.steps.length,3);});
test('rejects invalid input and cross-origin submissions',async()=>{assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{'})).status,400);assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{}'})).status,422);assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);});
test('model output must name an allowed subject and safe path',()=>{assert.throws(()=>validateFeedback({match:'unknown'}));const x=validateFeedback({match:'house',summary:'Try straight walls',steps:[{title:'Walls',instruction:'Straighten both walls',path:'<script>'}]});assert.equal(x.steps[0].path.includes('<'),false);});
