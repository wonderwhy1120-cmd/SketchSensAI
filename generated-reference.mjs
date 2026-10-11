// Generate, cache, and validate Freehand reference images from the image provider.
import {InferenceClient} from '@huggingface/inference';
import {traceReferenceImage,repairReferenceImage,OutlineQualityError} from './trace-reference.mjs';

const pending=new Map(),cache=new Map();
function beginnerReference(reference){
 const commands=reference.paths.reduce((count,path)=>count+(path.match(/[MmLlHhVvCcSsQqTtAaZz]/g)?.length||0),0);
 if(reference.paths.length>2000||commands>40000)throw new OutlineQualityError('The reference exceeds the tracing complexity limit');
 return reference;
}
const normalize=value=>value.toLowerCase().replace(/\s+/g,' ').trim();

export const outlineNegativePrompt='photograph, photorealistic, 3D render, color, grayscale shading, gray background, black background, shadows, gradients, solid black fills, filled silhouettes, hatching, crosshatching, stippling, thick scribbles, collage, icons, text, lettering, watermark, border, double contours, double outlines';
export function referencePrompt(description,attempt=0,detail='more'){
 return `Create a ${detail==='less'?'simple':'detailed'} black-and-white line-art illustration of ${JSON.stringify(description)} for drawing practice. ${detail==='less'?'Use broad clean outlines and only essential identifying interior features. Simplify textures and decoration, while keeping every requested object, relationship and setting visible. Aim for a small number of easy-to-trace strokes.':'This should be a complete illustrated scene, with recognizable forms and rich interior detail, rather than a minimal icon or preschool diagram.'} Use crisp black contour lines, WHITE interiors and a pure white background, with clear margins on a landscape 4:3 page. Preserve EVERY requested subject, setting, relationship and identifying detail from the full description. Include foreground, midground and background elements appropriate to the requested setting, while keeping the main subject easy to identify. Include identifying interior features appropriate to the requested subjects. Interpret unusual combinations literally and attach requested features to their named subject. Do not invent extra subjects or features unrelated to the user description. Treat exclusions such as no, without, exclude and do not include as strict constraints: those items must be absent, even from the background. Base all scenery on the requested setting only. ${detail==='less'?'Use only the strokes needed to identify the requested subjects and setting.':'Use enough strokes to show these features. Fine detail should remain legible and separated for tracing.'} No color, shading, solid fills, collage, frame or text. Do not fill surfaces with dense hatching.${attempt?(detail==='less'?' Reduce detail even further only in crowded texture: improve line separation and remove shading while preserving all subjects, interior identifying features and requested setting. Do not turn the image into a simple icon.':' Keep the full richness and interior detail of the illustration. Correct shading and solid fills using clean separated contour lines; preserve fine features and the complete scene. Do not simplify the illustration or reduce its detail.'):''}`;
}
export function excludedDetails(description){
 const excluded=[...description.matchAll(/\b(?:no|without|excluding|exclude|do not include)\s+([^.;!?]+)/gi)].map(match=>match[1].trim());
 if(excluded.some(value=>/\b(?:woods|woodland|forest|trees)\b/i.test(value)))excluded.push('trees, woods, forest, woodland, foliage, tree branches');
 return excluded;
}
export function imageParameters(model,provider,description=''){

 const parameters={width:1024,height:768,negative_prompt:[outlineNegativePrompt,...excludedDetails(description)].join(', ')};
 // fal forwards parameters as-is, and uses image_size rather than width/height.
 if(provider==='fal-ai'||/^Qwen\/Qwen-Image/.test(model))parameters.image_size={width:1024,height:768};
 if(/^Qwen\/Qwen-Image(?:-2512)?$/.test(model))Object.assign(parameters,{guidance_scale:4,num_inference_steps:28});
 return parameters;
}
export async function generateImage(description,{attempt=0,detail='more',signal=AbortSignal.timeout(imageTimeout())}={}){
 const token=process.env.HF_IMAGE_TOKEN||process.env.HF_TOKEN,model=process.env.HF_IMAGE_MODEL;
 if(!token||!model)throw Error('Freehand guides need an image-generation model: set HF_TOKEN and HF_IMAGE_MODEL in .env. Your Qwen vision model handles recognition and feedback');
 const provider=process.env.HF_IMAGE_PROVIDER||'auto';
 const client=new InferenceClient(token,{fetch:(url,init)=>fetch(url,{...init,signal})});
 try{
  signal.throwIfAborted();
  const blob=await client.textToImage({model,provider,inputs:referencePrompt(description,attempt,detail),parameters:imageParameters(model,provider,description)}, {signal,retry_on_error:false});
  if(!(blob instanceof Blob)||blob.size>10_000_000)throw Error('Image generation returned an invalid or oversized image');
  return Buffer.from(await blob.arrayBuffer());
 }catch(error){if(error.name==='TimeoutError')throw error;throw Error(`Image generation failed. Check the Hugging Face image model, provider and token (${error.name})`);}
}
function imageTimeout(){return Math.min(600000,Math.max(1000,Number(process.env.IMAGE_TIMEOUT_MS)||180000));}
// The vision model never invents drawing coordinates. Guides come from image pixels.
export async function generateReference(description,options={}){
 const detail=options.detail??'more';
 if(!['more','less'].includes(detail))throw Error('Choose a valid image detail level');
 const key=JSON.stringify([normalize(description),detail]),makeImage=options.generateImage||generateImage;
 if(!options.generateImage&&cache.has(key))return {...cache.get(key),title:description};
 if(!options.generateImage&&pending.has(key))return pending.get(key);
 const task=(async()=>{
  const signal=AbortSignal.timeout(imageTimeout());
  const attempts=Math.min(2,Math.max(1,Number.parseInt(process.env.IMAGE_MAX_ATTEMPTS,10)||2));
  let reference;const rejected=[],failures=[];
  for(let attempt=0;attempt<attempts;attempt++){
   signal.throwIfAborted();
   const bytes=await makeImage(description,{attempt,signal,detail});
   try{reference=beginnerReference(await traceReferenceImage(bytes,{tolerance:detail==='less'?1.4:.4}));break;}
   catch(error){
    if(!(error instanceof OutlineQualityError))throw error;
    failures.push(error.message);
    rejected.push(bytes);
    if(detail==='more'){
     try{reference=beginnerReference(await repairReferenceImage(bytes,{tolerance:.6,edgeTolerance:.8}));break;}
     catch(error){failures.push(error.message);}
    }
    if(attempt===attempts-1){
     for(const candidate of rejected.reverse())try{reference=beginnerReference(await repairReferenceImage(candidate,{tolerance:detail==='less'?1.8:.6,edgeTolerance:detail==='less'?2:.8}));break;}catch(error){failures.push(error.message);}
     if(!reference)throw new OutlineQualityError(`Could not convert the generated image into tracing lines: ${[...new Set(failures)].join('; ')}`);
    }
   }
  }
  const result={...reference,title:description,detail,generated:true,raster:true,cachedExample:false,credits:[]};
  if(!options.generateImage){cache.set(key,result);if(cache.size>12)cache.delete(cache.keys().next().value);}
  return result;
 })();
 if(!options.generateImage)pending.set(key,task);
 try{return await task;}finally{if(!options.generateImage)pending.delete(key);}
}
