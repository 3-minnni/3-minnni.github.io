#!/usr/bin/env bash
# 期待値ラボ — 現状の点検
#
# 「いま何がどうなっているか」を1コマンドで確認する。
# 作業を再開するとき、まずこれを実行すれば状況が把握できる。
#
#   実行: bash tools/status.sh
#
# 見ているのは3つ。
#   1) 公開サイトが生きているか(全ファイルが200で返るか)
#   2) 手元とGitHubがずれていないか(push漏れ・未コミットの変更)
#   3) 配った版と手元の版が一致しているか(更新が利用者に届いているか)

set -u
SITE="https://3-minnni.github.io"
cd "$(dirname "$0")/.." || exit 1

line() { printf '%s\n' "------------------------------------------------------------"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
ng()   { printf '  \033[31m★NG\033[0m  %s\n' "$1"; }
info() { printf '       %s\n' "$1"; }

echo
echo "期待値ラボ — 現状の点検   $(date '+%Y-%m-%d %H:%M')"
line

# ---------- 1. 公開サイト ----------
echo "公開サイト  $SITE"
FAIL=0
for p in "" "ev-lab.html" "manifest.json" "sw.js" "sitemap.xml" "robots.txt" \
         "icons/icon-192.png" "icons/icon-512.png" "icons/icon-maskable-512.png" \
         "icons/og-1200x630.png"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/$p")
  if [ "$code" = "200" ]; then ok "/$p"; else ng "/$p  → $code"; FAIL=1; fi
done
[ "$FAIL" = "0" ] && info "すべて配信されている" || info "★配信できていないファイルがある"

line
# ---------- 2. 手元とGitHub ----------
echo "リポジトリ"
dirty=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$dirty" = "0" ]; then ok "未コミットの変更なし"
else ng "未コミットの変更が ${dirty} 件"; git status --short | sed 's/^/       /'; fi

git fetch -q origin 2>/dev/null
ahead=$(git rev-list origin/master..master --count 2>/dev/null || echo '?')
behind=$(git rev-list master..origin/master --count 2>/dev/null || echo '?')
if [ "$ahead" = "0" ] && [ "$behind" = "0" ]; then ok "GitHubと同期している"
else ng "未push ${ahead}件 / 未取得 ${behind}件  → git push origin master"; fi
info "コミット数 $(git rev-list --count HEAD) / 最新: $(git log --oneline -1)"

line
# ---------- 3. 配った版と手元の版 ----------
echo "更新が利用者に届いているか"
local_hash=$(grep -o "APP_HASH = '[0-9a-f]*'" sw.js | sed "s/.*'\([0-9a-f]*\)'/\1/")
real_hash=$(python -c "import hashlib;print(hashlib.sha256(open('ev-lab.html','rb').read()).hexdigest()[:12])" 2>/dev/null)
live_sw=$(curl -s --max-time 15 "$SITE/sw.js?cb=$(date +%s)" | grep -o "VERSION = '[^']*'" | sed "s/.*'\(.*\)'/\1/")
local_sw=$(grep -o "VERSION = '[^']*'" sw.js | sed "s/.*'\(.*\)'/\1/")

if [ "$local_hash" = "$real_hash" ]; then ok "sw.js の APP_HASH は最新 ($real_hash)"
else ng "ev-lab.html を変えたのに sw.js を更新していない"
     info "手元=$real_hash / sw.jsの記録=$local_hash"
     info "→ sw.js の VERSION を上げ、APP_HASH を $real_hash に直す"; fi

if [ "$live_sw" = "$local_sw" ]; then ok "公開中の Service Worker は手元と同じ ($live_sw)"
else ng "公開中=$live_sw / 手元=$local_sw  → 反映待ちか push 忘れ"; fi

line
# ---------- 参考情報 ----------
echo "次にやること・確認先"
info "アクセス状況  https://search.google.com/search-console"
info "リポジトリ    https://github.com/3-minnni/3-minnni.github.io"
info "公開ロードマップ  Artifact(CLAUDE.md 参照)"
info ""
info "テスト実行    cd tests && npm test"
info "アイコン再生成 python tools/make-icons.py"
echo
