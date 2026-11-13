// Monthly refresh of population statistics from stat.uz (SIAT) into stat.json.
// Runs on GitHub Actions; the site's «stat.uz'dan yangilash» button reads stat.json when the browser cannot reach stat.uz.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
global.UZB=JSON.parse(fs.readFileSync(path.join(__dirname,'uzb-names.json'),'utf8'));
let STAT=JSON.parse(fs.readFileSync(path.join(root,'stat.json'),'utf8'));
const SIAT={tot:246,rur:247,wa:2835};
const stNorm=n=>String(n==null?'':n).replace(/[‘’'ʻʼ`]/g,"'").replace(/\s+/g,' ').trim();
const stNum=v=>{if(typeof v==='number')return v;const t=String(v==null?'':v).replace(/[\s ]/g,'').replace(',','.');return /^-?\d+(\.\d+)?$/.test(t)?+t:NaN};
/* any SIAT download (JSON or CSV) → {years:[…], rows:[[name,{year:value}]]} */
function stTable(data){let grid=null;
  if(typeof data==='string'){const txt=data.replace(/^\ufeff/,'');let js;try{js=JSON.parse(txt)}catch(e){}if(js!==undefined)return stTable(js);
    const lines=txt.split(/\r?\n/).filter(l=>l.trim());if(!lines.length)throw new Error('Fayl bo‘sh');
    const head=lines.slice(0,5).join('\n'),dl=[';','\t',','].sort((a,b)=>head.split(b).length-head.split(a).length)[0];
    const split=l=>{const out=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(q){if(ch==='"'){if(l[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}else if(ch==='"')q=true;else if(ch===dl){out.push(c);c=''}else c+=ch}out.push(c);return out};
    grid=lines.map(split)}
  else{let best=null;const walk=o=>{if(Array.isArray(o)){if(o.length&&o.every(x=>x&&typeof x==='object'&&!Array.isArray(x))&&(!best||o.length>best.length))best=o;o.forEach(walk)}else if(o&&typeof o==='object')Object.values(o).forEach(walk)};walk(data);
    if(!best)throw new Error('Jadval topilmadi');const keys=[];best.forEach(o=>Object.keys(o).forEach(k=>{if(!keys.includes(k))keys.push(k)}));
    grid=[keys].concat(best.map(o=>keys.map(k=>o[k])))}
  const yr=c=>{const m=String(c==null?'':c).match(/(?:^|\D)((?:19|20)\d\d)(?:\D|$)/);return m?+m[1]:0};
  const hi=grid.findIndex(r=>r.filter(c=>yr(c)&&!/[a-z]{4}/i.test(String(c).replace(/yil/i,''))).length>0);if(hi<0)throw new Error('Yillar ustuni topilmadi');
  const H=grid[hi],ycols=H.map((c,i)=>[yr(c),i]).filter(x=>x[0]),body=grid.slice(hi+1);
  const pat=/(tumani|shahri|viloyati|respublikasi)$/i;let nc=-1,nb=0;
  H.forEach((_,i)=>{if(ycols.some(y=>y[1]===i))return;const n=body.filter(r=>pat.test(stNorm(r[i]))).length;if(n>nb){nb=n;nc=i}});
  if(nc<0)throw new Error('Hudud nomlari topilmadi');
  const years=[...new Set(ycols.map(y=>y[0]))].sort((a,b)=>a-b);
  const rows=body.map(r=>{const v={};ycols.forEach(([y,i])=>{const x=stNum(r[i]);if(!isNaN(x))v[y]=x});return [stNorm(r[nc]),v]}).filter(r=>r[0]&&Object.keys(r[1]).length);
  return {years:years.filter(y=>rows.some(r=>r[1][y]!=null)),rows}}
/* rows → republic + regions with their districts, in file order */
function stGroups(rows){let uz=null,cur=null;const regs=[];
  rows.forEach(([n,v])=>{if(/^O'zbekiston Respublikasi$/i.test(n)){uz=[n,v];return}
    if(/ viloyati$| Respublikasi$/i.test(n)||n==="Toshkent shahri"){cur={n,v,d:[]};regs.push(cur);return}
    if(cur)cur.d.push([n,v])});return {uz,regs}}
const ST_AL={"ellikqal'a":"ellikkala","marhamat":"marxamat","shahrixon":"shaxrixon","toyloq":"tayloq","bag'dod":"bog'dod","hazorasp":"xazorasp","sergeli":"sirg'ali","shayxontohur":"shayxontoxur"};
const stBase=n=>{const b=stNorm(n).toLowerCase().replace(/ (tumani|shahri|shahar|viloyati|respublikasi)$/,'');return ST_AL[b]||b};
const stKind=n=>/ shahr?i?$| shahar$/i.test(stNorm(n))?'s':'t';
function stRegion(regs,R){return R.id==='toshkent_sh'?regs.find(x=>x.n==='Toshkent shahri'):R.id==='toshkent'?regs.find(x=>/^Toshkent viloyati$/i.test(x.n)):regs.find(x=>stBase(x.n)===stBase(R.name))}
function stFind(list,D){return list.find(x=>stBase(x[0])===stBase(D.name)&&stKind(x[0])===stKind(D.name))||list.find(x=>stBase(x[0])===stBase(D.name))}
/* three SIAT tables → the STAT object the maps use; refuses anything that does not add up */
function stBuild(tot,rur,wa){const T=stTable(tot),R=stTable(rur),y1=T.years[T.years.length-1],y0=T.years[T.years.length-2],ry=R.years.includes(y1)?y1:R.years[R.years.length-1];
  if(!y1||!y0)throw new Error('Aholi soni jadvalida kamida ikki yil bo‘lishi kerak');
  const gt=stGroups(T.rows),gr=stGroups(R.rows),W=wa?(()=>{try{const w=stTable(wa);return w.rows.length?w:null}catch(e){return null}})():null,wy=W?(W.years.includes(y1)?y1:W.years[W.years.length-1]):0,gw=W?stGroups(W.rows):null;
  const out={y:y1,ry,wy:wy||STAT.wy||STAT.y,src:'stat.uz',at:new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10),uz:{},r:{}},bad=[];let nd=0;
  UZB.regions.forEach(Rg=>{const t=stRegion(gt.regs,Rg),q=stRegion(gr.regs,Rg);if(!t||!q){bad.push(Rg.name);return}
    let w=gw?stRegion(gw.regs,Rg):null;w=w&&w.v[wy]!=null?w.v[wy]:(STAT.r[Rg.id]||{}).wa;
    const o={p25:t.v[y0],p26:t.v[y1],rur:q.v[ry],wa:w,d:{}};if(!(o.p26>0)||o.p25==null||o.rur==null){bad.push(Rg.name);return}
    let sum=0;Rg.districts.forEach(D=>{const a=stFind(t.d,D),b=stFind(q.d,D);if(!a||a[1][y1]==null)return;o.d[D.name]={p25:a[1][y0],p26:a[1][y1],rur:b&&b[1][ry]!=null?b[1][ry]:0};sum+=a[1][y1];nd++});
    if(Object.keys(o.d).length<Rg.districts.length*0.8||Math.abs(t.d.reduce((a,x)=>a+(x[1][y1]||0),0)-o.p26)>o.p26*0.03)bad.push(Rg.name);out.r[Rg.id]=o});
  if(bad.length)throw new Error('Jadval kutilgan ko‘rinishda emas ('+bad.slice(0,3).join(', ')+(bad.length>3?'…':'')+')');
  const all=Object.values(out.r),s=k=>all.reduce((a,o)=>a+(o[k]||0),0);
  out.uz={p25:gt.uz?gt.uz[1][y0]:s('p25'),p26:gt.uz?gt.uz[1][y1]:s('p26'),rur:gr.uz&&gr.uz[1][ry]!=null?gr.uz[1][ry]:s('rur'),wa:gw&&gw.uz&&gw.uz[1][wy]!=null?gw.uz[1][wy]:s('wa')};
  out.nd=nd;out.waNew=!!(W&&gw&&gw.regs.length);return out}

async function get(id){for(const f of ['json','csv']){try{const r=await fetch('https://api.siat.stat.uz/sdmx/'+id+'/table/download/?download_format='+f);if(r.ok)return await r.text();console.log(id,f,r.status)}catch(e){console.log(id,f,e.message)}}return null}
(async()=>{const [a,b,c]=await Promise.all([get(SIAT.tot),get(SIAT.rur),get(SIAT.wa)]);
  if(!a||!b){console.log('stat.uz did not answer; stat.json kept');return}
  let o;try{o=stBuild(a,b,c)}catch(e){console.log('tables not as expected: '+e.message+'; stat.json kept');return}
  if(o.y<(STAT.y||0)){console.log('older than current; kept');return}
  delete o.waNew;delete o.nd;o.at=new Date().toISOString().slice(0,10);
  fs.writeFileSync(path.join(root,'stat.json'),JSON.stringify(o));console.log('stat.json updated: '+o.y)})();
