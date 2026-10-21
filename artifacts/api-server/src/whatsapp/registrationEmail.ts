const personalDomains=new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.co.in','hotmail.com','outlook.com','live.com','icloud.com','aol.com','proton.me','protonmail.com','mail.com','yandex.com','gmx.com','rediffmail.com']);
export function businessEmail(email:string){return !personalDomains.has(email.toLowerCase().split('@')[1]);}
