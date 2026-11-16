/*
 * 拡張機能側 (ISOLATED world) とページ側 (MAIN world / page-patch.js) の橋渡し。
 * MAIN world からは browser.* が使えないため、CustomEvent で数値だけをやり取りする。
 */
(() => {
  "use strict";

  const EV_SET = "__tvc_set__";
  const EV_READY = "__tvc_ready__";

  let lastFactor = 1;

  function push() {
    try {
      window.dispatchEvent(new CustomEvent(EV_SET, { detail: lastFactor }));
    } catch (e) {
      /* 無視 */
    }
  }

  // page-patch.js が先に立ち上がっていた場合に取りこぼさない
  window.addEventListener(EV_READY, push, true);

  browser.runtime
    .sendMessage({ type: "tvc:getFactor" })
    .then((factor) => {
      if (typeof factor === "number") {
        lastFactor = factor;
        push();
      }
    })
    .catch(() => {
      /* background が寝ている等 */
    });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "tvc:setFactor" && typeof msg.factor === "number") {
      lastFactor = msg.factor;
      push();
    }
  });
})();
