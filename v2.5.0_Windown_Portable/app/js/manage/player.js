(function() {
    const s = window.ManageState;
    const u = window.ManageUtils;

    window.PlayerController = {
        init: function() {
            const audioPlayer = document.getElementById('previewPlayer');
            const seekBar = document.getElementById('seekBar');
            const barPlayBtn = document.getElementById('barPlayBtn');

            if (!audioPlayer || !seekBar || !barPlayBtn) return;

            // 再生時間更新
            audioPlayer.addEventListener('timeupdate', () => {
                if (!s.isSeeking) {
                    const current = audioPlayer.currentTime;
                    const duration = audioPlayer.duration;
                    if (!isNaN(duration) && duration > 0) {
                        const ratio = (current / duration);
                        seekBar.value = ratio * 1000;
                        u.updateSeekColor(ratio * 100);
                        const display = document.getElementById('playerTimeDisplay');
                        if(display) display.textContent = `${u.formatTime(current)} / ${u.formatTime(duration)}`;
                    }
                }
            });

            audioPlayer.addEventListener('ended', () => {
                this.stopPreview();
            });

            seekBar.addEventListener('mousedown', () => s.isSeeking = true);
            seekBar.addEventListener('input', () => u.updateSeekColor(seekBar.value / 10));
            seekBar.addEventListener('change', () => {
                const duration = audioPlayer.duration;
                if (!isNaN(duration)) audioPlayer.currentTime = (seekBar.value / 1000) * duration;
                s.isSeeking = false;
            });

            barPlayBtn.addEventListener('click', () => {
                if (s.currentPlayingIndex === -1) return;
                if (audioPlayer.paused) { audioPlayer.play(); this.updatePlayIcons(true); } 
                else { audioPlayer.pause(); this.updatePlayIcons(false); }
            });
        },

        playPreview: function(index) {
            const item = s.libraryData[index];
            const audioPlayer = document.getElementById('previewPlayer');
            const playerBar = document.getElementById('playerBar');

            if (s.currentPlayingIndex === index) {
                if (audioPlayer.paused) { audioPlayer.play(); this.updatePlayIcons(true); } 
                else { audioPlayer.pause(); this.updatePlayIcons(false); }
                return;
            }

            if (s.currentPlayingIndex !== -1) {
                const prevBtn = document.getElementById(`btnPlay_${s.currentPlayingIndex}`);
                if (prevBtn) { prevBtn.innerHTML = s.SVG_PLAY; prevBtn.classList.remove('playing'); }
            }

            s.currentPlayingIndex = index;
            if (item.musicFilename) {
                const filename = item.musicFilename.split(/[\\/]/).pop();
                audioPlayer.src = `/stream_music/${filename}`;
                audioPlayer.play().catch(e => { console.error(e); u.showToast("再生できません", true); });
            }

            const currentBtn = document.getElementById(`btnPlay_${index}`);
            if (currentBtn) { currentBtn.innerHTML = s.SVG_PAUSE; currentBtn.classList.add('playing'); }
            document.getElementById('barPlayBtn').innerHTML = s.SVG_PAUSE;

            this.updatePlayerInfo(item);
            playerBar.classList.add('active');
        },

        stopPreview: function() {
            const audioPlayer = document.getElementById('previewPlayer');
            audioPlayer.pause();
            audioPlayer.src = "";
            if (s.currentPlayingIndex !== -1) {
                const btn = document.getElementById(`btnPlay_${s.currentPlayingIndex}`);
                if (btn) { btn.innerHTML = s.SVG_PLAY; btn.classList.remove('playing'); }
            }
            document.getElementById('barPlayBtn').innerHTML = s.SVG_PLAY;
        },

        updatePlayIcons: function(isPlaying) {
            const currentBtn = document.getElementById(`btnPlay_${s.currentPlayingIndex}`);
            const barBtn = document.getElementById('barPlayBtn');
            if (isPlaying) {
                if (currentBtn) { currentBtn.innerHTML = s.SVG_PAUSE; currentBtn.classList.add('playing'); }
                barBtn.innerHTML = s.SVG_PAUSE;
            } else {
                if (currentBtn) { currentBtn.innerHTML = s.SVG_PLAY; currentBtn.classList.remove('playing'); }
                barBtn.innerHTML = s.SVG_PLAY;
            }
        },

        updatePlayerInfo: function(item) {
            document.getElementById('playerTitle').textContent = item.title || 'Unknown';
            document.getElementById('playerArtist').textContent = item.artist || 'Unknown';
            const subInfo = document.getElementById('playerSubInfo');
            subInfo.textContent = `${item.album || ''} | Tr. ${item.track || '--'}`;
            document.getElementById('playerArt').src = item.imageData || s.DEFAULT_ICON;
        }
    };
})();