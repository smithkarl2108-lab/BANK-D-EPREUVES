"use strict";
(async()=>{
const panel=document.getElementById("uploadDocumentPanel"),form=document.getElementById("uploadDocumentForm");
if(!panel||!form)return;
const cfg=window.BANK_SUPABASE_CONFIG,lib=window.supabase;if(!cfg||!lib?.createClient)return;
const db=lib.createClient(cfg.url,cfg.publishableKey),$=id=>document.getElementById(id);
const {data:{session}}=await db.auth.getSession();if(!session)return;
const {data:profile}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).single();
if(!profile?.is_active||!["admin","teacher"].includes(profile.role))return;
panel.hidden=false;
const files=[],items=[];
let cat={subsystems:[],classes:[],series:[],variants:[],offerings:[],subjects:[],links:[]},worker=null;
const tell=(s,t)=>{$("uploadFeedback").textContent=s;$("uploadFeedback").className="auth-message "+(t||"info");$("uploadFeedback").hidden=false;};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const mime=f=>{const ext=f.name.split(".").pop().toLowerCase(),byExt={pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"},known=byExt[ext];return known&&(!f.type||f.type==="application/octet-stream"||f.type!==known)?known:(f.type||known||"");};
const opts=(arr,label)=>'<option value="">'+label+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
const byName=(arr,n)=>arr.find(x=>norm(x.name)===norm(n));
try{
const rs=await Promise.all([
db.from("school_subsystems").select("id,name").eq("is_active",true).order("name"),
db.from("school_classes").select("id,name,subsystem_id,code").eq("is_active",true).order("level_order"),
db.from("series").select("id,name").eq("is_active",true).order("name"),
db.from("school_variants").select("id,name").eq("is_active",true).order("name"),
db.from("class_offerings").select("id,class_id,series_id,variant_id").eq("is_active",true),
db.from("subjects").select("id,name").eq("is_active",true).order("name"),
db.from("class_offering_subjects").select("offering_id,subject_id,is_optional").eq("is_active",true)]);
for(const r of rs)if(r.error)throw r.error;
cat={subsystems:rs[0].data||[],classes:rs[1].data||[],series:rs[2].data||[],variants:rs[3].data||[],offerings:rs[4].data||[],subjects:rs[5].data||[],links:rs[6].data||[]};
}catch(e){tell("Référentiel indisponible : "+e.message+". La sélection des fichiers reste active, mais les champs de classement pourront être incomplets.","error");cat={subsystems:[],classes:[],series:[],variants:[],offerings:[],subjects:[],links:[]};}
function drawFiles(){
$("uploadFiles").addEventListener("change",()=>{
const incoming=Array.from($("uploadFiles").files||[]);
if(files.length+incoming.length>20){tell("20 fichiers maximum par dépôt.","error");$("uploadFiles").value="";return;}
incoming.forEach(f=>{if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(mime(f)))return tell("Format non accepté : "+f.name,"error");if(!f.size||f.size>20*1048576)return tell(f.name+" est vide ou dépasse 20 Mo.","error");if(!files.some(x=>x.name===f.name&&x.size===f.size))files.push(f);});
$("uploadFiles").value="";drawFiles();
});

$("uploadFileList").replaceChildren();
files.forEach((f,i)=>{const row=document.createElement("div");row.className="upload-file-row";const name=document.createElement("span");name.textContent=f.name+" · "+(f.size/1048576).toFixed(2)+" Mo";const b=document.createElement("button");b.type="button";b.textContent="Retirer";b.onclick=()=>{files.splice(i,1);drawFiles();};row.append(name,b);$("uploadFileList").append(row);});
$("uploadFileCount").textContent=files.length+" / 20 fichiers";$("analyzeBatchButton").disabled=!files.length;
}

async function getWorker(){
if(worker)return worker;if(!window.Tesseract?.createWorker)throw Error("Moteur OCR non chargé. Vérifie ta connexion et actualise la page.");
tell("Préparation du moteur OCR gratuit…");worker=await Tesseract.createWorker("fra+eng",1,{logger:m=>{if(m.status==="recognizing text")tell("OCR en cours : "+Math.round((m.progress||0)*100)+" %");}});return worker;
}
async function extract(file){
if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){
if(!window.pdfjsLib)throw Error("Lecteur PDF non chargé.");
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,parts=[],scanned=[];
for(let n=1;n<=Math.min(pdf.numPages,12);n++){tell("Lecture du PDF : page "+n+"/"+Math.min(pdf.numPages,12));const p=await pdf.getPage(n),tc=await p.getTextContent(),t=tc.items.map(x=>x.str||"").join(" ");if(t.trim().length>25)parts.push(t);else if(n<=5)scanned.push({p,n});}
if(scanned.length){const w=await getWorker();for(const x of scanned){tell("OCR de la page "+x.n+"…");const v=x.p.getViewport({scale:1.4}),c=document.createElement("canvas");c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await x.p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;const r=await w.recognize(c);parts.push(r.data.text||"");c.width=c.height=1;}}
return parts.join("\n").slice(0,50000);
}
const w=await getWorker();tell("Lecture de l'image par OCR…");const r=await w.recognize(file);return(r.data.text||"").slice(0,50000);
}
function classify(file,text){
const source=norm(file.name+" "+text),warnings=[];let cls=null,ser=null,variant=null,sub=null;
const matches=cat.classes.filter(c=>source.includes(norm(c.name))||(c.code&&norm(file.name).includes(norm(c.code))));
if(matches.length===1)cls=matches[0];else if(matches.length>1)warnings.push("Plusieurs classes possibles : sélectionne la bonne classe.");
if(cls){const ids=[...new Set(cat.offerings.filter(o=>o.class_id===cls.id&&o.series_id).map(o=>o.series_id))];const m=cat.series.filter(s=>ids.includes(s.id)&&source.includes(norm(s.name)));if(m.length===1)ser=m[0];const vids=[...new Set(cat.offerings.filter(o=>o.class_id===cls.id&&o.series_id===(ser?.id||null)&&o.variant_id).map(o=>o.variant_id))];const vm=cat.variants.filter(v=>vids.includes(v.id)&&source.includes(norm(v.name)));if(vm.length===1)variant=vm[0];}
const found=cat.subjects.filter(s=>norm(s.name).length>2&&source.includes(norm(s.name)));
if(found.length===1)sub=found[0];else if(found.length>1)warnings.push("Plusieurs matières détectées : choisis la matière exacte.");
if(cls&&sub){const possible=cat.offerings.filter(o=>o.class_id===cls.id&&(!ser||o.series_id===ser.id)&&(!variant||o.variant_id===variant.id));if(!possible.some(o=>cat.links.some(l=>l.offering_id===o.id&&l.subject_id===sub.id))){sub=null;warnings.push("La matière détectée n'est pas autorisée pour la classe/série choisie.");}}
if(!cls)warnings.push("Classe non identifiée avec certitude.");if(!sub)warnings.push("Matière non identifiée avec certitude.");
if(cls&&cat.offerings.some(o=>o.class_id===cls.id&&o.variant_id)&&!variant)warnings.push("Vérifie l'option linguistique requise.");
const year=source.match(/\b(19[89]\d|20[0-3]\d)\b/),seq=source.match(/\b(?:sequence|seq)\s*(?:n[o°]\s*)?([1-9])\b/);
let type="sujet";if(/\b(corrige|correction|marking scheme|answers|solution)\b/.test(source))type="corrige";else if(/\b(cours|lesson|lecon|chapter|chapitre)\b/.test(source))type="cours";
return{title:file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").slice(0,160),document_type:type,class_name:cls?.name||"",series_name:ser?.name||"",language_option:variant?.name||"",subject_name:sub?.name||"",exam_year:year?Number(year[1]):"",sequence_number:seq?Number(seq[1]):"",confidence:Math.min(95,25+(cls?25:0)+(sub?25:0)+(ser?10:0)+(year?5:0)+(seq?5:0)),warnings,summary:text?text.replace(/\s+/g," ").slice(0,350):"Aucun texte exploitable n'a été extrait."};
}
function updateProgress(){
const n=items.filter(x=>x.confirmed).length;$("uploadProgress").textContent=n+" / "+items.length+" fiche(s) confirmée(s)";
$("uploadSubmit").disabled=!n;$("uploadSubmit").textContent=n?"Envoyer les "+n+" fiche(s) confirmée(s) pour validation →":"Confirmer au moins une fiche pour l'envoi";
}
function setupCard(card,a){
const get=k=>card.querySelector('[data-f="'+k+'"]'),sub=get("subsystem"),cl=get("class"),se=get("series"),va=get("variant"),su=get("subject"),wrap=card.querySelector('[data-wrap="variant"]');
function subjects(pre){const off=cat.offerings.find(o=>o.class_id===cl.value&&o.series_id===(se.value||null)&&o.variant_id===(va.value||null)),links=cat.links.filter(x=>x.offering_id===off?.id),rows=links.map(x=>{const s=cat.subjects.find(z=>z.id===x.subject_id);return s?{id:s.id,name:s.name+(x.is_optional?" — Optionnelle":"")}:null;}).filter(Boolean);su.innerHTML=opts(rows,"Choisir la matière");su.disabled=!rows.length;if(pre&&rows.some(x=>x.id===pre))su.value=pre;drawExtraClasses();}
function variants(pre){const ids=[...new Set(cat.offerings.filter(o=>o.class_id===cl.value&&o.series_id===(se.value||null)&&o.variant_id).map(o=>o.variant_id))],rows=cat.variants.filter(x=>ids.includes(x.id));wrap.hidden=!rows.length;va.innerHTML=opts(rows,"Choisir l'option linguistique");va.disabled=!rows.length;va.required=!!rows.length;if(pre&&ids.includes(pre))va.value=pre;subjects();}
function series(pre){const ids=[...new Set(cat.offerings.filter(o=>o.class_id===cl.value&&o.series_id).map(o=>o.series_id))],rows=cat.series.filter(x=>ids.includes(x.id));se.innerHTML=opts(rows,"Aucune série / orientation");se.disabled=!rows.length;if(pre&&ids.includes(pre))se.value=pre;variants();}
function classes(pre){const rows=cat.classes.filter(x=>x.subsystem_id===sub.value);cl.innerHTML=opts(rows,"Choisir la classe");cl.disabled=!sub.value;if(pre&&rows.some(x=>x.id===pre))cl.value=pre;series();drawExtraClasses();}
function drawExtraClasses(){const box=card.querySelector("[data-f=extra-classes]");if(!box)return;const main=cl.value;const selected=new Set((card.dataset.extraClasses||"").split(",").filter(Boolean));box.querySelectorAll("input[type=checkbox]:checked").forEach(x=>selected.add(x.value));if(main)selected.delete(main);box.replaceChildren();if(!main){box.textContent="Sélectionne la classe principale, puis choisis toi-même les classes supplémentaires.";return;}const primary=cat.classes.find(c=>c.id===main);const subs=primary?[cat.subsystems.find(ss=>ss.id===primary.subsystem_id)].filter(Boolean):[];subs.forEach(ss=>{const group=document.createElement("fieldset");group.className="upload-class-group";const legend=document.createElement("legend");legend.textContent=ss.name+" — "+primary.name;group.append(legend);cat.classes.filter(c=>c.subsystem_id===primary.subsystem_id&&norm(c.name)===norm(primary.name)&&c.id!==main).forEach(c=>{const label=document.createElement("label");label.className="upload-extra-class-option";const check=document.createElement("input");check.type="checkbox";check.value=c.id;check.checked=selected.has(c.id);check.onchange=()=>{const now=new Set((card.dataset.extraClasses||"").split(",").filter(Boolean));if(check.checked)now.add(c.id);else now.delete(c.id);card.dataset.extraClasses=Array.from(now).join(",");};const text=document.createElement("span");text.textContent=c.name;label.append(check,text);group.append(label);});box.append(group);});card.dataset.extraClasses=Array.from(selected).join(",");}
sub.addEventListener("change",()=>classes());cl.addEventListener("change",()=>series());se.addEventListener("change",()=>{variants();drawExtraClasses();});va.addEventListener("change",()=>{subjects();drawExtraClasses();});su.addEventListener("change",drawExtraClasses);cl.addEventListener("change",drawExtraClasses);se.addEventListener("change",drawExtraClasses);
const c=byName(cat.classes,a.class_name);if(c){sub.value=c.subsystem_id;classes(c.id);const s=byName(cat.series,a.series_name);if(s)se.value=s.id;variants(byName(cat.variants,a.language_option)?.id);subjects(byName(cat.subjects,a.subject_name)?.id);}else classes();
}
function values(card){
const v=k=>card.querySelector('[data-f="'+k+'"]')?.value.trim()||"",classId=v("class"),seriesId=v("series")||null,variantId=v("variant")||null;
const offering=cat.offerings.find(o=>o.class_id===classId&&o.series_id===seriesId&&o.variant_id===variantId);
const extraClassIds=Array.from(card.querySelectorAll("[data-f=extra-classes] input[type=checkbox]:checked")).map(x=>x.value); 
return{title:v("title"),type:v("type"),classId,extraClassIds,seriesId,subjectId:v("subject"),offering,valid:!!offering&&cat.links.some(l=>l.offering_id===offering.id&&l.subject_id===v("subject")),year:v("year"),sequence:v("sequence"),description:v("description"),variantRequired:card.querySelector('[data-f="variant"]').required,variantId};
}
function render(item,i){
const a=item.analysis||{},card=document.createElement("article");card.className="upload-analysis-card";card.dataset.index=i;
card.innerHTML='<div class="upload-analysis-heading"><div><strong>'+esc(item.file.name)+'</strong><small>Analyse locale · confiance indicative : '+Number(a.confidence||0)+' %</small></div><span class="upload-analysis-state warning">À vérifier</span></div>'+
(a.warnings?.length?'<ul class="upload-analysis-warning">'+a.warnings.map(w=>"<li>"+esc(w)+"</li>").join("")+"</ul>":"")+
'<div class="upload-analysis-grid">'+
'<label>Titre proposé *<input data-f="title" maxlength="160" required value="'+esc(a.title||"")+'"></label>'+
'<label>Type<select data-f="type">'+["sujet","corrige","cours","autre"].map(x=>'<option value="'+x+'" '+((a.document_type||"sujet")===x?"selected":"")+'>'+({sujet:"Sujet",corrige:"Corrigé",cours:"Cours",autre:"Autre"}[x])+"</option>").join("")+'</select></label>'+
'<label>Sous-système *<select data-f="subsystem" required>'+opts(cat.subsystems,"Choisir le sous-système")+'</select></label>'+
'<label>Classe *<select data-f="class" required disabled></select></label>'+
'<label>Série / orientation<select data-f="series" disabled></select></label><div class="upload-linked-classes"><strong>Autres classes concernées par cette même épreuve</strong><div data-f="extra-classes" class="upload-extra-classes"></div><small>Une seule épreuve, visible dans chacune des classes cochées.</small></div>'+
'<label data-wrap="variant" hidden>Option linguistique<select data-f="variant" disabled></select></label>'+
'<label>Matière *<select data-f="subject" required disabled></select></label>'+
'<label>Année<input data-f="year" type="number" min="1950" max="2100" value="'+esc(a.exam_year||"")+'"></label>'+
'<label>Numéro de séquence<input data-f="sequence" type="number" min="1" max="10" value="'+esc(a.sequence_number||"")+'"></label></div>'+
'<label class="upload-description-label">Description<input data-f="description" maxlength="1000" value=""></label>'+
'<p class="upload-summary"><strong>Extrait :</strong> '+esc(a.summary||"Aucun texte exploitable.")+'</p>'+
'<div class="upload-card-actions"><button class="confirm-one" type="button">Confirmer cette fiche</button><span class="upload-card-note">'+(item.uploaded?"Fichier privé téléversé":"Téléversé uniquement après confirmation")+'</span></div>';
$("uploadAnalysisResults").append(card);setupCard(card,a);
card.addEventListener("input",e=>{if(e.target.matches("input,select")){item.confirmed=false;const st=card.querySelector(".upload-analysis-state");st.textContent="À vérifier";st.className="upload-analysis-state warning";card.querySelector(".confirm-one").textContent="Confirmer cette fiche";updateProgress();}});
card.querySelector(".confirm-one").onclick=async()=>{
const v=values(card);if(!v.title||!v.classId||!v.offering||!v.subjectId||!v.valid||(v.variantRequired&&!v.variantId)||v.extraClassIds.some(id=>{const x=cat.classes.find(c=>c.id===id);return !x||norm(x.name)!==norm(cat.classes.find(c=>c.id===v.classId)?.name)||x.subsystem_id!==cat.classes.find(c=>c.id===v.classId)?.subsystem_id;}))){tell("Complète le titre, la classe, la série/option si nécessaire et une matière autorisée.","error");return;}
if(item.confirmed){item.confirmed=false;const st=card.querySelector(".upload-analysis-state");st.textContent="À vérifier";st.className="upload-analysis-state warning";card.querySelector(".confirm-one").textContent="Confirmer cette fiche";updateProgress();tell("Fiche rouverte pour modification.","info");return;}
const btn=card.querySelector(".confirm-one");btn.disabled=true;btn.textContent="Téléversement sécurisé…";
try{
const {data:{session:s}}=await db.auth.getSession();if(!s)throw Error("Session expirée.");
if(!item.uploaded||!item.path||!item.hash){
const safe=item.file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
const digest=await crypto.subtle.digest("SHA-256",await item.file.arrayBuffer());
const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
const path=s.user.id+"/"+crypto.randomUUID()+"/"+crypto.randomUUID()+"-"+safe;
const up=await db.storage.from("documents").upload(path,item.file,{contentType:item.mime,upsert:false});if(up.error)throw up.error;
item.path=path;item.hash=hash;item.uploaded=true;
}
item.confirmed=true;card.querySelector(".upload-card-note").textContent="Fichier privé téléversé et fiche confirmée";
const st=card.querySelector(".upload-analysis-state");st.textContent="Fiche confirmée";st.className="upload-analysis-state success";btn.textContent="Modifier la fiche";updateProgress();tell("Fiche confirmée. Le fichier est maintenant stocké en privé, sans être encore envoyé à l'administration.","success");
}catch(e){item.uploaded=false;item.path=null;item.hash=null;tell("Impossible de confirmer cette fiche : "+e.message,"error");}
finally{btn.disabled=false;if(!item.confirmed)btn.textContent="Confirmer cette fiche";}
};
}
$("analyzeBatchButton").onclick=async()=>{
if(!files.length)return;$("analyzeBatchButton").disabled=true;$("uploadSubmit").disabled=true;$("uploadAnalysisResults").replaceChildren();items.splice(0);
for(let i=0;i<files.length;i++){
const file=files[i],item={file,mime:mime(file),path:null,hash:null,uploaded:false,confirmed:false,sent:false};items.push(item);
tell("Analyse du fichier "+(i+1)+"/"+files.length+" : "+file.name);
try{const text=await extract(file);item.analysis=classify(file,text);}catch(e){item.analysis={title:file.name.replace(/\.[^.]+$/,""),document_type:"sujet",warnings:["Analyse locale incomplète : complète manuellement les champs."],summary:e.message};}
render(item,i);
}
tell("Analyse terminée. Confirme chaque fiche séparément. Les fiches non confirmées ne seront jamais envoyées.","success");$("analyzeBatchButton").disabled=false;updateProgress();
};
form.addEventListener("submit",async ev=>{
ev.preventDefault();const selected=items.map((item,i)=>({item,i,card:$("uploadAnalysisResults").querySelector('[data-index="'+i+'"]')})).filter(x=>x.item.confirmed);
if(!selected.length){tell("Aucune fiche confirmée à envoyer.","error");return;}
$("uploadSubmit").disabled=true;$("analyzeBatchButton").disabled=true;const {data:{session:s}}=await db.auth.getSession();if(!s){tell("Session expirée. Reconnecte-toi.","error");return;}
let sent=0;const errors=[];
for(const x of selected){const item=x.item,v=values(x.card);try{
if(!item.uploaded||!item.path||!item.hash||!v.title||!v.offering||!v.valid)throw Error("Fiche incomplète ou fichier non téléversé.");
const {data:documentId,error}=await db.rpc("submit_exam_document",{p_title:v.title,p_description:v.description||null,p_document_type:v.type,p_class_id:v.classId,p_series_id:v.seriesId,p_offering_id:v.offering.id,p_subject_id:v.subjectId,p_exam_year:v.year?Number(v.year):null,p_sequence_number:v.sequence?Number(v.sequence):null,p_storage_path:item.path,p_original_name:item.file.name,p_mime_type:item.mime,p_file_size:item.file.size,p_sha256:item.hash,p_extra_class_ids:v.extraClassIds});
if(error)throw error;
item.sent=true;sent++;
}catch(e){errors.push(item.file.name+" : "+(e.message||String(e)));}}
if(sent){
const keep=items.map((item,i)=>({item,card:$("uploadAnalysisResults").querySelector('[data-index="'+i+'"]')})).filter(x=>!x.item.sent);
items.splice(0,items.length,...keep.map(x=>x.item));files.splice(0,files.length,...keep.map(x=>x.item.file));$("uploadAnalysisResults").replaceChildren();
items.forEach((item,i)=>{item.confirmed=false;render(item,i);});drawFiles();
}
tell(sent+" fichier(s) envoyé(s) pour validation."+(errors.length?" Échec(s) : "+errors.join(" | "):""),errors.length?"error":"success");
$("analyzeBatchButton").disabled=!files.length;updateProgress();
});
drawFiles();updateProgress();
})();