document.addEventListener('DOMContentLoaded', async () => {
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;
    
    const chkMusic = document.getElementById('chkMusic');
    const chkImages = document.getElementById('chkImages');
    const chkDb = document.getElementById('chkDb');
    const chkSettings = document.getElementById('chkSettings');
    const chkPlaylists = document.getElementById('chkPlaylists');
    const exportPathInput = document.getElementById('exportPath');
    const btnBrowse = document.getElementById('btnBrowse');
    const btnExport = document.getElementById('btnExport');
    const modalOverlay = document.getElementById('modalOverlay');
    const resultPathDisplay = document.getElementById('resultPath');
    const btnComplete = document.getElementById('btnComplete');

    try {
        const defaultPath = await invoke("get_default_export_path");
        exportPathInput.value = defaultPath;
    } catch (e) { console.error(e); }

    btnBrowse.addEventListener('click', async () => {
        const selectedPath = await invoke("ask_save_path", { currentPath: exportPathInput.value });
        if (selectedPath) exportPathInput.value = selectedPath;
    });

    btnExport.addEventListener('click', async () => {
        const savePath = exportPathInput.value;
        if (!savePath) { showToast("保存先を指定してください", true); return; }

        const targets = {
            music: chkMusic.checked,
            images: chkImages.checked,
            db: chkDb.checked,
            settings: chkSettings.checked,
            playlists: chkPlaylists.checked
        };

        if (!Object.values(targets).includes(true)) { showToast("項目を1つ以上選択してください", true); return; }

        btnExport.disabled = true;
        btnExport.innerHTML = 'エクスポート中...';

        try {
            const result = await invoke("execute_export", { targets: targets, savePath: savePath });
            if (result.success) {
                showToast("完了しました", false);
                resultPathDisplay.textContent = result.path;
                modalOverlay.classList.add('show');
            } else { showToast(`エラー: ${result.message}`, true); }
        } catch (e) { showToast("システムエラーが発生しました", true); } 
        finally { btnExport.disabled = false; btnExport.innerHTML = 'エクスポートを実行'; }
    });

    btnComplete.addEventListener('click', () => window.location.href = 'index.html');

    function showToast(message, isError) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show ' + (isError ? 'error' : 'success');
        setTimeout(() => toast.classList.remove('show'), 5000);
    }
});