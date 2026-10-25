/** Accessible foreground for any chosen sRGB background. */
export function avatarInk(color:string):string {
 const valid=/^#[0-9a-f]{6}$/i.test(color)?color:'#2F6BFF';
 const channels=[1,3,5].map(i=>parseInt(valid.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#FFFFFF';
}
