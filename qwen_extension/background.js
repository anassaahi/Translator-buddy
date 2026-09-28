// Open the side panel when the user clicks the extension icon in the toolbar
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Create the right-click menu item when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate with buddy",
    contexts: ["selection"]
  });
});

// Listen for the user clicking the right-click menu item
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate-selection") {
    const selectedText = info.selectionText;

    // Try to extract lightweight context from the page
    let pageContext = "";
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContext,
      });
      if (results && results[0] && results[0].result) {
        pageContext = results[0].result;
      }
    } catch (err) {
      // If injection fails (e.g., chrome:// pages, PDFs), proceed without context
      console.warn("Could not extract page context:", err.message);
    }

    // Send the highlighted text + context to the Side Panel UI
    chrome.runtime.sendMessage({
      action: "translate",
      text: selectedText,
      pageContext: pageContext,
    });
  }
});

/**
 * Injected into the active tab to extract lightweight context.
 * Returns: "Page: <title> | Around: <prev sentence> ... <next sentence>"
 * Total: ~100-150 tokens — enough for disambiguation without sending the whole page.
 */
function extractPageContext() {
  const title = document.title || "";

  // Get the surrounding sentences around the user's selection
  let surroundingText = "";
  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    // Walk up to the nearest block-level parent (paragraph, div, etc.)
    let container = range.commonAncestorContainer;
    while (container && container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode;
    }
    // Try to get the paragraph or a reasonable block
    const block = container?.closest?.("p, div, article, section, td, li, blockquote") || container;

    if (block) {
      const fullText = block.innerText || block.textContent || "";
      const selectedText = selection.toString().trim();

      // Find where the selection sits in the block text
      const idx = fullText.indexOf(selectedText);
      if (idx !== -1) {
        // Grab text before and after the selection
        const before = fullText.substring(Math.max(0, idx - 300), idx).trim();
        const after = fullText.substring(idx + selectedText.length, idx + selectedText.length + 300).trim();

        // Extract last 2 sentences before selection
        const prevSentences = before.split(/(?<=[.!?।۔])\s+/).slice(-2).join(" ");
        // Extract first 2 sentences after selection
        const nextSentences = after.split(/(?<=[.!?।۔])\s+/).slice(0, 2).join(" ");

        const parts = [prevSentences, nextSentences].filter(Boolean);
        if (parts.length > 0) {
          surroundingText = parts.join(" ... ");
        }
      }
    }
  }

  // Build a compact context string
  const contextParts = [];
  if (title) contextParts.push(`Page: ${title}`);
  if (surroundingText) contextParts.push(`Around: ${surroundingText}`);

  return contextParts.join(" | ");
}