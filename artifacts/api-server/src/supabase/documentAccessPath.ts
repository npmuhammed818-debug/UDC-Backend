// Pure deal/company ownership proof for private object references.
// A document database grant does not authorize signing a path that belongs
// to some OTHER deal/company, even when the DB principal bypasses RLS.
const prefix="storage://udc-documents/";
const segment=/^[A-Za-z0-9._-]{1,180}$/;
function managedPath(value:unknown,namespace:"deals"|"companies",ownerId:string){
  if(typeof value!=="string"||typeof ownerId!=="string"||
      !ownerId||!segment.test(ownerId)||!value.startsWith(prefix))return null;
  const path=value.slice(prefix.length);
  if(path.includes("%")||path.includes("?")||path.includes("#")||
     path.includes("\\")||path.includes("//"))return null;
  const parts=path.split("/");
  if(parts.length<3||parts[0]!==namespace||parts[1]!==ownerId ||
     parts.slice(2).some(part=>!segment.test(part)||part==="."||part===".."))return null;
  return path;
}
export function managedDealDocumentPath(value:unknown,dealId:string){
  return managedPath(value,"deals",dealId);
}
export function managedCompanyDocumentPath(value:unknown,companyId:string){
  return managedPath(value,"companies",companyId);
}
