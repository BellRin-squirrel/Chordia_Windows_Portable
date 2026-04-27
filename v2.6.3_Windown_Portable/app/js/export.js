document.addEventListener('DOMContentLoaded', async () => {
    
    // 要素取得
    const chkMusic = document.getElementById('chkMusic');
    const chkImages = document.getElementById('chkImages');
    const chkDb = document.getElementById('chkDb');
    const chkSettings = document.getElementById('chkSettings');
    const chkPlaylists = document.getElementById('chkPlaylists');
    
    const exportPathInput = document.getElementById('exportPath');
    const exportPasswordInput = document.getElementById('exportPassword');
    const btnBrowse = document.getElementById('btnBrowse');
    const btnExport = document.getElementById('btnExport');

    const modalOverlay = document.getElementById('modalOverlay');
    const resultPathDisplay = document.getElementById('resultPath');
    const btnComplete = document.getElementById('btnComplete');

    // 1. 初期化：デフォルトの保存先を取得して表示
    try {
        const defaultPath = await eel.get_default_export_path()();
        exportPathInput.value = defaultPath;
    } catch (e) {
        console.error("Default path error:", e);
    }

    // 2. 「参照」ボタン：保存先を変更
    btnBrowse.addEventListener('click', async () => {
        // 現在入力されているパスを元にダイアログを開く
        const currentPath = exportPathInput.value;
        const selectedPath = await eel.ask_save_path(currentPath)();
        
        if (selectedPath) {
            exportPathInput.value = selectedPath;
        }
    });

    // 3. 「エクスポートを実行」ボタン
    btnExport.addEventListener('click', async () => {
        const savePath = exportPathInput.value;
        const password = exportPasswordInput.value; // パスワード取得

        if (!savePath) {
            showToast("保存先を指定してください", true);
            return;
        }

        // 選択項目の収集
        const targets = {
            music: chkMusic.checked,
            images: chkImages.checked,
            db: chkDb.checked,
            settings: chkSettings.checked,
            playlists: chkPlaylists.checked
        };

        if (!Object.values(targets).includes(true)) {
            showToast("エクスポートする項目を少なくとも1つ選択してください", true);
            return;
        }

        // UIロック
        const originalBtnText = btnExport.innerHTML;
        btnExport.disabled = true;
        btnExport.innerHTML = 'エクスポート中...';

        try {
            // Python実行 (password引数を追加)
            const result = await eel.execute_export(targets, savePath, password)();

            if (result.success) {
                showToast("エクスポートが完了しました", false);
                // モーダル表示
                resultPathDisplay.textContent = result.path;
                modalOverlay.classList.add('show');
            } else {
                showToast(`エラー: ${result.message}`, true);
            }

        } catch (e) {
            showToast("予期せぬエラーが発生しました", true);
        } finally {
            btnExport.disabled = false;
            btnExport.innerHTML = originalBtnText;
        }
    });

    // 4. モーダルの「トップへ戻る」ボタン
    btnComplete.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // トースト通知関数 (共通)
    function showToast(message, isError) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        
        toast.className = 'toast show';
        if (isError) {
            toast.classList.add('error');
        } else {
            toast.classList.add('success');
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    }
});