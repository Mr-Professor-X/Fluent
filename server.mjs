import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer(handle);
const io = new Server(httpServer, { cors: { origin: process.env.NEXT_PUBLIC_APP_URL ?? true }, maxHttpBufferSize: 1e6 });

/** socket.id -> { conversationId, userId } for sockets that passed the membership check */
const members = new Map();
const room = (conversationId) => `conversation:${conversationId}`;

/** Ask the Next.js API whether this user belongs to the conversation (membership lives there). */
async function authorize(userId, conversationId) {
  try {
    const response = await fetch(`http://localhost:${port}/api/conversations/${encodeURIComponent(conversationId)}/messages`, { headers: { 'x-fluid-user-id': userId } });
    return response.ok;
  } catch {
    return false;
  }
}

io.use((socket, nextMiddleware) => {
  const userId = socket.handshake.auth?.userId;
  if (typeof userId !== 'string' || !/^[a-z0-9-]{2,64}$/i.test(userId)) return nextMiddleware(new Error('Unauthorized'));
  socket.data.userId = userId;
  nextMiddleware();
});

io.on('connection', (socket) => {
  socket.on('call:join', async (payload, ack = () => {}) => {
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string' || !(await authorize(socket.data.userId, conversationId))) {
      socket.emit('call:error', { code: 'FORBIDDEN', message: 'You are not a member of this room.' });
      return ack({ ok: false, error: 'Forbidden' });
    }
    socket.join(room(conversationId));
    members.set(socket.id, { conversationId, userId: socket.data.userId });
    socket.to(room(conversationId)).emit('participant:joined', { userId: socket.data.userId });
    ack({ ok: true });
  });

  socket.on('call:leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));

  /** A finished spoken sentence or a typed chat message. Translated per recipient, then fanned out. */
  socket.on('line:send', async (payload) => {
    const member = members.get(socket.id);
    const { conversationId, text, sourceLanguage, kind } = payload ?? {};
    if (!member || member.conversationId !== conversationId) return socket.emit('call:error', { code: 'FORBIDDEN', message: 'Join the room first.' });
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) return;

    let result;
    try {
      const response = await fetch(`http://localhost:${port}/api/realtime/transcript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fluid-user-id': member.userId },
        body: JSON.stringify({ conversationId, text, sourceLanguage }),
      });
      if (!response.ok) throw new Error(await response.text());
      result = await response.json();
    } catch (error) {
      console.error('line:send failed', error);
      return socket.emit('call:error', { code: 'LINE_FAILED', message: 'That message could not be processed. Please try again.' });
    }

    const base = {
      id: result.messageId,
      kind: kind === 'speech' ? 'speech' : 'chat',
      speakerId: member.userId,
      speakerName: result.speakerName,
      sourceLanguage: result.sourceLanguage,
      original: result.originalText,
      createdAt: new Date().toISOString(),
    };
    const byUser = new Map(result.recipients.map((r) => [r.userId, r]));

    for (const [socketId, other] of members) {
      if (other.conversationId !== conversationId) continue;
      if (other.userId === member.userId) {
        io.to(socketId).emit('line:new', { ...base, mine: true, translated: base.original, targetLanguage: base.sourceLanguage, translationFailed: false });
        continue;
      }
      const recipient = byUser.get(other.userId);
      if (!recipient) continue;
      io.to(socketId).emit('line:new', { ...base, mine: false, translated: recipient.text, targetLanguage: recipient.targetLanguage, translationFailed: recipient.translationFailed });
    }
  });

  /** WebRTC signalling for the optional camera link. Relayed only inside the room. */
  socket.on('rtc:signal', (payload) => {
    const member = members.get(socket.id);
    if (!member || member.conversationId !== payload?.conversationId) return;
    socket.to(room(member.conversationId)).emit('rtc:signal', { from: member.userId, signal: payload.signal });
  });
});

function leave(socket) {
  const member = members.get(socket.id);
  if (!member) return;
  members.delete(socket.id);
  socket.to(room(member.conversationId)).emit('participant:left', { userId: member.userId });
  socket.leave(room(member.conversationId));
}

httpServer.listen(port, () => console.log(`Fluid is running on http://localhost:${port}`));
