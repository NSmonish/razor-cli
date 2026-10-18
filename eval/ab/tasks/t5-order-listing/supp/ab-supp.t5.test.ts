// Razor A/B eval — hidden acceptance tests for t5-order-listing.
// Never present in the agent's workspace; copied in only at grading time.
import nock from 'nock';
import { buildOrder } from './order-data-factory';
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

jest.setTimeout(30000);

const openapi = require('../openapi.json');

// a user id no other test uses, with the users service mocked for it
const freshUser = () => {
  const userId = 100000 + Math.floor(Math.random() * 1000000);
  nock('http://localhost').get(`/user/${userId}`).reply(200, { id: userId, name: 'Jane' }).persist();
  return userId;
};
const addOrders = async (userId: number, count: number) => {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push((await testSetup.getHTTPClienForArrange().post('/order', buildOrder({ userId }))).data.id);
  }
  return ids;
};
const list = (query: string) => testSetup.getHTTPClient().get(`/order?${query}`);

describe('[ab-supp t5]', () => {
  test("AC1: filtering by userId returns exactly that user's orders, ordered by id, with total", async () => {
    const userId = freshUser();
    const ids = await addOrders(userId, 3);
    await addOrders(freshUser(), 1); // someone else's order

    const response = await list(`userId=${userId}`);

    expect(response.status).toBe(200);
    expect(response.data.total).toBe(3);
    expect(response.data.items.map((o: { id: number }) => o.id)).toEqual(ids);
    expect(response.data.items.every((o: { userId: number }) => o.userId === userId)).toBe(true);
  });

  test('AC2: limit and offset page through the results; total ignores pagination', async () => {
    const userId = freshUser();
    const ids = await addOrders(userId, 3);

    const response = await list(`userId=${userId}&limit=2&offset=1`);

    expect(response.status).toBe(200);
    expect(response.data.items.map((o: { id: number }) => o.id)).toEqual(ids.slice(1, 3));
    expect(response.data.total).toBe(3);
  });

  test('AC3: limit defaults to 20 and offset to 0', async () => {
    const userId = freshUser();
    const ids = await addOrders(userId, 22);

    const response = await list(`userId=${userId}`);

    expect(response.status).toBe(200);
    expect(response.data.items).toHaveLength(20);
    expect(response.data.items[0].id).toBe(ids[0]);
    expect(response.data.total).toBe(22);
  });

  test('AC4: invalid query values respond 400', async () => {
    for (const query of ['userId=abc', 'limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=x']) {
      const response = await list(query);
      expect({ query, status: response.status }).toEqual({ query, status: 400 });
    }
  });

  test('AC5: the endpoint and its query parameters are documented in the OpenAPI document', () => {
    const operation = openapi.paths?.['/order']?.get;
    expect(operation).toBeDefined();
    const queryParams = (operation.parameters || []).filter((p: { in: string }) => p.in === 'query').map((p: { name: string }) => p.name);
    expect(queryParams).toEqual(expect.arrayContaining(['userId', 'limit', 'offset']));
  });
});
