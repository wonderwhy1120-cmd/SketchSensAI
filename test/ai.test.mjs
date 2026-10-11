import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {generateImage} from '../generated-reference.mjs';
process.env.AI_PROVIDER='local';
process.env.LOCAL_AI_MODEL='test-vision';
process.env.LOCAL_AI_BASE_URL='http://model.test/v1';
process.env.AI_MAX_TOKENS='700';
const {analyze}=await import('../server.mjs');
test('local adapter requests concise guidance and handles truncated output',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  let request;
  globalThis.fetch=async(url,options)=>{request=JSON.parse(options.body);assert.equal(url,'http://model.test/v1/chat/completions');assert.ok(options.signal);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'A wall starting point',improvement:'Complete the walls under the roof.',alignment:{edge:1,stroke:0,start:0,end:1},path:'M0 0 L999 999'})}}]})};};
  const data=await analyze({subject:'house',image:'data:image/png;base64,YQ==',referenceImage:'data:image/png;base64,Yg==',anchors:[[[80,200],[130,160],[180,200]]]});
  assert.equal(data.source,'local');assert.equal(data.guideSource,'reference');assert.equal(data.steps.length,3);assert.ok(!data.steps[0].path.includes('999'));assert.match(data.steps.map(s=>s.path).join(' '),/80 200/);const images=request.messages[0].content.filter(item=>item.type==='image_url');assert.equal(images.length,2);assert.equal(images[0].image_url.url,'data:image/png;base64,YQ==');assert.equal(images[1].image_url.url,'data:image/png;base64,Yg==');assert.match(request.messages[0].content[0].text,/SELECTED REFERENCE/);assert.equal(request.max_tokens,700);assert.match(request.messages[0].content[0].text,/one complete guide/);assert.match(request.messages[0].content[0].text,/\[80,200\]/);assert.match(request.messages[0].content[0].text,/Preserve the user/);
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"match":'}}]})});
  await assert.rejects(analyze({subject:'house',image:'data:image/png;base64,YQ=='}),/AI_MAX_TOKENS/);
 }finally{globalThis.fetch=originalFetch;}
});

test('local recognition cannot substitute an icon when image generation is unconfigured',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{
   if(String(url).includes('api.iconify.design/search?'))return {ok:true,json:async()=>({icons:['tabler:bowl'],collections:{tabler:{license:{title:'MIT'}}}})};
   if(String(url).includes('api.iconify.design/tabler.json?'))return {ok:true,json:async()=>({width:24,height:24,icons:{bowl:{body:'<path fill="none" d="M2 10 Q12 25 22 10 Z"/>'}}})};
   const request=JSON.parse(options.body);calls++;const prompt=request.messages[0].content[0].text;
   const result=calls===1?{candidates:[{object:'boat',confidence:'high',reason:'A tapered hull.'},{object:'bowl',confidence:'low',reason:'An open rim.'}],suggestions:['Straighten the top edge.']}:{improvement:'Practice a level rim.',suggestions:['Use a smoother curve for the base.'],path:'M999 999 L0 0'};
   if(calls===1)assert.match(prompt,/ranked by visual evidence/);else assert.match(prompt,/sketch of "bowl"/);
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};
  };
  const image='data:image/png;base64,YQ==',anchors=[[[200,300],[600,300]]];
  const guesses=await analyze({subject:'freehand',phase:'recognize',image,anchors});assert.equal(guesses.needsSelection,true);assert.equal(guesses.source,'local');
  await assert.rejects(analyze({subject:'freehand',phase:'guide',selectedObject:'bowl',image,anchors}),/image-generation model/);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;}
});

test('new references use the Hugging Face image generator while local vision remains separate',async()=>{
 const original=globalThis.fetch,token=process.env.HF_IMAGE_TOKEN,model=process.env.HF_IMAGE_MODEL,provider=process.env.HF_IMAGE_PROVIDER;let calls=0;
 process.env.HF_IMAGE_TOKEN='hf_test_token';process.env.HF_IMAGE_MODEL='test/image-generator';process.env.HF_IMAGE_PROVIDER='hf-inference';
 const bytes=await sharp(Buffer.from('<svg width="160" height="120"><rect width="160" height="120" fill="white"/><ellipse cx="80" cy="60" rx="60" ry="40" fill="none" stroke="black" stroke-width="3"/></svg>')).png().toBuffer();
 try{globalThis.fetch=async(url,options)=>{
  if(String(url).includes('api.iconify.design'))return {ok:true,json:async()=>({icons:[]})};
  if(String(url).includes('huggingface.co/api/models/')){assert.ok(options.signal);return Response.json({inferenceProviderMapping:{'hf-inference':{providerId:'test/image-generator',task:'text-to-image',status:'live'}}});}
  assert.equal(String(url),'https://router.huggingface.co/hf-inference/models/test/image-generator');calls++;assert.ok(options.signal);
  const body=JSON.parse(options.body);assert.match(body.inputs,/a submarine in a coral reef/);assert.equal(body.parameters.width,1024);return new Response(bytes,{headers:{'Content-Type':'image/png'}});
 };
 const result=await analyze({subject:'freehand',phase:'guide',selectedObject:'a submarine in a coral reef',image:'data:image/png;base64,YQ==',anchors:[]});
 assert.equal(calls,1);assert.equal(result.source,'local');assert.equal(result.guideSource,'generated');assert.equal(result.reference.raster,true);assert.equal(result.fitToPage,true);assert.ok(result.steps.length>0);
 }finally{globalThis.fetch=original;for(const [key,value] of [['HF_IMAGE_TOKEN',token],['HF_IMAGE_MODEL',model],['HF_IMAGE_PROVIDER',provider]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('fal receives the outline controls and downloads the result under the shared deadline',async()=>{
 const original=globalThis.fetch,keys=['HF_IMAGE_TOKEN','HF_IMAGE_MODEL','HF_IMAGE_PROVIDER'],saved=keys.map(key=>process.env[key]);
 process.env.HF_IMAGE_TOKEN='hf_test_token';process.env.HF_IMAGE_MODEL='Qwen/Qwen-Image-2512';process.env.HF_IMAGE_PROVIDER='fal-ai';
 const bytes=await sharp(Buffer.from('<svg width="160" height="120"><rect width="160" height="120" fill="white"/></svg>')).png().toBuffer();
 const signal=AbortSignal.timeout(5000);let submissions=0,downloads=0;
 try{
  globalThis.fetch=async(url,options)=>{
   assert.equal(options.signal,signal);
   if(String(url).includes('huggingface.co/api/models/'))return Response.json({inferenceProviderMapping:{'fal-ai':{providerId:'fal-ai/qwen-image-2512',task:'text-to-image',status:'live'}}});
   if(options.method==='POST'){
    submissions++;assert.match(String(url),/^https:\/\/router.huggingface.co\/fal-ai\//);
    const body=JSON.parse(options.body);assert.match(body.prompt,/WHITE interiors/);assert.match(body.prompt,/Reduce detail even further/);assert.match(body.negative_prompt,/solid black fills/);assert.deepEqual(body.image_size,{width:1024,height:768});assert.equal(body.guidance_scale,4);assert.equal(body.num_inference_steps,28);
    return Response.json({request_id:'test-request',status:'COMPLETED',response_url:'https://queue.fal.run/fal-ai/qwen-image-2512/requests/test-request'});
   }
   if(String(url).includes('/requests/test-request'))return Response.json({images:[{url:'https://assets.test/outline.png'}]});
   assert.equal(String(url),'https://assets.test/outline.png');downloads++;return new Response(bytes,{headers:{'Content-Type':'image/png'}});
  };
  assert.deepEqual(await generateImage('a house in the woods',{attempt:1,detail:'less',signal}),bytes);assert.equal(submissions,1);assert.equal(downloads,1);
 }finally{globalThis.fetch=original;keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});}
});
