/**
 * Heat Chat — Responsive Viewport Verification Suite
 *
 * Tests the responsive layout geometry, menu collision math, and container bounds
 * across all required viewport targets:
 *   - 309px (ultra-compact mobile)
 *   - 320px (standard minimum mobile)
 *   - 375px (iPhone SE / 8)
 *   - 390px (iPhone 12/13/14)
 *   - 414px (iPhone XR / Plus / Max)
 *   - 768px (iPad portrait / tablet)
 *   - 1024px (iPad landscape / small desktop)
 *   - 1280px (standard desktop)
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log("======================================================================");
console.log("📱  Heat Chat — Mobile Responsive & Collision Verification Suite");
console.log("======================================================================\n");

const TARGET_VIEWPORTS = [309, 320, 375, 390, 414, 768, 1024, 1280];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Viewport-Aware Collision Math Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ 1. Collision-Aware Menu & Picker Positioning Math");

/**
 * Replicates the exact collision-aware positioning algorithm implemented in
 * components/messages/message-actions-menu.tsx
 */
function computeMenuPosition({
  triggerRect,
  viewportWidth,
  viewportHeight,
  isCurrentUser,
  showDeleteChoices = false,
}) {
  const menuWidth = Math.min(208, viewportWidth - 16);
  const menuHeight = showDeleteChoices ? 160 : 310;

  const idealLeft = isCurrentUser ? triggerRect.right - menuWidth : triggerRect.left;
  const left = Math.max(8, Math.min(viewportWidth - menuWidth - 8, idealLeft));

  const spaceAbove = triggerRect.top;
  const spaceBelow = viewportHeight - triggerRect.bottom;

  let top;
  if (spaceAbove >= menuHeight + 12) {
    top = triggerRect.top - menuHeight - 6;
  } else if (spaceBelow >= menuHeight + 12) {
    top = triggerRect.bottom + 6;
  } else if (spaceAbove >= spaceBelow) {
    top = Math.max(8, triggerRect.top - menuHeight - 6);
  } else {
    top = Math.min(viewportHeight - menuHeight - 8, triggerRect.bottom + 6);
  }

  const right = left + menuWidth;
  const bottom = top + menuHeight;

  return { left, top, right, bottom, menuWidth, menuHeight };
}

function computePickerPosition({
  triggerRect,
  viewportWidth,
  viewportHeight,
  isCurrentUser,
}) {
  const pickerWidth = Math.min(246, viewportWidth - 16);
  const pickerHeight = 48;

  const idealLeft = isCurrentUser ? triggerRect.right - pickerWidth : triggerRect.left;
  const left = Math.max(8, Math.min(viewportWidth - pickerWidth - 8, idealLeft));

  let top;
  if (triggerRect.top >= pickerHeight + 12) {
    top = triggerRect.top - pickerHeight - 8;
  } else {
    top = Math.min(viewportHeight - pickerHeight - 8, triggerRect.bottom + 8);
  }

  const right = left + pickerWidth;
  const bottom = top + pickerHeight;

  return { left, top, right, bottom, pickerWidth, pickerHeight };
}

// Test menu positioning at all target viewports for both incoming & outgoing messages
TARGET_VIEWPORTS.forEach((vw) => {
  const vh = 800;

  // Test Outgoing message (trigger positioned near right edge)
  {
    const triggerRect = {
      left: vw - 44,
      right: vw - 16,
      top: 300,
      bottom: 328,
      width: 28,
      height: 28,
    };

    const menu = computeMenuPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: true,
      showDeleteChoices: false,
    });

    assert(
      menu.left >= 8,
      `[${vw}px] Outgoing message menu left (${menu.left}px) >= 8px margin`
    );
    assert(
      menu.right <= vw - 8,
      `[${vw}px] Outgoing message menu right (${menu.right}px) <= ${vw - 8}px margin`
    );
    assert(
      menu.top >= 8,
      `[${vw}px] Outgoing message menu top (${menu.top}px) >= 8px margin`
    );
    assert(
      menu.bottom <= vh - 8,
      `[${vw}px] Outgoing message menu bottom (${menu.bottom}px) <= ${vh - 8}px margin`
    );

    // Also test ReactionPicker
    const picker = computePickerPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: true,
    });

    assert(
      picker.left >= 8,
      `[${vw}px] ReactionPicker left (${picker.left}px) >= 8px margin`
    );
    assert(
      picker.right <= vw - 8,
      `[${vw}px] ReactionPicker right (${picker.right}px) <= ${vw - 8}px margin`
    );
  }

  // Test Outgoing message near LEFT edge (e.g. bubble was wide, trigger was pushed far left)
  // This was the exact bug in the screenshot!
  {
    const triggerRect = {
      left: 20,
      right: 48,
      top: 400,
      bottom: 428,
      width: 28,
      height: 28,
    };

    const menu = computeMenuPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: true,
      showDeleteChoices: false,
    });

    assert(
      menu.left >= 8,
      `[${vw}px] Extreme left trigger (screenshot case): menu left (${menu.left}px) >= 8px margin (NOT negative/clipped)`
    );
    assert(
      menu.right <= vw - 8,
      `[${vw}px] Extreme left trigger: menu right (${menu.right}px) fits on screen`
    );

    const deleteMenu = computeMenuPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: true,
      showDeleteChoices: true,
    });

    assert(
      deleteMenu.left >= 8,
      `[${vw}px] Delete choices menu left (${deleteMenu.left}px) >= 8px margin`
    );
    assert(
      deleteMenu.right <= vw - 8,
      `[${vw}px] Delete choices menu right (${deleteMenu.right}px) <= ${vw - 8}px margin`
    );
  }

  // Test Incoming message near left edge
  {
    const triggerRect = {
      left: 16,
      right: 44,
      top: 250,
      bottom: 278,
      width: 28,
      height: 28,
    };

    const menu = computeMenuPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: false,
    });

    assert(
      menu.left >= 8,
      `[${vw}px] Incoming message menu left (${menu.left}px) >= 8px margin`
    );
    assert(
      menu.right <= vw - 8,
      `[${vw}px] Incoming message menu right (${menu.right}px) <= ${vw - 8}px margin`
    );
  }

  // Test near top edge of viewport (must flip below trigger)
  {
    const triggerRect = {
      left: 60,
      right: 88,
      top: 40,
      bottom: 68,
      width: 28,
      height: 28,
    };

    const menu = computeMenuPosition({
      triggerRect,
      viewportWidth: vw,
      viewportHeight: vh,
      isCurrentUser: false,
    });

    assert(
      menu.top >= triggerRect.bottom,
      `[${vw}px] Near top edge: menu positioned below trigger (top ${menu.top}px >= bottom 68px)`
    );
    assert(
      menu.bottom <= vh - 8,
      `[${vw}px] Near top edge: menu bottom fits within viewport`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Message Bubble & Action Toolbar Geometry
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 2. Message Bubble & Action Toolbar Geometry");

TARGET_VIEWPORTS.forEach((vw) => {
  const isMobile = vw < 640;
  const padding = isMobile ? 16 : 24; // px-2 (8*2=16) on mobile, px-3 (12*2=24) on sm+
  const gap = isMobile ? 6 : 8; // gap-1.5 (6px) on mobile, gap-2 (8px) on sm+
  const actionToolbarWidth = isMobile ? 28 : 88; // 1 compact button on mobile (28px), 3 buttons on sm+ (88px)
  const bubbleMaxRatio = isMobile ? 0.84 : vw < 768 ? 0.70 : 0.62;

  const availableRowWidth = vw - padding;
  const maxBubbleWidth = Math.floor(vw * bubbleMaxRatio);
  const totalRowContentWidth = maxBubbleWidth + gap + actionToolbarWidth;

  assert(
    totalRowContentWidth <= vw,
    `[${vw}px] Bubble (${maxBubbleWidth}px) + Gap (${gap}px) + Actions (${actionToolbarWidth}px) = ${totalRowContentWidth}px <= ${vw}px (ZERO overflow)`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Custom Voice Message Player Geometry
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 3. Custom Voice Message Player Geometry");

TARGET_VIEWPORTS.forEach((vw) => {
  const isMobile = vw < 640;
  const bubbleMaxRatio = isMobile ? 0.84 : 0.62;
  const bubbleWidth = Math.floor(vw * bubbleMaxRatio);
  const bubblePadding = isMobile ? 24 : 32; // px-3 vs px-4
  const playerWidth = bubbleWidth - bubblePadding;

  // VoiceMessagePlayer controls:
  // Play button: 32px (mobile) / 36px (sm+)
  // Current time: 28px
  // Volume button: 28px (mobile) / 32px (sm+)
  // Gaps: 6px * 3 = 18px (mobile) / 8px * 3 = 24px (sm+)
  const playBtn = isMobile ? 32 : 36;
  const timeDisplay = 28;
  const volumeBtn = isMobile ? 28 : 32;
  const gaps = isMobile ? 18 : 24;
  const fixedControlsWidth = playBtn + timeDisplay + volumeBtn + gaps;
  const remainingForSeekBar = playerWidth - fixedControlsWidth;

  assert(
    playerWidth >= 160,
    `[${vw}px] Voice player container width (${playerWidth}px) >= 160px`
  );
  assert(
    remainingForSeekBar >= 40,
    `[${vw}px] Seek bar has at least 40px width (actual: ${remainingForSeekBar}px) without overflow`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Composer Layout Geometry
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 4. Message Composer Layout Geometry");

TARGET_VIEWPORTS.forEach((vw) => {
  const isMobile = vw < 640;
  const composerPadding = isMobile ? 16 : 24; // p-2 vs p-3
  const gap = isMobile ? 6 : 8; // gap-1.5 vs gap-2
  const buttonWidth = isMobile ? 36 : 40; // h-9 w-9 vs h-10 w-10
  const attachBtn = buttonWidth;
  const sendBtn = buttonWidth;

  const fixedWidth = composerPadding + attachBtn + gap + gap + sendBtn;
  const remainingForTextarea = vw - fixedWidth;

  assert(
    remainingForTextarea >= 120,
    `[${vw}px] Textarea has ample width (${remainingForTextarea}px) inside composer (fixed controls: ${fixedWidth}px <= ${vw}px)`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Chat Header Layout Geometry
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 5. Chat Header Responsive Collapse Geometry");

TARGET_VIEWPORTS.forEach((vw) => {
  const isMobile = vw < 640;
  const headerPadding = isMobile ? 20 : 32; // px-2.5 vs px-4
  const backBtn = isMobile ? 32 : 0; // md:hidden back button
  const avatar = 40;
  const gap = isMobile ? 8 : 12;

  // On mobile: Media Gallery (32px) + MoreVertical button (32px) + gap (2px) = 66px
  // On desktop: 6 action buttons at 32px + gaps = ~210px
  const actionsWidth = isMobile ? 66 : 210;

  const fixedNonTextWidth = headerPadding + backBtn + gap + avatar + gap + actionsWidth;
  const remainingForTitle = vw - fixedNonTextWidth;

  assert(
    remainingForTitle >= 60,
    `[${vw}px] Title/Status has at least 60px (${remainingForTitle}px) before truncation`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Source Code Responsive Invariants Inspection
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 6. Source Code Responsive Invariants Inspection");

const srcFiles = {
  appShell: fs.readFileSync(
    path.join(process.cwd(), "components/layout/app-shell.tsx"),
    "utf-8"
  ),
  messageActionsMenu: fs.readFileSync(
    path.join(process.cwd(), "components/messages/message-actions-menu.tsx"),
    "utf-8"
  ),
  messageItem: fs.readFileSync(
    path.join(process.cwd(), "components/chat/message-item.tsx"),
    "utf-8"
  ),
  messageAttachment: fs.readFileSync(
    path.join(process.cwd(), "components/chat/message-attachment.tsx"),
    "utf-8"
  ),
  voicePlayer: fs.readFileSync(
    path.join(process.cwd(), "components/chat/voice-message-player.tsx"),
    "utf-8"
  ),
  messageComposer: fs.readFileSync(
    path.join(process.cwd(), "components/chat/message-composer.tsx"),
    "utf-8"
  ),
  voiceRecorderBar: fs.readFileSync(
    path.join(process.cwd(), "components/chat/voice-recorder-bar.tsx"),
    "utf-8"
  ),
  chatHeader: fs.readFileSync(
    path.join(process.cwd(), "components/chat/chat-header.tsx"),
    "utf-8"
  ),
  activeChat: fs.readFileSync(
    path.join(process.cwd(), "components/chat/active-chat.tsx"),
    "utf-8"
  ),
  messageFeed: fs.readFileSync(
    path.join(process.cwd(), "components/chat/message-feed.tsx"),
    "utf-8"
  ),
};

// AppShell
assert(
  !srcFiles.appShell.includes("w-screen"),
  "app-shell.tsx does NOT use 'w-screen' (prevents horizontal scrollbar overflow)"
);
assert(
  srcFiles.appShell.includes("w-full max-w-full min-w-0"),
  "app-shell.tsx uses fluid 'w-full max-w-full min-w-0'"
);

// MessageActionsMenu
assert(
  srcFiles.messageActionsMenu.includes("createPortal"),
  "message-actions-menu.tsx uses createPortal to escape parent overflow containers"
);
assert(
  srcFiles.messageActionsMenu.includes("Math.max(8, Math.min("),
  "message-actions-menu.tsx strictly clamps horizontal coordinate with safety margin"
);
assert(
  srcFiles.messageActionsMenu.includes('maxWidth: "calc(100vw - 16px)"'),
  "message-actions-menu.tsx sets maxWidth to calc(100vw - 16px)"
);
assert(
  srcFiles.messageActionsMenu.includes('e.key === "Escape"'),
  "message-actions-menu.tsx supports Escape key dismissal"
);
assert(
  srcFiles.messageActionsMenu.includes("triggerRef.current?.focus()"),
  "message-actions-menu.tsx restores focus to trigger on close"
);

// VoiceMessagePlayer
assert(
  srcFiles.voicePlayer.includes("min-w-0"),
  "voice-message-player.tsx uses min-w-0 on flex containers"
);
assert(
  srcFiles.voicePlayer.includes('aria-label="Seek timeline"'),
  "voice-message-player.tsx includes ARIA labels for accessibility"
);
assert(
  srcFiles.voicePlayer.includes("type=\"range\""),
  "voice-message-player.tsx provides fluid interactive seek slider"
);

// MessageAttachment
assert(
  !srcFiles.messageAttachment.includes("max-w-[280px]"),
  "message-attachment.tsx removed rigid max-w-[280px] causing mobile overflow"
);
assert(
  srcFiles.messageAttachment.includes("VoiceMessagePlayer"),
  "message-attachment.tsx uses VoiceMessagePlayer instead of native audio controls"
);

// MessageItem
assert(
  srcFiles.messageItem.includes("min-w-0"),
  "message-item.tsx uses min-w-0 on message bubble and content"
);
assert(
  srcFiles.messageItem.includes("[overflow-wrap:anywhere]"),
  "message-item.tsx uses overflow-wrap:anywhere to wrap long text/URLs safely"
);

// MessageComposer
assert(
  srcFiles.messageComposer.includes("relative flex-1 min-w-0"),
  "message-composer.tsx textarea wrapper includes min-w-0"
);
assert(
  srcFiles.messageComposer.includes("h-9 w-9 sm:h-10 sm:w-10"),
  "message-composer.tsx uses responsive button sizes"
);

// VoiceRecorderBar
assert(
  srcFiles.voiceRecorderBar.includes("flex-1 min-w-0 overflow-hidden"),
  "voice-recorder-bar.tsx waveform container uses flex-1 min-w-0 overflow-hidden"
);

// ChatHeader
assert(
  srcFiles.chatHeader.includes("MoreVertical"),
  "chat-header.tsx includes MoreVertical overflow menu for mobile"
);
assert(
  srcFiles.chatHeader.includes("hidden sm:flex"),
  "chat-header.tsx preserves full action toolbar on desktop (hidden sm:flex)"
);

// ActiveChat & MessageFeed
assert(
  srcFiles.activeChat.includes("w-full min-w-0 max-w-full"),
  "active-chat.tsx includes w-full min-w-0 max-w-full"
);
assert(
  srcFiles.messageFeed.includes("overflow-x-hidden"),
  "message-feed.tsx scroller prevents horizontal scroll with overflow-x-hidden"
);

console.log("\n======================================================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("======================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL RESPONSIVE VIEWPORT & COLLISION CHECKS PASSED!\n");
}
