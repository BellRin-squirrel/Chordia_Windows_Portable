document.addEventListener('DOMContentLoaded', async () => {
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;
    const listen = window.__TAURI__.event ? window.__TAURI__.event.listen : null;

    const toolsList = document.getElementById('toolsList');
    const actionTitle = document.getElementById('actionTitle');
    const actionDesc = document.getElementById('actionDesc');
    const btnMainAction = document.getElementById('btnMainAction');
    const updateCard = document.getElementById('updateCard');
    const updateResultList = document.getElementById('updateResultList');
    const btnExecUpdate = document.getElementById('btnExecUpdate');
    const progressArea = document.getElementById('progressArea');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    const alertModal = document.getElementById('alertModal');
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const btnAlertOk = document.getElementById('btnAlertOk');

    const TOOL_DETAILS = {
        'yt-dlp': 'YouTubeなどの動画プラットフォームから動画・音声をダウンロードします。',
        'ffmpeg': 'ダウンロードした動画から音声を抽出・変換するために使用します。',
        'deno': '一部のサイトのダウンロード処理を補助するJavaScriptランタイムです。'
    };

    let pendingUpdates = [];

    function showAlert(title, message, isError = false) {
        if (!alertModal) return;
        alertTitle.textContent = title;
        alertTitle.style.color = isError ? '#ef4444' : 'var(--text-main)';
        alertMessage.innerText = message;
        alertModal.classList.add('show');
    }

    if (btnAlertOk) btnAlertOk.onclick = () => alertModal.classList.remove('show');

    // ★ Rustからの進捗を受信
    if (listen) {
        listen('update_ext_download_progress', (event) => {
            const { toolName, downloaded, total } = event.payload;
            if (downloaded === "extracting") {
                progressText.textContent = `${toolName} を解凍・配置中...`;
                progressBar.style.width = '100%';
                return;
            }
            let percent = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
            progressText.textContent = `${toolName} をダウンロード中... ${percent}%`;
            progressBar.style.width = `${percent}%`;
        });
    }

    async function checkStatus() {
        btnMainAction.disabled = true;
        updateCard.style.display = 'none';
        try {
            const status = await invoke("check_tools_status");
            renderTools(status);
            updateActionCard(status);
        } catch (e) {
            toolsList.innerHTML = `<div class="tool-item not-installed">エラーが発生しました</div>`;
        }
    }

    function renderTools(status) {
        toolsList.innerHTML = '';
        for (const [tool, isInstalled] of Object.entries(status)) {
            const item = document.createElement('div');
            item.className = `tool-item ${isInstalled ? 'installed' : 'not-installed'}`;
            item.innerHTML = `<div class="tool-info"><span class="tool-name">${tool}</span><span class="tool-desc">${TOOL_DETAILS[tool]}</span></div><span class="tool-status">${isInstalled ? 'インストール済み' : '未インストール'}</span>`;
            toolsList.appendChild(item);
        }
    }

    function updateActionCard(status) {
        const missingTools = Object.keys(status).filter(tool => !status[tool]);
        if (missingTools.length === 0) {
            actionTitle.textContent = "全てのツールが揃っています";
            btnMainAction.textContent = "アップデートを確認";
            btnMainAction.disabled = false;
            btnMainAction.onclick = () => checkForUpdates();
        } else {
            actionTitle.textContent = "不足しているツールがあります";
            btnMainAction.textContent = "不足分をダウンロード";
            btnMainAction.disabled = false;
            btnMainAction.onclick = () => installTools(missingTools);
        }
    }

    async function checkForUpdates() {
        btnMainAction.disabled = true;
        btnMainAction.textContent = "確認中...";
        try {
            const results = await invoke("check_tool_updates");
            renderUpdateResults(results);
        } catch (e) { showAlert("エラー", "通信に失敗しました", true); }
        finally { btnMainAction.textContent = "アップデートを確認"; btnMainAction.disabled = false; }
    }

    function renderUpdateResults(results) {
        updateResultList.innerHTML = '';
        pendingUpdates = [];
        let updateCount = 0;
        for (const [tool, info] of Object.entries(results)) {
            const item = document.createElement('div');
            if (info.updateNeeded) { updateCount++; pendingUpdates.push(tool); }
            item.className = `tool-item ${info.updateNeeded ? 'not-installed' : 'installed'}`;
            item.innerHTML = `<div class="tool-info"><span class="tool-name">${tool}</span><span class="tool-desc">${info.localVersion} → ${info.latestVersion}</span></div><span class="tool-status">${info.updateNeeded ? '要更新' : '最新'}</span>`;
            updateResultList.appendChild(item);
        }
        updateCard.style.display = 'block';
        btnExecUpdate.disabled = updateCount === 0;
        btnExecUpdate.textContent = updateCount > 0 ? "アップデートを実行" : "すべて最新版です";
        btnExecUpdate.onclick = () => installTools(pendingUpdates);
    }

    async function installTools(toolsToInstall) {
        btnMainAction.disabled = true;
        btnExecUpdate.disabled = true;
        progressArea.style.display = 'block';
        try {
            for (const tool of toolsToInstall) {
                await invoke("install_tool", { toolName: tool });
            }
            showAlert("完了", "すべてのツールを更新しました。");
        } catch (e) { showAlert("エラー", e, true); }
        progressArea.style.display = 'none';
        checkStatus();
    }

    checkStatus();
});