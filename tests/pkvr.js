/* 仮想ラッシュモード(パチンコ)
   通常時を挟まず「RUSHに入った状態」だけを試行するモード。
   乱数を使うため、確率論から導ける理論値と突き合わせて正しさを見る。 */
const { TARGET, boot, sleep, createReporter, $, text } = require('./harness');

const n = (s) => parseFloat(String(s).replace(/,/g, ''));
const readStat = (w, label) => {
  const m = text($(w, 'pkVrOut')).match(new RegExp(label + '\\s*([\\d.,]+)'));
  return m ? n(m[1]) : NaN;
};

(async () => {
  const R = createReporter('仮想ラッシュモード');

  /* --- モード切替 --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.pkSetMode('v');
    R.check('専用カードが表示される', $(w, 'pkVr').style.display !== 'none');
    R.check('スペック入力(.pk-spec)が隠れる',
      [...w.document.querySelectorAll('#panel-pk .pk-spec')].every((e) => e.style.display === 'none'));
    R.check('既存2モードの出力が隠れる',
      $(w, 'pk-out').style.display === 'none' && $(w, 'pkFun').style.display === 'none');
    /* 既存モードへ戻せること(モードが3状態でも壊れない) */
    w.pkSetMode('g');
    R.check('ガチ理論値モードへ戻せる',
      $(w, 'pk-out').style.display !== 'none' && $(w, 'pkVr').style.display === 'none'
      && [...w.document.querySelectorAll('#panel-pk .pk-spec')].every((e) => e.style.display !== 'none'));
    w.pkSetMode('f');
    R.check('投資金額モードへも切り替わる',
      $(w, 'pkFun').style.display !== 'none' && $(w, 'pkVr').style.display === 'none');
  }

  /* --- 統計的な正しさ(★次回なし) ---
     継続率 c のとき平均連チャン = 1/(1-c)。出玉は 平均連チャン × 1連あたり期待出玉 */
  {
    const w = await boot(TARGET, { seed: 20260831 });
    w.pkSetMode('v');
    $(w, 'pkVrCont').value = '80';
    $(w, 'pkVrTrials').value = '30000';
    w.runPkVr(); await sleep(400);
    const avgChain = readStat(w, '平均連チャン数');
    const avgBalls = readStat(w, '平均出玉');
    const perChain = 1500 * 0.3 + 3000 * 0.4 + 7000 * 0.3;   // 既定の振り分け = 3750玉
    R.check('平均連チャンが理論値5連に一致', Math.abs(avgChain - 5) < 0.15, `${avgChain}連`);
    R.check('平均出玉が理論値に一致', Math.abs(avgBalls - 5 * perChain) / (5 * perChain) < 0.05,
      `実測${avgBalls}玉 / 理論${5 * perChain}玉`);
    R.check('最大連チャンは平均より大きい', readStat(w, '最大連チャン数') > avgChain);

    /* 明細(このモードで新規に足した表示) */
    const trials = [...$(w, 'pkVrOut').querySelectorAll('.vr-trial')];
    R.check('直近5回の明細が出る', trials.length === 5, trials.length + '件');
    const head = text(trials[0].querySelector('.vr-head'));
    const rows = trials[0].querySelectorAll('.vr-row');
    R.check('明細の行数と「N連で終了」の表記が一致',
      rows.length === parseInt((head.match(/(\d+)連で終了/) || [])[1], 10), head);
    R.check('明細が「何連目・何%枠・出玉」の形式',
      /1連目/.test(text(rows[0])) && /%枠/.test(text(rows[0])) && /玉/.test(text(rows[0])), text(rows[0]));
    const sum = [...rows].reduce((s, r) => s + n(text(r.querySelector('.vr-balls')).replace('玉', '')), 0);
    R.check('明細の内訳の合計が表示合計と一致',
      sum === n((head.match(/合計\s*([\d,]+)玉/) || [])[1]), `内訳計${sum}`);
    R.check('どの試行も1連以上(RUSHに入った状態から始まる)',
      trials.every((t) => t.querySelectorAll('.vr-row').length >= 1));
  }

  /* --- 次回濃厚(★次回) ---
     ★次回枠を引く確率を g とすると、1回あたり継続確率は g+(1-g)c なので
     平均連チャン = 1/((1-g)(1-c)) になるはず */
  {
    const w = await boot(TARGET, { seed: 20260831 });
    w.pkSetMode('v');
    const rows = () => [...w.document.querySelectorAll('#pkVrDistRows .tier-row')];
    R.check('各行に★次回のトグルがある',
      rows().every((r) => !!r.querySelector('.rowflag[data-flag="guaranteed"]')));
    $(w, 'pkVrCont').value = '80';
    $(w, 'pkVrTrials').value = '30000';
    w.runPkVr(); await sleep(400);
    const base = readStat(w, '平均連チャン数');

    rows()[2].querySelector('.rowflag[data-flag="guaranteed"]').classList.add('on'); // 7000玉/30%を★次回に
    w.runPkVr(); await sleep(400);
    const withG = readStat(w, '平均連チャン数');
    const theo = readStat(w, '理論値');
    const expect = 1 / ((1 - 0.3) * (1 - 0.8));   // = 7.143
    R.check('★次回ありで平均連チャンが増える', withG > base + 0.5, `${base}連 → ${withG}連`);
    R.check('表示される理論値が 1/((1-g)(1-継続率)) と一致', Math.abs(theo - expect) < 0.05,
      `表示${theo} / 計算${expect.toFixed(3)}`);
    R.check('実測が理論値に一致', Math.abs(withG - expect) / expect < 0.03, `実測${withG}`);

    /* ★次回を引いた連は最終連になりえない(次が必ず続く) */
    let violation = null, sawG = false;
    [...$(w, 'pkVrOut').querySelectorAll('.vr-trial')].forEach((t) => {
      const rs = [...t.querySelectorAll('.vr-row')];
      rs.forEach((r, i) => {
        if (r.querySelector('.vr-g')) { sawG = true; if (i === rs.length - 1) violation = text(t.querySelector('.vr-head')); }
      });
    });
    R.check('明細に★次回マークが出る', sawG);
    R.check('★次回を引いた連で終了していない', !violation, violation || '違反なし');
  }

  /* --- 「全枠★次回」= RUSHが永久に終わらない設定 ---
     継続判定が毎回スキップされるため、以前は無限ループでブラウザが固まった。
     設定自体が破綻しているので、計算を走らせる前にエラーで止めるのが正解。
     (最後の砦として PK_CHAIN_MAX の打ち切りも入れてある) */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.pkSetMode('v');
    w.document.querySelectorAll('#pkVrDistRows .tier-row').forEach((r) =>
      r.querySelector('.rowflag[data-flag="guaranteed"]').classList.add('on'));
    const t0 = Date.now(); let threw = null;
    try { w.runPkVr(); } catch (e) { threw = e.message; }
    const ms = Date.now() - t0;
    R.check('仮想ラッシュ: 全枠★次回はエラーで止まる(計算を走らせない)',
      !threw && !!$(w, 'pkVrOut').querySelector('.err-box') && ms < 3000,
      (threw || text($(w, 'pkVrOut')).slice(0, 50)) + ` / ${ms}ms`);
  }
  {
    const w = await boot(TARGET, { seed: 1 });
    w.addPkRushDist(1500, 100);
    w.document.querySelector('#pkRushDistRows .tier-row .rowflag[data-flag="guaranteed"]').classList.add('on');
    $(w, 'pkTrials').value = '500';
    const t0 = Date.now(); let threw = null;
    try { w.runPK(); } catch (e) { threw = e.message; }
    const ms = Date.now() - t0;
    R.check('ガチ理論値モード: RUSH全枠★次回もエラーで止まる(以前は固まった)',
      !threw && !!$(w, 'pk-out').querySelector('.err-box') && ms < 3000,
      (threw || text($(w, 'pk-out')).slice(0, 50)) + ` / ${ms}ms`);
  }

  /* --- 入力エラー --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.pkSetMode('v');
    $(w, 'pkVrCont').value = '100';        // 100%は終わらないので弾く
    w.runPkVr(); await sleep(120);
    R.check('継続率100%はエラーになる', !!$(w, 'pkVrOut').querySelector('.err-box'),
      text($(w, 'pkVrOut')).slice(0, 60));
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
