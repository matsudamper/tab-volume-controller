# tab-volume-controller — リポジトリ固有ルール

## 概要

Firefox 拡張機能 (Manifest V3)。タブごとの音量を Web Audio API / HTMLMediaElement のパッチで制御する。

## ビルド・検証

コマンドは逐次実行する（並列禁止は共通ルール）。

```sh
npx web-ext lint --source-dir=src
npx web-ext build --source-dir=src
```

必要に応じて:

```sh
npx web-ext run --source-dir=src
```

Cloud Agent 環境では `.cursor/install.sh` で Firefox / web-ext が用意される。

PR では CI が `web-ext build` を実行し xpi を成果物として PR にコメントする。

## コード

- JavaScript (`"use strict"`)。Kotlin 共通ルールは該当しない
- ソースは `src/` 配下
  - `background.js` — タブ音量状態、`storage.session` / `storage.local`
  - `page-patch.js` — MAIN world の Web Audio / media パッチ
  - `bridge.js` — ISOLATED world、`CustomEvent` で background と page-patch を接続
  - `popup/` — UI
- manifest のバージョンはリリースフローで bump する。手動で上げない（作業指示がない限り）

## コメント（緩さ）

共通ルールの例外:

- Web Audio / `HTMLMediaElement` パッチの制約、MAIN/ISOLATED world の境界、既知の制限は短い Why コメントを許容する
- 既存のファイル先頭の説明コメントは維持する

## 実装・ドメイン

README の「仕組み」「既知の制限」を正とする。変更時は README も必要なら更新する。

- `AudioNode.prototype.connect` の差し替えで destination 経路に GainNode を挟む
- `MediaStreamAudioDestinationNode` / `OfflineAudioContext` はパッチ対象外
- `HTMLMediaElement.prototype.volume` は実効音量 = ページ音量 × 拡張倍率
- 100% 超は `MediaElementAudioSourceNode` 経由。既に `createMediaElementSource()` 済みの要素は 100% 超不可
- 状態は `storage.session`（MV3 background の idle 停止でメモリ Map は使えない）
- コンテンツスクリプトは `document_start`。権限追加後はタブ再読み込みが必要

## ドキュメント

- `README.md` — 利用者向け（ビルド手順、制限）
- 本ファイル — エージェント向けのリポジトリ固有ルール
