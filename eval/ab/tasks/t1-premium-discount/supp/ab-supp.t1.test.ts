// Razor A/B eval — supplementary hidden acceptance tests for t1-premium-discount.
// Never present in the agent's workspace; copied in only at grading time.
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

describe('[ab-supp t1]', () => {
  test('AC2: premium price is rounded up to a whole number', async () => {
    const addResponse = await testSetup
      .getHTTPClient()
      .post('/order', buildOrder({ isPremiumUser: true, totalPrice: 59 }));
    expect(addResponse.status).toBe(200);

    const fetched = await testSetup
      .getHTTPClient()
      .get(`/order/${addResponse.data.id}`);
    expect(fetched.data.totalPrice).toBe(54);
  });

  test('AC3: non-premium price is unchanged', async () => {
    const addResponse = await testSetup
      .getHTTPClient()
      .post('/order', buildOrder({ isPremiumUser: false, totalPrice: 100 }));
    expect(addResponse.status).toBe(200);

    const fetched = await testSetup
      .getHTTPClient()
      .get(`/order/${addResponse.data.id}`);
    expect(fetched.data.totalPrice).toBe(100);
  });
});
