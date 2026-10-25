const LABELS: Record<string, string> = {
  passport: "passport", national_id: "national ID", bank_statement: "bank statement",
  company_registration: "company registration", business_license: "business licence",
  tax_certificate: "tax certificate", commercial_agreement: "commercial agreement", other: "document",
};
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function uploadPageHtml(input: { state: "ready"; documentType: string } | { state: "closed" }) {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>UDC secure upload</title><style>body{font-family:system-ui,sans-serif;max-width:30rem;margin:2rem auto;padding:0 1rem;color:#111}button{padding:.7rem 1.2rem;font-size:1rem}.note{color:#555;font-size:.9rem}</style></head><body><h1>UDC secure upload</h1>`;
  if (input.state === "closed") {
    return `${head}<p>This upload link has expired or was already used. Ask AKIF on WhatsApp for a new one.</p></body></html>`;
  }
  const label = esc(LABELS[input.documentType] ?? "document");
  return `${head}<p>Upload your <strong>${label}</strong> (PDF, PNG or JPG, up to 8 MB).</p>
<input id="f" type="file" accept="application/pdf,image/png,image/jpeg"> <button id="b">Upload securely</button>
<p id="m" role="status"></p>
<p class="note">Encrypted in transit and stored privately. Only UDC's verification team can open it. This link works once and expires 15 minutes after it was sent.</p>
<script>
document.getElementById('b').onclick=async()=>{const m=document.getElementById('m'),f=document.getElementById('f').files[0];
if(!f){m.textContent='Choose a file first.';return;}
m.textContent='Uploading...';
try{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':f.type||'application/octet-stream'},body:f,credentials:'omit'});
m.textContent=r.status===201?'Received. UDC will review it and update your status. You can close this page.':r.status===415?'Only PDF, PNG or JPG files are accepted.':r.status===410?'This link has expired or was already used. Ask AKIF for a new one.':'Upload failed. Please try again.';
}catch(e){m.textContent='Upload failed. Please try again.';}};
</script></body></html>`;
}
