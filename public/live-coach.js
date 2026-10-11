// Wait for a pause and avoid queuing work on a single-slot local model.
export class LiveCoach{
 constructor({canRun,request,onResult,onStatus,pauseMs=500,intervalMs=15000,now=()=>Date.now(),setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}){
  Object.assign(this,{canRun,request,onResult,onStatus,pauseMs,intervalMs,now,setTimer,clearTimer});
  this.version=0;this.lastRequest=-Infinity;this.timer=null;this.controller=null;this.busy=false;this.dirty=false;
 }
 change(){this.version++;this.dirty=true;this.clearTimer(this.timer);this.schedule();}
 pause(){this.version++;this.dirty=false;this.clearTimer(this.timer);this.timer=null;this.controller?.abort();}
 schedule(){if(this.busy||!this.dirty)return;this.timer=this.setTimer(()=>this.run(),Math.max(this.pauseMs,this.lastRequest+this.intervalMs-this.now()));}
 async run(){
  this.timer=null;if(this.busy||!this.dirty||!this.canRun())return;
  this.dirty=false;this.busy=true;this.lastRequest=this.now();const version=this.version,controller=new AbortController();this.controller=controller;this.onStatus('checking');
  try{const result=await this.request(controller.signal);if(!controller.signal.aborted&&version===this.version&&this.canRun()){this.onResult(result);this.onStatus('ready');}}
  catch(error){if(!controller.signal.aborted&&version===this.version)this.onStatus('unavailable');}
  finally{this.busy=false;this.controller=null;this.schedule();}
 }
}
