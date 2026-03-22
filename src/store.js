const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STATE = {
  meta: {
    sequence: 1,
  },
  savedPosts: [],
  userPlaces: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return clone(DEFAULT_STATE);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return clone(DEFAULT_STATE);
  }

  const parsed = JSON.parse(raw);
  return {
    meta: {
      sequence: Number(parsed?.meta?.sequence || 1),
    },
    savedPosts: Array.isArray(parsed?.savedPosts) ? parsed.savedPosts : [],
    userPlaces: Array.isArray(parsed?.userPlaces) ? parsed.userPlaces : [],
  };
}

function createStore({ filePath = null } = {}) {
  let state = loadState(filePath);

  function persist() {
    if (!filePath) {
      return;
    }

    ensureParentDirectory(filePath);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  function nextId(prefix) {
    const id = `${prefix}_${state.meta.sequence++}`;
    return id;
  }

  function createSavedPost(input) {
    const now = new Date().toISOString();
    const savedPost = {
      id: nextId('post'),
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    state.savedPosts.unshift(savedPost);
    persist();
    return clone(savedPost);
  }

  function createUserPlace(input) {
    const now = new Date().toISOString();
    const userPlace = {
      id: nextId('place'),
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    state.userPlaces.unshift(userPlace);
    persist();
    return clone(userPlace);
  }

  function updateUserPlace(id, updates) {
    const target = state.userPlaces.find((place) => place.id === id);
    if (!target) {
      return null;
    }

    Object.assign(target, updates, {
      updatedAt: new Date().toISOString(),
    });
    persist();
    return clone(target);
  }

  function updateSavedPost(id, updates) {
    const target = state.savedPosts.find((post) => post.id === id);
    if (!target) {
      return null;
    }

    Object.assign(target, updates, {
      updatedAt: new Date().toISOString(),
    });
    persist();
    return clone(target);
  }

  function listUserPlaces(filters = {}) {
    return clone(
      state.userPlaces.filter((place) => {
        if (filters.query) {
          const haystack = [
            place.finalName,
            place.finalAddress,
            place.region,
            place.category,
            ...(place.tags || []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(filters.query.toLowerCase())) {
            return false;
          }
        }

        if (filters.status && place.status !== filters.status) {
          return false;
        }

        if (filters.region && place.region !== filters.region) {
          return false;
        }

        return true;
      }),
    );
  }

  function getUserPlaceById(id) {
    const item = state.userPlaces.find((place) => place.id === id) || null;
    return clone(item);
  }

  function getSavedPostById(id) {
    const item = state.savedPosts.find((post) => post.id === id) || null;
    return clone(item);
  }

  function findSavedPostByUserAndSource(userId, sourceUrl) {
    const item = state.savedPosts.find((post) => post.userId === userId && post.sourceUrl === sourceUrl) || null;
    return clone(item);
  }

  function findUserPlaceBySavedPostId(savedPostId) {
    const item = state.userPlaces.find((place) => place.savedPostId === savedPostId) || null;
    return clone(item);
  }

  function resetStore() {
    state = clone(DEFAULT_STATE);
    persist();
  }

  function dumpState() {
    return clone(state);
  }

  return {
    createSavedPost,
    createUserPlace,
    updateUserPlace,
    updateSavedPost,
    listUserPlaces,
    getUserPlaceById,
    getSavedPostById,
    findSavedPostByUserAndSource,
    findUserPlaceBySavedPostId,
    resetStore,
    dumpState,
  };
}

module.exports = {
  createStore,
};
