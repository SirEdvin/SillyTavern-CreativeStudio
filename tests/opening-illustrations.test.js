import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCardV3} from '../src/core/card.js';
import {createProject,newCharacter,upsertArtifact,editArtifactField,cardForSt,removeMedia,mediaUsage} from '../src/core/project.js';
import {openingSlots,openingEntries,setOpeningEntry,normalizeOpeningCard,decorateOpeningCard,openingStale,reorderOpeningAlternates} from '../src/core/opening-illustrations.js';
function card(){const c=emptyCardV3('Mara');c.data.first_mes='First scene';c.data.alternate_greetings=['Library scene','Station scene'];return c}
function art(id,text,mediaId=id){return {id,sourceText:text,referenceMediaId:'portrait',mediaId,url:'/user/files/'+id+'.png'}}
function fixture(){let p=createProject('Openings'),c=newCharacter('Mara',card());c.avatarMediaId='portrait';c.card=setOpeningEntry(c.card,'first',art('open_first','First scene'));c.card=setOpeningEntry(c.card,'alt:0',art('open_library','Library scene'));c.card=setOpeningEntry(c.card,'alt:1',art('open_station','Station scene'));p=upsertArtifact(p,'characters',c);p.media=[{id:'open_first',kind:'image',url:'/user/files/open_first.png'},{id:'open_library',kind:'image',url:'/user/files/open_library.png'},{id:'open_station',kind:'image',url:'/user/files/open_station.png'}];return {p,c}}
test('first and each alternate have separate managed illustration slots; ordinary text stays clean',()=>{
 const {c}=fixture();assert.deepEqual(openingSlots(c.card).map(s=>s.key),['first','alt:0','alt:1']);assert.equal(Object.keys(openingEntries(c.card)).length,3);assert.equal(c.card.data.first_mes,'First scene');assert.equal(openingStale(c,'first'),false);
});
test('native card rendering is idempotent and import normalization restores clean editable text',()=>{
 const {c}=fixture();const rendered=decorateOpeningCard(c.card);
 assert.match(rendered.data.first_mes,/!\[Opening illustration\].*open_first.png/);assert.match(rendered.data.alternate_greetings[1],/open_station.png/);
 assert.equal(decorateOpeningCard(rendered).data.first_mes,rendered.data.first_mes);assert.equal(normalizeOpeningCard(rendered).data.first_mes,'First scene');
 const removed=setOpeningEntry(normalizeOpeningCard(rendered),'first',null);assert.equal(decorateOpeningCard(removed).data.first_mes,'First scene');
});
test('manual images and unrelated extension fields survive managed rendering and removal',()=>{
 let c=card();c.data.first_mes+='\n![My own image](/user/files/manual.png)';c.data.extensions.third_party={keep:true};c=setOpeningEntry(c,'first',art('open_one',c.data.first_mes));
 const normalized=normalizeOpeningCard(decorateOpeningCard(c));assert.match(normalized.data.first_mes,/manual.png/);assert.deepEqual(normalized.data.extensions.third_party,{keep:true});
});
test('alternate images follow exact texts on reorder/deletion/insertion; in-place edits retain stale art',()=>{
 const {p,c}=fixture();let next=editArtifactField(p,'characters',c.id,'card.data.alternate_greetings',['Station scene','Library scene']);
 assert.equal(openingEntries(next.characters[0].card)['alt:0'].id,'open_station');
 next=editArtifactField(next,'characters',c.id,'card.data.alternate_greetings',['New scene','Station scene','Library scene']);
 assert.equal(openingEntries(next.characters[0].card)['alt:0'],undefined);assert.equal(openingEntries(next.characters[0].card)['alt:1'].id,'open_station');
 next=editArtifactField(next,'characters',c.id,'card.data.alternate_greetings',['New scene','Station scene edited','Library scene']);assert.equal(openingStale(next.characters[0],'alt:1'),true);
 next=editArtifactField(next,'characters',c.id,'card.data.alternate_greetings',['Library scene']);assert.equal(openingEntries(next.characters[0].card)['alt:0'].id,'open_library');assert.equal(Object.keys(openingEntries(next.characters[0].card)).length,2);
});
test('managed rendering preserves authored trailing newlines and is idempotent',()=>{
 for(const suffix of ['', '\n', '\n\n', '\n\n\n']){let c=card();c.data.first_mes='Hello'+suffix;c.data.alternate_greetings=['Alt'+suffix];c=setOpeningEntry(c,'first',art('first_ws',c.data.first_mes));c=setOpeningEntry(c,'alt:0',art('alt_ws',c.data.alternate_greetings[0]));const rendered=decorateOpeningCard(c);assert.deepEqual(normalizeOpeningCard(rendered),c);assert.deepEqual(decorateOpeningCard(rendered),rendered)}
});
test('editing an alternate to another existing greeting text does not steal that row’s illustration',()=>{
 const {p,c}=fixture();const n=editArtifactField(p,'characters',c.id,'card.data.alternate_greetings',['Station scene','Station scene']);
 assert.equal(openingEntries(n.characters[0].card)['alt:0'].id,'open_library');assert.equal(openingEntries(n.characters[0].card)['alt:1'].id,'open_station');assert.equal(openingStale(n.characters[0],'alt:0'),true);
});
test('explicit identical-text row moves/deletions preserve the correct stable image identities',()=>{
 const {p,c}=fixture();let n=editArtifactField(p,'characters',c.id,'card.data.alternate_greetings',['Station scene','Station scene']);
 n=editArtifactField(n,'characters',c.id,'card',reorderOpeningAlternates(n.characters[0].card,[1,0]));assert.equal(openingEntries(n.characters[0].card)['alt:0'].id,'open_station');
 n=editArtifactField(n,'characters',c.id,'card',reorderOpeningAlternates(n.characters[0].card,[1]));assert.equal(openingEntries(n.characters[0].card)['alt:0'].id,'open_library');assert.equal(openingEntries(n.characters[0].card)['alt:1'],undefined);
});
test('portrait changes and opening text edits flag saved illustrations stale without generating anything',()=>{
 const {p,c}=fixture();const next=editArtifactField(p,'characters',c.id,'card.data.first_mes','Rewritten first scene');assert.equal(openingStale(next.characters[0],'first'),true);assert.equal(openingStale({...c,avatarMediaId:'another'},'alt:0'),true);
});
test('cardForSt decorates greetings without mutating the project and missing media fails closed',()=>{
 const {p,c}=fixture();const out=cardForSt(p,c);assert.match(out.data.first_mes,/open_first.png/);assert.equal(c.card.data.first_mes,'First scene');
 const broken={...p,media:[]};assert.throws(()=>cardForSt(broken,c),/missing.*illustration|illustration.*missing/i);
});
test('opening media is tracked and deleting it removes its managed reference, not greeting text',()=>{
 const {p,c}=fixture();assert.ok(mediaUsage(p,'open_library').some(u=>u.how==='opening'));const n=removeMedia(p,'open_library');assert.equal(openingEntries(n.characters[0].card)['alt:0'],undefined);assert.equal(n.characters[0].card.data.alternate_greetings[0],'Library scene');
});
test('unsafe managed URLs are rejected and unrelated Markdown is never interpreted as a managed asset',()=>{
 for(const url of ['https://evil.invalid/a.png','javascript:alert(1)','/user/files/../private','/user/files/a.png)\nmalicious']){
  const c=setOpeningEntry(card(),'first',{...art('open_bad','First scene'),url});assert.throws(()=>decorateOpeningCard(c),/unsafe|invalid/i);
 }
});
