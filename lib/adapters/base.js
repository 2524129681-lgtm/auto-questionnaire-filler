// Base adapter class and adapter registry

class BaseAdapter {
  static matches(url, doc) {
    return false;
  }

  static getPlatformName() {
    return 'generic';
  }

  parseQuestions(doc) {
    throw new Error('parseQuestions not implemented');
  }

  getPageContext(doc) {
    return {
      pageTitle: doc.title || '',
      platform: this.constructor.getPlatformName(),
      language: Utils.detectLanguage(),
      topic: this.inferTopic(doc)
    };
  }

  inferTopic(doc) {
    const h1 = doc.querySelector('h1, h2');
    if (h1) return Utils.getText(h1);
    return doc.title || '';
  }

  async fillAnswer(doc, question, answer) {
    await AnswerFiller.fill(doc, question, answer);
  }

  submit(doc) {
    const btn = doc.querySelector(
      'button[type="submit"], input[type="submit"], .submit-btn, #submit_button, .submitbutton'
    );
    if (btn) btn.click();
  }

  // Helper: extract question title from a container
  extractTitle(container, selectors) {
    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el && Utils.getText(el)) return Utils.getText(el);
    }
    // Fallback: first text-heavy child
    const children = container.children;
    for (const child of children) {
      const text = Utils.getText(child);
      if (text && text.length > 2 && !child.querySelector('input, select, textarea')) {
        return text;
      }
    }
    return '';
  }

  // Helper: extract options from labels near inputs
  extractRadioCheckboxOptions(container, inputSelector) {
    const inputs = container.querySelectorAll(inputSelector);
    const options = [];
    const seen = new Set();

    inputs.forEach(input => {
      // Try associated label first
      let label = '';
      if (input.id) {
        const labelEl = container.querySelector(`label[for="${input.id}"]`);
        if (labelEl) label = Utils.getText(labelEl);
      }
      // Try parent label
      if (!label) {
        const parentLabel = Utils.closest(input, 'label');
        if (parentLabel) label = Utils.getText(parentLabel);
      }
      // Try sibling text
      if (!label) {
        const sibling = input.nextElementSibling;
        if (sibling) label = Utils.getText(sibling);
      }
      // Try parent's text content minus child inputs
      if (!label) {
        const parent = input.parentElement;
        if (parent) {
          const clone = parent.cloneNode(true);
          clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
          label = Utils.getText(clone);
        }
      }

      const value = input.value || label;
      if (value && !seen.has(value)) {
        seen.add(value);
        options.push({ value, label: label || value });
      }
    });

    return options;
  }
}

// Adapter registry - order matters (most specific first)
const AdapterRegistry = {
  adapters: [],

  register(adapterClass) {
    this.adapters.push(adapterClass);
  },

  getAdapter(url, doc) {
    for (const adapterClass of this.adapters) {
      if (adapterClass.matches(url, doc)) {
        return new adapterClass();
      }
    }
    return new GenericAdapter();
  }
};

// Adapters register themselves when loaded (order: most specific first)
// Registration happens at the end of each adapter file
