// Checks offline reference matching and geometry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/references/lucide-outlines.json' with {type:'json'};
import {offlineReference,simpleSceneReference} from '../offline-reference.mjs';
import {freehandAnalyze} from '../freehand.mjs';
import {placeDrawing} from '../reference-drawings.mjs';
import {isVisibleGuide} from '../server.mjs';

test('bundled library contains only complete, safe traceable paths after placement',()=>{
 assert.ok(Object.keys(catalog.drawings).length>1700);
 for(const paths of Object.values(catalog.drawings))assert.ok(placeDrawing(paths,24,24).every(isVisibleGuide));
});
test('informal descriptions find the actual object instead of treating the entire phrase as a catalog name',()=>{
 for(const [description,id] of [['a big ah h car','lucide:car'],['a cute kitten','lucide:cat'],['a little boat','lucide:sailboat'],['a bunny in the woods','lucide:rabbit']]){
  const reference=offlineReference(description);assert.equal(reference.id,id);assert.equal(reference.matched,true);assert.ok(reference.paths.every(isVisibleGuide));
 }
 assert.match(offlineReference('a bunny in the woods').notice,/extra scene details are omitted/);
 const unknown=offlineReference('a quux creature in the forest');assert.equal(unknown.matched,false);assert.match(unknown.notice,/does not depict your requested object/);assert.ok(unknown.paths.every(isVisibleGuide));
});
