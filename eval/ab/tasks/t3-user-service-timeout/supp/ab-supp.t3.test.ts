// Razor A/B eval — supplementary hidden acceptance tests for t3-user-service-timeout.
// Never present in the agent's workspace; copied in only at grading time.
import nock from 'nock';
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

jest.setTimeout(15000);

const orderToAdd = { userId: 1, productId: 2, mode: 'approved' };

const usersServiceRepliesAfter = (delayMs: number) => {
  testSetup.removeUserNock();
  nock('http://localhost')
    .get('/user/1')
    .delay(delayMs)
    .reply(200, { id: 1, name: 'John' });
};

describe('[ab-supp t3]', () => {
  afterEach(() => {
    delete process.env.HTTP_TIMEOUT;
  });

  test('AC2: HTTP_TIMEOUT set after server start is honoured per request', async () => {
    process.env.HTTP_TIMEOUT = '500';
    usersServiceRepliesAfter(1000);

    const response = await testSetup.getHTTPClient().post('/order', orderToAdd);

    expect(response.status).toBe(503);
  });

  test('AC3: default timeout is not too short (1000 ms reply succeeds)', async () => {
    delete process.env.HTTP_TIMEOUT;
    usersServiceRepliesAfter(1000);

    const response = await testSetup.getHTTPClient().post('/order', orderToAdd);

    expect(response.status).toBe(200);
    expect(response.data.id).toEqual(expect.any(Number));
  });

  test('AC4: default timeout is not too long (2500 ms reply times out)', async () => {
    delete process.env.HTTP_TIMEOUT;
    usersServiceRepliesAfter(2500);

    const response = await testSetup.getHTTPClient().post('/order', orderToAdd);

    expect(response.status).toBe(503);
  });
});
