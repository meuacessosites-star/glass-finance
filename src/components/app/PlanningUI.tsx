import type { ReactNode } from 'react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import './planning.css';
export function ConfirmAction({title,description,onConfirm,onCancel,action='Confirmar'}:{title:string;description:string;onConfirm:()=>void;onCancel:()=>void;action?:string}) {return <Dialog open onOpenChange={v=>{if(!v)onCancel()}}><DialogContent className="planning-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="planning-actions"><button onClick={onCancel}>Cancelar</button><button className="planning-primary" onClick={onConfirm}>{action}</button></div></DialogContent></Dialog>}
export function PlanningMetric({label,value,tone='blue'}:{label:string;value:ReactNode;tone?:string}){return <div className={`planning-metric planning-${tone}`}><span>{label}</span><strong>{value}</strong></div>}
