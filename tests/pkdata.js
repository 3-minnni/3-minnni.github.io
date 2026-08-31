/* パチンコのデータ表示(スランプグラフ・大当り履歴・差玉サマリー)
   市販のデータカウンターアプリの「一目で台の状態が分かる」情報設計を参考にした表示。
   見た目そのものは検証できないので、数値の整合性(差玉・ハマリ・連チャン・出玉)を突き合わせる。 */
const { TARGET, boot, sleep, createReporter, $, text } = require('./harness');

const n = (s) => parseFloat(String(s).replace(/[,+玉回転]/g, ''));
/* 大当り履歴の行を素の数値に戻す。表示は新しい順なので古い順へ直す */
const readHits = (w, boxId) =>
  [...$(w, boxId).querySelectorAll('.pkh-row')].reverse().map((r) => ({
    no: n(text(r.querySelector('.pkh-no'))),
    kind: text(r.querySelector('.pkh-badge')),
    spin: n(text(r.querySelector('.pkh-spin'))),
    hamari: n(text(r.querySelector('.pkh-hamari'))),
    chain: n(text(r.querySelector('.pkh-chain'))),
    balls: n(text(r.querySelector('.pkh-balls'))),
  }));
/* fun はスクリプトスコープの let なので w.fun では読めない。
   グローバル字句環境が見える window.eval 経由で取り出す。 */
const F = (w, expr) => w.eval('fun.' + expr);
const readStat = (w, label) => {
  const m = text($(w, 'funStat')).match(new RegExp(label + ':\\s*([+\\-−]?[\\d,]+)'));
  return m ? parseFloat(m[1].replace(/[,+]/g, '').replace('−', '-')) : NaN;
};

(async () => {
  const R = createReporter('パチンコのデータ表示');

  /* --- 投資金額設定モード: スランプグラフが1回転ごとに記録されること ---
     以前は funPress を呼ぶたびに1点しか積んでおらず、「全額回す」を押すと
     点が1つしか増えずグラフとして成立していなかった。 */
  {
    const w = await boot(TARGET, { seed: 20260831 });
    w.pkSetMode('f');
    $(w, 'pkFunYen').value = '20000';
    w.funStart(); await sleep(60);
    R.check('開始直後の系列は原点のみ', F(w, 'series').length === 1 && F(w, 'series')[0] === 0);

    w.funPress(10000); await sleep(60);
    const spins1 = F(w, 'spins');
    R.check('1回押しただけで回転数ぶんの点が積まれる',
      spins1 > 50 && F(w, 'series').length === spins1 + 1, `${spins1}回転 / ${F(w, 'series').length}点`);

    w.funPress(-1); await sleep(60);
    R.check('全額回した後も回転数と点数が一致',
      F(w, 'series').length === F(w, 'spins') + 1, `${F(w, 'spins')}回転 / ${F(w, 'series').length}点`);

    /* 縦軸は差玉。最終点は (現在の価値 - 開始所持金) / レート と一致するはず */
    const expect = Math.round((F(w, 'cash') + F(w, 'tama') - F(w, 'start')) / 4);
    R.check('系列の末尾が差玉と一致',
      F(w, 'series')[F(w, 'series').length - 1] === expect,
      `系列${F(w, 'series')[F(w, 'series').length - 1]} / 計算${expect}`);
    R.check('サマリーの差玉も同じ値', readStat(w, '差玉') === expect, `${readStat(w, '差玉')}玉`);
    R.check('サマリーに総回転数が出る', readStat(w, '総回転数') === F(w, 'spins'));
    R.check('現在ハマリ = 総回転数 - 最後の大当り回転数',
      readStat(w, '現在ハマリ') === F(w, 'spins') - F(w, 'lastHitSpin'));
  }

  /* --- 大当り履歴の中身が計算結果と整合しているか --- */
  {
    const w = await boot(TARGET, { seed: 7 });
    w.pkSetMode('f');
    $(w, 'pkFunYen').value = '50000';
    w.funStart(); await sleep(60);
    w.funPress(-1); await sleep(120);

    const rows = readHits(w, 'funHits');
    const rec = F(w, 'hitsRec');
    R.check('大当りが1回以上起きている', rec.length > 0, rec.length + '回');
    R.check('履歴の行数が記録数と一致(200件以下)',
      rows.length === Math.min(rec.length, 200), `${rows.length}行 / ${rec.length}回`);
    R.check('サマリーの大当り回数も一致', readStat(w, '大当り') === rec.length);

    const bad = rows.map((r, i) => {
      const src = rec[i];
      if (r.spin !== src.i) return `#${r.no} 回転数 ${r.spin}≠${src.i}`;
      if (r.chain !== src.chain) return `#${r.no} 連チャン ${r.chain}≠${src.chain}`;
      if (r.balls !== Math.round(src.balls)) return `#${r.no} 出玉 ${r.balls}≠${src.balls}`;
      return null;
    }).find(Boolean);
    R.check('各行の回転数・連チャン・出玉が記録と一致', !bad, bad || '全行一致');

    /* ハマリは「前回の大当りからの回転数」。積み上げると当選回転数になる */
    let acc = 0;
    const hamariBad = rows.find((r) => { acc += r.hamari; return acc !== r.spin; });
    R.check('ハマリの累計が当選回転数と一致', !hamariBad,
      hamariBad ? `#${hamariBad.no} で不一致` : '全行一致');

    R.check('単発/RUSH/LTの区別が連チャン数と整合',
      rows.every((r) => (r.kind === '単発') === (r.chain === 1)),
      rows.slice(0, 3).map((r) => `${r.kind}:${r.chain}連`).join(' '));
    R.check('RUSH回数のサマリーが履歴と一致',
      readStat(w, 'RUSH') === rows.filter((r) => r.kind !== '単発').length);
    /* 割合の表示。pct() は百分率の数値を受け取る仕様なので、
       比率をそのまま渡すと 0.75 が「0.8%」になってしまう(実際にそうなっていた) */
    const rushRate = rows.filter((r) => r.kind !== '単発').length / rows.length * 100;
    const shown = parseFloat((text($(w, 'funStat')).match(/突入率\s*([\d.]+)%/) || [])[1]);
    R.check('RUSH突入率が 回数÷大当り の百分率になっている',
      Math.abs(shown - rushRate) < 0.1, `表示${shown}% / 計算${rushRate.toFixed(1)}%`);
    const hatsu = parseFloat((text($(w, 'funStat')).match(/初当り\s*([\d.,]+)回転/) || [])[1].replace(/,/g, ''));
    R.check('初当り平均が 総回転数÷大当り回数 と一致',
      Math.abs(hatsu - F(w, 'spins') / rec.length) < 0.1, `表示${hatsu}回転`);
  }

  /* --- ガチ理論値モードにも同じ履歴が出る --- */
  {
    const w = await boot(TARGET, { seed: 3 });
    $(w, 'pkTrials').value = '20000';
    w.runPK(); await sleep(300);
    const rows = readHits(w, 'pk-out');
    R.check('ガチ理論値モードにも大当り履歴が出る', rows.length > 0, rows.length + '行');
    R.check('履歴は折りたたみの中(初期は閉)',
      $(w, 'pk-out').querySelector('.pkh-list').closest('.fold-body').classList.contains('closed'));
    let acc = 0;
    R.check('ガチ側もハマリの累計が当選回転数と一致',
      rows.every((r) => { acc += r.hamari; return acc === r.spin; }));
  }

  /* --- 長時間まわしたときに系列が無制限に伸びないこと ---
     描画コストを一定に保つため、上限を超えたら間引いて step を倍にする。 */
  {
    const w = await boot(TARGET, { seed: 11 });
    w.pkSetMode('f');
    $(w, 'pkFunYen').value = '2000000';   // 5万回転規模
    w.funStart(); await sleep(60);
    const t0 = Date.now();
    w.funPress(-1); await sleep(200);
    const ms = Date.now() - t0;
    R.check('系列が上限(4000点)を超えない',
      F(w, 'series').length <= 4000, `${F(w, 'spins')}回転 → ${F(w, 'series').length}点(step=${F(w, 'step')})`);
    R.check('間引きが起きたら step が1より大きい', F(w, 'spins') <= 4000 || F(w, 'step') > 1);
    R.check('間引き後も系列の末尾が差玉と一致',
      F(w, 'series')[F(w, 'series').length - 1] === Math.round((F(w, 'cash') + F(w, 'tama') - F(w, 'start')) / 4));
    R.check('大量回転でも現実的な時間で終わる', ms < 15000, ms + 'ms');
    /* 横軸は「系列の位置 × step」で回転数に換算して表示する。
       間引きが実際の記録間隔に反映されていないと、この対応が壊れて
       横軸もマーカー位置も大きくずれる(実際に一度そうなっていた)。 */
    const step = F(w, 'step'), spins = F(w, 'spins');
    R.check('系列の長さ × step が総回転数とほぼ一致',
      Math.abs(F(w, 'series').length * step - spins) < step * 2,
      `${F(w, 'series').length}点 × ${step} = ${F(w, 'series').length * step} / 実際${spins}回転`);
    /* 間引き後もマーカーが系列の範囲に収まること(範囲外だと描画位置がずれる) */
    const over = F(w, 'hitsRec').find((h) => Math.round(h.i / F(w, 'step')) > F(w, 'series').length - 1);
    R.check('マーカー位置が系列の範囲内に収まる', !over,
      over ? `${over.i}回転目 → 位置${Math.round(over.i / F(w, 'step'))}` : '全マーカーOK');
  }

  /* --- 大当りゼロでも壊れないこと --- */
  {
    const w = await boot(TARGET, { seed: 5 });
    w.pkSetMode('f');
    $(w, 'pkProb').value = '999999';      // ほぼ当たらない
    $(w, 'pkFunYen').value = '3000';
    w.funStart(); await sleep(60);
    w.funPress(-1); await sleep(60);
    R.check('大当り0回でも履歴欄が空で例外なし', $(w, 'funHits').innerHTML === '');
    R.check('大当り0回でも差玉が数値として出る', Number.isFinite(readStat(w, '差玉')),
      text($(w, 'funStat')).slice(0, 60));
    R.check('大当り0回のとき初当り平均を出さない', !/初当り/.test(text($(w, 'funStat'))));
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
