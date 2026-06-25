// Debug script - dump page structure
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    deviceScaleFactor: 2,
  });

  // Minimal mock so the app loads data
  const now = new Date().toISOString();
  await page.addInitScript(`
    window.go = {
      main: {
        App: {
          GetCollections: () => Promise.resolve([{id:"c1",name:"Test API",created_at:"${now}",updated_at:"${now}"}]),
          GetEnvironments: () => Promise.resolve([]),
          GetHistory: () => Promise.resolve([]),
          GetUserConfig: () => Promise.resolve({theme_id:"dark",shortcuts:{},custom_colors:{}}),
          GetRequestsForCollection: () => Promise.resolve([]),
          ImportData: () => Promise.resolve(),
          ExportData: () => Promise.resolve({}),
          ExportDataContent: () => Promise.resolve("{}"),
          ImportDataContent: () => Promise.resolve(),
          GetRunHistory: () => Promise.resolve([]),
          GetRequestScripts: () => Promise.resolve({pre_request_script:"",test_script:""}),
          GetMockStatus: () => Promise.resolve({running:false,port:0,handlers:[]}),
          LoadMockConfigs: () => Promise.resolve([]),
          GetMockLog: () => Promise.resolve([]),
          GetCachedGraphQLSchema: () => Promise.resolve(null),
          GetWebSocketMessages: () => Promise.resolve([]),
          GetAllWebSocketMessages: () => Promise.resolve({}),
          GetWebSocketStatus: () => Promise.resolve({connected:false}),
          GetSSEEvents: () => Promise.resolve([]),
          GetAllSSEEvents: () => Promise.resolve({}),
          GetSSEStatus: () => Promise.resolve({connected:false}),
          GitStatus: () => Promise.resolve({clean:true,files:[]}),
          GitLog: () => Promise.resolve([]),
        }
      }
    };
    console.log('[Debug Mock] injected');
  `);

  await page.goto("http://localhost:4173", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Get HTML structure of the sidebar
  const sidebarHTML = await page
    .locator("aside, [class*=sidebar], [class*=Sidebar], nav")
    .first()
    .innerHTML()
    .catch(() => "no sidebar found");
  console.log("=== Sidebar HTML (first 3000 chars) ===");
  console.log(sidebarHTML.slice(0, 3000));

  console.log("\n=== Body text (first 1000 chars) ===");
  const bodyText = await page.locator("body").innerText();
  console.log(bodyText.slice(0, 1000));

  console.log("\n=== All buttons ===");
  const btns = await page.locator("button").all();
  for (const btn of btns.slice(0, 20)) {
    const text = await btn.textContent().catch(() => "");
    const cls = await btn.getAttribute("class").catch(() => "");
    console.log(`  "${text.trim()}" | class: ${cls.slice(0, 80)}`);
  }

  await browser.close();
})();
