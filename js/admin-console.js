/* Console dédiée à l'administration BANK D'ÉPREUVES. */
"use strict";
(async()=>{
 const config=window.BANK_SUPABASE_CONFIG,lib=window.supabase;
 if(!config||!lib?.createClient){document.body.innerHTML="Service indisponible";return;}
 const db=lib.createClient(config.url,config.publishableKey),endpoint=config.url+"/functions/v1/account";
 const {data:{session}}=await db.auth.getSession();
 if(!session){location.replace("connexion.html");return;}
 if(session.user.app_metadata?.must_change_password){location.replace("espace.html");return;}
 const {data:profile,error}=await db.from("profiles").select("role,is_active,display_name,username").eq("id",session.user.id).single();
 if(error||!profile){location.replace("espace.html");return;}
 if(profile.role!=="admin"){location.replace("espace.html");return;}
 if(!profile.is_active){await db.auth.signOut();location.replace("connexion.html");return;}
 const views={overview:"Vue d'ensemble",permissions:"Utilisateurs & droits",review:"Validation des épreuves",resets:"Réinitialisations",upload:"Dépôt d'épreuves"};
 function switchView(key){
   if(!views[key])return;
   document.querySelectorAll(".admin-view").forEach(v=>v.classList.toggle("active",v.id==="view-"+key));
   document.querySelectorAll(".admin-menu-item").forEach(b=>b.classList.toggle("active",b.dataset.view===key));
   document.getElementById("adminCurrentPage").textContent=views[key];
   document.getElementById("adminSidebar").classList.remove("open");
   window.scrollTo({top:0,behavior:"smooth"});
 }
 document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>switchView(el.dataset.view)));
 document.getElementById("adminMobileMenu")?.addEventListener("click",()=>document.getElementById("adminSidebar").classList.toggle("open"));
 document.getElementById("adminLogout")?.addEventListener("click",async()=>{await db.auth.signOut({scope:"local"});location.replace("connexion.html");});
 const hello=document.querySelector(".admin-welcome h1");if(hello)hello.textContent="Bonjour, "+(profile.display_name||profile.username||"Administrateur")+" 👋";
 // Reset requests is rendered here so each console view is independent of the personal-space page.
 const resetSection=document.getElementById("view-resets");
 const resetPanel=document.getElementById("adminResetPanel");
 const requests=document.getElementById("resetRequests");
 const tempBox=document.getElementById("temporaryPasswordBox");
 async function api(action,extra={}){const {data:{session:s}}=await db.auth.getSession();const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.publishableKey,Authorization:"Bearer "+s.access_token},body:JSON.stringify({action,...extra})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Une erreur est survenue.");return result;}
 async function loadResets(){
   requests.textContent="Chargement des demandes…";
   try{const {requests:items=[]}=await api("admin-list");if(!items.length){requests.textContent="Aucune demande en attente.";return;}requests.replaceChildren();
   items.forEach(item=>{const user=item.profiles||{},row=document.createElement("div");row.className="reset-request-row";const info=document.createElement("div"),name=document.createElement("strong");name.textContent=user.display_name||user.username||"Utilisateur";const meta=document.createElement("p");meta.textContent="@"+(user.username||"identifiant inconnu")+(user.phone_number?" · "+user.phone_number:" · Aucun téléphone renseigné");info.append(name,meta);
   const actions=document.createElement("div");actions.className="reset-request-actions";const approve=document.createElement("button");approve.className="auth-submit";approve.textContent="Réinitialiser";approve.onclick=()=>reviewReset(item.id,"approve",approve);const reject=document.createElement("button");reject.className="text-action";reject.textContent="Refuser";reject.onclick=()=>reviewReset(item.id,"reject",reject);actions.append(approve,reject);row.append(info,actions);requests.append(row);});
   }catch(e){requests.textContent=e.message;}
 }
 async function reviewReset(id,decision,button){button.disabled=true;try{const result=await api("admin-reset",{requestId:id,decision});if(result.temporaryPassword){tempBox.hidden=false;tempBox.replaceChildren();const p=document.createElement("p");p.textContent="Mot de passe temporaire : copie-le et transmets-le de façon privée.";const code=document.createElement("code");code.textContent=result.temporaryPassword;const copy=document.createElement("button");copy.className="text-action";copy.textContent="Copier";copy.onclick=async()=>{await navigator.clipboard.writeText(result.temporaryPassword);copy.textContent="Copié";};tempBox.append(p,code,copy);}await loadResets();}catch(e){alert(e.message);button.disabled=false;}}
 await loadResets();setInterval(loadResets,30000);
 // Mark upload/review access visibility only after role has been verified above.
 const upload=document.getElementById("uploadDocumentPanel");if(upload)upload.hidden=false;
 switchView("overview");
})();