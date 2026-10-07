// Original Scene diagnostic hooks are optional and do not affect game rules.
export function registerSnapshot(_read:()=>Record<string,unknown>){return ()=>{};}
