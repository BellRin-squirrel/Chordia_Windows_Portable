(function() {
    window.MiniPlayer = {
        isSeeking: false,
        DEFAULT_ICON: "icon/Chordia.png",
        SVG_PLAY: `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" /></svg>`,
        SVG_PAUSE: `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M6.75 5.25a1.5 1.5 0 0 0-1.5 1.5v10.5a1.5 1.5 0 0 0 3 0V6.75a1.5 1.5 0 0 0-1.5-1.5Zm10.5 0a1.5 1.5 0 0 0-1.5 1.5v10.5a1.5 1.5 0 0 0 3 0V6.75a1.5 1.5 0 0 0-1.5-1.5Z" clip-rule="evenodd" /></svg>`,

        init: function() {
            // 横幅の最大制限
            const enforceMaxWidth = () => {
                if (window.outerWidth > 600) {
                    window.resizeTo(600, window.outerHeight);
                }
            };

            try {
                window.resizeTo(400, 960);
            } catch (e) {
                console.warn("ウィンドウのリサイズに失敗しました");
            }

            window.addEventListener('resize', enforceMaxWidth);

            this.art = document.getElementById('art');
            this.title = document.getElementById('title');
            this.artist = document.getElementById('artist');
            this.btnPlayPause = document.getElementById('playpause');
            this.btnNext = document.getElementById('next');
            this.btnPrev = document.getElementById('prev');
            this.seekBar = document.getElementById('seek');
            this.queueList = document.getElementById('queue-list');

            // ★ 親ウィンドウのコントローラーを直接取得
            const parent = window.opener;
            if (!parent || !parent.PlayerController) {
                console.error("親ウィンドウが見つかりません。");
                this.title.textContent = "Error: プレイヤー未接続";
                return;
            }

            const pCtrl = parent.PlayerController;

            // Pythonを介さず親ウィンドウの関数を直接叩く
            this.btnPlayPause.onclick = () => pCtrl.togglePlayPause();
            this.btnNext.onclick = () => pCtrl.nextSong();
            this.btnPrev.onclick = () => pCtrl.prevSong();
            
            this.seekBar.oninput = () => { this.isSeeking = true; };
            this.seekBar.onchange = () => {
                if (pCtrl.audio && pCtrl.audio.duration) {
                    pCtrl.audio.currentTime = (this.seekBar.value / 1000) * pCtrl.audio.duration;
                }
                this.isSeeking = false;
            };

            // 定期的に親ウィンドウの状態を監視して同期する
            this.sync();
            setInterval(() => this.sync(), 200);
        },

        sync: function() {
            const parent = window.opener;
            if (!parent || !parent.PlayerState || !parent.PlayerController) return;
            const ps = parent.PlayerState;
            const pCtrl = parent.PlayerController;

            if (ps.queue.length === 0 || ps.currentIndex < 0) return;
            const currentSong = ps.queue[ps.currentIndex];

            const state = {
                song: currentSong,
                isPlaying: ps.isPlaying,
                currentTime: pCtrl.audio ? pCtrl.audio.currentTime : 0,
                duration: pCtrl.audio ? pCtrl.audio.duration : 0,
                queue: ps.queue.slice(ps.currentIndex + 1, ps.currentIndex + 52)
            };
            this.render(state);
        },

        render: function(state) {
            if (!state || !state.song) return;

            this.title.textContent = state.song.title || "Unknown";
            this.artist.textContent = state.song.artist || "Unknown";
            this.art.src = state.song.imageData || this.DEFAULT_ICON;

            this.btnPlayPause.innerHTML = state.isPlaying ? this.SVG_PAUSE : this.SVG_PLAY;

            if (!this.isSeeking) {
                const ratio = state.duration ? (state.currentTime / state.duration) : 0;
                const progress = ratio * 1000;
                this.seekBar.value = progress;
                this.seekBar.style.background = `linear-gradient(to right, var(--primary-color) ${ratio * 100}%, rgba(128,128,128,0.2) ${ratio * 100}%)`;
            }

            // キューの描画 (最大50曲・アートワーク付き)
            let html = "";
            if (state.queue && state.queue.length > 0) {
                const displayQueue = state.queue.slice(0, 50);
                displayQueue.forEach(song => {
                    const artSrc = song.imageData || this.DEFAULT_ICON;
                    html += `
                        <div class="queue-item">
                            <img class="queue-art" src="${artSrc}" alt="Art">
                            <div class="queue-info">
                                <div class="queue-title">${this.escapeHtml(song.title)}</div>
                                <div class="queue-artist">${this.escapeHtml(song.artist)}</div>
                            </div>
                        </div>
                    `;
                });
                
                if (state.queue.length > 50) {
                    html += `<div class="queue-more">再生はまだ続きます</div>`;
                }
            } else {
                html = '<div class="queue-item" style="color:var(--text-sub); font-style:italic; padding: 1.5vh 0; border: none; justify-content: center;">次に再生される曲はありません</div>';
            }
            this.queueList.innerHTML = html;
        },

        escapeHtml: function(str) {
            if (!str) return '';
            return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
    };

    document.addEventListener('DOMContentLoaded', () => MiniPlayer.init());
})();