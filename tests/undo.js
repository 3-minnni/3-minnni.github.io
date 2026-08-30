/* 破壊的操作の確認モーダルと取り消し(UNDO)
   消える前に確認が入ること、キャンセルでデータが残ること、
   「元に戻す」で完全復元できることを検証する。 */
const { TARGET, boot, sleep, createReporter, $, modal, modalYes, modalNo, tab } = require('./harness');

const undoShown = (w) => { const b = $(w, 'undoBar'); return !!b && b.classList.contains('show'); };

(async () => {
  const R = createReporter('破壊的操作の安全性 + UNDO');

  /* 1) 設定判別カウンター(実戦で数百回タップした累積が消える操作) */
  {
    const w = await boot(TARGET, { seed: 5 });
    w.kkAdd('big'); w.kkAdd('big'); w.kkAdd('reg'); w.kkAdd('k1');
    const before = $(w, 'kkBigC').textContent;
    w.kkReset();
    R.check('kkReset: 確認モーダルが出る', !!modal(w));
    modalNo(w);
    R.check('kkReset: キャンセルでデータが残る', $(w, 'kkBigC').textContent === before, 'BIG=' + $(w, 'kkBigC').textContent);
    w.kkReset(); modalYes(w); await sleep(60);
    R.check('kkReset: 実行で0になる', $(w, 'kkBigC').textContent === '0');
    R.check('kkReset: 取り消しバーが出る', undoShown(w));
    w.undoRun();
    R.check('kkReset: 取り消しで完全復元', $(w, 'kkBigC').textContent === before, 'BIG=' + $(w, 'kkBigC').textContent);
  }

  /* 2) 実践記録の1件削除(以前は確認なしで永続データが消えていた) */
  {
    const w = await boot(TARGET, { seed: 5 });
    $(w, 'rsDate').value = '2026-08-30'; $(w, 'rsKind').value = 'パチンコ';
    $(w, 'rsInv').value = 20000; $(w, 'rsRet').value = 25000; w.rsAdd();
    $(w, 'rsDate').value = '2026-08-29'; $(w, 'rsInv').value = 10000; $(w, 'rsRet').value = 5000; w.rsAdd();
    const n0 = w.rsAll().length;
    w.rsDel(0); await sleep(60);
    R.check('rsDel: 1件削除される', w.rsAll().length === n0 - 1, `${n0}→${w.rsAll().length}`);
    R.check('rsDel: 取り消しバーが出る(モーダルは挟まない)', undoShown(w) && !modal(w));
    w.undoRun();
    R.check('rsDel: 取り消しで件数が戻る', w.rsAll().length === n0, '件数=' + w.rsAll().length);
  }

  /* 3) シミュ統計の全リセット */
  {
    const w = await boot(TARGET, { seed: 5 });
    const s = w.stAll(); s['パチンコ'] = { n: 5, inv: 10000, net: 3000 }; s['スロット'] = { n: 2, inv: 4000, net: -1000 };
    w.stSave(s); w.stRender();
    w.stReset();
    R.check('stReset: 確認モーダルが出る', !!modal(w));
    modalYes(w); await sleep(60);
    R.check('stReset: 実行で空になる', Object.keys(w.stAll()).length === 0);
    R.check('stReset: 取り消しバーが出る', undoShown(w));
    w.undoRun();
    R.check('stReset: 取り消しで完全復元', JSON.stringify(w.stAll()) === JSON.stringify(s), 'keys=' + Object.keys(w.stAll()).join(','));
  }

  /* 4) シミュ統計のカテゴリ個別削除 */
  {
    const w = await boot(TARGET, { seed: 5 });
    const s = w.stAll(); s['パチンコ'] = { n: 5, inv: 10000, net: 3000 }; s['スロット'] = { n: 2, inv: 4000, net: -1000 };
    w.stSave(s); w.stRender();
    w.stDelCat('スロット');
    R.check('stDelCat: 確認モーダルが出る', !!modal(w));
    modalYes(w);
    R.check('stDelCat: 対象だけ消える', !w.stAll()['スロット'] && !!w.stAll()['パチンコ']);
    w.undoRun();
    R.check('stDelCat: 取り消しで復元', JSON.stringify(w.stAll()['スロット']) === JSON.stringify(s['スロット']));
  }

  /* 5) プリセットの新規保存 / 上書き保存 / 削除 */
  {
    const w = await boot(TARGET, { seed: 5 });
    $(w, 'pname-pk').value = 'テスト機';
    w.presetSave('pk');
    R.check('presetSave(新規): 上書き警告は出ない', !/上書き/.test(modal(w).querySelector('p').textContent));
    modalYes(w);
    /* 保存バーは再生成されるため名前欄はクリアされる(誤操作防止の既存仕様) */
    $(w, 'pname-pk').value = 'テスト機';
    w.presetSave('pk');
    R.check('presetSave(同名): 上書きすることが明示される', /上書き/.test(modal(w).querySelector('p').textContent));
    modalYes(w);
    $(w, 'psel-pk').value = 'テスト機';
    w.presetDel('pk');
    R.check('presetDel: 確認モーダルが出る', !!modal(w));
    modalYes(w);
    const gone = !(JSON.parse(w.localStorage.getItem('evlab_presets') || '{}').pk || {})['テスト機'];
    R.check('presetDel: 削除される', gone);
    w.undoRun();
    const back = !!(JSON.parse(w.localStorage.getItem('evlab_presets') || '{}').pk || {})['テスト機'];
    R.check('presetDel: 取り消しで復元', back);
  }

  /* 6) オリパの再シャッフル(引いた履歴が全消去される) */
  {
    const w = await boot(TARGET, { seed: 5 });
    w.opBuild();
    w.opReshuffle();
    R.check('opReshuffle: 未着手なら確認なしで即実行', !modal(w));
    w.opPull(10);
    w.opReshuffle();
    R.check('opReshuffle: 引いた後は確認が出る', !!modal(w));
    if (modal(w)) modalNo(w);
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
