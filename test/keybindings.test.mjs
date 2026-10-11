// Checks undo and redo shortcut handling.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawingShortcut} from '../public/keybindings.js';
const key=changes=>({key:'z',metaKey:true,ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false,isComposing:false,target:{closest:()=>null,isContentEditable:false},...changes});
test('Command or Control Z undoes; adding Shift redoes',()=>{
 assert.equal(drawingShortcut(key()),'undo');
 assert.equal(drawingShortcut(key({shiftKey:true,key:'Z'})),'redo');
 assert.equal(drawingShortcut(key({metaKey:false,ctrlKey:true})),'undo');
 assert.equal(drawingShortcut(key({metaKey:false,ctrlKey:true,shiftKey:true})),'redo');
});
test('drawing shortcuts leave typing, composing and unrelated key combinations alone',()=>{
 for(const changes of [{metaKey:false},{key:'x'},{altKey:true},{isComposing:true},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{closest:()=>({tagName:'INPUT'})}}])assert.equal(drawingShortcut(key(changes)),null);
});
