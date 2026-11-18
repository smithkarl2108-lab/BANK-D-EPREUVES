/* Dépôt intelligent : 20 fichiers maximum, analyse indépendante et contrôle humain. */
"use strict";
(async () => {
  const panel=document.getElementById("uploadDocumentPanel"), form=document.getElementById("uploadDocumentForm");
  if(!panel||!form)return;
  const cfg=window.BANK_SUPABASE_CONFIG, lib=window.supabase;
  if(!cfg||!lib?.createClient)return;
  const db=lib.createClient(cfg.url,cfg.publishableKey);
  const {data:{session}}=await db.auth.getSession(); if(!session)return;
  const {data:profile}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).single();
  if(!profile?.is_active||!["admin","teacher"].includes(profile.role))return;
  panel.hidden=false;
  const $=id=>document.getElementById(id), files=[], items=[];
  let catalog={classes:[],series:[],subjects:[]};
  const tell=(s,t="info")=>{$("uploadFeedback").textContent=s;$("uploadFeedback").className="auth-message "+t;$("uploadFeedback").hidden=false;};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const mime=f=>f.type||({pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"}[f.name.split(".").pop().toLowerCase()]||"");
  const listOptions=(arr,empty)=>'<option value="">'+empty+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
  try{
    const [a,b,c]=await Promise.all([
      db.from("school_classes").select("id,name").eq("is_active",true).order("level_order"),
      db.from("series").select("id,name").eq("is_active",true).order("name"),
      db.from("subjects").select("id,name").eq("is_active",true).order("name")
    ]);
    if(a.error||b.error||c.error)throw a.error||b.error||c.error;
    catalog={classes:a.data||[],series:b.data||[],subjects:c.data||[]};
  }catch(e){tell("Chargement du référentiel impossible : "+e.message,"error");return;}
  function drawFiles(){
    $("uploadFileList").replaceChildren();
    files.forEach((f,i)=>{
      const row=document.createElement("div");row.className="upload-file-row";
      const name=document.createElement("span");name.textContent=f.name+" · "+(f.size/1048576).toFixed(2)+" Mo";
      const btn=document.createElement("button");btn.type="button";btn.textContent="Retirer";
      btn.onclick=()=>{files.splice(i,1);drawFiles();};
      row.append(name,btn);$("uploadFileList").append(row);
    });
    $("uploadFileCount").textContent=files.length+" / 20 fichiers";
    $("analyzeBatchButton").disabled=!files.length;
  }
  $("uploadFiles").addEventListener("change",()=>{
    const incoming=Array.from($("uploadFiles").files||[]);
    if(files.length+incoming.length>20){tell("20 fichiers maximum par dépôt.","error");$("uploadFiles").value="";return;}
    for(const f of incoming){
      if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(mime(f))){tell("Format non accepté : "+f.name,"error");continue;}
      if(!f.size||f.size>20*1048576){tell(f.name+" est vide ou dépasse 20 Mo.","error");continue;}
      if(!files.some(x=>x.name===f.name&&x.size===f.size))files.push(f);
    }
    $("uploadFiles").value="";drawFiles();
  });
  function renderCard(item,i){
    const a=item.analysis||{}, warnings=Array.isArray(a.warnings)?a.warnings:[];
    const card=document.createElement("article");card.className="upload-analysis-card";card.dataset.index=i;
    card.innerHTML=`
      <div class="upload-analysis-heading"><div><strong>${esc(item.file.name)}</strong><small>${item.error?"Analyse à compléter manuellement":"Confiance IA : "+Number(a.confidence||0)+" %"}</small></div><span class="upload-analysis-state ${item.error||warnings.length?"warning":"success"}">${item.error||warnings.length?"À vérifier":"Analyse effectuée"}</span></div>
      ${item.error?'<p class="upload-analysis-warning">'+esc(item.error)+'</p>':""}
      ${warnings.length?'<ul class="upload-analysis-warning">'+warnings.map(w=>"<li>"+esc(w)+"</li>").join("")+"</ul>":""}
      <div class="upload-analysis-grid">
        <label>Titre proposé *<input data-f="title" maxlength="160" required value="${esc(a.title||"")}"></label>
        <label>Type<select data-f="type">${["sujet","corrige","cours","autre"].map(v=>'<option value="'+v+'"'+((a.document_type||"sujet")===v?" selected":"")+'>'+({sujet:"Sujet",corrige:"Corrigé",cours:"Cours",autre:"Autre"}[v])+"</option>").join("")}</select></label>
        <label>Classe *<select data-f="class" required>${listOptions(catalog.classes,"Choisir la classe")}</select></label>
        <label>Série<select data-f="series">${listOptions(catalog.series,"Aucune / sans série")}</select></label>
        <label>Matière *<select data-f="subject" required>${listOptions(catalog.subjects,"Choisir la matière")}</select></label>
        <label>Année<input data-f="year" type="number" min="1950" max="2100" value="${esc(a.exam_year||"")}"></label>
        <label>Numéro de séquence<input data-f="sequence" type="number" min="1" max="12" value="${esc(a.sequence_number||"")}"></label>
      </div>
      <label class="upload-description-label">Description<input data-f="description" maxlength="1000" value="${esc(a.description||"")}"></label>
      <p class="upload-summary"><strong>Résumé :</strong> ${esc(a.extracted_text_summary||"Aucun résumé disponible : vérification manuelle nécessaire.")}</p>
      ${!catalog.classes.length||!catalog.subjects.length?'<p class="upload-analysis-warning">Le référentiel des classes et matières est vide. Il doit être configuré avant la finalisation.</p>':""}`;
    const find=(arr,n)=>arr.find(x=>x.name.toLowerCase()===String(n||"").trim().toLowerCase());
    const cm=find(catalog.classes,a.class_name),sm=find(catalog.series,a.series_name),tm=find(catalog.subjects,a.subject_name);
    if(cm)card.querySelector('[data-f="class"]').value=cm.id;
    if(sm)card.querySelector('[data-f="series"]').value=sm.id;
    if(tm)card.querySelector('[data-f="subject"]').value=tm.id;
    $("uploadAnalysisResults").append(card);
  }
  $("analyzeBatchButton").addEventListener("click",async()=>{
    if(!files.length)return;
    $("analyzeBatchButton").disabled=true;$("uploadSubmit").disabled=true;
    $("uploadAnalysisResults").replaceChildren();items.splice(0);
    for(let i=0;i<files.length;i++){
      const f=files[i],item={file:f,mime:mime(f),path:null,hash:null,analysis:null,error:null};
      tell("Analyse du fichier "+(i+1)+"/"+files.length+" : "+f.name);
      try{
        const {data:{session:s}}=await db.auth.getSession();if(!s)throw Error("Session expirée.");
        const folder=crypto.randomUUID(),safe=f.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
        item.path=s.user.id+"/"+folder+"/"+crypto.randomUUID()+"-"+safe;
        const up=await db.storage.from("documents").upload(item.path,f,{contentType:item.mime,upsert:false});
        if(up.error)throw up.error;
        const digest=await crypto.subtle.digest("SHA-256",await f.arrayBuffer());
        item.hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
        const res=await fetch(cfg.url+"/functions/v1/analyze-document",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+s.access_token,"apikey":cfg.publishableKey},body:JSON.stringify({storagePath:item.path,mimeType:item.mime,fileName:f.name})});
        const payload=await res.json();if(!res.ok||!payload.success)throw Error(payload.error||"Analyse IA indisponible.");
        item.analysis=payload.analysis;
      }catch(e){item.error=e.message||"Analyse impossible.";item.analysis={title:f.name.replace(/\.[^.]+$/,""),document_type:"sujet",warnings:["Complète les champs manuellement."]};}
      items.push(item);renderCard(item,i);
    }
    tell("Analyse terminée. Vérifie individuellement chaque fiche avant l'envoi.","success");
    $("uploadSubmit").disabled=false;$("analyzeBatchButton").disabled=false;
  });
  form.addEventListener("submit",async ev=>{
    ev.preventDefault();if(!items.length)return tell("Analyse d'abord les fichiers sélectionnés.","error");
    $("uploadSubmit").disabled=true;$("analyzeBatchButton").disabled=true;
    const {data:{session:s}}=await db.auth.getSession();if(!s){tell("Session expirée. Reconnecte-toi.","error");return;}
    let sent=0;const problems=[];
    for(let i=0;i<items.length;i++){
      const item=items[i],card=$("uploadAnalysisResults").querySelector('[data-index="'+i+'"]');
      const val=k=>card.querySelector('[data-f="'+k+'"]').value.trim();
      if(!val("title")||!val("class")||!val("subject")){problems.push(item.file.name+" : titre, classe ou matière manquant.");continue;}
      try{
        const {data:doc,error}=await db.from("documents").insert({
          title:val("title"),description:val("description")||null,document_type:val("type"),status:"pending",
          school_class_id:val("class"),series_id:val("series")||null,subject_id:val("subject"),
          exam_year:val("year")?Number(val("year")):null,sequence_number:val("sequence")?Number(val("sequence")):null,uploader_id:s.user.id
        }).select("id").single();
        if(error)throw error;
        const f=await db.from("document_files").insert({document_id:doc.id,uploader_id:s.user.id,bucket_id:"documents",storage_path:item.path,original_name:item.file.name,mime_type:item.mime,file_size:item.file.size,sha256:item.hash});
        if(f.error){await db.from("documents").delete().eq("id",doc.id);throw f.error;}
        sent++;
      }catch(e){problems.push(item.file.name+" : "+e.message);}
    }
    tell(sent+" fichier(s) transmis pour validation."+ (problems.length?" À corriger : "+problems.join(" "):""),problems.length?"error":"success");
    if(sent===items.length){files.splice(0);items.splice(0);$("uploadAnalysisResults").replaceChildren();drawFiles();}
    $("uploadSubmit").disabled=false;$("analyzeBatchButton").disabled=!files.length;
  });
  drawFiles();
})();
