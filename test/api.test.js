const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../src/app');
const { createStore } = require('../src/store');

async function startServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jinseo-test-'));
  const store = createStore({ filePath: path.join(tempDir, 'app-data.json') });
  const server = createApp({ store });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}`, store, tempDir };
}

async function closeServer(server) {
  server.close();
  await once(server, 'close');
}

test('POST /api/v1/intake/shared-post persists a place and analysis payload', async () => {
  const { server, baseUrl, store } = await startServer();

  const response = await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'user_123',
      sourceUrl: 'https://www.instagram.com/p/example',
      sharedText: '상호: 성수브런치랩\n서울 성동구 연무장길 12\n브런치 맛집',
      tags: ['성수', '브런치'],
    }),
  });

  assert.equal(response.status, 201);
  const json = await response.json();
  assert.equal(json.userPlace.finalName, '성수브런치랩');
  assert.equal(json.userPlace.finalAddress, '서울 성동구 연무장길 12');
  assert.equal(json.userPlace.category, 'brunch');
  assert.equal(json.savedPost.analysis.reviewState, 'ready_to_confirm');
  assert.equal(store.dumpState().savedPosts.length, 1);

  await closeServer(server);
});

test('POST /api/v1/intake/shared-post deduplicates by user and sourceUrl', async () => {
  const { server, baseUrl } = await startServer();
  const payload = {
    userId: 'user_123',
    sourceUrl: 'https://www.instagram.com/p/example',
    sharedText: '상호: 성수브런치랩\n서울 성동구 연무장길 12\n브런치 맛집',
  };

  const first = await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(second.status, 200);
  const json = await second.json();
  assert.equal(json.deduplicated, true);

  await closeServer(server);
});

test('GET /api/v1/places supports query filtering', async () => {
  const { server, baseUrl } = await startServer();

  await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'user_123',
      sourceUrl: 'https://www.instagram.com/p/example-2',
      sharedText: '상호: 망원카페공원\n서울 마포구 포은로 77\n카페',
      tags: ['망원'],
    }),
  });

  const response = await fetch(`${baseUrl}/api/v1/places?query=망원`);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.total, 1);
  assert.equal(json.items[0].region, '망원');

  await closeServer(server);
});

test('PATCH /api/v1/places/:id lets the user confirm and correct an extracted place', async () => {
  const { server, baseUrl } = await startServer();

  const createResponse = await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'user_123',
      sourceUrl: 'https://www.instagram.com/p/example-3',
      sharedText: '상호: 합정파스타연구소\n서울 마포구 양화로6길 12\n파스타 맛집',
    }),
  });
  const created = await createResponse.json();

  const response = await fetch(`${baseUrl}/api/v1/places/${created.userPlace.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      finalName: '합정 파스타 연구소',
      tags: ['합정', '파스타', '데이트'],
      reviewState: 'confirmed',
      selectedCandidateIndex: 0,
    }),
  });

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.userPlace.finalName, '합정 파스타 연구소');
  assert.equal(json.userPlace.reviewState, 'confirmed');
  assert.deepEqual(json.userPlace.tags, ['합정', '파스타', '데이트']);
  assert.equal(json.savedPost.status, 'confirmed');

  await closeServer(server);
});

test('POST /api/v1/intake/shared-post validates required fields', async () => {
  const { server, baseUrl } = await startServer();

  const response = await fetch(`${baseUrl}/api/v1/intake/shared-post`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceUrl: 'https://example.com' }),
  });

  assert.equal(response.status, 400);
  const json = await response.json();
  assert.match(json.message, /userId is required/);

  await closeServer(server);
});
