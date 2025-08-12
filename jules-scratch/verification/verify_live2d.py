import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        # Launch the Electron app
        # The main entry file is main.js
        app = await p._electron.launch(args=['.'])

        # Get the first window that the app opens
        page = await app.first_window()

        # It's an Electron app, so we might need to wait for the content to load
        await page.wait_for_load_state('domcontentloaded')
        await page.wait_for_timeout(5000) # Wait for 5 seconds to be safe

        # Try to find and click the "toggleAssistantBtn"
        assistant_button = page.locator('#toggleAssistantBtn')

        # Before clicking, let's make sure it's visible
        await expect(assistant_button).to_be_visible(timeout=10000)
        await assistant_button.click()

        # After clicking the button, a new window should open.
        # Let's wait for the new window (the assistant window)

        # It's hard to predict which window is the assistant window.
        # Let's assume it's the last window opened.
        all_windows = app.windows
        assistant_window = all_windows[-1]

        await assistant_window.wait_for_load_state('domcontentloaded')

        # Now, take a screenshot of the assistant window
        await assistant_window.screenshot(path="jules-scratch/verification/verification.png")

        print("Screenshot taken successfully.")

        # Close the app
        await app.close()

if __name__ == "__main__":
    asyncio.run(main())
