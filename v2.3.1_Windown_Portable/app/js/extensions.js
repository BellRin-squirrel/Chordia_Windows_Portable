document.addEventListener('DOMContentLoaded', async () => {
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
        if (!alertModal || !alertTitle || !alertMessage) return;
        alertTitle.textContent = title;
        alertTitle.style.color = isError ? '#ef4444' : 'var(--text-main)';
        alertMessage.innerText = message;
        alertModal.classList.add('show');
    }

    if (btnAlertOk && alertModal) {
        btnAlertOk.addEventListener('click', () => {
            alertModal.classList.remove('show');
        });
    }

    eel.expose(update_ext_download_progress);
    function update_ext_download_progress(toolName, downloaded, total) {
        if (downloaded === "extracting") {
            progressText.textContent = `${toolName} を解凍・配置中...`;
            progressBar.style.width = '100%';
            return;
        }

        let percent = 0;
        if (total > 0) percent = Math.floor((downloaded / total) * 100);

        const dlMb = (downloaded / (1024 * 1024)).toFixed(2);
        const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(2) : "???";

        progressText.textContent = `${toolName} をダウンロード中... ${percent}% (${dlMb}MB / ${totalMb}MB)`;
        progressBar.style.width = `${percent}%`;
    }

    async function checkStatus() {
        btnMainAction.disabled = true;
        updateCard.style.display = 'none';
        try {
            const status = await eel.check_tools_status()();
            renderTools(status);
            updateActionCard(status);
        } catch (e) {
            toolsList.innerHTML = `<div class="tool-item not-installed">状態の取得に失敗しました</div>`;
            showAlert("エラー", "状態の取得に失敗しました。バックエンドが応答しません。", true);
        }
    }

    function renderTools(status) {
        toolsList.innerHTML = '';
        for (const [tool, isInstalled] of Object.entries(status)) {
            const item = document.createElement('div');
            item.className = `tool-item ${isInstalled ? 'installed' : 'not-installed'}`;
            const desc = TOOL_DETAILS[tool] || '';
            item.innerHTML = `
                <div class="tool-info">
                    <span class="tool-name">${tool}</span>
                    <span class="tool-desc">${desc}</span>
                </div>
                <span class="tool-status">${isInstalled ? 'インストール済み' : '未インストール'}</span>
            `;
            toolsList.appendChild(item);
        }
    }

    function updateActionCard(status) {
        const missingTools = Object.keys(status).filter(tool => !status[tool]);
        
        if (missingTools.length === 0) {
            actionTitle.textContent = "全てのツールが揃っています";
            actionDesc.textContent = "動画ダウンロード機能は正常に利用可能です。最新のアップデートがないか確認できます。";
            btnMainAction.textContent = "アップデートを確認";
            btnMainAction.disabled = false;
            btnMainAction.onclick = () => checkForUpdates();
        } else {
            actionTitle.textContent = "不足しているツールがあります";
            actionDesc.textContent = `${missingTools.join(', ')} がインストールされていません。動画ダウンロード機能を利用するにはインストールしてください。`;
            btnMainAction.textContent = "不足分をダウンロード";
            btnMainAction.disabled = false;
            btnMainAction.onclick = () => installTools(missingTools);
        }
    }

    async function checkForUpdates() {
        btnMainAction.disabled = true;
        btnMainAction.textContent = "確認中... (少々お待ちください)";
        
        try {
            const results = await eel.check_tool_updates()();
            renderUpdateResults(results);
        } catch (e) {
            showAlert("エラー", "アップデートの確認に失敗しました。\nネットワーク接続を確認してください。", true);
        } finally {
            btnMainAction.textContent = "アップデートを確認";
            btnMainAction.disabled = false;
        }
    }

    function renderUpdateResults(results) {
        updateResultList.innerHTML = '';
        pendingUpdates = [];
        
        let updateCount = 0;

        for (const [tool, info] of Object.entries(results)) {
            const item = document.createElement('div');
            const isNeeded = info.update_needed;
            
            item.className = `tool-item ${isNeeded ? 'not-installed' : 'installed'}`;
            
            if (isNeeded) {
                updateCount++;
                pendingUpdates.push(tool);
            }

            item.innerHTML = `
                <div class="tool-info">
                    <span class="tool-name">${tool}</span>
                    <span class="tool-desc">現在のバージョン: ${info.local_version} → 最新: ${info.latest_version}</span>
                </div>
                <span class="tool-status" style="color: ${isNeeded ? '#ef4444' : '#10b981'}">
                    ${isNeeded ? '要アップデート' : '最新版です'}
                </span>
            `;
            updateResultList.appendChild(item);
        }

        updateCard.style.display = 'block';

        if (updateCount > 0) {
            btnExecUpdate.disabled = false;
            btnExecUpdate.textContent = `${updateCount}件のアップデートを実行`;
            btnExecUpdate.onclick = () => installTools(pendingUpdates);
        } else {
            btnExecUpdate.disabled = true;
            btnExecUpdate.textContent = "すべて最新版です";
        }
    }

    async function installTools(toolsToInstall) {
        btnMainAction.disabled = true;
        btnExecUpdate.disabled = true;
        
        progressArea.style.display = 'block';
        let hasError = false;
        let errorMessages = [];

        try {
            for (const tool of toolsToInstall) {
                progressText.textContent = `${tool} の準備中...`;
                progressBar.style.width = '0%';
                
                const result = await eel.install_tool(tool)();
                if (!result.success) {
                    hasError = true;
                    errorMessages.push(`[${tool}] ${result.message}`);
                }
            }
        } catch (e) {
            hasError = true;
            errorMessages.push(`システムエラー: ${e.message}`);
        }
        
        progressArea.style.display = 'none';
        await checkStatus();

        if (hasError) {
            showAlert("エラーが発生しました", errorMessages.join("\n"), true);
        } else {
            showAlert("完了", "すべてのツールのダウンロード・インストールが完了しました。");
        }
    }

    checkStatus();
});