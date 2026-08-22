#!/usr/bin/env bash
# Cloud Agent 用の依存セットアップ。
# - Firefox 本体 (Mozilla 公式 tarball): Ubuntu 24.04 の apt / snap には入っていないため直接取得する
# - Xvfb: web-ext run を GUI 無しの環境で動かすための仮想ディスプレイ
# - web-ext: README 記載の `npx web-ext ...` と同じ経路になるよう npx キャッシュに用意する
# 何度実行しても安全 (冪等) になるように書いている。
set -euo pipefail

FIREFOX_DIR="/opt/firefox"
WEB_EXT_VERSION="10.6.0"

# Xvfb (既に入っていれば apt が即座に返る)
if ! command -v Xvfb >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends xvfb
fi

# Firefox 本体
if [ ! -x "${FIREFOX_DIR}/firefox" ]; then
  tmp="$(mktemp -d)"
  curl -fL -o "${tmp}/firefox.tar.xz" \
    "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
  sudo tar -xf "${tmp}/firefox.tar.xz" -C /opt
  rm -rf "${tmp}"
fi
# web-ext が PATH から自動検出できるように symlink を張る
sudo ln -sf "${FIREFOX_DIR}/firefox" /usr/local/bin/firefox

# web-ext を npx キャッシュへ用意しておく (初回実行時のダウンロード待ちを無くす)
npx --yes "web-ext@${WEB_EXT_VERSION}" --version

echo "セットアップ完了: $(firefox --version), web-ext ${WEB_EXT_VERSION}"
