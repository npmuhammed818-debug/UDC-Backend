const input=(name:string,label:string,required=true,type='text')=>({type:'TextInput',name,label,required,'input-type':type});
const field=(name:string)=>'${form.'+name+'}';
const definition=(title:string,children:unknown[],names:string[])=>({version:'7.3',screens:[{id:'START',title,terminal:true,success:true,data:{},layout:{type:'SingleColumnLayout',children:[{type:'Form',name:'form',children:[...children,{type:'Footer',label:'Submit for review','on-click-action':{name:'complete',payload:Object.fromEntries(names.map(name=>[name,field(name)]))}}]}]}}]});

export const flowDefinitions={
  profile:{name:'UDC_Chat_Profile_v1',json:definition('UDC registration',[
    {type:'TextBody',text:'Use your company email and company details. UDC reviews every registration and supporting document.'},
    input('full_name','Your full name'),input('email','Company email',true,'email'),input('company_name','Company name'),input('country','Country'),input('registration_number','Registration number',false),
  ],['full_name','email','company_name','country','registration_number'])},
  buyer:{name:'UDC_Buyer_Requirement_v1',json:definition('Your requirement',[
    input('product','Product'),input('quantity','Quantity (MT)',true,'number'),input('specification','Grade / spec',false),input('destination','Destination port'),
    {type:'Dropdown',name:'incoterm',label:'Incoterm',required:true,'data-source':['CIF','CFR','FOB','EXW','FCA','DAP'].map(id=>({id,title:id}))},
    input('target_price','Target USD / MT',false,'number'),input('delivery_time','Delivery timing',false),
    {type:'TextBody',text:'Payment: DLC directly to seller, released after SGS at destination. Submission needs UDC review.'},
  ],['product','quantity','specification','destination','incoterm','target_price','delivery_time'])},
  seller:{name:'UDC_Seller_Offer_v1',json:definition('Your offer',[
    input('product','Product'),input('quantity','Quantity',true,'number'),input('unit','Unit / price basis (e.g. MT)',true),input('specification','Grade / spec',false),input('price','Price',true,'number'),input('currency','Currency code (e.g. USD)',true),input('origin','Origin country'),
    {type:'Dropdown',name:'incoterm',label:'Incoterm',required:true,'data-source':['CIF','CFR','FOB','EXW','FCA','DAP'].map(id=>({id,title:id}))},
    input('availability','Availability',false),
    {type:'TextBody',text:'Payment: DLC directly to seller, released after SGS at destination. Submission needs UDC review.'},
  ],['product','quantity','unit','specification','price','currency','origin','incoterm','availability'])},
  agent:{name:'UDC_Agent_Profile_v1',json:definition('Agent registration',[
    {type:'TextBody',text:'You may use a personal or business email. Agent access starts after UDC approval.'},
    input('full_name','Your full name'),input('email','Email',true,'email'),
  ],['full_name','email'])},
};
export type FlowKind=keyof typeof flowDefinitions;
