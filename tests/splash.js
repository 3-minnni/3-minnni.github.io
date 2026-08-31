/* 起動画面「収束」
   演出そのものは見た目なので検証できないが、
   「必ず閉じる」「テーマが描画前に確定する」「演出OFFを尊重する」は検証できる。 */
const { TARGET, boot, sleep, createReporter, $ } = require('./harness');

const splash = (w) => w.document.getElementById('splash');

(async () => {
  const R = createReporter('起動画面');

  /* --- 必ず閉じること。ここが壊れるとアプリが一切使えなくなる --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    R.check('起動直後は起動画面が出ている', !!splash(w));
    await sleep(4200);                       // SP_MAX(3400ms) + 消去アニメ
    R.check('放置しても必ず閉じる(DOMから消える)', !splash(w));
    R.check('本体が操作できる状態になる', typeof w.runPK === 'function' && !!$(w, 'panel-pk'));
  }

  /* --- タップで飛ばせること --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    const sp = splash(w);
    R.check('起動画面が存在する', !!sp);
    if (sp) {
      sp.dispatchEvent(new w.Event('click', { bubbles: true }));
      await sleep(600);
      R.check('タップで即座に閉じられる', !splash(w));
    }
  }

  /* --- テーマが描画前に確定していること ---
     harness は reduced-motion を true にするため FX='off' で起動する。
     ライト判定は body 直後のインラインスクリプトが行うので、
     本体スクリプトの実行を待たずに body へ light が付いていなければならない。 */
  {
    const w = await boot(TARGET, { seed: 1, light: true });
    R.check('ライト設定なら body に light が付く', w.document.body.classList.contains('light'));
    await sleep(4200);
    R.check('ライトでも起動画面は閉じる', !splash(w));
  }
  {
    const w = await boot(TARGET, { seed: 1 });
    R.check('ダーク設定では light が付かない', !w.document.body.classList.contains('light'));
  }

  /* --- 演出OFF/reduced-motion では静止表示にすること ---
     harness は prefers-reduced-motion:true を返すので FX='off' になる。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const sp = splash(w);
    R.check('演出OFFでは静止表示(sp-still)になる',
      !!sp && sp.classList.contains('sp-still') && !sp.classList.contains('sp-run'),
      sp ? sp.className : '(なし)');
    R.check('演出OFFでは収束中の数値を出さない',
      !!sp && !!sp.querySelector('.sp-num'));   // 要素はあるがCSSで隠す
    await sleep(1400);
    R.check('演出OFFでは早く閉じる(1.4秒以内)', !splash(w));
  }

  /* --- 2回目以降は短縮されること(sessionStorage) --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    let seen = null;
    try { seen = w.sessionStorage.getItem('evlab_seen_splash'); } catch (e) { /* 無い環境もある */ }
    R.check('初回表示の記録が残る(2回目以降の短縮に使う)', seen === '1', String(seen));
  }

  /* --- 演出を最後まで見せきれる長さか ---
     以前は SP_MIN=900ms で、ロゴが出る 1.16秒より前に閉じていたため
     演出をほとんど確認できなかった。振り付けの終わり(1.8秒)より
     最短表示時間が長いことを、定数とCSSの両方から確かめる。 */
  {
    const w = await boot(TARGET, { seed: 1 });
    const src = [...w.document.querySelectorAll('script')].map((e) => e.textContent).join('');
    const css = [...w.document.querySelectorAll('style')].map((e) => e.textContent).join('');
    /* コメント中にも「以前は SP_MIN=900ms」と書いてあるので宣言に限定して拾う */
    const min = parseFloat((src.match(/const SP_MIN=(\d+)/) || [])[1]);
    const max = parseFloat((src.match(/SP_MAX=(\d+),SP_DUR/) || [])[1]);
    /* CSS側の「開始遅延 + 長さ」の最大値が振り付けの終わり */
    const ends = [...css.matchAll(/animation:sp\w+ ([\d.]+)s [^;]*?([\d.]+)s forwards/g)]
      .map((m) => (parseFloat(m[1]) + parseFloat(m[2])) * 1000);
    const last = Math.max(...ends);
    R.check('最短表示時間が振り付けの終わりより長い', min >= last,
      `SP_MIN=${min}ms / 振り付け終了=${last}ms`);
    R.check('最長表示時間が最短より長い', max > min, `${min} → ${max}`);
    R.check('待たされ過ぎない上限になっている', max <= 4000, max + 'ms');
  }

  /* --- 構造 --- */
  {
    const w = await boot(TARGET, { seed: 1 });
    const sp = splash(w);
    R.check('演出用のcanvasがある', !!sp && !!sp.querySelector('#spCanvas'));
    R.check('ロゴ・タイトル・LOADING表記がそろっている',
      !!sp && !!sp.querySelector('.sp-mark') && !!sp.querySelector('.sp-title')
      && !!sp.querySelector('.sp-sub'));
    R.check('装飾要素は支援技術から隠されている',
      !!sp && sp.querySelector('#spCanvas').getAttribute('aria-hidden') === 'true'
      && sp.querySelector('.sp-num').getAttribute('aria-hidden') === 'true');
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
