export type AdMode='preview'|'sdk'|'off';
export type AdResult={rewarded:boolean; reason?:string};
declare global { interface Window { bl?: { createRewardedVideoAd:(opts:{adUnitId:string})=>RewardedVideoAd } } }
type RewardedVideoAd={load:()=>Promise<void>;show:()=>Promise<void>;onClose:(cb:(r?:{isEnded?:boolean})=>void)=>void;onError:(cb:(e:unknown)=>void)=>void};
export async function playRewardedAd(mode:AdMode,adUnitId=''):Promise<AdResult>{
 if(mode==='off') return {rewarded:true,reason:'广告已关闭，直接发放预览奖励'};
 if(mode==='preview'){ await new Promise(r=>setTimeout(r,900)); return {rewarded:true,reason:'预览广告播放完成'}; }
 if(!window.bl?.createRewardedVideoAd||!adUnitId) return {rewarded:false,reason:'SDK 或广告位 ID 未配置'};
 return new Promise(resolve=>{ let done=false; const finish=(v:AdResult)=>{if(!done){done=true;resolve(v)}}; try{const ad=window.bl!.createRewardedVideoAd({adUnitId});ad.onClose(r=>finish({rewarded:r?.isEnded!==false,reason:r?.isEnded===false?'广告未完整观看':undefined}));ad.onError(()=>finish({rewarded:false,reason:'广告暂时不可用'}));ad.load().then(()=>ad.show()).catch(()=>finish({rewarded:false,reason:'广告加载失败'}));}catch{finish({rewarded:false,reason:'广告初始化失败'});} });
}
