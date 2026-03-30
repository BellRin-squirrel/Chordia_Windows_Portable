window.AddMusicUtils = {
    // トースト通知を表示
    showToast: function(message, isError) {
        const toast = document.getElementById('toast');
        if (!toast) return;
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
    },

    // アラートモーダルを表示
    showAlert: function(msg) {
        const modal = document.getElementById('alertModal');
        const msgEl = document.getElementById('alertMessage');
        const btnOk = document.getElementById('btnAlertOk');
        if (!modal || !msgEl) return;

        msgEl.textContent = msg;
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);

        if (btnOk) {
            btnOk.onclick = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.style.display = 'none', 300);
            };
        }
    },

    escapeHtml: function(text) {
        if (!text) return '';
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    readFileAsBase64: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    setupDragAndDrop: function(element, callback) {
        if (!element) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, (e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            element.addEventListener(eventName, () => {
                element.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, () => {
                element.classList.remove('dragover');
            }, false);
        });

        element.addEventListener('drop', (e) => {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                callback(e.dataTransfer.files[0]);
            }
        });
    },

    formatDuration: function(sec) {
        if (!sec) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};