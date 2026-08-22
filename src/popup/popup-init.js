"use strict";

// パネル幅だけでレイアウトを決める（Android 等の OS 判定は使わない）
window.applyPopupLayout = function applyPopupLayout() {
  const hostWidth = window.innerWidth;
  const fillPanel = hostWidth >= 250;
  const touchUI = hostWidth <= 480;

  document.body.classList.toggle("popup-panel", fillPanel);
  document.documentElement.classList.toggle("mobile", touchUI);

  if (fillPanel && touchUI && !document.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    document.head.appendChild(viewport);
  }
};

applyPopupLayout();
