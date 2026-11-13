// Browser I/O for illustrated card export/import; paths are allowlisted and credentials never leave this origin.
import {openingEntries,normalizeOpeningCard,setOpeningEntry,safeOpeningImageUrl} from '../core/opening-illustrations.js';
import {validateOpeningPng,MAX_OPENING_IMAGE_BYTES,isOpeningAssetPath,nativeOpeningFolder} from '../core/opening-assets.js';
import {sha256Hex} from '../core/sha256.js';
import {stPost} from '../st/env.js';
import {saveMedia,toPngBytes} from './media.js';
export async function collectOpeningExport(env,project,ch,{sanitize=async name=>(await stPost('/api/files/sanitize-filename',{fileName:name})).fileName,loadLocal=loadLocalOpeningImage}={}){
 const entries=openingEntries(ch.card),openingImages={};if(!Object.keys(entries).length)return {};
 for(const e of Object.values(entries)){
  const m=project.media.find(m=>m.id===e.mediaId&&m.kind==='image');
  if(e.missing||!m)throw new Error('Opening illustration image is missing. Replace/remove it or import the original CHARX before exporting.');
  if(m.size>MAX_OPENING_IMAGE_BYTES)throw new Error('Opening illustration exceeds the image size limit.');
  openingImages[e.id]=await decodeOpeningPng(await toPngBytes(await loadLocal(m.url)));
 }
 const openingFolder=await sanitize(ch.card.data.name);nativeOpeningFolder(openingFolder);
 return {openingImages,openingFolder,openingReferenceMediaId:ch.avatarMediaId};
}
export async function loadLocalOpeningImage(url,{fetcher=globalThis.fetch}={}){
 if(!safeOpeningImageUrl(url)||url.startsWith('embeded:'))throw new Error('Unsafe local opening image URL.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const r=await fetcher(url,{method:'GET',credentials:'same-origin',redirect:'error',signal:controller.signal});
  if(!r.ok)throw new Error('The opening image is unavailable on this server.');
  if(Number(r.headers.get('content-length'))>MAX_OPENING_IMAGE_BYTES)throw new Error('Opening image exceeds the image size limit.');
  if(!r.body?.getReader){const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>MAX_OPENING_IMAGE_BYTES)throw new Error('Opening image exceeds the image size limit.');return bytes}
  const reader=r.body.getReader(),parts=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_OPENING_IMAGE_BYTES)throw new Error('Opening image exceeds the image size limit.');parts.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
 }finally{clearTimeout(timer)}
}
/** Structural bounds are checked before invoking the browser's real raster decoder. */
export async function decodeOpeningPng(bytes){
 validateOpeningPng(bytes);let bitmap;
 try{bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>64*1024*1024)throw new Error('dimensions');}
 catch{throw new Error('Opening image PNG cannot be decoded.');}finally{bitmap?.close()}
 return bytes;
}
export async function verifyOpeningImages(card,{loadLocal=loadLocalOpeningImage}={}){
 const urls=new Set(Object.values(openingEntries(card)).map(e=>e.url));
 for(const url of urls)await decodeOpeningPng(await toPngBytes(await loadLocal(url)));
}
/** Rehydrate only our managed images. Other archive files retain the importer's existing preservation path. */
export async function hydrateOpeningMedia(art,imported,env,project,{guard=()=>{},loadLocal=loadLocalOpeningImage}={}){
 const entries=openingEntries(art.card),saves=[],notes=[];let card=normalizeOpeningCard(art.card);
 for(const [key,entry] of Object.entries(entries)){
  guard();let bytes;
  if(imported.format==='charx'){
   if(!isOpeningAssetPath(entry.assetPath))throw new Error('Invalid or missing managed opening asset path.');
   const asset=art.card.data.assets?.find(a=>a.type==='other'&&a.uri===`embeded://${entry.assetPath}`);
   if(!asset)throw new Error('Opening image has no declared CHARX asset.');
   bytes=imported.assetFiles?.[entry.assetPath];await decodeOpeningPng(bytes);
   if(entry.contentHash&&sha256Hex(bytes)!==entry.contentHash)throw new Error('Opening image content hash does not match the CHARX asset.');
  }else{
   try{bytes=await toPngBytes(await loadLocal(entry.url));await decodeOpeningPng(bytes)}catch(e){
    const {mediaId,referenceMediaId,...rest}=entry;card=setOpeningEntry(card,key,{...rest,missing:true});notes.push(`Opening illustration unavailable: ${e.message} Use the original CHARX, replace it or remove it.`);continue;
   }
  }
  guard();const saved=await saveMedia(env,project,bytes,{name:`${art.card.data.name} — opening illustration`,role:'opening',mime:'image/png'});guard();
  saves.push(saved);card=setOpeningEntry(card,key,{...entry,mediaId:saved.media.id,url:saved.media.url,referenceMediaId:art.avatarMediaId,missing:false});
  if(isOpeningAssetPath(entry.assetPath)){art.assetFiles??={};art.assetFiles[entry.assetPath]=saved.media.id}
  art.links.media=[...new Set([...(art.links.media??[]),saved.media.id])];
 }
 art.card=card;return {saves,notes};
}
