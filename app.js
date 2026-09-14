"use strict";
(function(){
const {CATS, CITIES, P} = window.DATA;
const GUIDE = window.DATA.GUIDE || {sections: []};
const TRIP = GUIDE.trip || {days: [], transfers: {}, hotels: {}};
const RATE = GUIDE.rate && Number(GUIDE.rate.mxn_per_cny);
const RATE_G = RATE || 2.54;
const RATE_KRW = GUIDE.rate_krw && Number(GUIDE.rate_krw.mxn_per_krw);
const ASSETS = window.ASSETS || [];
const VERSION = window.ASSETS_VERSION || "dev";
const TABS = ["ciudades", "buscar", "hoy", "virales", "mas"];
const byId = Object.fromEntries(P.map(p => [p.id, p]));
const cityOf = id => CITIES.find(c => c.id === id);
const cityCode = c => c.id.toUpperCase();
const HANGUL = /[가-힯]/;
const langOf = s => HANGUL.test(s || "") ? "ko" : "zh";

const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let favs = new Set(store.get("rvc-favs", []));
let gastos = store.get("rvc-gastos", []);

const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtMXN = n => "$" + Math.round(n).toLocaleString("es-MX");
const fmtCNY = n => "¥" + Math.round(n).toLocaleString("es-MX");
const fmtKRW = n => "₩" + Math.round(n).toLocaleString("es-MX");
const mapURL = q => "https://maps.apple.com/?q=" + encodeURIComponent(q);
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function todayISO(){
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const tripDay = () => TRIP.days.find(d => d.date === todayISO());
const afterNoon = () => new Date().getHours() >= 12;
const hotelCityFor = d => d.to && afterNoon() ? d.to : d.city;
const hotels = () => Object.assign({}, TRIP.hotels || {}, store.get("rvc-hotels", {}));

/* ---------- navigation state ---------- */

function defaultCity(){
  const d = tripDay();
  if (d) return hotelCityFor(d);
  const last = store.get("rvc-lastcity", null);
  return cityOf(last) ? last : CITIES[0].id;
}

function pickDay(){
  const days = TRIP.days;
  if (!days.length) return null;
  const t = todayISO();
  if (days.some(d => d.date === t)) return t;
  const saved = store.get("rvc-day", null);
  if (days.some(d => d.date === saved)) return saved;
  return t < days[0].date ? days[0].date : days[days.length - 1].date;
}

function parseHash(){
  const [a, b] = location.hash.slice(1).split("/");
  if (TABS.includes(a)) return {tab: a, city: a === "ciudades" && cityOf(b) ? b : null, sub: a === "mas" && b ? decodeURIComponent(b) : null};
  if (cityOf(a)) return {tab: "ciudades", city: a, sub: null};
  if (a === "guia") return {tab: "mas", city: null, sub: null};
  if (a === "gastos") return {tab: "mas", city: null, sub: "gastos"};
  return {tab: "hoy", city: null, sub: null};
}

const h0 = parseHash();
const state = {
  tab: h0.tab, city: h0.city || defaultCity(), sub: h0.sub,
  cat: "all", q: "", gcity: "all", gdel: null, gprefill: null,
  day: pickDay(), vcity: "all", vcat: "all"
};
let SAY = [];
let GCARDS = [];

function setView(tab, opts = {}){
  state.tab = tab;
  if (tab === "ciudades" && opts.city && cityOf(opts.city)){
    if (opts.city !== state.city) state.cat = "all";
    state.city = opts.city;
    store.set("rvc-lastcity", opts.city);
  }
  if (tab === "mas") state.sub = opts.sub || null;
  const hash = tab === "ciudades" ? `ciudades/${state.city}` : tab === "mas" && state.sub ? `mas/${state.sub}` : tab;
  history.replaceState(null, "", "#" + hash);
  render();
  if (!opts.keepScroll) window.scrollTo({top: 0});
}

/* ---------- photos ---------- */

function creditHTML(ph){
  if (!ph || !ph.credit) return "";
  return ph.page ? `<a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.credit)}</a>` : esc(ph.credit);
}

function figHTML(ph, cls, label){
  if (!ph) return "";
  return `<figure class="${cls}">
    <img src="${esc(ph.file)}" alt="${esc(ph.alt || label || "")}" loading="lazy" decoding="async">
    ${ph.kind === "ilustrativa" ? `<span class="illu">Foto ilustrativa</span>` : ""}
    <figcaption>${label ? esc(label) + " · " : ""}Foto: ${creditHTML(ph)}</figcaption>
  </figure>`;
}

function stripHTML(photos){
  return `<div class="strip">${photos.map(ph => `<figure class="thumb">
    <img src="${esc(ph.file)}" alt="${esc(ph.alt || ph.sight || "")}" loading="lazy" decoding="async">
    ${ph.kind === "ilustrativa" ? `<span class="illu">Ilustrativa</span>` : ""}
    <figcaption>${ph.sight ? `<b>${esc(ph.sight)}</b>` : ""}${creditHTML(ph)}</figcaption>
  </figure>`).join("")}</div>`;
}

const thumbHTML = (ph, cls, alt) => ph
  ? `<img class="${cls}" src="${esc(ph.file)}" alt="${esc(ph.alt || alt || "")}" loading="lazy" decoding="async">`
  : "";

/* ---------- places ---------- */

function mustHTML(p){
  const must = Array.isArray(p.m) ? p.m : p.m ? [p.m] : [];
  return must.length ? `<div class="must"><b>Imperdibles</b><ul>${must.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
}

function entryHTML(p, withCity){
  const tags = [];
  if (withCity) tags.push(`<span class="tag city">${esc(cityOf(p.c).es)}</span>`);
  if (p.ig) tags.push(`<span class="tag ig">Viral</span>`);
  if (p.w) tags.push(`<span class="tag when">${esc(p.w)}</span>`);
  if (p.r) tags.push(`<span class="tag res">Reserva</span>`);
  if (p.v) tags.push(`<span class="tag viral">${esc(p.v)}</span>`);
  if (p.u) tags.push(`<span class="tag unv">Sin verificar</span>`);
  const meta = [p.p, p.h].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("");
  const on = favs.has(p.id);
  return `<article class="entry${p.ph ? " has-ph" : ""}" id="e-${esc(p.id)}">
    ${figHTML(p.ph, "ph")}
    <div class="main">
      <span class="cat">${esc(CATS[p.k])}</span>
      <h3>${esc(p.n)}</h3>
      <div class="zh" lang="${langOf(p.z)}">${esc(p.z)}${p.a ? `<span class="addr">${esc(p.a)}</span>` : ""}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      <p>${esc(p.d)}</p>
      ${mustHTML(p)}
      ${p.pp ? `<figure class="prod"><img src="${esc(p.pp.file)}" alt="${esc(p.pp.alt || p.pp.sight || "")}" loading="lazy" decoding="async"><figcaption>${p.pp.sight ? `<b>${esc(p.pp.sight)}</b>` : ""}Foto${p.pp.kind === "ilustrativa" ? " ilustrativa" : ""}: ${creditHTML(p.pp)}</figcaption></figure>` : ""}
      ${p.t ? `<p class="tip"><b>Tip:</b> ${esc(p.t)}</p>` : ""}
      ${p.s ? `<a class="src" href="${esc(p.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}
    </div>
    <div class="side">
      <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir</button>
      <small>chofer</small>
      <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Quitar de guardados" : "Guardar"}">${on ? "★" : "☆"}</button>
    </div>
  </article>`;
}

function recHTML(p){
  const on = favs.has(p.id);
  const img = p.ph || p.pp;
  return `<article class="rec${img ? "" : " no-ph"}">
    ${img ? `<img src="${esc(img.file)}" alt="${esc(img.alt || p.n)}" loading="lazy" decoding="async">` : ""}
    <button class="gbody rec-open" type="button" data-open="${p.id}">
      <span class="cat">${esc(CATS[p.k])}${p.ig ? " · viral" : ""}</span>
      <b class="rec-title">${esc(p.n)}</b>
      <span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>
      ${p.p ? `<span class="meta"><span>${esc(p.p)}</span></span>` : ""}
    </button>
    <div class="side">
      <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir</button>
      <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Quitar de guardados" : "Guardar"}">${on ? "★" : "☆"}</button>
    </div>
  </article>`;
}

function renderCity(app){
  const c = cityOf(state.city) || CITIES[0];
  const all = P.filter(p => p.c === c.id);
  const counts = {all: all.length, fav: all.filter(p => favs.has(p.id)).length};
  Object.keys(CATS).forEach(k => counts[k] = all.filter(p => p.k === k).length);
  const shown = state.cat === "all" ? all
    : state.cat === "fav" ? all.filter(p => favs.has(p.id))
    : all.filter(p => p.k === state.cat);
  const chipDefs = [["all", "Todo"], ...Object.entries(CATS), ["fav", "★ Guardados"]]
    .filter(([k]) => k === "all" || k === "fav" || counts[k] > 0);
  const banner = all.find(p => p.ph && p.ph.kind === "lugar" && p.k === "noc") || all.find(p => p.ph && p.ph.kind === "lugar");

  app.innerHTML = `
    <div class="citypick" id="citypick" role="toolbar" aria-label="Elegir ciudad">
      ${CITIES.map(x => `<button class="cp" type="button" data-pick-city="${x.id}" aria-pressed="${x.id === c.id}">
        <span class="es">${esc(x.es)}</span><span class="dt">${esc(x.dates)}</span>
      </button>`).join("")}
    </div>

    <section class="city-head">
      <p class="city-sc" aria-hidden="true">${cityCode(c)}</p>
      <div class="city-meta">
        <span class="dt">${esc(c.dates)}</span>
        <h1>${esc(c.es)}</h1>
        <p>${all.length} lugares</p>
      </div>
    </section>
    ${banner ? figHTML(banner.ph, "banner", banner.n) : ""}
    <p class="intro">${esc(c.intro)}</p>

    ${(c.slots || []).length ? `<h2 class="lbl">Tus ratos libres</h2>
    <ul class="slots">
      ${c.slots.map(s => `<li class="slot"><span class="d">${esc(s[0])}<small>${esc(s[1])}</small></span><p>${esc(s[2])}</p></li>`).join("")}
    </ul>` : ""}
    ${(c.notes || []).length ? `<div class="notes"><ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}

    <h2 class="lbl">Lugares</h2>
    <div class="chips" role="toolbar" aria-label="Filtrar por tipo">
      ${chipDefs.map(([k, l]) => `<button class="chip" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${esc(l)}<span>${counts[k]}</span></button>`).join("")}
    </div>
    <div class="list">
      ${shown.length ? shown.map(p => entryHTML(p, false)).join("")
        : `<p class="empty">${state.cat === "fav" ? "Todavía no guardas lugares en esta ciudad. Toca ☆ en los que quieras tener a la mano." : "Nada en esta categoría."}</p>`}
    </div>`;

  requestAnimationFrame(() => centerPressed("citypick"));
}

function centerPressed(id){
  const strip = document.getElementById(id);
  const on = strip && strip.querySelector('[aria-pressed="true"]');
  if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2;
}

/* ---------- buscar ---------- */

const SUGGEST = ["pato", "réplicas", "hot pot", "croissant", "Pop Mart", "xiaolongbao", "bar", "té", "DJI", "azotea", "helado", "seda"];

function renderSearch(app){
  app.innerHTML = `
    <div class="searchbar">
      <label class="sr" for="q">Buscar lugares</label>
      <input id="q" type="search" placeholder="Pato, Pop Mart, 小笼包, bar…" autocomplete="off" enterkeyhint="search" value="${esc(state.q)}">
    </div>
    <div id="results"></div>`;
  renderResults();
}

function renderResults(){
  const box = document.getElementById("results");
  if (!box) return;
  const q = norm(state.q);
  if (!q){
    const saved = P.filter(p => favs.has(p.id));
    box.innerHTML = `
      <h2 class="lbl">Prueba con</h2>
      <div class="suggest">${SUGGEST.map(s => `<button class="chip" type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      ${saved.length ? `<h2 class="lbl">Tus guardados · ${saved.length}</h2><div class="recs">${saved.map(recHTML).join("")}</div>`
        : `<p class="empty">Toca ☆ en cualquier lugar para tenerlo aquí a la mano.</p>`}`;
    return;
  }
  const hits = P.filter(p => [p.n, p.z, p.a, p.d, p.t, p.v, CATS[p.k], cityOf(p.c).es, ...(Array.isArray(p.m) ? p.m : [p.m])].some(f => norm(f).includes(q)));
  box.innerHTML = `
    <h2 class="lbl">${hits.length} ${hits.length === 1 ? "resultado" : "resultados"}</h2>
    <div class="list">${hits.length ? hits.map(p => entryHTML(p, true)).join("")
      : `<p class="empty">Nada con “${esc(state.q)}”. Prueba con el nombre en chino o con una palabra como “pato”, “réplicas” o “bar”.</p>`}</div>`;
}

/* ---------- hoy: one day at a time ---------- */

function currentHotelCity(){
  const d = tripDay();
  if (d) return hotelCityFor(d);
  if (state.tab === "ciudades" && cityOf(state.city)) return state.city;
  const first = TRIP.days[0];
  return !first || todayISO() < first.date ? CITIES[0].id : TRIP.days[TRIP.days.length - 1].city;
}

const transferLabel = tr => tr.term ? `Terminal: ${tr.term}` : "";

function renderHoy(app){
  const days = TRIP.days;
  if (!days.length){ app.innerHTML = `<p class="empty">No hay itinerario cargado.</p>`; return; }
  const t = todayISO();
  let i = days.findIndex(d => d.date === state.day);
  if (i < 0){ state.day = pickDay(); i = days.findIndex(d => d.date === state.day); }
  const d = days[i];
  const c = cityOf(d.city), to = d.to && cityOf(d.to);
  const isToday = d.date === t;
  const prev = days[i - 1], next = days[i + 1];

  let status = `Día ${i + 1} de ${days.length}`;
  if (isToday) status = `Hoy · ${status}`;
  else if (t < days[0].date){
    const n = Math.round((Date.parse(days[0].date) - Date.parse(t)) / 86400000);
    status += ` · faltan ${n} ${n === 1 ? "día" : "días"}`;
  }

  const photos = d.photos || [];
  const transfers = (d.go || []).map(k => TRIP.transfers[k]).filter(Boolean);
  const slots = [c, to].filter(Boolean).flatMap(cc => (cc.slots || []).filter(s => s[0] === d.short));
  const cityIds = [d.city, d.to].filter(Boolean);
  const recs = P.filter(p => p.w === d.short && cityIds.includes(p.c));
  const saved = P.filter(p => favs.has(p.id) && cityIds.includes(p.c) && p.w !== d.short);
  const spentDay = gastos.filter(g => g.d === d.date);
  const here = cityOf(hotelCityFor(d));
  const showHint = !isStandalone() && !store.get("rvc-install-hidden", false);

  app.innerHTML = `
    ${showHint ? `<button class="hint" type="button" data-tab="mas"><b>Instálala antes de volar</b> para usarla en China sin internet →</button>` : ""}
    <div class="daynav">
      <button class="btn" type="button" data-day="${prev ? prev.date : ""}" ${prev ? "" : "disabled"} aria-label="Día anterior">←</button>
      <div class="dn-title"><span class="dt">${esc(status)}</span><b>${esc(d.label)}</b></div>
      <button class="btn" type="button" data-day="${next ? next.date : ""}" ${next ? "" : "disabled"} aria-label="Día siguiente">→</button>
    </div>
    <div class="daystrip" id="daystrip" role="toolbar" aria-label="Días del viaje">
      ${days.map(x => `<button class="dchip${x.date === t ? " is-today" : ""}" type="button" data-day="${x.date}" aria-pressed="${x.date === d.date}">
        <span class="dw">${esc(x.short)}</span><span class="dc">${cityCode(cityOf(x.city))}</span>
      </button>`).join("")}
    </div>

    <section class="city-head day-head">
      <p class="city-sc" aria-hidden="true">${cityCode(c)}</p>
      <div class="city-meta">
        <span class="dt">${to ? `${esc(c.es)} → ${esc(to.es)}` : esc(c.es)}</span>
        <h1>${esc(d.title)}</h1>
      </div>
    </section>

    ${photos.length ? figHTML(photos[0], "banner day-hero", photos[0].sight) + (photos.length > 1 ? stripHTML(photos.slice(1)) : "") : ""}

    <h2 class="lbl">Tu día</h2>
    <ol class="tl day-tl">${d.items.map(it => `<li><span class="tm">${esc(it.time || "")}</span><span>${esc(it.text)}</span></li>`).join("")}</ol>
    ${transfers.length ? `<div class="row go-row">${transfers.map(tr => `<button class="btn go-btn" type="button" data-transfer="${esc(tr.id)}">Ir · ${esc(tr.n)}</button>`).join("")}</div>` : ""}

    ${slots.length ? `<h2 class="lbl">Tu rato libre</h2>${slots.map(s => `<p class="gp"><span class="tm">${esc(s[1])}</span> ${esc(s[2])}</p>`).join("")}` : ""}

    ${recs.length ? `<h2 class="lbl">Recomendado para este día · ${recs.length}</h2><div class="recs">${recs.map(recHTML).join("")}</div>` : ""}
    ${saved.length ? `<h2 class="lbl">Tus guardados en ${esc(cityIds.map(id => cityOf(id).es).join(" y "))}</h2><div class="recs">${saved.map(recHTML).join("")}</div>` : ""}

    ${spentDay.length ? `<div class="day-gastos"><span>Gastaste este día</span><b>${fmtMXN(sumBy(spentDay, toMXN))} MXN</b></div>` : ""}

    <div class="row quick">
      <button class="btn primary" type="button" data-add-gasto data-gdate="${d.date}" data-gcityid="${here.id}">Anotar gasto</button>
      <button class="btn" type="button" data-pick-city="${here.id}">Lugares en ${esc(here.es)} →</button>
      <button class="btn" type="button" data-sub="frases-emergencia">Emergencias</button>
    </div>`;

  requestAnimationFrame(() => centerPressed("daystrip"));
}

function goDay(date){
  if (!date || !TRIP.days.some(d => d.date === date)) return;
  state.day = date;
  store.set("rvc-day", date);
  render();
  window.scrollTo({top: 0});
}

/* ---------- virales ---------- */

function renderVirales(app){
  const pool = P.filter(p => p.ig || p.v);
  const scoped = state.vcity === "all" ? pool : pool.filter(p => p.c === state.vcity);
  const shown = state.vcat === "all" ? scoped : scoped.filter(p => p.k === state.vcat);
  const cats = Object.entries(CATS).filter(([k]) => scoped.some(p => p.k === k));
  app.innerHTML = `
    <section class="city-head">
      <p class="city-sc" aria-hidden="true">VIRAL</p>
      <div class="city-meta">
        <span class="dt">TikTok · Instagram · Xiaohongshu</span>
        <h1>Lo más viral</h1>
        <p>${pool.length} lugares para la foto y la fila</p>
      </div>
    </section>
    <div class="chips" role="toolbar" aria-label="Filtrar virales por ciudad">
      <button class="chip" type="button" data-vcity="all" aria-pressed="${state.vcity === "all"}">Todas</button>
      ${CITIES.filter(c => pool.some(p => p.c === c.id)).map(c => `<button class="chip" type="button" data-vcity="${c.id}" aria-pressed="${state.vcity === c.id}">${esc(c.es)}</button>`).join("")}
    </div>
    <div class="chips" role="toolbar" aria-label="Filtrar virales por tipo">
      <button class="chip" type="button" data-vcat="all" aria-pressed="${state.vcat === "all"}">Todo</button>
      ${cats.map(([k, l]) => `<button class="chip" type="button" data-vcat="${k}" aria-pressed="${state.vcat === k}">${esc(l)}</button>`).join("")}
    </div>
    ${shown.length ? `<div class="vgrid">${shown.map(p => `<button class="vcard" type="button" data-open="${p.id}">
        ${p.ph ? `<img src="${esc(p.ph.file)}" alt="${esc(p.ph.alt || p.n)}" loading="lazy" decoding="async">` : `<span class="vnoimg">${cityCode(cityOf(p.c))}</span>`}
        <span class="vcity">${cityCode(cityOf(p.c))}</span>
        <span class="vbody"><b class="vtitle">${esc(p.n)}</b><span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>${p.v ? `<span class="vwhy">${esc(p.v)}</span>` : ""}</span>
      </button>`).join("")}</div>` : `<p class="empty">Nada viral con este filtro.</p>`}
    <p class="fine">Lo viral sale de guías y blogs que citan TikTok, Douyin, Xiaohongshu o Instagram. Toca una tarjeta para ver imperdibles, precios y cómo llegar.</p>`;
}

function openPlace(id){
  const p = byId[id];
  if (!p) return;
  state.q = p.n;
  setView("buscar");
}

/* ---------- más: hub, guía, hoteles, traslados ---------- */

const TOPICS = {
  "traslados": {z: "交通", label: "Traslados", desc: "Estaciones y aeropuertos en chino"},
  "hoteles": {z: "酒店", label: "Mis hoteles", desc: "Captura tus hoteles para el chofer"},
  "frases-emergencia": {z: "急救", label: "Emergencias", desc: "110, 120 y frases"},
  "emergencias": {z: "使馆", label: "Embajadas y hospitales", desc: "México, España y clínicas"},
  "restaurante": {z: "点菜", label: "Restaurante", desc: "Sin picante, alergias, la cuenta"},
  "regateo": {z: "砍价", label: "Regateo", desc: "Calculadora y frases"},
  "replicas": {z: "高仿", label: "Réplicas", desc: "Calidades y precios reales"},
  "que-comprar": {z: "购物", label: "Qué comprar", desc: "Y qué no, en ropa y tecnología"},
  "marcas": {z: "品牌", label: "Marcas chinas", desc: "Deportivas, moda y outdoor"},
  "apps": {z: "应用", label: "Apps", desc: "Qué bajar antes de volar"},
  "esim": {z: "上网", label: "eSIM y VPN", desc: "Internet sin bloqueos"},
  "dinero": {z: "钱", label: "Dinero", desc: "Pagos y devolución de impuestos"}
};

function transfersHTML(){
  return `<div class="glist">${Object.values(TRIP.transfers).map(tr => `
    <div class="gitem trow${tr.ph ? " has-thumb" : ""}">
      ${thumbHTML(tr.ph, "tthumb", tr.n)}
      <div class="gbody">
        <h4>${esc(tr.n)}</h4>
        <div class="zh" lang="zh">${esc(tr.z)}</div>
        ${tr.term ? `<div class="meta"><span>${esc(transferLabel(tr))}</span></div>` : ""}
        ${tr.note ? `<p class="tip">${esc(tr.note)}</p>` : ""}
        ${tr.ph ? `<span class="credit">Foto: ${creditHTML(tr.ph)}</span>` : ""}
      </div>
      <button class="go" type="button" data-transfer="${esc(tr.id)}" aria-label="Mostrar ${esc(tr.n)} al chofer">Ir</button>
    </div>`).join("")}</div>`;
}

function hotelsEditorHTML(){
  const H = hotels();
  return `<p class="gp">Pega el nombre y la dirección que vienen en tu confirmación de reserva (en chino o coreano), o pídeselos a WildChina. Se guardan solo en este teléfono y funcionan sin internet.</p>
  <div class="hotels">${CITIES.map(c => {
    const h = H[c.id] || {};
    const has = h.z || h.a;
    return `<details class="hotel" id="hotel-${c.id}">
      <summary><b>${esc(c.es)}</b><span class="hs" id="hsum-${c.id}">${has ? esc(h.n || h.z) : "Sin capturar"}</span></summary>
      <div class="hform">
        <label for="h-${c.id}-n">Nombre del hotel</label>
        <input id="h-${c.id}-n" value="${esc(h.n || "")}" placeholder="Ej. Hotel Éclat" autocomplete="off">
        <label for="h-${c.id}-z">Nombre en el idioma local</label>
        <input id="h-${c.id}-z" value="${esc(h.z || "")}" placeholder="${c.id === "se" ? "호텔 이름" : "酒店名称"}" autocomplete="off">
        <label for="h-${c.id}-a">Dirección en el idioma local</label>
        <textarea id="h-${c.id}-a" rows="2" placeholder="${c.id === "se" ? "주소" : "地址"}">${esc(h.a || "")}</textarea>
        <label for="h-${c.id}-t">Teléfono del hotel</label>
        <input id="h-${c.id}-t" type="tel" value="${esc(h.t || "")}" placeholder="+86 …" autocomplete="off">
        <div class="row">
          <button class="btn primary" type="button" data-save-hotel="${c.id}">Guardar</button>
          <button class="btn" type="button" data-hotel="${c.id}">Mostrar al chofer</button>
          <span class="saved-msg" id="hmsg-${c.id}" aria-live="polite"></span>
        </div>
      </div>
    </details>`;
  }).join("")}</div>`;
}

const VIRTUAL = [
  {id: "traslados", title: "Traslados en chino", intro: "Estaciones y aeropuertos de tu itinerario. Toca 去 para enseñárselo al taxista.", html: transfersHTML},
  {id: "hoteles", title: "Mis hoteles", html: hotelsEditorHTML}
];

function orderedSections(){
  const all = [...VIRTUAL, ...(GUIDE.sections || [])];
  const known = Object.keys(TOPICS).map(id => all.find(s => s.id === id)).filter(Boolean);
  return [...known, ...all.filter(s => !TOPICS[s.id])];
}

const tagClass = t => /no vale|evita|nunca|no compres|no la/i.test(t) ? "no"
  : /ojo|sin verificar/i.test(t) ? "unv"
  : /vale la pena|esencial|recomend/i.test(t) ? "when" : "viral";

function calcHTML(b){
  const pct = (v, d) => Number(v) || d;
  return `<div class="calc">
    <label for="ask">Calculadora de regateo · te piden</label>
    <div class="calc-in"><span>¥</span><input id="ask" type="number" inputmode="decimal" min="0" placeholder="800"
      data-offer="${pct(b.offer, 0.2)}" data-goal="${pct(b.goal, 0.3)}" data-max="${pct(b.max, 0.4)}"></div>
    <dl class="calc-out" id="ask-out">
      <div><dt>Primera oferta · ${Math.round(pct(b.offer, 0.2) * 100)}%</dt><dd data-k="offer">—</dd></div>
      <div><dt>Meta · ${Math.round(pct(b.goal, 0.3) * 100)}%</dt><dd data-k="goal">—</dd></div>
      <div><dt>No pases de · ${Math.round(pct(b.max, 0.4) * 100)}%</dt><dd data-k="max">—</dd></div>
    </dl>
  </div>`;
}

function listItemHTML(it){
  const gi = it.addr ? GCARDS.push(it) - 1 : -1;
  const tel = it.tel ? `<a class="tel" href="tel:${esc(String(it.tel).replace(/[^\d+]/g, ""))}">${esc(it.tel)}</a>` : "";
  return `<div class="gitem${it.ph ? " has-thumb" : ""}">
    ${thumbHTML(it.ph, "ithumb", it.h)}
    <div class="gbody">
      <div class="gtop"><h4>${esc(it.h)}</h4>${it.tag ? `<span class="tag ${tagClass(it.tag)}">${esc(it.tag)}</span>` : ""}</div>
      ${it.zh ? `<div class="zh" lang="${langOf(it.zh)}">${esc(it.zh)}${it.addr ? `<span class="addr">${esc(it.addr)}</span>` : ""}</div>` : it.addr ? `<div class="zh" lang="${langOf(it.addr)}"><span class="addr">${esc(it.addr)}</span></div>` : ""}
      ${it.price ? `<div class="meta"><span>${esc(it.price)}</span></div>` : ""}
      ${it.b ? `<p>${esc(it.b)}</p>` : ""}
      ${tel || gi >= 0 ? `<div class="row">${tel}${gi >= 0 ? `<button class="btn go-btn" type="button" data-gcard="${gi}">Ir · Mostrar al chofer</button>` : ""}</div>` : ""}
      ${it.s ? `<a class="src" href="${esc(it.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}
      ${it.ph ? `<span class="credit">Foto${it.ph.kind === "ilustrativa" ? " ilustrativa" : ""}: ${creditHTML(it.ph)}</span>` : ""}
    </div>
  </div>`;
}

function blockHTML(b){
  const title = b.title ? `<h3 class="gsub">${esc(b.title)}</h3>` : "";
  switch (b.t){
    case "p": return `<p class="gp">${esc(b.text)}</p>`;
    case "calc": return calcHTML(b);
    case "list": return title + `<div class="glist">${(b.items || []).map(listItemHTML).join("")}</div>`;
    case "table": return title + `<div class="gtable"><table>
      <thead><tr>${(b.cols || []).map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${(b.rows || []).map(r => `<tr>${r.map((cell, i) => i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>${b.note ? `<p class="fine">${esc(b.note)}</p>` : ""}`;
    case "phrases": return title + `<div class="phrases">${(b.items || []).map(x => {
      const i = SAY.push(x) - 1;
      return `<button class="phrase" type="button" data-say="${i}"><span class="pz" lang="${langOf(x.zh)}">${esc(x.zh)}</span><span class="pp">${esc(x.py)}</span><span class="pe">${esc(x.es)}</span></button>`;
    }).join("")}</div><p class="fine">Toca una frase para enseñarla en grande.</p>`;
    default: return "";
  }
}

function renderMas(app){
  const secs = orderedSections();
  const spent = sumBy(gastos, toMXN);
  app.innerHTML = `
    <div class="install" id="install" hidden></div>
    <div class="hub">
      <button class="hubtile feature" type="button" data-sub="gastos">
        <span class="hub-txt"><b>Gastos del viaje</b><small>${gastos.length ? `${fmtMXN(spent)} MXN en ${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}` : "Anota lo que gastas y se suma en pesos"}</small></span>
      </button>
      ${secs.map(s => {
        const t = TOPICS[s.id] || {label: s.title, desc: ""};
        return `<button class="hubtile" type="button" data-sub="${esc(s.id)}"><b>${esc(t.label)}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ""}</button>`;
      }).join("")}
      <button class="hubtile" type="button" data-sub="all"><b>Guía completa</b><small>Todos los temas en una página</small></button>
    </div>

    <section class="offline">
      <h2 class="lbl">Sin internet</h2>
      <p id="offline-state">Revisando qué está guardado en este teléfono…</p>
      <ol>
        <li><b>iPhone:</b> abre el link en Safari → <b>Compartir</b> → <b>Agregar a inicio</b>. Ábrela desde el ícono 去 con Wi-Fi hasta que diga “Lista sin internet”.</li>
        <li><b>Android:</b> en Chrome, menú ⋮ → <b>Instalar app</b>.</li>
        <li>Pruébala en modo avión antes de volar y ábrela un par de veces en los días previos.</li>
      </ol>
    </section>

    <h2 class="lbl">Para todo el viaje</h2>
    <ul class="tips">
      <li><b>Antes de volar:</b> eSIM con VPN (WhatsApp, Google e Instagram están bloqueados en China), Alipay con tu tarjeta ligada y Didi abierto desde Alipay.</li>
      <li><b>Dianping (大众点评):</b> “在线取号” te forma en la fila en línea; “订座” reserva mesa.</li>
      <li><b>Réplicas:</b> pocas piezas por marca y de uso personal. Las aduanas de México y de la UE pueden decomisarlas.</li>
      <li><b>El sello 去</b> abre el nombre y la dirección en el idioma local a pantalla completa para el taxista.</li>
    </ul>
    <p class="fine">Investigado en septiembre de 2026 con fuentes de 2025–2026. “Sin verificar” significa que no se pudo confirmar abierto o con ese horario: revísalo en Dianping o Naver antes de ir. Precios aproximados. Fotos de Wikimedia Commons con licencia libre; “Foto ilustrativa” muestra el platillo o la zona, no el local exacto.</p>`;
  renderInstall();
  updateOffline();
}

function renderGuide(app){
  SAY = []; GCARDS = [];
  const secs = orderedSections();
  const shown = state.sub === "all" ? secs : secs.filter(s => s.id === state.sub);
  if (!shown.length){ state.sub = null; return renderMas(app); }
  const money = ["regateo", "replicas", "que-comprar", "marcas", "dinero", "all"].includes(state.sub);
  const r = GUIDE.rate;
  const conv = RATE && money ? `<div class="calc">
      <label for="cny">Yuanes a pesos</label>
      <div class="calc-in"><span>¥</span><input id="cny" type="number" inputmode="decimal" min="0" placeholder="100"><output id="mxn" for="cny">≈ $— MXN</output></div>
      <p class="fine">¥1 ≈ $${RATE.toFixed(2)} MXN${r.date ? ` · ${esc(r.date)}` : ""}</p>
    </div>` : "";
  app.innerHTML = `
    <div class="chips topicbar" id="topicbar" role="toolbar" aria-label="Temas">
      ${secs.map(s => `<button class="chip" type="button" data-sub="${esc(s.id)}" aria-pressed="${state.sub === s.id}">${esc((TOPICS[s.id] || {}).label || s.title)}</button>`).join("")}
      <button class="chip" type="button" data-sub="all" aria-pressed="${state.sub === "all"}">Todo</button>
    </div>
    ${conv}
    ${shown.map(s => `<section class="gsec" id="g-${esc(s.id)}">
      <h2 class="gh">${esc(s.title)}</h2>
      ${figHTML(s.ph, "banner")}
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
      ${s.html ? s.html() : (s.blocks || []).map(blockHTML).join("")}
    </section>`).join("")}`;
  requestAnimationFrame(() => centerPressed("topicbar"));
}

/* ---------- gastos ---------- */

const CAT_G = [["comida", "Comida"], ["compras", "Compras"], ["transporte", "Transporte"], ["entradas", "Entradas y tours"], ["hospedaje", "Hospedaje"], ["otros", "Otros"]];
const PAY = [["app", "Alipay / WeChat"], ["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"]];
const CUR = [["CNY", "¥"], ["MXN", "$"], ...(RATE_KRW ? [["KRW", "₩"]] : [])];
const labelOf = (list, k) => (list.find(x => x[0] === k) || [k, k])[1];
const toMXN = g => g.cur === "MXN" ? g.amt : g.cur === "KRW" ? g.amt * (RATE_KRW || 0) : g.amt * RATE_G;
const toCNY = g => toMXN(g) / RATE_G;
const sumBy = (list, fn) => list.reduce((s, g) => s + fn(g), 0);
const fmtOrig = g => g.cur === "CNY" ? fmtCNY(g.amt) : g.cur === "KRW" ? fmtKRW(g.amt) : "en pesos";

function dayShort(iso){
  const d = TRIP.days.find(x => x.date === iso);
  if (d) return d.short;
  const [y, m, dd] = iso.split("-");
  return `${Number(dd)}/${Number(m)}/${y.slice(2)}`;
}

function barsHTML(title, rows, total){
  const max = Math.max(...rows.map(r => r.mxn), 1);
  return `<h3 class="gsub">${esc(title)}</h3>
  <div class="bars">${rows.map(r => {
    const pct = total ? Math.round(r.mxn / total * 100) : 0;
    return `<div class="bar-row" tabindex="0" data-tip-v="${esc(fmtMXN(r.mxn))} MXN · ${esc(fmtCNY(r.mxn / RATE_G))}" data-tip-l="${esc(r.l)} · ${r.n} ${r.n === 1 ? "gasto" : "gastos"} · ${pct}%">
      <span class="bar-label">${esc(r.l)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, r.mxn / max * 100).toFixed(1)}%"></span></span>
      <span class="bar-val">${esc(fmtMXN(r.mxn))}</span>
    </div>`;
  }).join("")}</div>`;
}

function renderGastos(app){
  const last = store.get("rvc-glast", {});
  const list = state.gcity === "all" ? gastos : gastos.filter(g => g.c === state.gcity);
  const totalMXN = sumBy(list, toMXN);
  const totalCNY = sumBy(list, toCNY);
  const t = todayISO();
  const todayMXN = sumBy(list.filter(g => g.d === t), toMXN);
  const nDays = new Set(list.map(g => g.d)).size;
  const budget = Number(store.get("rvc-budget", 0)) || 0;
  const city = cityOf(state.gcity);
  const pre = state.gprefill || {};
  const td = tripDay();
  const gcityDefault = pre.c || (td ? hotelCityFor(td) : last.c && cityOf(last.c) ? last.c : CITIES[0].id);
  const lastCur = CUR.some(x => x[0] === last.cur) ? last.cur : "CNY";

  const byCat = CAT_G.map(([k, l]) => {
    const g = list.filter(x => x.cat === k);
    return {k, l, mxn: sumBy(g, toMXN), n: g.length};
  }).filter(x => x.n).sort((a, b) => b.mxn - a.mxn);
  const byCity = CITIES.map(c => {
    const g = list.filter(x => x.c === c.id);
    return {k: c.id, l: c.es, sc: c.sc, mxn: sumBy(g, toMXN), n: g.length};
  }).filter(x => x.n);

  const dates = [...new Set(list.map(g => g.d))].sort().reverse();
  const options = (arr, sel) => arr.map(([k, l]) => `<option value="${esc(k)}"${k === sel ? " selected" : ""}>${esc(l)}</option>`).join("");

  let budgetBlock = "";
  if (state.gcity === "all"){
    const pct = budget ? Math.round(totalMXN / budget * 100) : 0;
    const remaining = budget - totalMXN;
    const cls = pct > 100 ? " over" : pct >= 85 ? " warn" : "";
    budgetBlock = `<div class="budget">
      <div class="budget-top">
        <label for="g-budget">Presupuesto del viaje en pesos</label>
        <input id="g-budget" type="number" inputmode="numeric" min="0" step="100" value="${budget || ""}" placeholder="Ej. 60000">
      </div>
      ${budget ? `<div class="meter" role="meter" aria-label="Presupuesto usado" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.round(totalMXN)}"><span class="meter-fill${cls}" style="width:${Math.min(100, pct)}%"></span></div>
      <p class="fine">${pct}% usado · ${remaining >= 0 ? `te quedan ${fmtMXN(remaining)}` : `te pasaste por ${fmtMXN(-remaining)}`}</p>` : ""}
    </div>`;
  }

  app.innerHTML = `
    <form class="calc gform" id="gform" autocomplete="off" novalidate>
      <label for="g-amt">Nuevo gasto</label>
      <div class="calc-in">
        <select id="g-cur" aria-label="Moneda">${options(CUR, lastCur)}</select>
        <input id="g-amt" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Monto">
      </div>
      <div class="gfields">
        <div><label for="g-cat">Categoría</label><select id="g-cat">${options(CAT_G, last.cat || "comida")}</select></div>
        <div><label for="g-pay">Pago</label><select id="g-pay">${options(PAY, last.pay || "app")}</select></div>
        <div><label for="g-city">Ciudad</label><select id="g-city">${options(CITIES.map(c => [c.id, c.es]), gcityDefault)}</select></div>
        <div><label for="g-date">Fecha</label><input id="g-date" type="date" value="${esc(pre.d || t)}"></div>
        <div class="wide"><label for="g-note">Nota</label><input id="g-note" type="text" maxlength="80" placeholder="Ej. pato en Siji Minfu"></div>
      </div>
      <div class="row"><button class="btn primary" type="submit">Agregar gasto</button><span class="saved-msg" id="gmsg" aria-live="polite"></span></div>
    </form>

    <div class="chips gfilter" role="toolbar" aria-label="Filtrar gastos por ciudad">
      <button class="chip" type="button" data-gcity="all" aria-pressed="${state.gcity === "all"}">Todo el viaje</button>
      ${CITIES.map(c => `<button class="chip" type="button" data-gcity="${c.id}" aria-pressed="${state.gcity === c.id}">${esc(c.es)}</button>`).join("")}
    </div>

    <div class="hero">
      <span class="hero-lbl">${city ? `Total en ${esc(city.es)}` : "Total del viaje"}</span>
      <span class="hero-num">${fmtMXN(totalMXN)} <small>MXN</small></span>
      <span class="hero-sub">${fmtCNY(totalCNY)} · ${list.length} ${list.length === 1 ? "gasto" : "gastos"}</span>
    </div>
    <div class="tiles">
      <div class="tile"><span>Hoy</span><b>${fmtMXN(todayMXN)}</b></div>
      <div class="tile"><span>Promedio por día con gastos</span><b>${fmtMXN(nDays ? totalMXN / nDays : 0)}</b></div>
    </div>
    ${budgetBlock}

    ${list.length ? `
      ${state.gcity === "all" && byCity.length > 1 ? barsHTML("Por ciudad", byCity, totalMXN) : ""}
      ${byCat.length > 1 ? barsHTML("Por categoría", byCat, totalMXN) : ""}

      <h3 class="gsub">Detalle</h3>
      <div class="glog">${dates.map(dt => {
        const items = list.filter(g => g.d === dt).sort((a, b) => b.ts - a.ts);
        return `<div class="gday">
          <div class="gday-h"><span class="d">${esc(dayShort(dt))}</span><span class="tm">${esc(fmtMXN(sumBy(items, toMXN)))}</span></div>
          ${items.map(g => {
            const gc = cityOf(g.c);
            const confirm = state.gdel === g.id;
            return `<div class="grow">
              <div class="gbody">
                <h4>${esc(g.note || labelOf(CAT_G, g.cat))}</h4>
                <span class="meta">${gc ? `<span>${esc(gc.es)}</span>` : ""}<span>${esc(labelOf(CAT_G, g.cat))}</span><span>${esc(labelOf(PAY, g.pay))}</span></span>
              </div>
              <div class="gamt"><b>${esc(fmtMXN(toMXN(g)))}</b><small>${esc(fmtOrig(g))}</small></div>
              <button class="btn gdel${confirm ? " confirm" : ""}" type="button" data-gdel="${esc(g.id)}" aria-label="${confirm ? "Confirmar borrar gasto" : "Borrar gasto"}">${confirm ? "¿Borrar?" : "×"}</button>
            </div>`;
          }).join("")}
        </div>`;
      }).join("")}</div>

      <div class="row gshare">
        <button class="btn" type="button" data-gshare>Compartir resumen</button>
        <button class="btn" type="button" data-gcsv>Copiar tabla (CSV)</button>
        <span class="saved-msg" id="gshare-msg" aria-live="polite"></span>
      </div>`
    : `<p class="empty">${city ? `Todavía no hay gastos en ${esc(city.es)}.` : "Anota tu primer gasto: se suma en pesos por ciudad y por categoría."}</p>`}`;
  state.gprefill = null;
}

function addGasto(){
  const $ = id => document.getElementById(id);
  const amt = parseFloat($("g-amt").value);
  if (!isFinite(amt) || amt <= 0){
    $("gmsg").textContent = "Escribe un monto mayor a cero.";
    $("g-amt").focus();
    return;
  }
  const g = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    amt: Math.round(amt * 100) / 100,
    cur: $("g-cur").value,
    cat: $("g-cat").value,
    pay: $("g-pay").value,
    c: $("g-city").value,
    d: $("g-date").value || todayISO(),
    note: $("g-note").value.trim()
  };
  gastos.push(g);
  store.set("rvc-gastos", gastos);
  store.set("rvc-glast", {cur: g.cur, cat: g.cat, pay: g.pay, c: g.c});
  state.gdel = null;
  render();
  const msg = document.getElementById("gmsg");
  if (msg) msg.textContent = `Agregado: ${fmtMXN(toMXN(g))}${g.cur !== "MXN" ? ` (${fmtOrig(g)})` : ""}`;
}

function gastosSummary(){
  const total = sumBy(gastos, toMXN);
  const lines = [`Gastos del viaje`, `Total: ${fmtMXN(total)} MXN`];
  const cityRows = CITIES.map(c => [c.es, sumBy(gastos.filter(g => g.c === c.id), toMXN)]).filter(r => r[1] > 0);
  const catRows = CAT_G.map(([k, l]) => [l, sumBy(gastos.filter(g => g.cat === k), toMXN)]).filter(r => r[1] > 0);
  if (cityRows.length) lines.push("", "Por ciudad:", ...cityRows.map(([l, v]) => `· ${l}: ${fmtMXN(v)}`));
  if (catRows.length) lines.push("", "Por categoría:", ...catRows.map(([l, v]) => `· ${l}: ${fmtMXN(v)}`));
  return lines.join("\n");
}

function gastosCSV(){
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["fecha", "ciudad", "categoria", "pago", "monto", "moneda", "mxn", "nota"]];
  [...gastos].sort((a, b) => a.d.localeCompare(b.d) || a.ts - b.ts).forEach(g => rows.push([
    g.d, (cityOf(g.c) || {}).es || g.c, labelOf(CAT_G, g.cat), labelOf(PAY, g.pay), g.amt, g.cur, Math.round(toMXN(g)), g.note || ""
  ]));
  return rows.map(r => r.map(q).join(",")).join("\n");
}

async function copyTo(text, msgId, ok){
  const msg = document.getElementById(msgId);
  try{ await navigator.clipboard.writeText(text); if (msg) msg.textContent = ok; }
  catch(e){ if (msg) msg.textContent = "No se pudo copiar en este navegador."; }
}

/* chart tooltip: enhances the labeled bars, never the only way to read a value */
const tip = document.createElement("div");
tip.className = "tip";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
const tipV = document.createElement("b");
const tipL = document.createElement("span");
tip.append(tipV, tipL);
document.body.appendChild(tip);

function showTip(row, x, y){
  tipV.textContent = row.dataset.tipV;
  tipL.textContent = row.dataset.tipL;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
  tip.style.top = Math.max(8, y - h - 10) + "px";
}
document.addEventListener("pointermove", e => {
  const row = e.target.closest && e.target.closest(".bar-row");
  if (row) showTip(row, e.clientX, e.clientY); else tip.hidden = true;
});
document.addEventListener("focusin", e => {
  const row = e.target.closest && e.target.closest(".bar-row");
  if (row){ const r = row.getBoundingClientRect(); showTip(row, r.left + r.width / 2, r.top); }
});
document.addEventListener("focusout", () => { tip.hidden = true; });
window.addEventListener("scroll", () => { tip.hidden = true; }, {passive: true});

/* ---------- render ---------- */

function titleFor(){
  if (state.tab === "hoy") return "Hoy";
  if (state.tab === "ciudades") return (cityOf(state.city) || {}).es || "Ciudades";
  if (state.tab === "buscar") return "Buscar";
  if (state.tab === "virales") return "Lo más viral";
  if (state.sub === "gastos") return "Gastos del viaje";
  if (state.sub === "all") return "Guía completa";
  if (state.sub) return (TOPICS[state.sub] || {}).label || "Guía";
  return "Más";
}

function render(){
  tip.hidden = true;
  document.querySelectorAll(".tab").forEach(t => {
    if (t.dataset.tab === state.tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  document.getElementById("back").hidden = !(state.tab === "mas" && state.sub);
  document.getElementById("title").textContent = titleFor();
  const app = document.getElementById("app");
  if (state.tab === "hoy") return renderHoy(app);
  if (state.tab === "ciudades") return renderCity(app);
  if (state.tab === "buscar") return renderSearch(app);
  if (state.tab === "virales") return renderVirales(app);
  if (state.sub === "gastos") return renderGastos(app);
  if (state.sub) return renderGuide(app);
  return renderMas(app);
}

function scrollToId(id){
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({behavior: reduceMotion() ? "auto" : "smooth", block: "start"});
}

/* ---------- events ---------- */

document.getElementById("back").addEventListener("click", () => setView("mas"));

document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "q"){ state.q = t.value.trim(); renderResults(); return; }
  if (t.id === "cny"){
    const v = parseFloat(t.value);
    document.getElementById("mxn").textContent = isFinite(v) && RATE ? `≈ ${fmtMXN(v * RATE)} MXN` : "≈ $— MXN";
  }
  if (t.id === "ask"){
    const v = parseFloat(t.value);
    document.querySelectorAll("#ask-out dd").forEach(dd => {
      if (!isFinite(v)){ dd.textContent = "—"; return; }
      const y = Math.round(v * parseFloat(t.dataset[dd.dataset.k]));
      dd.innerHTML = `¥${y}` + (RATE ? `<small>${fmtMXN(y * RATE)} MXN</small>` : "");
    });
  }
});

document.addEventListener("change", e => {
  if (e.target.id === "g-budget"){
    const v = parseFloat(e.target.value);
    store.set("rvc-budget", isFinite(v) && v > 0 ? Math.round(v) : 0);
    render();
  }
});

document.addEventListener("submit", e => {
  if (e.target.id === "gform"){ e.preventDefault(); addGasto(); }
});

document.addEventListener("click", e => {
  const el = sel => e.target.closest(sel);
  let x;
  if ((x = el("[data-tab]"))){
    const tab = x.dataset.tab;
    setView(tab, tab === "mas" ? {sub: null} : {});
    if (tab === "buscar") requestAnimationFrame(() => { const f = document.getElementById("q"); if (f) f.focus(); });
    return;
  }
  if ((x = el("[data-day]"))){ goDay(x.dataset.day); return; }
  if ((x = el("[data-pick-city]"))){ setView("ciudades", {city: x.dataset.pickCity}); return; }
  if ((x = el("[data-sub]"))){ setView("mas", {sub: x.dataset.sub}); return; }
  if ((x = el("[data-open]"))){ openPlace(x.dataset.open); return; }
  if ((x = el("[data-suggest]"))){ state.q = x.dataset.suggest; renderSearch(document.getElementById("app")); return; }
  if ((x = el("[data-cat]"))){ state.cat = x.dataset.cat; render(); return; }
  if ((x = el("[data-vcity]"))){ state.vcity = x.dataset.vcity; render(); return; }
  if ((x = el("[data-vcat]"))){ state.vcat = x.dataset.vcat; render(); return; }
  if ((x = el("[data-gcity]"))){ state.gcity = x.dataset.gcity; state.gdel = null; render(); return; }
  if ((x = el("[data-gdel]"))){
    const id = x.dataset.gdel;
    if (state.gdel === id){ gastos = gastos.filter(g => g.id !== id); store.set("rvc-gastos", gastos); state.gdel = null; }
    else state.gdel = id;
    render(); return;
  }
  if (el("[data-gshare]")){
    const text = gastosSummary();
    if (navigator.share) navigator.share({title: "Gastos del viaje", text}).catch(() => {});
    else copyTo(text, "gshare-msg", "Resumen copiado");
    return;
  }
  if (el("[data-gcsv]")){ copyTo(gastosCSV(), "gshare-msg", "Tabla copiada: pégala en Excel o Numbers"); return; }
  if ((x = el("[data-add-gasto]"))){
    state.gprefill = {d: x.dataset.gdate, c: x.dataset.gcityid};
    setView("mas", {sub: "gastos"});
    requestAnimationFrame(() => { const f = document.getElementById("g-amt"); if (f) f.focus(); });
    return;
  }
  if ((x = el("[data-fav]"))){
    const id = x.dataset.fav;
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("rvc-favs", [...favs]);
    if (state.tab === "buscar") renderResults(); else render();
    return;
  }
  if ((x = el("[data-go]"))){ openDriver(byId[x.dataset.go]); return; }
  if ((x = el("[data-transfer]"))){ openTransfer(TRIP.transfers[x.dataset.transfer]); return; }
  if ((x = el("[data-hotel]"))){ openHotel(x.dataset.hotel || currentHotelCity()); return; }
  if ((x = el("[data-save-hotel]"))){ saveHotel(x.dataset.saveHotel); return; }
  if ((x = el("[data-gcard]"))){
    const it = GCARDS[Number(x.dataset.gcard)];
    if (it) openCard({ask: "师傅，请带我去这里：", big: it.zh || it.h, where: it.addr, es: [it.h, it.tel].filter(Boolean).join(" · "), copy: [it.zh, it.addr].filter(Boolean).join(" "), map: mapURL([it.zh, it.addr].filter(Boolean).join(" "))});
    return;
  }
  if ((x = el("[data-say]"))){
    const s = SAY[Number(x.dataset.say)];
    if (s) openCard({big: s.zh, where: s.py, es: s.es});
    return;
  }
  if (el("[data-install]") && deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; renderInstall(); });
    return;
  }
  if (el("[data-hide-install]")){ store.set("rvc-install-hidden", true); renderInstall(); return; }
  if (el("[data-recache]")){
    navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage({type: "recache"}));
    polls = 0; poll();
  }
});

/* swipe left/right between days on Hoy (ignores the horizontal photo and day strips) */
let touch0 = null;
const appEl = document.getElementById("app");
appEl.addEventListener("touchstart", e => {
  if (state.tab !== "hoy" || e.touches.length !== 1 || e.target.closest(".strip, .daystrip")){ touch0 = null; return; }
  touch0 = {x: e.touches[0].clientX, y: e.touches[0].clientY};
}, {passive: true});
appEl.addEventListener("touchend", e => {
  if (!touch0) return;
  const dx = e.changedTouches[0].clientX - touch0.x, dy = e.changedTouches[0].clientY - touch0.y;
  touch0 = null;
  if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
  const i = TRIP.days.findIndex(d => d.date === state.day);
  const target = TRIP.days[i + (dx < 0 ? 1 : -1)];
  if (target) goDay(target.date);
}, {passive: true});

/* ---------- full-screen card ---------- */

const dlg = document.getElementById("driver");
const dAsk = document.getElementById("dask");
const dz = document.getElementById("dz");
const da = document.getElementById("da");
const dn = document.getElementById("dn");
const dmap = document.getElementById("dmap");
const dcopy = document.getElementById("dcopy");
let copyText = "";

function openCard({ask, big, where, es, copy, map}){
  dAsk.hidden = !ask;
  if (ask){ dAsk.textContent = ask; dAsk.lang = langOf(ask); }
  dz.textContent = big || ""; dz.lang = langOf(big);
  da.textContent = where || ""; da.lang = langOf(where);
  dn.textContent = es || "";
  dmap.hidden = !map;
  if (map) dmap.href = map;
  copyText = copy || "";
  dcopy.hidden = !copy;
  dcopy.textContent = "Copiar para Didi";
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}

function openDriver(p){
  if (!p) return;
  const c = cityOf(p.c);
  const ko = p.c === "se";
  const full = (ko ? "서울" : c.sc) + " " + p.z + (p.a ? " " + p.a : "");
  openCard({
    ask: ko ? "기사님, 여기로 가 주세요:" : "师傅，请带我去这里：",
    big: p.z, where: p.a, es: p.n + " · " + c.es, copy: full,
    map: ko ? "https://map.naver.com/p/search/" + encodeURIComponent(p.z) : mapURL(full)
  });
}

function openTransfer(tr){
  if (!tr) return;
  openCard({ask: "师傅，请带我去这里：", big: tr.z, where: transferLabel(tr), es: tr.n, copy: tr.z, map: mapURL(tr.z)});
}

function openHotel(cid){
  const c = cityOf(cid) || cityOf(currentHotelCity()) || CITIES[0];
  const h = hotels()[c.id] || {};
  if (!h.z && !h.a){
    setView("mas", {sub: "hoteles"});
    requestAnimationFrame(() => {
      const box = document.getElementById("hotel-" + c.id);
      if (box){ box.open = true; box.scrollIntoView({block: "center"}); const f = document.getElementById(`h-${c.id}-n`); if (f) f.focus({preventScroll: true}); }
    });
    return;
  }
  const ko = c.id === "se";
  const full = [h.z, h.a].filter(Boolean).join(" ");
  openCard({
    ask: ko ? "기사님, 이 호텔로 가 주세요:" : "师傅，请带我回这个酒店：",
    big: h.z || h.n, where: h.a, es: [h.n, c.es, h.t].filter(Boolean).join(" · "),
    copy: full, map: ko ? "https://map.naver.com/p/search/" + encodeURIComponent(h.z || h.n) : mapURL(c.sc + " " + full)
  });
}

function saveHotel(cid){
  const val = k => (document.getElementById(`h-${cid}-${k}`) || {}).value?.trim() || "";
  const all = store.get("rvc-hotels", {});
  all[cid] = {n: val("n"), z: val("z"), a: val("a"), t: val("t")};
  store.set("rvc-hotels", all);
  const h = all[cid];
  document.getElementById("hsum-" + cid).textContent = h.z || h.a ? (h.n || h.z) : "Sin capturar";
  document.getElementById("hmsg-" + cid).textContent = "Guardado";
}

document.getElementById("dclose").addEventListener("click", () => dlg.close ? dlg.close() : dlg.removeAttribute("open"));
dcopy.addEventListener("click", async () => {
  if (!copyText) return;
  try{ await navigator.clipboard.writeText(copyText); dcopy.textContent = "Copiado"; }
  catch(err){
    const r = document.createRange(); r.selectNodeContents(da.textContent ? da : dz);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(r);
    dcopy.textContent = "Mantén presionado y copia";
  }
});

/* ---------- install + offline ---------- */

function isStandalone(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; renderInstall(); });

function renderInstall(){
  const box = document.getElementById("install");
  if (!box) return;
  if (isStandalone() || store.get("rvc-install-hidden", false)){ box.hidden = true; return; }
  box.hidden = false;
  const steps = deferredPrompt
    ? `<div class="row"><button class="btn primary" type="button" data-install>Instalar app</button><button class="btn" type="button" data-hide-install>Ahora no</button></div>`
    : isIOS
      ? `<ol><li>En Safari toca <b>Compartir</b> (el cuadro con flecha).</li><li>Elige <b>Agregar a inicio</b>.</li><li>Ábrela desde el ícono 去 con Wi-Fi hasta que diga “Lista sin internet”.</li></ol><div class="row"><button class="btn" type="button" data-hide-install>Ya la instalé</button></div>`
      : `<ol><li>En Chrome abre el menú ⋮.</li><li>Toca <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li></ol><div class="row"><button class="btn" type="button" data-hide-install>Ya la instalé</button></div>`;
  box.innerHTML = `<p><b>Instálala antes de volar.</b> Así abre sin internet ni VPN, con todo y fotos.</p>${steps}`;
}

async function updateOffline(){
  const pill = document.getElementById("status");
  const panel = document.getElementById("offline-state");
  if (!("caches" in window) || !("serviceWorker" in navigator)){
    pill.textContent = "";
    if (panel) panel.textContent = "Este navegador no permite guardarla sin internet. Ábrela en Safari (iPhone) o Chrome (Android).";
    return true;
  }
  let n = 0;
  try{ n = (await (await caches.open("rvc-" + VERSION)).keys()).length; }catch(e){}
  const total = ASSETS.length;
  const done = total > 0 && n >= total;
  const pct = Math.floor(n / Math.max(total, 1) * 100);
  pill.className = "status" + (done ? " ok" : "");
  pill.textContent = done ? "● Lista" : `↓ ${pct}%`;
  pill.title = done ? "Lista para usar sin internet" : `Guardando para usar sin internet: ${pct}%`;
  if (panel){
    panel.innerHTML = done
      ? `<b>Lista para usar sin internet.</b> Los ${total} archivos, fotos incluidas, están guardados en este teléfono.`
      : `<b>Guardando para usar sin internet: ${n} de ${total} archivos.</b> Deja la app abierta con Wi-Fi hasta que diga “Lista”. <button class="btn" type="button" data-recache>Reintentar</button>`;
  }
  return done;
}

let polls = 0;
async function poll(){
  const done = await updateOffline();
  if (!done && polls++ < 200) setTimeout(poll, 1500);
}

if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js").then(poll).catch(updateOffline);
  navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "progress") updateOffline(); });
} else {
  updateOffline();
}

render();
})();
