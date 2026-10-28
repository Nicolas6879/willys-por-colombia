import fs from 'node:fs';
const rows = fs.readFileSync('out/a.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const ord = ['caribe', 'pacifico', 'santander', 'llanos', 'cali', 'medellin'];
rows.sort((a, b) => ord.indexOf(a.reg) - ord.indexOf(b.reg) || String(a.n).localeCompare(String(b.n)));
let t = '| Region | Var | Prompt exacto | Tempo (alt. octava) | Tonalidad (conf) | Centroide Hz | Filtrado | Notas objetivas |\n|---|---|---|---|---|---|---|---|\n';
for (const o of rows) {
  const f = o.filtered.length > 0 && o.secs < 5;
  const tp = f ? '-' : o.tempo + (o.tempoHalf ? ` (mitad ${o.tempoHalf})` : '') + (o.tempoDouble ? ` (doble ${o.tempoDouble})` : '');
  const nt = [];
  if (f) nt.push('sin audio (prompt rechazado por el filtro)');
  else { if (o.tconf < 0.4) nt.push(`pulso poco estable (conf ${o.tconf})`); if (o.kconf < 0.5) nt.push('tonalidad ambigua'); if (o.centroid > 3000) nt.push('muy brillante'); if (o.centroid < 1300) nt.push('oscuro/grave'); }
  t += `| ${o.reg} | ${o.n} | ${o.prompt} | ${tp} | ${f ? '-' : `${o.key} (${o.kconf})`} | ${f ? '-' : o.centroid} | ${f ? 'SI' : 'no'} | ${nt.join('; ')} |\n`;
}
fs.writeFileSync('out/tabla.md', t);
