from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://127.0.0.1:5000")
    page.wait_for_load_state("networkidle")
    import time
    time.sleep(2)
    page.screenshot(path="test_output/debug_home.png", full_page=True)
    print("Saved debug_home.png")
    # Try clicking login
    login_btn = page.locator("#loginBtn")
    if login_btn.is_visible():
        login_btn.click()
        time.sleep(1)
        page.screenshot(path="test_output/debug_login.png", full_page=True)
        print("Saved debug_login.png")
    browser.close()
