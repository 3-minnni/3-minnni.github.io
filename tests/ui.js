/* UI構造(段階的表示・結果表示ファースト)
   phase1で導入した折りたたみと、phase2のKPIカードが壊れていないことを検証。
   ※fold は head と body の両方に closed クラスを揃える必要がある
     (片方だけだと矢印の向きと開閉状態が食い違う。過去に実際に起きた) */
const { TARGET, boot, sleep, createReporter, $, text, tab } = require('./harness');

/* fold の head と body が同期しているか */
function foldState(w, bodyId) {
  const body = $(w, bodyId);
  const head = w.document.querySelector(`[onclick*="${bodyId}"]`);
  if (!body || !head) return null;
  return { head: head.classList.contains('closed'), body: body.classList.contains('closed'), el: head };
}

(async () => {
  const R = createReporter('UI構造(折りたたみ・KPIカード)');

  /* 全タブの fold が head/body 同期しているか + クリックで開閉するか */
  const FOLDS = [
    ['オリパ 詳細設定', 'opDetailBody', true],
    ['ガチャ 詳細設定', 'gcDetailBody', true],
    ['スロット 詳細設定(AT)', 'slDetailAT', true],
    ['ルーレット 上級ベット', 'rtAdvBet', true],
    ['ルーレット 出目統計', 'ruBiasFold', true],
    ['設定判別 表示・役名', 'kkDetailBody', true],
    ['設定判別 設定1〜6比較', 'hkAnalysisBody', true],
    ['統計 全記録一覧', 'rsTableFold', true],
    ['パチンコ RUSH中', 'foldRushBody', false],
  ];
  {
    const w = await boot(TARGET, { seed: 1 });
    for (const [name, id, expectClosed] of FOLDS) {
      const s = foldState(w, id);
      if (!s) { R.check(`${name}: 存在する`, false, `#${id} が見つからない`); continue; }
      R.check(`${name}: head/bodyのclosedが一致`, s.head === s.body, `head=${s.head} body=${s.body}`);
      R.check(`${name}: 初期状態が${expectClosed ? '閉' : '開'}`, s.body === expectClosed);
      s.el.click();
      const after = foldState(w, id);
      R.check(`${name}: クリックで開閉し同期を保つ`, after.head === after.body && after.body !== s.body);
    }
  }

  /* カスタム抽選: 抽選履歴は既定で開く(回した直後の成果物のため) */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.ltBuild(); w.ltSpin(); await sleep(700);
    const s = foldState(w, 'ltHistFold');
    R.check('カスタム抽選 抽選履歴: 初期状態が開', s && s.body === false && s.head === false);
    R.check('カスタム抽選: 履歴カードが積まれる', w.document.querySelectorAll('#ltHistory .lt-hcard').length >= 1);
  }

  /* verdict の KPIカード構成(バッジ + 大数字) */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.runPK(); await sleep(200);
    const v = $(w, 'pk-out').querySelector('.verdict');
    R.check('パチンコ: verdictにステータスバッジがある', !!(v && v.querySelector('.v-badge')));
    R.check('パチンコ: バッジが記号+テキスト(色だけに頼らない)',
      /[▲▼]/.test(text(v && v.querySelector('.v-badge'))), text(v && v.querySelector('.v-badge')));
    R.check('パチンコ: 大数字(v-num)がある', !!(v && v.querySelector('.v-num')));
  }

  /* パチンコ: 2モードの出力が同時にDOMへ残ってもidが衝突しないこと。
     以前は両モードが同じ id="pkDistPies" を出力していたため、投資金額モードで
     描画すると getElementById が先に見つかる(隠れている)ガチ側を掴み、
     投資側の振り分け円グラフが空のままになっていた。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    w.runPK(); await sleep(200);          // ガチ側の出力を作る
    w.pkSetMode('f');
    $(w, 'pkFunYen').value = '20000';
    w.funStart(); await sleep(300);        // 投資側の出力も作る
    const ids = (pre) => [...w.document.querySelectorAll('[id^="' + pre + '"]')].map((e) => e.id);
    const boxes = ids('pkDistPies');
    R.check('振り分け円グラフのidが重複しない', new Set(boxes).size === boxes.length && boxes.length === 2, boxes.join(','));
    R.check('  ガチ側と投資側の両方の器がある',
      !!$(w, 'pkDistPies_g') && !!$(w, 'pkDistPies_f'));
    w.pkDistPiesDraw(w.pkParams(), 'f');
    R.check('投資金額モードで自分側にcanvasが作られる',
      $(w, 'pkDistPies_f').querySelectorAll('canvas').length > 0,
      $(w, 'pkDistPies_f').querySelectorAll('canvas').length + '枚');
    const toggles = ids('pkPieToggle_');
    R.check('トグルのidも重複しない', new Set(toggles).size === toggles.length, toggles.join(','));
  }

  /* パチンコ投資金額モード: 回転数を範囲指定したとき、回すたびに引き直されること。
     以前は funStart で1回だけ抽選し funPress が使い回していたため、
     何度回しても同じ回転数のままだった(理論値側は元から毎回引き直していた)。 */
  {
    const w = await boot(TARGET, { seed: 1234 });
    const shown = () => {
      const m = text($(w, 'funStat')).match(/今回の回転数:\s*([\d.,]+)/);
      return m ? m[1] : null;
    };
    w.pkSetMode('f');
    w.pkSetFunSpinsMode(true);
    $(w, 'pkFunSpinsMin').value = '10';
    $(w, 'pkFunSpinsMax').value = '30';
    $(w, 'pkFunYen').value = '50000';
    w.funStart(); await sleep(150);
    const vals = [shown()];
    for (let i = 0; i < 5; i++) { w.funPress(1000); await sleep(50); vals.push(shown()); }
    const uniq = [...new Set(vals.filter(Boolean))];
    R.check('回転数の範囲指定: 回すたびに引き直される', uniq.length >= 4, '観測=[' + vals.join(', ') + ']');
    const nums = vals.filter(Boolean).map((v) => parseFloat(v.replace(/,/g, '')));
    R.check('回転数の範囲指定: 値が指定範囲(10〜30)に収まる', nums.every((n) => n >= 10 && n <= 30), nums.join(', '));
  }
  {
    /* 固定指定は従来どおり変動しないこと */
    const w = await boot(TARGET, { seed: 1234 });
    w.pkSetMode('f');
    w.pkSetFunSpinsMode(false);
    $(w, 'pkSpins1k').value = '18';
    $(w, 'pkFunYen').value = '30000';
    w.funStart(); await sleep(120);
    let threw = null;
    try { for (let i = 0; i < 3; i++) w.funPress(1000); } catch (e) { threw = e.message; }
    R.check('回転数の固定指定: 例外なく回せる(「今回の回転数」は出さない)',
      !threw && !/今回の回転数/.test(text($(w, 'funStat'))), threw || '');
  }

  /* 統計: 生涯トータルが先頭(結果表示ファースト) */
  {
    const w = await boot(TARGET, { seed: 1 });
    const s = w.stAll(); s['パチンコ'] = { n: 5, inv: 10000, net: 3000 }; w.stSave(s); w.stRender();
    const html = $(w, 'stBody').innerHTML;
    /* 文字位置の閾値ではなく「ジャンル別内訳より前に出るか」で判定する */
    const iTotal = html.indexOf('生涯トータル');
    const iGenre = html.indexOf('st-genre');
    R.check('シミュ統計: 生涯トータルがジャンル別内訳より前に出る',
      iTotal >= 0 && iGenre >= 0 && iTotal < iGenre, `総計=${iTotal} / 内訳=${iGenre}`);
  }

  /* 統計ヒーロー: rs-hero クラスが付きグリッドカードとして描画される
     (初回コミットから一度も適用されていなかった既存バグの回帰防止) */
  {
    const w = await boot(TARGET, { seed: 1 });
    $(w, 'rsDate').value = '2026-08-30'; $(w, 'rsInv').value = 20000; $(w, 'rsRet').value = 25000; w.rsAdd();
    const hero = $(w, 'rsHero');
    R.check('統計ヒーロー: rs-heroクラスが付いている', hero.classList.contains('rs-hero'));
    R.check('統計ヒーロー: hero-net / hero-mini が生成される',
      !!hero.querySelector('.hero-net') && hero.querySelectorAll('.hero-mini').length === 2);
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
