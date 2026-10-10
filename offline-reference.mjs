import {transformDrawing} from './reference-drawings.mjs';
import catalog from './public/references/lucide-outlines.json' with {type:'json'};

const aliases={boat:'sailboat',boats:'sailboat',ship:'ship',bunny:'rabbit',bunnies:'rabbit',kitten:'cat',kitty:'cat',puppy:'dog',automobile:'car',cars:'car',bike:'bike',bicycle:'bike',mug:'coffee',cup:'coffee',forest:'trees',woods:'trees',tree:'tree-deciduous',airplane:'plane',aeroplane:'plane',ocean:'waves',sea:'waves'};
const words=value=>value.toLowerCase().replace(/[^a-z0-9 -]/g,' ').replace(/-/g,' ').trim().split(/\s+/);
const fillers=new Set(['a','an','the','big','small','little','huge','giant','large','tiny','simple','cute','beautiful','cool','ah','ahh','ass','h','please','draw','drawing','of','me']);
export function simpleObjectDescription(description){return !/\b(?:in|on|by|with|and|near|beside|under|over|at|behind|surrounded)\b/i.test(description);}

// Use whole nouns and preserve source geometry; never substitute an unrelated animal or scene.
export function offlineReference(description,anchors=[]){
 const head=words(description.split(/\b(?:in|on|by|with|and|near|beside|under|over|at|behind|surrounded)\b/i)[0]).filter(word=>!fillers.has(word));
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
 const road=description.match(/^(.*?)\s+(?:on|in|along|driving on|driving along)\s+(?:(?:a|an|the)\s+)?(?:road|street|highway)$/i);
 if(!road)return;
 const subject=offlineReference(road[1]);
 const vehicles=new Set(['car','car-front','car-taxi-front','bus','bus-front','truck','truck-electric','bike','motorbike','tractor','ambulance','train-front']);
 if(!subject.matched||!vehicles.has(subject.id.slice('lucide:'.length)))return;
 return {...subject,title:description,width:32,height:28,paths:[...transformDrawing(subject.paths,1,4,1),'M1 23 L31 23','M1 26 L31 26'],composed:true,notice:'A simple vehicle outline with two road lines. Extra vehicle trim and background decoration are omitted.'};
}
