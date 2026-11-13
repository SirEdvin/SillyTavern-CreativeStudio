import test from 'node:test';
import assert from 'node:assert/strict';
import {paint} from '../src/st/comfy.js';
import {setNanoSessionKey} from '../src/st/nanogpt.js';

const png=new Uint8Array([137,80,78,71,13,10,26,10]);
const metadata={id:'fixture-text-model',endpoints:[{capabilities:{image_generation:true,image_to_image:false},supported_parameters:{resolutions:['auto','768x1024']}}]};
function fixture(meta=metadata){
    const oldFetch=globalThis.fetch,oldST=globalThis.SillyTavern,calls=[];
    const ctx={extensionSettings:{creativeStudio:{image:{backend:'nanogpt',nanoModel:'fixture-text-model',nanoResolution:'auto'}}}};
    setNanoSessionKey('fixture-key-not-real',ctx);globalThis.SillyTavern={getContext:()=>({...ctx})};
    globalThis.fetch=async(url,options={})=>{
        calls.push({url,options});
        if(url.endsWith('/endpoints'))return Response.json(meta);
        if(url.endsWith('/images'))return Response.json({data:[{b64_json:btoa(String.fromCharCode(...png))}]});
        throw new Error('Unexpected fixture request');
    };
    return {ctx,calls,restore:()=>{globalThis.fetch=oldFetch;globalThis.SillyTavern=oldST}};
}
test('regular portrait painting uses NanoGPT without any reference and preserves requested style/exclusions/rating',async()=>{
    const f=fixture();try{
        const result=await paint({prompt:'An adult anime character with silver hair, portrait.',negative:'watermark, lettering',rating:'SFW',purpose:'avatar'});
        const request=f.calls.find(c=>c.url.endsWith('/images')),body=JSON.parse(request.options.body);
        assert.deepEqual(result.bytes,png);assert.equal(body.input_references,undefined);assert.equal(body.n,1);
        assert.match(body.prompt,/anime character/);assert.match(body.prompt,/watermark, lettering/);assert.match(body.prompt,/SFW/);
        assert.doesNotMatch(body.prompt,/first-person user POV|lowres, blurry, cartoon/);
        assert.equal(result.positive,body.prompt);assert.equal(result.seed,null);
        assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers['X-CSRF-Token'],undefined);
        assert.equal(f.calls.filter(c=>c.url.endsWith('/images')).length,1);
    }finally{f.restore()}
});
test('rating and exclusions alone cannot turn an empty positive prompt into a paid generation',async()=>{
    const f=fixture();try{
        await assert.rejects(paint({prompt:' ',negative:'watermark',rating:'SFW'}),/write.*prompt/i);assert.equal(f.calls.length,0);
    }finally{f.restore()}
});
test('a model explicitly disallowing text generation makes no paid portrait request',async()=>{
    const f=fixture({endpoints:[{capabilities:{image_generation:true,text_to_image:false,image_to_image:true}}]});try{
        await assert.rejects(paint({prompt:'A portrait.'}),/text.to.image|text generation/i);
        assert.equal(f.calls.filter(c=>c.url.endsWith('/images')).length,0);
    }finally{f.restore()}
});
