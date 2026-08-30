/* パフォーマンス(描画量の上限)
   記録・履歴が増え続けても描画コストが一定に保たれることを検証する。
   ※かつてリアル統計の一覧表だけが件数に比例して悪化し、localStorageに
     永続するため使うほど重くなっていた(1000件でDOM 9000要素超)。
   閾値は「件数に比例して増えないこと」を見るためのもので、絶対時間ではなく
   DOM要素数で判定する(実行環境による揺れを避けるため)。 */
const { TARGET, boot, sleep, createReporter, $ } = require('./harness');

const mkRecords = (n) => {
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push({ d: '2026-01-' + String(1 + (i % 28)).padStart(2, '0'), g: 'パチンコ',
             inv: 20000, ret: 15000 + i, hours: 4, memo: 'メモ' + i });
  }
  return a;
};

(async () => {
  const R = createReporter('パフォーマンス(描画量の上限)');

  /* リアル統計の一覧表: 件数が増えてもDOM量が頭打ちになること */
  {
    const w = await boot(TARGET, { seed: 1 });
    const counts = {};
    for (const n of [50, 200, 1000, 3000]) {
      w.rsSave(mkRecords(n));
      w.rsRender(); await sleep(50);
      counts[n] = w.document.querySelectorAll('#rsTable *').length;
    }
    R.note('記録件数ごとの一覧表DOM要素数: ' + JSON.stringify(counts));
    R.check('一覧表のDOM量が件数に比例しない(1000件と3000件が同じ)', counts[1000] === counts[3000],
      `1000件=${counts[1000]} / 3000件=${counts[3000]}`);
    R.check('一覧表のDOM量が上限内に収まる', counts[3000] < 1500, `3000件で${counts[3000]}要素`);

    /* 集計は全件のまま(表示を間引いても数値の正確性は変わらない) */
    w.rsSave(mkRecords(1000)); w.rsRender(); await sleep(50);
    const rows = w.document.querySelectorAll('#rsTable tbody tr').length;
    R.check('表示行は上限まで(既定100件)', rows === 100, '行数=' + rows);
    R.check('集計は全件で計算されている', /1000戦/.test($(w, 'rsHero').textContent),
      $(w, 'rsHero').textContent.replace(/\s+/g, ' ').slice(0, 40));
    R.check('間引き中である旨が画面に明示される', /全1,000件/.test($(w, 'rsTable').textContent));

    /* 全件表示に切り替えられること */
    w.rsShowAllToggle(); await sleep(80);
    R.check('「全件を表示」で全行が描画される', w.document.querySelectorAll('#rsTable tbody tr').length === 1000);
    w.rsShowAllToggle();
  }

  /* 間引き表示から削除しても正しい1件が消えること(索引ズレの回帰防止) */
  {
    const w = await boot(TARGET, { seed: 1 });
    const recs = mkRecords(300).map((r, i) => ({ ...r, g: '種別' + i }));
    w.rsSave(recs); w.rsRender(); await sleep(50);
    const before = w.rsAll().length;
    const row0 = w.document.querySelectorAll('#rsTable tbody tr')[0];
    const target = row0.querySelectorAll('td')[1].textContent;
    row0.querySelector('.rs-del').click(); await sleep(60);
    const after = w.rsAll();
    R.check('間引き表示から削除しても対象の1件だけが消える',
      after.length === before - 1 && !after.some((x) => x.g === target), `${before}→${after.length}`);
  }

  /* 引いた履歴・当選履歴は200件で頭打ち(元から実装済み。回帰防止) */
  {
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'gcWalletSet').value = '999999999';
    w.gcBuild(); w.gcPull(1000); await sleep(150);
    const logEls = $(w, 'gcLog').querySelectorAll('.pl').length;
    R.check('ガチャ 引いた履歴が200件で頭打ち', logEls <= 200, logEls + '件');
  }

  /* カスタム抽選の履歴カードが上限を超えて積み上がらないこと */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.ltBuild();
    const hist = $(w, 'ltHistory');
    for (let i = 0; i < 260; i++) {
      const c = w.document.createElement('div'); c.className = 'lt-hcard';
      hist.prepend(c);
      while (hist.children.length > 200) hist.removeChild(hist.lastElementChild);
    }
    R.check('カスタム抽選 抽選履歴が200枚で頭打ち', hist.children.length === 200, hist.children.length + '枚');
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
