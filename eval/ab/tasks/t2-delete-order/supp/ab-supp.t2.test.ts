// Razor A/B eval — supplementary hidden acceptance tests for t2-delete-order.
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

describe('[ab-supp t2]', () => {
  test('AC2: deleting an existing order responds 204 with an empty body', async () => {
    const orderId = (
      await testSetup.getHTTPClienForArrange().post('/order', buildOrder())
    ).data.id;

    const deleteResponse = await testSetup
      .getHTTPClient()
      .delete(`/order/${orderId}`);

    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.data).toBe('');
  });
});
