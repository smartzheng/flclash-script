const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function run(proxies, extra = {}) {
  const scope = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./rules.js'), 'utf8'), scope);
  const input = JSON.parse(JSON.stringify({ proxies, ...extra }));
  return JSON.parse(JSON.stringify(scope.main(input)));
}
function jp(code, extra = {}) {
  return { name: `日本 ${code} 移动路由 高带宽优化`, type: 'trojan', port: 443, ...extra };
}
function fallback(config) {
  return config['proxy-groups'].find(g => g.name === 'ChatGPT-故障转移');
}
const codes = names => names.map(n => n.match(/A\d+/)?.[0]);

test('interleaves measured exits even when subscription groups aliases by exit', () => {
  const nodes = ['A01', 'A11', 'A21', 'A02', 'A12', 'A22'].map(c => jp(c));
  const out = run(nodes);
  assert.deepEqual(codes(fallback(out).proxies), ['A01', 'A02', 'A11', 'A12', 'A21', 'A22']);
  assert.equal(fallback(out).interval, 120);
  assert.ok(out.rules.includes('DOMAIN-SUFFIX,chatgpt.com,ChatGPT'));
  assert.ok(out.dns['nameserver-policy']['+.chatgpt.com'].every(s => s.endsWith('#ChatGPT')));
  const manual = out['proxy-groups'].find(g => g.name === 'ChatGPT');
  assert.equal(manual['default-selected'], 'ChatGPT-故障转移');
  assert.deepEqual(run(out.proxies, out), out);
});

test('keeps per-exit node preference while prioritizing a different exit', () => {
  const out = run([jp('A01'), jp('A11', { 'reality-opts': {} }), jp('A21'), jp('A02'), jp('A12')]);
  assert.deepEqual(codes(fallback(out).proxies), ['A11', 'A02', 'A01', 'A12', 'A21']);
});

test('retains unmeasured nodes without claiming their exits are different', () => {
  const out = run([jp('A31'), jp('A01'), jp('A11'), jp('A02')]);
  assert.deepEqual(codes(fallback(out).proxies), ['A01', 'A02', 'A11', 'A31']);
  assert.deepEqual(codes(fallback(run([jp('A31'), jp('A32')])).proxies), ['A31', 'A32']);
});

test('includes every manual candidate in failover, preserving region order and existing groups', () => {
  const existing = { name: 'Other', type: 'url-test', interval: 600, proxies: ['DIRECT'] };
  const nodes = ['A01', 'A11', 'A21', 'A02', 'A12', 'A22'].map(c => jp(c));
  for (const name of ['新加坡 A01 电信优化', '新加坡 A02 电信优化', 'TW A01', 'KR A01', 'US A01', 'CA A01', 'DE A01']) {
    nodes.unshift({ name, type: 'trojan', port: 443 });
  }
  const out = run(nodes, { 'proxy-groups': [existing] });
  const manual = out['proxy-groups'].find(g => g.name === 'ChatGPT');
  assert.equal(fallback(out).proxies.length, 13);
  assert.equal(manual.proxies[0], 'ChatGPT-故障转移');
  assert.deepEqual(fallback(out).proxies.slice().sort(), manual.proxies.slice(1).sort());
  assert.deepEqual(codes(fallback(out).proxies.slice(0, 6)), ['A01', 'A02', 'A11', 'A12', 'A21', 'A22']);
  assert.deepEqual(out['proxy-groups'].slice(0, 2).map(g => g.name), ['ChatGPT-故障转移', 'ChatGPT']);
  assert.deepEqual(out['proxy-groups'][2], existing);
});
