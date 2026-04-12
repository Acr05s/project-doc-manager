from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://127.0.0.1:5000")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.fill("#login-username", "admin")
    page.fill("#login-password", "admin123")
    page.click("#login-form button[type='submit']")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    el = page.locator("button:has-text('admin'), .dropdown:has-text('admin')").first
    if el.is_visible():
        html = el.evaluate("e => e.outerHTML")
        with open("test_output/debug_menu.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("saved")
    else:
        print("not visible")
    browser.close()
