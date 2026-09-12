import test from 'ava';
import createContext from '../../common/createContext';

test('createContext returns numeric context for number inputs', t => {
  const result = createContext(1, 200, 3000);

  t.deepEqual(result, {
    uid: 1,
    projectId: 200,
    interfaceId: 3000
  });
  t.is(typeof result.uid, 'number');
  t.is(typeof result.projectId, 'number');
  t.is(typeof result.interfaceId, 'number');
});

test('createContext converts pure numeric strings to numbers', t => {
  const result = createContext('1', '200', '3000');

  t.deepEqual(result, {
    uid: 1,
    projectId: 200,
    interfaceId: 3000
  });
  t.is(typeof result.uid, 'number');
  t.is(typeof result.projectId, 'number');
  t.is(typeof result.interfaceId, 'number');
});

test('createContext converts mixed number and string inputs', t => {
  const result = createContext(1, '200', 3000);

  t.deepEqual(result, {
    uid: 1,
    projectId: 200,
    interfaceId: 3000
  });
});

test('createContext keeps sign and decimals of numeric inputs', t => {
  const result = createContext(-1, '2.5', 3000);

  t.deepEqual(result, {
    uid: -1,
    projectId: 2.5,
    interfaceId: 3000
  });
});

test.serial('createContext returns NaN fields for missing params but keeps object shape', t => {
  const originError = console.error;
  let errorCount = 0;
  console.error = () => {
    errorCount++;
  };

  try {
    const result = createContext();

    t.deepEqual(Object.keys(result), ['uid', 'projectId', 'interfaceId']);
    t.true(Number.isNaN(result.uid));
    t.true(Number.isNaN(result.projectId));
    t.true(Number.isNaN(result.interfaceId));
    t.is(errorCount, 1);
  } finally {
    console.error = originError;
  }
});

test.serial('createContext converts empty string params to 0 but keeps object shape', t => {
  const originError = console.error;
  let errorCount = 0;
  console.error = () => {
    errorCount++;
  };

  try {
    const result = createContext('', '', '');

    t.deepEqual(Object.keys(result), ['uid', 'projectId', 'interfaceId']);
    t.deepEqual(result, {
      uid: 0,
      projectId: 0,
      interfaceId: 0
    });
    t.is(errorCount, 1);
  } finally {
    console.error = originError;
  }
});
