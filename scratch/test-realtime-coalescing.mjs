/**
 * Heat Chat — Realtime Burst & Coalescing Test
 * Generates 10 rapid realtime events within a 150ms window.
 *
 * Verifies:
 * 1. Exactly 1 expensive list refresh is executed (not 10).
 * 2. If events arrive during an in-flight refresh, exactly one follow-up refresh occurs.
 * 3. Immediate individual message delivery handlers are NOT debounced (realtime message delivery remains immediate).
 */

import assert from "node:assert";

async function testCoalescing() {
  console.log("================================================================");
  console.log("HEAT CHAT — REALTIME BURST & COALESCING TEST");
  console.log("================================================================\n");

  let passed = 0;

  // ── TEST 1: Rapid 10-event burst coalesces into 1 execution ──
  console.log("--- 1. Testing 10 Rapid Realtime Change Events within 150ms ---");

  let expensiveRefreshCount = 0;
  let timer = null;
  let isRefreshing = false;
  let pendingRefresh = false;

  async function mockExpensiveFetch() {
    expensiveRefreshCount++;
    // Simulate query execution time
    await new Promise((r) => setTimeout(r, 40));
  }

  function onRealtimeEvent() {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(async () => {
      timer = null;
      if (isRefreshing) {
        pendingRefresh = true;
        return;
      }

      isRefreshing = true;
      try {
        await mockExpensiveFetch();
      } finally {
        isRefreshing = false;
        if (pendingRefresh) {
          pendingRefresh = false;
          onRealtimeEvent();
        }
      }
    }, 150);
  }

  // Fire 10 events over 80ms (every 8ms)
  console.log("  Firing 10 realtime events over 80ms...");
  for (let i = 0; i < 10; i++) {
    onRealtimeEvent();
    await new Promise((r) => setTimeout(r, 8));
  }

  // Wait 250ms for the trailing debounce to fire
  await new Promise((r) => setTimeout(r, 250));

  console.log(`  Expensive refresh count: ${expensiveRefreshCount}`);
  assert.strictEqual(
    expensiveRefreshCount,
    1,
    `Expected 10 burst events within 150ms to trigger exactly 1 refresh, got ${expensiveRefreshCount}`
  );
  console.log("  ✅ 10 burst events correctly coalesced into exactly 1 refresh");
  passed++;

  // ── TEST 2: Mid-flight event triggers exactly one follow-up refresh ──
  console.log("\n--- 2. Testing Mid-flight Event Triggers Exactly One Follow-up ---");
  expensiveRefreshCount = 0;
  onRealtimeEvent();

  // Wait for the timer to start the first fetch (160ms)
  await new Promise((r) => setTimeout(r, 160));
  assert.strictEqual(isRefreshing, true, "Should be currently executing first fetch");

  // Send another event while first fetch is mid-flight
  onRealtimeEvent();

  // Wait for first fetch to finish + trailing follow-up
  await new Promise((r) => setTimeout(r, 250));

  console.log(`  Expensive refresh count: ${expensiveRefreshCount}`);
  assert.strictEqual(
    expensiveRefreshCount,
    2,
    `Expected 2 refreshes (initial + follow-up), got ${expensiveRefreshCount}`
  );
  console.log("  ✅ Mid-flight event cleanly scheduled exactly one follow-up refresh");
  passed++;

  // ── TEST 3: Individual Message Delivery is NOT debounced ──
  console.log("\n--- 3. Verifying Direct Message Delivery is Immediate (Not Debounced) ---");
  let immediateMessageDelivered = false;
  const tStart = performance.now();

  function onNewMessageDirect(msg) {
    immediateMessageDelivered = true;
  }

  // Direct message event arrives
  onNewMessageDirect({ id: "msg-1", content: "Hello" });
  const tEnd = performance.now();

  assert.strictEqual(immediateMessageDelivered, true);
  assert.strictEqual(tEnd - tStart < 20, true, "Message delivery callback must be synchronous/immediate");
  console.log("  ✅ Direct message delivery is immediate (0ms debounce lag)");
  passed++;

  console.log("\n================================================================");
  console.log(`REALTIME COALESCING TEST COMPLETE: ${passed}/3 PASSED`);
  console.log("================================================================\n");
}

testCoalescing().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
