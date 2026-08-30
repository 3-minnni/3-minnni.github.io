/* HTML注入(XSS)
   自由入力・保存データ由来の文字列が innerHTML でHTMLとして解釈されないこと。
   ペイロードが解釈されると id 付きの要素が生成されるので、その有無で判定する
   (jsdom/実ブラウザのどちらでも同じ基準で判定できる)。 */
const { TARGET, boot, sleep, createReporter, $, modalYes } = require('./harness');

const PAY = '<img id="xss-probe" src=x>';

(async () => {
  const R = createReporter('HTML注入(ユーザー入力・保存データ)');
  const probe = (w, label) => {
    const injected = w.document.getElementById('xss-probe');
    R.check(label, injected === null, injected ? '★HTMLとして解釈された(要素が生成)' : '文字列として表示');
  };

  /* 1) オリパ: 等級名 */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.document.querySelectorAll('#opTiers .tier-row').forEach((r) => { r.querySelectorAll('input')[0].value = PAY; });
    w.opBuild(); w.opPull(100); await sleep(200);
    probe(w, 'オリパ: 等級名(理論値・残り口数・当選履歴・結果バナー・凡例)');
    R.check('  同 文字列として画面に出ている', /img id="xss-probe"/.test($(w, 'opOdds').textContent));
  }
  /* 2) ガチャ: レア度名 */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.document.querySelectorAll('#gcTiers .tier-row').forEach((r) => { r.querySelectorAll('input')[0].value = PAY; });
    w.gcBuild(); w.gcPull(100); await sleep(200);
    probe(w, 'ガチャ: レア度名(理論値・枚数・結果バナー・凡例)');
  }
  /* 3) カスタム抽選: 親と子の項目名 */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.document.querySelectorAll('#ltRows .tier-row').forEach((r) => { r.querySelectorAll('input')[0].value = PAY; });
    const blk = w.document.querySelector('.lt-item-block');
    w.ltToggleChildren(blk.querySelector('.lt-toggle'));
    const cr = blk.querySelector('.lt-child-row');
    if (cr) { cr.querySelectorAll('input')[0].value = PAY; w.ltChildPct(blk.querySelector('.lt-children')); }
    w.ltBuild(); w.ltSpin(); await sleep(700);
    probe(w, 'カスタム抽選: 項目名・子項目名(比率バーのtitle属性・履歴)');
  }
  /* 4) 統計: 種別・メモ(バックアップJSONのインポート由来を想定) */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.rsSave([{ d: '2026-08-30', g: PAY, inv: 1000, ret: 2000, hours: 1, memo: PAY }]);
    w.rsRender(); await sleep(150);
    probe(w, '統計: 日付・種別・メモ(種別別サマリー・一覧表)');
  }
  /* 5) シミュ統計: カテゴリ名(同上) */
  {
    const w = await boot(TARGET, { seed: 3 });
    const s = {}; s[PAY] = { n: 3, inv: 1000, net: 500 };
    w.stSave(s); w.stRender(); await sleep(150);
    probe(w, 'シミュ統計: カテゴリ名');
  }
  /* 6) 保存スペック名 */
  {
    const w = await boot(TARGET, { seed: 3 });
    $(w, 'pname-pk').value = PAY;
    w.presetSave('pk'); modalYes(w); await sleep(150);
    probe(w, '保存スペック名(プリセット一覧)');
  }
  /* 7) 保存データからの復元経由
        ※共有URL機能は2026-08-30に廃止したため、presetRestore で代替検証 */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.presetRestore('op', { ids: {}, rows: { opTiers: [[PAY, '50000', '10', '']] }, extra: {} });
    const inp = w.document.querySelector('#opTiers .tier-row input');
    R.check('保存データ復元: 等級名が入力欄に入る', inp && inp.value === PAY);
    w.opBuild(); w.opPull(50); await sleep(200);
    probe(w, '★保存データ経由の注入がHTML解釈されない');
  }
  /* 8) 通常の日本語名で過剰エスケープが起きていないこと */
  {
    const w = await boot(TARGET, { seed: 3 });
    w.opBuild(); await sleep(120);
    const t = $(w, 'opOdds').textContent;
    R.check('通常の名前が &amp; 等に化けていない', !/&(amp|lt|gt|quot|#39);/.test(t));
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
