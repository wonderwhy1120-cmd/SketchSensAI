import {LiveCoach} from './live-coach.js';
import {drawingShortcut} from './keybindings.js';
import {guidePlacement} from './guide-placement.js';
import {subjects,referenceMarkup,demoFeedback,strokeGuidance} from './templates.js';
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
let originalStrokes=new WeakSet();
let pendingFreehand=null,analysisController=null,analysisVersion=0,analysisBusy=false;
let fadeFrame=null;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function inkOpacity(point,animate){if(!animate||reducedMotion.matches)return 1;const progress=Math.max(0,Math.min(1,(performance.now()-(point.drawnAt??0))/250));return 0.15+0.85*(1-Math.pow(1-progress,3));}
let subject='house',strokes=[],undone=[],active=null,tool='pen',before=null,feedback=null,step=0,provider='demo',profile=null;
let liveCoaching=false;
const coachIdleText='Pause after a few lines for a tip from your local drawing coach.';
const liveCoach=new LiveCoach({
 canRun:()=>liveCoaching&&$('liveCoachEnabled').checked&&!active&&!analysisBusy&&!pendingFreehand&&!document.hidden&&!document.querySelector('dialog[open]')&&strokes.some(s=>s.tool==='pen'&&(!feedback||!originalStrokes.has(s))),
 request:async signal=>{
  const key=subject,payload={subject:key,image:snapshot(!feedback,640,480),target:feedback?.reference?.fallback&&!feedback.reference.matched?feedback.reference.title:feedback?.object||$('freehandObject').value||key,partInstruction:feedback?.steps[step]?.instruction||''};
  if(feedback?.reference?.raster)payload.referenceImage=feedback.reference.url;
  else if(key!=='freehand'||feedback?.reference)payload.referenceImage=await referenceSnapshot(key);
  signal.throwIfAborted();
  const response=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Coaching unavailable');return data;
 },
 onResult:data=>{$('liveCoachTips').replaceChildren();for(const suggestion of data.suggestions||[])textElement('li',suggestion,$('liveCoachTips'));},
 onStatus:status=>{$('liveCoachStatus').textContent=status==='checking'?'Looking at your latest lines…':status==='ready'?'A tip for your current drawing.':'Your local coach is temporarily unavailable. Keep drawing; it will try after your next pause.';}
});
function resetLiveCoach(){liveCoach.pause();$('liveCoachTips').replaceChildren();$('liveCoachStatus').textContent=coachIdleText;}
$('liveCoachEnabled').onchange=()=>{resetLiveCoach();if($('liveCoachEnabled').checked)liveCoach.change();else $('liveCoachStatus').textContent='Live suggestions are paused.';};
document.addEventListener('visibilitychange',()=>{if(document.hidden)liveCoach.pause();else liveCoach.change();});

try{profile=JSON.parse(localStorage.getItem('sketch-profile'));}catch{}
function profileUI(){$('profile').textContent=profile?`${profile.name}'s studio ↗`:'Enter studio ↗';}profileUI();
function render(fadeOriginal=true,includeOriginal=true){ctx.clearRect(0,0,800,600);for(const s of strokes){if(!includeOriginal&&originalStrokes.has(s))continue;ctx.save();ctx.globalAlpha=fadeOriginal&&feedback&&$('guide').checked&&s.tool==='pen'&&originalStrokes.has(s)?0:1;ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineCap='round';ctx.lineJoin='round';if(s.points.length===1){let p=s.points[0];ctx.beginPath();ctx.arc(p.x,p.y,s.size*p.p/2,0,Math.PI*2);ctx.globalAlpha*=inkOpacity(p,fadeOriginal&&feedback&&$('guide').checked);ctx.fill();}for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i];ctx.globalAlpha=fadeOriginal&&feedback&&$('guide').checked&&s.tool==='pen'&&originalStrokes.has(s)?0:s.tool==='pen'?inkOpacity(b,fadeOriginal&&feedback&&$('guide').checked):1;ctx.lineWidth=s.size*((a.p+b.p)/2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();}$('strokeCount').textContent=`${strokes.length} strokes · Mouse, touch & stylus ready`;$('undo').disabled=!strokes.length;$('redo').disabled=!undone.length;if(fadeOriginal&&feedback&&$('guide').checked&&!reducedMotion.matches&&strokes.some(s=>s.tool==='pen'&&!originalStrokes.has(s)&&performance.now()-(s.points.at(-1)?.drawnAt??0)<250)&&fadeFrame===null){fadeFrame=requestAnimationFrame(()=>{fadeFrame=null;render();});}}
function point(e){const r=canvas.getBoundingClientRect();return {drawnAt:performance.now(),x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height,p:e.pointerType==='pen'?Math.max(.2,e.pressure)*2:1};}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||active||analysisBusy||pendingFreehand)return;liveCoach.change();canvas.setPointerCapture(e.pointerId);active={tool,color:$('color').value,size:Number($('size').value),points:[point(e)],pointer:e.pointerId};strokes.push(active);undone=[];render();});
canvas.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.pointer)return;for(const p of e.getCoalescedEvents?.()||[e])active.points.push(point(p));render();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{if(active){active=null;liveCoach.change();}});
$('pen').onclick=()=>setTool('pen');$('eraser').onclick=()=>setTool('eraser');function setTool(t){tool=t;$('pen').classList.toggle('active',t==='pen');$('eraser').classList.toggle('active',t==='eraser');}
$('undo').onclick=()=>{if(analysisBusy||pendingFreehand||active)return;if(strokes.length)undone.push(strokes.pop());render();liveCoach.change();};$('redo').onclick=()=>{if(analysisBusy||pendingFreehand||active)return;if(undone.length)strokes.push(undone.pop());render();liveCoach.change();};
document.addEventListener('keydown',event=>{
 const action=drawingShortcut(event);
 if(!action||analysisBusy||pendingFreehand||active||document.querySelector('dialog[open]'))return;
 event.preventDefault();$(action).click();
});
$('clear').onclick=()=>{if(strokes.length&&!confirm('Clear this sketch and its guidance?'))return;reset();};
function captureOriginalCutout(){
 render(false);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left){$('originalCutout').hidden=true;return;}
 const padding=12;
 left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(canvas.width-1,right+padding);bottom=Math.min(canvas.height-1,bottom+padding);
 const cutout=document.createElement('canvas');cutout.width=right-left+1;cutout.height=bottom-top+1;
 cutout.getContext('2d').drawImage(canvas,left,top,cutout.width,cutout.height,0,0,cutout.width,cutout.height);
 $('originalCutoutImage').src=cutout.toDataURL('image/png');$('originalCutout').hidden=false;
 render();
}
function reset(){resetLiveCoach();analysisVersion++;analysisController?.abort();analysisBusy=false;pendingFreehand=null;$('objectChoices').hidden=true;$('objectChoiceFields').disabled=false;$('freehandPrompt').hidden=subject!=='freehand';$('freehandObject').value='';$('freehandObject').disabled=false;$('generateObjectGuide').disabled=false;$('guide').disabled=false;$('analyze').disabled=false;$('originalCutout').hidden=true;$('originalCutoutImage').removeAttribute('src');originalStrokes=new WeakSet();strokes=[];undone=[];before=null;feedback=null;step=0;$('finish').disabled=true;$('analyze').hidden=false;$('guideControls').hidden=true;$('guide').checked=false;$('overlay').style.display='none';$('feedback').innerHTML='<h3>Meet your drawing guide.</h3><p>Sketch the subject in your own way, then ask for guidance on shapes and proportions.</p><div class="coach-empty">✧<p>Your drawing guide will appear here.</p></div>';$('status').textContent='';render();}
function select(key){if(key!==subject&&strokes.length&&!confirm('Start a new subject? Your current unsaved sketch will be cleared.'))return;subject=key;reset();$('drawingTitle').textContent=key==='freehand'?'What will you draw today?':subjects[key].title;$('finish').textContent=key==='freehand'?'Finish drawing →':'Finish & compare →';$('analyze').innerHTML=key==='freehand'?'Guess my drawing <span>↗</span>':'Get drawing guidance <span>↗</span>';$('reference').setAttribute('viewBox','0 0 800 600');$('reference').innerHTML=key==='freehand'?'':referenceMarkup(key);$('referencePhoto').hidden=true;$('reference').style.display='';$('referenceSource').replaceChildren();$('referenceLabel').textContent=key==='freehand'?'YOUR REFERENCE WILL APPEAR HERE':'SIMPLIFIED 2D REFERENCE';document.querySelectorAll('.subject').forEach(b=>b.classList.toggle('selected',b.dataset.key===key));updateOverlay();}
for(const [key,item] of [['freehand',{name:'Freehand',level:'Choose your object'}],...Object.entries(subjects)]){const b=document.createElement('button');b.className='subject';b.dataset.key=key;b.innerHTML=`<svg viewBox="0 0 800 600" aria-hidden="true">${key==='freehand'?'<path d="M240 430 L280 310 L500 140 L580 220 L360 390 Z" fill="none" stroke="#526e57" stroke-width="18"/>':referenceMarkup(key)}</svg><span>${item.name}<small>${item.level}</small></span>`;b.onclick=()=>select(key);$('subjects').append(b);}select('house');
function sketchAnchors(){return strokes.filter(s=>s.tool==='pen').slice(0,12).map(s=>{const count=Math.min(8,s.points.length);return Array.from({length:count},(_,i)=>{const p=s.points[count===1?0:Math.round(i*(s.points.length-1)/(count-1))];return [Math.round(Math.max(0,Math.min(800,p.x))),Math.round(Math.max(0,Math.min(600,p.y)))];});});}
async function referenceSnapshot(key){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="${key==='freehand'?$('reference').getAttribute('viewBox'):'0 0 800 600'}"><rect width="800" height="600" fill="#fffef9"/>${key==='freehand'?$('reference').innerHTML:referenceMarkup(key)}</svg>`;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Unable to prepare reference image'));img.src=url;});const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#fffef9';x.fillRect(0,0,400,300);x.drawImage(img,0,0);return c.toDataURL('image/png');}finally{URL.revokeObjectURL(url);}}
function freehandRecovery(){const paths=sketchAnchors().map(points=>points.length>1?points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' '):`M${Math.max(0,points[0][0]-10)} ${points[0][1]} L${Math.min(800,points[0][0]+10)} ${points[0][1]}`);return {source:'geometry',match:'freehand',summary:'Recognition is unavailable. This guide follows your current sketch without guessing an object.',steps:[{title:'Refine your sketch',instruction:'Keep practicing these shapes, then clear and try recognition again.',path:paths.join(' ')}]};}
function snapshot(includeOriginal=true,width=800,height=600){render(false,includeOriginal);const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#fffef9';x.fillRect(0,0,width,height);x.drawImage(canvas,0,0,width,height);const image=c.toDataURL('image/png');render();return image;}
function textElement(tag,text,parent){const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;}
function showSimplifiedReference(){
 const reference=$('reference');reference.replaceChildren();reference.style.display='';$('referencePhoto').hidden=true;
 if(feedback.reference?.raster){
  reference.style.display='none';$('referencePhoto').src=feedback.reference.url;$('referencePhoto').alt=`Line-art reference for ${feedback.object}`;$('referencePhoto').hidden=false;
  $('referenceLabel').textContent=feedback.reference.cachedExample?'PREPARED AI-GENERATED REFERENCE':feedback.reference.repaired?'AI REFERENCE · CLEANED OUTLINES':'AI-GENERATED LINE-ART REFERENCE';
  textElement('p',feedback.reference.repaired?'The generated image was converted into simplified contours for tracing.':'Trace the outlines from this image, one part at a time.',$('referenceSource'));return;
 }
 reference.setAttribute('aria-label',`Simplified 2D ${feedback.object} tracing reference`);
 const group=document.createElementNS('http://www.w3.org/2000/svg','g');
 group.setAttribute('fill','none');group.setAttribute('stroke','#526e57');group.setAttribute('stroke-width','3');group.setAttribute('stroke-linecap','round');group.setAttribute('stroke-linejoin','round');
 for(const part of feedback.steps){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',part.path);group.append(path);}
 reference.append(group);
 try{const b=group.getBBox(),padding=Math.max(12,Math.max(b.width,b.height)*.08);reference.setAttribute('viewBox',`${b.x-padding} ${b.y-padding} ${b.width+2*padding} ${b.height+2*padding}`);}catch{reference.setAttribute('viewBox','0 0 800 600');}
 $('referenceLabel').textContent=feedback.reference?.composed?'SIMPLE 2D REFERENCE':feedback.reference?.fallback?'SIMPLIFIED BACKUP REFERENCE':feedback.reference?.generated?'AI-GENERATED 2D REFERENCE':feedback.reference?`ONLINE 2D ${feedback.object.toUpperCase()}`:`SIMPLIFIED 2D ${feedback.object.toUpperCase()}`;
 textElement('p',feedback.reference?.notice||'Trace this drawing one part at a time.',$('referenceSource'));
 if(feedback.reference?.generated)textElement('p','AI-composed scene. Reference and guide use the same outlines.',$('referenceSource'));
 for(const credit of feedback.reference?.generated?feedback.reference.credits||[]:feedback.reference?.sourceUrl?[feedback.reference]:[]){const link=textElement('a',`${credit.title} · ${credit.artist} · ${credit.license}`,$('referenceSource'));link.href=credit.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';textElement('br','',$('referenceSource'));}

}
function showFeedback(){resetLiveCoach();liveCoach.change();const box=$('feedback');box.replaceChildren();textElement('h3',feedback.reference?.fallback&&!feedback.reference.matched?feedback.reference.title:`Your ${feedback.object||subjects[feedback.match]?.name?.toLowerCase()||feedback.match} guide`,box);textElement('p',feedback.summary,box);if(subject==='freehand'&&!feedback.object){$('reference').innerHTML='';$('referencePhoto').hidden=true;$('referenceSource').replaceChildren();$('referenceLabel').textContent='ADD DETAILS TO FIND A REFERENCE';}if(feedback.object){$('referenceSource').replaceChildren();textElement('p',feedback.chosen?`Selected object: ${feedback.object}`:`Best guess: ${feedback.object} · ${feedback.confidence} confidence`,box);if(!feedback.chosen&&feedback.confidence==='low')textElement('p','This is one possible interpretation of your starting lines. The guide shows how to turn them into that object.',box);$('reference').innerHTML=subjects[feedback.match]?referenceMarkup(feedback.match):'';if(feedback.simplifiedReference){showSimplifiedReference();}else if(feedback.reference){$('referencePhoto').src=feedback.reference.url;$('referencePhoto').alt=`Reference for ${feedback.object}`;$('referencePhoto').hidden=false;$('reference').style.display='none';const link=textElement('a',`${feedback.reference.artist||'Wikimedia Commons'} · ${feedback.reference.license||'Source and license'}`,$('referenceSource'));link.href=feedback.reference.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';$('referenceLabel').textContent=`REFERENCE: ${feedback.object.toUpperCase()}`;}else{textElement('p','Reference image search unavailable; using a simplified guide.',box);}}textElement('p',feedback.source==='template'?'PRESET TEMPLATE COACHING':feedback.source==='geometry'?'STARTING-LINE CONSTRUCTION':feedback.guideSource==='geometry'?'AI FEEDBACK · AUTOMATIC REFERENCE ALIGNMENT':feedback.guideSource==='reference'?'REFERENCE TRACING GUIDE':feedback.guideSource==='simplified'?'SIMPLIFIED 2D TRACING GUIDE':feedback.guideSource==='online-reference'?'ONLINE REFERENCE TRACING GUIDE':feedback.reference?.composed?'SIMPLE 2D TRACING GUIDE':feedback.guideSource==='fallback-reference'?'SIMPLIFIED BACKUP TRACING GUIDE':feedback.guideSource==='generated'?'AI-GENERATED REFERENCE TRACING GUIDE':'VISION MODEL FEEDBACK',box).className='source';textElement('h3','How to improve',box);if(feedback.improvement)textElement('p',feedback.improvement,box);showSuggestions(feedback.suggestions,box);const item=feedback.steps[step];textElement('h3',item.title,box);textElement('p',item.instruction,box);$('stepProgress').textContent=`Part ${step+1} of ${feedback.steps.length}`;$('previous').disabled=step===0;$('next').hidden=step===feedback.steps.length-1;$('finish').hidden=step!==feedback.steps.length-1;$('guideControls').hidden=false;$('finish').disabled=false;updateOverlay();}
function updateOverlay(){
 const overlay=$('overlay'),path=feedback?.steps[step]?.path;
 overlay.innerHTML=path?`<g><path d="${path}" fill="none" stroke="#b47b38" stroke-width="${feedback.reference?.raster?3:4}" ${feedback.reference?.raster?'':'stroke-dasharray="10 8"'} vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></g>`:feedback||subject==='freehand'?'':referenceMarkup(subject,'#b47b38');
 // Measure every part together so the same fitting transform applies throughout the guide.
 if(feedback&&path){
  overlay.style.display='block';
  const boundsGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
  boundsGroup.setAttribute('visibility','hidden');
  for(const item of feedback.steps){const element=document.createElementNS('http://www.w3.org/2000/svg','path');element.setAttribute('d',item.path||'');boundsGroup.append(element);}
  overlay.append(boundsGroup);
  let valid=false;
  try{
   const b=boundsGroup.getBBox();
   valid=Number.isFinite(b.x+b.y+b.width+b.height)&&b.width+b.height>0;
   if(valid){
    const {scale,dx,dy}=guidePlacement(b,feedback.fitToPage);
    overlay.firstElementChild.setAttribute('transform',`translate(${dx} ${dy}) scale(${scale})`);
   }
  }catch{}
  boundsGroup.remove();
  if(!valid&&feedback.source!=='geometry'){feedback=subject==='freehand'?freehandRecovery():strokeGuidance(subject,sketchAnchors());step=Math.min(step,feedback.steps.length-1);showFeedback();return;}
 }
 overlay.style.display=$('guide').checked?'block':'none';render();
}
$('guide').onchange=updateOverlay;
$('previous').onclick=()=>{if(step>0){step--;showFeedback();}};
$('next').onclick=()=>{if(feedback&&step<feedback.steps.length-1){step++;showFeedback();}};
function showSuggestions(suggestions,box){
 if(!Array.isArray(suggestions)||!suggestions.length)return;
 const list=document.createElement('ul');list.className='practice-tips';
 for(const suggestion of suggestions.slice(0,3))if(typeof suggestion==='string')textElement('li',suggestion,list);
 box.append(list);
}
function showObjectChoices(data,payload){
 pendingFreehand={data,payload};$('objectChoices').hidden=false;$('customObject').value='';
 const list=$('objectCandidateList');list.replaceChildren();
 for(const candidate of data.candidates){
  const button=document.createElement('button');button.type='button';button.className='object-candidate';
  textElement('strong',candidate.object,button);textElement('small',`${candidate.confidence} confidence`,button);
  if(candidate.reason)textElement('small',candidate.reason,button);
  button.onclick=()=>analyzeSketch(candidate.object);list.append(button);
 }
 const box=$('feedback');box.replaceChildren();textElement('h3','What could your sketch become?',box);
 if(data.summary)textElement('p',data.summary,box);
 textElement('p','Pick a guess above the canvas, or enter what you meant to draw.',box);
 if(data.suggestions?.length){textElement('h3','Try this as you practice',box);showSuggestions(data.suggestions,box);}
 $('status').textContent='Choose your object to generate a simplified 2D tracing guide.';
}
async function analyzeSketch(selectedObject=null){
 if(analysisBusy)return;
 if(!selectedObject&&!strokes.some(s=>s.tool==='pen')){$('status').textContent=subject==='freehand'?'Type an object above to generate a guide, or sketch first to ask for guesses.':'Put a few lines on the canvas first.';return;}
 resetLiveCoach();
 const version=++analysisVersion;analysisController?.abort();analysisController=new AbortController();
 analysisBusy=true;active=null;$('freehandObject').disabled=true;$('generateObjectGuide').disabled=true;$('analyze').disabled=true;$('analyze').hidden=true;$('objectChoiceFields').disabled=true;$('guide').disabled=true;
 const payload=selectedObject&&pendingFreehand?pendingFreehand.payload:{subject,image:snapshot(),anchors:sketchAnchors()};
 $('status').textContent=subject==='freehand'?(selectedObject?'Finding a 2D reference, or creating one with AI…':'Looking for the most likely objects…'):'Looking at the shapes…';
 try{
  let data;
  if(provider==='demo'&&subject!=='freehand'){
   data=demoFeedback(subject);
  }else{
   const request={...payload,...(subject==='freehand'?{phase:selectedObject?'guide':'recognize',...(selectedObject?{selectedObject}:{})}:{referenceImage:await referenceSnapshot(subject)})};
   const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},signal:analysisController.signal,body:JSON.stringify(request)});
   data=await response.json();if(!response.ok)throw Error(data.error||'Analysis unavailable');
  }
  if(version!==analysisVersion)return;
  if(data.needsSelection){showObjectChoices(data,payload);return;}
  if(!feedback){if(subject!=='freehand'){before=payload.image;captureOriginalCutout();}originalStrokes=new WeakSet(strokes);}
  pendingFreehand=null;$('objectChoices').hidden=true;$('freehandPrompt').hidden=true;feedback=data;step=0;$('guide').checked=true;showFeedback();
  $('status').textContent=feedback.reference?.fallback?feedback.reference.notice+' Trace each part, then finish your drawing.':feedback.source==='template'?'Preset coaching is active. Connect a vision model for personalized feedback.':feedback.feedbackUnavailable?'Your reference is ready. AI practice feedback is temporarily unavailable.':subject==='freehand'?'Your reference is ready. Trace each part, then finish and save your drawing.':feedback.guideSource==='generated'?'Your AI-generated reference is ready. Trace each part, then compare your drawings.':'Trace the reference drawing one part at a time, then compare your drawings.';
 }catch(error){
  if(version!==analysisVersion||error.name==='AbortError')return;
  if(subject==='freehand'){
   $('status').textContent=`${error.message}. ${pendingFreehand?'Choose an object again to retry.':'Your drawing is safe. Try another object name or retry the search.'}`;
   if(!pendingFreehand)$('analyze').hidden=false;
  }else{
   if(!before){before=payload.image;captureOriginalCutout();originalStrokes=new WeakSet(strokes);}
   feedback=strokeGuidance(subject,sketchAnchors());$('guide').checked=true;showFeedback();
   $('status').textContent=`${error.message}. Showing a construction guide built around your starting line instead.`;
  }
 }finally{
  if(version===analysisVersion){analysisBusy=false;$('freehandObject').disabled=false;$('generateObjectGuide').disabled=false;$('analyze').disabled=false;$('objectChoiceFields').disabled=false;$('guide').disabled=false;liveCoach.change();}
 }
}
$('analyze').onclick=()=>analyzeSketch();
$('freehandPromptForm').onsubmit=event=>{event.preventDefault();const object=$('freehandObject').value.trim();if(object&&subject==='freehand')analyzeSketch(object);};
$('customObjectForm').onsubmit=event=>{event.preventDefault();const object=$('customObject').value.trim();if(object&&pendingFreehand)analyzeSketch(object);};
$('keepDrawing').onclick=()=>{pendingFreehand=null;$('objectChoices').hidden=true;$('analyze').hidden=false;$('status').textContent='Add more details, then ask for new guesses.';};

function finishDrawing(){
 if(!feedback)return;liveCoach.pause();
 const freehand=subject==='freehand';
 $('beforePanel').hidden=freehand;
 $('completionGrid').classList.toggle('single',freehand);
 $('completionTitle').textContent=freehand?'Your finished drawing.':'Your drawing, evolved.';
 $('completedDrawingLabel').textContent=freehand?'YOUR DRAWING':'AFTER';
 $('after').alt=freehand?'Completed freehand drawing':'Improved drawing';
 $('download').textContent=freehand?'Download drawing ↓':'Download comparison ↓';
 if(freehand)$('before').removeAttribute('src');else $('before').src=before;
 $('after').src=snapshot(false);
 $('compareNote').textContent=freehand?'Your completed drawing is ready to save or download. The reference guide is not included.':'Compare your original drawing with your guided redraw. The after image includes only your new strokes; neither image includes the guide.';
 $('comparison').showModal();
}
$('finish').onclick=finishDrawing;$('closeCompare').onclick=()=>$('comparison').close();
$('download').onclick=()=>{
 const a=document.createElement('a');
 if(subject==='freehand'){
  a.href=$('after').src;a.download='sketchsensai-freehand-drawing.png';
 }else{
  const c=document.createElement('canvas');c.width=1640;c.height=690;const x=c.getContext('2d');x.fillStyle='#f5f5ee';x.fillRect(0,0,c.width,c.height);x.fillStyle='#20392f';x.font='22px sans-serif';x.fillText('SketchSensAI • BEFORE',20,40);x.fillText('AFTER',840,40);x.drawImage($('before'),20,65,780,585);x.drawImage($('after'),840,65,780,585);a.href=c.toDataURL();a.download=`sketchsensai-${subject}-comparison.png`;
 }
 a.click();
};
function history(){try{const stored=JSON.parse(localStorage.getItem('sketch-history')||'[]');if(!Array.isArray(stored))return [];const seen=new Set();const entries=stored.filter(entry=>{if(!entry?.after||seen.has(entry.after))return false;seen.add(entry.after);return true;});if(entries.length!==stored.length)localStorage.setItem('sketch-history',JSON.stringify(entries));return entries;}catch{return [];}}
$('save').onclick=()=>{try{const entries=history();if(entries.some(entry=>entry.after===$('after').src)){$('compareNote').textContent='This drawing is already saved in your sketchbook.';return;}entries.unshift({subject,date:new Date().toISOString(),owner:profile?.name||'Guest',...(subject==='freehand'?{}:{before:$('before').src}),after:$('after').src});localStorage.setItem('sketch-history',JSON.stringify(entries.slice(0,8)));$('compareNote').textContent='Saved to your browser sketchbook.';}catch{$('compareNote').textContent=subject==='freehand'?'Browser storage is full or unavailable. Download your drawing to keep it.':'Browser storage is full or unavailable. Download your comparison to keep it.';}};
$('historyBtn').onclick=()=>{const list=$('historyList');list.replaceChildren();const entries=history();if(!entries.length)textElement('p','Your sketchbook is waiting for its first drawing.',list);for(const entry of entries){const card=document.createElement('div');card.className='history-card';const img=document.createElement('img');img.src=entry.after;img.alt=`Saved ${entry.subject} sketch`;card.append(img);textElement('p',`${subjects[entry.subject]?.name||entry.subject} · ${entry.owner}`,card);textElement('small',new Date(entry.date).toLocaleDateString(),card);list.append(card);}$('history').showModal();};$('closeHistory').onclick=()=>$('history').close();
$('profile').onclick=()=>{$('name').value=profile?.name||'';$('login').showModal();};$('closeLogin').onclick=()=>$('login').close();$('loginForm').onsubmit=e=>{e.preventDefault();const name=$('name').value.trim();if(!name)return;profile={name};try{localStorage.setItem('sketch-profile',JSON.stringify(profile));}catch{}profileUI();$('login').close();};
fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).then(c=>{provider=c.provider;liveCoaching=!!c.liveCoaching;$('liveCoach').hidden=!liveCoaching;liveCoach.change();$('mode').textContent=provider==='demo'?'Template demo':provider==='local'?'Local vision AI':'Hugging Face AI';}).catch(()=>{});
