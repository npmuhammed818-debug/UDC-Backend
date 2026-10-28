import { parseMultiDocumentType } from "./uploadLink.ts";

const LABELS: Record<string, string> = {
  passport: "passport", national_id: "national ID", bank_statement: "bank statement",
  company_registration: "company registration or trade licence", business_license: "business licence",
  tax_certificate: "tax certificate", commercial_agreement: "commercial agreement", other: "document",
  tax_id: "tax ID", import_licence: "import licence", export_licence: "export licence or exporter ID",
  product_licence: "product licence", past_exports: "past export invoices or factory photos",
};
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const LOCK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const TICK_SVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7f37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1a7f37"/><path d="m8 12.5 2.7 2.7L16 9.5"/></svg>`;

const PAGE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#faf9f7;color:#111;min-height:100vh;display:flex;justify-content:center;padding:3.5rem 1.25rem 2rem}
  main{width:100%;max-width:22rem;text-align:center}
  .logo{width:3.25rem;height:3.25rem;margin:0 auto 1.5rem;background:#f0efec;border-radius:.9rem;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;letter-spacing:.02em;color:#111}
  h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:1.65rem;line-height:1.25;margin-bottom:.5rem}
  .sub{color:#6b6560;font-size:.95rem;margin-bottom:2rem}
  .field{display:block;text-align:left;background:#f5f3f1;border:1px solid #eceae6;border-radius:.8rem;padding:.9rem 1rem;margin-bottom:1rem;cursor:pointer}
  .field .lab{display:flex;align-items:center;gap:.5rem;color:#6b6560;font-size:.9rem}
  .field .name{margin-top:.35rem;font-size:.95rem;word-break:break-all}
  .field input{display:none}
  .field.done{border-color:#cfe3d4;background:#f4f9f5}
  .field .status{font-size:.85rem;margin-top:.35rem}
  .field .status.ok{color:#1a7f37}
  .field .status.err{color:#b3261e}
  button{width:100%;border:0;border-radius:.8rem;background:#111;color:#fff;font-size:1rem;padding:.95rem;cursor:pointer}
  button:disabled{opacity:.55;cursor:default}
  .note{display:flex;gap:.45rem;align-items:flex-start;justify-content:center;color:#8a8580;font-size:.8rem;line-height:1.45;margin-top:1.5rem;text-align:center}
  .note svg{flex:none;margin-top:.1rem}
  .tick{margin:1rem auto 1.25rem;display:flex;justify-content:center}
  .group{text-align:left;margin-bottom:.25rem}
  .group .doc{font-weight:600;font-size:.95rem;margin:0 0 .4rem .1rem}
`;

function pageShell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>UDC secure upload</title><style>${PAGE_CSS}</style></head><body><main><div class="logo">UDC</div><h1>${esc(title)}</h1>${inner}</main></body></html>`;
}

const PRIVACY_NOTE = `<p class="note">${LOCK_SVG}<span>Stored privately. Only UDC's verification team can open it. This link works once and expires 15 minutes after it was sent.</span></p>`;

export function uploadPageHtml(input: { state: "ready"; documentType: string } | { state: "closed" }) {
  if (input.state === "closed") {
    return pageShell("Link closed", `<p class="sub">This upload link has expired or was already used. Ask AKIF on WhatsApp for a new one.</p>`);
  }
  const multiKeys = parseMultiDocumentType(input.documentType);
  if (multiKeys) {
    const fields = multiKeys.map((k) => `
  <div class="group"><p class="doc">${esc(cap(LABELS[k] ?? "document"))}</p>
  <label class="field" data-field="${esc(k)}"><input type="file" accept="application/pdf,image/png,image/jpeg" data-doc="${esc(k)}">
    <span class="lab">${LOCK_SVG}<span>Choose file</span></span><span class="name"></span><span class="status" data-msg="${esc(k)}"></span>
  </label></div>`).join("");
    return pageShell("Your documents", `<p class="sub">PDF, PNG or JPG, up to 8 MB each. Upload them one by one below.</p>${fields}${PRIVACY_NOTE}
<script>
document.querySelectorAll('input[type=file]').forEach((inp)=>{inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
const field=inp.closest('.field'),m=field.querySelector('.status');
field.querySelector('.name').textContent=f.name;
m.className='status';m.textContent='Uploading...';
try{const r=await fetch(location.pathname+'?doc='+encodeURIComponent(inp.dataset.doc),{method:'POST',headers:{'content-type':f.type||'application/octet-stream'},body:f,credentials:'omit'});
if(r.status===201||r.status===409){m.className='status ok';m.textContent='Received.';field.classList.add('done');inp.disabled=true;}
else{m.className='status err';m.textContent=r.status===415?'Only PDF, PNG or JPG files are accepted.':r.status===410?'This link has expired. Ask AKIF for a new one.':'Upload failed. Please try again.';}
}catch(e){m.className='status err';m.textContent='Upload failed. Please try again.';}};});
</script>`);
  }
  const label = esc(cap(LABELS[input.documentType] ?? "document"));
  return pageShell(label, `<p class="sub">PDF, PNG or JPG, up to 8 MB.</p>
<form id="up"><label class="field" id="field"><input id="f" type="file" accept="application/pdf,image/png,image/jpeg">
  <span class="lab">${LOCK_SVG}<span>Choose file</span></span><span class="name" id="name"></span>
</label>
<button id="b" type="submit">Upload securely</button></form>
<p class="note" id="m" role="status"></p>
${PRIVACY_NOTE}
<script>
const f=document.getElementById('f'),nameEl=document.getElementById('name'),m=document.getElementById('m'),form=document.getElementById('up');
f.onchange=()=>{nameEl.textContent=f.files[0]?f.files[0].name:'';};
form.onsubmit=async(e)=>{e.preventDefault();const file=f.files[0];
if(!file){m.textContent='Choose a file first.';return;}
m.textContent='Uploading...';
try{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':file.type||'application/octet-stream'},body:file,credentials:'omit'});
if(r.status===201){document.querySelector('main').innerHTML='<div class="logo">UDC</div><div class="tick">${TICK_SVG}</div><h1>Received</h1><p class="sub">UDC will review it and update your status. You can close this page.</p>';}
else m.textContent=r.status===415?'Only PDF, PNG or JPG files are accepted.':r.status===410?'This link has expired or was already used. Ask AKIF for a new one.':'Upload failed. Please try again.';
}catch(err){m.textContent='Upload failed. Please try again.';}};
</script>`);
}
