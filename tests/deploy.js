/* 公開まわりの整合性チェック
   ウェブで配る以上、更新が利用者に届かないと意味がない。
   実際に一度、sw.js の VERSION を上げ忘れて旧版が配られ続けた事故があったため、
   その再発をここで止める。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createReporter } = require('./harness');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

(async () => {
  const R = createReporter('公開まわりの整合性');

  const sw = read('sw.js');

  /* --- 更新が届くか(最重要) --- */
  {
    const appHash = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 'ev-lab.html'))).digest('hex').slice(0, 12);
    const recorded = (sw.match(/APP_HASH\s*=\s*'([0-9a-f]+)'/) || [])[1];
    R.check('sw.js に APP_HASH が記録されている', !!recorded, recorded || '見つからない');
    R.check('ev-lab.html を更新したら sw.js の VERSION も上げている',
      recorded === appHash,
      recorded === appHash ? '' :
        `ev-lab.html=${appHash} / sw.jsの記録=${recorded}\n` +
        '       → sw.js の VERSION を上げ、APP_HASH をこの値に直してください。\n' +
        '         上げないと利用者に古い版が配られ続けます。');

    const version = (sw.match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
    R.check('VERSION が設定されている', !!version, version || '無し');
    R.check('キャッシュ名に VERSION が反映される', /CACHE\s*=\s*'evlab-'\s*\+\s*VERSION/.test(sw));
    R.check('古いキャッシュを掃除している', /caches\.delete/.test(sw));
  }

  /* --- ページ遷移で古い応答を掴まないこと --- */
  {
    R.check('ページ遷移はサーバーへ確認しに行く(no-cache)',
      /fetch\(req,\s*\{\s*cache:\s*'no-cache'\s*\}\)/.test(sw),
      'no-cache が無いとHTTPキャッシュの古い応答をキャッシュに焼き直してしまう');
    R.check('オフライン時はアプリ本体を返す', /caches\.match\('\.\/ev-lab\.html'\)/.test(sw));
  }

  /* --- 公開に必要なファイルが揃っているか --- */
  {
    ['index.html', '.nojekyll', 'manifest.json', 'sw.js', 'ev-lab.html',
     'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
     'icons/favicon-32.png', 'icons/feature-1024x500.png'].forEach((f) => {
      R.check(`公開ファイルがある: ${f}`, exists(f));
    });
  }

  /* --- manifest と実ファイルの対応 --- */
  {
    const m = JSON.parse(read('manifest.json'));
    R.check('manifest が参照するアイコンが実在する',
      m.icons.every((i) => exists(i.src)),
      m.icons.map((i) => i.src).join(' '));
    R.check('maskable 用のアイコンが宣言されている',
      m.icons.some((i) => (i.purpose || '').includes('maskable')));
    R.check('display は standalone', m.display === 'standalone', m.display);
    R.check('start_url がアプリ本体を指している', /ev-lab\.html/.test(m.start_url), m.start_url);
    /* SW のプリキャッシュに、起動に要るものが入っているか */
    ['./ev-lab.html', './manifest.json'].forEach((u) => {
      R.check(`プリキャッシュに含まれる: ${u}`, sw.includes(`'${u}'`));
    });
  }

  /* --- 公開リポジトリに出したくないもの --- */
  {
    const ignore = read('.gitignore');
    R.check('開発メモを公開対象から外している', /^CLAUDE\.md$/m.test(ignore));
    R.check('Pythonのキャッシュを外している', /__pycache__/.test(ignore));
    R.check('Jekyll を無効化している(.well-known を配信するため)', exists('.nojekyll'));
  }

  process.exit(R.finish());
})().catch((e) => { console.error('ERR', e); process.exit(1); });
