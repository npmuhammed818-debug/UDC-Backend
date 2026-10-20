import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button } from './ui/button';

type Challenge = {code:string;browserToken:string;expiresAt:string};
export function WhatsAppSignin({linkAccount=false}:{linkAccount?:boolean}) {
  const [role,setRole]=useState('buyer');
  const [challenge,setChallenge]=useState<Challenge|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [consent,setConsent]=useState(false);
  async function start(){
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/auth/whatsapp-signin/request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,linkAccount})});
      if(!response.ok)throw new Error(response.status===429?'Too many requests. Please wait 15 minutes.':linkAccount?'Sign in with your email first, then try linking again.':'Sign-in is unavailable. Please try again shortly.');
      setChallenge(await response.json());
    } catch(error){setMessage(error instanceof Error?error.message:'Could not start sign-in.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    if(!challenge)return;
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      if(Date.now()>=new Date(challenge!.expiresAt).getTime()){if(!cancelled){setChallenge(null);setMessage('Request expired. Start again.');}return;}
      try {
        const response=await fetch('/api/auth/whatsapp-signin/poll',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({browserToken:challenge!.browserToken})});
        if(cancelled)return;
        if(response.ok){
          const result=await response.json();
          if(result.status==='approved'){window.location.assign('/profile');return;}
          if(result.status==='expired'){setChallenge(null);setMessage('Request expired or already used. Start again.');return;}
        }
      }catch{ /* A transient poll failure may recover within the same five-minute window. */ }
      if(!cancelled)timer=setTimeout(poll,3000);
    }
    timer=setTimeout(poll,3000);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[challenge]);
  return <div className="auth-page"><div className="auth-form-wrap"><section className="auth-card"><h1 className="text-2xl font-bold">{linkAccount?'Link your WhatsApp':'Sign in with WhatsApp'}</h1><p className="my-4 text-sm">Use the same WhatsApp number you use with UDC. New accounts stay pending until UDC reviews them. Existing accounts keep their role and status.</p>
    {!challenge?<><label className="block my-3">For a new account, I operate as<select className="select" value={role} onChange={e=>setRole(e.target.value)}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="agent">Agent</option></select></label><label className="consent-field"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I am at least 18, authorized to represent my business, and accept the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>.</span></label><Button disabled={busy||!consent} onClick={start}>{busy?'Starting…':'Create sign-in code'}</Button></>:<><p className="my-4">Send this exact message to the connected UDC WhatsApp number:</p><code className="block break-all rounded bg-muted p-4 select-all">LOGIN {challenge.code}</code><p className="my-4 text-sm">If UDC asks for consent, read it, reply AGREE, then send the LOGIN message again. Read the sign-in warning and send CONFIRM LOGIN with the same code only if you started this request. Keep this browser page open. The code expires in five minutes.</p><p role="status">Waiting for your WhatsApp confirmation…</p><Button variant="outline" onClick={()=>setChallenge(null)}>Cancel this browser request</Button></>}
    {message&&<p role="alert" className="my-4">{message}</p>}<p className="my-4 text-sm">Email accounts use their existing password. You can link WhatsApp from your profile after signing in.</p><Link href="/login" className="text-link">Sign in with email</Link></section></div></div>;
}
