// Private payloads and service credentials must not leave over remote plain HTTP.
export function privateServiceUrlAllowed(raw:string):boolean{
 try{const url=new URL(raw);return !url.username&&!url.password&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname)));}catch{return false;}
}
export function requirePrivateServiceUrl(raw:string):string{
 if(!privateServiceUrlAllowed(raw))throw new Error('secure_service_url_required');return raw.replace(/\/$/,'');
}
