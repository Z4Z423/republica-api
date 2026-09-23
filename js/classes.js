(function(){
  const API_BASE='https://republica-api-1.onrender.com'.replace(/\/$/,'');
  const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const displayTime=value=>{if(!value)return'a confirmar';const[hour,minute]=value.split(':');return minute==='00'?`${Number(hour)}h`:`${hour}:${minute}`;};
  async function loadSite(){
    try{
      const [classesResponse,siteResponse]=await Promise.all([fetch(`${API_BASE}/api/classes`,{cache:'no-store'}),fetch(`${API_BASE}/api/site-settings`,{cache:'no-store'})]);
      if(classesResponse.ok){const data=await classesResponse.json();if(Array.isArray(data.classes)){
        const activeIds=new Set(data.classes.map(item=>item.id));
        document.querySelectorAll('[data-class-card]').forEach(card=>{card.hidden=!activeIds.has(card.dataset.classCard);});
        const classSection=document.querySelector('#aulas');if(classSection)classSection.hidden=data.classes.length===0;
        for(const item of data.classes){
          const title=document.querySelector(`[data-class-title="${CSS.escape(item.id)}"]`);if(title)title.textContent=item.name||title.textContent;
          const card=document.querySelector(`[data-class-card="${CSS.escape(item.id)}"]`);if(card){const heading=card.querySelector('h3');if(heading&&!heading.querySelector('[data-class-title]'))heading.textContent=item.name;}
          const scheduleBox=document.querySelector(`[data-class-schedules="${CSS.escape(item.id)}"]`);if(scheduleBox)scheduleBox.innerHTML=(item.schedules||[]).map(schedule=>{const time=displayTime(schedule.time);return `<p><strong>Prof. ${escapeHtml(schedule.teacher)}</strong><br/>Dias: <strong>${escapeHtml(schedule.days==='A confirmar'?'a confirmar':schedule.days)}</strong>${schedule.time?` • a partir das <strong>${escapeHtml(time)}</strong>`:''}<br/>• Duração das aulas <strong>1h</strong></p>`;}).join('');
          const plansBox=document.querySelector(`[data-class-plans="${CSS.escape(item.id)}"]`);if(plansBox){const label=plansBox.querySelector('.plans-title')?.textContent||'Planos mensais';plansBox.innerHTML=`<div class="plans-title">${escapeHtml(label)}</div>${(item.plans||[]).map(plan=>`<div class="plan-row"><div class="plan-left"><span class="plan-pill">${escapeHtml(plan.label)}</span></div><strong class="plan-price">${money.format(Number(plan.price)||0)}</strong></div>`).join('')}<div class="plan-note">Valores por pessoa • Vagas e horários confirmados no WhatsApp</div>`;}
        }
      }}
      if(siteResponse.ok){const site=await siteResponse.json();
        const badge=document.getElementById('siteHeroBadge');if(badge)badge.textContent=site.heroBadge||badge.textContent;
        const title=document.getElementById('siteHeroTitle');if(title)title.textContent=site.heroTitle||title.textContent;
        const subtitle=document.getElementById('siteHeroSubtitle');if(subtitle)subtitle.textContent=site.heroSubtitle||subtitle.textContent;
        const about=document.getElementById('siteAboutText');if(about)about.textContent=site.aboutText||about.textContent;
        if(Array.isArray(site.gallery)&&site.gallery.length){const gallery=site.gallery.map(photo=>({...photo,src:photo.src.startsWith('media/')?`${API_BASE}/${photo.src}`:photo.src}));document.dispatchEvent(new CustomEvent('republica:site-settings-loaded',{detail:{gallery}}));}
      }
    }catch(error){console.warn('Não foi possível atualizar o conteúdo do site.',error);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadSite,{once:true});else loadSite();
})();
