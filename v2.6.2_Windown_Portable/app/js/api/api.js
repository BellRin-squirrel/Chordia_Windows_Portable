(function() {
    let currentAuthCode = "------";
    let isAuthorized = false;
    let globalIp = "";
    let globalPort = "";

    // --- Eel 公開関数 ---

    // iPhoneからの接続要求
    eel.expose(notify_auth_request);
    function notify_auth_request(data) {
        if (isAuthorized) return;
        
        const modal = document.getElementById('requestModal');
        const info = document.getElementById('reqDeviceInfo');
        const actions = document.getElementById('approvalActions');
        const codeArea = document.getElementById('codeDisplayArea');

        info.innerHTML = `<strong>${data.device}</strong><br><small>${data.ip} (${data.os})</small>`;
        
        actions.style.display = 'block';
        codeArea.style.display = 'none';
        modal.style.display = 'flex';
    }

    // 認証成功
    eel.expose(notify_auth_success);
    function notify_auth_success(deviceName) {
        isAuthorized = true;
        const modal = document.getElementById('requestModal');
        modal.style.display = 'none';
        showToast(`${deviceName} と接続しました`);
        loadSessions();
    }

    // 認証コード更新
    eel.expose(update_auth_code);
    function update_auth_code(code, expires) {
        currentAuthCode = code;
        const display = document.getElementById('authCodeDisplay');
        if (display) display.textContent = code;
        
        let timeLeft = expires;
        const timer = document.getElementById('codeTimer');
        if (timer) timer.textContent = timeLeft;
    }

    eel.expose(reset_pc_ui);
    function reset_pc_ui() {
        document.getElementById('requestModal').style.display = 'none';
    }

    // --- 内部ロジック ---

    async function init() {
        // Python側からプロセス固有のIPとポートを取得
        const info = await eel.get_connect_info()();
        globalIp = info.ip;
        globalPort = info.port;
        document.getElementById('displayIp').textContent = globalIp;
        document.getElementById('displayPort').textContent = globalPort;

        await eel.set_sync_window_state(true)();

        document.getElementById('btnApprove').onclick = async () => {
            const actions = document.getElementById('approvalActions');
            const codeArea = document.getElementById('codeDisplayArea');
            await eel.respond_to_request(true)();
            actions.style.display = 'none';

            setTimeout(() => {
                if (!isAuthorized && document.getElementById('requestModal').style.display !== 'none') {
                    document.getElementById('authCodeDisplay').textContent = currentAuthCode;
                    codeArea.style.display = 'block';
                }
            }, 500);
        };

        document.getElementById('btnReject').onclick = async () => {
            await eel.respond_to_request(false)();
            document.getElementById('requestModal').style.display = 'none';
        };

        document.getElementById('btnShowQr').onclick = () => {
            const container = document.getElementById('qrcode-container');
            container.innerHTML = "";
            // ポートを含めたQRデータを生成
            const qrData = JSON.stringify({
                ip: globalIp,
                port: globalPort.toString(),
                code: currentAuthCode
            });
            new QRCode(container, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
            document.getElementById('qr-wrapper').style.display = 'block';
            document.getElementById('btnShowQr').style.display = 'none';
        };

        document.getElementById('btnHideQr').onclick = () => {
            document.getElementById('qr-wrapper').style.display = 'none';
            document.getElementById('btnShowQr').style.display = 'inline-block';
        };

        loadSessions();
        setInterval(loadSessions, 5000);
    }

    async function loadSessions() {
        const sessions = await eel.get_active_sessions()();
        const list = document.getElementById('sessionsList');
        if (sessions.length === 0) {
            list.innerHTML = '<li class="no-sessions">接続中のデバイスはありません。</li>';
            return;
        }

        list.innerHTML = "";
        sessions.forEach(s => {
            const li = document.createElement('li');
            li.className = 'session-item';
            li.innerHTML = `
                <div class="session-info">
                    <strong>${u.escapeHtml(s.device)}</strong><br>
                    <small>${s.ip} - 残り: ${Math.floor(s.remaining / 60)}分${s.remaining % 60}秒</small>
                </div>
                <button class="btn-disconnect" onclick="terminateSession('${s.ip}', '${s.device}')">切断</button>
            `;
            list.appendChild(li);
        });
    }

    window.terminateSession = async (ip, device) => {
        if (confirm("このセッションを終了しますか？")) {
            await eel.force_disconnect_session(ip, device)();
            loadSessions();
        }
    };

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    const u = {
        escapeHtml: (str) => str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
    };

    window.onbeforeunload = () => {
        eel.set_sync_window_state(false)();
    };

    document.addEventListener('DOMContentLoaded', init);
})();