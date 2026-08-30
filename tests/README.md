# 期待値ラボ — 開発用テスト

`ev-lab.html` の回帰テスト。**開発用の資産であり、配布物には含まれない**
(`ev-lab.html` 単体で完結する構成は変わらない)。

## 使い方

```bash
cd tests
npm install        # 初回のみ(jsdom を入れる)
npm test           # 全スイート実行(約1分)
npm run fuzz       # 個別実行。他も同様(validation / errmsg / undo / injection / ui / perf)
```

1件でも失敗すると終了コードが 1 になるので、CI に載せる場合もそのまま使える。

## 仕組み

`ev-lab.html` は単一HTMLでモジュールを持たないため、jsdom に実ページを読み込ませ、
`window` 経由で関数を直接叩いて検証する。ブラウザ固有API(canvas / AudioContext /
requestAnimationFrame / matchMedia)のスタブは `harness.js` に集約してある。

`validation.js` は「現在の `ev-lab.html`」と「基準コミットの `ev-lab.html`」の出力を
比較する。基準は既定で `HEAD`。変更前と比べたいときは:

```bash
BASELINE_REF=HEAD~1 npm run validation
```

## スイート一覧

| スイート | 内容 |
| --- | --- |
| `validation` | 正常値の出力が基準コミットと完全一致するか(退行チェック)。加えて、過去に実際に壊れたケース(総回転数10万でのグラフのスタックオーバーフロー、極大値でのループ暴走、非有限値の画面表示)の回帰確認 |
| `errmsg` | 不正入力に対して黙って誤答せず、原因と直し方が分かるメッセージが出るか |
| `undo` | 破壊的操作の確認モーダル、キャンセル時のデータ保持、「元に戻す」での完全復元 |
| `injection` | 自由入力・保存データ由来の文字列が innerHTML でHTMLとして解釈されないか |
| `ui` | 折りたたみの head/body 同期と初期状態、verdict のKPIカード構成、統計ヒーローの描画 |
| `perf` | 記録・履歴が増えても描画量が頭打ちになるか(件数に比例しないこと) |
| `fuzz` | 8種の異常値 × 5タブを総当たりし、NaN / Infinity / undefined / 例外が出ないか |

## 書くときの注意(過去にはまった点)

- **`Math.random` は `beforeParse` 内で `window.Math.random` を差し替える。**
  Node側のトップレベルで差し替えても、ページのスクリプトは別レルムの `Math` を見るため効かない。
  `harness.js` の `boot({seed})` がこれを行う。
- **背景パーティクル(常時 rAF ループ)を止めてから比較する。**
  止めないと無関係な `Math.random()` 消費で決定論的比較が壊れる。`boot()` が既定で止める。
- **演出を同期完了させたいときは `reduceMotion: true`(既定)。** `FX='off'` 相当になる。
  演出ONの挙動を見たいときだけ `false` にし、待機時間を十分に取る。
- **jsdom では実レイアウトが計算されない。** `offsetParent` は常に null、CSS トランジションも
  進まない。表示の見た目に依存する検証は実ブラウザで行うこと
  (UNDOバーが非表示タブで出ない不具合は jsdom では検出できなかった)。
- **DOM要素の有無で判定する。** 注入テストは「文字列が含まれるか」ではなく
  「その要素が生成されたか」で見る。エラーメッセージ検証も、文言の部分一致だと
  エラー文自身に含まれる語を誤検知する(実際に一度誤検知した)。
- **性能は絶対時間ではなく DOM要素数で判定する。** 実行環境で揺れるため。
