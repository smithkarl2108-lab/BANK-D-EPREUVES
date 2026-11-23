/* Gestion des comptes déléguée aux inspecteurs autorisés. */
"use strict";
(async()=>{
const panel=document.getElementById("inspectorUsersPanel");if(!panel)return;
const cfg=window.BANK_SUPABASE_CONFIG,lib=window.supabase;if(!cfg||!lib?.createClient)return;
const db=lib.createClient(cfg.url,cfg.publishableKey),endpoint=cfg.url+"/functions/v1/account";
const {data:{session}}=await db.auth.getSession();if(!session)return;
const {data:profile}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).single();if(profile?.role!=="inspector"||!profile.is_active)return;
const {data:grant}=await db.from("inspector_permissions").select("permission").eq("user_id",session.user.id).eq("permission","manage_users").maybeSingle();if(!grant)return;
panel.hidden=false;const list=document.getElementById("inspectorManagedUsers");
async function call(action,extra={}){const {data:{session:s}}=await db.auth.getSession();const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.publishableKey,Authorization:"Bearer "+s.access_token},body:JSON.stringify({action,...extra})});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||"Action impossible.");return body;}
async function load(){list.textContent="Chargement…";try{const {users=[]}=await call("authorized-users-list");list.replaceChildren();users.forEach(user=>{const row=document.createElement("article");row.className="inspector-user-row";const info=document.createElement("div");const name=document.createElement("strong");name.textContent=user.display_name||user.username;const detail=document.createElement("p");detail.textContent="@"+user.username+" · "+({student:"Élève",teacher:"Enseignant",inspector:"Inspecteur"}[user.role]||"Compte")+" · "+(user.is_active?"Actif":"Suspendu");info.append(name,detail);const btn=document.createElement("button");btn.type="button";btn.className="button button-ghost";btn.textContent=user.is_active?"Suspendre":"Réactiver";btn.onclick=async()=>{btn.disabled=true;try{await call("authorized-user-status",{userId:user.id,active:!user.is_active});await load();}catch(e){alert(e.message);btn.disabled=false;}};row.append(info,btn);list.append(row);});if(!users.length)list.textContent="Aucun compte.";}catch(e){list.textContent="Erreur : "+e.message;}}
await load();
})();
