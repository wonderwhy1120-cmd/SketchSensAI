import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coachDrawing} from '../live-coach.mjs';
import {LiveCoach} from '../public/live-coach.js';

test('default timers preserve the browser global receiver during app startup and drawing',()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let scheduled=0,cleared=0;
 try{
  globalThis.setTimeout=function(){assert.equal(this,globalThis);scheduled++;return 42;};
  globalThis.clearTimeout=function(){assert.equal(this,globalThis);cleared++;};
  const coach=new LiveCoach({canRun:()=>false,request:async()=>{},onResult:()=>{},onStatus:()=>{}});
  coach.pause();coach.change();coach.pause();
  assert.equal(scheduled,1);assert.equal(cleared,3);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

function harness(request){
 let time=0,id=0;const timers=new Map(),results=[],statuses=[];
 const coach=new LiveCoach({canRun:()=>true,request,onResult:value=>results.push(value),onStatus:value=>statuses.push(value),now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id)});
 return {coach,results,statuses,async advance(ms){time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);await timer.fn();}await Promise.resolve();},timers};
}
test('live coach waits for a pause and rate-limits subsequent changed sketches',async()=>{
 let calls=0;const h=harness(async()=>({suggestions:[`tip ${++calls}`]}));
 h.coach.change();await h.advance(1500);assert.equal(calls,0);h.coach.change();await h.advance(1999);assert.equal(calls,0);await h.advance(1);assert.equal(calls,1);
 h.coach.change();await h.advance(2000);assert.equal(calls,1);await h.advance(13000);assert.equal(calls,2);assert.equal(h.results.length,2);
});
test('changed drawings discard stale responses and never queue overlapping model calls',async()=>{
 let resolve,calls=0;const h=harness(()=>{calls++;return new Promise(r=>resolve=r);});
 h.coach.change();const running=h.advance(2000);await Promise.resolve();assert.equal(calls,1);
 h.coach.change();await h.advance(20000);assert.equal(calls,1);resolve({suggestions:['old tip']});await running;assert.equal(h.results.length,0);
 const next=h.advance(2000);await Promise.resolve();assert.equal(calls,2);resolve({suggestions:['new tip']});await next;assert.equal(h.results.length,1);
});
test('pausing cancels the in-flight coach and ignores a late result',async()=>{
 let resolve,signal;const h=harness(s=>{signal=s;return new Promise(r=>resolve=r);});
 h.coach.change();const running=h.advance(2000);await Promise.resolve();h.coach.pause();assert.equal(signal.aborted,true);
 resolve({suggestions:['old tip']});await running;assert.equal(h.results.length,0);assert.equal(h.timers.size,0);
});
test('blocked coach makes no request',async()=>{
 let calls=0;const h=harness(async()=>calls++);h.coach.canRun=()=>false;h.coach.change();await h.advance(3000);assert.equal(calls,0);
});
test('local coaching uses the actual ink and reference, caps output, and never creates guides',async()=>{
 const keys=['AI_PROVIDER','LOCAL_AI_MODEL','LOCAL_AI_BASE_URL'],saved=keys.map(k=>process.env[k]),original=globalThis.fetch;
 process.env.AI_PROVIDER='local';process.env.LOCAL_AI_MODEL='test-vision';process.env.LOCAL_AI_BASE_URL='http://model.test/v1';
 try{
  let request;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'http://model.test/v1/chat/completions');assert.ok(options.signal);request=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({suggestions:['Join the two wall edges.','Keep the roof curve smooth.','extra'],path:'M0 0 L999 999'})}}]});};
  const image='data:image/png;base64,YQ==',referenceImage='data:image/png;base64,Yg==';
  const result=await coachDrawing({subject:'freehand',target:'a house',image,referenceImage,partInstruction:'Trace the roof.'});
  assert.equal(request.max_tokens,160);assert.match(request.messages[0].content[0].text,/UNFINISHED/);assert.equal(request.messages[0].content[1].image_url.url,image);assert.equal(request.messages[0].content[2].image_url.url,referenceImage);
  assert.equal(result.suggestions.length,2);assert.equal(result.path,undefined);assert.equal(result.source,'local');
  await assert.rejects(coachDrawing({subject:'freehand',image:'https://bad.test/image'}),/valid subject/);
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{"suggestions":'}}]});await assert.rejects(coachDrawing({subject:'house',image}),/incomplete/);
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"suggestions":[]}'}}]});await assert.rejects(coachDrawing({subject:'house',image}),/no suggestions/);
  process.env.AI_PROVIDER='huggingface';await assert.rejects(coachDrawing({subject:'house',image}),/local vision model/);
 }finally{globalThis.fetch=original;keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});}
});
test('request cancellation reaches local model inference',async()=>{
 const keys=['AI_PROVIDER','LOCAL_AI_MODEL'],saved=keys.map(k=>process.env[k]),original=globalThis.fetch;
 process.env.AI_PROVIDER='local';process.env.LOCAL_AI_MODEL='test-vision';
 try{
  globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  const controller=new AbortController(),pending=coachDrawing({subject:'house',image:'data:image/png;base64,YQ=='},controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});
 }finally{globalThis.fetch=original;keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});}
});
