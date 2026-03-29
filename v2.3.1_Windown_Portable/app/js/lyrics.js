(function() {
    window.LyricsController = {
        init: async function() {
            // 親ウィンドウ（プレイヤー）から現在再生中の曲情報を取得
            if (window.opener && window.opener.PlayerState) {
                const s = window.opener.PlayerState;
                const currentSong = s.queue[s.currentIndex];
                if (currentSong) {
                    await this.updateView(currentSong);
                }
            }
        },

        updateView: async function(song) {
            document.getElementById('songTitle').textContent = song.title || "Unknown Title";
            document.getElementById('songArtist').textContent = song.artist || "Unknown Artist";
            
            const lyricsBody = document.getElementById('lyricsBody');
            
            // ご提示いただいた Python 関数 get_lyrics を呼び出し
            try {
                const lyricText = await eel.get_lyrics(song.musicFilename)();

                if (lyricText && lyricText.trim() !== "") {
                    lyricsBody.textContent = lyricText;
                    lyricsBody.classList.remove('no-lyrics');
                } else {
                    lyricsBody.textContent = "歌詞が登録されていません。";
                    lyricsBody.classList.add('no-lyrics');
                }
            } catch (e) {
                console.error("Lyric fetch error:", e);
                lyricsBody.textContent = "エラーが発生しました。";
            }
            
            document.querySelector('.lyrics-container').scrollTop = 0;
        }
    };

    document.addEventListener('DOMContentLoaded', () => window.LyricsController.init());
})();