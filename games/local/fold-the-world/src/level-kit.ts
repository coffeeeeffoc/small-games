import type { Entity, Crease, Fold } from './geometry';

export const p = (id: string, x: number, y: number, w: number, h = 20): Entity => ({id,x,y,w,h,kind:'platform'});
export const exit = (x: number, y: number): Entity => ({id:'exit',x,y,w:26,h:38,kind:'exit'});
export const right = (x = 600, id = 'A'): Crease => ({id,x,directions:['right-to-left']});
export const left = (x = 600, id = 'A'): Crease => ({id,x,directions:['left-to-right']});
export const key = (x: number, y: number, id = 'key'): Entity => ({id,x,y,w:16,h:22,kind:'key'});
export const spike = (x: number, y: number, w = 24): Entity => ({id:'spikes',x,y,w,h:18,kind:'spike'});
export interface Phase { clue: string; action: string; route: string; point: {x:number;y:number}; keys: string[] }
export interface Plan { operations: (Fold|null)[]; phases: Phase[] }
export const step = (clue:string,action:string,route:string,x:number,y:number,...keys:string[]):Phase => ({clue,action,route,point:{x,y},keys});
