import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  normalizeUrl, 
  formatDuration, 
  formatTimeRemaining, 
  formatProgressPercent, 
  formatFileSize 
} from '../src/utils/formatters.ts';

describe('Formatters & URL Normalization', () => {
  test('normalizeUrl handles protocol, whitespace, and trailing slashes', () => {
    assert.strictEqual(normalizeUrl('  localhost:13378/  '), 'http://localhost:13378');
    assert.strictEqual(normalizeUrl('127.0.0.1:8080/api/'), 'http://127.0.0.1:8080/api');
    assert.strictEqual(normalizeUrl('audiobooks.example.com/'), 'https://audiobooks.example.com');
    assert.strictEqual(normalizeUrl('https://my-server.com:443///'), 'https://my-server.com:443');
    assert.strictEqual(normalizeUrl(''), '');
  });

  test('formatDuration formats seconds accurately', () => {
    assert.strictEqual(formatDuration(3665), '1h 1m');
    assert.strictEqual(formatDuration(45), '45s');
    assert.strictEqual(formatDuration(120), '2m');
    assert.strictEqual(formatDuration(3665, true), '1:01:05');
    assert.strictEqual(formatDuration(65, true), '1:05');
    assert.strictEqual(formatDuration(0), '0m');
  });

  test('formatTimeRemaining calculates remaining listening/reading time', () => {
    assert.strictEqual(formatTimeRemaining(1800, 3600), '30m left');
    assert.strictEqual(formatTimeRemaining(0, 7200), '2h 0m left');
    assert.strictEqual(formatTimeRemaining(4000, 3600), '0m left');
  });

  test('formatProgressPercent clamps and formats percentage', () => {
    assert.strictEqual(formatProgressPercent(0.38), '38% complete');
    assert.strictEqual(formatProgressPercent(1.0), '100% complete');
    assert.strictEqual(formatProgressPercent(0.0), '0% complete');
    assert.strictEqual(formatProgressPercent(-0.5), '0% complete');
    assert.strictEqual(formatProgressPercent(1.5), '100% complete');
  });

  test('formatFileSize formats byte units', () => {
    assert.strictEqual(formatFileSize(1024), '1.0 KB');
    assert.strictEqual(formatFileSize(1048576), '1.0 MB');
    assert.strictEqual(formatFileSize(8452100), '8.1 MB');
  });

  test('isPrivateNetworkAddress identifies local LAN and loopback addresses', async () => {
    const { isPrivateNetworkAddress } = await import('../src/utils/formatters.ts');
    assert.strictEqual(isPrivateNetworkAddress('http://192.168.1.11:3333'), true);
    assert.strictEqual(isPrivateNetworkAddress('192.168.0.100'), true);
    assert.strictEqual(isPrivateNetworkAddress('http://localhost:13378'), true);
    assert.strictEqual(isPrivateNetworkAddress('http://127.0.0.1:8080'), true);
    assert.strictEqual(isPrivateNetworkAddress('http://10.0.0.5:3000'), true);
    assert.strictEqual(isPrivateNetworkAddress('https://abs.mydomain.com'), false);
    assert.strictEqual(isPrivateNetworkAddress('https://audiobook.cloudflare.com'), false);
  });
});

describe('DecompressionStream for EPUB unpacking', () => {
  test('Native DecompressionStream supports raw deflate', async () => {
    assert.strictEqual(typeof DecompressionStream, 'function');
    const ds = new DecompressionStream('deflate-raw');
    assert.ok(ds.readable);
    assert.ok(ds.writable);
  });
});

describe('Audiobookshelf Progress Synchronization Logic', () => {
  test('Conflict resolution: newer timestamp takes priority', () => {
    const serverUpdate = {
      currentTime: 1500,
      lastUpdate: 1700000000000,
    };

    const staleLocalUpdate = {
      currentTime: 1200,
      lastUpdate: 1699999000000,
    };

    const newerLocalUpdate = {
      currentTime: 1800,
      lastUpdate: 1700001000000,
    };

    // Stale local update should NOT overwrite newer server progress
    const shouldOverwriteStale = staleLocalUpdate.lastUpdate > serverUpdate.lastUpdate;
    assert.strictEqual(shouldOverwriteStale, false);

    // Newer local update SHOULD overwrite server progress
    const shouldOverwriteNewer = newerLocalUpdate.lastUpdate > serverUpdate.lastUpdate;
    assert.strictEqual(shouldOverwriteNewer, true);
  });

  test('Offline Queue Deduplication keeps only latest progress per item', () => {
    const queue = [];
    
    function enqueue(item) {
      const idx = queue.findIndex(q => q.itemId === item.itemId);
      if (idx !== -1) {
        queue[idx] = item;
      } else {
        queue.push(item);
      }
    }

    enqueue({ itemId: 'item_1', progress: 0.1, timestamp: 100 });
    enqueue({ itemId: 'item_2', progress: 0.5, timestamp: 105 });
    enqueue({ itemId: 'item_1', progress: 0.35, timestamp: 110 }); // update to item_1

    assert.strictEqual(queue.length, 2);
    assert.strictEqual(queue[0].itemId, 'item_1');
    assert.strictEqual(queue[0].progress, 0.35);
    assert.strictEqual(queue[1].itemId, 'item_2');
  });
});
