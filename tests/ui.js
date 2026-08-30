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
