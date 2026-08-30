/* ============================================================
   期待値ラボ — テスト共通ハーネス
   ------------------------------------------------------------
   ev-lab.html は単一HTMLでモジュールを持たないため、jsdom に実ページを
   読み込ませて window 経由で関数を叩く方式で検証する。
   ブラウザ固有API(canvas / AudioContext / rAF / matchMedia)はここで
   まとめてスタブ化する。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'ev-lab.html');

/* 決定論的な擬似乱数(線形合同法)。同じシードなら必ず同じ結果になる */
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* 比較用に、任意のコミットの ev-lab.html を一時ファイルへ取り出す。
   例: baseline('HEAD') → 直前コミット版のパス                        */
function baseline(ref) {
  const out = path.join(os.tmpdir(), 'evlab-baseline-' + String(ref).replace(/[^\w.-]/g, '_') + '.html');
  const html = execFileSync('git', ['show', `${ref}:ev-lab.html`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(out, html);
  return out;
}

/* jsdom でページを起動する。
   opts:
     seed          … Math.random を決定論化(省略時は素の乱数)
     reduceMotion  … true で FX='off' 相当(演出を同期完了させたいとき)
     hash          … location.hash(共有URL等の再現用)
     silenceFx     … 背景パーティクル(常時rAFループ)を止める。既定 true
                     ※これを止めないと無関係な Math.random 消費で
                       決定論的比較が壊れる(CLAUDE.mdの教訓)          */
async function boot(file, opts = {}) {
  const { seed, reduceMotion = true, hash = '', silenceFx = true } = opts;
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://localhost/' + hash,
    beforeParse(w) {
      /* 重要: Node側で Math.random を差し替えても、ページのスクリプトは
         別レルムの Math を見るため効かない。必ず window.Math を差し替える */
      if (seed !== undefined) w.Math.random = seededRandom(seed);

      w.matchMedia = (q) => ({
        matches: reduceMotion && /reduce/.test(q),
        media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });

      /* canvas: 呼ばれたメソッドは何でも受け流す。戻り値が要るものだけ実装 */
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => null,
        measureText: () => ({ width: 10 }),
        getImageData: () => ({ data: [] }),
      }, { get(t, p) { return (p in t) ? t[p] : () => {}; } });

      w.AudioContext = w.webkitAudioContext = function () {
        return {
          createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '',
            frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }),
          createGain: () => ({ connect() {},
            gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }),
          currentTime: 0, destination: {}, state: 'running',
          resume() { return Promise.resolve(); },
        };
      };

      /* rAF はページ側の例外でNodeプロセスごと落ちないよう捕捉して記録する */
      w.__errs = [];
      w.requestAnimationFrame = (cb) => setTimeout(() => {
        try { cb(w.performance.now()); }
        catch (e) { w.__errs.push(e.constructor.name + ': ' + e.message); }
      }, 1);
      w.cancelAnimationFrame = (id) => clearTimeout(id);

      /* alert は握りつぶしつつ内容を記録(項目2のメッセージ検証で使う) */
      w.__alerts = [];
      w.alert = (m) => w.__alerts.push(String(m));
    },
  });

  const w = dom.window;
  await new Promise((r) => { w.addEventListener('load', r); setTimeout(r, 2500); });
  await sleep(60);
  if (silenceFx && typeof w.particlesSet === 'function') w.particlesSet(false);
  return w;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- 簡易アサーション ------------------------------------------------ */
function createReporter(title) {
  let pass = 0, total = 0;
  const fails = [];
  console.log('\n=== ' + title + ' ===');
  return {
    check(name, ok, extra) {
      total++;
      if (ok) pass++; else fails.push(name);
      console.log(`${ok ? 'OK  ' : '★NG '} ${name}${extra ? ' — ' + extra : ''}`);
      return ok;
    },
    note(msg) { console.log('     ' + msg); },
    /* 全件通れば 0、失敗があれば 1 を返す(run-all.js が終了コードで判定) */
    finish() {
      console.log(`--- ${title}: ${pass}/${total} 合格` + (fails.length ? ` / 失敗: ${fails.join(', ')}` : ''));
      return fails.length ? 1 : 0;
    },
  };
}

/* DOMヘルパ */
const $ = (w, id) => w.document.getElementById(id);
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const modal = (w) => w.document.querySelector('.modal-bg');
const modalYes = (w) => { const m = modal(w); if (!m) return false; m.querySelectorAll('.m-btns .btn2')[1].click(); return true; };
const modalNo = (w) => { const m = modal(w); if (!m) return false; m.querySelectorAll('.m-btns .btn2')[0].click(); return true; };
/* チュートリアルの「このタブの使い方」モーダルを閉じる */
const dismissTutorial = (w) => { const m = modal(w); if (m) m.remove(); };
const tab = (w, name) => { w.document.querySelector(`[data-tab="${name}"]`).click(); dismissTutorial(w); };

module.exports = {
  ROOT, TARGET, boot, baseline, sleep, seededRandom,
  createReporter, $, text, modal, modalYes, modalNo, dismissTutorial, tab,
};
