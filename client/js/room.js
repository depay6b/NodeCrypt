// Room management logic for NodeCrypt web client
// NodeCrypt 网页客户端的房间管理逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	renderChatArea,
	addSystemMsg,
	updateChatInputStyle
} from './chat.js';
import {
	renderMainHeader,
	renderUserList
} from './ui.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id,
	createElement
} from './util.dom.js';
import { t } from './util.i18n.js';
let roomsData = [];
let activeRoomIndex = -1;

// Get history retention time from settings
// 从设置中获取历史消息保留时间
function getHistoryRetention() {
	try {
		const settings = localStorage.getItem('settings');
		if (settings) {
			const parsed = JSON.parse(settings);
			return parsed.historyRetention || (24 * 60 * 60 * 1000); // Default 24 hours
		}
	} catch (e) {
		console.error('Error reading history retention setting:', e);
	}
	return 24 * 60 * 60 * 1000; // Default 24 hours
}

// Save room state to localStorage
// 保存房间状态到 localStorage
export function saveRoomState(roomName, userName, password) {
	try {
		const roomState = {
			roomName,
			userName,
			password,
			timestamp: Date.now()
		};
		localStorage.setItem('nodecrypt_room_state', JSON.stringify(roomState));
	} catch (e) {
		console.error('Error saving room state:', e);
	}
}

// Load room state from localStorage
// 从 localStorage 恢复房间状态
export function loadRoomState() {
	try {
		const stored = localStorage.getItem('nodecrypt_room_state');
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (e) {
		console.error('Error loading room state:', e);
	}
	return null;
}

// Clear room state from localStorage
// 从 localStorage 清除房间状态
export function clearRoomState() {
	try {
		localStorage.removeItem('nodecrypt_room_state');
	} catch (e) {
		console.error('Error clearing room state:', e);
	}
}

// Save room messages to localStorage
// 保存房间历史消息到 localStorage
export function saveRoomMessages(roomName, messages) {
	try {
		const retention = getHistoryRetention();
		const messageData = {
			roomName,
			messages,
			timestamp: Date.now(),
			expiresAt: Date.now() + retention
		};
		const key = `nodecrypt_messages_${roomName}`;
		localStorage.setItem(key, JSON.stringify(messageData));
	} catch (e) {
		console.error('Error saving room messages:', e);
	}
}

// Load room messages from localStorage
// 从 localStorage 恢复房间历史消息
export function loadRoomMessages(roomName) {
	try {
		const key = `nodecrypt_messages_${roomName}`;
		const stored = localStorage.getItem(key);
		if (stored) {
			const messageData = JSON.parse(stored);
			// Check if messages have expired
			// 检查消息是否已过期
			if (messageData.expiresAt && messageData.expiresAt > Date.now()) {
				return messageData.messages || [];
			} else {
				// Messages expired, remove them
				// 消息已过期，删除它们
				localStorage.removeItem(key);
			}
		}
	} catch (e) {
		console.error('Error loading room messages:', e);
	}
	return [];
}

// Clear room messages from localStorage
// 从 localStorage 清除房间历史消息
export function clearRoomMessages(roomName) {
	try {
		const key = `nodecrypt_messages_${roomName}`;
		localStorage.removeItem(key);
	} catch (e) {
		console.error('Error clearing room messages:', e);
	}
}

// Auto-save messages with throttling to avoid excessive saves
// 使用节流自动保存消息，避免过度保存
let saveTimeouts = {}; // Store timeouts for each room
// 为每个房间存储超时句柄

export function autoSaveRoomMessages(roomName, messages) {
	// Clear existing timeout for this room
	// 清除该房间的现有超时
	if (saveTimeouts[roomName]) {
		clearTimeout(saveTimeouts[roomName]);
	}

	// Set new timeout to save after 2 seconds
	// 设置新的超时，2秒后保存
	saveTimeouts[roomName] = setTimeout(() => {
		saveRoomMessages(roomName, messages);
		delete saveTimeouts[roomName];
	}, 2000);
}

// Upload message to server (with encryption)
// 上传消息到服务器（带加密）
export async function uploadMessageToServer(roomName, message) {
	try {
		const response = await fetch('/api/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				channel: roomName,
				message: message
			})
		});

		const data = await response.json();
		if (!data.ok) {
			console.error('Failed to upload message:', data.error);
		}
	} catch (error) {
		console.error('Error uploading message to server:', error);
	}
}

// Download messages from server
// 从服务器下载消息
export async function downloadMessagesFromServer(roomName, limit = 100) {
	try {
		const response = await fetch(`/api/messages/${encodeURIComponent(roomName)}?limit=${limit}`);
		const data = await response.json();

		if (data.ok && data.messages) {
			return data.messages;
		}
		return [];
	} catch (error) {
		console.error('Error downloading messages from server:', error);
		return [];
	}
}

// Get a new room data object
// 获取一个新的房间数据对象
export function getNewRoomData() {
	return {
		roomName: '',
		userList: [],
		userMap: {},
		myId: null,
		myUserName: '',
		chat: null,
		messages: [],
		prevUserList: [],
		knownUserIds: new Set(),
		unreadCount: 0,
		privateChatTargetId: null,
		privateChatTargetName: null
	}
}

// Switch to another room by index
// 切换到指定索引的房间
export function switchRoom(index) {
	if (index < 0 || index >= roomsData.length) return;
	activeRoomIndex = index;
	const rd = roomsData[index];
	if (typeof rd.unreadCount === 'number') rd.unreadCount = 0;
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = rd.myUserName;
	setSidebarAvatar(rd.myUserName);
	renderRooms(index);
	renderMainHeader();
	renderUserList(false);
	renderChatArea();
	updateChatInputStyle()
}

// Set the sidebar avatar
// 设置侧边栏头像
export function setSidebarAvatar(userName) {
	if (!userName) return;
	const svg = createAvatarSVG(userName);
	const el = $id('sidebar-user-avatar');
	if (el) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		el.innerHTML = cleanSvg
	}
}

// Render the room list
// 渲染房间列表
export function renderRooms(activeId = 0) {
	const roomList = $id('room-list');
	roomList.innerHTML = '';
	roomsData.forEach((rd, i) => {
		const div = createElement('div', {
			class: 'room' + (i === activeId ? ' active' : ''),
			onclick: () => switchRoom(i)
		});
		const safeRoomName = escapeHTML(rd.roomName);
		let unreadHtml = '';
		if (rd.unreadCount && i !== activeId) {
			unreadHtml = `<span class="room-unread-badge">${rd.unreadCount>99?'99+':rd.unreadCount}</span>`
		}
		div.innerHTML = `<div class="info"><div class="title">#${safeRoomName}</div></div>${unreadHtml}`;
		roomList.appendChild(div)
	})
}

// Join a room
// 加入一个房间
export async function joinRoom(userName, roomName, password, modal = null, onResult) {
	const newRd = getNewRoomData();
	newRd.roomName = roomName;
	newRd.myUserName = userName;
	newRd.password = password;

	// Load historical messages if they exist
	// 加载历史消息（如果存在）
	const historicalMessages = loadRoomMessages(roomName);
	if (historicalMessages.length > 0) {
		newRd.messages = historicalMessages;
	}

	// Download messages from server and merge with local messages
	// 从服务器下载消息并与本地消息合并
	try {
		const serverMessages = await downloadMessagesFromServer(roomName, 100);
		if (serverMessages.length > 0) {
			// Merge server messages with local messages
			// 将服务器消息与本地消息合并
			const mergedMessages = [...newRd.messages];

			// Add server messages that are not in local messages
			// 添加不在本地消息中的服务器消息
			for (const serverMsg of serverMessages) {
				const isDuplicate = mergedMessages.some(localMsg =>
					localMsg.timestamp === serverMsg.timestamp &&
					JSON.stringify(localMsg.text) === JSON.stringify(serverMsg.text)
				);

				if (!isDuplicate) {
					mergedMessages.push(serverMsg);
				}
			}

			// Sort messages by timestamp
			// 按时间戳排序消息
			mergedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

			newRd.messages = mergedMessages;
		}
	} catch (error) {
		console.error('Error loading messages from server:', error);
		// Continue with local messages only if server download fails
		// 如果服务器下载失败，继续使用本地消息
	}

	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);
	let closed = false;
	const callbacks = {
		onServerClosed: () => {
			setStatus('Node connection closed');
			if (onResult && !closed) {
				closed = true;
				onResult(false)
			}
		},		onServerSecured: () => {
			if (modal) modal.remove();
			else {
				const loginContainer = $id('login-container');
				if (loginContainer) loginContainer.style.display = 'none';
				const chatContainer = $id('chat-container');
				if (chatContainer) chatContainer.style.display = '';


			}
			if (onResult && !closed) {
				closed = true;
				onResult(true)
			}
			// Save room state after successful connection
			// 成功连接后保存房间状态
			saveRoomState(roomName, userName, password);
			addSystemMsg(t('system.secured', 'connection secured'))
		},
		onClientSecured: (user) => handleClientSecured(idx, user),
		onClientList: (list, selfId) => handleClientList(idx, list, selfId),
		onClientLeft: (clientId) => handleClientLeft(idx, clientId),
		onClientMessage: (msg) => handleClientMessage(idx, msg)
	};
	const chatInst = new window.NodeCrypt(window.config, callbacks);
	chatInst.setCredentials(userName, roomName, password);
	chatInst.connect();
	roomsData[idx].chat = chatInst
}

// Handle the client list update
// 处理客户端列表更新
export function handleClientList(idx, list, selfId) {
	const rd = roomsData[idx];
	if (!rd) return;
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set(list.map(u => u.clientId));
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId)
		}
	}
	rd.userList = list;
	rd.userMap = {};
	list.forEach(u => {
		rd.userMap[u.clientId] = u
	});
	rd.myId = selfId;
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	rd.initCount = (rd.initCount || 0) + 1;
	if (rd.initCount === 2) {
		rd.isInitialized = true;
		rd.knownUserIds = new Set(list.map(u => u.clientId))
	}
}

// Handle client secured event
// 处理客户端安全连接事件
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd) return;
	rd.userMap[user.clientId] = user;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === user.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(user)
	} else {
		rd.userList[existingUserIndex] = user
	}
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	if (!rd.isInitialized) {
		return
	}
	const isNew = !rd.knownUserIds.has(user.clientId);
	if (isNew) {
		rd.knownUserIds.add(user.clientId);		const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
		const msg = `${name} ${t('system.joined', 'joined the conversation')}`;
		rd.messages.push({
			type: 'system',
			text: msg
		});
		// Auto-save messages after adding new message
		// 添加新消息后自动保存
		autoSaveRoomMessages(rd.roomName, rd.messages);

		if (activeRoomIndex === idx) addSystemMsg(msg, true);
		if (window.notifyMessage) {
			window.notifyMessage(rd.roomName, 'system', msg)
		}
	}
}

// Handle client left event
// 处理客户端离开事件
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	if (rd.privateChatTargetId === clientId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
		if (activeRoomIndex === idx) {
			updateChatInputStyle()
		}
	}
	const user = rd.userMap[clientId];
	const name = user ? (user.userName || user.username || user.name || 'Anonymous') : 'Anonymous';
	const msg = `${name} ${t('system.left', 'left the conversation')}`;
	rd.messages.push({
		type: 'system',
		text: msg
	});
	// Auto-save messages after adding new message
	// 添加新消息后自动保存
	autoSaveRoomMessages(rd.roomName, rd.messages);

	if (activeRoomIndex === idx) addSystemMsg(msg, true);
	rd.userList = rd.userList.filter(u => u.clientId !== clientId);
	delete rd.userMap[clientId];
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
}

// Handle client message event
// 处理客户端消息事件
export function handleClientMessage(idx, msg) {
	const newRd = roomsData[idx];
	if (!newRd) return;

	// Prevent processing own messages unless it's a private message sent to oneself
	if (msg.clientId === newRd.myId && msg.userName === newRd.myUserName && !msg.type.includes('_private')) {
		return;
	}

	let msgType = msg.type || 'text';

	// Handle file messages
	if (msgType.startsWith('file_')) {
		// Part 1: Update message history and send notifications (for 'file_start' type)
		if (msgType === 'file_start' || msgType === 'file_start_private') {
			let realUserName = msg.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			const historyMsgType = msgType === 'file_start_private' ? 'file_private' : 'file';
			
			const fileId = msg.data && msg.data.fileId;
			if (fileId) { // Only proceed if we have a fileId
				const messageAlreadyInHistory = newRd.messages.some(
					m => m.msgType === historyMsgType && m.text && m.text.fileId === fileId && m.userName === realUserName
				);

				if (!messageAlreadyInHistory) {
					newRd.messages.push({
						type: 'other',
						text: msg.data, // This is the file metadata object
						userName: realUserName,
						avatar: realUserName,
						msgType: historyMsgType,
						timestamp: (msg.data && msg.data.timestamp) || Date.now() 
					});
				}
			}

			const notificationMsgType = msgType.includes('_private') ? 'private file' : 'file';
			if (window.notifyMessage && msg.data && msg.data.fileName) {
				window.notifyMessage(newRd.roomName, notificationMsgType, `${msg.data.fileName}`, realUserName);
			}
		}

		// Part 2: Handle UI interaction (rendering in active room, or unread count in inactive room)
		if (activeRoomIndex === idx) {
			// If it's the active room, delegate to util.file.js to handle UI and file transfer state.
			// This applies to all file-related messages (file_start, file_volume, file_end, etc.)
			if (window.handleFileMessage) {
				window.handleFileMessage(msg.data, msgType.includes('_private'));
			}
		} else {
			// If it's not the active room, only increment unread count for 'file_start' messages.
			if (msgType === 'file_start' || msgType === 'file_start_private') {
				newRd.unreadCount = (newRd.unreadCount || 0) + 1;
				renderRooms(activeRoomIndex);
			}
		}
		return; // File messages are fully handled.
	}

	// Handle image messages (both new and legacy formats)
	if (msgType === 'image' || msgType === 'image_private') {
		// Already has correct type
	} else if (!msgType.includes('_private')) {
		// Handle legacy image detection
		if (msg.data && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
			msgType = 'image';
		} else if (msg.data && typeof msg.data === 'object' && msg.data.image) {
			msgType = 'image';
		}
	}
	let realUserName = msg.userName;
	if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
		realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
	}

	// Add message to messages array for chat history
	roomsData[idx].messages.push({
		type: 'other',
		text: msg.data,
		userName: realUserName,
		avatar: realUserName,
		msgType: msgType,
		timestamp: Date.now()
	});

	// Auto-save messages after adding new message
	// 添加新消息后自动保存
	autoSaveRoomMessages(newRd.roomName, newRd.messages);

	// Only add message to chat display if it's for the active room
	if (activeRoomIndex === idx) {
		if (window.addOtherMsg) {
			window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType);
		}
	} else {
		roomsData[idx].unreadCount = (roomsData[idx].unreadCount || 0) + 1;
		renderRooms(activeRoomIndex);
	}

	const notificationMsgType = msgType.includes('_private') ? `private ${msgType.split('_')[0]}` : msgType;
	if (window.notifyMessage) {
		window.notifyMessage(newRd.roomName, notificationMsgType, msg.data, realUserName);
	}
}

// Toggle private chat with a user
// 切换与某用户的私聊
export function togglePrivateChat(targetId, targetName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	if (rd.privateChatTargetId === targetId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null
	} else {
		rd.privateChatTargetId = targetId;
		rd.privateChatTargetName = targetName
	}
	renderUserList();
	updateChatInputStyle()
}


// Exit the current room
// 退出当前房间
export function exitRoom() {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];

		// Save messages before exiting
		// 退出前保存消息
		if (rd.messages && rd.messages.length > 0) {
			saveRoomMessages(rd.roomName, rd.messages);
		}

		// Disconnect chat instance
		// 断开聊天实例
		const chatInst = rd.chat;
		if (chatInst && typeof chatInst.destruct === 'function') {
			chatInst.destruct()
		} else if (chatInst && typeof chatInst.disconnect === 'function') {
			chatInst.disconnect()
		}

		rd.chat = null;
		roomsData.splice(activeRoomIndex, 1);

		// Clear room state if no more rooms
		// 如果没有更多房间，清除房间状态
		if (roomsData.length === 0) {
			clearRoomState();
		}

		if (roomsData.length > 0) {
			switchRoom(0);
			return true
		} else {
			return false
		}
	}
	return false
}

export { roomsData, activeRoomIndex };

// Listen for sidebar username update event
// 监听侧边栏用户名更新事件
window.addEventListener('updateSidebarUsername', () => {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];
		const sidebarUsername = document.getElementById('sidebar-username');
		if (sidebarUsername && rd.myUserName) {
			sidebarUsername.textContent = rd.myUserName;
		}
		// Also update the avatar to ensure consistency
		if (rd.myUserName) {
			setSidebarAvatar(rd.myUserName);
		}
	}
});