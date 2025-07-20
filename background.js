// 配置管理类
class BackgroundConfigManager {
  static DEFAULT_CONFIG = {
    ollamaUrl: 'http://localhost:11434',
    model: 'qwen2.5:latest',
    targetLanguage: 'zh-CN',
    prompt: '请将以下文本翻译成中文，只返回翻译结果，不要添加任何解释：'
  };

  static async getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.DEFAULT_CONFIG, (result) => {
        resolve(result);
      });
    });
  }

  static async saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(config, () => {
        resolve();
      });
    });
  }
}

// 消息处理类
class MessageHandler {
  static setupListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'translate') {
        this.handleTranslateRequest(request.text, sendResponse);
        return true; // 保持消息通道开放
      }
    });
  }

  static async handleTranslateRequest(text, sendResponse) {
    try {
      const translation = await TranslationService.translateText(text);
      sendResponse({ success: true, translation });
    } catch (error) {
      console.error('Translation error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}

// 初始化消息监听器
MessageHandler.setupListeners();

// 翻译服务类
class TranslationService {
  static async translateText(text) {
    try {
      // 获取用户配置
      const config = await BackgroundConfigManager.getConfig();
      
      // 构建翻译提示
      const prompt = `${config.prompt}\n\n"${text}"`;
      
      // 调用Ollama API
      const requestBody = {
        model: config.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: 1000
        }
      };
      
      const response = await this.makeOllamaRequest(config.ollamaUrl, requestBody);
      const data = await response.json();
      
      if (!data.response) {
        throw new Error('API返回数据格式错误');
      }
      
      return data.response.trim();
      
    } catch (error) {
      if (error.name === 'TypeError') {
        throw new Error('无法连接到Ollama服务');
      }
      throw error;
    }
  }

  static async makeOllamaRequest(ollamaUrl, requestBody) {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'chrome-extension://' + chrome.runtime.id
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const statusMessages = {
        403: '权限错误。解决方案：\n1. 停止Ollama: pkill ollama\n2. 设置环境变量: export OLLAMA_ORIGINS="*"\n3. 重启Ollama: ollama serve\n4. 或尝试: OLLAMA_ORIGINS="*" ollama serve',
        404: `模型未找到，请执行: ollama pull ${requestBody.model}`,
        400: '请求参数错误',
        500: 'Ollama服务内部错误，请检查模型是否正常加载'
      };
      
      const message = statusMessages[response.status] || `请求失败: ${response.status}`;
      throw new Error(message);
    }
    
    return response;
  }
}

// 翻译函数（保持向后兼容）
async function translateText(text) {
  return await TranslationService.translateText(text);
}

// 获取配置（保持向后兼容）
async function getConfig() {
  return await BackgroundConfigManager.getConfig();
}

// 保存配置（保持向后兼容）
function saveConfig(config) {
  return BackgroundConfigManager.saveConfig(config);
}

// 右键菜单管理类
class ContextMenuManager {
  static setupContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'translate-selection',
        title: '翻译选中文本',
        contexts: ['selection']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  static handleContextMenuClick(info, tab) {
    if (info.menuItemId === 'translate-selection' && info.selectionText) {
      // 向content script发送翻译请求
      chrome.tabs.sendMessage(tab.id, {
        action: 'translateSelection',
        text: info.selectionText
      });
    }
  }
}

// 初始化右键菜单
ContextMenuManager.setupContextMenu();

// 连接测试管理类
class ConnectionTestManager {
  static async testOllamaConnection() {
    try {
      const config = await BackgroundConfigManager.getConfig();
      const response = await fetch(`${config.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return {
        success: true,
        models: data.models || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async checkOllamaStatus() {
    try {
      const config = await BackgroundConfigManager.getConfig();
      
      // 检查基本连接
      const response = await fetch(`${config.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        signal: AbortSignal.timeout(5000) // 5秒超时
      });
      
      if (!response.ok) {
        return {
          connected: false,
          error: `HTTP ${response.status}`,
          details: response.statusText
        };
      }
      
      const data = await response.json();
      const models = data.models || [];
      
      // 检查配置的模型是否存在
      const modelExists = models.some(model => model.name === config.model);
      
      return {
        connected: true,
        modelCount: models.length,
        modelExists: modelExists,
        currentModel: config.model,
        availableModels: models.map(m => m.name)
      };
      
    } catch (error) {
      if (error.name === 'TimeoutError') {
        return {
          connected: false,
          error: '连接超时',
          details: '请检查Ollama服务是否正在运行'
        };
      }
      
      return {
        connected: false,
        error: error.message,
        details: '无法连接到Ollama服务'
      };
    }
  }
}

// 测试Ollama连接（保持向后兼容）
async function testOllamaConnection() {
  return await ConnectionTestManager.testOllamaConnection();
}

// 检查Ollama服务详细状态（保持向后兼容）
async function checkOllamaStatus() {
  return await ConnectionTestManager.checkOllamaStatus();
}

// 导出函数供popup使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translateText,
    getConfig,
    saveConfig,
    testOllamaConnection,
    checkOllamaStatus
  };
}