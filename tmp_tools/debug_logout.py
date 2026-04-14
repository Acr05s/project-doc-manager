from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    # login admin
    page.goto("http://127.0.0.1:5000")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.fill("#login-username", "admin")
    page.fill("#login-password", "admin123")
    page.click("#login-form button[type='submit']")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path="test_output/debug_after_login.png")
    print("After login:", page.url)
    
    # logout
    page.locator("#userMenu").click()
    time.sleep(0.5)
    page.locator("text=注销").first.click()
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path="test_output/debug_after_logout.png")
    print("After logout:", page.url)
    print("Has login-username:", page.locator("#login-username").is_visible())
    
    browser.close()
