import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev }); const handle = app.getRequestHandler();
await app.prepare();
const httpServer = createServer(handle); const io = new Server(httpServer, { cors: { origin: process.env.NEXT_PUBLIC_APP_URL ?? true } });
const port = Number(process.env.PORT ?? 3000); const members = new Map();
async function authorize(userId, conversationId) { const response = await fetch(`http://localhost:${port}/api/conversations/${encodeURIComponent(conversationId)}/messages`, { headers: { 'x-fluid-user-id': userId } }); return response.ok; }
io.use((socket, nextMiddleware) => { const userId = socket.handshake.auth?.userId; if (typeof userId !== 'string' || !/^[a-z0-9-]{2,64}$/i.test(userId)) return nextMiddleware(new Error('Unauthorized')); socket.data.userId = userId; nextMiddleware(); });
io.on('connection', socket => {
  socket.on('call:join', async ({ conversationId }, ack = () => {}) => { if (typeof conversationId !== 'string' || !(await authorize(socket.data.userId, conversationId))) { socket.emit('call:error', { code: 'FORBIDDEN' }); return ack({ ok:false,error:'Forbidden' }); } socket.join(`conversation:${conversationId}`); socket.data.conversationId = conversationId; members.set(socket.id, { conversationId, userId: socket.data.userId }); socket.to(`conversation:${conversationId}`).emit('participant:joined', { userId: socket.data.userId }); ack({ ok:true }); });
  socket.on('call:leave', () => leave(socket));
  for (const name of ['webrtc:offer','webrtc:answer','webrtc:ice-candidate']) socket.on(name, async ({ conversationId, targetId, ...payload }) => { const sender = members.get(socket.id); if (!sender || sender.conversationId !== conversationId || !await authorize(socket.data.userId, conversationId)) return socket.emit('call:error',{code:'FORBIDDEN'}); const recipient = [...members.entries()].find(([, value]) => value.conversationId === conversationId && value.userId === targetId); if (recipient) io.to(recipient[0]).emit(name, { from: socket.data.userId, ...payload }); });
  socket.on('speech:start', ({ conversationId }) => relay(socket, conversationId, 'speech:start', { speakerId: socket.data.userId }));
  socket.on('speech:partial', ({ conversationId, text, sourceLanguage }) => relay(socket, conversationId, 'speech:partial', { speakerId: socket.data.userId, text, sourceLanguage }));
  socket.on('speech:final', async ({ conversationId, text, sourceLanguage }) => { if (!await inRoom(socket, conversationId)) return; const response = await fetch(`http://localhost:${port}/api/realtime/transcript`, { method:'POST', headers:{'content-type':'application/json','x-fluid-user-id':socket.data.userId}, body:JSON.stringify({ conversationId,text,sourceLanguage }) }); if (!response.ok) return socket.emit('call:error',{code:'TRANSCRIPT_PROCESSING_FAILED'}); const result = await response.json(); io.to(`conversation:${conversationId}`).emit('speech:final', { speakerId:socket.data.userId, messageId:result.messageId, text:result.originalText, sourceLanguage:result.sourceLanguage, timestamp:Date.now() }); for (const recipient of result.recipients) for (const [id, member] of members) if (member.conversationId === conversationId && member.userId === recipient.userId) { io.to(id).emit('translation:complete',{messageId:result.messageId,text:recipient.text,targetLanguage:recipient.targetLanguage}); if (recipient.tts) io.to(id).emit('tts:start',{messageId:result.messageId,text:recipient.text,voiceId:recipient.voiceId}); } });
  socket.on('disconnect', () => leave(socket));
});
function leave(socket) { const member = members.get(socket.id); if (!member) return; socket.to(`conversation:${member.conversationId}`).emit('participant:left', { userId: member.userId }); members.delete(socket.id); socket.leave(`conversation:${member.conversationId}`); }
async function inRoom(socket, conversationId) { const member = members.get(socket.id); return member?.conversationId === conversationId && await authorize(socket.data.userId, conversationId); }
async function relay(socket, conversationId, event, payload) { if (await inRoom(socket, conversationId)) socket.to(`conversation:${conversationId}`).emit(event, payload); else socket.emit('call:error',{code:'FORBIDDEN'}); }
httpServer.listen(port, () => console.log(`Fluid Socket.IO server listening on http://localhost:${port}`));
