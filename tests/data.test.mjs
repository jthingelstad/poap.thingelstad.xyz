import { test } from 'node:test';
import { validateData } from '../tools/validate-data.mjs';

test('the data contract is complete and consistent', async () => {
  await validateData();
});
