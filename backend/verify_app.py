import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8000/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(URL)
    page.wait_for_selector("#sidebar-tree .phase-header", timeout=15000)
    page.screenshot(path="verify_1_loaded.png")
    print("Loaded. Subtitle:", page.locator("#app-subtitle").inner_text())

    # open first phase
    page.locator(".phase-header").first.click()
    page.wait_for_selector(".group-header", timeout=5000)
    # open first group
    page.locator(".group-header").first.click()
    page.wait_for_selector(".subtopic-header", timeout=5000)
    # open first subtopic
    page.locator(".subtopic-header").first.click()
    page.wait_for_selector(".item-leaf", timeout=5000)

    item_text = page.locator(".item-leaf").first.inner_text()
    print("Clicking topic:", item_text)
    page.locator(".item-leaf").first.click()

    page.wait_for_selector(".note-view .note-title", timeout=10000)
    title = page.locator(".note-title").inner_text()
    breadcrumb = page.locator(".note-breadcrumb").inner_text()
    print("Note view title:", title)
    print("Breadcrumb:", breadcrumb)

    # wait for either empty-state button or sections to render (note fetch resolves)
    page.wait_for_selector(".note-empty-state, .sections", timeout=10000)
    if page.locator(".note-empty-state").count() > 0:
        print("State: empty (no saved note) — shows Generate button:",
              page.locator(".note-empty-state button").inner_text())
    else:
        print("State: note loaded with sections, count =", page.locator(".section").count())

    page.screenshot(path="verify_2_note_view.png")
    print("Console errors:", errors)
    browser.close()
