// Generic questionnaire detector using a scoring system

const Detector = {
  detect(doc) {
    const url = window.location.href;
    let score = 0;
    let platform = null;

    // Check known platforms first (instant match)
    for (const adapterClass of AdapterRegistry.adapters) {
      if (adapterClass.matches(url, doc)) {
        return { found: true, platform: adapterClass.getPlatformName(), score: 10 };
      }
    }

    // Score-based detection for generic pages
    const signals = this.analyzeSignals(doc);
    score = signals.reduce((sum, s) => sum + s.weight, 0);

    return {
      found: score >= 3,
      platform: 'generic',
      score,
      signals
    };
  },

  analyzeSignals(doc) {
    const signals = [];

    // Radio/checkbox groups
    const radioGroups = this.countRadioGroups(doc);
    if (radioGroups >= 3) {
      signals.push({ name: 'radio_groups', weight: 2, detail: `${radioGroups} radio groups` });
    }

    // Form with many controls
    const forms = doc.querySelectorAll('form');
    forms.forEach(form => {
      const controls = form.querySelectorAll('input, select, textarea');
      if (controls.length >= 5) {
        signals.push({ name: 'form_controls', weight: 2, detail: `Form with ${controls.length} controls` });
      }
    });

    // Textarea
    if (doc.querySelector('textarea')) {
      signals.push({ name: 'textarea', weight: 1, detail: 'Has textarea' });
    }

    // Select dropdowns
    if (doc.querySelector('select')) {
      signals.push({ name: 'select', weight: 1, detail: 'Has select' });
    }

    // Survey-related text in title/headings
    const surveyWords = /问卷|调查|survey|questionnaire|form|quiz|poll/i;
    const titleText = doc.title + ' ' + (doc.querySelector('h1, h2')?.textContent || '');
    if (surveyWords.test(titleText)) {
      signals.push({ name: 'title_keywords', weight: 1, detail: 'Survey keywords in title' });
    }

    // Survey-related class/id names
    const surveySelectors = '[class*="question"], [class*="survey"], [class*="quiz"], [id*="question"], [id*="survey"]';
    if (doc.querySelector(surveySelectors)) {
      signals.push({ name: 'class_keywords', weight: 1, detail: 'Survey classes found' });
    }

    // Rating elements
    if (doc.querySelector('[class*="star"], [class*="rating"], input[type="range"]')) {
      signals.push({ name: 'rating', weight: 1, detail: 'Rating elements found' });
    }

    // Multiple sequential question-like containers
    const questionContainers = doc.querySelectorAll(
      '.question, .field, .form-group, [class*="q-"], [class*="item-"]'
    );
    if (questionContainers.length >= 3) {
      signals.push({ name: 'question_containers', weight: 2, detail: `${questionContainers.length} question containers` });
    }

    return signals;
  },

  countRadioGroups(doc) {
    const radios = doc.querySelectorAll('input[type="radio"]');
    const names = new Set();
    radios.forEach(r => {
      if (r.name) names.add(r.name);
    });
    return names.size;
  }
};
