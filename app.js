"use strict";
(function(){
const {CATS, CITIES, P} = window.DATA;
const GUIDE = window.DATA.GUIDE || {sections: []};
const RATE = GUIDE.rate && Number(GUIDE.rate.mxn_per_cny);
const ASSETS = window.ASSETS || [];
const VERSION = window.ASSETS_VERSION || "dev";
const GUIDE_ID = "guia";
const byId = Object.fromEntries(P.map(p => [p.id, p]));
const cityOf = id => CITIES.find(c => c.id === id);
const isView = id => id === GUIDE_ID || !!cityOf(id);

const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let favs = new Set(store.get("rvc-favs", []));

const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtMXN = n => "$" + Math.round(n).toLocaleString("es-MX");

function todayISO(){
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function pickView(){
  const h = location.hash.slice(1);
  if (isView(h)) return h;
  const t = todayISO();
  let hit = null;
  CITIES.forEach(c => { if (t >= c.from && t <= c.to) hit = c.id; });
  if (hit) return hit;
  const last = store.get("rvc-city", null);
  return isView(last) ? last : CITIES[0].id;
}

const state = {city: pickView(), cat: "all", q: ""};
let SAY = [];

/* ---------- places ---------- */

function renderRoute(){
  const stop = (id, sc, es, dt, cls) => `
    <li${cls ? ` class="${cls}"` : ""}><button class="stop" type="button" data-city="${id}" aria-current="${!state.q && id === state.city}">
      <span class="sc" lang="zh">${sc}</span><span class="es">${esc(es)}</span><span class="dt">${esc(dt)}</span>
    </button></li>`;
  document.getElementById("route").innerHTML =
    CITIES.map(c => stop(c.id, c.sc, c.es, c.dates)).join("") + stop(GUIDE_ID, "指南", "Guía", "compras · apps", "guide");
}

function photoHTML(p, cls, label){
  const ph = p.ph;
  if (!ph) return "";
  const credit = ph.page ? `<a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.credit)}</a>` : esc(ph.credit);
  return `<figure class="${cls}">
    <img src="${esc(ph.file)}" alt="${esc(ph.alt || p.n)}" loading="lazy" decoding="async">
    ${ph.kind === "ilustrativa" ? `<span class="illu">Foto ilustrativa</span>` : ""}
    <figcaption>${label ? esc(label) + " · " : ""}Foto: ${credit}</figcaption>
  </figure>`;
}

function entryHTML(p, withCity){
  const tags = [];
  if (withCity) tags.push(`<span class="tag city">${esc(cityOf(p.c).es)}</span>`);
  if (p.w) tags.push(`<span class="tag when">${esc(p.w)}</span>`);
  if (p.r) tags.push(`<span class="tag res">Reserva</span>`);
  if (p.v) tags.push(`<span class="tag viral">${esc(p.v)}</span>`);
  if (p.u) tags.push(`<span class="tag unv">Sin verificar</span>`);
  const meta = [p.p, p.h].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("");
  const on = favs.has(p.id);
  return `<article class="entry${p.ph ? " has-ph" : ""}">
    ${photoHTML(p, "ph")}
    <div class="main">
      <span class="cat">${esc(CATS[p.k])}</span>
      <h3>${esc(p.n)}</h3>
      <div class="zh" lang="zh">${esc(p.z)}${p.a ? `<span class="addr">${esc(p.a)}</span>` : ""}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      <p>${esc(p.d)}</p>
      ${p.t ? `<p class="tip"><b>Tip:</b> ${esc(p.t)}</p>` : ""}
      ${p.s ? `<a class="src" href="${esc(p.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}
    </div>
    <div class="side">
      <button class="go" type="button" data-go="${p.id}" aria-label="Mostrar ${esc(p.n)} en chino al chofer" lang="zh">去</button>
      <small>chofer</small>
      <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? "Quitar de guardados" : "Guardar"}">${on ? "★" : "☆"}</button>
    </div>
  </article>`;
}

function renderSearch(app){
  const q = norm(state.q);
  const hits = P.filter(p => [p.n, p.z, p.a, p.d, p.t, p.v, CATS[p.k], cityOf(p.c).es].some(f => norm(f).includes(q)));
  app.innerHTML = `
    <h2 class="lbl">${hits.length} ${hits.length === 1 ? "resultado" : "resultados"} en las 5 ciudades</h2>
    <div class="list">${hits.length ? hits.map(p => entryHTML(p, true)).join("")
      : `<p class="empty">Nada con “${esc(state.q)}”. Prueba con el nombre en chino o con una palabra como “pato”, “réplicas” o “bar”.</p>`}</div>`;
}

function renderCity(app){
  const c = cityOf(state.city);
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
    <section class="city-head">
      <p class="city-sc" lang="zh" aria-hidden="true">${c.sc}</p>
      <div class="city-meta">
        <span class="dt">${esc(c.dates)}</span>
        <h1>${esc(c.es)}</h1>
        <p>${all.length} lugares</p>
      </div>
    </section>
    ${banner ? photoHTML(banner, "banner", banner.n) : ""}
    <p class="intro">${esc(c.intro)}</p>

    <h2 class="lbl">Tus ratos libres</h2>
    <ul class="slots">
      ${c.slots.map(s => `<li class="slot"><span class="d">${esc(s[0])}<small>${esc(s[1])}</small></span><p>${esc(s[2])}</p></li>`).join("")}
    </ul>
    <div class="notes"><ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>

    <h2 class="lbl">Lugares</h2>
    <div class="chips" role="toolbar" aria-label="Filtrar por tipo">
      ${chipDefs.map(([k, l]) => `<button class="chip" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${esc(l)}<span>${counts[k]}</span></button>`).join("")}
    </div>
    <div class="list">
      ${shown.length ? shown.map(p => entryHTML(p, false)).join("")
        : `<p class="empty">${state.cat === "fav" ? "Todavía no guardas lugares en esta ciudad. Toca ☆ en los que quieras tener a la mano." : "Nada en esta categoría."}</p>`}
    </div>`;
}

/* ---------- guide ---------- */

const tagClass = t => /no vale|evita|nunca|no compres|no la/i.test(t) ? "no"
  : /ojo|sin verificar/i.test(t) ? "unv"
  : /vale la pena|esencial|recomend/i.test(t) ? "when" : "viral";

function calcHTML(b){
  return `<div class="calc">
    <label for="ask">Calculadora de regateo · te piden</label>
    <div class="calc-in"><span>¥</span><input id="ask" type="number" inputmode="decimal" min="0" placeholder="800"
      data-offer="${Number(b.offer) || 0.2}" data-goal="${Number(b.goal) || 0.3}" data-max="${Number(b.max) || 0.4}"></div>
    <dl class="calc-out" id="ask-out">
      <div><dt>Primera oferta · ${Math.round((Number(b.offer) || 0.2) * 100)}%</dt><dd data-k="offer">—</dd></div>
      <div><dt>Meta · ${Math.round((Number(b.goal) || 0.3) * 100)}%</dt><dd data-k="goal">—</dd></div>
      <div><dt>No pases de · ${Math.round((Number(b.max) || 0.4) * 100)}%</dt><dd data-k="max">—</dd></div>
    </dl>
  </div>`;
}

function blockHTML(b){
  const title = b.title ? `<h3 class="gsub">${esc(b.title)}</h3>` : "";
  switch (b.t){
    case "p": return `<p class="gp">${esc(b.text)}</p>`;
    case "calc": return calcHTML(b);
    case "list": return title + `<div class="glist">${(b.items || []).map(it => `
      <div class="gitem">
        <div class="gtop"><h4>${esc(it.h)}</h4>${it.tag ? `<span class="tag ${tagClass(it.tag)}">${esc(it.tag)}</span>` : ""}</div>
        ${it.zh ? `<div class="zh" lang="zh">${esc(it.zh)}</div>` : ""}
        ${it.price ? `<div class="meta"><span>${esc(it.price)}</span></div>` : ""}
        ${it.b ? `<p>${esc(it.b)}</p>` : ""}
        ${it.s ? `<a class="src" href="${esc(it.s)}" target="_blank" rel="noopener">Fuente ↗</a>` : ""}
      </div>`).join("")}</div>`;
    case "table": return title + `<div class="gtable"><table>
      <thead><tr>${(b.cols || []).map(c => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${(b.rows || []).map(r => `<tr>${r.map((cell, i) => i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>${b.note ? `<p class="fine">${esc(b.note)}</p>` : ""}`;
    case "phrases": return title + `<div class="phrases">${(b.items || []).map(x => {
      const i = SAY.push(x) - 1;
      return `<button class="phrase" type="button" data-say="${i}"><span class="pz" lang="zh">${esc(x.zh)}</span><span class="pp">${esc(x.py)}</span><span class="pe">${esc(x.es)}</span></button>`;
    }).join("")}</div><p class="fine">Toca una frase para enseñarla en grande.</p>`;
    default: return "";
  }
}

function renderGuide(app){
  SAY = [];
  const secs = GUIDE.sections || [];
  const r = GUIDE.rate;
  const conv = RATE ? `<div class="calc">
      <label for="cny">Yuanes a pesos</label>
      <div class="calc-in"><span>¥</span><input id="cny" type="number" inputmode="decimal" min="0" placeholder="100"><output id="mxn" for="cny">≈ $— MXN</output></div>
      <p class="fine">¥1 ≈ $${RATE.toFixed(2)} MXN${r.date ? ` · ${esc(r.date)}` : ""}</p>
    </div>` : "";
  app.innerHTML = `
    <section class="city-head">
      <p class="city-sc" lang="zh" aria-hidden="true">指南</p>
      <div class="city-meta">
        <span class="dt">Para todo el viaje</span>
        <h1>Guía de compras</h1>
        <p>Regateo, marcas, apps y dinero</p>
      </div>
    </section>
    ${conv}
    ${secs.length
      ? `<div class="chips toc" role="navigation" aria-label="Secciones de la guía">${secs.map(s => `<button class="chip" type="button" data-jump="g-${esc(s.id)}">${esc(s.title)}</button>`).join("")}</div>`
      : `<p class="empty">La guía todavía no tiene secciones.</p>`}
    ${secs.map(s => `<section class="gsec" id="g-${esc(s.id)}">
      <h2 class="gh">${esc(s.title)}</h2>
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
      ${(s.blocks || []).map(blockHTML).join("")}
    </section>`).join("")}`;
}

function render(){
  renderRoute();
  const app = document.getElementById("app");
  if (state.q) return renderSearch(app);
  if (state.city === GUIDE_ID) return renderGuide(app);
  renderCity(app);
}

/* ---------- events ---------- */

const qInput = document.getElementById("q");
qInput.addEventListener("input", () => { state.q = qInput.value.trim(); render(); });

document.addEventListener("input", e => {
  const t = e.target;
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

document.addEventListener("click", e => {
  const stop = e.target.closest("[data-city]");
  if (stop){
    state.city = stop.dataset.city; state.cat = "all"; state.q = ""; qInput.value = "";
    store.set("rvc-city", state.city);
    history.replaceState(null, "", "#" + state.city);
    render(); window.scrollTo({top: 0});
    return;
  }
  const chip = e.target.closest("[data-cat]");
  if (chip){ state.cat = chip.dataset.cat; render(); return; }
  const jump = e.target.closest("[data-jump]");
  if (jump){
    const el = document.getElementById(jump.dataset.jump);
    if (el) el.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
    return;
  }
  const fav = e.target.closest("[data-fav]");
  if (fav){
    const id = fav.dataset.fav;
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("rvc-favs", [...favs]); render(); return;
  }
  const go = e.target.closest("[data-go]");
  if (go){ openDriver(byId[go.dataset.go]); return; }
  const say = e.target.closest("[data-say]");
  if (say){
    const x = SAY[Number(say.dataset.say)];
    if (x) openCard({big: x.zh, where: x.py, es: x.es});
    return;
  }
  if (e.target.closest("[data-install]") && deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; renderInstall(); });
    return;
  }
  if (e.target.closest("[data-hide-install]")){ store.set("rvc-install-hidden", true); renderInstall(); return; }
  if (e.target.closest("[data-recache]")){
    navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage({type: "recache"}));
    polls = 0; poll();
  }
});

/* ---------- full-screen card (driver + phrases) ---------- */

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
  if (ask) dAsk.textContent = ask;
  dz.textContent = big || "";
  da.textContent = where || "";
  dn.textContent = es || "";
  dmap.hidden = !map;
  if (map) dmap.href = map;
  copyText = copy || "";
  dcopy.hidden = !copy;
  dcopy.textContent = "Copiar para Didi";
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}

function openDriver(p){
  const c = cityOf(p.c);
  const full = c.sc + " " + p.z + (p.a ? " " + p.a : "");
  openCard({
    ask: "师傅，请带我去这里：", big: p.z, where: p.a, es: p.n + " · " + c.es,
    copy: full, map: "https://maps.apple.com/?q=" + encodeURIComponent(full)
  });
}

document.getElementById("dclose").addEventListener("click", () => dlg.close ? dlg.close() : dlg.removeAttribute("open"));
dcopy.addEventListener("click", async () => {
  if (!copyText) return;
  try{ await navigator.clipboard.writeText(copyText); dcopy.textContent = "Copiado"; }
  catch(err){
    const r = document.createRange(); r.selectNodeContents(da.textContent ? da : dz);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    dcopy.textContent = "Mantén presionado y copia";
  }
});

/* ---------- install + offline ---------- */

const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; renderInstall(); });

function renderInstall(){
  const box = document.getElementById("install");
  if (isStandalone() || store.get("rvc-install-hidden", false)){ box.hidden = true; return; }
  box.hidden = false;
  const steps = deferredPrompt
    ? `<div class="row"><button class="btn primary" type="button" data-install>Instalar app</button><button class="btn" type="button" data-hide-install>Ahora no</button></div>`
    : isIOS
      ? `<ol><li>En Safari toca <b>Compartir</b> (el cuadro con flecha).</li><li>Elige <b>Agregar a inicio</b>.</li><li>Ábrela desde el ícono 去 con Wi-Fi hasta que diga “Lista sin internet”.</li></ol><div class="row"><button class="btn" type="button" data-hide-install>Ya la instalé</button></div>`
      : `<ol><li>En Chrome abre el menú ⋮.</li><li>Toca <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li></ol><div class="row"><button class="btn" type="button" data-hide-install>Ya la instalé</button></div>`;
  box.innerHTML = `<p><b>Instálala antes de volar.</b> Así abre en China sin internet ni VPN, con todo y fotos.</p>${steps}`;
}

async function updateOffline(){
  const pill = document.getElementById("status");
  const panel = document.getElementById("offline-state");
  if (!("caches" in window) || !("serviceWorker" in navigator)){
    pill.textContent = "";
    panel.textContent = "Este navegador no permite guardarla sin internet. Ábrela en Safari (iPhone) o Chrome (Android).";
    return true;
  }
  let n = 0;
  try{ n = (await (await caches.open("rvc-" + VERSION)).keys()).length; }catch(e){}
  const total = ASSETS.length;
  const done = total > 0 && n >= total;
  pill.className = "status" + (done ? " ok" : "");
  pill.textContent = done ? "● Lista sin internet" : `Guardando ${Math.floor(n / Math.max(total, 1) * 100)}%`;
  panel.innerHTML = done
    ? `<b>Lista para usar sin internet.</b> Los ${total} archivos, fotos incluidas, están guardados en este teléfono.`
    : `<b>Guardando para usar sin internet: ${n} de ${total} archivos.</b> Deja la app abierta con Wi-Fi hasta que diga “Lista sin internet”. <button class="btn" type="button" data-recache>Reintentar</button>`;
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

renderInstall();
render();
})();
