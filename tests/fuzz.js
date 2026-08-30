/* 異常値ファザー
   全タブの数値入力へ異常値を流し込み、出力に NaN / Infinity / undefined /
   例外が出ないことを検査する。項目1で3件の実バグを検出した中核テスト。 */
const { TARGET, boot, sleep, createReporter, $ } = require('./harness');

const HOSTILE = {
  '空欄': '', '0': '0', 'マイナス': '-1', '巨大マイナス': '-999999999',
  '極小の小数': '0.0000001', 'Infinity': '1e400', '極大': '999999999999999', '小数': '3.7',
};

const PANEL_INPUTS = {
  pk: ['pkProb','pkSpins1k','pkTrials','pkHeso','pkEnter','pkCont','pkFallHit','pkFallDrop','pkLtP','pkLtCont','pkLtDownP','pkJtSpins','pkJtN'],
  sl: ['slAtProb','slAtCoins','slAtModoshi','slAtMochi','slAtJunzo','slAtG2','slBig','slReg','slBigC','slRegC','slAMochi','slG','slYen','slYRuns'],
  op: ['opTotal','opCost','opFloor','opYenPerCoin','opRemainIn','opGuarN'],
  gc: ['gcCost','gcPity','gcYenPerStone'],
  hk: ['kkG'],
};

const BAD = /NaN|Infinity|∞|undefined/;

function scan(el) {
  if (!el) return null;
  const t = el.textContent || '';
  const hits = [];
  if (/NaN/.test(t)) hits.push('NaN');
  if (/Infinity|∞/.test(t)) hits.push('Infinity');
  if (/undefined/.test(t)) hits.push('undefined');
  return hits.length ? [...new Set(hits)] : null;
}
function sample(el) {
  const t = (el.textContent || '').replace(/\s+/g, ' ');
  const i = t.search(BAD);
  return i < 0 ? '' : '…' + t.slice(Math.max(0, i - 40), i + 30) + '…';
}

(async () => {
  const R = createReporter('異常値ファザー(8種の異常値 × 5タブ)');
  let problems = 0;

  for (const [label, val] of Object.entries(HOSTILE)) {
    for (const [tabKey, ids] of Object.entries(PANEL_INPUTS)) {
      const w = await boot(TARGET, { seed: 4242 });
      ids.forEach((id) => { const el = $(w, id); if (el) el.value = val; });

      const checks = [];
      let threw = null;
      try {
        if (tabKey === 'pk') { w.runPK(); checks.push(['pk-out', $(w, 'pk-out')]); }
        if (tabKey === 'sl') { w.runSL(); checks.push(['sl-out', $(w, 'sl-out')]); }
        if (tabKey === 'op') {
          w.opBuild(); checks.push(['opOdds', $(w, 'opOdds')]);
          w.opPull(10); checks.push(['opResult', $(w, 'opResult')], ['opRemain', $(w, 'opRemain')]);
        }
        if (tabKey === 'gc') {
          w.gcBuild(); checks.push(['gc-theory', $(w, 'gc-theory')]);
          w.gcPull(10); checks.push(['gcResult', $(w, 'gcResult')], ['gcCounts', $(w, 'gcCounts')]);
        }
        if (tabKey === 'hk') {
          w.kkAdd('big'); w.kkAdd('reg'); w.kkRender();
          checks.push(['kkSummary', $(w, 'kkSummary')]);
          const el = $(w, 'kj0_0'); if (el) el.value = '300';
          w.kjCalc(); checks.push(['kjOut', $(w, 'kjOut')]);
        }
      } catch (e) { threw = e.constructor.name + ': ' + e.message; }
      await sleep(120);

      if (threw) { problems++; R.check(`[${label}] ${tabKey}: 例外が出ない`, false, threw); continue; }
      for (const [name, el] of checks) {
        const hits = scan(el);
        if (hits) { problems++; R.check(`[${label}] ${tabKey}/${name}`, false, hits.join(',') + ' ' + sample(el)); }
      }
      const errs = [...new Set(w.__errs || [])];
      if (errs.length) { problems++; R.check(`[${label}] ${tabKey}: 非同期例外が出ない`, false, errs.join(' / ')); }
    }
  }

  R.check('全組み合わせで NaN/Infinity/undefined/例外なし', problems === 0,
    problems === 0 ? '40通りすべてクリーン' : `${problems}件の問題`);
  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
