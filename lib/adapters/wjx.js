// 问卷星 (wjx.cn / sojump.com) adapter
// Based on real wjx.cn DOM structure analysis

class WjxAdapter extends BaseAdapter {
  static matches(url, doc) {
    return /wjx\.cn|sojump\.com/.test(url);
  }

  static getPlatformName() {
    return 'wjx';
  }

  parseQuestions(doc) {
    const questions = [];
    const containers = doc.querySelectorAll('.field[topic], .field.ui-field-contain');

    containers.forEach((container, index) => {
      if (!Utils.isVisible(container)) return;

      const question = {
        id: `q_${index}`,
        index,
        title: this.extractTitle(container),
        type: this.detectType(container),
        required: container.getAttribute('req') === '1',
        options: this.extractOptions(container),
        meta: this.extractMeta(container),
        element: container
      };

      if (question.title) {
        questions.push(question);
      }
    });

    return questions;
  }

  extractTitle(container) {
    const el = container.querySelector('.topichtml');
    if (el) {
      let text = Utils.getText(el);
      text = text.replace(/【.*?】/g, '').trim();
      return text;
    }
    const label = container.querySelector('.field-label');
    if (label) {
      const clone = label.cloneNode(true);
      clone.querySelector('.topicnumber')?.remove();
      clone.querySelector('.req')?.remove();
      let text = Utils.getText(clone);
      text = text.replace(/【.*?】/g, '').trim();
      return text;
    }
    return '';
  }

  extractMeta(container) {
    const meta = {};
    const minAttr = container.getAttribute('minvalue');
    if (minAttr) meta.minSelections = parseInt(minAttr, 10);
    const maxAttr = container.getAttribute('maxvalue');
    if (maxAttr) meta.maxSelections = parseInt(maxAttr, 10);
    return meta;
  }

  detectType(container) {
    const typeAttr = container.getAttribute('type');
    if (typeAttr === '3') return 'radio';
    if (typeAttr === '4') return 'checkbox';
    if (typeAttr === '1') return 'text';
    if (typeAttr === '2') return 'textarea';
    if (typeAttr === '5') return 'select';
    if (typeAttr === '6') return 'rating';
    if (typeAttr === '7') return 'matrix';
    if (typeAttr === '8') return 'slider';

    if (container.querySelector('input[type="checkbox"]')) return 'checkbox';
    if (container.querySelector('input[type="radio"]')) return 'radio';
    if (container.querySelector('select')) return 'select';
    if (container.querySelector('textarea')) return 'textarea';
    if (container.querySelector('input[type="text"]')) return 'text';

    return 'text';
  }

  extractOptions(container) {
    const type = this.detectType(container);

    if (type === 'radio' || type === 'checkbox') {
      const inputType = type === 'radio' ? 'radio' : 'checkbox';
      const options = [];
      const seen = new Set();

      const optionWrappers = container.querySelectorAll(`.ui-${inputType}`);

      optionWrappers.forEach(wrapper => {
        const input = wrapper.querySelector(`input[type="${inputType}"]`);
        if (!input) return;

        const labelDiv = wrapper.querySelector('div.label, .label');
        let label = '';
        if (labelDiv) {
          label = Utils.getText(labelDiv);
        }

        const value = input.value || label;
        if (!value || seen.has(value)) return;
        seen.add(value);

        const option = { value, label: label || value };

        // Detect follow-up text input via rel attribute
        const relAttr = input.getAttribute('rel');
        if (relAttr) {
          option.hasFollowUp = true;
          option.followUpInputId = relAttr;
        }

        options.push(option);
      });

      return options;
    }

    if (type === 'select') {
      const select = container.querySelector('select');
      if (!select) return [];
      return Array.from(select.options)
        .filter(opt => opt.value && opt.value !== '')
        .map(opt => ({ value: opt.value, label: Utils.getText(opt) || opt.value }));
    }

    return [];
  }

  async fillAnswer(doc, question, answer) {
    const type = question.type;

    let followUpText = null;
    let actualAnswer = answer;
    if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && answer.followUp) {
      followUpText = answer.followUp;
      actualAnswer = answer.answer;
    }

    if (type === 'radio' || type === 'checkbox') {
      const selectedWrapper = await this.fillChoice(question, actualAnswer, type);
      if (followUpText && selectedWrapper) {
        await this.fillFollowUpInWrapper(selectedWrapper, followUpText);
      } else if (followUpText) {
        await this.fillFollowUpWjx(question, followUpText);
      }
    } else if (type === 'text') {
      await this.fillTextWjx(question, actualAnswer);
    } else {
      await AnswerFiller.fill(doc, question, actualAnswer);
    }
  }

  async fillTextWjx(question, answer) {
    const container = question.element;
    const input = container.querySelector('.ui-input-text input[type="text"], input[type="text"]');
    if (!input) throw new Error('未找到输入框');

    await Utils.scrollTo(input);

    const ansStr = String(answer);
    const numStr = ansStr.replace(/[^\d.\-]/g, '');
    if (numStr && !isNaN(Number(numStr))) {
      // For number-like answers, set value directly
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, numStr);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      // For text answers, try typing first, then fallback to native setter
      await Utils.typeText(input, ansStr);
      // Verify the value was set correctly
      if (!input.value && ansStr) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, ansStr);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }
  }

  async fillChoice(question, answer, type) {
    const options = question.options;
    const answers = type === 'checkbox' ? (Array.isArray(answer) ? answer : [answer]) : [answer];
    let lastSelectedWrapper = null;

    for (const ans of answers) {
      const ansStr = String(ans);
      const matched = Utils.matchOption(ansStr, options);
      if (!matched) continue;

      const inputType = type === 'radio' ? 'radio' : 'checkbox';
      const wrappers = question.element.querySelectorAll(`.ui-${inputType}`);

      let targetWrapper = null;
      let targetInput = null;

      for (const wrapper of wrappers) {
        const input = wrapper.querySelector(`input[type="${inputType}"]`);
        if (!input) continue;

        // Match by label text (most reliable for wjx since values are numeric)
        const labelDiv = wrapper.querySelector('div.label, .label');
        if (labelDiv) {
          const labelText = Utils.getText(labelDiv);
          if (labelText === matched.label || labelText === ansStr) {
            targetWrapper = wrapper;
            targetInput = input;
            break;
          }
        }

        // Fallback: match by value
        if (input.value === matched.value || input.value === ansStr) {
          targetWrapper = wrapper;
          targetInput = input;
          break;
        }
      }

      if (!targetWrapper || !targetInput) continue;

      const labelDiv = targetWrapper.querySelector('div.label, .label');
      const anchor = targetWrapper.querySelector(`a.jq${inputType}`);

      // Click the label div (most reliable for wjx)
      const clickTarget = labelDiv || anchor || targetWrapper;
      await Utils.scrollTo(clickTarget);

      // Use HTMLElement.prototype.click for reliable jQuery event triggering
      HTMLElement.prototype.click.call(clickTarget);

      // Also set the input checked state
      if (targetInput.type === 'radio') {
        const name = targetInput.name;
        question.element.querySelectorAll(`input[name="${name}"]`).forEach(r => {
          r.checked = false;
        });
      }
      targetInput.checked = true;
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));

      lastSelectedWrapper = targetWrapper;
      await Utils.randomDelay(100, 200);
    }

    return lastSelectedWrapper;
  }

  async fillFollowUpInWrapper(wrapper, text) {
    // Wait for jQuery animation to show the follow-up input
    await Utils.sleep(600);

    // Look for follow-up input within the specific wrapper
    const uiText = wrapper.querySelector('.ui-text');
    if (uiText) {
      const input = uiText.querySelector('input[type="text"]');
      if (input) {
        // Force visible in case jQuery didn't show it yet
        if (!Utils.isVisible(uiText)) {
          uiText.style.display = 'block';
          await Utils.sleep(200);
        }
        await Utils.scrollTo(input);
        await Utils.typeText(input, String(text));
        return;
      }
    }

    // Fallback to global search in the question container
    const questionContainer = wrapper.closest('.field');
    if (questionContainer) {
      await this.fillFollowUpWjx({ element: questionContainer }, text);
    }
  }

  async fillFollowUpWjx(question, text) {
    await Utils.sleep(500);

    const container = question.element;
    const textInputs = container.querySelectorAll(
      '.ui-text input[type="text"], .OtherText, .OtherRadioText'
    );

    for (const input of textInputs) {
      const uiText = input.closest('.ui-text');
      if (uiText && Utils.isVisible(uiText)) {
        await Utils.scrollTo(input);
        await Utils.typeText(input, String(text));
        return;
      }
      if (Utils.isVisible(input) && input.offsetParent !== null) {
        await Utils.scrollTo(input);
        await Utils.typeText(input, String(text));
        return;
      }
    }

    // Fallback: look for any visible text input
    const allTextInputs = container.querySelectorAll('input[type="text"]');
    for (const input of allTextInputs) {
      if (input.type !== 'hidden' && Utils.isVisible(input)) {
        await Utils.scrollTo(input);
        await Utils.typeText(input, String(text));
        return;
      }
    }
  }

  _getCssSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/).filter(c => c).slice(0, 2).join('.');
        if (cls) selector += '.' + cls;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      path.unshift(selector);
      if (path.join(' > ').length > 80) break;
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  submit(doc) {
    const btn = doc.querySelector('#ctlNext, .submitbtn, #submit_button, .submitbutton');
    if (btn) btn.click();
  }
}

AdapterRegistry.register(WjxAdapter);
