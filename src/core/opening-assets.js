// Portable opening images for ST 1.19's native CHARX misc-asset extraction.
import {openingEntries,normalizeOpeningCard,setOpeningEntry,decorateOpeningCard} from './opening-illustrations.js';
import {extractChunks} from './png.js';
import {sha256Hex} from './sha256.js';
export const MAX_OPENING_IMAGE_BYTES=32*1024*1024;
export const isOpeningAssetPath=path=>/^assets\/openings\/cs_opening_[a-f0-9]{64}\.png$/.test(path);
export function validateOpeningPng(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_OPENING_IMAGE_BYTES)throw new Error('Opening image is missing or exceeds the image size limit.');
 const chunks=extractChunks(bytes),header=chunks.find(c=>c.name==='IHDR');
 if(!header||header.data.length!==13||!chunks.some(c=>c.name==='IDAT')||!chunks.some(c=>c.name==='IEND')||chunks.some(c=>!c.crcOk))throw new Error('Opening image is not a valid PNG.');
 const view=new DataView(header.data.buffer,header.data.byteOffset,header.data.byteLength),w=view.getUint32(0),h=view.getUint32(4);
 if(!w||!h||w*h>64*1024*1024)throw new Error('Opening image dimensions exceed the image limit.');return bytes;
}
export function nativeOpeningFolder(folder){
 if(typeof folder!=='string'||!folder||folder==='.'||folder==='..'||/[\\/\x00-\x1f]/.test(folder))throw new Error('A valid native-sanitized character folder is required for illustrated CHARX export.');
 return encodeURIComponent(folder).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
}
export function withOpeningAssets(card,images,folder,{referenceMediaId,existingFiles={}}={}){
 const entries=openingEntries(card);if(!Object.keys(entries).length)return {card,files:{}};
 const encoded=nativeOpeningFolder(folder),files={},assets=new Map(),ids=new Set();let c=normalizeOpeningCard(card);
 for(const [key,e] of Object.entries(entries)){
  if(ids.has(e.id))throw new Error('Duplicate opening illustration identity.');ids.add(e.id);
  const bytes=validateOpeningPng(images?.[e.id]??(e.assetPath?existingFiles[e.assetPath]:null));
  const hash=sha256Hex(bytes),name=`cs_opening_${hash}`,path=`assets/openings/${name}.png`;
  if(existingFiles[path]&&sha256Hex(existingFiles[path])!==hash)throw new Error('Opening asset filename collision.');
  files[path]=bytes;assets.set(name,{type:'other',name,uri:`embeded://${path}`,ext:'png'});
  const {mediaId,referenceMediaId:sourceReference,...portable}=e;
  c=setOpeningEntry(c,key,{...portable,url:`/user/images/${encoded}/${name}.png`,assetPath:path,assetName:name,contentHash:hash,
   staleReference:!!e.staleReference||(referenceMediaId!==undefined&&!!sourceReference&&sourceReference!==referenceMediaId)});
 }
 const oldNames=new Set(Object.values(entries).map(e=>e.assetName).filter(Boolean));
 c.data.assets=[...(c.data.assets??[]).filter(a=>!oldNames.has(a.name)&&!assets.has(a.name)),...assets.values()];
 return {card:decorateOpeningCard(c),files};
}
