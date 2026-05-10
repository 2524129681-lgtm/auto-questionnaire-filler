// Content script - main orchestrator
// Runs on every page, detects questionnaires and manages the auto-fill flow

const PANEL_STYLES = `
  .qna-panel {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    width: 280px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    overflow: hidden;
    color: #1a1a2e;
    line-height: 1.4;
  }
  .qna-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: linear-gradient(135deg, #4A90D9, #357ABD);
    color: #fff;
    cursor: pointer;
    user-select: none;
  }
  .qna-icon {
    width: 24px;
    height: 24px;
    background: rgba(255,255,255,0.25);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }
  .qna-title {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
  }
  .qna-toggle {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
  }
  .qna-body {
    padding: 12px 14px;
  }
  .qna-info {
    font-size: 13px;
    color: #555;
    margin-bottom: 8px;
  }
  .qna-progress {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .qna-progress-bar {
    flex: 1;
    height: 6px;
    background: #e8e8e8;
    border-radius: 3px;
    overflow: hidden;
  }
  .qna-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4A90D9, #6DB3F8);
    border-radius: 3px;
    transition: width 0.3s ease;
    width: 0%;
  }
  .qna-progress-text {
    font-size: 11px;
    color: #888;
    white-space: nowrap;
  }
  .qna-log {
    max-height: 120px;
    overflow-y: auto;
    margin-bottom: 10px;
    font-size: 11px;
    font-family: "SF Mono", Monaco, Consolas, monospace;
    background: #f8f9fa;
    border-radius: 6px;
    padding: 6px 8px;
  }
  .qna-log-entry {
    padding: 1px 0;
    word-break: break-all;
  }
  .qna-log-info { color: #555; }
  .qna-log-success { color: #2e7d32; }
  .qna-log-error { color: #c62828; }
  .qna-log-warn { color: #e65100; }
  .qna-actions {
    display: flex;
    gap: 8px;
  }
  .qna-btn {
    flex: 1;
    padding: 7px 12px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }
  .qna-btn:active {
    transform: scale(0.97);
  }
  .qna-btn-primary {
    background: #4A90D9;
    color: #fff;
  }
  .qna-btn-primary:hover {
    background: #3a7bc8;
  }
  .qna-btn-secondary {
    background: #e8e8e8;
    color: #555;
  }
  .qna-btn-secondary:hover {
    background: #ddd;
  }
`;

class QuestionnaireAssistant {
  constructor() {
    this.adapter = null;
    this.questions = [];
    this.isProcessing = false;
    this.shadowHost = null;
    this.shadowRoot = null;
    this.panel = null;
  }

  init() {
    const detection = Detector.detect(document);
    if (!detection.found) return;

    this.adapter = AdapterRegistry.getAdapter(window.location.href, document);
    this.injectUI();
    this.log(`已检测到问卷 (${this.adapter.constructor.getPlatformName()})`, 'info');

    // Re-detect on DOM changes (for SPAs)
    const observer = new MutationObserver(() => {
      if (!this.isProcessing) this.refreshQuestionCount();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  injectUI() {
    this.shadowHost = document.createElement('div');
    this.shadowHost.id = '__qna_assistant__';
    this.shadowHost.style.cssText = 'all:initial; position:fixed; bottom:20px; right:20px; z-index:2147483647;';
    document.body.appendChild(this.shadowHost);

    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_STYLES;
    this.shadowRoot.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.className = 'qna-panel';
    this.panel.innerHTML = `
      <div class="qna-header" id="qna-header">
        <span class="qna-icon">Q</span>
        <span class="qna-title">问卷助手</span>
        <button class="qna-toggle" id="qna-toggle">▼</button>
      </div>
      <div class="qna-body" id="qna-body">
        <div class="qna-info" id="qna-info">正在检测...</div>
        <div class="qna-progress" id="qna-progress" style="display:none">
          <div class="qna-progress-bar">
            <div class="qna-progress-fill" id="qna-progress-fill"></div>
          </div>
          <span class="qna-progress-text" id="qna-progress-text">0/0</span>
        </div>
        <div class="qna-log" id="qna-log"></div>
        <div class="qna-actions">
          <button class="qna-btn qna-btn-primary" id="qna-start">开始填写</button>
          <button class="qna-btn qna-btn-secondary" id="qna-stop" style="display:none">停止</button>
        </div>
      </div>
    `;
    this.shadowRoot.appendChild(this.panel);

    // Event listeners
    this.shadowRoot.getElementById('qna-toggle').addEventListener('click', () => this.togglePanel());
    this.shadowRoot.getElementById('qna-header').addEventListener('click', () => this.togglePanel());
    this.shadowRoot.getElementById('qna-start').addEventListener('click', () => this.startAutoFill());
    this.shadowRoot.getElementById('qna-stop').addEventListener('click', () => this.stopAutoFill());

    this.refreshQuestionCount();
  }

  togglePanel() {
    const body = this.shadowRoot.getElementById('qna-body');
    const toggle = this.shadowRoot.getElementById('qna-toggle');
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? 'block' : 'none';
    toggle.textContent = isCollapsed ? '▼' : '▲';
  }

  refreshQuestionCount() {
    try {
      this.questions = this.adapter.parseQuestions(document);
      const info = this.shadowRoot.getElementById('qna-info');
      if (info) {
        info.textContent = `检测到 ${this.questions.length} 道题目`;
      }
    } catch (e) {
      // Silent fail on refresh
    }
  }

  log(text, type = 'info') {
    const logEl = this.shadowRoot?.getElementById('qna-log');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `qna-log-entry qna-log-${type}`;
    entry.textContent = `[${time}] ${text}`;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }

  updateProgress(current, total) {
    const progressEl = this.shadowRoot.getElementById('qna-progress');
    const fillEl = this.shadowRoot.getElementById('qna-progress-fill');
    const textEl = this.shadowRoot.getElementById('qna-progress-text');

    progressEl.style.display = 'block';
    const pct = total > 0 ? (current / total * 100) : 0;
    fillEl.style.width = `${pct}%`;
    textEl.textContent = `${current}/${total}`;
  }

  async startAutoFill() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const startBtn = this.shadowRoot.getElementById('qna-start');
    const stopBtn = this.shadowRoot.getElementById('qna-stop');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    try {
      // Parse questions
      this.log('正在解析题目...');
      this.questions = this.adapter.parseQuestions(document);

      if (this.questions.length === 0) {
        this.log('未检测到题目', 'error');
        return;
      }

      // Log question details for debugging
      const typeCounts = {};
      this.questions.forEach(q => {
        typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
      });
      const typeSummary = Object.entries(typeCounts).map(([t, c]) => `${t}×${c}`).join(', ');
      this.log(`解析到 ${this.questions.length} 道题目 (${typeSummary})`);

      // Log first few questions for verification
      this.questions.slice(0, 3).forEach(q => {
        const optStr = q.options?.length ? ` [${q.options.length}个选项]` : '';
        this.log(`  ${q.id}: [${q.type}] ${q.title.slice(0, 30)}...${optStr}`);
      });
      if (this.questions.length > 3) {
        this.log(`  ... 还有 ${this.questions.length - 3} 道题`);
      }

      this.updateProgress(0, this.questions.length);

      // Request answers from LLM
      this.log('正在请求 AI 生成答案...');
      const answers = await this.requestLLMAnswers();

      if (!answers || answers.length === 0) {
        this.log('AI 未能生成答案', 'error');
        return;
      }

      this.log(`已收到 ${answers.length} 个答案，开始填写...`);

      // Log first few answers for debugging
      answers.slice(0, 3).forEach(a => {
        const ansStr = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer).slice(0, 40);
        const followStr = a.followUp ? ` → "${String(a.followUp).slice(0, 20)}"` : '';
        this.log(`  ${a.id}: ${ansStr}${followStr}`);
      });

      // Fill answers
      for (let i = 0; i < this.questions.length; i++) {
        if (!this.isProcessing) {
          this.log('已停止填写', 'warn');
          break;
        }

        const question = this.questions[i];
        const answer = answers.find(a => a.id === question.id) || answers[i];

        if (!answer) {
          this.log(`[${i + 1}/${this.questions.length}] 跳过 - 无答案`, 'warn');
          continue;
        }

        try {
          await Utils.scrollTo(question.element);
          // Pass the full answer object if it has followUp, otherwise just the answer value
          const answerValue = answer.followUp ? answer : answer.answer;
          await this.adapter.fillAnswer(document, question, answerValue);
          const followUpTag = answer.followUp ? ' +附带文本' : '';
          this.log(`[${i + 1}/${this.questions.length}] ✓ ${question.type}${followUpTag}`, 'success');
        } catch (err) {
          this.log(`[${i + 1}/${this.questions.length}] ✗ ${err.message}`, 'error');
        }

        this.updateProgress(i + 1, this.questions.length);
        await Utils.randomDelay(150, 400);
      }

      this.log('填写完成!', 'success');

      // Auto-submit if enabled
      const { appSettings } = await chrome.storage.local.get('appSettings');
      if (appSettings?.autoSubmit) {
        this.log('正在自动提交...');
        await Utils.sleep(1000);
        this.adapter.submit(document);
        this.log('已提交', 'success');
      }

    } catch (err) {
      this.log(`错误: ${err.message}`, 'error');
    } finally {
      this.isProcessing = false;
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  }

  stopAutoFill() {
    this.isProcessing = false;
  }

  async requestLLMAnswers() {
    return new Promise((resolve, reject) => {
      const pageContext = this.adapter.getPageContext(document);

      // Serialize questions (remove DOM element references)
      const serialized = this.questions.map(q => ({
        id: q.id,
        index: q.index,
        type: q.type,
        title: q.title,
        description: q.description,
        required: q.required,
        options: q.options,
        meta: q.meta
      }));

      chrome.runtime.sendMessage(
        { type: 'REQUEST_ANSWERS', questions: serialized, pageContext },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response?.answers || []);
          }
        }
      );
    });
  }

  handleMessage(message, sender, sendResponse) {
    if (message.type === 'PING') {
      sendResponse({
        found: true,
        platform: this.adapter?.constructor?.getPlatformName(),
        questionCount: this.questions.length,
        isProcessing: this.isProcessing
      });
    }
  }
}

// Initialize when DOM is ready
const assistant = new QuestionnaireAssistant();
assistant.init();
