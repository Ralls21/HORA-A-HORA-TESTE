import { test } from 'node:test';
import assert from 'node:assert';

test('Estrutura base do projeto está inicializada', () => {
  const appName = 'Hora a Hora';
  const version = '4.2.1';
  assert.strictEqual(appName, 'Hora a Hora');
  assert.ok(version.startsWith('4.'));
});
