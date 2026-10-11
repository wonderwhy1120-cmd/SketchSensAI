// Build an offline outline when generated or online references are unavailable.
import {transformDrawing} from './reference-drawings.mjs';
import catalog from './public/references/lucide-outlines.json' with {type:'json'};

const aliases={boat:'sailboat',boats:'sailboat',ship:'ship',bunny:'rabbit',bunnies:'rabbit',kitten:'cat',kitty:'cat',puppy:'dog',automobile:'car',cars:'car',bike:'bike',bicycle:'bike',mug:'coffee',cup:'coffee',forest:'trees',woods:'trees',tree:'tree-deciduous',airplane:'plane',aeroplane:'plane',ocean:'waves',sea:'waves'};
const words=value=>value.toLowerCase().replace(/[^a-z0-9 -]/g,' ').replace(/-/g,' ').trim().split(/\s+/);
const fillers=new Set(['a','an','the','big','small','little','huge','giant','large','tiny','simple','cute','beautiful','cool','ah','ahh','ass','h','please','draw','drawing','of','me']);
export function simpleObjectDescription(description){return !/\b(?:in|on|along|across|by|with|and|near|beside|under|over|at|behind|surrounded|no|without|excluding|exclude)\b/i.test(description);}

// Keep every named scene component when hosted generation is unavailable.
export function keywordSceneReference(description){
 const phrases=description.split(/\b(?:in|on|along|across|by|with|and|near|beside|under|over|at|behind|surrounded|no|without|excluding|exclude)\b/i).map(value=>value.trim()).filter(Boolean);
 if(phrases.length<2)return;
 const subject=offlineReference(phrases.shift());
 if(!subject.matched)return;
 const paths=transformDrawing(subject.paths,1.8,12,12),included=[subject.title];
 let ground=0,sky=0;
 for(const phrase of phrases){
  if(/\b(?:dock|pier|jetty)\b/i.test(phrase)){
   paths.push('M52 49 L94 49 L94 53 L52 53 Z','M58 53 L58 66','M87 53 L87 66','M62 49 L62 53','M73 49 L73 53','M84 49 L84 53');
   paths.push('M5 61 Q12 57 19 61 T33 61 T47 61','M8 69 Q15 65 22 69 T36 69 T50 69 T64 69 T78 69 T92 69');
   included.push('dock and water');continue;
  }
  if(/^(?:(?:a|an|the)\s+)?(?:water|ocean|sea|lake|river)$/i.test(phrase)){
   paths.push('M4 62 Q12 58 20 62 T36 62 T52 62 T68 62 T84 62','M8 70 Q16 66 24 70 T40 70 T56 70 T72 70 T88 70');included.push(phrase);continue;
  }
  const detail=offlineReference(phrase);
  if(!detail.matched)return;
  const above=['sun','moon','cloud','cloud-sun','bird','stars'].includes(detail.id.slice(7));
  paths.push(...transformDrawing(detail.paths,above?.7:1.3,above?65+sky++*18:60+ground++*28,above?2:22));
  included.push(detail.title);
 }
 const width=Math.max(100,60+ground*28,65+sky*18);
 return {...subject,title:description,width,height:76,paths,composed:true,notice:`Keyword-based scene reference: ${included.join(', ')}. Includes the requested setting as traceable outlines.`};
}

// Use whole nouns and preserve source geometry; never substitute an unrelated animal or scene.
export function offlineReference(description,anchors=[]){
 const head=words(description.split(/\b(?:in|on|along|across|by|with|and|near|beside|under|over|at|behind|surrounded|no|without|excluding|exclude)\b/i)[0]).filter(word=>!fillers.has(word));
 const candidates=[];
 for(let start=0;start<head.length;start++)for(let end=head.length;end>start;end--){
  const term=head.slice(start,end).join('-'),name=aliases[term]||term;
  if(Object.hasOwn(catalog.drawings,name))candidates.push({name,start,length:end-start});
 }
 candidates.sort((a,b)=>a.start-b.start||b.length-a.length);
 const name=candidates[0]?.name;
 if(name)return {id:`lucide:${name}`,title:name.replaceAll('-',' '),width:catalog.width,height:catalog.height,paths:catalog.drawings[name],artist:catalog.artist,license:catalog.license,sourceUrl:`https://icon-sets.iconify.design/lucide/${name}/`,fallback:true,matched:true,notice:simpleObjectDescription(description)?'Using a clean, bundled outline for your object.':'Using a simplified outline of the main object; extra scene details are omitted.'};
 const strokes=anchors.filter(stroke=>Array.isArray(stroke)&&stroke.length>1).map(stroke=>stroke.filter(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)));
 const paths=strokes.filter(stroke=>stroke.length>1&&stroke.some(point=>Math.hypot(point[0]-stroke[0][0],point[1]-stroke[0][1])>2)).map(stroke=>stroke.map((point,index)=>`${index?'L':'M'}${point.join(' ')}`).join(' '));
 return {title:paths.length?'Your sketch practice':'Basic shape practice',width:800,height:600,paths:paths.length?paths:['M100 180 L340 180 L340 420 L100 420 Z','M460 300 A100 100 0 1 0 660 300 A100 100 0 1 0 460 300','M160 490 Q300 400 400 490 Q500 560 640 490'],fallback:true,matched:false,notice:paths.length?'Object reference unavailable. This backup follows your starting sketch for line practice.':'Object reference unavailable. Here is a basic shape exercise to keep practicing; it does not depict your requested object.'};
}

// A plain road needs only two lines; keep the licensed subject geometry intact
// instead of requesting a detailed streetscape from an image model.
export function simpleSceneReference(description){
 const tracks=description.trim().match(/^(.*?)\s+(?:on|along|driving on|driving along)\s+(?:(?:a|an|the)\s+)?(?:(?:train|railway|railroad)\s*-?\s*tracks?|tracks|rails)$/i);
 if(tracks){
  const subject=offlineReference(tracks[1]);
  const vehicles=new Set(['car','car-front','car-taxi-front','bus','bus-front','truck','truck-electric','bike','motorbike','tractor','ambulance','train-front']);
  if(!subject.matched||!vehicles.has(subject.id.slice('lucide:'.length)))return;
  const details=subject.id==='lucide:car'?['M4 11 L5.2 8.5 L8 8.5 L8 11 Z','M9 8.5 L12 8.5 L14.5 11 L9 11 Z','M10 13 L11 13','M2 13 L3.5 13','M20 13 L22 13']:[];
  // Side view: wheel bottoms meet the upper rail; ties sit behind both rails.
  const sleepers=Array.from({length:11},(_,i)=>{const x=1+i*3;return `M${x} 20 L${x+1} 20 L${x+1} 26 L${x} 26 Z`;});
  return {...subject,title:description,width:34,height:28,paths:[...transformDrawing([...subject.paths,...details],1,5,2),...sleepers,'M1 21 L33 21','M1 24 L33 24'],composed:true,notice:'A side-view vehicle on train tracks, with two rails and railway sleepers. Trace the vehicle first, then the track details.'};
 }
 const road=description.match(/^(.*?)\s+(?:on|in|along|driving on|driving along)\s+(?:(?:a|an|the)\s+)?(?:road|street|highway)$/i);
 if(!road)return;
 const subject=offlineReference(road[1]);
 const vehicles=new Set(['car','car-front','car-taxi-front','bus','bus-front','truck','truck-electric','bike','motorbike','tractor','ambulance','train-front']);
 if(!subject.matched||!vehicles.has(subject.id.slice('lucide:'.length)))return;
 return {...subject,title:description,width:32,height:28,paths:[...transformDrawing(subject.paths,1,4,1),'M1 23 L31 23','M1 26 L31 26'],composed:true,notice:'A simple vehicle outline with two road lines. Extra vehicle trim and background decoration are omitted.'};
}
