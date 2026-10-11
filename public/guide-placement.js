// Fit each reference part to the fixed drawing canvas with a small margin.
export function guidePlacement(bounds,fillPage=false){
 const {x,y,width,height}=bounds;
 if(![x,y,width,height].every(Number.isFinite)||width<0||height<0||width+height<=0)throw Error('Invalid guide bounds');
 const scale=fillPage?Math.min(720/Math.max(1,width),520/Math.max(1,height)):Math.min(1,width?768/width:1,height?568/height:1);
 return {scale,dx:fillPage?400-(x+width/2)*scale:Math.max(16-x*scale,Math.min(0,784-(x+width)*scale)),dy:fillPage?300-(y+height/2)*scale:Math.max(16-y*scale,Math.min(0,584-(y+height)*scale))};
}
