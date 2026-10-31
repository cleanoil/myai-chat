const $ = id => document.getElementById(id);
const STORAGE_SETTINGS = "myai_settings_v1";
const STORAGE_CHATS = "myai_chats_v1";
let settings = loadSettings();
let chats = loadChats();
let activeChatId = chats[0]?.id || null;
let pendingImages = [];
let busy = false;

function loadSettings(){try{return JSON.parse(localStorage.getItem(STORAGE_SETTINGS))||{protocol:"openai",baseUrl:"",apiKey:"",models:[],defaultModel:"",systemPrompt:""};}catch{return {protocol:"openai",baseUrl:"",apiKey:"",models:[],defaultModel:"",systemPrompt:""};}}
function loadChats(){try{return JSON.parse(localStorage.getItem(STORAGE_CHATS))||[];}catch{return [];}}
function saveChats(){try{localStorage.setItem(STORAGE_CHATS,JSON.stringify(chats));}catch(e){alert("本机存储空间不足，可能是图片过多。请删除部分旧对话后重试。");}}
function currentChat(){return chats.find(c=>c.id===activeChatId);}
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function cleanBase(url){return url.trim().replace(/\/+$/,"");}
function endpoint(){
  const base=cleanBase(settings.baseUrl);
  if(!base) throw new Error("请先填写 Base URL");
  if(settings.protocol==="openai"){
    if(/\/chat\/completions$/i.test(base)) return base;
    return base.replace(/\/+$/,"") + (base.endsWith("/v1")?"/chat/completions":"/v1/chat/completions");
  }
  if(/\/messages$/i.test(base)) return base;
  return base + (base.endsWith("/v1")?"/messages":"/v1/messages");
}
function renderMarkdown(text){
  const html = window.marked ? marked.parse(text||"",{breaks:true,gfm:true}) : escapeHtml(text||"");
  return window.DOMPurify ? DOMPurify.sanitize(html) : html;
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(){
  const chat=currentChat();
  $("chatTitle").textContent=chat?.title||"新对话";
  $("modelSubtitle").textContent=settings.protocol==="openai"?"OpenAI 兼容接口": "Anthropic / Claude 接口";
  $("welcome").style.display=chat?.messages?.length?"none":"block";
  $("messages").querySelectorAll(".message").forEach(n=>n.remove());
  if(chat){
    for(const m of chat.messages){
      const row=document.createElement("div"); row.className="message "+m.role;
      const avatar=document.createElement("div"); avatar.className="avatar"; avatar.textContent=m.role==="user"?"你":"✦";
      const body=document.createElement("div"); body.className="bubble";
      if(m.role==="user" && m.images?.length){
        for(const img of m.images){const im=document.createElement("img");im.src=img;im.className="user-image";body.appendChild(im);}
      }
      const content=document.createElement("div");
      if(m.role==="assistant") content.innerHTML=renderMarkdown(m.content||"");
      else content.textContent=m.content||"";
      body.appendChild(content);
      const meta=document.createElement("div");meta.className="message-meta";meta.textContent=m.model||"";
      body.appendChild(meta);row.append(avatar,body);$("messages").appendChild(row);
    }
  }
  $("messages").scrollTop=$("messages").scrollHeight;
  renderChatList(); updateStatus();
}
function renderChatList(){
  const box=$("chatList");box.innerHTML="";
  chats.forEach(c=>{const b=document.createElement("button");b.className="chat-item"+(c.id===activeChatId?" active":"");b.textContent=c.title||"新对话";b.onclick=()=>{activeChatId=c.id;render();closeSidebar();};box.appendChild(b);});
}
function updateStatus(){
  const ok=!!(settings.baseUrl&&settings.apiKey&&settings.models.length);
  $("statusDot").classList.toggle("ok",ok);$("statusText").textContent=ok?"接口已配置":"尚未完整配置 API";
  const sel=$("modelSelect");sel.innerHTML="";
  const models=settings.models||[];
  if(!models.length){sel.disabled=true;sel.add(new Option("未配置模型",""));}
  else {sel.disabled=false;models.forEach(m=>sel.add(new Option(m,m)));const chat=currentChat();sel.value=(chat?.model&&models.includes(chat.model)?chat.model:settings.defaultModel&&models.includes(settings.defaultModel)?settings.defaultModel:models[0]);}
}
function createChat(){
  const c={id:newId(),title:"新对话",model:settings.defaultModel||settings.models[0]||"",messages:[]};
  chats.unshift(c);activeChatId=c.id;saveChats();render();closeSidebar();
}
function openSettings(){
  $("protocol").value=settings.protocol;$("baseUrl").value=settings.baseUrl;$("apiKey").value=settings.apiKey;
  $("models").value=(settings.models||[]).join("\n");$("defaultModel").value=settings.defaultModel||"";
  $("systemPrompt").value=settings.systemPrompt||"";
  $("settingsMessage").textContent="";
  $("settingsPanel").classList.add("open");$("overlay").classList.add("open");$("settingsPanel").setAttribute("aria-hidden","false");
}
function closeSettings(){$("settingsPanel").classList.remove("open");$("overlay").classList.remove("open");$("settingsPanel").setAttribute("aria-hidden","true");}
function saveSettings(){
  settings={protocol:$("protocol").value,baseUrl:$("baseUrl").value.trim(),apiKey:$("apiKey").value.trim(),
    models:$("models").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),
    defaultModel:$("defaultModel").value.trim(),systemPrompt:$("systemPrompt").value.trim()};
  localStorage.setItem(STORAGE_SETTINGS,JSON.stringify(settings));updateStatus();
  $("settingsMessage").textContent="设置已保存在本机。";
}
function activeModel(){return $("modelSelect").value||settings.defaultModel||settings.models[0];}
function toBase64(dataUrl){return dataUrl.split(",")[1];}
function dataMime(dataUrl){return (dataUrl.match(/^data:([^;]+);/)||[])[1]||"image/jpeg";}
async function compressImage(file){
  if(!file.type.startsWith("image/")) throw new Error("只支持图片文件");
  if(file.size>12*1024*1024) throw new Error("单张图片不能超过 12MB");
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  return await new Promise(resolve=>{
    const img=new Image();img.onload=()=>{
      const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      resolve(canvas.toDataURL("image/jpeg",.82));
    };img.onerror=()=>resolve(data);img.src=data;
  });
}
function refreshImagePreview(){
  const box=$("imagePreview");box.innerHTML="";
  pendingImages.forEach((src,i)=>{const wrap=document.createElement("div");wrap.className="preview-item";const im=document.createElement("img");im.src=src;const x=document.createElement("button");x.textContent="×";x.onclick=()=>{pendingImages.splice(i,1);refreshImagePreview();};wrap.append(im,x);box.appendChild(wrap);});
}
async function addImages(files){
  for(const f of files){try{if(pendingImages.length>=4){alert("一次最多添加 4 张图片");break;}pendingImages.push(await compressImage(f));}catch(e){alert(e.message);}}
  refreshImagePreview();
}
function makeOpenAIMessages(chat){
  const out=[];
  if(settings.systemPrompt) out.push({role:"system",content:settings.systemPrompt});
  for(const m of chat.messages){
    if(m.role==="assistant"){out.push({role:"assistant",content:m.content||""});continue;}
    if(m.images?.length){
      const content=[];
      if(m.content) content.push({type:"text",text:m.content});
      m.images.forEach(url=>content.push({type:"image_url",image_url:{url}}));
      out.push({role:"user",content});
    } else out.push({role:"user",content:m.content||""});
  }
  return out;
}
function makeAnthropicMessages(chat){
  return chat.messages.filter(m=>m.role==="user"||m.role==="assistant").map(m=>{
    if(m.role==="assistant") return {role:"assistant",content:m.content||""};
    const content=[];
    if(m.content) content.push({type:"text",text:m.content});
    (m.images||[]).forEach(url=>content.push({type:"image",source:{type:"base64",media_type:dataMime(url),data:toBase64(url)}}));
    return {role:"user",content:content.length?content:[{type:"text",text:""}]};
  });
}
async function callAI(chat,model){
  const url=endpoint();
  let headers={"Content-Type":"application/json"};
  let payload;
  if(settings.protocol==="openai"){
    headers.Authorization="Bearer "+settings.apiKey;
    payload={model,messages:makeOpenAIMessages(chat),temperature:0.7};
  } else {
    headers["x-api-key"]=settings.apiKey;
    headers["anthropic-version"]="2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"]="true";
    payload={model,max_tokens:4096,messages:makeAnthropicMessages(chat)};
    if(settings.systemPrompt) payload.system=settings.systemPrompt;
  }
  // QOPS accepts Claude Code Bearer credentials and supplies the API version.
  // Its browser CORS policy does not allow Anthropic's extra request headers.
  if(settings.protocol==="anthropic" && new URL(url).hostname==="api.gateway.qops.build"){
    headers={"Content-Type":"application/json",Authorization:"Bearer "+settings.apiKey};
  }
  let response;
  try{
    response=await fetch(url,{method:"POST",headers,body:JSON.stringify(payload)});
  }catch(e){
    if(e instanceof TypeError) throw new Error("网络请求未完成（Load failed）。请检查接口地址是否能在当前网络访问、是否使用 HTTPS，以及服务商是否允许网页跨域请求（CORS）。");
    throw e;
  }
  const raw=await response.text();
  let data;try{data=JSON.parse(raw);}catch{throw new Error("接口返回的不是 JSON："+raw.slice(0,300));}
  if(!response.ok) throw new Error(data.error?.message||data.message||("HTTP "+response.status));
  if(settings.protocol==="openai") return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
  return (data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n") || JSON.stringify(data);
}
async function sendMessage(){
  if(busy)return;
  const text=$("promptInput").value.trim();
  if(!text&&!pendingImages.length)return;
  if(!settings.baseUrl||!settings.apiKey||!settings.models.length){openSettings();$("settingsMessage").textContent="请先填写 URL、Key 和模型列表。";return;}
  if(!activeChatId)createChat();
  const chat=currentChat(),model=activeModel();
  if(!model){alert("请先配置模型名称");return;}
  const images=[...pendingImages];pendingImages=[];refreshImagePreview();
  chat.model=model;
  chat.messages.push({role:"user",content:text,images});
  if(chat.messages.length===1)chat.title=(text||"图片对话").slice(0,24);
  $("promptInput").value="";autoResize();
  saveChats();render();
  busy=true;$("sendBtn").disabled=true;
  const loading=document.createElement("div");loading.className="typing";loading.id="loading";loading.textContent="AI 正在思考…";$("messages").appendChild(loading);$("messages").scrollTop=$("messages").scrollHeight;
  try{
    const answer=await callAI(chat,model);
    chat.messages.push({role:"assistant",content:answer,model});
  }catch(e){
    chat.messages.push({role:"assistant",content:"请求失败："+e.message+"\n\n请检查 URL、Key、模型 ID、接口协议及中转站 CORS 设置。",model});
  }finally{
    busy=false;$("sendBtn").disabled=false;$("loading")?.remove();saveChats();render();$("promptInput").focus();
  }
}
async function testConnection(){
  saveSettings();
  if(!settings.baseUrl||!settings.apiKey||!settings.models.length){$("settingsMessage").textContent="请先填写 URL、Key 和至少一个模型。";return;}
  $("settingsMessage").textContent="正在测试…";
  try{
    const testChat={messages:[{role:"user",content:"请只回复：连接成功"}]};
    const result=await callAI(testChat,settings.defaultModel||settings.models[0]);
    $("settingsMessage").textContent="连接成功："+result.slice(0,80);
  }catch(e){$("settingsMessage").textContent="连接失败："+e.message;}
}
function autoResize(){const t=$("promptInput");t.style.height="auto";t.style.height=Math.min(t.scrollHeight,140)+"px";}
function closeSidebar(){$("sidebar").classList.remove("open");}
$("settingsBtn").onclick=openSettings;$("closeSettings").onclick=closeSettings;$("overlay").onclick=()=>{closeSettings();closeSidebar();};
$("saveSettings").onclick=()=>{saveSettings();closeSettings();render();};
$("testConnection").onclick=testConnection;
$("toggleKey").onclick=()=>{const i=$("apiKey");i.type=i.type==="password"?"text":"password";$("toggleKey").textContent=i.type==="password"?"显示":"隐藏";};
$("newChatBtn").onclick=createChat;$("menuBtn").onclick=()=> $("sidebar").classList.toggle("open");
$("sendBtn").onclick=sendMessage;
$("promptInput").addEventListener("input",autoResize);
$("promptInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
$("attachBtn").onclick=()=>$("imageInput").click();
$("imageInput").onchange=async e=>{await addImages([...e.target.files]);e.target.value="";};
$("modelSelect").onchange=()=>{const c=currentChat();if(c){c.model=activeModel();saveChats();}};
$("clearLocal").onclick=()=>{if(confirm("确定清除本机 API 设置和全部聊天记录？此操作不可撤销。")){localStorage.removeItem(STORAGE_SETTINGS);localStorage.removeItem(STORAGE_CHATS);settings=loadSettings();chats=[];activeChatId=null;closeSettings();render();}};
document.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>{$("promptInput").value=b.dataset.prompt;autoResize();$("promptInput").focus();});
$("importSettings").onclick=()=>$("settingsFile").click();
$("settingsFile").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";
  if(!file)return;
  try{
    if(file.size>65536)throw new Error("配置文件过大");
    await importEncryptedSettings(JSON.parse(await file.text()));
  }catch(error){openSettings();$("settingsMessage").textContent="导入失败："+error.message;}
};

function decodeBase64Url(value){
  if(typeof value!=="string" || !/^[A-Za-z0-9_-]+$/.test(value))throw new Error("配置格式不正确");
  return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
}
async function importEncryptedSettings(envelope){
  if(!envelope || envelope.v!==1)throw new Error("不支持此配置文件版本");
  if(!window.crypto?.subtle)throw new Error("请使用 HTTPS 网页导入配置");
  const code=prompt("请输入电脑提供的 12 位配置码（用于解密连接设置）");
  if(code===null)return;
  let imported;
  try{
    const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(code.replace(/[\s-]/g,"")),"PBKDF2",false,["deriveKey"]);
    const key=await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:decodeBase64Url(envelope.s),iterations:200000},material,{name:"AES-GCM",length:256},false,["decrypt"]);
    const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeBase64Url(envelope.iv)},key,decodeBase64Url(envelope.data));
    imported=JSON.parse(new TextDecoder().decode(plaintext));
  }catch{throw new Error("配置码不正确，或配置文件已损坏");}
  if(!["openai","anthropic"].includes(imported.protocol) || typeof imported.baseUrl!=="string" || typeof imported.apiKey!=="string" || !imported.apiKey.trim() || !Array.isArray(imported.models) || !imported.models.length || imported.models.some(m=>typeof m!=="string" || !m.trim()))throw new Error("连接设置不完整");
  const base=new URL(imported.baseUrl);
  if(base.protocol!=="https:" || base.username || base.password || base.search || base.hash)throw new Error("配置必须使用不含账号和查询参数的 HTTPS 接口地址");
  const models=[...new Set(imported.models.map(m=>m.trim()))];
  const next={protocol:imported.protocol,baseUrl:imported.baseUrl.trim(),apiKey:imported.apiKey.trim(),models,defaultModel:models.includes(imported.defaultModel)?imported.defaultModel:models[0],systemPrompt:typeof imported.systemPrompt==="string"?imported.systemPrompt:""};
  localStorage.setItem(STORAGE_SETTINGS,JSON.stringify(next));
  settings=next;render();openSettings();
  $("settingsMessage").textContent="已导入连接设置（"+base.hostname+"）。请点击“测试连接”。";
}
async function importSettingsFromLink(){
  if(!location.hash.startsWith("#setup="))return;
  const encoded=location.hash.slice(7);
  // Remove the encrypted setup link before saving/bookmarking this page.
  history.replaceState(null,"",location.pathname+location.search);
  try{
    if(encoded.length>90000)throw new Error("配置链接过长");
    await importEncryptedSettings(JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))));
  }catch(error){openSettings();$("settingsMessage").textContent="导入失败："+error.message;}
}
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
if(!activeChatId && chats.length===0) activeChatId=null;
render();
importSettingsFromLink();
