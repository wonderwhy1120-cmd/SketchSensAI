export const subjects = {
 house:{name:'House',title:'A little house',level:'Simple shapes',paths:['M220 290 L400 145 L580 290','M255 270 L255 480 L545 480 L545 270','M365 480 L365 355 L435 355 L435 480 M290 320 H335 V370 H290 Z M465 320 H510 V370 H465 Z'],tips:[['Find the roof angle','Build a triangle with its peak centered above the walls.'],['Balance the walls','Make both sides vertical and connect them with a level base.'],['Place the details','Keep windows aligned and the doorway centered.']]},
 car:{name:'Car',title:'Your everyday road trip',level:'Curves & proportions',paths:['M190 365 L235 365 L300 260 L485 260 L565 350 L625 370 L625 440 L190 440 Z','M320 280 L270 350 L520 350 L470 280 Z M395 280 V350','M320 445 A45 45 0 1 0 230 445 A45 45 0 1 0 320 445 M580 445 A45 45 0 1 0 490 445 A45 45 0 1 0 580 445'],tips:[['Shape the silhouette','Use a long lower body and a smaller cabin above it.'],['Define the cabin','Line up the windshield and windows with the top of the car.'],['Round out the wheels','Draw equally sized circles on the same horizontal line.']]},
 cup:{name:'Cup',title:'A moment for coffee',level:'Ellipses & curves',paths:['M260 240 C260 205 490 205 490 240 C490 275 260 275 260 240 Z','M260 240 L280 455 Q375 500 470 455 L490 240','M490 285 C620 250 625 435 478 420'],tips:[['Open with an ellipse','Keep the rim wide and shallow, rather than perfectly circular.'],['Taper the sides','Bring the walls slightly inward toward a curved base.'],['Connect the handle','Attach the handle to the side in two places.']]},
 tree:{name:'Tree',title:'A little bit of nature',level:'Organic forms',paths:['M370 355 L350 490 H450 L430 355','M295 370 C180 380 200 260 265 240 C230 150 355 120 400 180 C475 110 580 175 550 245 C650 310 550 410 475 370 C435 420 350 410 295 370 Z','M400 465 V330 M400 385 L345 335 M400 360 L450 310'],tips:[['Anchor the trunk','Draw a trunk that gets a little wider near the ground.'],['Group the foliage','Build a connected silhouette from a few overlapping rounded shapes.'],['Add branching rhythm','Connect branches to the trunk, keeping their directions varied.']]},
 bicycle:{name:'Bicycle',title:'Two wheels, endless possibilities',level:'Structure & symmetry',paths:['M320 415 A90 90 0 1 0 140 415 A90 90 0 1 0 320 415 M660 415 A90 90 0 1 0 480 415 A90 90 0 1 0 660 415','M230 415 L325 275 L410 415 Z M325 275 L510 275 L410 415 M510 275 L570 415','M325 275 L305 240 H270 M510 275 L490 220 H550 M390 415 H440'],tips:[['Set the wheels','Use two equally sized circles with their centers level.'],['Build the frame','Connect the wheels with two clear triangular shapes.'],['Finish the contact points','Add handlebars, a seat and pedals to the frame.']]}
};
export function referenceMarkup(key,color='#526e57'){return `<g fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${subjects[key].paths.map(d=>`<path d="${d}"/>`).join('')}</g>`;}
export function demoFeedback(subject){const item=subjects[subject];return {source:'template',match:subject,summary:`Practice the main shapes of your ${item.name.toLowerCase()}. These are preset tips, not an AI assessment of your sketch.`,steps:item.tips.map(([title,instruction],i)=>({title,instruction,path:item.paths[i]}))};}

// Match a reference edge to the user's first stroke, then grow the selected subject around it.
export const seedEdges={
 house:[[[255,480],[545,480]],[[255,270],[255,480]],[[220,290],[400,145]],[[400,145],[580,290]]],
 car:[[[190,440],[625,440]],[[300,260],[485,260]],[[235,365],[300,260]]],
 cup:[[[260,240],[490,240]],[[260,240],[280,455]]],
 tree:[[[350,490],[450,490]],[[370,355],[350,490]],[[400,465],[400,330]]],
 bicycle:[[[230,415],[570,415]],[[325,275],[510,275]],[[230,415],[325,275]]]
};
export function transformPath(path,scale,angle,tx,ty){
 const tokens=path.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g),result=[];
 const arity={M:2,L:2,H:1,V:1,C:6,Q:4,A:7,Z:0};let x=0,y=0;
 const n=value=>Math.round(value*10)/10;
 const point=(a,b)=>[n(tx+scale*(a*Math.cos(angle)-b*Math.sin(angle))),n(ty+scale*(a*Math.sin(angle)+b*Math.cos(angle)))];
 for(let i=0;i<tokens.length;){const cmd=tokens[i++],count=arity[cmd];if(count===0){result.push(cmd);continue;}const v=tokens.slice(i,i+count).map(Number);i+=count;
  if(cmd==='H'){x=v[0];result.push('L'+point(x,y).join(' '));}
  else if(cmd==='V'){y=v[0];result.push('L'+point(x,y).join(' '));}
  else if(cmd==='A'){x=v[5];y=v[6];result.push('A'+[n(v[0]*scale),n(v[1]*scale),n(v[2]+angle*180/Math.PI),v[3],v[4],...point(x,y)].join(' '));}
  else{x=v[count-2];y=v[count-1];const values=[];for(let j=0;j<count;j+=2)values.push(...point(v[j],v[j+1]));result.push(cmd+values.join(' '));}
 }
 return result.join(' ');
}
export function strokeGuidance(subject,anchors){
 const item=subjects[subject]||subjects.house;subject=Object.hasOwn(subjects,subject)?subject:'house';
 const points=anchors.flat().filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
 let a=points[0]||[300,400],b=points.at(-1)||[500,400];
 // Closed strokes need a useful edge rather than a zero-length start/end match.
 if(Math.hypot(b[0]-a[0],b[1]-a[1])<10&&points.length>1)b=points.reduce((best,p)=>Math.hypot(p[0]-a[0],p[1]-a[1])>Math.hypot(best[0]-a[0],best[1]-a[1])?p:best,a);
 if(Math.hypot(b[0]-a[0],b[1]-a[1])<10){a=[Math.max(20,a[0]-40),Math.min(550,a[1])];b=[Math.min(780,a[0]+80),a[1]];}
 if(a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1]))[a,b]=[b,a];
 const targetAngle=Math.atan2(b[1]-a[1],b[0]-a[0]);
 let best;
 for(let [start,end] of seedEdges[subject]){if(start[0]>end[0]||(start[0]===end[0]&&start[1]>end[1]))[start,end]=[end,start];const angle=targetAngle-Math.atan2(end[1]-start[1],end[0]-start[0]);if(!best||Math.abs(angle)<Math.abs(best.angle))best={start,end,angle};}
 const scale=Math.max(.12,Math.min(1.25,Math.hypot(b[0]-a[0],b[1]-a[1])/Math.hypot(best.end[0]-best.start[0],best.end[1]-best.start[1])));
 const tx=a[0]-scale*(best.start[0]*Math.cos(best.angle)-best.start[1]*Math.sin(best.angle));
 const ty=a[1]-scale*(best.start[0]*Math.sin(best.angle)+best.start[1]*Math.cos(best.angle));
 return {source:'geometry',match:subject,summary:`Use your first line as the starting edge of a ${item.name.toLowerCase()}. This suggested construction grows around that edge; it is a reference-based guide, not an AI assessment.`,steps:item.paths.map((path,i)=>({title:item.tips[i][0],instruction:item.tips[i][1]+' Use the attached guide to continue from your starting line.',path:transformPath(path,scale,best.angle,tx,ty),guideSource:'geometry'}))};
}

// AI selects a known reference edge and two real sampled points; it never supplies drawing paths.
export function referenceGuidance(subject,anchors,alignment){
 const edge=seedEdges[subject]?.[alignment?.edge];
 const stroke=anchors[alignment?.stroke];
 if(!edge||!stroke||!Number.isInteger(alignment.edge)||!Number.isInteger(alignment.stroke)||!Number.isInteger(alignment.start)||!Number.isInteger(alignment.end)||alignment.start===alignment.end)return strokeGuidance(subject,anchors);
 const a=stroke[alignment.start],b=stroke[alignment.end];
 if(!a||!b||Math.hypot(b[0]-a[0],b[1]-a[1])<10)return strokeGuidance(subject,anchors);
 const [start,end]=edge;
 const scale=Math.hypot(b[0]-a[0],b[1]-a[1])/Math.hypot(end[0]-start[0],end[1]-start[1]);
 const angle=Math.atan2(b[1]-a[1],b[0]-a[0])-Math.atan2(end[1]-start[1],end[0]-start[0]);
 if(scale<.1||scale>2)return strokeGuidance(subject,anchors);
 const tx=a[0]-scale*(start[0]*Math.cos(angle)-start[1]*Math.sin(angle));
 const ty=a[1]-scale*(start[0]*Math.sin(angle)+start[1]*Math.cos(angle));
 return {source:'reference',match:subject,guideSource:'reference',steps:subjects[subject].paths.map((path,i)=>({title:subjects[subject].tips[i][0],instruction:subjects[subject].tips[i][1],path:transformPath(path,scale,angle,tx,ty),guideSource:'reference'}))};
}
