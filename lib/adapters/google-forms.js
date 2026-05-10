// Google Forms adapter

class GoogleFormsAdapter extends BaseAdapter {
  static matches(url, doc) {
    return /docs\.google\.com\/forms/.test(url);
  }

  static getPlatformName() {
    return 'google-forms';
  }

  parseQuestions(doc) {
    const questions = [];
    const containers = doc.querySelectorAll(
      '.freebirdFormviewerViewNumberedItemContainer, [data-item-id]'
    );

    containers.forEach((container, index) => {
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
    const el = container.querySelector(
      '.freebirdFormviewerComponentsQuestionBaseTitle, ' +
      '[role="heading"], ' +
      '.freebirdFormviewerComponentsQuestionBaseHeader'
    );
    return el ? Utils.getText(el) : '';
  }

  detectType(container) {
    // Google Forms uses Material Design with role attributes
    if (container.querySelector('[role="radiogroup"]')) return 'radio';
    if (container.querySelector('[role="listbox"]')) return 'select';
    if (container.querySelector('[role="checkbox"]')) return 'checkbox';
    if (container.querySelector('[role="radio"]')) return 'radio';
    if (container.querySelector('.freebirdFormviewerComponentsQuestionDateDateInput input')) return 'date';
    if (container.querySelector('.freebirdFormviewerComponentsQuestionScaleScaleContainer')) return 'rating';
    if (container.querySelector('textarea')) return 'textarea';
    if (container.querySelector('input[type="text"]')) return 'text';

    // Check for grid/matrix
    if (container.querySelector('.freebirdFormviewerComponentsQuestionGridBodyContainer')) return 'matrix';

    return 'text';
  }

  extractOptions(container) {
    const type = this.detectType(container);
    const options = [];

    if (type === 'radio' || type === 'checkbox') {
      const optionEls = container.querySelectorAll(
        '.freebirdFormviewerComponentsQuestionRadioChoice, ' +
        '.freebirdFormviewerComponentsQuestionCheckboxChoice, ' +
        '[role="option"], ' +
        '[data-value]'
      );

      optionEls.forEach(el => {
        const text = Utils.getText(el);
        const value = el.getAttribute('data-value') || text;
        if (text) {
          options.push({ value, label: text });
        }
      });
    }

    return options;
  }

  isRequired(container) {
    return !!container.querySelector('[aria-required="true"], .freebirdFormviewerComponentsQuestionBaseRequiredAsterisk');
  }

  async fillAnswer(doc, question, answer) {
    const type = question.type;

    if (type === 'radio') {
      // Google Forms uses clickable divs with role="radio"
      const options = question.options;
      const matched = Utils.matchOption(String(answer), options);
      if (!matched) throw new Error(`未匹配到选项: ${answer}`);

      const radios = question.element.querySelectorAll('[role="radio"], [data-value]');
      for (const radio of radios) {
        if (Utils.getText(radio).includes(matched.label) || radio.getAttribute('data-value') === matched.value) {
          await Utils.scrollTo(radio);
          await Utils.simulateClick(radio);
          return;
        }
      }
      throw new Error(`未找到选项: ${matched.label}`);
    }

    if (type === 'checkbox') {
      const answers = Array.isArray(answer) ? answer : [answer];
      const options = question.options;

      for (const ans of answers) {
        const matched = Utils.matchOption(String(ans), options);
        if (!matched) continue;

        const checkboxes = question.element.querySelectorAll('[role="checkbox"], [data-value]');
        for (const cb of checkboxes) {
          if (Utils.getText(cb).includes(matched.label) || cb.getAttribute('data-value') === matched.value) {
            await Utils.simulateClick(cb);
            await Utils.randomDelay(80, 150);
            break;
          }
        }
      }
      return;
    }

    if (type === 'select') {
      // Google Forms uses a custom dropdown
      const selectTrigger = question.element.querySelector('[role="listbox"]');
      if (selectTrigger) {
        await Utils.simulateClick(selectTrigger);
        await Utils.sleep(300);

        const matched = Utils.matchOption(String(answer), question.options);
        if (matched) {
          const options = document.querySelectorAll('[role="option"]');
          for (const opt of options) {
            if (Utils.getText(opt).includes(matched.label)) {
              await Utils.simulateClick(opt);
              return;
            }
          }
        }
      }
      return;
    }

    if (type === 'rating') {
      const score = Number(answer);
      const scaleItems = question.element.querySelectorAll(
        '.freebirdFormviewerComponentsQuestionScaleScaleContainer div[role="radio"], ' +
        '.freebirdFormviewerComponentsQuestionScaleNumberContainer'
      );
      const targetIndex = Math.min(Math.max(Math.round(score), 1), scaleItems.length) - 1;
      if (scaleItems[targetIndex]) {
        await Utils.simulateClick(scaleItems[targetIndex]);
      }
      return;
    }

    // Default: use base AnswerFiller
    await AnswerFiller.fill(doc, question, answer);
  }

  submit(doc) {
    const btn = doc.querySelector(
      '.freebirdFormviewerViewNavigationSubmitButton, ' +
      '[role="button"][jsname="M2UYVd"], ' +
      'div[role="button"]'
    );
    if (btn) btn.click();
  }
}

AdapterRegistry.register(GoogleFormsAdapter);
