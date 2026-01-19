(() => {
  const API_URL = window.IMBLASCO_CHAT_API_URL || 'http://localhost:3001/api/chat';
  const STORAGE_KEY = 'imblasco_session_id';

  function getSessionId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = `imblasco_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function createStyle() {
    const style = document.createElement('style');
    style.id = 'imblasco-chat-style';
    style.textContent = `
      #imblasco-chat-root { position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: "Cabin", Arial, sans-serif; }
      #imblasco-chat-root * { box-sizing: border-box; }
      .imblasco-chat-bubble {
        width: 56px; height: 56px; border-radius: 50%; color: #fff;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 10px 24px rgba(0,0,0,0.25); transition: transform 0.2s ease;
        position: relative;
      }
      .imblasco-chat-bubble.imblasco-open { background: #e11d48; }
      .imblasco-chat-bubble.imblasco-closed { background: #f59e0b; }
      .imblasco-chat-icon { position: absolute; transition: opacity 0.2s ease, transform 0.2s ease; }
      .imblasco-chat-icon.hidden { opacity: 0; transform: scale(0.7); }
      .imblasco-chat-bubble:hover { transform: scale(1.08); }
      .imblasco-chat-panel {
        position: fixed; bottom: 96px; right: 20px; width: 330px; height: 440px;
        background: #f3f4f6; border-radius: 18px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);
        display: none; flex-direction: column; overflow: hidden;
      }
      .imblasco-chat-header {
        background: #0b1f3a; color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 12px;
        border-top-left-radius: 18px; border-top-right-radius: 18px;
      }
      .imblasco-chat-avatar {
        width: 36px; height: 36px; border-radius: 50%; background: #f59e0b; color: #0b1f3a;
        display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;
      }
      .imblasco-chat-status {
        font-size: 12px; color: #86efac;
      }
      .imblasco-chat-actions { margin-left: auto; display: flex; gap: 8px; }
      .imblasco-chat-action { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .imblasco-chat-action:hover { background: rgba(255,255,255,0.1); }
      .imblasco-chat-body { flex: 1; padding: 16px; overflow-y: auto; background: #eef1f5; }
      .imblasco-chat-day {
        margin: 6px auto 12px; padding: 4px 10px; background: rgba(255,255,255,0.8);
        border-radius: 8px; font-size: 11px; color: #54656f; width: fit-content;
      }
      .imblasco-msg {
        margin: 8px 0; padding: 10px 12px; border-radius: 12px; max-width: 85%; font-size: 13px; line-height: 1.4;
        box-shadow: 0 4px 10px rgba(0,0,0,0.08); color: #000; white-space: pre-wrap;
      }
      .imblasco-msg.user { background: #ffd8a8; margin-left: auto; border-bottom-right-radius: 6px; }
      .imblasco-msg.assistant { background: #fff; margin-right: auto; border-bottom-left-radius: 6px; }
      .imblasco-msg-time { font-size: 10px; color: #667781; margin-top: 4px; text-align: right; }
      .imblasco-chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e0e0e0; background: #f3f4f6; }
      .imblasco-chat-input input {
        flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 999px;
        font-size: 13px; outline: none; background: #fff; color: #111827;
      }
      .imblasco-chat-input button {
        width: 38px; height: 38px; border: none; background: #d1d5db; color: #fff; border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .imblasco-typing {
        display: none; gap: 6px; padding: 10px 12px; background: #fff; border-radius: 8px;
        border-bottom-left-radius: 4px; width: fit-content; margin: 6px 0;
      }
      .imblasco-typing-dot {
        width: 6px; height: 6px; background: #9ca3af; border-radius: 50%;
        animation: imblasco-typing 1.4s infinite;
      }
      .imblasco-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .imblasco-typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes imblasco-typing {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
        30% { transform: translateY(-6px); opacity: 1; }
      }
      .imblasco-chat-footer { display: none; }
      @keyframes imblasco-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }

  function createWidget() {
    const root = document.createElement('div');
    root.id = 'imblasco-chat-root';

    const bubble = document.createElement('div');
    bubble.className = 'imblasco-chat-bubble imblasco-closed';
    bubble.innerHTML = `
      <span class="imblasco-chat-icon imblasco-icon-message">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6.5C4 4.6 5.6 3 7.5 3h9C18.4 3 20 4.6 20 6.5v6c0 1.9-1.6 3.5-3.5 3.5H9l-4 3v-3H7.5C5.6 16 4 14.4 4 12.5v-6Z" fill="white"/>
        </svg>
      </span>
      <span class="imblasco-chat-icon imblasco-icon-close hidden">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
    `;

    const panel = document.createElement('div');
    panel.className = 'imblasco-chat-panel';

    const header = document.createElement('div');
    header.className = 'imblasco-chat-header';
    header.innerHTML = `
      <div class="imblasco-chat-avatar">🤖</div>
      <div>
        <div style="font-size:14px;font-weight:600;">Asistente Virtual de ImBlasco</div>
        <div class="imblasco-chat-status">● En línea</div>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'imblasco-chat-body';
    const day = document.createElement('div');
    day.className = 'imblasco-chat-day';
    day.textContent = 'Hoy';
    body.appendChild(day);

    const typing = document.createElement('div');
    typing.className = 'imblasco-typing';
    typing.innerHTML = '<span class="imblasco-typing-dot"></span><span class="imblasco-typing-dot"></span><span class="imblasco-typing-dot"></span>';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'imblasco-chat-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Escribe tu mensaje...';

    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Enviar';

    inputWrap.appendChild(input);
    inputWrap.appendChild(sendBtn);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputWrap);

    root.appendChild(bubble);
    root.appendChild(panel);
    document.body.appendChild(root);

    const iconMessage = bubble.querySelector('.imblasco-icon-message');
    const iconClose = bubble.querySelector('.imblasco-icon-close');

    let greeted = false;

    function showGreeting() {
      if (greeted) return;
      greeted = true;
      appendMessage('assistant', '¡Hola! Bienvenido a Imblasco 😊 ¿En qué puedo ayudarte hoy? Puedo consultar stock de productos o brindarte información sobre la empresa');
    }

    bubble.addEventListener('click', () => {
      const isOpen = panel.style.display === 'flex';
      panel.style.display = isOpen ? 'none' : 'flex';

      if (isOpen) {
        bubble.classList.remove('imblasco-open');
        bubble.classList.add('imblasco-closed');
        iconMessage.classList.remove('hidden');
        iconClose.classList.add('hidden');
      } else {
        bubble.classList.remove('imblasco-closed');
        bubble.classList.add('imblasco-open');
        iconMessage.classList.add('hidden');
        iconClose.classList.remove('hidden');
        showGreeting();
      }
    });

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      appendMessage('user', text);
      input.value = '';
      showTyping(true);

      try {
        console.log('[ChatWidget] Enviando mensaje a', API_URL);
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: getSessionId(),
            message: text
          })
        });
        console.log('[ChatWidget] Status', response.status);
        const data = await response.json();
        window.__lastChatResponse = data;
        console.log('[ChatWidget] Respuesta', data);
        showTyping(false);
        if (data && data.response) {
          appendMessage('assistant', String(data.response));
        } else {
          appendMessage('assistant', data ? JSON.stringify(data) : 'No pude responder en este momento.');
        }
      } catch (error) {
        showTyping(false);
        appendMessage('assistant', 'Ocurrió un error al conectar con el asistente.');
      }
    }

    function showTyping(isVisible) {
      if (isVisible) {
        typing.style.display = 'flex';
        body.appendChild(typing);
      } else {
        typing.style.display = 'none';
        if (typing.parentNode) typing.parentNode.removeChild(typing);
      }
      body.scrollTop = body.scrollHeight;
    }

    function appendMessage(role, text) {
      const msg = document.createElement('div');
      msg.className = `imblasco-msg ${role}`;
      if (role === 'assistant') {
        msg.innerHTML = String(text).replace(/\n/g, '<br>');
      } else {
        msg.textContent = text;
      }
      const time = document.createElement('div');
      time.className = 'imblasco-msg-time';
      time.textContent = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      msg.appendChild(time);
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  if (!document.getElementById('imblasco-chat-root')) {
    createStyle();
    createWidget();
  }
})();
