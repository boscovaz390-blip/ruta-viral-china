const VERSION = "850cfaa3e3";
const CACHE = "rvc-" + VERSION;
const ASSETS = ["app.css", "app.js", "fonts.css", "fonts/notoserifkr-600-0.woff2", "fonts/notoserifkr-900-0.woff2", "fonts/notoserifsc-600-0.woff2", "fonts/notoserifsc-600-1.woff2", "fonts/notoserifsc-600-2.woff2", "fonts/notoserifsc-600-3.woff2", "fonts/notoserifsc-900-0.woff2", "fonts/notoserifsc-900-1.woff2", "fonts/notoserifsc-900-2.woff2", "fonts/notoserifsc-900-3.woff2", "fonts/plex-25040cb42f.woff2", "fonts/plex-a80b2cab5e.woff2", "fonts/plex-effb1ea2f9.woff2", "fonts/plex-f6667783d2.woff2", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "img/bj/butterful-creamorous.jpg", "img/bj/cafe-1901.jpg", "img/bj/cj-lounge.jpg", "img/bj/da-dong-nanxincang.jpg", "img/bj/daoxiangcun-0.jpg", "img/bj/distrito-798.jpg", "img/bj/dji-flagship.jpg", "img/bj/fangzhuanchang-69.jpg", "img/bj/fuding-coffee.jpg", "img/bj/gulou-wudaoying.jpg", "img/bj/helianthus-mall.jpg", "img/bj/hongqiao-pearl-market.jpg", "img/bj/hu-da.jpg", "img/bj/huawei-wangfujing.jpg", "img/bj/huguosi-xiaochi.jpg", "img/bj/jingzun-duck.jpg", "img/bj/jubaoyuan.jpg", "img/bj/panjiayuan.jpg", "img/bj/pop-mart-apm.jpg", "img/bj/postpost.jpg", "img/bj/rosy-bay-liangma.jpg", "img/bj/sanlitun-taikoo-li.jpg", "img/bj/shichahai-houhai.jpg", "img/bj/siji-minfu.jpg", "img/bj/silk-street.jpg", "img/bj/skp-s.jpg", "img/bj/super-zhuanzhuan.jpg", "img/bj/tiao-bar.jpg", "img/bj/twist-bakery.jpg", "img/bj/wangfujing-noche.jpg", "img/bj/xianshu.jpg", "img/bj/yuan-gu.jpg", "img/cd/anshun-jiuyanqiao.jpg", "img/cd/brochetas-molleja.jpg", "img/cd/butterful-creamorous.jpg", "img/cd/calle-yulin.jpg", "img/cd/chen-mapo-tofu.jpg", "img/cd/chengdu-digital-plaza.jpg", "img/cd/chengdu-museum.jpg", "img/cd/chengdu-skp.jpg", "img/cd/chunxi-road.jpg", "img/cd/du-fu-cottage.jpg", "img/cd/eastern-suburb-memory.jpg", "img/cd/guang-tai-men.jpg", "img/cd/hehuachi.jpg", "img/cd/houtang.jpg", "img/cd/jinli.jpg", "img/cd/lai-tangyuan.jpg", "img/cd/long-chao-shou.jpg", "img/cd/opera-sichuan.jpg", "img/cd/panda-ear-cleaning.jpg", "img/cd/panda-ifs.jpg", "img/cd/shujiuxiang.jpg", "img/cd/taikoo-li.jpg", "img/cd/taisheng-south-road.jpg", "img/cd/teteria-heming.jpg", "img/cd/tianfu-square.jpg", "img/cd/um-coffee.jpg", "img/cd/wenshu.jpg", "img/cd/wuhou-shrine.jpg", "img/cd/xiaolongkan.jpg", "img/cd/youshi.jpg", "img/cd/zhong-shui-jiao.jpg", "img/guide/361.jpg", "img/guide/ambulancia-120.jpg", "img/guide/anta.jpg", "img/guide/antiguedades.jpg", "img/guide/apps.jpg", "img/guide/atm.jpg", "img/guide/bosideng-chamarras.jpg", "img/guide/bosideng.jpg", "img/guide/china-mobile.jpg", "img/guide/dji.jpg", "img/guide/embajada-mexico.jpg", "img/guide/emergencias.jpg", "img/guide/erdos.jpg", "img/guide/esim.jpg", "img/guide/frases-emergencia.jpg", "img/guide/gadgets-xiaomi.jpg", "img/guide/helado.jpg", "img/guide/hongqiao-market.jpg", "img/guide/huawei.jpg", "img/guide/jnby.jpg", "img/guide/laopu-gold.jpg", "img/guide/li-ning.jpg", "img/guide/marcas.jpg", "img/guide/nanjing-road.jpg", "img/guide/naturehike.jpg", "img/guide/perlas.jpg", "img/guide/policia.jpg", "img/guide/pop-mart.jpg", "img/guide/que-comprar.jpg", "img/guide/regateo.jpg", "img/guide/replicas.jpg", "img/guide/restaurante.jpg", "img/guide/seda.jpg", "img/guide/silk-market.jpg", "img/guide/silk-street.jpg", "img/guide/tenis-running.jpg", "img/guide/united-family.jpg", "img/guide/west-china-hospital.jpg", "img/guide/xiaomi.jpg", "img/guide/xtep.jpg", "img/lj/bar-street-noche.jpg", "img/lj/bar-street.jpg", "img/lj/black-dragon-pool.jpg", "img/lj/bordado-baisha.jpg", "img/lj/canal-dayan-2.jpg", "img/lj/canal-lijiang.jpg", "img/lj/dayan-atardecer.jpg", "img/lj/dayan-calle-2.jpg", "img/lj/dayan-calle.jpg", "img/lj/dayan-linternas.jpg", "img/lj/dayan-noche-2.jpg", "img/lj/hotpot-hongos.jpg", "img/lj/liangfen-lijiang.jpg", "img/lj/lijiang-old-town-night.jpg", "img/lj/mercado-zhongyi.jpg", "img/lj/mu-palace.jpg", "img/lj/musicos-naxi.jpg", "img/lj/papel-dongba.jpg", "img/lj/pastel-rosa.jpg", "img/lj/patio-lijiang.jpg", "img/lj/puertas-bar-lijiang.jpg", "img/lj/shuhe-qinglong.jpg", "img/lj/sifang-dayan.jpg", "img/lj/te-puer.jpg", "img/lj/tiendas-dayan.jpg", "img/lj/wangu-tower.jpg", "img/sh/13de-marzo.jpg", "img/sh/1933-old-millfun.jpg", "img/sh/ap-plaza.jpg", "img/sh/apple-jingan.jpg", "img/sh/barco-louis-vuitton.jpg", "img/sh/bazar-yuyuan.jpg", "img/sh/butterful-creamorous.jpg", "img/sh/cheng-long-hang.jpg", "img/sh/columbia-circle.jpg", "img/sh/dji-xintiandi.jpg", "img/sh/el-bund-de-noche.jpg", "img/sh/farine.jpg", "img/sh/ferry-jinling.jpg", "img/sh/flair.jpg", "img/sh/guangming-cun.jpg", "img/sh/huawei-nanjing-east.jpg", "img/sh/jia-jia-tang-bao.jpg", "img/sh/lai-lai-xiao-long.jpg", "img/sh/lao-zheng-xing.jpg", "img/sh/long-museum-west-bund.jpg", "img/sh/metal-hands.jpg", "img/sh/nanjing-road-noche.jpg", "img/sh/old-jesse.jpg", "img/sh/paopao.jpg", "img/sh/park-hotel-deli.jpg", "img/sh/pony-up.jpg", "img/sh/pop-mart-flagship.jpg", "img/sh/qipu-road.jpg", "img/sh/shanghai-museum-east.jpg", "img/sh/speak-low.jpg", "img/sh/starbucks-reserve-roastery.jpg", "img/sh/taishengyuan.jpg", "img/sh/the-captain.jpg", "img/sh/wukang-anfu.jpg", "img/sh/xiaomi-home.jpg", "img/sh/yangs-fry-dumplings.jpg", "img/trip/bj-cbd-skyline.jpg", "img/trip/bj-ciudad-prohibida.jpg", "img/trip/bj-cubo-de-agua.jpg", "img/trip/bj-hutongs-rickshaw.jpg", "img/trip/bj-jingshan.jpg", "img/trip/bj-mutianyu.jpg", "img/trip/bj-nido-de-pajaro.jpg", "img/trip/bj-palacio-de-verano.jpg", "img/trip/bj-qianmen.jpg", "img/trip/bj-templo-del-cielo.jpg", "img/trip/xa-barrio-musulman.jpg", "img/trip/xa-estacion-norte.jpg", "img/trip/xa-gran-mezquita.jpg", "img/trip/xa-guerreros-terracota.jpg", "img/trip/xa-muralla.jpg", "img/trip/xa-tren-fuxing.jpg", "img/xa/biangbiang.jpg", "img/xa/bubble-tea.jpg", "img/xa/cerveceria-artesanal.jpg", "img/xa/datang-everbright.jpg", "img/xa/datang-noche-tang.jpg", "img/xa/defu-xiang.jpg", "img/xa/dumplings.jpg", "img/xa/fuente-gran-pagoda.jpg", "img/xa/hanfu.jpg", "img/xa/huaqing.jpg", "img/xa/muralla-bici.jpg", "img/xa/roujiamo-lazhi.jpg", "img/xa/roujiamo-pimientos.jpg", "img/xa/sajinqiao.jpg", "img/xa/shizibing-caqui.jpg", "img/xa/shunchengxiang-muralla.jpg", "img/xa/shuyuanmen.jpg", "img/xa/tang-dynasty-show.jpg", "img/xa/tang-west-market.jpg", "img/xa/torre-campana-noche.jpg", "img/xa/torre-tambor-noche.jpg", "img/xa/xiaonanmen.jpg", "img/xa/yangrou-paomo.jpg", "img/xa/yongxingfang.jpg", "index.html", "manifest.webmanifest", "data.js", "./"];
const IMMUTABLE = /\/(img|fonts|icons)\//;

async function fill(){
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map(r => r.url));
  const todo = ASSETS.map(u => new URL(u, self.registration.scope).href).filter(u => !have.has(u));
  for (let i = 0; i < todo.length; i += 8){
    await Promise.all(todo.slice(i, i + 8).map(async u => {
      try{
        if (IMMUTABLE.test(u)){
          const old = await caches.match(u);
          if (old){ await cache.put(u, old); return; }
        }
        const res = await fetch(u, {cache: "reload"});
        if (res.ok) await cache.put(u, res);
      }catch(e){}
    }));
    const clients = await self.clients.matchAll({includeUncontrolled: true});
    clients.forEach(c => c.postMessage({type: "progress"}));
  }
}

self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(fill()); });

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("rvc-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "recache") e.waitUntil(fill());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, {ignoreSearch: true});
    if (hit) return hit;
    try{
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }catch(err){
      if (req.mode === "navigate") return (await cache.match("./")) || (await cache.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});
