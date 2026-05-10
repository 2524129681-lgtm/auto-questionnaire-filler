// Shared utilities for the questionnaire assistant

const Utils = {
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  randomDelay(min = 100, max = 300) {
    return this.sleep(min + Math.random() * (max - min));
  },

  // Get clean text content from an element, collapsing whitespace
  getText(el) {
    if (!el) return '';
    return el.textContent.replace(/\s+/g, ' ').trim();
  },

  // Find the closest ancestor matching a selector
  closest(el, selector) {
    if (!el) return null;
    return el.closest(selector);
  },

  // Check if element is visible
  isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           el.offsetParent !== null;
  },

  // Scroll element into view smoothly
  async scrollTo(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(200);
  },

  // Dispatch realistic mouse events on an element
  async simulateClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  },

  // Type text character by character
  async typeText(el, text) {
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('focus', { bubbles: true }));

    for (const char of text) {
      el.value += char;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
      await this.sleep(20 + Math.random() * 40);
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  },

  // Find option text that best matches the answer (fuzzy match)
  matchOption(answer, options) {
    if (!answer || !options?.length) return null;

    // Exact match
    const exact = options.find(o => o.label === answer || o.value === answer);
    if (exact) return exact;

    // Case-insensitive match
    const lower = answer.toLowerCase();
    const ci = options.find(o =>
      o.label.toLowerCase() === lower || o.value.toLowerCase() === lower
    );
    if (ci) return ci;

    // Contains match
    const contains = options.find(o =>
      o.label.includes(answer) || answer.includes(o.label)
    );
    if (contains) return contains;

    return null;
  },

  // Detect page language
  detectLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;
    // Check if Chinese characters dominate the page text
    const text = document.body?.textContent?.slice(0, 1000) || '';
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    return chineseChars > text.length * 0.1 ? 'zh-CN' : 'en';
  },

  // Generate unique ID
  uid() {
    return 'q_' + Math.random().toString(36).slice(2, 8);
  }
};
