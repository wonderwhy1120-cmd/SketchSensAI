// Send pause-triggered drawing snapshots to the configured local vision model.
const validImage=value=>typeof value==='string'&&value.length<=3_000_000&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value);
export function liveCoachAvailable(){return process.env.AI_PROVIDER==='local'&&!!process.env.LOCAL_AI_MODEL;}
export async function coachDrawing({subject,image,referenceImage,target='',partInstruction=''},requestSignal){
 if(!['freehand','house','car','cup','tree','bicycle'].includes(subject)||!validImage(image))throw Error('Provide a valid subject and PNG drawing');
 if(referenceImage!==undefined&&!validImage(referenceImage))throw Error('Provide a valid PNG reference');
 if(typeof target!=='string'||target.length>400||typeof partInstruction!=='string'||partInstruction.length>1000)throw Error('Invalid coaching context');
 if(!liveCoachAvailable())throw Error('Live suggestions need a connected local vision model');
 const timeout=Math.min(60000,Math.max(1000,Number(process.env.LIVE_COACH_TIMEOUT_MS)||30000));
 const signal=requestSignal?AbortSignal.any([requestSignal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
 const prompt=`You are a kind drawing teacher giving brief, specific feedback DURING drawing practice. Image 1 is the learner's actual current ink, an UNFINISHED sketch. ${referenceImage?'Image 2 is the reference they are practicing.':''} Target: ${JSON.stringify(target||subject)}. Current practice instruction: ${JSON.stringify(partInstruction)}. ${referenceImage?'Compare the marks already drawn with the corresponding visible parts of the reference.':'Base feedback only on visible marks and the target.'} Give at most TWO concrete useful suggestions, each under 20 words. Choose the most useful observations from shape, proportions, placement, curves, line steadiness, and how strokes connect; vary the focus when more than one issue is visible. Describe a specific feature and a practical next action. Do not default to straightening lines: straightness matters only when the reference feature is straight, and curves should stay curved. Only assess marks already drawn. Missing details are expected in an unfinished drawing; do not demand completion or invent flaws. If the marks look good, give encouragement or one helpful next action. If there is too little ink, suggest continuing the main shape. Do not guess a different target, create a reference, return SVG, or give scores. Return JSON only: {"suggestions":["short actionable tip"]}.`;
 const token=process.env.LOCAL_AI_API_KEY,base=process.env.LOCAL_AI_BASE_URL||'http://127.0.0.1:8000/v1';
 const response=await fetch(`${base.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},signal,body:JSON.stringify({model:process.env.LOCAL_AI_MODEL,max_tokens:160,temperature:.2,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}},...(referenceImage?[{type:'image_url',image_url:{url:referenceImage}}]:[])]}]})});
 if(!response.ok)throw Error(`Local coaching service returned HTTP ${response.status}`);
 const result=await response.json(),choice=result.choices?.[0];
 if(choice?.finish_reason==='length'||typeof choice?.message?.content!=='string')throw Error('Local model returned incomplete coaching');
 let parsed;try{parsed=JSON.parse(choice.message.content.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));}catch{throw Error('Local model returned invalid coaching');}
 const suggestions=Array.isArray(parsed.suggestions)?[...new Set(parsed.suggestions.filter(value=>typeof value==='string').map(value=>value.trim().slice(0,180)).filter(Boolean))].slice(0,2):[];
 if(!suggestions.length)throw Error('Local model returned no suggestions');
 return {source:'local',suggestions};
}
