document.addEventListener('DOMContentLoaded', () => {
    
    // --- 共通要素 ---
    const toast = document.getElementById('toast');
    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const logArea = document.getElementById('logArea');
    const logList = document.getElementById('logList');

    // --- Tab Switching ---
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // ============================================================
    //  TAB 1: List Import Logic
    // ============================================================
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const btnClearFile = document.getElementById('btnClearFile');
    const btnImport = document.getElementById('btnImport');

    let selectedFile = null;

    dropArea.addEventListener('click', () => fileInput.click());
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); dropArea.classList.add('dragover');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault(); dropArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    function handleFileSelect(file) {
        if (!file) return;
        selectedFile = file;
        fileName.textContent = file.name;
        dropArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        btnImport.disabled = false;
    }

    btnClearFile.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        fileInput.value = '';
        fileInfo.style.display = 'none';
        dropArea.style.display = 'flex';
        btnImport.disabled = true;
    });

    btnImport.addEventListener('click', () => {
        if (!selectedFile) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const ext = selectedFile.name.split('.').pop().toLowerCase();
            
            uiStartProcess();
            const logs = await eel.execute_import(content, ext)();
            uiEndProcess(logs);
            
            // リストインポート完了時にアラート表示
            showAlert("インポート完了", "リストからのインポート処理が完了しました。");
        };
        reader.readAsText(selectedFile);
    });


    // ============================================================
    //  TAB 2: MP3 ZIP Direct Import Logic
    // ============================================================
    const dropAreaZip = document.getElementById('dropAreaZip');
    const zipUploadSection = document.getElementById('zipUploadSection');
    const zipResultSection = document.getElementById('zipResultSection');
    const btnRescan = document.getElementById('btnRescan');
    const btnExecZipImport = document.getElementById('btnExecZipImport');
    
    // Modal
    const passwordModal = document.getElementById('passwordModal');
    const zipPasswordInput = document.getElementById('zipPassword');
    const btnSubmitPass = document.getElementById('btnSubmitPass');
    const btnCancelPass = document.getElementById('btnCancelPass');

    let currentZipPath = null;
    let scannedData = [];
    let tempDir = null;
    let activeTags = [];

    // Pythonダイアログを使用
    dropAreaZip.onclick = async (e) => {
        e.preventDefault();
        const path = await eel.select_zip_file_dialog()(); 
        if (path) {
            currentZipPath = path;
            scanZip(path, null);
        }
    };

    async function scanZip(path, password) {
        uiStartProcess("ZIPファイルを解析中...");
        zipUploadSection.style.display = 'none';
        
        const res = await eel.scan_mp3_zip(path, password)();
        
        if (res.status === 'password_required') {
            uiEndProcess(null);
            zipPasswordInput.value = '';
            passwordModal.style.display = 'flex';
            return;
        } else if (res.status === 'error') {
            uiEndProcess(null);
            showToast(res.message, true);
            zipUploadSection.style.display = 'block';
            return;
        }
        
        scannedData = res.data;
        tempDir = res.temp_dir;
        activeTags = res.active_tags;
        
        if (scannedData.length === 0) {
            uiEndProcess(null);
            showToast("MP3ファイルが見つかりませんでした", true);
            zipUploadSection.style.display = 'block';
            return;
        }

        renderMp3Table();
        
        uiEndProcess(null);
        zipResultSection.style.display = 'block';
    }

    btnSubmitPass.addEventListener('click', () => {
        const pwd = zipPasswordInput.value;
        passwordModal.style.display = 'none';
        scanZip(currentZipPath, pwd);
    });
    btnCancelPass.addEventListener('click', () => {
        passwordModal.style.display = 'none';
        zipUploadSection.style.display = 'block';
    });

    function renderMp3Table() {
        const thead = document.getElementById('mp3TableHeader');
        const tbody = document.getElementById('mp3TableBody');
        
        let headerHTML = `
            <tr>
                <th class="col-status">状態</th>
                <th class="col-no">No.</th>
                <th class="col-path">ファイルパス</th>
                <th class="col-title">タイトル <span class="req">*</span></th>
                <th class="col-artist">アーティスト <span class="req">*</span></th>
        `;
        activeTags.forEach(tag => {
            if (tag === 'title' || tag === 'artist') return;
            headerHTML += `<th>${tag}</th>`;
        });
        headerHTML += `
                <th class="col-lyric">歌詞</th>
                <th class="col-action">操作</th>
            </tr>
        `;
        thead.innerHTML = headerHTML;

        tbody.innerHTML = '';
        scannedData.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            const isError = (item.status === 'missing_meta');
            const statusIcon = isError ? 
                '<span class="status-badge error">要確認</span>' : 
                '<span class="status-badge ok">OK</span>';
            
            let html = `
                <td class="col-status">${statusIcon}</td>
                <td class="col-no">${item.id}</td>
                <td class="col-path" title="${item.rel_path}">${item.rel_path}</td>
                <td><input type="text" class="edit-input ${!item.title?'err':''}" value="${item.title||''}" onchange="updateItem(${index}, 'title', this.value)"></td>
                <td><input type="text" class="edit-input ${!item.artist?'err':''}" value="${item.artist||''}" onchange="updateItem(${index}, 'artist', this.value)"></td>
            `;
            
            activeTags.forEach(tag => {
                if (tag === 'title' || tag === 'artist') return;
                html += `<td><input type="text" class="edit-input" value="${item[tag]||''}" onchange="updateItem(${index}, '${tag}', this.value)"></td>`;
            });
            
            html += `
                <td><input type="text" class="edit-input" value="${item.lyric||''}" placeholder="歌詞" onchange="updateItem(${index}, 'lyric', this.value)" title="${item.lyric||''}"></td>
                <td><button class="btn-del-row" onclick="deleteItem(${index})">削除</button></td>
            `;
            
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    }

    window.updateItem = (index, key, val) => {
        scannedData[index][key] = val;
        if (scannedData[index].title && scannedData[index].artist) {
            scannedData[index].status = 'ok';
        } else {
            scannedData[index].status = 'missing_meta';
        }
        renderMp3Table();
    };

    window.deleteItem = (index) => {
        scannedData.splice(index, 1);
        
        if (scannedData.length === 0) {
            zipResultSection.style.display = 'none';
            zipUploadSection.style.display = 'block';
            showToast("全てのリストが削除されました", false);
        } else {
            renderMp3Table();
        }
    };

    btnRescan.addEventListener('click', () => {
        zipResultSection.style.display = 'none';
        zipUploadSection.style.display = 'block';
        scannedData = [];
    });

    btnExecZipImport.addEventListener('click', async () => {
        const errors = scannedData.filter(d => d.status === 'missing_meta');
        if (errors.length > 0) {
            if (!confirm(`タイトルまたはアーティストが未入力の曲が ${errors.length} 件あります。\nこれらは不完全な状態で登録されますがよろしいですか？`)) {
                return;
            }
        }
        if (scannedData.length === 0) return;

        uiStartProcess("楽曲を追加しています...");
        
        const res = await eel.execute_mp3_zip_import(scannedData, tempDir)();
        
        uiEndProcess(null);
        
        if (res.status === 'success') {
            logList.innerHTML = '';
            res.logs.forEach(l => {
                const li = document.createElement('li');
                li.className = l.status;
                li.textContent = l.message;
                logList.appendChild(li);
            });
            logArea.style.display = 'block';
            zipResultSection.style.display = 'none';
            
            // ZIPインポート完了時にアラート表示
            showAlert("インポート完了", `${res.count} 曲の追加が完了しました！`);
        } else {
            showAlert("エラー", res.message, true);
        }
    });


    // --- UI Helpers ---
    function uiStartProcess(msg = "処理中...") {
        progressText.textContent = msg;
        progressArea.style.display = 'flex';
        progressBar.style.width = '0%';
        logArea.style.display = 'none';
    }
    
    function uiEndProcess(logs) {
        progressArea.style.display = 'none';
        if (logs) {
            logList.innerHTML = '';
            logs.forEach(l => {
                const li = document.createElement('li');
                li.className = l.status;
                li.textContent = l.message;
                logList.appendChild(li);
            });
            logArea.style.display = 'block';
        }
    }

    eel.expose(js_import_progress);
    function js_import_progress(current, total, msg) {
        progressText.textContent = msg;
        const pct = total > 0 ? (current / total) * 100 : 0;
        progressBar.style.width = `${pct}%`;
    }
    
    function showToast(message, isError) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'toast show';
        if (isError) toast.classList.add('error'); else toast.classList.add('success');
        setTimeout(() => toast.classList.remove('show'), 5000);
    }

    function showAlert(title, message, isError = false) {
        const modal = document.getElementById('alertModal');
        const tEl = document.getElementById('alertTitle');
        const mEl = document.getElementById('alertMessage');
        const btn = document.getElementById('btnAlertOk');
        if(!modal) return;
        
        tEl.textContent = title;
        tEl.style.color = isError ? '#ef4444' : 'var(--text-main)';
        mEl.textContent = message;
        
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        
        btn.onclick = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        };
    }
    
    window.js_import_progress = js_import_progress;
});