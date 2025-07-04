// Listen for messages from the background script
console.log('Content script loaded and listening for messages.');
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'insertText') {
    const result = await insertTextIntoInput(request.text, request.selector);
    if (result.success) {
      // After successful text insertion, try to click the search button
      const searchResult = await clickSearchButton();
      if (searchResult.success) {
        result.message += ' Search initiated.';
      }
    }
    sendResponse(result);
  } else if (request.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
  } else if (request.action === 'extractContent') {
    // Extract main visible text content
    let content = '';
    const main = document.querySelector('main');
    if (main) {
      content = main.innerText;
    } else {
      const article = document.querySelector('article');
      if (article) {
        content = article.innerText;
      } else {
        content = document.body.innerText;
      }
    }
    sendResponse({ success: true, content });
  }
  return true;
});

// Helper function to check if an element is visible
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// Helper: Wait for element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 100);
    }
    check();
  });
}

// Function to find and click the search button
async function clickSearchButton() {
  try {
    // Common search button selectors
    const searchButtonSelectors = [
      'button#search-icon-legacy', // YouTube's main search button
      '#search-icon-legacy', // Another common YouTube selector
      'button[aria-label="Search"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button.search',
      '.search-button',
      '[aria-label*="search" i]',
      '[title*="search" i]',
      '[role="search"] button',
      'form button',
      'form input[type="submit"]',
      '#search-button',
      '.submit-button',
      '.search__button',
      '.search-submit',
      '[data-test-id*="search-button"]',
      '[class*="search"] button',
      '[class*="submit"] button',
      // More generic selectors for search icons/buttons
      '[data-original-title="Search"]',
      'button[data-tooltip-target-id]',
      '[class*="yt-spec-button-shape-next--call-to-action"]',
      '[class*="yt-icon-button"]',
      '#search-icon-img', // For search icon images sometimes used as buttons
      'ytd-searchbox #search-icon-legacy' // More specific for YouTube
    ];

    // Try each selector
    for (const selector of searchButtonSelectors) {
      const button = await waitForElement(selector, 2000); // Shorter timeout for individual buttons
      if (button && isElementVisible(button)) {
        console.log('Attempting to click button with selector:', selector);
        button.click();
        return { success: true, message: 'Search button clicked' };
      }
    }

    // If no button found, try pressing Enter on the active input field as a fallback
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      console.log('No search button found, attempting to press Enter on active element:', activeElement);
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      activeElement.dispatchEvent(event);
      return { success: true, message: 'Enter key pressed' };
    }

    console.log('No search button found and no active input field.');
    return { success: false, message: 'No search button found' };
  } catch (error) {
    console.error('Error clicking search button:', error);
    return { success: false, message: error.message };
  }
}

// Function to insert text into input fields
async function insertTextIntoInput(text, selector) {
  try {
    let inputElement;
    
    if (selector) {
      inputElement = await waitForElement(selector);
    } else {
      // Find the first visible input or textarea
      const potentialInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      const visibleInputs = potentialInputs.filter(isElementVisible);

      if (visibleInputs.length > 0) {
        inputElement = visibleInputs[0]; // Take the very first visible input field
      }
    }

    if (!inputElement) {
      return { success: false, message: 'No suitable input field found' };
    }

    // Check if the value property is writable
    const descriptor = Object.getOwnPropertyDescriptor(inputElement, 'value');
    if (descriptor && !descriptor.writable) {
      return { success: false, message: 'Input field is not writable' };
    }

    inputElement.focus();
    inputElement.value = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, message: 'Text inserted successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Tooltip for summarizing selected text
let summarizeTooltip = null;

function createSummarizeTooltip() {
  if (summarizeTooltip) return summarizeTooltip;
  summarizeTooltip = document.createElement('div');
  summarizeTooltip.id = 'summarize-tooltip';
  summarizeTooltip.textContent = 'F';
  summarizeTooltip.style.position = 'absolute';
  summarizeTooltip.style.background = '#232323';
  summarizeTooltip.style.color = '#4CAF50';
  summarizeTooltip.style.width = '36px';
  summarizeTooltip.style.height = '36px';
  summarizeTooltip.style.display = 'flex';
  summarizeTooltip.style.alignItems = 'center';
  summarizeTooltip.style.justifyContent = 'center';
  summarizeTooltip.style.fontSize = '1.25em';
  summarizeTooltip.style.fontWeight = 'bold';
  summarizeTooltip.style.borderRadius = '50%';
  summarizeTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
  summarizeTooltip.style.cursor = 'pointer';
  summarizeTooltip.style.zIndex = 999999;
  summarizeTooltip.style.userSelect = 'none';
  summarizeTooltip.style.display = 'none';
  summarizeTooltip.style.transition = 'box-shadow 0.2s, transform 0.3s';
  summarizeTooltip.style.border = '2px solid #4CAF50';
  summarizeTooltip.style.outline = 'none';
  summarizeTooltip.style.padding = '0';
  summarizeTooltip.style.lineHeight = '36px';
  summarizeTooltip.style.textAlign = 'center';
  // Add hover effect for rotation
  summarizeTooltip.onmouseenter = () => {
    summarizeTooltip.style.transform = 'rotate(-20deg)';
  };
  summarizeTooltip.onmouseleave = () => {
    summarizeTooltip.style.transform = 'none';
  };
  document.body.appendChild(summarizeTooltip);
  return summarizeTooltip;
}

function showSummarizeTooltip(x, y) {
  const tooltip = createSummarizeTooltip();
  
  // Ensure tooltip stays within viewport bounds
  const tooltipWidth = 36;
  const tooltipHeight = 36;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Calculate position with bounds checking
  let left = x;
  let top = y + 10;
  
  // Adjust horizontal position if tooltip would go off-screen
  if (left + tooltipWidth > viewportWidth) {
    left = viewportWidth - tooltipWidth - 10;
  }
  if (left < 10) {
    left = 10;
  }
  
  // Adjust vertical position if tooltip would go off-screen
  if (top + tooltipHeight > viewportHeight) {
    top = y - tooltipHeight - 10;
  }
  if (top < 10) {
    top = 10;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.display = 'block';
}

function hideSummarizeTooltip() {
  if (summarizeTooltip) summarizeTooltip.style.display = 'none';
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection && selection.toString().trim();
    if (text && text.length > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showSummarizeTooltip(rect.left + window.scrollX, rect.bottom + window.scrollY);
    } else {
      hideSummarizeTooltip();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (summarizeTooltip && !summarizeTooltip.contains(e.target)) {
    hideSummarizeTooltip();
  }
});

createSummarizeTooltip();
summarizeTooltip.onclick = () => {
  const selection = window.getSelection();
  const text = selection && selection.toString().trim();
  if (text && text.length > 0) {
    try {
      chrome.runtime.sendMessage({ action: 'openSidePanelWithSelection', text });
    } catch (e) {
      alert('Extension context lost. Please reload the page or extension.');
    }
    hideSummarizeTooltip();
  }
}; 