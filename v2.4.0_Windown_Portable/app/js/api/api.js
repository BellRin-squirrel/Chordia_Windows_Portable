(function() {
    let currentAuthCode = "------";
    let isAuthorized = false; // 接続完了フラグ

    // --- Eel 公開関数 ---

    // iPhoneからの接続要求が届いた
    eel.expose(notify_auth_request);
    function notify_auth_request(data) {
        if (isAuthorized) return;
        
        const modal = document.getElementById('requestModal');
        const info = document.getElementById('reqDeviceInfo');
        const actions = document.getElementById('approvalActions');
        const codeArea = document.getElementById('codeDisplayArea');

        info.innerHTML = `<strong>${data.device}</strong><br><small>${data.ip} (${data.os})</small>`;
        
        // UI初期化
        actions.style.display = 'block';
        codeArea.style.display = 'none';
        modal.style.display = 'flex';
    }

    // 接続が最終的に成功した（iPhone側が確認を終えた）
    eel.expose(notify_auth_success);
    function notify_auth_success(deviceName) {
        isAuthorized = true; // フラグを立てて、コード表示を阻止する
        
        const modal = document.getElementById('requestModal');
        modal.style.display = 'none';
        
        showToast(`${deviceName} と接続しました`);
        loadSessions(); // セッションリストを更新
    }

    // 認証コードが更新された（30秒ごと）
    eel.expose(update_auth_code);
    function update_auth_code(code, expires) {
        currentAuthCode = code;
        const display = document.getElementById('authCodeDisplay');
        if (display) display.textContent = code;
        
        let timeLeft = expires;
        const timer = document.getElementById('codeTimer');
        if (timer) timer.textContent = timeLeft;
    }

    // 要求がキャンセルされた
    eel.expose(reset_pc_ui);
    function reset_pc_ui() {
        document.getElementById('requestModal').style.display = 'none';
    }

    // --- 内部ロジック ---

    async function init() {
        // IP情報の取得
        const info = await eel.get_connect_info()();
        document.getElementById('displayIp').textContent = info.ip;

        // 初期認証状態の通知（Python側にウィンドウが開いたことを知らせる）
        await eel.set_sync_window_state(true)();

        // 承認ボタン
        document.getElementById('btnApprove').onclick = async () => {
            const actions = document.getElementById('approvalActions');
            const codeArea = document.getElementById('codeDisplayArea');
            
            // iPhone側に「承認した」ことを伝える
            await eel.respond_to_request(true)();
            
            // UIを一旦「待機中」のような状態にする（ボタンを隠す）
            actions.style.display = 'none';

            // ★ ここで少し待機する（iPhoneが即座にverifyを投げるのを待つ）
            setTimeout(() => {
                // すでに接続成功通知（notify_auth_success）が来てモーダルが閉じていれば何もしない
                if (!isAuthorized && document.getElementById('requestModal').style.display !== 'none') {
                    // まだ接続されていなければ、コードを表示する
                    document.getElementById('authCodeDisplay').textContent = currentAuthCode;
                    codeArea.style.display = 'block';
                }
            }, 500); // 500ms 待機
        };

        // 拒否ボタン
        document.getElementById('btnReject').onclick = async () => {
            await eel.respond_to_request(false)();
            document.getElementById('requestModal').style.display = 'none';
        };

        // QRコード表示
        document.getElementById('btnShowQr').onclick = () => {
            const container = document.getElementById('qrcode-container');
            container.innerHTML = "";
            // QRの内容にIPと現在のコードを含める（iPhone側で即時認証させるため）
            const qrData = JSON.stringify({
                ip: document.getElementById('displayIp').textContent,
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
        setInterval(loadSessions, 5000); // 5秒ごとにセッション監視
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
                    <small>${s.ip} - 有効期限: ${Math.floor(s.remaining / 60)}分${s.remaining % 60}秒</small>
                </div>
                <button class="btn-disconnect" onclick="terminateSession('${s.ip}', '${s.device}')">切断</button>
            `;
            list.appendChild(li);
        });
    }

    window.terminateSession = async (ip, device) => {
        if (confirm("このデバイスとの接続を強制解除しますか？")) {
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

    // ユーティリティ
    const u = {
        escapeHtml: (str) => str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
    };

    // ウィンドウが閉じられる時の処理
    window.onbeforeunload = () => {
        eel.set_sync_window_state(false)();
    };

    document.addEventListener('DOMContentLoaded', init);
})();