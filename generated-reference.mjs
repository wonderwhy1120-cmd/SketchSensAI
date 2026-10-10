import {InferenceClient} from '@huggingface/inference';
import {traceReferenceImage,repairReferenceImage,OutlineQualityError} from './trace-reference.mjs';

const pending=new Map(),cache=new Map();
function beginnerReference(reference){
 const commands=reference.paths.reduce((count,path)=>count+(path.match(/[MmLlHhVvCcSsQqTtAaZz]/g)?.length||0),0);
 if(reference.paths.length>35||commands>420)throw new OutlineQualityError('The reference contains too much detail for beginner tracing');
 return reference;
}
const normalize=value=>value.toLowerCase().replace(/\b(?:a|an|the)\b/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

export const outlineNegativePrompt='photograph, photorealistic, 3D render, color, grayscale shading, gray background, black background, shadows, gradients, solid black fills, filled silhouettes, filled roofs, filled foliage, hatching, crosshatching, stippling, texture, fur detail, dense leaves, intricate detail, thick scribbles, collage, icons, text, lettering, watermark, border, decorative details, busy background, double contours, double outlines, wood grain, roof tiles, bricks, perspective, intricate coloring book';
export function referencePrompt(description,attempt=0){
 return `Create a preschool learn-to-draw worksheet of ${JSON.stringify(description)}. This is a VERY SIMPLE diagram, not a finished illustration or a realistic coloring-book scene. Flat 2D, one continuous black centerline per contour, WHITE interiors, pure white background. Use circles, ovals, straight lines and smooth broad curves. Main subject large and immediately recognizable, centered with clear margins on a landscape 4:3 page. Prefer a SIDE VIEW for vehicles and boats so their silhouette is easy to learn; use a simple face-on view for other subjects when appropriate. Preserve the requested subjects and setting, but represent the setting with at most TWO supporting shapes or lines. If a road is requested, draw only the main subject and two plain road lines; do not add trees, buildings, scenery or a horizon unless explicitly requested. The main object should occupy most of the drawing. At most 15 long, clean strokes and a few essential small features. No overlapping contour bands or double outlines. No perspective, shading, textures, color, fills, collage, frame or text. Omit decorative and mechanical detail: no grilles, badges, wheel spokes, reflections, chrome, bumper trim, fur, leaves, wood grain, roof tiles or bricks. Trees have a single canopy and plain trunk. Buildings have a simple roof, walls, door and at most two windows. At least 85 percent of the page is empty white paper. Make this as easy to trace as a simple classroom whiteboard diagram.${attempt?' Reduce detail even further. Use only the large silhouette and essential identifying shapes. No background decoration. All surfaces remain empty white.':''}`;
}
export function imageParameters(model,provider){
 const parameters={width:1024,height:768,negative_prompt:outlineNegativePrompt};
 // fal forwards parameters as-is, and uses image_size rather than width/height.
 if(provider==='fal-ai'||/^Qwen\/Qwen-Image/.test(model))parameters.image_size={width:1024,height:768};
 if(/^Qwen\/Qwen-Image(?:-2512)?$/.test(model))Object.assign(parameters,{guidance_scale:4,num_inference_steps:28});
 return parameters;
}
export async function generateImage(description,{attempt=0,signal=AbortSignal.timeout(imageTimeout())}={}){
 const token=process.env.HF_IMAGE_TOKEN||process.env.HF_TOKEN,model=process.env.HF_IMAGE_MODEL;
 if(!token||!model)throw Error('No matching online drawing was found. New scenes need an image-generation model: set HF_TOKEN and HF_IMAGE_MODEL in .env. Your Qwen vision model handles recognition and feedback');
 const provider=process.env.HF_IMAGE_PROVIDER||'auto';
 const client=new InferenceClient(token,{fetch:(url,init)=>fetch(url,{...init,signal})});
 try{
  signal.throwIfAborted();
  const blob=await client.textToImage({model,provider,inputs:referencePrompt(description,attempt),parameters:imageParameters(model,provider)}, {signal,retry_on_error:false});
  if(!(blob instanceof Blob)||blob.size>10_000_000)throw Error('Image generation returned an invalid or oversized image');
  return Buffer.from(await blob.arrayBuffer());
 }catch(error){if(error.name==='TimeoutError')throw error;throw Error(`Image generation failed. Check the Hugging Face image model, provider and token (${error.name})`);}
}
function imageTimeout(){return Math.min(600000,Math.max(1000,Number(process.env.IMAGE_TIMEOUT_MS)||180000));}
// The vision model never invents drawing coordinates. Guides come from image pixels.
export async function generateReference(description,options={}){
 const key=normalize(description),makeImage=options.generateImage||generateImage;
 if(!options.generateImage&&cache.has(key))return {...cache.get(key),title:description};
 if(!options.generateImage&&pending.has(key))return pending.get(key);
 const task=(async()=>{
  const signal=AbortSignal.timeout(imageTimeout());
  const attempts=Math.min(2,Math.max(1,Number.parseInt(process.env.IMAGE_MAX_ATTEMPTS,10)||2));
  let reference;const rejected=[];
  for(let attempt=0;attempt<attempts;attempt++){
   signal.throwIfAborted();
   const bytes=await makeImage(description,{attempt,signal});
   try{reference=beginnerReference(await traceReferenceImage(bytes));break;}
   catch(error){
    if(!(error instanceof OutlineQualityError))throw error;
    rejected.push(bytes);
    if(attempt===attempts-1){
     for(const candidate of rejected.reverse())try{reference=beginnerReference(await repairReferenceImage(candidate));break;}catch{}
     if(!reference)throw new OutlineQualityError('Generated images had no recoverable subject contours');
    }
   }
  }
  const result={...reference,title:description,generated:true,raster:true,cachedExample:false,credits:[]};
  if(!options.generateImage){cache.set(key,result);if(cache.size>12)cache.delete(cache.keys().next().value);}
  return result;
 })();
 if(!options.generateImage)pending.set(key,task);
 try{return await task;}finally{if(!options.generateImage)pending.delete(key);}
}
