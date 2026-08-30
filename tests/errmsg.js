/* エラーメッセージ
   不正な入力に対して「黙って誤った結果を出さず」、原因と直し方が分かる
   メッセージが表示されることを検証する。
   ※かつては Math.max(1,...) 等で黙って丸められ、大当たり確率が空欄でも
     1/1(毎回転必ず当たる台)として計算結果が出てしまっていた。 */
const { TARGET, boot, sleep, createReporter, $, text } = require('./harness');

const CASES = [
  { name: 'パチンコ: 大当たり確率が空欄', set: { pkProb: '' },      run: (w) => w.runPK(),   out: 'pk-out' },
  { name: 'パチンコ: 回転数/千円が0',     set: { pkSpins1k: '0' },   run: (w) => w.runPK(),   out: 'pk-out' },
  { name: 'パチンコ: 総回転数が0',        set: { pkTrials: '0' },    run: (w) => w.runPK(),   out: 'pk-out' },
  { name: 'スロット(AT): 初当たり確率が空欄', set: { slAtProb: '' },  run: (w) => w.runSL(),   out: 'sl-out' },
  { name: 'スロット(AT): 平均獲得枚数が0',    set: { slAtCoins: '0' }, run: (w) => w.runSL(),   out: 'sl-out' },
  { name: 'スロット(AT): コイン持ちが0',      set: { slAtMochi: '0' }, run: (w) => w.runSL(),   out: 'sl-out' },
  { name: 'オリパ: 総口数が0',            set: { opTotal: '0' },     run: (w) => w.opBuild(), out: 'opOdds' },
  { name: 'オリパ: 1口の価格が0',         set: { opCost: '0' },      run: (w) => w.opBuild(), out: 'opOdds' },
  { name: 'ガチャ: 消費石が0',            set: { gcCost: '0' },      run: (w) => w.gcBuild(), out: 'gc-theory' },
  { name: '設定判別: 総ゲーム数が0',      set: { kkG: '0' },         run: (w) => w.kjCalc(),  out: 'kjOut' },
];

/* 「どう直すか」まで書かれているか(単なる『計算できません』で終わっていないか) */
const ACTIONABLE = /入力してください|見直してください|減らしてください|超えています/;

(async () => {
  const R = createReporter('エラーメッセージ(不正入力10ケース)');

  for (const c of CASES) {
    const w = await boot(TARGET, { seed: 99 });
    for (const [k, v] of Object.entries(c.set)) { const el = $(w, k); if (el) el.value = v; }
    let threw = null;
    try { c.run(w); } catch (e) { threw = e.message; }
    await sleep(150);

    const box = $(w, c.out);
    const t = text(box);
    const hasErrBox = !!(box && (box.querySelector('.err-box') || box.querySelector('.warn')));
    /* 結果が漏れていないか: 数値表示や危険度バッジが出ていないこと。
       エラー文自身に「還元率」等の語が含まれるため、文字列一致ではなく
       要素の有無で判定する(以前これで誤検知した) */
    const leaked = !!(box && (box.querySelector('.pct-big') || box.querySelector('.danger') || box.querySelector('.verdict')));

    R.check(c.name, !threw && hasErrBox && !leaked && ACTIONABLE.test(t),
      threw ? '例外: ' + threw : (leaked ? '★結果が表示されている(黙って誤答)' : t.slice(0, 80)));
  }

  /* 引くエリアが隠れる(不正設定のまま操作させない) */
  {
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'opCost').value = '0';
    w.opBuild(); await sleep(100);
    R.check('オリパ: 設定が不正なら引くエリアが隠れる', $(w, 'opPlay').style.display === 'none');
  }
  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
