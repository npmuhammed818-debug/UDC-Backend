import {getDocument,GlobalWorkerOptions} from './pdf.mjs';
GlobalWorkerOptions.workerSrc='/document-review/pdf.worker.mjs';
const root=document.querySelector('[data-pdf-source]');
if(root){
 const canvas=root.querySelector('canvas'),status=root.querySelector('[role=status]'),prev=root.querySelector('[data-prev]'),next=root.querySelector('[data-next]'),stage=root.querySelector('.pdf-stage');
 let pdf,pageNumber=1,task,busy=false,pending=false;
 async function render(){
  if(!pdf)return;if(busy){pending=true;return;}busy=true;prev.disabled=next.disabled=true;
  try{
   const page=await pdf.getPage(pageNumber),base=page.getViewport({scale:1});
   const width=Math.max(1,Math.floor(stage.getBoundingClientRect().width));
   const viewport=page.getViewport({scale:Math.min(width/base.width,2,5000/base.height)});
   const ratio=Math.min(window.devicePixelRatio||1,2);
   canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
   canvas.style.width='100%';canvas.style.height='auto';
   task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await task.promise;
   status.textContent=`Page ${pageNumber} of ${pdf.numPages}`;canvas.setAttribute('aria-label',status.textContent+'. Use the original PDF link for selectable text.');
   const content=await page.getTextContent();
   const plain=root.querySelector('.pdf-text pre');if(plain)plain.textContent=content.items.map(item=>item.str||'').join(' ').slice(0,200000);
   root.dataset.rendered='true';page.cleanup();
  }catch{status.textContent='Preview unavailable. Open the original PDF below.';root.dataset.rendered='error';}
  finally{busy=false;prev.disabled=pageNumber<=1;next.disabled=pageNumber>=pdf.numPages;if(pending){pending=false;render();}}
 }
 prev.addEventListener('click',()=>{if(!busy&&pageNumber>1){pageNumber--;render();}});
 next.addEventListener('click',()=>{if(!busy&&pdf&&pageNumber<pdf.numPages){pageNumber++;render();}});
 new ResizeObserver(()=>{render();}).observe(stage);
 try{
  // No PDF JavaScript, annotations, links or external document URLs executed.
  // Render only canvas pixels; authenticated same-origin content URL only.
  const source=new URL(root.dataset.pdfSource,location.origin);
  if(source.origin!==location.origin)throw Error('source');
  pdf=await getDocument({url:source.href,withCredentials:true,isEvalSupported:false,enableXfa:false,disableAutoFetch:true,disableStream:true,maxImageSize:16_000_000,canvasMaxAreaInBytes:32_000_000}).promise;
  await render();
 }catch{status.textContent='Preview unavailable. Open the original PDF below.';root.dataset.rendered='error';}
}
