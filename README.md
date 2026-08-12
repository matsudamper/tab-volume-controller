# Tab Volume Controller

タブごとに音量を 0〜200% で調整する Firefox 拡張機能
Web Audio API を直接使うページ (unityroom などの Unity WebGL ゲーム) にも効きます。

<img width="381" height="195" alt="image" src="https://github.com/user-attachments/assets/766d9172-b1f5-4c15-95a8-42d0b35341a4" />

## 特徴

- タブ単位の音量調整 (0〜200%)。ミュート、100% 超の増幅に対応
- `<video>` / `<audio>` にも対応。ページ側の音量操作と共存する
- サイト (オリジン) ごとの既定音量を保存できる
- iframe 内のコンテンツにも適用される


## 使い方

ツールバーのアイコンからスライダーを動かすだけです。100% 以外のときはアイコンに
バッジで数値が出ます。

- **ミュート** — 音量設定を保ったまま一時的に 0 にします
- **既定値に保存** — そのオリジンで新しくタブを開いたときの初期音量になります
- 音量はタブごとで、タブを閉じると忘れます (サイト既定値は残ります)

権限を後から許可した場合は、ページを再読み込みしてください。コンテンツスクリプトは
`document_start` で入る必要があるため、既存のタブには効きません。

## 仕組み

Firefox には「タブの音量」を変える API がないため、ページの JavaScript と同じ世界
(`world: "MAIN"` のコンテンツスクリプト) で音の出口に割り込みます。

**Web Audio** — `AudioNode.prototype.connect` を差し替え、`AudioContext.destination`
への接続をすべてマスター `GainNode` 経由に付け替えます。Unity WebGL は音を destination
へ直結するため、これで全ての音が対象になります。`MediaStreamAudioDestinationNode` と
`OfflineAudioContext` は対象外です (WebRTC のマイク送出などに影響させないため)。

**メディア要素** — `HTMLMediaElement.prototype.volume` を差し替え、実効音量を
「ページが設定した音量 × 拡張の倍率」にします。これによりページ側が音量を操作しても
壊れません。100% を超える指定のときだけ `MediaElementAudioSourceNode` に迂回させます。

音量の値は background (`storage.session`) が持ち、`bridge.js` (ISOLATED world) が
`CustomEvent` で MAIN world へ渡します。

## 既知の制限

- CORS 未対応のクロスオリジンメディアを 100% 超にすると無音になることがあります。
  Web Audio に取り込めないためです。100% 以下に戻してタブを再読み込みしてください
- ページ側が既に `createMediaElementSource()` を呼んでいる要素 (EQ やビジュアライザ付きの
  プレイヤー等) は 100% 超にできません。重ねて取り込むとページ側の音声グラフを壊すため、
  意図的に諦めています。100% 以下は通常どおり効きます
- DRM 保護コンテンツの増幅はできません
- `about:` や `addons.mozilla.org` などの特権ページでは動作しません
- Firefox for Android では未検証です

## 開発

```sh
npx web-ext lint    # manifest とコードの検証
npx web-ext run     # 一時プロファイルの Firefox で起動
npx web-ext build   # 配布用 zip を作成
```

| ファイル | 役割 |
| --- | --- |
| `manifest.json` | MV3 マニフェスト |
| `page-patch.js` | MAIN world。Web Audio / メディア要素への割り込み |
| `bridge.js` | ISOLATED world。background ↔ ページ の橋渡し |
| `background.js` | タブごとの状態管理、サイト既定値、バッジ |
| `popup/` | ポップアップ UI |
