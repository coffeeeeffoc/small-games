// Native audio is optional. Scene physics and traffic continue without Web Audio.
let sdk:any,active=false,enabled=false,step=0;
const sounds=new Map<string,any>();
export function installAudio(value:any){sdk=value;}
export function setAudio(on:boolean){enabled=on;for(const sound of sounds.values())sound.volume=on&&active?0.12:0;}
export function audioActivity(on:boolean){active=on;for(const sound of sounds.values())sound.volume=enabled&&on?0.12:0;}
function play(name:string,loop=false){if(!enabled||!active||typeof sdk?.createInnerAudioContext!=='function')return;let sound=sounds.get(name);if(!sound){sound=sdk.createInnerAudioContext();sound.src='assets/audio/'+name+'.wav';sound.loop=loop;sounds.set(name,sound);}sound.volume=.12;sound.play();}
export function footstep(speed:number){const now=Date.now();if(now-step<(speed>3?290:480))return;step=now;play('step');}
export function spatialAudio(_position:readonly number[],_yaw:number,_boats:any,_cars:any){play('wind',true);}
export function chime(){play('chime');}
export function lifeSound(kind:'drink'|'pigeon'|'visitor'){play(kind);}
export function disposeAudio(){for(const sound of sounds.values())sound.destroy?.();sounds.clear();sdk=null;}
