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
  let catalog={subsystems:[],classes:[],series:[],variants:[],offerings:[],subjects:[]};
  const tell=(s,t="info")=>{$("uploadFeedback").textContent=s;$("uploadFeedback").className="auth-message "+t;$("uploadFeedback").hidden=false;};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const mime=f=>f.type||({pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"}[f.name.split(".").pop().toLowerCase()]||"");
  const options=(arr,empty)=>'<option value="">'+empty+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
  try{
    const [a,b,c,d,e,f]=await Promise.all([
      db.from("school_subsystems").select("id,code,name").eq("is_active",true).order("name"),
      db.from("school_classes").select("id,name,level_order,subsystem_id,code").eq("is_active",true).order("level_order"),
      db.from("series").select("id,name,subsystem_id").eq("is_active",true).order("name"),
      db.from("school_variants").select("id,name,code").eq("is_active",true).order("name"),
      db.from("class_offerings").select("id,class_id,series_id,variant_id,display_name").eq("is_active",true).order("display_name"),
      db.from("subjects").select("id,name").eq("is_active",true).order("name")
    ]);
    if(a.error||b.error||c.error||d.error||e.error||f.error)throw a.error||b.error||c.error||d.error||e.error||f.error;
    catalog={subsystems:a.data||[],classes:b.data||[],series:c.data||[],variants:d.data||[],offerings:e.data||[],subjects:f.data||[]};
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

  function setupClassification(card,a){
    const subsystem=card.querySelector('[data-f="subsystem"]');
    const classSelect=card.querySelector('[data-f="class"]');
    const seriesSelect=card.querySelector('[data-f="series"]');
    const variantSelect=card.querySelector('[data-f="variant"]');
    const classHint=card.querySelector('[data-hint="class"]');
    const seriesHint=card.querySelector('[data-hint="series"]');
    const variantWrap=card.querySelector('[data-wrap="variant"]');
    const find=(arr,n)=>arr.find(x=>String(x.name).toLowerCase()===String(n||"").trim().toLowerCase());

    function refreshClasses(preferredClass){
      const sid=subsystem.value;
      const rows=catalog.classes.filter(x=>x.subsystem_id===sid);
      classSelect.innerHTML=options(rows,"Choisir la classe");
      classSelect.disabled=!sid;
      if(preferredClass&&rows.some(x=>x.id===preferredClass))classSelect.value=preferredClass;
      refreshSeries();
    }
    function refreshSeries(preferredSeries,preferredVariant){
      const cid=classSelect.value;
      const rows=catalog.offerings.filter(x=>x.class_id===cid&&x.series_id);
      const ids=[...new Set(rows.map(x=>x.series_id))];
      const available=catalog.series.filter(x=>ids.includes(x.id));
      seriesSelect.innerHTML=options(available,"Aucune série");
      seriesSelect.disabled=!available.length;
      if(preferredSeries&&ids.includes(preferredSeries))seriesSelect.value=preferredSeries;
      refreshVariants(preferredVariant);
    }
    function refreshVariants(preferredVariant){
      const cid=classSelect.value,sid=seriesSelect.value;
      const rows=catalog.offerings.filter(x=>x.class_id===cid&&x.series_id===sid&&x.variant_id);
      const ids=[...new Set(rows.map(x=>x.variant_id))];
      const available=catalog.variants.filter(x=>ids.includes(x.id));
      variantWrap.hidden=!available.length;
      variantSelect.innerHTML=options(available,"Aucune option linguistique");
      variantSelect.disabled=!available.length;
      if(preferredVariant&&ids.includes(preferredVariant))variantSelect.value=preferredVariant;
      classHint.textContent=classSelect.value?"Classe sélectionnée":"Choisis d'abord un sous-système.";
      seriesHint.textContent=available.length?"Les options linguistiques sont proposées uniquement pour la série A.":(seriesSelect.disabled?"Cette classe n'a pas de série.":"Choisis la série.");
    }
    subsystem.addEventListener("change",()=>refreshClasses());
    classSelect.addEventListener("change",()=>refreshSeries());
    seriesSelect.addEventListener("change",()=>refreshVariants());
    const aiClass=find(catalog.classes,a.class_name);
    if(aiClass){
      subsystem.value=aiClass.subsystem_id;
      refreshClasses(aiClass.id);
      const aiSeries=find(catalog.series,a.series_name);
      if(aiSeries)refreshSeries(aiSeries.id);
    }else{
      subsystem.value="";
      refreshClasses();
    }
    if(variantWrap.hidden===false&&a.language_option){
      const aiVariant=find(catalog.variants,a.language_option);
      if(aiVariant)variantSelect.value=aiVariant.id;
    }
  }

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
        <label>Sous-système *<select data-f="subsystem" required>${options(catalog.subsystems,"Choisir le sous-système")}</select></label>
        <label>Classe *<select data-f="class" required disabled><option value="">Choisir d'abord le sous-système</option></select><small data-hint="class">Choisis d'abord un sous-système.</small></label>
        <label>Série<select data-f="series" disabled><option value="">Aucune série</option></select><small data-hint="series">Choisis la classe.</small></label>
        <label data-wrap="variant" hidden>Option linguistique<select data-f="variant" disabled><option value="">Aucune option linguistique</option></select></label>
        <label>Matière *<select data-f="subject" required>${options(catalog.subjects,"Choisir la matière")}</select></label>
        <label>Année<input data-f="year" type="number" min="1950" max="2100" value="${esc(a.exam_year||"")}"></label>
        <label>Numéro de séquence<input data-f="sequence" type="number" min="1" max="10" value="${esc(a.sequence_number||"")}"></label>
      </div>
      <label class="upload-description-label">Description<input data-f="description" maxlength="1000" value="${esc(a.description||"")}"></label>
      <p class="upload-summary"><strong>Résumé :</strong> ${esc(a.extracted_text_summary||"Aucun résumé disponible : vérification manuelle nécessaire.")}</p>
      ${!catalog.classes.length||!catalog.subjects.length?'<p class="upload-analysis-warning">Le référentiel des classes et matières doit être configuré avant la finalisation.</p>':""}`;
    $("uploadAnalysisResults").append(card);
    setupClassification(card,a);
    const subject=catalog.subjects.find(x=>x.name.toLowerCase()===String(a.subject_name||"").trim().toLowerCase());
    if(subject)card.querySelector('[data-f="subject"]').value=subject.id;
  }

  $("analyzeBatchButton").addEventListener("click",async()=>{
    if(!files.length)return;
    $("analyzeBatchButton").disabled=true;$("uploadSubmit").disabled=true;
    $("uploadAnalysisResults").replaceChildren();items.splice(0);
    for(let i=0;i<files.length;i++){
      const f=files[i],item={file:f,mime:mime(f),path:null,hash:null,analysis:null,error:null,uploaded:false};
      tell("Analyse du fichier "+(i+1)+"/"+files.length+" : "+f.name);
      try{
        const {data:{session:s}}=await db.auth.getSession();if(!s)throw Error("Session expirée.");
        const folder=crypto.randomUUID(),safe=f.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
        item.path=s.user.id+"/"+folder+"/"+crypto.randomUUID()+"-"+safe;
        const up=await db.storage.from("documents").upload(item.path,f,{contentType:item.mime,upsert:false});
        if(up.error)throw up.error;
        item.uploaded=true;
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
      if(!item.uploaded){problems.push(item.file.name+" : le fichier n’a pas pu être téléversé.");continue;}
      const val=k=>card.querySelector('[data-f="'+k+'"]').value.trim();
      const classId=val("class"),seriesId=val("series")||null,variantId=val("variant")||null;
      const offering=catalog.offerings.find(x=>x.class_id===classId&&x.series_id===seriesId&&x.variant_id===variantId);
      if(!val("title")||!classId||!val("subject")||!offering){problems.push(item.file.name+" : titre, classe, série ou matière invalide/incomplet.");continue;}
      try{
        const {data:doc,error}=await db.from("documents").insert({
          title:val("title"),description:val("description")||null,document_type:val("type"),status:"pending",
          school_class_id:classId,series_id:seriesId,class_offering_id:offering.id,subject_id:val("subject"),
          exam_year:val("year")?Number(val("year")):null,sequence_number:val("sequence")?Number(val("sequence")):null,uploader_id:s.user.id
        }).select("id").single();
        if(error)throw error;
        const f=await db.from("document_files").insert({document_id:doc.id,uploader_id:s.user.id,bucket_id:"documents",storage_path:item.path,original_name:item.file.name,mime_type:item.mime,file_size:item.file.size,sha256:item.hash});
        if(f.error){await db.from("documents").delete().eq("id",doc.id);throw f.error;}
        sent++;
      }catch(e){problems.push(item.file.name+" : "+e.message);}
    }
    tell(sent+" fichier(s) transmis pour validation."+(problems.length?" À corriger : "+problems.join(" "):""),problems.length?"error":"success");
    if(sent===items.length){files.splice(0);items.splice(0);$("uploadAnalysisResults").replaceChildren();drawFiles();}
    $("uploadSubmit").disabled=false;$("analyzeBatchButton").disabled=!files.length;
  });
  drawFiles();
})();
