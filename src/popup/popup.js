"use strict";

function applyPopupLayout() {
  const mobile = window.matchMedia("(max-device-width: 480px)").matches;
  if (mobile) {
    document.documentElement.classList.add("mobile");
    document.body.classList.add("popup-panel");
    return;
  }

  document.documentElement.classList.remove("mobile");
  const hostWidth = window.innerWidth;
  if (hostWidth < 250) {
    // ツールバー初回表示: min-width でポップアップ自体を広げる
    document.body.classList.remove("popup-panel");
  } else if (hostWidth < 360) {
    // オーバーフローメニュー等の中くらいのパネル: 100% で埋めて横スクロールを防ぐ
    document.body.classList.add("popup-panel");
  } else {
    // 十分広いパネルだけ 100% で埋める
    document.body.classList.toggle("popup-panel", hostWidth > 360);
  }
}

applyPopupLayout();
requestAnimationFrame(applyPopupLayout);

browser.runtime.getPlatformInfo().then(({ os }) => {
  if (os === "android") {
    document.documentElement.classList.add("mobile", "android");
    document.body.classList.add("popup-panel");
  }
});

const $ = (id) => document.getElementById(id);
const slider = $("slider");
const valueOut = $("value");
const muteBtn = $("mute");
const originEl = $("origin");
const saveBtn = $("save-default");
const clearBtn = $("clear-default");
const noteEl = $("default-note");

let state = null;

function render({ syncSlider = true } = {}) {
  if (!state) return;
  const percent = Math.round(state.volume * 100);
  // ドラッグ中に非同期応答でつまみが跳ねないよう、その時だけ同期しない
  if (syncSlider) slider.value = String(percent);
  valueOut.textContent = percent + "%";
  muteBtn.textContent = state.muted ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-pressed", String(state.muted));
  originEl.textContent = state.origin || "(このページでは使えません)";

  const hasDefault = state.savedDefault !== null && state.savedDefault !== undefined;
  saveBtn.disabled = !state.origin;
  clearBtn.hidden = !hasDefault;
  noteEl.hidden = !hasDefault;
  if (hasDefault) {
    noteEl.textContent =
      "このサイトの既定値: " + Math.round(state.savedDefault * 100) + "%";
  }
}

async function send(msg) {
  return browser.runtime.sendMessage(msg);
}

async function apply(patch, renderOpts) {
  if (!state) return;
  const result = await send({ type: "tvc:setState", tabId: state.tabId, ...patch });
  if (result) Object.assign(state, result);
  render(renderOpts);
}

// ドラッグ中もリアルタイムに反映させる
slider.addEventListener("input", () => {
  valueOut.textContent = slider.value + "%";
  apply({ volume: Number(slider.value) / 100 }, { syncSlider: false });
});

muteBtn.addEventListener("click", () => {
  apply({ muted: !state.muted });
});

for (const btn of document.querySelectorAll(".presets button")) {
  btn.addEventListener("click", () => {
    apply({ volume: Number(btn.dataset.v) / 100, muted: false });
  });
}

saveBtn.addEventListener("click", async () => {
  if (!state || !state.origin) return;
  state.savedDefault = await send({
    type: "tvc:saveDefault",
    origin: state.origin,
    volume: state.volume
  });
  render();
});

clearBtn.addEventListener("click", async () => {
  if (!state || !state.origin) return;
  state.savedDefault = await send({ type: "tvc:clearDefault", origin: state.origin });
  render();
});

async function checkPermission() {
  // 開いているタブのオリジンだけを見る。<all_urls> で判定すると
  // サイト単位で許可している人にも誤って警告が出る。
  const origins = state && state.origin ? [state.origin + "/*"] : ["<all_urls>"];
  let granted = true;
  try {
    granted = await browser.permissions.contains({ origins });
  } catch (e) {
    return;
  }
  if (granted) return;

  const warning = $("permission-warning");
  warning.hidden = false;
  $("grant").addEventListener("click", async () => {
    try {
      const ok = await browser.permissions.request({ origins });
      if (ok) {
        warning.hidden = true;
        // content script は document_start で入る必要があるので再読み込みする
        if (activeTab) browser.tabs.reload(activeTab.id);
      }
    } catch (e) {
      warning.querySelector("p").textContent =
        "about:addons → この拡張機能 → 権限 から「すべてのサイト」を許可してください。";
    }
  });
}

let activeTab = null;

(async () => {
  [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  state = await send({ type: "tvc:getState", tabId: activeTab && activeTab.id });
  render();
  checkPermission();
})();
