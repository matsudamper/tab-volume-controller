/*
 * タブごとの音量状態を持つイベントページ。
 * MV3 の background は idle で停止するので、状態は storage.session に置く
 * (メモリ上の Map だと数十秒後に消えて音量が勝手に戻る)。
 */
"use strict";

const SESSION_PREFIX = "tab:";
const DEFAULTS_KEY = "originDefaults";

function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
  } catch (e) {
    /* about:blank など */
  }
  return null;
}

function factorOf(state) {
  return state.muted ? 0 : state.volume;
}

async function readSession(tabId) {
  const key = SESSION_PREFIX + tabId;
  const stored = await browser.storage.session.get(key);
  return stored[key] || null;
}

function writeSession(tabId, state) {
  return browser.storage.session.set({ [SESSION_PREFIX + tabId]: state });
}

async function getDefaults() {
  const stored = await browser.storage.local.get(DEFAULTS_KEY);
  return stored[DEFAULTS_KEY] || {};
}

/**
 * タブの現在状態を返す。セッションに無い、または前回と別オリジンなら
 * サイト既定値 (無ければ 100%) で作り直す。
 */
async function resolveState(tabId, url) {
  const origin = originOf(url);
  const current = await readSession(tabId);
  if (current && current.origin === origin) return current;

  const defaults = await getDefaults();
  const volume =
    origin && Object.prototype.hasOwnProperty.call(defaults, origin) ? defaults[origin] : 1;
  const state = { origin, volume, muted: false };
  await writeSession(tabId, state);
  return state;
}

async function updateBadge(tabId, state) {
  const factor = factorOf(state);
  const text = Math.abs(factor - 1) < 1e-6 ? "" : String(Math.round(factor * 100));
  try {
    await browser.action.setBadgeText({ tabId, text });
    await browser.action.setBadgeBackgroundColor({
      tabId,
      color: factor === 0 ? "#b00020" : factor > 1 ? "#c2410c" : "#2563eb"
    });
  } catch (e) {
    /* タブが閉じられた直後など */
  }
}

function pushToTab(tabId, state) {
  // frameId を指定しなければ全フレームに届く (unityroom はゲームが iframe の中)
  return browser.tabs
    .sendMessage(tabId, { type: "tvc:setFactor", factor: factorOf(state) })
    .catch(() => {
      /* content script が居ないページ */
    });
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    // content script (bridge.js) から: 自分のタブの倍率が欲しい
    case "tvc:getFactor": {
      const tab = sender.tab;
      if (!tab) return Promise.resolve(1);
      return resolveState(tab.id, tab.url).then((state) => {
        updateBadge(tab.id, state);
        return factorOf(state);
      });
    }

    // popup から: 表示用の状態一式 (対象タブは popup 側で確定させて渡してくる)
    case "tvc:getState": {
      return (async () => {
        const tab =
          typeof msg.tabId === "number"
            ? await browser.tabs.get(msg.tabId).catch(() => null)
            : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab) return null;
        const state = await resolveState(tab.id, tab.url);
        const defaults = await getDefaults();
        return {
          tabId: tab.id,
          origin: state.origin,
          volume: state.volume,
          muted: state.muted,
          savedDefault:
            state.origin && Object.prototype.hasOwnProperty.call(defaults, state.origin)
              ? defaults[state.origin]
              : null
        };
      })();
    }

    // popup から: 音量/ミュートの変更
    case "tvc:setState": {
      return (async () => {
        const tabId = msg.tabId;
        const tab = await browser.tabs.get(tabId);
        const state = await resolveState(tabId, tab.url);
        if (typeof msg.volume === "number") {
          state.volume = Math.max(0, Math.min(2, msg.volume));
        }
        if (typeof msg.muted === "boolean") {
          state.muted = msg.muted;
        }
        await writeSession(tabId, state);
        await Promise.all([pushToTab(tabId, state), updateBadge(tabId, state)]);
        return { volume: state.volume, muted: state.muted };
      })();
    }

    // popup から: このサイトの既定値を保存 / 削除
    case "tvc:saveDefault":
    case "tvc:clearDefault": {
      return (async () => {
        const defaults = await getDefaults();
        if (!msg.origin) return null;
        if (msg.type === "tvc:saveDefault") {
          defaults[msg.origin] = Math.max(0, Math.min(2, Number(msg.volume) || 0));
        } else {
          delete defaults[msg.origin];
        }
        await browser.storage.local.set({ [DEFAULTS_KEY]: defaults });
        return Object.prototype.hasOwnProperty.call(defaults, msg.origin)
          ? defaults[msg.origin]
          : null;
      })();
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  browser.storage.session.remove(SESSION_PREFIX + tabId).catch(() => {});
});

// 別オリジンに移動したらサイト既定値を読み直す
browser.tabs.onUpdated.addListener(
  async (tabId, changeInfo) => {
    if (!changeInfo.url) return;
    const state = await resolveState(tabId, changeInfo.url);
    await updateBadge(tabId, state);
    await pushToTab(tabId, state);
  },
  { properties: ["url"] }
);
