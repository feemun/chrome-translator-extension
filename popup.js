// DOM元素管理类
class DOMElements {
  constructor() {
    this.elements = {};
    this.initElements();
  }

  initElements() {
    const elementIds = [
      'connectionDot', 'connectionStatus', 'inputText', 'translateBtn',
      'getSelectedBtn', 'translateResult', 'ollamaUrl', 'model',
      'refreshModelsBtn', 'targetLanguage', 'prompt', 'saveBtn',
      'testBtn', 'statusMessage'
    ];
    
    elementIds.forEach(id => {
      this.elements[id] = document.getElementById(id);
      if (!this.elements[id]) {
        console.warn(`Element with id '${id}' not found`);
      }
    });
  }

  get(elementId) {
    return this.elements[elementId];
  }
}

const elements = new DOMElements();

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await loadModels();
  await checkConnection();
  bindEvents();
});

// 绑定事件
function bindEvents() {
  elements.get('translateBtn')?.addEventListener('click', translateText);
  elements.get('getSelectedBtn')?.addEventListener('click', getSelectedText);
  elements.get('saveBtn')?.addEventListener('click', saveConfig);
  elements.get('testBtn')?.addEventListener('click', testConnection);
  elements.get('refreshModelsBtn')?.addEventListener('click', loadModels);
  
  // 回车键翻译
  elements.get('inputText')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      translateText();
    }
  });
}

// 配置管理类
class ConfigManager {
  static DEFAULT_CONFIG = {
    ollamaUrl: 'http://localhost:11434',
    model: 'qwen2.5:latest',
    targetLanguage: 'zh-CN',
    prompt: '请将以下文本翻译成中文，保持原文的格式和换行符，只返回翻译结果，不要添加任何解释：'
  };

  static async load() {
    try {
      const config = await chrome.storage.sync.get(this.DEFAULT_CONFIG);
      
      const ollamaUrlEl = elements.get('ollamaUrl');
      const targetLanguageEl = elements.get('targetLanguage');
      const promptEl = elements.get('prompt');
      
      if (ollamaUrlEl) ollamaUrlEl.value = config.ollamaUrl;
      if (targetLanguageEl) targetLanguageEl.value = config.targetLanguage;
      if (promptEl) promptEl.value = config.prompt;
      
      // 保存当前选中的模型，稍后在loadModels中设置
      window.currentModel = config.model;
      return config;
    } catch (error) {
      showStatus('加载配置失败: ' + error.message, 'error');
      throw error;
    }
  }

  static async save() {
    try {
      const config = {
        ollamaUrl: elements.get('ollamaUrl')?.value?.trim() || '',
        model: elements.get('model')?.value || '',
        targetLanguage: elements.get('targetLanguage')?.value || 'zh-CN',
        prompt: elements.get('prompt')?.value?.trim() || ''
      };
      
      // 验证配置
      if (!config.ollamaUrl || !config.model || !config.prompt) {
        throw new Error('请填写完整的配置信息');
      }
      
      await chrome.storage.sync.set(config);
      showStatus('配置保存成功', 'success');
      
      // 重新检查连接
      setTimeout(checkConnection, 500);
      return config;
    } catch (error) {
      showStatus('保存配置失败: ' + error.message, 'error');
      throw error;
    }
  }
}

// 加载配置
async function loadConfig() {
  return await ConfigManager.load();
}

// 模型管理类
class ModelManager {
  static async loadModels() {
    const refreshBtn = elements.get('refreshModelsBtn');
    const modelSelect = elements.get('model');
    
    if (!refreshBtn || !modelSelect) {
      console.error('Required elements not found for model loading');
      return;
    }
    
    // 显示加载状态
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳';
    modelSelect.innerHTML = '<option value="">加载中...</option>';
    
    try {
      const config = await chrome.storage.sync.get({ ollamaUrl: 'http://localhost:11434' });
      
      const response = await fetch(`${config.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      
      this.populateModelSelect(modelSelect, models);
      
    } catch (error) {
      modelSelect.innerHTML = '<option value="">加载失败</option>';
      const errorMsg = error.name === 'TypeError' ? '无法连接到Ollama服务' : error.message;
      showStatus('加载模型列表失败: ' + errorMsg, 'error');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄';
    }
  }

  static populateModelSelect(modelSelect, models) {
    // 清空并重新填充模型列表
    modelSelect.innerHTML = '';
    
    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">未找到模型</option>';
      showStatus('未找到任何模型，请先下载模型：ollama pull qwen2.5:7b', 'info');
      return;
    }
    
    // 添加模型选项
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name} (${this.formatSize(model.size)})`;
      modelSelect.appendChild(option);
    });
    
    // 设置之前保存的模型
    this.setSelectedModel(modelSelect, models);
    
    showStatus(`成功加载 ${models.length} 个模型`, 'success');
  }

  static setSelectedModel(modelSelect, models) {
    if (window.currentModel) {
      modelSelect.value = window.currentModel;
      // 如果保存的模型不在列表中，添加一个选项
      if (!modelSelect.value) {
        const option = document.createElement('option');
        option.value = window.currentModel;
        option.textContent = `${window.currentModel} (未找到)`;
        option.style.color = '#f44336';
        modelSelect.appendChild(option);
        modelSelect.value = window.currentModel;
      }
    } else if (models.length > 0) {
      // 如果没有保存的模型，选择第一个
      modelSelect.value = models[0].name;
    }
  }

  static formatSize(bytes) {
    if (!bytes) return '未知大小';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// 加载模型列表
async function loadModels() {
  return await ModelManager.loadModels();
}

// 保存配置
async function saveConfig() {
  return await ConfigManager.save();
}

// 连接管理类
class ConnectionManager {
  static async testConnection() {
    const testBtn = elements.get('testBtn');
    if (!testBtn) return;
    
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    
    try {
      const ollamaUrlEl = elements.get('ollamaUrl');
      const ollamaUrl = ollamaUrlEl?.value?.trim() || 'http://localhost:11434';
      
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        showStatus(`连接成功！发现 ${data.models?.length || 0} 个模型`, 'success');
        this.updateConnectionStatus(true);
        // 连接成功后自动刷新模型列表
        setTimeout(loadModels, 500);
      } else if (response.status === 403) {
        throw new Error('权限错误。解决方案：\n1. 停止Ollama: pkill ollama\n2. 设置环境变量: export OLLAMA_ORIGINS="*"\n3. 重启Ollama: ollama serve\n4. 或尝试: OLLAMA_ORIGINS="*" ollama serve');
      } else {
        throw new Error(`连接失败: ${response.status}`);
      }
    } catch (error) {
      const errorMsg = error.name === 'TypeError' ? '无法连接到Ollama服务' : error.message;
      showStatus('连接失败: ' + errorMsg, 'error');
      this.updateConnectionStatus(false);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  }

  static async checkConnection() {
    try {
      const config = await chrome.storage.sync.get({ ollamaUrl: 'http://localhost:11434' });
      const response = await fetch(`${config.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        }
      });
      this.updateConnectionStatus(response.ok);
    } catch (error) {
      this.updateConnectionStatus(false);
    }
  }

  static updateConnectionStatus(connected) {
    const connectionDot = elements.get('connectionDot');
    const connectionStatus = elements.get('connectionStatus');
    
    if (!connectionDot || !connectionStatus) return;
    
    if (connected) {
      connectionDot.className = 'status-dot connected';
      connectionStatus.textContent = 'Ollama服务已连接';
    } else {
      connectionDot.className = 'status-dot disconnected';
      connectionStatus.textContent = 'Ollama服务未连接';
    }
  }
}

// 测试连接
async function testConnection() {
  return await ConnectionManager.testConnection();
}

// 检查连接状态
async function checkConnection() {
  return await ConnectionManager.checkConnection();
}

// 翻译管理类
class TranslationManager {
  static async translateText() {
    const inputTextEl = elements.get('inputText');
    const translateBtnEl = elements.get('translateBtn');
    const translateResultEl = elements.get('translateResult');
    
    if (!inputTextEl || !translateBtnEl || !translateResultEl) {
      console.error('Required elements not found for translation');
      return;
    }
    
    const text = inputTextEl.value.trim();
    if (!text) {
      showStatus('请输入要翻译的文本', 'error');
      return;
    }
    
    translateBtnEl.disabled = true;
    translateBtnEl.textContent = '翻译中...';
    translateResultEl.style.display = 'block';
    translateResultEl.textContent = '翻译中，请稍候...';
    
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'translate',
          text: text
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('连接错误: ' + chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      if (response && response.success) {
        // 转义HTML特殊字符，然后将换行符转换为<br>标签
        const escapedTranslation = response.translation
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/\n/g, '<br>');
        
        translateResultEl.innerHTML = escapedTranslation;
        showStatus('翻译完成', 'success');
      } else {
        throw new Error(response?.error || '翻译失败');
      }
    } catch (error) {
      translateResultEl.textContent = '翻译失败: ' + error.message;
      showStatus('翻译失败: ' + error.message, 'error');
    } finally {
      translateBtnEl.disabled = false;
      translateBtnEl.textContent = '翻译';
    }
  }

  static async getSelectedText() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'getSelectedText'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('连接错误: ' + chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      if (response && response.text) {
        const inputTextEl = elements.get('inputText');
        if (inputTextEl) {
          inputTextEl.value = response.text;
          showStatus('已获取选中文本', 'success');
        }
      } else {
        showStatus('未找到选中文本', 'info');
      }
    } catch (error) {
      showStatus('获取选中文本失败: ' + error.message, 'error');
    }
  }
}

// 翻译文本
async function translateText() {
  return await TranslationManager.translateText();
}

// 获取选中文本
async function getSelectedText() {
  return await TranslationManager.getSelectedText();
}

// UI管理类
class UIManager {
  static showStatus(message, type = 'info') {
    const statusMessageEl = elements.get('statusMessage');
    if (!statusMessageEl) {
      console.warn('Status message element not found');
      return;
    }
    
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`;
    statusMessageEl.style.display = 'block';
    
    // 3秒后自动隐藏
    setTimeout(() => {
      statusMessageEl.style.display = 'none';
    }, 3000);
  }
}

// 显示状态消息
function showStatus(message, type = 'info') {
  UIManager.showStatus(message, type);
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translationComplete') {
    const translateResultEl = elements.get('translateResult');
    if (!translateResultEl) return;
    
    if (request.success) {
      // 转义HTML特殊字符，然后将换行符转换为<br>标签
      const escapedTranslation = request.translation
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>');
      
      translateResultEl.innerHTML = escapedTranslation;
      showStatus('翻译完成', 'success');
    } else {
      translateResultEl.textContent = '翻译失败: ' + request.error;
      showStatus('翻译失败: ' + request.error, 'error');
    }
  }
});