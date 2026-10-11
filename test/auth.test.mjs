// Checks browser-local demo profile behavior.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('guest and Home controls share account state without persisting cover dismissal',async()=>{
 const ids=new Map(),events=[],storage=new Map();
 const element=id=>{
  if(!ids.has(id)){
   const classes=new Set();ids.set(id,{value:'',classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(){}},setAttribute(){},focus(){},close(){this.open=false;},showModal(){this.open=true;}});
  }
  return ids.get(id);
 };
 const context=vm.createContext({document:{getElementById:element},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 const script=new vm.Script(await readFile(new URL('../public/auth.js',import.meta.url),'utf8'));script.runInContext(context);
 element('guestCoverBtn').onclick();assert.equal(element('cover').classList.contains('hidden'),true);assert.equal(JSON.parse(storage.get('sketch-profile')).name,'Guest');assert.equal(events.at(-1).detail.guest,true);
 element('showCoverBtn').onclick();assert.equal(element('cover').classList.contains('hidden'),false);assert.equal(storage.has('sketch-cover-dismissed'),false);
 element('loginCoverBtn').onclick();assert.equal(element('login').open,true);assert.equal(element('cover').classList.contains('hidden'),true);
});
