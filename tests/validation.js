/* 入力バリデーション
   (A) 正常値では計算結果が基準コミットと完全一致すること(退行チェック)
   (B) かつて実際に壊れたケースが再発しないこと(クラッシュ回帰) */
const { TARGET, boot, baseline, sleep, createReporter, $, text } = require('./harness');

const REF = process.env.BASELINE_REF || 'HEAD';

/* 既定値のまま各タブを実行し、出力テキストを集める */
async function snapshot(file) {
  const w = await boot(file, { seed: 20260830 });
  const out = {};
  w.runPK(); await sleep(200); out['パチンコ'] = text($(w, 'pk-out'));
  w.runSL(); await sleep(200); out['スロット'] = text($(w, 'sl-out'));
  w.opBuild(); w.opPull(10); await sleep(200);
  out['オリパ理論値'] = text($(w, 'opOdds'));
  out['オリパ結果'] = text($(w, 'opResult'));
  w.gcBuild(); w.gcPull(10); await sleep(200);
  out['ガチャ理論値'] = text($(w, 'gc-theory'));
  out['ガチャ結果'] = text($(w, 'gcResult'));
  out['ガチャ枚数'] = text($(w, 'gcCounts'));
  return out;
}

(async () => {
  const R = createReporter('入力バリデーション');

  /* --- (A) 退行チェック ------------------------------------------- */
  let base;
  try { base = baseline(REF); }
  catch (e) { R.note(`基準(${REF})を取得できずスキップ: ${e.message}`); }

  if (base) {
    const before = await snapshot(base);
    const after = await snapshot(TARGET);
    let allSame = true;
    for (const k of Object.keys(before)) {
      const same = before[k] === after[k];
      if (!same) allSame = false;
      R.check(`正常値の出力が${REF}と一致: ${k}`, same,
        same ? '' : `before="${before[k].slice(0, 60)}" / after="${after[k].slice(0, 60)}"`);
    }
    R.note(allSame ? '→ 計算結果に退行なし' : '→ ★出力が変化している(意図した変更か要確認)');
  }

  /* --- (B) クラッシュ回帰 ----------------------------------------- */
  {
    /* 総回転数10万: 入力欄の max 属性が許可する上限。
       かつて drawChart の Math.min(0,...all) が20万要素のスプレッドで
       RangeError を投げ、グラフが描画できなくなっていた */
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'pkTrials').value = '100000';
    let threw = null;
    try { w.runPK(); } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    await sleep(700);
    const errs = [...new Set(w.__errs || [])];
    R.check('総回転数10万で例外が出ない(スプレッド由来のスタックオーバーフロー回帰)',
      !threw && errs.length === 0, threw || errs.join(' / ') || '同期・非同期とも例外なし');
    R.check('総回転数10万で結果が表示される', /期待収支|期待値/.test(text($(w, 'pk-out'))));
  }
  {
    /* 極大値でループが暴走しないこと(かつてタブがフリーズしていた) */
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'slG').value = '999999999999999';
    const t0 = Date.now(); let threw = null;
    try { w.runSL(); } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    const ms = Date.now() - t0;
    R.check('スロット総ゲーム数に極大値を入れても即座に完走する', !threw && ms < 5000, `${ms}ms ${threw || ''}`);
  }
  {
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'opTotal').value = '999999999999999';
    const t0 = Date.now(); let threw = null;
    try { w.opBuild(); } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    const ms = Date.now() - t0;
    R.check('オリパ総口数に極大値を入れても即座に完走する', !threw && ms < 5000, `${ms}ms ${threw || ''}`);
    R.check('  同 上限にクランプされてビルドが成功する', /還元率|1\//.test(text($(w, 'opOdds'))));
  }
  {
    /* 表示ヘルパは非有限値を画面に出さない */
    const w = await boot(TARGET, { seed: 1 });
    R.check('yen(NaN) が "—"', w.yen(NaN) === '—', JSON.stringify(w.yen(NaN)));
    R.check('cf(Infinity) が "—"', w.cf(Infinity) === '—', JSON.stringify(w.cf(Infinity)));
    R.check('num(-Infinity) が "—"', w.num(-Infinity) === '—', JSON.stringify(w.num(-Infinity)));
    R.check('pct(NaN) が "—"', w.pct(NaN) === '—', JSON.stringify(w.pct(NaN)));
    R.check('正常値は従来どおり整形される', w.yen(1234) === '¥1,234' && w.pct(52.5) === '52.5%',
      `${w.yen(1234)} / ${w.pct(52.5)}`);
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
