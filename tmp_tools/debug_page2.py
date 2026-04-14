from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://127.0.0.1:5000")
    page.wait_for_load_state("networkidle")
    import time
    time.sleep(2)
    html = page.content()
    with open("test_output/debug_home.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Saved html")
    browser.close()
