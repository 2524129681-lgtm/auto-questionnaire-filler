// Generic adapter - fallback for unrecognized questionnaire platforms

class GenericAdapter extends BaseAdapter {
  static matches(url, doc) {
    return true; // Always matches as fallback
  }

  static getPlatformName() {
    return 'generic';
  }

  parseQuestions(doc) {
    const questions = [];
    const containers = this.findQuestionContainers(doc);

    containers.forEach((container, index) => {
      const question = QuestionParser.parseQuestion(container, index);
      if (question.title && question.title.length > 1) {
        questions.push(question);
      }
    });

    return questions;
  }

  findQuestionContainers(doc) {
    // Strategy 1: Find form groups with labels and inputs
    const candidates = new Set();

    // Common question container patterns
    const selectors = [
      '.question', '.field', '.form-group', '.form-item',
      '[class*="question"]', '[class*="field-"]', '[class*="q-"]',
      '.survey-item', '.quiz-item', '.poll-item',
      'fieldset', '.item', '.row'
    ];

    for (const selector of selectors) {
      doc.querySelectorAll(selector).forEach(el => {
        if (this.looksLikeQuestion(el)) {
          candidates.add(el);
        }
      });
    }

    // Strategy 2: Find groups of radio/checkbox inputs
    const radioNames = new Set();
    doc.querySelectorAll('input[type="radio"]').forEach(r => {
      if (r.name) radioNames.add(r.name);
    });

    for (const name of radioNames) {
      const firstRadio = doc.querySelector(`input[type="radio"][name="${name}"]`);
      if (firstRadio) {
        const container = this.findContainer(firstRadio);
        if (container && !candidates.has(container)) {
          candidates.add(container);
        }
      }
    }

    // Strategy 3: Find standalone form controls with labels
    doc.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(input => {
      const container = this.findContainer(input);
      if (container && !candidates.has(container) && this.looksLikeQuestion(container)) {
        candidates.add(container);
      }
    });

    // Sort by DOM position
    return Array.from(candidates).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  findContainer(input) {
    // Walk up to find a reasonable container
    let el = input.parentElement;
    const stopTags = new Set(['FORM', 'BODY', 'HTML']);

    for (let i = 0; i < 5 && el && !stopTags.has(el.tagName); i++) {
      // If this element has a label + input structure, it's likely a question
      const inputs = el.querySelectorAll('input, select, textarea');
      const labels = el.querySelectorAll('label');

      if (inputs.length >= 1 && (labels.length >= 1 || el.querySelector('p, h3, h4, h5, span'))) {
        // Make sure it's not too big (not the whole form)
        if (el.children.length <= 20) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  looksLikeQuestion(el) {
    const text = Utils.getText(el);
    if (!text || text.length < 2) return false;

    const hasInput = el.querySelector('input:not([type="hidden"]), select, textarea');
    if (!hasInput) return false;

    // Has some kind of label/title text
    const hasLabel = el.querySelector('label, legend, h3, h4, h5, p, span');

    return !!hasLabel;
  }
}
