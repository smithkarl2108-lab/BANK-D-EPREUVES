/* Espace privé — contrôle de session et profil côté serveur via RLS. */
"use strict";
(async () => {
 const config=window.BANK_SUPABASE_CONFIG;
 const lib=window.supabase;
 const message=document.getElementById("accountMessage");
 const say=(text,type="info")=>{message.textContent=text;message.className="auth-message "+type;message.hidden=false;};
 if(!config||!lib?.createClient){say("Le service de compte est indisponible.","error");return;}
 const client=lib.createClient(config.url,config.publishableKey);
 const {data:{session},error:sessionError}=await client.auth.getSession();
 if(sessionError||!session){window.location.replace("connexion.html");return;}
 document.getElementById("accountEmail").textContent=session.user.email||"";
 const {data:profile,error}=await client.from("profiles").select("display_name,role,is_active").eq("id",session.user.id).single();
 if(error||!profile){say("Ton compte est connecté, mais ton profil n'est pas encore disponible. Actualise la page ou contacte l'administration.","error");}
 else if(!profile.is_active){await client.auth.signOut();say("Ce compte est désactivé. Contacte l'administration.","error");return;}
 else{
  document.getElementById("welcomeTitle").textContent="Bienvenue, "+(profile.display_name||"sur BANK D'EPREUVES")+" !";
  say("Tu es connecté en tant que "+({student:"élève",teacher:"intervenant",admin:"administrateur"}[profile.role]||"utilisateur")+".","success");
 }
 document.getElementById("logoutButton")?.addEventListener("click",async()=>{
  const {error}=await client.auth.signOut();
  if(error)say("La déconnexion a échoué : "+error.message,"error");
  else window.location.replace("connexion.html");
 });
})();
