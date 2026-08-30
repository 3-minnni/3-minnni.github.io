/* 全スイートを順に実行し、1つでも失敗したら終了コード1を返す */
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['validation', '入力バリデーション + 退行チェック'],
  ['errmsg',     'エラーメッセージ'],
  ['undo',       '破壊的操作 + UNDO'],
  ['injection',  'HTML注入'],
  ['ui',         'UI構造(折りたたみ・KPIカード)'],
  ['perf',       'パフォーマンス(描画量の上限)'],
  ['fuzz',       '異常値ファザー(最も時間がかかる)'],
];

const only = process.argv[2];
const list = only ? SUITES.filter(([n]) => n === only) : SUITES;
if (!list.length) {
  console.error(`未知のスイート: ${only}\n利用可能: ${SUITES.map((s) => s[0]).join(', ')}`);
  process.exit(2);
}

const results = [];
for (const [name, desc] of list) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, name + '.js')], { stdio: 'inherit' });
  results.push({ name, desc, ok: r.status === 0, ms: Date.now() - t0 });
}

console.log('\n================ まとめ ================');
for (const r of results) {
  console.log(`${r.ok ? '  合格' : '★不合格'}  ${r.name.padEnd(11)} ${r.desc} (${(r.ms / 1000).toFixed(1)}s)`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length}件のスイートが不合格です。` : '\nすべてのスイートが合格しました。');
process.exit(failed.length ? 1 : 0);
