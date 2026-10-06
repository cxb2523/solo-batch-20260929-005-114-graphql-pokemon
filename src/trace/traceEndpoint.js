const tracer = require('./tracer');
const { checkDrift } = require('./drift');
const { getStats } = require('../service/Pokemon');

const DECISIONS = [
  '真源: src/type/*.js 为唯一真源, schemas/schema.graphql 是其派生快照; scripts/buildSchema.js 检出漂移, 冲突行在下表标红',
  '缓存: Pokemon.js 使用进程内索引; 失效判据 = mtime+size 快检, 失配时以 SHA-256 内容哈希复核; 过期回退 = 重新读盘并重建索引',
  '并发: 索引重建采用 single-flight, 并发请求等待同一重建 Promise, 绝不读取旧快照, 过滤结果无陈旧命中',
  '进化链: getPokemonByEvolutions 复用同一 byName 索引, 不二次解析 pokemons.json',
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFilter(query) {
  const filter = {};
  if (query.name) filter.name = query.name;
  if (query.type) filter.type = query.type;
  if (query.category) filter.category = query.category;
  return filter;
}

function collectState(query) {
  const filter = parseFilter(query);
  return {
    filter,
    decisions: DECISIONS,
    stats: getStats(),
    buffer: tracer.meta(),
    drift: checkDrift(),
    records: tracer.list(filter).slice(-200).reverse(),
  };
}

function renderRows(records) {
  if (!records.length) {
    return '<tr><td colspan="10" class="empty">no trace records</td></tr>';
  }
  return records.map(r => [
    '<tr>',
    `<td>${r.seq}</td>`,
    `<td>${escapeHtml(r.ts)}</td>`,
    `<td>${escapeHtml(r.file)}</td>`,
    `<td>${escapeHtml(r.action)}</td>`,
    `<td>${escapeHtml(r.category || '')}</td>`,
    `<td class="args">${escapeHtml(JSON.stringify(r.args || {}))}</td>`,
    `<td>${r.hits}</td>`,
    `<td>${r.durationMs}</td>`,
    `<td>${r.cacheHit === null || r.cacheHit === undefined ? '-' : (r.cacheHit ? 'hit' : 'miss')}${r.waited ? ' (waited)' : ''}</td>`,
    `<td>${escapeHtml(r.types || '')}</td>`,
    '</tr>',
  ].join('')).join('');
}

function renderStats(state) {
  const s = state.stats;
  const b = state.buffer;
  return [
    `<span>缓存命中: <b>${s.cacheHits}</b></span>`,
    `<span>哈希复核: <b>${s.revalidations}</b></span>`,
    `<span>索引重建: <b>${s.rebuilds}</b></span>`,
    `<span>重建等待: <b>${s.rebuildWaits}</b></span>`,
    `<span>环形缓冲: <b>${b.size}/${b.capacity}</b> (dropped ${b.dropped})</span>`,
    `<span>索引状态: <b>${s.cached ? '已加载' : '未加载'}</b></span>`,
  ].join('');
}

function renderDrift(drift) {
  if (!drift.drift) {
    return '<div class="ok">数据源判定: 无漂移 — schemas/schema.graphql 与 src/type/*.js 一致</div>';
  }
  const rows = drift.conflicts.map(c =>
    `<tr class="conflict"><td>${escapeHtml(c.where)}</td><td>${c.line}</td><td>${escapeHtml(c.text)}</td></tr>`
  ).join('');
  return `<div class="bad">数据源判定: 检测到漂移, 冲突 ${drift.conflicts.length} 行(标红)</div>` +
    `<table class="conflicts"><thead><tr><th>位置</th><th>行号</th><th>内容</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPage(state, query) {
  const f = state.filter;
  const decisions = state.decisions.map(d => `<li>${escapeHtml(d)}</li>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>pokemons.json trace</title>
<style>
body{font-family:Consolas,Menlo,monospace;margin:16px;background:#fafafa;color:#222}
h1{font-size:18px} h2{font-size:14px;margin:12px 0 4px}
table{border-collapse:collapse;width:100%;font-size:12px;background:#fff}
th,td{border:1px solid #ccc;padding:3px 6px;text-align:left;vertical-align:top}
th{background:#eee}
.args{max-width:320px;word-break:break-all}
.empty{color:#888;text-align:center}
.ok{color:#0a0;margin:6px 0}
.bad{color:#c00;font-weight:bold;margin:6px 0}
tr.conflict td{background:#fdd;color:#900}
.stats span{margin-right:16px;white-space:nowrap}
form{margin:8px 0}
input,select{padding:2px 4px;font-family:inherit}
.decisions{background:#fff;border:1px solid #ccc;padding:8px 12px;font-size:12px}
</style></head><body>
<h1>pokemons.json 取数链路观测 (/trace)</h1>
<h2>决策(定死)</h2>
<ul class="decisions">${decisions}</ul>
<h2>运行指标</h2>
<div class="stats" id="stats">${renderStats(state)}</div>
<h2>数据源判定 / 漂移</h2>
<div id="drift">${renderDrift(state.drift)}</div>
<h2>过滤 + 实时刷新(2s)</h2>
<form method="get" action="/trace">
  name: <input name="name" value="${escapeHtml(f.name || '')}">
  type: <input name="type" value="${escapeHtml(f.type || '')}">
  category: <select name="category">
    ${['', 'pokemons', 'pokemon', 'evolution'].map(c =>
      `<option value="${c}"${f.category === c ? ' selected' : ''}>${c || '(all)'}</option>`).join('')}
  </select>
  <button type="submit">过滤</button>
  <a href="/trace">清除</a>
</form>
<table><thead><tr>
<th>#</th><th>时间</th><th>文件</th><th>动作</th><th>category</th><th>入参</th><th>命中条数</th><th>耗时(ms)</th><th>缓存</th><th>命中types</th>
</tr></thead><tbody id="rows">${renderRows(state.records)}</tbody></table>
<script>
function esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rows(records){
  if(!records.length)return '<tr><td colspan="10" class="empty">no trace records</td></tr>';
  return records.map(function(r){return '<tr><td>'+r.seq+'</td><td>'+esc(r.ts)+'</td><td>'+esc(r.file)+'</td><td>'+esc(r.action)+'</td><td>'+esc(r.category||'')+'</td><td class="args">'+esc(JSON.stringify(r.args||{}))+'</td><td>'+r.hits+'</td><td>'+r.durationMs+'</td><td>'+(r.cacheHit===null||r.cacheHit===undefined?'-':(r.cacheHit?'hit':'miss'))+(r.waited?' (waited)':'')+'</td><td>'+esc(r.types||'')+'</td></tr>';}).join('');
}
function stats(s,b){
  return '<span>缓存命中: <b>'+s.cacheHits+'</b></span><span>哈希复核: <b>'+s.revalidations+'</b></span><span>索引重建: <b>'+s.rebuilds+'</b></span><span>重建等待: <b>'+s.rebuildWaits+'</b></span><span>环形缓冲: <b>'+b.size+'/'+b.capacity+'</b> (dropped '+b.dropped+')</span><span>索引状态: <b>'+(s.cached?'已加载':'未加载')+'</b></span>';
}
function driftHtml(d){
  if(!d.drift)return '<div class="ok">数据源判定: 无漂移 — schemas/schema.graphql 与 src/type/*.js 一致</div>';
  var rows=d.conflicts.map(function(c){return '<tr class="conflict"><td>'+esc(c.where)+'</td><td>'+c.line+'</td><td>'+esc(c.text)+'</td></tr>';}).join('');
  return '<div class="bad">数据源判定: 检测到漂移, 冲突 '+d.conflicts.length+' 行(标红)</div><table class="conflicts"><thead><tr><th>位置</th><th>行号</th><th>内容</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
async function refresh(){
  try{
    const res=await fetch('/trace.json'+window.location.search);
    const data=await res.json();
    document.getElementById('rows').innerHTML=rows(data.records);
    document.getElementById('stats').innerHTML=stats(data.stats,data.buffer);
    document.getElementById('drift').innerHTML=driftHtml(data.drift);
  }catch(e){}
}
setInterval(refresh,2000);
</script>
</body></html>`;
}

async function traceMiddleware(ctx, next) {
  if (ctx.path !== '/trace' && ctx.path !== '/trace.json') {
    await next();
    return;
  }
  const state = collectState(ctx.query || {});
  if (ctx.path === '/trace.json') {
    ctx.type = 'application/json';
    ctx.body = JSON.stringify(state);
    return;
  }
  ctx.type = 'text/html; charset=utf-8';
  ctx.body = renderPage(state, ctx.query || {});
}

module.exports = traceMiddleware;
