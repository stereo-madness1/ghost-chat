// NOTE: Swap out the mock .onrender domain below with your exact live URL once deployed!
const BACKEND_URL = window.location.hostname === "localhost" 
    ? "http://localhost:3000" 
    : "https://ghost-chat-backend-wk15.onrender.com";

const socket = io(BACKEND_URL);
let localConnection;
let dataChannel;
let roomId = window.location.pathname.split('/')[2];

// DOM elements
const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');
const btnCreate = document.getElementById('btn-create');
const shareBox = document.getElementById('share-box');
const roomUrlInput = document.getElementById('room-url');
const btnCopy = document.getElementById('btn-copy');
const msgInput = document.getElementById('msg-input');
const chatForm = document.getElementById('chat-form');
const messagesContainer = document.getElementById('messages');
const statusIndicator = document.getElementById('status-indicator');
const chatTitle = document.getElementById('chat-title');
const peerStatus = document.getElementById('peer-status');
const btnSend = document.getElementById('btn-send');

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

if (roomId) {
    lobbyView.classList.add('hidden');
    chatView.classList.remove('hidden');
    initiateSocketConnection();
}

btnCreate.addEventListener('click', () => {
    roomId = Math.random().toString(36).substring(2, 9);
    const generatedUrl = `${window.location.origin}/room/${roomId}`;
    roomUrlInput.value = generatedUrl;
    shareBox.classList.remove('hidden');
    btnCreate.classList.add('hidden');
    
    window.history.pushState({}, '', `/room/${roomId}`);
    initiateSocketConnection();
});

btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(roomUrlInput.value);
    alert('Secure chat room link copied!');
});

function initiateSocketConnection() {
    socket.emit('join-room', roomId);
}

socket.on('created', () => { setupWebRTC(true); });
socket.on('joined', () => { setupWebRTC(false); });

socket.on('ready', () => {
    localConnection.createOffer()
        .then(offer => localConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('signal', { roomId, signal: localConnection.localDescription });
        });
});

socket.on('signal', async (signal) => {
    if (!localConnection) return;
    if (signal.type === 'offer') {
        await localConnection.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(answer);
        socket.emit('signal', { roomId, signal: localConnection.localDescription });
    } else if (signal.type === 'answer') {
        await localConnection.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
        await localConnection.addIceCandidate(new RTCIceCandidate(signal));
    }
});

socket.on('peer-disconnected', () => {
    updateConnectionStatus(false);
    appendSystemMessage('Peer disconnected. This room is now terminated.');
});

function setupWebRTC(isHost) {
    localConnection = new RTCPeerConnection(rtcConfig);

    localConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { roomId, signal: event.candidate });
        }
    };

    if (isHost) {
        dataChannel = localConnection.createDataChannel('chat-channel');
        bindDataChannelEvents();
    } else {
        localConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            bindDataChannelEvents();
        };
    }
}

function bindDataChannelEvents() {
    dataChannel.onopen = () => {
        updateConnectionStatus(true);
        socket.disconnect(); // Exit signaling pipeline once P2P locks in
    };
    dataChannel.onmessage = (e) => handleIncomingMessage(JSON.parse(e.data));
    dataChannel.onclose = () => updateConnectionStatus(false);
}

function updateConnectionStatus(isConnected) {
    if (isConnected) {
        statusIndicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]";
        chatTitle.innerText = "ROOM SECURED";
        peerStatus.innerText = "Direct P2P Data Pipeline Active";
        msgInput.removeAttribute('disabled');
        btnSend.removeAttribute('disabled');
        msgInput.placeholder = "Write message (press enter)...";
    } else {
        statusIndicator.className = "w-3 h-3 rounded-full bg-red-500";
        chatTitle.innerText = "ROOM TERMINATED";
        peerStatus.innerText = "Connection terminated";
        msgInput.setAttribute('disabled', 'true');
        btnSend.setAttribute('disabled', 'true');
    }
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const payloadText = msgInput.value.trim();
    if (!payloadText || !dataChannel || dataChannel.readyState !== 'open') return;

    const messageObj = { text: payloadText, timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    dataChannel.send(JSON.stringify(messageObj));
    
    appendMessage(messageObj, true);
    msgInput.value = '';
});

function handleIncomingMessage(msgData) { appendMessage(msgData, false); }

function appendMessage(msg, isSelf) {
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col max-w-xs md:max-w-md ${isSelf ? 'self-end items-end' : 'self-start items-start'}`;
    
    const bubble = document.createElement('div');
    bubble.className = `px-4 py-2.5 rounded-2xl text-sm shadow-md ${isSelf ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-gray-900 font-medium rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none'}`;
    bubble.innerText = msg.text;

    const meta = document.createElement('span');
    meta.className = "text-[10px] text-gray-500 mt-1 px-1";
    meta.innerText = `${isSelf ? 'You' : 'Peer'} • ${msg.timestamp}`;

    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);
    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendSystemMessage(text) {
    const infoNode = document.createElement('div');
    infoNode.className = "mx-auto bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-300 max-w-sm text-center animate-pulse";
    infoNode.innerText = `🚨 ${text}`;
    messagesContainer.appendChild(infoNode);
}
