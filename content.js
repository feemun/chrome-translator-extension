// 翻译管理器类
class TranslationManager {
  constructor() {
    this.translateButton = null;
    this.translationPopup = null;
    this.selectedText = '';
    this.init();
  }

  init() {
    // 监听文本选择事件
    document.addEventListener('mouseup', (e) => this.handleTextSelection(e));
    document.addEventListener('keyup', (e) => this.handleTextSelection(e));
    
    // 监听来自popup和background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
    });
  }

  handleTextSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
      this.selectedText = text;
      this.showTranslateButton(selection);
    } else {
      this.hideTranslateButton();
      this.hideTranslationPopup();
    }
  }

  handleMessage(request, sender, sendResponse) {
    if (request.action === 'getSelectedText') {
      sendResponse({ text: this.selectedText });
    } else if (request.action === 'translateSelection') {
      // 处理右键菜单的翻译请求
      this.selectedText = request.text;
      this.showTranslationPopupForContextMenu(request.text);
    }
  }

  showTranslateButton(selection) {
    this.hideTranslateButton();
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    this.translateButton = document.createElement('div');
    this.translateButton.className = 'ollama-translate-button';
    this.translateButton.innerHTML = '🌐 翻译';
    this.translateButton.style.cssText = `
      position: fixed;
      top: ${rect.bottom + window.scrollY + 5}px;
      left: ${rect.left + window.scrollX}px;
      z-index: 10000;
      background: #4285f4;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    this.translateButton.addEventListener('click', () => this.translateSelectedText());
    document.body.appendChild(this.translateButton);
  }

  hideTranslateButton() {
    if (this.translateButton) {
      this.translateButton.remove();
      this.translateButton = null;
    }
  }

  translateSelectedText() {
    this.hideTranslateButton();
    this.showTranslationPopup();
    
    // 发送翻译请求到background script
    chrome.runtime.sendMessage({
      action: 'translate',
      text: this.selectedText
    }, (response) => {
      if (response && response.success) {
        this.updateTranslationPopup(response.translation);
      } else {
        this.updateTranslationPopup('翻译失败: ' + (response?.error || '未知错误'));
      }
    });
  }

  showTranslationPopup() {
    this.hideTranslationPopup();
    
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    this.translationPopup = document.createElement('div');
    this.translationPopup.className = 'ollama-translation-popup';
    this.translationPopup.isPinned = false; // 添加固定状态标记
    this.translationPopup.style.cssText = `
      position: fixed;
      top: ${rect.bottom + window.scrollY + 5}px;
      left: ${rect.left + window.scrollX}px;
      z-index: 10001;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      max-width: 400px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;
    
    this.translationPopup.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: bold; color: #333;">原文:</div>
      <div style="margin-bottom: 12px; color: #666; font-size: 13px;">${this.selectedText}</div>
      <div style="margin-bottom: 8px; font-weight: bold; color: #333;">翻译:</div>
      <div id="translation-result" style="color: #333;">翻译中...</div>
      <div style="margin-top: 12px; text-align: right;">
        <button id="close-translation" style="background: #f1f3f4; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">关闭</button>
      </div>
    `;
    
    document.body.appendChild(this.translationPopup);
    
    // 添加关闭按钮事件
    document.getElementById('close-translation').addEventListener('click', () => this.hideTranslationPopup());
    
    // 点击其他地方关闭弹窗
    document.addEventListener('click', (e) => this.handleOutsideClick(e));
  }

  updateTranslationPopup(translation) {
    const resultElement = document.getElementById('translation-result');
    if (resultElement) {
      resultElement.textContent = translation;
    }
  }

  hideTranslationPopup() {
    if (this.translationPopup) {
      this.translationPopup.remove();
      this.translationPopup = null;
      document.removeEventListener('click', (e) => this.handleOutsideClick(e));
      document.removeEventListener('click', (e) => this.handleOutsideClickForDraggable(e));
    }
  }

  handleOutsideClick(event) {
    if (this.translationPopup && !this.translationPopup.contains(event.target) && !this.translationPopup.isPinned) {
      this.hideTranslationPopup();
    }
  }

  // 处理可拖动弹窗的外部点击
  handleOutsideClickForDraggable(event) {
    if (this.translationPopup && !this.translationPopup.contains(event.target)) {
      console.log('外部点击检测 - 固定状态:', this.translationPopup.isPinned); // 调试信息
      if (!this.translationPopup.isPinned) {
        console.log('弹窗未固定，准备关闭'); // 调试信息
        this.hideTranslationPopup();
      } else {
        console.log('弹窗已固定，不关闭'); // 调试信息
      }
    }
  }

  // 使元素可拖动
  makeDraggable(element) {
    let isDragging = false;
    let startX, startY;
    let elementX, elementY;
    
    const dragHeader = element.querySelector('#drag-header');
    
    dragHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    function dragStart(e) {
      // 如果点击的是按钮，不启动拖动
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        return;
      }
      
      isDragging = true;
      
      // 获取鼠标起始位置
      startX = e.clientX;
      startY = e.clientY;
    
      // 获取元素当前位置
      const rect = element.getBoundingClientRect();
      elementX = rect.left;
      elementY = rect.top;
      
      // 移除初始的居中transform，改用绝对定位
      element.style.transform = 'none';
      element.style.left = elementX + 'px';
      element.style.top = elementY + 'px';
      
      element.style.cursor = 'grabbing';
      e.preventDefault();
    }
    
    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        
        // 计算鼠标移动距离
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        // 计算新位置
        let newX = elementX + deltaX;
        let newY = elementY + deltaY;
        
        // 限制拖动范围在视窗内
        const rect = element.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        
        // 更新元素位置
        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
      }
    }
    
    function dragEnd(e) {
      isDragging = false;
      element.style.cursor = 'move';
    }
  }

  // 为右键菜单显示翻译弹窗
  showTranslationPopupForContextMenu(text) {
    this.hideTranslationPopup();
    
    // 获取当前鼠标位置或页面中心位置
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    
    this.translationPopup = document.createElement('div');
    this.translationPopup.className = 'ollama-translation-popup';
    this.translationPopup.isPinned = false; // 添加固定状态标记
    this.translationPopup.style.cssText = `
      position: fixed;
      top: ${y}px;
      left: ${x}px;
      transform: translate(-50%, -50%);
      z-index: 10001;
      background: white;
      border: none;
      border-radius: 16px;
      padding: 0;
      width: 480px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      cursor: move;
      overflow: hidden;
    `;
  
    this.translationPopup.innerHTML = `
    <div id="drag-header" style="background: #ffffff; padding: 12px 16px; border-bottom: none; border-radius: 16px 16px 0 0; cursor: move; user-select: none; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #ff6b9d, #ff8fab); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
          <span style="color: white; font-size: 16px; font-weight: bold;">译</span>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="pin-translation" style="background: none; border: none; padding: 6px; cursor: pointer; border-radius: 50%; color: #ff6b9d; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="固定弹窗" onmouseover="this.style.backgroundColor='rgba(255, 107, 157, 0.2);'" onmouseout="this.style.backgroundColor='none';">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/></svg>
        </button>
        <button id="close-translation" style="background: none; border: none; padding: 6px; cursor: pointer; border-radius: 50%; color: #999; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="关闭弹窗" onmouseover="this.style.backgroundColor='#ff5f56'; this.style.color='white';" onmouseout="this.style.backgroundColor='none'; this.style.color='#999';">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
        </button>
      </div>
    </div>
    <div style="padding: 20px; background: #ffffff;">
      <div id="translation-result" style="color: #333; min-height: 60px; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">翻译中...</div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #f0f0f0;">
        <div style="display: flex; gap: 12px;">
          <button id="copy-translation" style="background: none; border: none; padding: 6px; cursor: pointer; border-radius: 50%; color: #4caf50; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="复制翻译文本" onmouseover="this.style.backgroundColor='rgba(76, 175, 80, 0.2)';" onmouseout="this.style.backgroundColor='none';">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button id="speak-translation" style="background: none; border: none; padding: 6px; cursor: pointer; border-radius: 50%; color: #2196f3; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="朗读翻译文本" onmouseover="this.style.backgroundColor='rgba(33, 150, 243, 0.2);'" onmouseout="this.style.backgroundColor='none';">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3,9V15H7L12,20V4L7,9H3M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12Z"/></svg>
          </button>
        </div>
        <div style="display: flex; gap: 8px;">
        </div>
      </div>
    </div>
  `;
  
    // 立即显示弹窗
    document.body.appendChild(this.translationPopup);
    
    // 添加拖动功能
    this.makeDraggable(this.translationPopup);
    
    // 添加关闭按钮事件
    document.getElementById('close-translation').addEventListener('click', () => this.hideTranslationPopup());
    
    // 添加固定按钮事件
    document.getElementById('pin-translation').addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    const pinButton = document.getElementById('pin-translation');
    this.translationPopup.isPinned = !this.translationPopup.isPinned;
    
    console.log('固定状态已切换:', this.translationPopup.isPinned); // 调试信息
    
    if (this.translationPopup.isPinned) {
      // 固定状态：改变按钮样式和内容
      pinButton.style.backgroundColor = 'rgba(255, 107, 157, 0.3)';
      pinButton.style.color = '#fff';
      pinButton.title = '取消固定弹窗';
      pinButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/></svg>';
      pinButton.onmouseover = function() { this.style.backgroundColor = 'rgba(255, 107, 157, 0.4)'; };
      pinButton.onmouseout = function() { this.style.backgroundColor = 'rgba(255, 107, 157, 0.3)'; };
    } else {
      // 取消固定状态：恢复原始样式
      pinButton.style.backgroundColor = 'none';
      pinButton.style.color = '#ff6b9d';
      pinButton.title = '固定弹窗';
      pinButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/></svg>';
      pinButton.onmouseover = function() { this.style.backgroundColor = 'rgba(255, 107, 157, 0.2)'; };
      pinButton.onmouseout = function() { this.style.backgroundColor = 'none'; };
    }
    });
    
    // 添加复制按钮事件
    document.getElementById('copy-translation').addEventListener('click', (e) => {
    e.stopPropagation();
    const translationText = document.getElementById('translation-result').textContent;
    if (translationText && translationText !== '翻译中...') {
      navigator.clipboard.writeText(translationText).then(() => {
        // 显示复制成功的反馈
        const copyButton = document.getElementById('copy-translation');
        const originalHTML = copyButton.innerHTML;
        copyButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/></svg>';
        copyButton.style.backgroundColor = '#4caf50';
        copyButton.style.color = 'white';
        setTimeout(() => {
          copyButton.innerHTML = originalHTML;
          copyButton.style.backgroundColor = 'none';
          copyButton.style.color = '#4caf50';
        }, 1500);
      }).catch(err => {
        console.error('复制失败:', err);
      });
    }
    });
    
    // 添加朗读按钮事件
    document.getElementById('speak-translation').addEventListener('click', (e) => {
    e.stopPropagation();
    const translationText = document.getElementById('translation-result').textContent;
    if (translationText && translationText !== '翻译中...') {
      // 停止当前正在播放的语音
      speechSynthesis.cancel();
      
      // 创建语音合成实例
      const utterance = new SpeechSynthesisUtterance(translationText);
      utterance.lang = 'zh-CN'; // 设置为中文
      utterance.rate = 0.8; // 语速
      utterance.pitch = 1; // 音调
      
      // 显示朗读状态反馈
      const speakButton = document.getElementById('speak-translation');
      const originalHTML = speakButton.innerHTML;
      speakButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z"/></svg>';
      speakButton.style.backgroundColor = '#2196f3';
      speakButton.style.color = 'white';
      
      // 朗读结束后恢复按钮状态
      utterance.onend = () => {
        speakButton.innerHTML = originalHTML;
        speakButton.style.backgroundColor = 'none';
        speakButton.style.color = '#2196f3';
      };
      
      // 开始朗读
      speechSynthesis.speak(utterance);
    }
    });
    
    // 为翻译文本区域添加点击事件，阻止事件冒泡
    document.getElementById('translation-result').addEventListener('click', (e) => {
      e.stopPropagation();
    });
  
    // 点击其他地方关闭弹窗（但不包括拖动头部）
    document.addEventListener('click', (e) => this.handleOutsideClickForDraggable(e));
    
    // 发送翻译请求到background script
    chrome.runtime.sendMessage({
      action: 'translate',
      text: text
    }, (response) => {
      if (response && response.success) {
        this.updateTranslationPopup(response.translation);
      } else {
        this.updateTranslationPopup('翻译失败: ' + (response?.error || '未知错误'));
      }
    });
  }
}

// 创建TranslationManager实例
const translationManager = new TranslationManager();