/* 口数固定ガチャ
   総口数の中から「元に戻さず」引く方式(オリパのデッキ抽選を流用)。
   独立確率ガチャとは状態も関数も分かれており、互いに影響しないことも確認する。 */
const {TARGET,boot,sleep,createReporter,$,text}=require('./harness');
/* スクリプトスコープの変数はwindowから読めないため、表示から状態を読み取る。
   'SR' が 'SSR' にも部分一致するため、チップ単位で先頭一致させる */
const chips=w=>[...$(w,'gcFixRemain').querySelectorAll('.rc')].map(e=>e.textContent.replace(/\s+/g,' ').trim());
const numsIn=t=>(t.match(/[\d,]+/g)||[]).map(x=>+x.replace(/,/g,''));
const totalLeft=w=>{const c=chips(w).find(t=>t.startsWith('残り口数'));return c?numsIn(c):null;};
const tierLeft=(w,name)=>{const c=chips(w).find(t=>t.startsWith(name+' 残り'));return c?numsIn(c).slice(0,2):null;};
const got=(w,name)=>{const c=chips(w).find(t=>t.startsWith(name+' 獲得'));return c?numsIn(c)[0]:null;};
const count=w=>+text($(w,'gcFixCountBig')).replace(/,/g,'');
(async()=>{
 const R=createReporter('口数固定ガチャ');
 const w=await boot(TARGET,{seed:20260831});
 R.check('初期は独立確率モード', $(w,'gcFix').style.display==='none' && $(w,'gcModeP').classList.contains('on'));
 w.gcSetMode('f');
 R.check('口数固定へ切替で設計カードが出る', $(w,'gcFix').style.display!=='none');
 R.check('切替で独立確率の設計カードが隠れる',
   [...w.document.querySelectorAll('#panel-gc .gc-prob')].every(e=>e.style.display==='none'));

 $(w,'gcFixTotal').value='1000'; $(w,'gcFixCost').value='300'; $(w,'gcFixWalletSet').value='99999999';
 w.gcFixBuild(); await sleep(200);
 R.check('総口数ぶんのデッキになる', String(totalLeft(w))==='1000,1000', JSON.stringify(totalLeft(w)));
 R.check('封入枚数が指定どおり(SSR2/SR20/R100)',
   String(tierLeft(w,'SSR'))==='2,2'&&String(tierLeft(w,'SR'))==='20,20'&&String(tierLeft(w,'R'))==='100,100',
   [tierLeft(w,'SSR'),tierLeft(w,'SR'),tierLeft(w,'R')].join(' / '));

 // 100連引くと残りが確実に減る(=元に戻さない)
 w.gcFixPull(100); await sleep(150);
 R.check('引くと残り口数が減る', totalLeft(w)[0]===900, JSON.stringify(totalLeft(w)));
 const g1=got(w,'SSR')+got(w,'SR')+got(w,'R');
 const left1=tierLeft(w,'SSR')[0]+tierLeft(w,'SR')[0]+tierLeft(w,'R')[0];
 R.check('獲得数+残り枚数=封入枚数(元に戻さない抽選)', g1+left1===122, `獲得${g1} + 残り${left1}`);

 // ★決定的な検証: 全部引き切ると獲得数が封入枚数と完全一致する
 w.gcFixPull(900); await sleep(250);
 R.check('全部引くと獲得数=封入枚数',
   got(w,'SSR')===2 && got(w,'SR')===20 && got(w,'R')===100,
   `SSR${got(w,'SSR')} SR${got(w,'SR')} R${got(w,'R')}`);
 R.check('引き切ると残り0口', totalLeft(w)[0]===0);
 const before=count(w);
 w.gcFixPull(10); await sleep(150);
 R.check('完売後はそれ以上引けない', count(w)===before, `${before} → ${count(w)}`);
 R.check('完売メッセージが出る', /完売/.test(text($(w,'gcFixResult'))), text($(w,'gcFixResult')).slice(0,36));

 // 既存の独立確率ガチャへの影響がないこと
 w.gcSetMode('p');
 R.check('独立確率へ戻すと口数固定が隠れる',
   [...w.document.querySelectorAll('#panel-gc .gc-fix')].every(e=>e.style.display==='none'));
 w.gcBuild(); w.gcPull(100); await sleep(200);
 R.check('独立確率ガチャは従来どおり動く', /100連の結果/.test(text($(w,'gcResult'))), text($(w,'gcResult')).slice(0,30));
 R.check('  口数固定側の記録は保持されたまま', count(w)===1000, '口数固定の通算'+count(w)+'連');

 // プリセット互換
 const snap=w.presetSnap('gc');
 R.check('プリセットに口数固定の行が保存される',
   !!(snap.rows&&snap.rows.gcFixTiers&&snap.rows.gcFixTiers.length===3), JSON.stringify(Object.keys(snap.rows||{})));
 const oldSnap={ids:snap.ids,rows:{gcTiers:snap.rows.gcTiers},extra:snap.extra};
 let threw=null; try{ w.presetRestore('gc',oldSnap); }catch(e){ threw=e.message; }
 R.check('古いプリセット(口数固定なし)を復元しても例外が出ない', !threw, threw||'なし');
 R.check('  復元後も口数固定の行は消えない', w.document.querySelectorAll('#gcFixTiers .tier-row').length===3);
 process.exit(R.finish());
})().catch(e=>{console.error('ERR',e);process.exit(1);});
