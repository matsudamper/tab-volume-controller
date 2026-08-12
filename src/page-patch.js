/*
 * ページの JS と同じ世界 (MAIN world) で動く音量パッチ。
 *
 * - Web Audio: AudioNode.prototype.connect を差し替えて、
 *   AudioContext.destination への接続をすべてマスター GainNode 経由にする。
 *   Unity WebGL (unityroom) は destination に直結するのでこれで捕まえられる。
 * - <video> / <audio>: HTMLMediaElement.prototype.volume を差し替えて
 *   「ページが指定した音量 × 拡張の倍率」を実効値にする。
 *   100% を超える指定のときだけ MediaElementSource で Web Audio 側に迂回させる。
 */
(() => {
  "use strict";

  const EV_SET = "__tvc_set__";
  const EV_READY = "__tvc_ready__";

  if (window.__tvcInstalled) return;
  window.__tvcInstalled = true;

  /** 現在の倍率。1 = 100%。bridge.js から通知されるまでは等倍。 */
  let factor = 1;

  /* ------------------------------------------------------------------ */
  /* Web Audio                                                           */
  /* ------------------------------------------------------------------ */

  const AudioNodeProto = window.AudioNode && window.AudioNode.prototype;
  const nativeConnect = AudioNodeProto && AudioNodeProto.connect;
  const nativeDisconnect = AudioNodeProto && AudioNodeProto.disconnect;

  /** AudioContext -> マスター GainNode */
  const gainByCtx = new WeakMap();
  /**
   * 倍率変更時に走査するためのリスト。
   * 強参照で持つと AudioContext を使い捨てるページで context が解放されず、
   * 作成数の上限に当たってしまうので WeakRef で持つ。
   * gain は gainByCtx の値として context が生きている間だけ保持される。
   */
  const gains = new Set();

  function forEachGain(fn) {
    for (const ref of gains) {
      const g = ref.deref();
      if (!g) gains.delete(ref);
      else fn(g);
    }
  }

  function setGainValue(g, value) {
    try {
      const now = g.context.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(value, now + 0.03);
    } catch (e) {
      try {
        g.gain.value = value;
      } catch (e2) {
        /* 諦める */
      }
    }
  }

  function masterGain(ctx) {
    let g = gainByCtx.get(ctx);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = factor;
      // ここで patch 済みの connect を呼ぶと無限再帰するので native を使う
      nativeConnect.call(g, ctx.destination);
      gainByCtx.set(ctx, g);
      gains.add(new WeakRef(g));
    }
    return g;
  }

  function isLiveDestination(node) {
    if (!window.AudioDestinationNode || !(node instanceof window.AudioDestinationNode)) {
      return false;
    }
    // OfflineAudioContext はスピーカーに出ないので触らない
    if (window.OfflineAudioContext && node.context instanceof window.OfflineAudioContext) {
      return false;
    }
    return true;
  }

  if (nativeConnect && nativeDisconnect) {
    AudioNodeProto.connect = function connect(destination) {
      try {
        if (isLiveDestination(destination)) {
          const g = masterGain(destination.context);
          if (this !== g) {
            const args = Array.prototype.slice.call(arguments);
            args[0] = g;
            nativeConnect.apply(this, args);
            // 返り値は必ず本物の destination にする。gain を返すと
            // node.connect(ctx.destination).disconnect() のようなコードで
            // gain→destination が切られ、ページが無音になる。
            return destination;
          }
        }
      } catch (e) {
        /* 何かあっても素通しにする */
      }
      return nativeConnect.apply(this, arguments);
    };

    AudioNodeProto.disconnect = function disconnect(destination) {
      try {
        if (arguments.length > 0 && isLiveDestination(destination)) {
          const g = gainByCtx.get(destination.context);
          if (g && this !== g) {
            const args = Array.prototype.slice.call(arguments);
            args[0] = g;
            return nativeDisconnect.apply(this, args);
          }
        }
      } catch (e) {
        /* 何かあっても素通しにする */
      }
      return nativeDisconnect.apply(this, arguments);
    };
  }

  /* ------------------------------------------------------------------ */
  /* <video> / <audio>                                                   */
  /* ------------------------------------------------------------------ */

  const MediaProto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
  const volDesc = MediaProto && Object.getOwnPropertyDescriptor(MediaProto, "volume");

  /** 要素 -> ページ自身が設定した音量 (0..1) */
  const pageVolume = new WeakMap();
  /** 要素 -> MediaElementAudioSourceNode (迂回済み) */
  const routed = new WeakMap();
  /** 迂回に失敗した要素 (二度と試さない) */
  const routeFailed = new WeakSet();
  /** ページ自身が createMediaElementSource() 済みの要素 */
  const pageOwnedMedia = new WeakSet();
  /** 見つけた要素の WeakRef 集合 */
  const tracked = new Set();

  let sharedCtx = null;
  let creatingOwnSource = false;

  // ページが自分で要素を Web Audio に取り込んでいる場合 (EQ・ビジュアライザ等)、
  // こちらが重ねて createMediaElementSource() を呼ぶと音を横取りして
  // ページ側のグラフを壊すおそれがある。誰が確保したかを覚えておく。
  const AudioCtxProto = window.AudioContext && window.AudioContext.prototype;
  const nativeCreateMES = AudioCtxProto && AudioCtxProto.createMediaElementSource;
  if (nativeCreateMES) {
    AudioCtxProto.createMediaElementSource = function (element) {
      if (!creatingOwnSource) {
        try {
          pageOwnedMedia.add(element);
        } catch (e) {
          /* 要素以外が渡された場合はネイティブに任せる */
        }
      }
      return nativeCreateMES.apply(this, arguments);
    };
  }

  function getSharedCtx() {
    if (!sharedCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      sharedCtx = new Ctor();
    }
    if (sharedCtx.state === "suspended") {
      try {
        sharedCtx.resume();
      } catch (e) {
        /* ユーザー操作待ち */
      }
    }
    return sharedCtx;
  }

  function track(el) {
    for (const ref of tracked) {
      const v = ref.deref();
      if (!v) tracked.delete(ref);
      else if (v === el) return;
    }
    tracked.add(new WeakRef(el));
  }

  function getPageVolume(el) {
    // 初回はネイティブ値をそのまま「ページが意図した音量」として覚える。
    // 覚えずに毎回ネイティブ値を読むと、倍率を掛けた結果をさらに掛けてしまう。
    if (!pageVolume.has(el)) pageVolume.set(el, volDesc.get.call(el));
    return pageVolume.get(el);
  }

  /** 100% 超のために Web Audio 経由へ迂回させる。成功したら true。 */
  function ensureRouted(el) {
    if (routed.has(el)) return true;
    if (routeFailed.has(el)) return false;
    if (pageOwnedMedia.has(el)) {
      // ページのグラフを壊さない方を優先する (100% 超は諦める)
      routeFailed.add(el);
      return false;
    }
    const ctx = getSharedCtx();
    if (!ctx) {
      routeFailed.add(el);
      return false;
    }
    creatingOwnSource = true;
    try {
      const src = ctx.createMediaElementSource(el);
      // patch 済み connect なのでマスター GainNode を通る
      src.connect(ctx.destination);
      routed.set(el, src);
      return true;
    } catch (e) {
      routeFailed.add(el);
      return false;
    } finally {
      creatingOwnSource = false;
    }
  }

  function applyMedia(el) {
    if (!volDesc) return;
    const pv = getPageVolume(el);
    try {
      if (factor > 1 && !routed.has(el)) ensureRouted(el);
      if (routed.has(el)) {
        // 倍率はマスター GainNode 側で掛かる
        volDesc.set.call(el, clamp01(pv));
      } else {
        volDesc.set.call(el, clamp01(pv * factor));
      }
    } catch (e) {
      /* 無視 */
    }
  }

  function clamp01(v) {
    if (!isFinite(v)) return 1;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function applyAllMedia() {
    for (const ref of tracked) {
      const el = ref.deref();
      if (!el) tracked.delete(ref);
      else applyMedia(el);
    }
    try {
      const list = document.querySelectorAll("video, audio");
      for (let i = 0; i < list.length; i++) {
        track(list[i]);
        applyMedia(list[i]);
      }
    } catch (e) {
      /* document 未構築など */
    }
  }

  if (volDesc && volDesc.get && volDesc.set) {
    Object.defineProperty(MediaProto, "volume", {
      configurable: true,
      enumerable: volDesc.enumerable,
      get: function () {
        return getPageVolume(this);
      },
      set: function (value) {
        const v = Number(value);
        if (!(v >= 0 && v <= 1)) {
          // 範囲外はネイティブに投げさせて挙動を合わせる
          volDesc.set.call(this, value);
          return;
        }
        pageVolume.set(this, v);
        track(this);
        applyMedia(this);
      }
    });

    const notice = (e) => {
      const el = e.target;
      if (el instanceof window.HTMLMediaElement) {
        track(el);
        applyMedia(el);
      }
    };
    document.addEventListener("play", notice, true);
    document.addEventListener("loadedmetadata", notice, true);
    document.addEventListener("canplay", notice, true);
  }

  /* ------------------------------------------------------------------ */
  /* 倍率の受け取り                                                       */
  /* ------------------------------------------------------------------ */

  function setFactor(value) {
    let f = Number(value);
    if (!isFinite(f) || f < 0) f = 1;
    if (f === factor) return;
    factor = f;
    forEachGain((g) => setGainValue(g, factor));
    applyAllMedia();
  }

  window.addEventListener(EV_SET, (e) => setFactor(e.detail), true);

  // bridge.js に「準備できた、現在値をくれ」と伝える。
  // bridge.js の方が後に実行される場合に備えて次のタスクでも一度投げる。
  window.dispatchEvent(new CustomEvent(EV_READY));
  setTimeout(() => window.dispatchEvent(new CustomEvent(EV_READY)), 0);

  // AudioContext がユーザー操作待ちで止まっているケースの保険
  const resumeAll = () => {
    forEachGain((g) => {
      try {
        if (g.context.state === "suspended") g.context.resume();
      } catch (e) {
        /* 無視 */
      }
    });
  };
  window.addEventListener("pointerdown", resumeAll, true);
  window.addEventListener("keydown", resumeAll, true);
})();
