// 腾讯问卷 (wj.qq.com) adapter

class TencentAdapter extends BaseAdapter {
  static matches(url, doc) {
    return /wj\.qq\.com|qun\.qq\.com/.test(url);
  }

  static getPlatformName() {
    return 'tencent';
  }

  parseQuestions(doc) {
    const questions = [];
    const containers = doc.querySelectorAll(
      '.question, .mod-question, [class*="question-wrap"], .survey-question'
    );

    containers.forEach((container, index) => {
      if (!Utils.isVisible(container)) return;

      const question = {
        id: `q_${index}`,
        index,
        title: this.extractTitle(container),
        type: this.detectType(container),
        required: this.isRequired(container),
        options: this.extractOptions(container),
        meta: {},
        element: container
      };

      if (question.title) {
        questions.push(question);
      }
    });

    return questions;
  }

  extractTitle(container) {
    const selectors = [
      '.topic-title', '.question-title', '.qu-title',
      '.question-header', 'h3', 'h4', '.title'
    ];
    return BaseAdapter.prototype.extractTitle.call(this, container, selectors);
  }

  detectType(container) {
    if (container.querySelector('table') && container.querySelectorAll('input').length >= 4) return 'matrix';
    if (container.querySelector('[class*="star"], [class*="rating"]')) return 'rating';
    if (container.querySelector('input[type="range"]')) return 'slider';
    if (container.querySelector('input[type="radio"]')) return 'radio';
    if (container.querySelector('input[type="checkbox"]')) return 'checkbox';
    if (container.querySelector('select')) return 'select';
    if (container.querySelector('textarea')) return 'textarea';
    if (container.querySelector('input[type="text"]')) return 'text';
    return 'text';
  }

  extractOptions(container) {
    const type = this.detectType(container);
    if (type === 'radio' || type === 'checkbox') {
      const inputType = type === 'radio' ? 'radio' : 'checkbox';
      return BaseAdapter.prototype.extractRadioCheckboxOptions.call(
        this, container, `input[type="${inputType}"]`
      );
    }
    if (type === 'select') {
      const select = container.querySelector('select');
      if (!select) return [];
      return Array.from(select.options)
        .filter(opt => opt.value)
        .map(opt => ({ value: opt.value, label: Utils.getText(opt) }));
    }
    return [];
  }

  isRequired(container) {
    return !!container.querySelector('[class*="required"], .must, [class*="must"]');
  }

  submit(doc) {
    const btn = doc.querySelector('.submit-btn, button[type="submit"], .btn-submit');
    if (btn) btn.click();
  }
}

AdapterRegistry.register(TencentAdapter);
