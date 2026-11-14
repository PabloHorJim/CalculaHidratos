const PORT = 9334, APP = 'http://localhost:4174/', FS = 'http://127.0.0.1:8085/v1/projects/demo-carbcalc/databases/(default)/documents';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const problems = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

function connect(url) {
  const ws = new WebSocket(url); let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach(l => l(m)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise(r => ws.addEventListener('open', () => r({ send, on: l => listeners.push(l), close: () => ws.close() })));
}
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);

async function device(label) {
  const { result: { browserContextId } } = await browser.send('Target.createBrowserContext');
  const { result: { targetId } } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const page = await connect(`ws://127.0.0.1:${PORT}/devtools/page/${targetId}`);
  page.on(m => {
    if (m.method === 'Runtime.exceptionThrown') problems.push(`${label} EXCEPTION: ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`${label} console.error: ` + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 260));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable'); await page.send('Network.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('carbcalc_consent','cloud'); localStorage.setItem('carbcalc_tutorial_done','true');
    window.confirm = () => true;
    window.__click = (text, nth = 0) => { const els = [...document.querySelectorAll('button')].filter(b => b.textContent.trim().includes(text)); if (!els[nth]) throw new Error('no button: ' + text); els[nth].click(); };
    window.__type = (selector, value, nth = 0) => { const el = document.querySelectorAll(selector)[nth]; if (!el) throw new Error('no input: ' + selector); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    window.__text = () => document.body.innerText.replace(/\\s+/g, ' ');
    window.__state = () => JSON.parse(localStorage.getItem('carb_calc_state') || '{}');
  ` });
  const ev = async expr => { const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(`${label}: ` + (r.result.exceptionDetails.exception?.description || 'eval failed') + ' in ' + expr.slice(0, 80)); return r.result.result.value; };
  const d = {
    label, ev,
    do: async (expr, wait = 500) => { await ev(expr); await sleep(wait); },
    text: () => ev('__text()'),
    state: () => ev('__state()'),
    header: async () => ((await ev('__text()')).match(/CarbCalc ([A-Za-zñó. ]+?) (Recetas|Reparto|Volver|Familia|Historial|Estad|Dosis|Mis|Ingredientes|Ajustes)/i) || [])[1],
    offline: on => page.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    open: async () => { await page.send('Page.navigate', { url: APP }); await sleep(2500); },
    signIn: async (email, name) => { await ev(`__emulatorSignIn('${email}','${name}').then(() => true)`); await sleep(3000); },
    waitFor: async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(500); } return false; },
    sidebar: async item => { await ev(`document.querySelector('header button').click()`); await sleep(500); await ev(`__click('${item}')`); await sleep(700); },
    cook: async (ingredientSearch, ingredientName, grams, recipeName) => {
      await d.do(`__click('Recetas')`);
      if ((await d.text()).includes('Volver a Recetas')) await d.do(`__click('Volver a Recetas')`);
      await d.do(`__click('Cocinar sin receta')`);
      await d.do(`__type('input[placeholder^="Buscar ingrediente"]', '${ingredientSearch}')`);
      await d.do(`__click('${ingredientName}')`);
      await d.do(`__type('input[inputmode=decimal]', '${grams}', 0)`);
      await d.do(`__type('input[placeholder^="Nombre de la receta"]', '${recipeName}')`);
      await d.do(`__click('Guardar')`, 800);
    }
  };
  return d;
}

// ---- Firestore emulator REST (admin) ----
const admin = { headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' } };
const fromValue = v => 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(fromValue) : 'mapValue' in v ? fromFields(v.mapValue.fields || {}) : undefined;
const fromFields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fromValue(v)]));
const toValue = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } } : { mapValue: { fields: toFields(v) } };
const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));
const getDoc = async path => { const r = await fetch(`${FS}/${path}`, admin); return r.ok ? fromFields((await r.json()).fields || {}) : null; };
const listDocs = async path => { const r = await fetch(`${FS}/${path}?pageSize=300`, admin); const j = await r.json(); return (j.documents || []).map(d => ({ name: d.name.split('/documents/')[1], ...fromFields(d.fields || {}) })); };
const patchDoc = (path, data, mask) => fetch(`${FS}/${path}${mask ? '?' + mask.map(m => 'updateMask.fieldPaths=' + m).join('&') : ''}`, { ...admin, method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) });

// ================= scenario =================
const A = await device('A'), B = await device('B'), C = await device('C');
await A.open(); await B.open(); await C.open();

// 1. Ana signs in, cooks and shares out a meal on her personal account
await A.signIn('ana@example.com', 'Ana');
check('A signed in and synced', await A.waitFor(async () => /Nube OK/i.test(await A.header() || '')), await A.header());
await A.cook('arroz blanco', 'Arroz Blanco', 200, 'Paella e2e');
await A.do(`__click('Reparto')`);
await A.do(`__click('Sin utensilio')`);
await A.do(`__type('input[inputmode=decimal]', '1000', 0)`, 3500);
const anaUser = (await listDocs('users')).find(u => u.email === 'ana@example.com');
const anaUid = anaUser.name.split('/')[1];
let meals = await listDocs(`users/${anaUid}/meals`);
check('personal meal stored as its own document', meals.length === 1 && meals[0].recipeName === 'Paella e2e' && meals[0].portions.length === 2, JSON.stringify(meals.map(m => [m.recipeName, m.totalCarbs, m.netWeight])));
const anaDoc = await getDoc(`users/${anaUid}`);
check('personal document: recipes synced, history flagged as migrated, no history array', anaDoc.recipes?.length === 1 && anaDoc.historyMigrated === true && !('mealHistory' in anaDoc));

// 2. Ana creates a family group
await A.do(`__click('Familia')`);
await A.do(`__type('input[placeholder^="Nombre (ej"]', 'Familia e2e')`);
await A.do(`__click('Crear')`, 4000);
const code = await A.ev(`document.querySelector('.font-mono.tracking-widest')?.textContent || ''`);
check('group created with an 8 character code', /^[A-Z2-9]{8}$/.test(code), code);
let group = await getDoc(`groups/${code}`);
check('group lists Ana as only member and admin', JSON.stringify(group.memberUids) === JSON.stringify([anaUid]) && group.adminUid === anaUid);
check('history moved into the group', await A.waitFor(async () => (await listDocs(`groups/${code}/meals`)).length === 1));

// 3. Bob joins with the code and sees everything
await B.signIn('bob@example.com', 'Bob');
await B.do(`__click('Familia')`);
await B.do(`__type('input[placeholder="Código de invitación"]', '${code}')`);
await B.do(`__click('Unirse')`, 4000);
check('B sees the shared recipe', await B.waitFor(async () => (await B.state()).recipes?.some(r => r.name === 'Paella e2e')));
check('B sees the shared meal history', await B.waitFor(async () => (await B.state()).mealHistory?.some(m => m.recipeName === 'Paella e2e')));
check('B header shows synced', await B.waitFor(async () => /Nube OK/i.test(await B.header() || '')), await B.header());
await A.do(`__click('Familia')`);
check('A sees both members', await A.waitFor(async () => { const t = await A.text(); return /Miembros.*Ana.*Bob/i.test(t); }));
group = await getDoc(`groups/${code}`);
check('group document lists two members', group.memberUids.length === 2);

// 4. Live sync both ways
await B.do(`document.querySelector('button.bg-blue-500.rounded-full').click()`, 300); // add family member
check('A receives the family member added by B', await A.waitFor(async () => (await A.state()).family?.length === 3));
await A.sidebar('Mis Utensilios');
await A.do(`document.querySelector('button.bg-purple-500.rounded-full').click()`, 300);
check('B receives the utensil added by A', await B.waitFor(async () => (await B.state()).cookware?.length === 3));

// 5. B goes offline; both keep working; everything merges on reconnect
await B.offline(true);
await B.cook('lentejas', 'Lentejas', 300, 'Lentejas offline');
await B.do(`__click('Familia')`);
await B.do(`document.querySelector('button.bg-blue-500.rounded-full').click()`, 300);
await A.cook('pan blanco', 'Pan', 100, 'Bocadillo online');
await A.sidebar('Mis Utensilios');
await A.do(`document.querySelector('button.bg-purple-500.rounded-full').click()`, 2500);
const offlineSeen = await B.waitFor(async () => /Sin conexi/i.test(await B.header() || ''), 60000);
check('B shows it is offline', offlineSeen, await B.header());
check('nothing from B reached the server while offline', !(await listDocs(`groups/${code}/meals`)).some(m => m.recipeName === 'Lentejas offline'));
await B.ev(`location.reload()`).catch(() => {}); await sleep(3000); // app restarted while offline
check('B keeps its offline work after a restart', (await B.state()).mealHistory?.some(m => m.recipeName === 'Lentejas offline'));
await B.offline(false);
await B.ev(`location.reload()`); await sleep(3000);
const names = s => (s.mealHistory || []).map(m => m.recipeName).sort().join(', ');
const merged = await B.waitFor(async () => {
  const [a, b] = [await A.state(), await B.state()];
  return [a, b].every(s => s.mealHistory?.length === 3 && s.family?.length === 4 && s.cookware?.length === 4 && s.recipes?.length === 3);
}, 40000);
const [sa, sb] = [await A.state(), await B.state()];
check('after reconnect both devices have all meals, recipes, members and utensils', merged,
  `A: ${names(sa)} | fam ${sa.family?.length} cook ${sa.cookware?.length} rec ${sa.recipes?.length} · B: ${names(sb)} | fam ${sb.family?.length} cook ${sb.cookware?.length} rec ${sb.recipes?.length}`);
meals = await listDocs(`groups/${code}/meals`);
check('server has the three meals as separate documents', meals.length === 3, meals.map(m => m.recipeName).sort().join(', '));

// 6. Patient mode: private dose log
await A.sidebar('Modo paciente');
await A.do(`document.querySelector('input[type=checkbox]').click()`);
const firstMember = (await A.state()).family[0].id;
await A.do(`__type('#patient-member', '${firstMember}')`);
await A.do(`__click('Dosis')`, 800);
await A.do(`__click('Otra cantidad')`).catch(() => {});
await A.do(`__type('input[aria-label="Hidratos de la comida"]', '60')`);
await A.do(`__type('input[aria-label="Glucemia actual en mg/dL"]', '210')`);
const doseText = ((await A.text()).match(/Dosis sugerida ([\d.]+) U/i) || [])[1];
check('dose = 60 g/10 × 1 + (210 − 110)/50 = 8 U', doseText === '8.0', doseText);
await A.do(`__click('Registrar')`, 3500);
const patientDoc = await getDoc(`users/${anaUid}/private/patient`);
check('dose log saved in the private document', patientDoc?.bolusHistory?.length === 1 && patientDoc.bolusHistory[0].administeredDose === 8 && patientDoc.settings?.enabled === true);
group = await getDoc(`groups/${code}`);
check('no patient data in the family group', !JSON.stringify(group).includes('bolus') && !('patientSettings' in group));

// 7. A group created by the old app: registration and history migration
await C.signIn('carl@example.com', 'Carl');
const carlUid = (await listDocs('users')).find(u => u.email === 'carl@example.com').name.split('/')[1];
const legacyMeal = (id, name, ts) => ({ id, timestamp: ts, recipeName: name, totalCarbs: 50, netWeight: 400, portions: [] });
await patchDoc('groups/OLD123', { id: 'OLD123', name: 'Grupo antiguo', adminUid: carlUid, inviteCode: 'OLD123',
  recipes: [{ id: 'r1', name: 'Receta antigua', ingredients: [{ ingredientId: '1', weight: 100 }] }],
  family: [{ id: '1', name: 'Carl', proportion: 1, isDiabetic: true, isActive: true }], cookware: [], customIngredients: [],
  mealHistory: [legacyMeal('100', 'Cena antigua', '2026-11-10T20:00:00.000Z'), legacyMeal('101', 'Comida antigua', '2026-11-11T13:00:00.000Z')] });
await patchDoc(`users/${carlUid}`, { groupId: 'OLD123' }, ['groupId']);
check('C adopts the old group data', await C.waitFor(async () => (await C.state()).recipes?.some(r => r.name === 'Receta antigua')));
check('old history migrated to the meals collection', await C.waitFor(async () => (await listDocs('groups/OLD123/meals')).length === 2));
const legacy = await getDoc('groups/OLD123');
check('old group now has a member list and the migration flag', JSON.stringify(legacy.memberUids) === JSON.stringify([carlUid]) && legacy.historyMigrated === true);
check('C shows the migrated meals', (await C.state()).mealHistory?.length === 2, names(await C.state()));

// 8. Admin removes Bob
await A.do(`__click('Familia')`);
await A.do(`document.querySelector('button[title="Expulsar a Bob"]').click()`, 2500);
group = await getDoc(`groups/${code}`);
check('Bob removed and blocked in the group document', group.memberUids.length === 1 && group.blockedUids.includes((await listDocs('users')).find(u => u.email === 'bob@example.com').name.split('/')[1]));
check('Bob\'s app leaves the group', await B.waitFor(async () => !(await B.state()).groupId, 30000));

await sleep(1500);
const real = [...new Set(problems)];
console.log(real.length ? `\nConsole problems (${real.length}):\n` + real.join('\n') : '\nNo exceptions or console errors.');
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
browser.close(); process.exit(0);
