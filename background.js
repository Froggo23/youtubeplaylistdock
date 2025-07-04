chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "authenticate") {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (handleAuthError(token, sendResponse)) return;
            fetchUserPlaylists(token, sendResponse);
        });
        return true;
    }
    else if (request.action === "getPlaylists") {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (handleAuthError(token, sendResponse)) return;
            fetchUserPlaylists(token, sendResponse);
        });
        return true;
    }
    else if (request.action === "getPlaylistItems") {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (handleAuthError(token, sendResponse)) return;
            fetchPlaylistItemsAndDetails(token, request.playlistId, sendResponse);
        });
        return true;
    }
});

function handleAuthError(token, sendResponse) {
    if (chrome.runtime.lastError || !token) {
        console.error("Authentication Error:", chrome.runtime.lastError);
        sendResponse({ error: "Authentication failed." });
        return true;
    }
    return false;
}

async function fetchUserPlaylists(token, sendResponse) {
    try {
        const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        sendResponse({ playlists: data.items });
    } catch (error) {
        console.error("Error fetching playlists:", error);
        sendResponse({ error: "Failed to fetch playlists." });
    }
}

async function fetchPlaylistItemsAndDetails(token, playlistId, sendResponse) {
    try {
        const playlistItemsResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const playlistData = await playlistItemsResponse.json();
        if (playlistData.error) throw new Error(playlistData.error.message);
        if (!playlistData.items || playlistData.items.length === 0) {
            sendResponse({ items: [] });
            return;
        }
        const videoIds = playlistData.items.map(item => item.snippet.resourceId.videoId).join(',');
        const videoDetailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const videoDetailsData = await videoDetailsResponse.json();
        if (videoDetailsData.error) throw new Error(videoDetailsData.error.message);
        const videoDetailsMap = new Map(videoDetailsData.items.map(item => [item.id, item]));
        const combinedItems = playlistData.items.map(item => {
            const videoId = item.snippet.resourceId.videoId;
            const details = videoDetailsMap.get(videoId);
            return {
                ...item,
                contentDetails: details ? details.contentDetails : {},
                fullSnippet: details ? details.snippet : {}
            };
        });
        sendResponse({ items: combinedItems });
    } catch (error) {
        console.error("Error fetching playlist items and details:", error);
        sendResponse({ error: "Failed to fetch playlist items." });
    }
}