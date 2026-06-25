// GoPost comprehensive screenshot generator (14 screenshots)
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DIR = path.join(__dirname, "..", "screenshots");
const URL = "http://localhost:4173";
const now = new Date().toISOString();

const M = {
  collections: [
    { id: "c1", name: "Petstore API", created_at: now, updated_at: now },
    { id: "c2", name: "GitHub REST API", created_at: now, updated_at: now },
  ],
  requests: {
    c1: [
      {
        id: "r1",
        name: "List Pets",
        method: "GET",
        url: "https://petstore.swagger.io/v2/pet/findByStatus?status=available",
        headers: { Accept: "application/json", "X-API-Key": "special-key" },
        auth: { type: "none" },
        body: "",
        description: "Returns pets by status",
        collection_id: "c1",
        created_at: now,
        updated_at: now,
      },
      {
        id: "r2",
        name: "Add New Pet",
        method: "POST",
        url: "https://petstore.swagger.io/v2/pet",
        headers: { "Content-Type": "application/json" },
        auth: { type: "bearer", token: "eyJhbGciOiJIUzI1NiJ9.xxx" },
        body: JSON.stringify(
          {
            name: "doggie",
            photoUrls: ["https://example.com/dog.jpg"],
            status: "available",
          },
          null,
          2,
        ),
        description: "Add a new pet to the store",
        collection_id: "c1",
        pre_request_script:
          'def run(env):\n    import time\n    env["timestamp"] = str(int(time.time()))\n    print("Pre-request: timestamp set to", env["timestamp"])',
        test_script:
          'def run(response, env):\n    import json\n    data = json.loads(response["body"])\n    assert response["status"] == 200, f"Expected 200, got {response[\"status\"]}"\n    assert data["name"] == "doggie", f"Wrong name: {data[\"name\"]}"\n    print("✓ All tests passed!")',
        created_at: now,
        updated_at: now,
      },
    ],
    c2: [
      {
        id: "r3",
        name: "Get User Repos",
        method: "GET",
        url: "https://api.github.com/users/berksunduri/repos",
        headers: { Accept: "application/vnd.github+json" },
        auth: { type: "bearer", token: "ghp_xxxxxxxxxxxx" },
        body: "",
        description: "List public repos",
        collection_id: "c2",
        created_at: now,
        updated_at: now,
      },
    ],
  },
  response: {
    status: 200,
    code: 200,
    time_ms: 142,
    latency_ms: 142,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": "abc-123",
      "x-ratelimit-remaining": "59",
    },
    body: JSON.stringify(
      {
        id: 1,
        name: "doggie",
        photoUrls: ["https://example.com/dog.jpg"],
        tags: [{ id: 1, name: "friendly" }],
        status: "available",
      },
      null,
      2,
    ),
  },
  environments: [
    {
      id: "e1",
      name: "Development",
      variables: {
        base_url: "https://dev-api.example.com",
        API_KEY: "dev-key-123",
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: "e2",
      name: "Production",
      variables: {
        base_url: "https://api.example.com",
        API_KEY: "prod-key-456",
      },
      created_at: now,
      updated_at: now,
    },
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
// ── Mock Server (running, with handlers + log) ──
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

// ── Click helpers ──

async function clickBtn(page, text) {
  const found = await page.evaluate((t) => {
    for (const b of document.querySelectorAll("button")) {
      if (b.textContent?.includes(t)) {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2,
          }),
        );
        return "btn";
      }
    }
    return null;
  }, text);
  if (!found) {
    try {
      await page
        .locator(`button:has-text("${text}")`)
        .first()
        .click({ force: true, timeout: 2000 });
      console.log(`    ✓ pw  "${text}"`);
    } catch {
      console.log(`    ✗ not found: "${text}"`);
    }
  } else console.log(`    ✓ btn "${text}"`);
}

async function clickTitle(page, title) {
  const found = await page.evaluate((t) => {
    for (const b of document.querySelectorAll("button")) {
      if (b.title === t || b.getAttribute("aria-label") === t) {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2,
          }),
        );
        return true;
      }
    }
    return false;
  }, title);
  if (!found) {
    try {
      await page
        .locator(`button[title="${title}"]`)
        .first()
        .click({ force: true, timeout: 2000 });
      console.log(`    ✓ pw title="${title}"`);
    } catch {
      console.log(`    ✗ title not found: "${title}"`);
    }
  } else console.log(`    ✓ title "${title}"`);
}

async function clickTab(page, tabText) {
  try {
    await page
      .locator('[role="tab"]')
      .filter({ hasText: tabText })
      .first()
      .click({ force: true, timeout: 3000 });
    console.log(`    ✓ tab "${tabText}"`);
  } catch {
    console.log(`    ✗ tab not found: "${tabText}"`);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(DIR, name), fullPage: false });
}

// ── Main ──

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  [ERR]", e.message));

  await p.addInitScript(mock());
  await p.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForTimeout(4000);

  // 1. Main view — empty state
  console.log("\n1. Main view");
  await shot(p, "01-main-view.png");

  // Open Petstore API → List Pets
  await clickBtn(p, "Petstore API");
  await p.waitForTimeout(800);
  await clickBtn(p, "List Pets");
  await p.waitForTimeout(2000);

  // 2. Headers tab
  console.log("2. Headers");
  await clickTab(p, "Headers");
  await p.waitForTimeout(500);
  await shot(p, "02-request-headers.png");

  // 3. Params tab
  console.log("3. Params");
  await clickTab(p, "Params");
  await p.waitForTimeout(500);
  await shot(p, "03-request-params.png");

  // 4. Auth tab — switch to Add New Pet (Bearer auth)
  console.log("4. Auth (Bearer)");
  await clickBtn(p, "Add New Pet");
  await p.waitForTimeout(1500);
  await clickTab(p, "Auth");
  await p.waitForTimeout(500);
  await shot(p, "04-request-auth.png");

  // 5. Body tab
  console.log("5. Body (JSON)");
  await clickTab(p, "Body");
  await p.waitForTimeout(500);
  await shot(p, "05-request-body.png");

  // 6. Pre-request Script (Starlark)
  console.log("6. Pre-request Script");
  await clickTab(p, "Pre-request");
  await p.waitForTimeout(800);
  await shot(p, "06-pre-request-script.png");

  // 7. Tests (Starlark)
  console.log("7. Tests");
  await clickTab(p, "Tests");
  await p.waitForTimeout(800);
  await shot(p, "07-test-script.png");

  // 8. Response
  console.log("8. Response");
  await clickTab(p, "Headers");
  await p.waitForTimeout(300);
  await clickBtn(p, "Send");
  await p.waitForTimeout(3000);
  await shot(p, "08-response.png");

  // 9. Code Generation
  console.log("9. Code Generation");
  await clickBtn(p, "Code");
  await p.waitForTimeout(1000);
  await shot(p, "09-codegen.png");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // 10. Environments
  console.log("10. Environments");
  await clickBtn(p, "Development");
  await p.waitForTimeout(1000);
  await shot(p, "10-environments.png");

  // 11. Mock Server — running with endpoints and live log
  console.log("11. Mock Server");
  await clickTitle(p, "Mock Server");
  await p.waitForTimeout(1500);
  await shot(p, "11-mock-server.png");

  // Go back to explorer for next steps
  await clickTitle(p, "Explorer");
  await p.waitForTimeout(500);

  // 12. Settings
  console.log("12. Settings");
  await clickTitle(p, "Settings");
  await p.waitForTimeout(1500);
  await shot(p, "12-settings.png");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);

  // 13. Git panel
  console.log("13. Git panel");
  await clickTitle(p, "Source Control");
  await p.waitForTimeout(1500);
  await shot(p, "13-git-panel.png");

  console.log("\n✅ All 13 screenshots saved to screenshots/");
  await browser.close();
})();
