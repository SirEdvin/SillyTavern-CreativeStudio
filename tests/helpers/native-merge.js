// Native ST 1.19 fixtures: src/util.js deepMerge + endpoints/characters.js sentinel cleanup.
// https://github.com/SillyTavern/SillyTavern/tree/1.19.0/src
const object=item=>item&&typeof item==='object'&&!Array.isArray(item);
export function nativeMerge(target,source){
 let output=Object.assign({},target);
 if(object(target)&&object(source))for(const key of Object.keys(source)){
  if(object(source[key])){
   if(!(key in target))Object.assign(output,{[key]:source[key]});else output[key]=nativeMerge(target[key],source[key]);
  }else Object.assign(output,{[key]:source[key]});
 }
 return output;
}
export function nativeMergeUpdate(target,source){
 const merged=nativeMerge(target,source);
 const unset=(into,from)=>{for(const key of Object.keys(from)){if(from[key]==='__@@UNSET@@__')delete into[key];else if(object(from[key])&&object(into[key]))unset(into[key],from[key])}};
 unset(merged,source);return merged;
}
