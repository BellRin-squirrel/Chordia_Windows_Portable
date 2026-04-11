document.addEventListener('DOMContentLoaded', () => {
    
    // --- 共通要素 ---
    const toast = document.getElementById('toast');
    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const logArea = document.getElementById('logArea');
    const logList = document.getElementById('logList');

    let selectedFile = null;
    let selectedZipFile = null;
    let scannedData = [];
    let tempDir = null;
    let activeTags = [];
    let currentEditIndex = -1;
    let importMode = 'list'; // 'list' or 'zip'

    // --- Tab Switching ---
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            logArea.style.display = 'none';
            importMode = tab.dataset.tab === 'tab-list' ? 'list' : 'zip';
        });
    });

    // --- Helpers ---
    function setupDragAndDrop(area, cb) {
        area.ondragover = (e) => { e.preventDefault(); area.classList.add('dragover'); };
        area.ondragleave = () => area.classList.remove('dragover');
        area.ondrop = (e) => { e.preventDefault(); area.classList.remove('dragover'); if(e.dataTransfer.files[0]) cb(e.dataTransfer.files[0]); };
    }
    function uiStartProcess(msg) { progressText.textContent = msg; progressArea.style.display = 'flex'; progressBar.style.width = '0%'; }
    function uiEndProcess() { progressArea.style.display = 'none'; }
    function showToast(m, e) { toast.textContent = m; toast.className = 'toast show '+(e?'error':'success'); setTimeout(()=>toast.classList.remove('show'), 4000); }
    function showAlert(t, m) { document.getElementById('alertTitle').textContent = t; document.getElementById('alertMessage').textContent = m; document.getElementById('alertModal').classList.add('show'); }
    document.getElementById('btnAlertOk').onclick = () => document.getElementById('alertModal').classList.remove('show');

    // ============================================================
    //  TAB 1: List Import (JSON/CSV)
    // ============================================================
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const btnScanList = document.getElementById('btnScanList');
    const fileInfo = document.getElementById('fileInfo');
    const listResultSection = document.getElementById('listResultSection');
    const listUploadSection = document.getElementById('listUploadSection');

    dropArea.onclick = () => fileInput.click();
    setupDragAndDrop(dropArea, (file) => handleListFile(file));
    fileInput.onchange = (e) => handleListFile(e.target.files[0]);

    function handleListFile(file) {
        if (!file) return;
        selectedFile = file;
        document.getElementById('fileName').textContent = file.name;
        dropArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        btnScanList.disabled = false;
    }

    document.getElementById('btnClearFile').onclick = () => {
        selectedFile = null; fileInput.value = ''; dropArea.style.display = 'block'; fileInfo.style.display = 'none'; btnScanList.disabled = true;
    };

    btnScanList.onclick = () => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            uiStartProcess("リストを解析中...");
            const ext = selectedFile.name.split('.').pop().toLowerCase();
            const res = await eel.parse_list_import(e.target.result, ext)();
            uiEndProcess();
            if (res.status === 'success') {
                scannedData = res.data;
                const settings = await eel.get_app_settings()();
                activeTags = settings.active_tags;
                renderTable('list');
                listUploadSection.style.display = 'none';
                listResultSection.style.display = 'block';
            } else {
                showAlert("エラー", res.message);
            }
        };
        reader.readAsText(selectedFile);
    };

    document.getElementById('btnRescanList').onclick = () => {
        scannedData = []; listResultSection.style.display = 'none'; listUploadSection.style.display = 'block'; document.getElementById('btnClearFile').click();
    };

    document.getElementById('btnExecListImport').onclick = async () => {
        uiStartProcess("楽曲を登録中...");
        const res = await eel.execute_final_list_import(scannedData)();
        uiEndProcess();
        if (res.status === 'success') {
            showAlert("完了", `${res.count}曲登録しました。`);
            document.getElementById('btnRescanList').click();
        } else {
            showAlert("エラー", res.message);
        }
    };

    // ============================================================
    //  TAB 2: MP3 ZIP Direct Import
    // ============================================================
    const dropAreaZip = document.getElementById('dropAreaZip');
    const fileInputZip = document.getElementById('fileInputZip');
    const btnScanZip = document.getElementById('btnScanZip');
    const zipFileInfo = document.getElementById('zipFileInfo');
    const zipResultSection = document.getElementById('zipResultSection');
    const zipUploadSection = document.getElementById('zipUploadSection');
    const btnRescan = document.getElementById('btnRescan');

    dropAreaZip.onclick = () => fileInputZip.click();
    setupDragAndDrop(dropAreaZip, (file) => handleZipFileSelect(file));
    fileInputZip.onchange = (e) => handleZipFileSelect(e.target.files[0]);

    function handleZipFileSelect(file) {
        if (!file || !file.name.toLowerCase().endsWith('.zip')) { showToast("ZIPファイルを選択してください", true); return; }
        selectedZipFile = file;
        document.getElementById('zipFileName').textContent = file.name;
        dropAreaZip.style.display = 'none';
        zipFileInfo.style.display = 'flex';
        btnScanZip.disabled = false;
    }

    document.getElementById('btnClearZipFile').onclick = () => {
        selectedZipFile = null; fileInputZip.value = ''; dropAreaZip.style.display = 'block'; zipFileInfo.style.display = 'none'; btnScanZip.disabled = true;
    };

    btnScanZip.onclick = () => startZipAnalysis(null);

    async function startZipAnalysis(password) {
        uiStartProcess("ZIPファイルを読み込み中...");
        const reader = new FileReader();
        reader.onload = async (e) => {
            uiStartProcess("ZIPファイルを解析中...");
            const res = await eel.scan_mp3_zip_from_data(e.target.result, password)();
            if (res.status === 'password_required') {
                uiEndProcess();
                document.getElementById('zipPassword').value = '';
                document.getElementById('passwordModal').style.display = 'flex';
            } else if (res.status === 'success') {
                scannedData = res.data;
                tempDir = res.temp_dir;
                activeTags = res.active_tags;
                renderTable('zip');
                zipUploadSection.style.display = 'none';
                zipResultSection.style.display = 'block';
                uiEndProcess();
            } else {
                uiEndProcess();
                showToast(res.message, true);
            }
        };
        reader.readAsDataURL(selectedZipFile);
    }

    btnRescan.onclick = () => {
        scannedData = []; zipResultSection.style.display = 'none'; zipUploadSection.style.display = 'block'; document.getElementById('btnClearZipFile').click();
    };

    document.getElementById('btnSubmitPass').onclick = () => {
        const pwd = document.getElementById('zipPassword').value;
        document.getElementById('passwordModal').style.display = 'none';
        startZipAnalysis(pwd);
    };
    // ★追加: パスワードモーダルのキャンセル
    document.getElementById('btnCancelPass').onclick = () => {
        document.getElementById('passwordModal').style.display = 'none';
    };

    // ============================================================
    //  共通テーブル描画 & 編集
    // ============================================================
    function renderTable(type) {
        const theadId = type === 'list' ? 'listTableHeader' : 'mp3TableHeader';
        const tbodyId = type === 'list' ? 'listTableBody' : 'mp3TableBody';
        const thead = document.getElementById(theadId);
        const tbody = document.getElementById(tbodyId);

        let h = `<tr><th>状態</th><th>No.</th><th>パス</th><th>アート</th><th>タイトル *</th><th>アーティスト *</th>`;
        activeTags.forEach(t => { if(t!=='title' && t!=='artist') h += `<th>${t}</th>`; });
        h += `<th>操作</th></tr>`;
        thead.innerHTML = h;

        tbody.innerHTML = '';
        scannedData.forEach((item, idx) => {
            const tr = document.createElement('tr');
            const artSrc = item.artwork_base64 || 'icon/Chordia.png';
            const path = type === 'list' ? item.musicFilename : item.rel_path;
            let row = `<td>${item.status==='ok'?'OK':'エラー'}</td><td>${item.id}</td><td class="col-path" title="${path}">${path}</td>
                <td class="col-art-thumb"><img src="${artSrc}"></td>
                <td><input type="text" class="edit-input" value="${item.title||''}" onchange="updateScanned(${idx}, 'title', this.value)"></td>
                <td><input type="text" class="edit-input" value="${item.artist||''}" onchange="updateScanned(${idx}, 'artist', this.value)"></td>`;
            activeTags.forEach(t => { if(t!=='title' && t!=='artist') row += `<td><input type="text" class="edit-input" value="${item[t]||''}" onchange="updateScanned(${idx}, '${t}', this.value)"></td>`; });
            row += `<td class="col-action">
                <button class="btn-icon-action" onclick="openLyricsModal(${idx})" title="歌詞を編集"><svg style="width:20px;height:20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></button>
                <button class="btn-icon-action" onclick="openArtModal(${idx})" title="アートワークを変更"><svg style="width:20px;height:20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></button>
                <button class="btn-del-row" onclick="deleteScanned(${idx})">削除</button>
            </td>`;
            tr.innerHTML = row;
            tbody.appendChild(tr);
        });
    }

    window.updateScanned = (idx, key, val) => { 
        scannedData[idx][key] = val; 
        renderTable(importMode); 
    };
    window.deleteScanned = (idx) => { 
        scannedData.splice(idx, 1); 
        renderTable(importMode); 
    };

    // --- 歌詞編集 ---
    const lyricModal = document.getElementById('lyricModal');
    window.openLyricsModal = (idx) => { currentEditIndex = idx; document.getElementById('lyricTextArea').value = scannedData[idx].lyric || ''; lyricModal.style.display = 'flex'; };
    document.getElementById('btnCancelLyric').onclick = () => lyricModal.style.display = 'none';
    document.getElementById('btnSaveLyric').onclick = () => { scannedData[currentEditIndex].lyric = document.getElementById('lyricTextArea').value; lyricModal.style.display = 'none'; showToast("反映しました"); };
    
    // --- アートワーク編集 ---
    const artModal = document.getElementById('artModal');
    const artPreview = document.getElementById('currentArtPreview');
    
    window.openArtModal = (idx) => {
        currentEditIndex = idx;
        artPreview.src = scannedData[idx].artwork_base64 || 'icon/Chordia.png';
        artModal.style.display = 'flex';
    };

    // ★修正: アートワークモーダルのキャンセルボタン
    document.getElementById('btnCancelArt').onclick = () => {
        artModal.style.display = 'none';
    };

    document.getElementById('btnSaveArt').onclick = () => {
        scannedData[currentEditIndex].artwork_base64 = artPreview.src;
        artModal.style.display = 'none';
        renderTable(importMode);
        showToast("反映しました");
    };

    // アートワーク編集内の画像選択処理
    document.getElementById('newArtInput').onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => artPreview.src = ev.target.result;
        reader.readAsDataURL(file);
    };

    document.getElementById('btnExecZipImport').onclick = async () => {
        uiStartProcess("楽曲を追加中...");
        const res = await eel.execute_mp3_zip_import(scannedData, tempDir)();
        uiEndProcess();
        if(res.status === 'success') { showAlert("完了", `${res.count}曲追加しました。`); btnRescan.click(); }
        else showAlert("エラー", res.message);
    };

    eel.expose(js_import_progress);
    function js_import_progress(c, t, m) { progressText.textContent = m; progressBar.style.width = (c/t*100)+'%'; }
});