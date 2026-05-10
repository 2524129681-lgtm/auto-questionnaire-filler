const $ = (id) => document.getElementById(id);

function showStatus(text, type = 'info') {
  const bar = $('status-bar');
  bar.className = `status-bar ${type}`;
  $('status-text').textContent = text;
  bar.classList.remove('hidden');
  if (type === 'success') {
    setTimeout(() => bar.classList.add('hidden'), 3000);
  }
}

async function loadSettings() {
  const { llmConfig } = await chrome.storage.local.get('llmConfig');
  if (llmConfig) {
    $('baseUrl').value = llmConfig.baseUrl || '';
    $('apiKey').value = llmConfig.apiKey || '';
    $('model').value = llmConfig.model || '';
  }
  const { appSettings } = await chrome.storage.local.get('appSettings');
  if (appSettings) {
    $('tone').value = appSettings.tone || 'neutral';
    $('autoSubmit').checked = appSettings.autoSubmit || false;
  }
}

async function saveSettings() {
  const config = {
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, ''),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim()
  };

  if (!config.apiKey) {
    showStatus('请输入 API Key', 'error');
    return;
  }
  if (!config.model) {
    showStatus('请输入模型名称', 'error');
    return;
  }
  if (!config.baseUrl) {
    config.baseUrl = 'https://api.openai.com/v1';
  }

  await chrome.storage.local.set({ llmConfig: config });
  await chrome.storage.local.set({
    appSettings: {
      tone: $('tone').value,
      autoSubmit: $('autoSubmit').checked
    }
  });

  showStatus('配置已保存', 'success');
}

async function testConnection() {
  const config = {
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1',
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim()
  };

  if (!config.apiKey || !config.model) {
    showStatus('请先填写 API Key 和模型名称', 'error');
    return;
  }

  $('testBtn').disabled = true;
  $('testBtn').textContent = '测试中...';
  showStatus('正在连接...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      config
    });

    if (response.error) {
      showStatus(`连接失败: ${response.error}`, 'error');
    } else {
      showStatus(`连接成功! 模型: ${response.model}`, 'success');
    }
  } catch (err) {
    showStatus(`连接失败: ${err.message}`, 'error');
  } finally {
    $('testBtn').disabled = false;
    $('testBtn').textContent = '测试连接';
  }
}

function toggleKeyVisibility() {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

$('saveBtn').addEventListener('click', saveSettings);
$('testBtn').addEventListener('click', testConnection);
$('toggleKey').addEventListener('click', toggleKeyVisibility);

loadSettings();
