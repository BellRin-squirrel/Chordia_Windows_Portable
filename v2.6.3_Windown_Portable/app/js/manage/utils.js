window.ManageUtils = {
    escapeHtml: function(text) {
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
    showToast: function(msg, isErr) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast show';
        if (isErr) toast.classList.add('error'); else toast.classList.add('success');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    formatTime: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    updateSeekColor: function(p) {
        const seekBar = document.getElementById('seekBar');
        if(seekBar) seekBar.style.background = `linear-gradient(to right, #4f46e5 ${p}%, #e5e7eb ${p}%)`;
    }
};