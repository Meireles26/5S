/* 5S Fácil Univale — script do app */
/* ===== Ponte entre o app e o Google Apps Script ===== */
(function(){
  const URL_API=String((window.CONFIG_5S||{}).urlApi||"");
  if(!/^https:\/\/script\.google\.com\/.+\/exec$/.test(URL_API)){
    window.__HOST={use:async()=>null};
    window.__HOST_ERRO="O app ainda não foi configurado: coloque o link do Google Apps Script (termina em /exec) no arquivo config.js.";
    return;
  }
  const run=(fn,...args)=>fetch(URL_API,{method:"POST",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({fn,args})})
    .then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(j=>{ if(!j||!j.ok) throw new Error((j&&j.erro)||"Erro no servidor"); return j.r; });
  const LS={get:k=>{try{return localStorage.getItem(k);}catch(e){return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}},del:k=>{try{localStorage.removeItem(k);}catch(e){}}};
  let uid=LS.get("5s-uid"); if(!uid||!/^[a-z0-9]{8,40}$/i.test(uid)){ uid="u"+Date.now().toString(36)+Math.random().toString(36).slice(2,10); LS.set("5s-uid",uid); }
  let token=LS.get("5s-token");
  const cache={}, fotos={}, listeners=new Set();
  const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
  const snapDoc=p=>{ const c=cache[p]; return {id:p.split("/").pop(), exists:!!c, data:()=>c?clone(c.d):undefined}; };
  const colDocs=p=>{ const sg=p.split("/").length; return Object.keys(cache).filter(k=>k.startsWith(p+"/")&&k.split("/").length===sg+1).sort().map(snapDoc); };
  function emitir(){ listeners.forEach(l=>{ try{ l.k==="doc"?l.cb(snapDoc(l.p)):l.cb({docs:colDocs(l.p)}); }catch(e){} }); }
  let ultima="";
  async function atualizar(){
    try{
      const r=await run("api_listar",["config/","reg/","sol/","validacoes/","registros/"]);
      const assinatura=JSON.stringify(Object.keys(r).sort().map(k=>k+r[k].v));
      Object.keys(cache).forEach(k=>delete cache[k]); Object.assign(cache,r);
      if(assinatura!==ultima){ ultima=assinatura; emitir(); }
      return true;
    }catch(e){ console.warn("5S: falha ao atualizar",e); return false; }
  }
  const pronto=atualizar();
  setInterval(()=>{ if(document.visibilityState==="visible") atualizar(); },20000);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") atualizar(); });
  async function gravar(p,d,modo){
    const r=await run("api_gravar",p,d,modo,uid,token);
    if(r&&r.erro){ const e=new Error(r.erro); e.code=r.code||"invalid_argument"; throw e; }
    if(p.startsWith("fotos/")){ fotos[p]={d:clone(d),v:r.v}; return; }
    cache[p]={d:r.d,v:r.v}; ultima=""; emitir();
  }
  function docRef(p){ return {id:p.split("/").pop(), path:p,
    get:async()=>{ if(p.startsWith("fotos/")){ if(!fotos[p]){ const r=await run("api_ler",p); if(r) fotos[p]=r; } const c=fotos[p]; return {id:p.split("/").pop(),exists:!!c,data:()=>c?clone(c.d):undefined}; } await pronto; return snapDoc(p); },
    set:(d,o)=>gravar(p,d,o&&o.merge?"merge":"set"),
    update:d=>gravar(p,d,"update"),
    delete:async()=>{ const r=await run("api_apagar",p,uid,token); if(r&&r.erro){ const e=new Error(r.erro); e.code="invalid_argument"; throw e; } delete cache[p]; ultima=""; emitir(); },
    onSnapshot:(n)=>{ const l={k:"doc",p,cb:n}; listeners.add(l); pronto.then(()=>n(snapDoc(p))); return ()=>listeners.delete(l); },
    collection:c=>colRef(p+"/"+c) }; }
  function colRef(p){ return {path:p, doc:id=>docRef(p+"/"+id),
    onSnapshot:(n)=>{ const l={k:"col",p,cb:n}; listeners.add(l); pronto.then(()=>n({docs:colDocs(p)})); return ()=>listeners.delete(l); } }; }
  const db={doc:docRef,collection:colRef};
  let admP=null;
  const ehAdm=()=>{ if(!admP) admP= token ? run("api_verificar",token).then(ok=>{ if(!ok){ token=null; LS.del("5s-token"); } return !!ok; }).catch(()=>false) : Promise.resolve(false); return admP; };
  const user={ id:async()=>uid, isOwner:ehAdm, canEdit:ehAdm, can:async()=>true,
    profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{id:i,name:""}])) };
  const downloads={ save:async({filename,data})=>{
    const r=await run("api_csv",filename,String(data),token);
    if(r&&r.url){ window.open(r.url,"_blank"); if(typeof toast==="function") toast("Planilha salva no Google Drive."); return {status:"saved"}; }
    if(typeof toast==="function") toast("Não foi possível gerar a planilha."); return {status:"failed"}; } };
  window.__HOST={use:async n=>{ await pronto; return ({db,user,downloads})[n]||null; }};
  window.__HOST_AUTH={
    async entrar(senha){ const r=await run("api_login",senha); if(!r||r.erro) throw new Error((r&&r.erro)||"Senha incorreta."); token=r.token; LS.set("5s-token",token); admP=Promise.resolve(true);
      if(typeof S!=="undefined"){ S.isAdmin=true; S.errLogin=""; S.view="admin"; render(); window.scrollTo(0,0); } },
    async sair(){ try{ await run("api_sair",token); }catch(e){} token=null; LS.del("5s-token"); admP=Promise.resolve(false);
      if(typeof S!=="undefined"){ S.isAdmin=false; S.view="home"; render(); } }
  };
})();

/* ===== APP ===== */
/* ============ CHECKLIST (igual à planilha "Pontuação NOVO") ============ */
const SENSOS = [
 {n:1, nome:"Utilização", jp:"Seiri", lema:"Só fica o que é necessário", c:"--s1", itens:[
  ["1.1","Existem somente materiais e/ou objetos necessários para a execução do trabalho?","Objetos que não são usados no trabalho: caixas, sucata, ferramentas quebradas."],
  ["1.2","Há informações ou papéis desnecessários?","Papéis velhos, documentos sem uso, avisos vencidos."],
  ["1.3","Quantidade de material é adequada para o uso do setor?","Material demais estocado ou material faltando."],
  ["1.4","Os dados ou informações disponíveis no quadro de aviso estão atualizados?","Quadro de avisos com informação velha ou vencida."],
  ["1.5","O acesso a itens utilizados todos os dias estão adequados?","Coisas de uso diário difíceis de pegar, longe ou no alto."],
  ["1.6","Há uso correto dos recursos do setor? (Ex.: Energia elétrica, papel, matéria-prima, etc.)","Luz ou ar ligado sem ninguém, desperdício de papel ou material."],
  ["1.7","O ambiente como um todo está sem \"poluição visual\"?","Cartazes demais, papéis colados, bagunça visual."]
 ]},
 {n:2, nome:"Ordenação", jp:"Seiton", lema:"Cada coisa no seu lugar", c:"--s2", itens:[
  ["2.1","Todos os itens/materiais de trabalho estão ordenados de forma organizada nos seus locais adequados?","Ferramentas e materiais fora do lugar ou sem lugar definido."],
  ["2.2","Armários e gavetas se encontram organizados?","Armários e gavetas bagunçados."],
  ["2.3","Existem objetos pessoais junto a itens e locais de trabalho?","Bolsa, comida, objetos pessoais misturados no posto de trabalho."],
  ["2.4","Os materiais de consumo estão armazenados em locais adequados?","Material de consumo guardado no lugar errado."],
  ["2.5","As áreas de circulação (corredores e passagens) estão demarcadas e desobstruídas?","Corredor bloqueado ou sem faixa de demarcação."],
  ["2.6","Há fios de eletricidade, telefônicos espalhados pelo chão ou mesmo mal fixados nas paredes?","Fios soltos no chão ou mal presos na parede."],
  ["2.7","O arquivo inativo está organizado, com a disposição e proteção dos documentos adequado?","Arquivo morto bagunçado ou documentos sem proteção."],
  ["2.8","As paredes e elementos estruturais encontram-se em boas condições, sem fissuras/rachaduras?","Rachaduras ou trincas em paredes, colunas ou vigas.","Inspeção Predial"],
  ["2.9","O ambiente está isento de goteiras?","Goteira ou mancha de infiltração no teto.","Inspeção Predial"],
  ["2.10","Os pisos internos encontram-se limpos e em bom estado, sem desplacamento, rachaduras, não escorregadios e rejuntados?","Piso sujo, quebrado, solto, escorregadio ou sem rejunte.","Inspeção Predial"],
  ["2.11","As partes elétricas de linha viva estão protegidas do toque acidental?","Fios ou partes elétricas expostas que alguém pode encostar.","Inspeção Predial"],
  ["2.12","Outros (Inspeção Predial)","Outro problema no prédio que não está na lista.","Inspeção Predial"]
 ]},
 {n:3, nome:"Limpeza", jp:"Seisou", lema:"Tudo limpo e conservado", c:"--s3", itens:[
  ["3.1","As lixeiras estão em quantidades suficientes?","Falta lixeira ou lixeira transbordando."],
  ["3.2","Os equipamentos em geral, máquinas e mobiliários, móveis estão em bom estado de conservação e limpeza?","Máquinas, móveis ou equipamentos sujos ou estragados."],
  ["3.3","O ambiente, no geral, está agradável, conservado, limpo e isento de umidade e poeira?","Ambiente sujo, com poeira, mofo ou umidade."]
 ]},
 {n:4, nome:"Saúde", jp:"Seiketsu", lema:"Ambiente seguro e saudável", c:"--s4", itens:[
  ["4.1","A iluminação e ventilação é suficiente?","Lugar escuro ou abafado, lâmpada queimada."],
  ["4.2","Existem riscos potenciais de acidentes?","Algo que pode machucar: quina, objeto que pode cair, piso molhado."],
  ["4.3","Os EPI's estão sendo utilizados corretamente?","Pessoas sem EPI ou usando de forma errada."],
  ["4.4","Os banheiros estão em condição de higiene satisfatória?","Banheiro sujo, sem papel ou sem sabonete."],
  ["4.5","Existe tampa de proteção/identificação de voltagem nas tomadas?","Tomada sem tampa ou sem indicação 110V / 220V."],
  ["4.6","As FDS's dos produtos químicos estão disponíveis para consulta no local de armazenamento e aplicação?","Produto químico sem a ficha (FDS) disponível no local.","Inspeção FDS"],
  ["4.7","As FDS's dos produtos químicos estão de acordo com a NBR 14725 (16 itens)? (Item 4.2 - IS-UTL-22)","Ficha (FDS) incompleta: precisa ter as 16 seções.","Inspeção FDS"],
  ["4.8","Os recipientes contendo produtos químicos encontram-se devidamente rotulados? (Item 4.3 - IS-UTL-22)","Frasco ou galão de produto químico sem rótulo.","Inspeção FDS"],
  ["4.9","As FDS's apresentadas estão atualizadas? Revisão no mínimo de 2023 (Item 4.4 - IS-UTL-22)","Ficha (FDS) com data de revisão anterior a 2023.","Inspeção FDS"]
 ]},
 {n:5, nome:"Autodisciplina", jp:"Shitsuke", lema:"Manter o padrão todo dia", c:"--s5", itens:[
  ["5.1","Nos intervalos e em trocas de turno, o ambiente é deixado em ordem?","Depois do intervalo ou da troca de turno, o lugar fica bagunçado."],
  ["5.2","É realizado o uso correto de ferramentas, máquinas e equipamentos?","Ferramenta ou máquina usada de forma errada."],
  ["5.3","A apresentação pessoal, uso do crachá, uniforme e higiene pessoal estão adequados?","Sem crachá, uniforme incompleto ou falta de higiene."],
  ["5.4","As não-conformidades levantadas na última auditoria foram sanadas?","Problema da última auditoria que continua sem solução."]
 ]}
];
const CATS = [["adm","Administrativo"],["op","Operação"],["man","Manutenção"]];
const PTS = {registro:0, resolucao:3, rapido:1, rapidoDias:3, boa:5, atraso:-5, atrasoDias:10};

function findItem(code){
  for(const s of SENSOS) for(const it of s.itens) if(it[0]===code) return {s, code:it[0], q:it[1], hint:it[2], grp:it[3]||""};
  return null;
}
const sensoBy = n => SENSOS.find(s=>s.n===Number(n));

/* ============ ESTADO ============ */
const S = {
  view:"home", db:null, user:null, assets:null, downloads:null,
  ready:false, noDb:false, canWrite:true, isAdmin:false, uid:null,
  setores:[], geral:{pesoSurpresa:50}, regs:{}, vals:{}, rodadas:[], notas:{}, placarRod:"geral", admRod:null,
  setorId:null, draft:{}, filtro:"todos", catTab:"adm", sem:null, detId:null, back:"home",
  saving:false, err:"", profiles:{}
};
const photoCache = {};

/* ============ UTIL ============ */
const $app = document.getElementById("app");
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const fmt = iso => iso ? iso.split("-").reverse().join("/") : "—";
const daysBetween = (a,b) => Math.round((new Date(b+"T12:00")-new Date(a+"T12:00"))/86400000);
const newId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const setor = id => S.setores.find(x=>x.id===id);
function toast(msg){ document.querySelectorAll(".toast").forEach(x=>x.remove()); const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }
function lsGet(k){ try{return localStorage.getItem(k);}catch(e){return null;} }
function lsSet(k,v){ try{localStorage.setItem(k,v);}catch(e){} }

/* ============ PONTUAÇÃO ============ */
function effRes(r,v){
  if(!v||!v.resolucao) return undefined;
  if(v.resolucaoRef!==undefined && v.resolucaoRef!==(r.resolvidoEm||"")) return undefined;
  return v.resolucao;
}
function isOpen(r){ return r.tipo==="nc" && (r.status!=="resolvida" || effRes(r,S.vals[r.id])==="recusado"); }
function pontosRegistro(r, v){
  let ok=0, pend=0;
  const vreg = v?.registro, vres = effRes(r,v);
  if(vreg==="recusado") return {ok:0,pend:0};
  if(r.tipo==="boa"){ if(vreg==="ok") ok+=PTS.boa; else pend+=PTS.boa; return {ok,pend}; }
  if(vreg==="ok") ok+=PTS.registro; else pend+=PTS.registro;
  if(r.status==="resolvida" && vres!=="recusado"){
    {
      let p = PTS.resolucao + (daysBetween(r.data, r.dataResolucao)<=PTS.rapidoDias ? PTS.rapido : 0);
      if(vres==="ok") ok+=p; else pend+=p;
    }
  } else if(daysBetween(r.data, today())>PTS.atrasoDias){ ok+=PTS.atraso; }
  return {ok,pend};
}
/* ---------- RODADAS ---------- */
function rodadas(){ return (S.rodadas&&S.rodadas.length)?S.rodadas:ROD_PADRAO; }
function rodadaAtiva(){
  const t=today();
  return rodadas().find(r=>r.tipo==="auto"&&r.inicio&&r.inicio<=t&&(!r.fim||t<=r.fim))||null;
}
function naRodada(reg, rod){ return rod&&rod.tipo==="auto"&&rod.inicio&&reg.data>=rod.inicio&&(!rod.fim||reg.data<=rod.fim); }
function nota(rodId,setId){ return (S.notas?.[rodId]||{})[setId]||{}; }
const numOrNull = v => (v===undefined||v===null||v==="") ? null : Number(v);
function finalManual(rodId,setId){
  const n=nota(rodId,setId), aud=numOrNull(n.aud), pr=numOrNull(n.prazos), fin=numOrNull(n.final);
  const pA=50;
  const calc = pA>=100 ? aud : pA<=0 ? pr : (aud!==null&&pr!==null ? (pA*aud+(100-pA)*pr)/100 : null);
  return {aud, prazos:pr, calc, final: fin!==null?fin:calc, deliberada: fin!==null};
}
function regraAuto(){ return {modo:S.geral.modoAuto==="lider"?"lider":"meta", meta:Number(S.geral.metaPts||150)}; }
function calcSetor(setorId, rod){
  let ok=0,pend=0,abertas=0,resolvidas=0,boas=0,atrasadas=0;
  for(const r of Object.values(S.regs)){
    if(r.setorId!==setorId || !naRodada(r,rod)) continue;
    const v=S.vals[r.id]; if(v?.registro==="recusado") continue;
    const p=pontosRegistro(r,v); ok+=p.ok; pend+=p.pend;
    if(r.tipo==="boa") boas++;
    else if(!isOpen(r)) resolvidas++;
    else { abertas++; if(daysBetween(r.data,today())>PTS.atrasoDias) atrasadas++; }
  }
  return {ok,pend,abertas,resolvidas,boas,atrasadas};
}
function rankingRodada(cat, rod){
  const lista=S.setores.filter(s=>s.categoria===cat).map(s=>({s}));
  if(rod.tipo==="manual"){
    for(const x of lista){ const m=finalManual(rod.id,x.s.id); Object.assign(x,m); x.final=m.final; }
  } else {
    for(const x of lista) x.c=calcSetor(x.s.id,rod);
    const max=Math.max(0,...lista.map(x=>x.c.ok));
    const {modo,meta}=regraAuto();
    for(const x of lista){
      const pts=Math.max(0,x.c.ok);
      x.eng = modo==="meta" ? Math.min(100, meta>0?pts/meta*100:0) : (max>0?pts/max*100:0);
      x.final=x.eng;
    }
  }
  lista.sort((a,b)=>(b.final??-1)-(a.final??-1));
  return lista;
}
function rankingGeral(cat){
  const rods=rodadas(); const somaPeso=rods.reduce((a,r)=>a+Number(r.peso||0),0)||1;
  const por={}; for(const r of rods) por[r.id]=Object.fromEntries(rankingRodada(cat,r).map(x=>[x.s.id,x.final]));
  const lista=S.setores.filter(s=>s.categoria===cat).map(s=>{
    const partes=rods.map(r=>({r,v:por[r.id][s.id]}));
    const final=partes.reduce((a,p)=>a+Number(p.r.peso||0)*(p.v??0),0)/somaPeso;
    return {s,partes,final,falta:partes.some(p=>p.v===null||p.v===undefined)};
  });
  lista.sort((a,b)=>b.final-a.final);
  return lista;
}

/* ============ FOTOS ============ */
function compress(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error("Não foi possível ler a foto."));
    fr.onload=()=>{
      const img=new Image();
      img.onerror=()=>rej(new Error("Arquivo não é uma foto válida."));
      img.onload=()=>{
        let max=1100, q=.7, out="";
        for(let i=0;i<6;i++){
          const sc=Math.min(1,max/Math.max(img.width,img.height));
          const cv=document.createElement("canvas");
          cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
          cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
          out=cv.toDataURL("image/jpeg",q);
          if(out.length<180000) break;
          max=Math.round(max*.82); q=Math.max(.45,q-.07);
        }
        res(out);
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function storePhoto(dataUrl){
  if(S.assets){
    try{
      const blob = await (await fetch(dataUrl)).blob();
      const r = await S.assets.upload(blob,{type:"image/jpeg"});
      return "a:"+r.id;
    }catch(e){ /* cai para o banco */ }
  }
  if(!S.uid) throw new Error("Entre com sua conta para enviar fotos.");
  const id=newId();
  await S.db.doc("fotos/"+S.uid+"/p/"+id).set({d:dataUrl});
  photoCache[S.uid+"/"+id]=dataUrl;
  return "f:"+S.uid+"/"+id;
}
async function hydratePhotos(){
  const imgs=[...$app.querySelectorAll("img[data-ref]")];
  for(const img of imgs){
    const ref=img.dataset.ref; if(!ref) continue;
    if(ref.startsWith("a:")){ img.src="/_blob/"+ref.slice(2); continue; }
    let key, path;
    if(ref.startsWith("d:")){ key=ref.slice(2); path="fotos/"+key; }
    else if(ref.startsWith("f:")){ key=ref.slice(2); const [u,id]=key.split("/"); path="fotos/"+u+"/p/"+id; }
    else continue;
    if(photoCache[key]){ img.src=photoCache[key]; continue; }
    try{ const snap=await S.db.doc(path).get(); if(snap.exists){ photoCache[key]=snap.data().d; img.src=photoCache[key]; } }catch(e){}
  }
}
let photoTarget=null;
function pickPhoto(field, mode){
  photoTarget=field;
  const el=document.getElementById(mode==="cam"?"camIn":"galIn");
  el.value=""; el.click();
}
async function onPhotoPicked(e){
  const f=e.target.files?.[0]; if(!f||!photoTarget) return;
  try{ S.draft[photoTarget]=await compress(f); S.err=""; }
  catch(err){ S.err=err.message; }
  render();
}
document.getElementById("camIn").addEventListener("change",onPhotoPicked);
document.getElementById("galIn").addEventListener("change",onPhotoPicked);

/* ============ COMPONENTES ============ */
const back = (v,label="Voltar") => `<button class="back" data-a="go" data-v="${v}">${I("left")} ${label}</button>`;
const steps = (n,total) => `<div class="steps">${Array.from({length:total},(_,i)=>`<i class="${i<n?"on":""}"></i>`).join("")}</div><div class="steplbl">Passo ${n} de ${total}</div>`;
function photoBox(field, titulo){
  const v=S.draft[field];
  return `<div class="photo">
    ${v?`<img src="${v}" alt="${esc(titulo)}">`:`<div class="ph">${I("camera")}</div><p style="margin:4px 0 12px;color:var(--muted)">${esc(titulo)}</p>`}
    <div class="row">
      <button class="btn ${v?"":"yellow"}" data-a="foto" data-f="${field}" data-m="cam">${I("camera")} ${v?"Tirar outra":"Tirar foto"}</button>
      <button class="btn" data-a="foto" data-f="${field}" data-m="gal">${I("image")} Galeria</button>
    </div></div>`;
}
function pic(ref, tag){
  return ref ? `<div class="pic"><img data-ref="${esc(ref)}" alt="${esc(tag)}"><span class="tag">${esc(tag)}</span></div>`
             : `<div class="pic empty">${tag==="Depois"?"Aguardando foto da solução":"Sem foto"}</div>`;
}
function valBadge(r){
  const v=S.vals[r.id]||{};
  if(v.registro==="recusado") return `<span class="badge rec">Recusado</span>`;
  const precisaRes = r.tipo==="nc" && r.status==="resolvida";
  const vr=effRes(r,v);
  if(v.registro==="ok" && (!precisaRes || vr==="ok")) return `<span class="badge val">✔ Validado</span>`;
  if(precisaRes && vr==="recusado") return `<span class="badge rec">Solução recusada</span>`;
  return `<span class="badge pend">Aguardando validação</span>`;
}
function regCard(r, showSetor=false){
  const it = r.tipo==="nc" ? findItem(r.item) : null;
  const s = sensoBy(r.senso);
  const titulo = r.tipo==="boa" ? (r.titulo||"Melhoria") : (it? it.code+" — "+it.hint : r.item);
  let st;
  if(r.tipo==="boa") st=`<span class="badge boa">⭐ Boa prática</span>`;
  else if(isOpen(r)&&r.status==="resolvida") st=`<span class="badge late">Refazer a solução</span>`;
  else if(r.status==="resolvida") st=`<span class="badge res">✔ Resolvido em ${Math.max(0,daysBetween(r.data,r.dataResolucao))} dia(s)</span>`;
  else { const d=daysBetween(r.data,today()); st= d>PTS.atrasoDias?`<span class="badge late">Aberto há ${d} dias</span>`:`<span class="badge open">Aberto há ${d} dia(s)</span>`; }
  return `<button class="card" data-a="det" data-id="${r.id}">
    <div class="pics">${pic(r.fotoAntes,"Antes")}${pic(r.fotoDepois,"Depois")}</div>
    <b class="t">${esc(titulo)}</b>
    <div class="meta">${s?esc(s.n+"º S "+s.nome):""}${showSetor&&setor(r.setorId)?" | "+esc(setor(r.setorId).nome):""} | ${fmt(r.data)}</div>
    <div class="badges">${st}${valBadge(r)}</div>${motivoHtml(r)}
  </button>`;
}
function motivoHtml(r){
  const v=S.vals[r.id]||{};
  if(v.registro==="recusado") return `<div class="motivo"><b>Motivo da recusa:</b> ${esc(v.motivoRegistro||"não informado")}</div>`;
  if(effRes(r,v)==="recusado") return `<div class="motivo"><b>Solução recusada:</b> ${esc(v.motivoResolucao||"não informado")}</div>`;
  return "";
}
function avisosDe(setorId){
  const ev=[];
  for(const r of Object.values(S.regs)){
    if(r.setorId!==setorId) continue; const v=S.vals[r.id]; if(!v) continue;
    if(v.registro&&v.registroEm) ev.push({r,campo:"registro",status:v.registro,quando:v.registroEm,motivo:v.motivoRegistro});
    const vr=effRes(r,v); if(vr&&v.resolucaoEm) ev.push({r,campo:"resolucao",status:vr,quando:v.resolucaoEm,motivo:v.motivoResolucao});
  }
  return ev.sort((a,b)=>b.quando.localeCompare(a.quando));
}
function avisoHtml(e){
  const r=e.r, it=r.tipo==="nc"?findItem(r.item):null;
  const nome=r.tipo==="boa"?(r.titulo||"Melhoria"):(it?it.code+" "+it.hint:r.item);
  const fem=r.tipo==="boa"||e.campo==="resolucao";
  const oque=r.tipo==="boa"?"Melhoria":(e.campo==="registro"?"Registro do problema":"Solução do problema");
  let pts="";
  if(e.status==="ok"){ pts= r.tipo==="boa"?PTS.boa : e.campo==="registro"?PTS.registro : PTS.resolucao+(daysBetween(r.data,r.dataResolucao)<=PTS.rapidoDias?PTS.rapido:0); }
  return `<button class="aviso" data-a="det" data-id="${r.id}"><span class="i">${e.status==="ok"?"✅":"❌"}</span><div>
    <b>${oque} ${e.status==="ok"?(fem?"aprovada":"aprovado"):(fem?"recusada":"recusado")}${pts?` (+${pts} pts)`:""}</b>
    <span>${esc(nome)} | ${fmt(e.quando.slice(0,10))}</span>
    ${e.status!=="ok"?`<div class="motivo"><b>Motivo:</b> ${esc(e.motivo||"não informado")}${e.campo==="resolucao"?"<br>Toque aqui para refazer a solução.":""}</div>`:""}
  </div></button>`;
}

/* ============ TELAS ============ */
function vSemSetor(){
  if(!S.setores.length){
    return `<div class="box"><h3>Nenhum setor cadastrado ainda</h3>
      <p>${S.isAdmin?"Cadastre os setores e suas categorias para começar.":"Peça ao Setor de Qualidade para cadastrar os setores."}</p>
      ${S.isAdmin?`<button class="btn yellow big" data-a="go" data-v="admin">Cadastrar setores</button>`:""}</div>`;
  }
  return `${S.isAdmin?`<button class="act main" style="width:100%;margin-top:18px" data-a="go" data-v="admin"><span class="ibub">${I("shield")}</span><div><b>Painel da Qualidade</b><br><span>Validar, lançar notas, setores e configurações</span></div><span class="go">${I("chev")}</span></button>
     <p class="meta" style="margin:12px 2px 0">Ou escolha um setor abaixo para ver o app como a equipe vê.</p>`:""}<h2 class="q" style="margin-top:20px">Qual é o seu setor?</h2>
   <p class="help">Escolha uma vez. O aparelho vai lembrar.</p>
   ${CATS.map(([k,l])=>{
     const ss=S.setores.filter(s=>s.categoria===k); if(!ss.length) return "";
     return `<div class="grouplbl">${l}</div>`+ss.map(s=>`<button class="item" data-a="setor" data-id="${s.id}"><b>${esc(s.nome)}</b></button>`).join("");
   }).join("")}`;
}
const ICONS={
 camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
 wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
 star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
 home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
 hist:'<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
 trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
 help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
 chev:'<path d="m9 18 6-6-6-6"/>',
 left:'<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
 sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
 building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
 clip:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
 flag:'<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'
};
const I = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||""}</svg>`;
function naoVistos(setId){ const vis=lsGet("5s-visto-"+setId)||""; return avisosDe(setId).filter(e=>e.quando>vis); }
function vHome(){
  const st=setor(S.setorId);
  if(!st) return vSemSetor();
  const ativa=rodadaAtiva(); const c=ativa?calcSetor(st.id,ativa):{ok:0,pend:0,resolvidas:0,boas:0};
  const abertasTot=Object.values(S.regs).filter(r=>r.setorId===st.id&&isOpen(r)&&S.vals[r.id]?.registro!=="recusado").length;
  const cat=(CATS.find(x=>x[0]===st.categoria)||[,""])[1];
  const {modo,meta}=regraAuto(); const pts=Math.max(0,c.ok);
  let pct=0, mid, hint;
  if(!ativa){ mid=`<b>A viagem ainda não começou</b>`; hint="Pode registrar normalmente: os pontos começam a contar quando a rodada de autoauditoria abrir."; }
  else if(modo==="meta"){ pct=Math.min(100,pts/meta*100); mid=`<b>${pts} pts</b> percorridos de ${meta} <span class="pctb">${Math.round(pct)}%</span>`;
    const dr=diasRodada(ativa);
    hint = pts>=meta ? "🎉 Meta batida! Nota 100 na autoauditoria." : `Faltam <b>${meta-pts} pontos</b>${dr&&dr.estado==="durante"?` e <b>${dr.dias} dia(s)</b>`:""} para a meta.`; }
  else { const x=rankingRodada(st.categoria,ativa).find(y=>y.s.id===st.id); pct=x?x.final:0; mid=`<b>${pts} pts</b> percorridos`; hint=`Nota da autoauditoria hoje: <b>${Math.round(pct)}</b>.`; }
  if(ativa&&c.pend) hint+=` Mais ${c.pend} pts aguardando validação.`;
  const C=2*Math.PI*50;
  const nov=naoVistos(st.id);
  return `
  <section class="hero">
    <div class="hero-top"><div><span>Meu setor (${esc(cat)})</span><b>${esc(st.nome)}</b></div><button class="pill" data-a="trocar">Trocar</button></div>
    <div class="viagem">
      <div class="viagem-top"><span>Partida<b>${ativa?fmt(ativa.inicio).slice(0,5):"—"}</b></span><span class="dest">Destino<b>${modo==="meta"?meta+" pts":"Meta"}</b></span></div>
      <div class="estrada" role="img" aria-label="${ativa?`${pts} pontos${modo==="meta"?` de ${meta}`:""}`:"Rodada não começou"}">
        <div class="estrada-feita" style="width:${pct.toFixed(1)}%"></div>
        <div class="estrada-faixa"></div>
        <div class="chegada">${I("flag")}</div>
        <div class="onibus" style="left:${pct.toFixed(1)}%;transform:translateX(-${pct.toFixed(1)}%)"><svg viewBox="0 0 66 30" aria-hidden="true"><rect x="1" y="2" width="62" height="21" rx="5" fill="#1CCFC9"/><path d="M52 2h6a5 5 0 0 1 5 5v9H52z" fill="#062E2A" opacity=".88"/><rect x="6" y="6" width="42" height="8" rx="2" fill="#062E2A" opacity=".88"/><rect x="6" y="16.5" width="44" height="1.8" rx=".9" fill="#F30027"/><circle cx="16" cy="24" r="4.4" fill="#0B1413" stroke="#D5E3E1" stroke-width="1.6"/><circle cx="48" cy="24" r="4.4" fill="#0B1413" stroke="#D5E3E1" stroke-width="1.6"/></svg></div>
      </div>
      <div class="viagem-info">${mid}</div>
    </div>
    <div class="hero-body">
      <div class="hstats">
        <div class="hstat bad"><span>Abertos</span><b>${abertasTot}</b></div>
        <div class="hstat"><span>Resolvidos</span><b>${c.resolvidas}</b></div>
        <div class="hstat"><span>Melhorias</span><b>${c.boas}</b></div>
      </div>
    </div>
    <div class="hint">${hint}</div>
  </section>
  ${nov.length?`<div class="box avisos"><h3 style="display:flex;align-items:center;gap:8px">${I("bell")} Novidades da Qualidade</h3>${nov.slice(0,5).map(avisoHtml).join("")}
     ${nov.length>5?`<p class="meta">E mais ${nov.length-5} em Avisos.</p>`:""}<button class="btn yellow" style="width:100%;margin-top:10px" data-a="entendi">Entendi</button></div>`:""}
  ${!S.canWrite?`<div class="notice">Você pode ver, mas não pode registrar nesta página. Verifique a internet e abra o link de novo.</div>`:""}
  <div class="sect">O que você quer fazer?</div>
  <div class="acts">
    <button class="act main" data-a="novo" data-v="nc1"><span class="ibub">${I("camera")}</span><div><b>Achei um problema</b><br><span>Tire foto do que está errado</span></div><span class="go">${I("chev")}</span></button>
    <button class="act" style="--c:var(--ok)" data-a="go" data-v="resolver"><span class="ibub">${I("wrench")}</span><b>Resolvi um problema</b><span>${abertasTot?abertasTot+" esperando solução":"Nenhum aberto"}</span></button>
    <button class="act" style="--c:var(--s5)" data-a="novo" data-v="boa"><span class="ibub">${I("star")}</span><b>Fiz uma melhoria</b><span>Vale ${PTS.boa} pontos</span></button>
  </div>`;
}
function navHtml(){
  const n=setor(S.setorId)?naoVistos(S.setorId).length:0;
  const it=[["home","home","Início"],["historico","hist","Histórico"],["placar","trophy","Placar"],["avisos","bell","Avisos"],["regras","help","Ajuda"]];
  return `<div class="nav-in">${it.map(([v,ic,l])=>`<button class="navbtn ${S.view===v?"on":""}" data-a="go" data-v="${v}" ${S.view===v?'aria-current="page"':""}>${I(ic)}<span>${l}</span>${v==="avisos"&&n?`<span class="dot">${n}</span>`:""}</button>`).join("")}</div>`;
}
function vNc1(){
  return back("home")+steps(1,3)+`<h2 class="q">Qual é o tipo do problema?</h2>
  ${SENSOS.map(s=>`<button class="senso" style="--c:var(${s.c})" data-a="senso" data-n="${s.n}">
     <span class="n">${s.n}º</span><div><b>${s.nome}</b><span>${s.lema}</span></div><span class="go">${I("chev")}</span></button>`).join("")}`;
}
function vNc2(){
  const s=sensoBy(S.draft.senso); if(!s) return vNc1();
  let html=back("nc1")+steps(2,3)+`<h2 class="q">O que está errado?</h2><p class="help">Toque no item que tem o problema.</p>`;
  let grp="";
  for(const it of s.itens){
    const g=it[3]||"";
    if(g!==grp){ html+=`<div class="grouplbl">${esc(g)}</div>`; grp=g; }
    html+=`<button class="item" style="--c:var(${s.c})" data-a="item" data-code="${it[0]}">
      <b><span class="code">${it[0]}</span>${esc(it[2])}</b><small>Item do checklist: ${esc(it[1])}</small></button>`;
  }
  return html;
}
function vNc3(){
  const it=findItem(S.draft.item); if(!it) return vNc1();
  return back("nc2")+steps(3,3)+`<h2 class="q">Tire a foto do problema</h2>
   <div class="chosen" style="--c:var(${it.s.c})"><b>${it.code}</b> ${esc(it.hint)}</div>
   <label class="f">Foto do problema</label>${photoBox("fotoAntes","Mostre bem o problema na foto")}
   <label class="f" for="dt">Dia que encontrou</label><input type="date" id="dt" value="${esc(S.draft.data||today())}" max="${today()}">
   <label class="f" for="ds">Onde e o que viu? <em>(opcional)</em></label>
   <textarea id="ds" placeholder="Ex.: Fio solto atrás da bancada 3">${esc(S.draft.descricao||"")}</textarea>
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn yellow big" data-a="salvarNc" ${S.saving?"disabled":""}>${S.saving?"Enviando…":"Enviar registro"}</button>`;
}
function vOk(){
  const r=S.regs[S.lastId];
  const ehBoa=r?.tipo==="boa", ehRes=S.lastKind==="res";
  let txt, pts;
  if(ehBoa){ txt="Melhoria registrada!"; pts=PTS.boa; }
  else if(ehRes){ txt="Problema resolvido!"; const rap=r&&daysBetween(r.data,r.dataResolucao)<=PTS.rapidoDias; pts=PTS.resolucao+(rap?PTS.rapido:0); }
  else { txt="Problema registrado!"; pts=PTS.registro; }
  return `<div class="done"><div class="emoji">${ehRes||ehBoa?"🎉":"✅"}</div><h2>${txt}</h2>
   ${pts>0?`<p>Seu setor ganha <b>+${pts} pontos</b> quando o Setor de Qualidade validar.</p>`
     :`<p>Agora é resolver! Com a foto da solução, o setor ganha <b>+${PTS.resolucao} pontos</b>, ou <b>+${PTS.resolucao+PTS.rapido}</b> se resolver em até ${PTS.rapidoDias} dias.</p><p class="meta">Atenção: se ficar aberto mais de ${PTS.atrasoDias} dias, o setor perde ${Math.abs(PTS.atraso)} pontos.</p>`}
   ${!ehRes&&!ehBoa?`<button class="btn yellow big" data-a="resolverAgora">🔧 Já resolvi, registrar solução</button>`:""}
   <button class="btn big" data-a="go" data-v="home">Voltar ao início</button></div>`;
}
function vResolver(){
  const abertas=Object.values(S.regs).filter(r=>r.setorId===S.setorId&&isOpen(r)&&S.vals[r.id]?.registro!=="recusado").sort((a,b)=>a.data.localeCompare(b.data));
  return back("home")+`<h2 class="q">Qual problema foi resolvido?</h2>
   ${abertas.length?`<p class="help">Os mais antigos aparecem primeiro.</p>`+abertas.map(r=>regCard(r).replace('data-a="det"','data-a="resolver1"')).join("")
   :`<div class="box"><h3>Nenhum problema aberto 👏</h3><p>Quando alguém registrar um problema, ele aparece aqui.</p><button class="btn yellow big" data-a="novo" data-v="nc1">📷 Registrar um problema</button></div>`}`;
}
function vResForm(){
  const r=S.regs[S.draft.regId]; if(!r) return vResolver();
  const it=findItem(r.item);
  return back("resolver")+`<h2 class="q">Como foi resolvido?</h2>
   <div class="chosen" style="--c:var(${it?.s.c||"--line"})"><b>${esc(r.item)}</b> ${esc(it?.hint||"")}<br><span class="meta">Encontrado em ${fmt(r.data)}</span></div>
   <div class="card" style="cursor:default"><div class="pics one">${pic(r.fotoAntes,"Antes")}</div>${motivoHtml(r)}</div>
   <label class="f" for="tr">O que foi feito?</label>
   <textarea id="tr" placeholder="Ex.: Fio preso com abraçadeira e canaleta">${esc(S.draft.tratativa||"")}</textarea>
   <label class="f" for="dr">Dia que resolveu</label><input type="date" id="dr" value="${esc(S.draft.dataResolucao||today())}" min="${r.data}" max="${today()}">
   <label class="f" for="qm">Quem resolveu?</label><input type="text" id="qm" value="${esc(S.draft.resolvidoPor||"")}" placeholder="Nome de quem fez">
   <label class="f">Foto depois de resolvido</label>${photoBox("fotoDepois","Tire a foto do mesmo lugar, já arrumado")}
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn green big" data-a="salvarRes" ${S.saving?"disabled":""}>${S.saving?"Enviando…":"Registrar solução"}</button>`;
}
function vBoa(){
  return back("home")+`<h2 class="q">Conte a sua melhoria</h2>
   <p class="help">Algo que vocês fizeram além do básico: uma ideia, uma organização nova, um jeito melhor de trabalhar.</p>
   <label class="f">Ela ajuda em qual senso?</label>
   <div class="chips" style="flex-wrap:wrap">${SENSOS.map(s=>`<button class="chip ${Number(S.draft.senso)===s.n?"on":""}" data-a="boaSenso" data-n="${s.n}">${s.n}º ${s.nome}</button>`).join("")}</div>
   <label class="f" for="bt">O que vocês melhoraram?</label><input type="text" id="bt" value="${esc(S.draft.titulo||"")}" placeholder="Ex.: Quadro de sombra para as ferramentas">
   <label class="f" for="bd">Explique um pouco <em>(opcional)</em></label><textarea id="bd" placeholder="Como era antes e como ficou">${esc(S.draft.descricao||"")}</textarea>
   <label class="f">Foto de antes <em>(se tiver)</em></label>${photoBox("fotoAntes","Como era antes")}
   <label class="f">Foto de como ficou</label>${photoBox("fotoDepois","Como ficou depois")}
   <label class="f" for="bdt">Dia</label><input type="date" id="bdt" value="${esc(S.draft.data||today())}" max="${today()}">
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn yellow big" data-a="salvarBoa" ${S.saving?"disabled":""}>${S.saving?"Enviando…":"Enviar melhoria"}</button>`;
}
function vHistorico(){
  const todos=(S.geral.verTodos||S.isAdmin)&&S.histTodos;
  const all=Object.values(S.regs).filter(r=>todos||r.setorId===S.setorId).sort((a,b)=>(b.data+b.criadoEm).localeCompare(a.data+a.criadoEm));
  const f=S.filtro;
  const list=all.filter(r=> f==="todos" || (f==="abertos"&&isOpen(r)) || (f==="resolvidos"&&r.tipo==="nc"&&!isOpen(r)) || (f==="melhorias"&&r.tipo==="boa"));
  const ch=(k,l)=>`<button class="chip ${f===k?"on":""}" data-a="filtro" data-v="${k}">${l}</button>`;
  const pode=S.geral.verTodos||S.isAdmin;
  return `<h2 class="q" style="margin-top:20px">Histórico ${todos?"de todos os setores":"do setor"}</h2>
   ${pode?`<div class="chips"><button class="chip ${!todos?"on":""}" data-a="histTodos" data-v="0">Meu setor</button><button class="chip ${todos?"on":""}" data-a="histTodos" data-v="1">Todos os setores</button></div>`:""}
   <div class="chips">${ch("todos","Todos")}${ch("abertos","Abertos")}${ch("resolvidos","Resolvidos")}${ch("melhorias","Melhorias")}</div>
   ${list.length?list.map(r=>regCard(r,todos)).join(""):`<div class="box"><p>Nada por aqui ainda.</p></div>`}`;
}
function vDetalhe(){
  const r=S.regs[S.detId]; if(!r) return back(S.back)+`<div class="box"><p>Registro não encontrado.</p></div>`;
  const it=r.tipo==="nc"?findItem(r.item):null; const s=sensoBy(r.senso);
  const v=S.vals[r.id]||{};
  const titulo=r.tipo==="boa"?r.titulo:(it?it.hint:r.item);
  let adminBox="";
  if(S.isAdmin){
    const blk=(campo,label)=>{ const st=campo==="resolucao"?effRes(r,v):v[campo];
      if(S.recusando===campo) return `<p style="margin:12px 0 0"><b>${label}: recusar</b></p>
        <label class="f" for="motivo">Motivo da recusa <em>(o setor vai ver)</em></label>
        <textarea id="motivo" placeholder="Ex.: A foto não mostra o local resolvido. Tire de novo do mesmo ângulo.">${esc(S.draft.motivo||"")}</textarea>
        ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
        <div class="valbar"><button class="btn red" data-a="confirmRecusa" data-c="${campo}">Confirmar recusa</button><button class="btn" data-a="cancelRecusa">Cancelar</button></div>`;
      return `<p style="margin:12px 0 0"><b>${label}:</b> ${st==="ok"?"✔ Aprovado":st==="recusado"?"✖ Recusado":"Pendente"}</p>
      <div class="valbar"><button class="btn green" data-a="validar" data-c="${campo}" data-s="ok">Aprovar</button><button class="btn red" data-a="pedeRecusa" data-c="${campo}">Recusar</button></div>`; };
    adminBox=`<div class="box"><h3>Validação do Setor de Qualidade</h3>
      ${blk("registro", r.tipo==="boa"?"Melhoria":"Registro do problema")}
      ${r.tipo==="nc"&&r.status==="resolvida"?blk("resolucao","Solução"):""}
      <button class="btn red" style="width:100%;margin-top:16px" data-a="excluir">Excluir registro</button></div>`;
  }
  return back(S.back)+`<div class="det">
    <div class="meta">${s?esc(s.n+"º S "+s.nome):""}${it?" | Item "+esc(it.code):""}${setor(r.setorId)?" | "+esc(setor(r.setorId).nome):""}</div>
    <h2>${esc(titulo)}</h2><div class="badges">${valBadge(r)}</div>${motivoHtml(r)}
    <div class="card" style="cursor:default;margin-top:12px"><div class="pics">${pic(r.fotoAntes,"Antes")}${pic(r.fotoDepois,"Depois")}</div></div>
    <dl>
      ${it?`<dt>Item do checklist</dt><dd>${esc(it.q)}</dd>`:""}
      <dt>${r.tipo==="boa"?"Data":"Encontrado em"}</dt><dd>${fmt(r.data)}${S.profiles[r.criadoPor]?.name?" por "+esc(S.profiles[r.criadoPor].name):""}</dd>
      ${r.descricao?`<dt>Descrição</dt><dd>${esc(r.descricao)}</dd>`:""}
      ${r.tipo==="nc"&&r.status==="resolvida"?`<dt>Solução</dt><dd>${esc(r.tratativa)}</dd><dt>Resolvido em</dt><dd>${fmt(r.dataResolucao)} (${Math.max(0,daysBetween(r.data,r.dataResolucao))} dias)${r.resolvidoPor?" por "+esc(r.resolvidoPor):""}</dd>`:""}
    </dl>
    ${isOpen(r)&&v.registro!=="recusado"&&S.canWrite?`<button class="btn green big" data-a="resolver1" data-id="${r.id}">🔧 ${r.status==="resolvida"?"Refazer a solução":"Registrar solução"}</button>`:""}
    ${adminBox}</div>`;
}
function vPlacar(){
  const rods=ordRodadas();
  if(!rods.length) return `<h2 class="q" style="margin-top:20px">Placar</h2><div class="box"><p>O Setor de Qualidade ainda não configurou as rodadas.</p></div>`;
  const sel=S.placarRod||"geral"; const rod=rods.find(r=>r.id===sel);
  const f=v=>v===null||v===undefined?"—":(Math.round(v*10)/10).toString().replace(".",",");
  let itens=[], rodape="";
  if(!rod){
    itens=rankingGeral(S.catTab).map(x=>({nome:x.s.nome,final:x.final,info:x.partes.map(p=>esc(p.r.nome)+": "+f(p.v)).join("<br>")}));
    rodape=`Resultado final = ${rods.map(r=>esc(r.nome)+" ("+(r.peso||0)+"%)").join(" + ")}. Rodada sem nota conta como zero até ser lançada.`;
  } else if(rod.tipo==="manual"){
    const pA=50;
    itens=rankingRodada(S.catTab,rod).map(x=>({nome:x.s.nome,final:x.final,info:(pA>=100?`Checklist: ${x.aud===null?"—":x.aud+"%"}`:`Checklist: ${x.aud===null?"—":x.aud+"%"}<br>Plano de ação: ${x.prazos===null?"—":x.prazos+"%"}`)+(x.deliberada?"<br>Nota definida pela Qualidade":"")}));
    rodape= pA>=100 ? `Nota da rodada = resultado do checklist da auditoria surpresa.` : `Nota da rodada = média entre o resultado do checklist e o cumprimento do plano de ação (ações feitas no prazo).`;
  } else {
    const {modo,meta}=regraAuto();
    itens=rankingRodada(S.catTab,rod).map(x=>({nome:x.s.nome,final:x.final,info:`${x.c.ok} pontos${x.c.pend?` (+${x.c.pend} aguardando)`:""}<br>${x.c.resolvidas} resolvido(s), ${x.c.boas} melhoria(s)`}));
    rodape=`Nota da autoauditoria: ${modo==="meta"?`quem chega a ${meta} pontos tira 100`:`o setor com mais pontos tira 100`}. Conta o que foi registrado de ${fmt(rod.inicio)} a ${rod.fim?fmt(rod.fim):"hoje"}.`;
  }
  const comNota=itens.filter(x=>(x.final||0)>0);
  let podio="", resto=itens;
  if(comNota.length>=3){
    const t=itens.slice(0,3); resto=itens.slice(3);
    const pod=(x,cls,md)=>`<div class="pod ${cls}"><div class="who">${esc(x.nome)}</div><div class="blk"><span>${md}</span><b>${f(x.final)}</b></div></div>`;
    podio=`<div class="podium">${pod(t[1],"p2","🥈")}${pod(t[0],"p1","🥇")}${pod(t[2],"p3","🥉")}</div>`;
  }
  const off=itens.length-resto.length;
  return `<h2 class="q" style="margin-top:20px">Placar</h2>
   <select id="placarSel" aria-label="Rodada"><option value="geral" ${!rod?"selected":""}>Resultado final (todas as rodadas)</option>${rods.map(r=>`<option value="${r.id}" ${rod&&rod.id===r.id?"selected":""}>${esc(r.nome)}${perLabel(r)?" ("+perLabel(r)+")":""}</option>`).join("")}</select>
   <div class="chips" style="margin-top:10px">${CATS.map(([k,l])=>`<button class="chip ${S.catTab===k?"on":""}" data-a="cat" data-v="${k}">${l}</button>`).join("")}</div>
   ${podio}
   ${resto.map((x,i)=>`<div class="rank ${off===0&&i===0&&x.final>0?"p1":""}"><span class="pos">${off+i+1}º</span>
      <div class="nm"><b>${esc(x.nome)}</b><span class="meta">${x.info}</span></div>
      <div class="sc">${f(x.final)}<small>nota</small></div></div>`).join("")}
   ${!itens.length?`<div class="box"><p>Nenhum setor nesta categoria.</p></div>`:""}
   ${podio?`<details class="box"><summary style="cursor:pointer;font-weight:700">Detalhes do pódio</summary>${itens.slice(0,3).map((x,i)=>`<p style="margin:10px 0 0"><b>${i+1}º ${esc(x.nome)}</b><br><span class="meta">${x.info}</span></p>`).join("")}</details>`:""}
   <p class="meta">${rodape}</p>`;
}
/* períodos das rodadas */
function semestres(){ const y=Number(today().slice(0,4)); const out=[]; for(let a=y-1;a<=y+2;a++){ out.push([`${a}-1`,`1º semestre ${a}`,`${a}-01-01`,`${a}-06-30`]); out.push([`${a}-2`,`2º semestre ${a}`,`${a}-07-01`,`${a}-12-31`]); } return out; }
function perKey(r){ const m=semestres().find(x=>x[2]===r.inicio&&x[3]===r.fim); return m?m[0]:(r.inicio||r.fim?"custom":""); }
function perLabel(r){ const m=semestres().find(x=>x[2]===r.inicio&&x[3]===r.fim); if(m) return m[1]; if(r.inicio) return fmt(r.inicio)+(r.fim?" a "+fmt(r.fim):""); return ""; }
function ordRodadas(){ return [...rodadas()].sort((a,b)=>(a.inicio||"9999").localeCompare(b.inicio||"9999")); }
function vAvisos(){
  const ev=avisosDe(S.setorId);
  return `<h2 class="q" style="margin-top:20px">Avisos</h2><p class="help">Respostas do Setor de Qualidade para o seu setor.</p>
    ${ev.length?`<div class="box">${ev.map(avisoHtml).join("")}</div>`:`<div class="box"><p>Nenhum aviso ainda. Quando o Setor de Qualidade aprovar ou recusar algo, aparece aqui.</p></div>`}`;
}
function diasRodada(rod){
  if(!rod||!rod.inicio) return null;
  const t=today();
  if(t<rod.inicio) return {estado:"antes",dias:daysBetween(t,rod.inicio)};
  if(!rod.fim) return {estado:"aberta",dias:null};
  const d=daysBetween(t,rod.fim);
  return d<0 ? {estado:"fim",dias:0} : {estado:"durante",dias:d};
}
function ritmoHtml(rod,falta){
  const r=diasRodada(rod); if(!r) return "";
  if(r.estado==="antes") return `<div class="ritmo">⏳ A rodada começa em <b>${r.dias} dia(s)</b> (${fmt(rod.inicio)}).</div>`;
  if(r.estado==="fim") return `<div class="ritmo">🏁 A rodada terminou em ${fmt(rod.fim)}.</div>`;
  if(r.estado==="aberta") return "";
  let txt=`⏳ Faltam <b>${r.dias===0?"menos de 1 dia":r.dias+" dia(s)"}</b> para o fim da rodada (${fmt(rod.fim)}).`;
  if(falta>0){
    const sem=Math.max(1,Math.ceil(r.dias/7)); const ps=Math.ceil(falta/sem);
    const porProb=PTS.registro+PTS.resolucao+PTS.rapido; const it=Math.ceil(ps/porProb);
    txt+=`<br>Para bater a meta: cerca de <b>${ps} pontos por semana</b> (uns ${it} problema(s) resolvido(s) em até ${PTS.rapidoDias} dias).`;
  }
  return `<div class="ritmo">${txt}</div>`;
}
function metaBox(){
  const {modo,meta}=regraAuto();
  const rod=rodadaAtiva()||rodadas().find(r=>r.tipo==="auto");
  const porProblema=PTS.registro+PTS.resolucao+PTS.rapido;   // achar + resolver em até 7 dias
  const nProb=Math.ceil(meta/porProblema), nBoa=Math.ceil(meta/PTS.boa);
  const mixP=Math.ceil(meta/2/porProblema), mixB=Math.max(0,Math.ceil((meta-mixP*porProblema)/PTS.boa));
  const meses = rod&&rod.inicio&&rod.fim ? Math.max(1,Math.round(daysBetween(rod.inicio,rod.fim)/30)) : 6;
  const pl=(n,a,b)=>n+" "+(n===1?a:b);
  const st=setor(S.setorId);
  let prog="";
  if(st&&rod&&modo==="meta"){
    const c=calcSetor(st.id,rod); const pts=Math.max(0,c.ok); const pct=Math.min(100,Math.round(pts/meta*100));
    const falta=Math.max(0,meta-pts);
    prog=`<div class="prog"><div class="prog-top"><b>${esc(st.nome)}</b><span>${pts} de ${meta} pontos</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="meta" style="margin:6px 0 0">${falta?`Faltam <b>${falta} pontos</b>. Nota da autoauditoria hoje: <b>${pct}</b>.`:`🎉 Meta batida! Nota da autoauditoria: <b>100</b>.`}${c.pend?` Mais ${c.pend} pontos aguardando validação.`:""}</p>${ritmoHtml(rod,falta)}</div>`;
  }
  if(modo!=="meta") return `<div class="box"><h3>🎯 Como vira nota</h3><p>O setor com mais pontos da categoria tira 100. Os outros recebem a proporção do que fizeram em relação a ele.</p></div>`;
  return `<div class="box meta-box"><h3>🎯 A meta da rodada: ${meta} pontos</h3>
    <p>Chegou a <b>${meta} pontos</b>, o setor tira <b>nota 100</b> na autoauditoria. Passar da meta não aumenta a nota, então o importante é <b>todo setor chegar lá</b>.</p>
    ${rod?`<p class="meta">Vale para registros de ${fmt(rod.inicio)} a ${rod.fim?fmt(rod.fim):"o fim da rodada"}.</p>`:""}
    ${prog}
    <p style="margin-top:14px"><b>Cada problema registrado e resolvido em até ${PTS.rapidoDias} dias vale ${porProblema} pontos:</b><br>
    <span class="meta">${PTS.registro?PTS.registro+" por registrar + ":""}${PTS.resolucao} pela solução com foto + ${PTS.rapido} de bônus pela rapidez</span></p>
    <p style="margin-top:10px"><b>Cada melhoria vale ${PTS.boa} pontos.</b></p>
    <p style="margin:14px 0 6px"><b>Jeitos de chegar a ${meta} pontos:</b></p>
    <table class="pts">
      <tr><td>🔧 ${nProb} problemas resolvidos em até ${PTS.rapidoDias} dias</td><td>${nProb*porProblema} pts</td></tr>
      <tr><td>⭐ ${nBoa} melhorias</td><td>${nBoa*PTS.boa} pts</td></tr>
      <tr><td>🔧 ${mixP} problemas resolvidos rápido + ⭐ ${mixB} melhorias</td><td>${mixP*porProblema+mixB*PTS.boa} pts</td></tr>
    </table>
    <p class="meta" style="margin-top:10px">Dica: dividindo pelos ${meses} meses da rodada, são cerca de ${pl(Math.ceil(nProb/meses),"problema resolvido","problemas resolvidos")} ou ${pl(Math.ceil(nBoa/meses),"melhoria","melhorias")} por mês.</p>
    <p class="meta">Os pontos só contam depois que o Setor de Qualidade valida. Problema aberto há mais de ${PTS.atrasoDias} dias tira ${Math.abs(PTS.atraso)} pontos do setor.</p></div>
  <div class="box"><h3>📊 Como fica o resultado final</h3>
    <p>${rodadas().length?rodadas().map(r=>`<b>${esc(r.nome)}</b>: ${r.peso||0}%`).join("<br>"):"As rodadas ainda não foram configuradas."}</p>
    <p class="meta">A auditoria surpresa e a autoauditoria viram notas de 0 a 100 e são somadas pelo peso de cada uma.</p></div>`;
}
function hostLoginBox(){
  if(!window.__HOST_AUTH) return "";
  if(S.isAdmin) return `<div class="box"><h3>Setor de Qualidade</h3><p>Você entrou como Qualidade neste aparelho.</p><button class="btn" style="width:100%" data-a="hostSair">Sair da conta da Qualidade</button></div>`;
  return `<div class="box"><h3>Acesso do Setor de Qualidade</h3><p class="meta">Só para a equipe da Qualidade. As equipes dos setores não precisam de senha.</p>
    <label class="f" for="hSenha">Senha da Qualidade</label><input type="text" id="hSenha" autocomplete="current-password" style="-webkit-text-security:disc">
    ${S.errLogin?`<div class="err">${esc(S.errLogin)}</div>`:""}
    <button class="btn yellow big" data-a="hostEntrar">Entrar</button></div>`;
}
function vRegras(){
  return `<h2 class="q" style="margin-top:20px">Como funciona</h2>
  <button class="btn" style="width:100%;margin:0 0 4px" data-a="verCapa">🚌 Ver a capa do app</button>${metaBox()}
  <div class="box"><h3>O ciclo do 5S Fácil</h3>
   <p>1. Viu algo errado no setor? <b>Tire foto</b> e registre.<br>2. Resolveu? <b>Tire foto de novo</b>, do mesmo lugar, já arrumado.<br>3. Fez algo além do básico? Registre como <b>melhoria</b>.<br>4. O Setor de Qualidade confere e <b>valida</b> os pontos. Você recebe um aviso no app quando for aprovado ou recusado.</p></div>
  <div class="box"><h3>Quantos pontos vale</h3><table class="pts">
   ${PTS.registro?`<tr><td>📷 Registrar um problema com foto</td><td>+${PTS.registro}</td></tr>`:""}
   <tr><td>🔧 Problema registrado e resolvido, com foto do antes e do depois</td><td>+${PTS.resolucao}</td></tr>
   <tr><td>⚡ Resolvido em até ${PTS.rapidoDias} dias</td><td>+${PTS.rapido} extra</td></tr>
   <tr><td>⭐ Melhoria / boa prática</td><td>+${PTS.boa}</td></tr>
   <tr><td>⏰ Problema aberto há mais de ${PTS.atrasoDias} dias</td><td style="color:var(--bad)">${PTS.atraso}</td></tr>
  </table><p class="meta" style="margin-top:10px">Registros recusados pelo Setor de Qualidade não contam. Se a solução for recusada, o problema volta para a lista e pode ser refeito. Achar problema não é ruim: é sinal de olho atento.</p></div>
  <div class="box"><h3>Dicas para uma boa foto</h3><p>Chegue perto. Mostre o problema inteiro. Use luz boa. Na foto do depois, fique no mesmo lugar da foto do antes.</p></div>
  <div class="box"><h3>Os 5 sensos</h3>${SENSOS.map(s=>`<p style="margin:6px 0"><b style="color:var(${s.c})">${s.n}º ${s.nome}</b> (${s.jp}): ${s.lema}</p>`).join("")}</div>${hostLoginBox()}`;
}
/* ================= PAINEL DA QUALIDADE (simplificado) ================= */
const ROD_PADRAO=[{id:"r1",nome:"Auditoria surpresa",tipo:"manual",inicio:"",fim:"",peso:50},{id:"r2",nome:"Autoauditoria",tipo:"auto",inicio:"",fim:"",peso:50}];
function rodSurpresa(){ return rodadas().find(r=>r.tipo==="manual"); }
function rodAuto(){ return rodadas().find(r=>r.tipo==="auto"); }
const r1 = v => v===null||v===undefined ? null : Math.round(v*10)/10;
const br = v => v===null||v===undefined ? "—" : String(r1(v)).replace(".",",");
function pendentes(){
  return Object.values(S.regs).filter(r=>{ const v=S.vals[r.id]||{}; if(v.registro==="recusado") return false;
    return !v.registro || (r.tipo==="nc"&&r.status==="resolvida"&&!effRes(r,v)); }).sort((a,b)=>a.criadoEm.localeCompare(b.criadoEm));
}
const restrito = () => back("home")+`<div class="box"><h3>Área restrita</h3><p>Esta área é exclusiva do Setor de Qualidade.</p></div>`;
const admTitulo = (t,sub) => back("admin","Painel da Qualidade")+`<h2 class="q">${t}</h2>${sub?`<p class="help">${sub}</p>`:""}`;

function vAdmin(){
  if(!S.isAdmin) return restrito();
  const pend=pendentes().length; const rs=rodSurpresa(), ra=rodAuto();
  const lancadas = rs ? S.setores.filter(s=>finalManual(rs.id,s.id).final!==null).length : 0;
  const avisos=[];
  if(!S.setores.length) avisos.push(`Comece cadastrando os <b>setores</b>.`);
  if(!ra||!ra.inicio) avisos.push(`Escolha <b>quando</b> acontece a autoauditoria em <b>Configurações</b>. Sem isso, os registros das equipes não pontuam.`);
  return `<h2 class="q" style="margin-top:20px">Painel da Qualidade</h2>
   ${avisos.map(a=>`<div class="notice">${a}</div>`).join("")}
   <div class="acts">
     <button class="act main" data-a="go" data-v="admValidar"><span class="ibub">${I("shield")}</span><div><b>Validar registros</b><br><span>${pend?`${pend} esperando sua resposta`:"Nada pendente"}</span></div>${pend?`<span class="go cnt">${pend}</span>`:`<span class="go">${I("chev")}</span>`}</button>
     <button class="act" style="--c:var(--s2)" data-a="go" data-v="admNotas"><span class="ibub">${I("clip")}</span><b>Nota da auditoria surpresa</b><span>${lancadas} de ${S.setores.length} setores lançados</span></button>
     <button class="act" style="--c:var(--s3)" data-a="go" data-v="admSetores"><span class="ibub">${I("building")}</span><b>Setores</b><span>${S.setores.length} cadastrados</span></button>
     <button class="act" style="--c:#C98A00;grid-column:1/-1;flex-direction:row;align-items:center" data-a="go" data-v="admResultados"><span class="ibub">${I("trophy")}</span><div><b>Resultados por categoria</b><br><span>Ranking e vencedores para a premiação</span></div><span class="go" style="margin-left:auto">${I("chev")}</span></button>
     <button class="act" style="--c:var(--s5);grid-column:1/-1;flex-direction:row;align-items:center" data-a="go" data-v="admConfig"><span class="ibub">${I("sliders")}</span><div><b>Configurações</b><br><span>Datas das rodadas, pesos, meta e planilha</span></div><span class="go" style="margin-left:auto">${I("chev")}</span></button>
   </div>`;
}

/* ---- Resultados por categoria (para a premiação) ---- */
function resultadosCat(cat){
  const rs=rodSurpresa(), ra=rodAuto();
  const geral=rankingGeral(cat);
  const autoRank = ra ? Object.fromEntries(rankingRodada(cat,ra).map(x=>[x.s.id,x])) : {};
  const rows=geral.map(g=>{
    const m = rs ? finalManual(rs.id,g.s.id) : {aud:null,prazos:null,final:null,deliberada:false};
    const a = autoRank[g.s.id]; const c = a?a.c:{ok:0,pend:0,resolvidas:0,boas:0,abertas:0,atrasadas:0};
    return {s:g.s, aud:m.aud, prazos:m.prazos, notaSur:m.final, delib:m.deliberada, pts:Math.max(0,c.ok), pend:c.pend, notaAuto:a?a.final:null,
      resolvidos:c.resolvidas, boas:c.boas, abertas:c.abertas, atrasadas:c.atrasadas, final:g.final, falta:g.falta};
  });
  rows.sort((x,y)=> (y.final-x.final) || ((y.notaSur??-1)-(x.notaSur??-1)) || (y.pts-x.pts));
  return rows;
}
function vAdmResultados(){
  if(!S.isAdmin) return restrito();
  const rs=rodSurpresa(), ra=rodAuto(); const pSur=Number(rs?.peso??50);
  const dr=diasRodada(ra);
  const pend=pendentes().length;
  const semNota=S.setores.filter(s=>!rs||finalManual(rs.id,s.id).final===null);
  const status = dr&&dr.estado==="fim"&&!semNota.length&&!pend ? `<span class="badge val">Resultado fechado</span>` : `<span class="badge pend">Resultado parcial</span>`;
  const avisos=[];
  if(semNota.length) avisos.push(`<b>${semNota.length} setor(es) sem nota da auditoria surpresa</b> (contam como zero): ${semNota.map(s=>esc(s.nome)).join(", ")}.`);
  if(pend) avisos.push(`<b>${pend} registro(s) esperando validação.</b> Eles ainda não contam pontos e podem mudar o resultado.`);
  if(dr&&dr.estado==="durante") avisos.push(`A autoauditoria ainda está aberta: faltam <b>${dr.dias} dia(s)</b> (até ${fmt(ra.fim)}).`);
  if(!ra||!ra.inicio) avisos.push(`O período da autoauditoria não foi definido em Configurações.`);
  const f=v=>br(v);
  const blocos=CATS.map(([k,l])=>{
    const rows=resultadosCat(k); if(!rows.length) return "";
    const v=rows[0];
    return `<div class="box res-cat">
      <div class="res-cat-top"><h3>${l}</h3><span class="meta">${rows.length} setor(es)</span></div>
      ${v.final>0?`<div class="campeao"><div class="campeao-ic">${I("trophy")}</div><div style="flex:1;min-width:0"><span>Vencedor${dr&&dr.estado==="fim"?"":" até agora"}</span><b>${esc(v.s.nome)}</b></div><div class="campeao-nota">${f(v.final)}</div></div>`:""}
      <div class="scroll"><table class="rtab">
        <thead><tr><th>#</th><th>Setor</th><th class="n">Surpresa</th><th class="n">Auto</th><th class="n">Final</th></tr></thead>
        <tbody>${rows.map((x,i)=>`<tr class="${i===0&&x.final>0?"lider":""}">
          <td class="pos">${i+1}º</td>
          <td><b>${esc(x.s.nome)}</b><br><span class="meta" style="display:block;margin-top:2px;line-height:1.35">${x.notaSur===null?"Surpresa não lançada":x.delib?"Surpresa definida pela Qualidade":`Checklist ${f(x.aud)}%, plano ${f(x.prazos)}%`}<br>${x.pts} pts: ${x.resolvidos} resolvido(s), ${x.boas} melhoria(s)${x.atrasadas?`, ${x.atrasadas} atrasado(s)`:""}</span></td>
          <td class="n">${x.notaSur===null?"—":f(x.notaSur)}</td>
          <td class="n">${x.notaAuto===null?"—":f(x.notaAuto)}</td>
          <td class="fin">${f(x.final)}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
  }).join("");
  return admTitulo("Resultados por categoria")+`
    <div class="box"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>Como sai a nota final</b>${status}</div>
      <p class="meta" style="margin:6px 0 0">Auditoria surpresa ${pSur}% + autoauditoria ${100-pSur}%${pSur===50?" (média das duas)":""}. Empate: vence a maior nota da auditoria surpresa; persistindo, mais pontos na autoauditoria.</p></div>
    ${avisos.map(a=>`<div class="notice">${a}</div>`).join("")}
    ${blocos||`<div class="box"><p>Cadastre os setores para ver os resultados.</p></div>`}
    ${S.downloads&&S.setores.length?`<button class="btn yellow big" data-a="csvRes">⬇️ Baixar resultados (planilha)</button><p class="meta" style="text-align:center">Uma linha por setor, com todas as notas, para montar a premiação.</p>`:""}`;
}
async function exportResultados(){
  const rs=rodSurpresa(), ra=rodAuto();
  const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"'; const n=v=>v===null||v===undefined?"":String(r1(v)).replace(".",",");
  const head=["Categoria","Posição","Setor","Checklist %","Plano de ação %","Nota auditoria surpresa","Nota definida pela Qualidade","Pontos autoauditoria","Nota autoauditoria","Problemas resolvidos","Melhorias","Abertos com atraso","Nota final"];
  const lines=[head.map(q).join(";")];
  for(const [k,l] of CATS) resultadosCat(k).forEach((x,i)=>lines.push([l,i+1,x.s.nome,n(x.aud),n(x.prazos),n(x.notaSur),x.delib?"sim":"",x.pts,n(x.notaAuto),x.resolvidos,x.boas,x.atrasadas,n(x.final)].map(q).join(";")));
  lines.push(""); lines.push([q("Auditoria surpresa: "+(rs&&perLabel(rs)?perLabel(rs):"período não definido")),q("Autoauditoria: "+(ra&&perLabel(ra)?perLabel(ra):"período não definido")),q("Gerado em "+fmt(today()))].join(";"));
  try{ await S.downloads.save({filename:"5S-resultados-"+today()+".csv",data:"\ufeff"+lines.join("\r\n")}); }catch(e){ if(e.code==="unavailable") toast("Download indisponível aqui."); }
}

function vAdmValidar(){
  if(!S.isAdmin) return restrito();
  const p=pendentes();
  return admTitulo("Validar registros", p.length?"Toque em um registro para ver as fotos e aprovar ou recusar.":"")+
    (p.length?p.map(r=>regCard(r,true)).join(""):`<div class="box"><h3>Tudo em dia ✅</h3><p>Não há registros esperando validação.</p></div>`);
}

function vAdmNotas(){
  if(!S.isAdmin) return restrito();
  const rs=rodSurpresa();
  if(!S.setores.length) return admTitulo("Nota da auditoria surpresa")+`<div class="box"><p>Cadastre os setores primeiro.</p><button class="btn yellow big" data-a="go" data-v="admSetores">Ir para Setores</button></div>`;
  return admTitulo("Nota da auditoria surpresa","Toque no setor para lançar o resultado da auditoria."+(rs&&perLabel(rs)?` Rodada: ${perLabel(rs)}.`:""))+
    CATS.map(([k,l])=>{ const ss=S.setores.filter(s=>s.categoria===k); if(!ss.length) return "";
      return `<div class="grouplbl">${l}</div>`+ss.map(s=>{ const m=rs?finalManual(rs.id,s.id):{final:null};
        return `<button class="item" data-a="admNota" data-id="${s.id}" style="display:flex;align-items:center;gap:12px">
          <div style="flex:1"><b>${esc(s.nome)}</b><small>${m.final===null?"Ainda não lançada":(50>=100?`Checklist ${br(m.aud)}%`:`Checklist ${br(m.aud)}% | Plano de ação ${br(m.prazos)}%`)}</small></div>
          ${m.final===null?`<span class="badge pend">Lançar</span>`:`<span class="nota-pill">${br(m.final)}</span>`}</button>`; }).join(""); }).join("");
}
function calcNotaDraft(){
  const D=S.draft, num=v=>v===undefined||v===""?null:Number(v);
  const pts=num(D.nPts), max=num(D.nMax), ok=num(D.nOk), tot=num(D.nTot);
  const aud = pts!==null&&max>0 ? Math.min(100,Math.max(0,pts/max*100)) : null;
  const prazos = tot===null ? null : tot===0 ? 100 : (ok!==null ? Math.min(100,Math.max(0,ok/tot*100)) : null);
  const pA=50;
  const calc = pA>=100 ? aud : pA<=0 ? prazos : (aud!==null&&prazos!==null ? (pA*aud+(100-pA)*prazos)/100 : null);
  const fin = D.showFinal&&num(D.nFinal)!==null ? Math.min(100,Math.max(0,num(D.nFinal))) : null;
  return {aud,prazos,calc,final:fin!==null?fin:calc,pA};
}
function resNotaHtml(){
  const c=calcNotaDraft();
  if(c.pA>=100) return `<div class="res-final" style="margin-top:0"><span>Nota da auditoria surpresa</span><b>${br(c.final)}</b>${c.final!==null&&!S.draft.showFinal?`<small>Resultado do checklist (${br(c.aud)}%)</small>`:""}${S.draft.showFinal&&c.final!==null?`<small>Nota definida pela Qualidade</small>`:""}</div>`;
  return `<div class="res-grid"><div><span>Checklist</span><b>${br(c.aud)}${c.aud!==null?"%":""}</b></div><div><span>Plano de ação</span><b>${br(c.prazos)}${c.prazos!==null?"%":""}</b></div></div>
    <div class="res-final"><span>Nota final da auditoria surpresa</span><b>${br(c.final)}</b>${c.calc!==null&&!S.draft.showFinal?`<small>Média: (${br(c.aud)} + ${br(c.prazos)}) ÷ 2</small>`:""}${S.draft.showFinal&&c.final!==null?`<small>Nota definida pela Qualidade</small>`:""}</div>`;
}
function vAdmNota(){
  if(!S.isAdmin) return restrito();
  const s=setor(S.admSetor); if(!s) return vAdmNotas();
  const D=S.draft;
  return back("admNotas","Voltar")+`<h2 class="q">${esc(s.nome)}</h2>
   <div class="box"><h3>${50>=100?"Resultado do checklist":"1. Resultado do checklist"}</h3>
     <div class="calc"><div><label class="f" for="nPts" style="margin-top:4px">Pontos que o setor fez</label><input type="number" inputmode="decimal" id="nPts" min="0" value="${esc(D.nPts??"")}" placeholder="Ex.: 140"></div>
       <div><label class="f" for="nMax" style="margin-top:4px">Pontos possíveis</label><input type="number" inputmode="decimal" id="nMax" min="1" value="${esc(D.nMax??"175")}"></div></div>
     <p class="meta">Está na planilha do checklist. Se já tiver a nota em %, coloque a nota em "pontos" e 100 em "possíveis".</p></div>
   ${50>=100?"":`<div class="box"><h3>2. Plano de ação (ações feitas no prazo)</h3>
     <div class="calc"><div><label class="f" for="nOk" style="margin-top:4px">Ações feitas no prazo</label><input type="number" inputmode="numeric" id="nOk" min="0" value="${esc(D.nOk??"")}" placeholder="Ex.: 4"></div>
       <div><label class="f" for="nTot" style="margin-top:4px">Total de ações</label><input type="number" inputmode="numeric" id="nTot" min="0" value="${esc(D.nTot??"")}" placeholder="Ex.: 5"></div></div>
     <p class="meta">Se o setor não teve nenhuma ação, coloque 0 no total (vale 100%).</p></div>`}
   <div class="box res-box" id="nRes">${resNotaHtml()}</div>
   ${D.showFinal?`<div class="box"><label class="f" for="nFinal" style="margin-top:0">Nota final decidida pela Qualidade</label><input type="number" inputmode="decimal" id="nFinal" min="0" max="100" value="${esc(D.nFinal??"")}" placeholder="0 a 100">
       <button class="link" data-a="nFinalOff">Voltar ao cálculo automático</button></div>`
     :`<button class="link" data-a="nFinalOn">Quero definir outra nota final</button>`}
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn yellow big" data-a="admSalvarNota" ${S.saving?"disabled":""}>${S.saving?"Salvando…":"Salvar nota"}</button>
   ${finalManual(rodSurpresa()?.id,s.id).final!==null?`<button class="btn red" style="width:100%;margin-top:10px" data-a="admLimparNota">Apagar a nota deste setor</button>`:""}`;
}

function vAdmSetores(){
  if(!S.isAdmin) return restrito();
  return admTitulo("Setores","Toque em um setor para mudar o nome ou a categoria.")+
    CATS.map(([k,l])=>{ const ss=S.setores.filter(s=>s.categoria===k); if(!ss.length) return "";
      return `<div class="grouplbl">${l}</div>`+ss.map(s=>`<button class="item" data-a="admSetor" data-id="${s.id}" style="display:flex;align-items:center"><b style="flex:1">${esc(s.nome)}</b><span class="go">${I("chev")}</span></button>`).join(""); }).join("")+
    `<button class="btn yellow big" data-a="admSetor" data-id="novo">+ Novo setor</button>`;
}
function vAdmSetor(){
  if(!S.isAdmin) return restrito();
  const novo=S.admSetor==="novo"; const D=S.draft;
  return back("admSetores","Voltar")+`<h2 class="q">${novo?"Novo setor":"Editar setor"}</h2>
   <label class="f" for="sNome">Nome do setor</label><input type="text" id="sNome" value="${esc(D.sNome??"")}" placeholder="Ex.: Ponto de Apoio Ipaba">
   <label class="f">Categoria</label>
   <div class="choice">${CATS.map(([k,l])=>`<button class="${D.sCat===k?"on":""}" data-a="sCat" data-v="${k}">${l}</button>`).join("")}</div>
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn yellow big" data-a="admSalvarSetor" ${S.saving?"disabled":""}>Salvar</button>
   ${!novo?`<button class="btn red" style="width:100%;margin-top:10px" data-a="admExcluirSetor">${D.confirmDel?"Toque de novo para excluir":"Excluir setor"}</button>`:""}`;
}

function perSelect(id,ini,fim){
  const k=perKey({inicio:ini,fim:fim});
  return `<select id="${id}"><option value="">Escolha o semestre…</option>${semestres().map(x=>`<option value="${x[0]}" ${k===x[0]?"selected":""}>${x[1]}</option>`).join("")}<option value="custom" ${k==="custom"||S.draft[id+"C"]?"selected":""}>Outras datas</option></select>`;
}
function pAudTxt(v){ v=Math.max(0,Math.min(100,Number(v||0))); return v>=100?"Só o checklist conta. Os prazos do plano de ação não entram na nota.":v<=0?"Só os prazos do plano de ação contam. O checklist não entra na nota.":`O restante (${100-v}%) vale para os prazos do plano de ação.`; }
function metaTxt(m){ m=Math.max(1,Math.round(Number(m)||1)); const h=Math.round(m/2);
  return `Exemplo: ${m} pontos = nota <b>100</b>; ${h} pontos = nota <b>50</b>. Passar da meta não aumenta a nota.`; }
function finalTxt(v){ v=Math.max(0,Math.min(100,Number(v)||0)); const a=90,b=60, f=Math.round((a*v+b*(100-v))/100*10)/10;
  const fs=String(f).replace(".",",");
  if(v===50) return `A autoauditoria fica com os outros 50%, então a nota final é a <b>média</b> das duas.<br>Exemplo: surpresa 90 e autoauditoria 60 → (90 + 60) ÷ 2 = <b>${fs}</b>.`;
  if(v===100) return `Só a auditoria surpresa conta. A autoauditoria não entra na nota final.`;
  if(v===0) return `Só a autoauditoria conta. A auditoria surpresa não entra na nota final.`;
  return `A autoauditoria fica com os outros ${100-v}%.<br>Exemplo: surpresa 90 e autoauditoria 60 → 90 × ${v}% + 60 × ${100-v}% = <b>${fs}</b>.`; }
function vAdmConfig(){
  if(!S.isAdmin) return restrito();
  const D=S.draft.cfg||{};
  const showC=(k)=>perKey({inicio:D[k+"Ini"],fim:D[k+"Fim"]})==="custom"||D[k+"Custom"];
  const datas=(k)=>showC(k)?`<div class="calc"><div><label class="f" style="margin-top:6px" for="${k}Ini">Início</label><input type="date" id="${k}Ini" value="${esc(D[k+"Ini"]||"")}"></div><div><label class="f" style="margin-top:6px" for="${k}Fim">Fim</label><input type="date" id="${k}Fim" value="${esc(D[k+"Fim"]||"")}"></div></div>`:"";
  return admTitulo("Configurações")+`
   <div class="box"><h3>Quando acontece cada rodada</h3>
     <p class="meta">Pode ser em qualquer ordem, no 1º ou no 2º semestre.</p>
     <label class="f" for="sur">Auditoria surpresa</label>${perSelect("sur",D.surIni,D.surFim)}${datas("sur")}
     <label class="f" for="auto">Autoauditoria</label>${perSelect("auto",D.autoIni,D.autoFim)}${datas("auto")}
     <p class="meta">Na autoauditoria, só contam os registros feitos dentro deste período.</p></div>
   <div class="box"><h3>Como sai o resultado final</h3>
     <p class="meta" style="margin:0">Cada setor recebe duas notas de 0 a 100, e depois elas são juntadas numa nota final.</p></div>
   <div class="box"><span class="passo">1</span><h3>Nota da auditoria surpresa</h3>
     <p style="margin:4px 0 0">Média entre o resultado do checklist e o cumprimento do plano de ação.</p>
     <p class="meta">Exemplo: checklist 80% e plano de ação 100% → (80 + 100) ÷ 2 = <b>90</b>.</p></div>
   <div class="box"><span class="passo">2</span><h3>Nota da autoauditoria</h3>
     <label class="f" for="meta" style="margin-top:4px">Quantos pontos o setor precisa para tirar nota 100?</label>
     <input type="number" id="meta" min="1" value="${esc(D.meta??150)}">
     <p class="meta" id="metaTxt">${metaTxt(D.meta??150)}</p></div>
   <div class="box"><span class="passo">3</span><h3>Nota final</h3>
     <label class="f" for="pSur" style="margin-top:4px">Quanto a auditoria surpresa pesa na nota final? (%)</label>
     <input type="number" id="pSur" min="0" max="100" value="${esc(D.pSur??50)}">
     <p class="meta" id="pSurTxt">${finalTxt(D.pSur??50)}</p></div>
   ${S.err?`<div class="err">${esc(S.err)}</div>`:""}
   <button class="btn yellow big" data-a="admSalvarConfig" ${S.saving?"disabled":""}>${S.saving?"Salvando…":"Salvar configurações"}</button>
   <div class="box" style="margin-top:24px"><h3>Outras opções</h3>
     <button class="toggle ${S.geral.verTodos?"on":""}" data-a="toggleVer"><span>Equipes veem registros de todos os setores<br><span class="meta" style="font-weight:400">${S.geral.verTodos?"Ligado":"Desligado: cada equipe vê só o próprio setor"}</span></span><span class="sw"></span></button>
     ${S.downloads?`<button class="btn" style="width:100%;margin-top:12px" data-a="csv">⬇️ Baixar todos os registros (planilha)</button>`:""}</div>
   <div class="box"><h3>🔒 Quem acessa este painel</h3>
     <p>Só quem entra com a <b>senha da Qualidade</b> (em Ajuda, no fim da tela). As equipes usam o app sem senha e não conseguem mudar notas nem validar: o servidor bloqueia.</p>
     <p class="meta">A senha fica no código do Google Apps Script (SENHA_QUALIDADE). Para trocá-la, altere lá e implante uma nova versão.</p></div>`;
}

/* ---- ações do painel ---- */
function abrirNota(sid){
  S.admSetor=sid; const rs=rodSurpresa(); const n=rs?nota(rs.id,sid):{};
  const am=lsGet("5s-audmax")||"175";
  S.draft={nPts:n.audPts??(n.aud!=null&&n.audPts==null?n.aud:""), nMax:n.audMax??(n.aud!=null&&n.audPts==null?100:am),
    nOk:n.okAcoes??(n.prazos!=null&&n.totAcoes==null?n.prazos:""), nTot:n.totAcoes??(n.prazos!=null&&n.totAcoes==null?100:""),
    showFinal:n.final!=null, nFinal:n.final??""};
  go("admNota");
}
function grabAdm(){
  const g=(id,k)=>{ const el=document.getElementById(id); if(el) S.draft[k]=el.value; };
  if(S.view==="admNota"){ g("nPts","nPts"); g("nMax","nMax"); g("nOk","nOk"); g("nTot","nTot"); g("nFinal","nFinal"); }
  if(S.view==="admSetor"){ g("sNome","sNome"); }
  if(S.view==="admConfig"){ const c=S.draft.cfg=S.draft.cfg||{}; const v=id=>document.getElementById(id)?.value;
    ["surIni","surFim","autoIni","autoFim"].forEach(k=>{ const x=v(k); if(x!==undefined) c[k]=x; });
    ["pSur","pAud","meta"].forEach(k=>{ const x=v(k); if(x!==undefined) c[k]=x; }); }
}
function abrirConfig(){
  const rs=rodSurpresa()||ROD_PADRAO[0], ra=rodAuto()||ROD_PADRAO[1];
  S.draft={cfg:{surIni:rs.inicio||"",surFim:rs.fim||"",autoIni:ra.inicio||"",autoFim:ra.fim||"",
    pSur:rs.peso??50, pAud:S.geral.pesoAudManual??50, meta:S.geral.metaPts??150}};
  S.view="admConfig"; S.err=""; render(); window.scrollTo(0,0);
}
async function admSalvarNota(){
  grabAdm(); S.err=""; const c=calcNotaDraft(); const D=S.draft;
  if(c.aud===null){ S.err="Preencha os pontos do checklist."; return render(); }
  if(c.prazos===null&&c.pA<100){ S.err="Preencha as ações do plano de ação (se não teve ações, coloque 0 no total)."; return render(); }
  if(D.showFinal&&(D.nFinal===""||D.nFinal===undefined)){ S.err="Digite a nota final ou volte ao cálculo automático."; return render(); }
  const rs=rodSurpresa()||ROD_PADRAO[0];
  const notas=JSON.parse(JSON.stringify(S.notas||{})); notas[rs.id]=notas[rs.id]||{};
  notas[rs.id][S.admSetor]={aud:r1(c.aud),prazos:r1(c.prazos),final:D.showFinal?r1(c.final):null,audPts:Number(D.nPts),audMax:Number(D.nMax),okAcoes:D.nOk===""?null:Number(D.nOk),totAcoes:Number(D.nTot)};
  try{ S.saving=true; render();
    if(!S.rodadas||!S.rodadas.length){ await S.db.doc("config/rodadas").set({lista:ROD_PADRAO}); S.rodadas=ROD_PADRAO.map(r=>({...r})); }
    await S.db.doc("config/notas").set(notas); S.notas=notas; lsSet("5s-audmax",String(D.nMax||175));
    S.saving=false; toast("Nota salva"); S.draft={}; go("admNotas"); }
  catch(e){ S.saving=false; S.err=ERR_ADMIN; render(); }
}
async function admLimparNota(){
  const rs=rodSurpresa(); if(!rs) return;
  const notas=JSON.parse(JSON.stringify(S.notas||{})); if(notas[rs.id]) delete notas[rs.id][S.admSetor];
  try{ await S.db.doc("config/notas").set(notas); S.notas=notas; toast("Nota apagada"); S.draft={}; go("admNotas"); }catch(e){ toast(ERR_ADMIN); }
}
async function admSalvarSetor(){
  grabAdm(); S.err=""; const D=S.draft; const nome=(D.sNome||"").trim();
  if(!nome){ S.err="Digite o nome do setor."; return render(); }
  if(!D.sCat){ S.err="Escolha a categoria."; return render(); }
  const lista=S.setores.map(s=>({...s}));
  if(S.admSetor==="novo") lista.push({id:newId(),nome,categoria:D.sCat});
  else { const s=lista.find(x=>x.id===S.admSetor); if(s){ s.nome=nome; s.categoria=D.sCat; } }
  try{ S.saving=true; render(); await S.db.doc("config/setores").set({lista}); S.setores=lista; S.saving=false; toast("Setor salvo"); S.draft={}; go("admSetores"); }
  catch(e){ S.saving=false; S.err=ERR_ADMIN; render(); }
}
async function admExcluirSetor(){
  if(!S.draft.confirmDel){ grabAdm(); S.draft.confirmDel=true; render(); setTimeout(()=>{ if(S.view==="admSetor"&&S.draft.confirmDel){ S.draft.confirmDel=false; render(); } },4000); return; }
  const lista=S.setores.filter(s=>s.id!==S.admSetor);
  try{ await S.db.doc("config/setores").set({lista}); S.setores=lista; toast("Setor excluído"); S.draft={}; go("admSetores"); }catch(e){ toast(ERR_ADMIN); }
}
async function admSalvarConfig(){
  grabAdm(); S.err=""; const c=S.draft.cfg||{};
  for(const k of ["sur","auto"]) if(c[k+"Ini"]&&c[k+"Fim"]&&c[k+"Fim"]<c[k+"Ini"]){ S.err=`Na ${k==="sur"?"auditoria surpresa":"autoauditoria"}, o fim está antes do início.`; return render(); }
  const meta=Number(c.meta); if(!(meta>0)){ S.err="A meta precisa ser maior que zero."; return render(); }
  const pSur=Math.max(0,Math.min(100,Number(c.pSur??50))), pAud=Math.max(0,Math.min(100,Number(c.pAud??50)));
  const rs={...(rodSurpresa()||ROD_PADRAO[0]),inicio:c.surIni||"",fim:c.surFim||"",peso:pSur};
  const ra={...(rodAuto()||ROD_PADRAO[1]),inicio:c.autoIni||"",fim:c.autoFim||"",peso:100-pSur};
  const geral={...S.geral,pesoAudManual:50,metaPts:Math.round(meta),modoAuto:"meta"};
  try{ S.saving=true; render();
    await S.db.doc("config/rodadas").set({lista:[rs,ra]}); await S.db.doc("config/geral").set(geral);
    S.rodadas=[rs,ra]; S.geral=geral; S.saving=false; toast("Configurações salvas"); S.draft={}; go("admin"); }
  catch(e){ S.saving=false; S.err=ERR_ADMIN; render(); }
}

/* ============ RENDER ============ */
function render(){
  if(S.noDb){ $app.innerHTML=`<div class="box" style="margin-top:20px"><h3>Sem conexão</h3><p>${esc(window.__HOST_ERRO||"Não foi possível conectar. Verifique a internet e abra o link de novo.")}</p></div>`; return; }
  if(!S.ready){ $app.innerHTML=`<div class="loading">Carregando…</div>`; return; }
  const needSetor=["home","nc1","nc2","nc3","resolver","resForm","boa","historico","avisos"].includes(S.view);
  let html;
  if(needSetor && !setor(S.setorId)) html=vSemSetor();
  else html=({home:vHome,nc1:vNc1,nc2:vNc2,nc3:vNc3,ok:vOk,resolver:vResolver,resForm:vResForm,boa:vBoa,historico:vHistorico,det:vDetalhe,placar:vPlacar,regras:vRegras,admin:vAdmin,admValidar:vAdmValidar,admNotas:vAdmNotas,admNota:vAdmNota,admSetores:vAdmSetores,admSetor:vAdmSetor,admConfig:vAdmConfig,admResultados:vAdmResultados,avisos:vAvisos}[S.view]||vHome)();
  $app.innerHTML=html;
  const nav=document.getElementById("nav");
  const showNav=!["nc1","nc2","nc3","resForm","boa","ok","admNota","admSetor","admConfig"].includes(S.view) && !!setor(S.setorId);
  nav.classList.toggle("hide",!showNav); document.body.classList.toggle("has-nav",showNav);
  if(showNav) nav.innerHTML=navHtml();
  document.getElementById("admBtn").classList.toggle("hide",!S.isAdmin);
  hydratePhotos();
  if(S.view==="det") loadProfiles([S.regs[S.detId]?.criadoPor]);
}
function go(v){ if(v==="admConfig"&&S.view!=="admConfig") return abrirConfig(); S.view=v; S.err=""; render(); window.scrollTo(0,0); }
async function loadProfiles(ids){
  ids=ids.filter(id=>id&&!S.profiles[id]); if(!ids.length||!S.user) return;
  try{ const ps=await S.user.profiles(ids); Object.assign(S.profiles,ps); if(S.view==="det") { const el=$app.querySelector(".det dl"); if(el) render(); } }catch(e){}
}

/* captura de campos digitados antes de re-render */
function grab(){
  if(S.view&&S.view.startsWith("adm")) grabAdm();
  const g=(id,k)=>{ const el=document.getElementById(id); if(el) S.draft[k]=el.value; };
  g("dt","data"); g("ds","descricao"); g("tr","tratativa"); g("dr","dataResolucao"); g("qm","resolvidoPor");
  g("bt","titulo"); g("bd","descricao"); g("bdt","data"); g("motivo","motivo");
  if(S.view==="admin"){
    g("cSet","cSet"); g("cAlc","cAlc"); g("cPos","cPos"); g("cOk","cOk"); g("cTot","cTot");
    const pa=document.getElementById("pesoAud"); if(pa) S.draft.pesoAud=pa.value;
    const mp=document.getElementById("metaPts"); if(mp) S.draft.metaPts=mp.value;
    const rods=(S.draft.rodadas||rodadas()).map(r=>({...r}));
    const sets=(S.draft.setores||S.setores).map(s=>({...s}));
    const notas=JSON.parse(JSON.stringify(S.draft.notas||S.notas||{}));
    const admRod=(rods.find(r=>r.id===S.admRod)||rods[0])?.id;
    let tocouRod=false,tocouSet=false,tocouNota=false;
    $app.querySelectorAll("[data-tbl]").forEach(el=>{
      const t=el.dataset.tbl, k=el.dataset.k;
      if(t==="rod"){ const r=rods[+el.dataset.i]; if(r&&String(r[k]??"")!==el.value){ r[k]= k==="peso"?(el.value===""?"":Number(el.value)):el.value; tocouRod=true; } }
      else if(t==="set"){ const s=sets[+el.dataset.i]; if(s&&String(s[k]??"")!==el.value){ s[k]=el.value; tocouSet=true; } }
      else if(t==="nota"&&admRod){ notas[admRod]=notas[admRod]||{}; const n=notas[admRod][el.dataset.sid]=notas[admRod][el.dataset.sid]||{};
        const v=el.value===""?null:Math.max(0,Math.min(100,Number(el.value))); if((n[k]??null)!==v){ n[k]=v; tocouNota=true; } }
    });
    if(tocouRod||S.draft.rodadas) S.draft.rodadas=rods;
    if(tocouSet||S.draft.setores) S.draft.setores=sets;
    if(tocouNota||S.draft.notas) S.draft.notas=notas;
  }
}

/* ============ AÇÕES ============ */
async function gravarMeu(colecao, id, dados){
  // cada pessoa só grava no próprio documento: reg/<uid> ou sol/<uid>
  if(!S.uid) throw new Error("Entre com sua conta para registrar.");
  const ref=S.db.doc(colecao+"/"+S.uid);
  await ref.set({itens:{[id]:dados}},{merge:true});
}
async function salvar(kind){
  if(!S.canWrite){ S.err="Sem permissão para registrar. Verifique a internet e abra o link de novo."; return render(); }
  grab(); const d=S.draft; S.err="";
  try{
    if(kind==="nc"){
      if(!d.fotoAntes) throw new Error("Falta a foto do problema.");
      if(!d.data) throw new Error("Informe o dia.");
    } else if(kind==="res"){
      if(!(d.tratativa||"").trim()) throw new Error("Conte o que foi feito.");
      if(!d.fotoDepois) throw new Error("Falta a foto depois de resolvido.");
      const r=S.regs[d.regId]; if(d.dataResolucao<r.data) throw new Error("O dia da solução não pode ser antes do dia do problema.");
    } else if(kind==="boa"){
      if(!d.senso) throw new Error("Escolha o senso.");
      if(!(d.titulo||"").trim()) throw new Error("Escreva o que foi melhorado.");
      if(!d.fotoDepois) throw new Error("Falta a foto de como ficou.");
    }
    S.saving=true; render();
    if(kind==="res"){
      const fotoDepois=await storePhoto(d.fotoDepois);
      const sol={status:"resolvida",tratativa:d.tratativa.trim(),dataResolucao:d.dataResolucao||today(),resolvidoPor:(d.resolvidoPor||"").trim(),fotoDepois,resolvidoEm:new Date().toISOString(),por:S.uid||""};
      await gravarMeu("sol", d.regId, sol);
      S.regs[d.regId]={...S.regs[d.regId],...sol};
      S.lastId=d.regId; S.lastKind="res";
    } else {
      const id=newId();
      const base={id,tipo:kind,setorId:S.setorId,senso:Number(d.senso),data:d.data||today(),descricao:(d.descricao||"").trim(),criadoPor:S.uid||"",criadoEm:new Date().toISOString()};
      if(kind==="nc"){ Object.assign(base,{item:d.item,status:"aberta",fotoAntes:await storePhoto(d.fotoAntes),fotoDepois:""}); }
      else { Object.assign(base,{titulo:d.titulo.trim(),status:"resolvida",fotoAntes:d.fotoAntes?await storePhoto(d.fotoAntes):"",fotoDepois:await storePhoto(d.fotoDepois)}); }
      await gravarMeu("reg", id, base);
      S.regs[id]=base; S.lastId=id; S.lastKind=kind;
    }
    S.saving=false; S.draft={}; go("ok");
  }catch(e){
    S.saving=false;
    S.err = e.code==="invalid_argument" ? "Não foi possível salvar: você não tem permissão para registrar." :
            e.code==="quota_exceeded" ? "O espaço de armazenamento acabou. Avise o Setor de Qualidade." :
            (e.message||"Erro ao salvar. Tente de novo.");
    if(e.code==="invalid_argument") S.canWrite=false;
    render();
  }
}
const ERR_ADMIN="Não foi possível salvar. Só o Setor de Qualidade pode alterar isso.";
async function salvarSetores(){
  grab(); S.errSet="";
  const rows=(S.draft.setores||S.setores).map(s=>({id:s.id,nome:(s.nome||"").trim(),categoria:s.categoria})).filter(s=>s.nome);
  try{ S.saving=true; render(); await S.db.doc("config/setores").set({lista:rows}); S.setores=rows; delete S.draft.setores; toast("Setores salvos"); }
  catch(e){ S.errSet=ERR_ADMIN; }
  S.saving=false; render();
}
async function salvarRodadas(){
  grab(); S.errRod="";
  const rows=(S.draft.rodadas||rodadas()).map(r=>({id:r.id,nome:(r.nome||"").trim(),tipo:r.tipo,inicio:r.inicio||"",fim:r.fim||"",peso:Number(r.peso||0)})).filter(r=>r.nome);
  const ruim=rows.find(r=>r.tipo==="auto"&&!r.inicio); if(ruim){ S.errRod=`Escolha o período da rodada "${ruim.nome}" (a autoauditoria precisa de data de início).`; return render(); }
  const inv=rows.find(r=>r.inicio&&r.fim&&r.fim<r.inicio); if(inv){ S.errRod=`Na rodada "${inv.nome}", o fim está antes do início.`; return render(); }
  try{ S.saving=true; render(); await S.db.doc("config/rodadas").set({lista:rows}); S.rodadas=rows; delete S.draft.rodadas; toast("Rodadas salvas"); }
  catch(e){ S.errRod=ERR_ADMIN; }
  S.saving=false; render();
}
async function salvarNotas(){
  grab(); S.errNotas="";
  const notas=S.draft.notas||S.notas||{};
  const geral={...S.geral};
  if(S.draft.pesoAud!==undefined&&S.draft.pesoAud!=="") geral.pesoAudManual=Math.max(0,Math.min(100,Number(S.draft.pesoAud)));
  if(S.draft.modoAuto) geral.modoAuto=S.draft.modoAuto;
  if(S.draft.metaPts!==undefined&&S.draft.metaPts!==""&&Number(S.draft.metaPts)>0) geral.metaPts=Math.round(Number(S.draft.metaPts));
  try{ S.saving=true; render();
    await S.db.doc("config/notas").set(notas); await S.db.doc("config/geral").set(geral);
    S.notas=notas; S.geral=geral; delete S.draft.notas; delete S.draft.pesoAud; delete S.draft.modoAuto; delete S.draft.metaPts; toast("Salvo"); }
  catch(e){ S.errNotas=ERR_ADMIN; }
  S.saving=false; render();
}
async function validar(campo,status,motivo){
  const id=S.detId; const r=S.regs[id]; const cur={...(S.vals[id]||{})}; cur[campo]=status;
  cur[campo+"Em"]=new Date().toISOString();
  cur[campo==="registro"?"motivoRegistro":"motivoResolucao"]= status==="recusado"?(motivo||""):"";
  if(campo==="resolucao") cur.resolucaoRef=r?.resolvidoEm||"";
  try{ await S.db.doc("validacoes/"+id).set(cur); S.vals[id]=cur; S.recusando=null; S.draft.motivo=""; S.err=""; toast(status==="ok"?"Aprovado: o setor foi avisado":"Recusado: o setor foi avisado com o motivo"); render(); }
  catch(e){ toast("Não foi possível validar."); }
}
async function excluir(){
  if(!confirm("Excluir este registro? Ele some do app e do placar.")) return;
  const id=S.detId; const cur={...(S.vals[id]||{}),excluido:true,excluidoEm:new Date().toISOString()};
  try{ await S.db.doc("validacoes/"+id).set(cur); S.vals[id]=cur; montarRegs(); toast("Registro excluído"); go(S.back==="det"?"home":S.back); }
  catch(e){ toast("Não foi possível excluir."); }
}
async function exportCsv(){
  const head=["Setor","Categoria","Tipo","Senso","Item","Pergunta do checklist","Descrição/Título","Data","Status","Solução","Data solução","Dias","Resolvido por","Validação registro","Motivo recusa registro","Validação solução","Motivo recusa solução","Rodada"];
  const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
  const lines=[head.map(q).join(";")];
  for(const r of Object.values(S.regs).sort((a,b)=>a.data.localeCompare(b.data))){
    const st=setor(r.setorId)||{}; const it=r.tipo==="nc"?findItem(r.item):null; const v=S.vals[r.id]||{}; const s=sensoBy(r.senso);
    const rod=rodadas().find(x=>naRodada(r,x));
    lines.push([st.nome,(CATS.find(c=>c[0]===st.categoria)||[,""])[1],r.tipo==="nc"?"Não conformidade":"Boa prática",s?s.n+"º "+s.nome:"",r.item||"",it?.q||"",r.tipo==="boa"?r.titulo+(r.descricao?" - "+r.descricao:""):r.descricao,fmt(r.data),r.tipo==="boa"?"Melhoria":(isOpen(r)?"Aberta":"Resolvida"),r.tratativa||"",fmt(r.dataResolucao),r.dataResolucao?daysBetween(r.data,r.dataResolucao):daysBetween(r.data,today()),r.resolvidoPor||"",v.registro||"pendente",v.motivoRegistro||"",r.tipo==="nc"&&r.status==="resolvida"?(effRes(r,v)||"pendente"):"",effRes(r,v)==="recusado"?(v.motivoResolucao||""):"",rod?rod.nome:"fora de rodada"].map(q).join(";"));
  }
  try{ await S.downloads.save({filename:"5S-autoauditoria-"+today()+".csv",data:"\ufeff"+lines.join("\r\n")}); }catch(e){ if(e.code==="unavailable") toast("Download indisponível aqui."); }
}
function usarCalc(){
  const rods=S.draft.rodadas||rodadas(); const rod=rods.find(r=>r.id===S.admRod)||rods[0]; if(!rod) return;
  const D=S.draft; const sid=D.cSet||(S.draft.setores||S.setores)[0]?.id; if(!sid){ toast("Cadastre os setores primeiro"); return; }
  const p=Number(D.cPos||175), t=Number(D.cTot);
  const aud = D.cAlc!==undefined&&D.cAlc!==""&&p>0 ? Math.round(Number(D.cAlc)/p*1000)/10 : null;
  const pr = rod.tipo==="manual"&&D.cOk!==undefined&&D.cOk!==""&&t>0 ? Math.round(Number(D.cOk)/t*1000)/10 : null;
  if(aud===null&&pr===null){ toast("Preencha a calculadora"); return; }
  const notas=JSON.parse(JSON.stringify(D.notas||S.notas||{})); notas[rod.id]=notas[rod.id]||{}; const n=notas[rod.id][sid]=notas[rod.id][sid]||{};
  if(rod.tipo==="manual"){ if(aud!==null) n.aud=aud; if(pr!==null) n.prazos=pr; } else if(aud!==null) n.surpresa=aud;
  D.notas=notas; D.cAlc=""; D.cOk=""; D.cTot=""; toast("Nota colocada. Lembre de salvar."); render();
}

$app.addEventListener("click",e=>{
  const b=e.target.closest("[data-a]"); if(!b) return;
  const a=b.dataset.a;
  if(a!=="go"&&a!=="det") grab();
  switch(a){
    case "go": if(b.dataset.v==="home") S.draft={}; go(b.dataset.v); break;
    case "novo": S.draft={data:today()}; go(b.dataset.v); break;
    case "setor": S.setorId=b.dataset.id; lsSet("5s-setor",S.setorId); go("home"); break;
    case "trocar": S.setorId=null; go("home"); break;
    case "senso": S.draft.senso=b.dataset.n; go("nc2"); break;
    case "item": S.draft.item=b.dataset.code; go("nc3"); break;
    case "foto": pickPhoto(b.dataset.f,b.dataset.m); break;
    case "salvarNc": salvar("nc"); break;
    case "salvarRes": salvar("res"); break;
    case "salvarBoa": salvar("boa"); break;
    case "resolverAgora": S.draft={regId:S.lastId,dataResolucao:today()}; go("resForm"); break;
    case "resolver1": S.draft={regId:b.dataset.id,dataResolucao:today()}; go("resForm"); break;
    case "boaSenso": S.draft.senso=b.dataset.n; render(); break;
    case "filtro": S.filtro=b.dataset.v; render(); break;
    case "cat": S.catTab=b.dataset.v; render(); break;
    case "det": S.back=S.view==="det"?S.back:S.view; S.detId=b.dataset.id; S.recusando=null; go("det"); break;
    case "validar": validar(b.dataset.c,b.dataset.s); break;
    case "pedeRecusa": S.recusando=b.dataset.c; S.draft.motivo=""; S.err=""; render(); setTimeout(()=>document.getElementById("motivo")?.focus(),50); break;
    case "cancelRecusa": S.recusando=null; S.err=""; render(); break;
    case "confirmRecusa": { const m=(S.draft.motivo||"").trim(); if(!m){ S.err="Escreva o motivo da recusa para o setor saber o que corrigir."; render(); break; } validar(b.dataset.c,"recusado",m); break; }
    case "entendi": { const ev=avisosDe(S.setorId); if(ev.length) lsSet("5s-visto-"+S.setorId,ev[0].quando); render(); break; }
    case "histTodos": S.histTodos=b.dataset.v==="1"; render(); break;
    case "toggleVer": { const novo={...S.geral,verTodos:!S.geral.verTodos}; S.db.doc("config/geral").set(novo).then(()=>{S.geral=novo; toast(novo.verTodos?"Equipes agora veem todos os setores":"Equipes veem só o próprio setor"); render();}).catch(()=>toast(ERR_ADMIN)); break; }
    case "usarCalc": usarCalc(); break;
    case "modoAuto": S.draft.modoAuto=b.dataset.v; render(); break;
    case "excluir": excluir(); break;
    case "addSetor": S.draft.setores=[...(S.draft.setores||S.setores),{id:newId(),nome:"",categoria:"op"}]; render(); break;
    case "rmSetor": { const rows=[...(S.draft.setores||S.setores)]; const r=rows[+b.dataset.i]; if(r&&r.nome&&!confirm("Remover o setor "+r.nome+"?")) break; rows.splice(+b.dataset.i,1); S.draft.setores=rows; render(); break; }
    case "salvarSetores": salvarSetores(); break;
    case "addRod": S.draft.rodadas=[...(S.draft.rodadas||rodadas()),{id:newId(),nome:"",tipo:"auto",inicio:today(),fim:"",peso:""}]; render(); break;
    case "rmRod": { const rows=[...(S.draft.rodadas||rodadas())]; const r=rows[+b.dataset.i]; if(r&&r.nome&&!confirm("Remover a rodada "+r.nome+"? As notas lançadas nela deixam de contar.")) break; rows.splice(+b.dataset.i,1); S.draft.rodadas=rows; render(); break; }
    case "sugRod": S.draft.rodadas=[
        {id:"r1",nome:"Auditoria surpresa",tipo:"manual",inicio:"",fim:"",peso:50},
        {id:"r2",nome:"Autoauditoria",tipo:"auto",inicio:"",fim:"",peso:50}]; render(); break;
    case "salvarRod": salvarRodadas(); break;
    case "salvarNotas": salvarNotas(); break;
    case "csv": exportCsv(); break;
    case "hostEntrar": { const pw=document.getElementById("hSenha")?.value||"";
      if(!pw){ S.errLogin="Digite a senha."; render(); break; }
      window.__HOST_AUTH.entrar(pw).catch(e=>{ S.errLogin=(e&&e.message)||"Senha incorreta."; render(); }); break; }
    case "hostSair": window.__HOST_AUTH.sair(); break;
    case "csvRes": exportResultados(); break;
    case "verCapa": mostrarCapa(); break;
    case "admNota": abrirNota(b.dataset.id); break;
    case "nFinalOn": grabAdm(); S.draft.showFinal=true; render(); break;
    case "nFinalOff": grabAdm(); S.draft.showFinal=false; S.draft.nFinal=""; render(); break;
    case "admSalvarNota": admSalvarNota(); break;
    case "admLimparNota": admLimparNota(); break;
    case "admSetor": { const id=b.dataset.id; S.admSetor=id; const st=setor(id); S.draft={sNome:st?st.nome:"",sCat:st?st.categoria:""}; go("admSetor"); break; }
    case "sCat": grabAdm(); S.draft.sCat=b.dataset.v; render(); break;
    case "admSalvarSetor": admSalvarSetor(); break;
    case "admExcluirSetor": admExcluirSetor(); break;
    case "admSalvarConfig": admSalvarConfig(); break;
  }
});
$app.addEventListener("input",e=>{
  if(S.view==="admNota"&&["nPts","nMax","nOk","nTot","nFinal"].includes(e.target.id)){ grabAdm(); const el=document.getElementById("nRes"); if(el) el.innerHTML=resNotaHtml(); }
  if(S.view==="admConfig"&&e.target.id==="pSur"){ const v=Math.max(0,Math.min(100,Number(e.target.value||0))); document.getElementById("pSurTxt").innerHTML=finalTxt(v); }
  if(S.view==="admConfig"&&e.target.id==="meta"){ document.getElementById("metaTxt").innerHTML=metaTxt(e.target.value); }
  if(S.view==="admConfig"&&e.target.id==="pAud"){ const v=Math.max(0,Math.min(100,Number(e.target.value||0))); document.getElementById("pAudTxt").textContent=pAudTxt(v); }

});
$app.addEventListener("change",e=>{
  const id=e.target.id;
  if(S.view==="admConfig"&&(id==="sur"||id==="auto")){ grabAdm(); const c=S.draft.cfg; const m=semestres().find(x=>x[0]===e.target.value);
    c[id+"Custom"]=e.target.value==="custom"; if(m){ c[id+"Ini"]=m[2]; c[id+"Fim"]=m[3]; } else if(!e.target.value){ c[id+"Ini"]=""; c[id+"Fim"]=""; } render(); }
  if(id==="cSet"){ S.draft.cSet=e.target.value; }
  if(id==="placarSel"){ S.placarRod=e.target.value; render(); }
  if(id==="admRodSel"){ grab(); S.admRod=e.target.value; render(); }
  if(e.target.dataset.tbl==="rod"&&e.target.dataset.k==="tipo"){ grab(); render(); }
  if(e.target.dataset.tbl==="rodper"){ grab(); const rows=S.draft.rodadas||rodadas().map(r=>({...r})); const r=rows[+e.target.dataset.i]; const m=semestres().find(x=>x[0]===e.target.value);
    if(r&&m){ r.inicio=m[2]; r.fim=m[3]; } else if(r&&!e.target.value){ r.inicio=""; r.fim=""; } S.draft.rodadas=rows; render(); }
});
document.querySelector(".top").addEventListener("click",e=>{ const b=e.target.closest("[data-a=go]"); if(b){ S.draft={}; go(b.dataset.v); } });
document.getElementById("nav").addEventListener("click",e=>{ const b=e.target.closest("[data-a=go]"); if(b){ S.draft={}; go(b.dataset.v); } });

/* ============ DADOS ============ */
const RAW={legado:{}, reg:{}, sol:{}};
function montarRegs(){
  const m={};
  for(const [id,r] of Object.entries(RAW.legado)) m[id]={...r,id};
  for(const r of Object.values(RAW.reg)) if(r&&r.id) m[r.id]={...r};
  for(const [regId,s] of Object.entries(RAW.sol)) if(m[regId]) m[regId]={...m[regId],...s};
  for(const id of Object.keys(m)) if(S.vals[id]?.excluido) delete m[id];
  S.regs=m;
}

/* ============ CAPA ============ */
function mostrarCapa(){
  const capa=document.getElementById("capa"); if(!capa) return;
  const logo=document.querySelector(".top .logo"); const cl=document.getElementById("capaLogo"); if(logo&&!cl.src) cl.src=logo.src;
  capa.classList.remove("sai"); capa.classList.remove("hide"); capa.scrollTop=0; document.body.style.overflow="hidden";
  // reinicia as animações
  capa.querySelectorAll(".capa-in>*, .capa-foto img").forEach(el=>{ el.style.animation="none"; void el.offsetWidth; el.style.animation=""; });
}
(function(){
  const capa=document.getElementById("capa"); if(!capa) return;
  document.getElementById("capaBtn").addEventListener("click",()=>{
    try{ sessionStorage.setItem("5s-capa","1"); }catch(e){}
    capa.classList.add("sai"); document.body.style.overflow="";
    setTimeout(()=>capa.classList.add("hide"),460);
  });
  const logo=document.querySelector(".top .logo");
  if(logo){ logo.style.cursor="pointer"; logo.setAttribute("role","button"); logo.setAttribute("tabindex","0"); logo.setAttribute("title","Ver a capa");
    logo.addEventListener("click",mostrarCapa); logo.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); mostrarCapa(); } }); }
  let visto=false; try{ visto=sessionStorage.getItem("5s-capa")==="1"; }catch(e){}
  if(!visto) mostrarCapa();
})();
/* ============ INICIALIZAÇÃO ============ */
(async function init(){
  S.setorId=lsGet("5s-setor");
  const CL=window.__HOST;
  const [db,user,assets,downloads]=await Promise.all(["db","user","assets","downloads"].map(n=>CL.use(n).catch(()=>null)));
  if(!db){ S.noDb=true; return render(); }
  S.db=db; S.user=user; S.assets=assets; S.downloads=downloads;
  if(user){
    try{ S.uid=await user.id(); }catch(e){}
    try{ const [o,ed]=await Promise.all([user.isOwner(),user.canEdit()]); S.isAdmin=!!(o||ed); }catch(e){}
    try{ const w=await user.can("data.write"); if(w===false) S.canWrite=false; }catch(e){}
  }
  const NEED=8; let got=0; const FORMS=["nc3","resForm","boa","admNota","admSetor","admConfig"];
  const mark=()=>{ montarRegs(); got++; if(got>=NEED&&!S.ready){ S.ready=true; return render(); } if(!S.ready) return; if(FORMS.includes(S.view)||S.saving||S.recusando) return; if(!S._rq) S._rq=requestAnimationFrame(()=>{ S._rq=0; if(!(FORMS.includes(S.view)||S.saving||S.recusando)) render(); }); };
  db.doc("config/setores").onSnapshot(s=>{ S.setores=s.exists?(s.data().lista||[]):[]; mark(); },()=>mark());
  db.doc("config/geral").onSnapshot(s=>{ S.geral=s.exists?s.data():{pesoSurpresa:50}; mark(); },()=>mark());
  db.doc("config/rodadas").onSnapshot(s=>{ S.rodadas=s.exists?(s.data().lista||[]):[]; mark(); },()=>mark());
  db.doc("config/notas").onSnapshot(s=>{ S.notas=s.exists?s.data():{}; mark(); },()=>mark());
  db.collection("registros").onSnapshot(q=>{ const m={}; q.docs.forEach(d=>m[d.id]=d.data()); RAW.legado=m; mark(); },()=>mark());
  db.collection("reg").onSnapshot(q=>{ const m={}; q.docs.forEach(d=>Object.assign(m,d.data().itens||{})); RAW.reg=m; mark(); },()=>mark());
  db.collection("sol").onSnapshot(q=>{ const m={};
    q.docs.forEach(d=>{ for(const [rid,s] of Object.entries(d.data().itens||{})) if(!m[rid]||(s.resolvidoEm||"")>(m[rid].resolvidoEm||"")) m[rid]=s; });
    RAW.sol=m; mark(); },()=>mark());
  db.collection("validacoes").onSnapshot(q=>{ const m={}; q.docs.forEach(d=>m[d.id]=d.data()); S.vals=m; mark(); },()=>mark());
})();
