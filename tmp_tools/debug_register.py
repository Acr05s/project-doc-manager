from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://127.0.0.1:5000")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Click register tab
    page.locator(".auth-tab:has-text('注册')").click()
    time.sleep(1)
    
    # Listen to network response
    responses = []
    def handle_response(response):
        if '/register' in response.url and response.request.method == 'POST':
            responses.append(response)
    page.on("response", handle_response)
    
    page.fill("#reg-username", f"testreg_{int(time.time())}")
    page.fill("#reg-password", "test123")
    page.fill("#reg-password-confirm", "test123")
    
    # Check organization select
    selects = page.locator("#register-form select").all()
    print("Selects found:", len(selects))
    for i, s in enumerate(selects):
        print(i, s.evaluate("e => e.outerHTML"))
    
    if len(selects) > 0:
        selects[0].select_option("test001")
    
    page.click("#register-form button[type='submit']")
    time.sleep(2)
    
    if responses:
        r = responses[0]
        print("Status:", r.status)
        try:
            body = r.json()
            print("Body:", body)
        except:
            print("Text:", r.text())
    else:
        print("No response captured")
        print("Page URL:", page.url)
        print("Page content snippet:", page.content()[:500])
    
    page.screenshot(path="test_output/debug_register_result.png")
    browser.close()
