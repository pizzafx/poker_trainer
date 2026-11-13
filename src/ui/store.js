// What the page keeps on this device in IndexedDB: the last 100 hands you played (and markers for
// the hands folded for you), and the session in progress, so a reload carries on where you were.
// Every call fails quietly: without storage the table plays on, it just cannot remember.

const DB = 'gto-trainer';
const KEEP = 100;
let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) return reject(new Error('no IndexedDB'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('hands', { keyPath: 'key', autoIncrement: true });
        db.createObjectStore('session');
      };
      req.onsuccess = () => {
        const db = req.result;
        // another tab wants to upgrade or delete the store: let it
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    opening.catch(() => {});
  }
  return opening;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('aborted'));
});
const result = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// Adds a hand (or a 'skip' marker) and drops the oldest kept hands beyond 100, with any markers
// older than the oldest hand left. Returns false if it could not be kept.
export async function keepHand(rec) {
  try {
    const db = await open();
    const tx = db.transaction('hands', 'readwrite');
    const st = tx.objectStore('hands');
    const key = await result(st.add(rec));
    const all = await result(st.getAll());
    const hands = all.filter((r) => r.kind === 'hand');
    if (hands.length > KEEP) {
      const cut = hands[hands.length - KEEP].key;
      for (const r of all) if (r.key < cut) st.delete(r.key);
    }
    await done(tx);
    return key;
  } catch {
    return false;
  }
}

export async function listHands() {
  try {
    const db = await open();
    return await result(db.transaction('hands').objectStore('hands').getAll());
  } catch {
    return null;
  }
}

export async function clearHands() {
  try {
    const db = await open();
    const tx = db.transaction('hands', 'readwrite');
    tx.objectStore('hands').clear();
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

export async function saveSession(saved) {
  try {
    const db = await open();
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').put(saved, 'current');
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

// Never hold up the start of the page for long: no answer within 1.5 seconds means no session.
export async function loadSession() {
  const read = (async () => {
    try {
      const db = await open();
      return (await result(db.transaction('session').objectStore('session').get('current'))) || null;
    } catch {
      return null;
    }
  })();
  return Promise.race([read, new Promise((resolve) => setTimeout(() => resolve(null), 1500))]);
}

export async function clearSession() {
  try {
    const db = await open();
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').delete('current');
    await done(tx);
  } catch {
    /* nothing kept */
  }
}
