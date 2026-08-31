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

  /* スロット: 機械割が業界の定義「総払出 ÷ 総投入(1G=3枚)」で計算されること。
     以前は「ボーナス払出 ÷ 純減」で、分母に子役の戻りが含まれず
     100%からの乖離が約2倍に拡大していた。 */
  {
    const official = (big, bigC, reg, regC, mochi) => {
      const N = 50 / mochi;               // 1Gあたり純減
      const B = bigC / big + regC / reg;  // 1Gあたりボーナス払出
      return ((3 - N) + B) / 3 * 100;     // (子役払出 + ボーナス払出) ÷ 3投入
    };
    const CASES = [
      ['低設定寄り', 240, 300, 400, 100, 33],
      ['高設定寄り', 220, 312, 330, 96, 34],
      ['100%付近', 250, 300, 400, 100, 33.6],
    ];
    for (const [name, big, bigC, reg, regC, mochi] of CASES) {
      const w = await boot(TARGET, { seed: 1 });
      w.slSetType('a');
      $(w, 'slBig').value = big; $(w, 'slBigC').value = bigC;
      $(w, 'slReg').value = reg; $(w, 'slRegC').value = regC;
      $(w, 'slAMochi').value = mochi; $(w, 'slG').value = '6000';
      w.runSL(); await sleep(200);
      const m = text($(w, 'sl-out')).match(/機械割\(理論値\)\s*([\d.]+)%/);
      const shown = m ? parseFloat(m[1]) : NaN;
      const exp = official(big, bigC, reg, regC, mochi);
      R.check(`機械割が総払出÷総投入と一致(${name})`, Math.abs(shown - exp) < 0.1,
        `公式${exp.toFixed(2)}% / 表示${shown}%`);
    }
    /* コイン持ちを極端に大きくしても発散しないこと(旧式は分母が0に近づき爆発した) */
    const w = await boot(TARGET, { seed: 1 });
    w.slSetType('a');
    $(w, 'slBig').value = '240'; $(w, 'slBigC').value = '300';
    $(w, 'slReg').value = '400'; $(w, 'slRegC').value = '100';
    $(w, 'slAMochi').value = '999'; $(w, 'slG').value = '3000';
    w.runSL(); await sleep(200);
    const v = parseFloat((text($(w, 'sl-out')).match(/機械割\(理論値\)\s*([\d.]+)%/) || [])[1]);
    R.check('コイン持ちが極端でも機械割が発散しない', v < 400, v + '%');
  }

  /* スロット: レート選択(5 / 10 / 20スロ)。
     既定は20スロ。SL_RATESは位置ではなく値で既定を選ぶ実装にしてあるので、
     レートを増やしても既定がずれない。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const chips = () => [...w.document.querySelectorAll('#slRates .chip')];
    const evOf = () => {
      const m = text($(w, 'sl-out')).match(/(\+|−)¥([\d,]+)/);
      return m ? (m[1] === '−' ? -1 : 1) * parseInt(m[2].replace(/,/g, ''), 10) : null;
    };
    const labels = chips().map((c) => c.textContent.trim());
    R.check('スロットのレートが 5 / 10 / 20 の3種', labels.length === 3
      && /^5スロ/.test(labels[0]) && /^10スロ/.test(labels[1]) && /^20スロ/.test(labels[2]), labels.join(' / '));
    const on = chips().filter((c) => c.classList.contains('on'));
    R.check('既定は20スロ', on.length === 1 && /^20スロ/.test(on[0].textContent.trim()),
      on.map((c) => c.textContent.trim()).join(','));

    w.slSetType('a');
    $(w, 'slBig').value = '240'; $(w, 'slBigC').value = '300';
    $(w, 'slReg').value = '400'; $(w, 'slRegC').value = '100';
    $(w, 'slAMochi').value = '33'; $(w, 'slG').value = '6000';
    w.runSL(); await sleep(200);
    const ev20 = evOf();
    const kikai20 = text($(w, 'sl-out')).match(/機械割\(理論値\)\s*([\d.]+)%/)[1];
    chips()[1].click(); w.runSL(); await sleep(200);
    const ev10 = evOf();
    const kikai10 = text($(w, 'sl-out')).match(/機械割\(理論値\)\s*([\d.]+)%/)[1];
    R.check('10スロの収支は20スロのちょうど半分', Math.abs(ev10 * 2 - ev20) <= 2, `${ev20}円 → ${ev10}円`);
    R.check('機械割はレートに依存しない', kikai20 === kikai10, `${kikai20}% / ${kikai10}%`);
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

  /* タブ(ナビゲーション)
     jsdom はレイアウトを持たないのでグリッドの列数や sticky は検証できない。
     切替が壊れていないことと、追従に必要な部品がそろっていることを見る。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const tabs = [...w.document.querySelectorAll('.tab')];
    R.check('タブは8個', tabs.length === 8, tabs.length + '個');
    R.check('追従判定用の番兵がタブの直前にある', () => {
      const top = $(w, 'tabsTop');
      return !!top && top.nextElementSibling === w.document.querySelector('.tabs');
    });
    /* 全タブを順に開いて、対応するパネルだけがactiveになること */
    const bad = tabs.map((t) => {
      t.dispatchEvent(new w.Event('click', { bubbles: true }));
      const act = [...w.document.querySelectorAll('.panel.active')];
      if (act.length !== 1) return `${t.dataset.tab}: activeパネルが${act.length}個`;
      if (act[0].id !== 'panel-' + t.dataset.tab) return `${t.dataset.tab}: ${act[0].id} が開いた`;
      if (!t.classList.contains('active')) return `${t.dataset.tab}: タブがactiveでない`;
      return null;
    }).find(Boolean);
    R.check('全8タブが正しいパネルへ切り替わる', !bad, bad || '8タブすべてOK');
    R.check('切替で例外が出ていない', (w.__errs || []).length === 0, (w.__errs || []).join(' / ') || 'なし');
  }

  /* KPIの強弱: タブごとに結論にあたる1枚だけを .stat.lead で大きく扱う。
     見た目の大きさは jsdom では測れないので、正しい数値に付いているかを見る。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const leadOf = (boxId) => {
      const el = $(w, boxId).querySelector('.stat.lead');
      return el ? text(el.querySelector('.s-l')) : null;
    };
    w.runPK(); await sleep(250);
    R.check('パチンコ: 主要KPIはボーダーライン', leadOf('pk-out') === 'ボーダーライン', String(leadOf('pk-out')));
    R.check('パチンコ: 主要KPIは1枚だけ',
      $(w, 'pk-out').querySelectorAll('.stat.lead').length === 1);
    R.check('パチンコ: 他のタイルは通常サイズのまま',
      $(w, 'pk-out').querySelectorAll('.stat:not(.lead)').length >= 4);

    w.runSL(); await sleep(250);
    R.check('スロット: 主要KPIは機械割', leadOf('sl-out') === '機械割(理論値)', String(leadOf('sl-out')));

    w.pkSetMode('v'); w.runPkVr(); await sleep(250);
    R.check('仮想ラッシュ: 主要KPIは平均連チャン数',
      leadOf('pkVrOut') === '平均連チャン数', String(leadOf('pkVrOut')));
  }

  /* グラフの縦軸ラベル: 回転させて左端に描くと目盛りの6桁数字と重なっていた。
     左上へ横書きで置く形に変えたので、回転描画が残っていないことを確かめる。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const calls = [];
    const orig = w.HTMLCanvasElement.prototype.getContext;
    w.HTMLCanvasElement.prototype.getContext = function (...a) {
      const c = orig.apply(this, a);
      return new Proxy(c, { get(t, p) {
        if (p === 'rotate' || p === 'fillText') return (...args) => { calls.push([p, args[0]]); };
        return t[p];
      } });
    };
    w.runPK(); await sleep(300);
    const rotated = calls.some(([k]) => k === 'rotate');
    R.check('グラフが縦軸ラベルを回転描画しない', !rotated,
      rotated ? 'rotate が呼ばれている' : '回転なし');
    R.check('縦軸の単位は描画されている',
      calls.some(([k, v]) => k === 'fillText' && /収支|差玉/.test(String(v))),
      calls.filter(([k]) => k === 'fillText').slice(0, 3).map((c) => c[1]).join(' / '));
  }

  /* 動きの言語: 持続時間13種・曲線4種がばらばらだったので3層に集約した。
     jsdom は CSS変数を解決しないので、宣言側にトークンが行き渡ったかを見る。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const css = [...w.document.querySelectorAll('style')].map((e) => e.textContent).join('');
    const decls = (css.match(/(?:transition|animation|animation-delay):[^;}]*/g) || []);
    /* 演出層(虹・紙吹雪・リール・光沢)と起動画面の振り付けは別物なので除く */
    const skip = /rb |cfall|shine|ballRoll|sp(Mark|Rise|Fade)|animation:none|opacity \.42s/;
    const raw = decls.filter((d) => !skip.test(d) && /[0-9]+m?s/.test(d) && !/var\(--mo-/.test(d));
    R.check('反応・切替・登場の時間がトークンに寄せられている', raw.length === 0,
      raw.slice(0, 3).join(' / ') || '生の秒数指定なし');
    R.check('動きのトークンが定義されている',
      /--mo-fast:/.test(css) && /--mo-base:/.test(css) && /--mo-slow:/.test(css) && /--ease:/.test(css));
    /* ずらしは一定幅の等差でなければ「揃った動き」に見えない */
    const steps = (css.match(/animation-delay:calc\(var\(--mo-step\)\*(\d)\)/g) || []);
    R.check('登場のずらしが等差になっている', steps.length >= 5, steps.length + '段');
    R.check('演出OFFの停止機構が残っている', /body\.fx-off \*\{animation:none!important;\}/.test(css));
    R.check('reduced-motion への配慮が残っている',
      /prefers-reduced-motion/.test(css) && /animation-duration:\.01ms!important/.test(css));
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
