/// <reference lib="es2022.intl" />
/** Accessible foreground for any chosen sRGB background. */
export function avatarInk(color:string):string {
 const valid=/^#[0-9a-f]{6}$/i.test(color)?color:'#2F6BFF';
 const channels=[1,3,5].map(i=>parseInt(valid.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#FFFFFF';
}

/** Keep accented letters intact and prevent custom initials from overflowing. */
export function customAvatarLetters(value:string):string {
 return Array.from(value.normalize('NFC').replace(/[^\p{L}\p{N}]/gu,'').toLocaleUpperCase('pt-BR')).slice(0,3).join('');
}
export function personAvatarLetters(name:string,custom?:string):string {
 return customAvatarLetters(custom??'') || name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(n=>Array.from(n)[0]).join('').toLocaleUpperCase('pt-BR') || 'NP';
}
/** One visible emoji, including a joined family, flag, or skin-tone sequence. */
export function firstAvatarEmoji(value:string):string {
 if(typeof Intl.Segmenter!=='function')return Array.from(value.trim())[0]??'';
 return Array.from(new Intl.Segmenter('pt-BR',{granularity:'grapheme'}).segment(value.trim()))[0]?.segment ?? '';
}
