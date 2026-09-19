'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeClient } from '@/lib/realtime/client';
import { useFluidCall } from '@/lib/calls/use-fluid-call';

type Member = { name: string; initials: string; lang: string; color: string; status?: string };
type Message = { id: number; sender: string; initials: string; color: string; text: string; translated: string; time: string; incoming?: boolean };

const conversations = [
  { title: 'Maria Garcia', detail: 'Spanish · Last active now', initials: 'MG', color: '#3a9fcb', active: true },
  { title: 'Team Horizon', detail: '4 participants · Mixed languages', initials: 'TH', color: '#1f5a93' },
  { title: 'Jean Moreau', detail: 'French · Last active 1h ago', initials: 'JM', color: '#2a9bb8' }
];
const languageOptions = [['English','EN'], ['Español','ES'], ['Français','FR'], ['日本語','JA'], ['Deutsch','DE'], ['Português','PT']];

export default function Fluid() {
  const [active, setActive] = useState(0), [chatOpen, setChatOpen] = useState(true), [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true), [audio, setAudio] = useState(true), [showOriginal, setShowOriginal] = useState(true), [showTranslated, setShowTranslated] = useState(true);
  const [translateChat, setTranslateChat] = useState(true), [message, setMessage] = useState(''), [settings, setSettings] = useState(false), [groupModal, setGroupModal] = useState(false), [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, sender: 'Maria', initials: 'MG', color: '#3a9fcb', text: '¡Hola! ¿Cómo estás?', translated: 'Hi! How are you?', time: '10:41 AM', incoming: true },
    { id: 2, sender: 'You', initials: 'AL', color: '#2b77b3', text: 'I’m great! Are we still meeting at seven?', translated: 'Estoy genial. ¿Seguimos quedando a las siete?', time: '10:42 AM' },
    { id: 3, sender: 'Maria', initials: 'MG', color: '#3a9fcb', text: 'Sí, nos vemos en Lumen Café.', translated: 'Yes, see you at Lumen Café.', time: '10:42 AM', incoming: true }
  ]);
  const realtime = useRef<RealtimeClient | null>(null);
  const current = conversations[active];
  const members: Member[] = active === 1 ? [{ name: 'Alex', initials: 'AL', lang: 'English', color: '#2b77b3' }, { name: 'Maria', initials: 'MG', lang: 'Español', color: '#3a9fcb', status: 'Speaking' }, { name: 'Jean', initials: 'JM', lang: 'Français', color: '#2a9bb8' }, { name: 'Kenji', initials: 'KS', lang: '日本語', color: '#5d7fd1' }] : [{ name: 'Alex', initials: 'AL', lang: 'English', color: '#2b77b3' }, { name: 'Maria', initials: 'MG', lang: 'Español', color: '#3a9fcb', status: 'Speaking' }];
  const displayName = current.title === 'Maria Garcia' ? 'Maria' : current.title;
  const conversationId = active === 0 ? 'maria-direct' : active === 1 ? 'team-horizon' : 'maria-direct';
  const liveCall = useFluidCall(conversationId);
  useEffect(() => { realtime.current = new RealtimeClient(); return realtime.current.close.bind(realtime.current); }, []);
  useEffect(() => realtime.current?.subscribe(event => { if (event.type !== 'message:send' || event.conversationId !== conversationId) return; setNotice('New message received'); }) ?? (() => {}), [conversationId]);
  const addMessage = async () => { const text = message.trim(); if (!text) return; setMessage(''); try { const response = await fetch(`/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fluid-user-id': 'alex' }, body: JSON.stringify({ text, sourceLanguage: 'en' }) }); if (!response.ok) throw new Error(); const stored = await response.json() as { id:string; originalText:string; translatedText:string|null; createdAt:string }; setMessages(v => [...v, { id: Date.now(), sender: 'You', initials: 'AL', color: '#2b77b3', text: stored.originalText, translated: stored.translatedText ?? stored.originalText, time: 'Now' }]); realtime.current?.publish({ type: 'message:send', conversationId, text }); } catch { setMessage(text); setNotice('Message could not be sent. Your draft was restored.'); } };
  const toggle = (setter: (x:boolean)=>void, value: boolean, label: string) => { setter(!value); setNotice(`${label} ${!value ? 'enabled' : 'disabled'}`); };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 1800); return () => clearTimeout(timer); }, [notice]);
  return <main>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">f</span><span>fluid</span></div>
      <button className="new-conv" onClick={() => setGroupModal(true)}><span>＋</span> New conversation</button>
      <div className="side-label">RECENT</div>
      <nav>{conversations.map((c,i) => <button key={c.title} className={`conversation ${i===active?'selected':''}`} onClick={() => setActive(i)}><span className="mini-avatar" style={{background:c.color}}>{c.initials}</span><span><b>{c.title}</b><small>{c.detail}</small></span>{i===0 && <i />}</button>)}</nav>
      <div className="sidebar-bottom"><button className="utility">⌕ <span>Search people</span></button><button className="utility" onClick={() => setSettings(true)}>⚙ <span>Settings</span></button><div className="profile"><span className="mini-avatar blue">AL</span><span><b>Alex Liu</b><small>English</small></span><span className="more">•••</span></div></div>
    </aside>
    <section className="workspace">
      <header><div className="conversation-heading"><button className="back-mobile" aria-label="Back">‹</button><span className="presence"/><div><h1>{current.title}</h1><p>{active === 1 ? '4 participants · 4 languages' : 'Online · Spanish'}</p></div></div><div className="head-actions"><button aria-label="Start video">⌁</button><button aria-label="Conversation details">ⓘ</button><div className="head-avatar">AL</div></div></header>
      <div className={`call-chat ${chatOpen ? '' : 'chat-collapsed'}`}>
        <section className="call-area">
          <div className="call-status"><span className="live-dot"/> {liveCall.state === 'idle' ? 'Connected' : liveCall.state[0].toUpperCase() + liveCall.state.slice(1)} <span>•</span> Translation active</div>
          <div className={`participant-grid ${members.length > 2 ? 'group-grid' : ''}`}>{members.map((m,i) => <article className={`participant ${i===1?'active-speaker':''}`} key={m.name}><div className="orb" style={{'--person':m.color} as React.CSSProperties}><span>{m.initials}</span><em className="sound-bars">▁▃▆▃▁</em></div><div className="participant-info"><b>{m.name}{m.name === 'Alex' && ' (You)'}</b><span>{m.lang}</span></div>{m.status && <div className="speaking"><span/> {m.status}</div>}</article>)}</div>
          {captions && <div className="caption-card"><div className="caption-speaker"><span className="mini-avatar" style={{background:'#3a9fcb'}}>MG</span> Maria <span className="caption-lang">Speaking Spanish</span></div>{showOriginal && <div className="caption-line"><small>ORIGINAL</small><p>¿Quieres reunirte mañana?</p></div>}{showTranslated && <div className="caption-line translated"><small>TRANSLATED</small><p>Would you like to meet tomorrow?</p></div>}</div>}
          <div className="processing-note">Speech is being processed for translation · Audio is never recorded</div>
        </section>
        <section className="chat-panel">
          <div className="chat-head"><div><h2>Chat</h2><p>Translation on <span className="green-dot"/></p></div><button onClick={() => setChatOpen(false)} aria-label="Collapse chat">›</button></div>
          <div className="chat-toggle"><span>Translate messages</span><Switch on={translateChat} onClick={() => toggle(setTranslateChat, translateChat, 'Message translation')}/></div>
          <div className="messages">{messages.map(m => <article className={`message ${m.incoming ? 'incoming':''}`} key={m.id}><span className="mini-avatar" style={{background:m.color}}>{m.initials}</span><div><div className="msg-meta"><b>{m.sender}</b><time>{m.time}</time></div><div className="bubble"><p>{m.text}</p>{translateChat && <div className="chat-translation"><small>TRANSLATION</small><p>{m.translated}</p></div>}</div>{translateChat && <button className="show-original">Show original</button>}</div></article>)}</div>
          <div className="composer"><textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => {if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addMessage()}}} placeholder="Message Maria…" aria-label="Message"/><div><button aria-label="Add attachment">＋</button><button className="send" onClick={addMessage} aria-label="Send message">↑</button></div></div>
        </section>
      </div>
      <footer className="controls"><div className="control-group"><button className={`round ${liveCall.muted?'off':''}`} onClick={liveCall.toggleMute}><span>{liveCall.muted?'⌁':'♩'}</span><small>{liveCall.muted?'Unmute':'Microphone'}</small></button><button className="round"><span>▣</span><small>Camera</small></button><button className={`round ${captions?'on':''}`} onClick={() => toggle(setCaptions,captions,'Captions')}><span>☷</span><small>Captions</small></button><button className={`round ${audio?'on':''}`} onClick={() => toggle(setAudio,audio,'Translated audio')}><span>♬</span><small>Audio</small></button></div><button className="leave" onClick={() => setNotice('You left the call')}>⌕ <span>Leave</span></button></footer>
    </section>
    {notice && <div className="toast">✓ {notice}</div>}
    {settings && <Settings close={() => setSettings(false)} />}
    {groupModal && <GroupModal close={() => setGroupModal(false)} />}
  </main>;
}

function Switch({on,onClick}:{on:boolean,onClick:()=>void}) { return <button className={`switch ${on?'switch-on':''}`} onClick={onClick} role="switch" aria-checked={on}><span/></button>; }
function Settings({close}:{close:()=>void}) { const [native,setNative]=useState('English'); const [target,setTarget]=useState('Español'); const [voice,setVoice]=useState('Warm & natural'); const [saved,setSaved]=useState(false); return <div className="modal-backdrop"><section className="modal settings-modal"><button className="close" onClick={close}>×</button><p className="eyebrow">PERSONALIZATION</p><h2>Settings</h2><p className="modal-sub">Make every conversation feel natural to you.</p><div className="settings-section"><h3>Language</h3><label>Native language<select value={native} onChange={e=>setNative(e.target.value)}>{languageOptions.map(x=><option key={x[0]}>{x[0]}</option>)}</select></label><label>Translate conversations to<select value={target} onChange={e=>setTarget(e.target.value)}>{languageOptions.map(x=><option key={x[0]}>{x[0]}</option>)}</select></label></div><div className="settings-section"><h3>Translated audio</h3><label>Your preferred voice<select value={voice} onChange={e=>setVoice(e.target.value)}><option>Warm & natural</option><option>Clear & confident</option><option>Calm & friendly</option></select></label><div className="setting-row">Translated audio <Switch on={true} onClick={()=>{}}/></div></div><div className="settings-section"><h3>Captions</h3><div className="setting-row">Original captions <Switch on={true} onClick={()=>{}}/></div><div className="setting-row">Translated captions <Switch on={true} onClick={()=>{}}/></div></div><button className="save" onClick={()=>setSaved(true)}>{saved?'Saved ✓':'Save preferences'}</button></section></div> }
function GroupModal({close}:{close:()=>void}) { const [name,setName]=useState('Team Meeting'); const [picked,setPicked]=useState(['Maria Garcia','Jean Moreau']); const people=['Maria Garcia','Jean Moreau','Kenji Sato']; return <div className="modal-backdrop"><section className="modal group-modal"><button className="close" onClick={close}>×</button><p className="eyebrow">NEW CONVERSATION</p><h2>Create a group</h2><p className="modal-sub">Each person receives messages in their own language.</p><label>Group name<input value={name} onChange={e=>setName(e.target.value)}/></label><h3>Add people</h3>{people.map(p=><button key={p} className={`person-select ${picked.includes(p)?'chosen':''}`} onClick={()=>setPicked(v=>v.includes(p)?v.filter(x=>x!==p):[...v,p])}><span className="mini-avatar blue">{p.split(' ').map(x=>x[0]).join('')}</span>{p}<span>{picked.includes(p)?'✓':'+'}</span></button>)}<button className="save" onClick={close}>Create group · {picked.length + 1} people</button></section></div> }
