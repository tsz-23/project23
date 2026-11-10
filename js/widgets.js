/* Project 23 shared helpers: weather (Open-Meteo, no key needed), countdown rings, daily quote and word */
(function(){
"use strict";
const W = window.P23W = {};

/* ---------- weather ---------- */
W.units = u => u==="imperial"
  ? {temp:"fahrenheit",wind:"mph",precip:"inch",t:"°F",w:"mph",p:"in",v:"mi",toVis:m=>m/1609.34}
  : {temp:"celsius",wind:"kmh",precip:"mm",t:"°C",w:"km/h",p:"mm",v:"km",toVis:m=>m/1000};
const CODES = {0:["Clear sky","clear"],1:["Mainly clear","clear"],2:["Partly cloudy","partly"],3:["Overcast","cloud"],45:["Fog","fog"],48:["Freezing fog","fog"],
  51:["Light drizzle","drizzle"],53:["Drizzle","drizzle"],55:["Heavy drizzle","drizzle"],56:["Freezing drizzle","drizzle"],57:["Freezing drizzle","drizzle"],
  61:["Light rain","rain"],63:["Rain","rain"],65:["Heavy rain","rain"],66:["Freezing rain","rain"],67:["Freezing rain","rain"],
  71:["Light snow","snow"],73:["Snow","snow"],75:["Heavy snow","snow"],77:["Snow grains","snow"],80:["Light showers","rain"],81:["Showers","rain"],82:["Heavy showers","rain"],
  85:["Snow showers","snow"],86:["Heavy snow showers","snow"],95:["Thunderstorm","storm"],96:["Thunderstorm, hail","storm"],99:["Thunderstorm, heavy hail","storm"]};
W.info = c => { const i=CODES[c]||["Unknown","cloud"]; return {text:i[0],kind:i[1]}; };
const CL='<path d="M20 46h26a9 9 0 0 0 .9-17.95A13 13 0 0 0 21.6 25 10.5 10.5 0 0 0 20 46z" fill="#c9d3e3"/>';
const SUN='<circle cx="32" cy="32" r="10" fill="#ffb703"/><g stroke="#ffb703" stroke-width="3.5" stroke-linecap="round"><path d="M32 10v6M32 48v6M10 32h6M48 32h6M16.5 16.5l4.2 4.2M43.3 43.3l4.2 4.2M16.5 47.5l4.2-4.2M43.3 20.7l4.2-4.2"/></g>';
W.icon = (kind,isDay=1,cls="wxi") => {
  const night = !isDay;
  const body = {
    clear: night ? '<path d="M44 38A16 16 0 1 1 26 14a12 12 0 0 0 18 24z" fill="#e8e4c9"/>' : SUN,
    partly: (night?'<path d="M34 24A11 11 0 1 1 22 11a8 8 0 0 0 12 13z" fill="#e8e4c9"/>':'<circle cx="24" cy="24" r="8" fill="#ffb703"/><g stroke="#ffb703" stroke-width="3" stroke-linecap="round"><path d="M24 8v4M8 24h4M12.7 12.7l2.8 2.8M35.3 12.7l-2.8 2.8"/></g>')+'<path d="M24 52h24a8 8 0 0 0 .8-16A11.5 11.5 0 0 0 27.3 33 9.5 9.5 0 0 0 24 52z" fill="#c9d3e3"/>',
    cloud: CL, fog: CL+'<g stroke="#9fb0c8" stroke-width="3.5" stroke-linecap="round"><path d="M16 52h32M22 58h22"/></g>',
    drizzle: CL+'<g stroke="#4c8dff" stroke-width="3" stroke-linecap="round"><path d="M24 52v3M34 52v3M44 52v3"/></g>',
    rain: CL+'<g stroke="#4c8dff" stroke-width="3.5" stroke-linecap="round"><path d="M24 50l-2 8M34 50l-2 8M44 50l-2 8"/></g>',
    snow: CL+'<g fill="#e6f1ff"><circle cx="24" cy="53" r="2.6"/><circle cx="34" cy="57" r="2.6"/><circle cx="44" cy="53" r="2.6"/></g>',
    storm: CL+'<path d="M35 44l-8 12h7l-3 8 11-14h-7l3-6z" fill="#ffd166"/>'
  }[kind] || CL;
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
};
const cache = (k,ttl,fn)=>async()=>{ try{ const c=JSON.parse(sessionStorage.getItem(k)); if(c&&Date.now()-c.t<ttl) return c.v; }catch{} const v=await fn(); try{ sessionStorage.setItem(k,JSON.stringify({t:Date.now(),v})); }catch{} return v; };
const getJSON = async url=>{ const r=await fetch(url); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); };
W.forecast = (lat,lon,units,force)=>{
  const u=W.units(units), key=`p23.wx.${lat.toFixed(2)},${lon.toFixed(2)},${units}`;
  if(force) sessionStorage.removeItem(key);
  return cache(key,10*60000,()=>getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`+
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m`+
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,visibility,wind_speed_10m,uv_index,is_day,relative_humidity_2m`+
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max`+
    `&timezone=auto&forecast_days=10&temperature_unit=${u.temp}&wind_speed_unit=${u.wind}&precipitation_unit=${u.precip}`))();
};
W.airQuality = (lat,lon)=>cache(`p23.aq.${lat.toFixed(2)},${lon.toFixed(2)}`,30*60000,()=>getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide&timezone=auto`))();
W.search = async q=>{ const d=await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`); return (d.results||[]).map(r=>({name:r.name,region:r.admin1||"",country:r.country||"",lat:r.latitude,lon:r.longitude,tz:r.timezone||""})); };
W.reverse = async (lat,lon)=>{ try{ const d=await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`); return {name:d.city||d.locality||d.principalSubdivision||"My location",region:d.principalSubdivision||"",country:d.countryName||""}; }catch{ return {name:"My location",region:"",country:""}; } };
W.locate = ()=>new Promise((res,rej)=>{ if(!navigator.geolocation) return rej({code:0}); navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}),e=>rej(e),{enableHighAccuracy:false,timeout:12000,maximumAge:300000}); });

/* ---------- little interpreters ---------- */
const COMP=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
W.compass = d=>COMP[Math.round(d/22.5)%16];
W.uv = v=>v<3?["Low","var(--good)"]:v<6?["Moderate","var(--warn)"]:v<8?["High","#ff8a3d"]:v<11?["Very high","var(--bad)"]:["Extreme","#b24bff"];
W.aqi = v=>v<=50?["Good","var(--good)"]:v<=100?["Moderate","var(--warn)"]:v<=150?["Unhealthy for some","#ff8a3d"]:v<=200?["Unhealthy","var(--bad)"]:v<=300?["Very unhealthy","#b24bff"]:["Hazardous","#8a1c3a"];
W.humidityLabel = h=>h<30?"Dry":h<60?"Comfortable":h<75?"Humid":"Very humid";
W.pressureLabel = p=>p<1005?"Low":p>1022?"High":"Normal";
W.beaufort = kmh=>kmh<2?"Calm":kmh<12?"Light breeze":kmh<29?"Gentle to moderate breeze":kmh<50?"Fresh to strong breeze":kmh<75?"Gale":"Storm";
W.moon = (date=new Date())=>{
  const syn=29.530588853, ref=Date.UTC(2000,0,6,18,14), p=(((date.getTime()-ref)/86400000/syn)%1+1)%1;
  const name=p<.03||p>.97?"New moon":p<.22?"Waxing crescent":p<.28?"First quarter":p<.47?"Waxing gibbous":p<.53?"Full moon":p<.72?"Waning gibbous":p<.78?"Last quarter":"Waning crescent";
  return {phase:p,name,illum:Math.round((1-Math.cos(2*Math.PI*p))/2*100)};
};
W.hourIndex = d=>d.hourly.time.indexOf(d.current.time.slice(0,13)+":00");
W.timeIn = (tz,opts)=>{ try{ return new Intl.DateTimeFormat([],{timeZone:tz,...opts}).format(new Date()); }catch{ return new Date().toLocaleTimeString([],opts); } };
W.hm = iso=>{ const [h,m]=iso.slice(11,16).split(":").map(Number); return `${(h%12)||12}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"}`; };
W.hour12 = iso=>{ const h=+iso.slice(11,13); return `${(h%12)||12} ${h<12?"AM":"PM"}`; };
W.hours = s=>`${Math.floor(s/3600)}h ${String(Math.round(s%3600/60)).padStart(2,"0")}m`;

/* ---------- countdowns ---------- */
const CD = window.P23CD = {};
const CIRC = 2*Math.PI*44;
CD.parts = ms=>{ ms=Math.max(0,ms); const s=Math.floor(ms/1000); return {d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60}; };
CD.frac = (c,now)=>{ const span=Math.max(1,c.target-(c.created||now-1)); return Math.max(0,Math.min(1,(c.target-now)/span)); };
CD.big = (c,now)=>{ const ms=c.target-now; if(ms<=0) return ["Now","ended"]; const p=CD.parts(ms); return p.d>0?[String(p.d),p.d===1?"day":"days"]:p.h>0?[String(p.h),p.h===1?"hour":"hours"]:p.m>0?[String(p.m),p.m===1?"minute":"minutes"]:[String(p.s),"seconds"]; };
CD.ring = (c,size=150)=>`<div class="cring" style="--sz:${size}px;--c:${c.color||"var(--accent)"}"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44" stroke-width="7"/><circle class="bar" cx="50" cy="50" r="44" stroke-width="7" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${CIRC.toFixed(2)}"/></svg><div class="in"><b></b><span></span></div></div>`;
CD.tick = (root,c,now)=>{
  const bar=root.querySelector(".bar"), b=root.querySelector(".in b"), sp=root.querySelector(".in span"), [n,u]=CD.big(c,now);
  if(b.textContent!==n) b.textContent=n; if(sp.textContent!==u) sp.textContent=u;
  bar.style.strokeDashoffset=(CIRC*(1-CD.frac(c,now))).toFixed(2);
};
CD.line = (c,now)=>{ const p=CD.parts(c.target-now); return c.target<=now?"Finished":`${p.d}d ${String(p.h).padStart(2,"0")}h ${String(p.m).padStart(2,"0")}m ${String(p.s).padStart(2,"0")}s`; };

/* ---------- quote + word of the day ---------- */
const dayNum = ()=>Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/86400000);
W.QUOTES = ["Small steps, taken daily, cross oceans.","Begin where you are, with what you have.","Focus is a quiet kind of courage.","Done is a good place to start improving.","The best plan is the one you actually begin.","Rest is part of the work, not a break from it.","Clarity comes from action, not from waiting.","One calm hour can outweigh a frantic day.","You don't need more time, you need fewer distractions.","Consistency beats intensity when the road is long.","Make it simple, then make it daily.","Progress is quiet. Notice it anyway.","What you practise grows.","A good day is built from a few deliberate choices.","Start before you feel ready.","Protect your attention like you protect your time.","Every finished task is a tiny proof that you can.","Slow is smooth, and smooth becomes fast.","Look up from the screen. The window is still there.","Today is a fine day to begin something small.","Courage is just fear that has decided to go anyway.","Plan lightly, adjust often, keep going.","Your future self is quietly cheering for you.","Do the next right thing, then the one after.","Good habits are boring in the best way.","Curiosity keeps the mind young.","Kindness is never a wasted detour.","The view is better a little higher up.","Breathe in, plan, breathe out, begin.","Ordinary effort, repeated, becomes extraordinary."];
W.WORDS = [["serendipity","noun","Finding something good by happy accident.","We found the little bookshop by pure serendipity."],["ephemeral","adjective","Lasting for only a very short time.","The frost was ephemeral, gone by mid-morning."],["luminous","adjective","Giving off or reflecting bright light.","A luminous moon hung over the harbour."],["resilient","adjective","Able to recover quickly from difficulty.","She stayed resilient through a tough year."],["meander","verb","To wander in a winding, unhurried way.","The path meanders along the river."],["quixotic","adjective","Idealistic in an impractical way.","His quixotic plan was charming but unrealistic."],["sonder","noun","The realisation that everyone has a life as complex as your own.","On the busy train, he felt a sudden sonder."],["petrichor","noun","The pleasant smell of rain on dry ground.","The petrichor after the storm was wonderful."],["eloquent","adjective","Fluent and persuasive in speaking or writing.","An eloquent speech moved the room."],["tenacious","adjective","Holding firmly to a goal; persistent.","A tenacious student, she never gave up."],["halcyon","adjective","Calm, peaceful and happy.","They remembered the halcyon days of summer."],["alacrity","noun","Brisk and cheerful readiness.","He accepted the job with alacrity."],["verdant","adjective","Green with grass or plants.","Verdant hills rolled to the coast."],["sagacious","adjective","Showing good judgement; wise.","A sagacious mentor guided her."],["effervescent","adjective","Bubbly and enthusiastic.","Her effervescent laugh filled the room."],["lucid","adjective","Clear and easy to understand.","He gave a lucid explanation."],["zenith","noun","The highest point of something.","The sun reached its zenith at noon."],["ameliorate","verb","To make something better.","New seating will ameliorate the crowding."],["candid","adjective","Honest and straightforward.","I appreciate your candid feedback."],["dexterity","noun","Skill in using the hands or mind.","The potter worked with great dexterity."],["ebullient","adjective","Overflowing with energy and excitement.","The team was ebullient after the win."],["gregarious","adjective","Fond of company; sociable.","A gregarious host, he knew every guest."],["imbue","verb","To fill with a feeling or quality.","She imbued the story with warmth."],["juxtapose","verb","To place side by side for contrast.","The gallery juxtaposes old and new."],["kindle","verb","To light a fire or spark a feeling.","The book kindled his interest in space."],["mellifluous","adjective","Sweet and smooth to hear.","A mellifluous voice read the story."],["nascent","adjective","Just beginning to develop.","A nascent idea took shape."],["pragmatic","adjective","Dealing with things sensibly and practically.","A pragmatic approach saved time."],["solace","noun","Comfort in a time of sadness.","Music was her solace."],["vivid","adjective","Strong, clear and full of life.","He painted a vivid picture of the trip."]];
W.daily = arr=>arr[dayNum()%arr.length];
})();