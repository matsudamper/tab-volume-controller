"use strict";

(function () {
  var android = /Android/i.test(navigator.userAgent);
  if (android) {
    document.documentElement.classList.add("mobile", "android");
    var viewport = document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    document.head.appendChild(viewport);
  } else if (window.matchMedia("(max-device-width: 480px)").matches) {
    document.documentElement.classList.add("mobile");
  }
})();
