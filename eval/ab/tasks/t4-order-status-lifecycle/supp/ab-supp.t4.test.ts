// Razor A/B eval — hidden acceptance tests for t4-order-status-lifecycle.
// Never present in the agent's workspace; copied in only at grading time.
import sinon from 'sinon';
import { buildOrder } from './order-data-factory';
import MessageQueueClient from '../libraries/message-queue-client';
import { testSetup } from './setup/test-file-setup';

beforeAll(async () => {
  await testSetup.start({
    startAPI: true,
    disableNetConnect: true,
    includeTokenInHttpClient: true,
    mockGetUserCalls: true,
    mockMailerCalls: true,
  });
});

beforeEach(() => {
  testSetup.resetBeforeEach();
});

afterAll(async () => {
  testSetup.tearDownTestFile();
});

const { Client } = require('pg'); // require: the repo has no @types/pg
const dbConfig = require('../data-access/config/config');

const addOrder = async (overrides = {}) =>
  (await testSetup.getHTTPClienForArrange().post('/order', buildOrder(overrides))).data.id;
const changeStatus = (id: number, status: unknown) =>
  testSetup.getHTTPClient().patch(`/order/${id}/status`, { status });
const getStatus = async (id: number) => (await testSetup.getHTTPClient().get(`/order/${id}`)).data.status;

describe('[ab-supp t4]', () => {
  test('AC1: a new order starts as processing, whatever status the request sent', async () => {
    const id = await addOrder({ status: 'shipped' });

    expect(await getStatus(id)).toBe('processing');
  });

  test('AC2: processing -> shipped responds 200 with the updated order and is persisted', async () => {
    const id = await addOrder();

    const response = await changeStatus(id, 'shipped');

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ id, status: 'shipped' });
    expect(await getStatus(id)).toBe('shipped');
  });

  test('AC3: the full chain shipped -> delivered -> returned and processing -> cancelled are allowed', async () => {
    const id = await addOrder();
    expect((await changeStatus(id, 'shipped')).status).toBe(200);
    expect((await changeStatus(id, 'delivered')).status).toBe(200);
    expect((await changeStatus(id, 'returned')).status).toBe(200);
    expect(await getStatus(id)).toBe('returned');

    const other = await addOrder();
    expect((await changeStatus(other, 'cancelled')).status).toBe(200);
    expect(await getStatus(other)).toBe('cancelled');
  });

  test('AC4: a disallowed transition responds 409 and leaves the status unchanged', async () => {
    const id = await addOrder();
    const skipAhead = await changeStatus(id, 'delivered');
    expect(skipAhead.status).toBe(409);
    expect(await getStatus(id)).toBe('processing');

    await changeStatus(id, 'cancelled');
    const reopen = await changeStatus(id, 'processing');
    expect(reopen.status).toBe(409);
    expect(await getStatus(id)).toBe('cancelled');
  });

  test('AC5: an unknown status value responds 400', async () => {
    const id = await addOrder();

    expect((await changeStatus(id, 'teleported')).status).toBe(400);
    expect((await changeStatus(id, undefined)).status).toBe(400);
    expect(await getStatus(id)).toBe('processing');
  });

  test('AC6: changing the status of an order that does not exist responds 404', async () => {
    const response = await changeStatus(2147483000, 'shipped');

    expect(response.status).toBe(404);
  });

  test('AC7: a successful change publishes {orderId, from, to} to order.events / order.events.status-changed', async () => {
    const id = await addOrder();
    const publishSpy = sinon.spy(MessageQueueClient.prototype, 'publish');

    await changeStatus(id, 'shipped');

    const statusEvents = publishSpy.getCalls().filter((c) => c.args[1] === 'order.events.status-changed');
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].args[0]).toBe('order.events');
    expect(statusEvents[0].args[2]).toMatchObject({ orderId: id, from: 'processing', to: 'shipped' });
  });

  test('AC8: the status is stored in a status column of the Orders table', async () => {
    const id = await addOrder();
    await changeStatus(id, 'shipped');

    const db = new Client({
      host: dbConfig.host, port: dbConfig.port, user: dbConfig.username,
      password: dbConfig.password, database: dbConfig.database,
    });
    await db.connect();
    try {
      const result = await db.query('SELECT status FROM "Orders" WHERE id = $1', [id]);
      expect(result.rows[0].status).toBe('shipped');
    } finally {
      await db.end();
    }
  });
});
