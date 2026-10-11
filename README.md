# firefox-extensions

Firefox 拡張をまとめて置くリポジトリ。

拡張は `extensions/<name>/` に置く。ビルドとリリースの GitHub Actions は、そのディレクトリをカレントにして `src/manifest.json` を読む。

## 拡張

- [tab-volume-controller](extensions/tab-volume-controller/README.md) — タブごとに音量を 0〜200% で調整する
