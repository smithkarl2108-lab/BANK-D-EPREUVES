/* Tableau de bord et gestion des inspecteurs — accès administrateur principal uniquement. */
"use strict";
(async()=>{
const panel=document.getElementById("adminDashboard");if(!panel)return;
const config=window.BANK_SUPABASE_CONFIG,lib=window.supabase;if(!config||!lib?.createClient)return;
const db=lib.createClient(config.url,config.publishableKey),endpoint=config.url+"/functions/v1/account";
const {data:{session}}=await db.auth.getSession();if(!session)return;
const {data:profile}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).single();
if(profile?.role!=="admin"||!profile.is_active)return;
panel.hidden=false;
const msg=document.getElementById("adminDashboardMessage"),kpis=document.getElementById("adminKpis"),list=document.getElementById("inspectorList");
const say=(text,type="info")=>{msg.textContent=text;msg.className="auth-message "+type;msg.hidden=false;};
const rights={review_documents:"Examiner / valider les épreuves",manage_users:"Gérer les utilisateurs",reset_passwords:"Traiter les réinitialisations",view_activity:"Consulter le journal d'activité",manage_catalog:"Gérer classes et matières"};
async function api(body){const {data:{session:s}}=await db.auth.getSession();const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.publishableKey,Authorization:"Bearer "+s.access_token},body:JSON.stringify(body)});const result=await res.json().catch(()=>({}));if(!res.ok)throw Error(result.error||"Une erreur est survenue.");return result;}
function kpi(value,label){const el=document.createElement("div");el.className="admin-kpi";const n=document.createElement("strong");n.textContent=String(value??0);const t=document.createElement("span");t.textContent=label;el.append(n,t);return el;}
async function refresh(){
const [users,docs,pend,pubs,inspectors]=await Promise.all([
db.from("profiles").select("id",{count:"exact",head:true}),
db.from("documents").select("id",{count:"exact",head:true}),
db.from("documents").select("id",{count:"exact",head:true}).eq("status","pending"),
db.from("documents").select("id",{count:"exact",head:true}).eq("status","published"),
db.from("profiles").select("id",{count:"exact",head:true}).eq("role","inspector")
]);
kpis.replaceChildren(kpi(users.count,"Comptes utilisateurs"),kpi(inspectors.count,"Inspecteurs"),kpi(docs.count,"Épreuves"),kpi(pend.count,"À valider"),kpi(pubs.count,"Publiées"));
await loadInspectors();
}
async function loadInspectors(){
list.textContent="Chargement des inspecteurs…";
try{
const {users}=await api({action:"admin-users-list"}),inspectors=(users||[]).filter(u=>u.role==="inspector");
if(!inspectors.length){list.textContent="Aucun inspecteur nommé pour le moment.";return;}
const {data:grants,error}=await db.from("inspector_permissions").select("user_id,permission").in("user_id",inspectors.map(x=>x.id));if(error)throw error;
list.replaceChildren();
inspectors.forEach(user=>{
const card=document.createElement("article");card.className="inspector-card";
const head=document.createElement("div");head.className="inspector-card-head";
const title=document.createElement("strong");title.textContent=user.display_name||user.username;
const detail=document.createElement("p");detail.textContent="@"+(user.username||"identifiant")+" · "+(user.phone_number||"sans téléphone")+" · "+(user.is_active?"Compte actif":"Compte désactivé");head.append(title,detail);
const field=document.createElement("fieldset");field.className="admin-rights inspector-edit-rights";const legend=document.createElement("legend");legend.textContent="Droits actuels — modifier puis enregistrer";field.append(legend);
const assigned=(grants||[]).filter(x=>x.user_id===user.id).map(x=>x.permission);
Object.entries(rights).forEach(([value,label])=>{const l=document.createElement("label"),cb=document.createElement("input");cb.type="checkbox";cb.value=value;cb.checked=assigned.includes(value);l.append(cb,document.createTextNode(label));field.append(l);});
const save=document.createElement("button");save.type="button";save.className="auth-submit";save.textContent="Enregistrer les droits";
save.onclick=async()=>{save.disabled=true;try{const permissions=Array.from(field.querySelectorAll("input:checked")).map(x=>x.value);await api({action:"admin-inspector-rights",userId:user.id,permissions});say("Droits actualisés pour "+(user.display_name||user.username),"success");await loadInspectors();}catch(e){say(e.message,"error");save.disabled=false;}};
card.append(head,field,save);list.append(card);
});
}catch(e){list.textContent="Chargement impossible : "+e.message;}
}
document.getElementById("adminRefresh")?.addEventListener("click",refresh);
document.getElementById("inspectorCreateForm")?.addEventListener("submit",async event=>{
event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
try{const permissions=Array.from(form.querySelectorAll('input[name="permissions"]:checked')).map(x=>x.value);const fd=new FormData(form);await api({action:"admin-create-inspector",username:fd.get("username"),fullName:fd.get("fullName"),phoneNumber:fd.get("phoneNumber"),password:fd.get("password"),permissions});form.reset();say("Inspecteur créé avec succès. Transmets son identifiant et son mot de passe provisoire de manière sécurisée.","success");await refresh();}catch(e){say(e.message,"error");}finally{button.disabled=false;}
});
await refresh();
})();
