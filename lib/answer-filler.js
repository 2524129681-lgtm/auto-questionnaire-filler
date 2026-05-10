// Answer filler - fills answers back into DOM elements
// Each question type has a dedicated filler that simulates realistic user interaction

const AnswerFiller = {
  async fill(doc, question, answer) {
    if (answer === undefined || answer === null) {
      throw new Error('无答案');
    }

    const filler = this.fillers[question.type];
    if (!filler) {
      throw new Error(`不支持的题型: ${question.type}`);
    }

    // Extract followUp from answer if present (answer might be an object with answer + followUp)
    let followUpText = null;
    let actualAnswer = answer;
    if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && answer.followUp) {
      followUpText = answer.followUp;
      actualAnswer = answer.answer;
    }

    await filler(question.element, actualAnswer, question);

    // If there's follow-up text, try to fill it
    if (followUpText) {
      await this.fillFollowUp(question, followUpText);
    }
  },

  // Fill follow-up text input that appears after selecting an option
  async fillFollowUp(question, text) {
    const container = question.element;
    await Utils.sleep(300); // Wait for the follow-up input to appear

    // Find visible text inputs that weren't there before (or were hidden)
    const candidates = container.querySelectorAll(
      'input[type="text"]:not([type="hidden"]), textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'
    );

    for (const input of candidates) {
      // Check if the input is now visible
      if (Utils.isVisible(input) && input.offsetParent !== null) {
        // Check if it's empty or near the selected option
        await Utils.scrollTo(input);
        await Utils.typeText(input, String(text));
        return;
      }
    }

    // Fallback: look for any text input with "other" related class/id
    const otherInput = container.querySelector(
      'input[class*="other"], input[class*="fill"], input[class*="explain"], ' +
      'textarea[class*="other"], textarea[class*="fill"]'
    );
    if (otherInput && Utils.isVisible(otherInput)) {
      await Utils.scrollTo(otherInput);
      await Utils.typeText(otherInput, String(text));
      return;
    }
  },

  fillers: {
    // Radio buttons
    async radio(container, answer, question) {
      const options = question.options;
      const ansStr = String(answer);
      const inputs = container.querySelectorAll('input[type="radio"]');

      // Build input -> label map
      const inputLabelMap = new Map();
      inputs.forEach(input => {
        let label = '';
        if (input.id) {
          const labelEl = container.querySelector(`label[for="${input.id}"]`);
          if (labelEl) label = Utils.getText(labelEl);
        }
        if (!label) {
          const parentLabel = input.closest('label');
          if (parentLabel) label = Utils.getText(parentLabel);
        }
        if (!label) {
          const li = input.closest('li, .option, [class*="item"], [class*="choice"]');
          if (li) {
            const clone = li.cloneNode(true);
            clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
            label = Utils.getText(clone);
          }
        }
        if (!label) {
          const sib = input.nextElementSibling;
          if (sib && sib.tagName !== 'INPUT') label = Utils.getText(sib);
        }
        inputLabelMap.set(input, label);
      });

      const matched = Utils.matchOption(ansStr, options);
      let target = null;

      // Strategy 1: Match by label text
      if (matched) {
        for (const [input, label] of inputLabelMap) {
          if (label.includes(matched.label) || matched.label.includes(label)) {
            target = input;
            break;
          }
        }
        // Strategy 2: Match by input value
        if (!target) {
          for (const input of inputs) {
            if (input.value === matched.value) {
              target = input;
              break;
            }
          }
        }
      }

      // Strategy 3: Direct label match
      if (!target) {
        for (const [input, label] of inputLabelMap) {
          if (label.includes(ansStr) || ansStr.includes(label)) {
            target = input;
            break;
          }
        }
      }

      // Strategy 4: Direct value match
      if (!target) {
        for (const input of inputs) {
          if (input.value === ansStr) {
            target = input;
            break;
          }
        }
      }

      // Strategy 5: Index match
      if (!target && matched) {
        const idx = options.findIndex(o => o.value === matched.value || o.label === matched.label);
        if (idx >= 0 && idx < inputs.length) {
          target = inputs[idx];
        }
      }

      if (!target) throw new Error(`未匹配到选项: ${answer}`);

      await Utils.scrollTo(target);
      await Utils.simulateClick(target);
      if (target.checked !== undefined && !target.checked) {
        target.checked = true;
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));
    },

    // Checkboxes
    async checkbox(container, answer, question) {
      const answers = Array.isArray(answer) ? answer : [answer];
      const options = question.options;
      const inputs = container.querySelectorAll('input[type="checkbox"]');

      // Build a map: input -> associated label text
      const inputLabelMap = new Map();
      inputs.forEach(input => {
        let label = '';
        // Try label[for]
        if (input.id) {
          const labelEl = container.querySelector(`label[for="${input.id}"]`);
          if (labelEl) label = Utils.getText(labelEl);
        }
        // Try parent label
        if (!label) {
          const parentLabel = input.closest('label');
          if (parentLabel) label = Utils.getText(parentLabel);
        }
        // Try closest list item
        if (!label) {
          const li = input.closest('li, .option, [class*="item"], [class*="choice"]');
          if (li) {
            const clone = li.cloneNode(true);
            clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
            label = Utils.getText(clone);
          }
        }
        // Try sibling
        if (!label) {
          const sib = input.nextElementSibling;
          if (sib && sib.tagName !== 'INPUT') label = Utils.getText(sib);
        }
        inputLabelMap.set(input, label);
      });

      for (const ans of answers) {
        const ansStr = String(ans);
        let target = null;

        // Strategy 1: Match by option label text -> find the input with matching label
        const matched = Utils.matchOption(ansStr, options);
        if (matched) {
          for (const [input, label] of inputLabelMap) {
            if (label.includes(matched.label) || matched.label.includes(label)) {
              target = input;
              break;
            }
          }
          // Strategy 2: Match by input value
          if (!target) {
            for (const input of inputs) {
              if (input.value === matched.value) {
                target = input;
                break;
              }
            }
          }
        }

        // Strategy 3: Direct label text match (answer might be the label itself)
        if (!target) {
          for (const [input, label] of inputLabelMap) {
            if (label.includes(ansStr) || ansStr.includes(label)) {
              target = input;
              break;
            }
          }
        }

        // Strategy 4: Match by input value directly
        if (!target) {
          for (const input of inputs) {
            if (input.value === ansStr) {
              target = input;
              break;
            }
          }
        }

        // Strategy 5: Match by option index
        if (!target && matched) {
          const idx = options.findIndex(o => o.value === matched.value || o.label === matched.label);
          if (idx >= 0 && idx < inputs.length) {
            target = inputs[idx];
          }
        }

        if (target) {
          await Utils.scrollTo(target);
          await Utils.simulateClick(target);
          if (target.checked !== undefined && !target.checked) {
            target.checked = true;
          }
          target.dispatchEvent(new Event('change', { bubbles: true }));
          await Utils.randomDelay(80, 150);
        }
      }
    },

    // Text input
    async text(container, answer, question) {
      const input = container.querySelector(
        'input[type="text"], input[type="email"], input[type="number"], input[type="tel"]'
      );
      if (!input) throw new Error('未找到输入框');

      await Utils.scrollTo(input);

      // For number inputs, just set value directly (no need to type character by character)
      if (input.type === 'number') {
        const numVal = String(answer).replace(/[^\d.\-]/g, '');
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, numVal);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return;
      }

      await Utils.typeText(input, String(answer));
    },

    // Textarea
    async textarea(container, answer, question) {
      const textarea = container.querySelector('textarea');
      if (!textarea) throw new Error('未找到文本域');

      let text = String(answer);
      if (question.meta?.maxLength && text.length > question.meta.maxLength) {
        text = text.slice(0, question.meta.maxLength);
      }

      await Utils.scrollTo(textarea);
      await Utils.typeText(textarea, text);
    },

    // Select dropdown
    async select(container, answer, question) {
      const select = container.querySelector('select');
      if (!select) throw new Error('未找到下拉框');

      const matched = Utils.matchOption(String(answer), question.options);
      if (!matched) throw new Error(`未匹配到选项: ${answer}`);

      await Utils.scrollTo(select);
      select.value = matched.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
    },

    // Rating (stars, NPS, etc.)
    async rating(container, answer, question) {
      const score = Number(answer);
      if (isNaN(score)) throw new Error(`无效评分: ${answer}`);

      // Try radio-based rating
      const radios = container.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        const targetIndex = Math.min(Math.max(Math.round(score), 1), radios.length) - 1;
        const target = radios[targetIndex];
        if (target) {
          await Utils.scrollTo(target);
          await Utils.simulateClick(target);
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }

      // Try star/clickable rating
      const stars = container.querySelectorAll(
        '[data-value], .star, .rating-item, [class*="star"], [class*="level"]'
      );
      if (stars.length > 0) {
        const targetIndex = Math.min(Math.max(Math.round(score), 1), stars.length) - 1;
        const target = stars[targetIndex];
        if (target) {
          await Utils.scrollTo(target);
          await Utils.simulateClick(target);
          return;
        }
      }

      // Try range input
      const range = container.querySelector('input[type="range"]');
      if (range) {
        await Utils.scrollTo(range);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(range, score);
        range.dispatchEvent(new Event('input', { bubbles: true }));
        range.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      throw new Error('未找到评分元素');
    },

    // Matrix question
    async matrix(container, answer, question) {
      const table = container.querySelector('table');
      if (!table) throw new Error('未找到矩阵表格');

      const rowAnswers = typeof answer === 'object' ? answer : {};
      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');

      // Get column headers
      const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td');
      const colHeaders = Array.from(headerCells).slice(1).map(h => Utils.getText(h));

      for (const [rowLabel, colLabel] of Object.entries(rowAnswers)) {
        // Find the row
        let targetRow = null;
        for (const row of rows) {
          const firstCell = row.querySelector('th, td');
          if (firstCell && Utils.getText(firstCell).includes(rowLabel)) {
            targetRow = row;
            break;
          }
        }
        if (!targetRow) continue;

        // Find the column index
        const colIndex = colHeaders.findIndex(c => c.includes(colLabel) || colLabel.includes(c));
        if (colIndex === -1) continue;

        // Find and click the input in the matching cell
        const cells = targetRow.querySelectorAll('td');
        const cell = cells[colIndex];
        if (!cell) continue;

        const input = cell.querySelector('input[type="radio"], input[type="checkbox"]');
        if (input) {
          await Utils.simulateClick(input);
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          await Utils.randomDelay(80, 150);
        }
      }
    },

    // Date picker
    async date(container, answer, question) {
      const input = container.querySelector(
        'input[type="date"], input[type="time"], input[type="datetime-local"]'
      );
      if (!input) throw new Error('未找到日期选择器');

      await Utils.scrollTo(input);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, String(answer));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },

    // Slider / range
    async slider(container, answer, question) {
      const range = container.querySelector('input[type="range"]');
      if (!range) throw new Error('未找到滑块');

      await Utils.scrollTo(range);
      const value = Number(answer);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(range, value);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
};
