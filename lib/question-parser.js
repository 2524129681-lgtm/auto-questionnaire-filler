// Question parser - normalizes DOM elements into structured question objects

const QuestionParser = {
  // Canonical question types
  TYPES: {
    TEXT: 'text',
    TEXTAREA: 'textarea',
    RADIO: 'radio',
    CHECKBOX: 'checkbox',
    SELECT: 'select',
    RATING: 'rating',
    MATRIX: 'matrix',
    DATE: 'date',
    SLIDER: 'slider'
  },

  // Detect question type from a container element
  detectType(container) {
    // Slider / range
    if (container.querySelector('input[type="range"]')) return this.TYPES.SLIDER;

    // Date/time
    if (container.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')) {
      return this.TYPES.DATE;
    }

    // Select (not inside a matrix)
    const select = container.querySelector('select');
    if (select && !container.querySelector('table select')) return this.TYPES.SELECT;

    // Matrix (table with inputs) - check before rating/checkbox/radio
    if (this.isMatrix(container)) return this.TYPES.MATRIX;

    // Checkbox - check BEFORE rating to avoid false positives
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length >= 1) return this.TYPES.CHECKBOX;

    // Rating (stars, NPS, etc.) - only after checkbox is ruled out
    if (this.isRating(container)) return this.TYPES.RATING;

    // Radio
    const radios = container.querySelectorAll('input[type="radio"]');
    if (radios.length >= 2) return this.TYPES.RADIO;

    // Textarea
    if (container.querySelector('textarea')) return this.TYPES.TEXTAREA;

    // Text input
    if (container.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="tel"]')) {
      return this.TYPES.TEXT;
    }

    return this.TYPES.TEXT; // Default fallback
  },

  isRating(container) {
    // Only match explicit rating indicators - be conservative
    // Check for star/rating specific class names on the container or direct children
    const ratingEl = container.querySelector(
      '[class*="star-level"], [class*="star-rating"], [class*="rating-star"], ' +
      '[class*="nps-container"], [class*="score-picker"], [class*="satisfaction"]'
    );
    if (ratingEl) return true;

    // Check container class itself
    const containerClass = container.className || '';
    if (/star|rating|score|nps/i.test(containerClass)) return true;

    // Check for explicit role or data attributes
    if (container.querySelector('[role="slider"], [aria-label*="star"], [aria-label*="rating"]')) return true;

    return false;
  },

  isMatrix(container) {
    const table = container.querySelector('table');
    if (!table) return false;
    const inputs = table.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    return inputs.length >= 4; // At least 2 rows x 2 cols
  },

  // Extract options for radio/checkbox/select
  extractOptions(container, type) {
    if (type === this.TYPES.SELECT) {
      const select = container.querySelector('select');
      if (!select) return [];
      return Array.from(select.options)
        .filter(opt => opt.value && opt.value !== '')
        .map(opt => ({ value: opt.value, label: Utils.getText(opt) || opt.value }));
    }

    if (type === this.TYPES.RADIO || type === this.TYPES.CHECKBOX) {
      const inputType = type === this.TYPES.RADIO ? 'radio' : 'checkbox';
      const inputs = container.querySelectorAll(`input[type="${inputType}"]`);
      const options = [];
      const seen = new Set();

      inputs.forEach(input => {
        let label = '';
        let hasFollowUp = false;
        let followUpElement = null;

        // Try associated label via for attribute
        if (input.id) {
          const labelEl = container.querySelector(`label[for="${input.id}"]`);
          if (labelEl) label = Utils.getText(labelEl);
        }

        // Try parent label
        if (!label) {
          const parentLabel = input.closest('label');
          if (parentLabel) label = Utils.getText(parentLabel);
        }

        // Try closest li or similar list item
        const listItem = input.closest('li, .option, [class*="item"], [class*="choice"]');
        if (!label && listItem) {
          const clone = listItem.cloneNode(true);
          clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
          label = Utils.getText(clone);
        }

        // Try sibling text
        if (!label) {
          const sibling = input.nextElementSibling;
          if (sibling && sibling.tagName !== 'INPUT') {
            label = Utils.getText(sibling);
          }
        }

        // Try parent's text
        if (!label) {
          const parent = input.parentElement;
          if (parent) {
            const clone = parent.cloneNode(true);
            clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
            label = Utils.getText(clone);
          }
        }

        // Detect follow-up text input associated with this option
        // Pattern 1: text input is a sibling of the option's container
        const optionContainer = listItem || input.closest('label') || input.parentElement;
        if (optionContainer) {
          const nearbyText = optionContainer.querySelector(
            'input[type="text"], input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'
          );
          if (nearbyText && nearbyText.type !== 'hidden') {
            hasFollowUp = true;
            followUpElement = nearbyText;
          }
          // Also check next sibling element
          if (!followUpElement) {
            const nextSib = optionContainer.nextElementSibling;
            if (nextSib) {
              const sibInput = nextSib.querySelector('input[type="text"], textarea');
              if (sibInput) {
                const isInline = nextSib.style.display !== 'none' &&
                                 !nextSib.classList.contains('other') &&
                                 !nextSib.classList.contains('extra');
                // Only mark as follow-up if it looks like an "other" text field
                if (label && /其他|other|请注明|请说明|补充/i.test(label)) {
                  hasFollowUp = true;
                  followUpElement = sibInput;
                }
              }
            }
          }
        }

        // Pattern 2: check for "other" keyword in label
        if (label && /其他|other|请注明|请说明|补充|其他.*请/i.test(label)) {
          hasFollowUp = true;
        }

        const value = input.value || label;
        if (value && !seen.has(value)) {
          seen.add(value);
          const option = { value, label: label || value };
          if (hasFollowUp) {
            option.hasFollowUp = true;
            if (followUpElement) {
              option.followUpSelector = this._getCssSelector(followUpElement);
            }
          }
          options.push(option);
        }
      });

      return options;
    }

    return [];
  },

  // Generate a unique CSS selector for an element
  _getCssSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;

    // Build a path
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/).filter(c => c && !c.includes('hidden')).slice(0, 2).join('.');
        if (cls) selector += '.' + cls;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current);
          selector += `:nth-of-type(${idx + 1})`;
        }
      }
      path.unshift(selector);
      if (path.join(' > ').length > 80) break;
      current = current.parentElement;
    }
    return path.join(' > ');
  },

  // Extract matrix structure
  extractMatrix(container) {
    const table = container.querySelector('table');
    if (!table) return { rows: [], cols: [] };

    const headers = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td'));
    const cols = headers.slice(1).map(h => Utils.getText(h)).filter(Boolean);

    const rows = [];
    const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    bodyRows.forEach(row => {
      const firstCell = row.querySelector('th, td');
      if (firstCell) {
        const text = Utils.getText(firstCell);
        if (text) rows.push(text);
      }
    });

    return { rows, cols };
  },

  // Parse a single question container into a canonical question object
  parseQuestion(container, index) {
    const type = this.detectType(container);
    const titleSelectors = [
      '.topic-html', '.topic-title-text', '.question-title', '.topic-title',
      '.field-label', '.question-text', 'label', 'legend', 'h3', 'h4', 'p'
    ];

    // Extract title
    let title = '';
    for (const sel of titleSelectors) {
      const el = container.querySelector(sel);
      if (el) {
        title = Utils.getText(el);
        if (title && title.length > 1) break;
      }
    }
    if (!title) {
      // Fallback: first substantial text
      const allText = Utils.getText(container);
      title = allText.slice(0, 200);
    }

    // Clean up title (remove question number prefix like "1." "1、" "1)" etc.)
    title = title.replace(/^\d{1,3}[\.\、\)\]\.\s]+/, '').trim();

    const question = {
      id: `q_${index}`,
      index,
      type,
      title,
      description: '',
      required: this.isRequired(container),
      options: this.extractOptions(container, type),
      meta: {},
      element: container
    };

    // Type-specific metadata
    if (type === this.TYPES.MATRIX) {
      const matrix = this.extractMatrix(container);
      question.meta.matrixRows = matrix.rows;
      question.meta.matrixCols = matrix.cols;
      question.options = matrix.cols.map((c, i) => ({ value: c, label: c }));
    }

    if (type === this.TYPES.SLIDER || type === this.TYPES.RATING) {
      const rangeInput = container.querySelector('input[type="range"]');
      if (rangeInput) {
        question.meta.min = parseInt(rangeInput.min) || 1;
        question.meta.max = parseInt(rangeInput.max) || 5;
      } else {
        const inputs = container.querySelectorAll('input[type="radio"]');
        question.meta.min = 1;
        question.meta.max = inputs.length || 5;
      }
    }

    if (type === this.TYPES.TEXTAREA) {
      const ta = container.querySelector('textarea');
      if (ta) {
        question.meta.maxLength = ta.maxLength > 0 ? ta.maxLength : null;
      }
    }

    // Detect number input
    if (type === this.TYPES.TEXT) {
      const numInput = container.querySelector('input[type="number"]');
      if (numInput) {
        question.meta.isNumber = true;
        question.meta.min = numInput.min ? parseFloat(numInput.min) : undefined;
        question.meta.max = numInput.max ? parseFloat(numInput.max) : undefined;
        question.meta.step = numInput.step ? parseFloat(numInput.step) : undefined;
      }
    }

    return question;
  },

  isRequired(container) {
    // Check for required indicators
    const requiredEl = container.querySelector('.required, [class*="required"], .must, [class*="must"]');
    if (requiredEl) return true;

    // Check for asterisk
    const html = container.innerHTML;
    if (html.includes('*') || html.includes('＊')) return true;

    // Check input required attribute
    const inputs = container.querySelectorAll('input, select, textarea');
    for (const input of inputs) {
      if (input.required) return true;
    }

    return false;
  }
};
