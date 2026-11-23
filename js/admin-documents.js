/* Validation des épreuves par administrateur ou utilisateur délégué. */
"use strict";
(async()=>{
const panel=document.getElementById("adminDocumentsPanel");if(!panel)return;
const cfg=window.BANK_SUPABASE_CONFIG,lib=window.supabase;if(!cfg||!lib?.createClient)return;
const db=lib.createClient(cfg.url,cfg.publishableKey),endpoint=cfg.url+"/functions/v1/account";
const {data:{session}}=await db.auth.getSession();if(!session)return;
const {data:profile}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).single();if(!profile?.is_active)return;
let allowed=profile.role==="admin";
if(!allowed){const {data:p}=await db.from("user_permissions").select("permission").eq("user_id",session.user.id).eq("permission","review_documents").maybeSingle();allowed=!!p;}
if(!allowed)return;panel.hidden=false;
const list=document.getElementById("pendingDocuments"),stats=document.getElementById("adminDocumentStats");
async function api(action,extra={}){const {data:{session:s}}=await db.auth.getSession();const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.publishableKey,Authorization:"Bearer "+s.access_token},body:JSON.stringify({action,...extra})});const out=await res.json().catch(()=>({}));if(!res.ok)throw Error(out.error||"Action impossible.");return out;}
function stat(value,label){const el=document.createElement("div");el.className="admin-stat";const n=document.createElement("strong");n.textContent=String(value??0);const t=document.createElement("span");t.textContent=label;el.append(n,t);return el;}
async function load(){
list.textContent="Chargement des épreuves en attente…";
try{
const {documents=[]}=await api("admin-pending-documents");
stats.replaceChildren(stat(documents.length,"En attente de décision"));
if(!documents.length){list.textContent="Aucune épreuve en attente.";return;}
list.replaceChildren();
documents.forEach(doc=>{
const card=document.createElement("article");card.className="pending-document";
const title=document.createElement("h3");title.textContent=doc.title||"Épreuve sans titre";
const type=({sujet:"Sujet",corrige:"Corrigé",cours:"Cours",autre:"Autre"})[doc.document_type]||"Document";
const classes=[doc.class_offerings?.display_name||doc.school_classes?.name,doc.series?.name].filter(Boolean).join(" · ");
const meta=document.createElement("p");meta.textContent=[type,classes,doc.subjects?.name,doc.exam_year,doc.sequence_number?"Séquence "+doc.sequence_number:""].filter(Boolean).join(" · ");
const desc=document.createElement("p");desc.textContent=doc.description||"Aucune description.";
const fileline=document.createElement("p");
if(doc.fileUrl){const a=document.createElement("a");a.href=doc.fileUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Ouvrir fichier : "+(doc.document_files?.[0]?.original_name||"consulter");fileline.append(a);}else fileline.textContent="Fichier manquant ou indisponible.";
const actions=document.createElement("div");actions.className="pending-document-actions";
for(const [decision,label] of [["publish","Publier"],["reject","Refuser"]]){const b=document.createElement("button");b.type="button";b.className=decision==="publish"?"document-approve":"document-reject";b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await api("admin-review-document",{documentId:doc.id,decision});await load();}catch(e){b.disabled=false;alert(e.message);}};actions.append(b);}
card.append(title,meta,desc,fileline,actions);list.append(card);
});
}catch(e){list.textContent="Erreur de chargement : "+e.message;}
}
await load();
})();
