document.addEventListener('DOMContentLoaded', () => {
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;
    const listen = window.__TAURI__.event ? window.__TAURI__.event.listen : null;

    const u = {
        escapeHtml: (str) => str ? String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '',
        showToast: (m, e) => {
            const t = document.getElementById('toast');
            t.textContent = m; t.className = 'toast show '+(e?'error':'success');
            setTimeout(()=>t.classList.remove('show'), 4000);
        },
        showAlert: (t, m) => {
            document.getElementById('alertTitle').textContent = t;
            document.getElementById('alertMessage').textContent = m;
            const modal = document.getElementById('alertModal');
            modal.style.display = 'flex'; modal.classList.add('show');
        }
    };

    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // ★ Rustからの進捗イベントを購読
    if (listen) {
        listen('js_import_progress', (event) => {
            const data = event.payload;
            if (progressArea) progressArea.style.display = 'flex';
            if (progressText) progressText.textContent = data.message;
            if (progressBar) progressBar.style.width = (data.current / data.total * 100) + '%';
        });
    }

    let scannedData = [];
    let importMode = 'list'; 

    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            importMode = tab.dataset.tab === 'tab-list' ? 'list' : 'zip';
        });
    });

    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const btnScanList = document.getElementById('btnScanList');
    const fileInfo = document.getElementById('fileInfo');
    const listResultSection = document.getElementById('listResultSection');
    const listUploadSection = document.getElementById('listUploadSection');

    if(dropArea) dropArea.onclick = () => fileInput.click();
    if(fileInput) fileInput.onchange = (e) => handleListFile(e.target.files[0]);

    function handleListFile(file) {
        if (!file) return;
        document.getElementById('fileName').textContent = file.name;
        dropArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        btnScanList.disabled = false;
        window._selectedFile = file;
    }

    btnScanList.onclick = () => {
        const file = window._selectedFile;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const ext = file.name.split('.').pop().toLowerCase();
            // ★ 引数名を Rust に合わせる
            const res = await invoke("parse_list_import", { content: e.target.result, fileType: ext });
            if (res.status === 'success') {
                scannedData = res.data;
                renderTable('list');
                listUploadSection.style.display = 'none';
                listResultSection.style.display = 'block';
            } else { u.showAlert("エラー", res.message); }
        };
        reader.readAsText(file);
    };

    const btnExecList = document.getElementById('btnExecListImport');
    if(btnExecList) btnExecList.onclick = () => handleFinalImportWithCheck('list');

    async function handleFinalImportWithCheck(type) {
        const duplicates = await invoke("check_import_duplicates", { importList: scannedData });
        if (duplicates.length === 0) {
            executeRegistration(type, scannedData);
            return;
        }
        // 重複がある場合（今回は簡易的に通知のみ）
        u.showToast(`${duplicates.length}曲が重複しています。全て上書き/追加登録します。`, true);
        executeRegistration(type, scannedData);
    }

    async function executeRegistration(type, dataList) {
        if (progressArea) progressArea.style.display = 'flex';
        const res = await invoke("execute_final_list_import", { importDataList: dataList });
        if (progressArea) progressArea.style.display = 'none';
        if (res.status === 'success') u.showAlert("完了", `${res.count}曲の登録が完了しました。`);
    }

    function renderTable(type) {
        const tbody = document.getElementById(type === 'list' ? 'listTableBody' : 'mp3TableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        scannedData.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.status}</td><td>${idx+1}</td><td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${item.musicFilename || item.relPath}</td><td><img src="${item.artworkBase64 || 'icon/Chordia.png'}" width="30" height="30" style="object-fit:cover;"></td><td>${item.title || '--'}</td><td>${item.artist || '--'}</td><td>--</td>`;
            tbody.appendChild(tr);
        });
    }

    const btnAlertOk = document.getElementById('btnAlertOk');
    if(btnAlertOk) btnAlertOk.onclick = () => document.getElementById('alertModal').classList.remove('show');
});