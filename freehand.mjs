// Recognize freehand sketches and assemble a practice guide from selected objects.
import {placeDrawing} from './reference-drawings.mjs';
import {generateReference} from './generated-reference.mjs';
import {recognitionViews} from './recognition-image.mjs';
const cleanText=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';
const suggestions=value=>Array.isArray(value)?[...new Set(value.map(v=>cleanText(v)).filter(Boolean))].slice(0,3):[];
const ambiguous=value=>!value||/^(unknown(?: object)?|unclear|unidentified|line|shape|polygon|freehand|scribble)$/i.test(value);
export async function recognizeFreehand({image,anchors=[]},ask){
 const {images,leveled}=await recognitionViews(image);
 const prompt=`What real-world object was this person probably trying to draw? Recognize the WHOLE silhouette, including where the separate smaller shapes sit relative to it. ${leveled?"Image 1 is a leveled view; Image 2 is the ORIGINAL orientation of the SAME sketch. These are two views of ONE object.":"The image is cropped around the actual ink, preserving proportions."} Give a specific everyday object name, not a broad category like animal, vehicle, toy or object. There is NO selected target or default subject. Do not invent unseen features. Suggest 1 to 3 DISTINCT plausible objects ranked by visual evidence; do not force extra guesses, synonyms or fanciful interpretations. High confidence requires two distinctive visible features; ambiguous sketches should have low confidence. Give 1 or 2 practice tips about the actual lines, not guessed anatomy. Return JSON only: {"candidates":[{"object":"specific object name","referenceQuery":"specific search phrase","confidence":"low|medium|high","reason":"brief visible evidence"}],"summary":"observed shapes under 30 words","suggestions":["tip under 20 words"]}.`;
 let result=await ask(prompt,images,{temperature:.1});
 const normalize=result=>{
  const seen=new Set(),raw=Array.isArray(result?.candidates)?result.candidates:[result];
  return raw.flatMap(item=>{const object=cleanText(item?.object,80),key=object.toLowerCase();if(ambiguous(object)||seen.has(key))return [];seen.add(key);return [{object,confidence:['low','medium','high'].includes(item.confidence)?item.confidence:'low',reason:cleanText(item.reason||item.summary,180),referenceQuery:cleanText(item.referenceQuery,120)||object}];}).slice(0,3);
 };
 let candidates=normalize(result);
 if(!candidates.length){result=await ask(`${prompt} Your previous answer did not choose an object. Pick one plausible object these starting strokes could become and set confidence to low.`,images,{temperature:.1});candidates=normalize(result).map(candidate=>({...candidate,confidence:'low'}));}
 if(!candidates.length)throw Error('The model could not suggest an object for this sketch');
 return {source:'local',needsSelection:true,candidates,summary:cleanText(result?.summary,1200),suggestions:suggestions(result?.suggestions)};
}
export async function freehandAnalyze({image,anchors=[],phase,selectedObject,detail='more'},ask,isVisibleGuide,options={}){
 if(!['more','less'].includes(detail))throw Error('Choose a valid image detail level');
 if(phase!==undefined&&!['recognize','guide'].includes(phase))throw Error('Invalid freehand phase');
 if(phase==='recognize')return recognizeFreehand({image,anchors},ask);
 let recognition,guess;
 if(phase==='guide'){
  if(typeof selectedObject!=='string'||selectedObject.length>400||!selectedObject.trim()||/[\n\r<>]/.test(selectedObject))throw Error('Choose a valid object description');
  guess={object:selectedObject.trim(),referenceQuery:selectedObject.trim(),confidence:'low'};
 }else{recognition=await recognizeFreehand({image,anchors},ask);guess=recognition.candidates[0];}
 const object=guess.object,hasSketch=anchors.some(stroke=>stroke.length>0);
 const reference=await (options.generateReference||generateReference)(object,{detail});
 if(reference.fallback||reference.composed||!reference.generated)throw Error('Image generation did not return a generated reference. Please retry.');
 let paths;
 try{paths=placeDrawing(reference.paths,reference.width,reference.height,anchors);if(!paths.length||!paths.every(isVisibleGuide))throw Error('Unsupported tracing lines');}
 catch{throw Error('The generated reference could not be converted into tracing lines. Please retry; no substitute reference was used.');}
 const partCount=Math.min(3,paths.length),titles=['Start the reference','Build the shape','Complete the details'];
 const groups=[];let group=[];
 for(const path of paths){if(group.length&&(group.join(' ').length+path.length+1>5400||group.length>=Math.ceil(paths.length/partCount))){groups.push(group);group=[];}group.push(path);}if(group.length)groups.push(group);
 const steps=groups.map((group,index)=>({title:titles[Math.min(index,2)],instruction:'Trace these outlines extracted from the generated reference image, then continue to the next part.',path:group.join(' ')}));
 if(!steps.every(s=>isVisibleGuide(s.path)))throw Error('The reference drawing is too complex to trace; try a simpler description');
 let assessment={},feedbackUnavailable=false;
 if(hasSketch){
  try{assessment=await ask(`Give kind drawing-teacher feedback for the user's sketch of ${JSON.stringify(object)}. Image 1 is their ACTUAL sketch. The guide is ${reference.generated?'an AI-generated image':'an online'} 2D outline drawing titled ${JSON.stringify(reference.title)}. The application traces the reference; do NOT invent, redesign or return any SVG geometry. ${reference.raster?'Image 2 is the actual tracing reference.':`Source outline paths in ${reference.width}x${reference.height} coordinates: ${JSON.stringify(reference.paths)}`}. Suggest 1 to 3 concrete improvements only where needed: steadier straight edges, smoother curves, symmetry, proportions or connecting gaps. Do not tell the user to straighten intentional curves. Return JSON only {"improvement":"specific advice under 40 words","suggestions":["actionable tip under 20 words"]}.`,reference.raster?[image,reference.url]:[image]);}catch{feedbackUnavailable=true;}
 }
 return {source:'local',match:'freehand',object,detail,confidence:guess.confidence,chosen:phase==='guide',reference,simplifiedReference:true,fitToPage:reference.raster||!hasSketch,guideSource:'generated',summary:reference.notice||recognition?.summary||(reference.generated?`${reference.cachedExample?'A prepared AI-generated reference is ready':reference.repaired?'AI reference converted into clean tracing contours':'AI created a line-art reference'} for “${object}”. Trace it one part at a time.`:`Trace the online 2D ${reference.title} drawing one part at a time.`),improvement:cleanText(assessment?.improvement,1000)||'Follow the reference outline using smooth, deliberate strokes. Start with the main shapes, then add the smaller details.',suggestions:hasSketch?(suggestions(assessment?.suggestions).length?suggestions(assessment?.suggestions):recognition?.suggestions||[]):[],feedbackUnavailable,steps};
}
