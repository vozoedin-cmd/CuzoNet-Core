import 'dotenv/config';
import { RouterOSClient } from '@sourceregistry/mikrotik-client/routeros';

const BASE_URL = 'http://localhost:3001/api/v1';
const TEST_NAME = process.argv[2];
if (!TEST_NAME) {
  console.error('Falta el nombre de usuario de prueba como argumento.');
  process.exit(1);
}

const PROFILE_1 = 'default';
const PROFILE_2 = '30_DIAS';
const SERVER = 'hotspot1';
const COMMENT_1 = 'CuzoNet E2E Hotspot - safe to delete';
const COMMENT_2 = 'CuzoNet E2E Hotspot - updated - safe to delete';

function parseRouterOsBoolean(value) {
  return value === 'yes' || value === 'true';
}

async function submit(actionType, targetId, idempotencyKey, innerPayload) {
  const res = await fetch(`${BASE_URL}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType,
      idempotencyKey,
      targetId,
      targetType: 'hotspot-user',
      inputSnapshotJson: JSON.stringify({ actionType, routerId: 'router-lab', ...innerPayload }),
    }),
  });
  const body = await res.json();
  if (res.status !== 202) throw new Error(`POST /requests -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function waitTerminal(id, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE_URL}/requests/${id}`);
    const body = await res.json();
    if (body.status === 'completed' || body.status === 'failed') return body;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout esperando estado terminal (${id})`);
}

const run = async (actionType, idempotencyKey, innerPayload) =>
  waitTerminal((await submit(actionType, TEST_NAME, idempotencyKey, innerPayload)).id);

const client = new RouterOSClient({
  host: process.env.MONITORING_ROUTEROS_HOST,
  password: process.env.MONITORING_ROUTEROS_PASSWORD,
  port: Number(process.env.MONITORING_ROUTEROS_PORT),
  timeoutMs: 5000,
  tls: process.env.MONITORING_ROUTEROS_TLS === 'true',
  username: process.env.MONITORING_ROUTEROS_USERNAME,
});
await client.connect();

const PROPS = '.id,name,server,profile,password,disabled,comment,limit-uptime,limit-bytes-total';
const routerFind = async (name) =>
  (await client.print('/ip/hotspot/user', { attributes: { '.proplist': PROPS }, queries: [`?name=${name}`] }))[0] ?? null;
const routerListNames = async () =>
  (await client.print('/ip/hotspot/user', { attributes: { '.proplist': 'name' } })).map((r) => r.name).sort();

const report = [];
let failed = false;
function record(step, expected, actual, command, verification, passed) {
  report.push({ step, expected, actual, command, verification, passed: passed ? 'APROBADO' : 'FALLIDO' });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step}\n        esperado: ${expected}\n        real:     ${actual}`);
  if (!passed) failed = true;
}
function stopIfFailed() {
  if (failed) throw new Error('DETENIDO por fallo. Evidencia conservada arriba.');
}

const namesBefore = await routerListNames();
console.log(`Usuarios hotspot antes del E2E: ${namesBefore.length}\n`);

// 1. Limpieza preventiva
const pre = await routerFind(TEST_NAME);
if (pre) await client.execute('/ip/hotspot/user/remove', { attributes: { numbers: pre['.id'] } });
record('1. Limpieza preventiva', 'usuario de prueba ausente', pre ? 'existia -> eliminado' : 'no existia',
  '/ip/hotspot/user/print (+remove si aplica)', `?name=${TEST_NAME}`, true);

// 2. Create
let res = await run('routeros.hotspot.user.create', `hs-e2e-create-1-${TEST_NAME}`, {
  name: TEST_NAME, profile: PROFILE_1, server: SERVER,
  credentialReference: 'HOTSPOT_E2E_TEST_PASSWORD', comment: COMMENT_1,
  limitUptime: '30m', limitBytesTotal: 10485760, disabled: false,
});
let r = await routerFind(TEST_NAME);
const createOk = res.status === 'completed' && r !== null && r.name === TEST_NAME &&
  r.profile === PROFILE_1 && r.server === SERVER && parseRouterOsBoolean(r.disabled) === false &&
  r.comment === COMMENT_1 && r['limit-uptime'] === '30m' && r['limit-bytes-total'] === '10485760';
record('2. Create', 'completed; name/profile/server/disabled/comment/limit-uptime/limit-bytes-total correctos',
  `status=${res.status}; ${JSON.stringify({ name: r?.name, profile: r?.profile, server: r?.server, disabled: r?.disabled, comment: r?.comment, lu: r?.['limit-uptime'], lbt: r?.['limit-bytes-total'] })}`,
  '/ip/hotspot/user/add', `?name=${TEST_NAME}`, createOk);
stopIfFailed();
const idCreated = r['.id'];

// 3. Create idempotente
res = await run('routeros.hotspot.user.create', `hs-e2e-create-2-${TEST_NAME}`, {
  name: TEST_NAME, profile: PROFILE_1, server: SERVER,
  credentialReference: 'HOTSPOT_E2E_TEST_PASSWORD', comment: COMMENT_1,
  limitUptime: '30m', limitBytesTotal: 10485760, disabled: false,
});
let dupes = await client.print('/ip/hotspot/user', { attributes: { '.proplist': '.id,name' }, queries: [`?name=${TEST_NAME}`] });
const idemOk = res.status === 'completed' && dupes.length === 1 && dupes[0]['.id'] === idCreated;
record('3. Create idempotente', 'completed; sin duplicado (mismo .id)',
  `status=${res.status}; registros=${dupes.length}; mismoId=${dupes[0]?.['.id'] === idCreated}`,
  '/ip/hotspot/user/print (sin /add)', `?name=${TEST_NAME}`, idemOk);
stopIfFailed();

// 4. Create con password diferente -> CONFLICTO
res = await run('routeros.hotspot.user.create', `hs-e2e-create-3-${TEST_NAME}`, {
  name: TEST_NAME, profile: PROFILE_1, server: SERVER,
  credentialReference: 'HOTSPOT_E2E_TEST_PASSWORD_ALT', comment: COMMENT_1,
  limitUptime: '30m', limitBytesTotal: 10485760, disabled: false,
});
r = await routerFind(TEST_NAME);
const pwdUnchanged = r.password === process.env.HOTSPOT_E2E_TEST_PASSWORD;
const conflictOk = res.status === 'failed' && res.lastErrorCode === 'ROUTEROS_HOTSPOT_CONFLICT' && pwdUnchanged && r['.id'] === idCreated;
record('4. Create con password diferente', 'failed; ROUTEROS_HOTSPOT_CONFLICT; password intacto',
  `status=${res.status}; code=${res.lastErrorCode}; passwordIntacto=${pwdUnchanged}`,
  '/ip/hotspot/user/print (sin /add ni /set)', 'comparacion booleana de password (valor nunca impreso)', conflictOk);
stopIfFailed();

// 5. Update
res = await run('routeros.hotspot.user.update', `hs-e2e-update-1-${TEST_NAME}`, {
  userReference: TEST_NAME, profile: PROFILE_2, comment: COMMENT_2,
  limitUptime: '1h', credentialReference: 'HOTSPOT_E2E_TEST_PASSWORD_UPDATED',
});
r = await routerFind(TEST_NAME);
const pwdUpdated = r.password === process.env.HOTSPOT_E2E_TEST_PASSWORD_UPDATED;
const updateOk = res.status === 'completed' && r.profile === PROFILE_2 && r.comment === COMMENT_2 &&
  r['limit-uptime'] === '1h' && pwdUpdated && r['.id'] === idCreated;
record('5. Update', 'completed; profile/comment/limit-uptime/password actualizados',
  `status=${res.status}; ${JSON.stringify({ profile: r.profile, comment: r.comment, lu: r['limit-uptime'] })}; passwordActualizado=${pwdUpdated}`,
  '/ip/hotspot/user/set', `?name=${TEST_NAME}`, updateOk);
stopIfFailed();

// 6. Update no-op
res = await run('routeros.hotspot.user.update', `hs-e2e-update-2-${TEST_NAME}`, {
  userReference: TEST_NAME, profile: PROFILE_2, comment: COMMENT_2,
  limitUptime: '1h', credentialReference: 'HOTSPOT_E2E_TEST_PASSWORD_UPDATED',
});
const rn = await routerFind(TEST_NAME);
const noopOk = res.status === 'completed' && rn.profile === PROFILE_2 && rn.comment === COMMENT_2 &&
  rn['limit-uptime'] === '1h' && rn['.id'] === idCreated;
record('6. Update no-op', 'completed; sin cambios',
  `status=${res.status}; sinCambios=${noopOk}`, '/ip/hotspot/user/print (updateData vacio => sin /set)', `?name=${TEST_NAME}`, noopOk);
stopIfFailed();

// 7. Disable
res = await run('routeros.hotspot.user.disable', `hs-e2e-disable-1-${TEST_NAME}`, { userReference: TEST_NAME });
r = await routerFind(TEST_NAME);
const disOk = res.status === 'completed' && r.disabled === 'yes' && parseRouterOsBoolean(r.disabled) === true;
record('7. Disable', 'completed; RouterOS disabled=yes; parseo => true',
  `status=${res.status}; raw=${r.disabled}; parsed=${parseRouterOsBoolean(r.disabled)}`,
  '/ip/hotspot/user/disable', `?name=${TEST_NAME}`, disOk);
stopIfFailed();

// 8. Disable idempotente
res = await run('routeros.hotspot.user.disable', `hs-e2e-disable-2-${TEST_NAME}`, { userReference: TEST_NAME });
r = await routerFind(TEST_NAME);
const disIdemOk = res.status === 'completed' && r.disabled === 'yes';
record('8. Disable idempotente', 'completed; sigue disabled=yes',
  `status=${res.status}; raw=${r.disabled}`, '/ip/hotspot/user/print (ya deshabilitado => sin /disable)', `?name=${TEST_NAME}`, disIdemOk);
stopIfFailed();

// 9. Enable
res = await run('routeros.hotspot.user.enable', `hs-e2e-enable-1-${TEST_NAME}`, { userReference: TEST_NAME });
r = await routerFind(TEST_NAME);
const enOk = res.status === 'completed' && r.disabled === 'no' && parseRouterOsBoolean(r.disabled) === false;
record('9. Enable', 'completed; RouterOS disabled=no; parseo => false',
  `status=${res.status}; raw=${r.disabled}; parsed=${parseRouterOsBoolean(r.disabled)}`,
  '/ip/hotspot/user/enable', `?name=${TEST_NAME}`, enOk);
stopIfFailed();

// 10. Enable idempotente
res = await run('routeros.hotspot.user.enable', `hs-e2e-enable-2-${TEST_NAME}`, { userReference: TEST_NAME });
r = await routerFind(TEST_NAME);
const enIdemOk = res.status === 'completed' && r.disabled === 'no';
record('10. Enable idempotente', 'completed; sigue disabled=no',
  `status=${res.status}; raw=${r.disabled}`, '/ip/hotspot/user/print (ya habilitado => sin /enable)', `?name=${TEST_NAME}`, enIdemOk);
stopIfFailed();

// 11. Remove
res = await run('routeros.hotspot.user.remove', `hs-e2e-remove-1-${TEST_NAME}`, { userReference: TEST_NAME });
const gone = await routerFind(TEST_NAME);
const remOk = res.status === 'completed' && gone === null;
record('11. Remove', 'completed; usuario ya no existe',
  `status=${res.status}; existe=${gone !== null}`, '/ip/hotspot/user/remove', `?name=${TEST_NAME}`, remOk);
stopIfFailed();

// 12. Remove repetido
res = await run('routeros.hotspot.user.remove', `hs-e2e-remove-2-${TEST_NAME}`, { userReference: TEST_NAME });
const remRepOk = res.status === 'completed';
record('12. Remove repetido', 'completed (exito idempotente segun contrato: handleRemove trata ausente como exito)',
  `status=${res.status}; code=${res.lastErrorCode ?? '(ninguno)'}`,
  '/ip/hotspot/user/print (no encontrado => sin /remove)', `?name=${TEST_NAME}`, remRepOk);
stopIfFailed();

// 13. Limpieza final
const namesAfter = await routerListNames();
const testGone = !namesAfter.includes(TEST_NAME);
const othersIntact = namesBefore.length === namesAfter.length && namesBefore.every((n) => namesAfter.includes(n));
record('13. Limpieza final', 'usuario E2E ausente; resto de usuarios intacto',
  `ausente=${testGone}; otrosIntactos=${othersIntact}; antes=${namesBefore.length}; despues=${namesAfter.length}`,
  '/ip/hotspot/user/print', 'listado completo antes/despues', testGone && othersIntact);

await client.close();
console.log('\n=== RESUMEN (sin credenciales) ===');
console.table(report.map((x) => ({ Paso: x.step, Estado: x.passed })));
console.log(failed ? '\nRESULTADO: FALLIDO' : '\nRESULTADO: TODOS LOS PASOS APROBADOS');
process.exit(failed ? 1 : 0);
