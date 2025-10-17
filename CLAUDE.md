# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NodeCrypt is an end-to-end encrypted real-time chat system with zero-knowledge architecture. The server acts as a blind relay, forwarding encrypted messages without the ability to decrypt them. All encryption and decryption happens on the client side.

**Tech Stack:**
- Frontend: Vanilla ES6+ JavaScript (no frameworks), modular architecture
- Backend: Cloudflare Workers + Durable Objects
- Communication: WebSocket (real-time bidirectional)
- Build: Vite 6.x with Terser minification
- Cryptography: Web Crypto API, elliptic.js, aes-js, js-chacha20, js-sha256

## Common Commands

### Development
```bash
npm run dev          # Start local dev server with Wrangler
```

### Build & Deploy
```bash
npm run build        # Build client assets with Vite
npm run deploy       # Deploy to Cloudflare Workers (build + publish)
npm run publish      # Alias for deploy
```

### Docker (not recommended)
```bash
npm run build:docker # Build for Docker deployment
```

## Architecture Overview

### Client-Side Architecture

The client is organized into modular ES6 modules in `client/js/`:

**Core Modules:**
- `NodeCrypt.js` - Core cryptographic client handling all encryption/decryption and WebSocket communication
- `main.js` - Application entry point, event handlers, and module initialization
- `room.js` - Room management (multi-room support, room switching, member tracking)
- `chat.js` - Chat UI rendering (messages, bubbles, image preview, file display)
- `ui.js` - UI components (headers, user lists, modals, tabs, login forms)

**Utility Modules:**
- `util.file.js` - File transfer (chunked sending/receiving, compression, progress tracking)
- `util.image.js` - Image paste/preview functionality
- `util.emoji.js` - Emoji picker integration
- `util.avatar.js` - Avatar generation using @dicebear
- `util.theme.js` - Theme switching (light/dark)
- `util.i18n.js` - Internationalization (Chinese/English)
- `util.settings.js` - Settings panel and notifications
- `util.string.js` - String utilities (escaping, text-to-HTML conversion)
- `util.dom.js` - DOM manipulation helpers

### Backend Architecture

Located in `worker/`:
- `index.js` - Main entry point with two exports:
  - Default export: Worker request handler (WebSocket upgrade, static asset serving)
  - `ChatRoom` class: Durable Object managing real-time chat rooms

**Durable Objects Design:**
- Single `ChatRoom` Durable Object handles all connections
- In-memory state only (no persistent storage except for RSA key pairs)
- RSA key pairs rotate every 24 hours
- Client connections stored in `this.clients` (plain object, not Map)
- Channels stored in `this.channels` (plain object, not Map)

### Build Configuration

`vite.config.js`:
- Root directory: `client/`
- Output directory: `dist/`
- Manual chunking strategy:
  - `crypto-libs` chunk: aes-js, elliptic, js-chacha20, js-sha256
  - `vendor-deps` chunk: other node_modules dependencies
- Dependencies optimized: buffer, crypto libraries, @dicebear

`wrangler.toml`:
- Static assets served from `dist/` directory
- SPA fallback handling enabled
- Durable Object binding: `CHAT_ROOM` → `ChatRoom` class

## Cryptographic Architecture

**Three-Layer Security:**

1. **Layer 1: RSA-2048 Server Authentication**
   - Server generates temporary RSA-2048 key pair (rotated every 24 hours)
   - Client verifies server public key to prevent MITM attacks
   - Private key stored in memory only (persisted in Durable Object storage)

2. **Layer 2: ECDH-P384 Key Exchange (Client ↔ Server)**
   - Each client generates P-384 ECDH key pair
   - Shared secret derived for client-server communication
   - AES-256-CBC encrypts control messages between client and server

3. **Layer 3: Curve25519 Key Exchange (Client ↔ Client)**
   - Each client pair generates Curve25519 ECDH keys
   - Shared secret XORed with SHA256(room password) for password-enhanced encryption
   - ChaCha20 encrypts actual chat messages between clients

**Key Files:**
- `client/js/NodeCrypt.js` - Client-side encryption logic (lines 1-625)
- `worker/index.js` - Server-side key management and encrypted message relay (lines 26-479)
- `worker/utils.js` - Server-side encryption utilities

## Development Guidelines

### Client-Side Development

**Message Flow:**
1. User sends message → `main.js` handles input
2. Message encrypted with target-specific keys in `NodeCrypt.js`
3. Encrypted payload sent via WebSocket
4. Response decrypted and passed to callbacks
5. `room.js` updates room state
6. `chat.js` renders message bubbles

**Adding New Features:**
- Keep modules focused and single-purpose
- Export functions explicitly (no default exports except NodeCrypt class)
- Use `$id()` for getElementById, `$()` for querySelector (from `util.dom.js`)
- Add translations to `util.i18n.js` for both English and Chinese
- Use `escapeHTML()` from `util.string.js` for all user-generated content

**File Transfer:**
- Files are chunked (default 256KB per volume) and sent as base64
- Each chunk sent as separate `file_volume` message
- Progress tracked in `window.fileTransfers` Map
- Archives (.zip) automatically created for multiple files using fflate

### Backend Development

**Worker Conventions:**
- Use plain objects `{}` instead of `Map()` for clients/channels (performance)
- Message actions use single-letter codes: `'j'` (join), `'c'` (client), `'w'` (channel), `'l'` (list)
- All client messages encrypted twice: ChaCha20 (client-to-client) + AES-256 (client-to-server)
- Server only decrypts outer AES layer, never inner ChaCha20 layer

**Durable Object State:**
- `this.clients[clientId]` - Connection, shared key, channel membership
- `this.channels[channel]` - Array of client IDs in each channel
- `this.keyPair` - Server RSA keys (rotated periodically)

**Security Considerations:**
- Server never has access to room passwords or client-to-client encryption keys
- Connection cleanup runs automatically (60-second timeout)
- No message history stored (ephemeral by design)

## Important Conventions

### Code Style
- ES6+ modules with explicit imports/exports
- Comments in both English and Chinese
- Consistent naming: camelCase for functions, PascalCase for classes
- Event handlers bound in constructor (see `NodeCrypt.js` lines 52-72)

### Message Types
- `text` / `text_private` - Plain text messages
- `image` / `image_private` - Image messages (supports multiple images + text)
- `file_start` / `file_start_private` - File transfer initiation
- `file_volume` / `file_volume_private` - File chunk transfer
- `file_end` / `file_end_private` - File transfer completion
- System messages use `addSystemMsg()` for join/leave notifications

### Private Chat
- Triggered by clicking user avatar in user list
- `rd.privateChatTargetId` and `rd.privateChatTargetName` track private chat state
- Messages encrypted with target-specific shared key, then relayed through server
- Only sender and recipient can decrypt private messages

## Testing

No automated test suite currently exists. Manual testing workflow:
1. Run `npm run dev` for local development
2. Open multiple browser tabs to simulate multiple clients
3. Test encryption by joining same room with different passwords (should fail to decrypt)
4. Use browser DevTools Network tab to verify all WebSocket messages are encrypted
5. Check Console for debug logs when `window.config.debug = true`
