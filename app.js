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
// lo que capture el usuario gana campo por campo; un campo en blanco no borra el dato de su reserva
function hotels(){
  const out = Object.assign({}, TRIP.hotels || {});
  const mine = store.get("rvc-hotels", {});
  Object.keys(mine).forEach(c => {
    const filled = {};
    Object.entries(mine[c] || {}).forEach(([k, v]) => { if (v !== "" && v != null) filled[k] = v; });
    out[c] = Object.assign({}, out[c], filled);
  });
  return out;
}

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
  if (a === "lugar" && byId[b]) return {tab: "ciudades", city: byId[b].c, sub: null, place: b};
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
  day: pickDay(), vcity: "all", vcat: "all",
  fcity: null, pset: null, mcity: null, mzoom: 1, tabla: null,
  place: h0.place || null, placeY: 0,
  routeN: 5, amode: "auto", acity: null
};
let SAY = [];
let GCARDS = [];

function setView(tab, opts = {}){
  state.place = null;
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

/* big photo with the title laid over it (Hoy and each city) */
function heroHTML(ph, {kick, title, label, code}){
  return `<section class="hero-card${ph ? "" : " no-ph"}">
    ${ph ? `<img src="${esc(ph.file)}" alt="${esc(ph.alt || label || "")}" decoding="async">` : `<span class="cover-code" aria-hidden="true">${esc(code || "")}</span>`}
    ${ph && ph.kind === "ilustrativa" ? `<span class="illu">Foto ilustrativa</span>` : ""}
    <div class="hero-txt">${kick ? `<span class="kick">${esc(kick)}</span>` : ""}<h1>${esc(title)}</h1></div>
  </section>
  ${ph ? `<p class="credit hero-credit">${label ? esc(label) + " · " : ""}Foto: ${creditHTML(ph)}</p>` : ""}`;
}

/* ---------- places ---------- */

function mustHTML(p){
  const must = Array.isArray(p.m) ? p.m : p.m ? [p.m] : [];
  return must.length ? `<div class="must"><b>Imperdibles</b><ul>${must.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
}

const coverFill = p => `<span class="cover-code" aria-hidden="true">${cityCode(cityOf(p.c))}</span>`;

function favHTML(p){
  const on = favs.has(p.id);
  return `<button class="fav" type="button" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Quitar de guardados" : "Guardar"}">${on ? "★" : "☆"}</button>`;
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
  const foot = [
    p.s ? `<a class="src" href="${esc(p.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : "",
    p.ph ? `Foto${p.ph.kind === "ilustrativa" ? " ilustrativa" : ""}: ${creditHTML(p.ph)}` : ""
  ].filter(Boolean).join(" · ");
  return `<article class="entry k-${esc(p.k)}${p.ph ? " has-ph" : " no-ph"}" id="e-${esc(p.id)}">
    <div class="cover">
      ${p.ph ? `<img src="${esc(p.ph.file)}" alt="${esc(p.ph.alt || p.n)}" loading="lazy" decoding="async">` : coverFill(p)}
      <span class="cat">${esc(CATS[p.k])}</span>
      ${p.ph && p.ph.kind === "ilustrativa" ? `<span class="illu">Foto ilustrativa</span>` : ""}
      ${favHTML(p)}
    </div>
    <div class="main">
      <h3>${esc(p.n)}</h3>
      <div class="zh" lang="${langOf(p.z)}">${esc(p.z)}${p.a ? `<span class="addr">${esc(p.a)}</span>` : ""}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      <p>${esc(p.d)}</p>
      ${mustHTML(p)}
      ${p.pp ? `<figure class="prod"><img src="${esc(p.pp.file)}" alt="${esc(p.pp.alt || p.pp.sight || "")}" loading="lazy" decoding="async"><figcaption>${p.pp.sight ? `<b>${esc(p.pp.sight)}</b>` : ""}Foto${p.pp.kind === "ilustrativa" ? " ilustrativa" : ""}: ${creditHTML(p.pp)}</figcaption></figure>` : ""}
      ${p.t ? `<p class="tip"><b>Tip:</b> ${esc(p.t)}</p>` : ""}
      <button class="go go-wide" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir <small>· mostrar al chofer</small></button>
      ${foot ? `<p class="credit">${foot}</p>` : ""}
    </div>
  </article>`;
}

// qué tan lejos queda de donde duermes (o de ti, si diste tu ubicación)
function distLabel(p){
  if (!p || !p.ll) return "";
  const o = originFor(p.c);
  return o ? `${fmtKm(distKm(o.pt, p.ll))} de ${o.label}` : "";
}

// "abre más tarde" es informativo (ámbar); "cierra hoy" o "cerrado" sí es alarma (rojo)
const softShut = label => /^abre/i.test(label) ? " soft" : "";

// solo avisa lo que conviene saber antes de ir: cerrado ahora, o cierra hoy
function shutLabel(p){
  if (!p || !p.h) return "";
  const st = openState(p, cityNow(p.c));
  return st.open === false ? st.label : "";
}

function recHTML(p){
  const img = p.ph || p.pp;
  const dl = distLabel(p);
  const sl = shutLabel(p);
  return `<article class="rcard k-${esc(p.k)}">
    <button class="rc-open" type="button" data-open="${p.id}">
      ${img ? `<img src="${esc(img.file)}" alt="${esc(img.alt || p.n)}" loading="lazy" decoding="async">` : coverFill(p)}
      <span class="cat">${esc(CATS[p.k])}</span>
      <span class="rc-txt"><b class="rec-title">${esc(p.n)}</b><span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>${sl ? `<span class="shut${softShut(sl)}">${esc(sl)}</span>` : ""}${dl ? `<span class="rc-dist">${esc(dl)}</span>` : ""}${p.p ? `<span class="rc-price">${esc(p.p)}</span>` : ""}</span>
    </button>
    ${favHTML(p)}
    <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir</button>
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

    ${heroHTML(banner && banner.ph, {kick: `${c.dates} · ${all.length} lugares`, title: c.es, label: banner && banner.n, code: cityCode(c)})}
    <p class="intro">${esc(c.intro)}</p>

    ${(c.slots || []).length ? `<h2 class="lbl">Tus ratos libres</h2>
    <ul class="slots">
      ${c.slots.map(s => `<li class="slot"><span class="d">${esc(s[0])}<small>${esc(s[1])}</small></span><p>${esc(s[2])}</p></li>`).join("")}
    </ul>` : ""}
    ${(c.notes || []).length ? `<div class="notes"><ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    ${((GUIDE.food || {})[c.id] || []).length ? `<button class="hint food-hint" type="button" data-food="${c.id}"><b>Señala y pide en ${esc(c.es)}</b> · ${GUIDE.food[c.id].length} platillos con foto para enseñar al mesero →</button>` : ""}
    ${all.some(p => p.ll) ? `<button class="hint map-hint" type="button" data-mapcity="${c.id}"><b>Mapa y cerca de mí</b> · qué te queda cerca con el GPS, sin internet →</button>` : ""}

    <h2 class="lbl">Lugares</h2>
    <div class="chips" role="toolbar" aria-label="Filtrar por tipo">
      ${chipDefs.map(([k, l]) => `<button class="chip" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${esc(l)}<span>${counts[k]}</span></button>`).join("")}
    </div>
    ${shown.length ? `<div class="vgrid">${shown.map(p => vcardHTML(p, false)).join("")}</div>`
      : `<p class="empty">${state.cat === "fav" ? "Todavía no guardas lugares en esta ciudad. Toca ☆ en los que quieras tener a la mano." : "Nada en esta categoría."}</p>`}`;

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
      ${saved.length ? `<h2 class="lbl">Tus guardados · ${saved.length}</h2><div class="rail">${saved.map(recHTML).join("")}</div>`
        : `<p class="empty">Toca ☆ en cualquier lugar para tenerlo aquí a la mano.</p>`}`;
    return;
  }
  const hits = P.filter(p => [p.n, p.z, p.a, p.d, p.t, p.v, CATS[p.k], cityOf(p.c).es, ...(Array.isArray(p.m) ? p.m : [p.m])].some(f => norm(f).includes(q)));
  box.innerHTML = `
    <h2 class="lbl">${hits.length} ${hits.length === 1 ? "resultado" : "resultados"}</h2>
    ${hits.length ? `<div class="vgrid">${hits.map(p => vcardHTML(p, true)).join("")}</div>`
      : `<p class="empty">Nada con “${esc(state.q)}”. Prueba con el nombre en chino o con una palabra como “pato”, “réplicas” o “bar”.</p>`}`;
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

    <button class="hint now-hint" type="button" data-sub="ahora"><b>¿Qué hago ahora?</b> · lo abierto y cerca según la hora →</button>
    ${heroHTML(photos[0], {kick: to ? `${c.es} → ${to.es}` : c.es, title: d.title, label: photos[0] && photos[0].sight, code: cityCode(c)})}
    ${photos.length > 1 ? stripHTML(photos.slice(1)) : ""}

    <h2 class="lbl">Tu día</h2>
    <ol class="tl day-tl">${d.items.map(it => `<li><span class="tm">${esc(it.time || "")}</span><span>${esc(it.text)}</span></li>`).join("")}</ol>
    ${transfers.length ? `<div class="row go-row">${transfers.map(tr => `<button class="btn go-btn" type="button" data-transfer="${esc(tr.id)}">Ir · ${esc(tr.n)}</button>`).join("")}</div>` : ""}
    ${allTickets().some(t => t.date === d.date) ? `<h2 class="lbl">Tu boleto</h2><div class="row">${allTickets().filter(t => t.date === d.date).map(t => `<button class="btn primary" type="button" data-show-ticket="${esc(t.id)}">${esc(t.num || t.id)} · ${esc(t.dep || "")} → ${esc(t.to)}</button>`).join("")}</div>` : ""}

    ${slots.length ? `<h2 class="lbl">Tu rato libre</h2>${slots.map(s => `<p class="gp"><span class="tm">${esc(s[1])}</span> ${esc(s[2])}</p>`).join("")}` : ""}
    ${routesHTML(d, slots)}

    ${recs.length ? `<h2 class="lbl">Recomendado para este día · ${recs.length}</h2><div class="rail">${recs.map(recHTML).join("")}</div>` : ""}
    ${saved.length ? `<h2 class="lbl">Tus guardados en ${esc(cityIds.map(id => cityOf(id).es).join(" y "))}</h2><div class="rail">${saved.map(recHTML).join("")}</div>` : ""}

    ${spentDay.length ? `<div class="day-gastos"><span>Gastaste este día</span><b>${fmtMXN(sumBy(spentDay, toMXN))} MXN</b></div>` : ""}

    ${hotelNowHTML(here)}

    <h2 class="lbl">Hora ahora</h2>
    ${clockHTML()}

    <div class="row quick">
      <button class="btn primary" type="button" data-add-gasto data-gdate="${d.date}" data-gcityid="${here.id}">Anotar gasto</button>
      <button class="btn" type="button" data-pick-city="${here.id}">Lugares en ${esc(here.es)} →</button>
      ${((GUIDE.food || {})[here.id] || []).length ? `<button class="btn" type="button" data-food="${here.id}">Señala y pide</button>` : ""}
      ${P.some(p => p.ll) ? `<button class="btn" type="button" data-mapcity="${here.id}">Cerca de mí</button>` : ""}
      <button class="btn" type="button" data-sub="frases-emergencia">Emergencias</button>
    </div>`;

  requestAnimationFrame(() => centerPressed("daystrip"));
}

// tonight's hotel on the day view: name, dates, confirmation and one tap to show the driver
function hotelNowHTML(c){
  if (!c) return "";
  const h = hotels()[c.id] || {};
  if (!h.z && !h.a && !h.n) return "";
  return `<h2 class="lbl">Dónde duermes</h2>
    <div class="hnow">
      <b>${esc(h.n || h.z)}</b>
      ${h.z && h.n ? `<div class="zh" lang="${c.id === "se" ? "ko" : "zh"}">${esc(h.z)}</div>` : ""}
      ${h.a ? `<div class="hnow-a" lang="${c.id === "se" ? "ko" : "zh"}">${esc(h.a)}</div>` : ""}
      ${stayHTML(h)}
      <div class="row">
        <button class="btn primary" type="button" data-hotel="${c.id}">Mostrar al chofer</button>
        ${h.t ? `<a class="btn" href="tel:${esc(String(h.t).replace(/[^+\d]/g, ""))}">Llamar</a>` : ""}
      </div>
    </div>`;
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
    <section class="page-head">
      <span class="sticker">TikTok · Instagram · Xiaohongshu</span>
      <h1>Lo más <em>viral</em></h1>
      <p>${pool.length} lugares para la foto y la fila</p>
    </section>
    <div class="chips" role="toolbar" aria-label="Filtrar virales por ciudad">
      <button class="chip" type="button" data-vcity="all" aria-pressed="${state.vcity === "all"}">Todas</button>
      ${CITIES.filter(c => pool.some(p => p.c === c.id)).map(c => `<button class="chip" type="button" data-vcity="${c.id}" aria-pressed="${state.vcity === c.id}">${esc(c.es)}</button>`).join("")}
    </div>
    <div class="chips" role="toolbar" aria-label="Filtrar virales por tipo">
      <button class="chip" type="button" data-vcat="all" aria-pressed="${state.vcat === "all"}">Todo</button>
      ${cats.map(([k, l]) => `<button class="chip" type="button" data-vcat="${k}" aria-pressed="${state.vcat === k}">${esc(l)}</button>`).join("")}
    </div>
    ${shown.length ? `<div class="vgrid">${shown.map(p => vcardHTML(p, true)).join("")}</div>` : `<p class="empty">Nada viral con este filtro.</p>`}
    <p class="fine">Lo viral sale de guías y blogs que citan TikTok, Douyin, Xiaohongshu o Instagram. Toca una tarjeta para ver imperdibles, precios y cómo llegar.</p>`;
}

/* ---------- página de lugar ---------- */

function vcardHTML(p, withCity){
  const img = p.ph || p.pp;
  const dl = distLabel(p);
  const sl = shutLabel(p);
  return `<article class="vcard k-${esc(p.k)}">
    <button class="vc-open" type="button" data-open="${p.id}" aria-label="Ver ${esc(p.n)}">
      ${img ? `<img src="${esc(img.file)}" alt="${esc(img.alt || p.n)}" loading="lazy" decoding="async">` : `<span class="vnoimg">${cityCode(cityOf(p.c))}</span>`}
      <span class="vcity">${withCity ? cityCode(cityOf(p.c)) : esc(CATS[p.k].split(/[ ,]/)[0])}</span>
      <span class="vbody">${sl ? `<span class="vshut${softShut(sl)}">${esc(sl)}</span>` : ""}${dl ? `<span class="vdist">${esc(dl)}</span>` : ""}<b class="vtitle">${esc(p.n)}</b><span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>${p.v ? `<span class="vwhy">${esc(p.v)}</span>` : p.p ? `<span class="vwhy price">${esc(p.p)}</span>` : ""}</span>
    </button>
    ${favHTML(p)}
  </article>`;
}

const dishCardHTML = (d, cid, i) => `<article class="rcard k-com">
  <button class="rc-open" type="button" data-dish="${cid}|${i}">
    ${d.ph ? `<img src="${esc(d.ph.file)}" alt="${esc(d.ph.alt || d.es)}" loading="lazy" decoding="async">` : `<span class="cover-code" lang="${langOf(d.zh)}">${esc(String(d.zh || "").slice(0, 2))}</span>`}
    <span class="cat">${d.spice ? "Pica" : "No pica"}</span>
    <span class="rc-txt"><b class="rec-title">${esc(d.es)}</b><span class="zh" lang="${langOf(d.zh)}">${esc(d.zh)}</span>${d.price ? `<span class="rc-price">${esc(d.price)}</span>` : ""}</span>
  </button>
</article>`;

const nearRowHTML = (p, d, dir, note) => `<div class="near-row k-${esc(p.k)}">
  <span class="near-d">${d == null ? `<span class="cat">${esc(CATS[p.k].split(/[ ,]/)[0])}</span>` : `<b>${fmtKm(d)}</b><span>${dir}</span>`}</span>
  <button class="rec-open" type="button" data-open="${p.id}"><b class="rec-title">${esc(p.n)}</b><span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>${note ? `<span class="state ${note.cls}">${esc(note.text)}</span>` : ""}${p.ll && p.ll[2] === "baja" ? `<span class="approx">Ubicación aproximada</span>` : ""}</button>
  <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir</button>
</div>`;

function renderPlace(app){
  const p = byId[state.place];
  if (!p){ state.place = null; render(); return; }
  const dishes = ((GUIDE.food || {})[p.c] || []).map((d, i) => ({d, i})).filter(x => (x.d.where || []).includes(p.n));
  const origin = p.ll ? originFor(p.c) : null;
  const near = p.ll ? P.filter(q => q.id !== p.id && q.c === p.c && q.ll).map(q => ({q, d: distKm(p.ll, q.ll)})).filter(x => x.d < 1.5).sort((a, b) => a.d - b.d).slice(0, 8) : [];
  app.innerHTML = `<div class="place">
    ${origin ? `<p class="dist-chip">${fmtKm(distKm(origin.pt, p.ll))} ${dirTo(origin.pt, p.ll)} de ${origin.label}</p>` : ""}
    ${(st => st.label ? `<p class="dist-chip state-chip ${st.open ? "open" : "closed"}">Ahora en ${esc(cityOf(p.c).es)}: ${esc(st.label)}</p>` : "")(openState(p, cityNow(p.c)))}
    ${entryHTML(p, true)}
    ${(p.gal || []).length ? `<h2 class="lbl">Más fotos</h2>${stripHTML(p.gal)}` : ""}
    ${dishes.length ? `<h2 class="lbl">Pide aquí</h2><div class="rail">${dishes.map(({d, i}) => dishCardHTML(d, p.c, i)).join("")}</div>` : ""}
    ${near.length ? `<h2 class="lbl">Cerca de aquí</h2><div class="near">${near.map(({q, d}) => nearRowHTML(q, d, dirTo(p.ll, q.ll))).join("")}</div>` : ""}
    <div class="row quick">${p.r ? `<button class="btn primary" type="button" data-sub="reservas">Cómo reservar</button>` : ""}<button class="btn" type="button" data-pick-city="${p.c}">Más lugares en ${esc(cityOf(p.c).es)} →</button></div>
  </div>`;
}

function openPlace(id){
  if (!byId[id]) return;
  if (!state.place) state.placeY = window.scrollY;
  state.place = id;
  history.pushState({place: id}, "", "#lugar/" + id);
  render();
  window.scrollTo({top: 0});
}

function closePlace(){
  state.place = null;
  const hash = state.tab === "ciudades" ? `ciudades/${state.city}` : state.tab === "mas" && state.sub ? `mas/${state.sub}` : state.tab;
  history.replaceState(null, "", "#" + hash);
  render();
  const y = state.placeY || 0;
  requestAnimationFrame(() => window.scrollTo({top: y}));
}

window.addEventListener("popstate", () => {
  const m = location.hash.match(/^#lugar\/(.+)$/);
  if (m && byId[m[1]]){ state.place = m[1]; render(); window.scrollTo({top: 0}); return; }
  // follow whatever hash we landed on (back from a place, or any other navigation) instead of forcing the previous view
  const wasPlace = !!state.place;
  const h = parseHash();
  state.place = null;
  state.tab = h.tab;
  state.sub = h.sub;
  if (h.city) state.city = h.city;
  render();
  window.scrollTo({top: wasPlace ? state.placeY || 0 : 0});
});

/* ---------- más: hub, guía, hoteles, traslados ---------- */

const TOPICS = {
  "ahora": {g: "viaje", icon: "clock", label: "¿Qué hago ahora?", desc: "Lo abierto y cerca según la hora"},
  "boletos": {g: "viaje", icon: "ticket", label: "Mis boletos", desc: "Vuelos y trenes en grande"},
  "reservar-cuando": {g: "viaje", icon: "cal", label: "Qué reservar y cuándo", desc: "Fechas límite antes de volar"},
  "reservas": {g: "viaje", icon: "cal", label: "Reservaciones", desc: "Qué reservar y cómo"},
  "viajeros": {g: "viaje", icon: "people", label: "Viajeros", desc: "Quién va y su asiento"},
  "hoteles": {g: "viaje", icon: "door", label: "Mis hoteles", desc: "Captura tus hoteles para el chofer"},
  "traslados": {g: "viaje", icon: "train", label: "Traslados", desc: "Estaciones y aeropuertos en chino"},
  "tren-avion": {g: "viaje", icon: "train", label: "Tren y avión", desc: "Paso a paso en la estación"},
  "clima": {g: "viaje", icon: "sun", label: "Clima y ropa", desc: "Qué llevar en cada ciudad"},
  "checklist": {g: "viaje", icon: "check", label: "Checklist", desc: "Antes de volar y maleta"},
  "platillos": {g: "comer", icon: "bowl", label: "Señala y pide", desc: "Platillos con foto para el mesero"},
  "frases": {g: "comer", icon: "speaker", label: "Frases con audio", desc: "Hotel, taxi, alergias y compras"},
  "restaurante": {g: "comer", icon: "fork", label: "Restaurante", desc: "Sin picante, alergias, la cuenta"},
  "cerca": {g: "mover", icon: "pin", label: "Cerca de mí", desc: "Mapa y distancias con GPS"},
  "metro": {g: "mover", icon: "metro", label: "Metro", desc: "Mapas sin internet"},
  "compras-lista": {g: "compras", icon: "cart", label: "Lista de compras", desc: "Con tu precio meta"},
  "regateo": {g: "compras", icon: "percent", label: "Regateo", desc: "Calculadora y frases"},
  "replicas": {g: "compras", icon: "copy", label: "Réplicas", desc: "Calidades y precios reales"},
  "chamarras": {g: "compras", icon: "copy", label: "Chamarras réplica", desc: "Dónde, precio meta y cómo revisarlas"},
  "tenis": {g: "compras", icon: "bag", label: "Tenis de imitación", desc: "Mercados, precios y cómo checarlos"},
  "plumas": {g: "compras", icon: "shirt", label: "Chamarras de plumón", desc: "Marcas chinas buenas y de verdad"},
  "que-comprar": {g: "compras", icon: "bag", label: "Qué comprar", desc: "Y qué no, en ropa y tecnología"},
  "marcas": {g: "compras", icon: "star", label: "Marcas chinas", desc: "Deportivas, moda y outdoor"},
  "tallas": {g: "compras", icon: "shirt", label: "Tallas", desc: "China, Corea y México"},
  "frases-emergencia": {g: "ayuda", icon: "cross", label: "Emergencias", desc: "110, 120 y frases"},
  "emergencias": {g: "ayuda", icon: "bank", label: "Embajadas y hospitales", desc: "México, España y clínicas"},
  "apps": {g: "ayuda", icon: "phone", label: "Apps", desc: "Qué bajar antes de volar"},
  "esim": {g: "ayuda", icon: "signal", label: "eSIM y VPN", desc: "Internet sin bloqueos"},
  "dinero": {g: "ayuda", icon: "coin", label: "Dinero", desc: "Pagos y devolución de impuestos"}
};
const GROUPS = [["viaje", "Tu viaje"], ["comer", "Comer y hablar"], ["mover", "Moverte"], ["compras", "Compras"], ["ayuda", "Ayuda y dinero"]];

const hubIcon = name => `<span class="hub-ico"><svg viewBox="0 0 24 24"><use href="#i-${name}"/></svg></span>`;

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

// dates + confirmation code that came with the booking, when the trip data has them
function stayHTML(h){
  if (!h || (!h.in && !h.conf)) return "";
  const when = h.in && h.out ? `${h.in} → ${h.out}` : "";
  const nights = h.nights ? `${h.nights} ${h.nights === 1 ? "noche" : "noches"}` : "";
  const rooms = h.rooms > 1 ? `${h.rooms} habitaciones` : "";
  const codes = [].concat(h.conf || []).filter(Boolean);
  return `<p class="stay">
    ${when ? `<b>${esc(when)}</b>` : ""}${nights ? `<span>${esc(nights)}</span>` : ""}${rooms ? `<span>${esc(rooms)}</span>` : ""}
  </p>
  ${codes.length ? `<p class="stay conf">Confirmación ${codes.map(esc).join(" · ")}${h.holder ? ` · a nombre de ${esc(h.holder)}` : ""}</p>` : ""}`;
}

function hotelsEditorHTML(){
  const H = hotels();
  return `<p class="gp">Pega el nombre y la dirección que vienen en tu confirmación de reserva (en chino o coreano), o pídeselos a WildChina. Se guardan solo en este teléfono y funcionan sin internet.</p>
  <div class="hotels">${CITIES.map(c => {
    const h = H[c.id] || {};
    const has = h.n || h.z || h.a;
    return `<details class="hotel" id="hotel-${c.id}">
      <summary><b>${esc(c.es)}</b><span class="hs" id="hsum-${c.id}">${has ? esc(h.n || h.z) : "Sin capturar"}</span></summary>
      <div class="hform">
        ${stayHTML(h)}
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
  {id: "traslados", title: "Traslados en chino", intro: "Estaciones y aeropuertos de tu itinerario. Toca Ir para enseñárselo al taxista.", html: transfersHTML},
  {id: "hoteles", title: "Mis hoteles", html: hotelsEditorHTML},
  {id: "ahora", title: "¿Qué hago ahora?", html: ahoraHTML},
  {id: "boletos", title: "Mis boletos", html: boletosHTML},
  {id: "reservas", title: "Reservaciones", html: reservasHTML, when: () => P.some(p => p.r)},
  {id: "viajeros", title: "Viajeros", html: viajerosHTML},
  {id: "tren-avion", title: "Tren y avión paso a paso", html: () => { const L = GUIDE.logi || {}; return stepsHTML(L.rail) + stepsHTML(L.air_dom) + stepsHTML(L.air_intl); }, when: () => GUIDE.logi && GUIDE.logi.rail},
  {id: "clima", title: "Clima y qué ropa llevar", html: climaHTML, when: () => GUIDE.logi && (GUIDE.logi.climate || []).length},
  {id: "checklist", title: "Checklist del viaje", html: checklistHTML, when: () => GUIDE.logi && (GUIDE.logi.checklist || []).length},
  {id: "platillos", title: "Señala y pide", intro: "Toca un platillo para enseñarlo en grande al mesero, o la bocina para escucharlo. Marca lo que no comes y te aviso cuál lo lleva.", html: platillosHTML, when: () => GUIDE.food},
  {id: "frases", title: "Frases con audio", intro: "Toca la bocina para escucharla o la frase para enseñarla en grande. Si no suena en iPhone: Ajustes → Accesibilidad → Contenido leído → Voces, y descarga Chino (China continental) y Coreano con Wi-Fi antes de volar.", html: frasesHTML, when: () => (GUIDE.phrase_sets || []).length},
  {id: "cerca", title: "Cerca de mí", html: cercaHTML, when: () => P.some(p => p.ll)},
  {id: "metro", title: "Metro sin internet", html: metroHTML, when: () => GUIDE.metro && CITIES.some(c => GUIDE.metro[c.id] && GUIDE.metro[c.id].file)},
  {id: "compras-lista", title: "Lista de compras", html: shopHTML},
  {id: "tallas", title: "Tallas China, Corea y México", html: tallasHTML, when: () => GUIDE.tallas && (GUIDE.tallas.tables || []).length}
];

function orderedSections(){
  const all = [...VIRTUAL.filter(s => !s.when || s.when()), ...(GUIDE.sections || [])];
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
      const lg = langOf(x.zh);
      return `<div class="phrase"><button class="phrase-open" type="button" data-say="${i}"><span class="pz" lang="${lg}">${esc(x.zh)}</span><span class="pp">${esc(x.py)}</span><span class="pe">${esc(x.es)}</span></button>${sayBtn(x.zh, lg)}</div>`;
    }).join("")}</div><p class="fine">Toca una frase para enseñarla en grande${canSpeak ? " o la bocina para escucharla" : ""}.</p>`;
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
        ${hubIcon("receipt")}
        <span class="hub-txt"><b>Gastos del viaje</b><small>${gastos.length ? `${fmtMXN(spent)} MXN en ${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}` : "Anota lo que gastas y se suma en pesos"}</small></span>
      </button>
    </div>
    ${GROUPS.map(([g, label]) => {
      const tiles = secs.filter(s => ((TOPICS[s.id] || {}).g || "ayuda") === g).map(s => {
        const t = TOPICS[s.id] || {icon: "list", label: s.title, desc: ""};
        return `<button class="hubtile" type="button" data-sub="${esc(s.id)}">${hubIcon(t.icon)}<b>${esc(t.label)}</b>${t.desc ? `<small>${esc(t.desc)}</small>` : ""}</button>`;
      });
      return tiles.length ? `<h2 class="lbl">${esc(label)}</h2><div class="hub">${tiles.join("")}</div>` : "";
    }).join("")}
    <div class="hub">
      <button class="hubtile wide" type="button" data-sub="all">${hubIcon("list")}<b>Guía completa</b><small>Todos los temas en una página</small></button>
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
  const money = ["regateo", "replicas", "que-comprar", "marcas", "dinero", "compras-lista", "tallas", "all"].includes(state.sub);
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

/* ---------- voz ---------- */

const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

function speak(text, lang){
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ko" ? "ko-KR" : "zh-CN";
  const want = lang === "ko" ? /^ko/i : /^(zh[-_](CN|Hans)|cmn)/i;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(x => want.test(x.lang) && x.localService) || voices.find(x => want.test(x.lang));
  if (v) u.voice = v;
  u.rate = 0.8;
  speechSynthesis.speak(u);
}

/* phrases with blanks like 我手机尾号是XXXX would be read letter by letter, so they get no speaker */
const sayBtn = (text, lang) => canSpeak && text && !/X/.test(text)
  ? `<button class="say" type="button" data-speak="${esc(text)}" data-lang="${lang}" aria-label="Escuchar"><svg viewBox="0 0 24 24"><use href="#i-speaker"/></svg></button>`
  : "";

const sourcesHTML = list => (list || []).length
  ? `<p class="fine">Fuentes: ${list.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(" · ")}</p>`
  : "";

function pickCity(key, ids){
  if (!ids.includes(state[key])){
    const h = currentHotelCity();
    state[key] = ids.includes(h) ? h : ids[0];
  }
  return state[key];
}

const cityChips = (ids, attr, current) => `<div class="chips" role="toolbar" aria-label="Ciudad">${ids.map(id => `<button class="chip" type="button" ${attr}="${id}" aria-pressed="${id === current}">${esc(cityOf(id).es)}</button>`).join("")}</div>`;

/* ---------- señala y pide ---------- */

const AVOID = ["cacahuate", "mariscos", "pescado", "cerdo", "res", "cordero", "vísceras", "gluten", "huevo", "lácteos", "soya", "ajonjolí", "cilantro", "picante", "alcohol"];

function dishHTML(d, cid, i, avoid){
  const lg = langOf(d.zh);
  const has = d.has || [];
  const bad = has.filter(h => avoid.has(h));
  const spice = Math.max(0, Math.min(3, Number(d.spice) || 0));
  const chili = spice ? `<span class="chili" aria-label="Picante ${spice} de 3">${"●".repeat(spice)}<i>${"●".repeat(3 - spice)}</i> pica</span>` : `<span class="chili none">No pica</span>`;
  const where = (d.where || []).map(n => P.find(p => p.c === cid && p.n === n)).filter(Boolean);
  const foot = [d.s ? `<a class="src" href="${esc(d.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : "", d.ph ? `Foto ilustrativa: ${creditHTML(d.ph)}` : ""].filter(Boolean).join(" · ");
  return `<article class="dish${bad.length ? " warn" : ""}">
    <button class="dish-open" type="button" data-dish="${cid}|${i}" aria-label="Enseñar ${esc(d.es)} en grande">
      <span class="dish-ph">${d.ph ? `<img src="${esc(d.ph.file)}" alt="${esc(d.ph.alt || d.es)}" loading="lazy" decoding="async">` : `<span class="cover-code" lang="${lg}">${esc(String(d.zh || "").slice(0, 2))}</span>`}</span>
      <span class="dish-body">
        <span class="dz" lang="${lg}">${esc(d.zh)}</span>
        <span class="dpy">${esc(d.py || "")}</span>
        <b class="des">${esc(d.es)}</b>
        <span class="dmeta">${chili}${d.price ? `<span>${esc(d.price)}</span>` : ""}</span>
      </span>
    </button>
    ${bad.length ? `<p class="dwarn">Ojo: lleva ${esc(bad.join(", "))}</p>` : ""}
    ${d.d ? `<p class="dd">${esc(d.d)}</p>` : ""}
    ${has.length ? `<div class="tags">${has.map(h => `<span class="tag ${avoid.has(h) ? "no" : "has"}">${esc(h)}</span>`).join("")}</div>` : ""}
    ${d.tip ? `<p class="tip"><b>Tip:</b> ${esc(d.tip)}</p>` : ""}
    ${where.length ? `<p class="dwhere">Pruébalo en: ${where.map(p => `<button class="linkish" type="button" data-open="${p.id}">${esc(p.n)}</button>`).join(", ")}</p>` : ""}
    <div class="dish-foot">${sayBtn(d.zh, lg)}${foot ? `<span class="credit">${foot}</span>` : ""}</div>
  </article>`;
}

function platillosHTML(){
  const ids = CITIES.map(c => c.id).filter(id => ((GUIDE.food || {})[id] || []).length);
  if (!ids.length) return `<p class="empty">Todavía no hay platillos cargados.</p>`;
  const cid = pickCity("fcity", ids);
  const avoid = new Set(store.get("rvc-avoid", []));
  return `${cityChips(ids, "data-fcity", cid)}
    <details class="avoid"${avoid.size ? " open" : ""}>
      <summary>No como… ${avoid.size ? `<b>${avoid.size}</b>` : `<small>márcalo y te aviso</small>`}</summary>
      <div class="suggest">${AVOID.map(a => `<button class="chip" type="button" data-avoid="${a}" aria-pressed="${avoid.has(a)}">${esc(a)}</button>`).join("")}</div>
    </details>
    <div class="dgrid">${GUIDE.food[cid].map((d, i) => dishHTML(d, cid, i, avoid)).join("")}</div>`;
}

function openDish(d){
  const lg = langOf(d.zh);
  openCard({ask: lg === "ko" ? "이거 주세요:" : "我要这个：", big: d.zh, where: d.py, es: d.es + (d.price ? " · " + d.price : ""), speak: {text: d.zh, lang: lg}, img: d.ph && d.ph.file});
}

/* ---------- frases con audio ---------- */

function frasesHTML(){
  const sets = GUIDE.phrase_sets || [];
  if (!sets.length) return `<p class="empty">Todavía no hay frases cargadas.</p>`;
  if (!sets.some(s => s.id === state.pset)) state.pset = sets[0].id;
  const s = sets.find(x => x.id === state.pset);
  return `<div class="chips" role="toolbar" aria-label="Situación">${sets.map(x => `<button class="chip" type="button" data-pset="${esc(x.id)}" aria-pressed="${x.id === s.id}">${esc(x.title)}</button>`).join("")}</div>
    ${blockHTML({t: "phrases", items: s.items || []})}`;
}

/* ---------- viajeros y boletos (solo en este teléfono; se pasan con un código) ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();

function travelers(){
  const list = store.get("rvc-pax", []);
  return list.length ? list : [{id: "yo", n: "Yo"}];
}

function allTickets(){
  const custom = store.get("rvc-custom-tickets", []).map(t => Object.assign({custom: true}, t));
  return [...(TRIP.tickets || []), ...custom].sort((a, b) => (a.date + (a.dep || "")).localeCompare(b.date + (b.dep || "")));
}

const ticketData = id => store.get("rvc-tickets", {})[id] || {};

function whoOn(t){
  const ids = travelers().map(p => p.id);
  const who = ticketData(t.id).who;
  return Array.isArray(who) ? who.filter(x => ids.includes(x)) : ids;
}

const paxChips = ids => `<span class="pax">${travelers().filter(p => ids.includes(p.id)).map(p => `<span class="pax-i" title="${esc(p.n)}">${esc(initials(p.n))}</span>`).join("")}</span>`;

function ticketHTML(t, pax){
  const d = ticketData(t.id);
  const who = whoOn(t);
  const tr = t.go && TRIP.transfers[t.go];
  const isTrain = t.kind === "tren";
  const f = (p, k) => `tk-${esc(t.id)}-${esc(p.id)}-${k}`;
  const filled = who.filter(id => { const v = (d.pax || {})[id]; return v && (v.code || v.seat); }).length;
  return `<article class="ticket ${isTrain ? "is-train" : "is-flight"}">
    <div class="tk-top"><span class="tk-kind">${isTrain ? "Tren" : t.kind === "otro" ? "Traslado" : "Vuelo"}</span><span class="tk-date">${esc(dayShort(t.date))}</span></div>
    <div class="tk-id">${esc(t.num || t.id)}</div>
    <div class="tk-route">
      <div><b>${esc(t.dep || "--:--")}</b><span>${esc(t.from)}</span></div>
      <span class="tk-arrow" aria-hidden="true">→</span>
      <div><b>${esc(t.arr || "--:--")}</b><span>${esc(t.to)}</span></div>
    </div>
    <div class="tk-meta">${[t.carrier, t.cls, tr && tr.term ? "Terminal: " + tr.term : ""].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}${paxChips(who)}</div>
    <details class="tk-edit"><summary>${filled ? `Datos de ${filled} de ${who.length} ${who.length === 1 ? "viajero" : "viajeros"}` : "Anotar localizador y asiento"}</summary>
      ${pax.map(p => {
        const v = (d.pax || {})[p.id] || {};
        return `<div class="tk-pax">
          <label class="whoc"><input type="checkbox" data-tk-who="${esc(t.id)}" value="${esc(p.id)}"${who.includes(p.id) ? " checked" : ""}> <b>${esc(p.n)}</b> va en este</label>
          <div class="gfields">
            <div class="wide"><label for="${f(p, "code")}">Localizador</label><input id="${f(p, "code")}" value="${esc(v.code || "")}" autocapitalize="characters" autocomplete="off"></div>
            ${isTrain
              ? `<div><label for="${f(p, "car")}">Vagón</label><input id="${f(p, "car")}" inputmode="numeric" value="${esc(v.car || "")}"></div>`
              : `<div><label for="${f(p, "gate")}">Puerta</label><input id="${f(p, "gate")}" value="${esc(v.gate || "")}" autocapitalize="characters"></div>`}
            <div><label for="${f(p, "seat")}">Asiento</label><input id="${f(p, "seat")}" value="${esc(v.seat || "")}" autocapitalize="characters"></div>
          </div>
        </div>`;
      }).join("")}
      <div class="row"><button class="btn primary" type="button" data-save-ticket="${esc(t.id)}">Guardar</button>${t.custom ? `<button class="btn gdel" type="button" data-del-ticket="${esc(t.id)}">Borrar boleto</button>` : ""}</div>
    </details>
    <div class="row"><button class="btn go-btn" type="button" data-show-ticket="${esc(t.id)}">Mostrar en grande</button>${tr ? `<button class="btn" type="button" data-transfer="${esc(tr.id)}">Ir ${isTrain ? "a la estación" : "al aeropuerto"}</button>` : ""}</div>
  </article>`;
}

function boletosHTML(){
  const pax = travelers();
  return `<p class="gp">Anota localizador y asiento de cada viajero y toca "Mostrar en grande" en la estación o el mostrador. Se guarda solo en este teléfono.</p>
    <div class="row"><button class="btn" type="button" data-sub="viajeros">Viajeros · ${pax.length}</button></div>
    <div class="tickets">${allTickets().map(t => ticketHTML(t, pax)).join("")}</div>
    <details class="calc addtk">
      <summary><b>Agregar vuelo, tren o traslado</b></summary>
      <form class="gform" id="tkform" autocomplete="off" novalidate>
        <div class="gfields">
          <div><label for="t-kind">Tipo</label><select id="t-kind"><option value="vuelo">Vuelo</option><option value="tren">Tren</option><option value="otro">Traslado</option></select></div>
          <div><label for="t-num">Número</label><input id="t-num" placeholder="Ej. AM90" autocapitalize="characters"></div>
          <div><label for="t-date">Fecha</label><input id="t-date" type="date"></div>
          <div><label for="t-carrier">Aerolínea o empresa</label><input id="t-carrier"></div>
          <div><label for="t-from">Sale de</label><input id="t-from" placeholder="CDMX (MEX)"></div>
          <div><label for="t-to">Llega a</label><input id="t-to" placeholder="Seúl (ICN)"></div>
          <div><label for="t-dep">Sale a las</label><input id="t-dep" type="time"></div>
          <div><label for="t-arr">Llega a las</label><input id="t-arr" type="time"></div>
        </div>
        <fieldset class="who"><legend>Quién va</legend>${pax.map(p => `<label class="whoc"><input type="checkbox" name="t-who" value="${esc(p.id)}" checked> ${esc(p.n)}</label>`).join("")}</fieldset>
        <div class="row"><button class="btn primary" type="submit">Agregar</button><span class="saved-msg" id="tkaddmsg" aria-live="polite"></span></div>
      </form>
    </details>`;
}

function saveTicket(id){
  const all = store.get("rvc-tickets", {});
  const d = all[id] || {};
  d.pax = d.pax || {};
  d.who = [];
  travelers().forEach(p => {
    const v = k => ((document.getElementById(`tk-${id}-${p.id}-${k}`) || {}).value || "").trim().toUpperCase();
    d.pax[p.id] = {code: v("code"), car: v("car"), gate: v("gate"), seat: v("seat")};
    const box = [...document.querySelectorAll("[data-tk-who]")].find(b => b.dataset.tkWho === id && b.value === p.id);
    if (!box || box.checked) d.who.push(p.id);
  });
  all[id] = d;
  store.set("rvc-tickets", all);
  render();
}

function addTicket(){
  const $ = id => document.getElementById(id);
  const num = $("t-num").value.trim().toUpperCase(), date = $("t-date").value, from = $("t-from").value.trim(), to = $("t-to").value.trim();
  if (!num || !date || !from || !to){ $("tkaddmsg").textContent = "Falta número, fecha, de dónde sale o a dónde llega."; return; }
  const id = "c-" + uid();
  const list = store.get("rvc-custom-tickets", []);
  list.push({id, num, kind: $("t-kind").value, date, from, to, dep: $("t-dep").value, arr: $("t-arr").value, carrier: $("t-carrier").value.trim()});
  store.set("rvc-custom-tickets", list);
  const all = store.get("rvc-tickets", {});
  all[id] = {who: [...document.querySelectorAll('input[name="t-who"]:checked')].map(x => x.value), pax: {}};
  store.set("rvc-tickets", all);
  render();
}

function delTicket(id){
  store.set("rvc-custom-tickets", store.get("rvc-custom-tickets", []).filter(t => t.id !== id));
  const all = store.get("rvc-tickets", {});
  delete all[id];
  store.set("rvc-tickets", all);
  render();
}

function showTicket(id){
  const t = allTickets().find(x => x.id === id);
  if (!t) return;
  const d = ticketData(t.id);
  const pax = travelers().filter(p => whoOn(t).includes(p.id));
  const train = t.kind === "tren";
  const ko = HANGUL.test(t.fromz || "");
  const lines = pax.map(p => {
    const v = (d.pax || {})[p.id] || {};
    const seat = train
      ? [v.car && `${v.car}车`, v.seat && `${v.seat}号`].filter(Boolean).join(" ")
      : [v.seat && (ko ? `좌석 ${v.seat}` : `座位 ${v.seat}`), v.gate && (ko ? `탑승구 ${v.gate}` : `登机口 ${v.gate}`)].filter(Boolean).join(" · ");
    return [pax.length > 1 ? (p.pz || p.n) : "", seat, v.code].filter(Boolean).join(" · ");
  }).filter(Boolean);
  openCard({
    ask: t.fromz ? (train ? "我的车票：" : ko ? "제 항공편:" : "我的航班：") : "",
    big: (t.num || t.id) + (t.clsz ? " " + t.clsz : ""),
    where: [t.fromz && t.toz ? `${t.fromz} → ${t.toz}` : "", ...lines].filter(Boolean).join("\n"),
    es: [`${dayShort(t.date)} · ${t.dep || ""}–${t.arr || ""}`, `${t.from} → ${t.to}`, pax.map(p => p.n).join(", ")].join(" · ")
  });
}

function viajerosHTML(){
  const list = store.get("rvc-pax", []);
  const shown = list.length ? list : [{id: "yo", n: "Yo", implicit: true}];
  return `<p class="gp">Agrega a quienes viajan contigo para anotar el asiento y localizador de cada uno en Mis boletos. Se guarda solo en este teléfono; para pasarlo a otro usa "Compartir código".</p>
    <div class="glist">${shown.map(p => `<div class="gitem pax-row">
      <span class="pax-i big" aria-hidden="true">${esc(initials(p.n))}</span>
      <div class="gbody"><h4>${esc(p.n)}</h4>
        ${p.pz ? `<span class="meta"><span>Pasaporte: ${esc(p.pz)}</span></span>` : ""}
        ${p.tel ? `<a class="tel" href="tel:${esc(String(p.tel).replace(/[^\d+]/g, ""))}">${esc(p.tel)}</a>` : ""}
        ${p.note ? `<p class="tip">${esc(p.note)}</p>` : ""}
      </div>
      ${p.implicit || list.length < 2 ? "" : `<button class="btn gdel" type="button" data-pax-del="${esc(p.id)}" aria-label="Quitar a ${esc(p.n)}">×</button>`}
    </div>`).join("")}</div>
    <form class="calc gform" id="paxform" autocomplete="off" novalidate>
      <label for="p-n">${list.length ? "Agregar viajero" : "Empieza por ti"}</label>
      <div class="gfields">
        <div class="wide"><label for="p-n">Nombre</label><input id="p-n" maxlength="40" placeholder="Ej. María"></div>
        <div class="wide"><label for="p-pz">Nombre como viene en el pasaporte</label><input id="p-pz" maxlength="60" autocapitalize="characters" placeholder="GARCIA LOPEZ MARIA"></div>
        <div><label for="p-tel">Teléfono o WhatsApp</label><input id="p-tel" type="tel"></div>
        <div><label for="p-note">Nota</label><input id="p-note" maxlength="80" placeholder="Llega el 25, alergias…"></div>
      </div>
      <div class="row"><button class="btn primary" type="submit">Agregar</button></div>
    </form>
    <h3 class="gsub">Pasarlo a otro teléfono</h3>
    <p class="gp">Manda el código por WhatsApp y pégalo en la app del otro teléfono. Pasa viajeros, boletos, asientos y hoteles.</p>
    <div class="row"><button class="btn primary" type="button" data-export>Compartir código</button><span class="saved-msg" id="expmsg" aria-live="polite"></span></div>
    <div class="calc"><label for="imp">Pegar código</label><textarea id="imp" class="imp" rows="3"></textarea>
      <div class="row"><button class="btn" type="button" data-import>Importar</button><span class="saved-msg" id="impmsg" aria-live="polite"></span></div>
    </div>`;
}

function addPax(){
  const $ = id => document.getElementById(id);
  const n = $("p-n").value.trim();
  if (!n){ $("p-n").focus(); return; }
  const list = store.get("rvc-pax", []);
  // the first person added is you: it takes the "yo" id so seats already saved for "Yo" stay yours
  list.push({id: list.length ? uid() : "yo", n, pz: $("p-pz").value.trim().toUpperCase(), tel: $("p-tel").value.trim(), note: $("p-note").value.trim()});
  store.set("rvc-pax", list);
  render();
}

function exportCode(){
  const data = {v: 1, pax: store.get("rvc-pax", []), tickets: store.get("rvc-tickets", {}), custom: store.get("rvc-custom-tickets", []), hotels: store.get("rvc-hotels", {})};
  return "RVC1:" + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

function importCode(text){
  const m = String(text || "").match(/RVC1:([A-Za-z0-9+/=]+)/);
  if (!m) return "Ese código no es de esta app.";
  let d;
  try{ d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); }catch(e){ return "El código está incompleto: cópialo otra vez completo."; }
  const merge = (mine, theirs) => [...mine, ...(theirs || []).filter(x => x && x.id && !mine.some(y => y.id === x.id))];
  store.set("rvc-pax", merge(store.get("rvc-pax", []), d.pax));
  store.set("rvc-custom-tickets", merge(store.get("rvc-custom-tickets", []), d.custom));
  const tk = store.get("rvc-tickets", {});
  Object.entries(d.tickets || {}).forEach(([id, v]) => {
    const cur = tk[id] || {};
    tk[id] = {who: Array.from(new Set([...(cur.who || []), ...(v.who || [])])), pax: Object.assign({}, v.pax, cur.pax)};
  });
  store.set("rvc-tickets", tk);
  store.set("rvc-hotels", Object.assign({}, d.hotels || {}, store.get("rvc-hotels", {})));
  return "";
}

/* ---------- reloj ---------- */

const ZONES = [["CDMX", "America/Mexico_City"], ["China", "Asia/Shanghai"], ["Seúl", "Asia/Seoul"]];
const clockHTML = () => `<div class="clock">${ZONES.map(([l, z]) => `<div><span>${l}</span><b data-tz="${z}">--:--</b><small data-tzd="${z}"></small></div>`).join("")}</div>`;

function tickClock(){
  const now = new Date();
  document.querySelectorAll("[data-tz]").forEach(el => {
    el.textContent = new Intl.DateTimeFormat("es-MX", {timeZone: el.dataset.tz, hour: "2-digit", minute: "2-digit", hour12: false}).format(now);
  });
  document.querySelectorAll("[data-tzd]").forEach(el => {
    el.textContent = new Intl.DateTimeFormat("es-MX", {timeZone: el.dataset.tzd, weekday: "short", day: "numeric", month: "short"}).format(now);
  });
}
setInterval(tickClock, 20000);

/* ---------- tren y avión, clima, checklist ---------- */

function stepsHTML(b){
  if (!b || !(b.steps || []).length) return "";
  return `<h3 class="gsub">${esc(b.title)}</h3>${b.intro ? `<p class="gp">${esc(b.intro)}</p>` : ""}
    <ol class="steps">${b.steps.map(s => `<li class="step"><div class="gbody"><h4>${esc(s.h)}</h4>${s.b ? `<p>${esc(s.b)}</p>` : ""}${s.zh ? `<div class="sign"><span class="zh" lang="${langOf(s.zh)}">${esc(s.zh)}</span>${s.py ? `<span class="pp">${esc(s.py)}</span>` : ""}</div>` : ""}</div></li>`).join("")}</ol>
    ${sourcesHTML(b.sources)}`;
}

function climaHTML(){
  const list = (GUIDE.logi || {}).climate || [];
  return `<div class="wx">${list.map(w => `<article class="wxc">
      <div class="wx-top"><b>${esc(w.place)}</b><span>${esc(w.dates || "")}</span></div>
      <div class="wx-t"><span class="hi">${esc(w.hi)}°</span><span class="lo">${esc(w.lo)}°</span></div>
      ${w.sky ? `<p class="wx-sky">${esc(w.sky)}</p>` : ""}
      ${w.wear ? `<p>${esc(w.wear)}</p>` : ""}
      ${w.src ? `<a class="src" href="${esc(w.src)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}
    </article>`).join("")}</div>
    <p class="fine">Promedios históricos, no pronóstico: revisa el clima un par de días antes de cada ciudad.</p>`;
}

function checklistHTML(){
  const groups = (GUIDE.logi || {}).checklist || [];
  const done = store.get("rvc-check", {});
  const total = groups.reduce((n, g) => n + (g.items || []).length, 0);
  const n = groups.reduce((k, g) => k + (g.items || []).filter((_, i) => done[`${g.id}|${i}`]).length, 0);
  return `<div class="hero"><span class="hero-lbl">Listo</span><span class="hero-num">${n} <small>de ${total}</small></span></div>
    <div class="meter" role="meter" aria-label="Checklist" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}"><span class="meter-fill" style="width:${total ? Math.round(n / total * 100) : 0}%"></span></div>
    ${groups.map(g => `<h3 class="gsub">${esc(g.title)}</h3><ul class="checks">${(g.items || []).map((it, i) => {
      const k = `${g.id}|${i}`;
      return `<li><button class="check" type="button" data-check="${esc(k)}" aria-pressed="${!!done[k]}"><span class="box" aria-hidden="true"></span><span>${esc(it)}</span></button></li>`;
    }).join("")}</ul>`).join("")}`;
}

/* ---------- cerca de mí: GPS del teléfono (funciona sin internet) + mapa esquemático ---------- */

let HERE = null;

function distKm(a, b){
  const r = x => x * Math.PI / 180;
  const s = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
const fmtKm = km => km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
const DIRS = ["al norte", "al noreste", "al este", "al sureste", "al sur", "al suroeste", "al oeste", "al noroeste"];

function dirTo(a, b){
  const r = x => x * Math.PI / 180;
  const y = Math.sin(r(b[1] - a[1])) * Math.cos(r(b[0]));
  const x = Math.cos(r(a[0])) * Math.sin(r(b[0])) - Math.sin(r(a[0])) * Math.cos(r(b[0])) * Math.cos(r(b[1] - a[1]));
  return DIRS[Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360 / 45) % 8];
}

function nearestCity(pt){
  let best = null;
  P.forEach(p => { if (p.ll){ const d = distKm(pt, p.ll); if (!best || d < best.d) best = {c: p.c, d}; } });
  return best && best.d < 80 ? best.c : null;
}

function originFor(cid){
  if (HERE && nearestCity([HERE.lat, HERE.lng]) === cid) return {pt: [HERE.lat, HERE.lng], label: "tu ubicación"};
  // lo que guardó el usuario gana; si no, las coordenadas del hotel de su reserva
  const saved = store.get("rvc-hotel-ll", {})[cid] || (hotels()[cid] || {}).ll;
  return saved ? {pt: saved, label: "tu hotel"} : null;
}

function mapSVG(cid, origin, near){
  const pts = P.filter(p => p.c === cid && p.ll);
  if (pts.length < 2) return "";
  const mid = k => pts.map(p => p.ll[k]).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  // "near" frames ~3 km around you; otherwise the city core, so a few far-off places don't squeeze the rest into one blob
  const center = near && origin ? origin.pt : [mid(0), mid(1)];
  const radius = near && origin ? 3 : 10;
  const core = pts.filter(p => distKm(center, p.ll) < radius);
  const showMe = origin && distKm(center, origin.pt) < radius;
  const cs = core.map(p => p.ll).concat(showMe ? [origin.pt] : []);
  if (!cs.length) return "";
  const lats = cs.map(c => c[0]), lngs = cs.map(c => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const W = 1000, H = 760, pad = 60;
  const spanX = Math.max((maxLng - minLng) * kx, 0.004), spanY = Math.max(maxLat - minLat, 0.004);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad - 40) / spanY);
  const ox = (W - spanX * s) / 2, oy = (H - 40 - spanY * s) / 2;
  const X = ln => (ox + (ln - minLng) * kx * s).toFixed(1);
  const Y = la => (oy + (maxLat - la) * s).toFixed(1);
  const pxPerKm = s / 111.32;
  const barKm = [0.2, 0.5, 1, 2, 5, 10, 20].find(k => k * pxPerKm >= 120) || 20;
  const pins = core.map(p => `<g class="pin" data-open="${p.id}"><title>${esc(p.n)}</title><circle class="k-${esc(p.k)}" cx="${X(p.ll[1])}" cy="${Y(p.ll[0])}" r="18"/></g>`).join("");
  const me = showMe ? `<g class="me"><circle class="halo" cx="${X(origin.pt[1])}" cy="${Y(origin.pt[0])}" r="44"/><circle class="dot" cx="${X(origin.pt[1])}" cy="${Y(origin.pt[0])}" r="16"/></g>` : "";
  return `<figure class="cmap">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa esquemático de ${esc(cityOf(cid).es)}">
      <text x="${W - 90}" y="50">N ↑</text>
      <line class="bar" x1="${pad}" y1="${H - 26}" x2="${(pad + barKm * pxPerKm).toFixed(1)}" y2="${H - 26}"/>
      <text x="${pad}" y="${H - 44}">${barKm < 1 ? barKm * 1000 + " m" : barKm + " km"}</text>
      ${pins}${me}
    </svg>
    <figcaption>Mapa sin calles: cada punto es un lugar (el color es el tipo)${showMe ? " y el punto azul eres tú" : ""}. Toca un punto para abrirlo.${core.length < pts.length ? ` ${pts.length - core.length} lugares quedan fuera de este mapa; salen en la lista.` : ""}</figcaption>
  </figure>`;
}

function cercaHTML(){
  const ids = CITIES.map(c => c.id).filter(id => P.some(p => p.c === id && p.ll));
  if (!ids.length) return `<p class="empty">Todavía no hay ubicaciones cargadas.</p>`;
  const cid = pickCity("mcity", ids);
  const origin = originFor(cid);
  const rows = P.filter(p => p.c === cid && p.ll).map(p => ({p, d: origin ? distKm(origin.pt, p.ll) : null}));
  if (origin) rows.sort((a, b) => a.d - b.d);
  return `<p class="gp">Las distancias salen desde el hotel de tu reserva. Toca "Usar mi ubicación" para medirlas desde donde estés: el GPS funciona sin internet. Distancias en línea recta.</p>
    <div class="row"><button class="btn primary" type="button" data-locate>${HERE ? "Actualizar ubicación" : "Usar mi ubicación"}</button>${HERE && nearestCity([HERE.lat, HERE.lng]) ? `<button class="btn" type="button" data-save-here>Guardar aquí como mi hotel</button>` : ""}</div>
    <p class="saved-msg" id="locmsg" aria-live="polite">${origin ? `Distancias desde ${origin.label}.` : ""}</p>
    ${cityChips(ids, "data-mcity", cid)}
    ${origin ? `<div class="chips" role="toolbar" aria-label="Zoom del mapa"><button class="chip" type="button" data-mapnear="1" aria-pressed="${state.mapnear !== false}">Cerca de ti · 3 km</button><button class="chip" type="button" data-mapnear="0" aria-pressed="${state.mapnear === false}">Toda la ciudad</button></div>` : ""}
    ${mapSVG(cid, origin, origin && state.mapnear !== false)}
    <h3 class="gsub">${origin ? `Lo más cerca de ${origin.label}` : `Lugares en ${esc(cityOf(cid).es)}`}</h3>
    <div class="near">${rows.map(({p, d}) => nearRowHTML(p, d, d == null ? "" : dirTo(origin.pt, p.ll))).join("")}</div>`;
}

function locate(){
  const msg = t => { const m = document.getElementById("locmsg"); if (m) m.textContent = t; };
  if (!navigator.geolocation){ msg("Este navegador no permite usar la ubicación."); return; }
  msg("Buscando tu ubicación…");
  navigator.geolocation.getCurrentPosition(pos => {
    HERE = {lat: pos.coords.latitude, lng: pos.coords.longitude};
    const c = nearestCity([HERE.lat, HERE.lng]);
    if (c){ state.mcity = c; state.acity = c; }
    render();
    if (!c) msg("No estás cerca de ninguna ciudad del viaje; te muestro la lista por ciudad.");
  }, err => msg(err.code === 1 ? "Sin permiso de ubicación: actívalo en Ajustes → Privacidad → Localización." : "No se pudo obtener tu ubicación; intenta en un lugar abierto."),
  {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
}

function saveHere(){
  const c = HERE && nearestCity([HERE.lat, HERE.lng]);
  if (!c) return;
  const all = store.get("rvc-hotel-ll", {});
  all[c] = [HERE.lat, HERE.lng];
  store.set("rvc-hotel-ll", all);
  render();
  const m = document.getElementById("locmsg");
  if (m) m.textContent = `Guardado como tu hotel en ${cityOf(c).es}.`;
}

/* ---------- metro ---------- */

function metroHTML(){
  const M = GUIDE.metro || {};
  const ids = CITIES.map(c => c.id).filter(id => M[id] && M[id].file);
  if (!ids.length) return `<p class="empty">Todavía no hay mapas de metro.</p>`;
  const cid = pickCity("mcity", ids);
  const m = M[cid];
  const z = state.mzoom || 1;
  const pay = (M.apps || {})[cid];
  const payText = !pay ? "" : typeof pay === "string" ? pay : pay.text || pay.how || pay.pay || "";
  return `${cityChips(ids, "data-mcity", cid)}
    ${payText ? `<p class="gp"><b>Cómo pagar:</b> ${esc(payText)}${pay.src ? ` <a class="src" href="${esc(pay.src)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}</p>` : ""}
    <div class="zoom"><button class="btn" type="button" data-mzoom="-1"${z <= 1 ? " disabled" : ""} aria-label="Alejar">−</button><button class="btn" type="button" data-mzoom="1"${z >= 4 ? " disabled" : ""} aria-label="Acercar">+</button><span>Zoom ${z}× · desliza para moverte</span></div>
    <div class="metro-wrap"><img src="${esc(m.file)}" alt="Mapa del metro de ${esc(cityOf(cid).es)}" style="width:${z * 100}%" decoding="async"></div>
    <p class="credit hero-credit">Mapa${m.year ? ` ${esc(m.year)}` : ""}: ${creditHTML(m)}${m.note ? ` · ${esc(m.note)}` : ""}</p>`;
}

/* ---------- compras: lista con precio meta y tallas ---------- */

function shopHTML(){
  const items = store.get("rvc-shop", []);
  const row = it => `<div class="shop-row${it.got ? " got" : ""}">
    <button class="sbox" type="button" data-shop-got="${esc(it.id)}" aria-pressed="${!!it.got}" aria-label="${it.got ? "Marcar pendiente" : "Marcar comprado"}"></button>
    <div class="gbody"><h4>${esc(it.n)}</h4><span class="meta">${[it.c && cityOf(it.c) ? cityOf(it.c).es : "", it.goal ? `meta ${fmtCNY(it.goal)} ≈ ${fmtMXN(it.goal * RATE_G)}` : "", it.max ? `máximo ${fmtCNY(it.max)}` : ""].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</span></div>
    <button class="btn gdel" type="button" data-shop-del="${esc(it.id)}" aria-label="Borrar ${esc(it.n)}">×</button>
  </div>`;
  const pending = items.filter(i => !i.got), got = items.filter(i => i.got);
  return `<form class="calc gform" id="shopform" autocomplete="off" novalidate>
      <label for="s-n">Qué quieres comprar</label>
      <input id="s-n" type="text" maxlength="60" placeholder="Ej. tenis Li-Ning, bolsa, audífonos">
      <div class="gfields">
        <div><label for="s-goal">Precio meta en ¥</label><input id="s-goal" type="number" inputmode="decimal" min="0"></div>
        <div><label for="s-max">No pagar más de ¥</label><input id="s-max" type="number" inputmode="decimal" min="0"></div>
        <div class="wide"><label for="s-c">Dónde</label><select id="s-c"><option value="">Cualquier ciudad</option>${CITIES.map(c => `<option value="${c.id}">${esc(c.es)}</option>`).join("")}</select></div>
      </div>
      <div class="row"><button class="btn primary" type="submit">Agregar a la lista</button><button class="btn" type="button" data-sub="regateo">Calculadora de regateo</button></div>
    </form>
    ${items.length
      ? `<h3 class="gsub">Pendientes · ${pending.length}</h3>${pending.length ? `<div class="shop">${pending.map(row).join("")}</div>` : `<p class="empty">Ya compraste todo.</p>`}
         ${got.length ? `<h3 class="gsub">Comprado · ${got.length}</h3><div class="shop">${got.map(row).join("")}</div>` : ""}`
      : `<p class="empty">Anota lo que quieres comprar con tu precio meta: así llegas al regateo con el número claro.</p>`}`;
}

function addShop(){
  const $ = id => document.getElementById(id);
  const n = $("s-n").value.trim();
  if (!n){ $("s-n").focus(); return; }
  const num = id => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? Math.round(v) : 0; };
  const items = store.get("rvc-shop", []);
  items.push({id: uid(), n, goal: num("s-goal"), max: num("s-max"), c: $("s-c").value, got: false});
  store.set("rvc-shop", items);
  render();
}

function tallasHTML(){
  const T = GUIDE.tallas || {};
  const tables = T.tables || [];
  if (!tables.some(t => t.id === state.tabla)) state.tabla = (tables[0] || {}).id;
  const t = tables.find(x => x.id === state.tabla);
  return `${T.intro ? `<p class="gp">${esc(T.intro)}</p>` : ""}
    <div class="chips" role="toolbar" aria-label="Tabla">${tables.map(x => `<button class="chip" type="button" data-tabla="${esc(x.id)}" aria-pressed="${x.id === state.tabla}">${esc(String(x.title).replace(/\s*\(.*\)$/, ""))}</button>`).join("")}</div>
    ${t ? blockHTML({t: "table", title: t.title, cols: t.cols, rows: t.rows, note: t.note}) : ""}
    ${(T.tips || []).length ? `<h3 class="gsub">Tips</h3><ul class="tips">${T.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${sourcesHTML(T.sources)}`;
}

/* ---------- horarios: "abierto ahora" aproximado ---------- */

const fmtClock = m => { const x = ((m % 1440) + 1440) % 1440; return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; };

function cityNow(cid){
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: cid === "se" ? "Asia/Seoul" : "Asia/Shanghai", hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit"}).formatToParts(new Date());
  const v = t => (parts.find(x => x.type === t) || {}).value;
  return {dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday")), min: Number(v("hour")) % 24 * 60 + Number(v("minute"))};
}

const dayIdx = w => ({dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6})[norm(w).slice(0, 3)];

function segDays(seg){
  const s = norm(seg);
  if (/entre semana/.test(s)) return [1, 2, 3, 4, 5];
  if (/fin de semana/.test(s)) return [0, 6];
  const r = s.match(/\b(lun|mar|mie|jue|vie|sab|dom)[a-z]*\s*[–-]\s*(lun|mar|mie|jue|vie|sab|dom)/);
  if (r){
    const out = [];
    for (let i = dayIdx(r[1]); out.length < 7; i = (i + 1) % 7){ out.push(i); if (i === dayIdx(r[2])) break; }
    return out;
  }
  const one = s.match(/^\s*(lun|mar|mie|jue|vie|sab|dom)[a-z]*\b/);
  return one ? [dayIdx(one[1])] : null;
}

/* hours are free text ("Lun–Vie 7:00–22:00 · Sáb–Dom 9:00–22:00", "cierra lunes", "18:00–02:00"); unknown formats say nothing rather than guess */
function openState(p, at){
  const h = String(p.h || "");
  if (!h) return {open: null, label: ""};
  const names = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const today = names[at.dow];
  if (new RegExp(`(cierra|cerrado)s? (los )?${today}|${today} cerrado`).test(norm(h))) return {open: false, label: `Cierra los ${today.replace("miercoles", "miércoles").replace("sabado", "sábado")}`};
  const segs = h.split(/[;·]/).filter(x => /\d{1,2}:\d{2}/.test(x)).map(x => ({x, days: segDays(x)}));
  if (!segs.length) return {open: null, label: ""};
  const seg = (segs.find(t => t.days && t.days.includes(at.dow)) || segs.find(t => !t.days && !/resto/.test(norm(t.x))) || segs.find(t => /resto/.test(norm(t.x))) || segs[0]).x;
  const r = seg.match(/(\d{1,2}):(\d{2})\s*(?:–|-|a)\s*~?(\d{1,2}):(\d{2})/);
  let open, close;
  if (r){
    open = +r[1] * 60 + +r[2];
    close = +r[3] * 60 + +r[4];
    if (close <= open) close += 1440;
  } else {
    const only = seg.match(/(\d{1,2}):(\d{2})/);
    open = +only[1] * 60 + +only[2];
    close = /agotar/.test(norm(seg)) ? open + 240 : 1440 + 120;
  }
  const now = at.min < open && close > 1440 && at.min + 1440 < close ? at.min + 1440 : at.min;
  if (now >= open && now < close) return {open: true, label: close - now <= 45 ? `Cierra pronto (${fmtClock(close)})` : `Abierto · cierra ${fmtClock(close)}`};
  return {open: false, label: now < open ? `Abre a las ${fmtClock(open)}` : "Cerrado a esa hora"};
}

/* ---------- plan del día: ruta para el rato libre ---------- */

function slotStart(txt){
  const t = String(txt).match(/(\d{1,2}):(\d{2})/);
  if (!t) return /tour/i.test(txt) ? 14 * 60 : 15 * 60 + 30;
  const m = Number(t[1]) * 60 + Number(t[2]);
  if (/antes|hasta/i.test(txt)) return Math.max(7 * 60, m - 180);
  if (/llegas/i.test(txt)) return m + 60;
  return m;
}

function orderStops(group, origin){
  const rest = [...group], out = [];
  let cur = origin ? origin.pt : null;
  if (!cur){
    // no hotel: start at the stop farthest from the group's center so the walk doesn't zigzag back
    const c = [rest.reduce((s, p) => s + p.ll[0], 0) / rest.length, rest.reduce((s, p) => s + p.ll[1], 0) / rest.length];
    rest.sort((a, b) => distKm(c, b.ll) - distKm(c, a.ll));
    const first = rest.shift();
    out.push(first); cur = first.ll;
  }
  while (rest.length){
    rest.sort((a, b) => distKm(cur, a.ll) - distKm(cur, b.ll));
    const nx = rest.shift();
    out.push(nx); cur = nx.ll;
  }
  return out;
}

function planRoute(pool, origin, n){
  const score = p => (favs.has(p.id) ? 3 : 0) + (p.ig ? 1 : 0) + (p.m ? 0.5 : 0);
  const pathKm = order => order.reduce((s, p, i) => s + (i ? distKm(order[i - 1].ll, p.ll) : origin ? distKm(origin.pt, p.ll) : 0), 0);
  let best = null;
  for (const seed of pool){
    const group = [seed, ...pool.filter(q => q !== seed).sort((a, b) => (distKm(seed.ll, a.ll) - score(a) * 0.5) - (distKm(seed.ll, b.ll) - score(b) * 0.5)).slice(0, n - 1)];
    const order = orderStops(group, origin);
    const val = group.reduce((s, p) => s + score(p), 0) * 1.2 - pathKm(order);
    if (!best || val > best.val) best = {order, val};
  }
  return best.order;
}

function routeSVG(order, origin){
  const pts = order.map(p => p.ll).concat(origin ? [origin.pt] : []);
  const lats = pts.map(x => x[0]), lngs = pts.map(x => x[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const W = 1000, H = 560, pad = 70;
  const spanX = Math.max((maxLng - minLng) * kx, 0.002), spanY = Math.max(maxLat - minLat, 0.002);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad - 30) / spanY);
  const ox = (W - (maxLng - minLng) * kx * s) / 2, oy = (H - 30 - (maxLat - minLat) * s) / 2;
  const X = ln => (ox + (ln - minLng) * kx * s).toFixed(1), Y = la => (oy + (maxLat - la) * s).toFixed(1);
  const line = (origin ? [origin.pt] : []).concat(order.map(p => p.ll)).map(ll => `${X(ll[1])},${Y(ll[0])}`).join(" ");
  const pxPerKm = s / 111.32;
  const barKm = [0.1, 0.2, 0.5, 1, 2, 5, 10].find(k => k * pxPerKm >= 110) || 10;
  return `<figure class="cmap route-map"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de la ruta">
    <polyline class="route-line" points="${line}"/>
    ${origin ? `<g class="me"><circle class="halo" cx="${X(origin.pt[1])}" cy="${Y(origin.pt[0])}" r="34"/><circle class="dot" cx="${X(origin.pt[1])}" cy="${Y(origin.pt[0])}" r="14"/></g>` : ""}
    ${order.map((p, i) => `<g class="pin" data-open="${p.id}"><title>${esc(p.n)}</title><circle class="k-${esc(p.k)}" cx="${X(p.ll[1])}" cy="${Y(p.ll[0])}" r="30"/><text class="pin-n" x="${X(p.ll[1])}" y="${Y(p.ll[0])}">${i + 1}</text></g>`).join("")}
    <line class="bar" x1="${pad}" y1="${H - 22}" x2="${(pad + barKm * pxPerKm).toFixed(1)}" y2="${H - 22}"/><text x="${pad}" y="${H - 38}">${barKm < 1 ? barKm * 1000 + " m" : barKm + " km"}</text>
  </svg></figure>`;
}

function routeHTML(d, cid, slotTxt){
  const dow = new Date(d.date + "T12:00:00").getDay();
  const start = slotStart(slotTxt);
  const pool = P.filter(p => p.c === cid && p.ll && (p.w === d.short || favs.has(p.id)))
    .filter(p => openState(p, {dow, min: start + 60}).open !== false || openState(p, {dow, min: start + 180}).open !== false);
  if (pool.length < 2) return "";
  const origin = originFor(cid);
  const plan = planRoute(pool, origin, Math.min(state.routeN || 5, pool.length));
  let t = start, prev = origin ? origin.pt : null;
  const rows = plan.map((p, i) => {
    let leg = "";
    if (prev){
      const km = distKm(prev, p.ll), walk = km <= 1.2, mins = Math.max(3, Math.round(walk ? km * 13 : 6 + km * 3));
      t += mins;
      leg = `<li class="leg" aria-hidden="true">${walk ? "A pie" : "Taxi"} · ${fmtKm(km)} · ~${mins} min</li>`;
    }
    const st = openState(p, {dow, min: t});
    const row = `${leg}<li class="stop k-${esc(p.k)}">
      <span class="stop-n">${i + 1}</span>
      <button class="rec-open" type="button" data-open="${p.id}"><b class="rec-title">${esc(p.n)}</b><span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span>
        <span class="stop-meta">~${fmtClock(t)} · ${esc(CATS[p.k].split(/[ ,]/)[0])}${st.label ? ` · <span class="state ${st.open ? "open" : "closed"}">${esc(st.label)}</span>` : ""}</span></button>
      <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} al chofer">Ir</button>
    </li>`;
    t += 45; prev = p.ll;
    return row;
  });
  const dur = t - start;
  return `<div class="route">
    <p class="route-head"><b>${esc(cityOf(cid).es)}</b> · ${esc(slotTxt)} · ${plan.length} paradas · ~${Math.floor(dur / 60)} h ${String(dur % 60).padStart(2, "0")} min${origin ? ` · desde ${origin.label}` : ""}</p>
    ${routeSVG(plan, origin)}
    <ol class="stops">${rows.join("")}</ol>
    ${origin ? "" : `<p class="fine">Tip: en "Cerca de mí" guarda la ubicación de tu hotel para que la ruta empiece desde ahí.</p>`}
  </div>`;
}

function routesHTML(d, slots){
  const parts = [d.city, d.to].filter(Boolean).map(cid => {
    const slot = d.to ? slots.find(s => cid === d.to ? /llegas/i.test(s[1]) : !/llegas/i.test(s[1])) : slots[0];
    return slot ? routeHTML(d, cid, slot[1]) : "";
  }).filter(Boolean);
  if (!parts.length) return "";
  const n = state.routeN || 5;
  return `<h2 class="lbl">Tu ruta para el rato libre</h2>
    <div class="chips" role="toolbar" aria-label="Paradas de la ruta">${[3, 5, 8].map(k => `<button class="chip" type="button" data-routen="${k}" aria-pressed="${n === k}">${k} paradas</button>`).join("")}</div>
    ${parts.join("")}`;
}

/* ---------- ¿qué hago ahora? ---------- */

const MODES = {auto: "Según la hora", pan: "Café y postres", com: "Comer", rep: "Compras", tec: "Tecnología", noc: "Noche"};

function modeFor(min){
  const h = Math.floor(min / 60);
  if (h >= 6 && h < 11) return ["pan"];
  if (h >= 11 && h < 15) return ["com", "pan"];
  if (h >= 15 && h < 19) return ["rep", "tec", "pan"];
  if (h >= 19 || h < 3) return ["noc", "com"];
  return [];
}

function ahoraHTML(){
  const ids = CITIES.map(c => c.id);
  const auto = HERE && nearestCity([HERE.lat, HERE.lng]);
  const cid = ids.includes(state.acity) ? state.acity : auto || currentHotelCity();
  const now = cityNow(cid);
  const cats = state.amode && state.amode !== "auto" ? [state.amode] : modeFor(now.min);
  const origin = originFor(cid);
  const pool = P.filter(p => p.c === cid).map(p => ({p, st: openState(p, now), d: origin && p.ll ? distKm(origin.pt, p.ll) : null}));
  const byNear = (a, b) => (b.st.open === true) - (a.st.open === true) || (a.d ?? 1e9) - (b.d ?? 1e9) || favs.has(b.p.id) - favs.has(a.p.id) || !!b.p.ig - !!a.p.ig;
  const pick = pool.filter(x => cats.includes(x.p.k) && x.st.open !== false).sort(byNear).slice(0, 10);
  const also = pool.filter(x => !cats.includes(x.p.k) && x.st.open === true).sort(byNear).slice(0, 5);
  const row = x => nearRowHTML(x.p, x.d, x.d == null ? "" : dirTo(origin.pt, x.p.ll), x.st.label ? {text: x.st.label, cls: x.st.open ? "open" : "closed"} : {text: "Horario sin confirmar", cls: ""});
  return `<p class="gp"><b>${esc(cityOf(cid).es)} · ${fmtClock(now.min)}</b> hora local. ${cats.length ? `Te sugiero ${cats.map(k => CATS[k].toLowerCase()).join(", ")}${origin ? `, lo más cerca de ${origin.label}` : ""}.` : "A esta hora casi todo está cerrado: mejor descansa."} Horarios aproximados.</p>
    <div class="row"><button class="btn primary" type="button" data-locate>${HERE ? "Actualizar ubicación" : "Usar mi ubicación"}</button><button class="btn" type="button" data-hotel="${cid}">Ir a mi hotel</button></div>
    <p class="saved-msg" id="locmsg" aria-live="polite"></p>
    ${cityChips(ids, "data-acity", cid)}
    <div class="chips" role="toolbar" aria-label="Qué buscas">${Object.entries(MODES).map(([k, l]) => `<button class="chip" type="button" data-amode="${k}" aria-pressed="${(state.amode || "auto") === k}">${esc(l)}</button>`).join("")}</div>
    ${pick.length ? `<div class="near">${pick.map(row).join("")}</div>` : `<p class="empty">No encontré nada abierto de ese tipo a esta hora.</p>`}
    ${also.length ? `<h3 class="gsub">También abierto</h3><div class="near">${also.map(row).join("")}</div>` : ""}`;
}

/* ---------- reservaciones ---------- */

function reservasHTML(){
  const booked = store.get("rvc-booked", {});
  const list = P.filter(p => p.r);
  const done = list.filter(p => booked[p.id]).length;
  return `<p class="gp">${list.length} lugares de tu lista piden reservación. Restaurantes top: reserva 3–7 días antes; espectáculos, 1–3 días. Marca los que ya reservaste.</p>
    <div class="hero"><span class="hero-lbl">Reservados</span><span class="hero-num">${done} <small>de ${list.length}</small></span></div>
    ${CITIES.map(c => [c, list.filter(p => p.c === c.id)]).filter(([, l]) => l.length).map(([c, l]) => `<h3 class="gsub">${esc(c.es)}</h3>
      <div class="glist">${l.map(p => `<div class="gitem res-row">
        <button class="check" type="button" data-booked="${p.id}" aria-pressed="${!!booked[p.id]}"><span class="box" aria-hidden="true"></span><span><b>${esc(p.n)}</b> <span class="zh" lang="${langOf(p.z)}">${esc(p.z)}</span></span></button>
        ${[p.w ? "Encaja el " + p.w : "", p.p, p.h].filter(Boolean).length ? `<div class="meta">${[p.w ? "Encaja el " + p.w : "", p.p, p.h].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
        ${p.t ? `<p class="tip">${esc(p.t)}</p>` : ""}
        <div class="row"><button class="btn" type="button" data-open="${p.id}">Ver lugar</button><button class="btn go-btn" type="button" data-go="${p.id}">Ir · mostrar al chofer</button></div>
      </div>`).join("")}</div>`).join("")}
    <h3 class="gsub">Cómo reservar</h3>
    <div class="glist">
      <div class="gitem"><h4>China: Dianping (大众点评)</h4><p>Busca el restaurante y toca 订座 para reservar mesa, o 在线取号 para formarte en línea el mismo día. Puedes entrar con tu cuenta de Alipay.</p></div>
      <div class="gitem"><h4>China: pídeselo al hotel</h4><p>Enséñale a recepción (前台) el nombre en chino del lugar y la frase de abajo; es lo más fácil cuando solo reservan por teléfono o WeChat.</p></div>
      <div class="gitem"><h4>Espectáculos</h4><p>Tang Dynasty Show, Everlasting Regret y la Ópera de Sichuan: compra en Trip.com o en la taquilla, 1–3 días antes.</p></div>
      <div class="gitem"><h4>Seúl: CatchTable o Naver</h4><p>Usa la app CatchTable o Naver Reservation (네이버 예약); los lugares más virales abren la reserva con semanas de anticipación.</p></div>
    </div>
    ${blockHTML({t: "phrases", title: "Para recepción del hotel", items: [
      {zh: "请帮我预订这家餐厅。", py: "qǐng bāng wǒ yùdìng zhè jiā cāntīng.", es: "Por favor resérvame este restaurante."},
      {zh: "我们X位，X月X日晚上X点。", py: "wǒmen X wèi, X yuè X rì wǎnshang X diǎn.", es: "Somos X personas, el día X a las X de la noche."}
    ]})}`;
}

/* ---------- cuentas entre viajeros ---------- */

function netBalances(list){
  const pax = travelers();
  const paid = {}, owe = {};
  pax.forEach(p => { paid[p.id] = 0; owe[p.id] = 0; });
  const shared = list.filter(g => g.by && paid[g.by] != null && (g.split || []).some(id => owe[id] != null));
  shared.forEach(g => {
    const m = toMXN(g), sp = g.split.filter(id => owe[id] != null);
    paid[g.by] += m;
    sp.forEach(id => { owe[id] += m / sp.length; });
  });
  return {pax, paid, owe, shared, net: pax.map(p => ({p, v: paid[p.id] - owe[p.id]}))};
}

function settleLines(net){
  const cred = net.filter(x => x.v > 1).map(x => ({...x})).sort((a, b) => b.v - a.v);
  const debt = net.filter(x => x.v < -1).map(x => ({...x, v: -x.v})).sort((a, b) => b.v - a.v);
  const out = [];
  for (let i = 0, j = 0; i < debt.length && j < cred.length;){
    const m = Math.min(debt[i].v, cred[j].v);
    out.push(`${debt[i].p.n} le paga ${fmtMXN(m)} a ${cred[j].p.n}`);
    debt[i].v -= m; cred[j].v -= m;
    if (debt[i].v < 1) i++;
    if (cred[j].v < 1) j++;
  }
  return out;
}

function balancesHTML(list){
  if (travelers().length < 2) return "";
  const {paid, owe, shared, net} = netBalances(list);
  if (!shared.length) return `<p class="fine">Con varios viajeros, elige quién pagó y entre quiénes se divide cada gasto para ver las cuentas.</p>`;
  const lines = settleLines(net);
  return `<h3 class="gsub">Cuentas entre viajeros</h3>
    <div class="bal">${net.map(({p, v}) => `<div class="bal-row"><span class="pax-i big" aria-hidden="true">${esc(initials(p.n))}</span>
      <div class="gbody"><h4>${esc(p.n)}</h4><span class="meta"><span>Pagó ${fmtMXN(paid[p.id])}</span><span>Le toca ${fmtMXN(owe[p.id])}</span></span></div>
      <b class="${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : "−"}${fmtMXN(Math.abs(v))}</b></div>`).join("")}</div>
    ${lines.length ? `<div class="settle">${lines.map(s => `<span>${esc(s)}</span>`).join("")}</div>` : `<p class="fine">Están a mano.</p>`}
    ${list.length > shared.length ? `<p class="fine">${list.length - shared.length} ${list.length - shared.length === 1 ? "gasto no tiene" : "gastos no tienen"} "quién pagó" y no cuentan aquí.</p>` : ""}`;
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
        ${travelers().length > 1 ? `<div class="wide"><label for="g-by">Pagó</label><select id="g-by">${options(travelers().map(p => [p.id, p.n]), last.by || travelers()[0].id)}</select></div>
        <fieldset class="who wide"><legend>Se divide entre</legend>${travelers().map(p => `<label class="whoc"><input type="checkbox" name="g-split" value="${esc(p.id)}"${!last.split || last.split.includes(p.id) ? " checked" : ""}> ${esc(p.n)}</label>`).join("")}</fieldset>` : ""}
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
    ${balancesHTML(list)}

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
                <span class="meta">${gc ? `<span>${esc(gc.es)}</span>` : ""}<span>${esc(labelOf(CAT_G, g.cat))}</span><span>${esc(labelOf(PAY, g.pay))}</span>${(who => who ? `<span>Pagó ${esc(who.n)}${(g.split || []).length > 1 ? ` · entre ${g.split.length}` : ""}</span>` : "")(g.by && travelers().length > 1 && travelers().find(p => p.id === g.by))}</span>
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
  if ($("g-by")){
    g.by = $("g-by").value;
    g.split = [...document.querySelectorAll('input[name="g-split"]:checked')].map(x => x.value);
    if (!g.split.length) g.split = [g.by];
  }
  gastos.push(g);
  store.set("rvc-gastos", gastos);
  store.set("rvc-glast", {cur: g.cur, cat: g.cat, pay: g.pay, c: g.c, by: g.by, split: g.split});
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
  if (travelers().length > 1){
    const settle = settleLines(netBalances(gastos).net);
    if (settle.length) lines.push("", "Cuentas:", ...settle.map(s => `· ${s}`));
  }
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
tip.className = "charttip";
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
  if (state.place) return (byId[state.place] || {}).n || "Lugar";
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
  // microtasks run right after the synchronous render below, without depending on animation frames
  queueMicrotask(tickClock);
  document.querySelectorAll(".tab").forEach(t => {
    if (t.dataset.tab === state.tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  const back = document.getElementById("back");
  back.hidden = !(state.place || (state.tab === "mas" && state.sub));
  back.setAttribute("aria-label", state.place ? "Regresar" : "Regresar a Más");
  document.getElementById("title").textContent = titleFor();
  const app = document.getElementById("app");
  if (state.place) return renderPlace(app);
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

document.getElementById("back").addEventListener("click", () => {
  if (!state.place) return setView("mas");
  if (history.state && history.state.place) history.back(); else closePlace();
});

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
  if (e.target.id === "shopform"){ e.preventDefault(); addShop(); }
  if (e.target.id === "tkform"){ e.preventDefault(); addTicket(); }
  if (e.target.id === "paxform"){ e.preventDefault(); addPax(); }
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
  if ((x = el("[data-speak]"))){ speak(x.dataset.speak, x.dataset.lang); return; }
  if ((x = el("[data-dish]"))){
    const [cid, i] = x.dataset.dish.split("|");
    const dish = ((GUIDE.food || {})[cid] || [])[Number(i)];
    if (dish) openDish(dish);
    return;
  }
  if ((x = el("[data-fcity]"))){ state.fcity = x.dataset.fcity; render(); return; }
  if ((x = el("[data-food]"))){ state.fcity = x.dataset.food; setView("mas", {sub: "platillos"}); return; }
  if ((x = el("[data-avoid]"))){
    const a = new Set(store.get("rvc-avoid", []));
    a.has(x.dataset.avoid) ? a.delete(x.dataset.avoid) : a.add(x.dataset.avoid);
    store.set("rvc-avoid", [...a]);
    render(); return;
  }
  if ((x = el("[data-pset]"))){ state.pset = x.dataset.pset; render(); return; }
  if ((x = el("[data-show-ticket]"))){ showTicket(x.dataset.showTicket); return; }
  if ((x = el("[data-save-ticket]"))){ saveTicket(x.dataset.saveTicket); return; }
  if ((x = el("[data-del-ticket]"))){ delTicket(x.dataset.delTicket); return; }
  if ((x = el("[data-pax-del]"))){ store.set("rvc-pax", store.get("rvc-pax", []).filter(p => p.id !== x.dataset.paxDel)); render(); return; }
  if (el("[data-export]")){
    const text = exportCode();
    if (navigator.share) navigator.share({title: "Ruta Viral: viajeros y boletos", text}).catch(() => copyTo(text, "expmsg", "Código copiado"));
    else copyTo(text, "expmsg", "Código copiado: pégalo en WhatsApp");
    return;
  }
  if (el("[data-import]")){
    const err = importCode((document.getElementById("imp") || {}).value);
    if (!err) render();
    const m = document.getElementById("impmsg");
    if (m) m.textContent = err || "Importado";
    return;
  }
  if ((x = el("[data-check]"))){
    const all = store.get("rvc-check", {});
    if (all[x.dataset.check]) delete all[x.dataset.check]; else all[x.dataset.check] = 1;
    store.set("rvc-check", all);
    render(); return;
  }
  if ((x = el("[data-mcity]"))){ state.mcity = x.dataset.mcity; render(); return; }
  if ((x = el("[data-mapnear]"))){ state.mapnear = x.dataset.mapnear === "1"; render(); return; }
  if ((x = el("[data-mapcity]"))){ state.mcity = x.dataset.mapcity; setView("mas", {sub: "cerca"}); return; }
  if ((x = el("[data-mzoom]"))){ state.mzoom = Math.min(4, Math.max(1, (state.mzoom || 1) + Number(x.dataset.mzoom))); render(); return; }
  if ((x = el("[data-tabla]"))){ state.tabla = x.dataset.tabla; render(); return; }
  if (el("[data-locate]")){ locate(); return; }
  if (el("[data-save-here]")){ saveHere(); return; }
  if ((x = el("[data-shop-got]"))){
    const items = store.get("rvc-shop", []);
    const it = items.find(i => i.id === x.dataset.shopGot);
    if (it) it.got = !it.got;
    store.set("rvc-shop", items);
    render(); return;
  }
  if ((x = el("[data-shop-del]"))){ store.set("rvc-shop", store.get("rvc-shop", []).filter(i => i.id !== x.dataset.shopDel)); render(); return; }
  if ((x = el("[data-routen]"))){ state.routeN = Number(x.dataset.routen); render(); return; }
  if ((x = el("[data-amode]"))){ state.amode = x.dataset.amode; render(); return; }
  if ((x = el("[data-acity]"))){ state.acity = x.dataset.acity; render(); return; }
  if ((x = el("[data-booked]"))){
    const all = store.get("rvc-booked", {});
    if (all[x.dataset.booked]) delete all[x.dataset.booked]; else all[x.dataset.booked] = 1;
    store.set("rvc-booked", all);
    render(); return;
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
    if (it) openCard({ask: "师傅，请带我去这里：", big: it.zh || it.h, where: it.addr, es: [it.h, it.tel].filter(Boolean).join(" · "), copy: [it.zh, it.addr].filter(Boolean).join(" "), map: mapURL([it.zh, it.addr].filter(Boolean).join(" ")), speak: {text: it.zh || "", lang: langOf(it.zh)}});
    return;
  }
  if ((x = el("[data-say]"))){
    const s = SAY[Number(x.dataset.say)];
    if (s) openCard({big: s.zh, where: s.py, es: s.es, speak: /X/.test(s.zh) ? null : {text: s.zh, lang: langOf(s.zh)}});
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
  if (state.place || state.tab !== "hoy" || e.touches.length !== 1 || e.target.closest(".strip, .daystrip, .rail")){ touch0 = null; return; }
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
const dimg = document.getElementById("dimg");
const dsay = document.getElementById("dsay");
let copyText = "";
let sayNow = null;

function openCard({ask, big, where, es, copy, map, speak: sp, img}){
  dimg.hidden = !img;
  if (img) dimg.src = img; else dimg.removeAttribute("src");
  sayNow = sp && sp.text && canSpeak ? sp : null;
  dsay.hidden = !sayNow;
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
    map: ko ? "https://map.naver.com/p/search/" + encodeURIComponent(p.z) : mapURL(full),
    speak: {text: p.z, lang: ko ? "ko" : "zh"}
  });
}

function openTransfer(tr){
  if (!tr) return;
  openCard({ask: "师傅，请带我去这里：", big: tr.z, where: transferLabel(tr), es: tr.n, copy: tr.z, map: mapURL(tr.z), speak: {text: tr.z, lang: "zh"}});
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
    copy: full, map: ko ? "https://map.naver.com/p/search/" + encodeURIComponent(h.z || h.n) : mapURL(c.sc + " " + full),
    speak: {text: h.z || "", lang: ko ? "ko" : "zh"}
  });
}

function saveHotel(cid){
  const val = k => (document.getElementById(`h-${cid}-${k}`) || {}).value?.trim() || "";
  const all = store.get("rvc-hotels", {});
  // keep the booking data (dates, confirmation) that came with the trip
  all[cid] = Object.assign({}, (TRIP.hotels || {})[cid], {n: val("n"), z: val("z"), a: val("a"), t: val("t")});
  store.set("rvc-hotels", all);
  const h = hotels()[cid] || {}; // lo efectivo: lo tuyo sobre lo que trae la reserva
  document.getElementById("hsum-" + cid).textContent = h.n || h.z || h.a ? (h.n || h.z) : "Sin capturar";
  document.getElementById("hmsg-" + cid).textContent = "Guardado";
}

document.getElementById("dclose").addEventListener("click", () => {
  if (canSpeak) speechSynthesis.cancel();
  dlg.close ? dlg.close() : dlg.removeAttribute("open");
});
dsay.addEventListener("click", () => { if (sayNow) speak(sayNow.text, sayNow.lang); });
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
