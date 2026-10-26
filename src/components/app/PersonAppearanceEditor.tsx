import { Check, ImagePlus, Smile, Type } from 'lucide-react';
import { InlineColorPicker } from './CategoryColorPicker';
import { PersonAvatar } from './PersonAvatar';
import { avatarInk, customAvatarLetters, firstAvatarEmoji, personAvatarLetters } from '@/lib/person-avatar';

const colors = ['#2F6BFF','#159B80','#AF52DE','#ED4A99','#FF9500','#EA3D38','#5856D6','#00A5BB','#795548','#65748B','#F5CC38','#1F2937'];
const emojis = ['🙂','😊','🌸','🌿','⭐','💙','🐱','🦊','👩','👨','👵','👴','👩🏽‍💼','👨🏽‍🔧','🏠','💼','🎓','🎮'];
export function PersonAppearanceEditor({name,type,onType,letters,onLetters,emoji,onEmoji,photo,color,onColor,hex,onHex,photoBusy,onPhoto}: {
 name:string;type:'letters'|'emoji'|'foto';onType:(v:'letters'|'emoji'|'foto')=>void;
 letters:string;onLetters:(v:string)=>void;emoji:string;onEmoji:(v:string)=>void;
 photo:string;color:string;onColor:(v:string)=>void;hex:string;onHex:(v:string)=>void;photoBusy:boolean;onPhoto:(f?:File)=>void;
}) {
 return <section aria-label="Aparência da pessoa" className="space-y-4">
  <div className="flex flex-col items-center gap-2">
   <PersonAvatar name={name} avatarType={type} avatarValue={type==='letters'?letters:type==='emoji'?emoji:photo} backgroundColor={color} size="lg" className="size-20 text-2xl shadow-md"/>
   <p className="text-xs text-glass-sub">Prévia do avatar</p>
  </div>
  <div role="group" aria-label="Tipo de avatar" className="grid grid-cols-3 gap-2">
   {([{value:'letters',label:'Letras',Icon:Type},{value:'emoji',label:'Emoji',Icon:Smile},{value:'foto',label:'Foto',Icon:ImagePlus}] as const).map(({value,label,Icon})=><button key={value} type="button" disabled={photoBusy} aria-pressed={type===value} onClick={()=>onType(value)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold ${type===value?'border-primary bg-primary text-white shadow-sm':'border-glass-ink/15 bg-glass-bg-soft text-glass-sub'}`}><Icon size={16}/>{label}</button>)}
  </div>
  {type==='letters'&&<label className="grid gap-1.5 text-sm font-semibold">Letras do avatar<input className="planning-search" aria-label="Letras do avatar" value={letters} onChange={e=>onLetters(customAvatarLetters(e.target.value))} placeholder={personAvatarLetters(name)}/><small className="text-xs font-normal text-glass-sub">Até 3 letras ou números. Deixe vazio para usar as iniciais do nome.</small></label>}
  {type==='emoji'&&<div className="space-y-2"><label className="grid gap-1.5 text-sm font-semibold">Emoji do avatar<input aria-label="Emoji do avatar" className="planning-search text-xl" value={emoji} onChange={e=>onEmoji(firstAvatarEmoji(e.target.value))} placeholder="Escolha abaixo ou use seu teclado"/></label><div className="grid grid-cols-6 gap-1">{emojis.map(e=><button key={e} type="button" aria-label={`Usar emoji ${e}`} aria-pressed={emoji===e} onClick={()=>onEmoji(e)} className={`flex min-h-11 items-center justify-center rounded-xl text-2xl ${emoji===e?'bg-primary/15 ring-2 ring-primary':'bg-glass-bg-soft'}`}>{e}</button>)}</div></div>}
  {type==='foto'&&<div className="space-y-2"><label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3 py-3 text-sm font-semibold text-primary"><ImagePlus size={18}/>{photoBusy?'Preparando foto…':photo?'Trocar foto':'Escolher foto'}<input aria-label="Escolher foto da pessoa" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photoBusy} onChange={e=>{onPhoto(e.target.files?.[0]);e.target.value=''}}/></label><p className="text-xs text-glass-sub">JPG, PNG ou WebP até 10 MB. A foto é reduzida e exibida em círculo.</p></div>}
  {type!=='foto'&&<div className="space-y-3"><p className="text-sm font-semibold">Cor de fundo</p><div className="grid grid-cols-6 gap-1">{colors.map(c=><button key={c} type="button" aria-label={`Cor de fundo ${c}`} aria-pressed={color.toUpperCase()===c} onClick={()=>onColor(c)} className="flex min-h-11 items-center justify-center rounded-lg"><span className="flex size-8 items-center justify-center rounded-full border border-black/10" style={{background:c,color:avatarInk(c)}}>{color.toUpperCase()===c&&<Check size={18} strokeWidth={3}/>}</span></button>)}</div><label className="grid gap-1.5 text-sm font-semibold">Código da cor (HEX)<input className="planning-search uppercase" aria-label="Código da cor (HEX)" value={hex} onChange={e=>onHex(e.target.value)} maxLength={7} placeholder="#2F6BFF" spellCheck={false} aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex)}/></label>{!/^#[0-9a-f]{6}$/i.test(hex)&&<p className="text-xs text-glass-sub">Use # e 6 caracteres de 0 a 9 ou A a F. Exemplo: #0284C7.</p>}<InlineColorPicker value={color} onChange={onColor}/></div>}
 </section>;
}
