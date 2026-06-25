// GoPost pitch video recorder — records real interactions via Playwright
const { chromium } = require("playwright");
const path = require("path");

const DIR = path.join(__dirname, "..", "screenshots");
const VIDEO_PATH = path.join(DIR, "gopost-pitch.webm");
const URL = "http://localhost:4173";
const now = new Date().toISOString();

// ── Mock data (same as screenshots) ──
const M = {
  collections: [
    { id: "c1", name: "Petstore API", created_at: now, updated_at: now },
    { id: "c2", name: "GitHub REST API", created_at: now, updated_at: now },
  ],
  requests: {
    c1: [
      { id: "r1", name: "List Pets", method: "GET", url: "https://petstore.swagger.io/v2/pet/findByStatus?status=available", headers: { Accept: "application/json", "X-API-Key": "special-key" }, auth: { type: "none" }, body: "", description: "Returns pets by status", collection_id: "c1", created_at: now, updated_at: now },
      { id: "r2", name: "Add New Pet", method: "POST", url: "https://petstore.swagger.io/v2/pet", headers: { "Content-Type": "application/json" }, auth: { type: "bearer", token: "eyJhbGciOiJIUzI1NiJ9.xxx" }, body: JSON.stringify({ name: "doggie", photoUrls: ["https://example.com/dog.jpg"], status: "available" }, null, 2), description: "Add a new pet to the store", collection_id: "c1", pre_request_script: 'def run(env):\n    import time\n    env["timestamp"] = str(int(time.time()))\n    print("Pre-request: timestamp set to", env["timestamp"])', test_script: 'def run(response, env):\n    import json\n    data = json.loads(response["body"])\n    assert response["status"] == 200, f"Expected 200, got {response[\"status\"]}"\n    assert data["name"] == "doggie", f"Wrong name: {data[\"name\"]}"\n    print("✓ All tests passed!")', created_at: now, updated_at: now },
    ],
    c2: [
      { id: "r3", name: "Get User Repos", method: "GET", url: "https://api.github.com/users/berksunduri/repos", headers: { Accept: "application/vnd.github+json" }, auth: { type: "bearer", token: "ghp_xxxxxxxxxxxx" }, body: "", description: "List public repos", collection_id: "c2", created_at: now, updated_at: now },
    ],
  },
  response: {
    status: 200, code: 200, time_ms: 142, latency_ms: 142,
    headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "abc-123", "x-ratelimit-remaining": "59" },
    body: JSON.stringify({ id: 1, name: "doggie", photoUrls: ["https://example.com/dog.jpg"], tags: [{ id: 1, name: "friendly" }], status: "available" }, null, 2),
  },
  environments: [
    { id: "e1", name: "Development", variables: { base_url: "https://dev-api.example.com", API_KEY: "dev-key-123" }, created_at: now, updated_at: now },
    { id: "e2", name: "Production", variables: { base_url: "https://api.example.com", API_KEY: "prod-key-456" }, created_at: now, updated_at: now },
  ],
  runReport: { total: 3, passed: 3, failed: 0, duration_ms: 450, results: [] },
};

function mock() {
  const d = JSON.stringify(M);
  return `
(function(){
var m=${d};
function findReq(r){for(var c in m.requests){var rs=m.requests[c];for(var i=0;i<rs.length;i++){if(rs[i].id===r)return rs[i]}}return null}
function makeReq(c,n,mt,u,h,b,a,desc){return{id:"r-"+Date.now(),name:n,method:mt,url:u,headers:h||{},auth:a||{type:"none"},body:b||"",description:desc||"",collection_id:c,created_at:"${now}",updated_at:"${now}"}}
var s={
GetCollections:function(){return Promise.resolve(m.collections)},
CreateCollection:function(n){var i="c-"+Date.now();m.collections.push({id:i,name:n,created_at:"${now}",updated_at:"${now}"});m.requests[i]=[];return Promise.resolve(i)},
DeleteCollection:function(){return Promise.resolve()},
UpdateCollection:function(){return Promise.resolve()},
GetEnvironments:function(){return Promise.resolve(m.environments)},
CreateEnvironment:function(){return Promise.resolve("e-new")},
DeleteEnvironment:function(){return Promise.resolve()},
UpdateEnvironment:function(){return Promise.resolve()},
GetRequestsForCollection:function(c){return Promise.resolve(m.requests[c]||[])},
GetRequest:function(r){return Promise.resolve(findReq(r))},
MoveRequest:function(){return Promise.resolve()},
SearchRequests:function(){return Promise.resolve([])},
DuplicateRequest:function(r){var f=findReq(r);if(!f)return Promise.resolve("r-"+Date.now());var o=makeReq(f.collection_id,f.name,f.method,f.url,f.headers,f.auth,f.body,f.description);if(!m.requests[f.collection_id])m.requests[f.collection_id]=[];m.requests[f.collection_id].push(o);return Promise.resolve(o.id)},
DeleteRequest:function(){return Promise.resolve()},
CreateRequest:function(c,n,mt,u,h,b,a,d){var o=makeReq(c,n,mt,u,h,b,a,d);if(!m.requests[c])m.requests[c]=[];m.requests[c].push(o);return Promise.resolve(o)},
UpdateRequest:function(r,n,mt,u,h,b,d){var f=findReq(r);if(f){f.name=n||f.name;f.url=u||f.url;f.method=mt||f.method;f.headers=h||f.headers;f.body=b||f.body;f.description=d||f.description;f.updated_at="${now}"}return Promise.resolve(f)},
SetRequestAuth:function(r,type,token,user,pass,ak,akv,aki){var f=findReq(r);if(f)f.auth={type:type||"none",token:token||"",username:user||"",password:pass||"",api_key:ak||"",api_key_value:akv||"",api_key_in:aki||"header"};return Promise.resolve()},
ExecuteRequest:function(){return Promise.resolve(m.response)},
RunCollection:function(){return Promise.resolve(m.runReport)},
ImportData:function(){return Promise.resolve()},
ExportData:function(){return Promise.resolve({})},
ExportDataContent:function(){return Promise.resolve("{}")},
ImportDataContent:function(){return Promise.resolve()},
ImportHTTPContent:function(){return Promise.resolve({requests_created:0})},
ExportCollectionAsHTTPContent:function(){return Promise.resolve("GET /test")},
ExportCollectionAsHTTPFile:function(){return Promise.resolve()},
GetHistory:function(){return Promise.resolve([])},
GetRunHistory:function(){return Promise.resolve([])},
ReplayHistoryEntry:function(){return Promise.resolve()},
GetUserConfig:function(){return Promise.resolve({theme_id:"dark",shortcuts:{send:["mod","Enter"],save:["mod","S"],newTab:["mod","N"],closeTab:["mod","W"],nextTab:["mod","]"],prevTab:["mod","["],toggleSidebar:["mod","B"],toggleTerminal:["mod","J"],settings:["mod",","]},custom_colors:{}})},
SaveUserConfig:function(){return Promise.resolve()},
IntrospectGraphQLSchema:function(){return Promise.resolve(null)},
GetCachedGraphQLSchema:function(){return Promise.resolve(null)},
ExecuteGraphQLRequest:function(){return Promise.resolve(m.response)},
SetRequestGraphQL:function(){return Promise.resolve()},
UpdateRequestWithGraphQL:function(r,n,mt,u,h,b,g,go,gn,gs){var f=findReq(r);if(f){f.name=n||f.name;f.url=u||f.url;f.method="GRAPHQL";f.headers=h||f.headers;f.graphql={query:g||"",variables:go||"",operation_name:gn||"",schema_url:gs||""};f.updated_at="${now}"}return Promise.resolve(f)},
ExecCommand:function(){return Promise.resolve("$ echo hello\\nhello")},
RevealInFinder:function(){return Promise.resolve()},
GitInit:function(){return Promise.resolve()},
GitStatus:function(){return Promise.resolve({clean:false,files:[{path:"collections/Petstore API/collection.gopost.json",status:"M"},{path:"collections/Petstore API/requests/List Pets.gopost.json",status:"A"}]})},
GitCommit:function(){return Promise.resolve()},
GitLog:function(){return Promise.resolve([{hash:"a1b2c3d",message:"Add petstore collection",author:"dev",date:"2026-06-21T10:00:00Z"},{hash:"e4f5g6h",message:"Initial commit",author:"dev",date:"2026-06-20T14:00:00Z"}])},
GitAddRemote:function(){return Promise.resolve()},
GitPush:function(){return Promise.resolve()},
GitPull:function(){return Promise.resolve()},
ConnectWebSocket:function(){return Promise.resolve()},
DisconnectWebSocket:function(){return Promise.resolve()},
SendWebSocketMessage:function(){return Promise.resolve()},
GetWebSocketMessages:function(){return Promise.resolve([])},
GetAllWebSocketMessages:function(){return Promise.resolve({})},
GetWebSocketStatus:function(){return Promise.resolve({connected:false})},
ConnectSSE:function(){return Promise.resolve()},
DisconnectSSE:function(){return Promise.resolve()},
GetSSEEvents:function(){return Promise.resolve([])},
GetAllSSEEvents:function(){return Promise.resolve({})},
GetSSEStatus:function(){return Promise.resolve({connected:false})},
GetRequestScripts:function(r){var f=findReq(r);return Promise.resolve({pre_request_script:f&&f.pre_request_script||"",test_script:f&&f.test_script||""})},
SetRequestScripts:function(r,pre,test){var f=findReq(r);if(f){f.pre_request_script=pre||"";f.test_script=test||""}return Promise.resolve()},
RunPreRequestScript:function(){return Promise.resolve({success:true,env_vars:{timestamp:"1719000000"}})},
RunTestScript:function(){return Promise.resolve({success:true,results:[{name:"Status code check",passed:true},{name:"Response body check",passed:true}]})},
StartMockServer:function(){return Promise.resolve()},
StopMockServer:function(){return Promise.resolve()},
GetMockStatus:function(){return Promise.resolve({running:true,port:3001,handlers:[{request_id:"r1",method:"GET",path:"/v2/pet/findByStatus",status_code:200,headers:{"Content-Type":"application/json"},body:'[{"id":1,"name":"doggie","status":"available"}]',latency_ms:100,enabled:true},{request_id:"r2",method:"POST",path:"/v2/pet",status_code:201,headers:{"Content-Type":"application/json"},body:'{"id":2,"name":"doggie","status":"available"}',latency_ms:50,enabled:true}]})},
SetMockConfig:function(){return Promise.resolve()},
RemoveMockConfig:function(){return Promise.resolve()},
LoadMockConfigs:function(){return Promise.resolve([])},
GetMockLog:function(){return Promise.resolve([{timestamp:new Date(Date.now()-10000).toISOString(),method:"GET",path:"/v2/pet/findByStatus?status=available",status:200,latency_ms:95},{timestamp:new Date(Date.now()-5000).toISOString(),method:"POST",path:"/v2/pet",status:201,latency_ms:48},{timestamp:new Date(Date.now()-2000).toISOString(),method:"GET",path:"/v2/pet/findByStatus?status=available",status:200,latency_ms:102}])},
ClearMockLog:function(){return Promise.resolve()}
};
window.go={main:{App:s}};
})()`;
}

// ── Helpers ──

const MS = 100; // base pause multiplier (increase for slower pacing)

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clickBtn(page, text) {
  try { await page.locator(`button:has-text("${text}")`).first().click({ force: true, timeout: 3000 }); }
  catch { /* skip */ }
}

async function clickTitle(page, title) {
  try { await page.locator(`button[title="${title}"]`).first().click({ force: true, timeout: 3000 }); }
  catch { /* skip */ }
}

async function clickTab(page, tabText) {
  try { await page.locator('[role="tab"]').filter({ hasText: tabText }).first().click({ force: true, timeout: 3000 }); }
  catch { /* skip */ }
}

// ── Main recording ──

(async () => {
  const fs = require("fs");
  fs.mkdirSync(DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    recordVideo: {
      dir: DIR,
      size: { width: 1440, height: 900 },
    },
  });
  const p = await ctx.newPage();

  await p.addInitScript(mock());
  await p.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
  await wait(3000);

  // ── Scene 1: Intro — empty state ──
  await wait(1500);

  // ── Scene 2: Open collection + request ──
  await clickBtn(p, "Petstore API");
  await wait(800);
  await clickBtn(p, "List Pets");
  await wait(1500);

  // ── Scene 3: Cycle through tabs ──
  await clickTab(p, "Params");
  await wait(1000);
  await clickTab(p, "Headers");
  await wait(1000);
  await clickBtn(p, "Add New Pet");
  await wait(1200);
  await clickTab(p, "Auth");
  await wait(1200);
  await clickTab(p, "Body");
  await wait(1200);
  await clickTab(p, "Pre-request");
  await wait(1500);
  await clickTab(p, "Tests");
  await wait(1500);

  // ── Scene 4: Send request + response ──
  await clickTab(p, "Headers");
  await wait(500);
  await clickBtn(p, "Send");
  await wait(3000);

  // ── Scene 5: Code generation ──
  await clickBtn(p, "Code");
  await wait(1500);
  await p.keyboard.press("Escape");
  await wait(500);

  // ── Scene 6: Environment variables ──
  await clickBtn(p, "Development");
  await wait(1500);
  await clickBtn(p, "Production");
  await wait(500);
  await clickBtn(p, "Development");
  await wait(1000);

  // ── Scene 7: Mock server ──
  await clickTitle(p, "Mock Server");
  await wait(2000);

  // ── Scene 8: Back to explorer + Git panel ──
  await clickTitle(p, "Explorer");
  await wait(500);
  await clickTitle(p, "Source Control");
  await wait(2000);

  // ── Scene 9: Settings ──
  await clickTitle(p, "Settings");
  await wait(2000);
  await p.keyboard.press("Escape");
  await wait(1000);

  // ── End ──
  console.log("Recording finished. Saving video...");
  await ctx.close();
  await browser.close();

  // Rename the output file
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".webm"));
  if (files.length > 0) {
    const src = path.join(DIR, files[0]);
    const dst = path.join(DIR, "gopost-pitch.webm");
    fs.renameSync(src, dst);
    console.log(`Video saved: ${dst}`);

    // Convert to MP4 for wider compatibility
    const { execSync } = require("child_process");
    const mp4Path = path.join(DIR, "gopost-pitch.mp4");
    console.log("Converting to MP4...");
    execSync(`ffmpeg -y -i "${dst}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${mp4Path}" 2>&1`, { stdio: "pipe" });
    console.log(`MP4 saved: ${mp4Path}`);
  }
})();
