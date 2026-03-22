const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { createStore } = require('./store');
const { analyzeSharedPost } = require('./extractor');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, {
    error: 'not_found',
    message: 'The requested resource could not be found.',
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });

    req.on('error', reject);
  });
}

function validateIntakePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Payload must be a JSON object.';
  }

  if (!payload.userId || typeof payload.userId !== 'string') {
    return 'userId is required.';
  }

  if (!payload.sourceUrl || typeof payload.sourceUrl !== 'string') {
    return 'sourceUrl is required.';
  }

  return null;
}

function validatePlacePatch(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Payload must be a JSON object.';
  }

  if (payload.tags && !Array.isArray(payload.tags)) {
    return 'tags must be an array when provided.';
  }

  if (payload.selectedCandidateIndex != null && !Number.isInteger(payload.selectedCandidateIndex)) {
    return 'selectedCandidateIndex must be an integer.';
  }

  return null;
}

function createDefaultStore() {
  return createStore({ filePath: path.join(process.cwd(), 'data', 'app-data.json') });
}

function createApp({ store = createDefaultStore() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        persistence: 'json-file',
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/intake/shared-post') {
      try {
        const payload = await readJsonBody(req);
        const validationError = validateIntakePayload(payload);

        if (validationError) {
          return sendJson(res, 400, {
            error: 'validation_error',
            message: validationError,
          });
        }

        const existingPost = store.findSavedPostByUserAndSource(payload.userId, payload.sourceUrl);
        if (existingPost) {
          const existingPlace = store.findUserPlaceBySavedPostId(existingPost.id);
          return sendJson(res, 200, {
            deduplicated: true,
            savedPost: existingPost,
            userPlace: existingPlace,
          });
        }

        const analysis = analyzeSharedPost({
          sharedText: payload.sharedText || '',
          ocrText: payload.ocrText || '',
        });

        const savedPost = store.createSavedPost({
          userId: payload.userId,
          sourcePlatform: 'instagram',
          sourceUrl: payload.sourceUrl,
          rawSharedText: payload.sharedText || '',
          rawOcrText: payload.ocrText || '',
          status: analysis.reviewState,
          analysis,
        });

        const selectedCandidate = analysis.candidates[0] || null;
        const userPlace = store.createUserPlace({
          userId: payload.userId,
          savedPostId: savedPost.id,
          finalName: analysis.placeName || '미확인 장소',
          finalAddress: analysis.address || null,
          region: analysis.region,
          category: analysis.category,
          status: 'want_to_go',
          reviewState: analysis.reviewState,
          tags: Array.isArray(payload.tags) ? payload.tags : [],
          userNote: payload.userNote || '',
          selectedCandidate,
          sourceUrl: payload.sourceUrl,
          candidateCount: analysis.candidates.length,
        });

        return sendJson(res, 201, {
          deduplicated: false,
          savedPost,
          userPlace,
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown_error';
        const statusCode = message === 'invalid_json' ? 400 : message === 'payload_too_large' ? 413 : 500;
        return sendJson(res, statusCode, {
          error: 'request_error',
          message,
        });
      }
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/saved-posts/')) {
      const id = url.pathname.split('/').pop();
      const savedPost = store.getSavedPostById(id);
      if (!savedPost) {
        return notFound(res);
      }
      return sendJson(res, 200, savedPost);
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/places') {
      const items = store.listUserPlaces({
        query: url.searchParams.get('query') || '',
        status: url.searchParams.get('status') || '',
        region: url.searchParams.get('region') || '',
      });

      return sendJson(res, 200, {
        items,
        total: items.length,
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/places/')) {
      const id = url.pathname.split('/').pop();
      const place = store.getUserPlaceById(id);

      if (!place) {
        return notFound(res);
      }

      const savedPost = store.getSavedPostById(place.savedPostId);
      return sendJson(res, 200, {
        ...place,
        savedPost,
      });
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/v1/places/')) {
      try {
        const id = url.pathname.split('/').pop();
        const place = store.getUserPlaceById(id);
        if (!place) {
          return notFound(res);
        }

        const payload = await readJsonBody(req);
        const validationError = validatePlacePatch(payload);
        if (validationError) {
          return sendJson(res, 400, {
            error: 'validation_error',
            message: validationError,
          });
        }

        const selectedCandidate = payload.selectedCandidateIndex != null
          ? place.selectedCandidate || null
          : place.selectedCandidate;

        const savedPost = store.getSavedPostById(place.savedPostId);
        const nextSelectedCandidate = payload.selectedCandidateIndex != null
          ? savedPost?.analysis?.candidates?.[payload.selectedCandidateIndex] || null
          : selectedCandidate;

        const updatedPlace = store.updateUserPlace(id, {
          finalName: payload.finalName || place.finalName,
          finalAddress: payload.finalAddress || place.finalAddress,
          region: payload.region || place.region,
          category: payload.category || place.category,
          status: payload.status || place.status,
          tags: Array.isArray(payload.tags) ? payload.tags : place.tags,
          userNote: payload.userNote != null ? payload.userNote : place.userNote,
          reviewState: payload.reviewState || 'confirmed',
          selectedCandidate: nextSelectedCandidate,
        });

        const updatedSavedPost = store.updateSavedPost(place.savedPostId, {
          status: updatedPlace.reviewState,
        });

        return sendJson(res, 200, {
          userPlace: updatedPlace,
          savedPost: updatedSavedPost,
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown_error';
        const statusCode = message === 'invalid_json' ? 400 : message === 'payload_too_large' ? 413 : 500;
        return sendJson(res, statusCode, {
          error: 'request_error',
          message,
        });
      }
    }

    return notFound(res);
  });
}

module.exports = {
  createApp,
};
