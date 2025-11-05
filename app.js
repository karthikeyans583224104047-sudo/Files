// Import Firebase v9 modular SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBUrTuOkm3wre0W_h_R2vR7pGvNNf3fCHY",
    authDomain: "files-6ab6b.firebaseapp.com",
    projectId: "files-6ab6b",
    storageBucket: "files-6ab6b.firebasestorage.app",
    messagingSenderId: "989063158949",
    appId: "1:989063158949:web:11802f7f057865bd98014c",
    measurementId: "G-V3WH13DXJQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class FirebaseFileShare {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.currentRoom = null;
        this.isInitiator = false;
        this.roomUnsubscribe = null;
        this.currentFile = null;
        this.transferStartTime = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.updateStatus('Ready to connect');
        this.showNotification('App loaded successfully!', 'success');
        console.log('🔥 Firebase v9 initialized successfully');
    }

    setupEventListeners() {
        // Room management
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
            if (roomId) {
                this.joinRoom(roomId);
            } else {
                this.showNotification('Please enter a room ID', 'error');
            }
        });

        document.getElementById('leaveRoomBtn').addEventListener('click', () => {
            this.leaveRoom();
        });

        // File and message handling
        document.getElementById('attachBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                this.handleFilesSelection(files);
            }
        });

        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Handle drag and drop
        this.setupDragAndDrop();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    setupDragAndDrop() {
        const messageContainer = document.getElementById('messages');
        
        messageContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            messageContainer.style.backgroundColor = '#f8f9fa';
        });

        messageContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            messageContainer.style.backgroundColor = '';
        });

        messageContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            messageContainer.style.backgroundColor = '';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFilesSelection(files);
            }
        });
    }

    async createRoom() {
        try {
            const roomId = this.generateRoomId();
            this.currentRoom = roomId;
            this.isInitiator = true;
            
            // Create room in Firestore
            await setDoc(doc(db, 'rooms', roomId), {
                createdAt: serverTimestamp(),
                createdBy: 'user',
                status: 'waiting',
                initiatorConnected: true
            });
            
            this.listenToRoom(roomId);
            this.showChatInterface();
            this.updateStatus(`Room created: ${roomId}`);
            this.showNotification(`Room ${roomId} created! Share this ID with your friend.`, 'success');
            
            this.addMessage(`You created room: ${roomId}`, 'info');
            this.addMessage('Waiting for someone to join...', 'info');
            
        } catch (error) {
            console.error('Error creating room:', error);
            this.showNotification('Error creating room. Please try again.', 'error');
        }
    }

    async joinRoom(roomId) {
        try {
            const roomRef = doc(db, 'rooms', roomId);
            const roomDoc = await getDoc(roomRef);
            
            if (!roomDoc.exists()) {
                this.showNotification('Room not found! Please check the room ID.', 'error');
                return;
            }
            
            this.currentRoom = roomId;
            this.isInitiator = false;
            
            // Update room status
            await updateDoc(roomRef, {
                participantJoined: true,
                status: 'connected',
                participantConnected: true
            });
            
            // Notify the initiator that someone joined
            await addDoc(collection(db, 'rooms', roomId, 'signaling'), {
                type: 'user-joined',
                timestamp: serverTimestamp(),
                sender: 'participant'
            });
            
            this.listenToRoom(roomId);
            this.showChatInterface();
            this.updateStatus(`Joined room: ${roomId}`);
            this.showNotification(`Successfully joined room ${roomId}`, 'success');
            
            this.addMessage(`You joined room: ${roomId}`, 'info');
            this.addMessage('Connecting to room creator...', 'info');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Error joining room. Please try again.', 'error');
        }
    }

    listenToRoom(roomId) {
        // Clean up previous listener if exists
        if (this.roomUnsubscribe) {
            this.roomUnsubscribe();
        }

        // Listen for WebRTC signaling messages
        const signalingQuery = query(
            collection(db, 'rooms', roomId, 'signaling'),
            orderBy('timestamp')
        );

        this.roomUnsubscribe = onSnapshot(signalingQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    this.handleSignalingMessage(data);
                    
                    // Delete the message after processing to keep Firestore clean
                    deleteDoc(change.doc.ref).catch(console.error);
                }
            });
        }, (error) => {
            console.error('Firestore listen error:', error);
            this.showNotification('Connection error. Please refresh.', 'error');
        });
    }

    async sendSignalingMessage(message) {
        if (!this.currentRoom) return;
        
        try {
            await addDoc(collection(db, 'rooms', this.currentRoom, 'signaling'), {
                ...message,
                timestamp: serverTimestamp(),
                sender: this.isInitiator ? 'initiator' : 'participant'
            });
        } catch (error) {
            console.error('Error sending signaling message:', error);
        }
    }

    async handleSignalingMessage(data) {
        // Only process messages from the other peer
        if (data.sender === (this.isInitiator ? 'initiator' : 'participant')) {
            return;
        }

        console.log('Processing signaling message:', data.type);

        try {
            switch (data.type) {
                case 'offer':
                    await this.handleOffer(data.offer);
                    break;
                case 'answer':
                    await this.handleAnswer(data.answer);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(data.candidate);
                    break;
                case 'user-joined':
                    if (this.isInitiator) {
                        this.showNotification('Friend joined the room!', 'success');
                        this.addMessage('Friend joined the room! Creating connection...', 'success');
                        await this.createPeerConnection();
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling signaling message:', error);
            this.showNotification('Connection error occurred', 'error');
        }
    }

    async createPeerConnection() {
        try {
            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' }
                ]
            };

            this.peerConnection = new RTCPeerConnection(configuration);

            // Set up data channel if we're the initiator
            if (this.isInitiator) {
                this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                    ordered: true
                });
                this.setupDataChannel();
            }

            // Listen for incoming data channel
            this.peerConnection.ondatachannel = (event) => {
                console.log('Data channel received!');
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                }
            };

            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('Connection state:', state);
                this.updateStatus(`Connection: ${state}`);
                
                if (state === 'connected') {
                    this.showNotification('Direct connection established!', 'success');
                } else if (state === 'disconnected' || state === 'failed') {
                    this.showNotification('Connection lost', 'error');
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            };

            // Create and send offer if we're the initiator
            if (this.isInitiator) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.sendSignalingMessage({
                    type: 'offer',
                    offer: offer
                });
                
                this.updateStatus('Connection offer sent');
            }
        } catch (error) {
            console.error('Error creating peer connection:', error);
            this.showNotification('Error creating connection', 'error');
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('Data channel opened!');
            this.updateStatus('Connected! Ready to share files.');
            this.addMessage('Direct connection established! 🎉 You can now send files and messages.', 'success');
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleIncomingData(data);
            } catch (error) {
                console.error('Error parsing incoming data:', error);
            }
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.updateStatus('Connection closed');
            this.addMessage('Connection closed', 'info');
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.showNotification('Connection error occurred', 'error');
        };
    }

    async handleOffer(offer) {
        if (!this.peerConnection) {
            await this.createPeerConnection();
        }

        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.sendSignalingMessage({
            type: 'answer',
            answer: answer
        });
        
        this.updateStatus('Connection answer sent');
    }

    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(answer);
        this.updateStatus('Connection established!');
    }

    async handleIceCandidate(candidate) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(candidate);
        }
    }

    handleFilesSelection(files) {
        if (!files || files.length === 0) return;

        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            this.showNotification('Please wait for connection to be established first!', 'error');
            return;
        }

        // Show file info
        const fileInfo = document.getElementById('fileInfo');
        if (files.length === 1) {
            fileInfo.textContent = `Selected: ${files[0].name} (${this.formatFileSize(files[0].size)})`;
        } else {
            fileInfo.textContent = `Selected: ${files.length} files`;
        }

        // Send files
        for (let file of files) {
            this.sendFile(file);
        }

        // Clear file input
        document.getElementById('fileInput').value = '';
    }

    sendFile(file) {
        const CHUNK_SIZE = 16 * 1024; // 16KB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let currentChunk = 0;
        let bytesTransferred = 0;

        const fileInfo = {
            type: 'file-start',
            name: file.name,
            size: file.size,
            totalChunks: totalChunks,
            mimeType: file.type,
            timestamp: Date.now()
        };

        // Send file metadata first
        this.dataChannel.send(JSON.stringify(fileInfo));
        this.transferStartTime = Date.now();
        this.showProgress(file.name, 0, file.size, 0);
        
        this.addMessage(`Sending: ${file.name} (${this.formatFileSize(file.size)})`, 'sent');

        const readNextChunk = () => {
            if (currentChunk >= totalChunks) {
                const transferTime = (Date.now() - this.transferStartTime) / 1000;
                this.addMessage(`File sent: ${file.name} (${transferTime.toFixed(1)}s)`, 'info');
                setTimeout(() => this.hideProgress(), 2000);
                return;
            }

            const start = currentChunk * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    this.dataChannel.send(JSON.stringify({
                        type: 'file-chunk',
                        chunk: Array.from(new Uint8Array(e.target.result)),
                        chunkIndex: currentChunk
                    }));

                    currentChunk++;
                    bytesTransferred += (end - start);
                    const progress = (currentChunk / totalChunks) * 100;
                    
                    // Calculate speed
                    const elapsedTime = (Date.now() - this.transferStartTime) / 1000;
                    const speed = elapsedTime > 0 ? bytesTransferred / elapsedTime : 0;
                    
                    this.showProgress(file.name, progress, file.size, speed);
                    
                    // Use setTimeout to avoid blocking UI
                    setTimeout(readNextChunk, 0);
                } catch (error) {
                    console.error('Error sending chunk:', error);
                    this.hideProgress();
                    this.showNotification('Error sending file. Connection may be lost.', 'error');
                }
            };
            reader.onerror = () => {
                console.error('Error reading file chunk');
                this.hideProgress();
                this.showNotification('Error reading file', 'error');
            };
            reader.readAsArrayBuffer(chunk);
        };

        readNextChunk();
    }

    handleIncomingData(data) {
        switch (data.type) {
            case 'file-start':
                this.receiveFile(data);
                break;
            case 'file-chunk':
                this.receiveFileChunk(data);
                break;
            case 'message':
                this.addMessage(data.text, 'received');
                break;
        }
    }

    receiveFile(fileInfo) {
        this.currentFile = {
            name: fileInfo.name,
            size: fileInfo.size,
            totalChunks: fileInfo.totalChunks,
            receivedChunks: 0,
            chunks: new Array(fileInfo.totalChunks),
            mimeType: fileInfo.mimeType,
            startTime: Date.now(),
            bytesReceived: 0
        };

        this.showProgress(fileInfo.name, 0, fileInfo.size, 0);
        this.addMessage(`Receiving: ${fileInfo.name} (${this.formatFileSize(fileInfo.size)})`, 'received');
    }

    receiveFileChunk(chunkData) {
        if (!this.currentFile) return;

        this.currentFile.chunks[chunkData.chunkIndex] = new Uint8Array(chunkData.chunk);
        this.currentFile.receivedChunks++;
        this.currentFile.bytesReceived += chunkData.chunk.length;

        const progress = (this.currentFile.receivedChunks / this.currentFile.totalChunks) * 100;
        
        // Calculate receive speed
        const elapsedTime = (Date.now() - this.currentFile.startTime) / 1000;
        const speed = elapsedTime > 0 ? this.currentFile.bytesReceived / elapsedTime : 0;
        
        this.showProgress(this.currentFile.name, progress, this.currentFile.size, speed);

        if (this.currentFile.receivedChunks === this.currentFile.totalChunks) {
            this.completeFileReceive();
        }
    }

    completeFileReceive() {
        const fileData = new Blob(this.currentFile.chunks, { type: this.currentFile.mimeType });
        const receiveTime = (Date.now() - this.currentFile.startTime) / 1000;
        
        this.downloadFile(fileData, this.currentFile.name);
        
        this.addMessage(`Received: ${this.currentFile.name} (${receiveTime.toFixed(1)}s)`, 'success');
        this.showNotification(`File received: ${this.currentFile.name}`, 'success');
        
        setTimeout(() => this.hideProgress(), 2000);
        this.currentFile = null;
    }

    downloadFile(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text) return;

        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'message',
                text: text
            }));
            this.addMessage(text, 'sent');
            input.value = '';
        } else {
            this.showNotification('Please establish a connection first!', 'error');
        }
    }

    addMessage(text, type) {
        const messagesContainer = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showProgress(fileName, percentage, totalSize, speed) {
        const container = document.getElementById('progressContainer');
        const fill = document.getElementById('progressFill');
        const fileNameElement = document.getElementById('progressFileName');
        const percentElement = document.getElementById('progressPercent');
        const statsElement = document.getElementById('progressStats');
        const speedElement = document.getElementById('progressSpeed');

        container.classList.remove('hidden');
        fileNameElement.textContent = fileName;
        fill.style.width = `${percentage}%`;
        percentElement.textContent = `${Math.round(percentage)}%`;
        
        const transferred = (percentage / 100) * totalSize;
        statsElement.textContent = `${this.formatFileSize(transferred)} / ${this.formatFileSize(totalSize)}`;
        speedElement.textContent = speed > 0 ? `${this.formatFileSize(speed)}/s` : '-';
    }

    hideProgress() {
        document.getElementById('progressContainer').classList.add('hidden');
        document.getElementById('fileInfo').textContent = '';
    }

    showChatInterface() {
        document.getElementById('connectionModal').classList.remove('active');
        document.getElementById('chat-container').classList.remove('hidden');
        document.getElementById('currentRoomId').textContent = this.currentRoom;
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    updateStatus(text) {
        document.getElementById('connectionStatus').textContent = text;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    leaveRoom() {
        this.cleanup();
        document.getElementById('chat-container').classList.add('hidden');
        document.getElementById('connectionModal').classList.add('active');
        document.getElementById('messages').innerHTML = `
            <div class="welcome-message">
                <h3>Connection Established! 🎉</h3>
                <p>You can now send files and messages directly to your friend.</p>
            </div>`;
        document.getElementById('roomIdInput').value = '';
        this.updateStatus('Disconnected');
        this.showNotification('Left the room', 'info');
    }

    cleanup() {
        // Clean up Firestore listeners
        if (this.roomUnsubscribe) {
            this.roomUnsubscribe();
        }
        
        // Clean up room document
        if (this.currentRoom) {
            deleteDoc(doc(db, 'rooms', this.currentRoom)).catch(error => 
                console.error('Error cleaning up room:', error)
            );
        }
        
        // Close data channel
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        
        this.currentRoom = null;
        this.isInitiator = false;
    }
}

// Initialize the app when page loads
window.addEventListener('load', () => {
    window.fileShareApp = new FirebaseFileShare();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.fileShareApp) {
        window.fileShareApp.cleanup();
    }
});