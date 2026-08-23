"use strict";

window.applyPopupLayout = function applyPopupLayout() {
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
};

applyPopupLayout();
