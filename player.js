let player;
let progressInterval;
let isPlayerReady = false;

const ytReadyInterval = setInterval(() => {
    if (typeof YT !== 'undefined' && typeof YT.Player !== 'undefined') {
        clearInterval(ytReadyInterval);
        document.dispatchEvent(new CustomEvent('YTP_PlayerReady', {}));
    }
}, 100);

document.addEventListener('YTP_PlaylistData', (e) => {
    const playlistData = e.detail;
    if (!playlistData || playlistData.length === 0) return;

    if (player && typeof player.destroy === 'function') {
        player.destroy();
    }

    player = new YT.Player('ytp-player-embed', {
        height: '1',
        width: '1',
        videoId: playlistData[0].snippet.resourceId.videoId,
        playerVars: {
            'playsinline': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
});


function onPlayerReady(event) {
    isPlayerReady = true;
}

function onPlayerStateChange(event) {
    document.dispatchEvent(new CustomEvent('YTP_StateChange', { detail: { state: event.data } }));

    if (event.data === YT.PlayerState.PLAYING) {
        startProgressInterval();
    } else {
        stopProgressInterval();
    }

    if (event.data === YT.PlayerState.ENDED) {
        document.dispatchEvent(new CustomEvent('YTP_PlayNext', {}));
    }
}

document.addEventListener('YTP_Control', (e) => {
    if (!isPlayerReady) return;

    const command = e.detail.command;
    const args = e.detail.args;

    switch (command) {
        case 'playVideo':
            player.playVideo();
            break;
        case 'pauseVideo':
            player.pauseVideo();
            break;
        case 'loadVideo':
            player.loadVideoById(args.videoId);
            if (!args.autoplay) {
                setTimeout(() => player.pauseVideo(), 100);
            }
            break;
        case 'seekTo':
            player.seekTo(args.time, true);
            break;
    }
});

function startProgressInterval() {
    stopProgressInterval();
    progressInterval = setInterval(() => {
        if (player && typeof player.getCurrentTime === 'function') {
            const currentTime = player.getCurrentTime();
            const duration = player.getDuration();
            document.dispatchEvent(new CustomEvent('YTP_TimeUpdate', { detail: { currentTime, duration } }));
        }
    }, 500);
}

function stopProgressInterval() {
    clearInterval(progressInterval);
}